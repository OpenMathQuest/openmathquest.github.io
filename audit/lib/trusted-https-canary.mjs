import { createHash } from "node:crypto";
import {
  TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
  TRUSTED_HTTPS_CANARY_KIND,
  TRUSTED_HTTPS_CANARY_STATUS,
  TRUSTED_HTTPS_CANARY_WORKFLOW,
  TRUSTED_HTTPS_CANARY_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  CADDY_VERSION,
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  PLAYWRIGHT_CORE_VERSION,
  PLAYWRIGHT_CORE_SRI,
  RETAINED_BETA1_COMPLETE_VALUE,
  RETAINED_BETA1_COMPLETE_SHA256,
  RETAINED_BETA1_FRESH_START_NOTICE,
  RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  SHA64,
} from "./trusted-https-canary-contract.mjs";
export {
  TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
  TRUSTED_HTTPS_CANARY_KIND,
  TRUSTED_HTTPS_CANARY_STATUS,
  TRUSTED_HTTPS_CANARY_WORKFLOW,
  TRUSTED_HTTPS_CANARY_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  CADDY_VERSION,
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  PLAYWRIGHT_CORE_VERSION,
  PLAYWRIGHT_CORE_SRI,
  RETAINED_BETA1_COMPLETE_VALUE,
  RETAINED_BETA1_COMPLETE_SHA256,
  RETAINED_BETA1_FRESH_START_NOTICE,
  RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
};
export { canonicalCanaryEvidence, parseTrustedHttpsCanaryEvidence } from "./trusted-https-canary-evidence.mjs";

export const LOOPBACK_LISTENER_QUERY_SCRIPT = [
  "$port=[int]$env:MQ_CANARY_LISTENER_PORT",
  "try { $rows=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop) }",
  "catch { if ($_.FullyQualifiedErrorId -like 'CmdletizationQuery_NotFound*') { $rows=@() } else { throw } }",
  "$selected=@($rows | Select-Object LocalAddress,OwningProcess)",
  "ConvertTo-Json -InputObject $selected -Compress",
].join("\n");
export const WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT = Object.freeze([
  "$hasher=[Security.Cryptography.SHA256]::Create()",
  "try{$hash=$hasher.ComputeHash($cert.RawData)}finally{$hasher.Dispose()}",
  "$sha=[BitConverter]::ToString($hash).Replace('-','').ToLowerInvariant()",
]);

export function trustedTlsInspectionScript() {
  return [
    "$ErrorActionPreference='Stop'",
    "$client=[Net.Sockets.TcpClient]::new()",
    "$client.Connect('localhost',[int]$env:MQ_CANARY_TLS_PORT)",
    "$ssl=[Net.Security.SslStream]::new($client.GetStream(),$false)",
    "$ssl.AuthenticateAsClient('localhost')",
    "$cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)",
    ...WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT,
    "$result=[ordered]@{sha256=$sha;subjectName=$cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::DnsName,$false);issuer=$cert.Issuer;validFrom=[DateTimeOffset]::new($cert.NotBefore.ToUniversalTime()).ToUnixTimeSeconds();validTo=[DateTimeOffset]::new($cert.NotAfter.ToUniversalTime()).ToUnixTimeSeconds();protocol=$ssl.SslProtocol.ToString()}",
    "$ssl.Dispose();$client.Dispose()",
    "$result|ConvertTo-Json -Compress",
  ].join(";");
}

function canaryBrowserTlsIssues(security, issues) {
  if (!security || typeof security !== "object") issues.push("Playwright returned no HTTPS security details");
  const observation = security ?? {};
  const browserSubject = String(observation.subjectName || "");
  if (browserSubject !== "" && browserSubject !== "localhost") issues.push("Playwright reported an unexpected certificate common name");
  if (!/Caddy Local Authority/iu.test(String(observation.issuer || ""))) issues.push("Playwright did not report the disposable Caddy issuer");
  if (!["TLS 1.2", "TLS 1.3"].includes(observation.protocol)) issues.push("Playwright did not report TLS 1.2 or 1.3");
}

function canaryOsTlsIssues(trustedTls, issues) {
  const observation = trustedTls ?? {};
  if (observation.subjectName !== "localhost") issues.push("The independent OS TLS probe did not validate the localhost DNS identity");
  if (!/Caddy Local Authority/iu.test(String(observation.issuer || ""))) issues.push("The independent OS TLS probe did not report the disposable Caddy issuer");
  if (!/^[a-f0-9]{64}$/u.test(String(observation.sha256 || ""))) issues.push("The independent OS TLS probe did not hash the leaf certificate");
  if (!["Tls12", "Tls13"].includes(observation.protocol)) issues.push("The independent OS TLS probe did not negotiate TLS 1.2 or 1.3");
}

