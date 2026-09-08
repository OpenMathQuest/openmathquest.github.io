import { BETA4_CANARY_OWNER_SKIP_STATE, BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS, BETA4_RELEASE_TAG, CURRENT_EVIDENCE_SUCCESSOR_POLICY, CURRENT_RELEASE_TAG, EMERGENCY_BETA3_RELEASE_TAG, EMERGENCY_BETA3_WAIVED_GATE_IDS, EXTERNAL_RELEASE_GATE_IDS, OPTIONAL_EXTERNAL_RELEASE_GATE_IDS, PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS, PRERELEASE_HOST_QUALIFICATION_STATE, REQUIRED_EXTERNAL_RELEASE_GATE_IDS, isPrereleaseReleaseTag, sha256 } from "./publication-clearance-contract.mjs";
export { PUBLICATION_CLEARANCE_PATH, CURRENT_RELEASE_TAG, BETA4_RELEASE_TAG, EMERGENCY_BETA3_RELEASE_TAG, evidenceSuccessorPolicyForReleaseTag, CURRENT_EVIDENCE_SUCCESSOR_POLICY, EXTERNAL_RELEASE_GATE_IDS, OPTIONAL_EXTERNAL_RELEASE_GATE_IDS, PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS, PRERELEASE_HOST_QUALIFICATION_STATE, BETA4_CANARY_OWNER_SKIP_STATE, BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS, REQUIRED_EXTERNAL_RELEASE_GATE_IDS, EMERGENCY_BETA3_WAIVED_GATE_IDS } from "./publication-clearance-contract.mjs";
export { parsePublicationClearance } from "./publication-clearance-record.mjs";

function reviewedCurriculumMatches(parsed, expected) {
  return parsed.reviewedManifestVersion === expected.manifestVersion
    && parsed.reviewedManifestSha256 === expected.manifestSha256
    && parsed.reviewedRightsSha256 === expected.rightsSha256;
}

function reviewedBrowserMatches(parsed, expected) {
  return parsed.reviewedBrowserProductName === expected.browserProductName
    && parsed.reviewedBrowserFullVersion === expected.browserFullVersion
    && parsed.reviewedBrowserExecutableSha256 === expected.browserExecutableSha256
    && parsed.reviewedRunnerImageOS === expected.runnerImageOS
    && parsed.reviewedRunnerImageVersion === expected.runnerImageVersion;
}

function qualifiedSuccessorMatches(parsed, expected) {
  return parsed.status === "EMERGENCY_APPROVED" || (
    parsed.qualificationCommitSha === expected.qualificationCommitSha
    && parsed.evidenceSuccessorPolicy === CURRENT_EVIDENCE_SUCCESSOR_POLICY
    && expected.evidenceSuccessorValid === true
  );
}

function artifactIdentityMatches(parsed, expected = {}) {
  const reviewedPayloadSha256 = expected.evidenceSuccessorValid === true
    ? expected.qualificationPayloadSha256
    : expected.payloadSha256;
  const reviewedPayloadTreeOid = expected.evidenceSuccessorValid === true
    ? expected.qualificationPayloadTreeOid
    : expected.payloadTreeOid;
  return Boolean(
    parsed?.reviewedEngineSha256 === expected.engineSha256
    && reviewedCurriculumMatches(parsed, expected)
    && parsed.reviewedPayloadSha256 === reviewedPayloadSha256
    && parsed.reviewedPayloadTreeOid === reviewedPayloadTreeOid
    && reviewedBrowserMatches(parsed, expected)
    && qualifiedSuccessorMatches(parsed, expected)
  );
}

const GATE_PRESENTATIONS = Object.freeze({
  "OWNER_SKIPPED": ["OWNER_AUTHORIZED_BETA4_CANARY_SKIP","The project owner directed that the trusted-HTTPS canary not run for Beta 4; no canary, reconciliation, secure-update, offline-relaunch, or privacy-clearance pass is claimed."],
  "OPTIONAL_NOT_RUN": ["OPTIONAL_REVIEW_NOT_RUN","This optional evidence cycle was offered but not selected; no pass or release-readiness claim is made for it."],
  "DEFERRED": ["OWNER_DIRECTED_PRERELEASE_DEFERRAL","The project owner deferred external host privacy/legal qualification for prerelease builds until the first stable release; no host approval or privacy-clearance claim is made."],
  "WAIVED": ["OWNER_AUTHORIZED_EMERGENCY_BETA3_WAIVER","The project owner explicitly waived this external evidence gate for emergency Beta 3 only; no pass is claimed."],
});

