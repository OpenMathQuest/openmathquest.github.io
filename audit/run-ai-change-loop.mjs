import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { aiChangeLoopFindings, loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";
import { hermeticGit } from "./lib/repository-code-map.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const bindingFiles = Object.freeze({
  gateIntegrityPolicySha256: "audit/gate-integrity-policy-v1.json",
  packageLockSha256: "package-lock.json",
  qualityPolicySha256: "audit/quality-gate-policy-v1.json",
});

function sha256File(file) {
  return createHash("sha256").update(readFileSync(path.isAbsolute(file) ? file : path.join(root, file))).digest("hex");
}

function gitText(argumentsList) {
  return hermeticGit(argumentsList, { root }).trim();
}

function pathList(value) {
  return String(value || "").split(/\r?\n/u).map((item) => item.trim()).filter(Boolean).sort();
}

export function captureCandidateBinding(policy) {
  return Object.freeze({
    baselineCommit: policy.baselineCommit,
    candidateTreeOid: gitText(["write-tree"]),
    gateIntegrityPolicySha256: sha256File(bindingFiles.gateIntegrityPolicySha256),
    nodeExecutableSha256: sha256File(process.execPath),
    nodeVersion: process.versions.node,
    packageLockSha256: sha256File(bindingFiles.packageLockSha256),
    qualityPolicySha256: sha256File(bindingFiles.qualityPolicySha256),
    unstagedTrackedPaths: Object.freeze(pathList(gitText(["diff", "--name-only", "--"]))),
    nonignoredUntrackedPaths: Object.freeze(pathList(gitText(["ls-files", "--others", "--exclude-standard"]))),
  });
}

function identityFindings(policy, snapshot, label) {
  const findings = [];
  for (const field of policy.candidateBinding.requiredReportFields) {
    if (typeof snapshot[field] !== "string" || !snapshot[field]) findings.push(`${label} candidate binding is missing ${field}`);
  }
  return findings;
}

function hashFindings(policy, snapshot, label) {
  const findings = [];
  for (const field of policy.candidateBinding.requiredReportFields.filter((item) => item.endsWith("Sha256"))) {
    if (!/^[a-f0-9]{64}$/u.test(snapshot[field] || "")) findings.push(`${label} candidate binding has invalid ${field}`);
  }
  return findings;
}

function snapshotIdentityFindings(policy, snapshot, label) {
  const findings = [];
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(snapshot.candidateTreeOid || "")) findings.push(`${label} candidate tree oid is invalid`);
  if (snapshot.nodeVersion !== policy.runtime.nodeVersion) findings.push(`${label} Node version is not the reviewed ${policy.runtime.nodeVersion}`);
  return findings;
}

function snapshotPathFindings(snapshot, label) {
  const findings = [];
  if (!Array.isArray(snapshot.unstagedTrackedPaths)) findings.push(`${label} unstaged tracked-path evidence is invalid`);
  else if (snapshot.unstagedTrackedPaths.length) findings.push(`${label} candidate has unstaged tracked paths: ${snapshot.unstagedTrackedPaths.join(", ")}`);
  if (!Array.isArray(snapshot.nonignoredUntrackedPaths)) findings.push(`${label} nonignored untracked-path evidence is invalid`);
  else if (snapshot.nonignoredUntrackedPaths.length) findings.push(`${label} candidate has nonignored untracked paths: ${snapshot.nonignoredUntrackedPaths.join(", ")}`);
  return findings;
}

function snapshotFindings(policy, snapshot, label) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [`${label} candidate binding is missing`];
  return [
    ...identityFindings(policy, snapshot, label),
    ...hashFindings(policy, snapshot, label),
    ...snapshotIdentityFindings(policy, snapshot, label),
    ...snapshotPathFindings(snapshot, label),
  ];
}

export function candidateBindingFindings(policy, initial, final = initial) {
  const findings = [...snapshotFindings(policy, initial, "initial")];
  if (final !== initial) findings.push(...snapshotFindings(policy, final, "final"));
  for (const field of policy.candidateBinding.requiredReportFields) {
    if (initial?.[field] !== final?.[field]) findings.push(`candidate binding changed ${field} during the loop`);
  }
  return Object.freeze(findings);
}

