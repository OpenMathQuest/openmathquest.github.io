import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FEATURE_MAP_PATH,
  FEATURE_MAP_SCHEMA_PATH,
  featureIdForInputMethod,
  validateFeatureMap,
  validateFeatureMapSchema,
} from "../lib/feature-map.mjs";
import { AI_READER_CONTRACT_REF } from "../lib/repository-code-map.mjs";

const [featureMap, curriculum, tutorial] = await Promise.all([
  readFile(FEATURE_MAP_PATH, "utf8").then(JSON.parse),
  readFile("curriculum/math-quest-manifest-v1.json", "utf8").then(JSON.parse),
  readFile("curriculum/math-quest-tutorial-manifest-v1.json", "utf8").then(JSON.parse),
]);
const options = { curriculum, tutorial, schemaPathOrUrl: FEATURE_MAP_SCHEMA_PATH };
const clone = (value) => structuredClone(value);

test("feature map is schema-valid and exactly covers every current response mechanic", async () => {
  assert.deepEqual(await validateFeatureMapSchema(featureMap, FEATURE_MAP_SCHEMA_PATH), []);
  assert.deepEqual(await validateFeatureMap(featureMap, options), []);
  assert.equal(featureMap.features.length, tutorial.methodBindings.length);
  assert.deepEqual(featureMap.features.map((feature) => feature.inputMethod), tutorial.methodBindings.map((binding) => binding.inputMethod));
  for (const feature of featureMap.features) assert.equal(feature.id, featureIdForInputMethod(feature.inputMethod));
});

test("missing proofs and orphaned mechanics fail closed", async () => {
  const missingProofs = clone(featureMap);
  delete missingProofs.features[0].proofs;
  assert.match((await validateFeatureMapSchema(missingProofs, FEATURE_MAP_SCHEMA_PATH)).join("\n"), /must have required property 'proofs'/u);

  const orphan = clone(featureMap);
  orphan.features.pop();
  assert.match((await validateFeatureMap(orphan, options)).join("\n"), /must exactly cover the tutorial input-method set/u);
});

test("stale curriculum/tutorial bindings and mismatched tutorial families are rejected", async () => {
  const staleCurriculum = clone(featureMap);
  staleCurriculum.curriculumBinding.sha256 = "0".repeat(64);
  assert.match((await validateFeatureMap(staleCurriculum, options)).join("\n"), /curriculumBinding\.sha256 does not match/u);

  const staleTutorial = clone(featureMap);
  staleTutorial.tutorialBinding.sha256 = "0".repeat(64);
  assert.match((await validateFeatureMap(staleTutorial, options)).join("\n"), /tutorialBinding\.sha256 does not match/u);

  const wrongFamily = clone(featureMap);
  wrongFamily.features[0].tutorialFamilyId = "DATA_SPATIAL";
  assert.match((await validateFeatureMap(wrongFamily, options)).join("\n"), /ACTION_SCENE tutorialFamilyId does not match/u);
});

test("human-legibility and response-space invariants protect the four confirmed mechanic defects", async () => {
  const mutants = [
    ["ACTION_SCENE", "LEG-05", /ACTION_SCENE must require LEG-05/u],
    ["PATTERN_BUILD", "LEG-02", /PATTERN_BUILD must require LEG-02/u],
    ["SHARE_DEAL", "LEG-06", /SHARE_DEAL must require LEG-06/u],
  ];
  for (const [method, invariant, expected] of mutants) {
    const changed = clone(featureMap);
    const feature = changed.features.find((record) => record.inputMethod === method);
    feature.legibilityInvariants = feature.legibilityInvariants.filter((id) => id !== invariant);
    assert.match((await validateFeatureMap(changed, options)).join("\n"), expected);
  }

  const noWrongPath = clone(featureMap);
  const actionScene = noWrongPath.features.find((record) => record.inputMethod === "ACTION_SCENE");
  actionScene.proofs.find((proof) => proof.kind === "response_space").kind = "grading";
  assert.match((await validateFeatureMap(noWrongPath, options)).join("\n"), /ACTION_SCENE requires an observable response_space proof/u);
});

