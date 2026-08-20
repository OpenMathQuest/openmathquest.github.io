import { RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY } from "./release-evidence-successor.mjs";

export const PUBLICATION_CLEARANCE_PATH = "PUBLICATION_CLEARANCE.md";
export const CURRENT_RELEASE_TAG = "v1.0.0-beta.7";
export const BETA4_RELEASE_TAG = "v1.0.0-beta.4";
export const CURRENT_EVIDENCE_SUCCESSOR_POLICY = RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY;
export const EMERGENCY_BETA3_RELEASE_TAG = "v1.0.0-beta.3";
export const EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-HOST",
  "EXT-CANARY",
  "EXT-DEVICE",
  "EXT-REVIEWERS",
  "EXT-ADJUDICATION",
  "EXT-FINDINGS",
  "EXT-HOSTED-WINDOWS",
  "EXT-OWNER",
]);
export const OPTIONAL_EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-DEVICE",
  "EXT-REVIEWERS",
]);
export const PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS = Object.freeze([
  "EXT-HOST",
]);
export const PRERELEASE_HOST_QUALIFICATION_STATE = "DEFERRED_PRERELEASE";
export const BETA4_CANARY_OWNER_SKIP_STATE = "OWNER_SKIPPED_BETA4";
export const BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS = Object.freeze(["EXT-CANARY"]);
export const REQUIRED_EXTERNAL_RELEASE_GATE_IDS = Object.freeze(
  EXTERNAL_RELEASE_GATE_IDS.filter((id) => !OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(id)),
);
export const EMERGENCY_BETA3_WAIVED_GATE_IDS = Object.freeze(EXTERNAL_RELEASE_GATE_IDS.slice(0, 6));

const FIELD_ORDER = Object.freeze([
  "Status",
  "Review date",
  "Review result",
  "Required failures",
  "Required skips",
  "Residual risks",
  "Reviewed engine SHA-256",
  "Reviewed curriculum manifest version",
  "Reviewed curriculum manifest SHA-256",
  "Reviewed rights-state SHA-256",
  "Reviewed public payload SHA-256",
  "Reviewed public payload tree OID",
  "Qualification commit SHA",
  "Evidence successor policy",
  "Reviewed browser product name",
  "Reviewed browser full version",
  "Reviewed browser executable SHA-256",
  "Reviewed runner ImageOS",
  "Reviewed runner ImageVersion",
  "External evidence reviewed at",
  "External evidence expires at",
  "Host qualification state",
  "Host qualification evidence SHA-256",
  "Canary reconciliation state",
  "Canary reconciliation evidence SHA-256",
  "Physical-device evidence state",
  "Physical-device evidence SHA-256",
  "Required physical-device lanes",
  "Passed physical-device lanes",
  "Primary iPad journey result",
  "Independent-reviewer evidence state",
  "Independent-reviewer evidence SHA-256",
  "Required independent-reviewer reports",
  "Sealed independent-reviewer reports",
  "Adjudication state",
  "Adjudication evidence SHA-256",
  "Adjudication recommendation",
  "Finding-disposition state",
  "Finding-disposition evidence SHA-256",
  "Open critical findings",
  "Open high findings",
  "Unaccepted medium findings",
  "Unrecorded low findings",
  "Hosted-Windows evidence state",
  "Hosted-Windows evidence SHA-256",
  "Owner authorization state",
  "Owner authorization evidence SHA-256",
  "Authorized release tag",
  "Authorized protected ref",
  "Review-bundle SHA-256",
]);

