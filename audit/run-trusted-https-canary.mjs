import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { createServer } from "node:http";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";
import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  activateCanaryHomeUpdate,
  beta1GradedSelectionAnswer,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  LOOPBACK_LISTENER_QUERY_SCRIPT,
  PLAYWRIGHT_CORE_SRI,
  PLAYWRIGHT_CORE_VERSION,
  RETAINED_BETA1_COMPLETE_VALUE,
  RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  TRUSTED_HTTPS_CANARY_KIND,
  TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
  TRUSTED_HTTPS_CANARY_STATUS,
  TRUSTED_HTTPS_CANARY_TAG,
  TRUSTED_HTTPS_CANARY_WORKFLOW,
  canonicalCanaryEvidence,
  canaryWorkspaceRemovalAllowed,
  canaryChildExitSucceeded,
  canaryBackendRequestViolation,
  canaryRequestHeaderFlags,
  canonicalCertificateThumbprint,
  captureCanaryObservation,
  canaryBrowserArguments,
  canaryWaitingCacheReady,
  exactCandidateCacheObservation,
  loopbackListenerProbeInvocation,
  observePromiseSettlement,
  openCanaryInstallHelp,
  observeCanaryRetainedFreshStartNotice,
  reloadCanaryCandidateFromBeta1,
  profileProcessSetSha256,
  recoverAndDrainOperation,
  runCanaryTeardown,
  safeRuntimePath,
  sha256Bytes,
  snapshotSha256,
  trustedTlsInspectionScript,
  validateCanaryBrowserArguments,
  validateCanaryBrowserTlsSecurity,
  validateCanaryRootScopeProof,
  waitForCanaryHomeUpdate,
  waitForExactLoopbackListener,
} from "./lib/trusted-https-canary.mjs";

