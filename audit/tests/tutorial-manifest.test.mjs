import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalizeJson, loadManifest, manifestArtifact } from "../lib/curriculum-manifest.mjs";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { AI_READER_CONTRACT_REF } from "../lib/repository-code-map.mjs";
import {
  loadTutorialManifest,
  tutorialFeatureIdForInputMethod,
  tutorialFeatureInventory,
  validateTutorialManifest,
} from "../lib/tutorial-manifest.mjs";
import {
  assertTutorialEngineContract,
  tutorialSourceQuestion,
} from "./tutorial-engine-contract.mjs";

const root = new URL("../../", import.meta.url);
const curriculumPath = new URL("curriculum/math-quest-manifest-v1.json", root);
const tutorialPath = new URL("curriculum/math-quest-tutorial-manifest-v1.json", root);
const artDesignPath = new URL("audit/art-design-decision-register-v1.json", root);
const indexPath = process.env.MQ_INDEX_PATH || new URL("index.html", root);

const curriculumArtifact = await loadManifest(curriculumPath);
const artDesign = JSON.parse(await readFile(artDesignPath, "utf8"));
const { engine } = await loadShippedEngine(indexPath, {
  filename: process.env.MQ_ENGINE_COVERAGE_FILE,
  timeoutMs: 3_000,
});
const featureInventory = tutorialFeatureInventory(engine);
const inputMethods = Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD).sort();
const childStringIds = engine.CHILD_STRINGS.map((record) => record.id);
const validationOptions = {
  curriculumArtifact,
  artDesign,
  questionGeneratorContractVersion: engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION,
  inputMethods,
  featureInventory,
  childStringIds,
};
const tutorialArtifact = await loadTutorialManifest(tutorialPath, validationOptions);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("tutorial manifest is schema-valid, canonical, embedded exactly, and covers every live method/profile/feature", async () => {
  const issues = await validateTutorialManifest(tutorialArtifact.manifest, validationOptions);
  assert.deepEqual(issues, []);
  assert.equal(tutorialArtifact.manifest.curriculumBinding.skillCount, 126);
  assert.equal(tutorialArtifact.manifest.curriculumBinding.taskObligationCount, 166);
  assert.equal(tutorialArtifact.manifest.tutorialContractVersion, "tutorial-contract-v2");
  assert.equal(tutorialArtifact.manifest.differentExample.automaticInvariantAnswerFallback, "FORBIDDEN");
  assert.deepEqual(tutorialArtifact.manifest.phaseCatalog.map((record) => record.phaseId), ["NOTICE", "PLAN", "CHECK"]);
  assert.equal(tutorialArtifact.manifest.obligationBindings.length, 166);
  assert.deepEqual(tutorialArtifact.manifest.aiReaderContractRef, AI_READER_CONTRACT_REF);
  assert.equal(tutorialArtifact.manifest.aiSemantics.familyResolution, "METHOD_BINDING_ELSE_PROFILE_BINDING");
  assert.equal(tutorialArtifact.manifest.aiSemantics.narrativeFieldPolicy, "NO_NARRATIVE_CONTROL_FIELDS");
  assert.equal(tutorialArtifact.manifest.methodBindings.length, inputMethods.length);
  for (const binding of tutorialArtifact.manifest.methodBindings) assert.equal(binding.featureId, tutorialFeatureIdForInputMethod(binding.inputMethod));
  assert.equal(tutorialArtifact.manifest.profileBindings.length, curriculumArtifact.manifest.generatorProfileEnum.length);
  assert.equal(tutorialArtifact.manifest.featureBindings.length, featureInventory.length);
  assert.equal(canonicalizeJson(engine.TUTORIAL_MANIFEST), canonicalizeJson(tutorialArtifact.manifest));
  assert.equal(engine.TUTORIAL_MANIFEST_SHA256, tutorialArtifact.sha256);
  assert.equal((await readFile(tutorialPath, "utf8")), `${JSON.stringify(tutorialArtifact.manifest, null, 2)}\n`);
});