function gatePresentation(status, reasons, evidenceBinding) {
  if (status === "PASS") return {
    classification: "VERIFIED",
    details: `${evidenceBinding?.evidenceClass || "UNKNOWN_EVIDENCE_CLASS"}: ${evidenceBinding?.claimBoundary || "claim boundary unavailable"}.`,
  };
  if (typeof status === "string" && Object.hasOwn(GATE_PRESENTATIONS, status)) {
    const [classification, details] = GATE_PRESENTATIONS[status];
    return { classification, details };
  }
  return { classification: "PENDING_EVIDENCE_APPROVAL_GATE", details: reasons.join("; ") };
}

function gate(id, title, status, reasons, evidenceBinding = null) {
  return Object.freeze({ id, title, status, ...gatePresentation(status, reasons, evidenceBinding) });
}

function hostEvidenceDefinition(context) {
  const { bindingReasons, parsed, prerelease } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-HOST",
    "Host and child-facing privacy qualification",
    (parsedValue.hostQualificationState === "APPROVED"
      || (prerelease && parsedValue.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE))
      && sha256(parsedValue.hostQualificationEvidenceSha256),
    parsedValue.hostQualificationState === "APPROVED"
      || (prerelease && parsedValue.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE)
      ? null
      : `host qualification is ${parsedValue.hostQualificationState || "UNKNOWN"}`,
    sha256(parsedValue.hostQualificationEvidenceSha256) ? null : "host qualification evidence digest is missing or malformed",
    ...bindingReasons("EXT-HOST", parsedValue.hostQualificationEvidenceSha256, parsedValue.hostQualificationState),
  ];
}

function canaryEvidenceDefinition(context) {
  const { beta4CanaryOwnerSkipped, bindingReasons, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-CANARY",
    "Trusted-HTTPS canary reconciliation",
    parsedValue.canaryReconciliationState === "RECONCILED" && sha256(parsedValue.canaryReconciliationEvidenceSha256),
    parsedValue.canaryReconciliationState === "RECONCILED" || beta4CanaryOwnerSkipped ? null : `canary reconciliation is ${parsedValue.canaryReconciliationState || "UNKNOWN"}`,
    sha256(parsedValue.canaryReconciliationEvidenceSha256) || beta4CanaryOwnerSkipped ? null : "canary evidence digest is missing or malformed",
    ...bindingReasons("EXT-CANARY", parsedValue.canaryReconciliationEvidenceSha256, parsedValue.canaryReconciliationState),
  ];
}

function deviceCycleRequirements(parsedValue) {
  return [
  parsedValue.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
    || (parsedValue.requiredPhysicalDeviceLanes === "6" && parsedValue.passedPhysicalDeviceLanes === "6")
    ? null
    : "the selected optional six-lane physical-device cycle is incomplete",
  parsedValue.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
    || parsedValue.primaryIPadJourneyResult === "PASS"
    ? null
    : "the selected optional primary-iPad journey is not PASS",
  parsedValue.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
    || sha256(parsedValue.physicalDeviceEvidenceSha256)
    ? null
    : "physical-device evidence digest is missing or malformed",
];
}

function deviceEvidenceDefinition(context) {
  const { bindingReasons, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-DEVICE",
    "Optional six-lane physical-device matrix",
    parsedValue.physicalDeviceEvidenceState === "COMPLETE"
      && parsedValue.requiredPhysicalDeviceLanes === "6"
      && parsedValue.passedPhysicalDeviceLanes === "6"
      && parsedValue.primaryIPadJourneyResult === "PASS"
      && sha256(parsedValue.physicalDeviceEvidenceSha256),
    ["COMPLETE", "OPTIONAL_NOT_RUN"].includes(parsedValue.physicalDeviceEvidenceState)
      ? null
      : `physical-device evidence is ${parsedValue.physicalDeviceEvidenceState || "UNKNOWN"}`,
    ...deviceCycleRequirements(parsedValue),
    ...bindingReasons("EXT-DEVICE", parsedValue.physicalDeviceEvidenceSha256, parsedValue.physicalDeviceEvidenceState),
  ];
}

