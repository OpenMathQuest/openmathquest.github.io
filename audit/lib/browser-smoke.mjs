import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { browserRunnerTupleIssues } from "./browser-runner-evidence.mjs";

const TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
});

export const AUDIT_SERVED_RELATIVE_PATHS = Object.freeze([
  "audit.html",
  "assets/design/math-quest-design-tokens-v1.css",
  "index.html",
  "manifest.webmanifest",
  "release-shell-v1.json",
  "sw.js",
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "curriculum/math-quest-tutorial-manifest-v1.json",
  "audit/approved-visual-regression.js",
  "assets/fonts/Inter-Variable.ttf",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/sounds/tap.wav",
  "assets/sounds/confirm.wav",
  "assets/sounds/incorrect.wav",
  "assets/sounds/close.wav",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
]);

export const BROWSER_AUDIT_TIMING = Object.freeze({
  inPageWatchdogMs: 2_280_000,
  wallTimeoutMs: 2_400_000,
  workflowTimeoutMinutes: 45,
  requiredWorkflowHeadroomMs: 300_000,
  completionPollIntervalMs: 250,
  browserCloseGraceMs: 10_000,
});

export const AUDIT_COMPLETION_EXPRESSION =
  "document.documentElement?.dataset.auditComplete === 'true'";

const CORE_BROWSER_RESULT_IDS = Object.freeze([
  "BR-01", "BR-02", "BR-03", "BR-04", "BR-05", "BR-06", "BR-07",
  "BR-08", "BR-09", "BR-10", "BR-11", "BR-12", "BR-13", "BR-14",
  "BR-15", "BR-16", "BR-17", "BR-18", "BR-19", "BR-20", "BR-21",
  "BR-22", "BR-23", "BR-24", "BR-25", "BR-26", "BR-27", "BR-28",
  "BR-29", "BR-30", "BR-31", "BR-32", "BR-33", "BR-34", "BR-35", "BR-36",
]);
const VISUAL_BROWSER_RESULT_IDS = Object.freeze([
  "PROFILE-AREA-MODEL",
  "PROFILE-CHANCE-EXPERIMENT",
  "PROFILE-DATA-DISPLAY",
  "PROFILE-DATA-INVESTIGATE",
  "PROFILE-DECIMAL-MODEL",
  "PROFILE-EXPRESSION-SOLVE",
  "PROFILE-FACTOR-CLASSIFY",
  "PROFILE-FRACTION-MODEL",
  "PROFILE-GEOMETRY-CLASSIFY",
  "PROFILE-GEOMETRY-TRANSFORM",
  "PROFILE-GROUPING-MODEL",
  "PROFILE-MEASURE-COMPARE",
  "PROFILE-MEASURE-INSTRUMENT",
  "PROFILE-MONEY-MODEL",
  "PROFILE-OPERATION-EQUATION",
  "PROFILE-OPERATION-FLUENCY",
  "PROFILE-OPERATION-MODEL",
  "PROFILE-PATTERN-EXTEND",
  "PROFILE-PATTERN-RULE",
  "PROFILE-PLACEVALUE-COMPOSE",
  "PROFILE-QUANTITY-COMPARE",
  "PROFILE-QUANTITY-IDENTIFY",
  "PROFILE-QUANTITY-ORDER",
  "PROFILE-ROUNDING-ESTIMATE",
  "PROFILE-TIME-READ",
  "PROFILE-VOLUME-MODEL",
  "VIS-MANIFEST",
  "VIS-CONSTRAINTS",
  "VIS-CAPABILITIES",
  "VIS-CANADIAN-MONEY",
  "VIS-PLACEMENT-LAYOUT",
  "VIS-PWA-STATUS",
  "VIS-LAB-CONTROLS",
  "VIS-LAB-MODELS",
  "VIS-DESKTOP-LAYOUT",
  "VIS-MOBILE-LAYOUT",
]);
export const BROWSER_AUDIT_SHARDS = Object.freeze({
  core: CORE_BROWSER_RESULT_IDS,
  visual: VISUAL_BROWSER_RESULT_IDS,
});
export const EXPECTED_BROWSER_RESULT_IDS = Object.freeze([
  ...CORE_BROWSER_RESULT_IDS,
  ...VISUAL_BROWSER_RESULT_IDS,
]);

const exactObjectKeys = (value, expected) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

