import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  PLAYWRIGHT_CORE_SRI,
  PLAYWRIGHT_CORE_VERSION,
  RETAINED_BETA1_COMPLETE_VALUE,
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_KIND,
  TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
  TRUSTED_HTTPS_CANARY_STATUS,
  TRUSTED_HTTPS_CANARY_TAG,
  TRUSTED_HTTPS_CANARY_WORKFLOW,
  canonicalCanaryEvidence,
  canonicalCertificateThumbprint,
  runCanaryTeardown,
  sha256Bytes,
} from "./trusted-https-canary.mjs";
import { SOURCE_KEY, PROTECTED_KEY, hashFileBytes, setCheck, projectionFieldCount } from "./trusted-https-canary-runner-platform.mjs";

export async function finishCanaryRun(state) {
  const teardownPass = await finishCanaryTeardown(state);
  const evidence = buildCanaryRunEvidence(state, teardownPass);
  await mkdir(path.dirname(state.outputPath), { recursive: true });
  await writeFile(state.outputPath, canonicalCanaryEvidence(evidence), "utf8");
  if (state.failure) throw state.failure;
  if (!teardownPass) throw new Error("Canary behavior passed, but disposable teardown did not.");
}

async function finishCanaryTeardown(state) {
  const teardownResults = await runCanaryTeardown(state.cleanup);
  const teardownPass = teardownResults.every((result) => result.ok)
    && Object.values(state.cleanupFlags).every(Boolean);
  setCheck(state.checks, "TEARDOWN_COMPLETE", teardownPass ? "PASS" : "FAIL", teardownPass
    ? "Edge, Caddy, backend, certificate trust, profile, ports, and temporary files were removed."
    : `Teardown failed: ${teardownResults.filter((item) => !item.ok).map((item) => item.id).join(", ") || "one or more cleanup proofs were false"}.`);
  return teardownPass;
}

function buildCanaryRunEvidence(state, teardownPass) {
  const origin = state.originPort ? `https://localhost:${state.originPort}/` : null;
  const sourceState = state.sourceBytes ? JSON.parse(state.sourceBytes) : null;
  const protectedState = state.protectedBytes ? JSON.parse(state.protectedBytes) : null;
  const evidence = {
    schemaVersion: TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
    artifactKind: TRUSTED_HTTPS_CANARY_KIND,
    certificationStatus: TRUSTED_HTTPS_CANARY_STATUS,
    reconciliationState: !state.failure && teardownPass && state.checks.every((item) => item.status === "PASS") ? "RECONCILED" : "FAILED",
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    candidateSha: state.candidateSha,
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
    runtimeIdentity: canaryRuntimeIdentityEvidence(state),
    origin: { scheme: "https", hostname: "localhost", port: state.originPort || null, scope: origin, exposure: "LOOPBACK_ONLY" },
    toolchain: canaryToolchainEvidence(state),
    browser: { productName: state.browserVersion ? "Microsoft Edge" : null, fullVersion: state.browserVersion, executableSha256: state.edgeSha256 },
    runner: { requestedLabel: "windows-latest", environment: process.env.RUNNER_ENVIRONMENT, imageOS: process.env.ImageOS, imageVersion: process.env.ImageVersion },
    certificate: canaryCertificateEvidence(state),
    tlsProtocol: canaryTlsProtocol(state.tls),
    networkProof: canaryNetworkProofEvidence(state),
    cacheProof: canaryCacheProofEvidence(state),
    offlineProof: canaryOfflineProofEvidence(state),
    navigationProof: canaryNavigationProofEvidence(state),
    privacy: canaryPrivacyEvidence(state),
    progress: canaryProgressEvidence(state, sourceState, protectedState),
    checks: state.checks,
    teardown: canaryTeardownEvidence(state, teardownPass),
  };
  return evidence;
}

function canaryRuntimeIdentityEvidence(state) {
  return state.snapshots ? { ...state.snapshots.identity } : {
    beta1SnapshotSha256: null,
    candidateSnapshotSha256: null,
    candidateReleaseManifestSha256: null,
    candidateServiceWorkerSha256: null,
    candidateIndexSha256: null,
  };
}

