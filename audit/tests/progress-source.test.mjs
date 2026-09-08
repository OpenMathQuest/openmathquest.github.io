import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const assetUrl = new URL("../../assets/js/math-quest-progress-source.js", import.meta.url);
const pageUrl = new URL("../../index.html", import.meta.url);
const LEGACY_MATRIX_CASES = 448;
const LEGACY_MATRIX_SHA256 = "2bb99f91e26397a6127a65a12a1eb6b57962a7f4c39e63e79659979aa62a0125";
const GUARD_VALUES = Object.freeze({
  migration: "beta1-to-protected-v1",
  emptyCutover: "empty-to-protected-v1",
  retainedCutover: "beta1-retained-to-protected-v1",
  retainedComplete: "beta1-retained-current-curriculum-v1",
});
const CURRENT_READS = Object.freeze([
  Object.freeze({ ok: false, value: null }),
  Object.freeze({ ok: true, value: null }),
  Object.freeze({ ok: true, value: "" }),
  Object.freeze({ ok: true, value: "CURRENT" }),
]);
const GUARD_READS = Object.freeze([
  Object.freeze({ ok: false, value: null }),
  ...[null, ...Object.values(GUARD_VALUES), "unexpected"].map((value) => Object.freeze({ ok: true, value })),
]);
const BETA1_READS = Object.freeze([
  Object.freeze({ ok: false, value: null }),
  Object.freeze({ ok: true, value: null }),
  Object.freeze({ ok: true, value: "" }),
  Object.freeze({ ok: true, value: "BETA1" }),
]);
const CURRENT_GUARD_READS = Object.freeze(CURRENT_READS.flatMap(
  (currentRead) => GUARD_READS.map((guardRead) => Object.freeze([currentRead, guardRead])),
));
const BETA1_VIRGIN_READS = Object.freeze(BETA1_READS.flatMap(
  (beta1Read) => [false, true].map((currentSaveVirgin) => Object.freeze([beta1Read, currentSaveVirgin])),
));

function evaluatePolicy(source) {
  const context = vm.createContext({});
  new vm.Script(source, { filename: "math-quest-progress-source.js" }).runInContext(context);
  return context.MathQuestProgressSource;
}

function selectionMatrix(policy) {
  const rows = [];
  for (const keysDiffer of [false, true]) {
    for (const [currentRead, guardRead] of CURRENT_GUARD_READS) {
      for (const [beta1Read, currentSaveVirgin] of BETA1_VIRGIN_READS) {
        rows.push(policy.selectProgressSource({
          currentRead,
          guardRead,
          beta1Read,
          currentSaveVirgin,
          keysDiffer,
          guardValues: GUARD_VALUES,
        }));
      }
    }
  }
  return rows;
}

function matrixSha256(policy) {
  return createHash("sha256").update(JSON.stringify(selectionMatrix(policy))).digest("hex");
}

test("protected-progress source policy preserves the exact 448-case legacy selection matrix", async () => {
  const policy = evaluatePolicy(await readFile(assetUrl, "utf8"));
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(selectionMatrix(policy).length, LEGACY_MATRIX_CASES);
  assert.equal(matrixSha256(policy), LEGACY_MATRIX_SHA256);
  assert.deepEqual(
    JSON.parse(JSON.stringify(policy.selectProgressSource({
      currentRead: { ok: true, value: "CURRENT" },
      guardRead: { ok: true, value: GUARD_VALUES.migration },
      beta1Read: { ok: true, value: null },
      currentSaveVirgin: false,
      keysDiffer: true,
      guardValues: GUARD_VALUES,
    }))),
    {
      currentSave: "CURRENT", currentSaveVirgin: false,
      guardValue: GUARD_VALUES.migration, guardPresent: true,
      migrationGuardPresent: true, emptyCutoverGuardPresent: false,
      retainedCutoverGuardPresent: false, retainedCompletePresent: false,
      guardValid: true, sourceNeeded: true, beta1Save: null,
      beta1Selected: false, guardedBeta1Missing: true,
      retainedCompleteMissing: false, emptyCutoverSelected: false,
      prerequisitesOk: false, sourceSave: "CURRENT",
    },
  );
});

test("[NC-PROGRESS-SOURCE-POLICY-DRIFT] accepting an invalid guard changes the frozen matrix", async () => {
  const source = await readFile(assetUrl, "utf8");
  const mutant = source.replace(
    "guardValid: !guardPresent || activeGuardPresent || retainedCompletePresent,",
    "guardValid: true,",
  );
  assert.notEqual(mutant, source, "the calibrated mutation must alter invalid-guard handling");
  assert.notEqual(matrixSha256(evaluatePolicy(mutant)), LEGACY_MATRIX_SHA256);
});

test("the shipped page loads the progress-source policy before the adapter and delegates to it", async () => {
  const html = await readFile(pageUrl, "utf8");
  const assetTag = '<script src="assets/js/math-quest-progress-source.js"></script>';
  const assetIndex = html.indexOf(assetTag);
  const adapterIndex = html.indexOf("<script>", html.indexOf("/* ===ENGINE-END=== */"));
  assert.notEqual(assetIndex, -1, "the progress-source policy asset must be loaded");
  assert.equal(assetIndex < adapterIndex, true, "the progress-source policy must load before the adapter");
  assert.match(html, /MathQuestProgressSource\.selectProgressSource\(\{/u);
});
