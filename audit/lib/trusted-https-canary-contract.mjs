import { createHash } from "node:crypto";

export const TRUSTED_HTTPS_CANARY_SCHEMA_VERSION = 1;
export const TRUSTED_HTTPS_CANARY_KIND = "TRUSTED_HTTPS_CANARY_RECONCILIATION_V1";
export const TRUSTED_HTTPS_CANARY_STATUS = "TECHNICAL_CANARY_NOT_RELEASE_CERTIFICATION";
export const TRUSTED_HTTPS_CANARY_WORKFLOW = ".github/workflows/trusted-https-canary.yml";
export const TRUSTED_HTTPS_CANARY_TAG = "v1.0.0-beta.8";
export const TRUSTED_HTTPS_CANARY_BETA1_TAG = "v1.0.0-beta.1";
export const TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT = "140693bff04733ce890a0a8be2d7c9499dfa24cc";
export const TRUSTED_HTTPS_CANARY_BETA1_COMMIT = "f989bf3bfe0c40824c4d2ab6f0ec2fb3450e314e";
export const CADDY_VERSION = "2.11.4";
export const CADDY_ARCHIVE_SHA256 = "1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf";
export const CADDY_ARCHIVE_SHA512 = "cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35";
export const PLAYWRIGHT_CORE_VERSION = "1.62.1";
export const PLAYWRIGHT_CORE_SRI = "sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==";
export const RETAINED_BETA1_COMPLETE_VALUE = "beta1-retained-current-curriculum-v1";
export const RETAINED_BETA1_COMPLETE_SHA256 = createHash("sha256").update(RETAINED_BETA1_COMPLETE_VALUE, "utf8").digest("hex");
export const RETAINED_BETA1_FRESH_START_NOTICE = "A Beta 1 save from the earlier curriculum remains stored separately on this device. Beta 8 starts fresh so old mastery is not applied to changed skills.";
export const RETAINED_BETA1_FRESH_START_NOTICE_SHA256 = createHash("sha256").update(RETAINED_BETA1_FRESH_START_NOTICE, "utf8").digest("hex");
export const EMPTY_PROFILE_PROCESS_SET_SHA256 = createHash("sha256").update("[]\n").digest("hex");
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
  "RETIRED_BETA1_PRESERVED_FRESH_START",
  "CANDIDATE_ACTIVE_CACHE_READY",
  "CANDIDATE_OFFLINE_COLD_RELAUNCH",
  "CACHE_CORRUPTION_DETECTED",
  "TRANSACTIONAL_REPAIR_SUCCEEDED",
  "RUNTIME_REQUEST_ALLOWLIST",
  "TEARDOWN_COMPLETE",
]);

export const TOP_LEVEL_KEYS = Object.freeze([
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
export const BETA1_KEYS = Object.freeze(["tag", "tagObjectSha", "commitSha"]);
export const RUNTIME_KEYS = Object.freeze([
  "beta1SnapshotSha256",
  "candidateSnapshotSha256",
  "candidateReleaseManifestSha256",
  "candidateServiceWorkerSha256",
  "candidateIndexSha256",
]);
export const ORIGIN_KEYS = Object.freeze(["scheme", "hostname", "port", "scope", "exposure"]);
export const TOOLCHAIN_KEYS = Object.freeze([
  "caddyVersion",
  "caddyArchiveSha256",
  "caddyArchiveSha512",
  "caddyExecutableSha256",
  "playwrightCoreVersion",
  "playwrightCoreSri",
]);
export const BROWSER_KEYS = Object.freeze(["productName", "fullVersion", "executableSha256"]);
export const RUNNER_KEYS = Object.freeze(["requestedLabel", "environment", "imageOS", "imageVersion"]);
export const CERTIFICATE_KEYS = Object.freeze([
  "rootSha256",
  "leafSha256",
  "subjectName",
  "issuer",
  "validFromUnix",
  "validToUnix",
]);
export const NETWORK_PROOF_KEYS = Object.freeze([
  "expectedResponseCount",
  "verifiedResponseCount",
  "responseSetSha256",
  "responseHeaderSetSha256",
  "caddyAccessLogSha256",
]);
export const CACHE_PROOF_KEYS = Object.freeze([
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
export const OFFLINE_PROOF_KEYS = Object.freeze([
  "responseFromServiceWorker",
  "originPortClosed",
  "backendPortClosed",
  "controllerScriptUrlSha256",
  "readinessRelease",
  "readinessBuildId",
  "readinessCacheIdentity",
]);
export const NAVIGATION_PROOF_KEYS = Object.freeze([
  "expectedReloadCount",
  "observedReloadCount",
  "unexpectedNavigationCount",
  "initialUrlSha256",
  "navigationSetSha256",
]);
export const PRIVACY_KEYS = Object.freeze([
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
export const PROGRESS_KEYS = Object.freeze([
  "sourceKey",
  "protectedKey",
  "sourceSha256",
  "protectedSha256",
  "sourceSchemaVersion",
  "targetSchemaVersion",
  "sourceEarnedLevel",
  "sourcePracticeCount",
  "protectedEarnedLevel",
  "protectedPracticeCount",
  "expectedFreshSha256",
  "retiredProjectionSha256",
  "freshProjectionSha256",
  "retiredProjectionFieldCount",
  "freshProjectionFieldCount",
  "retainedMarkerSha256",
  "retainedNoticeSha256",
]);
export const CHECK_KEYS = Object.freeze(["id", "status", "detail"]);
export const TEARDOWN_KEYS = Object.freeze([
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

export const SHA40 = /^[a-f0-9]{40}$/u;
export const SHA64 = /^[a-f0-9]{64}$/u;
export const VERSION4 = /^\d+\.\d+\.\d+\.\d+$/u;
export const RUN_NUMBER = /^[1-9]\d*$/u;
export const RUNNER_IDENTITY = /^[A-Za-z0-9._-]{1,100}$/u;
export const UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
export const CHECK_STATUSES = new Set(["PASS", "FAIL", "NOT_RUN"]);
