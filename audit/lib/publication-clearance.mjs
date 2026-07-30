export const PUBLICATION_CLEARANCE_PATH = "PUBLICATION_CLEARANCE.md";
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
  if (!["PENDING", "APPROVED"].includes(fields.Status)) issues.push("Status must be PENDING or APPROVED");
  if (fields.Status === "PENDING") {
    for (const key of FIELD_ORDER.slice(1)) {
      if (fields[key] !== "PENDING") issues.push(`${key} must be PENDING while Status is PENDING`);
    }
  }
  if (fields.Status === "APPROVED") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(fields["Review date"] || "")) issues.push("Review date must use YYYY-MM-DD");
    if (fields["Review result"] !== "PASS") issues.push("Review result must be PASS");
    if (fields["Required failures"] !== "0") issues.push("Required failures must be 0");
    if (fields["Required skips"] !== "0") issues.push("Required skips must be 0");
    if (!fields["Residual risks"] || fields["Residual risks"] === "PENDING" || fields["Residual risks"].length > 500) {
      issues.push("Residual risks must be an explicit one-line statement of at most 500 characters");
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
      "Canary reconciliation evidence SHA-256",
      "Physical-device evidence SHA-256",
      "Independent-reviewer evidence SHA-256",
      "Adjudication evidence SHA-256",
      "Finding-disposition evidence SHA-256",
      "Hosted-Windows evidence SHA-256",
      "Owner authorization evidence SHA-256",
      "Review-bundle SHA-256",
    ]) {
      if (!sha256(fields[key])) issues.push(`${key} must be 64 lowercase hexadecimal characters`);
    }
    for (const [key, expected] of [
      ["Host qualification state", "APPROVED"],
      ["Canary reconciliation state", "RECONCILED"],
      ["Physical-device evidence state", "COMPLETE"],
      ["Primary iPad journey result", "PASS"],
      ["Independent-reviewer evidence state", "COMPLETE"],
      ["Adjudication state", "APPROVED"],
      ["Adjudication recommendation", "RELEASE"],
      ["Finding-disposition state", "COMPLETE"],
      ["Hosted-Windows evidence state", "REVIEWED"],
      ["Owner authorization state", "PR_PUSH_AUTHORIZED"],
      ["Authorized release tag", "v1.0.0-beta.3"],
      ["Authorized protected ref", "refs/heads/main"],
    ]) {
      if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
    }
    for (const [key, expected] of [
      ["Required physical-device lanes", "6"],
      ["Passed physical-device lanes", "6"],
      ["Required independent-reviewer reports", "6"],
      ["Sealed independent-reviewer reports", "6"],
      ["Open critical findings", "0"],
      ["Open high findings", "0"],
      ["Unaccepted medium findings", "0"],
      ["Unrecorded low findings", "0"],
    ]) {
      if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
    }
  }
  return result(issues.length === 0, fields, issues);
}

function artifactIdentityMatches(parsed, expected = {}) {
  return Boolean(
    parsed?.reviewedEngineSha256 === expected.engineSha256
    && parsed.reviewedManifestVersion === expected.manifestVersion
    && parsed.reviewedManifestSha256 === expected.manifestSha256
    && parsed.reviewedRightsSha256 === expected.rightsSha256
    && parsed.reviewedPayloadSha256 === expected.payloadSha256
    && parsed.reviewedPayloadTreeOid === expected.payloadTreeOid
    && parsed.reviewedBrowserProductName === expected.browserProductName
    && parsed.reviewedBrowserFullVersion === expected.browserFullVersion
    && parsed.reviewedBrowserExecutableSha256 === expected.browserExecutableSha256
    && parsed.reviewedRunnerImageOS === expected.runnerImageOS
    && parsed.reviewedRunnerImageVersion === expected.runnerImageVersion
  );
}

function gate(id, title, pass, reasons) {
  return Object.freeze({
    id,
    title,
    status: pass ? "PASS" : "BLOCKED",
    classification: pass ? "VERIFIED" : "PENDING_EVIDENCE_APPROVAL_GATE",
    details: pass ? "Exact current evidence is present and bound to the reviewed candidate." : reasons.join("; "),
  });
}