export function validateCanaryBrowserTlsSecurity(security, trustedTls) {
  const issues = [];
  canaryBrowserTlsIssues(security, issues);
  canaryOsTlsIssues(trustedTls, issues);
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

function trustedCanaryRoot(origin, issues) {
  let root = null;
  try {
    root = new URL(origin);
  } catch {
    issues.push("The canary origin is invalid");
  }
  if (root && (root.protocol !== "https:" || root.hostname !== "localhost" || root.pathname !== "/" || root.search !== "" || root.hash !== "")) {
    issues.push("The canary origin is not the exact trusted localhost HTTPS root");
  }
  return root;
}

function manifestDeclaresRoot(manifest) {
  return manifest?.id === "./" && manifest?.start_url === "./" && manifest?.scope === "./";
}

export function validateCanaryRootScopeProof({ manifest, manifestHref, workerScope, origin }) {
  const issues = [];
  const root = trustedCanaryRoot(origin, issues);
  if (!manifestDeclaresRoot(manifest)) {
    issues.push("The exact Git manifest bytes do not declare root-relative id, start URL, and scope");
  }
  if (root && manifestHref !== new URL("manifest.webmanifest", root).href) issues.push("The rendered manifest link does not target the same-origin root manifest");
  if (root && workerScope !== root.href) issues.push("The live service-worker registration does not control the exact origin root");
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function canaryRequestHeaderFlags(headers) {
  if (!headers || typeof headers !== "object") throw new TypeError("Canary request headers must be an object.");
  const names = Object.keys(headers).map((name) => name.toLowerCase());
  return Object.freeze({
    cookieHeader: names.includes("cookie"),
    authorizationHeader: names.includes("authorization") || names.includes("proxy-authorization"),
    sensitiveHeader: names.some((name) => /^(?:cookie|authorization|proxy-authorization|x-api-key|x-auth-token)$/u.test(name)),
  });
}

function canaryRequestTransportMask(record) {
  return (String(record.search || "") !== "" ? 4 : 0)
    | (record.hasCredentials !== false ? 8 : 0)
    | (!Number.isFinite(record.contentLength) || record.contentLength !== 0 ? 16 : 0);
}

function canaryRequestHeaderMask(record) {
  return (record.cookieHeader === true ? 32 : 0)
    | (record.authorizationHeader === true ? 64 : 0)
    | (record.sensitiveHeader === true ? 128 : 0)
    | (record.transferEncoding === true ? 256 : 0);
}

function canaryRequestViolationResult(record, { method, pathname, allowedPath }, violationMask) {
  return Object.freeze({
    violationMask,
    methodClass: ["GET", "HEAD"].includes(method) ? method : "OTHER",
    allowedPath: allowedPath ? pathname : null,
    pathnameSha256: allowedPath ? null : createHash("sha256").update(pathname, "utf8").digest("hex"),
    contentLengthClass: Number.isFinite(record.contentLength) ? (record.contentLength === 0 ? "ZERO" : "NONZERO") : "INVALID",
  });
}

export function canaryBackendRequestViolation(record, allowedPaths) {
  if (!record || typeof record !== "object") throw new TypeError("Canary backend request record must be an object.");
  const allowed = allowedPaths instanceof Set ? allowedPaths : new Set(allowedPaths);
  const method = String(record.method || "");
  const pathname = String(record.pathname || "INVALID");
  const allowedPath = allowed.has(pathname);
  const violationMask =
    (!["GET", "HEAD"].includes(method) ? 1 : 0)
    | (!allowedPath ? 2 : 0)
    | canaryRequestTransportMask(record)
    | canaryRequestHeaderMask(record);
  if (violationMask === 0) return null;
  return canaryRequestViolationResult(record, { method, pathname, allowedPath }, violationMask);
}

export function beta1GradedSelectionAnswer(question, gradeAnswer) {
  if (!question || question.inputClass !== "SELECTION" || !Array.isArray(question.options)) {
    throw new TypeError("Beta 1 selection-answer discovery requires one selection question.");
  }
  if (typeof gradeAnswer !== "function") throw new TypeError("Beta 1 selection-answer discovery requires the historical grader.");
  const matches = question.options.filter((option) => {
    if (!option || typeof option.optionId !== "string" || option.optionId.length < 1 || Object.hasOwn(option, "id")) return false;
    return gradeAnswer(question, { optionId: option.optionId })?.correct === true;
  });
  if (matches.length !== 1) throw new Error(`Synthetic Beta 1 fixture expected one independently graded correct option, found ${matches.length}.`);
  return Object.freeze({ optionId: matches[0].optionId });
}

export async function waitForCanaryHomeUpdate(page, productVersion, timeoutMs = 30_000) {
  if (!page || typeof page.waitForFunction !== "function" || typeof page.locator !== "function") {
    throw new TypeError("Canary Home observation requires a Playwright page.");
  }
  await page.waitForFunction(
    (version) => globalThis.MathQuestEngine?.CONSTANTS?.PRODUCT_VERSION === version,
    productVersion,
    { timeout: timeoutMs },
  );
  const check = page.locator('[data-action="pwa-check"]').first();
  const home = page.locator('[data-action="home"]').first();
  await page.locator('[data-action="pwa-check"], [data-action="home"]').first().waitFor({ state: "visible", timeout: timeoutMs });
  if (!await check.isVisible()) await home.click();
  await check.waitFor({ state: "visible", timeout: timeoutMs });
}

export async function observeCanaryRetainedFreshStartNotice(page, timeoutMs = 30_000) {
  if (!page || typeof page.locator !== "function") throw new TypeError("Canary fresh-start notice observation requires a Playwright page.");
  const notice = page.locator('.runtime-warning[role="alert"]').first();
  await notice.waitFor({ state: "visible", timeout: timeoutMs });
  const text = String(await notice.innerText()).trim();
  if (text !== RETAINED_BETA1_FRESH_START_NOTICE) throw new Error("Canary fresh-start notice did not match the exact approved grown-up message.");
  return text;
}

export async function canaryWaitingCacheReady({ expectedCacheName, allowedCacheNames, stableMs }) {
  const registration = await navigator.serviceWorker.getRegistration("./");
  const observedNames = [...await caches.keys()].sort();
  const expectedNames = [...allowedCacheNames].sort();
  const ready = Boolean(registration?.waiting)
    && expectedNames.includes(expectedCacheName)
    && observedNames.length === expectedNames.length
    && observedNames.every((name, index) => name === expectedNames[index]);
  if (!ready) {
    globalThis.__mathQuestCanaryWaitingCacheStableSince = null;
    return false;
  }
  const now = performance.now();
  const firstReady = globalThis.__mathQuestCanaryWaitingCacheStableSince;
  if (!Number.isFinite(firstReady) || firstReady > now) {
    globalThis.__mathQuestCanaryWaitingCacheStableSince = now;
    return stableMs === 0;
  }
  return now - firstReady >= stableMs;
}

export async function exactCandidateCacheObservation({
  expectedCacheName,
  expectedRows,
  allowedCacheNames,
  observationTimeoutMs = 15_000,
  pollMs = 100,
}) {
  async function readCacheEntry(cache, request) {
    const response = await cache.match(request, { ignoreSearch: false });
    if (!response) throw new Error("cache entry changed during observation");
    const url = new URL(request.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
    return {
      path: decodeURIComponent(url.pathname).replace(/^\//u, ""),
      search: url.search,
      origin: url.origin,
      status: response.status,
      mime: String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase(),
      bytes: bytes.byteLength,
      sha256: digest,
    };
  }
  const expectedNames = [...allowedCacheNames].sort();
  const namesAreExact = (names) => names.length === expectedNames.length
    && [...names].sort().every((name, index) => name === expectedNames[index]);
  const deadline = performance.now() + observationTimeoutMs;
  let lastNames = [];
  for (; performance.now() <= deadline; await new Promise((resolve) => { setTimeout(resolve, pollMs); })) {
    const names = await caches.keys();
    lastNames = names;
    if (!namesAreExact(names)) continue;
    try {
      const cache = await caches.open(expectedCacheName);
      const requests = await cache.keys();
      const rows = [];
      for (const request of requests) rows.push(await readCacheEntry(cache, request));
      const namesAfter = await caches.keys();
      if (namesAreExact(namesAfter)) return { names: namesAfter, rows, origin: location.origin, expectedCount: expectedRows.length };
      lastNames = namesAfter;
    } catch {
      // A concurrent install changed Cache Storage. Retry until one exact
      // before-and-after snapshot is observed or the bounded deadline wins.
    }
  }
  throw new Error(`exact candidate cache did not settle: ${JSON.stringify([...lastNames].sort())}`);
}

export async function reloadCanaryCandidateFromBeta1(page, productVersion, timeoutMs = 30_000) {
  if (!page || typeof page.reload !== "function") throw new TypeError("Canary candidate transition requires the existing Beta 1 page.");
  await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  await waitForCanaryHomeUpdate(page, productVersion, timeoutMs);
  return page;
}

export async function activateCanaryHomeUpdate(page, timeoutMs = 30_000) {
  if (!page || typeof page.locator !== "function") throw new TypeError("Canary Home activation requires a Playwright page.");
  const dialog = page.locator("[data-pwa-dialog-backdrop]");
  if (await dialog.isVisible().catch(() => false)) throw new Error("Canary update activation must begin directly on Home, not inside installation help.");
  await page.locator('[data-action="pwa-check"]').first().waitFor({ state: "visible", timeout: timeoutMs });
  const apply = page.locator('[data-action="pwa-apply"]').first();
  await apply.waitFor({ state: "visible", timeout: timeoutMs });
  await apply.click();
}

export async function openCanaryInstallHelp(page, timeoutMs = 10_000) {
  if (!page || typeof page.locator !== "function") throw new TypeError("Canary installation-help observation requires a Playwright page.");
  const dialog = page.locator("[data-pwa-dialog-backdrop]");
  if (!await dialog.isVisible().catch(() => false)) {
    const installHelp = page.locator('[data-action="install-help"]').first();
    if (!await installHelp.isVisible().catch(() => false)) {
      const grownUpCorner = page.locator('[data-action="grown"]').first();
      await grownUpCorner.waitFor({ state: "visible", timeout: timeoutMs });
      await grownUpCorner.click();
      await installHelp.waitFor({ state: "visible", timeout: timeoutMs });
    }
    await installHelp.click();
  }
  await dialog.waitFor({ state: "visible", timeout: timeoutMs });
}

export function loopbackListenerProbeInvocation(port, baseEnv = process.env) {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new TypeError("Canary listener port must be an unprivileged TCP port.");
  }
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-Command", LOOPBACK_LISTENER_QUERY_SCRIPT],
    options: { env: { ...baseEnv, MQ_CANARY_LISTENER_PORT: String(port) } },
  };
}

export async function observePromiseSettlement(promise, timeoutMs) {
  if (!promise || typeof promise.then !== "function") throw new TypeError("Settlement observation requires a promise.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("Settlement timeout must be positive.");
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise).then(
        (value) => Object.freeze({ settled: true, value, error: null }),
        (error) => Object.freeze({ settled: true, value: undefined, error }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(Object.freeze({ settled: false, value: undefined, error: null })), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function recoverAndDrainOperation(promise, {
  timeoutMs,
  drainTimeoutMs,
  recover,
  label,
}) {
  if (typeof recover !== "function") throw new TypeError("Operation recovery must be a function.");
  const description = String(label || "Operation");
  const initial = await observePromiseSettlement(promise, timeoutMs);
  if (initial.settled) {
    if (initial.error) throw initial.error;
    return initial.value;
  }

  let recoveryError = null;
  try {
    await recover();
  } catch (error) {
    recoveryError = error;
  }
  const drained = await observePromiseSettlement(promise, drainTimeoutMs);
  const recoveryDetail = recoveryError ? ` Recovery failed: ${String(recoveryError?.message || recoveryError)}` : "";
  if (!drained.settled) {
    throw new Error(`${description} timed out after ${timeoutMs} ms and did not settle after recovery.${recoveryDetail}`);
  }
  throw new Error(`${description} timed out after ${timeoutMs} ms and settled only after recovery.${recoveryDetail}`);
}

export async function captureCanaryObservation(promise, failures, label) {
  if (!Array.isArray(failures)) throw new TypeError("Canary observation failures must be an array.");
  try {
    return Object.freeze({ ok: true, value: await promise });
  } catch (error) {
    failures.push(Object.freeze({
      label: String(label || "observation"),
      error: String(error?.message || error).slice(0, 180),
    }));
    return Object.freeze({ ok: false, value: null });
  }
}

export function canaryChildExitSucceeded(result) {
  return Boolean(result?.settled && result.error === null && result.value === true);
}

export function canonicalCertificateThumbprint(value) {
  const source = String(value || "");
  if (!/^[A-Fa-f0-9]{40}$/u.test(source)) throw new TypeError("Certificate thumbprint must be exactly 40 hexadecimal characters.");
  return source.toLowerCase();
}

function assertLoopbackListenerOptions({ probe, expectedPid, timeoutMs, intervalMs }) {
  if (typeof probe !== "function") throw new TypeError("Loopback listener probe must be a function.");
  if (!Number.isSafeInteger(expectedPid) || expectedPid <= 0) throw new TypeError("Expected listener process id must be positive.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("Listener timeout must be positive.");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) throw new TypeError("Listener interval must be nonnegative.");
}

export async function waitForExactLoopbackListener({
  probe,
  expectedPid,
  timeoutMs = 10_000,
  intervalMs = 100,
}) {
  assertLoopbackListenerOptions({ probe, expectedPid, timeoutMs, intervalMs });

  const deadline = Date.now() + timeoutMs;
  do {
    const rows = await probe();
    if (!Array.isArray(rows)) throw new TypeError("Loopback listener probe must return an array.");
    if (rows.length > 0) {
      const normalized = rows.map((row) => ({
        localAddress: String(row?.LocalAddress || ""),
        owningProcess: Number(row?.OwningProcess),
      }));
      if (!normalized.every((row) => row.localAddress === "127.0.0.1" && row.owningProcess === expectedPid)) {
        throw new Error("The canary HTTPS listener was not owned exclusively by Caddy on IPv4 loopback.");
      }
      return normalized;
    }
    if (intervalMs > 0) await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  } while (Date.now() < deadline);

  throw new Error("Caddy's loopback listener did not become observable before the deadline.");
}

const FORBIDDEN_BROWSER_FLAGS = Object.freeze([
  "--ignore-certificate-errors",
  "--allow-insecure-localhost",
  "--unsafely-treat-insecure-origin-as-secure",
  "--no-sandbox",
]);

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function profileProcessSetSha256(records) {
  if (!Array.isArray(records)) throw new TypeError("Profile process records must be an array.");
  const normalized = records.map((record) => {
    if (!Number.isSafeInteger(record?.processId) || record.processId < 1
        || !SHA64.test(String(record?.executableSha256 || ""))
        || !SHA64.test(String(record?.commandLineSha256 || ""))) {
      throw new TypeError("Profile process records require a positive process id and exact executable/command-line SHA-256 values.");
    }
    return { processId: record.processId, executableSha256: record.executableSha256, commandLineSha256: record.commandLineSha256 };
  }).sort((left, right) => left.processId - right.processId);
  if (new Set(normalized.map((record) => record.processId)).size !== normalized.length) throw new TypeError("Profile process records cannot repeat a process id.");
  return sha256Bytes(`${JSON.stringify(normalized)}\n`);
}

export function canaryWorkspaceRemovalAllowed(remainingProfileProcessCount) {
  return remainingProfileProcessCount === 0;
}

export function snapshotSha256(records) {
  if (!Array.isArray(records) || !records.length) throw new TypeError("Snapshot records are required.");
  const normalized = records.map((record) => {
    if (!record || !safeRuntimePath(record.path) || !SHA64.test(String(record.sha256 || "")) || !Number.isSafeInteger(record.bytes) || record.bytes < 1) {
      throw new TypeError("Snapshot records must contain a safe path, SHA-256, and positive byte count.");
    }
    return { path: record.path, sha256: record.sha256, bytes: record.bytes };
  }).sort((left, right) => left.path.localeCompare(right.path));
  return sha256Bytes(`${JSON.stringify(normalized)}\n`);
}

export function safeRuntimePath(value) {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 180
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export function canaryBrowserArguments(profilePath) {
  if (typeof profilePath !== "string" || profilePath.length === 0) {
    throw new TypeError("The canary requires a disposable persistent profile path.");
  }
  return Object.freeze([
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-pings",
    "--safebrowsing-disable-auto-update",
    "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1",
  ]);
}

export function validateCanaryBrowserArguments(args) {
  const list = Array.isArray(args) ? args.map(String) : [];
  const issues = [];
  for (const flag of FORBIDDEN_BROWSER_FLAGS) {
    if (list.some((item) => item === flag || item.startsWith(`${flag}=`))) issues.push(`forbidden browser flag: ${flag}`);
  }
  if (!list.some((item) => item === "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1")) {
    issues.push("browser launch must block non-loopback hostname resolution");
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export async function runCanaryTeardown(cleanups) {
  const results = [];
  for (const item of [...cleanups].reverse()) {
    try {
      const value = await item.run();
      results.push(Object.freeze({ id: item.id, ok: value !== false, error: null }));
    } catch (error) {
      results.push(Object.freeze({ id: item.id, ok: false, error: String(error?.message || error).slice(0, 180) }));
    }
  }
  return Object.freeze(results);
}
