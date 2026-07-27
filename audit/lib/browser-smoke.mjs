import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
});

function serveWorkspace(root, requests) {
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
      "sw.js",
      "LICENSE",
      "PRIVACY.md",
      "THIRD_PARTY_NOTICES.md",
      "audit/approved-visual-regression.js",
      "assets/fonts/Inter-Variable.ttf",
      "assets/sounds/tap.wav",
      "assets/sounds/confirm.wav",
      "assets/sounds/incorrect.wav",
      "assets/sounds/close.wav",
      "licenses/Inter-OFL.txt",
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

function spawnBrowser(browserPath, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(browserPath, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ status: null, signal: null, stdout, stderr, error: String(error), timedOut: false }));
    child.on("exit", (status, signal) => finish({ status, signal, stdout, stderr, error: null, timedOut: false }));
    const timer = setTimeout(() => {
      child.kill();
      finish({ status: null, signal: "TIMEOUT", stdout, stderr, error: `Browser exceeded ${timeoutMs} ms`, timedOut: true });
    }, timeoutMs);
  });
}

export async function runBrowserSmoke({ root, browserPath, timeoutMs = 45_000 }) {
  if (!browserPath) return { status: "SKIP", reason: "No installed Edge or Chrome executable was located.", results: [] };
  const requests = [];
  const server = serveWorkspace(root, requests);
  const profile = await mkdtemp(path.join(root, "audit", ".tmp-browser-audit-"));
  let auditResult = null;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Audit server did not bind IPv4 loopback.");
    const url = `http://127.0.0.1:${address.port}/audit.html?autorun=1`;
    const args = [
      "--headless=new", "--disable-gpu", "--disable-gpu-sandbox", "--no-sandbox", "--disable-breakpad", "--disable-dev-shm-usage",
      "--edge-skip-compat-layer-relaunch", "--no-first-run", "--disable-default-apps", "--disable-component-update",
      "--disable-background-networking", "--disable-sync", "--metrics-recording-only", "--safebrowsing-disable-auto-update",
      "--no-pings", "--hide-scrollbars", "--mute-audio", `--user-data-dir=${profile}`,
      "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1", "--virtual-time-budget=20000", "--dump-dom", url,
    ];
    const run = await spawnBrowser(browserPath, args, timeoutMs);
    const match = run.stdout.match(/<script[^>]+id=["']audit-json["'][^>]*>([\s\S]*?)<\/script>/iu);
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
      "/sw.js",
      "/LICENSE",
      "/PRIVACY.md",
      "/THIRD_PARTY_NOTICES.md",
      "/audit/approved-visual-regression.js",
      "/assets/fonts/Inter-Variable.ttf",
      "/assets/sounds/tap.wav",
      "/assets/sounds/confirm.wav",
      "/assets/sounds/incorrect.wav",
      "/assets/sounds/close.wav",
      "/licenses/Inter-OFL.txt",
      "/favicon.ico",
      "/__audit_disconnect__",
    ]);
    const unexpectedRequests = requests.filter((item) => !expectedPaths.has(item.pathname));
    auditResult = {
      status: run.status === 0 && complete && fail === 0 && skipped === 0 && unexpectedRequests.length === 0 ? "PASS" : "FAIL",
      browserPath,
      url,
      process: { status: run.status, signal: run.signal, error: run.error, timedOut: run.timedOut, stderr: run.stderr.slice(-4_000) },
      complete,
      parseError,
      results: payload?.results || [],
      requests,
      unexpectedRequests,
      dumpTail: complete ? "" : run.stdout.slice(-8_000),
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