function result(valid, fields, issues) {
  return Object.freeze({
    valid,
    status: fields.Status || "INVALID",
    reviewDate: fields["Review date"] || null,
    reviewResult: fields["Review result"] || null,
    requiredFailures: fields["Required failures"] || null,
    requiredSkips: fields["Required skips"] || null,
    residualRisks: fields["Residual risks"] || null,
    reviewedEngineSha256: fields["Reviewed engine SHA-256"] || null,
    reviewedManifestVersion: fields["Reviewed curriculum manifest version"] || null,
    reviewedManifestSha256: fields["Reviewed curriculum manifest SHA-256"] || null,
    reviewedRightsSha256: fields["Reviewed rights-state SHA-256"] || null,
    reviewedPayloadSha256: fields["Reviewed public payload SHA-256"] || null,
    reviewedPayloadTreeOid: fields["Reviewed public payload tree OID"] || null,
    qualificationCommitSha: fields["Qualification commit SHA"] || null,
    evidenceSuccessorPolicy: fields["Evidence successor policy"] || null,
    reviewedBrowserProductName: fields["Reviewed browser product name"] || null,
    reviewedBrowserFullVersion: fields["Reviewed browser full version"] || null,
    reviewedBrowserExecutableSha256: fields["Reviewed browser executable SHA-256"] || null,
    reviewedRunnerImageOS: fields["Reviewed runner ImageOS"] || null,
    reviewedRunnerImageVersion: fields["Reviewed runner ImageVersion"] || null,
    externalEvidenceReviewedAt: fields["External evidence reviewed at"] || null,
    externalEvidenceExpiresAt: fields["External evidence expires at"] || null,
    hostQualificationState: fields["Host qualification state"] || null,
    hostQualificationEvidenceSha256: fields["Host qualification evidence SHA-256"] || null,
    canaryReconciliationState: fields["Canary reconciliation state"] || null,
    canaryReconciliationEvidenceSha256: fields["Canary reconciliation evidence SHA-256"] || null,
    physicalDeviceEvidenceState: fields["Physical-device evidence state"] || null,
    physicalDeviceEvidenceSha256: fields["Physical-device evidence SHA-256"] || null,
    requiredPhysicalDeviceLanes: fields["Required physical-device lanes"] || null,
    passedPhysicalDeviceLanes: fields["Passed physical-device lanes"] || null,
    primaryIPadJourneyResult: fields["Primary iPad journey result"] || null,
    independentReviewerEvidenceState: fields["Independent-reviewer evidence state"] || null,
    independentReviewerEvidenceSha256: fields["Independent-reviewer evidence SHA-256"] || null,
    requiredIndependentReviewerReports: fields["Required independent-reviewer reports"] || null,
    sealedIndependentReviewerReports: fields["Sealed independent-reviewer reports"] || null,
    adjudicationState: fields["Adjudication state"] || null,
    adjudicationEvidenceSha256: fields["Adjudication evidence SHA-256"] || null,
    adjudicationRecommendation: fields["Adjudication recommendation"] || null,
    findingDispositionState: fields["Finding-disposition state"] || null,
    findingDispositionEvidenceSha256: fields["Finding-disposition evidence SHA-256"] || null,
    openCriticalFindings: fields["Open critical findings"] || null,
    openHighFindings: fields["Open high findings"] || null,
    unacceptedMediumFindings: fields["Unaccepted medium findings"] || null,
    unrecordedLowFindings: fields["Unrecorded low findings"] || null,
    hostedWindowsEvidenceState: fields["Hosted-Windows evidence state"] || null,
    hostedWindowsEvidenceSha256: fields["Hosted-Windows evidence SHA-256"] || null,
    ownerAuthorizationState: fields["Owner authorization state"] || null,
    ownerAuthorizationEvidenceSha256: fields["Owner authorization evidence SHA-256"] || null,
    authorizedReleaseTag: fields["Authorized release tag"] || null,
    authorizedProtectedRef: fields["Authorized protected ref"] || null,
    reviewBundleSha256: fields["Review-bundle SHA-256"] || null,
    issues: Object.freeze([...issues]),
  });
}

function validUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(String(value || ""))) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().replace(".000Z", "Z") === value;
}

function sha256(value) {
  return /^[a-f0-9]{64}$/u.test(String(value || ""));
}

export function isPrereleaseReleaseTag(value) {
  return /^v\d+\.\d+\.\d+-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/u.test(String(value || ""));
}

