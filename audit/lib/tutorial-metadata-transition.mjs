import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canonicalizeJson, manifestArtifact } from "./curriculum-manifest.mjs";
import { loadQualityGatePolicy } from "./quality-gate-policy.mjs";

export async function loadTutorialMetadataAuthority(commit) {
  const policy = await loadQualityGatePolicy();
  const transition = policy.approvedTutorialMetadataTransition;
  assert.equal(commit, transition.baselineCommit, "tutorial transition baseline commit is not approved");
  const register = JSON.parse(await readFile(new URL("../art-design-decision-register-v1.json", import.meta.url), "utf8"));
  return Object.freeze({ transition, register });
}

function verifyManifestHash(engine) {
  assert.equal(manifestArtifact(engine.TUTORIAL_MANIFEST).sha256, engine.TUTORIAL_MANIFEST_SHA256,
    "tutorial manifest fingerprint does not match its exact canonical bytes");
}

function verifyApproval({ transition, register }) {
  assert.equal(manifestArtifact(register).sha256, transition.candidateArtDesignSha256, "art approval bytes changed");
  const entries = register.implementationDecisionLog.entries.filter((entry) => entry.id === transition.decisionId);
  assert.equal(entries.length, 1, "art approval identity must be unique");
  assert.equal(entries[0].status, "ACTIVE", "art approval must be active");
  assert.equal(entries[0].baseRevision, transition.baselineCommit, "art approval baseline changed");
}

function verifyTutorialTransition(baseline, candidate, transition) {
  assert.equal(baseline.TUTORIAL_MANIFEST_SHA256, transition.baselineTutorialSha256, "baseline tutorial fingerprint is not approved");
  assert.equal(candidate.TUTORIAL_MANIFEST_SHA256, transition.candidateTutorialSha256, "candidate tutorial fingerprint is not approved");
  const before = baseline.TUTORIAL_MANIFEST.artDesignBinding;
  const after = candidate.TUTORIAL_MANIFEST.artDesignBinding;
  assert.equal(before.path, transition.decisionRegisterPath, "baseline tutorial approval path changed");
  assert.equal(after.path, before.path, "candidate tutorial approval path changed");
  assert.equal(before.sha256, transition.baselineArtDesignSha256, "baseline tutorial approval fingerprint changed");
  assert.equal(after.sha256, transition.candidateArtDesignSha256, "candidate tutorial approval fingerprint changed");
}

function verifyUnchangedTeaching(baseline, candidate) {
  const rebound = {
    ...candidate.TUTORIAL_MANIFEST,
    artDesignBinding: { ...candidate.TUTORIAL_MANIFEST.artDesignBinding, sha256: baseline.TUTORIAL_MANIFEST.artDesignBinding.sha256 },
  };
  assert.equal(canonicalizeJson(rebound), canonicalizeJson(baseline.TUTORIAL_MANIFEST), "tutorial teaching metadata changed");
}

function translatedPlan(candidate, transition, args) {
  const plan = candidate.makeTutorialPlan(...args);
  if (plan === null) return null;
  assert.equal(plan?.manifestSha256, transition.candidateTutorialSha256, "candidate tutorial plan fingerprint is not current");
  return { ...plan, manifestSha256: transition.baselineTutorialSha256 };
}

export function tutorialMetadataComparison(baseline, candidate, authority) {
  verifyManifestHash(baseline);
  verifyManifestHash(candidate);
  if (baseline.TUTORIAL_MANIFEST_SHA256 === candidate.TUTORIAL_MANIFEST_SHA256) {
    return { engine: candidate, evidence: { status: "IDENTICAL_METADATA" } };
  }
  verifyApproval(authority);
  verifyTutorialTransition(baseline, candidate, authority.transition);
  verifyUnchangedTeaching(baseline, candidate);
  const { transition } = authority;
  return {
    engine: {
      ...candidate,
      TUTORIAL_MANIFEST_SHA256: transition.baselineTutorialSha256,
      makeTutorialPlan: (...args) => translatedPlan(candidate, transition, args),
    },
    evidence: { status: "VERIFIED_APPROVED_METADATA_TRANSITION", ...transition },
  };
}

function rejectsTransition(baseline, candidate, authority) {
  try { tutorialMetadataComparison(baseline, candidate, authority); return false; }
  catch { return true; }
}

function changedManifestEngine(candidate) {
  const manifest = structuredClone(candidate.TUTORIAL_MANIFEST);
  manifest.differentExample.differentParameters = false;
  return { ...candidate, TUTORIAL_MANIFEST: manifest, TUTORIAL_MANIFEST_SHA256: manifestArtifact(manifest).sha256 };
}

function planMutationDetected(context, field, value) {
  const mutant = { ...context.candidate, makeTutorialPlan: () => ({ ...context.original, [field]: value }) };
  try {
    const observed = tutorialMetadataComparison(context.baseline, mutant, context.authority).engine.makeTutorialPlan(context.question);
    return canonicalizeJson(context.expected) !== canonicalizeJson(observed);
  } catch { return true; }
}

function planMutationFailures(baseline, candidate, authority) {
  const question = candidate.makeQuestion({ skillId: "MQ-001", tier: "EASY", seed: 0x51f15e, ordinal: 0, representation: "PICTORIAL" });
  const original = candidate.makeTutorialPlan(question);
  assert.ok(original, "tutorial metadata negative control needs a real plan");
  const expected = tutorialMetadataComparison(baseline, candidate, authority).engine.makeTutorialPlan(question);
  const context = { baseline, candidate, authority, question, original, expected };
  return [["manifestSha256", "MUTATED"], ["manifestSha256", baseline.TUTORIAL_MANIFEST_SHA256], ["noticeStringId", "MUTATED"]]
    .flatMap(([field, value]) => planMutationDetected(context, field, value)
      ? [] : [`tutorial metadata control concealed changed ${field}: ${value}`]);
}

export function tutorialMetadataMutationFailures(baseline, candidate, authority) {
  const changedRegister = { ...authority, register: { ...authority.register, status: "MUTATED" } };
  const cases = [
    ["unknown fingerprint", { ...candidate, TUTORIAL_MANIFEST_SHA256: "0".repeat(64) }, authority],
    ["teaching manifest", changedManifestEngine(candidate), authority],
    ["approval bytes", candidate, changedRegister],
  ];
  return [
    ...cases.flatMap(([name, engine, source]) => rejectsTransition(baseline, engine, source)
      ? [] : [`tutorial metadata control accepted changed ${name}`]),
    ...planMutationFailures(baseline, candidate, authority),
  ];
}
