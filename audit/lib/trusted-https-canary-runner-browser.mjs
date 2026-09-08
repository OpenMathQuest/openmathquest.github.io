import assert from "node:assert/strict";
import {
  access,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import {
  canaryRequestHeaderFlags,
  exactCandidateCacheObservation,
  observePromiseSettlement,
  recoverAndDrainOperation,
} from "./trusted-https-canary.mjs";
import {
  BETA1_CACHE,
  CANDIDATE_STAGING_SUFFIX,
  EXPECTED_BROWSER_PROBE_PATHS,
  hashFileBytes,
  hashFile,
  run,
  contentType,
  waitFor,
} from "./trusted-https-canary-runner-platform.mjs";

async function findEdgeExecutable() {
  const candidates = [
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((item) => item && path.isAbsolute(item));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next reviewed system location.
    }
  }
  throw new Error("Microsoft Edge was not found in a reviewed system location.");
}

async function profileBoundEdgeProcesses(profilePath) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$target=[IO.Path]::GetFullPath($env:MQ_CANARY_PROFILE_PATH)",
    "$rows=@(Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" -ErrorAction Stop | ForEach-Object {",
    "  $match=[regex]::Match([string]$_.CommandLine,'(?:^|\\s)--user-data-dir=(?:\"(?<quoted>[^\"]+)\"|(?<plain>\\S+))')",
    "  if($match.Success){",
    "    $raw=if($match.Groups['quoted'].Success){$match.Groups['quoted'].Value}else{$match.Groups['plain'].Value}",
    "    try{$resolved=[IO.Path]::GetFullPath($raw)}catch{return}",
    "    if($resolved.Equals($target,[StringComparison]::OrdinalIgnoreCase)){[ordered]@{processId=[int]$_.ProcessId;executablePath=[string]$_.ExecutablePath;commandLine=[string]$_.CommandLine}}",
    "  }",
    "})",
    "ConvertTo-Json -InputObject @($rows) -Compress",
  ].join(";");
  const raw = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, MQ_CANARY_PROFILE_PATH: profilePath },
    timeoutMs: 15_000,
  });
  const value = JSON.parse(raw || "[]");
  return Array.isArray(value) ? value : [value];
}

async function profileProcessIdentityRecords(rows) {
  return Promise.all(rows.map(async (row) => ({
    processId: Number(row.processId),
    executableSha256: await hashFile(path.resolve(String(row.executablePath))),
    commandLineSha256: hashFileBytes(Buffer.from(String(row.commandLine), "utf8")),
  })));
}

async function closePersistentContext(context, profilePath) {
  if (!context) return true;
  const closePromise = Promise.resolve().then(() => context.close());
  let result = await observePromiseSettlement(closePromise, 10_000);
  if (!result.settled || result.error) {
    const rows = await profileBoundEdgeProcesses(profilePath);
    for (const processId of [...new Set(rows.map((row) => Number(row.processId)).filter((value) => Number.isSafeInteger(value) && value > 0))]) {
      await run("taskkill.exe", ["/PID", String(processId), "/T", "/F"], { timeoutMs: 15_000 }).catch(() => "");
    }
    result = await observePromiseSettlement(closePromise, 10_000);
  }
  if (!result.settled) throw new Error("Playwright context close did not settle after the exact disposable Edge process tree was terminated.");
  const remaining = await waitFor(async () => {
    const rows = await profileBoundEdgeProcesses(profilePath);
    return rows.length === 0 ? [] : null;
  }, "Edge retained the disposable profile after bounded context close", 10_000, 200);
  assert.deepEqual(remaining, []);
  return true;
}

async function boundedBrowserOperation(operation, persistentContext, profilePath, label, timeoutMs = 30_000) {
  return recoverAndDrainOperation(operation, {
    timeoutMs,
    drainTimeoutMs: 10_000,
    label,
    recover: () => closePersistentContext(persistentContext, profilePath),
  });
}

async function boundedPageEvaluate(page, persistentContext, profilePath, pageFunction, argument) {
  return boundedBrowserOperation(
    page.evaluate(pageFunction, argument),
    persistentContext,
    profilePath,
    "Playwright page evaluation",
  );
}