export function parsePublicationClearance(text) {
  const issues = [];
  const source = String(text);
  if (source.includes("\r")) issues.push("clearance must use LF line endings");
  const lines = source.split("\n");
  if (lines.at(-1) !== "") issues.push("clearance must end with one LF");
  if (lines[0] !== "# Math Quest publication clearance") issues.push("clearance heading is invalid");
  if (lines.length !== FIELD_ORDER.length + 2) issues.push("clearance must contain only the exact ordered schema");
  const fields = {};
  for (const [index, key] of FIELD_ORDER.entries()) {
    const prefix = `${key}: `;
    const line = lines[index + 1] || "";
    if (!line.startsWith(prefix) || line.length === prefix.length) {
      issues.push(`${key} is missing, empty, or out of order`);
    } else {
      fields[key] = line.slice(prefix.length);
    }
  }
  if (!["PENDING", "APPROVED", "EMERGENCY_APPROVED"].includes(fields.Status)) {
    issues.push("Status must be PENDING, APPROVED, or EMERGENCY_APPROVED");
  }
  if (fields.Status === "PENDING") {
    const optionalProgressKeys = new Set([
      "Host qualification state",
      "Host qualification evidence SHA-256",
      "Physical-device evidence state",
      "Physical-device evidence SHA-256",
      "Required physical-device lanes",
      "Passed physical-device lanes",
      "Primary iPad journey result",
      "Independent-reviewer evidence state",
      "Independent-reviewer evidence SHA-256",
      "Required independent-reviewer reports",
      "Sealed independent-reviewer reports",
    ]);
    for (const key of FIELD_ORDER.slice(1).filter((key) => !optionalProgressKeys.has(key))) {
      if (fields[key] !== "PENDING") issues.push(`${key} must be PENDING while Status is PENDING`);
    }
    const hostProgress = [
      fields["Host qualification state"],
      fields["Host qualification evidence SHA-256"],
    ];
    const validPendingHost = hostProgress.every((value) => value === "PENDING");
    const validDeferredHost = hostProgress[0] === PRERELEASE_HOST_QUALIFICATION_STATE
      && sha256(hostProgress[1])
      && isPrereleaseReleaseTag(CURRENT_RELEASE_TAG);
    if (!validPendingHost && !validDeferredHost) {
      issues.push("Host qualification fields must be uniformly PENDING or an exact digest-bound prerelease deferral while Status is PENDING");
    }
    const deviceProgress = [
      fields["Physical-device evidence state"],
      fields["Physical-device evidence SHA-256"],
      fields["Required physical-device lanes"],
      fields["Passed physical-device lanes"],
      fields["Primary iPad journey result"],
    ];
    const validPendingDevice = deviceProgress.every((value) => value === "PENDING");
    const validDeclinedDevice = JSON.stringify(deviceProgress)
      === JSON.stringify(["OPTIONAL_NOT_RUN", "NONE", "0", "0", "NOT_RUN"]);
    const validCompleteDevice = fields["Physical-device evidence state"] === "COMPLETE"
      && sha256(fields["Physical-device evidence SHA-256"])
      && JSON.stringify(deviceProgress.slice(2)) === JSON.stringify(["6", "6", "PASS"]);
    if (!validPendingDevice && !validDeclinedDevice && !validCompleteDevice) {
      issues.push("Physical-device fields must be uniformly PENDING or an exact COMPLETE or OPTIONAL_NOT_RUN optional-cycle record while Status is PENDING");
    }
    const reviewerProgress = [
      fields["Independent-reviewer evidence state"],
      fields["Independent-reviewer evidence SHA-256"],
      fields["Required independent-reviewer reports"],
      fields["Sealed independent-reviewer reports"],
    ];
    const validPendingReviewers = reviewerProgress.every((value) => value === "PENDING");
    const validDeclinedReviewers = JSON.stringify(reviewerProgress)
      === JSON.stringify(["OPTIONAL_NOT_RUN", "NONE", "0", "0"]);
    const validCompleteReviewers = fields["Independent-reviewer evidence state"] === "COMPLETE"
      && sha256(fields["Independent-reviewer evidence SHA-256"])
      && JSON.stringify(reviewerProgress.slice(2)) === JSON.stringify(["6", "6"]);
    if (!validPendingReviewers && !validDeclinedReviewers && !validCompleteReviewers) {
      issues.push("Independent-reviewer fields must be uniformly PENDING or an exact COMPLETE or OPTIONAL_NOT_RUN optional-cycle record while Status is PENDING");
    }
  }
  if (fields.Status === "APPROVED" || fields.Status === "EMERGENCY_APPROVED") {
    const emergency = fields.Status === "EMERGENCY_APPROVED";
    const prerelease = isPrereleaseReleaseTag(fields["Authorized release tag"]);
    const hostDeferred = fields["Host qualification state"] === PRERELEASE_HOST_QUALIFICATION_STATE;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(fields["Review date"] || "")) issues.push("Review date must use YYYY-MM-DD");
    if (fields["Review result"] !== (emergency ? "EMERGENCY_PASS" : "PASS")) {
      issues.push(`Review result must be ${emergency ? "EMERGENCY_PASS" : "PASS"}`);
    }
    if (fields["Required failures"] !== "0") issues.push("Required failures must be 0");
    if (fields["Required skips"] !== "0") issues.push("Required skips must be 0");
    if (!fields["Residual risks"] || fields["Residual risks"] === "PENDING" || fields["Residual risks"].length > 500) {
      issues.push("Residual risks must be an explicit one-line statement of at most 500 characters");
    }
    if (hostDeferred && !prerelease) {
      issues.push("Host qualification may be deferred only for a semantic-version prerelease tag");
    }
    if (hostDeferred && !/^Host privacy deferred until stable:/u.test(fields["Residual risks"] || "")) {
      issues.push("A prerelease host deferral must state its host-metadata and under-13 residual risk explicitly");
    }
    for (const key of [
      "Reviewed engine SHA-256",
      "Reviewed curriculum manifest SHA-256",
      "Reviewed rights-state SHA-256",
      "Reviewed public payload SHA-256",
      "Reviewed browser executable SHA-256",
    ]) {
      if (!/^[a-f0-9]{64}$/u.test(fields[key] || "")) issues.push(`${key} must be 64 lowercase hexadecimal characters`);
    }
    if (!/^1\.\d+\.\d+$/u.test(fields["Reviewed curriculum manifest version"] || "")) {
      issues.push("Reviewed curriculum manifest version must be a 1.x.x semantic version");
    }
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(fields["Reviewed public payload tree OID"] || "")) {
      issues.push("Reviewed public payload tree OID must be 40 or 64 lowercase hexadecimal characters");
    }
    if (emergency) {
      if (fields["Qualification commit SHA"] !== "NOT_APPLICABLE_BETA3") issues.push("Qualification commit SHA must be NOT_APPLICABLE_BETA3 for emergency Beta 3");
      if (fields["Evidence successor policy"] !== "NOT_APPLICABLE_BETA3") issues.push("Evidence successor policy must be NOT_APPLICABLE_BETA3 for emergency Beta 3");
    } else {
      if (!/^[a-f0-9]{40}$/u.test(fields["Qualification commit SHA"] || "")) issues.push("Qualification commit SHA must be 40 lowercase hexadecimal characters");
      if (fields["Evidence successor policy"] !== CURRENT_EVIDENCE_SUCCESSOR_POLICY) {
        issues.push(`Evidence successor policy must be ${CURRENT_EVIDENCE_SUCCESSOR_POLICY}`);
      }
    }
    if (!["Microsoft Edge", "Google Chrome"].includes(fields["Reviewed browser product name"])) {
      issues.push("Reviewed browser product name must be Microsoft Edge or Google Chrome");
    }
    if (!/^\d+\.\d+\.\d+\.\d+$/u.test(fields["Reviewed browser full version"] || "")) {
      issues.push("Reviewed browser full version must contain the full four-part product version");
    }
    if (fields["Reviewed runner ImageOS"] === "PENDING"
      || !/^[A-Za-z0-9._-]{1,100}$/u.test(fields["Reviewed runner ImageOS"] || "")) {
      issues.push("Reviewed runner ImageOS must be a nonempty GitHub-hosted image identifier");
    }
    if (fields["Reviewed runner ImageVersion"] === "PENDING"
      || !/^[A-Za-z0-9._-]{1,100}$/u.test(fields["Reviewed runner ImageVersion"] || "")) {
      issues.push("Reviewed runner ImageVersion must be a nonempty GitHub-hosted image version");
    }
    if (!validUtcTimestamp(fields["External evidence reviewed at"])) {
      issues.push("External evidence reviewed at must be an exact UTC timestamp with whole seconds");
    }
    if (!validUtcTimestamp(fields["External evidence expires at"])) {
      issues.push("External evidence expires at must be an exact UTC timestamp with whole seconds");
    }
    if (validUtcTimestamp(fields["External evidence reviewed at"])
      && validUtcTimestamp(fields["External evidence expires at"])
      && Date.parse(fields["External evidence expires at"]) <= Date.parse(fields["External evidence reviewed at"])) {
      issues.push("External evidence expiry must be later than its review timestamp");
    }
    for (const key of [
      "Host qualification evidence SHA-256",
      "Adjudication evidence SHA-256",
      "Finding-disposition evidence SHA-256",
      "Hosted-Windows evidence SHA-256",
      "Owner authorization evidence SHA-256",
      "Review-bundle SHA-256",
    ]) {
      if (!sha256(fields[key])) issues.push(`${key} must be 64 lowercase hexadecimal characters`);
    }
    if (!sha256(fields["Canary reconciliation evidence SHA-256"])) {
      issues.push("Canary reconciliation evidence SHA-256 must be 64 lowercase hexadecimal characters");
    }
    for (const [key, expected] of [
      ["Host qualification state", emergency ? "WAIVED_BETA3" : hostDeferred ? PRERELEASE_HOST_QUALIFICATION_STATE : "APPROVED"],
      ["Canary reconciliation state", emergency ? "WAIVED_BETA3" : "RECONCILED"],
      ["Adjudication state", emergency ? "WAIVED_BETA3" : "APPROVED"],
      ["Adjudication recommendation", emergency ? "NOT_RUN" : "RELEASE"],
      ["Finding-disposition state", emergency ? "AUTOMATED_ONLY" : "COMPLETE"],
      ["Hosted-Windows evidence state", "REVIEWED"],
      ["Owner authorization state", emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED"],
      ["Authorized release tag", emergency ? EMERGENCY_BETA3_RELEASE_TAG : CURRENT_RELEASE_TAG],
      ["Authorized protected ref", "refs/heads/main"],
    ]) {
      if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
    }
    for (const [key, expected] of [
      ["Open critical findings", "0"],
      ["Open high findings", "0"],
      ["Unaccepted medium findings", emergency ? "UNKNOWN" : "0"],
      ["Unrecorded low findings", emergency ? "UNKNOWN" : "0"],
    ]) {
      if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
    }
    if (emergency) {
      if (fields["Physical-device evidence state"] !== "WAIVED_BETA3") {
        issues.push("Physical-device evidence state must be WAIVED_BETA3");
      }
      if (!sha256(fields["Physical-device evidence SHA-256"])) {
        issues.push("Physical-device evidence SHA-256 must be 64 lowercase hexadecimal characters");
      }
      if (fields["Required physical-device lanes"] !== "6") {
        issues.push("Required physical-device lanes must be 6");
      }
      if (fields["Passed physical-device lanes"] !== "0") {
        issues.push("Passed physical-device lanes must be 0");
      }
      if (fields["Primary iPad journey result"] !== "NOT_RUN") {
        issues.push("Primary iPad journey result must be NOT_RUN");
      }
    } else if (fields["Physical-device evidence state"] === "COMPLETE") {
      if (!sha256(fields["Physical-device evidence SHA-256"])) {
        issues.push("Physical-device evidence SHA-256 must be 64 lowercase hexadecimal characters when the optional device cycle is completed");
      }
      if (fields["Required physical-device lanes"] !== "6") {
        issues.push("Required physical-device lanes must be 6 when the optional device cycle is selected");
      }
      if (fields["Passed physical-device lanes"] !== "6") {
        issues.push("Passed physical-device lanes must be 6 when the optional device cycle is selected");
      }
      if (fields["Primary iPad journey result"] !== "PASS") {
        issues.push("Primary iPad journey result must be PASS when the optional device cycle is selected");
      }
    } else if (fields["Physical-device evidence state"] === "OPTIONAL_NOT_RUN") {
      if (fields["Physical-device evidence SHA-256"] !== "NONE") {
        issues.push("Physical-device evidence SHA-256 must be NONE when the optional device cycle is not run");
      }
      if (fields["Required physical-device lanes"] !== "0") {
        issues.push("Required physical-device lanes must be 0 when the optional device cycle is not run");
      }
      if (fields["Passed physical-device lanes"] !== "0") {
        issues.push("Passed physical-device lanes must be 0 when the optional device cycle is not run");
      }
      if (fields["Primary iPad journey result"] !== "NOT_RUN") {
        issues.push("Primary iPad journey result must be NOT_RUN when the optional device cycle is not run");
      }
    } else {
      issues.push("Physical-device evidence state must be COMPLETE or OPTIONAL_NOT_RUN");
    }
    if (emergency) {
      if (fields["Independent-reviewer evidence state"] !== "WAIVED_BETA3") {
        issues.push("Independent-reviewer evidence state must be WAIVED_BETA3");
      }
      if (!sha256(fields["Independent-reviewer evidence SHA-256"])) {
        issues.push("Independent-reviewer evidence SHA-256 must be 64 lowercase hexadecimal characters");
      }
      if (fields["Required independent-reviewer reports"] !== "6") {
        issues.push("Required independent-reviewer reports must be 6");
      }
      if (fields["Sealed independent-reviewer reports"] !== "0") {
        issues.push("Sealed independent-reviewer reports must be 0");
      }
    } else if (fields["Independent-reviewer evidence state"] === "COMPLETE") {
      if (!sha256(fields["Independent-reviewer evidence SHA-256"])) {
        issues.push("Independent-reviewer evidence SHA-256 must be 64 lowercase hexadecimal characters when the optional review is completed");
      }
      if (fields["Required independent-reviewer reports"] !== "6") {
        issues.push("Required independent-reviewer reports must be 6 when the optional review is selected");
      }
      if (fields["Sealed independent-reviewer reports"] !== "6") {
        issues.push("Sealed independent-reviewer reports must be 6 when the optional review is selected");
      }
    } else if (fields["Independent-reviewer evidence state"] === "OPTIONAL_NOT_RUN") {
      if (fields["Independent-reviewer evidence SHA-256"] !== "NONE") {
        issues.push("Independent-reviewer evidence SHA-256 must be NONE when the optional review is not run");
      }
      if (fields["Required independent-reviewer reports"] !== "0") {
        issues.push("Required independent-reviewer reports must be 0 when the optional review is not run");
      }
      if (fields["Sealed independent-reviewer reports"] !== "0") {
        issues.push("Sealed independent-reviewer reports must be 0 when the optional review is not run");
      }
    } else {
      issues.push("Independent-reviewer evidence state must be COMPLETE or OPTIONAL_NOT_RUN");
    }
    if (emergency) {
      const waiverDigest = fields["Owner authorization evidence SHA-256"];
      for (const key of [
        "Host qualification evidence SHA-256",
        "Canary reconciliation evidence SHA-256",
        "Physical-device evidence SHA-256",
        "Independent-reviewer evidence SHA-256",
        "Adjudication evidence SHA-256",
        "Finding-disposition evidence SHA-256",
      ]) {
        if (fields[key] !== waiverDigest) {
          issues.push(`${key} must equal the emergency owner-authorization evidence digest`);
        }
      }
      if (!/^Emergency Beta 3:/u.test(fields["Residual risks"] || "")) {
        issues.push("Emergency approval must state the Beta 3 residual risk explicitly");
      }
    }
  }
  return result(issues.length === 0, fields, issues);
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
    && parsed.reviewedManifestVersion === expected.manifestVersion
    && parsed.reviewedManifestSha256 === expected.manifestSha256
    && parsed.reviewedRightsSha256 === expected.rightsSha256
    && parsed.reviewedPayloadSha256 === reviewedPayloadSha256
    && parsed.reviewedPayloadTreeOid === reviewedPayloadTreeOid
    && parsed.reviewedBrowserProductName === expected.browserProductName
    && parsed.reviewedBrowserFullVersion === expected.browserFullVersion
    && parsed.reviewedBrowserExecutableSha256 === expected.browserExecutableSha256
    && parsed.reviewedRunnerImageOS === expected.runnerImageOS
    && parsed.reviewedRunnerImageVersion === expected.runnerImageVersion
    && (
      parsed.status === "EMERGENCY_APPROVED"
      || (
        parsed.qualificationCommitSha === expected.qualificationCommitSha
        && parsed.evidenceSuccessorPolicy === CURRENT_EVIDENCE_SUCCESSOR_POLICY
        && expected.evidenceSuccessorValid === true
      )
    )
  );
}

