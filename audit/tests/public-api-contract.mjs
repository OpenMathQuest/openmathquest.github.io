import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi, findActiveQuestion } from "./session-fixtures.mjs";
import { apiProgressionSteps, apiFatigueSteps, apiStateSteps } from "./public-api-progression-contract.mjs";

function assertRationalParsing({ engine }) {
  const rationalText = (input) => {
    const parsed = engine.parseRational(input);
    return parsed ? `${parsed.n}/${parsed.d}` : null;
  };
  assert.equal(rationalText(null), null);
  assert.equal(rationalText("1 1/0"), null);
  assert.equal(rationalText("-1 1/2"), "-3/2");
  assert.equal(rationalText("1 1/-2"), "1/2");
  assert.equal(rationalText("+7"), "7/1");
  assert.equal(rationalText(".5"), "1/2");
  assert.equal(rationalText("1."), "1/1");
  assert.equal(rationalText("-.5"), "-1/2");
  assert.equal(rationalText("bad"), null);
}

function assertFractionForms({ engine }) {
  assert.equal(engine.parseFraction(null).reason, "INVALID_FRACTION");
  assert.equal(engine.parseFraction("1/0").reason, "INVALID_FRACTION");
  assert.equal(engine.parseFraction("2", { targetForm: "SIMPLEST" }).valid, true);
  assert.equal(engine.parseFraction("2/1", { targetForm: "SIMPLEST" }).valid, false);
  assert.equal(engine.parseFraction("0 1/2", { targetForm: "MIXED" }).valid, false);
  assert.equal(engine.parseFraction("1 0/2", { targetForm: "MIXED" }).valid, false);
  assert.equal(engine.parseFraction("1 3/2", { targetForm: "MIXED" }).valid, false);
  assert.equal(engine.parseFraction("-1 1/2", { targetForm: "MIXED" }).valid, true);
  assert.equal(engine.parseFraction("1/2", { targetForm: "IMPROPER" }).valid, false);
  assert.equal(engine.parseFraction("-3/2", { targetForm: "IMPROPER" }).valid, true);
  assert.equal(engine.parseFraction(".5", { targetForm: "DECIMAL" }).valid, true);
  assert.equal(engine.parseFraction("+1/2", { targetForm: "CANONICAL" }).valid, false);
}

function assertMalformedScalarAnswers({ engine, selection, textQuestion }) {
  assert.deepEqual(
    clone(engine.gradeAnswer(null, "")),
    { correct: false, valid: false, reason: "invalid-question" },
  );
  const missingOption = engine.gradeAnswer(selection, { optionId: "missing" });
  assert.equal(missingOption.correct, false);
  assert.equal(missingOption.valid, false);
  const emptyObject = engine.gradeAnswer(textQuestion, {});
  assert.equal(emptyObject.correct, false);
  assert.equal(emptyObject.valid, false);
}

function assertRationalGrading({ engine, rationalQuestion }) {
  const badWanted = clone(rationalQuestion);
  badWanted.answer.value = "bad";
  const invalidWanted = engine.gradeAnswer(badWanted, "1/2");
  assert.equal(invalidWanted.correct, false);
  assert.equal(invalidWanted.valid, false);
  assert.equal(invalidWanted.reason, "invalid-number");
  const wanted = clone(rationalQuestion);
  wanted.answer.value = "1/2";
  wanted.answer.targetForm = "VALUE";
  const equivalent = engine.gradeAnswer(wanted, { value: "2/4" });
  assert.equal(equivalent.correct, true);
  assert.equal(equivalent.valid, true);
  const wrong = engine.gradeAnswer(wanted, "1/3");
  assert.equal(wrong.correct, false);
  assert.equal(wrong.valid, true);
}

function assertTextNormalization({ engine, textQuestion }) {
  const normalizedText = clone(textQuestion);
  normalizedText.answer.value = "Yes";
  assert.equal(engine.gradeAnswer(normalizedText, "  yEs  ").correct, true);
  assert.equal(engine.gradeAnswer(normalizedText, null).valid, false);
}

function assertBlankAngleAnswers({ engine }) {
  const zeroAngle = engine.makeQuestion({
    skillId: "MQ-124",
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    seed: 5,
    ordinal: 3,
  });
  assert.equal(Number(zeroAngle.answer.value), 0);
  for (const blank of ["", "   ", null, undefined]) {
    const graded = engine.gradeAnswer(zeroAngle, { degrees: blank });
    assert.equal(graded.valid, false);
    assert.equal(graded.correct, false);
  }
  const serializedBlankAngle = engine.serializeResponse(zeroAngle, { degrees: "" });
  assert.equal(serializedBlankAngle.degrees, null);
  assert.equal(engine.gradeAnswer(zeroAngle, serializedBlankAngle).correct, false);
  assert.equal(engine.gradeAnswer(zeroAngle, { degrees: "0" }).correct, true);
  assert.equal(engine.gradeAnswer(zeroAngle, { degrees: 0 }).correct, true);
}