function reviewerCycleRequirements(parsedValue) {
  return [
  parsedValue.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
    || (parsedValue.requiredIndependentReviewerReports === "6" && parsedValue.sealedIndependentReviewerReports === "6")
    ? null
    : "the selected optional six-reviewer cycle is incomplete",
  parsedValue.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
    || sha256(parsedValue.independentReviewerEvidenceSha256)
    ? null
    : "independent-reviewer evidence digest is missing or malformed",
];
}

function reviewerEvidenceDefinition(context) {
  const { bindingReasons, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-REVIEWERS",
    "Optional six-reviewer cycle",
    parsedValue.independentReviewerEvidenceState === "COMPLETE"
      && parsedValue.requiredIndependentReviewerReports === "6"
      && parsedValue.sealedIndependentReviewerReports === "6"
      && sha256(parsedValue.independentReviewerEvidenceSha256),
    ["COMPLETE", "OPTIONAL_NOT_RUN"].includes(parsedValue.independentReviewerEvidenceState)
      ? null
      : `independent-reviewer evidence is ${parsedValue.independentReviewerEvidenceState || "UNKNOWN"}`,
    ...reviewerCycleRequirements(parsedValue),
    ...bindingReasons("EXT-REVIEWERS", parsedValue.independentReviewerEvidenceSha256, parsedValue.independentReviewerEvidenceState),
  ];
}

function adjudicationEvidenceDefinition(context) {
  const { bindingReasons, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-ADJUDICATION",
    "Independent adjudication",
    parsedValue.adjudicationState === "APPROVED"
      && parsedValue.adjudicationRecommendation === "RELEASE"
      && sha256(parsedValue.adjudicationEvidenceSha256),
    parsedValue.adjudicationState === "APPROVED" ? null : `adjudication is ${parsedValue.adjudicationState || "UNKNOWN"}`,
    parsedValue.adjudicationRecommendation === "RELEASE" ? null : "adjudication does not recommend release",
    sha256(parsedValue.adjudicationEvidenceSha256) ? null : "adjudication evidence digest is missing or malformed",
    ...bindingReasons("EXT-ADJUDICATION", parsedValue.adjudicationEvidenceSha256, parsedValue.adjudicationState),
  ];
}

function findingDispositionComplete(parsedValue) {
  return parsedValue.findingDispositionState === "COMPLETE"
    && parsedValue.openCriticalFindings === "0"
    && parsedValue.openHighFindings === "0"
    && parsedValue.unacceptedMediumFindings === "0"
    && parsedValue.unrecordedLowFindings === "0"
    && sha256(parsedValue.findingDispositionEvidenceSha256);
}

function findingEvidenceDefinition(context) {
  const { bindingReasons, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-FINDINGS",
    "Finding disposition",
    findingDispositionComplete(parsedValue),
    parsedValue.findingDispositionState === "COMPLETE" ? null : `finding disposition is ${parsedValue.findingDispositionState || "UNKNOWN"}`,
    parsedValue.openCriticalFindings === "0" ? null : "critical findings remain open or unknown",
    parsedValue.openHighFindings === "0" ? null : "high findings remain open or unknown",
    parsedValue.unacceptedMediumFindings === "0" ? null : "medium findings remain without exact owner acceptance",
    parsedValue.unrecordedLowFindings === "0" ? null : "low findings remain unrecorded",
    sha256(parsedValue.findingDispositionEvidenceSha256) ? null : "finding-disposition evidence digest is missing or malformed",
    ...bindingReasons("EXT-FINDINGS", parsedValue.findingDispositionEvidenceSha256, parsedValue.findingDispositionState),
  ];
}

function hostedEvidenceDefinition(context) {
  const { bindingReasons, expected, parsed } = context;
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-HOSTED-WINDOWS",
    "Reviewed GitHub-hosted Windows evidence",
    parsedValue.hostedWindowsEvidenceState === "REVIEWED"
      && sha256(parsedValue.hostedWindowsEvidenceSha256)
      && parsedValue.hostedWindowsEvidenceSha256 === expected.browserRunnerEvidenceSha256
      && expected.browserRunnerEvidenceReviewed === true,
    parsedValue.hostedWindowsEvidenceState === "REVIEWED" ? null : `hosted-Windows evidence is ${parsedValue.hostedWindowsEvidenceState || "UNKNOWN"}`,
    sha256(parsedValue.hostedWindowsEvidenceSha256) ? null : "hosted-Windows evidence digest is missing or malformed",
    parsedValue.hostedWindowsEvidenceSha256 === expected.browserRunnerEvidenceSha256 ? null : "hosted-Windows evidence digest does not match the reviewed browser/runner record",
    expected.browserRunnerEvidenceReviewed === true ? null : "the reviewed qualification record or final hosted browser observation is invalid",
    ...bindingReasons("EXT-HOSTED-WINDOWS", parsedValue.hostedWindowsEvidenceSha256, parsedValue.hostedWindowsEvidenceState),
  ];
}