export function validateBrowserAuditPayload(payload, { shard = "all" } = {}) {
  const errors = [];
  const expectedIds = shard === "all" ? EXPECTED_BROWSER_RESULT_IDS : BROWSER_AUDIT_SHARDS[shard];
  if (!expectedIds) errors.push(`Browser payload requested unknown shard ${shard}.`);
  const expected = new Set(expectedIds || []);
  if (!exactObjectKeys(payload, ["completed", "generatedAt", "shard", "results", "fail", "skipped"])) {
    errors.push("The browser payload does not use the closed result schema.");
  }
  if (payload?.shard !== shard) errors.push(`Browser payload shard ${payload?.shard || "UNKNOWN"} does not equal ${shard}.`);
  if (payload?.completed !== true) errors.push("The browser payload is not marked complete.");
  if (typeof payload?.generatedAt !== "string"
    || !Number.isFinite(Date.parse(payload.generatedAt))
    || new Date(payload.generatedAt).toISOString() !== payload.generatedAt) {
    errors.push("The browser payload has an invalid generatedAt timestamp.");
  }
  if (!Array.isArray(payload?.results)) {
    errors.push("The browser payload results field is not an array.");
  }
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const seen = new Set();
  let recomputedFail = 0;
  for (const [index, result] of results.entries()) {
    if (!exactObjectKeys(result, ["id", "title", "status", "details"])) {
      errors.push(`Browser result ${index} does not use the closed result schema.`);
      continue;
    }
    if (typeof result.id !== "string" || !expected.has(result.id)) {
      errors.push(`Browser result ${index} has an unknown id.`);
    } else if (seen.has(result.id)) {
      errors.push(`Browser result id ${result.id} is duplicated.`);
    } else {
      seen.add(result.id);
    }
    if (typeof result.title !== "string" || result.title.trim().length === 0) {
      errors.push(`Browser result ${index} has an invalid title.`);
    }
    if (typeof result.details !== "string") {
      errors.push(`Browser result ${index} has non-string details.`);
    }
    if (!["PASS", "FAIL"].includes(result.status)) {
      errors.push(`Browser result ${index} has an invalid status.`);
    } else if (result.status === "FAIL") {
      recomputedFail += 1;
    }
  }
  for (const id of expectedIds || []) {
    if (!seen.has(id)) errors.push(`Browser result id ${id} is missing.`);
  }
  if (results.length !== (expectedIds?.length || 0)) {
    errors.push(`Browser result count ${results.length} does not equal ${expectedIds?.length || 0}.`);
  }
  if (!Number.isInteger(payload?.fail) || payload.fail !== recomputedFail) {
    errors.push("The browser payload fail count does not match its result records.");
  }
  if (payload?.skipped !== 0) {
    errors.push("The browser payload must report exactly zero skipped checks.");
  }
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    results: Object.freeze(results),
    fail: recomputedFail,
    skipped: payload?.skipped,
  });
}

export function browserLaunchArgs({
  profile,
  url,
}) {
  if (typeof profile !== "string" || profile.length === 0) {
    throw new TypeError("The browser audit requires an isolated profile path.");
  }
  if (typeof url !== "string" || !url.startsWith("http://127.0.0.1:")) {
    throw new TypeError("The browser audit requires an IPv4-loopback audit URL.");
  }
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--no-sandbox",
    "--disable-breakpad",
    "--disable-dev-shm-usage",
    "--edge-skip-compat-layer-relaunch",
    "--no-first-run",
    "--disable-default-apps",
    "--disable-component-update",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-sync",
    "--metrics-recording-only",
    "--safebrowsing-disable-auto-update",
    "--no-pings",
    "--hide-scrollbars",
    "--mute-audio",
    `--user-data-dir=${profile}`,
    "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    url,
  ];
}

