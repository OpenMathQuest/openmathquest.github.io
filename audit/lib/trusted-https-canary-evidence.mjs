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
  RETAINED_BETA1_COMPLETE_SHA256,
  RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  TOP_LEVEL_KEYS,
  BETA1_KEYS,
  RUNTIME_KEYS,
  ORIGIN_KEYS,
  TOOLCHAIN_KEYS,
  BROWSER_KEYS,
  RUNNER_KEYS,
  CERTIFICATE_KEYS,
  NETWORK_PROOF_KEYS,
  CACHE_PROOF_KEYS,
  OFFLINE_PROOF_KEYS,
  NAVIGATION_PROOF_KEYS,
  PRIVACY_KEYS,
  PROGRESS_KEYS,
  CHECK_KEYS,
  TEARDOWN_KEYS,
  SHA40,
  SHA64,
  VERSION4,
  RUN_NUMBER,
  RUNNER_IDENTITY,
  UTC_MILLISECONDS,
  CHECK_STATUSES,
} from "./trusted-https-canary-contract.mjs";

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

function readCanaryEvidenceFields(source, issues) {
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
  return value;
}

function canarySchemaIssues(value, issues) {
  issueIf(issues, value.schemaVersion !== TRUSTED_HTTPS_CANARY_SCHEMA_VERSION, "schemaVersion must be 1");
  issueIf(issues, value.artifactKind !== TRUSTED_HTTPS_CANARY_KIND, "artifactKind must identify the trusted-HTTPS canary schema");
  issueIf(issues, value.certificationStatus !== TRUSTED_HTTPS_CANARY_STATUS, "certificationStatus must not claim release certification");
  issueIf(issues, !["RECONCILED", "FAILED"].includes(value.reconciliationState), "reconciliationState must be RECONCILED or FAILED");
}

function canaryProvenanceIssues(value, issues) {
  issueIf(issues, value.repository !== "OpenMathQuest/openmathquest.github.io", "repository must be the public Math Quest repository");
  issueIf(issues, value.ref !== "refs/heads/main", "ref must be protected main");
  issueIf(issues, !SHA40.test(String(value.candidateSha || "")), "candidateSha must be 40 lowercase hexadecimal characters");
  issueIf(issues, value.intendedReleaseTag !== TRUSTED_HTTPS_CANARY_TAG, "intendedReleaseTag must be the Beta 9 tag");
  issueIf(issues, value.workflowFile !== TRUSTED_HTTPS_CANARY_WORKFLOW, "workflowFile must identify the trusted-HTTPS canary workflow");
}

function canaryWorkflowIssues(value, issues) {
  issueIf(issues, !RUN_NUMBER.test(String(value.workflowRunId || "")), "workflowRunId must be a positive integer string");
  issueIf(issues, !RUN_NUMBER.test(String(value.workflowRunAttempt || "")), "workflowRunAttempt must be a positive integer string");
  issueIf(issues, !UTC_MILLISECONDS.test(String(value.observedAtUtc || "")) || Number.isNaN(Date.parse(value.observedAtUtc)), "observedAtUtc must be a valid UTC millisecond timestamp");
  issueIf(issues, value.hostQualificationState !== "DEFERRED_PRERELEASE", "host qualification must remain explicitly deferred for the prerelease");
}

function canaryBeta1IdentityIssues(value, issues) {
  issueIf(issues, !exactOrderedKeys(value.beta1Identity, BETA1_KEYS), "beta1Identity must use the exact closed schema");
  issueIf(issues, value.beta1Identity?.tag !== TRUSTED_HTTPS_CANARY_BETA1_TAG, "Beta 1 tag must be immutable");
  issueIf(issues, value.beta1Identity?.tagObjectSha !== TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT, "Beta 1 tag object must be immutable");
  issueIf(issues, value.beta1Identity?.commitSha !== TRUSTED_HTTPS_CANARY_BETA1_COMMIT, "Beta 1 commit must be immutable");
}

function canaryRuntimeIdentityIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.runtimeIdentity, RUNTIME_KEYS), "runtimeIdentity must use the exact closed schema");
  for (const key of RUNTIME_KEYS) issueIf(issues, !validSha64OrNull(value.runtimeIdentity?.[key], failed), `${key} must be a SHA-256`);
}

function canaryOriginIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.origin, ORIGIN_KEYS), "origin must use the exact closed schema");
  const origin = value.origin ?? {};
  issueIf(issues, origin.scheme !== "https", "canary origin must use HTTPS");
  issueIf(issues, origin.hostname !== "localhost", "canary origin hostname must be localhost");
  issueIf(issues, !((Number.isSafeInteger(origin.port) && origin.port >= 1024 && origin.port <= 65535) || (failed && origin.port === null)), "canary origin must use a valid unprivileged port");
  issueIf(issues, origin.scope !== (origin.port === null ? null : `https://localhost:${origin.port}/`), "canary scope must be the exact root-like same origin");
  issueIf(issues, origin.exposure !== "LOOPBACK_ONLY", "canary server exposure must be loopback only");
}

function canaryToolchainIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.toolchain, TOOLCHAIN_KEYS), "toolchain must use the exact closed schema");
  issueIf(issues, value.toolchain?.caddyVersion !== CADDY_VERSION, "Caddy version must match the reviewed pin");
  issueIf(issues, value.toolchain?.caddyArchiveSha256 !== CADDY_ARCHIVE_SHA256, "Caddy archive SHA-256 must match the reviewed pin");
  issueIf(issues, value.toolchain?.caddyArchiveSha512 !== CADDY_ARCHIVE_SHA512, "Caddy archive SHA-512 must match the reviewed pin");
  issueIf(issues, !validSha64OrNull(value.toolchain?.caddyExecutableSha256, failed), "Caddy executable SHA-256 is invalid");
  issueIf(issues, value.toolchain?.playwrightCoreVersion !== PLAYWRIGHT_CORE_VERSION, "Playwright Core version must match the lockfile pin");
  issueIf(issues, value.toolchain?.playwrightCoreSri !== PLAYWRIGHT_CORE_SRI, "Playwright Core SRI must match the reviewed pin");
}

function canaryBrowserIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.browser, BROWSER_KEYS), "browser must use the exact closed schema");
  const browser = value.browser ?? {};
  issueIf(issues, browser.productName !== "Microsoft Edge" && !(failed && browser.productName === null), "browser product must be Microsoft Edge");
  issueIf(issues, !VERSION4.test(String(browser.fullVersion || "")) && !(failed && browser.fullVersion === null), "browser version must contain four parts");
  issueIf(issues, !validSha64OrNull(browser.executableSha256, failed), "browser executable SHA-256 is invalid");
}

function canaryRunnerIssues(value, issues) {
  issueIf(issues, !exactOrderedKeys(value.runner, RUNNER_KEYS), "runner must use the exact closed schema");
  issueIf(issues, value.runner?.requestedLabel !== "windows-latest", "runner label must be windows-latest");
  issueIf(issues, value.runner?.environment !== "github-hosted", "runner environment must be github-hosted");
  issueIf(issues, !RUNNER_IDENTITY.test(String(value.runner?.imageOS || "")), "runner imageOS is invalid");
  issueIf(issues, !RUNNER_IDENTITY.test(String(value.runner?.imageVersion || "")), "runner imageVersion is invalid");
}

function canaryCertificateIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.certificate, CERTIFICATE_KEYS), "certificate must use the exact closed schema");
  const certificate = value.certificate ?? {};
  issueIf(issues, !validSha64OrNull(certificate.rootSha256, failed), "root certificate SHA-256 is invalid");
  issueIf(issues, !validSha64OrNull(certificate.leafSha256, failed), "leaf certificate SHA-256 is invalid");
  issueIf(issues, !validNonemptyOrNull(certificate.subjectName, failed), "leaf certificate subject is invalid");
  issueIf(issues, !validNonemptyOrNull(certificate.issuer, failed), "leaf certificate issuer is invalid");
  issueIf(issues, (!Number.isSafeInteger(certificate.validFromUnix) || certificate.validFromUnix <= 0) && !(failed && certificate.validFromUnix === null), "leaf certificate valid-from time is invalid");
  issueIf(issues, (!Number.isSafeInteger(certificate.validToUnix) || certificate.validToUnix <= certificate.validFromUnix) && !(failed && certificate.validToUnix === null), "leaf certificate valid-to time is invalid");
  issueIf(issues, !["TLS 1.2", "TLS 1.3"].includes(value.tlsProtocol) && !(failed && value.tlsProtocol === null), "TLS protocol must be 1.2 or 1.3");
}

function canaryNetworkProofIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.networkProof, NETWORK_PROOF_KEYS), "networkProof must use the exact closed schema");
  issueIf(issues, !((Number.isSafeInteger(value.networkProof?.expectedResponseCount) && value.networkProof.expectedResponseCount >= 1) || (failed && value.networkProof?.expectedResponseCount === null)), "network expected response count is invalid");
  issueIf(issues, !validNonnegativeOrNull(value.networkProof?.verifiedResponseCount, failed), "network verified response count is invalid");
  for (const key of ["responseSetSha256", "responseHeaderSetSha256", "caddyAccessLogSha256"]) issueIf(issues, !validSha64OrNull(value.networkProof?.[key], failed), `${key} is invalid`);
}

function canaryCacheProofIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.cacheProof, CACHE_PROOF_KEYS), "cacheProof must use the exact closed schema");
  const cacheProof = value.cacheProof ?? {};
  issueIf(issues, !/^math-quest-static-v1\.0\.0-beta\.9-[a-f0-9]{64}$/u.test(String(cacheProof.physicalCacheName || "")) && !(failed && cacheProof.physicalCacheName === null), "physical cache name must bind the logical name and detached manifest SHA-256");
  issueIf(issues, value.reconciliationState === "RECONCILED"
    && cacheProof.physicalCacheName !== `math-quest-static-v1.0.0-beta.9-${value.runtimeIdentity?.candidateReleaseManifestSha256}`, "physical cache name must exactly bind the candidate release-manifest SHA-256");
  for (const key of ["expectedEntryCount", "waitingEntryCount", "activeEntryCount", "offlineEntryCount", "repairedEntryCount", "unexpectedCacheCount", "stagingCacheCount"]) {
    issueIf(issues, !validNonnegativeOrNull(cacheProof[key], failed), `${key} is invalid`);
  }
  for (const key of ["waitingSetSha256", "activeSetSha256", "offlineSetSha256", "repairedSetSha256"]) issueIf(issues, !validSha64OrNull(cacheProof[key], failed), `${key} is invalid`);
}

function canaryOfflineProofIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.offlineProof, OFFLINE_PROOF_KEYS), "offlineProof must use the exact closed schema");
  for (const key of ["responseFromServiceWorker", "originPortClosed", "backendPortClosed"]) issueIf(issues, !validBooleanOrNull(value.offlineProof?.[key], failed), `${key} is invalid`);
  issueIf(issues, !validSha64OrNull(value.offlineProof?.controllerScriptUrlSha256, failed), "offline controller script URL SHA-256 is invalid");
  for (const key of ["readinessRelease", "readinessBuildId", "readinessCacheIdentity"]) issueIf(issues, !validNonemptyOrNull(value.offlineProof?.[key], failed), `${key} is invalid`);
}

function canaryNavigationProofIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.navigationProof, NAVIGATION_PROOF_KEYS), "navigationProof must use the exact closed schema");
  for (const key of ["expectedReloadCount", "observedReloadCount", "unexpectedNavigationCount"]) issueIf(issues, !validNonnegativeOrNull(value.navigationProof?.[key], failed), `${key} is invalid`);
  for (const key of ["initialUrlSha256", "navigationSetSha256"]) issueIf(issues, !validSha64OrNull(value.navigationProof?.[key], failed), `${key} is invalid`);
}

function canaryPrivacyIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.privacy, PRIVACY_KEYS), "privacy must use the exact closed schema");
  issueIf(issues, value.privacy?.profileMode !== "anonymous", "the canary profile must be anonymous");
  issueIf(issues, value.privacy?.syntheticOnly !== true, "the canary may use only synthetic progress");
  issueIf(issues, value.privacy?.childIdentityStored !== false, "the canary must not store child identity");
  issueIf(issues, value.privacy?.automaticUpload !== false, "the canary must not upload gameplay data");
  issueIf(issues, !validSha64OrNull(value.privacy?.requestMetadataSha256, failed), "request metadata SHA-256 is invalid");
  for (const key of PRIVACY_KEYS.slice(5)) issueIf(issues, !validNonnegativeOrNull(value.privacy?.[key], failed), `${key} is invalid`);
}

