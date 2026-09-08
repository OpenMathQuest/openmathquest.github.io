import assert from "node:assert/strict";
import test from "node:test";
import { loadQualityGatePolicy } from "../lib/quality-gate-policy.mjs";
import { shippedByteArtifacts } from "../lib/quality-budget-measurements.mjs";
import { bundleWatchSpecification } from "../run-bundlewatch-budgets.mjs";

test("BundleWatch specifications bind the four current tightened uncompressed payload budgets", async () => {
  const policy = await loadQualityGatePolicy();
  const artifacts = shippedByteArtifacts();
  const specifications = bundleWatchSpecification(policy, artifacts);
  assert.deepEqual(specifications.map((item) => [item.metric, item.actualBytes, item.maximumBytes]), [
    ["stylesheetBytes", artifacts.stylesheetBytes.length, policy.performanceBudgets.stylesheetMaximumBytes],
    ["javascriptBytes", artifacts.javascriptBytes.length, policy.performanceBudgets.javascriptMaximumBytes],
    ["compiledAssetBytes", artifacts.compiledAssetBytes.length, policy.performanceBudgets.compiledAssetMaximumBytes],
    ["productionPayloadBytes", artifacts.productionPayloadBytes.length, policy.performanceBudgets.productionPayloadMaximumBytes],
  ]);
  assert.equal(specifications.every((item) => item.actualBytes === item.maximumBytes), true);
});

test("the one-byte BundleWatch mutant is over its JavaScript budget", async () => {
  const policy = await loadQualityGatePolicy();
  const specifications = bundleWatchSpecification(policy, shippedByteArtifacts(), "javascriptBytes");
  const javascript = specifications.find((item) => item.metric === "javascriptBytes");
  assert.equal(javascript.actualBytes, javascript.maximumBytes + 1);
});
