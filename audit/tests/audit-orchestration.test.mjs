import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BROWSER_AUDIT_SHARDS, aggregateBrowserShardReports } from "../lib/browser-smoke.mjs";
import { runNativeCoverage } from "../lib/native-coverage.mjs";
import { PLAYWRIGHT_FOCUSED_WORKERS } from "../lib/playwright-focused-contract.mjs";
import { coverageProcessTimeoutMs, DEFAULT_COVERAGE_PROCESS_TIMEOUT_MS, validateStructuredAudit } from "../run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const identity = Object.freeze({
  browserProductName: "Microsoft Edge", browserFullVersion: "151.0.4129.72",
  browserExecutableSha256: "a".repeat(64), requestedRunnerLabel: "windows-latest",
  runnerKind: "GITHUB_HOSTED", runnerImageOS: "win25", runnerImageVersion: "20260808.1.0",
  browserIdentityValid: true, validForPublication: true, status: "OBSERVED_GITHUB_HOSTED", issues: [],
});
const shardReport = (shard) => ({
  shard, status: "PASS", complete: true, evidence: { ...identity },
  process: { status: 0, signal: null, error: null, timedOut: false, forcedTermination: false, close: { requested: true, error: null }, stderr: "" },
  results: BROWSER_AUDIT_SHARDS[shard].map((id) => ({ id, title: id, status: "PASS", details: "" })),
  payloadValidation: { valid: true, errors: [] }, cleanupError: null,
  requests: [], unexpectedRequests: [], parseError: null, dumpTail: "",
});

test("coverage reserves finalization time inside its policy-owned lane timeout", () => {
  assert.equal(coverageProcessTimeoutMs(240_000, 15_000), 225_000);
  assert.equal(DEFAULT_COVERAGE_PROCESS_TIMEOUT_MS, 225_000);
  assert.throws(() => coverageProcessTimeoutMs(240_000, 240_000), /reserve/u);
});

test("native coverage reports a real subprocess timeout explicitly", () => {
  const result = runNativeCoverage(
    process.execPath,
    path.join(root, "audit", "fixtures", "coverage-calibration.test.mjs"),
    { cwd: root, timeoutMs: 1 },
  );
  assert.equal(result.timedOut, true);
  assert.match(result.error || "", /ETIMEDOUT/u);
});

test("the current build contract digest is bound before complete certification", async () => {
  const [contractBytes, register, auditRunner] = await Promise.all([
    readFile(path.join(root, "docs/development/build-spec.md")),
    read("research/build-axioms.md"),
    read("audit/run-audit.mjs"),
  ]);
  const recorded = register.match(/Contract SHA-256:\*\*\s*`([a-f0-9]{64})`/u)?.[1];
  const actual = createHash("sha256").update(contractBytes).digest("hex");
  assert.equal(recorded, actual);
  assert.match(auditRunner, /promptDigestMatchesRegister/u);
  assert.match(auditRunner, /meta\.promptDigestMatchesRegister/u);
});

const structuredAudit = () => ({
  schemaVersion: 1,
  artifactKind: "MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1",
  complete: true,
  engine: {
    sha256: "c".repeat(64),
    summary: { PASS: 43, FAIL: 0, SKIP: 0, total: 43, requiredFailures: 0 },
    results: Array.from({ length: 43 }, (_, index) => ({ id: `ENGINE-${index}`, status: "PASS" })),
    effectMap: {},
    childStringCandidateSha256: "d".repeat(64),
    childStringConstants: { pendingApproval: false, approvalSha256: "d".repeat(64) },
  },
  semantic: {
    assertions: Array.from({ length: 130 }, (_, index) => ({ id: `SEM-${index}`, status: "PASS" })),
    summary: { total: 130, passed: 130, failed: 0, skills: 126, taskTypes: 166, questions: 6_048 },
    failures: [],
    contractPass: true,
  },
});