export function serveWorkspace(root, requests) {
  const server = createServer(async (request, response) => {
    let pathname = "/";
    try { pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname); } catch {}
    requests.push({ method: request.method, pathname, host: request.headers.host || "" });
    if (pathname === "/__audit_health__") {
      response.writeHead(200, { "Content-Type": "application/json", "X-Math-Quest-Audit-Server": "math-quest-audit:v1" });
      response.end('{"identity":"math-quest-audit:v1"}');
      return;
    }
    if (pathname === "/__audit_disconnect__") {
      // Stop accepting new connections before acknowledging the request. The
      // current response may still flush normally, while the browser's next
      // fetch proves that no origin listener remains.
      server.close();
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "close",
        "X-Math-Quest-Audit-Server": "math-quest-audit:v1",
      });
      response.end('{"disconnected":true}', () => server.closeIdleConnections?.());
      return;
    }
    if (pathname === "/favicon.ico") {
      response.writeHead(204, {
        "Cache-Control": "no-store",
        "X-Math-Quest-Audit-Server": "math-quest-audit:v1",
      });
      response.end();
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const resolved = path.resolve(root, relative);
    const rootPrefix = `${path.resolve(root)}${path.sep}`;
    const allowed = new Set(AUDIT_SERVED_RELATIVE_PATHS);
    if (!resolved.startsWith(rootPrefix) || !allowed.has(relative.replaceAll("\\", "/"))) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Not found"); return;
    }
    try {
      const bytes = await readFile(resolved);
      response.writeHead(200, {
        "Content-Type": TYPES[path.extname(resolved)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Math-Quest-Audit-Server": "math-quest-audit:v1",
        "Content-Security-Policy": relative === "audit.html"
          ? "default-src 'self' data: 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'"
          : relative === "sw.js"
            ? "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"
          : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'none'; media-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); response.end(String(error));
    }
  });
  return server;
}

function waitMs(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function waitForBrowserCleanup(promise, {
  remainingMs,
  wait = waitMs,
} = {}) {
  if (typeof remainingMs !== "function") throw new TypeError("remainingMs must be a function.");
  if (typeof wait !== "function") throw new TypeError("wait must be a function.");
  const budget = Math.max(
    1,
    Math.min(BROWSER_AUDIT_TIMING.browserCloseGraceMs, Number(remainingMs()) || 0),
  );
  return Promise.race([promise, wait(budget)]);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("Browser audit control was aborted.");
}

export async function waitForAuditPageCompletion({
  evaluate,
  timeoutMs,
  pollIntervalMs = BROWSER_AUDIT_TIMING.completionPollIntervalMs,
  now = Date.now,
  wait = waitMs,
  signal,
}) {
  if (typeof evaluate !== "function") throw new TypeError("evaluate must be a function.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("The completion timeout must be a positive integer.");
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new TypeError("The completion poll interval must be a positive integer.");
  }
  const startedAt = now();
  let polls = 0;
  while (now() - startedAt < timeoutMs) {
    throwIfAborted(signal);
    polls += 1;
    if (await evaluate()) return { polls, elapsedMs: now() - startedAt };
    const remaining = timeoutMs - (now() - startedAt);
    if (remaining <= 0) break;
    await wait(Math.min(pollIntervalMs, remaining));
  }
  throw new Error(`The audit page did not report completion within ${timeoutMs} ms.`);
}

function cdpClient(webSocketUrl, { signal, connectionTimeoutMs = 10_000 } = {}) {
  if (typeof WebSocket !== "function") {
    return Promise.reject(new Error("This audit requires the native Node.js WebSocket implementation."));
  }
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    let nextId = 1;
    let opened = false;
    let closed = false;
    const connectionTimer = setTimeout(() => {
      if (opened) return;
      try { socket.close(); } catch {}
      reject(new Error(`CDP did not connect within ${connectionTimeoutMs} ms.`));
    }, connectionTimeoutMs);
    const rejectPending = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      try { socket.close(); } catch {}
    };
    const onAbort = () => {
      const error = new Error("Browser audit control was aborted.");
      rejectPending(error);
      close();
      if (!opened) reject(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.addEventListener("open", () => {
      opened = true;
      clearTimeout(connectionTimer);
      resolve({
        send(method, params = {}) {
          if (closed || socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(`CDP is not open for ${method}.`));
          }
          const id = nextId;
          nextId += 1;
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close,
      });
    }, { once: true });
    socket.addEventListener("message", (event) => {
      Promise.resolve(
        typeof event.data === "string"
          ? event.data
          : event.data instanceof Blob
            ? event.data.text()
            : new TextDecoder().decode(event.data),
      ).then((messageText) => {
        const message = JSON.parse(messageText);
        if (!message.id || !pending.has(message.id)) return;
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          entry.reject(new Error(`CDP ${message.error.code}: ${message.error.message}`));
        } else {
          entry.resolve(message.result);
        }
      }).catch((error) => {
        rejectPending(error);
        close();
      });
    });
    socket.addEventListener("error", () => {
      const error = new Error(`CDP WebSocket failed: ${webSocketUrl}`);
      clearTimeout(connectionTimer);
      rejectPending(error);
      if (!opened) reject(error);
    });
    socket.addEventListener("close", () => {
      clearTimeout(connectionTimer);
      const error = new Error("CDP WebSocket closed before all commands completed.");
      rejectPending(error);
      closed = true;
      signal?.removeEventListener("abort", onAbort);
      if (!opened) reject(error);
    });
  });
}

