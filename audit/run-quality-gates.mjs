import { spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { engineScenarioMeasurement, repositoryPaths, shippedByteMeasurements, sourceLineMeasurements } from "./lib/quality-budget-measurements.mjs";
import { loadQualityGatePolicy, qualityMetricFindings } from "./lib/quality-gate-policy.mjs";
import { runCoverage } from "./run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function runTool(relativePath, argumentsList, acceptedStatuses = [0]) {
  const result = spawnSync(process.execPath, [path.join(root, relativePath), ...argumentsList], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MQ_PLAYWRIGHT_EDGE_EXECUTABLE: process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE || edgePath,
    },
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(relativePath + " exited " + result.status + ":\n" + (result.stderr || result.stdout));
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(label + " did not emit valid JSON: " + error.message);
  }
}

function eslintMetrics() {
  const report = parseJson(runTool("node_modules/eslint/bin/eslint.js", [".", "--format", "json"]).stdout, "ESLint");
  const metrics = { errors: 0, warningsByRule: {} };
  for (const file of report) {
    for (const message of file.messages) {
      if (message.severity === 2) metrics.errors += 1;
      if (message.severity === 1) metrics.warningsByRule[message.ruleId] = (metrics.warningsByRule[message.ruleId] || 0) + 1;
    }
  }
  return metrics;
}

function stylelintFindingCount() {
  const result = runTool("node_modules/stylelint/bin/stylelint.mjs", ["assets/**/*.css", "--formatter", "json"], [0, 2]);
  const report = parseJson(result.stdout || result.stderr, "Stylelint");
  return report.reduce((count, file) => count + file.warnings.length, 0);
}

function markdownlintFindingCount() {
  const result = runTool("node_modules/markdownlint-cli2/markdownlint-cli2.mjs", [], [0, 1]);
  if (result.status === 0) return 0;
  return (result.stdout + "\n" + result.stderr).split(/\r?\n/u).filter((line) => /:\d+(?::\d+)?\s/u.test(line)).length || 1;
}

function knipMetrics() {
  const result = runTool("node_modules/knip/bin/knip.js", ["--reporter", "json"], [0, 1]);
  const report = parseJson(result.stdout, "Knip");
  const metrics = { unusedFiles: 0, unusedDependencies: 0, unusedExports: 0, duplicateExportGroups: 0 };
  const dependencyFields = ["dependencies", "devDependencies", "optionalPeerDependencies", "unlisted", "unresolved"];
  for (const issue of report.issues) {
    metrics.unusedFiles += issue.files.length;
    metrics.unusedExports += issue.exports.length;
    metrics.duplicateExportGroups += issue.duplicates.length;
    metrics.unusedDependencies += dependencyFields.reduce((count, field) => count + issue[field].length, 0);
  }
  return metrics;
}

function qualityGateRuntimeEvidence(policy) {
  const variable = policy.performanceEvidence.calibratedEnvironmentVariable;
  const calibrated = process.env[variable] === policy.performanceEvidence.calibratedRequiredValue;
  return Object.freeze({
    status: calibrated ? "CALIBRATED" : "UNCALIBRATED",
    environmentVariable: variable,
    enforcement: calibrated ? "HARD_FAIL" : "TELEMETRY_ONLY",
    automaticRetryPolicy: policy.performanceEvidence.automaticRetryPolicy,
  });
}

export async function runQualityGates({ engineBranchCoveragePercent } = {}) {
  const startedAt = performance.now();
  const policy = await loadQualityGatePolicy();
  const eslint = eslintMetrics();
  const paths = repositoryPaths(root);
  const engineScenario = await engineScenarioMeasurement(root);
  const observed = {
    eslintErrors: eslint.errors,
    eslintWarningsByRule: eslint.warningsByRule,
    knip: knipMetrics(),
    markdownlintFindings: markdownlintFindingCount(),
    stylelintFindings: stylelintFindingCount(),
    engineBranchCoveragePercent,
    qualityGateRuntime: qualityGateRuntimeEvidence(policy),
    sourceLinesByPath: sourceLineMeasurements(root, paths),
    performance: {
      ...shippedByteMeasurements(root, paths),
      engineScenarioExecutions: engineScenario.executions,
      engineScenarioWallTimeMs: engineScenario.wallTimeMs,
      qualityGateWallTimeMs: 0,
    },
  };
  observed.performance.qualityGateWallTimeMs = Math.ceil(performance.now() - startedAt);
  const findings = qualityMetricFindings(policy, observed);
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    policyId: policy.policyId,
    observed,
    findings,
  });
}

export async function runCompleteQualityGates() {
  const coverage = await runCoverage({ nodePath: process.execPath });
  const quality = await runQualityGates({ engineBranchCoveragePercent: coverage.branchPct });
  const findings = coverage.status === "PASS"
    ? quality.findings
    : Object.freeze(["engine coverage stage did not report PASS", ...quality.findings]);
  return Object.freeze({
    ...quality,
    status: findings.length ? "FAIL" : "PASS",
    coverage: Object.freeze({ status: coverage.status, branchPct: coverage.branchPct }),
    findings,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runCompleteQualityGates();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