function gate(id, title, status, reasons) {
  return Object.freeze({
    id,
    title,
    status,
    classification: status === "PASS"
      ? "VERIFIED"
      : status === "OWNER_SKIPPED"
        ? "OWNER_AUTHORIZED_BETA4_CANARY_SKIP"
      : status === "OPTIONAL"
        ? "OPTIONAL_REVIEW_NOT_RUN"
      : status === "DEFERRED"
        ? "OWNER_DIRECTED_PRERELEASE_DEFERRAL"
      : status === "WAIVED"
        ? "OWNER_AUTHORIZED_EMERGENCY_BETA3_WAIVER"
        : "PENDING_EVIDENCE_APPROVAL_GATE",
    details: status === "PASS"
      ? "Exact current evidence is present and bound to the reviewed candidate."
      : status === "OWNER_SKIPPED"
        ? "The project owner directed that the trusted-HTTPS canary not run for Beta 4; no canary, reconciliation, secure-update, offline-relaunch, or privacy-clearance pass is claimed."
      : status === "OPTIONAL"
        ? "This optional evidence cycle was offered but not selected; no pass or release-readiness claim is made for it."
      : status === "DEFERRED"
        ? "The project owner deferred external host privacy/legal qualification for prerelease builds until the first stable release; no host approval or privacy-clearance claim is made."
      : status === "WAIVED"
        ? "The project owner explicitly waived this external evidence gate for emergency Beta 3 only; no pass is claimed."
        : reasons.join("; "),
  });
}