test("every proof gate resolves to one existing owner and observable selector", async () => {
  const missingOwner = clone(featureMap);
  missingOwner.proofGateOwners = missingOwner.proofGateOwners.filter((record) => record.gate !== "QA-008");
  assert.match((await validateFeatureMap(missingOwner, options)).join("\n"), /proof gate QA-008 has no declared owner/u);

  const staleSelector = clone(featureMap);
  staleSelector.proofGateOwners.find((record) => record.gate === "PW-F-06").selector = "PW-F-DOES-NOT-EXIST";
  assert.match((await validateFeatureMap(staleSelector, options)).join("\n"), /proof gate PW-F-06 selector is absent/u);

  const duplicateOwner = clone(featureMap);
  duplicateOwner.proofGateOwners.push(clone(duplicateOwner.proofGateOwners[0]));
  assert.match((await validateFeatureMap(duplicateOwner, options)).join("\n"), /proofGateOwners repeats BEH-07/u);
});

test("AI semantics make identity, joins, predicates, narrative boundaries, and ordering explicit", async () => {
  assert.deepEqual(featureMap.aiReaderContractRef, AI_READER_CONTRACT_REF);
  assert.equal(featureMap.aiSemantics.featureIdentityKey, "id");
  assert.equal(featureMap.aiSemantics.mechanicJoinKey, "inputMethod");
  assert.equal(featureMap.aiSemantics.invariantPredicateKey, "predicate");
  assert.equal(featureMap.aiSemantics.proofKeyTemplate, "{feature.id}#{proof.kind}@{proof.gate}");
  assert.equal(featureMap.aiSemantics.narrativeFieldPolicy, "ANNOTATION_ONLY_NON_NORMATIVE");
  assert.ok(featureMap.proofKindCatalog.every((record) => /^[A-Z][A-Z0-9_]*$/u.test(record.predicate)));
  assert.equal(featureMap.invariants.find((item) => item.id === "LEG-03").predicate, "GRADED_MECHANIC_HAS_REACHABLE_CORRECT_AND_INCORRECT_RESPONSE");
  assert.equal(featureMap.invariants.find((item) => item.id === "LEG-08").predicate, "TUTORIAL_V2_RESOLUTION_DISCLOSURE_PHASE_VISUAL_AND_RETURN_CONTRACT_HOLDS");

  const legacyTutorialProof = clone(featureMap);
  legacyTutorialProof.proofKindCatalog.find((record) => record.kind === "tutorial").predicate = "DIFFERENT_EXAMPLE_TUTORIAL_CONTRACT_HOLDS";
  assert.notDeepEqual(await validateFeatureMapSchema(legacyTutorialProof, FEATURE_MAP_SCHEMA_PATH), []);

  const legacyTutorialInvariant = clone(featureMap);
  legacyTutorialInvariant.invariants.find((record) => record.id === "LEG-08").predicate = "TUTORIAL_DIFFERENT_EXAMPLE_RETURNS_TO_EXACT_UNANSWERED_SOURCE";
  assert.match((await validateFeatureMap(legacyTutorialInvariant, options)).join("\n"), /LEG-08 must own the complete Tutorial V2/u);

  const staleContract = clone(featureMap);
  staleContract.aiReaderContractRef.version = 2;
  assert.notDeepEqual(await validateFeatureMapSchema(staleContract, FEATURE_MAP_SCHEMA_PATH), []);

  const missingPredicate = clone(featureMap);
  missingPredicate.proofKindCatalog = missingPredicate.proofKindCatalog.filter((record) => record.kind !== "response_space");
  assert.notDeepEqual(await validateFeatureMapSchema(missingPredicate, FEATURE_MAP_SCHEMA_PATH), []);

  const narrativeInvariant = clone(featureMap);
  narrativeInvariant.invariants[0].predicate = "Children should understand this";
  assert.notDeepEqual(await validateFeatureMapSchema(narrativeInvariant, FEATURE_MAP_SCHEMA_PATH), []);

  const duplicateInvariantPredicate = clone(featureMap);
  duplicateInvariantPredicate.invariants[1].predicate = duplicateInvariantPredicate.invariants[0].predicate;
  assert.match((await validateFeatureMap(duplicateInvariantPredicate, options)).join("\n"), /invariant predicate repeats/u);

  const duplicateProofKey = clone(featureMap);
  duplicateProofKey.features[0].proofs.push(clone(duplicateProofKey.features[0].proofs[0]));
  assert.match((await validateFeatureMap(duplicateProofKey, options)).join("\n"), /repeats proof kind/u);
});