function canaryToolchainEvidence(state) {
  return {
    caddyVersion: CADDY_VERSION,
    caddyArchiveSha256: CADDY_ARCHIVE_SHA256,
    caddyArchiveSha512: CADDY_ARCHIVE_SHA512,
    caddyExecutableSha256: state.caddyExecutableSha256,
    playwrightCoreVersion: PLAYWRIGHT_CORE_VERSION,
    playwrightCoreSri: PLAYWRIGHT_CORE_SRI,
  };
}

function canaryCertificateEvidence(state) {
  const tls = state.tls ?? {};
  return {
    rootSha256: state.rootCertificate ? sha256Bytes(state.rootCertificate.raw) : null,
    leafSha256: tls.sha256 || null,
    subjectName: tls.subjectName || null,
    issuer: tls.issuer || null,
    validFromUnix: tls.validFrom ?? null,
    validToUnix: tls.validTo ?? null,
  };
}

function canaryNetworkProofEvidence(state) {
  return state.networkProof ? {
    expectedResponseCount: state.networkProof.expectedResponseCount,
    verifiedResponseCount: state.networkProof.verifiedResponseCount,
    responseSetSha256: state.networkProof.responseSetSha256,
    responseHeaderSetSha256: state.networkProof.responseHeaderSetSha256,
    caddyAccessLogSha256: state.networkProof.caddyAccessLogSha256 ?? null,
  } : {
    expectedResponseCount: null,
    verifiedResponseCount: null,
    responseSetSha256: null,
    responseHeaderSetSha256: null,
    caddyAccessLogSha256: null,
  };
}

function canaryCacheProofEvidence(state) {
  return state.waitingCacheProof && state.activeCacheProof && state.offlineCacheProof && state.repairedCacheProof ? {
    physicalCacheName: state.waitingCacheProof.physicalCacheName,
    expectedEntryCount: state.waitingCacheProof.entryCount,
    waitingEntryCount: state.waitingCacheProof.entryCount,
    activeEntryCount: state.activeCacheProof.entryCount,
    offlineEntryCount: state.offlineCacheProof.entryCount,
    repairedEntryCount: state.repairedCacheProof.entryCount,
    waitingSetSha256: state.waitingCacheProof.setSha256,
    activeSetSha256: state.activeCacheProof.setSha256,
    offlineSetSha256: state.offlineCacheProof.setSha256,
    repairedSetSha256: state.repairedCacheProof.setSha256,
    unexpectedCacheCount: Math.max(state.waitingCacheProof.unexpectedCacheCount, state.activeCacheProof.unexpectedCacheCount, state.offlineCacheProof.unexpectedCacheCount, state.repairedCacheProof.unexpectedCacheCount),
    stagingCacheCount: Math.max(state.waitingCacheProof.stagingCacheCount, state.activeCacheProof.stagingCacheCount, state.offlineCacheProof.stagingCacheCount, state.repairedCacheProof.stagingCacheCount),
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
  };
}

function canaryOfflineProofEvidence(state) {
  return state.offlineProof || {
    responseFromServiceWorker: null,
    originPortClosed: null,
    backendPortClosed: null,
    controllerScriptUrlSha256: null,
    readinessRelease: null,
    readinessBuildId: null,
    readinessCacheIdentity: null,
  };
}

function canaryNavigationProofEvidence(state) {
  return state.initialCandidateUrlSha256 && state.candidateMainFrameNavigations.length ? {
    expectedReloadCount: 1,
    observedReloadCount: state.candidateMainFrameNavigations.length,
    unexpectedNavigationCount: state.candidateMainFrameNavigations.filter((url) => url !== state.expectedCandidateReloadUrl).length,
    initialUrlSha256: state.initialCandidateUrlSha256,
    navigationSetSha256: hashFileBytes(Buffer.from(`${JSON.stringify(state.candidateMainFrameNavigations)}\n`, "utf8")),
  } : {
    expectedReloadCount: null,
    observedReloadCount: null,
    unexpectedNavigationCount: null,
    initialUrlSha256: null,
    navigationSetSha256: null,
  };
}