const execFile = promisify(execFileCallback);
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA64 = /^[a-f0-9]{64}$/u;
const SOURCE_KEY = "math-quest:v2";
const PROTECTED_KEY = "math-quest:progress:v2";
const RETAINED_GUARD_KEY = `${PROTECTED_KEY}:beta1-migration-guard:v1`;
const PROFILE_KEY = "math-quest:child-name:v1";
const BETA1_CACHE = "math-quest-static-v1.0.0-beta.1";
const CANDIDATE_CACHE_PREFIX = "math-quest-static-v1.0.0-beta.6-";
const CANDIDATE_STAGING_SUFFIX = "-staging";
const EXPECTED_BROWSER_PROBE_PATHS = Object.freeze(["/favicon.ico"]);
const EXPECTED_RELEASE_ENTRIES = Object.freeze([
  ["assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["assets/icons/apple-touch-icon.png", "image/png"],
  ["assets/icons/icon-192.png", "image/png"],
  ["assets/icons/icon-512.png", "image/png"],
  ["assets/sounds/close.wav", "audio/wav"],
  ["assets/sounds/confirm.wav", "audio/wav"],
  ["assets/sounds/incorrect.wav", "audio/wav"],
  ["assets/sounds/tap.wav", "audio/wav"],
  ["index.html", "text/html"],
  ["manifest.webmanifest", "application/manifest+json"],
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

async function verifyAndMaterializeSnapshots(candidateSha, root) {
  assert.equal(await gitText(["cat-file", "-t", TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT]), "tag");
  assert.equal(await gitText(["rev-parse", `refs/tags/${TRUSTED_HTTPS_CANARY_BETA1_TAG}^{tag}`]), TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT);
  assert.equal(await gitText(["rev-parse", `${TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT}^{}`]), TRUSTED_HTTPS_CANARY_BETA1_COMMIT);
  assert.equal(await gitText(["cat-file", "-t", candidateSha]), "commit");
  assert.equal(await gitText(["rev-parse", "HEAD"]), candidateSha);
  assert.equal((await exactGitBlob(candidateSha, "VERSION")).toString("utf8").trim(), "1.0.0-beta.6");

  const manifestBytes = await exactGitBlob(candidateSha, "release-shell-v1.json");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.deepEqual(Object.keys(manifest), ["schemaVersion", "release", "buildId", "cacheName", "entryPath", "excludedPaths", "entries"]);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.release, "1.0.0-beta.6");
  assert.equal(manifest.buildId, "math-quest-pwa-v1.0.0-beta.6");
  assert.equal(manifest.cacheName, "math-quest-static-v1.0.0-beta.6");
  assert.equal(manifest.entryPath, "./index.html");
  assert.deepEqual(manifest.excludedPaths, ["./release-shell-v1.json", "./sw.js"]);
  assert.deepEqual(manifest.entries.map((entry) => [entry.path.slice(2), entry.mime]), EXPECTED_RELEASE_ENTRIES);

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

async function startBackend(state, requestedPort = 0) {
  const server = createServer((request, response) => {
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
    if (!["GET", "HEAD"].includes(request.method) || pathname === "INVALID" || search !== "" || hasCredentials || contentLength !== 0 || headerFlags.sensitiveHeader || transferEncoding) {
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
  const closePromise = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
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
  const exitPromise = new Promise((resolve) => child.once("exit", () => resolve(true)));
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

function projectionFieldCount(value) {
  if (Array.isArray(value)) return value.reduce((total, item) => total + projectionFieldCount(item), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((total, item) => total + projectionFieldCount(item), 0);
  return 1;
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
    if (!worker) return reject(new Error("No active service-worker controller."));
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

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const candidateSha = String(args.candidate);
  const outputPath = path.resolve(args.output);
  const caddyPath = path.resolve(args.caddy);
  const workRoot = path.resolve(args["work-root"]);
  const checks = emptyChecks();
  const cleanup = [];
  const cleanupFlags = {
    browserClosed: false,
    caddyStopped: false,
    backendStopped: false,
    certificateRemoved: false,
    profileRemoved: false,
    temporaryFilesRemoved: false,
    portClosed: false,
  };
  let failure = null;
  let snapshots = null;
  let backendState = null;
  let backend = null;
  let caddy = null;
  let context = null;
  let networkContext = null;
  let certificateThumbprint = null;
  let rootCertificate = null;
  let originPort = 0;
  let tls = null;
  let sourceBytes = null;
  let protectedBytes = null;
  let browserVersion = null;
  let edgePath = null;
  let edgeSha256 = null;
  let caddyExecutableSha256 = null;
  const browserRequests = [];
  const requestTrackers = [];
  let networkProof = null;
  let waitingCacheProof = null;
  let activeCacheProof = null;
  let offlineCacheProof = null;
  let repairedCacheProof = null;
  let retiredSourceProjection = null;
  let freshProtectedProjection = null;
  let retainedFreshStartNoticeSha256 = null;
  let expectedFreshBytes = null;
  let privacySummary = null;
  let offlineProof = null;
  const candidateMainFrameNavigations = [];
  const beta1MainFrameNavigations = [];
  let expectedCandidateReloadUrl = null;
  let initialCandidateUrlSha256 = null;
  let remainingMatchingCertificateCount = null;
  let observedProfileProcessCount = null;
  let observedProfileProcessSetSha256 = null;
  let remainingProfileProcessCount = null;
  let remainingProfileProcessSetSha256 = null;

  if (!SHA40.test(candidateSha)) throw new Error("Candidate SHA must be 40 lowercase hexadecimal characters.");
  if (process.platform !== "win32") throw new Error("The trusted-HTTPS canary runs only on disposable hosted Windows.");
  if (process.env.GITHUB_REPOSITORY !== "OpenMathQuest/openmathquest.github.io"
      || process.env.GITHUB_REF !== "refs/heads/main"
      || process.env.GITHUB_SHA !== candidateSha
      || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
      || !process.env.ImageOS
      || !process.env.ImageVersion) {
    throw new Error("Canary boundary requires the exact public protected-main SHA on GitHub-hosted Windows.");
  }
  assert.equal(process.env.MQ_CADDY_ARCHIVE_SHA256, CADDY_ARCHIVE_SHA256);
  assert.equal(process.env.MQ_CADDY_ARCHIVE_SHA512, CADDY_ARCHIVE_SHA512);
  await mkdir(workRoot, { recursive: true });

  cleanup.push({ id: "temporary-files", run: async () => {
    if (!canaryWorkspaceRemovalAllowed(remainingProfileProcessCount)) return false;
    await rm(workRoot, { recursive: true, force: true });
    try {
      await stat(workRoot);
      cleanupFlags.temporaryFilesRemoved = false;
    } catch {
      cleanupFlags.temporaryFilesRemoved = true;
    }
    return cleanupFlags.temporaryFilesRemoved;
  } });
  const profilePath = path.join(workRoot, "edge-profile");
  cleanup.push({ id: "profile", run: async () => {
    if (!canaryWorkspaceRemovalAllowed(remainingProfileProcessCount)) return false;
    await rm(profilePath, { recursive: true, force: true });
    try {
      await stat(profilePath);
      cleanupFlags.profileRemoved = false;
    } catch {
      cleanupFlags.profileRemoved = true;
    }
    return cleanupFlags.profileRemoved;
  } });
  cleanup.push({ id: "certificate", run: async () => {
    if (certificateThumbprint) {
      const count = Number(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", REMOVE_DISPOSABLE_ROOT_SCRIPT], {
        env: { ...process.env, MQ_CANARY_CERT_THUMBPRINT: certificateThumbprint },
        timeoutMs: 30_000,
      }));
      remainingMatchingCertificateCount = count;
      cleanupFlags.certificateRemoved = count === 0;
    } else {
      remainingMatchingCertificateCount = null;
      cleanupFlags.certificateRemoved = false;
    }
    return cleanupFlags.certificateRemoved;
  } });
  cleanup.push({ id: "backend", run: async () => {
    cleanupFlags.backendStopped = await stopServer(backend?.server);
    backend = null;
    return cleanupFlags.backendStopped;
  } });
  cleanup.push({ id: "caddy", run: async () => {
    cleanupFlags.caddyStopped = await stopChild(caddy);
    caddy = null;
    cleanupFlags.portClosed = originPort ? !await portAccepting(originPort) : true;
    return cleanupFlags.caddyStopped && cleanupFlags.portClosed;
  } });
  cleanup.push({ id: "browser", run: async () => {
    if (networkContext) await closeAuxiliaryContext(networkContext, context, profilePath);
    networkContext = null;
    if (context) await closePersistentContext(context, profilePath);
    context = null;
    let lastRows = await profileBoundEdgeProcesses(profilePath);
    try {
      await waitFor(async () => {
        lastRows = await profileBoundEdgeProcesses(profilePath);
        return lastRows.length === 0;
      }, "Edge processes retained the disposable canary profile after Playwright close", 10_000, 200);
    } catch {
      const lingering = await profileProcessIdentityRecords(lastRows);
      remainingProfileProcessCount = lingering.length;
      remainingProfileProcessSetSha256 = profileProcessSetSha256(lingering);
      cleanupFlags.browserClosed = false;
      return false;
    }
    remainingProfileProcessCount = 0;
    remainingProfileProcessSetSha256 = EMPTY_PROFILE_PROCESS_SET_SHA256;
    cleanupFlags.browserClosed = true;
    return true;
  } });

  try {
    await checkedStep(checks, "BETA1_TAG_AND_RUNTIME_IDENTITY", async () => {
      snapshots = await verifyAndMaterializeSnapshots(candidateSha, path.join(workRoot, "snapshots"));
    }, "Immutable Beta 1 and frozen-candidate runtime blobs matched their closed Git identities.");

    const caddyVersionOutput = await run(caddyPath, ["version"]);
    assert.match(caddyVersionOutput, new RegExp(`^v${CADDY_VERSION.replaceAll(".", "\\.")}(?:\\s|$)`, "u"));
    caddyExecutableSha256 = await hashFile(caddyPath);
    edgePath = await findEdgeExecutable();
    edgeSha256 = await hashFile(edgePath);
    const playwrightPackage = JSON.parse(await readFile(path.join(process.cwd(), "node_modules", "playwright-core", "package.json"), "utf8"));
    assert.equal(playwrightPackage.version, PLAYWRIGHT_CORE_VERSION);
    assert.equal(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent());if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Hosted canary requires the disposable Windows administrator boundary.'};'ADMINISTRATOR'"], { timeoutMs: 15_000 }), "ADMINISTRATOR");

    backendState = snapshotServerState(snapshots.beta1);
    backend = await startBackend(backendState);
    originPort = await reservePort();
    const caddyStorage = path.join(workRoot, "caddy-storage");
    const caddyLog = path.join(workRoot, "caddy-access.jsonl");
    const caddyConfig = path.join(workRoot, "Caddyfile");
    await mkdir(caddyStorage, { recursive: true });
    await writeFile(caddyConfig, caddyfileText({ port: originPort, backendPort: backend.port, storageRoot: caddyStorage, logPath: caddyLog }), "utf8");
    caddy = await startCaddy({ caddyPath, configPath: caddyConfig, port: originPort });
    await persistCleanupIdentifiers(workRoot, { processIds: [caddy.child.pid], originPort });
    await assertLoopbackListener(originPort, caddy.child.pid);

    const rootPath = await waitFor(() => findUniqueFile(caddyStorage, "root.crt").catch(() => null), "Caddy did not create one disposable local root certificate");
    rootCertificate = new X509Certificate(await readFile(rootPath));
    certificateThumbprint = rootCertificate.fingerprint.replaceAll(":", "");
    await persistCleanupIdentifiers(workRoot, { processIds: [caddy.child.pid], certificateThumbprint, originPort });
    assert.equal(Number(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", IMPORT_DISPOSABLE_ROOT_SCRIPT], {
      env: { ...process.env, MQ_CANARY_CERT_PATH: rootPath, MQ_CANARY_CERT_THUMBPRINT: certificateThumbprint },
      timeoutMs: 30_000,
    })), 1);
    tls = await inspectTrustedTls(originPort);
    assert.equal(tls.subjectName, "localhost");
    assert.match(tls.issuer, /Caddy Local Authority/iu);
    assert.match(tls.sha256, SHA64);
    assert.ok(["Tls12", "Tls13"].includes(tls.protocol));

    const origin = `https://localhost:${originPort}/`;
    const browserArgs = canaryBrowserArguments(profilePath);
    const argumentReview = validateCanaryBrowserArguments(browserArgs);
    assert.equal(argumentReview.valid, true, argumentReview.issues.join("; "));
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: edgePath,
      headless: true,
      args: browserArgs,
      serviceWorkers: "allow",
      viewport: { width: 1280, height: 800 },
      timeout: 30_000,
    });
    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(30_000);
    const observedProfileProcesses = await waitFor(async () => {
      const rows = await profileBoundEdgeProcesses(profilePath);
      return rows.length ? rows : null;
    }, "The exact disposable Edge profile had no independently observable process", 10_000);
    const observedProfileIdentities = await profileProcessIdentityRecords(observedProfileProcesses);
    assert.ok(observedProfileIdentities.every((record) => record.executableSha256 === edgeSha256));
    observedProfileProcessCount = observedProfileIdentities.length;
    observedProfileProcessSetSha256 = profileProcessSetSha256(observedProfileIdentities);
    requestTrackers.push(await trackRequests(context, browserRequests, context, profilePath));
    browserVersion = context.browser()?.version() || null;
    assert.match(String(browserVersion), /^\d+\.\d+\.\d+\.\d+$/u);
    const beta1Page = context.pages()[0] || await boundedBrowserOperation(context.newPage(), context, profilePath, "Playwright Beta 1 page creation");
    let retainedBeta1Page = null;
    const firstResponse = await beta1Page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await checkedStep(checks, "HTTPS_TRUSTED_NO_BYPASS", async () => {
      assert.equal(firstResponse?.status(), 200);
      const security = await boundedBrowserOperation(firstResponse.securityDetails(), context, profilePath, "Playwright TLS security-details observation");
      const tlsSecurity = validateCanaryBrowserTlsSecurity(security, tls);
      assert.equal(tlsSecurity.valid, true, tlsSecurity.issues.join("; "));
      assert.equal(validateCanaryBrowserArguments(browserArgs).valid, true);
    }, "Edge trusted Caddy's disposable localhost certificate with no insecure browser flags.");

    await checkedStep(checks, "ROOT_SCOPE_EXACT", async () => {
      const manifestRecord = snapshots.beta1.files.get("/manifest.webmanifest");
      assert.ok(manifestRecord);
      const manifest = JSON.parse(manifestRecord.bytes.toString("utf8"));
      const scope = await boundedPageEvaluate(beta1Page, context, profilePath, async () => {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        const registration = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Beta 1 service-worker readiness timed out.")), 20_000);
          navigator.serviceWorker.ready.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
          );
        });
        return { manifestHref: manifestLink?.href || "", workerScope: registration.scope };
      });
      const scopeProof = validateCanaryRootScopeProof({ manifest, ...scope, origin });
      assert.equal(scopeProof.valid, true, scopeProof.issues.join("; "));
    }, "Manifest and service-worker scope remained the exact same-origin root scope.");

    await checkedStep(checks, "BETA1_INSTALL_CACHE_COMPLETE", async () => {
      await beta1Page.waitForFunction(async (cacheName) => {
        const names = await caches.keys();
        return Boolean(navigator.serviceWorker.controller) && names.includes(cacheName);
      }, BETA1_CACHE, { timeout: 30_000 });
      const cached = await boundedPageEvaluate(beta1Page, context, profilePath, async (cacheName) => {
        const cache = await caches.open(cacheName);
        return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
      }, BETA1_CACHE);
      for (const required of ["/", ...BETA1_RUNTIME_PATHS.filter((item) => item !== "sw.js").map((item) => `/${item}`)]) assert.ok(cached.includes(required), required);
    }, "Beta 1 installed its complete historical offline cache before the update began.");

    await checkedStep(checks, "BETA1_SYNTHETIC_STATE_SEEDED", async () => {
      await beta1Page.locator('[data-action="name-skip"]').click();
      const seeded = await boundedPageEvaluate(beta1Page, context, profilePath, ({ sourceKey, profileKey, selectionAnswerSource }) => {
        const E = MathQuestEngine;
        const gradedSelectionAnswer = (0, eval)(`(${selectionAnswerSource})`);
        let state = E.createInitialState(30_000);
        state.earnedLevel = 2;
        state.settings.grownUpPracticeCap = 17;
        state.settings.grownUpSoftTimeCapMs = 600_000;
        state.settings.speechRate = 0.9;
        state.settings.soundVolume = 0.4;
        state.seed = 2_147_483_647;
        const skill = E.SKILLS[0];
        let lastAttempt = null;
        for (let index = 0; index < 3; index += 1) {
          const question = E.makeQuestion({ skillId: skill.skillId, tier: index === 2 ? "HARD/TARGET" : "EASY", representation: "PICTORIAL", seed: 314159, ordinal: 2 + index, scheduledReview: index > 0, coldTest: true, theme: "forest" });
          const answer = question.inputClass === "SELECTION"
            ? gradedSelectionAnswer(question, E.gradeAnswer)
            : String(question.answer.value);
          const attempt = E.submitAnswer(question, answer, { promptFinishedAt: 1_000, submittedAt: 5_000 + index * 100, manipulationMs: 250, replayMs: 100, idleMs: 50 + index, hintUsed: false, selectionEvents: [], modelUsed: true, sessionId: "synthetic-beta1-session", playDay: 30_000 });
          if (!attempt.firstAnswerCorrect || !attempt.validTelemetry) throw new Error("Synthetic Beta 1 attempt was not a valid clean witness.");
          state = E.applyAttempt(state, attempt).state;
          lastAttempt = attempt;
        }
        state.feedbackHistory.push({ stage: lastAttempt.stage, branch: lastAttempt.feedbackClass, line: "Synthetic feedback preservation witness.", sessionId: lastAttempt.sessionId });
        state = E.completeSession(state, { sessionId: lastAttempt.sessionId, playDay: 30_000, level: 1, servedPracticeCount: 3, classifications: ["SYNTHETIC_CANARY"], endedReason: "NATURAL", overrunMs: 0, overrunCauses: [] });
        const projection = ({ schemaVersion: _schemaVersion, ...legacy }) => legacy;
        const bytes = E.exportState(state);
        localStorage.setItem(sourceKey, bytes);
        localStorage.setItem(profileKey, JSON.stringify({ schemaVersion: 1, mode: "anonymous", name: "" }));
        return { bytes, projection: projection(JSON.parse(bytes)) };
      }, { sourceKey: SOURCE_KEY, profileKey: PROFILE_KEY, selectionAnswerSource: beta1GradedSelectionAnswer.toString() });
      sourceBytes = seeded.bytes;
      retiredSourceProjection = seeded.projection;
      const source = JSON.parse(sourceBytes);
      assert.equal(source.schemaVersion, 2);
      assert.equal(source.earnedLevel, 2);
      assert.equal(source.practiceCountByDay["30000"], 3);
      assert.equal(source.sessionLog.length, 1);
      assert.equal(source.feedbackHistory.length, 1);
      assert.equal(Object.values(source.skills)[0]?.evidence?.length, 3);
      const profile = JSON.parse(await boundedPageEvaluate(beta1Page, context, profilePath, (key) => localStorage.getItem(key), PROFILE_KEY));
      assert.deepEqual(profile, { schemaVersion: 1, mode: "anonymous", name: "" });
    }, "A valid anonymous Beta 1 save with distinctive settings, skill evidence, spacing, daily count, feedback, session log, cold window, latency, and seed fields was stored locally.");

    await checkedStep(checks, "BETA1_OFFLINE_RELOAD", async () => {
      await boundedBrowserOperation(context.setOffline(true), context, profilePath, "Playwright offline-mode activation");
      await beta1Page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
      assert.equal(await boundedBrowserOperation(beta1Page.title(), context, profilePath, "Playwright document-title observation"), "Math Quest");
      assert.equal(await boundedPageEvaluate(beta1Page, context, profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.1");
      await boundedBrowserOperation(context.setOffline(false), context, profilePath, "Playwright offline-mode release");
      retainedBeta1Page = await boundedBrowserOperation(context.newPage(), context, profilePath, "Playwright retained Beta 1 page creation");
      await retainedBeta1Page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await retainedBeta1Page.waitForFunction(() => globalThis.MathQuestEngine?.CONSTANTS?.PRODUCT_VERSION === "1.0.0-beta.1", null, { timeout: 30_000 });
    }, "Beta 1 reloaded from its installed cache while Playwright network emulation was offline.");

    await checkedStep(checks, "SAME_ORIGIN_RUNTIME_SWITCH", async () => {
      backendState.active = snapshots.candidate;
      assert.equal(beta1Page.url().startsWith(origin), true);
      networkContext = await boundedBrowserOperation(context.browser().newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } }), context, profilePath, "Playwright auxiliary context creation");
      networkContext.setDefaultTimeout(30_000);
      networkContext.setDefaultNavigationTimeout(30_000);
      requestTrackers.push(await trackRequests(networkContext, browserRequests, context, profilePath));
      networkProof = await verifyDetachedHttpsResponses({ origin, context: networkContext, snapshots, persistentContext: context, profilePath });
      await closeAuxiliaryContext(networkContext, context, profilePath);
      networkContext = null;
    }, "The backend atomically switched Beta 1 to Beta 6 without changing scheme, host, port, or scope.");

    const candidatePage = await boundedBrowserOperation(
      reloadCanaryCandidateFromBeta1(beta1Page, "1.0.0-beta.6"),
      context,
      profilePath,
      "Playwright same-tab Beta 1 to Beta 6 candidate transition",
    );

    await checkedStep(checks, "CANDIDATE_WAITING_CACHE_READY", async () => {
      const expectedCacheName = `${snapshots.manifest.cacheName}-${snapshots.identity.candidateReleaseManifestSha256}`;
      await candidatePage.waitForFunction(canaryWaitingCacheReady, {
        expectedCacheName,
        allowedCacheNames: [BETA1_CACHE, expectedCacheName],
        stableMs: 750,
      }, { timeout: 40_000, polling: 100 });
      waitingCacheProof = await inspectExactCandidateCache(candidatePage, snapshots, { allowBeta1: true, persistentContext: context, profilePath });
      const retainedNotice = await observeCanaryRetainedFreshStartNotice(candidatePage);
      retainedFreshStartNoticeSha256 = sha256Bytes(retainedNotice);
      assert.equal(retainedFreshStartNoticeSha256, RETAINED_BETA1_FRESH_START_NOTICE_SHA256);
    }, "The original Beta 1 page deliberately reloaded into the exact Beta 6 candidate, visibly explained the fresh start to the grown-up, acquired the modern writer lease, reached Home, and observed a waiting worker only after every detached-manifest cache entry independently matched status, MIME, length, and SHA-256 with no staging or extra candidate cache.");

    await checkedStep(checks, "CANDIDATE_REAL_UI_ACTIVATION", async () => {
      expectedCandidateReloadUrl = candidatePage.url();
      initialCandidateUrlSha256 = hashFileBytes(Buffer.from(expectedCandidateReloadUrl, "utf8"));
      const initialDocumentIdentity = await boundedPageEvaluate(candidatePage, context, profilePath, () => ({ timeOrigin: performance.timeOrigin, url: location.href }));
      const recordCandidateNavigation = (frame) => {
        if (frame === candidatePage.mainFrame()) candidateMainFrameNavigations.push(frame.url());
      };
      const recordBeta1Navigation = (frame) => {
        if (frame === retainedBeta1Page.mainFrame()) beta1MainFrameNavigations.push(frame.url());
      };
      candidatePage.on("framenavigated", recordCandidateNavigation);
      retainedBeta1Page.on("framenavigated", recordBeta1Navigation);
      await activateCanaryHomeUpdate(candidatePage);
      await candidatePage.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration("./");
        return Boolean(navigator.serviceWorker.controller) && registration?.waiting === null;
      }, null, { timeout: 30_000 });
      await waitForCanaryHomeUpdate(candidatePage, "1.0.0-beta.6");
      await candidatePage.waitForFunction((priorTimeOrigin) => performance.timeOrigin !== priorTimeOrigin, initialDocumentIdentity.timeOrigin, { timeout: 30_000 });
      candidatePage.off("framenavigated", recordCandidateNavigation);
      assert.deepEqual(candidateMainFrameNavigations, [expectedCandidateReloadUrl]);
      assert.deepEqual(beta1MainFrameNavigations, []);
    }, "The visible grown-up Apply update control activated the exact worker and caused only its one reviewed safe-boundary self-reload; the retained tab was not inspected, probed, or navigated.");

    await checkedStep(checks, "RETAINED_BETA1_EXPLICIT_RELOAD", async () => {
      assert.deepEqual(beta1MainFrameNavigations, []);
      assert.equal(await boundedPageEvaluate(retainedBeta1Page, context, profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.1");
      await retainedBeta1Page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      await retainedBeta1Page.waitForFunction(() => globalThis.MathQuestEngine?.CONSTANTS?.PRODUCT_VERSION === "1.0.0-beta.6", null, { timeout: 30_000 });
      assert.equal(await boundedPageEvaluate(retainedBeta1Page, context, profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.6");
      assert.deepEqual(beta1MainFrameNavigations, [origin]);
      retainedBeta1Page.removeAllListeners("framenavigated");
    }, "The retained Beta 1 tab remained untouched until an explicit user-equivalent reload, which then opened the verified current shell without a recovery query.");

    await checkedStep(checks, "RESPONSIVE_CANDIDATE_TAB_NOT_FORCED", async () => {
      assert.equal(new URL(candidatePage.url()).searchParams.has("legacy-recovery"), false);
      assert.equal(await boundedPageEvaluate(candidatePage, context, profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.6");
    }, "The responsive Beta 6 tab remained on its safe-boundary current route.");

    await checkedStep(checks, "BETA1_SOURCE_BYTES_UNCHANGED", async () => {
      assert.equal(await boundedPageEvaluate(candidatePage, context, profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), sourceBytes);
    }, "The original Beta 1 localStorage bytes remained byte-for-byte unchanged.");

    await checkedStep(checks, "RETIRED_BETA1_PRESERVED_FRESH_START", async () => {
      await candidatePage.waitForFunction((key) => Boolean(localStorage.getItem(key)), PROTECTED_KEY, { timeout: 20_000 });
      const fresh = await boundedPageEvaluate(candidatePage, context, profilePath, ({ protectedKey, guardKey }) => {
        const bytes = localStorage.getItem(protectedKey);
        const state = JSON.parse(bytes);
        const expectedBytes = MathQuestEngine.exportState(MathQuestEngine.createInitialState(state.maxSeenPlayDay));
        const { schemaVersion: _schemaVersion, ...projection } = state;
        return { bytes, state, expectedBytes, projection, marker: localStorage.getItem(guardKey) };
      }, { protectedKey: PROTECTED_KEY, guardKey: RETAINED_GUARD_KEY });
      protectedBytes = fresh.bytes;
      expectedFreshBytes = fresh.expectedBytes;
      freshProtectedProjection = fresh.projection;
      assert.equal(protectedBytes, expectedFreshBytes, "protected Beta 6 progress must be the exact canonical initial state");
      assert.equal(fresh.state.schemaVersion, 3);
      assert.equal(fresh.state.earnedLevel, 1);
      assert.equal(Object.values(fresh.state.practiceCountByDay).reduce((sum, count) => sum + count, 0), 0);
      assert.equal(fresh.marker, RETAINED_BETA1_COMPLETE_VALUE);
      assert.equal(retainedFreshStartNoticeSha256, RETAINED_BETA1_FRESH_START_NOTICE_SHA256);
      assert.equal(await boundedPageEvaluate(candidatePage, context, profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), sourceBytes);
    }, "The incompatible Beta 1 save remained byte-identical, while Beta 6 committed its exact canonical fresh state, displayed the exact grown-up notice, and wrote a durable retained-source marker without transferring mastery, evidence, settings, logs, or counts.");

    await checkedStep(checks, "CANDIDATE_ACTIVE_CACHE_READY", async () => {
      await openCanaryInstallHelp(candidatePage);
      await candidatePage.locator('[data-action="pwa-retry"]').click();
      await candidatePage.locator('[data-pwa-status]').filter({ hasText: "Ready for an offline check" }).waitFor({ state: "visible", timeout: 20_000 });
      const state = await boundedPageEvaluate(candidatePage, context, profilePath, () => ({ controller: navigator.serviceWorker.controller?.scriptURL || null }));
      assert.equal(state.controller, `${origin}sw.js`);
      activeCacheProof = await inspectExactCandidateCache(candidatePage, snapshots, { allowBeta1: true, persistentContext: context, profilePath });
      assert.equal(await boundedPageEvaluate(candidatePage, context, profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), sourceBytes);
      assert.equal(await boundedPageEvaluate(candidatePage, context, profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), protectedBytes);
    }, "The activated Beta 6 worker independently matched the exact detached cache and controller identity, retained the Beta 1 cache for the still-open older tab, excluded staging or unrecognized caches, and left both progress records unchanged.");

    process.stdout.write("[canary] START ONLINE_TO_OFFLINE_SHUTDOWN\n");
    await closePersistentContext(context, profilePath);
    context = null;
    cleanupFlags.browserClosed = true;
    const stoppedBackendPort = backend.port;
    await stopChild(caddy);
    caddy = null;
    await stopServer(backend.server);
    backend = null;
    assert.equal(await portAccepting(originPort), false);
    assert.equal(await portAccepting(stoppedBackendPort), false);
    process.stdout.write("[canary] PASS ONLINE_TO_OFFLINE_SHUTDOWN\n");
    const requestsBeforeColdStart = backendState.requests.length;

    await checkedStep(checks, "CANDIDATE_OFFLINE_COLD_RELAUNCH", async () => {
      context = await chromium.launchPersistentContext(profilePath, {
        executablePath: edgePath,
        headless: true,
        args: canaryBrowserArguments(profilePath),
        serviceWorkers: "allow",
        viewport: { width: 1280, height: 800 },
        timeout: 30_000,
      });
      context.setDefaultTimeout(30_000);
      context.setDefaultNavigationTimeout(30_000);
      requestTrackers.push(await trackRequests(context, browserRequests, context, profilePath));
      const offlinePage = context.pages()[0] || await boundedBrowserOperation(context.newPage(), context, profilePath, "Playwright offline page creation");
      assert.equal(await portAccepting(originPort), false);
      assert.equal(await portAccepting(stoppedBackendPort), false);
      const offlineResponse = await offlinePage.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
      assert.equal(offlineResponse?.fromServiceWorker(), true);
      await waitForCanaryHomeUpdate(offlinePage, "1.0.0-beta.6");
      assert.equal(await boundedPageEvaluate(offlinePage, context, profilePath, () => navigator.serviceWorker.controller?.scriptURL || null), `${origin}sw.js`);
      const offlineReadiness = await exactActiveReadiness(offlinePage, snapshots, context, profilePath);
      offlineCacheProof = await inspectExactCandidateCache(offlinePage, snapshots, { allowBeta1: true, persistentContext: context, profilePath });
      assert.equal(await boundedPageEvaluate(offlinePage, context, profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), sourceBytes);
      assert.equal(await boundedPageEvaluate(offlinePage, context, profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), protectedBytes);
      assert.equal(backendState.requests.length, requestsBeforeColdStart);
      assert.equal(await portAccepting(originPort), false);
      assert.equal(await portAccepting(stoppedBackendPort), false);
      offlineProof = Object.freeze({
        responseFromServiceWorker: true,
        originPortClosed: true,
        backendPortClosed: true,
        controllerScriptUrlSha256: hashFileBytes(Buffer.from(`${origin}sw.js`, "utf8")),
        readinessRelease: offlineReadiness.release,
        readinessBuildId: offlineReadiness.buildId,
        readinessCacheIdentity: offlineReadiness.cacheIdentity,
      });
    }, "A new Edge process cold-launched through a real service-worker response while both ports stayed closed, then independently proved the exact active worker/readiness/cache identity and unchanged source/protected progress.");

    backend = await startBackend(backendState);
    const restartedBackendPort = backend.port;
    await writeFile(caddyConfig, caddyfileText({ port: originPort, backendPort: restartedBackendPort, storageRoot: caddyStorage, logPath: caddyLog }), "utf8");
    caddy = await startCaddy({ caddyPath, configPath: caddyConfig, port: originPort });
    await persistCleanupIdentifiers(workRoot, { processIds: [caddy.child.pid], certificateThumbprint, originPort });
    await assertLoopbackListener(originPort, caddy.child.pid);
    const activePage = context.pages()[0];

    await checkedStep(checks, "CACHE_CORRUPTION_DETECTED", async () => {
      const deleted = await boundedPageEvaluate(activePage, context, profilePath, async (prefix) => {
        const name = (await caches.keys()).find((item) => item.startsWith(prefix) && !item.endsWith("-staging"));
        if (!name) return false;
        return (await caches.open(name)).delete("./index.html", { ignoreSearch: true });
      }, CANDIDATE_CACHE_PREFIX);
      assert.equal(deleted, true);
      await openCanaryInstallHelp(activePage);
      await activePage.locator('[data-action="pwa-retry"]').click();
      await activePage.locator('[data-pwa-status]').filter({ hasText: "Recovery needed" }).waitFor({ state: "visible", timeout: 20_000 });
      await activePage.locator('[data-action="pwa-repair"]').waitFor({ state: "visible", timeout: 10_000 });
    }, "Deleting one required entry caused the shipped readiness UI to fail closed into Recovery.");

    await checkedStep(checks, "TRANSACTIONAL_REPAIR_SUCCEEDED", async () => {
      const before = await boundedPageEvaluate(activePage, context, profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY);
      await activePage.locator('[data-action="pwa-repair"]').click();
      await activePage.locator('[data-pwa-status]').filter({ hasText: "Ready for an offline check" }).waitFor({ state: "visible", timeout: 30_000 });
      const after = await boundedPageEvaluate(activePage, context, profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY);
      assert.equal(after, before);
      assert.equal(after, protectedBytes);
      const cacheState = await boundedPageEvaluate(activePage, context, profilePath, async (prefix) => {
        const names = await caches.keys();
        const active = names.filter((name) => name.startsWith(prefix) && !name.endsWith("-staging"));
        const staging = names.filter((name) => name.endsWith("-staging"));
        const hasIndex = active.length === 1 && Boolean(await (await caches.open(active[0])).match("./index.html", { ignoreSearch: true }));
        return { active, staging, hasIndex };
      }, CANDIDATE_CACHE_PREFIX);
      assert.equal(cacheState.active.length, 1);
      assert.equal(cacheState.staging.length, 0);
      assert.equal(cacheState.hasIndex, true);
      repairedCacheProof = await inspectExactCandidateCache(activePage, snapshots, { allowBeta1: true, persistentContext: context, profilePath });
      await exactActiveReadiness(activePage, snapshots, context, profilePath);
      assert.equal(await boundedPageEvaluate(activePage, context, profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), sourceBytes);
      assert.equal(await boundedPageEvaluate(activePage, context, profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), protectedBytes);
    }, "The visible Repair control independently restored the exact detached cache transactionally without changing either source or protected progress.");

    await checkedStep(checks, "RUNTIME_REQUEST_ALLOWLIST", async () => {
      await Promise.all(requestTrackers.flatMap((tracker) => tracker.tasks));
      assert.deepEqual(requestTrackers.flatMap((tracker) => tracker.observationFailures), []);
      const allowed = runtimeAllowlist(snapshots);
      const external = browserRequests.filter((item) => item.origin !== origin.slice(0, -1));
      const unexpected = browserRequests.filter((item) => item.origin === origin.slice(0, -1) && (
        !allowed.has(item.pathname)
        || item.method !== "GET"
        || item.search !== ""
        || item.hasCredentials
        || item.bodyBytes !== 0
        || item.cookieHeader
        || item.authorizationHeader
        || item.sensitiveHeader
      ));
      assert.deepEqual(external, []);
      assert.deepEqual(unexpected, []);
      const backendViolations = backendState.requests.flatMap((item, requestIndex) => {
        const finding = canaryBackendRequestViolation(item, allowed);
        return finding ? [{ requestIndex, ...finding }] : [];
      });
      if (backendViolations.length > 0) {
        throw new Error(`Backend request violation count=${backendViolations.length} first=${JSON.stringify(backendViolations[0])}`);
      }
      const queryStringCount = browserRequests.filter((item) => item.search !== "").length;
      const allowedRecoveryQueryCount = 0;
      const channelCounts = requestTrackers.reduce((sum, tracker) => ({
        webSocket: sum.webSocket + tracker.channelCounts.webSocket,
        eventSource: sum.eventSource + tracker.channelCounts.eventSource,
        webTransport: sum.webTransport + tracker.channelCounts.webTransport,
        sendBeacon: sum.sendBeacon + tracker.channelCounts.sendBeacon,
      }), { webSocket: 0, eventSource: 0, webTransport: 0, sendBeacon: 0 });
      privacySummary = {
        requestMetadataSha256: hashFileBytes(Buffer.from(`${JSON.stringify(browserRequests.map((item) => ({ ...item })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))))}\n`, "utf8")),
        unexpectedRequestCount: unexpected.length,
        externalRequestCount: external.length,
        queryStringCount,
        allowedRecoveryQueryCount,
        unexpectedQueryStringCount: queryStringCount - allowedRecoveryQueryCount,
        requestBodyCount: browserRequests.filter((item) => item.bodyBytes > 0).length,
        cookieHeaderCount: browserRequests.filter((item) => item.cookieHeader).length,
        authorizationHeaderCount: browserRequests.filter((item) => item.authorizationHeader).length,
        sensitiveHeaderCount: browserRequests.filter((item) => item.sensitiveHeader).length,
        webSocketCount: channelCounts.webSocket,
        eventSourceCount: channelCounts.eventSource,
        otherActiveChannelCount: channelCounts.webTransport + channelCounts.sendBeacon,
      };
      assert.deepEqual({ ...privacySummary, requestMetadataSha256: "verified" }, {
        requestMetadataSha256: "verified",
        unexpectedRequestCount: 0,
        externalRequestCount: 0,
        queryStringCount: 0,
        allowedRecoveryQueryCount: 0,
        unexpectedQueryStringCount: 0,
        requestBodyCount: 0,
        cookieHeaderCount: 0,
        authorizationHeaderCount: 0,
        sensitiveHeaderCount: 0,
        webSocketCount: 0,
        eventSourceCount: 0,
        otherActiveChannelCount: 0,
      });
      networkProof = Object.freeze({ ...networkProof, caddyAccessLogSha256: await caddyAccessLogProof(caddyLog, backendState.requests) });
    }, "Every request retained its URL query, method, type, body digest, and sensitive-header presence, with no query-bearing request, external origin, child data, upload body, credential, WebSocket, EventSource, WebTransport, or beacon channel.");

    const caddyShaAfter = await hashFile(caddyPath);
    const edgeShaAfter = await hashFile(edgePath);
    assert.equal(caddyShaAfter, caddyExecutableSha256);
    assert.equal(edgeShaAfter, edgeSha256);
  } catch (error) {
    failure = error;
  }

  const teardownResults = await runCanaryTeardown(cleanup);
  const teardownPass = teardownResults.every((result) => result.ok)
    && Object.values(cleanupFlags).every(Boolean);
  setCheck(checks, "TEARDOWN_COMPLETE", teardownPass ? "PASS" : "FAIL", teardownPass
    ? "Edge, Caddy, backend, certificate trust, profile, ports, and temporary files were removed."
    : `Teardown failed: ${teardownResults.filter((item) => !item.ok).map((item) => item.id).join(", ") || "one or more cleanup proofs were false"}.`);

  const origin = originPort ? `https://localhost:${originPort}/` : null;
  const sourceState = sourceBytes ? JSON.parse(sourceBytes) : null;
  const protectedState = protectedBytes ? JSON.parse(protectedBytes) : null;
  const evidence = {
    schemaVersion: TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
    artifactKind: TRUSTED_HTTPS_CANARY_KIND,
    certificationStatus: TRUSTED_HTTPS_CANARY_STATUS,
    reconciliationState: !failure && teardownPass && checks.every((item) => item.status === "PASS") ? "RECONCILED" : "FAILED",
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    candidateSha,
    intendedReleaseTag: TRUSTED_HTTPS_CANARY_TAG,
    workflowFile: TRUSTED_HTTPS_CANARY_WORKFLOW,
    workflowRunId: process.env.GITHUB_RUN_ID,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
    observedAtUtc: new Date().toISOString(),
    hostQualificationState: "DEFERRED_PRERELEASE",
    beta1Identity: {
      tag: TRUSTED_HTTPS_CANARY_BETA1_TAG,
      tagObjectSha: TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
      commitSha: TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
    },
    runtimeIdentity: snapshots ? { ...snapshots.identity } : {
      beta1SnapshotSha256: null,
      candidateSnapshotSha256: null,
      candidateReleaseManifestSha256: null,
      candidateServiceWorkerSha256: null,
      candidateIndexSha256: null,
    },
    origin: { scheme: "https", hostname: "localhost", port: originPort || null, scope: origin, exposure: "LOOPBACK_ONLY" },
    toolchain: {
      caddyVersion: CADDY_VERSION,
      caddyArchiveSha256: CADDY_ARCHIVE_SHA256,
      caddyArchiveSha512: CADDY_ARCHIVE_SHA512,
      caddyExecutableSha256,
      playwrightCoreVersion: PLAYWRIGHT_CORE_VERSION,
      playwrightCoreSri: PLAYWRIGHT_CORE_SRI,
    },
    browser: { productName: browserVersion ? "Microsoft Edge" : null, fullVersion: browserVersion, executableSha256: edgeSha256 },
    runner: { requestedLabel: "windows-latest", environment: process.env.RUNNER_ENVIRONMENT, imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion },
    certificate: {
      rootSha256: rootCertificate ? sha256Bytes(rootCertificate.raw) : null,
      leafSha256: tls?.sha256 || null,
      subjectName: tls?.subjectName || null,
      issuer: tls?.issuer || null,
      validFromUnix: tls?.validFrom ?? null,
      validToUnix: tls?.validTo ?? null,
    },
    tlsProtocol: tls ? (tls.protocol === "Tls13" ? "TLS 1.3" : "TLS 1.2") : null,
    networkProof: networkProof ? {
      expectedResponseCount: networkProof.expectedResponseCount,
      verifiedResponseCount: networkProof.verifiedResponseCount,
      responseSetSha256: networkProof.responseSetSha256,
      responseHeaderSetSha256: networkProof.responseHeaderSetSha256,
      caddyAccessLogSha256: networkProof.caddyAccessLogSha256 ?? null,
    } : {
      expectedResponseCount: null,
      verifiedResponseCount: null,
      responseSetSha256: null,
      responseHeaderSetSha256: null,
      caddyAccessLogSha256: null,
    },
    cacheProof: waitingCacheProof && activeCacheProof && offlineCacheProof && repairedCacheProof ? {
      physicalCacheName: waitingCacheProof.physicalCacheName,
      expectedEntryCount: waitingCacheProof.entryCount,
      waitingEntryCount: waitingCacheProof.entryCount,
      activeEntryCount: activeCacheProof.entryCount,
      offlineEntryCount: offlineCacheProof.entryCount,
      repairedEntryCount: repairedCacheProof.entryCount,
      waitingSetSha256: waitingCacheProof.setSha256,
      activeSetSha256: activeCacheProof.setSha256,
      offlineSetSha256: offlineCacheProof.setSha256,
      repairedSetSha256: repairedCacheProof.setSha256,
      unexpectedCacheCount: Math.max(waitingCacheProof.unexpectedCacheCount, activeCacheProof.unexpectedCacheCount, offlineCacheProof.unexpectedCacheCount, repairedCacheProof.unexpectedCacheCount),
      stagingCacheCount: Math.max(waitingCacheProof.stagingCacheCount, activeCacheProof.stagingCacheCount, offlineCacheProof.stagingCacheCount, repairedCacheProof.stagingCacheCount),
    } : {
      physicalCacheName: null,
      expectedEntryCount: null,
      waitingEntryCount: null,
      activeEntryCount: null,
      offlineEntryCount: null,
      repairedEntryCount: null,
      waitingSetSha256: null,
      activeSetSha256: null,
      offlineSetSha256: null,
      repairedSetSha256: null,
      unexpectedCacheCount: null,
      stagingCacheCount: null,
    },
    offlineProof: offlineProof || {
      responseFromServiceWorker: null,
      originPortClosed: null,
      backendPortClosed: null,
      controllerScriptUrlSha256: null,
      readinessRelease: null,
      readinessBuildId: null,
      readinessCacheIdentity: null,
    },
    navigationProof: initialCandidateUrlSha256 && candidateMainFrameNavigations.length ? {
      expectedReloadCount: 1,
      observedReloadCount: candidateMainFrameNavigations.length,
      unexpectedNavigationCount: candidateMainFrameNavigations.filter((url) => url !== expectedCandidateReloadUrl).length,
      initialUrlSha256: initialCandidateUrlSha256,
      navigationSetSha256: hashFileBytes(Buffer.from(`${JSON.stringify(candidateMainFrameNavigations)}\n`, "utf8")),
    } : {
      expectedReloadCount: null,
      observedReloadCount: null,
      unexpectedNavigationCount: null,
      initialUrlSha256: null,
      navigationSetSha256: null,
    },
    privacy: {
      profileMode: "anonymous",
      syntheticOnly: true,
      childIdentityStored: false,
      automaticUpload: false,
      requestMetadataSha256: privacySummary?.requestMetadataSha256 ?? null,
      unexpectedRequestCount: privacySummary?.unexpectedRequestCount ?? null,
      externalRequestCount: privacySummary?.externalRequestCount ?? null,
      queryStringCount: privacySummary?.queryStringCount ?? null,
      allowedRecoveryQueryCount: privacySummary?.allowedRecoveryQueryCount ?? null,
      unexpectedQueryStringCount: privacySummary?.unexpectedQueryStringCount ?? null,
      requestBodyCount: privacySummary?.requestBodyCount ?? null,
      cookieHeaderCount: privacySummary?.cookieHeaderCount ?? null,
      authorizationHeaderCount: privacySummary?.authorizationHeaderCount ?? null,
      sensitiveHeaderCount: privacySummary?.sensitiveHeaderCount ?? null,
      webSocketCount: privacySummary?.webSocketCount ?? null,
      eventSourceCount: privacySummary?.eventSourceCount ?? null,
      otherActiveChannelCount: privacySummary?.otherActiveChannelCount ?? null,
    },
    progress: {
      sourceKey: SOURCE_KEY,
      protectedKey: PROTECTED_KEY,
      sourceSha256: sourceBytes ? sha256Bytes(sourceBytes) : null,
      protectedSha256: protectedBytes ? sha256Bytes(protectedBytes) : null,
      sourceSchemaVersion: sourceState?.schemaVersion ?? null,
      targetSchemaVersion: protectedState?.schemaVersion ?? null,
      sourceEarnedLevel: sourceState?.earnedLevel ?? null,
      sourcePracticeCount: sourceState?.practiceCountByDay?.["30000"] ?? null,
      protectedEarnedLevel: protectedState?.earnedLevel ?? null,
      protectedPracticeCount: protectedState ? Object.values(protectedState.practiceCountByDay || {}).reduce((sum, count) => sum + count, 0) : null,
      expectedFreshSha256: expectedFreshBytes ? sha256Bytes(expectedFreshBytes) : null,
      retiredProjectionSha256: retiredSourceProjection ? hashFileBytes(Buffer.from(`${JSON.stringify(retiredSourceProjection)}\n`, "utf8")) : null,
      freshProjectionSha256: freshProtectedProjection ? hashFileBytes(Buffer.from(`${JSON.stringify(freshProtectedProjection)}\n`, "utf8")) : null,
      retiredProjectionFieldCount: retiredSourceProjection ? projectionFieldCount(retiredSourceProjection) : null,
      freshProjectionFieldCount: freshProtectedProjection ? projectionFieldCount(freshProtectedProjection) : null,
      retainedMarkerSha256: protectedBytes ? sha256Bytes(RETAINED_BETA1_COMPLETE_VALUE) : null,
      retainedNoticeSha256: retainedFreshStartNoticeSha256,
    },
    checks,
    teardown: {
      status: teardownPass ? "PASS" : "FAIL",
      ...cleanupFlags,
      certificateThumbprint: certificateThumbprint ? canonicalCertificateThumbprint(certificateThumbprint) : null,
      remainingMatchingCertificateCount,
      observedProfileProcessCount,
      observedProfileProcessSetSha256,
      remainingProfileProcessCount,
      remainingProfileProcessSetSha256,
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, canonicalCanaryEvidence(evidence), "utf8");
  if (failure) throw failure;
  if (!teardownPass) throw new Error("Canary behavior passed, but disposable teardown did not.");
}

main().catch((error) => {
  process.stderr.write(`Trusted-HTTPS canary failed: ${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