function assertBlankPlaceValueAnswers({ engine }) {
  const zeroPlace = engine.makeQuestion({
    skillId: "MQ-038",
    tier: "EASY",
    representation: "CONCRETE",
    seed: 0,
    ordinal: 0,
  });
  assert.equal(Number(zeroPlace.answer.value), 0);
  const placeAction = zeroPlace.semanticPromptStringId === "question.renamePlace" ? "trade"
    : zeroPlace.semanticPromptStringId === "question.scalePlace" ? "shift"
      : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(zeroPlace.semanticPromptStringId) ? "partition"
        : "build";
  for (const blank of ["", null]) {
    const graded = engine.gradeAnswer(zeroPlace, { action: placeAction, value: blank });
    assert.equal(graded.valid, false);
    assert.equal(graded.correct, false);
  }
  assert.equal(engine.gradeAnswer(zeroPlace, { action: placeAction, value: "0" }).correct, true);
}

function assertTokenHistoryGrading({ engine }) {
  for (const method of ["SHARE_DEAL", "GROUP_BUILD", "BOND_SPLIT"]) {
    const question = findActiveQuestion(engine, (candidate) => candidate.inputMethod === method);
    const state = engine.createResponseState(question);
    const containers = method === "BOND_SPLIT" ? state.groups : state.recipients;
    const destination = Object.keys(containers)[0];
    const item = state.pool.shift();
    containers[destination].push(item);
    state.history = [[destination, item]];
    const validSave = stateWithUi(engine, baseUi(question, { responseState: state }));
    assert.equal(engine.validateState(validSave), null);
    const wrong = clone(state);
    const otherDestination = Object.keys(containers)[1];
    wrong.history = [[otherDestination, wrong.pool[0]]];
    assert.equal(engine.gradeAnswer(question, wrong).valid, false);
    const hostileSave = stateWithUi(engine, baseUi(question, { responseState: wrong }));
    assert.equal(engine.validateState(hostileSave), "Invalid active session.");
    const liveState = engine.createInitialState(22_000);
    const imported = engine.importState(liveState, JSON.stringify(hostileSave), 22_000);
    assert.equal(imported.ok, false);
    assert.equal(imported.state, liveState);
  }
}

const apiParsingSteps = Object.freeze([
  assertRationalParsing,
  assertFractionForms,
]);

const apiGradingSteps = Object.freeze([
  assertMalformedScalarAnswers,
  assertRationalGrading,
  assertTextNormalization,
  assertBlankAngleAnswers,
  assertBlankPlaceValueAnswers,
  assertTokenHistoryGrading,
]);

function assertEvidenceClassification({ construction, correctSelection, engine, selection, validTelemetry }) {
  const ordinary = engine.submitAnswer(selection, correctSelection, validTelemetry);
  assert.equal(ordinary.evidenceClass, "GUESS_PRONE_SELECTION");
  assert.equal(ordinary.validTelemetry, true);
  assert.equal(ordinary.selectionOptionCount, selection.optionCount);
  for (const key of ["capstone", "scaffolded", "preview"]) {
    const question = clone(selection);
    question[key] = true;
    assert.equal(engine.submitAnswer(question, correctSelection, validTelemetry).evidenceClass, "NON_EVIDENCE");
  }
  for (const telemetry of [
    { ...validTelemetry, promptFinishedAt: -1 },
    { ...validTelemetry, submittedAt: 999 },
    { ...validTelemetry, manipulationMs: 2_500, replayMs: 2_500 },
  ]) {
    const attempt = engine.submitAnswer(selection, correctSelection, telemetry);
    assert.equal(attempt.validTelemetry, false);
    assert.equal(attempt.evidenceClass, "NON_EVIDENCE");
  }
  const constructionAttempt = engine.submitAnswer(construction, construction.answer.value, {});
  assert.equal(constructionAttempt.inputClass, "CONSTRUCTION");
  assert.equal(constructionAttempt.selectionOptionCount, 0);
  assert.equal(constructionAttempt.evidenceClass, "CONSTRUCTION");
  assert.equal(constructionAttempt.idleMs, 0);
}

function assertSelectionEvidenceCounts({ engine, selection, validTelemetry }) {
  const namedTwo = clone(selection);
  const correct = clone(namedTwo.options[namedTwo.correctIndex]);
  const wrong = clone(namedTwo.options.find((option) => option.optionId !== correct.optionId));
  namedTwo.semanticPromptStringId = "question.moneyCompare";
  namedTwo.options = [correct, wrong];
  namedTwo.correctIndex = 0;
  namedTwo.optionCount = 2;
  namedTwo.answer.value = correct.value;
  const namedTwoAttempt = engine.submitAnswer(namedTwo, { optionId: correct.optionId }, validTelemetry);
  assert.equal(namedTwoAttempt.evidenceClass, "GUESS_PRONE_SELECTION");
  const namedOne = clone(namedTwo);
  namedOne.options = [clone(correct)];
  namedOne.optionCount = 1;
  assert.equal(engine.submitAnswer(namedOne, { optionId: correct.optionId }, validTelemetry).evidenceClass, "NON_EVIDENCE");
  const ordinaryThree = clone(selection);
  ordinaryThree.options = ordinaryThree.options.slice(0, 3);
  if (ordinaryThree.correctIndex >= 3) {
    ordinaryThree.options[0] = clone(selection.options[selection.correctIndex]);
    ordinaryThree.correctIndex = 0;
  }
  ordinaryThree.optionCount = 3;
  ordinaryThree.answer.value = ordinaryThree.options[ordinaryThree.correctIndex].value;
  ordinaryThree.semanticPromptStringId = "question.generic";
  assert.equal(
    engine.submitAnswer(
      ordinaryThree,
      { optionId: ordinaryThree.options[ordinaryThree.correctIndex].optionId },
      validTelemetry,
    ).evidenceClass,
    "NON_EVIDENCE",
  );
}

