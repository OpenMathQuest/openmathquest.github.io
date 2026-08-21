import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

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

const exactKeys = (value, expected) => value
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

const roundMs = (value) => Math.max(0, Math.round(Number(value) || 0));

export function failedAuditLaneResult(laneId, message, executionStatus = "ERROR") {
  const reason = `${executionStatus}: ${message}`;
  if (laneId === "coverage") {
    return {
      status: "FAIL",
      calibrated: false,
      calibration: { reasons: [reason], fullBranchPct: null, partialBranchPct: null, aggregateBranchPct: null },
      exactBytes: false,
      branchPct: null,
      engineSha256: null,
      structuredAuditValid: false,
      structuredAudit: null,
    };
  }
  if (laneId === "mutation") return { status: "FAIL", engineSha256: null, families: [], error: reason };
  if (laneId === "generator") return { status: "FAIL", engineSha256: null, issues: [reason], processStatus: null, error: reason };
  if (laneId === "browser") {
    return {
      status: "FAIL",
      results: [],
      reason,
      process: { status: null, signal: executionStatus === "TIMEOUT" ? "TIMEOUT" : null, error: reason, timedOut: executionStatus === "TIMEOUT" },
    };
  }
  return {
    status: "FAIL",
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

export function auditLaneEnvelopeIssues(envelopes, { candidateId, runId, laneIds = AUDIT_LANE_IDS } = {}) {
  const issues = [];
  const expected = new Set(laneIds);
  const seen = new Set();
  if (!Array.isArray(envelopes)) return ["lane envelopes are not an array"];
  for (const envelope of envelopes) {
    if (!exactKeys(envelope, ENVELOPE_KEYS)) issues.push("lane envelope root is not closed");
    if (envelope?.schemaVersion !== 1 || envelope?.resultType !== "MATH_QUEST_AUDIT_LANE") issues.push("lane envelope identity is invalid");
    if (!expected.has(envelope?.laneId)) issues.push(`unknown lane ${String(envelope?.laneId)}`);
    else if (seen.has(envelope.laneId)) issues.push(`duplicate lane ${envelope.laneId}`);
    else seen.add(envelope.laneId);
    if (envelope?.runId !== runId) issues.push(`${String(envelope?.laneId)} carries a foreign run id`);
    if (envelope?.candidateId !== candidateId) issues.push(`${String(envelope?.laneId)} carries a foreign candidate id`);
    if (!Number.isSafeInteger(envelope?.durationMs) || envelope.durationMs < 0) issues.push(`${String(envelope?.laneId)} duration is invalid`);
    if (!new Set(["COMPLETED", "ERROR", "TIMEOUT"]).has(envelope?.executionStatus)) issues.push(`${String(envelope?.laneId)} execution status is invalid`);
    if (!envelope?.result || typeof envelope.result !== "object" || Array.isArray(envelope.result)) issues.push(`${String(envelope?.laneId)} result is absent`);
  }
  for (const laneId of laneIds) if (!seen.has(laneId)) issues.push(`missing lane ${laneId}`);
  return [...new Set(issues)];
}

function terminateProcessTree(child) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return;
  if (process.platform !== "win32") {
    try { child.kill("SIGKILL"); } catch {}
    return;
  }
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  spawnSync(path.join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
    timeout: 5_000,
  });
}

function executeLaneProcess({ candidateId, laneId, runId, root, timeoutMs, nodePath, browserPath, indexPath }) {
  return new Promise((resolve) => {
    const args = [
      path.join(root, "audit", "run-audit-lane.mjs"),
      `--lane=${laneId}`,
      `--run-id=${runId}`,
      `--candidate-id=${candidateId}`,
      `--index-path=${indexPath}`,
    ];
    if (browserPath) args.push(`--browser=${browserPath}`);
    const child = spawn(nodePath, args, {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let overflow = false;
    const maximumOutputBytes = 32 * 1024 * 1024;
    const finish = (envelope) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(envelope);
    };
    const fail = (executionStatus, message, durationMs) => finish(createAuditLaneEnvelope({
      candidateId,
      durationMs,
      error: message,
      executionStatus,
      laneId,
      result: failedAuditLaneResult(laneId, message, executionStatus),
      runId,
    }));
    const startedAt = performance.now();
    const append = (current, chunk) => {
      const next = `${current}${chunk}`;
      if (Buffer.byteLength(next, "utf8") > maximumOutputBytes) {
        overflow = true;
        terminateProcessTree(child);
        return next.slice(-maximumOutputBytes);
      }
      return next;
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => fail("ERROR", String(error), performance.now() - startedAt));
    child.once("exit", (code, signal) => {
      const durationMs = performance.now() - startedAt;
      if (timedOut) return fail("TIMEOUT", `lane exceeded ${timeoutMs} ms`, durationMs);
      if (overflow) return fail("ERROR", "lane output exceeded 32 MiB", durationMs);
      if (code !== 0 || signal) return fail("ERROR", `lane process ended with code ${code ?? "null"} and signal ${signal ?? "null"}: ${stderr.slice(-4_000)}`, durationMs);
      try {
        finish(JSON.parse(stdout));
      } catch (error) {
        fail("ERROR", `lane emitted invalid JSON: ${String(error)}; stderr: ${stderr.slice(-4_000)}`, durationMs);
      }
    });
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);
  });
}

