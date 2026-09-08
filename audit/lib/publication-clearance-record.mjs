import { CURRENT_EVIDENCE_SUCCESSOR_POLICY, CURRENT_RELEASE_TAG, EMERGENCY_BETA3_RELEASE_TAG, PRERELEASE_HOST_QUALIFICATION_STATE, isPrereleaseReleaseTag, sha256 } from "./publication-clearance-contract.mjs";

const CLEARANCE_FIELDS = Object.freeze([
  ["Status","status","INVALID"],
  ["Review date","reviewDate",null],
  ["Review result","reviewResult",null],
  ["Required failures","requiredFailures",null],
  ["Required skips","requiredSkips",null],
  ["Residual risks","residualRisks",null],
  ["Reviewed engine SHA-256","reviewedEngineSha256",null],
  ["Reviewed curriculum manifest version","reviewedManifestVersion",null],
  ["Reviewed curriculum manifest SHA-256","reviewedManifestSha256",null],
  ["Reviewed rights-state SHA-256","reviewedRightsSha256",null],
  ["Reviewed public payload SHA-256","reviewedPayloadSha256",null],
  ["Reviewed public payload tree OID","reviewedPayloadTreeOid",null],
  ["Qualification commit SHA","qualificationCommitSha",null],
  ["Evidence successor policy","evidenceSuccessorPolicy",null],
  ["Reviewed browser product name","reviewedBrowserProductName",null],
  ["Reviewed browser full version","reviewedBrowserFullVersion",null],
  ["Reviewed browser executable SHA-256","reviewedBrowserExecutableSha256",null],
  ["Reviewed runner ImageOS","reviewedRunnerImageOS",null],
  ["Reviewed runner ImageVersion","reviewedRunnerImageVersion",null],
  ["External evidence reviewed at","externalEvidenceReviewedAt",null],
  ["External evidence expires at","externalEvidenceExpiresAt",null],
  ["Host qualification state","hostQualificationState",null],
  ["Host qualification evidence SHA-256","hostQualificationEvidenceSha256",null],
  ["Canary reconciliation state","canaryReconciliationState",null],
  ["Canary reconciliation evidence SHA-256","canaryReconciliationEvidenceSha256",null],
  ["Physical-device evidence state","physicalDeviceEvidenceState",null],
  ["Physical-device evidence SHA-256","physicalDeviceEvidenceSha256",null],
  ["Required physical-device lanes","requiredPhysicalDeviceLanes",null],
  ["Passed physical-device lanes","passedPhysicalDeviceLanes",null],
  ["Primary iPad journey result","primaryIPadJourneyResult",null],
  ["Independent-reviewer evidence state","independentReviewerEvidenceState",null],
  ["Independent-reviewer evidence SHA-256","independentReviewerEvidenceSha256",null],
  ["Required independent-reviewer reports","requiredIndependentReviewerReports",null],
  ["Sealed independent-reviewer reports","sealedIndependentReviewerReports",null],
  ["Adjudication state","adjudicationState",null],
  ["Adjudication evidence SHA-256","adjudicationEvidenceSha256",null],
  ["Adjudication recommendation","adjudicationRecommendation",null],
  ["Finding-disposition state","findingDispositionState",null],
  ["Finding-disposition evidence SHA-256","findingDispositionEvidenceSha256",null],
  ["Open critical findings","openCriticalFindings",null],
  ["Open high findings","openHighFindings",null],
  ["Unaccepted medium findings","unacceptedMediumFindings",null],
  ["Unrecorded low findings","unrecordedLowFindings",null],
  ["Hosted-Windows evidence state","hostedWindowsEvidenceState",null],
  ["Hosted-Windows evidence SHA-256","hostedWindowsEvidenceSha256",null],
  ["Owner authorization state","ownerAuthorizationState",null],
  ["Owner authorization evidence SHA-256","ownerAuthorizationEvidenceSha256",null],
  ["Authorized release tag","authorizedReleaseTag",null],
  ["Authorized protected ref","authorizedProtectedRef",null],
  ["Review-bundle SHA-256","reviewBundleSha256",null],
]);
const FIELD_ORDER = Object.freeze(CLEARANCE_FIELDS.map(([label]) => label));

function result(valid, fields, issues) {
  const projected = Object.fromEntries(CLEARANCE_FIELDS.map(([label, key, fallback]) => [key, fields[label] || fallback]));
  return Object.freeze({ valid, ...projected, issues: Object.freeze([...issues]) });
}

function validUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(String(value || ""))) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().replace(".000Z", "Z") === value;
}