test("tutorial manifest rejects missing coverage, stale curriculum, and missing child copy", async () => {
  const cases = [
    ["method", (value) => value.methodBindings.pop(), /methodBindings must exactly cover/u],
    ["feature id", (value) => { value.methodBindings[0].featureId = "child.mechanic.stale"; }, /stale featureId/u],
    ["duplicate feature id", (value) => { value.methodBindings[1].featureId = value.methodBindings[0].featureId; }, /repeats featureId/u],
    ["profile", (value) => value.profileBindings.pop(), /profileBindings must exactly cover/u],
    ["feature", (value) => value.featureBindings.pop(), /featureBindings must exactly cover/u],
    ["obligation", (value) => value.obligationBindings.pop(), /obligationBindings must exactly cover/u],
    ["resolution split", (value) => { value.obligationBindings.find((record) => record.resolutionMode === "PROCEDURE_ONLY").resolutionMode = "SAME_TASK_DIFFERENT_ANSWER"; value.obligationBindings.find((record) => record.answerDisclosurePolicy === "PROCEDURE_ONLY_REQUIRED").answerDisclosurePolicy = "DIFFERENT_ANSWER_REQUIRED"; }, /149 same-task/u],
    ["automatic fallback", (value) => { value.differentExample.automaticInvariantAnswerFallback = "ALLOWED"; }, /must be equal to constant/u],
    ["visual anchor", (value) => { value.tutorialFamilies[0].phaseBindings[0].anchorRoleIds[0] = "MISSING_ANCHOR"; }, /unknown anchor/u],
    ["curriculum", (value) => { value.curriculumBinding.projectionSha256 = "0".repeat(64); }, /projectionSha256/u],
    ["string", (value) => { value.tutorialFamilies[0].noticeStringId = "tutorial.missing"; }, /missing child string/u],
    ["AI contract", (value) => { value.aiReaderContractRef.version = 2; }, /must be equal to constant/u],
    ["art design", (value) => { value.artDesignBinding.sha256 = "0".repeat(64); }, /artDesignBinding\.sha256/u],
  ];
  for (const [name, mutate, expected] of cases) {
    const mutant = clone(tutorialArtifact.manifest);
    mutate(mutant);
    const issues = await validateTutorialManifest(mutant, validationOptions);
    assert.match(issues.join("\n"), expected, `${name} mutant must fail closed`);
  }
});

test("every skill/task obligation follows its exact V2 resolution mode without answer-revealing fallback", () => {
  assertTutorialEngineContract(engine, tutorialArtifact.manifest);
});

test("assisted attempts preserve feedback truth while becoming non-evidentiary", () => {
  const source = tutorialSourceQuestion(engine, engine.SKILL_BY_ID["MQ-009"], 0);
  const attempt = engine.submitAnswer(source, { optionId: source.options[source.correctIndex].optionId }, {
    promptFinishedAt: 100,
    submittedAt: 2_000,
    manipulationMs: 100,
    replayMs: 0,
    idleMs: 0,
    hintUsed: false,
    selectionEvents: [{ optionId: source.options[source.correctIndex].optionId, at: 500 }],
    modelUsed: false,
    sessionId: "tutorial-test-session",
    playDay: 1,
  });
  assert.notEqual(attempt.evidenceClass, "NON_EVIDENCE");
  const assisted = engine.suppressAttemptEvidenceForTutorial(attempt);
  assert.equal(assisted.evidenceClass, "NON_EVIDENCE");
  assert.equal(assisted.feedbackClass, attempt.feedbackClass);
  assert.equal(assisted.firstAnswerCorrect, attempt.firstAnswerCorrect);
  assert.equal(assisted.recordId, attempt.recordId);
  assert.equal(assisted.hintUsed, true);
  assert.equal(assisted.modelUsed, true);
  assert.ok(Object.isFrozen(assisted));
});

test("tutorial file artifact hash is canonical JSON, not formatting-dependent prose", () => {
  const artifact = manifestArtifact(tutorialArtifact.manifest);
  assert.equal(artifact.sha256, tutorialArtifact.sha256);
  assert.equal(artifact.canonical, canonicalizeJson(tutorialArtifact.manifest));
});
