import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadArchitecturePolicy } from "./lib/architecture-policy.mjs";
import { functionQualityCensus } from "./lib/function-quality-metrics.mjs";
import { loadFunctionQualityBaselineArtifacts } from "./lib/inline-function-quality-baseline.mjs";
import { measurePowershellFunctionQuality } from "./lib/powershell-function-quality.mjs";
import { repositoryPaths } from "./lib/quality-budget-measurements.mjs";
import { loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";
import { loadSecurityGatePolicy } from "./lib/security-gate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errorChannels = Object.freeze([
  "javascriptParseErrors",
  "powershellParseErrors",
  "jsonParseErrors",
  "policyValidationErrors",
]);

export function compilerContractFindings(observed) {
  const findings = [];
  if (observed?.eslintStatus !== 0) findings.push(`ESLint compiler pass exited ${String(observed?.eslintStatus)}`);
  for (const channel of errorChannels) {
    const errors = observed?.[channel];
    if (!Array.isArray(errors)) findings.push(`${channel} inventory is missing`);
    else findings.push(...errors.map((error) => `${channel}: ${typeof error === "string" ? error : JSON.stringify(error)}`));
  }
  return Object.freeze(findings);
}

function mutationRejected(mutate) {
  const observed = {
    eslintStatus: 0,
    javascriptParseErrors: [],
    powershellParseErrors: [],
    jsonParseErrors: [],
    policyValidationErrors: [],
  };
  mutate(observed);
  return compilerContractFindings(observed).length > 0;
}

export function compilerContractMutationFailures() {
  const failures = [];
  const run = (label, mutate) => {
    if (!mutationRejected(mutate)) failures.push(`compiler-contract negative control did not reject ${label}`);
  };
  run("an ESLint parse failure", (observed) => { observed.eslintStatus = 1; });
  for (const channel of errorChannels) {
    run(channel, (observed) => { observed[channel].push("fixture failure"); });
  }
  return Object.freeze(failures);
}

function eslintCompilerStatus() {
  const executable = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(process.execPath, [executable, ".", "--quiet"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return Object.freeze({ status: result.status, output: result.stderr || result.stdout });
}

async function jsonParseErrors(paths) {
  const errors = [];
  for (const relativePath of paths.filter((item) => item.endsWith(".json"))) {
    try {
      JSON.parse(await readFile(path.join(root, ...relativePath.split("/")), "utf8"));
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }
  return Object.freeze(errors);
}

async function policyValidationErrors() {
  const qualityPolicy = loadQualityGatePolicy();
  const settled = await Promise.allSettled([
    loadArchitecturePolicy(),
    qualityPolicy,
    qualityPolicy.then(async (policy) => {
      const artifacts = await loadFunctionQualityBaselineArtifacts(policy);
      if (artifacts.findings.length) throw new Error(artifacts.findings.join("; "));
    }),
    loadSecurityGatePolicy(),
  ]);
  return Object.freeze(settled.filter((result) => result.status === "rejected").map((result) => String(result.reason)));
}

export async function runCompilerContracts() {
  const paths = repositoryPaths(root);
  const javascript = functionQualityCensus(root, paths);
  const powershell = measurePowershellFunctionQuality(root, paths);
  const eslint = eslintCompilerStatus();
  const observed = Object.freeze({
    eslintStatus: eslint.status,
    javascriptParseErrors: javascript.parseErrors,
    powershellParseErrors: powershell.parseErrors,
    jsonParseErrors: await jsonParseErrors(paths),
    policyValidationErrors: await policyValidationErrors(),
  });
  const findings = [...compilerContractFindings(observed), ...compilerContractMutationFailures()];
  if (eslint.status !== 0 && eslint.output) findings.push(eslint.output.trim());
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    observed: Object.freeze({
      javascriptUnits: javascript.units,
      powershellFiles: powershell.files,
      jsonFiles: paths.filter((item) => item.endsWith(".json")).length,
    }),
    findings: Object.freeze(findings),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runCompilerContracts();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