async function discoverAuditTarget({ profile, url, deadline, signal }) {
  const activePortPath = path.join(profile, "DevToolsActivePort");
  let lastError = null;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      const lines = (await readFile(activePortPath, "utf8")).trim().split(/\r?\n/u);
      const port = Number(lines[0]);
      const browserPath = lines[1];
      if (!Number.isInteger(port) || port <= 0 || port > 65_535 || !browserPath?.startsWith("/devtools/browser/")) {
        throw new Error("DevToolsActivePort was malformed.");
      }
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`DevTools target listing returned HTTP ${response.status}.`);
      const targets = await response.json();
      const target = targets.find((item) => item.type === "page" && item.url === url);
      if (target?.webSocketDebuggerUrl) {
        return {
          browserWebSocketUrl: `ws://127.0.0.1:${port}${browserPath}`,
          pageWebSocketUrl: target.webSocketDebuggerUrl,
          port,
        };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
    await waitMs(BROWSER_AUDIT_TIMING.completionPollIntervalMs);
  }
  throw new Error(`The audit page CDP target was not discovered before the wall deadline. ${String(lastError || "")}`.trim());
}

async function captureCompletedAudit({ profile, url, timeoutMs, signal }) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const target = await discoverAuditTarget({ profile, url, deadline, signal });
  const client = await cdpClient(target.pageWebSocketUrl, { signal });
  try {
    await client.send("Runtime.enable");
    const completion = await waitForAuditPageCompletion({
      timeoutMs: Math.max(1, deadline - Date.now()),
      signal,
      evaluate: async () => {
        const evaluation = await client.send("Runtime.evaluate", {
          expression: AUDIT_COMPLETION_EXPRESSION,
          returnByValue: true,
        });
        if (evaluation.exceptionDetails) {
          throw new Error(`CDP completion evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
        }
        return evaluation.result?.value === true;
      },
    });
    const serialization = await client.send("Runtime.evaluate", {
      expression: "document.documentElement.outerHTML",
      returnByValue: true,
    });
    if (serialization.exceptionDetails || typeof serialization.result?.value !== "string") {
      throw new Error("CDP could not serialize the completed audit document.");
    }
    return {
      ...target,
      completion,
      html: serialization.result.value,
    };
  } finally {
    client.close();
  }
}

export async function requestBrowserClose(webSocketUrl, {
  timeoutMs = BROWSER_AUDIT_TIMING.browserCloseGraceMs,
  connect = cdpClient,
} = {}) {
  if (!webSocketUrl) return { requested: false, error: "The browser CDP endpoint was unavailable." };
  let client;
  let timer;
  try {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("Browser close requires a positive finite timeout.");
    }
    const operation = (async () => {
      client = await connect(webSocketUrl, {
        connectionTimeoutMs: Math.min(5_000, timeoutMs),
      });
      await client.send("Browser.close");
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Browser.close exceeded ${Math.round(timeoutMs)} ms`)),
        timeoutMs,
      );
    });
    await Promise.race([operation, timeout]);
    return { requested: true, error: null };
  } catch (error) {
    return { requested: true, error: String(error) };
  } finally {
    clearTimeout(timer);
    client?.close();
  }
}

function terminateBrowserTree(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return Promise.resolve();
  if (process.platform !== "win32") {
    child.kill("SIGKILL");
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const killer = spawn(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    killer.on("error", () => {
      try { child.kill("SIGKILL"); } catch {}
      finish();
    });
    killer.on("exit", finish);
  });
}

