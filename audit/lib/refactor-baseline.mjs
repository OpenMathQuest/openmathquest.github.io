const trackingReference = /(?:https:\/\/[^\s]+|#[1-9]\d*|[A-Z][A-Z0-9]+-[1-9]\d*)/u;
const suppressionExplanation = /--\s*\S/u;
const suppressionKinds = Object.freeze([
  Object.freeze({ kind: "ESLINT", pattern: /\beslint-disable(?:-line|-next-line)?\b/gu }),
  Object.freeze({ kind: "MARKDOWNLINT", pattern: /\bmarkdownlint-(?:disable|disable-file)\b/gu }),
  Object.freeze({ kind: "STYLELINT", pattern: /\bstylelint-disable(?:-line|-next-line)?\b/gu }),
]);

function schemaIssue(error) {
  return `${error.instancePath || "/"} ${error.message || "is invalid"}`;
}

export async function validateRefactorBaselineSchema(report, schemaUrl = new URL("../schemas/refactor-baseline-v2.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return Object.freeze(validate(report) ? [] : (validate.errors || []).map(schemaIssue));
}

function countBy(records, field) {
  const counts = {};
  for (const record of records) counts[record[field]] = (counts[record[field]] || 0) + 1;
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en"))));
}

function suppressionRecords(source) {
  const records = [];
  const lines = String(source.text).split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    for (const control of suppressionKinds) {
      control.pattern.lastIndex = 0;
      if (!control.pattern.test(lines[index])) continue;
      records.push(Object.freeze({
        path: source.path,
        line: index + 1,
        kind: control.kind,
        explained: suppressionExplanation.test(lines[index]) && trackingReference.test(lines[index]),
      }));
    }
  }
  return records;
}

export function lintSuppressionInventory(sources) {
  const records = sources.flatMap(suppressionRecords)
    .sort((left, right) => left.path.localeCompare(right.path, "en") || left.line - right.line || left.kind.localeCompare(right.kind, "en"));
  return Object.freeze({
    total: records.length,
    unexplained: records.filter((record) => !record.explained).length,
    byKind: countBy(records, "kind"),
    records: Object.freeze(records),
  });
}

function configurationRecord(path, kind, selector) {
  return Object.freeze({ path, kind, selector, explained: false });
}

function eslintConfigurationSuppressions(config) {
  return config.flatMap((entry) => (entry.ignores || []).map((selector) => (
    configurationRecord("eslint.config.mjs", "CONFIG_EXCLUSION", selector)
  )));
}

function stylelintConfigurationSuppressions(config) {
  const exclusions = (config.ignoreFiles || []).map((selector) => (
    configurationRecord("stylelint.config.mjs", "CONFIG_EXCLUSION", selector)
  ));
  const disabled = Object.entries(config.rules || {})
    .filter(([, value]) => value === null || value === false || value === 0 || value === "off")
    .map(([selector]) => configurationRecord("stylelint.config.mjs", "CONFIG_RULE_DISABLED", selector));
  return [...exclusions, ...disabled];
}

function markdownlintConfigurationSuppressions(config) {
  const records = (config.globs || []).filter((selector) => selector.startsWith("!"))
    .map((selector) => configurationRecord(".markdownlint-cli2.jsonc", "CONFIG_EXCLUSION", selector));
  if (config.config?.default === false) records.push(configurationRecord(
    ".markdownlint-cli2.jsonc", "CONFIG_DEFAULT_DISABLED", "default",
  ));
  for (const [selector, value] of Object.entries(config.config || {})) {
    if (selector !== "default" && value === false) records.push(configurationRecord(
      ".markdownlint-cli2.jsonc", "CONFIG_RULE_DISABLED", selector,
    ));
  }
  return records;
}

export function configurationLintSuppressionInventory({ eslintConfig, stylelintConfig, markdownlintConfig }) {
  const records = [
    ...eslintConfigurationSuppressions(eslintConfig),
    ...stylelintConfigurationSuppressions(stylelintConfig),
    ...markdownlintConfigurationSuppressions(markdownlintConfig),
  ].sort((left, right) => left.path.localeCompare(right.path, "en")
    || left.kind.localeCompare(right.kind, "en") || left.selector.localeCompare(right.selector, "en"));
  return Object.freeze({
    total: records.length,
    unexplained: records.filter((record) => !record.explained).length,
    byKind: countBy(records, "kind"),
    records: Object.freeze(records),
  });
}

function markerRecords(source, policy) {
  const tokenPattern = new RegExp("\\b(" + policy.tokens.join("|") + ")\\b", "gu");
  const tracking = new RegExp(policy.trackingReferencePattern, "u");
  const explanation = new RegExp(policy.explanationPattern, "u");
  const records = [];
  const lines = String(source.text).split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const tokens = [...lines[index].matchAll(tokenPattern)].map((match) => match[1]);
    if (!tokens.length) continue;
    records.push(Object.freeze({
      path: source.path,
      line: index + 1,
      tokens: Object.freeze(tokens),
      tracked: tracking.test(lines[index]) && explanation.test(lines[index]),
    }));
  }
  return records;
}

export function workMarkerInventory(sources, policy) {
  const records = sources.flatMap((source) => markerRecords(source, policy))
    .sort((left, right) => left.path.localeCompare(right.path, "en") || left.line - right.line);
  return Object.freeze({
    total: records.length,
    untracked: records.filter((record) => !record.tracked).length,
    records: Object.freeze(records),
  });
}

