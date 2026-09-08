import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureFunctionQualityBaseline } from "./capture-function-quality-baseline.mjs";
import {
  composeRefactorBaseline,
  configurationLintSuppressionInventory,
  lintSuppressionInventory,
  summarizeFileCensus,
  validateRefactorBaselineSchema,
  workMarkerInventory,
} from "./lib/refactor-baseline.mjs";
import { repositoryPaths } from "./lib/quality-budget-measurements.mjs";
import { loadSecurityGatePolicy } from "./lib/security-gate-policy.mjs";
import { markerSourceFiles } from "./lib/security-scans.mjs";
import { sourceFileCensus, sourceFileCensusFromLoader } from "./lib/function-quality-metrics.mjs";
import { measurePowershellFunctionQuality } from "./lib/powershell-function-quality.mjs";
import { runArchitectureGate } from "./run-architecture-gate.mjs";
import { runCoverage } from "./run-coverage.mjs";
import { runQualityGates } from "./run-quality-gates.mjs";
import { runSecurityDependencyGate } from "./run-security-dependency-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineCommit = "2078625b407d5189f579e94e716c86dce86ae90f";
const outputRelativePath = "audit/refactor-baseline-v2.json";
const functionArtifactRelativePath = "audit/function-quality-baseline-v1.json";
const excludedGeneratedPaths = Object.freeze([functionArtifactRelativePath, outputRelativePath]);
const lintSourceExtension = /\.(?:css|html|js|md|mjs|ps1|ya?ml)$/iu;

function progress(id, status) {
  if (process.argv.includes("--progress")) process.stderr.write(`REFACTOR_BASELINE_STAGE ${id} ${status}\n`);
}

async function stage(id, operation) {
  progress(id, "START");
  const result = await operation();
  progress(id, "PASS");
  return result;
}

function gitText(argumentsList, maxBuffer = 64 * 1024 * 1024) {
  return execFileSync("git", argumentsList, { cwd: root, encoding: "utf8", maxBuffer, windowsHide: true });
}

function baselinePaths() {
  return gitText(["ls-tree", "-r", "--name-only", baselineCommit]).split(/\r?\n/u).filter(Boolean);
}

