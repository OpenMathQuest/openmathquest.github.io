import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUDIT_LANE_IDS,
  auditCandidateStabilityIssues,
  auditLaneEnvelopeIssues,
  canonicalAuditEvidenceBytes,
  compareAuditExecutionReports,
  createAuditLaneEnvelope,
  interpretJsonChildCompletion,
  nestedProcessTimeoutForLane,
  processTreeCleanupVerified,
  runBoundedAuditLanes,
  runTreeSupervisedProcess,
} from "../lib/bounded-audit-lanes.mjs";

const candidateId = `${"f".repeat(40)}:${"a".repeat(64)}`;
const runId = "fixture-run";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const policy = Object.freeze({
  laneOrder: AUDIT_LANE_IDS,
  boundedExecutionStartOrder: ["coverage", "generator", "browser", "playwright", "mutation"],
  laneSchedulingClass: {
    browser: "BOUNDED", coverage: "EXCLUSIVE", generator: "BOUNDED", mutation: "BOUNDED", playwright: "BOUNDED",
  },
  local: { mode: "SERIAL_REFERENCE", maximumConcurrentLanes: 1 },
  githubHosted: {
    mode: "BOUNDED_PARALLEL",
    maximumConcurrentLanes: 2,
    adoptionStatus: "PENDING_MEASURED_QUALIFICATION",
    defaultBeforeQualification: "SERIAL_REFERENCE",
    qualificationWorkflowInput: "execution_qualification",
  },
  laneTimeoutMs: Object.fromEntries(AUDIT_LANE_IDS.map((laneId) => [laneId, 1_000])),
  nestedProcessFinalizationReserveMs: { coverage: 100 },
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
  const activeLaneIds = new Set();
  const overlapViolations = [];
  const nestedBudgets = new Map();
  const starts = [];
  const execute = async ({ laneId, nestedProcessTimeoutMs }) => {
    if (laneId === "coverage" && activeLaneIds.size > 0) overlapViolations.push(`coverage overlapped ${[...activeLaneIds].join(",")}`);
    if (laneId !== "coverage" && activeLaneIds.has("coverage")) overlapViolations.push(`${laneId} overlapped coverage`);
    active += 1;
    activeLaneIds.add(laneId);
    starts.push(laneId);
    observed = Math.max(observed, active);
    nestedBudgets.set(laneId, nestedProcessTimeoutMs);
    await new Promise((resolve) => setTimeout(resolve, laneId === "coverage" ? 20 : 2));
    active -= 1;
    activeLaneIds.delete(laneId);
    return envelopeFor(laneId);
  };
  const parallel = await runBoundedAuditLanes({
    candidateId,
    environment: { GITHUB_ACTIONS: "true", MQ_AUDIT_EXECUTION_MODE: "BOUNDED_PARALLEL" },
    execute,
    indexPath: "index.html",
    policy,
    root: ".",
    runId,
  });
  assert.equal(observed, 2);
  assert.deepEqual(overlapViolations, []);
  assert.equal(nestedBudgets.get("coverage"), 900);
  assert.equal(nestedBudgets.get("browser"), null);
  assert.deepEqual(starts.slice(0, 3), ["coverage", "generator", "browser"]);
  assert.equal(parallel.report.maximumObservedConcurrency, 2);
  assert.deepEqual(parallel.report.boundedExecutionStartOrder, policy.boundedExecutionStartOrder);
  assert.equal(parallel.report.laneSchedulingClass.coverage, "EXCLUSIVE");
  assert.deepEqual(parallel.report.laneExecutions.map((entry) => entry.laneId), AUDIT_LANE_IDS);
  const pendingHostedDefault = await runBoundedAuditLanes({ candidateId, environment: { GITHUB_ACTIONS: "true" }, execute, indexPath: "index.html", policy, root: ".", runId });
  assert.equal(pendingHostedDefault.report.executionMode, "SERIAL_REFERENCE");
  assert.equal(pendingHostedDefault.report.maximumObservedConcurrency, 1);
  const serial = await runBoundedAuditLanes({ candidateId, environment: {}, execute, indexPath: "index.html", policy, root: ".", runId });
  assert.equal(serial.report.maximumObservedConcurrency, 1);
});

