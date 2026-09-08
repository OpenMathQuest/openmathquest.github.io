import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  composeRefactorBaseline,
  configurationLintSuppressionInventory,
  lintSuppressionInventory,
  summarizeFileCensus,
  validateRefactorBaselineSchema,
  workMarkerInventory,
} from "../lib/refactor-baseline.mjs";
import { stableSecurity } from "../capture-refactor-baseline.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/u, ""));
const powershellMetricScript = path.join(root, "audit", "measure-powershell-function-quality.ps1");
const todoToken = ["TO", "DO"].join("");
const fixmeToken = ["FIX", "ME"].join("");
const hackToken = ["HA", "CK"].join("");

function minimalBaselineInput(overrides = {}) {
  return {
    baselineCommit: "a".repeat(40),
    sourceSnapshotSha256: "b".repeat(64),
    functionArtifactSha256: "c".repeat(64),
    javascriptFunctions: { functions: 1, violationFunctions: 1, maxima: {}, violationCounts: {}, parseErrors: [] },
    powershellFunctions: { functions: 0, violationFunctions: 0, maxima: {}, violationCounts: {}, parseErrors: [], rows: [] },
    immutableFiles: { files: 1, lines: 10, bytes: 100, maxima: {}, rows: [] },
    currentFiles: { files: 1, lines: 10, bytes: 100, maxima: {}, rows: [] },
    lint: { eslintErrors: 0, eslintWarningsByRule: { complexity: 1 }, markdownlintFindings: 0, stylelintFindings: 0 },
    lintSuppressions: { total: 0, unexplained: 0, records: [] },
    coverage: { status: "PASS", branchPct: 88, linePct: 90, functionPct: 100 },
    deadCode: { unusedFiles: 0, unusedDependencies: 0, unusedExports: 1, duplicateExportGroups: 0 },
    markers: { total: 0, untracked: 0, records: [] },
    sizes: { stylesheetBytes: 1, javascriptBytes: 2, compiledAssetBytes: 3, productionPayloadBytes: 6 },
    architecture: { status: "PASS", legacyImportEdges: 2, findings: [] },
    security: {
      status: "PASS",
      verifiedArtifacts: 2,
      semgrepPlannedTargets: 1,
      semgrepScannedTargets: 1,
      semgrepFindings: 0,
      semgrepErrors: 0,
      worktreeSecrets: 0,
      historySecrets: 0,
      vulnerabilities: { total: 0 },
      negativeControlsPassed: true,
    },
    dependencyInventory: { directDevelopmentDependencies: 1, lockfilePackages: 2 },
    ...overrides,
  };
}

test("lint suppressions and work markers retain exact locations and explanation state", () => {
  const sources = [
    {
      path: "alpha.mjs",
      text: [
        "// eslint-disable-next-line no-alert -- #42: reviewed browser boundary",
        "alert('reviewed');",
        "// eslint-disable-next-line no-eval",
        ["// ", todoToken, " MQ-123: replace the compatibility adapter"].join(""),
        ["// ", fixmeToken, " anonymous marker"].join(""),
      ].join("\n"),
    },
    { path: "theme.css", text: "/* stylelint-disable color-no-hex */" },
  ];
  const suppressions = lintSuppressionInventory(sources);
  assert.equal(suppressions.total, 3);
  assert.equal(suppressions.unexplained, 2);
  assert.deepEqual(suppressions.records.map((record) => [record.path, record.line, record.kind, record.explained]), [
    ["alpha.mjs", 1, "ESLINT", true],
    ["alpha.mjs", 3, "ESLINT", false],
    ["theme.css", 1, "STYLELINT", false],
  ]);

  const configured = configurationLintSuppressionInventory({
    eslintConfig: [{ ignores: ["generated/**"] }],
    stylelintConfig: { ignoreFiles: ["vendor/**"], rules: { "no-descending-specificity": null, "color-no-invalid-hex": true } },
    markdownlintConfig: { globs: ["**/*.md", "!generated.md"], config: { default: false, MD001: true } },
  });
  assert.equal(configured.total, 5);
  assert.deepEqual(configured.records.map((record) => [record.path, record.kind, record.selector]), [
    [".markdownlint-cli2.jsonc", "CONFIG_DEFAULT_DISABLED", "default"],
    [".markdownlint-cli2.jsonc", "CONFIG_EXCLUSION", "!generated.md"],
    ["eslint.config.mjs", "CONFIG_EXCLUSION", "generated/**"],
    ["stylelint.config.mjs", "CONFIG_EXCLUSION", "vendor/**"],
    ["stylelint.config.mjs", "CONFIG_RULE_DISABLED", "no-descending-specificity"],
  ]);

  const markers = workMarkerInventory(sources, {
    tokens: [todoToken, fixmeToken, hackToken],
    trackingReferencePattern: "(?:https://[^\\s]+|#[1-9]\\d*|[A-Z][A-Z0-9]+-[1-9]\\d*)",
    explanationPattern: "(?::|-)\\s*\\S",
  });
  assert.equal(markers.total, 2);
  assert.equal(markers.untracked, 1);
  assert.deepEqual(markers.records.map((record) => [record.line, record.tokens, record.tracked]), [
    [4, [todoToken], true],
    [5, [fixmeToken], false],
  ]);
});

