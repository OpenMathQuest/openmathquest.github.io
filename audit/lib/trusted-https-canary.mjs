import { createHash } from "node:crypto";

export const TRUSTED_HTTPS_CANARY_SCHEMA_VERSION = 1;
export const TRUSTED_HTTPS_CANARY_KIND = "TRUSTED_HTTPS_CANARY_RECONCILIATION_V1";
export const TRUSTED_HTTPS_CANARY_STATUS = "TECHNICAL_CANARY_NOT_RELEASE_CERTIFICATION";
export const TRUSTED_HTTPS_CANARY_WORKFLOW = ".github/workflows/trusted-https-canary.yml";
export const TRUSTED_HTTPS_CANARY_TAG = "v1.0.0-beta.5";
export const TRUSTED_HTTPS_CANARY_BETA1_TAG = "v1.0.0-beta.1";
export const TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT = "140693bff04733ce890a0a8be2d7c9499dfa24cc";
export const TRUSTED_HTTPS_CANARY_BETA1_COMMIT = "f989bf3bfe0c40824c4d2ab6f0ec2fb3450e314e";
export const CADDY_VERSION = "2.11.4";
export const CADDY_ARCHIVE_SHA256 = "1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf";
export const CADDY_ARCHIVE_SHA512 = "cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35";
export const PLAYWRIGHT_CORE_VERSION = "1.62.1";
export const PLAYWRIGHT_CORE_SRI = "sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==";
export const EMPTY_PROFILE_PROCESS_SET_SHA256 = createHash("sha256").update("[]\n").digest("hex");
export const LOOPBACK_LISTENER_QUERY_SCRIPT = [
  "$port=[int]$env:MQ_CANARY_LISTENER_PORT",
  "try { $rows=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop) }",
  "catch { if ($_.FullyQualifiedErrorId -like 'CmdletizationQuery_NotFound*') { $rows=@() } else { throw } }",
  "$selected=@($rows | Select-Object LocalAddress,OwningProcess)",
  "ConvertTo-Json -InputObject $selected -Compress",
].join("\n");

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

export async function waitForExactLoopbackListener({
  probe,
  expectedPid,
  timeoutMs = 10_000,
  intervalMs = 100,
}) {
  if (typeof probe !== "function") throw new TypeError("Loopback listener probe must be a function.");
  if (!Number.isSafeInteger(expectedPid) || expectedPid <= 0) throw new TypeError("Expected listener process id must be positive.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("Listener timeout must be positive.");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) throw new TypeError("Listener interval must be nonnegative.");

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
    if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);

  throw new Error("Caddy's loopback listener did not become observable before the deadline.");
}