export function evaluateExternalReleaseEvidence(parsed, expected = {}, now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  const currentTime = instant.getTime();
  const reviewedTime = Date.parse(parsed?.externalEvidenceReviewedAt || "");
  const expiresTime = Date.parse(parsed?.externalEvidenceExpiresAt || "");
  const expectedReleaseTag = expected.releaseTag || CURRENT_RELEASE_TAG;
  const prerelease = isPrereleaseReleaseTag(expectedReleaseTag);
  const emergencyRequested = parsed?.status === "EMERGENCY_APPROVED";
  const emergency = emergencyRequested && expectedReleaseTag === EMERGENCY_BETA3_RELEASE_TAG;
  const beta4CanaryOwnerSkipped = !emergency
    && expectedReleaseTag === BETA4_RELEASE_TAG
    && parsed?.canaryReconciliationState === BETA4_CANARY_OWNER_SKIP_STATE
    && parsed?.canaryReconciliationEvidenceSha256 === "NONE";
  const commonReasons = [];
  if (emergencyRequested && !emergency) {
    commonReasons.push(`the emergency Beta 3 exception cannot authorize ${expectedReleaseTag}`);
  }
  if (!parsed?.valid) commonReasons.push(`clearance schema is invalid${parsed?.issues?.length ? ` (${parsed.issues.join("; ")})` : ""}`);
  if (!["APPROVED", "EMERGENCY_APPROVED"].includes(parsed?.status)) {
    commonReasons.push(`clearance status is ${parsed?.status || "UNKNOWN"}`);
  }
  if (!artifactIdentityMatches(parsed, expected)) commonReasons.push("candidate or reviewed qualification hosted-Windows record does not match");
  if (!Number.isFinite(currentTime)) commonReasons.push("audit time is invalid");
  if (!Number.isFinite(reviewedTime) || reviewedTime > currentTime) commonReasons.push("external evidence review timestamp is missing or in the future");
  if (!Number.isFinite(expiresTime) || expiresTime <= currentTime) commonReasons.push("external evidence is missing an expiry or is stale");

  const buildReasons = (...specific) => [...commonReasons, ...specific.filter(Boolean)];
  const definitions = [
    [
      "EXT-HOST",
      "Host and child-facing privacy qualification",
      (parsed?.hostQualificationState === "APPROVED"
        || (prerelease && parsed?.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE))
        && sha256(parsed?.hostQualificationEvidenceSha256),
      parsed?.hostQualificationState === "APPROVED"
        || (prerelease && parsed?.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE)
        ? null
        : `host qualification is ${parsed?.hostQualificationState || "UNKNOWN"}`,
      sha256(parsed?.hostQualificationEvidenceSha256) ? null : "host qualification evidence digest is missing or malformed",
    ],
    [
      "EXT-CANARY",
      "Trusted-HTTPS canary reconciliation",
      parsed?.canaryReconciliationState === "RECONCILED" && sha256(parsed?.canaryReconciliationEvidenceSha256),
      parsed?.canaryReconciliationState === "RECONCILED" || beta4CanaryOwnerSkipped ? null : `canary reconciliation is ${parsed?.canaryReconciliationState || "UNKNOWN"}`,
      sha256(parsed?.canaryReconciliationEvidenceSha256) || beta4CanaryOwnerSkipped ? null : "canary evidence digest is missing or malformed",
    ],
    [
      "EXT-DEVICE",
      "Optional six-lane physical-device matrix",
      parsed?.physicalDeviceEvidenceState === "COMPLETE"
        && parsed?.requiredPhysicalDeviceLanes === "6"
        && parsed?.passedPhysicalDeviceLanes === "6"
        && parsed?.primaryIPadJourneyResult === "PASS"
        && sha256(parsed?.physicalDeviceEvidenceSha256),
      ["COMPLETE", "OPTIONAL_NOT_RUN"].includes(parsed?.physicalDeviceEvidenceState)
        ? null
        : `physical-device evidence is ${parsed?.physicalDeviceEvidenceState || "UNKNOWN"}`,
      parsed?.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
        || (parsed?.requiredPhysicalDeviceLanes === "6" && parsed?.passedPhysicalDeviceLanes === "6")
        ? null
        : "the selected optional six-lane physical-device cycle is incomplete",
      parsed?.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
        || parsed?.primaryIPadJourneyResult === "PASS"
        ? null
        : "the selected optional primary-iPad journey is not PASS",
      parsed?.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
        || sha256(parsed?.physicalDeviceEvidenceSha256)
        ? null
        : "physical-device evidence digest is missing or malformed",
    ],
    [
      "EXT-REVIEWERS",
      "Optional six-reviewer cycle",
      parsed?.independentReviewerEvidenceState === "COMPLETE"
        && parsed?.requiredIndependentReviewerReports === "6"
        && parsed?.sealedIndependentReviewerReports === "6"
        && sha256(parsed?.independentReviewerEvidenceSha256),
      ["COMPLETE", "OPTIONAL_NOT_RUN"].includes(parsed?.independentReviewerEvidenceState)
        ? null
        : `independent-reviewer evidence is ${parsed?.independentReviewerEvidenceState || "UNKNOWN"}`,
      parsed?.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
        || (parsed?.requiredIndependentReviewerReports === "6" && parsed?.sealedIndependentReviewerReports === "6")
        ? null
        : "the selected optional six-reviewer cycle is incomplete",
      parsed?.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
        || sha256(parsed?.independentReviewerEvidenceSha256)
        ? null
        : "independent-reviewer evidence digest is missing or malformed",
    ],
    [
      "EXT-ADJUDICATION",
      "Independent adjudication",
      parsed?.adjudicationState === "APPROVED"
        && parsed?.adjudicationRecommendation === "RELEASE"
        && sha256(parsed?.adjudicationEvidenceSha256),
      parsed?.adjudicationState === "APPROVED" ? null : `adjudication is ${parsed?.adjudicationState || "UNKNOWN"}`,
      parsed?.adjudicationRecommendation === "RELEASE" ? null : "adjudication does not recommend release",
      sha256(parsed?.adjudicationEvidenceSha256) ? null : "adjudication evidence digest is missing or malformed",
    ],
    [
      "EXT-FINDINGS",
      "Finding disposition",
      parsed?.findingDispositionState === "COMPLETE"
        && parsed?.openCriticalFindings === "0"
        && parsed?.openHighFindings === "0"
        && parsed?.unacceptedMediumFindings === "0"
        && parsed?.unrecordedLowFindings === "0"
        && sha256(parsed?.findingDispositionEvidenceSha256),
      parsed?.findingDispositionState === "COMPLETE" ? null : `finding disposition is ${parsed?.findingDispositionState || "UNKNOWN"}`,
      parsed?.openCriticalFindings === "0" ? null : "critical findings remain open or unknown",
      parsed?.openHighFindings === "0" ? null : "high findings remain open or unknown",
      parsed?.unacceptedMediumFindings === "0" ? null : "medium findings remain without exact owner acceptance",
      parsed?.unrecordedLowFindings === "0" ? null : "low findings remain unrecorded",
      sha256(parsed?.findingDispositionEvidenceSha256) ? null : "finding-disposition evidence digest is missing or malformed",
    ],
    [
      "EXT-HOSTED-WINDOWS",
      "Reviewed GitHub-hosted Windows evidence",
      parsed?.hostedWindowsEvidenceState === "REVIEWED"
        && sha256(parsed?.hostedWindowsEvidenceSha256)
        && parsed?.hostedWindowsEvidenceSha256 === expected.browserRunnerEvidenceSha256
        && expected.browserRunnerEvidenceReviewed === true,
      parsed?.hostedWindowsEvidenceState === "REVIEWED" ? null : `hosted-Windows evidence is ${parsed?.hostedWindowsEvidenceState || "UNKNOWN"}`,
      sha256(parsed?.hostedWindowsEvidenceSha256) ? null : "hosted-Windows evidence digest is missing or malformed",
      parsed?.hostedWindowsEvidenceSha256 === expected.browserRunnerEvidenceSha256 ? null : "hosted-Windows evidence digest does not match the reviewed browser/runner record",
      expected.browserRunnerEvidenceReviewed === true ? null : "the reviewed qualification record or final hosted browser observation is invalid",
    ],
    [
      "EXT-OWNER",
      "Project-owner push authorization",
      parsed?.ownerAuthorizationState === (emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED")
        && sha256(parsed?.ownerAuthorizationEvidenceSha256)
        && sha256(parsed?.reviewBundleSha256)
        && parsed?.authorizedReleaseTag === expectedReleaseTag
        && parsed?.authorizedProtectedRef === "refs/heads/main",
      parsed?.ownerAuthorizationState === (emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED")
        ? null
        : `owner authorization is ${parsed?.ownerAuthorizationState || "UNKNOWN"}`,
      sha256(parsed?.ownerAuthorizationEvidenceSha256) ? null : "owner-authorization evidence digest is missing or malformed",
      sha256(parsed?.reviewBundleSha256) ? null : "review-bundle digest is missing or malformed",
      parsed?.authorizedReleaseTag === expectedReleaseTag ? null : "owner authorization names a different release tag",
      parsed?.authorizedProtectedRef === "refs/heads/main" ? null : "owner authorization names a different protected ref",
    ],
  ];
  const gates = definitions.map(([id, title, specificPass, ...specificReasons]) => {
    const reasons = buildReasons(...specificReasons);
    if (emergency && EMERGENCY_BETA3_WAIVED_GATE_IDS.includes(id) && commonReasons.length === 0) {
      return gate(id, title, "WAIVED", reasons);
    }
    if (
      beta4CanaryOwnerSkipped
      && BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS.includes(id)
      && commonReasons.length === 0
    ) {
      return gate(id, title, "OWNER_SKIPPED", reasons);
    }
    if (
      !emergency
      && prerelease
      && PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS.includes(id)
      && commonReasons.length === 0
      && parsed?.hostQualificationState === PRERELEASE_HOST_QUALIFICATION_STATE
      && sha256(parsed?.hostQualificationEvidenceSha256)
    ) {
      return gate(id, title, "DEFERRED", reasons);
    }
    if (
      !emergency
      && OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(id)
      && commonReasons.length === 0
      && (
        id === "EXT-DEVICE"
          ? parsed?.physicalDeviceEvidenceState === "OPTIONAL_NOT_RUN"
          : parsed?.independentReviewerEvidenceState === "OPTIONAL_NOT_RUN"
      )
    ) {
      return gate(id, title, "OPTIONAL", reasons);
    }
    return gate(id, title, commonReasons.length === 0 && specificPass ? "PASS" : "BLOCKED", reasons);
  });
  const standardPattern = gates.every((item, index) => (
    item.id === EXTERNAL_RELEASE_GATE_IDS[index]
    && (
      item.status === "PASS"
      || (beta4CanaryOwnerSkipped && item.id === "EXT-CANARY" && item.status === "OWNER_SKIPPED")
      || (prerelease && item.id === "EXT-HOST" && item.status === "DEFERRED")
      || (OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(item.id) && item.status === "OPTIONAL")
    )
  ));
  const emergencyPattern = gates.every((item, index) => (
    item.id === EXTERNAL_RELEASE_GATE_IDS[index]
    && item.status === (index < EMERGENCY_BETA3_WAIVED_GATE_IDS.length ? "WAIVED" : "PASS")
  ));
  return Object.freeze({
    status: gates.length === EXTERNAL_RELEASE_GATE_IDS.length && standardPattern
      ? "PASS"
      : emergency && emergencyPattern
        ? "EMERGENCY_WAIVER"
        : "BLOCKED",
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
    requiredCount: emergency
      ? EXTERNAL_RELEASE_GATE_IDS.length
      : REQUIRED_EXTERNAL_RELEASE_GATE_IDS.length - (prerelease ? 1 : 0) - (beta4CanaryOwnerSkipped ? 1 : 0),
    beta4CanaryOwnerSkipped,
    gates: Object.freeze(gates),
  });
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

export function computeReleaseDecision({ technicalShippable, publicationStatus, externalReleaseEvidence }) {
  const gates = externalReleaseEvidence?.gates;
  const standard = publicationStatus === "APPROVED"
    && externalReleaseEvidence?.status === "PASS"
    && Array.isArray(gates)
    && gates.length === EXTERNAL_RELEASE_GATE_IDS.length
    && gates.every((item, index) => (
      item?.id === EXTERNAL_RELEASE_GATE_IDS[index]
      && (
        item.status === "PASS"
        || (
          item.id === "EXT-CANARY"
          && item.status === "OWNER_SKIPPED"
          && externalReleaseEvidence?.beta4CanaryOwnerSkipped === true
        )
        || (
          item.id === "EXT-HOST"
          && item.status === "DEFERRED"
          && externalReleaseEvidence?.prereleaseHostDeferralEligible === true
        )
        || (OPTIONAL_EXTERNAL_RELEASE_GATE_IDS.includes(item.id) && item.status === "OPTIONAL")
      )
    ));
  const emergency = publicationStatus === "EMERGENCY_APPROVED"
    && externalReleaseEvidence?.status === "EMERGENCY_WAIVER"
    && Array.isArray(gates)
    && gates.length === EXTERNAL_RELEASE_GATE_IDS.length
    && gates.every((item, index) => (
      item?.id === EXTERNAL_RELEASE_GATE_IDS[index]
      && item.status === (index < EMERGENCY_BETA3_WAIVED_GATE_IDS.length ? "WAIVED" : "PASS")
    ));
  return Boolean(
    technicalShippable === true
    && (standard || emergency)
  );
}
