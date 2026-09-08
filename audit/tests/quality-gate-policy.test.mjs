import assert from "node:assert/strict";
import test from "node:test";
import { shippedByteMeasurements, sourceLineMeasurements } from "../lib/quality-budget-measurements.mjs";
import {
  aiChangeLoopFindings,
  historicalLintIgnorePaths,
  loadQualityGatePolicy,
  QUALITY_GATE_POLICY,
  qualityGateMutationFailures,
  qualityMetricFindings,
  validateQualityGatePolicy,
  validateQualityGatePolicySchema,
} from "../lib/quality-gate-policy.mjs";

test("historical lint exclusions are exact, approved, and retain their non-pass findings", async () => {
  const policy = await loadQualityGatePolicy();
  const evidence = policy.analysisRatchets.historicalLintEvidence;
  assert.equal(evidence.status, "OWNER_EXCLUDED_HISTORICAL_EVIDENCE");
  assert.equal(evidence.records.length, 3);
  assert.equal(evidence.records.reduce((sum, record) => sum + record.warnings, 0), 53);
  const changed = structuredClone(policy);
  changed.analysisRatchets.historicalLintEvidence.records[0].path = "audit/**/*.mjs";
  assert.notDeepEqual(await validateQualityGatePolicySchema(changed), []);
  const { ESLint } = await import("eslint");
  const eslint = new ESLint();
  for (const record of evidence.records) assert.equal(await eslint.isPathIgnored(record.path), true);
  assert.equal(await eslint.isPathIgnored("audit/tests/quality-gate-policy.test.mjs"), false);
  assert.equal(await eslint.isPathIgnored("qa/reviews/visual-interaction/new-live-script.mjs"), false);
});

test("historical files cannot change or become unreadable behind a lint exclusion", async () => {
  const policy = await loadQualityGatePolicy();
  assert.throws(() => historicalLintIgnorePaths(policy, () => Buffer.from("changed")), /Historical lint evidence changed/u);
  const denied = Object.assign(new Error("denied"), { code: "EACCES" });
  assert.throws(() => historicalLintIgnorePaths(policy, () => { throw denied; }), /denied/u);
  const absent = Object.assign(new Error("absent on CI"), { code: "ENOENT" });
  assert.deepEqual(historicalLintIgnorePaths(policy, () => { throw absent; }), policy.analysisRatchets.historicalLintEvidence.records.map((record) => record.path));
  assert.deepEqual(historicalLintIgnorePaths(policy), policy.analysisRatchets.historicalLintEvidence.records.map((record) => record.path));
});

test("the refactor quality policy is closed and preserves the ordered AI-change loop", async () => {
  const policy = await loadQualityGatePolicy();
  assert.deepEqual(await validateQualityGatePolicySchema(policy), []);
  assert.deepEqual(await validateQualityGatePolicy(policy), []);
  assert.equal(policy.aiChangeLoop.order.length, 9);
  assert.deepEqual(policy.aiChangeLoop.order, policy.aiChangeLoop.stages.map((stage) => stage.id));
  assert.equal(policy.sliceLifecycle.order.at(-2), "FULL_NINE_STAGE_LOOP");
  assert.match(policy.sliceLifecycle.fullLoopCallerEntryCondition, /^CALLER_MUST_SUPPLY_A_REVIEW_CLEAR/u);
  assert.equal(policy.candidateBinding.contractId, "STAGED_TREE_CANDIDATE_V1");
  assert.equal(QUALITY_GATE_POLICY.version, policy.version);
  assert.equal(policy.analysisRatchets.functionQuality.newOrMateriallyModifiedLimits.cyclomatic, 10);
});

test("a serialized PASS stage cannot conceal unresolved or malformed findings", () => {
  for (const findings of [["unresolved defect"], "malformed findings"]) {
    const stages = QUALITY_GATE_POLICY.aiChangeLoop.order.map((id) => ({ id, status: "PASS", findings: [] }));
    stages[2].findings = findings;
    assert.match(aiChangeLoopFindings(QUALITY_GATE_POLICY, stages).join("\n"), /unresolved or malformed findings/u);
  }
});

test("function-quality ceilings can only ratchet down from the recorded baseline", async () => {
  const policy = structuredClone(await loadQualityGatePolicy());
  policy.analysisRatchets.functionQuality.legacyViolationCeilings.javascript.cyclomatic = 188;
  assert.match((await validateQualityGatePolicy(policy)).join("\n"), /pre-refactor ceiling 187/iu);
  policy.analysisRatchets.functionQuality.legacyViolationCeilings.javascript.cyclomatic = 181;
  policy.analysisRatchets.functionQuality.legacyViolationCeilings.javascriptInlineHtml.cyclomatic = 205;
  assert.match((await validateQualityGatePolicy(policy)).join("\n"), /javascriptInlineHtml cyclomatic.*204/iu);
});