export const TRUSTED_HTTPS_CANARY_CHECK_IDS = Object.freeze([
  "HTTPS_TRUSTED_NO_BYPASS",
  "ROOT_SCOPE_EXACT",
  "BETA1_TAG_AND_RUNTIME_IDENTITY",
  "BETA1_INSTALL_CACHE_COMPLETE",
  "BETA1_SYNTHETIC_STATE_SEEDED",
  "BETA1_OFFLINE_RELOAD",
  "SAME_ORIGIN_RUNTIME_SWITCH",
  "CANDIDATE_WAITING_CACHE_READY",
  "CANDIDATE_REAL_UI_ACTIVATION",
  "RETAINED_BETA1_EXPLICIT_RELOAD",
  "RESPONSIVE_CANDIDATE_TAB_NOT_FORCED",
  "BETA1_SOURCE_BYTES_UNCHANGED",
  "SCHEMA3_MIGRATION_PRESERVED",
  "CANDIDATE_ACTIVE_CACHE_READY",
  "CANDIDATE_OFFLINE_COLD_RELAUNCH",
  "CACHE_CORRUPTION_DETECTED",
  "TRANSACTIONAL_REPAIR_SUCCEEDED",
  "RUNTIME_REQUEST_ALLOWLIST",
  "TEARDOWN_COMPLETE",
]);

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "artifactKind",
  "certificationStatus",
  "reconciliationState",
  "repository",
  "ref",
  "candidateSha",
  "intendedReleaseTag",
  "workflowFile",
  "workflowRunId",
  "workflowRunAttempt",
  "observedAtUtc",
  "hostQualificationState",
  "beta1Identity",
  "runtimeIdentity",
  "origin",
  "toolchain",
  "browser",
  "runner",
  "certificate",
  "tlsProtocol",
  "networkProof",
  "cacheProof",
  "offlineProof",
  "navigationProof",
  "privacy",
  "progress",
  "checks",
  "teardown",
]);
const BETA1_KEYS = Object.freeze(["tag", "tagObjectSha", "commitSha"]);
const RUNTIME_KEYS = Object.freeze([
  "beta1SnapshotSha256",
  "candidateSnapshotSha256",
  "candidateReleaseManifestSha256",
  "candidateServiceWorkerSha256",
  "candidateIndexSha256",
]);
const ORIGIN_KEYS = Object.freeze(["scheme", "hostname", "port", "scope", "exposure"]);
const TOOLCHAIN_KEYS = Object.freeze([
  "caddyVersion",
  "caddyArchiveSha256",
  "caddyArchiveSha512",
  "caddyExecutableSha256",
  "playwrightCoreVersion",
  "playwrightCoreSri",
]);
const BROWSER_KEYS = Object.freeze(["productName", "fullVersion", "executableSha256"]);
const RUNNER_KEYS = Object.freeze(["requestedLabel", "environment", "imageOS", "imageVersion"]);
const CERTIFICATE_KEYS = Object.freeze([
  "rootSha256",
  "leafSha256",
  "subjectName",
  "issuer",
  "validFromUnix",
  "validToUnix",
]);
const NETWORK_PROOF_KEYS = Object.freeze([
  "expectedResponseCount",
  "verifiedResponseCount",
  "responseSetSha256",
  "responseHeaderSetSha256",
  "caddyAccessLogSha256",
]);
const CACHE_PROOF_KEYS = Object.freeze([
  "physicalCacheName",
  "expectedEntryCount",
  "waitingEntryCount",
  "activeEntryCount",
  "offlineEntryCount",
  "repairedEntryCount",
  "waitingSetSha256",
  "activeSetSha256",
  "offlineSetSha256",
  "repairedSetSha256",
  "unexpectedCacheCount",
  "stagingCacheCount",
]);
const OFFLINE_PROOF_KEYS = Object.freeze([
  "responseFromServiceWorker",
  "originPortClosed",
  "backendPortClosed",
  "controllerScriptUrlSha256",
  "readinessRelease",
  "readinessBuildId",
  "readinessCacheIdentity",
]);
const NAVIGATION_PROOF_KEYS = Object.freeze([
  "expectedReloadCount",
  "observedReloadCount",
  "unexpectedNavigationCount",
  "initialUrlSha256",
  "navigationSetSha256",
]);
const PRIVACY_KEYS = Object.freeze([
  "profileMode",
  "syntheticOnly",
  "childIdentityStored",
  "automaticUpload",
  "requestMetadataSha256",
  "unexpectedRequestCount",
  "externalRequestCount",
  "queryStringCount",
  "allowedRecoveryQueryCount",
  "unexpectedQueryStringCount",
  "requestBodyCount",
  "cookieHeaderCount",
  "authorizationHeaderCount",
  "sensitiveHeaderCount",
  "webSocketCount",
  "eventSourceCount",
  "otherActiveChannelCount",
]);
const PROGRESS_KEYS = Object.freeze([
  "sourceKey",
  "protectedKey",
  "sourceSha256",
  "protectedSha256",
  "sourceSchemaVersion",
  "targetSchemaVersion",
  "earnedLevel",
  "practiceCount",
  "approvedProjectionSha256",
  "protectedProjectionSha256",
  "approvedProjectionFieldCount",
  "protectedProjectionFieldCount",
]);
const CHECK_KEYS = Object.freeze(["id", "status", "detail"]);
const TEARDOWN_KEYS = Object.freeze([
  "status",
  "browserClosed",
  "caddyStopped",
  "backendStopped",
  "certificateRemoved",
  "profileRemoved",
  "temporaryFilesRemoved",
  "portClosed",
  "certificateThumbprint",
  "remainingMatchingCertificateCount",
  "observedProfileProcessCount",
  "observedProfileProcessSetSha256",
  "remainingProfileProcessCount",
  "remainingProfileProcessSetSha256",
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA64 = /^[a-f0-9]{64}$/u;
const SHA128 = /^[a-f0-9]{128}$/u;
const VERSION4 = /^\d+\.\d+\.\d+\.\d+$/u;
const RUN_NUMBER = /^[1-9]\d*$/u;
const RUNNER_IDENTITY = /^[A-Za-z0-9._-]{1,100}$/u;
const UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CHECK_STATUSES = new Set(["PASS", "FAIL", "NOT_RUN"]);
const FORBIDDEN_BROWSER_FLAGS = Object.freeze([
  "--ignore-certificate-errors",
  "--allow-insecure-localhost",
  "--unsafely-treat-insecure-origin-as-secure",
  "--no-sandbox",
]);

function exactOrderedKeys(value, keys) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key, index) => key === keys[index]),
  );
}