function baselineText(relativePath) {
  return gitText(["show", `${baselineCommit}:${relativePath}`]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceSnapshotSha256(census) {
  return sha256(JSON.stringify(census.map((row) => [row.path, row.sha256])));
}

async function textSources(paths) {
  return Promise.all(paths.map(async (relativePath) => Object.freeze({
    path: relativePath,
    text: await readFile(path.join(root, ...relativePath.split("/")), "utf8"),
  })));
}

async function loadDefaultConfig(relativePath) {
  const moduleUrl = pathToFileURL(path.join(root, ...relativePath.split("/"))).href;
  return (await import(moduleUrl)).default;
}

function javascriptFunctionProjection(report) {
  const classification = report.currentCheckpoint.classificationAgainstImmutableBaseline;
  return Object.freeze({
    functions: report.immutableBaseline.functions,
    violationFunctions: report.immutableBaseline.violationFunctions,
    maxima: report.immutableBaseline.maxima,
    violationCounts: report.immutableBaseline.violationCounts,
    parseErrors: report.immutableBaseline.parseErrors,
    currentCheckpoint: report.currentCheckpoint.summary,
    currentClassification: Object.freeze({
      unchanged: classification.unchanged,
      added: classification.added,
      modified: classification.modified,
      deleted: classification.deleted,
      newOrModified: classification.newOrModified,
      newOrModifiedViolations: classification.newOrModifiedViolations,
    }),
  });
}

function stableCoverage(report) {
  return Object.freeze({
    status: report.status,
    provider: report.provider,
    calibrated: report.calibrated,
    branchPct: report.branchPct,
    linePct: report.linePct,
    functionPct: report.functionPct,
    branchTotal: report.branchTotal,
    branchCovered: report.branchCovered,
    engineSha256: report.engineSha256,
    exactBytes: report.exactBytes,
    structuredAuditValid: report.structuredAuditValid,
    testProcessStatus: report.testProcessStatus,
    testProcessTimedOut: report.testProcessTimedOut,
    testProcessOutputOverflow: report.testProcessOutputOverflow,
    testProcessCleanupVerified: report.testProcessCleanupVerified,
    structuredAuditIssues: Object.freeze(report.structuredAuditIssues),
    calibrationReasons: Object.freeze(report.calibration.reasons),
  });
}

function stableVulnerabilities(vulnerabilities = {}) {
  return Object.freeze(Object.fromEntries(["info", "low", "moderate", "high", "critical", "total"]
    .map((severity) => [severity, Number(vulnerabilities[severity] || 0)])));
}

function objectOrEmpty(value) {
  return value && typeof value === "object" ? value : {};
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

export function stableSecurity(report) {
  const observations = objectOrEmpty(report.observations);
  const semgrep = objectOrEmpty(observations.semgrep);
  const truffleHog = objectOrEmpty(observations.truffleHog);
  const worktree = objectOrEmpty(truffleHog.worktree);
  const history = objectOrEmpty(truffleHog.history);
  const dependencyAudit = objectOrEmpty(observations.dependencyAudit);
  const artifactCache = objectOrEmpty(report.artifactCache);
  const negativeControls = arrayOrEmpty(observations.negativeControls);
  return Object.freeze({
    status: report.status,
    verifiedArtifacts: numberOrZero(artifactCache.verifiedArtifacts),
    semgrepPlannedTargets: numberOrZero(semgrep.plannedTargets),
    semgrepScannedTargets: numberOrZero(semgrep.scannedTargets),
    semgrepFindings: arrayOrEmpty(semgrep.findings).length,
    semgrepErrors: arrayOrEmpty(semgrep.errors).length,
    worktreeSecrets: arrayOrEmpty(worktree.findings).length,
    historySecrets: arrayOrEmpty(history.findings).length,
    vulnerabilities: stableVulnerabilities(dependencyAudit.vulnerabilities),
    negativeControlsPassed: negativeControls.length > 0 && negativeControls.every((control) => control.passed),
  });
}

function stableLint(quality) {
  return Object.freeze({
    eslintErrors: quality.observed.eslintErrors,
    eslintWarningsByRule: quality.observed.eslintWarningsByRule,
    markdownlintFindings: quality.observed.markdownlintFindings,
    stylelintFindings: quality.observed.stylelintFindings,
  });
}

function suppressionInventory(inline, configuration) {
  return Object.freeze({
    total: inline.total + configuration.total,
    unexplained: inline.unexplained + configuration.unexplained,
    inline,
    configuration,
  });
}

function dependencyInventory(packageJson, packageLock) {
  return Object.freeze({
    directDevelopmentDependencies: Object.keys(packageJson.devDependencies || {}).length,
    lockfilePackages: Math.max(0, Object.keys(packageLock.packages || {}).length - 1),
  });
}

function stablePerformance(quality, policy) {
  const observed = quality.observed.performance;
  return Object.freeze({
    measurements: Object.freeze({
      stylesheetBytes: observed.stylesheetBytes,
      javascriptBytes: observed.javascriptBytes,
      compiledAssetBytes: observed.compiledAssetBytes,
      productionPayloadBytes: observed.productionPayloadBytes,
      engineScenarioExecutions: observed.engineScenarioExecutions,
      engineScenarioWallTimeMs: observed.engineScenarioWallTimeMs,
      qualityGateWallTimeMs: observed.qualityGateWallTimeMs,
    }),
    budgets: Object.freeze({ ...policy.performanceBudgets }),
    findings: Object.freeze(quality.findings.filter((finding) => /bytes|walltime|performance|budget/iu.test(finding))),
  });
}

function sourceBudgetFindings(quality) {
  return Object.freeze(quality.findings.filter((finding) => /\blines?\b|source-file|source line|ratchet/iu.test(finding)));
}

async function functionArtifact() {
  const report = captureFunctionQualityBaseline();
  const bytes = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(path.join(root, ...functionArtifactRelativePath.split("/")), bytes, "utf8");
  return Object.freeze({ report, sha256: sha256(bytes) });
}

async function sourceInventories(paths) {
  const currentCensus = sourceFileCensus(root, paths);
  const immutableCensus = sourceFileCensusFromLoader(baselinePaths(), baselineText);
  const lintSources = await textSources(paths.filter((relativePath) => lintSourceExtension.test(relativePath)));
  const markerSources = await textSources(markerSourceFiles(paths));
  return Object.freeze({
    currentCensus,
    immutableFiles: summarizeFileCensus(immutableCensus),
    currentFiles: summarizeFileCensus(currentCensus),
    lintSources,
    markerSources,
  });
}

async function repositoryMeasurementContext() {
  const tracked = (await stage("repository-inventory", () => repositoryPaths(root)))
    .filter((relativePath) => !excludedGeneratedPaths.includes(relativePath));
  const inventories = await stage("source-inventories", () => sourceInventories(tracked));
  const functions = await stage("function-quality", async () => Object.freeze({
    javascript: await functionArtifact(),
    powershell: measurePowershellFunctionQuality(root, tracked),
  }));
  const [eslintConfig, stylelintConfig] = await Promise.all([
    loadDefaultConfig("eslint.config.mjs"),
    loadDefaultConfig("stylelint.config.mjs"),
  ]);
  const markdownlintConfig = JSON.parse(await readFile(path.join(root, ".markdownlint-cli2.jsonc"), "utf8"));
  const inlineSuppressions = lintSuppressionInventory(inventories.lintSources);
  const configuredSuppressions = configurationLintSuppressionInventory({ eslintConfig, stylelintConfig, markdownlintConfig });
  const securityPolicy = await loadSecurityGatePolicy();
  return Object.freeze({ tracked, inventories, functions, inlineSuppressions, configuredSuppressions, securityPolicy });
}

async function externalMeasurementContext() {
  const coverage = await stage("coverage", () => runCoverage({ nodePath: process.execPath }));
  return Object.freeze({
    quality: await stage("quality-measurements", () => runQualityGates({
      engineBranchCoveragePercent: coverage.branchPct,
    })),
    coverage,
    architecture: await stage("architecture", () => runArchitectureGate()),
    security: await stage("security", () => runSecurityDependencyGate()),
  });
}

async function dependencyRecords() {
  const [packageJson, packageLock, qualityPolicy] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "package-lock.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "audit", "quality-gate-policy-v1.json"), "utf8").then(JSON.parse),
  ]);
  return Object.freeze({ packageJson, packageLock, qualityPolicy });
}

function baselineInput(repository, external, dependencies) {
  const { tracked, inventories, functions, inlineSuppressions, configuredSuppressions, securityPolicy } = repository;
  const { quality, coverage, architecture, security } = external;
  const report = composeRefactorBaseline({
    baselineCommit,
    sourceSnapshotSha256: sourceSnapshotSha256(inventories.currentCensus),
    captureInventory: Object.freeze({
      trackedPaths: tracked.length,
      sourceFiles: inventories.currentFiles.files,
      excludedGeneratedPaths,
    }),
    functionArtifactSha256: functions.javascript.sha256,
    javascriptFunctions: javascriptFunctionProjection(functions.javascript.report),
    powershellFunctions: functions.powershell,
    immutableFiles: inventories.immutableFiles,
    currentFiles: inventories.currentFiles,
    sourceBudgetFindings: sourceBudgetFindings(quality),
    lint: stableLint(quality),
    lintSuppressions: suppressionInventory(inlineSuppressions, configuredSuppressions),
    coverage: stableCoverage(coverage),
    deadCode: quality.observed.knip,
    markers: workMarkerInventory(inventories.markerSources, securityPolicy.markers),
    performance: stablePerformance(quality, dependencies.qualityPolicy),
    architecture,
    security: stableSecurity(security),
    dependencyInventory: dependencyInventory(dependencies.packageJson, dependencies.packageLock),
    sizeFindings: quality.findings.filter((finding) => /bytes|walltime|performance|budget/iu.test(finding)),
  });
  return report;
}

export async function captureRefactorBaseline() {
  const repository = await repositoryMeasurementContext();
  const external = await externalMeasurementContext();
  const dependencies = await dependencyRecords();
  const report = baselineInput(repository, external, dependencies);
  const schemaIssues = await validateRefactorBaselineSchema(report);
  if (schemaIssues.length) throw new Error(`Refactor baseline violates its closed schema:\n- ${schemaIssues.join("\n- ")}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await captureRefactorBaseline();
  if (process.argv.includes("--write")) {
    await writeFile(path.join(root, ...outputRelativePath.split("/")), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    artifactKind: report.artifactKind,
    checkpoint: report.checkpoint,
    status: report.status,
    openFindingCategories: report.openFindingCategories,
    outputPath: process.argv.includes("--write") ? outputRelativePath : null,
  }, null, 2)}\n`);
}