test("browser shard aggregation accepts exactly one complete identity-bound partition", () => {
  const aggregate = aggregateBrowserShardReports([shardReport("core"), shardReport("visual")], { browserPath: "msedge.exe" });
  assert.equal(aggregate.status, "PASS");
  assert.equal(aggregate.results.length, 72);
  assert.equal(aggregate.shardEvidence.length, 2);
  assert.equal(aggregate.shardEvidence.every((item) => /^[a-f0-9]{64}$/u.test(item.canonicalEvidenceSha256)), true);
  for (const item of aggregate.shardEvidence) {
    assert.equal(
      createHash("sha256").update(JSON.stringify(item.projection)).digest("hex"),
      item.canonicalEvidenceSha256,
    );
  }
  assert.equal(Object.hasOwn(aggregate, "shardReports"), false);
});

test("[NC-BROWSER-MISSING_OR_SKIPPED_RESULT] browser aggregation rejects missing, duplicate, mixed-identity, failed, and unexpected-request evidence", () => {
  assert.throws(() => aggregateBrowserShardReports([shardReport("core")]), /exactly one report/u);
  assert.throws(() => aggregateBrowserShardReports([shardReport("core"), shardReport("core")]), /missing, duplicated, or unknown/u);
  const mixed = shardReport("visual"); mixed.evidence.browserExecutableSha256 = "b".repeat(64);
  assert.equal(aggregateBrowserShardReports([shardReport("core"), mixed]).status, "FAIL");
  const failed = shardReport("visual"); failed.status = "FAIL"; failed.results[0].status = "FAIL";
  assert.equal(aggregateBrowserShardReports([shardReport("core"), failed]).status, "FAIL");
  const networked = shardReport("visual"); networked.unexpectedRequests.push({ pathname: "/outside" });
  assert.equal(aggregateBrowserShardReports([shardReport("core"), networked]).status, "FAIL");
  for (const mutate of [
    (report) => { report.process.status = 1; },
    (report) => { report.process.signal = "SIGTERM"; },
    (report) => { report.process.error = "launch failed"; },
    (report) => { report.process.timedOut = true; },
    (report) => { report.process.forcedTermination = true; },
    (report) => { report.process.close.error = "close failed"; },
    (report) => { report.payloadValidation.valid = false; },
    (report) => { report.parseError = "bad json"; },
    (report) => { report.cleanupError = "profile remained"; },
    (report) => { report.evidence.browserIdentityValid = false; },
    (report) => { report.evidence.validForPublication = false; },
    (report) => { report.evidence.status = "INVALID"; },
  ]) {
    const hostile = shardReport("visual");
    mutate(hostile);
    assert.equal(aggregateBrowserShardReports([shardReport("core"), hostile]).status, "FAIL");
  }
});