test("source census summary preserves every file row and deterministic maxima", () => {
  const summary = summarizeFileCensus([
    { path: "b.mjs", lines: 30, bytes: 300, sha256: "b".repeat(64) },
    { path: "a.css", lines: 10, bytes: 500, sha256: "a".repeat(64) },
  ]);
  assert.equal(summary.files, 2);
  assert.equal(summary.lines, 40);
  assert.equal(summary.bytes, 800);
  assert.deepEqual(summary.maxima, { lines: 30, bytes: 500 });
  assert.deepEqual(summary.rows.map((row) => row.path), ["a.css", "b.mjs"]);
});

test("PowerShell AST measurement records per-function complexity, ABC, LOC, and nesting", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-powershell-metrics-"));
  try {
    const fixture = [
      "function Test-Decision {",
      "  param([int]$Value)",
      "  $result = 0",
      "  if ($Value -gt 0 -and $Value -lt 10) {",
      "    foreach ($item in 1..$Value) { $result += $item }",
      "  } elseif ($Value -eq 20) {",
      "    $result = 20",
      "  }",
      "  return $result",
      "}",
    ].join("\n");
    await writeFile(path.join(temporaryRoot, "fixture.ps1"), fixture, "utf8");
    await writeFile(path.join(temporaryRoot, "second.ps1"), "function Test-Second { return 2 }\n", "utf8");
    const pathListBase64 = Buffer.from(JSON.stringify(["fixture.ps1", "second.ps1"]), "utf8").toString("base64");
    const run = spawnSync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", powershellMetricScript,
      "-RepositoryRoot", temporaryRoot,
      "-PathListBase64", pathListBase64,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(run.stdout);
    assert.equal(report.functions, 2);
    assert.equal(report.parseErrors.length, 0);
    const [row] = report.rows;
    assert.equal(row.functionId, "fixture.ps1::Test-Decision#1");
    assert.equal(row.functionLines, 10);
    assert.ok(row.cyclomatic >= 5);
    assert.ok(row.abcMagnitude > 0);
    assert.ok(row.cognitive > 0);
    assert.equal(row.maxNesting, 2);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("R0 composition records legacy findings without presenting them as a passing gate", () => {
  const report = composeRefactorBaseline(minimalBaselineInput());
  assert.equal(report.status, "BASELINE_RECORDED_WITH_FINDINGS");
  assert.deepEqual(report.openFindingCategories, ["complexity", "dead-code", "lint"]);
  assert.notEqual(report.status, "PASS");
});

test("R0 security evidence fails closed when the security gate did not pass", () => {
  const report = composeRefactorBaseline(minimalBaselineInput({
    security: {
      status: "FAIL",
      verifiedArtifacts: 0,
      semgrepPlannedTargets: 0,
      semgrepScannedTargets: 0,
      semgrepFindings: 0,
      semgrepErrors: 0,
      worktreeSecrets: 0,
      historySecrets: 0,
      vulnerabilities: { total: 0 },
      negativeControlsPassed: false,
    },
  }));
  assert.ok(report.openFindingCategories.includes("security"));
});

test("security projection does not treat absent negative controls as passing", () => {
  const security = stableSecurity({ status: "FAIL" });
  assert.equal(security.status, "FAIL");
  assert.equal(security.negativeControlsPassed, false);
});

test("closed schema rejects a failed security gate omitted from finding categories", async () => {
  const recorded = JSON.parse(await readFile(path.join(root, "audit", "refactor-baseline-v2.json"), "utf8"));
  const mutant = structuredClone(recorded);
  mutant.security.status = "FAIL";
  mutant.openFindingCategories = mutant.openFindingCategories.filter((category) => category !== "security");
  assert.ok((await validateRefactorBaselineSchema(mutant)).length > 0);
});

test("recorded R0 is closed-schema valid and binds the detailed function census", async () => {
  const baseline = JSON.parse(await readFile(path.join(root, "audit", "refactor-baseline-v2.json"), "utf8"));
  assert.deepEqual(await validateRefactorBaselineSchema(baseline), []);
  assert.equal(baseline.status, "BASELINE_RECORDED_WITH_FINDINGS");
  assert.equal(baseline.hardGateContract.cyclomaticMaximum, 10);
  assert.equal(baseline.hardGateContract.meaningfulCoverageMinimumPercent, 80);
  assert.equal(baseline.security.status, "PASS");
  assert.ok(baseline.security.verifiedArtifacts > 0);
  assert.equal(baseline.security.semgrepPlannedTargets, baseline.security.semgrepScannedTargets);
  assert.equal(baseline.security.negativeControlsPassed, true);
  const functionBytes = await readFile(path.join(root, baseline.functionQuality.javascriptArtifact));
  const functionSha256 = createHash("sha256").update(functionBytes).digest("hex");
  assert.equal(functionSha256, baseline.functionQuality.javascriptArtifactSha256);
});