function validLiteralOrNull(value, expected, failed) {
  return value === expected || (failed && value === null);
}

function canaryProgressIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.progress, PROGRESS_KEYS), "progress must use the exact closed schema");
  const progress = value.progress ?? {};
  issueIf(issues, progress.sourceKey !== "math-quest:v2", "source progress key must remain Beta 1 storage");
  issueIf(issues, progress.protectedKey !== "math-quest:progress:v2", "protected progress key must remain current storage");
  issueIf(issues, !validSha64OrNull(progress.sourceSha256, failed), "source progress SHA-256 is invalid");
  issueIf(issues, !validSha64OrNull(progress.protectedSha256, failed), "protected progress SHA-256 is invalid");
  issueIf(issues, !validLiteralOrNull(progress.sourceSchemaVersion, 2, failed), "source progress schema must be 2");
  issueIf(issues, !validLiteralOrNull(progress.targetSchemaVersion, 3, failed), "protected progress schema must be 3");
  issueIf(issues, !validLiteralOrNull(progress.sourceEarnedLevel, 2, failed), "synthetic Beta 1 earned level must be 2");
  issueIf(issues, !validLiteralOrNull(progress.sourcePracticeCount, 3, failed), "synthetic Beta 1 practice count must be 3");
  issueIf(issues, !validLiteralOrNull(progress.protectedEarnedLevel, 1, failed), "fresh protected earned level must be 1");
  issueIf(issues, !validLiteralOrNull(progress.protectedPracticeCount, 0, failed), "fresh protected practice count must be 0");
  for (const key of ["expectedFreshSha256", "retiredProjectionSha256", "freshProjectionSha256", "retainedMarkerSha256", "retainedNoticeSha256"]) issueIf(issues, !validSha64OrNull(progress[key], failed), `${key} is invalid`);
  for (const key of ["retiredProjectionFieldCount", "freshProjectionFieldCount"]) issueIf(issues, !validNonnegativeOrNull(progress[key], failed), `${key} is invalid`);
}

function canaryCheckIssues(value, issues) {
  issueIf(issues, !Array.isArray(value.checks) || value.checks.length !== TRUSTED_HTTPS_CANARY_CHECK_IDS.length, "checks must contain the exact ordered canary set");
  if (Array.isArray(value.checks)) {
    value.checks.forEach((check, index) => {
      issueIf(issues, !exactOrderedKeys(check, CHECK_KEYS), `check ${index + 1} must use the exact closed schema`);
      issueIf(issues, check?.id !== TRUSTED_HTTPS_CANARY_CHECK_IDS[index], `check ${index + 1} has the wrong id`);
      issueIf(issues, !CHECK_STATUSES.has(check?.status), `check ${index + 1} has an invalid status`);
      issueIf(issues, typeof check?.detail !== "string" || check.detail.length < 1 || check.detail.length > 240, `check ${index + 1} detail is invalid`);
    });
  }
}

function canaryTeardownIssues(value, failed, issues) {
  issueIf(issues, !exactOrderedKeys(value.teardown, TEARDOWN_KEYS), "teardown must use the exact closed schema");
  const teardown = value.teardown ?? {};
  issueIf(issues, !["PASS", "FAIL"].includes(teardown.status), "teardown status must be PASS or FAIL");
  for (const key of ["browserClosed", "caddyStopped", "backendStopped", "certificateRemoved", "profileRemoved", "temporaryFilesRemoved", "portClosed"]) issueIf(issues, typeof teardown[key] !== "boolean", `${key} must be boolean`);
  issueIf(issues, !SHA40.test(String(teardown.certificateThumbprint || "")) && !(failed && teardown.certificateThumbprint === null), "teardown certificate thumbprint is invalid");
  issueIf(issues, !validNonnegativeOrNull(teardown.remainingMatchingCertificateCount, failed), "remaining certificate count is invalid");
  issueIf(issues, !validNonnegativeOrNull(teardown.observedProfileProcessCount, failed), "observed profile process count is invalid");
  issueIf(issues, !validSha64OrNull(teardown.observedProfileProcessSetSha256, failed), "observed profile process-set SHA-256 is invalid");
  issueIf(issues, !validNonnegativeOrNull(teardown.remainingProfileProcessCount, failed), "remaining profile process count is invalid");
  issueIf(issues, !validSha64OrNull(teardown.remainingProfileProcessSetSha256, failed), "remaining profile process-set SHA-256 is invalid");
}

