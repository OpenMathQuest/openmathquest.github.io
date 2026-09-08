import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadEngineFromGit } from "../lib/differential-equivalence.mjs";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { manifestArtifact } from "../lib/curriculum-manifest.mjs";
import { loadQualityGatePolicy, validateQualityGatePolicySchema } from "../lib/quality-gate-policy.mjs";
import { loadTutorialMetadataAuthority, tutorialMetadataComparison, tutorialMetadataMutationFailures } from "../lib/tutorial-metadata-transition.mjs";

const policy = await loadQualityGatePolicy();
const baseline = loadEngineFromGit(policy.baselineCommit);
const { engine: candidate } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
const register = JSON.parse(await readFile(new URL("../art-design-decision-register-v1.json", import.meta.url), "utf8"));
const authority = { transition: policy.approvedTutorialMetadataTransition, register };
const question = candidate.makeQuestion({ skillId: "MQ-001", tier: "EASY", seed: 0x51f15e, ordinal: 0, representation: "PICTORIAL" });
const copy = (value) => JSON.parse(JSON.stringify(value));

test("only the exact approved tutorial fingerprint is translated for comparison", () => {
  const original = candidate.makeTutorialPlan(question);
  const normalized = tutorialMetadataComparison(baseline, candidate, authority);
  assert.equal(normalized.evidence.status, "VERIFIED_APPROVED_METADATA_TRANSITION");
  assert.equal(normalized.engine.TUTORIAL_MANIFEST_SHA256, baseline.TUTORIAL_MANIFEST_SHA256);
  assert.deepEqual(copy(normalized.engine.makeTutorialPlan(question)), {
    ...copy(original), manifestSha256: baseline.TUTORIAL_MANIFEST_SHA256,
  });
  assert.deepEqual(copy(candidate.makeTutorialPlan(question)), copy(original));
  assert.equal(candidate.TUTORIAL_MANIFEST_SHA256, authority.transition.candidateTutorialSha256);
});

test("unknown fingerprints, modified manifests, and altered approval records fail closed", () => {
  assert.throws(() => tutorialMetadataComparison(baseline, {
    ...candidate, TUTORIAL_MANIFEST_SHA256: "0".repeat(64),
  }, authority), /tutorial/iu);
  const manifest = copy(candidate.TUTORIAL_MANIFEST);
  manifest.differentExample.differentParameters = false;
  const changed = { ...candidate, TUTORIAL_MANIFEST: manifest, TUTORIAL_MANIFEST_SHA256: manifestArtifact(manifest).sha256 };
  assert.throws(() => tutorialMetadataComparison(baseline, changed, authority), /tutorial/iu);
  const changedRegister = copy(register);
  changedRegister.status = "REJECTED";
  assert.throws(() => tutorialMetadataComparison(baseline, candidate, { ...authority, register: changedRegister }), /approval/iu);
});

test("a changed plan fingerprint or teaching step is never hidden by normalization", () => {
  const original = candidate.makeTutorialPlan(question);
  const wrongHash = { ...candidate, makeTutorialPlan: () => ({ ...original, manifestSha256: "forged" }) };
  assert.throws(() => tutorialMetadataComparison(baseline, wrongHash, authority).engine.makeTutorialPlan(question), /candidate tutorial plan fingerprint/u);
  const wrongTeaching = { ...candidate, makeTutorialPlan: () => ({ ...original, noticeStringId: "wrong-teaching" }) };
  const plan = tutorialMetadataComparison(baseline, wrongTeaching, authority).engine.makeTutorialPlan(question);
  assert.equal(plan.noticeStringId, "wrong-teaching");
  assert.notDeepEqual(copy(plan), { ...copy(original), manifestSha256: baseline.TUTORIAL_MANIFEST_SHA256 });
});

test("identical baseline metadata is checked but needs no translation", () => {
  const comparison = tutorialMetadataComparison(baseline, baseline, authority);
  assert.equal(comparison.engine, baseline);
  assert.equal(comparison.evidence.status, "IDENTICAL_METADATA");
});

test("the approved transition policy cannot broaden its pointers, hashes, decision, or baseline", async () => {
  for (const key of Object.keys(policy.approvedTutorialMetadataTransition)) {
    const changed = copy(policy);
    changed.approvedTutorialMetadataTransition[key] = "unapproved";
    assert.notDeepEqual(await validateQualityGatePolicySchema(changed), [], key);
  }
  const missing = copy(policy);
  delete missing.approvedTutorialMetadataTransition;
  assert.notDeepEqual(await validateQualityGatePolicySchema(missing), []);
  await assert.rejects(loadTutorialMetadataAuthority("unapproved-commit"), /baseline commit/u);
});

test("[NC-TUTORIAL-METADATA-TRANSITION] the live gate's six alteration controls all reject drift", () => {
  assert.deepEqual(tutorialMetadataMutationFailures(baseline, candidate, authority), []);
});

test("a stale baseline fingerprint in a candidate plan is rejected before translation", () => {
  const original = candidate.makeTutorialPlan(question);
  const stale = { ...candidate, makeTutorialPlan: () => ({ ...original, manifestSha256: baseline.TUTORIAL_MANIFEST_SHA256 }) };
  assert.throws(
    () => tutorialMetadataComparison(baseline, stale, authority).engine.makeTutorialPlan(question),
    /candidate tutorial plan fingerprint/u,
  );
});

test("a genuinely unavailable tutorial plan remains null", () => {
  const noPlan = { ...candidate, makeTutorialPlan: () => null };
  assert.equal(tutorialMetadataComparison(baseline, noPlan, authority).engine.makeTutorialPlan(question), null);
});
