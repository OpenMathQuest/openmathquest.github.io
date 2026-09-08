import assert from "node:assert/strict";
import {
  execFile as execFileCallback,
  spawn,
} from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  createServer,
} from "node:http";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  promisify,
} from "node:util";
import {
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  canaryChildExitSucceeded,
  canaryRequestHeaderFlags,
  loopbackListenerProbeInvocation,
  observePromiseSettlement,
  safeRuntimePath,
  snapshotSha256,
  trustedTlsInspectionScript,
  waitForExactLoopbackListener,
} from "./trusted-https-canary.mjs";

const execFile = promisify(execFileCallback);

const SHA40 = /^[a-f0-9]{40}$/u;

const SHA64 = /^[a-f0-9]{64}$/u;

const SOURCE_KEY = "math-quest:v2";

const PROTECTED_KEY = "math-quest:progress:v2";

const RETAINED_GUARD_KEY = `${PROTECTED_KEY}:beta1-migration-guard:v1`;

const PROFILE_KEY = "math-quest:child-name:v1";

const BETA1_CACHE = "math-quest-static-v1.0.0-beta.1";

const CANDIDATE_CACHE_PREFIX = "math-quest-static-v1.0.0-beta.9-";

const CANDIDATE_STAGING_SUFFIX = "-staging";

const EXPECTED_BROWSER_PROBE_PATHS = Object.freeze(["/favicon.ico"]);

const EXPECTED_RELEASE_ENTRIES = Object.freeze([
  ["assets/design/math-quest-design-tokens-v1.css", "text/css"],
  ["assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["assets/icons/apple-touch-icon.png", "image/png"],
  ["assets/icons/icon-192.png", "image/png"],
  ["assets/icons/icon-512.png", "image/png"],
  ["assets/js/math-quest-progress-source.js", "text/javascript"],
  ["assets/js/math-quest-pwa-status.js", "text/javascript"],
  ["assets/sounds/close.wav", "audio/wav"],
  ["assets/sounds/confirm.wav", "audio/wav"],
  ["assets/sounds/incorrect.wav", "audio/wav"],
  ["assets/sounds/tap.wav", "audio/wav"],
  ["index.html", "text/html"],
  ["manifest.webmanifest", "application/manifest+json"],
  ["curriculum/math-quest-tutorial-manifest-v1.json", "application/json"],
  ["LICENSE", "application/octet-stream"],
  ["PRIVACY.md", "text/markdown"],
  ["THIRD_PARTY_NOTICES.md", "text/markdown"],
]);

const BETA1_RUNTIME_PATHS = Object.freeze([
  "assets/fonts/Inter-Variable.ttf",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/sounds/close.wav",
  "assets/sounds/confirm.wav",
  "assets/sounds/incorrect.wav",
  "assets/sounds/tap.wav",
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
]);

const MIME = Object.freeze({
  ".css": "text/css",
  ".html": "text/html",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".wav": "audio/wav",
  ".md": "text/markdown",
  ".txt": "text/plain",
});

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) throw new Error(`Invalid argument ${key || ""}.`);
    values[key.slice(2)] = argv[index + 1];
  }
  for (const key of ["candidate", "output", "caddy", "work-root"]) {
    if (!values[key]) throw new Error(`Missing --${key}.`);
  }
  return values;
}

function hashFileBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(filePath) {
  return hashFileBytes(await readFile(filePath));
}

async function run(command, args, options = {}) {
  const result = await execFile(command, args, {
    cwd: options.cwd,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: options.env,
    timeout: options.timeoutMs ?? 60_000,
    killSignal: "SIGKILL",
  });
  return options.encoding === null ? result.stdout : String(result.stdout).trim();
}

async function gitText(args) {
  return run("git", args);
}