function canaryCleanupPass(value) {
  const teardown = value.teardown ?? {};
  return teardown.status === "PASS"
    && ["browserClosed", "caddyStopped", "backendStopped", "certificateRemoved", "profileRemoved", "temporaryFilesRemoved", "portClosed"].every((key) => teardown[key] === true)
    && SHA40.test(String(teardown.certificateThumbprint || ""))
    && teardown.remainingMatchingCertificateCount === 0
    && teardown.remainingProfileProcessCount === 0
    && teardown.remainingProfileProcessSetSha256 === EMPTY_PROFILE_PROCESS_SET_SHA256;
}

function canaryCleanupVerdictIssues(value, cleanupPass, issues) {
  issueIf(issues, value.teardown?.status === "PASS" && !cleanupPass, "PASS teardown evidence requires every cleanup and absence proof");
}

function canaryReconciledNetworkIssues(value, issues) {
  issueIf(issues, value.networkProof?.verifiedResponseCount !== value.networkProof?.expectedResponseCount, "RECONCILED evidence requires every detached HTTPS response to verify");
}

function canaryReconciledCacheIssues(value, issues) {
  const cache = value.cacheProof ?? {};
  const countMismatch = ["waitingEntryCount", "activeEntryCount", "offlineEntryCount", "repairedEntryCount"]
    .some((key) => cache[key] !== cache.expectedEntryCount);
  const setMismatch = ["waitingSetSha256", "offlineSetSha256", "repairedSetSha256"]
    .some((key) => cache[key] !== cache.activeSetSha256);
  issueIf(issues, countMismatch || setMismatch || cache.unexpectedCacheCount !== 0 || cache.stagingCacheCount !== 0,
    "RECONCILED evidence requires the exact detached cache set at waiting, active, and repaired phases");
}

function canaryReconciledNavigationIssues(value, issues) {
  const navigationProof = value.navigationProof ?? {};
  issueIf(issues, navigationProof.expectedReloadCount !== 1
    || navigationProof.observedReloadCount !== 1
    || navigationProof.unexpectedNavigationCount !== 0, "RECONCILED evidence requires exactly one reviewed current-tab reload and no unexpected navigation");
}

function canaryReconciledOfflineIssues(value, issues) {
  const offlineProof = value.offlineProof ?? {};
  issueIf(issues, offlineProof.responseFromServiceWorker !== true
    || offlineProof.originPortClosed !== true
    || offlineProof.backendPortClosed !== true
    || offlineProof.readinessRelease !== "1.0.0-beta.9"
    || offlineProof.readinessBuildId !== "math-quest-pwa-v1.0.0-beta.9"
    || offlineProof.readinessCacheIdentity !== "math-quest-static-v1.0.0-beta.9", "RECONCILED evidence requires a service-worker cold response with both server ports closed and exact readiness identity");
}

function canaryReconciledProgressIssues(value, issues) {
  const progress = value.progress ?? {};
  issueIf(issues, progress.protectedSha256 !== progress.expectedFreshSha256
    || progress.sourceSha256 === progress.protectedSha256
    || progress.retiredProjectionSha256 === progress.freshProjectionSha256
    || progress.retiredProjectionFieldCount < 1
    || progress.freshProjectionFieldCount < 1
    || progress.retainedMarkerSha256 !== RETAINED_BETA1_COMPLETE_SHA256
    || progress.retainedNoticeSha256 !== RETAINED_BETA1_FRESH_START_NOTICE_SHA256, "RECONCILED evidence requires byte-identical retired Beta 1 retention, an independently fresh protected Beta 9 state, and the exact visible grown-up notice");
}

function canaryReconciledPrivacyIssues(value, issues) {
  const nonzeroRequests = PRIVACY_KEYS.slice(5).some((key) => value.privacy?.[key] !== 0);
  issueIf(issues, nonzeroRequests, "RECONCILED evidence requires zero query-bearing, external, sensitive, body-bearing, or active-channel requests");
}