const OPTIONAL_APPROVAL_CYCLES = Object.freeze([
  { stateField: "Physical-device evidence state", invalidState: "Physical-device evidence state must be COMPLETE or OPTIONAL_NOT_RUN", states: {
    "EMERGENCY": [
      ["Physical-device evidence state", "WAIVED_BETA3", "Physical-device evidence state must be WAIVED_BETA3"],
      ["Physical-device evidence SHA-256", sha256, "Physical-device evidence SHA-256 must be 64 lowercase hexadecimal characters"],
      ["Required physical-device lanes", "6", "Required physical-device lanes must be 6"],
      ["Passed physical-device lanes", "0", "Passed physical-device lanes must be 0"],
      ["Primary iPad journey result", "NOT_RUN", "Primary iPad journey result must be NOT_RUN"],
    ],
    "COMPLETE": [
      ["Physical-device evidence SHA-256", sha256, "Physical-device evidence SHA-256 must be 64 lowercase hexadecimal characters when the optional device cycle is completed"],
      ["Required physical-device lanes", "6", "Required physical-device lanes must be 6 when the optional device cycle is selected"],
      ["Passed physical-device lanes", "6", "Passed physical-device lanes must be 6 when the optional device cycle is selected"],
      ["Primary iPad journey result", "PASS", "Primary iPad journey result must be PASS when the optional device cycle is selected"],
    ],
    "OPTIONAL_NOT_RUN": [
      ["Physical-device evidence SHA-256", "NONE", "Physical-device evidence SHA-256 must be NONE when the optional device cycle is not run"],
      ["Required physical-device lanes", "0", "Required physical-device lanes must be 0 when the optional device cycle is not run"],
      ["Passed physical-device lanes", "0", "Passed physical-device lanes must be 0 when the optional device cycle is not run"],
      ["Primary iPad journey result", "NOT_RUN", "Primary iPad journey result must be NOT_RUN when the optional device cycle is not run"],
    ],
  } },
  { stateField: "Independent-reviewer evidence state", invalidState: "Independent-reviewer evidence state must be COMPLETE or OPTIONAL_NOT_RUN", states: {
    "EMERGENCY": [
      ["Independent-reviewer evidence state", "WAIVED_BETA3", "Independent-reviewer evidence state must be WAIVED_BETA3"],
      ["Independent-reviewer evidence SHA-256", sha256, "Independent-reviewer evidence SHA-256 must be 64 lowercase hexadecimal characters"],
      ["Required independent-reviewer reports", "6", "Required independent-reviewer reports must be 6"],
      ["Sealed independent-reviewer reports", "0", "Sealed independent-reviewer reports must be 0"],
    ],
    "COMPLETE": [
      ["Independent-reviewer evidence SHA-256", sha256, "Independent-reviewer evidence SHA-256 must be 64 lowercase hexadecimal characters when the optional review is completed"],
      ["Required independent-reviewer reports", "6", "Required independent-reviewer reports must be 6 when the optional review is selected"],
      ["Sealed independent-reviewer reports", "6", "Sealed independent-reviewer reports must be 6 when the optional review is selected"],
    ],
    "OPTIONAL_NOT_RUN": [
      ["Independent-reviewer evidence SHA-256", "NONE", "Independent-reviewer evidence SHA-256 must be NONE when the optional review is not run"],
      ["Required independent-reviewer reports", "0", "Required independent-reviewer reports must be 0 when the optional review is not run"],
      ["Sealed independent-reviewer reports", "0", "Sealed independent-reviewer reports must be 0 when the optional review is not run"],
    ],
  } },
]);

function validateOptionalApprovalCycle(fields, policy, emergency, issues) {
  const state = emergency ? "EMERGENCY" : fields[policy.stateField];
  if (!emergency && !["COMPLETE", "OPTIONAL_NOT_RUN"].includes(state)) {
    issues.push(policy.invalidState);
    return;
  }
  for (const [key, expected, message] of policy.states[state]) {
    const valid = typeof expected === "function" ? expected(fields[key]) : fields[key] === expected;
    if (!valid) issues.push(message);
  }
}
function checkPendingHost(fields, issues) {
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
}

function checkPendingDevice(fields, issues) {
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
}

function checkPendingReviewers(fields, issues) {
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

function checkPendingClearance(fields, issues) {
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
  checkPendingHost(fields, issues);
  checkPendingDevice(fields, issues);
  checkPendingReviewers(fields, issues);
}

function checkApprovalReview(fields, issues, policy) {
  const { emergency } = policy;
  const expectedResult = emergency ? "EMERGENCY_PASS" : "PASS";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(fields["Review date"] || "")) issues.push("Review date must use YYYY-MM-DD");
  if (fields["Review result"] !== expectedResult) {
    issues.push(`Review result must be ${expectedResult}`);
  }
  if (fields["Required failures"] !== "0") issues.push("Required failures must be 0");
  if (fields["Required skips"] !== "0") issues.push("Required skips must be 0");
  if (!fields["Residual risks"] || fields["Residual risks"] === "PENDING" || fields["Residual risks"].length > 500) {
    issues.push("Residual risks must be an explicit one-line statement of at most 500 characters");
  }
}

