import assert from "node:assert/strict";
import test from "node:test";
import {
  functionQualityGateFindings,
  functionQualityGateMutationFailures,
} from "../run-function-quality-gate.mjs";

const limits = Object.freeze({
  cyclomatic: 10,
  abcMagnitude: 30,
  cognitive: 15,
  functionLines: 80,
  maxNesting: 4,
});

function row(functionId, sourceSha256, overrides = {}) {
  return {
    functionId,
    path: "fixture.mjs",
    unit: "fixture.mjs",
    name: "fixture",
    kind: "FunctionDeclaration",
    startLine: 1,
    sourceSha256,
    thresholdViolations: [],
    cyclomatic: 1,
    abcMagnitude: 1,
    cognitive: 0,
    functionLines: 3,
    maxNesting: 0,
    ...overrides,
  };
}

function census(rows, violationCounts = {}) {
  return {
    limits,
    parseErrors: [],
    rows,
    violationCounts: Object.fromEntries(Object.keys(limits).map((metric) => [metric, violationCounts[metric] || 0])),
  };
}

function policy(ceilingOverrides = {}) {
  const zeroes = Object.fromEntries(Object.keys(limits).map((metric) => [metric, 0]));
  const javascriptCeilings = { ...zeroes, ...ceilingOverrides };
  return {
    analysisRatchets: {
      functionQuality: {
        baselineArtifacts: {},
        newOrMateriallyModifiedLimits: limits,
        legacyViolationCeilings: { javascript: javascriptCeilings, javascriptInlineHtml: zeroes, powershell: zeroes },
      },
    },
  };
}

test("function quality accepts exact ratchets and bounded source edits", () => {
  const baseline = {
    javascript: census([row("js::legacy#1", "old")]),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const current = {
    javascript: census([row("js::legacy#1", "new")]),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.deepEqual(functionQualityGateFindings(policy(), baseline, current), []);
});

test("metric-neutral leaf edits do not falsely classify enclosing legacy functions as rewritten", () => {
  const baseline = {
    javascript: census([row("js::legacy#1", "old", { cyclomatic: 11 })], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const current = {
    javascript: census([row("js::legacy#1", "new", { cyclomatic: 11 })], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.deepEqual(functionQualityGateFindings(policy({ cyclomatic: 1 }), baseline, current), []);
});

test("inline-script renumbering preserves a unique monotonic legacy wrapper identity", () => {
  const identity = { path: "index.html", name: "adapter.callback#1", kind: "ArrowFunctionExpression" };
  const baseline = {
    javascript: census([
      row("index.html#inline-script-1::adapter.callback#1", "old", { ...identity, unit: "index.html#inline-script-1", startLine: 100, cyclomatic: 65, abcMagnitude: 210, cognitive: 67, functionLines: 1926 }),
    ], { cyclomatic: 1, abcMagnitude: 1, cognitive: 1, functionLines: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const current = {
    javascript: census([
      row("index.html#inline-script-2::adapter.callback#1", "new", { ...identity, unit: "index.html#inline-script-2", startLine: 89, cyclomatic: 64, abcMagnitude: 208, cognitive: 66, functionLines: 1926 }),
    ], { cyclomatic: 1, abcMagnitude: 1, cognitive: 1, functionLines: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.deepEqual(functionQualityGateFindings(policy({ cyclomatic: 1, abcMagnitude: 1, cognitive: 1, functionLines: 1 }), baseline, current), []);
});

test("a legacy metric may improve gradually but may never regress", () => {
  const baseline = {
    javascript: census([row("js::legacy#1", "old", { cyclomatic: 11 })], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const improved = {
    javascript: census([row("js::legacy#1", "new", { cyclomatic: 10 })]),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.deepEqual(functionQualityGateFindings(policy(), baseline, improved), []);

  const regressed = {
    javascript: census([row("js::legacy#1", "new", { cyclomatic: 12 })], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.match(functionQualityGateFindings(policy({ cyclomatic: 1 }), baseline, regressed).join("\n"), /legacy function js::legacy#1 regressed cyclomatic from 11 to 12/u);
});

test("function matching survives callback renumbering and treats a duplicate copy as new", () => {
  const callback = { path: "callbacks.test.mjs", unit: "callbacks.test.mjs", name: "test.callback", kind: "ArrowFunctionExpression" };
  const baseline = {
    javascript: census([
      row("callbacks.test.mjs::test.callback#1", "changed-old", { ...callback, startLine: 10, cyclomatic: 11 }),
      row("callbacks.test.mjs::test.callback#2", "stable", { ...callback, startLine: 30 }),
    ], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const shifted = {
    javascript: census([
      row("callbacks.test.mjs::test.callback#1", "stable", { ...callback, startLine: 12 }),
      row("callbacks.test.mjs::test.callback#2", "changed-new", { ...callback, startLine: 32, cyclomatic: 12 }),
    ], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.match(functionQualityGateFindings(policy({ cyclomatic: 1 }), baseline, shifted).join("\n"), /new function callbacks\.test\.mjs::test\.callback#2 has cyclomatic 12/u);

  const copyBaseline = {
    javascript: census([
      row("callbacks.test.mjs::test.callback#1", "changed-old", { ...callback, startLine: 10, cyclomatic: 11 }),
    ], { cyclomatic: 1 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  const copied = {
    javascript: census([
      row("callbacks.test.mjs::test.callback#2", "changed-old", { ...callback, startLine: 20, cyclomatic: 11 }),
      row("callbacks.test.mjs::test.callback#3", "changed-old", { ...callback, startLine: 40, cyclomatic: 11 }),
    ], { cyclomatic: 2 }),
    javascriptInlineHtml: census([]),
    powershell: census([]),
  };
  assert.match(functionQualityGateFindings(policy({ cyclomatic: 2 }), copyBaseline, copied).join("\n"), /new function callbacks\.test\.mjs::test\.callback#3 has cyclomatic 11/u);
});

test("[NC-FUNCTION-QUALITY-RATCHETS] changed violations, regressions, and stale ceilings fail", () => {
  assert.deepEqual(functionQualityGateMutationFailures(policy()).length, 0);
});
