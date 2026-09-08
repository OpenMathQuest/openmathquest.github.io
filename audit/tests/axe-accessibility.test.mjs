import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import CompactReporter from "../playwright/compact-reporter.mjs";
import { AXE_CORE_VERSION, AXE_NEGATIVE_CONTROL_ID, axeManualReviewRecords, axeManualReviewSummaries, axeViolationFindings, compactAxeResults, recordAxeManualReview, verifyAxeNegativeControl } from "../lib/axe-accessibility.mjs";

const axeResult = ({ violations = [], incomplete = [] } = {}) => ({
  testEngine: { version: AXE_CORE_VERSION },
  violations,
  incomplete,
});

const unnamedButton = () => ({
  id: "button-name",
  impact: "critical",
  help: "Buttons must have discernible text",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.13/button-name",
  nodes: [{ target: ["button"], failureSummary: "The button has no accessible name." }],
});

test("[NC-AXE-RESULT-CLASSIFICATION] a detected violation cannot pass the axe adapter", () => {
  assert.equal(AXE_NEGATIVE_CONTROL_ID, "NC-AXE-UNNAMED-BUTTON-DETECTED");
  const result = compactAxeResults(axeResult({ violations: [unnamedButton()] }));
  assert.equal(result.engineVersion, AXE_CORE_VERSION);
  assert.match(axeViolationFindings(result).join("\n"), /button-name.*button has no accessible name/iu);
});

test("axe incomplete results remain manual-review items rather than violations or automated passes", () => {
  const result = compactAxeResults(axeResult({ incomplete: [unnamedButton()] }));
  assert.deepEqual(axeViolationFindings(result), []);
  const [item] = axeManualReviewSummaries(result);
  assert.equal(item.nodeCount, 1);
  assert.equal(item.ruleId, "button-name");
  assert.equal(item.helpUrl, unnamedButton().helpUrl);
  assert.deepEqual(item.nodes, unnamedButton().nodes);
});

test("malformed or absent scanner channels cannot become clean empty results", () => {
  for (const value of [null, {}, { testEngine: { version: AXE_CORE_VERSION } }, axeResult({ violations: null }), axeResult({ incomplete: {} })]) {
    assert.throws(() => compactAxeResults(value), /axe-core/iu);
  }
});

test("Deep UX manual findings retain each exact cell, state, selector and reason", () => {
  const records = new Map();
  const result = compactAxeResults(axeResult({ incomplete: [unnamedButton()] }));
  recordAxeManualReview(records, result, "DUX-first@desktop", "INITIAL");
  recordAxeManualReview(records, result, "DUX-second@desktop", "PARTIAL_RESPONSE");
  const rows = axeManualReviewRecords(records);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ cellId, state }) => ({ cellId, state })), [
    { cellId: "DUX-first@desktop", state: "INITIAL" },
    { cellId: "DUX-second@desktop", state: "PARTIAL_RESPONSE" },
  ]);
  assert.deepEqual(rows[0].nodes, unnamedButton().nodes);
});

test("the browser detector control rejects a scanner that fails to detect the unnamed button", async () => {
  let closed = false;
  const page = { setContent: async () => {}, evaluate: async () => axeResult() };
  const context = { newPage: async () => page, close: async () => { closed = true; } };
  await assert.rejects(verifyAxeNegativeControl({ newContext: async () => context }), /NC-AXE-UNNAMED-BUTTON-DETECTED/u);
  assert.equal(closed, true);
});

test("missing, blank, or malformed scan counts remain missing evidence rather than zero violations", () => {
  for (const count of [null, "", "-1", "NaN", "1.5"]) {
    const reporter = new CompactReporter();
    const annotations = [
      { type: "axe-negative-control", description: `${AXE_NEGATIVE_CONTROL_ID}:PASS` },
      { type: "axe-manual-review", description: "[]" },
      { type: "axe-violation-count", description: count },
    ];
    reporter.onTestEnd({ title: "[PW-F-01] fixture", annotations }, { status: "passed", duration: 1, retry: 0 });
    assert.equal(reporter.rows[0].axe.violationCount, null);
  }
});

test("the ordinary audit entry point executes the axe adapter regressions with the focused contract tests", async () => {
  const runner = await readFile(new URL("../run-audit.ps1", import.meta.url), "utf8");
  assert.match(runner, /--test[^\n]*playwright-focused-contract\.test\.mjs[^\n]*axe-accessibility\.test\.mjs/u);
});
