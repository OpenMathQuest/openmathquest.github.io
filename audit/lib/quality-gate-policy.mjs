import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFile as readFileAsync } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const canonicalPolicyUrl = new URL("../quality-gate-policy-v1.json", import.meta.url);

const initialEslintCeilings = Object.freeze({
  complexity: 199,
  "max-depth": 110,
  "max-lines-per-function": 138,
  "max-params": 3,
  "max-statements": 96,
  "no-promise-executor-return": 33,
  "no-unsafe-finally": 4,
  "no-unused-vars": 13,
  "no-useless-escape": 27,
});
const initialSourceLineCeilings = new Map([
  ["Serve-MathQuest.ps1", 523],
  ["audit.html", 8228],
  ["audit/approved-visual-regression.js", 3319],
  ["audit/exhaustive-generator-audit.mjs", 782],
  ["audit/lib/bounded-audit-lanes.mjs", 684],
  ["audit/lib/browser-smoke.mjs", 1024],
  ["audit/lib/publication-clearance.mjs", 855],
  ["audit/lib/trusted-https-canary.mjs", 882],
  ["audit/playwright/critical-journeys.spec.mjs", 1530],
  ["audit/public-candidate-guard.mjs", 1322],
  ["audit/run-audit.mjs", 709],
  ["audit/run-audit.ps1", 614],
  ["audit/run-trusted-https-canary.mjs", 1576],
  ["audit/tests/engine-suite.mjs", 2257],
  ["audit/tests/holistic-child-ux-regressions.test.mjs", 1766],
  ["audit/tests/holistic-functional-regressions.test.mjs", 1191],
  ["audit/tests/manifest-semantic-suite.mjs", 1709],
  ["audit/tests/node-engine.test.mjs", 4713],
  ["audit/tests/page-adapter-effects.test.mjs", 1826],
  ["audit/tests/placement-adapter-effects.test.mjs", 1278],
  ["audit/tests/publication-clearance.test.mjs", 1048],
  ["audit/tests/pwa-release.test.mjs", 3049],
  ["audit/tests/qa-tour.test.mjs", 720],
  ["audit/tests/trusted-https-canary.test.mjs", 905],
  ["index.html", 4908],
]);
const initialPerformanceCeilings = Object.freeze({
  stylesheetMaximumBytes: 235645,
  javascriptMaximumBytes: 1057930,
  compiledAssetMaximumBytes: 932443,
  productionPayloadMaximumBytes: 2707876,
  engineScenarioMaximumWallTimeMs: 12000,
  qualityGateMaximumWallTimeMs: 120000,
});
const initialFunctionViolationCeilings = Object.freeze({
  javascript: Object.freeze({ cyclomatic: 187, abcMagnitude: 261, cognitive: 118, functionLines: 126, maxNesting: 11 }),
  javascriptInlineHtml: Object.freeze({ cyclomatic: 204, abcMagnitude: 116, cognitive: 111, functionLines: 16, maxNesting: 6 }),
  powershell: Object.freeze({ cyclomatic: 6, abcMagnitude: 3, cognitive: 4, functionLines: 0, maxNesting: 0 }),
});

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function schemaIssue(error) {
  return `${error.instancePath || "/"} ${error.message || "is invalid"}`;
}

