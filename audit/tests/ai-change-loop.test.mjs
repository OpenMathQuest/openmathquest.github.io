import assert from "node:assert/strict";
import test from "node:test";
import { coverageStageFindings } from "../ai-change-loop-operations.mjs";
import {
  aiChangeLoopRunnerMutationFailures,
  captureCandidateBinding,
  candidateBindingFindings,
  candidateBindingMutationFailures,
  executeAiChangeLoop,
} from "../run-ai-change-loop.mjs";

const order = Object.freeze([
  "compiler-types",
  "static-architecture",
  "tests",
  "differential-equivalence",
  "property-fuzz",
  "mutation",
  "security-dependencies",
  "complexity-duplication-size",
  "performance-budgets",
]);
const bindingFields = Object.freeze([
  "baselineCommit",
  "candidateTreeOid",
  "gateIntegrityPolicySha256",
  "nodeExecutableSha256",
  "nodeVersion",
  "packageLockSha256",
  "qualityPolicySha256",
]);
const policy = Object.freeze({
  policyId: "fixture",
  baselineCommit: "1".repeat(40),
  runtime: Object.freeze({ nodeVersion: process.versions.node }),
  candidateBinding: Object.freeze({ contractId: "STAGED_TREE_CANDIDATE_V1", requiredReportFields: bindingFields }),
  aiChangeLoop: Object.freeze({ order }),
});

function passingOperations(calls) {
  return Object.fromEntries(order.map((id) => [id, async () => {
    calls.push(id);
    return { status: "PASS", findings: [] };
  }]));
}

test("the runner executes every stage once in canonical order", async () => {
  const calls = [];
  const report = await executeAiChangeLoop(policy, passingOperations(calls));
  assert.equal(report.status, "PASS");
  assert.deepEqual(calls, order);
  assert.deepEqual(report.stages.map(({ id, status }) => ({ id, status })), order.map((id) => ({ id, status: "PASS" })));
});

test("the sealed loop retains the original failing component evidence", async () => {
  const operations = passingOperations([]);
  const failed = { status: "FAIL", findings: [], coverage: { status: "FAIL", testProcessTimedOut: true, testProcessTimeoutMs: 225000 } };
  operations.tests = async () => failed;
  const report = await executeAiChangeLoop(policy, operations);
  assert.equal(report.schemaVersion, 2);
  assert.deepEqual(report.stageReports.tests, failed);
  assert.deepEqual(Object.keys(report.stageReports), order.slice(0, 3));
  assert.equal(report.stages[3].status, "NOT_RUN");
});

test("coverage failures preserve the cause instead of returning an empty findings array", () => {
  const failure = { status: "FAIL", testProcessError: "ETIMEDOUT: native coverage process exceeded 225000 ms", structuredAuditIssues: ["structured audit is missing"] };
  assert.match(coverageStageFindings(failure)[0], /ETIMEDOUT/u);
  assert.deepEqual(coverageStageFindings({ status: "PASS" }), []);
  assert.match(coverageStageFindings({ status: "FAIL", branchPct: 80 })[0], /branch=80/u);
});

test("a PASS label cannot conceal reported findings or advance later stages", async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.tests = async () => ({ status: "PASS", findings: ["unresolved defect"] });
  const report = await executeAiChangeLoop(policy, operations);
  assert.equal(report.status, "FAIL");
  assert.equal(report.firstFailure.reason, "unresolved defect");
  assert.equal(report.stages[3].status, "NOT_RUN");
});

test("malformed findings fail the live loop before normalization or advancement", async () => {
  for (const findings of ["unresolved defect", { error: "unresolved defect" }, null]) {
    const calls = [];
    const operations = passingOperations(calls);
    operations.tests = async () => { calls.push("tests"); return { status: "PASS", findings }; };
    const report = await executeAiChangeLoop(policy, operations);
    assert.equal(report.status, "FAIL");
    assert.match(report.firstFailure.reason, /malformed findings/u);
    assert.deepEqual(calls, order.slice(0, 3));
    assert.deepEqual(report.stages.slice(3).map((stage) => stage.status), Array(6).fill("NOT_RUN"));
    assert.deepEqual(report.stageReports.tests.findings, findings);
  }
});

test("[NC-AI-CHANGE-LOOP-FIRST-FAILURE] the first failure stops all later stages without retry", async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.tests = async () => {
    calls.push("tests");
    return { status: "FAIL", findings: ["retained first failure"] };
  };
  const report = await executeAiChangeLoop(policy, operations);
  assert.equal(report.status, "FAIL");
  assert.equal(report.firstFailure.stageId, "tests");
  assert.deepEqual(calls, order.slice(0, 3));
  assert.deepEqual(report.stages.slice(3).map((stage) => stage.status), Array(6).fill("NOT_RUN"));
});

test("operation inventory and thrown operations fail closed", async () => {
  const missing = passingOperations([]);
  delete missing.mutation;
  const inventoryReport = await executeAiChangeLoop(policy, missing);
  assert.equal(inventoryReport.status, "FAIL");
  assert.match(inventoryReport.findings.join("\n"), /operation inventory/iu);

  const operations = passingOperations([]);
  operations["static-architecture"] = async () => { throw new Error("fixture crash"); };
  const thrownReport = await executeAiChangeLoop(policy, operations);
  assert.equal(thrownReport.firstFailure.stageId, "static-architecture");
  assert.match(thrownReport.firstFailure.reason, /fixture crash/iu);
});

test("the runner's embedded first-failure negative control passes", async () => {
  assert.deepEqual(await aiChangeLoopRunnerMutationFailures(policy), []);
});

test("[NC-AI-CHANGE-LOOP-CANDIDATE-DRIFT] exact staged candidate identity fails closed on mutable state", () => {
  assert.deepEqual(candidateBindingMutationFailures(policy), []);
  const snapshot = {
    baselineCommit: policy.baselineCommit,
    candidateTreeOid: "a".repeat(40),
    gateIntegrityPolicySha256: "b".repeat(64),
    nodeExecutableSha256: "c".repeat(64),
    nodeVersion: policy.runtime.nodeVersion,
    packageLockSha256: "d".repeat(64),
    qualityPolicySha256: "e".repeat(64),
    unstagedTrackedPaths: [],
    nonignoredUntrackedPaths: [],
  };
  assert.deepEqual(candidateBindingFindings(policy, snapshot), []);
});

test("[NC-AI-CHANGE-LOOP-AMBIENT-GIT-REDIRECTION] candidate identity ignores foreign ambient Git state", () => {
  const expected = captureCandidateBinding(policy);
  const variables = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
  const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  try {
    for (const name of variables) process.env[name] = "C:/definitely-not-the-math-quest-repository";
    assert.deepEqual(captureCandidateBinding(policy), expected);
  } finally {
    for (const name of variables) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
