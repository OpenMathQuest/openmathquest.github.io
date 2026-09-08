import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  PLAYWRIGHT_CORE_SRI,
  PLAYWRIGHT_CORE_VERSION,
  RETAINED_BETA1_COMPLETE_SHA256,
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
} from "../lib/trusted-https-canary.mjs";

const sha = (character) => character.repeat(64);
const candidateSha = "1".repeat(40);

function fixtureRuntimeIdentity() {
  return {
  beta1SnapshotSha256: sha("a"),
  candidateSnapshotSha256: sha("b"),
  candidateReleaseManifestSha256: sha("c"),
  candidateServiceWorkerSha256: sha("d"),
  candidateIndexSha256: sha("e"),
};
}

function fixtureOrigin() {
  return {
  scheme: "https",
  hostname: "localhost",
  port: 43123,
  scope: "https://localhost:43123/",
  exposure: "LOOPBACK_ONLY",
};
}

function fixtureToolchain() {
  return {
  caddyVersion: CADDY_VERSION,
  caddyArchiveSha256: CADDY_ARCHIVE_SHA256,
  caddyArchiveSha512: CADDY_ARCHIVE_SHA512,
  caddyExecutableSha256: sha("f"),
  playwrightCoreVersion: PLAYWRIGHT_CORE_VERSION,
  playwrightCoreSri: PLAYWRIGHT_CORE_SRI,
};
}

function fixtureCertificate() {
  return {
  rootSha256: sha("2"),
  leafSha256: sha("3"),
  subjectName: "localhost",
  issuer: "Caddy Local Authority - ECC Intermediate",
  validFromUnix: 1_786_000_000,
  validToUnix: 1_786_086_400,
};
}

function fixtureNetworkProof() {
  return {
  expectedResponseCount: 16,
  verifiedResponseCount: 16,
  responseSetSha256: sha("6"),
  responseHeaderSetSha256: sha("7"),
  caddyAccessLogSha256: sha("8"),
};
}

function fixtureCacheProof() {
  return {
  physicalCacheName: `math-quest-static-v1.0.0-beta.9-${sha("c")}`,
  expectedEntryCount: 14,
  waitingEntryCount: 14,
  activeEntryCount: 14,
  offlineEntryCount: 14,
  repairedEntryCount: 14,
  waitingSetSha256: sha("9"),
  activeSetSha256: sha("9"),
  offlineSetSha256: sha("9"),
  repairedSetSha256: sha("9"),
  unexpectedCacheCount: 0,
  stagingCacheCount: 0,
};
}

function fixtureOfflineProof() {
  return {
  responseFromServiceWorker: true,
  originPortClosed: true,
  backendPortClosed: true,
  controllerScriptUrlSha256: sha("a"),
  readinessRelease: "1.0.0-beta.9",
  readinessBuildId: "math-quest-pwa-v1.0.0-beta.9",
  readinessCacheIdentity: "math-quest-static-v1.0.0-beta.9",
};
}

function fixtureNavigationProof() {
  return {
  expectedReloadCount: 1,
  observedReloadCount: 1,
  unexpectedNavigationCount: 0,
  initialUrlSha256: sha("b"),
  navigationSetSha256: sha("c"),
};
}

function fixturePrivacy() {
  return {
  profileMode: "anonymous",
  syntheticOnly: true,
  childIdentityStored: false,
  automaticUpload: false,
  requestMetadataSha256: sha("d"),
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
};
}

function fixtureProgress() {
  return {
  sourceKey: "math-quest:v2",
  protectedKey: "math-quest:progress:v2",
  sourceSha256: sha("4"),
  protectedSha256: sha("5"),
  sourceSchemaVersion: 2,
  targetSchemaVersion: 3,
  sourceEarnedLevel: 2,
  sourcePracticeCount: 3,
  protectedEarnedLevel: 1,
  protectedPracticeCount: 0,
  expectedFreshSha256: sha("5"),
  retiredProjectionSha256: sha("e"),
  freshProjectionSha256: sha("6"),
  retiredProjectionFieldCount: 57,
  freshProjectionFieldCount: 42,
  retainedMarkerSha256: RETAINED_BETA1_COMPLETE_SHA256,
  retainedNoticeSha256: RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
};
}

function fixtureTeardown() {
  return {
  status: "PASS",
  browserClosed: true,
  caddyStopped: true,
  backendStopped: true,
  certificateRemoved: true,
  profileRemoved: true,
  temporaryFilesRemoved: true,
  portClosed: true,
  certificateThumbprint: "1".repeat(40),
  remainingMatchingCertificateCount: 0,
  observedProfileProcessCount: 1,
  observedProfileProcessSetSha256: sha("f"),
  remainingProfileProcessCount: 0,
  remainingProfileProcessSetSha256: EMPTY_PROFILE_PROCESS_SET_SHA256,
};
}

export function validEvidence() {
  return {
    schemaVersion: TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
    artifactKind: TRUSTED_HTTPS_CANARY_KIND,
    certificationStatus: TRUSTED_HTTPS_CANARY_STATUS,
    reconciliationState: "RECONCILED",
    repository: "OpenMathQuest/openmathquest.github.io",
    ref: "refs/heads/main",
    candidateSha,
    intendedReleaseTag: TRUSTED_HTTPS_CANARY_TAG,
    workflowFile: TRUSTED_HTTPS_CANARY_WORKFLOW,
    workflowRunId: "123",
    workflowRunAttempt: "1",
    observedAtUtc: "2026-08-03T12:34:56.000Z",
    hostQualificationState: "DEFERRED_PRERELEASE",
    beta1Identity: {
      tag: TRUSTED_HTTPS_CANARY_BETA1_TAG,
      tagObjectSha: TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
      commitSha: TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
    },
    runtimeIdentity: fixtureRuntimeIdentity(),
    origin: fixtureOrigin(),
    toolchain: fixtureToolchain(),
    browser: { productName: "Microsoft Edge", fullVersion: "140.0.1.2", executableSha256: sha("1") },
    runner: { requestedLabel: "windows-latest", environment: "github-hosted", imageOS: "win25", imageVersion: "20260801.1" },
    certificate: fixtureCertificate(),
    tlsProtocol: "TLS 1.3",
    networkProof: fixtureNetworkProof(),
    cacheProof: fixtureCacheProof(),
    offlineProof: fixtureOfflineProof(),
    navigationProof: fixtureNavigationProof(),
    privacy: fixturePrivacy(),
    progress: fixtureProgress(),
    checks: TRUSTED_HTTPS_CANARY_CHECK_IDS.map((id) => ({ id, status: "PASS", detail: `Effect-sensitive proof for ${id}.` })),
    teardown: fixtureTeardown(),
  };
}