test("[NC-AI-CHANGE-LOOP-CANNOT-SKIP] the loop rejects missing, skipped, reordered, and degraded evidence", async () => {
  const policy = await loadQualityGatePolicy();
  assert.deepEqual(qualityGateMutationFailures(policy), []);
  const passing = policy.aiChangeLoop.order.map((id) => ({ id, status: "PASS" }));
  assert.deepEqual(aiChangeLoopFindings(policy, passing), []);
});

test("analysis measurements may improve but cannot exceed their ratchets", async () => {
  const policy = await loadQualityGatePolicy();
  const observed = {
    eslintErrors: 0,
    eslintWarningsByRule: Object.fromEntries(Object.keys(policy.analysisRatchets.eslintWarningsByRule).map((ruleId) => [ruleId, 0])),
    knip: { unusedFiles: 0, unusedDependencies: 0, unusedExports: 0, duplicateExportGroups: 0 },
    markdownlintFindings: 0,
    stylelintFindings: 0,
    engineBranchCoveragePercent: 100,
    sourceLinesByPath: Object.fromEntries(policy.sourceBudgets.legacyLineRatchets.map((record) => [record.path, record.maximumLines])),
    qualityGateRuntime: {
      status: "CALIBRATED",
      environmentVariable: policy.performanceEvidence.calibratedEnvironmentVariable,
      enforcement: "HARD_FAIL",
      automaticRetryPolicy: "PROHIBITED",
    },
    performance: {
      stylesheetBytes: 0,
      javascriptBytes: 0,
      compiledAssetBytes: 0,
      productionPayloadBytes: 0,
      engineScenarioWallTimeMs: 0,
      qualityGateWallTimeMs: 0,
    },
  };
  assert.deepEqual(qualityMetricFindings(policy, observed), []);
});

test("coverage cannot be omitted from a complete quality measurement", async () => {
  const policy = await loadQualityGatePolicy();
  const observed = {
    eslintErrors: 0,
    eslintWarningsByRule: {},
    knip: { unusedFiles: 0, unusedDependencies: 0, unusedExports: 0, duplicateExportGroups: 0 },
    markdownlintFindings: 0,
    stylelintFindings: 0,
    sourceLinesByPath: Object.fromEntries(policy.sourceBudgets.legacyLineRatchets.map((record) => [record.path, record.maximumLines])),
    qualityGateRuntime: {
      status: "CALIBRATED",
      environmentVariable: policy.performanceEvidence.calibratedEnvironmentVariable,
      enforcement: "HARD_FAIL",
      automaticRetryPolicy: "PROHIBITED",
    },
    performance: Object.fromEntries(Object.keys(policy.performanceBudgets).map((metric) => [metric.replace("Maximum", ""), 0])),
  };
  assert.match(qualityMetricFindings(policy, observed).join("\n"), /branch coverage measurement is missing/iu);
});

test("quality-run wall time hard-fails only with explicit calibrated evidence", async () => {
  const policy = await loadQualityGatePolicy();
  const observed = {
    eslintErrors: 0,
    eslintWarningsByRule: {},
    knip: { unusedFiles: 0, unusedDependencies: 0, unusedExports: 0, duplicateExportGroups: 0 },
    markdownlintFindings: 0,
    stylelintFindings: 0,
    engineBranchCoveragePercent: 100,
    sourceLinesByPath: Object.fromEntries(policy.sourceBudgets.legacyLineRatchets.map((record) => [record.path, record.maximumLines])),
    qualityGateRuntime: {
      status: "UNCALIBRATED",
      environmentVariable: policy.performanceEvidence.calibratedEnvironmentVariable,
      enforcement: "TELEMETRY_ONLY",
      automaticRetryPolicy: "PROHIBITED",
    },
    performance: Object.fromEntries(Object.keys(policy.performanceBudgets).map((metric) => [metric.replace("Maximum", ""), 0])),
  };
  observed.performance.qualityGateWallTimeMs = policy.performanceBudgets.qualityGateMaximumWallTimeMs + 1;
  assert.deepEqual(qualityMetricFindings(policy, observed), []);
  observed.qualityGateRuntime = { ...observed.qualityGateRuntime, status: "CALIBRATED", enforcement: "HARD_FAIL" };
  assert.match(qualityMetricFindings(policy, observed).join("\n"), /qualityGateWallTimeMs.*exceeds budget/iu);
});

test("source and shipped-byte measurements bind the exact current downward ratchets", async () => {
  const policy = await loadQualityGatePolicy();
  const lines = sourceLineMeasurements();
  const bytes = shippedByteMeasurements();
  const indexBudget = policy.sourceBudgets.legacyLineRatchets.find((record) => record.path === "index.html");
  assert.equal(lines["index.html"], indexBudget.maximumLines);
  assert.deepEqual(bytes, {
    stylesheetBytes: policy.performanceBudgets.stylesheetMaximumBytes,
    javascriptBytes: policy.performanceBudgets.javascriptMaximumBytes,
    compiledAssetBytes: policy.performanceBudgets.compiledAssetMaximumBytes,
    productionPayloadBytes: policy.performanceBudgets.productionPayloadMaximumBytes,
  });
});