export function candidateBindingMutationFailures(policy) {
  const failures = [];
  const initial = Object.freeze({
    baselineCommit: policy.baselineCommit,
    candidateTreeOid: "a".repeat(40),
    gateIntegrityPolicySha256: "b".repeat(64),
    nodeExecutableSha256: "c".repeat(64),
    nodeVersion: policy.runtime.nodeVersion,
    packageLockSha256: "d".repeat(64),
    qualityPolicySha256: "e".repeat(64),
    unstagedTrackedPaths: Object.freeze([]),
    nonignoredUntrackedPaths: Object.freeze([]),
  });
  const run = (label, mutate) => {
    const final = structuredClone(initial);
    mutate(final);
    if (!candidateBindingFindings(policy, initial, final).length) failures.push(`candidate-binding mutation did not reject ${label}`);
  };
  run("a changed tree", (record) => { record.candidateTreeOid = "f".repeat(40); });
  run("an unstaged tracked path", (record) => { record.unstagedTrackedPaths = ["index.html"]; });
  run("a nonignored untracked path", (record) => { record.nonignoredUntrackedPaths = ["unexpected.txt"]; });
  run("changed policy bytes", (record) => { record.qualityPolicySha256 = "0".repeat(64); });
  return Object.freeze(failures);
}

function inventoryFindings(expected, operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) {
    return ["AI-change loop operation inventory is missing"];
  }
  const actual = Object.keys(operations).sort();
  const canonical = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(canonical)
    ? []
    : [`AI-change loop operation inventory must be exactly: ${canonical.join(", ")}`];
}

function notRunStages(order) {
  return order.map((id) => Object.freeze({ id, status: "NOT_RUN", elapsedMs: 0, findings: Object.freeze([]) }));
}

function safeFindings(report) {
  if (report?.findings === undefined) return Object.freeze([]);
  if (!Array.isArray(report.findings)) return Object.freeze(["operation reported malformed findings (expected an array)"]);
  return Object.freeze(report.findings.map(String));
}

function failedReason(report, findings) {
  if (findings.length) return findings[0];
  return `operation reported ${String(report?.status || "an invalid status")}`;
}

function stageRecord(id, status, elapsedMs, findings) {
  return Object.freeze({ id, status, elapsedMs: Math.ceil(elapsedMs), findings });
}

function progress(callback, id, status) {
  if (callback) callback(Object.freeze({ id, status }));
}