const CANARY_PRIVACY_OBSERVATION_KEYS = Object.freeze([
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
  "otherActiveChannelCount"
]);

function canaryPrivacyEvidence(state) {
  const privacy = { profileMode: "anonymous", syntheticOnly: true, childIdentityStored: false, automaticUpload: false };
  for (const key of CANARY_PRIVACY_OBSERVATION_KEYS) privacy[key] = state.privacySummary?.[key] ?? null;
  return privacy;
}

function canaryProgressIdentity(state) {
  return {
    sourceKey: SOURCE_KEY,
    protectedKey: PROTECTED_KEY,
    sourceSha256: state.sourceBytes ? sha256Bytes(state.sourceBytes) : null,
    protectedSha256: state.protectedBytes ? sha256Bytes(state.protectedBytes) : null,
  };
}

function canaryProgressState(sourceState, protectedState) {
  const source = sourceState ?? {};
  const protectedProgress = protectedState ?? {};
  return {
    sourceSchemaVersion: source.schemaVersion ?? null,
    targetSchemaVersion: protectedProgress.schemaVersion ?? null,
    sourceEarnedLevel: source.earnedLevel ?? null,
    sourcePracticeCount: source.practiceCountByDay?.["30000"] ?? null,
    protectedEarnedLevel: protectedProgress.earnedLevel ?? null,
    protectedPracticeCount: canaryProtectedPracticeCount(protectedState),
  };
}

function canaryProgressProjections(state) {
  return {
    expectedFreshSha256: state.expectedFreshBytes ? sha256Bytes(state.expectedFreshBytes) : null,
    retiredProjectionSha256: state.retiredSourceProjection ? hashFileBytes(Buffer.from(`${JSON.stringify(state.retiredSourceProjection)}\n`, "utf8")) : null,
    freshProjectionSha256: state.freshProtectedProjection ? hashFileBytes(Buffer.from(`${JSON.stringify(state.freshProtectedProjection)}\n`, "utf8")) : null,
    retiredProjectionFieldCount: state.retiredSourceProjection ? projectionFieldCount(state.retiredSourceProjection) : null,
    freshProjectionFieldCount: state.freshProtectedProjection ? projectionFieldCount(state.freshProtectedProjection) : null,
    retainedMarkerSha256: state.protectedBytes ? sha256Bytes(RETAINED_BETA1_COMPLETE_VALUE) : null,
    retainedNoticeSha256: state.retainedFreshStartNoticeSha256,
  };
}

function canaryProgressEvidence(state, sourceState, protectedState) {
  return {
    ...canaryProgressIdentity(state),
    ...canaryProgressState(sourceState, protectedState),
    ...canaryProgressProjections(state),
  };
}

function canaryTeardownEvidence(state, teardownPass) {
  return {
    status: teardownPass ? "PASS" : "FAIL",
    ...state.cleanupFlags,
    certificateThumbprint: state.certificateThumbprint ? canonicalCertificateThumbprint(state.certificateThumbprint) : null,
    remainingMatchingCertificateCount: state.remainingMatchingCertificateCount,
    observedProfileProcessCount: state.observedProfileProcessCount,
    observedProfileProcessSetSha256: state.observedProfileProcessSetSha256,
    remainingProfileProcessCount: state.remainingProfileProcessCount,
    remainingProfileProcessSetSha256: state.remainingProfileProcessSetSha256,
  };
}

function canaryTlsProtocol(tls) {
  return tls ? (tls.protocol === "Tls13" ? "TLS 1.3" : "TLS 1.2") : null;
}

function canaryProtectedPracticeCount(protectedState) {
  return protectedState ? Object.values(protectedState.practiceCountByDay || {}).reduce((sum, count) => sum + count, 0) : null;
}