function executionConfiguration(policy, environment) {
  const requested = String(environment.MQ_AUDIT_EXECUTION_MODE || "");
  const hosted = environment.GITHUB_ACTIONS === "true";
  const selected = requested || (hosted ? policy.githubHosted.mode : policy.local.mode);
  const allowed = new Set([policy.local.mode, policy.githubHosted.mode]);
  if (!allowed.has(selected)) throw new TypeError(`Unknown audit execution mode ${selected}.`);
  if (selected === policy.githubHosted.mode && !hosted && requested) {
    throw new TypeError("Bounded parallel audit execution is restricted to the measured GitHub-hosted environment.");
  }
  return {
    mode: selected,
    maximumConcurrentLanes: selected === policy.githubHosted.mode
      ? policy.githubHosted.maximumConcurrentLanes
      : policy.local.maximumConcurrentLanes,
  };
}

function crossLaneIdentityIssues(results) {
  const expected = results.coverage?.engineSha256;
  const issues = [];
  if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) issues.push("coverage did not bind an engine SHA-256");
  for (const laneId of ["mutation", "generator"]) {
    if (results[laneId]?.engineSha256 !== expected) issues.push(`${laneId} engine SHA-256 does not match coverage`);
  }
  return issues;
}

export async function runBoundedAuditLanes({
  browserPath = null,
  candidateId,
  environment = process.env,
  execute = executeLaneProcess,
  indexPath,
  nodePath = process.execPath,
  policy,
  root,
  runId,
} = {}) {
  const laneIds = policy.laneOrder;
  if (JSON.stringify(laneIds) !== JSON.stringify(AUDIT_LANE_IDS)) throw new TypeError("Gate policy lane order does not match the closed executable lane set.");
  const configuration = executionConfiguration(policy, environment);
  const envelopes = new Array(laneIds.length);
  let cursor = 0;
  let active = 0;
  let maximumObservedConcurrency = 0;
  const startedAt = performance.now();
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= laneIds.length) return;
      const laneId = laneIds[index];
      active += 1;
      maximumObservedConcurrency = Math.max(maximumObservedConcurrency, active);
      try {
        envelopes[index] = await execute({
          browserPath,
          candidateId,
          indexPath,
          laneId,
          nodePath,
          root,
          runId,
          timeoutMs: policy.laneTimeoutMs[laneId],
        });
      } catch (error) {
        envelopes[index] = createAuditLaneEnvelope({
          candidateId,
          durationMs: 0,
          error: String(error),
          executionStatus: "ERROR",
          laneId,
          result: failedAuditLaneResult(laneId, String(error), "ERROR"),
          runId,
        });
      } finally {
        active -= 1;
      }
    }
  };
  await Promise.all(Array.from({ length: configuration.maximumConcurrentLanes }, worker));
  const wallDurationMs = roundMs(performance.now() - startedAt);
  const envelopeIssues = auditLaneEnvelopeIssues(envelopes, { candidateId, runId, laneIds });
  if (envelopeIssues.length) throw new Error(`Audit lane envelope integrity failed: ${envelopeIssues.join("; ")}`);
  const ordered = laneIds.map((laneId) => envelopes.find((envelope) => envelope.laneId === laneId));
  const results = Object.fromEntries(ordered.map((envelope) => [envelope.laneId, envelope.result]));
  const identityIssues = crossLaneIdentityIssues(results);
  const executionIssues = ordered
    .filter((envelope) => envelope.executionStatus !== "COMPLETED")
    .map((envelope) => `${envelope.laneId} execution ended ${envelope.executionStatus}: ${envelope.error || "no detail"}`);
  const serialEquivalentDurationMs = ordered.reduce((sum, envelope) => sum + envelope.durationMs, 0);
  const observedOverlapReductionPercent = serialEquivalentDurationMs > 0
    ? Math.round((1 - (wallDurationMs / serialEquivalentDurationMs)) * 10_000) / 100
    : 0;
  const issues = [...identityIssues, ...executionIssues];
  return {
    report: {
      schemaVersion: 1,
      resultType: "MATH_QUEST_AUDIT_ORCHESTRATION",
      status: issues.length ? "FAIL" : "PASS",
      runId,
      candidateId,
      executionMode: configuration.mode,
      maximumConcurrentLanes: configuration.maximumConcurrentLanes,
      maximumObservedConcurrency,
      laneOrder: [...laneIds],
      wallDurationMs,
      serialEquivalentDurationMs,
      observedOverlapReductionPercent,
      minimumAdoptionReductionPercent: policy.minimumMeasuredWallTimeReductionPercent,
      automaticRetries: 0,
      laneExecutions: ordered.map(({ laneId, executionStatus, durationMs, error, result }) => ({
        laneId,
        executionStatus,
        durationMs,
        resultStatus: result.status ?? "UNKNOWN",
        error,
      })),
      issues,
    },
    results,
  };
}

