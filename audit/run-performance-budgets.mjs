import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { engineScenarioMeasurement, repositoryPaths, shippedByteMeasurements } from "./lib/quality-budget-measurements.mjs";
import { loadQualityGatePolicy, performanceBudgetFindings } from "./lib/quality-gate-policy.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const productMetrics = [
  "stylesheetMaximumBytes",
  "javascriptMaximumBytes",
  "compiledAssetMaximumBytes",
  "productionPayloadMaximumBytes",
  "engineScenarioMaximumWallTimeMs",
];

export async function runPerformanceBudgets() {
  const startedAt = performance.now();
  const policy = await loadQualityGatePolicy();
  const paths = repositoryPaths(root);
  const engineScenario = await engineScenarioMeasurement(root);
  const observed = {
    ...shippedByteMeasurements(root, paths),
    engineScenarioExecutions: engineScenario.executions,
    engineScenarioWallTimeMs: engineScenario.wallTimeMs,
  };
  const findings = performanceBudgetFindings(policy, { performance: observed }, productMetrics);
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    policyId: policy.policyId,
    observed,
    runnerWallTimeMs: Math.ceil(performance.now() - startedAt),
    findings,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runPerformanceBudgets();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