test("nested process budgets derive from the sole lane timeout authority and fail closed", () => {
  assert.equal(nestedProcessTimeoutForLane(policy, "coverage"), 900);
  assert.equal(nestedProcessTimeoutForLane(policy, "browser"), null);
  assert.throws(
    () => nestedProcessTimeoutForLane({ ...policy, nestedProcessFinalizationReserveMs: { coverage: 1_000 } }, "coverage"),
    /finalization reserve is invalid/u,
  );
});

test("bounded execution rejects an incomplete or duplicated start order", async () => {
  for (const boundedExecutionStartOrder of [
    ["coverage", "generator", "browser", "playwright"],
    ["coverage", "generator", "browser", "playwright", "playwright"],
  ]) {
    await assert.rejects(
      runBoundedAuditLanes({
        candidateId,
        environment: { GITHUB_ACTIONS: "true", MQ_AUDIT_EXECUTION_MODE: "BOUNDED_PARALLEL" },
        execute: async ({ laneId }) => envelopeFor(laneId),
        indexPath: "index.html",
        policy: { ...policy, boundedExecutionStartOrder },
        root: ".",
        runId,
      }),
      /exact lane permutation/u,
    );
  }
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
    environment: { GITHUB_ACTIONS: "true", MQ_AUDIT_EXECUTION_MODE: "BOUNDED_PARALLEL" },
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

test("candidate stability fails closed when the repository revision or public payload changes", () => {
  const revision = "a".repeat(40);
  const guard = { status: "PASS", payloadSha256: "b".repeat(64), payloadTreeOid: "c".repeat(40) };
  assert.deepEqual(auditCandidateStabilityIssues({ before: guard, after: guard, revisionBefore: revision, revisionAfter: revision }), []);
  assert.match(auditCandidateStabilityIssues({ before: guard, after: guard, revisionBefore: revision, revisionAfter: "d".repeat(40) }).join("; "), /revision changed/u);
  assert.match(auditCandidateStabilityIssues({ before: guard, after: { ...guard, payloadSha256: "e".repeat(64) }, revisionBefore: revision, revisionAfter: revision }).join("; "), /payload changed/u);
});

test("serial and parallel timing-free evidence is byte-for-byte identical and semantic drift is detected", () => {
  const baseline = {
    generatedAt: "first",
    auditOrchestration: { executionMode: "SERIAL_REFERENCE", wallDurationMs: 100 },
    outcomeSummary: { runId: "serial", passedCount: 2 },
    coverage: {
      status: "PASS",
      engineSha256: "d".repeat(64),
      calibration: { status: "PASS", fullBranchPct: 100, output: "ok 1 - fixture 94.123ms" },
      testOutput: "slow 22.1ms",
    },
    engine: { results: [{ id: "A", status: "PASS", durationMs: 90 }] },
    browser: {
      status: "PASS",
      requests: [{ method: "GET", pathname: "/engine.js", host: "127.0.0.1:51321" }],
      process: { debugPort: 51320, stdout: "one", stderr: "" },
    },
    playwright: {
      status: "PASS",
      generatedAt: "2026-01-01T00:00:00.000Z",
      results: [{ key: "edge-desktop:fixture", status: "passed", durationMs: 49 }],
    },
  };
  const parallel = structuredClone(baseline);
  parallel.generatedAt = "second";
  parallel.auditOrchestration = { executionMode: "BOUNDED_PARALLEL", wallDurationMs: 50 };
  parallel.outcomeSummary.runId = "parallel";
  parallel.coverage.testOutput = "fast";
  parallel.coverage.calibration.output = "ok 1 - fixture 4.2ms";
  parallel.engine.results[0].durationMs = 4;
  parallel.browser.requests[0].host = "127.0.0.1:61119";
  parallel.browser.process.debugPort = 61118;
  parallel.browser.process.stdout = "two";
  parallel.playwright.generatedAt = "2026-01-01T00:00:03.000Z";
  parallel.playwright.results[0].durationMs = 5;
  assert.deepEqual(canonicalAuditEvidenceBytes(parallel), canonicalAuditEvidenceBytes(baseline));
  parallel.coverage.status = "FAIL";
  assert.notDeepEqual(canonicalAuditEvidenceBytes(parallel), canonicalAuditEvidenceBytes(baseline));
});

test("JSON child failures cannot become passes from diagnostic PASS output", () => {
  const stdout = JSON.stringify({ status: "PASS" });
  assert.throws(
    () => interpretJsonChildCompletion({ stdout, exitCode: 9 }),
    /ended with code 9.*diagnostic JSON/u,
  );
  assert.throws(
    () => interpretJsonChildCompletion({ stdout, timedOut: true }),
    /timed out.*diagnostic JSON/u,
  );
  assert.deepEqual(interpretJsonChildCompletion({ stdout, exitCode: 0 }), { status: "PASS" });
});

test("Windows lane timeout terminates the full descendant tree or reports cleanup unverified", { skip: process.platform !== "win32" }, async () => {
  const source = [
    "const {spawn}=require('node:child_process');",
    "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true});",
    "process.stdout.write(String(child.pid)+'\\n');",
    "setInterval(()=>{},1000);",
  ].join("");
  const result = await runTreeSupervisedProcess({
    command: process.execPath,
    args: ["-e", source],
    cwd: process.cwd(),
    timeoutMs: 500,
  });
  assert.equal(result.timedOut, true);
  const descendantPid = Number(result.stdout.trim().split(/\s+/u)[0]);
  assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
  let descendantAlive = true;
  try { process.kill(descendantPid, 0); } catch { descendantAlive = false; }
  if (result.cleanupVerified) {
    assert.equal(descendantAlive, false);
  } else {
    assert.match(result.cleanupDetail, /taskkill status=(?!0)/u);
    if (descendantAlive) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
  }
});

test("descendant cleanup is never inferred from parent exit when tree termination failed", async () => {
  assert.equal(processTreeCleanupVerified({ treeTerminationSucceeded: false, parentAlive: false }), false);
  assert.equal(processTreeCleanupVerified({ treeTerminationSucceeded: true, parentAlive: true }), false);
  assert.equal(processTreeCleanupVerified({ treeTerminationSucceeded: true, parentAlive: false }), true);
  const abnormal = await runTreeSupervisedProcess({
    command: process.execPath,
    args: ["-e", "process.exit(7)"],
    cwd: process.cwd(),
    timeoutMs: 2_000,
  });
  assert.equal(abnormal.exitCode, 7);
  assert.equal(abnormal.cleanupVerified, false);
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

test("hosted bounded execution has one explicit non-release qualification path and is not the pre-qualification default", async () => {
  const workflow = await readFile(path.join(repositoryRoot, ".github", "workflows", "audit.yml"), "utf8");
  const qualificationJob = workflow.slice(workflow.indexOf("  audit-execution-qualification:\n"));
  assert.match(workflow, /execution_qualification:[\s\S]*type: boolean/u);
  assert.match(workflow, /audit-execution-qualification:[\s\S]*MQ_AUDIT_EXECUTION_MODE: SERIAL_REFERENCE[\s\S]*MQ_AUDIT_EXECUTION_MODE: BOUNDED_PARALLEL/u);
  assert.match(workflow, /audit-execution-qualification[\s\S]*compare-audit-execution-modes\.mjs/u);
  assert.match(workflow, /full-audit:[\s\S]*inputs\.execution_qualification != true/u);
  assert.match(qualificationJob, /Join-Path \$env:RUNNER_TEMP 'math-quest-audit-execution-qualification'/u);
  assert.match(qualificationJob, /MQ_AUDIT_QUALIFICATION_DIRECTORY=\$qualificationDirectory[^\n]+\$env:GITHUB_ENV/u);
  assert.match(qualificationJob, /Execution qualification evidence must remain outside the audited repository checkout\./u);
  assert.match(qualificationJob, /Copy-Item[^\n]+Join-Path \$env:MQ_AUDIT_QUALIFICATION_DIRECTORY 'execution-qualification-serial\.json'/u);
  assert.match(qualificationJob, /Copy-Item[^\n]+Join-Path \$env:MQ_AUDIT_QUALIFICATION_DIRECTORY 'execution-qualification-parallel\.json'/u);
  assert.match(qualificationJob, /\$\{\{ runner\.temp \}\}\/math-quest-audit-execution-qualification\/execution-qualification-comparison\.json/u);
  assert.doesNotMatch(qualificationJob, /(?:Destination|--serial=|--parallel=|Set-Content -LiteralPath) ['"]?audit\/execution-qualification-/u);
  assert.equal(policy.githubHosted.adoptionStatus, "PENDING_MEASURED_QUALIFICATION");
  assert.equal(policy.githubHosted.defaultBeforeQualification, "SERIAL_REFERENCE");
});