const VOLATILE_EVIDENCE_KEYS = new Set([
  "auditOrchestration",
  "browserPath",
  "debugPort",
  "dumpTail",
  "durationMs",
  "generatedAt",
  "stderr",
  "stdout",
  "testOutput",
]);

function timingFreeProjection(value, parentKey = "") {
  if (Array.isArray(value)) return value.map((entry) => timingFreeProjection(entry, parentKey));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_EVIDENCE_KEYS.has(key) && !(parentKey === "outcomeSummary" && key === "runId"))
    .map(([key, entry]) => [key, timingFreeProjection(entry, key)]));
}

export function canonicalAuditEvidenceBytes(report) {
  return Buffer.from(`${JSON.stringify(timingFreeProjection(report))}\n`, "utf8");
}

export function canonicalAuditEvidenceSha256(report) {
  return createHash("sha256").update(canonicalAuditEvidenceBytes(report)).digest("hex");
}

export function compareAuditExecutionReports(serialReport, parallelReport, { minimumReductionPercent = 20 } = {}) {
  const serialOrchestration = serialReport?.auditOrchestration;
  const parallelOrchestration = parallelReport?.auditOrchestration;
  const issues = [];
  if (serialOrchestration?.executionMode !== "SERIAL_REFERENCE") issues.push("serial report execution mode is not SERIAL_REFERENCE");
  if (parallelOrchestration?.executionMode !== "BOUNDED_PARALLEL") issues.push("parallel report execution mode is not BOUNDED_PARALLEL");
  if (serialOrchestration?.status !== "PASS") issues.push("serial orchestration did not pass");
  if (parallelOrchestration?.status !== "PASS") issues.push("parallel orchestration did not pass");
  if (!serialOrchestration?.candidateId || serialOrchestration.candidateId !== parallelOrchestration?.candidateId) issues.push("reports do not bind the same public candidate");
  const serialBytes = canonicalAuditEvidenceBytes(serialReport);
  const parallelBytes = canonicalAuditEvidenceBytes(parallelReport);
  const evidenceEquivalent = serialBytes.equals(parallelBytes);
  if (!evidenceEquivalent) issues.push("timing-free canonical gate evidence differs");
  const serialWallDurationMs = roundMs(serialOrchestration?.wallDurationMs);
  const parallelWallDurationMs = roundMs(parallelOrchestration?.wallDurationMs);
  const measuredWallTimeReductionPercent = serialWallDurationMs > 0
    ? Math.round((1 - (parallelWallDurationMs / serialWallDurationMs)) * 10_000) / 100
    : 0;
  if (measuredWallTimeReductionPercent < minimumReductionPercent) {
    issues.push(`measured wall-time reduction ${measuredWallTimeReductionPercent}% is below ${minimumReductionPercent}%`);
  }
  return {
    schemaVersion: 1,
    resultType: "MATH_QUEST_AUDIT_EXECUTION_COMPARISON",
    status: issues.length ? "FAIL" : "PASS",
    candidateId: serialOrchestration?.candidateId || null,
    serialCanonicalEvidenceSha256: createHash("sha256").update(serialBytes).digest("hex"),
    parallelCanonicalEvidenceSha256: createHash("sha256").update(parallelBytes).digest("hex"),
    evidenceEquivalent,
    serialWallDurationMs,
    parallelWallDurationMs,
    measuredWallTimeReductionPercent,
    minimumReductionPercent,
    issues,
  };
}
