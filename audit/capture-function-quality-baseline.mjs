import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEW_FUNCTION_LIMITS,
  functionQualityCensus,
  functionQualityCensusFromUnits,
  javascriptUnitsFromLoader,
  sourceFileCensus,
} from "./lib/function-quality-metrics.mjs";
import { repositoryPaths } from "./lib/quality-budget-measurements.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "audit", "function-quality-baseline-v1.json");
const outputRelativePath = "audit/function-quality-baseline-v1.json";
const baselineCommit = "2078625b407d5189f579e94e716c86dce86ae90f";

function gitText(argumentsList, maxBuffer = 64 * 1024 * 1024) {
  return execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    windowsHide: true,
  });
}

function baselinePaths() {
  return gitText(["ls-tree", "-r", "--name-only", baselineCommit]).split(/\r?\n/u).filter(Boolean);
}

function baselineText(relativePath) {
  return gitText(["show", baselineCommit + ":" + relativePath]);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceSnapshot(rootPath, paths) {
  const files = sourceFileCensus(rootPath, paths);
  return Object.freeze({
    files: files.length,
    sha256: sha256(JSON.stringify(files.map((file) => [file.path, file.sha256]))),
  });
}

function rowProjection(row) {
  return Object.freeze({
    functionId: row.functionId,
    path: row.path,
    unit: row.unit,
    name: row.name,
    kind: row.kind,
    startLine: row.startLine,
    endLine: row.endLine,
    functionLines: row.functionLines,
    parameters: row.parameters,
    sourceSha256: row.sourceSha256,
    cyclomatic: row.cyclomatic,
    assignments: row.assignments,
    branches: row.branches,
    conditions: row.conditions,
    abcMagnitude: row.abcMagnitude,
    cognitive: row.cognitive,
    maxNesting: row.maxNesting,
    statements: row.statements,
    thresholdViolations: row.thresholdViolations,
  });
}

function censusSummary(census) {
  return Object.freeze({
    units: census.units,
    functions: census.functions,
    parseErrors: census.parseErrors,
    maxima: census.maxima,
    violationFunctions: census.violationFunctions,
    violationCounts: census.violationCounts,
  });
}

function changedRows(baseline, current) {
  const prior = new Map(baseline.rows.map((row) => [row.functionId, row]));
  return current.rows.filter((row) => prior.get(row.functionId)?.sourceSha256 !== row.sourceSha256);
}

function classification(baseline, current) {
  const prior = new Map(baseline.rows.map((row) => [row.functionId, row]));
  const currentIds = new Set(current.rows.map((row) => row.functionId));
  const changed = changedRows(baseline, current);
  const added = changed.filter((row) => !prior.has(row.functionId));
  const modified = changed.filter((row) => prior.has(row.functionId));
  const deleted = baseline.rows.filter((row) => !currentIds.has(row.functionId));
  const violating = changed.filter((row) => row.thresholdViolations.length);
  return Object.freeze({
    unchanged: current.rows.length - changed.length,
    added: added.length,
    modified: modified.length,
    deleted: deleted.length,
    newOrModified: changed.length,
    newOrModifiedViolations: violating.length,
    violatingRows: Object.freeze(violating.map(rowProjection)),
  });
}

export function captureFunctionQualityBaseline() {
  const currentPaths = repositoryPaths(root).filter((relativePath) => relativePath !== outputRelativePath);
  const immutablePaths = baselinePaths();
  const immutableUnits = javascriptUnitsFromLoader(immutablePaths, baselineText);
  const immutable = functionQualityCensusFromUnits(immutableUnits);
  const current = functionQualityCensus(root, currentPaths);
  return Object.freeze({
    schemaVersion: 1,
    artifactKind: "MATH_QUEST_FUNCTION_QUALITY_BASELINE_V1",
    baselineCommit,
    captureBoundary: "IMMUTABLE_BASELINE_COMMIT_PLUS_PRE_PRODUCTION_REFACTOR_WORKTREE",
    metricContract: immutable.contract,
    newOrMateriallyModifiedFunctionLimits: NEW_FUNCTION_LIMITS,
    immutableBaseline: Object.freeze({
      ...censusSummary(immutable),
      rows: Object.freeze(immutable.rows.map(rowProjection)),
    }),
    currentCheckpoint: Object.freeze({
      sourceSnapshot: sourceSnapshot(root, currentPaths),
      summary: censusSummary(current),
      classificationAgainstImmutableBaseline: classification(immutable, current),
    }),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = captureFunctionQualityBaseline();
  const json = JSON.stringify(report, null, 2) + "\n";
  if (process.argv.includes("--write")) await writeFile(outputPath, json, "utf8");
  process.stdout.write(JSON.stringify({
    artifactKind: report.artifactKind,
    baselineCommit: report.baselineCommit,
    immutableBaseline: report.immutableBaseline && {
      functions: report.immutableBaseline.functions,
      maxima: report.immutableBaseline.maxima,
      violationCounts: report.immutableBaseline.violationCounts,
    },
    currentCheckpoint: report.currentCheckpoint,
    outputPath: process.argv.includes("--write") ? path.relative(root, outputPath).replace(/\\/gu, "/") : null,
  }, null, 2) + "\n");
}