async function gitBytes(object) {
  const { stdout } = await execFile("git", ["cat-file", "blob", object], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function exactGitBlob(commit, relativePath) {
  if (!SHA40.test(commit) || !safeRuntimePath(relativePath)) throw new Error("Unsafe Git object request.");
  const tree = await gitText(["ls-tree", commit, "--", relativePath]);
  const match = tree.match(/^100644 blob ([a-f0-9]{40})\t(.+)$/u);
  if (!match || match[2] !== relativePath || tree.includes("\n")) {
    throw new Error(`Runtime path is not one exact regular non-executable Git blob: ${relativePath}`);
  }
  return gitBytes(`${commit}:${relativePath}`);
}

async function materializeSnapshot(commit, relativePaths, destination) {
  const unique = [...new Set(relativePaths)];
  if (unique.length !== relativePaths.length) throw new Error("Runtime snapshot contains a duplicate path.");
  const files = new Map();
  const records = [];
  for (const relativePath of unique) {
    const bytes = await exactGitBlob(commit, relativePath);
    const target = path.join(destination, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const record = Object.freeze({ path: relativePath, sha256: hashFileBytes(bytes), bytes: bytes.byteLength });
    files.set(`/${relativePath}`, Object.freeze({ bytes, mime: contentType(relativePath) }));
    records.push(record);
  }
  return Object.freeze({ files, records: Object.freeze(records), sha256: snapshotSha256(records) });
}

function contentType(relativePath) {
  if (relativePath === "LICENSE") return "application/octet-stream";
  const value = MIME[path.extname(relativePath).toLowerCase()];
  if (!value) throw new Error(`No reviewed MIME type for ${relativePath}.`);
  return value;
}

async function verifySnapshotCommitIdentities(candidateSha) {
  assert.equal(await gitText(["cat-file", "-t", TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT]), "tag");
  assert.equal(await gitText(["rev-parse", `refs/tags/${TRUSTED_HTTPS_CANARY_BETA1_TAG}^{tag}`]), TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT);
  assert.equal(await gitText(["rev-parse", `${TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT}^{}`]), TRUSTED_HTTPS_CANARY_BETA1_COMMIT);
  assert.equal(await gitText(["cat-file", "-t", candidateSha]), "commit");
  assert.equal(await gitText(["rev-parse", "HEAD"]), candidateSha);
  assert.equal((await exactGitBlob(candidateSha, "VERSION")).toString("utf8").trim(), "1.0.0-beta.9");
}

function verifySnapshotManifest(manifest) {
  assert.deepEqual(Object.keys(manifest), ["schemaVersion", "release", "buildId", "cacheName", "entryPath", "excludedPaths", "entries"]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.release, "1.0.0-beta.9");
  assert.equal(manifest.buildId, "math-quest-pwa-v1.0.0-beta.9");
  assert.equal(manifest.cacheName, "math-quest-static-v1.0.0-beta.9");
  assert.equal(manifest.entryPath, "./index.html");
  assert.deepEqual(manifest.excludedPaths, ["./release-shell-v1.json", "./sw.js"]);
  assert.deepEqual(manifest.entries.map((entry) => [entry.path.slice(2), entry.mime]), EXPECTED_RELEASE_ENTRIES);
}

async function verifySnapshotEntries(candidateSha, manifest) {
  for (const entry of manifest.entries) {
    assert.deepEqual(Object.keys(entry), ["path", "sha256", "bytes", "mime", "status"]);
    const relativePath = entry.path.slice(2);
    assert.ok(safeRuntimePath(relativePath));
    assert.match(entry.sha256, SHA64);
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0);
    assert.equal(entry.status, 200);
    const bytes = await exactGitBlob(candidateSha, relativePath);
    assert.equal(bytes.byteLength, entry.bytes, relativePath);
    assert.equal(hashFileBytes(bytes), entry.sha256, relativePath);
  }
}

async function verifyAndMaterializeSnapshots(candidateSha, root) {
  await verifySnapshotCommitIdentities(candidateSha);

  const manifestBytes = await exactGitBlob(candidateSha, "release-shell-v1.json");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  verifySnapshotManifest(manifest);

  await verifySnapshotEntries(candidateSha, manifest);

  const candidatePaths = [...manifest.entries.map((entry) => entry.path.slice(2)), "release-shell-v1.json", "sw.js"];
  const [beta1, candidate] = await Promise.all([
    materializeSnapshot(TRUSTED_HTTPS_CANARY_BETA1_COMMIT, BETA1_RUNTIME_PATHS, path.join(root, "beta1")),
    materializeSnapshot(candidateSha, candidatePaths, path.join(root, "candidate")),
  ]);
  const candidateIndex = candidate.records.find((record) => record.path === "index.html");
  const candidateWorker = candidate.records.find((record) => record.path === "sw.js");
  assert.equal(hashFileBytes(manifestBytes), candidate.records.find((record) => record.path === "release-shell-v1.json")?.sha256);
  assert.ok(candidateIndex && candidateWorker);
  return Object.freeze({
    beta1,
    candidate,
    manifest,
    identity: Object.freeze({
      beta1SnapshotSha256: beta1.sha256,
      candidateSnapshotSha256: candidate.sha256,
      candidateReleaseManifestSha256: hashFileBytes(manifestBytes),
      candidateServiceWorkerSha256: candidateWorker.sha256,
      candidateIndexSha256: candidateIndex.sha256,
    }),
  });
}

function snapshotServerState(snapshot) {
  return { active: snapshot, requests: [] };
}

function observeCanaryBackendRequest(request) {
  let pathname = "INVALID";
  let search = "INVALID";
  let hasCredentials = true;
  try {
    const parsed = new URL(request.url, "http://127.0.0.1");
    pathname = decodeURIComponent(parsed.pathname);
    search = parsed.search;
    hasCredentials = Boolean(parsed.username || parsed.password);
  } catch {
    // Invalid requests fail closed below.
  }
  const contentLength = Number(request.headers["content-length"] || 0);
  const headerFlags = canaryRequestHeaderFlags(request.headers);
  const transferEncoding = request.headers["transfer-encoding"] !== undefined;
  return { pathname, search, hasCredentials, contentLength, headerFlags, transferEncoding };
}

function canaryBackendRequestRejected(request, observation) {
  const { pathname, search, hasCredentials, contentLength, headerFlags, transferEncoding } = observation;
  return !["GET", "HEAD"].includes(request.method) || pathname === "INVALID" || search !== "" || hasCredentials || contentLength !== 0 || headerFlags.sensitiveHeader || transferEncoding;
}

async function startBackend(state, requestedPort = 0) {
  const server = createServer((request, response) => {
    const observation = observeCanaryBackendRequest(request);
    const { pathname, search, hasCredentials, contentLength, headerFlags, transferEncoding } = observation;
    if (canaryBackendRequestRejected(request, observation)) {
      state.requests.push(Object.freeze({ method: String(request.method || ""), pathname, search, hasCredentials, contentLength, transferEncoding, responseStatus: 405, ...headerFlags }));
      response.writeHead(405, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end();
      return;
    }
    const key = pathname === "/" ? "/index.html" : pathname;
    const file = state.active.files.get(key);
    if (!file) {
      state.requests.push(Object.freeze({ method: String(request.method || ""), pathname, search, hasCredentials, contentLength, transferEncoding, responseStatus: 404, ...headerFlags }));
      response.writeHead(404, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end();
      return;
    }
    state.requests.push(Object.freeze({ method: String(request.method || ""), pathname, search, hasCredentials, contentLength, transferEncoding, responseStatus: 200, ...headerFlags }));
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": file.bytes.byteLength,
      "Content-Type": file.mime,
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
      "X-Math-Quest-Canary": "trusted-https-canary-v1",
    });
    response.end(request.method === "HEAD" ? undefined : file.bytes);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Backend did not bind only to IPv4 loopback.");
  return Object.freeze({ server, port: address.port });
}

async function stopServer(server) {
  if (!server?.listening) return true;
  const closePromise = new Promise((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); });
  let result = await observePromiseSettlement(closePromise, 1_000);
  if (!result.settled) {
    server.closeAllConnections?.();
    result = await observePromiseSettlement(closePromise, 5_000);
  }
  if (!result.settled) throw new Error("Canary backend did not close after all connections were terminated.");
  if (result.error) throw result.error;
  return !server.listening;
}

async function reservePort() {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await stopServer(reservation);
  if (!Number.isSafeInteger(port) || port < 1024) throw new Error("Unable to reserve an unprivileged loopback port.");
  return port;
}

function caddyfileText({ port, backendPort, storageRoot, logPath }) {
  const clean = (value) => path.resolve(value).replaceAll("\\", "/").replaceAll('"', '\\"');
  return `{
  admin off
  auto_https disable_redirects
  skip_install_trust
  storage file_system {
    root "${clean(storageRoot)}"
  }
  servers {
    strict_sni_host on
  }
}

https://localhost:${port} {
  bind 127.0.0.1
  tls internal
  reverse_proxy 127.0.0.1:${backendPort}
  log {
    output file "${clean(logPath)}"
    format json
  }
}
`;
}

async function waitFor(predicate, message, timeoutMs = 30_000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

async function findUniqueFile(root, filename) {
  const matches = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(current);
      else if (entry.isFile() && entry.name === filename) matches.push(current);
    }
  }
  await visit(root);
  if (matches.length !== 1) throw new Error(`Expected one ${filename}, found ${matches.length}.`);
  return matches[0];
}

function collectProcessOutput(child) {
  const chunks = [];
  const add = (chunk) => {
    chunks.push(String(chunk));
    while (chunks.join("").length > 16_000) chunks.shift();
  };
  child.stdout?.on("data", add);
  child.stderr?.on("data", add);
  return () => chunks.join("");
}

async function startCaddy({ caddyPath, configPath, port }) {
  const child = spawn(caddyPath, ["run", "--config", configPath, "--adapter", "caddyfile"], {
    cwd: path.dirname(configPath),
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectProcessOutput(child);
  let exited = false;
  child.once("exit", () => { exited = true; });
  await waitFor(async () => {
    if (exited) throw new Error(`Caddy exited before listening: ${output()}`);
    return portAccepting(port);
  }, "Caddy did not open its loopback HTTPS port", 30_000);
  return { child, output };
}

async function stopChild(handle) {
  const child = handle?.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  child.kill();
  const exitPromise = new Promise((resolve) => { child.once("exit", () => resolve(true)); });
  let result = await observePromiseSettlement(exitPromise, 5_000);
  if (!result.settled && child.pid) {
    await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]);
    result = await observePromiseSettlement(exitPromise, 5_000);
  }
  if (!result.settled) throw new Error("Caddy did not exit after its process tree was terminated.");
  return canaryChildExitSucceeded(result);
}

const IMPORT_DISPOSABLE_ROOT_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$path=[IO.Path]::GetFullPath($env:MQ_CANARY_CERT_PATH)",
  "$thumb=$env:MQ_CANARY_CERT_THUMBPRINT",
  "$certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new($path)",
  "if($certificate.Thumbprint -cne $thumb){throw 'Imported root thumbprint did not match the reviewed Caddy root.'}",
  "$store=[Security.Cryptography.X509Certificates.X509Store]::new('Root',[Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)",
  "try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite);$store.Add($certificate)}finally{$store.Close();$certificate.Dispose()}",
  "$verify=[Security.Cryptography.X509Certificates.X509Store]::new('Root',[Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)",
  "try{$verify.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly);$count=@($verify.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$thumb,$false)).Count}finally{$verify.Close()}",
  "if($count -ne 1){throw 'Disposable Caddy root was not installed exactly once.'};$count",
].join("\n");

const REMOVE_DISPOSABLE_ROOT_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$thumb=$env:MQ_CANARY_CERT_THUMBPRINT",
  "$store=[Security.Cryptography.X509Certificates.X509Store]::new('Root',[Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)",
  "try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite);$matches=@($store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$thumb,$false));foreach($certificate in $matches){$store.Remove($certificate)}}finally{$store.Close()}",
  "$verify=[Security.Cryptography.X509Certificates.X509Store]::new('Root',[Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)",
  "try{$verify.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly);@($verify.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$thumb,$false)).Count}finally{$verify.Close()}",
].join("\n");

