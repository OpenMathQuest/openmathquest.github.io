import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { functionQualityCensus } from "./lib/function-quality-metrics.mjs";
import { loadFunctionQualityBaselineArtifacts } from "./lib/inline-function-quality-baseline.mjs";
import { measurePowershellFunctionQuality } from "./lib/powershell-function-quality.mjs";
import { repositoryPaths } from "./lib/quality-budget-measurements.mjs";
import { loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metrics = Object.freeze(["cyclomatic", "abcMagnitude", "cognitive", "functionLines", "maxNesting"]);
const languages = Object.freeze(["javascript", "javascriptInlineHtml", "powershell"]);

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseFindings(language, census) {
  if (!Array.isArray(census?.parseErrors)) return [`${language} parse-error inventory is missing`];
  return census.parseErrors.map((error) => `${language} parse error in ${error.unit || error.path || "unknown"}`);
}

function newFunctionFindings(language, row, limits) {
  return metrics
    .filter((metric) => row[metric] > limits[metric])
    .map((metric) => `${language} new function ${row.functionId} has ${metric} ${row[metric]}, above ${limits[metric]}`);
}

function legacyFunctionFindings(language, previous, row) {
  const findings = metrics
    .filter((metric) => row[metric] > previous[metric])
    .map((metric) => `${language} legacy function ${row.functionId} regressed ${metric} from ${previous[metric]} to ${row[metric]}`);
  if (previous.sourceSha256 === row.sourceSha256 && metrics.some((metric) => previous[metric] !== row[metric])) {
    findings.push(`${language} function ${row.functionId} changed metrics without changing its source digest`);
  }
  return findings;
}

function groupedRows(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function uniqueSourceRows(rows) {
  return new Map(
    [...groupedRows(rows, (row) => row.sourceSha256)]
      .filter(([, candidates]) => candidates.length === 1)
      .map(([digest, candidates]) => [digest, candidates[0]]),
  );
}

function structuralIdentity(row) {
  return JSON.stringify([row.path, row.name, row.kind]);
}

function uniqueStructuralRows(rows) {
  return new Map(
    [...groupedRows(rows, structuralIdentity)]
      .filter(([, candidates]) => candidates.length === 1)
      .map(([identity, candidates]) => [identity, candidates[0]]),
  );
}

function available(row, claimed) {
  if (!row) return false;
  return !claimed.has(row);
}

function stableDeclaredIdentity(row) {
  return typeof row.name === "string" && !row.name.includes(".callback");
}

function nearbyExactIdentity(row, exact) {
  if (!exact) return false;
  if (row.path !== exact.path || row.unit !== exact.unit) return false;
  if (row.name !== exact.name || row.kind !== exact.kind) return false;
  if (Math.abs(Number(row.startLine) - Number(exact.startLine)) <= 2) return true;
  return metrics.every((metric) => row[metric] === exact[metric]);
}

function monotonicStructuralIdentity(row, candidate) {
  if (!candidate || structuralIdentity(row) !== structuralIdentity(candidate)) return false;
  return metrics.every((metric) => row[metric] <= candidate[metric]);
}

function baselineRowFor(row, matcher) {
  const exact = matcher.byId.get(row.functionId);
  if (available(exact, matcher.claimed)) {
    if (exact.sourceSha256 === row.sourceSha256) return exact;
  }
  const sameSource = matcher.uniqueSource.get(row.sourceSha256);
  if (available(sameSource, matcher.claimed)) return sameSource;
  if (stableDeclaredIdentity(row) && available(exact, matcher.claimed)) return exact;
  if (nearbyExactIdentity(row, exact) && available(exact, matcher.claimed)) return exact;
  const sameStructure = matcher.uniqueStructure.get(structuralIdentity(row));
  if (monotonicStructuralIdentity(row, sameStructure) && available(sameStructure, matcher.claimed)) return sameStructure;
  return null;
}

function baselineMatcher(rows) {
  return {
    byId: new Map(rows.map((row) => [row.functionId, row])),
    uniqueSource: uniqueSourceRows(rows),
    uniqueStructure: uniqueStructuralRows(rows),
    claimed: new Set(),
  };
}

function changedFunctionFindings(language, baseline, current, limits) {
  if (!Array.isArray(baseline?.rows)) return [`${language} function baseline rows are missing`];
  if (!Array.isArray(current?.rows)) return [`${language} current function rows are missing`];
  const matcher = baselineMatcher(baseline.rows);
  return current.rows.flatMap((row) => {
    const previous = baselineRowFor(row, matcher);
    if (previous) matcher.claimed.add(previous);
    return previous ? legacyFunctionFindings(language, previous, row) : newFunctionFindings(language, row, limits);
  });
}

function ratchetFindings(language, counts, ceilings) {
  const findings = [];
  for (const metric of metrics) {
    const actual = counts?.[metric];
    const ceiling = ceilings?.[metric];
    if (!Number.isSafeInteger(actual) || actual < 0) findings.push(`${language} ${metric} violation count is missing or invalid`);
    else if (actual > ceiling) findings.push(`${language} ${metric} legacy violations increased from ${ceiling} to ${actual}`);
    else if (actual < ceiling) findings.push(`${language} ${metric} legacy violations improved to ${actual}; tighten stale ratchet ${ceiling}`);
  }
  return findings;
}

export function functionQualityGateFindings(policy, baseline, current) {
  const contract = policy.analysisRatchets.functionQuality;
  const findings = [];
  for (const language of languages) {
    if (!sameJson(current[language]?.limits, contract.newOrMateriallyModifiedLimits)) {
      findings.push(`${language} function limits do not match the canonical hard limits`);
    }
    findings.push(...parseFindings(language, current[language]));
    findings.push(...changedFunctionFindings(
      language, baseline[language], current[language], contract.newOrMateriallyModifiedLimits,
    ));
    findings.push(...ratchetFindings(
      language, current[language]?.violationCounts, contract.legacyViolationCeilings[language],
    ));
  }
  return Object.freeze(findings);
}

function cleanCensus() {
  const violationCounts = Object.fromEntries(metrics.map((metric) => [metric, 0]));
  return { limits: {}, parseErrors: [], rows: [], violationCounts };
}

function mutationRejected(policy, mutate) {
  const baseline = { javascript: cleanCensus(), javascriptInlineHtml: cleanCensus(), powershell: cleanCensus() };
  const current = structuredClone(baseline);
  for (const language of Object.keys(current)) {
    current[language].limits = structuredClone(policy.analysisRatchets.functionQuality.newOrMateriallyModifiedLimits);
  }
  mutate(current, baseline);
  return functionQualityGateFindings(policy, baseline, current).length > 0;
}

export function functionQualityGateMutationFailures(policy) {
  const failures = [];
  const run = (label, mutate) => {
    if (!mutationRejected(policy, mutate)) failures.push(`function-quality negative control did not reject ${label}`);
  };
  run("a changed cyclomatic violation", (current) => {
    current.javascript.rows.push({ functionId: "mutant#1", sourceSha256: "new", cyclomatic: 11, abcMagnitude: 0, cognitive: 0, functionLines: 1, maxNesting: 0 });
  });
  run("a legacy violation increase", (current) => { current.javascript.violationCounts.cyclomatic = 1; });
  run("a parse failure", (current) => { current.powershell.parseErrors.push({ path: "mutant.ps1" }); });
  run("altered hard limits", (current) => { current.javascript.limits.cyclomatic = 11; });
  return Object.freeze(failures);
}

function javascriptCensusScope(census, inlineHtml) {
  const rows = census.rows.filter((row) => row.unit.includes("#inline-script-") === inlineHtml);
  const parseErrors = census.parseErrors.filter((error) => error.unit.includes("#inline-script-") === inlineHtml);
  return Object.freeze({
    limits: census.limits,
    parseErrors: Object.freeze(parseErrors),
    rows: Object.freeze(rows),
    functions: rows.length,
    violationCounts: Object.freeze(Object.fromEntries(metrics.map((metric) => [
      metric,
      rows.filter((row) => row[metric] > census.limits[metric]).length,
    ]))),
  });
}

async function loadBaselines(policy) {
  const [artifacts, refactorArtifact] = await Promise.all([
    loadFunctionQualityBaselineArtifacts(policy),
    readFile(path.join(root, "audit", "refactor-baseline-v2.json"), "utf8").then(JSON.parse),
  ]);
  return Object.freeze({
    baselines: Object.freeze({
      javascript: artifacts.primary.immutableBaseline,
      javascriptInlineHtml: artifacts.correction.immutableInlineHtmlBaseline,
      powershell: refactorArtifact.functionQuality.powershell,
    }),
    findings: artifacts.findings,
  });
}

export async function runFunctionQualityGate() {
  const policy = await loadQualityGatePolicy();
  const paths = repositoryPaths(root);
  const javascript = functionQualityCensus(root, paths);
  const current = Object.freeze({
    javascript: javascriptCensusScope(javascript, false),
    javascriptInlineHtml: javascriptCensusScope(javascript, true),
    powershell: measurePowershellFunctionQuality(root, paths),
  });
  const baseline = await loadBaselines(policy);
  const findings = [
    ...baseline.findings,
    ...functionQualityGateFindings(policy, baseline.baselines, current),
    ...functionQualityGateMutationFailures(policy),
  ];
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    policyId: policy.policyId,
    observed: Object.freeze({
      javascript: Object.freeze({ functions: current.javascript.functions, violationCounts: current.javascript.violationCounts }),
      javascriptInlineHtml: Object.freeze({
        functions: current.javascriptInlineHtml.functions,
        violationCounts: current.javascriptInlineHtml.violationCounts,
      }),
      powershell: Object.freeze({ functions: current.powershell.functions, violationCounts: current.powershell.violationCounts }),
    }),
    findings: Object.freeze(findings),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runFunctionQualityGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