async function executeStage(id, operation, reports, callback) {
  progress(callback, id, "START");
  const startedAt = performance.now();
  try {
    const report = await operation(Object.freeze({ reports }));
    const findings = safeFindings(report);
    const status = report?.status === "PASS" && findings.length === 0 ? "PASS" : "FAIL";
    progress(callback, id, status);
    return Object.freeze({
      report,
      record: stageRecord(id, status, performance.now() - startedAt, findings),
      failure: status === "FAIL" ? Object.freeze({ stageId: id, reason: failedReason(report, findings) }) : null,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    progress(callback, id, "FAIL");
    return Object.freeze({
      report: null,
      record: stageRecord(id, "FAIL", performance.now() - startedAt, Object.freeze([reason])),
      failure: Object.freeze({ stageId: id, reason }),
    });
  }
}

function loopReport(policy, fields) {
  return Object.freeze({ schemaVersion: 2, artifactKind: "MATH_QUEST_AI_CHANGE_LOOP_V2", policyId: policy.policyId, ...fields });
}

export async function executeAiChangeLoop(policy, operations, options = {}) {
  const order = policy.aiChangeLoop.order;
  const inventory = inventoryFindings(order, operations);
  if (inventory.length) {
    return loopReport(policy, {
      status: "FAIL",
      firstFailure: Object.freeze({ stageId: "operation-inventory", reason: inventory[0] }),
      stages: Object.freeze(notRunStages(order)),
      stageReports: Object.freeze({}),
      findings: Object.freeze(inventory),
    });
  }

  const stages = notRunStages(order);
  const reports = {};
  let firstFailure = null;
  for (const [index, id] of order.entries()) {
    const outcome = await executeStage(id, operations[id], reports, options.onProgress);
    stages[index] = outcome.record;
    if (outcome.report) reports[id] = outcome.report;
    firstFailure = outcome.failure;
    if (firstFailure) break;
  }
  const findings = aiChangeLoopFindings(policy, stages);
  return loopReport(policy, {
    status: findings.length ? "FAIL" : "PASS",
    firstFailure,
    stages: Object.freeze(stages),
    stageReports: Object.freeze(structuredClone(reports)),
    findings,
  });
}

function negativeControlOperations(order, calls) {
  return Object.fromEntries(order.map((id, index) => [id, async () => {
    calls.push(id);
    return index === 2 ? { status: "FAIL", findings: ["negative-control-first-failure"] } : { status: "PASS", findings: [] };
  }]));
}

export async function aiChangeLoopRunnerMutationFailures(policy) {
  const calls = [];
  const report = await executeAiChangeLoop(policy, negativeControlOperations(policy.aiChangeLoop.order, calls));
  const expectedCalls = policy.aiChangeLoop.order.slice(0, 3);
  const passed = report.status === "FAIL"
    && report.firstFailure?.stageId === policy.aiChangeLoop.order[2]
    && JSON.stringify(calls) === JSON.stringify(expectedCalls)
    && report.stages.slice(3).every((stage) => stage.status === "NOT_RUN");
  return Object.freeze(passed ? [] : ["AI-change loop first-failure negative control did not stop later stages"]);
}

function candidateBindingRecord(policy, initial, final, findings) {
  const identity = Object.fromEntries(policy.candidateBinding.requiredReportFields.map((field) => [field, initial[field]]));
  return Object.freeze({
    contractId: policy.candidateBinding.contractId,
    status: findings.length ? "FAIL" : "PASS",
    ...identity,
    initial,
    final,
    findings: Object.freeze(findings),
  });
}

function candidatePreflightReport(policy, snapshot, findings) {
  return loopReport(policy, {
    status: "FAIL",
    firstFailure: Object.freeze({ stageId: "candidate-integrity", reason: findings[0] }),
    stages: Object.freeze(notRunStages(policy.aiChangeLoop.order)),
    stageReports: Object.freeze({}),
    candidateBinding: candidateBindingRecord(policy, snapshot, snapshot, findings),
    findings: Object.freeze(findings),
  });
}

function bindCandidateReport(policy, report, initial, final) {
  const bindingFindings = candidateBindingFindings(policy, initial, final);
  const findings = Object.freeze([...report.findings, ...bindingFindings]);
  const firstFailure = report.firstFailure || (bindingFindings.length
    ? Object.freeze({ stageId: "candidate-integrity", reason: bindingFindings[0] })
    : null);
  return Object.freeze({
    ...report,
    status: findings.length ? "FAIL" : "PASS",
    firstFailure,
    candidateBinding: candidateBindingRecord(policy, initial, final, bindingFindings),
    findings,
  });
}

function stderrProgress({ id, status }) {
  process.stderr.write(`AI_CHANGE_LOOP_STAGE ${id} ${status}\n`);
}

export async function runAiChangeLoop() {
  const policy = await loadQualityGatePolicy();
  const initial = captureCandidateBinding(policy);
  const preflightFindings = candidateBindingFindings(policy, initial);
  if (preflightFindings.length) return candidatePreflightReport(policy, initial, preflightFindings);
  const { createAiChangeLoopOperations } = await import("./ai-change-loop-operations.mjs");
  const runnerFailures = [
    ...await aiChangeLoopRunnerMutationFailures(policy),
    ...candidateBindingMutationFailures(policy),
  ];
  if (runnerFailures.length) throw new Error(runnerFailures.join("\n"));
  const report = await executeAiChangeLoop(policy, createAiChangeLoopOperations(), {
    onProgress: process.argv.includes("--progress") ? stderrProgress : null,
  });
  return bindCandidateReport(policy, report, initial, captureCandidateBinding(policy));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runAiChangeLoop();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
