import { spawn } from "node:child_process";
import { cdpClient } from "./browser-cdp.mjs";
import { runWithCleanup } from "./operation-cleanup.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { browserRunnerTupleIssues } from "./browser-runner-evidence.mjs";
import { PLAYWRIGHT_FOCUSED_SERVER_ROUTES } from "./playwright-focused-contract.mjs";

const TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
});

export const AUDIT_SERVED_RELATIVE_PATHS = Object.freeze([...new Set([
  ...PLAYWRIGHT_FOCUSED_SERVER_ROUTES.map(([, relativePath]) => relativePath),
  "audit.html",
  "audit/approved-visual-regression.js",
  "audit/visual-model-arithmetic.mjs",
  "audit/visual-model-geometry.mjs",
  "audit/visual-model-money.mjs",
  "audit/visual-model-oracle.mjs",
  "audit/visual-model-values.mjs",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
])]);

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

function browserPayloadHeaderErrors(payload, shard, errors) {
  if (!exactObjectKeys(payload, ["completed", "generatedAt", "shard", "results", "fail", "skipped"])) {
    errors.push("The browser payload does not use the closed result schema.");
  }
  browserPayloadShardError(payload, shard, errors);
  if (payload?.completed !== true) errors.push("The browser payload is not marked complete.");
  if (!validBrowserTimestamp(payload?.generatedAt)) errors.push("The browser payload has an invalid generatedAt timestamp.");
  if (!Array.isArray(payload?.results)) errors.push("The browser payload results field is not an array.");
}

function browserPayloadShardError(payload, shard, errors) {
  if (payload?.shard !== shard) errors.push("Browser payload shard " + (payload?.shard || "UNKNOWN") + " does not equal " + shard + ".");
}

function validBrowserTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function browserResultIdentityErrors(result, index, { expected, seen, errors }) {
  if (typeof result.id !== "string" || !expected.has(result.id)) errors.push("Browser result " + index + " has an unknown id.");
  else if (seen.has(result.id)) errors.push("Browser result id " + result.id + " is duplicated.");
  else seen.add(result.id);
}

function browserResultContentErrors(result, index, errors) {
  if (typeof result.title !== "string" || result.title.trim().length === 0) errors.push("Browser result " + index + " has an invalid title.");
  if (typeof result.details !== "string") errors.push("Browser result " + index + " has non-string details.");
  if (!["PASS", "FAIL"].includes(result.status)) errors.push("Browser result " + index + " has an invalid status.");
}

function inspectBrowserResults(results, context) {
  let failed = 0;
  for (const [index, result] of results.entries()) {
    if (!exactObjectKeys(result, ["id", "title", "status", "details"])) {
      context.errors.push("Browser result " + index + " does not use the closed result schema.");
      continue;
    }
    browserResultIdentityErrors(result, index, context);
    browserResultContentErrors(result, index, context.errors);
    if (result.status === "FAIL") failed += 1;
  }
  return failed;
}

function browserPayloadCountErrors(payload, results, expectedIds, { seen, errors, failed }) {
  for (const id of expectedIds || []) {
    if (!seen.has(id)) errors.push("Browser result id " + id + " is missing.");
  }
  const expectedCount = expectedIds?.length || 0;
  if (results.length !== expectedCount) errors.push("Browser result count " + results.length + " does not equal " + expectedCount + ".");
  browserPayloadFailureCountErrors(payload, failed, errors);
}

function browserPayloadFailureCountErrors(payload, failed, errors) {
  if (!Number.isInteger(payload?.fail) || payload.fail !== failed) errors.push("The browser payload fail count does not match its result records.");
  if (payload?.skipped !== 0) errors.push("The browser payload must report exactly zero skipped checks.");
}

export function validateBrowserAuditPayload(payload, { shard = "all" } = {}) {
  const errors = [];
  const expectedIds = shard === "all" ? EXPECTED_BROWSER_RESULT_IDS : BROWSER_AUDIT_SHARDS[shard];
  if (!expectedIds) errors.push("Browser payload requested unknown shard " + shard + ".");
  const expected = new Set(expectedIds || []);
  browserPayloadHeaderErrors(payload, shard, errors);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const seen = new Set();
  const failed = inspectBrowserResults(results, { expected, seen, errors });
  browserPayloadCountErrors(payload, results, expectedIds, { seen, errors, failed });
  return Object.freeze({
    valid: errors.length === 0, errors: Object.freeze(errors), results: Object.freeze(results),
    fail: failed, skipped: payload?.skipped,
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
    await serveAuditFile(resolved, relative, response);
  });
  return server;
}