function assertSubmissionMetadataDefaults({ construction, engine }) {
  const fallbackQuestion = clone(construction);
  delete fallbackQuestion.stage;
  delete fallbackQuestion.taskType;
  const fallbackAttempt = engine.submitAnswer(fallbackQuestion, fallbackQuestion.answer.value, {});
  assert.equal(fallbackAttempt.stage, engine.stageForLevel(fallbackQuestion.level));
  assert.equal(
    fallbackAttempt.taskType,
    engine.SKILL_BY_ID[fallbackQuestion.skillId].generatorProfile,
  );
}

function assertRapidAnswerClassification({ correctSelection, engine, selection }) {
  const incorrectRapid = engine.submitAnswer(
    selection,
    { optionId: selection.options[(selection.correctIndex + 1) % selection.options.length].optionId },
    { promptFinishedAt: 1_000, submittedAt: 1_001 },
  );
  assert.equal(incorrectRapid.guessingLike, true);
  const correctRapid = engine.submitAnswer(
    selection,
    correctSelection,
    { promptFinishedAt: 1_000, submittedAt: 1_001 },
  );
  assert.equal(correctRapid.guessingLike, false);
}

function assertUnknownTaskAndChoiceDefaults({ construction, engine, selection }) {
  const fallbackTaskQuestion = clone(construction);
  delete fallbackTaskQuestion.taskType;
  fallbackTaskQuestion.skillId = "not-a-skill";
  assert.equal(
    engine.submitAnswer(fallbackTaskQuestion, fallbackTaskQuestion.answer.value, {}).taskType,
    "",
  );
  const defaultedChoices = engine.makeQuestionChoices({
    skillId: selection.skillId,
    tier: selection.tier,
    representation: selection.representation,
    seed: selection.seed,
  });
  assert.ok(defaultedChoices.length >= 1);
  assert.equal(defaultedChoices[0].ordinal, 0);
  assert.equal(defaultedChoices[0].eligibleQuestionOrdinal, 0);
}

const apiSubmissionSteps = Object.freeze([
  assertEvidenceClassification,
  assertSelectionEvidenceCounts,
  assertSubmissionMetadataDefaults,
  assertRapidAnswerClassification,
  assertUnknownTaskAndChoiceDefaults,
]);

function createPublicApiFixtures({ engine, findQuestion }) {
  const selection = findQuestion(engine, (question) => question.inputClass === "SELECTION" && question.options.length >= 4);
  const construction = findQuestion(engine, (question) => question.inputClass === "CONSTRUCTION");
  const singleTaskConstruction = findQuestion(engine, (question, skill) => (
    question.inputClass === "CONSTRUCTION"
    && skill.constraints.taskTypes.length === 1
  ));
  const rationalQuestion = findQuestion(engine, (question) => (
    question.answer.kind === "rational" && question.inputMethod !== "FRACTION_PARTITION"
  ));
  const textQuestion = findQuestion(engine, (question) => question.answer.kind === "text" && question.inputClass === "SELECTION");
  const correctSelection = { optionId: selection.options[selection.correctIndex].optionId };
  const validTelemetry = {
    promptFinishedAt: 1_000,
    submittedAt: 4_000,
    manipulationMs: 100,
    replayMs: 100,
    idleMs: 0,
    sessionId: "api-session",
    playDay: 22_000,
  };
  return { selection, construction, singleTaskConstruction, rationalQuestion, textQuestion, correctSelection, validTelemetry };
}

const apiBoundaryGroups = Object.freeze([
  ["API-PARSE rational and fraction edge forms", apiParsingSteps],
  ["API-GRADE selection, rational, and text defensive paths", apiGradingSteps],
  ["API-SUBMIT evidence and telemetry discriminators", apiSubmissionSteps],
  ["API-PROGRESSION spacing, fast track, re-teaching, and promotion edges", apiProgressionSteps],
  ["API-FATIGUE stop classification and feedback branches", apiFatigueSteps],
  ["API-STATE and session builders expose fail-closed fallbacks", apiStateSteps],
]);

export async function registerPublicEngineBoundaryTests(t, engine, findQuestion) {
  const context = { engine, findQuestion };
  Object.assign(context, createPublicApiFixtures(context));
  for (const [name, steps] of apiBoundaryGroups) {
    await t.test(name, () => {
      const local = { ...context };
      for (const step of steps) Object.assign(local, step(local));
    });
  }
}