export function evaluateExternalReleaseEvidence(parsed, expected = {}, now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  const currentTime = instant.getTime();
  const reviewedTime = Date.parse(parsed?.externalEvidenceReviewedAt || "");
  const expiresTime = Date.parse(parsed?.externalEvidenceExpiresAt || "");
  const commonReasons = [];
  if (!parsed?.valid) commonReasons.push(`clearance schema is invalid${parsed?.issues?.length ? ` (${parsed.issues.join("; ")})` : ""}`);
  if (parsed?.status !== "APPROVED") commonReasons.push(`clearance status is ${parsed?.status || "UNKNOWN"}`);
  if (!artifactIdentityMatches(parsed, expected)) commonReasons.push("candidate or hosted-Windows tuple does not match the current audit");
  if (!Number.isFinite(currentTime)) commonReasons.push("audit time is invalid");
  if (!Number.isFinite(reviewedTime) || reviewedTime > currentTime) commonReasons.push("external evidence review timestamp is missing or in the future");
  if (!Number.isFinite(expiresTime) || expiresTime <= currentTime) commonReasons.push("external evidence is missing an expiry or is stale");

  const buildReasons = (...specific) => [...commonReasons, ...specific.filter(Boolean)];
  const definitions = [
    [
      "EXT-HOST",
      "Host and child-facing privacy qualification",
      parsed?.hostQualificationState === "APPROVED" && sha256(parsed?.hostQualificationEvidenceSha256),
      parsed?.hostQualificationState === "APPROVED" ? null : `host qualification is ${parsed?.hostQualificationState || "UNKNOWN"}`,
      sha256(parsed?.hostQualificationEvidenceSha256) ? null : "host qualification evidence digest is missing or malformed",
    ],
    [
      "EXT-CANARY",
      "Canary artifact and response reconciliation",
      parsed?.canaryReconciliationState === "RECONCILED" && sha256(parsed?.canaryReconciliationEvidenceSha256),
      parsed?.canaryReconciliationState === "RECONCILED" ? null : `canary reconciliation is ${parsed?.canaryReconciliationState || "UNKNOWN"}`,
      sha256(parsed?.canaryReconciliationEvidenceSha256) ? null : "canary evidence digest is missing or malformed",
    ],
    [
      "EXT-DEVICE",
      "Required physical-device matrix",
      parsed?.physicalDeviceEvidenceState === "COMPLETE"
        && parsed?.requiredPhysicalDeviceLanes === "6"
        && parsed?.passedPhysicalDeviceLanes === "6"
        && parsed?.primaryIPadJourneyResult === "PASS"
        && sha256(parsed?.physicalDeviceEvidenceSha256),
      parsed?.physicalDeviceEvidenceState === "COMPLETE" ? null : `physical-device evidence is ${parsed?.physicalDeviceEvidenceState || "UNKNOWN"}`,
      parsed?.requiredPhysicalDeviceLanes === "6" && parsed?.passedPhysicalDeviceLanes === "6" ? null : "all six required physical-device lanes are not recorded as passed",
      parsed?.primaryIPadJourneyResult === "PASS" ? null : "the primary-iPad journey is not PASS",
      sha256(parsed?.physicalDeviceEvidenceSha256) ? null : "physical-device evidence digest is missing or malformed",
    ],
    [
      "EXT-REVIEWERS",
      "Six context-independent reviewer packets",
      parsed?.independentReviewerEvidenceState === "COMPLETE"
        && parsed?.requiredIndependentReviewerReports === "6"
        && parsed?.sealedIndependentReviewerReports === "6"
        && sha256(parsed?.independentReviewerEvidenceSha256),
      parsed?.independentReviewerEvidenceState === "COMPLETE" ? null : `independent-reviewer evidence is ${parsed?.independentReviewerEvidenceState || "UNKNOWN"}`,
      parsed?.requiredIndependentReviewerReports === "6" && parsed?.sealedIndependentReviewerReports === "6" ? null : "six required sealed reviewer reports are not present",
      sha256(parsed?.independentReviewerEvidenceSha256) ? null : "independent-reviewer evidence digest is missing or malformed",
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
      expected.browserRunnerEvidenceReviewed === true ? null : "browser/runner evidence is not a valid REVIEWED record matching the live hosted tuple",
    ],
    [
      "EXT-OWNER",
      "Project-owner push authorization",
      parsed?.ownerAuthorizationState === "PR_PUSH_AUTHORIZED"
        && sha256(parsed?.ownerAuthorizationEvidenceSha256)
        && sha256(parsed?.reviewBundleSha256)
        && parsed?.authorizedReleaseTag === "v1.0.0-beta.3"
        && parsed?.authorizedProtectedRef === "refs/heads/main",
      parsed?.ownerAuthorizationState === "PR_PUSH_AUTHORIZED" ? null : `owner authorization is ${parsed?.ownerAuthorizationState || "UNKNOWN"}`,
      sha256(parsed?.ownerAuthorizationEvidenceSha256) ? null : "owner-authorization evidence digest is missing or malformed",
      sha256(parsed?.reviewBundleSha256) ? null : "review-bundle digest is missing or malformed",
      parsed?.authorizedReleaseTag === "v1.0.0-beta.3" ? null : "owner authorization names a different release tag",
      parsed?.authorizedProtectedRef === "refs/heads/main" ? null : "owner authorization names a different protected ref",
    ],
  ];
  const gates = definitions.map(([id, title, specificPass, ...specificReasons]) => {
    const reasons = buildReasons(...specificReasons);
    return gate(id, title, commonReasons.length === 0 && specificPass, reasons);
  });
  return Object.freeze({
    status: gates.length === EXTERNAL_RELEASE_GATE_IDS.length && gates.every((item) => item.status === "PASS") ? "PASS" : "BLOCKED",
    reviewedAt: parsed?.externalEvidenceReviewedAt || null,
    expiresAt: parsed?.externalEvidenceExpiresAt || null,
    passCount: gates.filter((item) => item.status === "PASS").length,
    requiredCount: EXTERNAL_RELEASE_GATE_IDS.length,
    gates: Object.freeze(gates),
  });
}

export function clearanceMatches(parsed, expected = {}) {
  const external = evaluateExternalReleaseEvidence(parsed, expected, expected.now ?? new Date());
  return Boolean(
    parsed?.valid
    && parsed.status === "APPROVED"
    && artifactIdentityMatches(parsed, expected)
    && external.status === "PASS"
  );
}

export function computeReleaseDecision({ technicalShippable, publicationStatus, externalReleaseEvidence }) {
  const gates = externalReleaseEvidence?.gates;
  return Boolean(
    technicalShippable === true
    && publicationStatus === "APPROVED"
    && externalReleaseEvidence?.status === "PASS"
    && Array.isArray(gates)
    && gates.length === EXTERNAL_RELEASE_GATE_IDS.length
    && gates.every((item, index) => item?.id === EXTERNAL_RELEASE_GATE_IDS[index] && item.status === "PASS")
  );
}