function waitMs(milliseconds) {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds); });
}

function auditContentSecurityPolicy(relative) {
  if (relative === "audit.html") return "default-src 'self' data: 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'";
  if (relative === "sw.js") return "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";
  return "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'none'; media-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
}

function auditContentType(resolved) {
  return TYPES[path.extname(resolved)] || "application/octet-stream";
}

async function serveAuditFile(resolved, relative, response) {
  try {
    const bytes = await readFile(resolved);
    response.writeHead(200, {
      "Content-Type": auditContentType(resolved), "Cache-Control": "no-store",
      "X-Math-Quest-Audit-Server": "math-quest-audit:v1", "Content-Security-Policy": auditContentSecurityPolicy(relative),
    });
    response.end(bytes);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); response.end(String(error));
  }
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
  validateCompletionOptions(evaluate, timeoutMs, pollIntervalMs);
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

function validateCompletionOptions(evaluate, timeoutMs, pollIntervalMs) {
  if (typeof evaluate !== "function") throw new TypeError("evaluate must be a function.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("The completion timeout must be a positive integer.");
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) throw new TypeError("The completion poll interval must be a positive integer.");
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
      validateDevtoolsPort(port, browserPath);
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

function validateDevtoolsPort(port, browserPath) {
  if (!Number.isInteger(port) || port <= 0 || port > 65_535 || !browserPath?.startsWith("/devtools/browser/")) {
    throw new Error("DevToolsActivePort was malformed.");
  }
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
  const output = observeBrowserChild(child);
  const { exitPromise } = output;

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
  const winner = await Promise.race([capturePromise, exitPromise.then((exit) => ({ kind: "exit", exit })), wallTimeout]);
  clearTimeout(wallTimer);

  const outcome = await settleBrowserWinner(winner, { remainingMs, output, exitPromise, boundedCleanupWait, controller, timeoutMs });
  let forcedTermination = false;
  controller.abort();
  if (!output.exitResult) {
    forcedTermination = true;
    await boundedCleanupWait(terminateBrowserTree(child));
    if (!output.exitResult) await boundedCleanupWait(exitPromise);
  }
  return browserExitReport({ ...output, ...outcome, forcedTermination });
}

async function settleBrowserWinner(winner, { remainingMs, output, exitPromise, boundedCleanupWait, controller, timeoutMs }) {
  let capture = null;
  let timedOut = false;
  let controlError = null;
  let close = { requested: false, error: null };
  if (winner.kind === "capture") {
    capture = winner.capture;
    const closeBudget = Math.min(BROWSER_AUDIT_TIMING.browserCloseGraceMs, remainingMs());
    close = closeBudget > 0
      ? await requestBrowserClose(capture.browserWebSocketUrl, { timeoutMs: closeBudget })
      : { requested: true, error: "Browser.close had no time remaining before the audit deadline." };
    if (!output.exitResult) {
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
  return { capture, timedOut, controlError, close };
}

function observeBrowserChild(child) {
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

  return { exitPromise, get exitResult() { return exitResult; }, get stdout() { return stdout; }, get stderr() { return stderr; } };
}

function browserExitReport({ exitResult, stdout, stderr, controlError, timedOut, forcedTermination, close, capture }) {
  return { status: exitResult?.status ?? null, signal: timedOut ? "TIMEOUT" : (exitResult?.signal ?? null),
    stdout, stderr, error: controlError || exitResult?.error || null, timedOut, forcedTermination, close, capture };
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

function environmentText(environment, key) {
  return String(environment[key] || "") || null;
}

function initialBrowserEvidence(browserPath, environment, browserExecutableSha256) {
  const expectedExecutableSha256 = String(environment.MQ_BROWSER_EXECUTABLE_SHA256 || "");
  const runnerKind = String(environment.MQ_AUDIT_RUNNER_KIND || "LOCAL");
  return {
    schemaVersion: 1, status: "INVALID",
    browserProductName: environmentText(environment, "MQ_BROWSER_PRODUCT_NAME"),
    browserFullVersion: environmentText(environment, "MQ_BROWSER_PRODUCT_VERSION"),
    browserExecutableSha256,
    runnerImageOS: runnerKind === "GITHUB_HOSTED" ? environmentText(environment, "MQ_AUDIT_RUNNER_IMAGE_OS") : null,
    runnerImageVersion: runnerKind === "GITHUB_HOSTED" ? environmentText(environment, "MQ_AUDIT_RUNNER_IMAGE_VERSION") : null,
    runnerKind, requestedRunnerLabel: environmentText(environment, "MQ_AUDIT_RUNNER_LABEL"),
    browserExecutableName: path.basename(browserPath), expectedExecutableSha256: expectedExecutableSha256 || null,
    browserIdentityValid: false, validForPublication: false, issues: [],
  };
}

function browserExecutableIssues(evidence, browserPath) {
  const identityTuple = { ...evidence, runnerImageOS: evidence.runnerImageOS || "local", runnerImageVersion: evidence.runnerImageVersion || "local" };
  const issues = browserRunnerTupleIssues(identityTuple).filter((issue) => !issue.startsWith("runnerImage"));
  if (!/^[a-f0-9]{64}$/u.test(evidence.expectedExecutableSha256 || "")) issues.push("the PowerShell wrapper did not provide a valid executable SHA-256");
  else if (evidence.expectedExecutableSha256 !== evidence.browserExecutableSha256) issues.push("the browser executable SHA-256 changed between wrapper selection and browser launch");
  checkBrowserProduct(evidence, browserPath, issues);
  return issues;
}

function checkBrowserProduct(evidence, browserPath, issues) {
  const executable = path.basename(browserPath).toLowerCase();
  const expected = executable === "msedge.exe" ? "Microsoft Edge" : executable === "chrome.exe" ? "Google Chrome" : null;
  if (!expected || evidence.browserProductName !== expected) issues.push("the browser product name does not match the selected executable");
}

function browserHostingIssues(evidence, issues) {
  if (evidence.runnerKind === "GITHUB_HOSTED") {
    issues.push(...browserRunnerTupleIssues(evidence).filter((issue) => issue.startsWith("runnerImage")));
    if (evidence.requestedRunnerLabel !== "windows-latest") issues.push("the hosted audit must record windows-latest as its requested runner label");
  } else if (evidence.runnerKind !== "LOCAL") issues.push("runnerKind must be LOCAL or GITHUB_HOSTED");
}

export async function observeBrowserRunnerEvidence(browserPath, environment = process.env) {
  const evidence = initialBrowserEvidence(browserPath, environment, await sha256File(browserPath));
  const issues = browserExecutableIssues(evidence, browserPath);
  evidence.browserIdentityValid = issues.length === 0;
  browserHostingIssues(evidence, issues);
  evidence.issues = [...new Set(issues)];
  evidence.validForPublication = evidence.runnerKind === "GITHUB_HOSTED" && evidence.issues.length === 0;
  evidence.status = evidence.validForPublication ? "OBSERVED_GITHUB_HOSTED"
    : evidence.browserIdentityValid && evidence.runnerKind === "LOCAL" ? "OBSERVED_LOCAL" : "INVALID";
  return evidence;
}

async function runBrowserAuditShard({
  root,
  browserPath,
  shard,
  timeoutMs = BROWSER_AUDIT_TIMING.wallTimeoutMs,
}) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  if (!BROWSER_AUDIT_SHARDS[shard]) throw new TypeError("Unknown browser audit shard " + shard + ".");
  const requests = [];
  const server = serveWorkspace(root, requests);
  const profile = await mkdtemp(path.join(root, "audit", ".tmp-browser-audit-" + shard + "-"));
  return runWithCleanup(
    () => collectBrowserShard({ server, profile, browserPath, shard, timeoutMs, requests }),
    (result) => cleanupBrowserShard(server, profile, result),
  );
}

async function cleanupBrowserShard(server, profile, auditResult) {
  if (server.listening) await new Promise((resolve) => { server.close(() => resolve()); });
  // Crashpad may briefly retain a dump handle; the existing bounded retry is
  // retained, and a leaked disposable profile still makes the audit fail.
  try { await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 }); }
  catch (error) {
    if (!auditResult) throw error;
    auditResult.status = "FAIL";
    auditResult.cleanupError = String(error);
  }
}

function validatePostRunExecutable(evidence, executableSha256) {
  if (executableSha256 === evidence.browserExecutableSha256) return;
  evidence.issues.push("the browser executable changed while the browser audit was running");
  evidence.browserIdentityValid = false;
  evidence.validForPublication = false;
  evidence.status = "INVALID";
}

function parseCompletedBrowserHtml(completedHtml) {
  const match = completedHtml.match(/<script[^>]+id=["']audit-json["'][^>]*>([\s\S]*?)<\/script>/iu);
  let payload = null;
  let parseError = null;
  if (match) {
    try { payload = JSON.parse(match[1].replace(/&quot;/gu, '"').replace(/&amp;/gu, "&")); }
    catch (error) { parseError = String(error); }
  }
  return { payload, parseError };
}

function completedBrowserRunValid(run, validation, payload) {
  return run.status === 0 && !run.forcedTermination && run.close.requested
    && run.close.error === null && validation.valid && payload?.completed
    && validation.fail === 0 && validation.skipped === 0;
}

function browserProcessReport(run) {
  return {
    status: run.status, signal: run.signal, error: run.error, timedOut: run.timedOut,
    forcedTermination: run.forcedTermination, close: run.close,
    completion: run.capture?.completion || null, debugPort: run.capture?.port || null,
    stderr: run.stderr.slice(-4_000),
  };
}

function browserShardReport({ run, evidence, requests, shard, browserPath, url }) {
  const completedHtml = run.capture?.html || "";
  const { payload, parseError } = parseCompletedBrowserHtml(completedHtml);
  const payloadValidation = validateBrowserAuditPayload(payload, { shard });
  const complete = Boolean(payloadValidation.valid && payload?.completed);
  const expectedPaths = new Set(["/", ...AUDIT_SERVED_RELATIVE_PATHS.map((relative) => "/" + relative), "/favicon.ico", "/__audit_disconnect__"]);
  const unexpectedRequests = requests.filter((item) => !expectedPaths.has(item.pathname));
  return {
    status: browserShardPassed({ run, payloadValidation, payload, unexpectedRequests, evidence }) ? "PASS" : "FAIL",
    shard, browserPath, evidence, url, process: browserProcessReport(run), complete, parseError,
    payloadValidation: { valid: payloadValidation.valid, errors: [...payloadValidation.errors] },
    results: payloadValidation.valid ? [...payloadValidation.results] : [],
    requests, unexpectedRequests, dumpTail: complete ? "" : completedHtml.slice(-8_000),
  };
}

function browserShardPassed({ run, payloadValidation, payload, unexpectedRequests, evidence }) {
  return completedBrowserRunValid(run, payloadValidation, payload)
    && unexpectedRequests.length === 0 && evidence.browserIdentityValid && evidence.status !== "INVALID";
}

async function collectBrowserShard({ server, profile, browserPath, shard, timeoutMs, requests }) {
  const evidence = await observeBrowserRunnerEvidence(browserPath);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Audit server did not bind IPv4 loopback.");
  const url = "http://127.0.0.1:" + address.port + "/audit.html?autorun=1&audit-shard=" + encodeURIComponent(shard);
  const run = await spawnBrowser(browserPath, browserLaunchArgs({ profile, url }), { profile, url, timeoutMs });
  validatePostRunExecutable(evidence, await sha256File(browserPath));
  return browserShardReport({ run, evidence, requests, shard, browserPath, url });
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

function browserRequestSignature(request, includeShard) {
  return {
    ...(includeShard ? { shard: request?.shard ?? null } : {}),
    method: request?.method ?? null, pathname: request?.pathname ?? null,
  };
}

export function canonicalBrowserRequestSignatures(requests, { includeShard = false } = {}) {
  const signatures = new Map();
  for (const request of Array.isArray(requests) ? requests : []) {
    const signature = browserRequestSignature(request, includeShard);
    signatures.set(JSON.stringify(signature), signature);
  }
  return [...signatures.entries()].sort(([left], [right]) => left.localeCompare(right, "en")).map(([, signature]) => signature);
}

function projectedProcessExit(process) {
  return {
    status: process?.status ?? null, signal: process?.signal ?? null,
    errorPresent: process?.error != null, timedOut: process?.timedOut === true,
    forcedTermination: process?.forcedTermination === true,
  };
}

function projectedProcessClose(close) {
  return { closeRequested: close?.requested === true, closeErrorPresent: close?.error != null };
}

function projectedBrowserPayload(report) {
  return {
    valid: report?.payloadValidation?.valid === true,
    resultStatuses: [...(report?.results || [])]
      .map((result) => ({ id: result?.id ?? null, status: result?.status ?? null }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    requestSignatures: canonicalBrowserRequestSignatures(report?.requests),
    unexpectedRequestSignatures: canonicalBrowserRequestSignatures(report?.unexpectedRequests),
    parseErrorPresent: report?.parseError != null, cleanupErrorPresent: report?.cleanupError != null,
  };
}

export function browserShardEvidenceProjection(report) {
  const identity = projectedBrowserIdentity(report?.evidence || {});
  return {
    schemaVersion: 1, shard: report?.shard ?? null, status: report?.status ?? null,
    complete: report?.complete === true, identity,
    process: projectedBrowserProcess(report?.process),
    payload: projectedBrowserPayload(report),
  };
}

function projectedBrowserIdentity(evidence) {
  const identity = JSON.parse(browserEvidenceIdentity(evidence));
  for (const key of Object.keys(identity)) identity[key] ??= null;
  return identity;
}

function projectedBrowserProcess(process) {
  return { ...projectedProcessExit(process), ...projectedProcessClose(process?.close) };
}

function requireBrowserShardInventory(reports) {
  if (!Array.isArray(reports) || reports.length !== Object.keys(BROWSER_AUDIT_SHARDS).length) {
    throw new TypeError("Browser aggregation requires exactly one report for every declared shard.");
  }
  const names = reports.map((report) => report?.shard);
  if (new Set(names).size !== names.length || Object.keys(BROWSER_AUDIT_SHARDS).some((shard) => !names.includes(shard))) {
    throw new TypeError("Browser shard reports are missing, duplicated, or unknown.");
  }
}

function shardPublicationEvidenceValid(evidence) {
  return evidence?.browserIdentityValid === true && evidence?.validForPublication === true && evidence?.status !== "INVALID";
}

function shardProcessExitValid(process) {
  return process?.status === 0 && process?.signal === null && process?.error === null
    && process?.timedOut !== true && process?.forcedTermination !== true;
}

function shardProcessCloseValid(close) {
  return close?.requested === true && close?.error === null;
}

function inspectShardIntegrity(report) {
  const payload = {
    completed: report.complete === true, generatedAt: "2000-01-01T00:00:00.000Z",
    shard: report.shard, results: report.results || [],
    fail: (report.results || []).filter((result) => result.status === "FAIL").length, skipped: 0,
  };
  const check = validateBrowserAuditPayload(payload, { shard: report.shard });
  const valid = shardResultValid(report, check)
    && shardPublicationEvidenceValid(report.evidence)
    && shardProcessExitValid(report.process) && shardProcessCloseValid(report.process?.close);
  return { shard: report.shard, valid, errors: check.errors };
}

function shardResultValid(report, check) {
  return report.status === "PASS" && report.complete === true && report.payloadValidation?.valid === true
    && check.valid && report.parseError === null && !report.cleanupError;
}

function aggregateBrowserEvidence(shardReports) {
  const identitySet = new Set(shardReports.map((report) => browserEvidenceIdentity(report.evidence)));
  const evidence = structuredClone(shardReports[0]?.evidence || {});
  if (identitySet.size !== 1) {
    evidence.issues = [...(evidence.issues || []), "Browser audit shards observed different browser or runner identities."];
    evidence.browserIdentityValid = false;
    evidence.validForPublication = false;
    evidence.status = "INVALID";
  }
  return { identitySet, evidence };
}

function firstShardProcessValue(reports, field) {
  return reports.find((report) => report.process?.[field])?.process?.[field] || null;
}

function aggregateProcessClose(reports) {
  return {
    requested: reports.every((report) => report.process?.close?.requested === true),
    error: reports.find((report) => report.process?.close?.error)?.process?.close?.error || null,
  };
}

function aggregateBrowserProcesses(reports) {
  return {
    status: reports.every((report) => report.process?.status === 0) ? 0 : 1,
    signal: firstShardProcessValue(reports, "signal"), error: firstShardProcessValue(reports, "error"),
    timedOut: reports.some((report) => report.process?.timedOut === true),
    forcedTermination: reports.some((report) => report.process?.forcedTermination === true),
    close: aggregateProcessClose(reports),
    stderr: reports.map((report) => report.process?.stderr || "").filter(Boolean).join("\n").slice(-4_000),
  };
}

function aggregateShardRequests(reports, field) {
  return reports.flatMap((report) => (report[field] || []).map((request) => ({ ...request, shard: report.shard })));
}

function shardEvidenceRecord(report) {
  const projection = browserShardEvidenceProjection(report);
  return { projection, canonicalEvidenceSha256: createHash("sha256").update(JSON.stringify(projection)).digest("hex") };
}

export function aggregateBrowserShardReports(shardReports, { browserPath = null, executionMode = "TEST" } = {}) {
  requireBrowserShardInventory(shardReports);
  const shardIntegrity = shardReports.map(inspectShardIntegrity);
  const results = shardReports.flatMap((report) => report.results || []);
  const payload = {
    completed: shardReports.every((report) => report.complete === true), generatedAt: new Date().toISOString(),
    shard: "all", results, fail: results.filter((result) => result.status === "FAIL").length, skipped: 0,
  };
  const payloadValidation = validateBrowserAuditPayload(payload);
  const { identitySet, evidence } = aggregateBrowserEvidence(shardReports);
  const unexpectedRequests = aggregateShardRequests(shardReports, "unexpectedRequests");
  return {
    status: aggregateBrowserPassed({ shardIntegrity, payloadValidation, identitySet, evidence, unexpectedRequests }) ? "PASS" : "FAIL",
    browserPath, evidence, url: null, process: aggregateBrowserProcesses(shardReports),
    complete: payload.completed && payloadValidation.valid,
    parseError: shardReports.find((report) => report.parseError)?.parseError || null,
    payloadValidation: { valid: payloadValidation.valid, errors: [...payloadValidation.errors] },
    results: payloadValidation.valid ? [...payloadValidation.results] : results,
    requests: aggregateShardRequests(shardReports, "requests"), unexpectedRequests,
    shardEvidence: shardReports.map(shardEvidenceRecord), shardIntegrity, executionMode,
    dumpTail: shardReports.filter((report) => !report.complete).map((report) => report.dumpTail || "").join("\n").slice(-8_000),
  };
}

function aggregateBrowserPassed({ shardIntegrity, payloadValidation, identitySet, evidence, unexpectedRequests }) {
  return shardIntegrity.every((item) => item.valid) && payloadValidation.valid && identitySet.size === 1
    && shardPublicationEvidenceValid(evidence) && unexpectedRequests.length === 0;
}

export async function runBrowserSmoke({
  root,
  browserPath,
  timeoutMs = BROWSER_AUDIT_TIMING.wallTimeoutMs,
} = {}) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  const shardNames = Object.keys(BROWSER_AUDIT_SHARDS);
  const runOne = (shard) => runBrowserAuditShard({ root, browserPath, shard, timeoutMs });
  const maximumConcurrent = browserShardMaximumFromEnvironment(process.env, shardNames.length);
  const shardReports = await runBrowserShardTasks(shardNames, runOne, maximumConcurrent);
  return aggregateBrowserShardReports(shardReports, {
    browserPath,
    executionMode: process.env.GITHUB_ACTIONS === "true" ? "SHARDED_GITHUB_HOSTED" : "SEQUENTIAL_LOCAL",
  });
}

export function browserShardMaximumFromEnvironment(environment = process.env, shardCount = Object.keys(BROWSER_AUDIT_SHARDS).length) {
  const fallback = environment.GITHUB_ACTIONS === "true" ? shardCount : 1;
  const raw = environment.MQ_BROWSER_SHARD_MAXIMUM;
  const maximum = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > shardCount) {
    throw new RangeError(`Browser shard maximum must be an integer from 1 through ${shardCount}.`);
  }
  return maximum;
}

export async function runBrowserShardTasks(shardNames, runOne, maximumConcurrent) {
  if (!Array.isArray(shardNames) || shardNames.length === 0 || typeof runOne !== "function") {
    throw new TypeError("Browser shard tasks require a non-empty shard list and runner.");
  }
  if (!Number.isSafeInteger(maximumConcurrent) || maximumConcurrent <= 0 || maximumConcurrent > shardNames.length) {
    throw new RangeError("Browser shard task concurrency is invalid.");
  }
  const reports = new Array(shardNames.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= shardNames.length) return;
      reports[index] = await runOne(shardNames[index]);
    }
  };
  await Promise.all(Array.from({ length: maximumConcurrent }, worker));
  return reports;
}