async function spawnBrowser(browserPath, args, {
  profile,
  url,
  timeoutMs,
}) {
  const child = spawn(browserPath, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let exitResult = null;
  const exitPromise = new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      exitResult = value;
      resolve(value);
    };
    child.on("error", (error) => settle({ status: null, signal: null, error: String(error) }));
    child.on("exit", (status, signal) => settle({ status, signal, error: null }));
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-64_000); });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-64_000); });

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Browser audit timeout must be a positive finite number.");
  }
  const deadline = Date.now() + timeoutMs;
  const remainingMs = () => Math.max(0, deadline - Date.now());
  const boundedCleanupWait = (promise) => waitForBrowserCleanup(promise, { remainingMs });
  const controller = new AbortController();
  let wallTimer;
  const wallTimeout = new Promise((resolve) => {
    wallTimer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const capturePromise = captureCompletedAudit({
    profile,
    url,
    timeoutMs,
    signal: controller.signal,
  }).then(
    (capture) => ({ kind: "capture", capture }),
    (error) => ({ kind: "control-error", error: String(error) }),
  );
  const earlyExitPromise = exitPromise.then((exit) => ({ kind: "exit", exit }));
  const winner = await Promise.race([capturePromise, earlyExitPromise, wallTimeout]);
  clearTimeout(wallTimer);

  let capture = null;
  let timedOut = false;
  let controlError = null;
  let forcedTermination = false;
  let close = { requested: false, error: null };
  if (winner.kind === "capture") {
    capture = winner.capture;
    const closeBudget = Math.min(BROWSER_AUDIT_TIMING.browserCloseGraceMs, remainingMs());
    close = closeBudget > 0
      ? await requestBrowserClose(capture.browserWebSocketUrl, { timeoutMs: closeBudget })
      : { requested: true, error: "Browser.close had no time remaining before the audit deadline." };
    if (!exitResult) {
      await boundedCleanupWait(exitPromise);
    }
  } else {
    controller.abort();
    timedOut = winner.kind === "timeout";
    controlError = winner.kind === "control-error"
      ? winner.error
      : timedOut
        ? `Browser exceeded ${timeoutMs} ms`
        : "Browser exited before the audit payload was captured.";
  }
  controller.abort();
  if (!exitResult) {
    forcedTermination = true;
    await boundedCleanupWait(terminateBrowserTree(child));
    if (!exitResult) await boundedCleanupWait(exitPromise);
  }
  return {
    status: exitResult?.status ?? null,
    signal: timedOut ? "TIMEOUT" : (exitResult?.signal ?? null),
    stdout,
    stderr,
    error: controlError || exitResult?.error || null,
    timedOut,
    forcedTermination,
    close,
    capture,
  };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function observeBrowserRunnerEvidence(browserPath, environment = process.env) {
  const browserExecutableSha256 = await sha256File(browserPath);
  const expectedExecutableSha256 = String(environment.MQ_BROWSER_EXECUTABLE_SHA256 || "");
  const runnerKind = String(environment.MQ_AUDIT_RUNNER_KIND || "LOCAL");
  const evidence = {
    schemaVersion: 1,
    status: "INVALID",
    browserProductName: String(environment.MQ_BROWSER_PRODUCT_NAME || "") || null,
    browserFullVersion: String(environment.MQ_BROWSER_PRODUCT_VERSION || "") || null,
    browserExecutableSha256,
    runnerImageOS: runnerKind === "GITHUB_HOSTED" ? (String(environment.MQ_AUDIT_RUNNER_IMAGE_OS || "") || null) : null,
    runnerImageVersion: runnerKind === "GITHUB_HOSTED" ? (String(environment.MQ_AUDIT_RUNNER_IMAGE_VERSION || "") || null) : null,
    runnerKind,
    requestedRunnerLabel: String(environment.MQ_AUDIT_RUNNER_LABEL || "") || null,
    browserExecutableName: path.basename(browserPath),
    expectedExecutableSha256: expectedExecutableSha256 || null,
    browserIdentityValid: false,
    validForPublication: false,
    issues: [],
  };
  const identityTuple = {
    ...evidence,
    runnerImageOS: evidence.runnerImageOS || "local",
    runnerImageVersion: evidence.runnerImageVersion || "local",
  };
  const tupleIssues = browserRunnerTupleIssues(identityTuple)
    .filter((issue) => !issue.startsWith("runnerImage"));
  if (!/^[a-f0-9]{64}$/u.test(expectedExecutableSha256)) {
    tupleIssues.push("the PowerShell wrapper did not provide a valid executable SHA-256");
  } else if (expectedExecutableSha256 !== browserExecutableSha256) {
    tupleIssues.push("the browser executable SHA-256 changed between wrapper selection and browser launch");
  }
  const expectedProductByExecutable = path.basename(browserPath).toLowerCase() === "msedge.exe"
    ? "Microsoft Edge"
    : path.basename(browserPath).toLowerCase() === "chrome.exe"
      ? "Google Chrome"
      : null;
  if (!expectedProductByExecutable || evidence.browserProductName !== expectedProductByExecutable) {
    tupleIssues.push("the browser product name does not match the selected executable");
  }
  evidence.browserIdentityValid = tupleIssues.length === 0;
  if (runnerKind === "GITHUB_HOSTED") {
    tupleIssues.push(...browserRunnerTupleIssues(evidence).filter((issue) => issue.startsWith("runnerImage")));
    if (evidence.requestedRunnerLabel !== "windows-latest") {
      tupleIssues.push("the hosted audit must record windows-latest as its requested runner label");
    }
  } else if (runnerKind !== "LOCAL") {
    tupleIssues.push("runnerKind must be LOCAL or GITHUB_HOSTED");
  }
  evidence.issues = [...new Set(tupleIssues)];
  evidence.validForPublication = runnerKind === "GITHUB_HOSTED" && evidence.issues.length === 0;
  evidence.status = evidence.validForPublication
    ? "OBSERVED_GITHUB_HOSTED"
    : evidence.browserIdentityValid && runnerKind === "LOCAL"
      ? "OBSERVED_LOCAL"
      : "INVALID";
  return evidence;
}

async function runBrowserAuditShard({
  root,
  browserPath,
  shard,
  timeoutMs = BROWSER_AUDIT_TIMING.wallTimeoutMs,
}) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  if (!BROWSER_AUDIT_SHARDS[shard]) throw new TypeError(`Unknown browser audit shard ${shard}.`);
  const requests = [];
  const server = serveWorkspace(root, requests);
  const profile = await mkdtemp(path.join(root, "audit", `.tmp-browser-audit-${shard}-`));
  let auditResult = null;
  try {
    const evidence = await observeBrowserRunnerEvidence(browserPath);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Audit server did not bind IPv4 loopback.");
    const url = `http://127.0.0.1:${address.port}/audit.html?autorun=1&audit-shard=${encodeURIComponent(shard)}`;
    const args = browserLaunchArgs({ profile, url });
    const run = await spawnBrowser(browserPath, args, {
      profile,
      url,
      timeoutMs,
    });
    const executableSha256AfterRun = await sha256File(browserPath);
    if (executableSha256AfterRun !== evidence.browserExecutableSha256) {
      evidence.issues.push("the browser executable changed while the browser audit was running");
      evidence.browserIdentityValid = false;
      evidence.validForPublication = false;
      evidence.status = "INVALID";
    }
    const completedHtml = run.capture?.html || "";
    const match = completedHtml.match(/<script[^>]+id=["']audit-json["'][^>]*>([\s\S]*?)<\/script>/iu);
    let payload = null;
    let parseError = null;
    if (match) {
      try { payload = JSON.parse(match[1].replace(/&quot;/gu, '"').replace(/&amp;/gu, "&")); }
      catch (error) { parseError = String(error); }
    }
    const payloadValidation = validateBrowserAuditPayload(payload, { shard });
    const complete = Boolean(payloadValidation.valid && payload?.completed);
    const fail = payloadValidation.valid ? payloadValidation.fail : null;
    const skipped = payloadValidation.valid ? payloadValidation.skipped : null;
    const expectedPaths = new Set([
      "/",
      ...AUDIT_SERVED_RELATIVE_PATHS.map((relative) => `/${relative}`),
      "/favicon.ico",
      "/__audit_disconnect__",
    ]);
    const unexpectedRequests = requests.filter((item) => !expectedPaths.has(item.pathname));
    auditResult = {
      status: run.status === 0
        && !run.forcedTermination
        && run.close.requested
        && run.close.error === null
        && payloadValidation.valid
        && complete
        && fail === 0
        && skipped === 0
        && unexpectedRequests.length === 0
        && evidence.browserIdentityValid
        && evidence.status !== "INVALID"
        ? "PASS"
        : "FAIL",
      shard,
      browserPath,
      evidence,
      url,
      process: {
        status: run.status,
        signal: run.signal,
        error: run.error,
        timedOut: run.timedOut,
        forcedTermination: run.forcedTermination,
        close: run.close,
        completion: run.capture?.completion || null,
        debugPort: run.capture?.port || null,
        stderr: run.stderr.slice(-4_000),
      },
      complete,
      parseError,
      payloadValidation: {
        valid: payloadValidation.valid,
        errors: [...payloadValidation.errors],
      },
      results: payloadValidation.valid ? [...payloadValidation.results] : [],
      requests,
      unexpectedRequests,
      dumpTail: complete ? "" : completedHtml.slice(-8_000),
    };
    return auditResult;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
    // Edge's Crashpad helper can briefly retain a dump handle after the headless
    // browser exits on Windows. A leaked profile is a failed audit because all
    // project scratch and evidence must remain under the workspace and clean up.
    try { await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); }
    catch (error) {
      if (auditResult) { auditResult.status = "FAIL"; auditResult.cleanupError = String(error); }
      else throw error;
    }
  }
}

const browserEvidenceIdentity = (evidence) => JSON.stringify({
  browserProductName: evidence?.browserProductName,
  browserFullVersion: evidence?.browserFullVersion,
  browserExecutableSha256: evidence?.browserExecutableSha256,
  requestedRunnerLabel: evidence?.requestedRunnerLabel,
  runnerKind: evidence?.runnerKind,
  runnerImageOS: evidence?.runnerImageOS,
  runnerImageVersion: evidence?.runnerImageVersion,
});

export function canonicalBrowserRequestSignatures(requests, { includeShard = false } = {}) {
  const signatures = new Map();
  for (const request of Array.isArray(requests) ? requests : []) {
    const signature = {
      ...(includeShard ? { shard: request?.shard ?? null } : {}),
      method: request?.method ?? null,
      pathname: request?.pathname ?? null,
    };
    signatures.set(JSON.stringify(signature), signature);
  }
  return [...signatures.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([, signature]) => signature);
}

export function browserShardEvidenceProjection(report) {
  const identity = JSON.parse(browserEvidenceIdentity(report?.evidence || {}));
  for (const key of Object.keys(identity)) identity[key] ??= null;
  return {
    schemaVersion: 1,
    shard: report?.shard ?? null,
    status: report?.status ?? null,
    complete: report?.complete === true,
    identity,
    process: {
      status: report?.process?.status ?? null,
      signal: report?.process?.signal ?? null,
      errorPresent: report?.process?.error != null,
      timedOut: report?.process?.timedOut === true,
      forcedTermination: report?.process?.forcedTermination === true,
      closeRequested: report?.process?.close?.requested === true,
      closeErrorPresent: report?.process?.close?.error != null,
    },
    payload: {
      valid: report?.payloadValidation?.valid === true,
      resultStatuses: [...(report?.results || [])]
        .map((result) => ({ id: result?.id ?? null, status: result?.status ?? null }))
        .sort((left, right) => String(left.id).localeCompare(String(right.id))),
      requestSignatures: canonicalBrowserRequestSignatures(report?.requests),
      unexpectedRequestSignatures: canonicalBrowserRequestSignatures(report?.unexpectedRequests),
      parseErrorPresent: report?.parseError != null,
      cleanupErrorPresent: report?.cleanupError != null,
    },
  };
}

export function aggregateBrowserShardReports(shardReports, { browserPath = null, executionMode = "TEST" } = {}) {
  if (!Array.isArray(shardReports) || shardReports.length !== Object.keys(BROWSER_AUDIT_SHARDS).length) {
    throw new TypeError("Browser aggregation requires exactly one report for every declared shard.");
  }
  const shardNames = shardReports.map((report) => report?.shard);
  if (new Set(shardNames).size !== shardNames.length
    || Object.keys(BROWSER_AUDIT_SHARDS).some((shard) => !shardNames.includes(shard))) {
    throw new TypeError("Browser shard reports are missing, duplicated, or unknown.");
  }
  const shardIntegrity = shardReports.map((report) => {
    const payload = {
      completed: report.complete === true,
      generatedAt: "2000-01-01T00:00:00.000Z",
      shard: report.shard,
      results: report.results || [],
      fail: (report.results || []).filter((result) => result.status === "FAIL").length,
      skipped: 0,
    };
    const payloadCheck = validateBrowserAuditPayload(payload, { shard: report.shard });
    const valid = report.status === "PASS"
      && report.complete === true
      && report.payloadValidation?.valid === true
      && payloadCheck.valid
      && report.parseError === null
      && !report.cleanupError
      && report.evidence?.browserIdentityValid === true
      && report.evidence?.validForPublication === true
      && report.evidence?.status !== "INVALID"
      && report.process?.status === 0
      && report.process?.signal === null
      && report.process?.error === null
      && report.process?.timedOut !== true
      && report.process?.forcedTermination !== true
      && report.process?.close?.requested === true
      && report.process?.close?.error === null;
    return { shard: report.shard, valid, errors: payloadCheck.errors };
  });
  const results = shardReports.flatMap((report) => report.results || []);
  const aggregatePayload = {
    completed: shardReports.every((report) => report.complete === true),
    generatedAt: new Date().toISOString(),
    shard: "all",
    results,
    fail: results.filter((result) => result.status === "FAIL").length,
    skipped: 0,
  };
  const payloadValidation = validateBrowserAuditPayload(aggregatePayload);
  const identitySet = new Set(shardReports.map((report) => browserEvidenceIdentity(report.evidence)));
  const evidence = structuredClone(shardReports[0]?.evidence || {});
  if (identitySet.size !== 1) {
    evidence.issues = [...(evidence.issues || []), "Browser audit shards observed different browser or runner identities."];
    evidence.browserIdentityValid = false;
    evidence.validForPublication = false;
    evidence.status = "INVALID";
  }
  const unexpectedRequests = shardReports.flatMap((report) => (report.unexpectedRequests || []).map((request) => ({ ...request, shard: report.shard })));
  const requests = shardReports.flatMap((report) => (report.requests || []).map((request) => ({ ...request, shard: report.shard })));
  const shardEvidence = shardReports.map((report) => {
    const projection = browserShardEvidenceProjection(report);
    return {
      projection,
      canonicalEvidenceSha256: createHash("sha256").update(JSON.stringify(projection)).digest("hex"),
    };
  });
  const processSummary = {
    status: shardReports.every((report) => report.process?.status === 0) ? 0 : 1,
    signal: shardReports.find((report) => report.process?.signal)?.process?.signal || null,
    error: shardReports.find((report) => report.process?.error)?.process?.error || null,
    timedOut: shardReports.some((report) => report.process?.timedOut === true),
    forcedTermination: shardReports.some((report) => report.process?.forcedTermination === true),
    close: {
      requested: shardReports.every((report) => report.process?.close?.requested === true),
      error: shardReports.find((report) => report.process?.close?.error)?.process?.close?.error || null,
    },
    stderr: shardReports.map((report) => report.process?.stderr || "").filter(Boolean).join("\n").slice(-4_000),
  };
  return {
    status: shardIntegrity.every((item) => item.valid)
      && payloadValidation.valid
      && identitySet.size === 1
      && evidence.browserIdentityValid === true
      && evidence.validForPublication === true
      && evidence.status !== "INVALID"
      && unexpectedRequests.length === 0
      ? "PASS"
      : "FAIL",
    browserPath,
    evidence,
    url: null,
    process: processSummary,
    complete: aggregatePayload.completed && payloadValidation.valid,
    parseError: shardReports.find((report) => report.parseError)?.parseError || null,
    payloadValidation: { valid: payloadValidation.valid, errors: [...payloadValidation.errors] },
    results: payloadValidation.valid ? [...payloadValidation.results] : results,
    requests,
    unexpectedRequests,
    shardEvidence,
    shardIntegrity,
    executionMode,
    dumpTail: shardReports.filter((report) => !report.complete).map((report) => report.dumpTail || "").join("\n").slice(-8_000),
  };
}

export async function runBrowserSmoke({
  root,
  browserPath,
  timeoutMs = BROWSER_AUDIT_TIMING.wallTimeoutMs,
} = {}) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  const shardNames = Object.keys(BROWSER_AUDIT_SHARDS);
  const runOne = (shard) => runBrowserAuditShard({ root, browserPath, shard, timeoutMs });
  const shardReports = process.env.GITHUB_ACTIONS === "true"
    ? await Promise.all(shardNames.map(runOne))
    : await shardNames.reduce(async (promise, shard) => [...await promise, await runOne(shard)], Promise.resolve([]));
  return aggregateBrowserShardReports(shardReports, {
    browserPath,
    executionMode: process.env.GITHUB_ACTIONS === "true" ? "PARALLEL_GITHUB_HOSTED" : "SEQUENTIAL_LOCAL",
  });
}