async function closeAuxiliaryContext(auxiliaryContext, persistentContext, profilePath) {
  if (!auxiliaryContext) return true;
  const closePromise = Promise.resolve().then(() => auxiliaryContext.close());
  const initial = await observePromiseSettlement(closePromise, 10_000);
  if (initial.settled && !initial.error) return true;

  await closePersistentContext(persistentContext, profilePath);
  if (!initial.settled) {
    const drained = await observePromiseSettlement(closePromise, 10_000);
    if (!drained.settled) throw new Error("Auxiliary Playwright context close did not settle after the exact disposable Edge process tree was terminated.");
  }
  if (initial.error) throw initial.error;
  throw new Error("Auxiliary Playwright context close timed out and settled only after the exact disposable Edge process tree was terminated.");
}

async function trackRequests(context, records, persistentContext, profilePath) {
  const tasks = [];
  const observationFailures = [];
  const channelCounts = { webSocket: 0, eventSource: 0, webTransport: 0, sendBeacon: 0 };
  await boundedBrowserOperation(context.exposeBinding("__mqCanaryReportChannel", (_source, channel) => {
    if (Object.hasOwn(channelCounts, channel)) channelCounts[channel] += 1;
  }), persistentContext, profilePath, "Playwright request-channel binding");
  await boundedBrowserOperation(context.addInitScript(() => {
    const report = (channel) => { try { void globalThis.__mqCanaryReportChannel(channel); } catch {} };
    for (const [name, channel] of [["WebSocket", "webSocket"], ["EventSource", "eventSource"], ["WebTransport", "webTransport"]]) {
      const Original = globalThis[name];
      if (typeof Original === "function") {
        try { Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: new Proxy(Original, { construct(target, args, newTarget) { report(channel); return Reflect.construct(target, args, newTarget); } }) }); } catch {}
      }
    }
    if (typeof navigator.sendBeacon === "function") {
      const original = navigator.sendBeacon.bind(navigator);
      try { Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: (...args) => { report("sendBeacon"); return original(...args); } }); } catch {}
    }
  }), persistentContext, profilePath, "Playwright request-channel initialization");
  const attachPage = (page) => page.on("websocket", () => { channelCounts.webSocket += 1; });
  context.pages().forEach(attachPage);
  context.on("page", attachPage);
  context.on("request", (request) => {
    try {
      const parsed = new URL(request.url());
      const body = request.postDataBuffer();
      const resourceType = request.resourceType();
      const headerFlags = canaryRequestHeaderFlags(request.headers());
      if (resourceType === "eventsource") channelCounts.eventSource += 1;
      records.push(Object.freeze({
        method: request.method(),
        origin: parsed.origin,
        pathname: decodeURIComponent(parsed.pathname),
        search: parsed.search,
        hasCredentials: Boolean(parsed.username || parsed.password),
        resourceType,
        bodyBytes: body?.byteLength || 0,
        bodySha256: body?.byteLength ? hashFileBytes(body) : null,
        ...headerFlags,
      }));
    } catch (error) {
      observationFailures.push(Object.freeze({ label: "request metadata", error: String(error?.message || error) }));
    }
  });
  return Object.freeze({ tasks, channelCounts, observationFailures });
}

function recordSetSha256(records) {
  return hashFileBytes(Buffer.from(`${JSON.stringify([...records].sort((left, right) => left.path.localeCompare(right.path)))}\n`, "utf8"));
}

