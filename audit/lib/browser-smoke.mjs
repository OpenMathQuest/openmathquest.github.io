import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { browserRunnerTupleIssues } from "./browser-runner-evidence.mjs";

const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
});

export const BROWSER_AUDIT_TIMING = Object.freeze({
  inPageWatchdogMs: 2_280_000,
  wallTimeoutMs: 2_400_000,
  workflowTimeoutMinutes: 45,
  requiredWorkflowHeadroomMs: 300_000,
  completionPollIntervalMs: 250,
  browserCloseGraceMs: 10_000,
});

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
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const resolved = path.resolve(root, relative);
    const rootPrefix = `${path.resolve(root)}${path.sep}`;
    const allowed = new Set([
      "audit.html",
      "index.html",
      "manifest.webmanifest",
      "release-shell-v1.json",
      "sw.js",
      "LICENSE",
      "PRIVACY.md",
      "THIRD_PARTY_NOTICES.md",
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
          : "default-src 'self' data: 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'",
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
          expression: "document.documentElement.dataset.auditComplete === 'true'",
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

async function requestBrowserClose(webSocketUrl) {
  if (!webSocketUrl) return { requested: false, error: "The browser CDP endpoint was unavailable." };
  let client;
  try {
    client = await cdpClient(webSocketUrl, { connectionTimeoutMs: 5_000 });
    await client.send("Browser.close");
    return { requested: true, error: null };
  } catch (error) {
    return { requested: true, error: String(error) };
  } finally {
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
    close = await requestBrowserClose(capture.browserWebSocketUrl);
    if (!exitResult) {
      await Promise.race([
        exitPromise,
        waitMs(BROWSER_AUDIT_TIMING.browserCloseGraceMs),
      ]);
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
    await terminateBrowserTree(child);
    await Promise.race([exitPromise, waitMs(BROWSER_AUDIT_TIMING.browserCloseGraceMs)]);
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

export async function runBrowserSmoke({
  root,
  browserPath,
  timeoutMs = BROWSER_AUDIT_TIMING.wallTimeoutMs,
}) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  const requests = [];
  const server = serveWorkspace(root, requests);
  const profile = await mkdtemp(path.join(root, "audit", ".tmp-browser-audit-"));
  let auditResult = null;
  try {
    const evidence = await observeBrowserRunnerEvidence(browserPath);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Audit server did not bind IPv4 loopback.");
    const url = `http://127.0.0.1:${address.port}/audit.html?autorun=1`;
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
    const complete = Boolean(payload && payload.completed);
    const fail = payload ? payload.fail : null;
    const skipped = payload ? payload.skipped : null;
    const expectedPaths = new Set([
      "/",
      "/audit.html",
      "/index.html",
      "/manifest.webmanifest",
      "/release-shell-v1.json",
      "/sw.js",
      "/LICENSE",
      "/PRIVACY.md",
      "/THIRD_PARTY_NOTICES.md",
      "/audit/approved-visual-regression.js",
      "/assets/fonts/Inter-Variable.ttf",
      "/assets/icons/apple-touch-icon.png",
      "/assets/icons/icon-192.png",
      "/assets/icons/icon-512.png",
      "/assets/sounds/tap.wav",
      "/assets/sounds/confirm.wav",
      "/assets/sounds/incorrect.wav",
      "/assets/sounds/close.wav",
      "/licenses/Inter-OFL.txt",
      "/licenses/app-icons.md",
      "/favicon.ico",
      "/__audit_disconnect__",
    ]);
    const unexpectedRequests = requests.filter((item) => !expectedPaths.has(item.pathname));
    auditResult = {
      status: run.status === 0
        && !run.forcedTermination
        && run.close.requested
        && run.close.error === null
        && complete
        && fail === 0
        && skipped === 0
        && unexpectedRequests.length === 0
        && evidence.browserIdentityValid
        && evidence.status !== "INVALID"
        ? "PASS"
        : "FAIL",
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
      results: payload?.results || [],
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