function entriesSortedBy(records, key) {
  const values = records.map((record) => record[key]);
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function qualityToolSourceIssues(supplyChain, components) {
  const issues = [];
  const dependencies = new Map(supplyChain.directDependencies.map((record) => [record.name, record]));
  for (const component of components) {
    if (!dependencies.has(component.packageName)) issues.push(component.id + " has no reviewed direct dependency");
    if (!component.sourceUrl.includes(component.sourceCommit)) issues.push(component.id + " sourceUrl is not commit-bound");
    if (!component.licenceEvidence.includes(component.sourceCommit)) issues.push(component.id + " licenceEvidence is not commit-bound");
  }
  return issues;
}

function sourcePolicyIssues(sourceBudgets) {
  const issues = [];
  if (!entriesSortedBy(sourceBudgets.legacyLineRatchets, "path")) {
    issues.push("legacyLineRatchets must be unique and lexicographically ordered");
  }
  for (const record of sourceBudgets.legacyLineRatchets) {
    const initial = initialSourceLineCeilings.get(record.path);
    if (initial === undefined) issues.push(record.path + " is not a pre-refactor legacy source exception");
    else if (record.maximumLines > initial) issues.push(record.path + " line ratchet exceeds the pre-refactor ceiling " + initial);
  }
  return issues;
}

function performancePolicyIssues(performanceBudgets) {
  return Object.entries(initialPerformanceCeilings)
    .filter(([metric, initial]) => performanceBudgets[metric] > initial)
    .map(([metric, initial]) => metric + " exceeds the pre-refactor ceiling " + initial);
}

function functionQualityPolicyIssues(functionQuality) {
  const issues = [];
  for (const [language, ceilings] of Object.entries(functionQuality.legacyViolationCeilings)) {
    for (const [metric, actual] of Object.entries(ceilings)) {
      const initial = initialFunctionViolationCeilings[language][metric];
      if (actual > initial) issues.push(`${language} ${metric} ratchet exceeds the pre-refactor ceiling ${initial}`);
    }
  }
  return issues;
}

export const QUALITY_GATE_POLICY = freezeDeep(JSON.parse(readFileSync(canonicalPolicyUrl, "utf8")));

export async function validateQualityGatePolicySchema(policy, schemaPathOrUrl = new URL("../schemas/quality-gate-policy-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFileAsync(schemaPathOrUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return Object.freeze(validate(policy) ? [] : (validate.errors || []).map(schemaIssue));
}

export async function validateQualityGatePolicy(policy) {
  const issues = [...await validateQualityGatePolicySchema(policy)];
  if (issues.length) return Object.freeze(issues);
  if (!entriesSortedBy(policy.supplyChain.directDependencies, "name")) {
    issues.push("directDependencies must be unique and lexicographically ordered");
  }
  issues.push(...sourcePolicyIssues(policy.sourceBudgets));
  issues.push(...performancePolicyIssues(policy.performanceBudgets));
  issues.push(...functionQualityPolicyIssues(policy.analysisRatchets.functionQuality));
  issues.push(...qualityToolSourceIssues(policy.supplyChain, policy.qualityToolComponents));
  for (const [ruleId, initialCeiling] of Object.entries(initialEslintCeilings)) {
    if (policy.analysisRatchets.eslintWarningsByRule[ruleId] > initialCeiling) {
      issues.push(`${ruleId} ratchet exceeds the pre-refactor ceiling ${initialCeiling}`);
    }
  }
  if (policy.analysisRatchets.knip.unusedExports > 104) issues.push("unused-export ratchet exceeds the pre-refactor ceiling 104");
  if (policy.analysisRatchets.knip.duplicateExportGroups > 2) issues.push("duplicate-export ratchet exceeds the pre-refactor ceiling 2");
  return Object.freeze(issues);
}

export async function loadQualityGatePolicy(pathOrUrl = canonicalPolicyUrl) {
  const policy = JSON.parse(await readFileAsync(pathOrUrl, "utf8"));
  const issues = await validateQualityGatePolicy(policy);
  if (issues.length) throw new Error(`Invalid refactor quality-gate policy:\n- ${issues.join("\n- ")}`);
  return freezeDeep(policy);
}

function eslintMetricFindings(policy, observed) {
  const findings = [];
  if (observed.eslintErrors !== 0) findings.push(`ESLint reported ${observed.eslintErrors} errors`);
  for (const [ruleId, ceiling] of Object.entries(policy.analysisRatchets.eslintWarningsByRule)) {
    const actual = observed.eslintWarningsByRule?.[ruleId] || 0;
    if (actual > ceiling) findings.push(`${ruleId} warnings increased from ${ceiling} to ${actual}`);
  }
  const unknownRules = Object.keys(observed.eslintWarningsByRule || {})
    .filter((ruleId) => !(ruleId in policy.analysisRatchets.eslintWarningsByRule));
  if (unknownRules.length) findings.push(`ESLint reported ungoverned warning rules: ${unknownRules.sort().join(", ")}`);
  return findings;
}

function remainingMetricFindings(policy, observed) {
  const findings = [];
  for (const [metric, ceiling] of Object.entries(policy.analysisRatchets.knip)) {
    if (observed.knip?.[metric] > ceiling) findings.push(`Knip ${metric} increased from ${ceiling} to ${observed.knip[metric]}`);
  }
  if (observed.markdownlintFindings > policy.analysisRatchets.markdownlintFindings) findings.push("Markdown findings exceed the zero-finding ratchet");
  if (observed.stylelintFindings > policy.analysisRatchets.stylelintFindings) findings.push("CSS findings exceed the zero-finding ratchet");
  if (!Number.isFinite(observed.engineBranchCoveragePercent)) {
    findings.push("engine branch coverage measurement is missing or invalid");
  } else if (observed.engineBranchCoveragePercent < policy.analysisRatchets.engineBranchCoverageMinimumPercent) {
    findings.push(`engine branch coverage ${observed.engineBranchCoveragePercent} is below ${policy.analysisRatchets.engineBranchCoverageMinimumPercent}`);
  }
  return findings;
}

function sourceLineFinding(relativePath, lines, legacy, strictMaximum) {
  if (!Number.isSafeInteger(lines) || lines < 0) return relativePath + " has an invalid source-line measurement";
  if (!legacy.has(relativePath) && lines > strictMaximum) return relativePath + " has " + lines + " lines, exceeding the " + strictMaximum + "-line limit";
  if (!legacy.has(relativePath)) return null;
  if (lines > legacy.get(relativePath)) return relativePath + " increased from " + legacy.get(relativePath) + " to " + lines + " lines";
  if (lines < legacy.get(relativePath)) return relativePath + " improved to " + lines + " lines; tighten its stale " + legacy.get(relativePath) + "-line ratchet";
  return null;
}

function sourceBudgetFindings(policy, observed) {
  if (!observed.sourceLinesByPath || typeof observed.sourceLinesByPath !== "object") return ["source-line measurements are missing"];
  const findings = [];
  const legacy = new Map(policy.sourceBudgets.legacyLineRatchets.map((record) => [record.path, record.maximumLines]));
  for (const [relativePath, lines] of Object.entries(observed.sourceLinesByPath)) {
    const extension = relativePath.slice(relativePath.lastIndexOf("."));
    const finding = sourceLineFinding(relativePath, lines, legacy, policy.sourceBudgets.strictMaximumLinesByExtension[extension]);
    if (finding) findings.push(finding);
  }
  for (const relativePath of legacy.keys()) if (!(relativePath in observed.sourceLinesByPath)) findings.push(relativePath + " legacy line ratchet is stale because the source file is missing");
  return findings;
}

export function performanceBudgetFindings(policy, observed, policyMetrics = Object.keys(policy.performanceBudgets)) {
  const findings = [];
  const measurements = observed.performance;
  if (!measurements || typeof measurements !== "object") return ["performance measurements are missing"];
  for (const policyMetric of policyMetrics) {
    const maximum = policy.performanceBudgets[policyMetric];
    const observedMetric = policyMetric.replace("Maximum", "");
    const actual = measurements[observedMetric];
    if (!Number.isFinite(actual) || actual < 0) findings.push(observedMetric + " measurement is missing or invalid");
    else if (actual > maximum) findings.push(observedMetric + " " + actual + " exceeds budget " + maximum);
  }
  return findings;
}

function qualityGateRuntimeEvidenceFindings(policy, observed) {
  const evidence = observed.qualityGateRuntime;
  if (!evidence || !["CALIBRATED", "UNCALIBRATED"].includes(evidence.status)) {
    return ["quality-gate runtime calibration evidence is missing or invalid"];
  }
  const findings = [];
  const expectedEnforcement = evidence.status === "CALIBRATED" ? "HARD_FAIL" : "TELEMETRY_ONLY";
  if (evidence.environmentVariable !== policy.performanceEvidence.calibratedEnvironmentVariable) {
    findings.push("quality-gate runtime calibration authority drifted");
  }
  if (evidence.enforcement !== expectedEnforcement) findings.push("quality-gate runtime enforcement does not match its calibration state");
  if (evidence.automaticRetryPolicy !== policy.performanceEvidence.automaticRetryPolicy) {
    findings.push("quality-gate runtime retry policy drifted");
  }
  return findings;
}

function qualityPerformanceFindings(policy, observed) {
  const evidenceFindings = qualityGateRuntimeEvidenceFindings(policy, observed);
  const calibrated = observed.qualityGateRuntime?.status === "CALIBRATED";
  const metrics = Object.keys(policy.performanceBudgets)
    .filter((metric) => calibrated || metric !== "qualityGateMaximumWallTimeMs");
  return [...evidenceFindings, ...performanceBudgetFindings(policy, observed, metrics)];
}

export function qualityMetricFindings(policy, observed) {
  return Object.freeze([
    ...eslintMetricFindings(policy, observed),
    ...remainingMetricFindings(policy, observed),
    ...sourceBudgetFindings(policy, observed),
    ...qualityPerformanceFindings(policy, observed),
  ]);
}

function stageHasFindings(result) {
  if (!result || result.findings === undefined) return false;
  return !Array.isArray(result.findings) || result.findings.length > 0;
}

export function aiChangeLoopFindings(policy, results) {
  const expected = policy.aiChangeLoop.order;
  const findings = [];
  if (!Array.isArray(results)) return Object.freeze(["AI-change loop results are missing"]);
  if (results.length !== expected.length) findings.push(`AI-change loop reported ${results.length} of ${expected.length} required stages`);
  for (const [index, stageId] of expected.entries()) {
    const result = results[index];
    if (result?.id !== stageId) findings.push(`AI-change loop stage ${index + 1} must be ${stageId}`);
    if (result?.status !== "PASS") findings.push(`AI-change loop stage ${stageId} did not report PASS`);
    if (stageHasFindings(result)) findings.push(`AI-change loop stage ${stageId} contains unresolved or malformed findings`);
  }
  return Object.freeze(findings);
}

export function qualityGateMutationFailures(policy) {
  const failures = [];
  const passing = policy.aiChangeLoop.order.map((id) => ({ id, status: "PASS" }));
  const run = (label, mutate) => {
    const candidate = structuredClone(passing);
    mutate(candidate);
    if (!aiChangeLoopFindings(policy, candidate).length) failures.push(`quality-gate mutation self-test did not reject ${label}`);
  };
  run("a skipped stage", (records) => { records[3].status = "SKIPPED"; });
  run("a missing stage", (records) => { records.pop(); });
  run("out-of-order stages", (records) => { [records[0], records[1]] = [records[1], records[0]]; });
  const degraded = {
    eslintErrors: 1,
    eslintWarningsByRule: { complexity: policy.analysisRatchets.eslintWarningsByRule.complexity + 1 },
    knip: { ...policy.analysisRatchets.knip, unusedExports: policy.analysisRatchets.knip.unusedExports + 1 },
    markdownlintFindings: 1,
    stylelintFindings: 1,
    engineBranchCoveragePercent: policy.analysisRatchets.engineBranchCoverageMinimumPercent - 0.01,
    sourceLinesByPath: Object.fromEntries(policy.sourceBudgets.legacyLineRatchets.map((record) => [record.path, record.maximumLines])),
    qualityGateRuntime: {
      status: "CALIBRATED",
      environmentVariable: policy.performanceEvidence.calibratedEnvironmentVariable,
      enforcement: "HARD_FAIL",
      automaticRetryPolicy: policy.performanceEvidence.automaticRetryPolicy,
    },
    performance: {
      stylesheetBytes: policy.performanceBudgets.stylesheetMaximumBytes,
      javascriptBytes: policy.performanceBudgets.javascriptMaximumBytes,
      compiledAssetBytes: policy.performanceBudgets.compiledAssetMaximumBytes,
      productionPayloadBytes: policy.performanceBudgets.productionPayloadMaximumBytes + 1,
      engineScenarioWallTimeMs: policy.performanceBudgets.engineScenarioMaximumWallTimeMs,
      qualityGateWallTimeMs: policy.performanceBudgets.qualityGateMaximumWallTimeMs,
    },
  };
  if (qualityMetricFindings(policy, degraded).length !== 7) failures.push("quality-gate mutation self-test did not reject every degraded metric family");
  return Object.freeze(failures);
}

export function historicalLintIgnorePaths(policy, read = readFileSync) {
  return policy.analysisRatchets.historicalLintEvidence.records.map((record) => {
    let bytes;
    try { bytes = read(new URL(`../../${record.path}`, import.meta.url)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (bytes !== undefined && createHash("sha256").update(bytes).digest("hex") !== record.sha256) {
      throw new Error(`Historical lint evidence changed: ${record.path}`);
    }
    return record.path;
  });
}
