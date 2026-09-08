export const AUDIT_LANE_IDS = Object.freeze([
  "coverage",
  "browser",
  "playwright",
  "mutation",
  "generator",
]);

const ENVELOPE_KEYS = Object.freeze([
  "candidateId",
  "durationMs",
  "error",
  "executionStatus",
  "laneId",
  "result",
  "resultType",
  "runId",
  "schemaVersion",
]);

export const exactKeys = (value, expected) => value
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

export const roundMs = (value) => Math.max(0, Math.round(Number(value) || 0));

export function failedAuditLaneResult(laneId, message, executionStatus = "ERROR") {
  const reason = `${executionStatus}: ${message}`;
  const resultStatus = executionStatus === "NOT_RUN" ? "NOT_RUN" : "FAIL";
  if (laneId === "coverage") {
    return {
      status: resultStatus,
      calibrated: false,
      calibration: { reasons: [reason], fullBranchPct: null, partialBranchPct: null, aggregateBranchPct: null },
      exactBytes: false,
      branchPct: null,
      engineSha256: null,
      structuredAuditValid: false,
      structuredAudit: null,
    };
  }
  if (laneId === "mutation") return { status: resultStatus, engineSha256: null, families: [], error: reason };
  if (laneId === "generator") return { status: resultStatus, engineSha256: null, issues: [reason], processStatus: null, error: reason };
  if (laneId === "browser") {
    return {
      status: resultStatus,
      results: [],
      reason,
      process: { status: null, signal: executionStatus === "TIMEOUT" ? "TIMEOUT" : null, error: reason, timedOut: executionStatus === "TIMEOUT" },
    };
  }
  return {
    status: resultStatus,
    findings: [reason],
    summary: { expected: 0, actual: 0, passed: 0, failed: 0, skipped: 0, unknown: 0, duplicates: 0 },
    results: [],
    process: { status: "FAIL", stdout: "", stderr: reason },
  };
}

export function createAuditLaneEnvelope({
  candidateId,
  durationMs,
  error = null,
  executionStatus = "COMPLETED",
  laneId,
  result,
  runId,
}) {
  return {
    schemaVersion: 1,
    resultType: "MATH_QUEST_AUDIT_LANE",
    laneId,
    runId,
    candidateId,
    executionStatus,
    durationMs: roundMs(durationMs),
    result,
    error,
  };
}

const EXECUTION_STATUSES = new Set(["COMPLETED", "ERROR", "NOT_RUN", "TIMEOUT"]);

function envelopeIdentityIssues(envelope, issues) {
  if (!exactKeys(envelope, ENVELOPE_KEYS)) issues.push("lane envelope root is not closed");
  if (envelope?.schemaVersion !== 1 || envelope?.resultType !== "MATH_QUEST_AUDIT_LANE") issues.push("lane envelope identity is invalid");
}

function recordEnvelopeLane(envelope, expected, seen, issues) {
  if (!expected.has(envelope?.laneId)) issues.push(`unknown lane ${String(envelope?.laneId)}`);
  else if (seen.has(envelope.laneId)) issues.push(`duplicate lane ${envelope.laneId}`);
  else seen.add(envelope.laneId);
}

function envelopeBindingIssues(envelope, candidateId, runId, issues) {
  if (envelope?.runId !== runId) issues.push(`${String(envelope?.laneId)} carries a foreign run id`);
  if (envelope?.candidateId !== candidateId) issues.push(`${String(envelope?.laneId)} carries a foreign candidate id`);
}

function envelopeExecutionIssues(envelope, issues) {
  if (!Number.isSafeInteger(envelope?.durationMs) || envelope.durationMs < 0) issues.push(`${String(envelope?.laneId)} duration is invalid`);
  if (!EXECUTION_STATUSES.has(envelope?.executionStatus)) issues.push(`${String(envelope?.laneId)} execution status is invalid`);
}

function envelopeResultIssues(envelope, issues) {
  if (!envelope?.result || typeof envelope.result !== "object" || Array.isArray(envelope.result)) issues.push(`${String(envelope?.laneId)} result is absent`);
}

