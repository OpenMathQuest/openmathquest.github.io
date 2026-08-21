import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_LANE_IDS,
  auditLaneEnvelopeIssues,
  canonicalAuditEvidenceBytes,
  compareAuditExecutionReports,
  createAuditLaneEnvelope,
  runBoundedAuditLanes,
} from "../lib/bounded-audit-lanes.mjs";

const candidateId = `${"f".repeat(40)}:${"a".repeat(64)}`;
const runId = "fixture-run";
const policy = Object.freeze({
  laneOrder: AUDIT_LANE_IDS,
  local: { mode: "SERIAL_REFERENCE", maximumConcurrentLanes: 1 },
  githubHosted: { mode: "BOUNDED_PARALLEL", maximumConcurrentLanes: 2 },
  laneTimeoutMs: Object.fromEntries(AUDIT_LANE_IDS.map((laneId) => [laneId, 1_000])),
  minimumMeasuredWallTimeReductionPercent: 20,
});
const resultFor = (laneId) => ({
  status: "PASS",
  ...(laneId === "coverage" ? { engineSha256: "b".repeat(64) } : {}),
  ...(["mutation", "generator"].includes(laneId) ? { engineSha256: "b".repeat(64) } : {}),
});
const envelopeFor = (laneId, overrides = {}) => createAuditLaneEnvelope({
  candidateId,
  durationMs: 10,
  laneId,
  result: resultFor(laneId),
  runId,
  ...overrides,
});

test("bounded execution preserves declared result order and never exceeds two top-level lanes", async () => {
  let active = 0;
  let observed = 0;
  const execute = async ({ laneId }) => {
    active += 1;
    observed = Math.max(observed, active);
    await new Promise((resolve) => setTimeout(resolve, laneId === "coverage" ? 20 : 2));
    active -= 1;
    return envelopeFor(laneId);
  };
  const parallel = await runBoundedAuditLanes({
    candidateId,
    environment: { GITHUB_ACTIONS: "true" },
    execute,
    indexPath: "index.html",
    policy,
    root: ".",
    runId,
  });
  assert.equal(observed, 2);
  assert.equal(parallel.report.maximumObservedConcurrency, 2);
  assert.deepEqual(parallel.report.laneExecutions.map((entry) => entry.laneId), AUDIT_LANE_IDS);
  const serial = await runBoundedAuditLanes({ candidateId, environment: {}, execute, indexPath: "index.html", policy, root: ".", runId });
  assert.equal(serial.report.maximumObservedConcurrency, 1);
});

test("[NC-AUDIT-LANE-FOREIGN-CANDIDATE] aggregation rejects missing, duplicate, unknown, and foreign-candidate lane evidence", () => {
  const baseline = AUDIT_LANE_IDS.map((laneId) => envelopeFor(laneId));
  assert.deepEqual(auditLaneEnvelopeIssues(baseline, { candidateId, runId }), []);
  const hostileSets = [
    baseline.slice(1),
    [...baseline, envelopeFor("coverage")],
    [...baseline.slice(1), createAuditLaneEnvelope({ candidateId, durationMs: 1, laneId: "foreign", result: {}, runId })],
    baseline.map((entry, index) => index === 0 ? { ...entry, candidateId: "c".repeat(64) } : entry),
    baseline.map((entry, index) => index === 0 ? { ...entry, runId: "foreign-run" } : entry),
  ];
  for (const hostile of hostileSets) assert.ok(auditLaneEnvelopeIssues(hostile, { candidateId, runId }).length > 0);
});

test("lane crashes and timeouts remain explicit orchestration failures without retries", async () => {
  const execute = async ({ laneId }) => laneId === "browser"
    ? envelopeFor(laneId, { executionStatus: "TIMEOUT", error: "fixture timeout", result: { status: "FAIL" } })
    : laneId === "mutation"
      ? Promise.reject(new Error("fixture crash"))
      : envelopeFor(laneId);
  const value = await runBoundedAuditLanes({
    candidateId,
    environment: { GITHUB_ACTIONS: "true" },
    execute,
    indexPath: "index.html",
    policy,
    root: ".",
    runId,
  });
  assert.equal(value.report.status, "FAIL");
  assert.equal(value.report.automaticRetries, 0);
  assert.ok(value.report.issues.some((issue) => issue.includes("browser execution ended TIMEOUT")));
  assert.ok(value.report.issues.some((issue) => issue.includes("mutation execution ended ERROR")));
});

test("serial and parallel timing-free evidence is byte-for-byte identical and semantic drift is detected", () => {
  const baseline = {
    generatedAt: "first",
    auditOrchestration: { executionMode: "SERIAL_REFERENCE", wallDurationMs: 100 },
    outcomeSummary: { runId: "serial", passedCount: 2 },
    coverage: { status: "PASS", durationMs: 90, engineSha256: "d".repeat(64), testOutput: "slow" },
    browser: { status: "PASS", process: { stdout: "one", stderr: "" } },
  };
  const parallel = structuredClone(baseline);
  parallel.generatedAt = "second";
  parallel.auditOrchestration = { executionMode: "BOUNDED_PARALLEL", wallDurationMs: 50 };
  parallel.outcomeSummary.runId = "parallel";
  parallel.coverage.durationMs = 45;
  parallel.coverage.testOutput = "fast";
  parallel.browser.process.stdout = "two";
  assert.deepEqual(canonicalAuditEvidenceBytes(parallel), canonicalAuditEvidenceBytes(baseline));
  parallel.coverage.status = "FAIL";
  assert.notDeepEqual(canonicalAuditEvidenceBytes(parallel), canonicalAuditEvidenceBytes(baseline));
});

test("adoption requires exact evidence equivalence and at least twenty percent measured reduction", () => {
  const serial = {
    generatedAt: "one",
    auditOrchestration: { status: "PASS", executionMode: "SERIAL_REFERENCE", candidateId, wallDurationMs: 100 },
    outcomeSummary: { runId: "serial", passedCount: 1 },
    gate: { status: "PASS" },
  };
  const parallel = structuredClone(serial);
  parallel.generatedAt = "two";
  parallel.auditOrchestration = { status: "PASS", executionMode: "BOUNDED_PARALLEL", candidateId, wallDurationMs: 75 };
  parallel.outcomeSummary.runId = "parallel";
  assert.equal(compareAuditExecutionReports(serial, parallel).status, "PASS");
  parallel.auditOrchestration.wallDurationMs = 85;
  assert.equal(compareAuditExecutionReports(serial, parallel).status, "FAIL");
  parallel.auditOrchestration.wallDurationMs = 75;
  parallel.gate.status = "FAIL";
  assert.equal(compareAuditExecutionReports(serial, parallel).status, "FAIL");
});