function ownerAuthorizationComplete(parsedValue, ownerBindingValue, expectedReleaseTag, emergency) {
  return parsedValue.ownerAuthorizationState === (emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED")
    && sha256(parsedValue.ownerAuthorizationEvidenceSha256)
    && sha256(parsedValue.reviewBundleSha256)
    && parsedValue.authorizedReleaseTag === expectedReleaseTag
    && parsedValue.authorizedProtectedRef === "refs/heads/main"
    && ownerBindingValue.releaseTag === expectedReleaseTag
    && ownerBindingValue.protectedRef === "refs/heads/main";
}

function ownerBindingAndBundleReasons(context, parsedValue, ownerBindingValue) {
  const { bindingReasons, evidenceBindings, expectedReleaseTag } = context;
  return [
  ownerBindingValue.releaseTag === expectedReleaseTag
    ? null
    : "bound owner-authorization record names a different release tag",
  ownerBindingValue.protectedRef === "refs/heads/main"
    ? null
    : "bound owner-authorization record names a different protected ref",
  ...bindingReasons("EXT-OWNER", parsedValue.ownerAuthorizationEvidenceSha256, parsedValue.ownerAuthorizationState),
  evidenceBindings["REVIEW-BUNDLE"]?.valid === true ? null : "review bundle did not validate",
  evidenceBindings["REVIEW-BUNDLE"]?.digest === parsedValue.reviewBundleSha256
    ? null
    : "review-bundle digest does not match the validated canonical bundle bytes",
];
}

function ownerEvidenceDefinition(context) {
  const { emergency, expectedReleaseTag, ownerBinding, parsed } = context;
  const ownerBindingValue = ownerBinding ?? Object.create(null);
  const parsedValue = parsed ?? Object.create(null);
  return [
    "EXT-OWNER",
    "Project-owner push authorization",
    ownerAuthorizationComplete(parsedValue, ownerBindingValue, expectedReleaseTag, emergency),
    parsedValue.ownerAuthorizationState === (emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED")
      ? null
      : `owner authorization is ${parsedValue.ownerAuthorizationState || "UNKNOWN"}`,
    sha256(parsedValue.ownerAuthorizationEvidenceSha256) ? null : "owner-authorization evidence digest is missing or malformed",
    sha256(parsedValue.reviewBundleSha256) ? null : "review-bundle digest is missing or malformed",
    parsedValue.authorizedReleaseTag === expectedReleaseTag ? null : "owner authorization names a different release tag",
    parsedValue.authorizedProtectedRef === "refs/heads/main" ? null : "owner authorization names a different protected ref",
    ...ownerBindingAndBundleReasons(context, parsedValue, ownerBindingValue),
  ];
}

function evidenceEvaluationTimes(parsed, now) {
  const instant = now instanceof Date ? now : new Date(now);
  const currentTime = instant.getTime();
  const reviewedTime = Date.parse(parsed?.externalEvidenceReviewedAt || "");
  const expiresTime = Date.parse(parsed?.externalEvidenceExpiresAt || "");
  return { currentTime, reviewedTime, expiresTime };
}

function evidenceEvaluationMode(parsed, expected) {
  const expectedReleaseTag = expected.releaseTag || CURRENT_RELEASE_TAG;
  const prerelease = isPrereleaseReleaseTag(expectedReleaseTag);
  const emergencyRequested = parsed?.status === "EMERGENCY_APPROVED";
  const emergency = emergencyRequested && expectedReleaseTag === EMERGENCY_BETA3_RELEASE_TAG;
  const beta4CanaryOwnerSkipped = !emergency
    && expectedReleaseTag === BETA4_RELEASE_TAG
    && parsed?.canaryReconciliationState === BETA4_CANARY_OWNER_SKIP_STATE
    && parsed?.canaryReconciliationEvidenceSha256 === "NONE";
  return { expectedReleaseTag, prerelease, emergencyRequested, emergency, beta4CanaryOwnerSkipped };
}

function checkCommonEvidenceIdentity(context) {
  const { emergencyRequested, emergency, expectedReleaseTag, parsed, expected, commonReasons } = context;
  const parsedValue = parsed ?? Object.create(null);
  if (emergencyRequested && !emergency) {
    commonReasons.push(`the emergency Beta 3 exception cannot authorize ${expectedReleaseTag}`);
  }
  if (!parsedValue.valid) commonReasons.push(`clearance schema is invalid${parsedValue.issues?.length ? ` (${parsed.issues.join("; ")})` : ""}`);
  if (!["APPROVED", "EMERGENCY_APPROVED"].includes(parsedValue.status)) {
    commonReasons.push(`clearance status is ${parsedValue.status || "UNKNOWN"}`);
  }
  if (!artifactIdentityMatches(parsed, expected)) commonReasons.push("candidate or reviewed qualification hosted-Windows record does not match");
}

function checkCommonEvidenceTime(context) {
  const { currentTime, reviewedTime, expiresTime, commonReasons } = context;
  if (!Number.isFinite(currentTime)) commonReasons.push("audit time is invalid");
  if (!Number.isFinite(reviewedTime) || reviewedTime > currentTime) commonReasons.push("external evidence review timestamp is missing or in the future");
  if (!Number.isFinite(expiresTime) || expiresTime <= currentTime) commonReasons.push("external evidence is missing an expiry or is stale");
}

function checkCommonBundleIdentity(context) {
  const { bundleBinding, expectedReleaseTag, parsed, commonReasons } = context;
  const parsedValue = parsed ?? Object.create(null);
  if (bundleBinding?.evidenceClass === "CANONICAL_BUNDLE") {
    if (bundleBinding.releaseTag !== expectedReleaseTag) commonReasons.push("release evidence bundle names a different release tag");
    if (bundleBinding.qualificationCommitSha !== parsedValue.qualificationCommitSha) commonReasons.push("release evidence bundle names a different qualification commit");
    if (bundleBinding.reviewedAtUtc !== parsedValue.externalEvidenceReviewedAt) commonReasons.push("release evidence bundle names a different review timestamp");
    if (bundleBinding.expiresAtUtc !== parsedValue.externalEvidenceExpiresAt) commonReasons.push("release evidence bundle names a different expiry timestamp");
  }
}

function createEvidenceEvaluationContext(parsed, expected, now) {
  const timing = evidenceEvaluationTimes(parsed, now);
  const mode = evidenceEvaluationMode(parsed, expected);
  const commonReasons = [];
  const evidenceBindings = expected.releaseEvidenceBindings || {};
  const bundleBinding = evidenceBindings["REVIEW-BUNDLE"];
  const context = { parsed, expected, ...timing, ...mode, commonReasons, evidenceBindings, bundleBinding };
  checkCommonEvidenceIdentity(context);
  checkCommonEvidenceTime(context);
  checkCommonBundleIdentity(context);
  const buildReasons = (...specific) => [...commonReasons, ...specific.filter(Boolean)];
  const resolvedBinding = (id, digest, state) => {
    const candidates = Array.isArray(evidenceBindings[id]) ? evidenceBindings[id] : [evidenceBindings[id]];
    return candidates.find((binding) => binding?.digest === digest && binding?.state === state) || candidates[0] || null;
  };
  const bindingReasons = (id, digest, state) => {
    const binding = resolvedBinding(id, digest, state);
    return [
      binding ? null : `${id} validated evidence binding is missing`,
      binding?.valid === true ? null : `${id} evidence binding did not validate`,
      binding?.digest === digest ? null : `${id} digest does not match validated evidence bytes or canonical record`,
      binding?.state === state ? null : `${id} state does not match the validated evidence record`,
    ];
  };
  const ownerBinding = resolvedBinding(
    "EXT-OWNER",
    parsed?.ownerAuthorizationEvidenceSha256,
    parsed?.ownerAuthorizationState,
  );
  return { ...context, buildReasons, resolvedBinding, bindingReasons, ownerBinding };
}

const EVIDENCE_BINDING_FIELDS = Object.freeze({
  "EXT-HOST": ["hostQualificationEvidenceSha256","hostQualificationState"],
  "EXT-CANARY": ["canaryReconciliationEvidenceSha256","canaryReconciliationState"],
  "EXT-DEVICE": ["physicalDeviceEvidenceSha256","physicalDeviceEvidenceState"],
  "EXT-REVIEWERS": ["independentReviewerEvidenceSha256","independentReviewerEvidenceState"],
  "EXT-ADJUDICATION": ["adjudicationEvidenceSha256","adjudicationState"],
  "EXT-FINDINGS": ["findingDispositionEvidenceSha256","findingDispositionState"],
  "EXT-HOSTED-WINDOWS": ["hostedWindowsEvidenceSha256","hostedWindowsEvidenceState"],
  "EXT-OWNER": ["ownerAuthorizationEvidenceSha256","ownerAuthorizationState"],
});

function emergencyGateWaivable(context, id, evidenceBindingValid) {
  const { emergency, commonReasons } = context;
  return emergency
  && EMERGENCY_BETA3_WAIVED_GATE_IDS.includes(id)
  && commonReasons.length === 0
  && evidenceBindingValid;
}

function ownerGateSkippable(context, id, reasons) {
  const { beta4CanaryOwnerSkipped } = context;
  return beta4CanaryOwnerSkipped
  && BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS.includes(id)
  && reasons.length === 0;
}

function hostGateDeferrable(context, id, reasons) {
  const { emergency, prerelease, parsed } = context;
  return !emergency
  && prerelease
  && PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS.includes(id)
  && reasons.length === 0
  && parsed?.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE
  && sha256(parsed?.hostQualificationEvidenceSha256);
}

function optionalGateDeclined(context, id, reasons) {
  const { emergency, parsed } = context;
  return !emergency
  && OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(id)
  && reasons.length === 0
  && (
    id === "EXT-DEVICE"
      ? parsed?.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
      : parsed?.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
  );
}

function evaluateEvidenceGate(definition, context) {
  const [id, title, specificPass, ...specificReasons] = definition;
  const { buildReasons, resolvedBinding, bindingReasons, parsed } = context;
  const reasons = buildReasons(...specificReasons);
  const [digestField, stateField] = EVIDENCE_BINDING_FIELDS[id];
  const evidenceDigest = parsed?.[digestField];
  const evidenceState = parsed?.[stateField];
  const evidenceBinding = resolvedBinding(id, evidenceDigest, evidenceState);
  const evidenceBindingValid = bindingReasons(id, evidenceDigest, evidenceState).every((reason) => !reason);
  if (emergencyGateWaivable(context, id, evidenceBindingValid)) {
    return gate(id, title, "WAIVED", reasons, evidenceBinding);
  }
  if (ownerGateSkippable(context, id, reasons)) {
    return gate(id, title, "OWNER_SKIPPED", reasons, evidenceBinding);
  }
  if (hostGateDeferrable(context, id, reasons)) {
    return gate(id, title, "DEFERRED", reasons, evidenceBinding);
  }
  if (optionalGateDeclined(context, id, reasons)) {
    return gate(id, title, "OPTIONAL_NOT_RUN", reasons, evidenceBinding);
  }
  return gate(id, title, reasons.length === 0 && specificPass ? "PASS" : "BLOCKED", reasons, evidenceBinding);
}

function evaluatedReleaseStatus(context, gates, standardPattern, emergencyPattern) {
  const { emergency } = context;
  return gates.length === EXTERNAL_RELEASE_GATE_IDS.length && standardPattern
    ? "PASS"
    : emergency && emergencyPattern
      ? "EMERGENCY_WAIVER"
      : "BLOCKED";
}

function requiredEvidenceCount(context) {
  const { emergency, prerelease, beta4CanaryOwnerSkipped } = context;
  return emergency
    ? EXTERNAL_RELEASE_GATE_IDS.length
    : REQUIRED_EXTERNAL_RELEASE_GATE_IDS.length - (prerelease ? 1 : 0) - (beta4CanaryOwnerSkipped ? 1 : 0);
}

function summarizeExternalEvidence(context, gates) {
  const { parsed, prerelease, beta4CanaryOwnerSkipped } = context;
  const flags = { canarySkip: beta4CanaryOwnerSkipped, hostDeferral: prerelease };
  const standardPattern = gates.every((item, index) => (
    item.id === EXTERNAL_RELEASE_GATE_IDS[index]
    && standardGateStatusAllowed(item, flags)
  ));
  const emergencyPattern = gates.every((item, index) => (
    item.id === EXTERNAL_RELEASE_GATE_IDS[index]
    && item.status === (index < EMERGENCY_BETA3_WAIVED_GATE_IDS.length ? "WAIVED" : "PASS")
  ));
  return Object.freeze({
    status: evaluatedReleaseStatus(context, gates, standardPattern, emergencyPattern),
    reviewedAt: parsed?.externalEvidenceReviewedAt || null,
    expiresAt: parsed?.externalEvidenceExpiresAt || null,
    passCount: gates.filter((item) => (
      REQUIRED_EXTERNAL_RELEASE_GATE_IDS.includes(item.id)
      && !(prerelease && item.id === "EXT-HOST")
      && !(beta4CanaryOwnerSkipped && item.id === "EXT-CANARY")
      && item.status === "PASS"
    )).length,
    waivedCount: gates.filter((item) => item.status === "WAIVED").length,
    ownerSkippedCount: gates.filter((item) => item.status === "OWNER_SKIPPED").length,
    deferredCount: gates.filter((item) => item.status === "DEFERRED").length,
    prereleaseHostDeferralEligible: prerelease
      && gates.find((item) => item.id === "EXT-HOST")?.status === "DEFERRED",
    optionalCount: OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.length,
    optionalCompletedCount: gates.filter((item) => (
      OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(item.id) && item.status === "PASS"
    )).length,
    requiredCount: requiredEvidenceCount(context),
    beta4CanaryOwnerSkipped,
    gates: Object.freeze(gates),
  });
}



export function evaluateExternalReleaseEvidence(parsed, expected = {}, now = new Date()) {

  const context = createEvidenceEvaluationContext(parsed, expected, now);

  const definitions = [
    hostEvidenceDefinition(context),
    canaryEvidenceDefinition(context),
    deviceEvidenceDefinition(context),
    reviewerEvidenceDefinition(context),
    adjudicationEvidenceDefinition(context),
    findingEvidenceDefinition(context),
    hostedEvidenceDefinition(context),
    ownerEvidenceDefinition(context),
  ];

  const gates = definitions.map((definition) => evaluateEvidenceGate(definition, context));

  return summarizeExternalEvidence(context, gates);

}

export function clearanceMatches(parsed, expected = {}) {
  const external = evaluateExternalReleaseEvidence(parsed, expected, expected.now ?? new Date());
  return Boolean(
    parsed?.valid
    && ["APPROVED", "EMERGENCY_APPROVED"].includes(parsed.status)
    && artifactIdentityMatches(parsed, expected)
    && (external.status === "PASS" || external.status === "EMERGENCY_WAIVER")
  );
}

function standardGateStatusAllowed(item, flags) {
  if (item.status === "PASS") return true;
  if (item.id === "EXT-CANARY" && item.status === "OWNER_SKIPPED") return flags.canarySkip;
  if (item.id === "EXT-HOST" && item.status === "DEFERRED") return flags.hostDeferral;
  return OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(item.id) && item.status === "OPTIONAL_NOT_RUN";
}

function completeGateList(gates) {
  return Array.isArray(gates) && gates.length === EXTERNAL_RELEASE_GATE_IDS.length;
}

function standardDecisionEvidence(external, gates) {
  if (external?.status !== "PASS" || !completeGateList(gates)) return false;
  const flags = {
    canarySkip: external?.beta4CanaryOwnerSkipped === true,
    hostDeferral: external?.prereleaseHostDeferralEligible === true,
  };
  return gates.every((item, index) => (
    item?.id === EXTERNAL_RELEASE_GATE_IDS[index] && standardGateStatusAllowed(item, flags)
  ));
}

function emergencyDecisionEvidence(external, gates) {
  return external?.status === "EMERGENCY_WAIVER" && completeGateList(gates)
    && gates.every((item, index) => (
      item?.id === EXTERNAL_RELEASE_GATE_IDS[index]
      && item.status === (index < EMERGENCY_BETA3_WAIVED_GATE_IDS.length ? "WAIVED" : "PASS")
    ));
}

export function computeReleaseDecision({ technicalShippable, publicationStatus, externalReleaseEvidence }) {
  const gates = externalReleaseEvidence?.gates;
  const standard = publicationStatus === "APPROVED" && standardDecisionEvidence(externalReleaseEvidence, gates);
  const emergency = publicationStatus === "EMERGENCY_APPROVED" && emergencyDecisionEvidence(externalReleaseEvidence, gates);
  return Boolean(technicalShippable === true && (standard || emergency));
}