function canaryTeardownCheckIssues(value, issues) {
  const teardownCheck = Array.isArray(value.checks) ? value.checks.at(-1) : null;
  issueIf(issues, teardownCheck?.status !== (value.teardown?.status === "PASS" ? "PASS" : "FAIL"), "TEARDOWN_COMPLETE must mirror the teardown verdict");
}

function canaryReconciliationIssues(value, issues) {
  const allChecksPass = Array.isArray(value.checks) && value.checks.every((check) => check.status === "PASS");
  const cleanupPass = canaryCleanupPass(value);
  const teardownPass = cleanupPass
    && value.teardown?.observedProfileProcessCount >= 1;
  canaryCleanupVerdictIssues(value, cleanupPass, issues);
  if (value.reconciliationState === "RECONCILED") {
    issueIf(issues, !allChecksPass, "RECONCILED evidence requires every canary check to pass");
    issueIf(issues, !teardownPass, "RECONCILED evidence requires complete teardown");
    canaryReconciledNetworkIssues(value, issues);
    canaryReconciledCacheIssues(value, issues);
    canaryReconciledNavigationIssues(value, issues);
    canaryReconciledOfflineIssues(value, issues);
    canaryReconciledProgressIssues(value, issues);
    canaryReconciledPrivacyIssues(value, issues);
  } else {
    issueIf(issues, allChecksPass, "FAILED evidence must identify at least one failed or unrun check");
  }
  canaryTeardownCheckIssues(value, issues);
}

function canaryExpectedWorkflowIssues(value, expected, issues) {
  if (expected.workflowRunId !== undefined && value.workflowRunId !== expected.workflowRunId) issues.push("workflowRunId does not match the live workflow run");
  if (expected.workflowRunAttempt !== undefined && value.workflowRunAttempt !== expected.workflowRunAttempt) issues.push("workflowRunAttempt does not match the live workflow attempt");
  if (expected.requireReconciled === true && value.reconciliationState !== "RECONCILED") issues.push("trusted-HTTPS canary is not RECONCILED");
}

function canaryExpectedIdentityIssues(value, expected, issues) {
  if (expected.candidateSha !== undefined && value.candidateSha !== expected.candidateSha) issues.push("candidateSha does not match the requested candidate");
  if (expected.runnerImageOS !== undefined && value.runner?.imageOS !== expected.runnerImageOS) issues.push("runner imageOS does not match the live runner");
  if (expected.runnerImageVersion !== undefined && value.runner?.imageVersion !== expected.runnerImageVersion) issues.push("runner imageVersion does not match the live runner");
  canaryExpectedWorkflowIssues(value, expected, issues);
}

export function parseTrustedHttpsCanaryEvidence(text, expected = {}) {
  const source = String(text);
  const issues = [];
  const value = readCanaryEvidenceFields(source, issues);

  const failed = value.reconciliationState === "FAILED";
  canarySchemaIssues(value, issues);
  canaryProvenanceIssues(value, issues);
  canaryWorkflowIssues(value, issues);
  canaryBeta1IdentityIssues(value, issues);
  canaryRuntimeIdentityIssues(value, failed, issues);
  canaryOriginIssues(value, failed, issues);
  canaryToolchainIssues(value, failed, issues);
  canaryBrowserIssues(value, failed, issues);
  canaryRunnerIssues(value, issues);
  canaryCertificateIssues(value, failed, issues);
  canaryNetworkProofIssues(value, failed, issues);
  canaryCacheProofIssues(value, failed, issues);
  canaryOfflineProofIssues(value, failed, issues);
  canaryNavigationProofIssues(value, failed, issues);
  canaryPrivacyIssues(value, failed, issues);
  canaryProgressIssues(value, failed, issues);
  canaryCheckIssues(value, issues);
  canaryTeardownIssues(value, failed, issues);
  canaryReconciliationIssues(value, issues);
  canaryExpectedIdentityIssues(value, expected, issues);

  return Object.freeze({ valid: issues.length === 0, value: Object.freeze({ ...value }), issues: Object.freeze(issues) });
}