function checkApprovalHostDeferral(fields, issues, policy) {
  const { hostDeferred, prerelease } = policy;
  if (hostDeferred && !prerelease) {
    issues.push("Host qualification may be deferred only for a semantic-version prerelease tag");
  }
  if (hostDeferred && !/^Host privacy deferred until stable:/u.test(fields["Residual risks"] || "")) {
    issues.push("A prerelease host deferral must state its host-metadata and under-13 residual risk explicitly");
  }
}

function checkApprovalArtifactIdentity(fields, issues) {
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
}

function checkApprovalSuccessor(fields, issues, policy) {
  const { emergency } = policy;
  if (emergency) {
    if (fields["Qualification commit SHA"] !== "NOT_APPLICABLE_BETA3") issues.push("Qualification commit SHA must be NOT_APPLICABLE_BETA3 for emergency Beta 3");
    if (fields["Evidence successor policy"] !== "NOT_APPLICABLE_BETA3") issues.push("Evidence successor policy must be NOT_APPLICABLE_BETA3 for emergency Beta 3");
  } else {
    if (!/^[a-f0-9]{40}$/u.test(fields["Qualification commit SHA"] || "")) issues.push("Qualification commit SHA must be 40 lowercase hexadecimal characters");
    if (fields["Evidence successor policy"] !== CURRENT_EVIDENCE_SUCCESSOR_POLICY) {
      issues.push(`Evidence successor policy must be ${CURRENT_EVIDENCE_SUCCESSOR_POLICY}`);
    }
  }
}

function checkApprovalBrowserIdentity(fields, issues) {
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
}

function checkApprovalEvidenceDates(fields, issues) {
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
}

function checkApprovalEvidenceDigests(fields, issues) {
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
}

function checkApprovalFindings(fields, issues, policy) {
  const { emergency } = policy;
  for (const [key, expected] of [
    ["Open critical findings", "0"],
    ["Open high findings", "0"],
    ["Unaccepted medium findings", emergency ? "UNKNOWN" : "0"],
    ["Unrecorded low findings", emergency ? "UNKNOWN" : "0"],
  ]) {
    if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
  }
}

function checkEmergencyApproval(fields, issues, policy) {
  const { emergency } = policy;
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

function approvalStateExpectations(policy) {
  const { emergency, hostDeferred } = policy;
  return [
    ["Host qualification state", emergency ? "WAIVED_BETA3" : hostDeferred ? PRERELEASE_HOST_QUALIFICATION_STATE : "APPROVED"],
    ["Canary reconciliation state", emergency ? "WAIVED_BETA3" : "RECONCILED"],
    ["Adjudication state", emergency ? "WAIVED_BETA3" : "APPROVED"],
    ["Adjudication recommendation", emergency ? "NOT_RUN" : "RELEASE"],
    ["Finding-disposition state", emergency ? "AUTOMATED_ONLY" : "COMPLETE"],
    ["Hosted-Windows evidence state", "REVIEWED"],
    ["Owner authorization state", emergency ? "EMERGENCY_BETA3_AUTHORIZED" : "PR_PUSH_AUTHORIZED"],
    ["Authorized release tag", emergency ? EMERGENCY_BETA3_RELEASE_TAG : CURRENT_RELEASE_TAG],
    ["Authorized protected ref", "refs/heads/main"],
  ];
}

function checkApprovalStates(fields, issues, policy) {
  for (const [key, expected] of approvalStateExpectations(policy)) {
    if (fields[key] !== expected) issues.push(`${key} must be ${expected}`);
  }
}

function checkApprovedClearance(fields, issues) {
  const emergency = fields.Status === "EMERGENCY_APPROVED";
  const prerelease = isPrereleaseReleaseTag(fields["Authorized release tag"]);
  const hostDeferred = fields["Host qualification state"] === PRERELEASE_HOST_QUALIFICATION_STATE;
  const policy = { emergency, prerelease, hostDeferred };
  checkApprovalReview(fields, issues, policy);
  checkApprovalHostDeferral(fields, issues, policy);
  checkApprovalArtifactIdentity(fields, issues);
  checkApprovalSuccessor(fields, issues, policy);
  checkApprovalBrowserIdentity(fields, issues);
  checkApprovalEvidenceDates(fields, issues);
  checkApprovalEvidenceDigests(fields, issues);
  checkApprovalStates(fields, issues, policy);
  checkApprovalFindings(fields, issues, policy);
  validateOptionalApprovalCycle(fields, OPTIONAL_APPROVAL_CYCLES[0], emergency, issues);
  validateOptionalApprovalCycle(fields, OPTIONAL_APPROVAL_CYCLES[1], emergency, issues);
  checkEmergencyApproval(fields, issues, policy);
}

function readClearanceFields(text, issues) {
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
  return fields;
}

export function parsePublicationClearance(text) {
  const issues = [];
  const fields = readClearanceFields(text, issues);
  if (fields.Status === "PENDING") checkPendingClearance(fields, issues);
  if (fields.Status === "APPROVED" || fields.Status === "EMERGENCY_APPROVED") checkApprovedClearance(fields, issues);
  return result(issues.length === 0, fields, issues);
}
