import assert from "node:assert/strict";
import test from "node:test";
import { loadQualityGatePolicy } from "../lib/quality-gate-policy.mjs";
import { compareWithBaseline, differentialMutationFailures, loadEngineFromGit } from "../lib/differential-equivalence.mjs";
import "./tutorial-metadata-transition.test.mjs";
import "./release-version-comparison.test.mjs";

test("the refactored engine remains differentially equivalent to the immutable R0 engine", async () => {
  const policy = await loadQualityGatePolicy();
  const result = await compareWithBaseline(policy.baselineCommit);
  assert.equal(result.baselineCount, result.candidateCount);
  assert.equal(result.candidateCount, 9_300);
  assert.equal(result.approvedReleaseVersionTransition.status, "VERIFIED_DECLARED_RELEASE_VERSION");
  assert.equal(result.approvedMetadataTransition.status, "VERIFIED_APPROVED_METADATA_TRANSITION");
  assert.equal(result.approvedMetadataTransition.decisionId, "ART-DEC-013");
  assert.equal(result.discoveryRequestCount, 48_384);
  assert.equal(result.generatedPromptCount, 103);
  assert.equal(result.generatedPromptSha256, "a76df68903736830ff73179ddf5ee63b65b0e27089fb41001ae807489d113de8");
  assert.equal(result.generatedCorpusSha256, "8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703");
  assert.equal(result.semanticWitnessCount, 2_304);
  assert.equal(result.semanticWitnessRegistrySha256, "f30730884cb0ea5a9b125c95534d6f1bbc238489180d89d70e0bad522993af4b");
  assert.deepEqual(result.semanticSupportCaseIds, [
    "question.hiddenPart",
    "question.integerOrderList",
    "question.numberLeast",
    "question.patternUnit",
    "question.remainderInterpret",
    "question.timeReadDigital",
  ]);
  assert.deepEqual(result.findings, []);
});

test("[NC-DIFFERENTIAL-EQUIVALENCE-DETECTS-DRIFT] changed witness selection, core, response, strategy, and later semantic-model results are rejected", async () => {
  const policy = await loadQualityGatePolicy();
  assert.deepEqual(await differentialMutationFailures(policy.baselineCommit), []);
});

test("[NC-DIFFERENTIAL-HERMETIC-R0] immutable baseline loading ignores ambient Git redirection and replacement state", async () => {
  const policy = await loadQualityGatePolicy();
  const expected = loadEngineFromGit(policy.baselineCommit);
  const previous = Object.fromEntries(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_REPLACE_REF_BASE"].map((name) => [name, process.env[name]]));
  try {
    for (const name of Object.keys(previous)) process.env[name] = "C:/definitely-not-the-math-quest-repository";
    const actual = loadEngineFromGit(policy.baselineCommit);
    assert.equal(actual.CURRICULUM_MANIFEST_SHA256, expected.CURRICULUM_MANIFEST_SHA256);
    assert.equal(actual.SKILLS.length, expected.SKILLS.length);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