test("release orchestration eliminates exact duplicates and uses instrumented canonical evidence", async () => {
  const [workflow, wrapper, runner, coverage, nodeEngine, auditPage] = await Promise.all([
    read(".github/workflows/audit.yml"), read("audit/run-audit.ps1"), read("audit/run-audit.mjs"),
    read("audit/run-coverage.mjs"), read("audit/tests/node-engine.test.mjs"), read("audit.html"),
  ]);
  const fullJob = workflow.split(/^  full-audit:\s*$/mu)[1] || "";
  assert.doesNotMatch(fullJob, /run: node audit\/public-candidate-guard\.mjs/u);
  assert.doesNotMatch(fullJob, /node --test audit\/tests\/publication-clearance\.test\.mjs/u);
  assert.doesNotMatch(fullJob, /node --test audit\/tests\/pwa-release\.test\.mjs/u);
  assert.equal((wrapper.match(/Invoke-PublicCandidateGuard -ValidatedNode/gu) || []).length, 1);
  const runAuditBody = runner.split(/export async function runAudit/u)[1] || "";
  assert.doesNotMatch(runAuditBody, /runEngineSuite|runManifestSemanticAudit/u);
  assert.match(runAuditBody, /structuredAuditValid/iu);
  assert.match(runAuditBody, /runBoundedAuditLanes\(/u);
  assert.match(runAuditBody, /const playwright = laneExecution\.results\.playwright/u);
  assert.match(runAuditBody, /playwright\.status === "PASS"/u);
  assert.match(runner, /playwrightAssertions: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS\.length/u);
  assert.match(runner, /actual\.playwrightAssertions/u);
  assert.match(runner, /AI_READER_CONTRACT_REF/u);
  assert.match(runner, /schemaVersion: 2, reportType: "MATH_QUEST_CERTIFICATION", aiReaderContractRef: AI_READER_CONTRACT_REF/u);
  assert.match(runner, /aiReaderContractRef: report\.aiReaderContractRef/u);
  assert.match(coverage, /MQ_STRUCTURED_AUDIT_FILE/u);
  assert.match(coverage, /structuredAuditValid/u);
  assert.match(nodeEngine, /MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1/u);
  assert.match(auditPage, /AUDIT_SHARD !== "visual"/u);
  assert.match(auditPage, /AUDIT_SHARD !== "core"/u);
  assert.equal((workflow.match(/\.\\audit\\install-reviewed-ci-dependencies\.ps1/gu) || []).length, 4);
});

test("[NC-COVERAGE-PARTIAL-FIXTURE-BELOW-FULL] canonical coverage artifact rejects count-correct but internally failed evidence", () => {
  assert.equal(validateStructuredAudit(structuredAudit(), "c".repeat(64)).valid, true);
  for (const mutate of [
    (artifact) => { artifact.engine.summary.requiredFailures = 1; },
    (artifact) => { artifact.engine.results[0].status = "FAIL"; },
    (artifact) => { artifact.engine.results[1].id = artifact.engine.results[0].id; },
    (artifact) => { artifact.semantic.summary.failed = 1; },
    (artifact) => { artifact.semantic.assertions[0].status = "FAIL"; },
    (artifact) => { artifact.semantic.failures.push({ id: "SEM-0" }); },
    (artifact) => { artifact.semantic.assertions[1].id = artifact.semantic.assertions[0].id; },
  ]) {
    const hostile = structuredAudit();
    mutate(hostile);
    assert.equal(validateStructuredAudit(hostile, "c".repeat(64)).valid, false);
  }
});

test("hosted parallelism is bounded while local execution remains sequential", async () => {
  const browserRunner = await read("audit/lib/browser-smoke.mjs");
  const auditRunner = await read("audit/run-audit.mjs");
  const boundedRunner = await read("audit/lib/bounded-audit-lanes.mjs");
  const policy = JSON.parse(await read("audit/gate-integrity-policy-v1.json"));
  assert.match(browserRunner, /GITHUB_ACTIONS === "true"[\s\S]*Promise\.all/iu);
  assert.match(browserRunner, /SEQUENTIAL_LOCAL/u);
  assert.match(auditRunner, /policy: gateIntegrityPolicy\.executionPolicy/u);
  assert.match(boundedRunner, /policy\.laneSchedulingClass\[laneId\] === "EXCLUSIVE"/u);
  assert.match(boundedRunner, /runIndexes\(boundedSegment, configuration\.maximumConcurrentLanes\)/u);
  assert.equal(policy.executionPolicy.local.maximumConcurrentLanes, 1);
  assert.equal(policy.executionPolicy.githubHosted.maximumConcurrentLanes, 2);
  assert.deepEqual(policy.executionPolicy.boundedExecutionStartOrder, ["coverage", "generator", "browser", "playwright", "mutation"]);
  assert.equal(policy.executionPolicy.laneSchedulingClass.coverage, "EXCLUSIVE");
  assert.equal(policy.executionPolicy.nestedProcessFinalizationReserveMs.coverage, 15_000);
  assert.equal(policy.executionPolicy.automaticRetries, 0);
  assert.equal(policy.executionPolicy.nestedConcurrency.browserShardMaximum, Object.keys(BROWSER_AUDIT_SHARDS).length);
  assert.equal(policy.executionPolicy.nestedConcurrency.playwrightWorkers, PLAYWRIGHT_FOCUSED_WORKERS);
});

test("watcher omits an empty changed-path parameter and preserves rename sources", async () => {
  const watcher = await read("audit/on-change-audit.ps1");
  assert.match(watcher, /if \(\$ChangedPaths\.Count -gt 0\)[\s\S]*\$arguments \+= '-ChangedPath'/u);
  assert.doesNotMatch(watcher, /-DevelopmentOnly -ChangedPath \$ChangedPaths/u);
  assert.match(watcher, /\$change\.OldName/u);
  assert.match(watcher, /__rename_unknown__/u);
  const workflow = await read(".github/workflows/audit.yml");
  assert.match(workflow, /--name-status --diff-filter=R/u);
  assert.match(workflow, /\$changedPaths \+= '__rename_unknown__'/u);
});