export function auditLaneEnvelopeIssues(envelopes, { candidateId, runId, laneIds = AUDIT_LANE_IDS } = {}) {
  const issues = [];
  const expected = new Set(laneIds);
  const seen = new Set();
  if (!Array.isArray(envelopes)) return ["lane envelopes are not an array"];
  for (const envelope of envelopes) {
    envelopeIdentityIssues(envelope, issues);
    recordEnvelopeLane(envelope, expected, seen, issues);
    envelopeBindingIssues(envelope, candidateId, runId, issues);
    envelopeExecutionIssues(envelope, issues);
    envelopeResultIssues(envelope, issues);
  }
  for (const laneId of laneIds) if (!seen.has(laneId)) issues.push(`missing lane ${laneId}`);
  return [...new Set(issues)];
}

function payloadStabilityIssues(before, after, issues) {
  if (!before?.payloadSha256 || before.payloadSha256 !== after?.payloadSha256) issues.push("public payload changed during audit");
  if (!before?.payloadTreeOid || before.payloadTreeOid !== after?.payloadTreeOid) issues.push("public payload tree changed during audit");
}

export function auditCandidateStabilityIssues({ before, after, revisionBefore, revisionAfter } = {}) {
  const issues = [];
  if (before?.status !== "PASS" || after?.status !== "PASS") issues.push("public-candidate guard did not pass twice");
  if (!/^[a-f0-9]{40}$/u.test(String(revisionBefore || ""))) issues.push("starting repository revision is invalid");
  if (revisionBefore !== revisionAfter) issues.push("repository revision changed during audit");
  payloadStabilityIssues(before, after, issues);
  return issues;
}

function validateJsonChildExit({ parsed, stderr, exitCode, signal, timedOut }) {
  if (timedOut) {
    const error = new Error(`JSON child timed out${parsed ? " after emitting diagnostic JSON" : ""}: ${String(stderr || "").slice(-4_000)}`);
    error.executionStatus = "TIMEOUT";
    throw error;
  }
  if (exitCode !== 0 || signal) {
    const error = new Error(`JSON child ended with code ${String(exitCode)} and signal ${String(signal || "none")}${parsed ? " after emitting diagnostic JSON" : ""}: ${String(stderr || "").slice(-4_000)}`);
    error.executionStatus = "ERROR";
    throw error;
  }
}

function validateJsonChildReport(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("JSON child emitted no valid object report.");
    error.executionStatus = "ERROR";
    throw error;
  }
}

export function interpretJsonChildCompletion({ stdout = "", stderr = "", exitCode = 0, signal = null, timedOut = false } = {}) {
  let parsed = null;
  try { parsed = JSON.parse(String(stdout || "")); } catch {}
  validateJsonChildExit({ parsed, stderr, exitCode, signal, timedOut });
  validateJsonChildReport(parsed);
  return parsed;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function nestedProcessTimeoutForLane(policy, laneId) {
  const reserve = policy?.nestedProcessFinalizationReserveMs?.[laneId];
  if (reserve === undefined) return null;
  const timeout = policy?.laneTimeoutMs?.[laneId];
  if (!positiveSafeInteger(timeout)) throw new RangeError(`${laneId} lane timeout is invalid`);
  if (!positiveSafeInteger(reserve) || reserve >= timeout) throw new RangeError(`${laneId} nested-process finalization reserve is invalid`);
  return timeout - reserve;
}

function browserConcurrencyMaximum(policy, nested, executionMode) {
  const value = executionMode === policy?.githubHosted?.mode
    ? nested?.browserShardMaximumWhenTopLevelParallel
    : nested?.browserShardMaximum;
  if (!positiveSafeInteger(value)) throw new RangeError("browser nested-concurrency maximum is invalid");
  return value;
}

export function nestedConcurrencyMaximumForLane(policy, laneId, executionMode) {
  const nested = policy?.nestedConcurrency;
  if (laneId === "browser") return browserConcurrencyMaximum(policy, nested, executionMode);
  if (laneId === "playwright") {
    const value = nested?.playwrightWorkers;
    if (!positiveSafeInteger(value)) throw new RangeError("playwright nested-concurrency maximum is invalid");
    return value;
  }
  return null;
}