function maximum(records, field) {
  return records.reduce((value, record) => Math.max(value, record[field]), 0);
}

export function summarizeFileCensus(records) {
  const rows = [...records].sort((left, right) => left.path.localeCompare(right.path, "en"));
  return Object.freeze({
    files: rows.length,
    lines: rows.reduce((total, row) => total + row.lines, 0),
    bytes: rows.reduce((total, row) => total + row.bytes, 0),
    maxima: Object.freeze({ lines: maximum(rows, "lines"), bytes: maximum(rows, "bytes") }),
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
  });
}

function sumValues(record = {}) {
  return Object.values(record).reduce((total, value) => total + Number(value || 0), 0);
}

function functionQualityIsOpen(input) {
  return input.javascriptFunctions.violationFunctions > 0
    || input.powershellFunctions.violationFunctions > 0
    || input.javascriptFunctions.parseErrors.length > 0
    || input.powershellFunctions.parseErrors.length > 0;
}

function lintIsOpen(input) {
  return input.lint.eslintErrors > 0
    || sumValues(input.lint.eslintWarningsByRule) > 0
    || input.lint.markdownlintFindings > 0
    || input.lint.stylelintFindings > 0
    || input.lintSuppressions.unexplained > 0;
}

function deadCodeIsOpen(input) {
  return Object.values(input.deadCode).some((value) => Number(value || 0) > 0);
}

function securityIsOpen(security) {
  const closedConditions = [
    security.status === "PASS",
    security.verifiedArtifacts > 0,
    security.semgrepPlannedTargets > 0,
    security.semgrepScannedTargets === security.semgrepPlannedTargets,
    security.semgrepFindings === 0,
    security.semgrepErrors === 0,
    security.worktreeSecrets === 0,
    security.historySecrets === 0,
    Number(security.vulnerabilities?.total || 0) === 0,
    security.negativeControlsPassed === true,
  ];
  return closedConditions.some((condition) => !condition);
}

const findingCategoryChecks = Object.freeze([
  Object.freeze(["architecture", (input) => input.architecture.status !== "PASS" || input.architecture.findings.length > 0]),
  Object.freeze(["complexity", functionQualityIsOpen]),
  Object.freeze(["coverage", (input) => input.coverage.status !== "PASS" || input.coverage.branchPct < 80]),
  Object.freeze(["dead-code", deadCodeIsOpen]),
  Object.freeze(["lint", lintIsOpen]),
  Object.freeze(["markers", (input) => input.markers.untracked > 0]),
  Object.freeze(["security", (input) => securityIsOpen(input.security)]),
  Object.freeze(["sizes", (input) => (input.sizeFindings?.length || 0) > 0 || (input.sourceBudgetFindings?.length || 0) > 0]),
]);

function openFindingCategories(input) {
  return Object.freeze(findingCategoryChecks.filter(([, matches]) => matches(input)).map(([category]) => category).sort());
}

export function composeRefactorBaseline(input) {
  const categories = openFindingCategories(input);
  return Object.freeze({
    schemaVersion: 2,
    artifactKind: "MATH_QUEST_REFACTOR_BASELINE_V2",
    checkpoint: "R0",
    status: "BASELINE_RECORDED_WITH_FINDINGS",
    baselineCommit: input.baselineCommit,
    captureBoundary: "WHOLE_TRACKED_CODEBASE_BEFORE_STRUCTURAL_PRODUCT_REFACTOR",
    sourceSnapshotSha256: input.sourceSnapshotSha256,
    captureInventory: input.captureInventory || Object.freeze({
      trackedPaths: input.currentFiles.files,
      sourceFiles: input.currentFiles.files,
      excludedGeneratedPaths: Object.freeze(["audit/refactor-baseline-v2.json"]),
    }),
    hardGateContract: Object.freeze({
      cyclomaticMaximum: 10,
      meaningfulCoverageMinimumPercent: 80,
      zeroLintErrors: true,
      zeroLintWarningsFinishLine: true,
      noUnexplainedLintSuppressions: true,
      noUntrackedWorkMarkers: true,
      noSecurityOrDependencyFindings: true,
      legacyRatchetsMayOnlyDecrease: true,
    }),
    functionQuality: Object.freeze({
      javascriptArtifact: "audit/function-quality-baseline-v1.json",
      javascriptArtifactSha256: input.functionArtifactSha256,
      javascript: input.javascriptFunctions,
      powershell: input.powershellFunctions,
    }),
    files: Object.freeze({
      immutableBaseline: input.immutableFiles,
      currentCheckpoint: input.currentFiles,
      sourceBudgetFindings: Object.freeze(input.sourceBudgetFindings || []),
    }),
    lint: input.lint,
    lintSuppressions: input.lintSuppressions,
    coverage: Object.freeze({
      scope: "EXACT_SHIPPED_ENGINE_NATIVE_V8_BRANCH_LINE_AND_FUNCTION_COVERAGE",
      wholeRepositoryInstrumentationStatus: "NOT_AVAILABLE_AT_R0",
      meaningfulMinimumPercent: 80,
      ...input.coverage,
    }),
    deadCodeAndDependencies: input.deadCode,
    workMarkers: input.markers,
    shippedSizes: input.performance || Object.freeze({
      measurements: input.sizes,
      budgets: Object.freeze({}),
      findings: Object.freeze(input.sizeFindings || []),
    }),
    architecture: input.architecture,
    security: input.security,
    dependencyInventory: input.dependencyInventory,
    openFindingCategories: categories,
  });
}
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