async function portAccepting(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function assertLoopbackListener(port, pid) {
  const invocation = loopbackListenerProbeInvocation(port);
  await waitForExactLoopbackListener({
    expectedPid: pid,
    probe: async () => {
      const raw = await run(invocation.command, invocation.args, invocation.options);
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value : [value];
    },
  });
}

async function inspectTrustedTls(port) {
  return JSON.parse(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", trustedTlsInspectionScript()], {
    env: { ...process.env, MQ_CANARY_TLS_PORT: String(port) },
    timeoutMs: 30_000,
  }));
}

async function persistCleanupIdentifiers(workRoot, { processIds = [], certificateThumbprint = null, originPort = null } = {}) {
  const safeIds = [...new Set(processIds)].filter((value) => Number.isSafeInteger(value) && value > 0);
  const value = {
    schemaVersion: 1,
    processIds: safeIds,
    certificateThumbprint: certificateThumbprint && /^[A-F0-9]{40}$/u.test(certificateThumbprint) ? certificateThumbprint : null,
    originPort: Number.isSafeInteger(originPort) && originPort >= 1024 && originPort <= 65535 ? originPort : null,
  };
  await writeFile(path.join(workRoot, "cleanup-identifiers-v1.json"), `${JSON.stringify(value)}\n`, "utf8");
}