async function inspectExactCandidateCache(page, snapshots, { allowBeta1, persistentContext, profilePath }) {
  const manifest = snapshots.manifest;
  const manifestSha256 = snapshots.identity.candidateReleaseManifestSha256;
  const physicalCacheName = `${manifest.cacheName}-${manifestSha256}`;
  const expected = [
    { path: "release-shell-v1.json", sha256: manifestSha256, bytes: snapshots.candidate.records.find((item) => item.path === "release-shell-v1.json").bytes, mime: "application/json", status: 200 },
    ...manifest.entries.map((entry) => ({ ...entry, path: entry.path.slice(2) })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const allowedNames = new Set([physicalCacheName, ...(allowBeta1 ? [BETA1_CACHE] : [])]);
  const observed = await boundedPageEvaluate(page, persistentContext, profilePath, exactCandidateCacheObservation, {
    expectedCacheName: physicalCacheName,
    expectedRows: expected,
    allowedCacheNames: [...allowedNames],
    observationTimeoutMs: 15_000,
    pollMs: 100,
  });
  if (allowBeta1) assert.equal(observed.names.includes(BETA1_CACHE), true, "the canary must retain the immutable Beta 1 cache for the older open tab");
  assert.deepEqual([...observed.names].sort(), [...allowedNames].filter((name) => observed.names.includes(name)).sort());
  assert.equal(observed.names.includes(physicalCacheName), true);
  assert.equal(observed.names.some((name) => name.endsWith(CANDIDATE_STAGING_SUFFIX)), false);
  assert.equal(observed.names.filter((name) => name.startsWith(`${manifest.cacheName}-`) && name !== physicalCacheName).length, 0);
  assert.equal(observed.rows.length, expected.length);
  const normalized = observed.rows.map((row) => {
    assert.equal(row.origin, new URL(page.url()).origin, row.path);
    assert.equal(row.search, "", row.path);
    const wanted = expected.find((item) => item.path === row.path);
    assert.ok(wanted, `unexpected cache entry ${row.path}`);
    assert.deepEqual({ status: row.status, mime: row.mime, bytes: row.bytes, sha256: row.sha256 }, {
      status: wanted.status,
      mime: wanted.mime,
      bytes: wanted.bytes,
      sha256: wanted.sha256,
    }, row.path);
    return { path: row.path, status: row.status, mime: row.mime, bytes: row.bytes, sha256: row.sha256 };
  });
  assert.deepEqual(normalized.map((row) => row.path).sort(), expected.map((row) => row.path).sort());
  return Object.freeze({
    physicalCacheName,
    entryCount: normalized.length,
    setSha256: recordSetSha256(normalized),
    unexpectedCacheCount: observed.names.filter((name) => !allowedNames.has(name)).length,
    stagingCacheCount: observed.names.filter((name) => name.endsWith(CANDIDATE_STAGING_SUFFIX)).length,
  });
}

async function verifyDetachedHttpsResponses({ origin, context, snapshots, persistentContext, profilePath }) {
  const manifestRecord = snapshots.candidate.records.find((item) => item.path === "release-shell-v1.json");
  const expected = [
    { path: "", sha256: snapshots.identity.candidateIndexSha256, bytes: snapshots.candidate.records.find((item) => item.path === "index.html").bytes, mime: "text/html", status: 200 },
    ...snapshots.candidate.records.map((record) => ({ ...record, mime: contentType(record.path), status: 200 })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  assert.equal(manifestRecord.sha256, snapshots.identity.candidateReleaseManifestSha256);
  const page = await boundedBrowserOperation(context.newPage(), persistentContext, profilePath, "Playwright detached-response page creation");
  const first = await page.goto(`${origin}release-shell-v1.json`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert.equal(first?.fromServiceWorker(), false);
  const observed = await boundedPageEvaluate(page, persistentContext, profilePath, async (rows) => {
    const results = [];
    for (const row of rows) {
      const response = await fetch(new URL(row.path, location.origin + "/"), { cache: "no-store", credentials: "omit", redirect: "error" });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
      const headers = Object.fromEntries(response.headers.entries());
      results.push({ path: row.path, url: response.url, redirected: response.redirected, status: response.status, mime: String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase(), contentLength: headers["content-length"] || "", cacheControl: headers["cache-control"] || "", nosniff: headers["x-content-type-options"] || "", serviceWorkerAllowed: headers["service-worker-allowed"] || "", marker: headers["x-math-quest-canary"] || "", bytes: bytes.byteLength, sha256 });
    }
    return results;
  }, expected);
  for (const row of observed) {
    const wanted = expected.find((item) => item.path === row.path);
    assert.ok(wanted, row.path);
    assert.equal(new URL(row.url).origin, new URL(origin).origin, row.path);
    assert.equal(new URL(row.url).search, "", row.path);
    assert.equal(row.redirected, false, row.path);
    assert.deepEqual({ status: row.status, mime: row.mime, contentLength: row.contentLength, bytes: row.bytes, sha256: row.sha256 }, { status: wanted.status, mime: wanted.mime, contentLength: String(wanted.bytes), bytes: wanted.bytes, sha256: wanted.sha256 }, row.path);
    assert.deepEqual({ cacheControl: row.cacheControl, nosniff: row.nosniff, serviceWorkerAllowed: row.serviceWorkerAllowed, marker: row.marker }, { cacheControl: "no-store", nosniff: "nosniff", serviceWorkerAllowed: "/", marker: "trusted-https-canary-v1" }, row.path);
  }
  const normalized = observed.map(({ path: responsePath, status, mime, bytes, sha256 }) => ({ path: responsePath || "/", status, mime, bytes, sha256 }));
  const headers = observed.map(({ path: responsePath, contentLength, cacheControl, nosniff, serviceWorkerAllowed, marker }) => ({ path: responsePath || "/", contentLength, cacheControl, nosniff, serviceWorkerAllowed, marker }));
  return Object.freeze({ expectedResponseCount: expected.length, verifiedResponseCount: observed.length, responseSetSha256: recordSetSha256(normalized), responseHeaderSetSha256: recordSetSha256(headers) });
}

async function caddyAccessLogProof(logPath, backendRequests) {
  const parsed = await waitFor(async () => {
    const text = await readFile(logPath, "utf8").catch(() => "");
    const rows = text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
    return rows.length >= backendRequests.length ? rows : null;
  }, "Caddy access log did not reconcile with backend requests", 10_000);
  assert.equal(parsed.length, backendRequests.length);
  const caddyRows = parsed.map((row) => ({
    method: String(row.request?.method || ""),
    uri: String(row.request?.uri || ""),
    status: Number(row.status),
    size: Number(row.size),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const backendRows = backendRequests.map((row) => ({ method: row.method, uri: `${row.pathname}${row.search}`, status: row.responseStatus })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(caddyRows.map(({ method, uri, status }) => ({ method, uri, status })), backendRows);
  assert.ok(caddyRows.every((row) => Number.isSafeInteger(row.size) && row.size >= 0));
  return hashFileBytes(Buffer.from(`${JSON.stringify(caddyRows)}\n`, "utf8"));
}

async function exactActiveReadiness(page, snapshots, persistentContext, profilePath) {
  const value = await boundedPageEvaluate(page, persistentContext, profilePath, () => new Promise((resolve, reject) => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) { reject(new Error("No active service-worker controller.")); return; }
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Readiness reply timed out.")), 10_000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); resolve(event.data); };
    worker.postMessage({ type: "MATH_QUEST_GET_READINESS_V1" }, [channel.port2]);
  }));
  assert.equal(value.type, "MATH_QUEST_READINESS_V1");
  assert.equal(value.release, snapshots.manifest.release);
  assert.equal(value.buildId, snapshots.manifest.buildId);
  assert.equal(value.cacheIdentity, snapshots.manifest.cacheName);
  assert.equal(value.workerState, "active");
  assert.equal(value.ready, true);
  assert.deepEqual(value.requiredPaths.map((item) => [item.path, item.ready]), [
    ["./release-shell-v1.json", true],
    ...snapshots.manifest.entries.map((entry) => [entry.path, true]),
  ]);
  return value;
}

function runtimeAllowlist(snapshots) {
  return new Set([
    "/",
    ...EXPECTED_BROWSER_PROBE_PATHS,
    ...[...snapshots.beta1.files.keys(), ...snapshots.candidate.files.keys()],
  ]);
}

export {
  findEdgeExecutable,
  profileBoundEdgeProcesses,
  profileProcessIdentityRecords,
  closePersistentContext,
  boundedBrowserOperation,
  boundedPageEvaluate,
  closeAuxiliaryContext,
  trackRequests,
  inspectExactCandidateCache,
  verifyDetachedHttpsResponses,
  caddyAccessLogProof,
  exactActiveReadiness,
  runtimeAllowlist,
};
