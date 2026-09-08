import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  functionQualityBaselineArtifactFindings,
  loadFunctionQualityBaselineArtifacts,
  validateInlineFunctionQualityCorrectionSchema,
} from "../lib/inline-function-quality-baseline.mjs";
import { loadQualityGatePolicy } from "../lib/quality-gate-policy.mjs";

const primaryUrl = new URL("../function-quality-baseline-v1.json", import.meta.url);
const correctionUrl = new URL("../inline-function-quality-baseline-correction-v1.json", import.meta.url);

test("the additive R0 correction measures every executable inline HTML function without rewriting R0", async () => {
  const policy = await loadQualityGatePolicy();
  const artifacts = await loadFunctionQualityBaselineArtifacts(policy);
  assert.deepEqual(artifacts.findings, []);
  assert.deepEqual(await validateInlineFunctionQualityCorrectionSchema(artifacts.correction), []);
  assert.equal(artifacts.correction.correctsArtifact.sha256, policy.analysisRatchets.functionQuality.baselineArtifacts.primary.sha256);
  assert.equal(artifacts.correction.omissionEvidence.originalInlineHtmlRows, 0);
  assert.equal(artifacts.correction.immutableInlineHtmlBaseline.units, 3);
  assert.equal(artifacts.correction.immutableInlineHtmlBaseline.functions, 1971);
  assert.deepEqual(artifacts.correction.immutableInlineHtmlBaseline.violationCounts, {
    cyclomatic: 204,
    abcMagnitude: 116,
    cognitive: 111,
    functionLines: 16,
    maxNesting: 6,
  });
});

test("[NC-INLINE-FUNCTION-BASELINE-HASH-OR-SCOPE-DRIFT] mutation of either bound baseline fails", async () => {
  const policy = await loadQualityGatePolicy();
  const [primaryBytes, correctionBytes] = await Promise.all([readFile(primaryUrl), readFile(correctionUrl)]);
  const primary = JSON.parse(primaryBytes.toString("utf8"));
  const correction = JSON.parse(correctionBytes.toString("utf8"));
  const mutated = structuredClone(correction);
  mutated.immutableInlineHtmlBaseline.rows[0].unit = "not-inline.mjs";
  const mutatedBytes = Buffer.from(JSON.stringify(mutated), "utf8");
  const findings = await functionQualityBaselineArtifactFindings(
    policy, primary, mutated, primaryBytes, mutatedBytes,
  );
  assert.match(findings.join("\n"), /non-inline|hash does not match/iu);
});
