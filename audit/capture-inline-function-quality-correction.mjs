import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEW_FUNCTION_LIMITS,
  functionQualityCensusFromUnits,
  javascriptUnitsFromLoader,
} from "./lib/function-quality-metrics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineCommit = "2078625b407d5189f579e94e716c86dce86ae90f";
const correctedArtifactPath = "audit/function-quality-baseline-v1.json";
const outputPath = path.join(root, "audit", "inline-function-quality-baseline-correction-v1.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitText(argumentsList, maxBuffer = 64 * 1024 * 1024) {
  return execFileSync("git", argumentsList, {
    cwd: root,
    encoding: "utf8",
    maxBuffer,
    windowsHide: true,
  });
}

function baselineHtmlPaths() {
  return gitText(["ls-tree", "-r", "--name-only", baselineCommit])
    .split(/\r?\n/u)
    .filter((relativePath) => relativePath.endsWith(".html"));
}

function baselineText(relativePath) {
  return gitText(["show", baselineCommit + ":" + relativePath]);
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

function censusProjection(census) {
  return Object.freeze({
    units: census.units,
    functions: census.functions,
    parseErrors: census.parseErrors,
    maxima: census.maxima,
    violationFunctions: census.violationFunctions,
    violationCounts: census.violationCounts,
    rows: Object.freeze(census.rows.map(rowProjection)),
  });
}

export async function captureInlineFunctionQualityCorrection() {
  const originalBytes = await readFile(path.join(root, ...correctedArtifactPath.split("/")));
  const original = JSON.parse(originalBytes.toString("utf8"));
  const htmlPaths = baselineHtmlPaths();
  const units = javascriptUnitsFromLoader(htmlPaths, baselineText);
  const census = functionQualityCensusFromUnits(units);
  if (census.parseErrors.length || census.units === 0 || census.functions === 0) {
    throw new Error("The additive inline-HTML function baseline correction is incomplete.");
  }
  return Object.freeze({
    schemaVersion: 1,
    artifactKind: "MATH_QUEST_INLINE_FUNCTION_QUALITY_BASELINE_CORRECTION_V1",
    baselineCommit,
    captureBoundary: "ADDITIVE_R0_CORRECTION_FOR_EXECUTABLE_INLINE_HTML",
    correctsArtifact: Object.freeze({
      path: correctedArtifactPath,
      sha256: sha256(originalBytes),
      immutableUnits: original.immutableBaseline.units,
      immutableFunctions: original.immutableBaseline.functions,
    }),
    omissionEvidence: Object.freeze({
      reason: "ESLINT_VIRTUAL_HTML_FILENAME_WAS_IGNORED_WITHOUT_A_PARSE_ERROR",
      originalInlineHtmlRows: original.immutableBaseline.rows.filter((row) => row.unit.includes("#inline-script-")).length,
      correctedHtmlPaths: Object.freeze(htmlPaths),
    }),
    metricContract: census.contract,
    newOrMateriallyModifiedFunctionLimits: NEW_FUNCTION_LIMITS,
    immutableInlineHtmlBaseline: censusProjection(census),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await captureInlineFunctionQualityCorrection();
  if (process.argv.includes("--write")) {
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  process.stdout.write(JSON.stringify({
    artifactKind: report.artifactKind,
    baselineCommit: report.baselineCommit,
    correctsArtifact: report.correctsArtifact,
    omissionEvidence: report.omissionEvidence,
    immutableInlineHtmlBaseline: {
      units: report.immutableInlineHtmlBaseline.units,
      functions: report.immutableInlineHtmlBaseline.functions,
      maxima: report.immutableInlineHtmlBaseline.maxima,
      violationCounts: report.immutableInlineHtmlBaseline.violationCounts,
    },
    outputPath: process.argv.includes("--write")
      ? path.relative(root, outputPath).replace(/\\/gu, "/")
      : null,
  }, null, 2) + "\n");
}