function issueIf(issues, condition, message) {
  if (condition) issues.push(message);
}

function validSha64OrNull(value, failed) {
  return SHA64.test(String(value || "")) || (failed && value === null);
}

function validNonemptyOrNull(value, failed, maximum = 180) {
  return (typeof value === "string" && value.length > 0 && value.length <= maximum)
    || (failed && value === null);
}

function validNonnegativeOrNull(value, failed) {
  return (Number.isSafeInteger(value) && value >= 0) || (failed && value === null);
}

function validBooleanOrNull(value, failed) {
  return typeof value === "boolean" || (failed && value === null);
}

export function canonicalCanaryEvidence(value) {
  return `${JSON.stringify(value)}\n`;
}

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

export function parseTrustedHttpsCanaryEvidence(text, expected = {}) {
  const source = String(text);
  const issues = [];
  issueIf(issues, source.includes("\r"), "evidence must use LF line endings");
  issueIf(issues, !source.endsWith("\n") || source.endsWith("\n\n"), "evidence must end with exactly one LF");
  let value = {};
  try {
    value = JSON.parse(source);
  } catch {
    issues.push("evidence is not valid JSON");
  }
  issueIf(issues, !exactOrderedKeys(value, TOP_LEVEL_KEYS), "evidence must contain only the exact ordered top-level schema");
  if (Object.keys(value).length && canonicalCanaryEvidence(value) !== source) issues.push("evidence must use canonical compact JSON");

  const failed = value.reconciliationState === "FAILED";
  issueIf(issues, value.schemaVersion !== TRUSTED_HTTPS_CANARY_SCHEMA_VERSION, "schemaVersion must be 1");
  issueIf(issues, value.artifactKind !== TRUSTED_HTTPS_CANARY_KIND, "artifactKind must identify the trusted-HTTPS canary schema");
  issueIf(issues, value.certificationStatus !== TRUSTED_HTTPS_CANARY_STATUS, "certificationStatus must not claim release certification");
  issueIf(issues, !["RECONCILED", "FAILED"].includes(value.reconciliationState), "reconciliationState must be RECONCILED or FAILED");
  issueIf(issues, value.repository !== "OpenMathQuest/openmathquest.github.io", "repository must be the public Math Quest repository");
  issueIf(issues, value.ref !== "refs/heads/main", "ref must be protected main");
  issueIf(issues, !SHA40.test(String(value.candidateSha || "")), "candidateSha must be 40 lowercase hexadecimal characters");
  issueIf(issues, value.intendedReleaseTag !== TRUSTED_HTTPS_CANARY_TAG, "intendedReleaseTag must be the Beta 5 tag");
  issueIf(issues, value.workflowFile !== TRUSTED_HTTPS_CANARY_WORKFLOW, "workflowFile must identify the trusted-HTTPS canary workflow");
  issueIf(issues, !RUN_NUMBER.test(String(value.workflowRunId || "")), "workflowRunId must be a positive integer string");
  issueIf(issues, !RUN_NUMBER.test(String(value.workflowRunAttempt || "")), "workflowRunAttempt must be a positive integer string");
  issueIf(issues, !UTC_MILLISECONDS.test(String(value.observedAtUtc || "")) || Number.isNaN(Date.parse(value.observedAtUtc)), "observedAtUtc must be a valid UTC millisecond timestamp");
  issueIf(issues, value.hostQualificationState !== "DEFERRED_PRERELEASE", "host qualification must remain explicitly deferred for the prerelease");

  issueIf(issues, !exactOrderedKeys(value.beta1Identity, BETA1_KEYS), "beta1Identity must use the exact closed schema");
  issueIf(issues, value.beta1Identity?.tag !== TRUSTED_HTTPS_CANARY_BETA1_TAG, "Beta 1 tag must be immutable");
  issueIf(issues, value.beta1Identity?.tagObjectSha !== TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT, "Beta 1 tag object must be immutable");
  issueIf(issues, value.beta1Identity?.commitSha !== TRUSTED_HTTPS_CANARY_BETA1_COMMIT, "Beta 1 commit must be immutable");

  issueIf(issues, !exactOrderedKeys(value.runtimeIdentity, RUNTIME_KEYS), "runtimeIdentity must use the exact closed schema");
  for (const key of RUNTIME_KEYS) issueIf(issues, !validSha64OrNull(value.runtimeIdentity?.[key], failed), `${key} must be a SHA-256`);

  issueIf(issues, !exactOrderedKeys(value.origin, ORIGIN_KEYS), "origin must use the exact closed schema");
  issueIf(issues, value.origin?.scheme !== "https", "canary origin must use HTTPS");
  issueIf(issues, value.origin?.hostname !== "localhost", "canary origin hostname must be localhost");
  issueIf(issues, !((Number.isSafeInteger(value.origin?.port) && value.origin.port >= 1024 && value.origin.port <= 65535) || (failed && value.origin?.port === null)), "canary origin must use a valid unprivileged port");
  issueIf(issues, value.origin?.scope !== (value.origin?.port === null ? null : `https://localhost:${value.origin?.port}/`), "canary scope must be the exact root-like same origin");
  issueIf(issues, value.origin?.exposure !== "LOOPBACK_ONLY", "canary server exposure must be loopback only");

  issueIf(issues, !exactOrderedKeys(value.toolchain, TOOLCHAIN_KEYS), "toolchain must use the exact closed schema");
  issueIf(issues, value.toolchain?.caddyVersion !== CADDY_VERSION, "Caddy version must match the reviewed pin");
  issueIf(issues, value.toolchain?.caddyArchiveSha256 !== CADDY_ARCHIVE_SHA256, "Caddy archive SHA-256 must match the reviewed pin");
  issueIf(issues, value.toolchain?.caddyArchiveSha512 !== CADDY_ARCHIVE_SHA512, "Caddy archive SHA-512 must match the reviewed pin");
  issueIf(issues, !validSha64OrNull(value.toolchain?.caddyExecutableSha256, failed), "Caddy executable SHA-256 is invalid");
  issueIf(issues, value.toolchain?.playwrightCoreVersion !== PLAYWRIGHT_CORE_VERSION, "Playwright Core version must match the lockfile pin");
  issueIf(issues, value.toolchain?.playwrightCoreSri !== PLAYWRIGHT_CORE_SRI, "Playwright Core SRI must match the reviewed pin");

  issueIf(issues, !exactOrderedKeys(value.browser, BROWSER_KEYS), "browser must use the exact closed schema");
  issueIf(issues, value.browser?.productName !== "Microsoft Edge" && !(failed && value.browser?.productName === null), "browser product must be Microsoft Edge");
  issueIf(issues, !VERSION4.test(String(value.browser?.fullVersion || "")) && !(failed && value.browser?.fullVersion === null), "browser version must contain four parts");
  issueIf(issues, !validSha64OrNull(value.browser?.executableSha256, failed), "browser executable SHA-256 is invalid");

  issueIf(issues, !exactOrderedKeys(value.runner, RUNNER_KEYS), "runner must use the exact closed schema");
  issueIf(issues, value.runner?.requestedLabel !== "windows-latest", "runner label must be windows-latest");
  issueIf(issues, value.runner?.environment !== "github-hosted", "runner environment must be github-hosted");
  issueIf(issues, !RUNNER_IDENTITY.test(String(value.runner?.imageOS || "")), "runner imageOS is invalid");
  issueIf(issues, !RUNNER_IDENTITY.test(String(value.runner?.imageVersion || "")), "runner imageVersion is invalid");

  issueIf(issues, !exactOrderedKeys(value.certificate, CERTIFICATE_KEYS), "certificate must use the exact closed schema");
  issueIf(issues, !validSha64OrNull(value.certificate?.rootSha256, failed), "root certificate SHA-256 is invalid");
  issueIf(issues, !validSha64OrNull(value.certificate?.leafSha256, failed), "leaf certificate SHA-256 is invalid");
  issueIf(issues, !validNonemptyOrNull(value.certificate?.subjectName, failed), "leaf certificate subject is invalid");
  issueIf(issues, !validNonemptyOrNull(value.certificate?.issuer, failed), "leaf certificate issuer is invalid");
  issueIf(issues, (!Number.isSafeInteger(value.certificate?.validFromUnix) || value.certificate.validFromUnix <= 0) && !(failed && value.certificate?.validFromUnix === null), "leaf certificate valid-from time is invalid");
  issueIf(issues, (!Number.isSafeInteger(value.certificate?.validToUnix) || value.certificate.validToUnix <= value.certificate.validFromUnix) && !(failed && value.certificate?.validToUnix === null), "leaf certificate valid-to time is invalid");
  issueIf(issues, !["TLS 1.2", "TLS 1.3"].includes(value.tlsProtocol) && !(failed && value.tlsProtocol === null), "TLS protocol must be 1.2 or 1.3");

  issueIf(issues, !exactOrderedKeys(value.networkProof, NETWORK_PROOF_KEYS), "networkProof must use the exact closed schema");
  issueIf(issues, !((Number.isSafeInteger(value.networkProof?.expectedResponseCount) && value.networkProof.expectedResponseCount >= 1) || (failed && value.networkProof?.expectedResponseCount === null)), "network expected response count is invalid");
  issueIf(issues, !validNonnegativeOrNull(value.networkProof?.verifiedResponseCount, failed), "network verified response count is invalid");
  for (const key of ["responseSetSha256", "responseHeaderSetSha256", "caddyAccessLogSha256"]) issueIf(issues, !validSha64OrNull(value.networkProof?.[key], failed), `${key} is invalid`);

  issueIf(issues, !exactOrderedKeys(value.cacheProof, CACHE_PROOF_KEYS), "cacheProof must use the exact closed schema");
  issueIf(issues, !/^math-quest-static-v1\.0\.0-beta\.5-[a-f0-9]{64}$/u.test(String(value.cacheProof?.physicalCacheName || "")) && !(failed && value.cacheProof?.physicalCacheName === null), "physical cache name must bind the logical name and detached manifest SHA-256");
  issueIf(issues, value.reconciliationState === "RECONCILED"
    && value.cacheProof?.physicalCacheName !== `math-quest-static-v1.0.0-beta.5-${value.runtimeIdentity?.candidateReleaseManifestSha256}`, "physical cache name must exactly bind the candidate release-manifest SHA-256");
  for (const key of ["expectedEntryCount", "waitingEntryCount", "activeEntryCount", "offlineEntryCount", "repairedEntryCount", "unexpectedCacheCount", "stagingCacheCount"]) {
    issueIf(issues, !validNonnegativeOrNull(value.cacheProof?.[key], failed), `${key} is invalid`);
  }
  for (const key of ["waitingSetSha256", "activeSetSha256", "offlineSetSha256", "repairedSetSha256"]) issueIf(issues, !validSha64OrNull(value.cacheProof?.[key], failed), `${key} is invalid`);

  issueIf(issues, !exactOrderedKeys(value.offlineProof, OFFLINE_PROOF_KEYS), "offlineProof must use the exact closed schema");
  for (const key of ["responseFromServiceWorker", "originPortClosed", "backendPortClosed"]) issueIf(issues, !validBooleanOrNull(value.offlineProof?.[key], failed), `${key} is invalid`);
  issueIf(issues, !validSha64OrNull(value.offlineProof?.controllerScriptUrlSha256, failed), "offline controller script URL SHA-256 is invalid");
  for (const key of ["readinessRelease", "readinessBuildId", "readinessCacheIdentity"]) issueIf(issues, !validNonemptyOrNull(value.offlineProof?.[key], failed), `${key} is invalid`);

  issueIf(issues, !exactOrderedKeys(value.navigationProof, NAVIGATION_PROOF_KEYS), "navigationProof must use the exact closed schema");
  for (const key of ["expectedReloadCount", "observedReloadCount", "unexpectedNavigationCount"]) issueIf(issues, !validNonnegativeOrNull(value.navigationProof?.[key], failed), `${key} is invalid`);
  for (const key of ["initialUrlSha256", "navigationSetSha256"]) issueIf(issues, !validSha64OrNull(value.navigationProof?.[key], failed), `${key} is invalid`);

  issueIf(issues, !exactOrderedKeys(value.privacy, PRIVACY_KEYS), "privacy must use the exact closed schema");
  issueIf(issues, value.privacy?.profileMode !== "anonymous", "the canary profile must be anonymous");
  issueIf(issues, value.privacy?.syntheticOnly !== true, "the canary may use only synthetic progress");
  issueIf(issues, value.privacy?.childIdentityStored !== false, "the canary must not store child identity");
  issueIf(issues, value.privacy?.automaticUpload !== false, "the canary must not upload gameplay data");
  issueIf(issues, !validSha64OrNull(value.privacy?.requestMetadataSha256, failed), "request metadata SHA-256 is invalid");
  for (const key of PRIVACY_KEYS.slice(5)) issueIf(issues, !validNonnegativeOrNull(value.privacy?.[key], failed), `${key} is invalid`);

  issueIf(issues, !exactOrderedKeys(value.progress, PROGRESS_KEYS), "progress must use the exact closed schema");
  issueIf(issues, value.progress?.sourceKey !== "math-quest:v2", "source progress key must remain Beta 1 storage");
  issueIf(issues, value.progress?.protectedKey !== "math-quest:progress:v2", "protected progress key must remain current storage");
  issueIf(issues, !validSha64OrNull(value.progress?.sourceSha256, failed), "source progress SHA-256 is invalid");
  issueIf(issues, !validSha64OrNull(value.progress?.protectedSha256, failed), "protected progress SHA-256 is invalid");
  issueIf(issues, value.progress?.sourceSchemaVersion !== 2 && !(failed && value.progress?.sourceSchemaVersion === null), "source progress schema must be 2");
  issueIf(issues, value.progress?.targetSchemaVersion !== 3 && !(failed && value.progress?.targetSchemaVersion === null), "protected progress schema must be 3");
  issueIf(issues, value.progress?.earnedLevel !== 2 && !(failed && value.progress?.earnedLevel === null), "synthetic earned level must be 2");
  issueIf(issues, value.progress?.practiceCount !== 3 && !(failed && value.progress?.practiceCount === null), "synthetic practice count must be 3");
  for (const key of ["approvedProjectionSha256", "protectedProjectionSha256"]) issueIf(issues, !validSha64OrNull(value.progress?.[key], failed), `${key} is invalid`);
  for (const key of ["approvedProjectionFieldCount", "protectedProjectionFieldCount"]) issueIf(issues, !validNonnegativeOrNull(value.progress?.[key], failed), `${key} is invalid`);

  issueIf(issues, !Array.isArray(value.checks) || value.checks.length !== TRUSTED_HTTPS_CANARY_CHECK_IDS.length, "checks must contain the exact ordered canary set");
  if (Array.isArray(value.checks)) {
    value.checks.forEach((check, index) => {
      issueIf(issues, !exactOrderedKeys(check, CHECK_KEYS), `check ${index + 1} must use the exact closed schema`);
      issueIf(issues, check?.id !== TRUSTED_HTTPS_CANARY_CHECK_IDS[index], `check ${index + 1} has the wrong id`);
      issueIf(issues, !CHECK_STATUSES.has(check?.status), `check ${index + 1} has an invalid status`);
      issueIf(issues, typeof check?.detail !== "string" || check.detail.length < 1 || check.detail.length > 240, `check ${index + 1} detail is invalid`);
    });
  }

  issueIf(issues, !exactOrderedKeys(value.teardown, TEARDOWN_KEYS), "teardown must use the exact closed schema");
  issueIf(issues, !["PASS", "FAIL"].includes(value.teardown?.status), "teardown status must be PASS or FAIL");
  for (const key of ["browserClosed", "caddyStopped", "backendStopped", "certificateRemoved", "profileRemoved", "temporaryFilesRemoved", "portClosed"]) issueIf(issues, typeof value.teardown?.[key] !== "boolean", `${key} must be boolean`);
  issueIf(issues, !SHA40.test(String(value.teardown?.certificateThumbprint || "")) && !(failed && value.teardown?.certificateThumbprint === null), "teardown certificate thumbprint is invalid");
  issueIf(issues, !validNonnegativeOrNull(value.teardown?.remainingMatchingCertificateCount, failed), "remaining certificate count is invalid");
  issueIf(issues, !validNonnegativeOrNull(value.teardown?.observedProfileProcessCount, failed), "observed profile process count is invalid");
  issueIf(issues, !validSha64OrNull(value.teardown?.observedProfileProcessSetSha256, failed), "observed profile process-set SHA-256 is invalid");
  issueIf(issues, !validNonnegativeOrNull(value.teardown?.remainingProfileProcessCount, failed), "remaining profile process count is invalid");
  issueIf(issues, !validSha64OrNull(value.teardown?.remainingProfileProcessSetSha256, failed), "remaining profile process-set SHA-256 is invalid");

  const allChecksPass = Array.isArray(value.checks) && value.checks.every((check) => check.status === "PASS");
  const teardownPass = value.teardown?.status === "PASS"
    && ["browserClosed", "caddyStopped", "backendStopped", "certificateRemoved", "profileRemoved", "temporaryFilesRemoved", "portClosed"].every((key) => value.teardown?.[key] === true)
    && SHA40.test(String(value.teardown?.certificateThumbprint || ""))
    && value.teardown?.remainingMatchingCertificateCount === 0
    && value.teardown?.observedProfileProcessCount >= 1
    && value.teardown?.remainingProfileProcessCount === 0
    && value.teardown?.remainingProfileProcessSetSha256 === EMPTY_PROFILE_PROCESS_SET_SHA256;
  if (value.reconciliationState === "RECONCILED") {
    issueIf(issues, !allChecksPass, "RECONCILED evidence requires every canary check to pass");
    issueIf(issues, !teardownPass, "RECONCILED evidence requires complete teardown");
    issueIf(issues, value.networkProof?.verifiedResponseCount !== value.networkProof?.expectedResponseCount, "RECONCILED evidence requires every detached HTTPS response to verify");
    issueIf(issues, value.cacheProof?.waitingEntryCount !== value.cacheProof?.expectedEntryCount
      || value.cacheProof?.activeEntryCount !== value.cacheProof?.expectedEntryCount
      || value.cacheProof?.offlineEntryCount !== value.cacheProof?.expectedEntryCount
      || value.cacheProof?.repairedEntryCount !== value.cacheProof?.expectedEntryCount
      || value.cacheProof?.waitingSetSha256 !== value.cacheProof?.activeSetSha256
      || value.cacheProof?.activeSetSha256 !== value.cacheProof?.offlineSetSha256
      || value.cacheProof?.activeSetSha256 !== value.cacheProof?.repairedSetSha256
      || value.cacheProof?.unexpectedCacheCount !== 0
      || value.cacheProof?.stagingCacheCount !== 0, "RECONCILED evidence requires the exact detached cache set at waiting, active, and repaired phases");
    issueIf(issues, value.navigationProof?.expectedReloadCount !== 1
      || value.navigationProof?.observedReloadCount !== 1
      || value.navigationProof?.unexpectedNavigationCount !== 0, "RECONCILED evidence requires exactly one reviewed current-tab reload and no unexpected navigation");
    issueIf(issues, value.offlineProof?.responseFromServiceWorker !== true
      || value.offlineProof?.originPortClosed !== true
      || value.offlineProof?.backendPortClosed !== true
      || value.offlineProof?.readinessRelease !== "1.0.0-beta.5"
      || value.offlineProof?.readinessBuildId !== "math-quest-pwa-v1.0.0-beta.5"
      || value.offlineProof?.readinessCacheIdentity !== "math-quest-static-v1.0.0-beta.5", "RECONCILED evidence requires a service-worker cold response with both server ports closed and exact readiness identity");
    issueIf(issues, value.progress?.approvedProjectionSha256 !== value.progress?.protectedProjectionSha256
      || value.progress?.approvedProjectionFieldCount !== value.progress?.protectedProjectionFieldCount
      || value.progress?.approvedProjectionFieldCount < 1, "RECONCILED evidence requires the complete approved migration projection to remain identical");
    issueIf(issues, value.privacy?.unexpectedRequestCount !== 0
      || value.privacy?.externalRequestCount !== 0
      || value.privacy?.queryStringCount !== 0
      || value.privacy?.allowedRecoveryQueryCount !== 0
      || value.privacy?.unexpectedQueryStringCount !== 0
      || value.privacy?.requestBodyCount !== 0
      || value.privacy?.cookieHeaderCount !== 0
      || value.privacy?.authorizationHeaderCount !== 0
      || value.privacy?.sensitiveHeaderCount !== 0
      || value.privacy?.webSocketCount !== 0
      || value.privacy?.eventSourceCount !== 0
      || value.privacy?.otherActiveChannelCount !== 0, "RECONCILED evidence requires zero query-bearing, external, sensitive, body-bearing, or active-channel requests");
  } else {
    issueIf(issues, allChecksPass, "FAILED evidence must identify at least one failed or unrun check");
  }
  const teardownCheck = Array.isArray(value.checks) ? value.checks.at(-1) : null;
  issueIf(issues, teardownCheck?.status !== (teardownPass ? "PASS" : "FAIL"), "TEARDOWN_COMPLETE must mirror the teardown verdict");

  if (expected.candidateSha !== undefined && value.candidateSha !== expected.candidateSha) issues.push("candidateSha does not match the requested candidate");
  if (expected.runnerImageOS !== undefined && value.runner?.imageOS !== expected.runnerImageOS) issues.push("runner imageOS does not match the live runner");
  if (expected.runnerImageVersion !== undefined && value.runner?.imageVersion !== expected.runnerImageVersion) issues.push("runner imageVersion does not match the live runner");
  if (expected.workflowRunId !== undefined && value.workflowRunId !== expected.workflowRunId) issues.push("workflowRunId does not match the live workflow run");
  if (expected.workflowRunAttempt !== undefined && value.workflowRunAttempt !== expected.workflowRunAttempt) issues.push("workflowRunAttempt does not match the live workflow attempt");
  if (expected.requireReconciled === true && value.reconciliationState !== "RECONCILED") issues.push("trusted-HTTPS canary is not RECONCILED");

  return Object.freeze({ valid: issues.length === 0, value: Object.freeze({ ...value }), issues: Object.freeze(issues) });
}