function emptyChecks() {
  return TRUSTED_HTTPS_CANARY_CHECK_IDS.map((id) => ({ id, status: "NOT_RUN", detail: "Not run because an earlier canary requirement failed." }));
}

function setCheck(checks, id, status, detail) {
  const record = checks.find((item) => item.id === id);
  if (!record) throw new Error(`Unknown canary check ${id}.`);
  record.status = status;
  record.detail = String(detail).replace(/[\r\n\t]+/gu, " ").slice(0, 240) || "No detail recorded.";
}

function maybeInjectFailure(id) {
  const requested = process.env.MQ_CANARY_FAILURE_INJECTION || "";
  if (!requested) return;
  if (process.env.GITHUB_ACTIONS === "true" || process.env.MQ_CANARY_ALLOW_FAILURE_INJECTION !== "focused-test-only") {
    throw new Error("Failure injection is forbidden in hosted evidence runs.");
  }
  if (requested === id) throw new Error(`Focused teardown failure injection at ${id}.`);
}

async function checkedStep(checks, id, action, detail) {
  try {
    maybeInjectFailure(id);
    process.stdout.write(`[canary] START ${id}\n`);
    await action();
    setCheck(checks, id, "PASS", detail);
    process.stdout.write(`[canary] PASS ${id}\n`);
  } catch (error) {
    setCheck(checks, id, "FAIL", String(error?.message || error));
    process.stdout.write(`[canary] FAIL ${id}: ${String(error?.message || error).replace(/[\r\n\t]+/gu, " ").slice(0, 240)}\n`);
    throw error;
  }
}

function projectionFieldCount(value) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + projectionFieldCount(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + projectionFieldCount(item), 0);
  return 1;
}

export {
  SHA40,
  SHA64,
  SOURCE_KEY,
  PROTECTED_KEY,
  RETAINED_GUARD_KEY,
  PROFILE_KEY,
  BETA1_CACHE,
  CANDIDATE_CACHE_PREFIX,
  BETA1_RUNTIME_PATHS,
  parseArguments,
  hashFileBytes,
  hashFile,
  run,
  verifyAndMaterializeSnapshots,
  snapshotServerState,
  startBackend,
  stopServer,
  reservePort,
  caddyfileText,
  waitFor,
  findUniqueFile,
  startCaddy,
  stopChild,
  IMPORT_DISPOSABLE_ROOT_SCRIPT,
  REMOVE_DISPOSABLE_ROOT_SCRIPT,
  portAccepting,
  assertLoopbackListener,
  inspectTrustedTls,
  persistCleanupIdentifiers,
  emptyChecks,
  checkedStep,
  setCheck,
  projectionFieldCount,
  CANDIDATE_STAGING_SUFFIX,
  EXPECTED_BROWSER_PROBE_PATHS,
  contentType,
};
