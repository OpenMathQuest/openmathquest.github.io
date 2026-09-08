import assert from "node:assert/strict";
import test from "node:test";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { loadEngineFromGit } from "../lib/differential-equivalence.mjs";
import { loadQualityGatePolicy } from "../lib/quality-gate-policy.mjs";
import {
  loadReleaseVersionComparison,
  comparableReleaseConstants,
  comparableReleaseState,
  comparableReleaseExport,
} from "../lib/release-version-comparison.mjs";

const transition = Object.freeze({ observed: "1.0.0-beta.9", comparison: "1.0.0-beta.8" });

test("release comparison changes only the three declared version fields", () => {
  const constants = { PRODUCT_VERSION: transition.observed, STATE_SCHEMA_VERSION: 3 };
  const state = { productVersion: transition.observed, earnedLevel: 4, nested: { productVersion: "unrelated" } };
  const before = JSON.stringify(state);
  assert.deepEqual(comparableReleaseConstants(constants, transition), { ...constants, PRODUCT_VERSION: transition.comparison });
  assert.deepEqual(comparableReleaseState(state, transition), { ...state, productVersion: transition.comparison });
  assert.equal(comparableReleaseExport(before, transition), before.replace(transition.observed, transition.comparison));
  assert.equal(JSON.stringify(state), before);
  assert.equal(constants.PRODUCT_VERSION, transition.observed);
  assert.notDeepEqual(comparableReleaseConstants({ ...constants, STATE_SCHEMA_VERSION: 4 }, transition), comparableReleaseConstants(constants, transition));
  assert.notDeepEqual(comparableReleaseState({ ...state, earnedLevel: 5 }, transition), comparableReleaseState(state, transition));
  assert.notEqual(comparableReleaseExport(`${before} `, transition), comparableReleaseExport(before, transition));
});

test("wrong, missing and duplicate release versions fail closed", () => {
  for (const value of [undefined, "1.0.0-beta.8", "1.0.0-beta.10", "invalid"]) {
    assert.throws(() => comparableReleaseConstants({ PRODUCT_VERSION: value }, transition), /differs from VERSION/u);
    assert.throws(() => comparableReleaseState({ productVersion: value }, transition), /differs from VERSION/u);
    assert.throws(() => comparableReleaseExport(JSON.stringify({ productVersion: value }), transition), /differs from VERSION/u);
  }
  assert.throws(() => comparableReleaseExport('{"productVersion":"1.0.0-beta.9","productVersion":"1.0.0-beta.9"}', transition), /one exact/u);
  assert.throws(() => comparableReleaseExport('{"productVersion":"1.0.0-beta.9","nested":{"productVersion":"1.0.0-beta.9"}}', transition), /one exact/u);
});

test("real baseline saves and current exports differ only in the declared release version", async () => {
  const policy = await loadQualityGatePolicy();
  const versions = await loadReleaseVersionComparison(policy.baselineCommit);
  const baseline = loadEngineFromGit(policy.baselineCommit);
  const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const before = baseline.createInitialState(22_000);
  const after = engine.createInitialState(22_000);
  assert.equal(versions.evidence.owner, "VERSION");
  assert.equal(engine.canonical(comparableReleaseState(after, versions.candidate)), baseline.canonical(before));
  assert.equal(comparableReleaseExport(engine.exportState(after), versions.candidate), baseline.exportState(before));
  const bytes = baseline.exportState(before);
  const loaded = engine.loadState(bytes, 22_000);
  assert.equal(loaded.ok, true);
  assert.equal(engine.canonical(comparableReleaseState(loaded.state, versions.candidate)), baseline.canonical(before));
  assert.equal(baseline.exportState(before), bytes);
});
