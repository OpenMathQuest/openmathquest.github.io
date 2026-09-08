import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi, findActiveQuestion, makeSessionCheckpointQuestion, canonicalActiveSlot, questionsForActiveSlot } from "./session-fixtures.mjs";
import { savedStateRootSetupSteps, savedStateRootFinalSteps, savedStateMigrationSteps } from "./saved-state-root-contract.mjs";
import { savedStateUiSteps, savedStateQuestionSteps } from "./saved-state-question-contract.mjs";

function createSavedStateFixtures({ engine, validAttemptFor }) {
  const selection = findActiveQuestion(
    engine,
    (question) => question.inputClass === "SELECTION" && question.options.length >= 2,
  );
  const construction = findActiveQuestion(engine, (question) => question.inputClass === "CONSTRUCTION");
  const capstone = makeSessionCheckpointQuestion(engine, {
    skillId: selection.skillId,
    seed: 0x6d617468,
    theme: "ocean",
  }, { kind: "capstone" });
  const attempt = validAttemptFor(selection);
  const validUi = baseUi(selection);
  const validState = stateWithUi(engine, validUi);
  assert.equal(validState.settings.speechEnabled, false, "automatic read-aloud must default off");
  assert.equal(validState.settings.soundEnabled, false, "sound effects must default off");
  const submittedAttempt = engine.submitAnswer(
    selection,
    { optionId: selection.options[selection.correctIndex].optionId },
    {
      promptFinishedAt: 1_000,
      submittedAt: 4_000,
      manipulationMs: 100,
      replayMs: 100,
      idleMs: 0,
      sessionId: "coverage-session",
      playDay: 22_000,
    },
  );
  return { selection, construction, capstone, attempt, validUi, validState, submittedAttempt };
}

function createSavedStateAssertions({ construction, engine, selection, t, validState }) {
  const accept = async (name, state) => t.test(`SAVE-VALID ${name}`, () => {
    assert.equal(engine.validateState(state), null);
    const serialized = engine.exportState(state);
    const loaded = engine.loadState(serialized, 22_001);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.maxSeenPlayDay, 22_001);
  });
  const rejectState = async (name, state, expected = null) => t.test(`SAVE-REJECT ${name}`, () => {
    const error = engine.validateState(state);
    assert.equal(typeof error, "string", `${name} unexpectedly passed validation`);
    if (expected) assert.match(error, expected);
  });
  const rejectUi = (name, ui) => rejectState(name, stateWithUi(engine, ui), /active session/iu);
  const rejectQuestion = (name, mutate, source = selection) => {
    const question = clone(source);
    const replacement = mutate(question);
    const state = source === construction
      ? stateWithUi(engine, baseUi(construction))
      : clone(validState);
    state.activeSession.uiState.question = replacement === undefined ? question : replacement;
    return rejectState(`question/${name}`, state, /active session/iu);
  };
  return { accept, rejectState, rejectUi, rejectQuestion };
}

const savedStateFixtureSteps = Object.freeze([
  createSavedStateFixtures,
  createSavedStateAssertions,
]);

async function assertInitialSavedModes({ accept, construction, engine, rejectUi, selection, validState, validUi }) {
  await accept("question phase", validState);
  const fullyPopulatedActiveState = stateWithUi(engine, validUi);
  await accept("fully populated active session", fullyPopulatedActiveState);
  const previewQuestion = findActiveQuestion(
    engine,
    (question) => question.skillId === selection.skillId,
    { preview: true, skillId: selection.skillId },
  );
  const configuredState = stateWithUi(engine, baseUi(previewQuestion));
  configuredState.settings.grownUpSoftTimeCapMs = 60_000;
  await accept("valid preview and minimum time cap", configuredState);
  assert.equal(engine.loadState(clone(validState), 22_000).ok, true, "object-form save loads through defensive clone");
  await accept("construction question", stateWithUi(engine, baseUi(construction)));
  const guideQuestion = findActiveQuestion(
    engine,
    (question) => question.skillId === "MQ-048" && !question.preview && !question.scaffolded,
    { skillId: "MQ-048" },
  );
  await accept(
    "MQ-048 practice-token guide",
    stateWithUi(engine, baseUi(guideQuestion, { phase: "practice-token-guide" })),
  );
  await rejectUi(
    "non-MQ-048 practice-token guide",
    baseUi(selection, { phase: "practice-token-guide" }),
  );
  return { fullyPopulatedActiveState, guideQuestion };
}

function assertVersionTwoPhaseMigration({ engine, guideQuestion, selection }) {
  const assertV2Migration = (label, state, expectedPhase) => {
    const before = clone(state.activeSession);
    const loaded = engine.loadState(JSON.stringify(state), 22_000);
    assert.equal(loaded.ok, true, `${label} must load`);
    assert.equal(loaded.migrated, true, `${label} must report migration`);
    const expected = clone(before);
    expected.uiState.version = engine.CONSTANTS.ACTIVE_UI_VERSION;
    expected.uiState.phase = expectedPhase;
    assert.deepEqual(
      JSON.parse(JSON.stringify(loaded.state.activeSession)),
      JSON.parse(JSON.stringify(expected)),
      `${label} must preserve the exact active session`,
    );
  };
  assertV2Migration(
    "v2 generic physical checkpoint",
    stateWithUi(engine, baseUi(selection, { version: 2, phase: "physical" })),
    "question",
  );
  assertV2Migration(
    "v2 MQ-048 physical checkpoint",
    stateWithUi(engine, baseUi(guideQuestion, { version: 2, phase: "physical" })),
    "practice-token-guide",
  );
  assertV2Migration(
    "v2 ordinary question checkpoint",
    stateWithUi(engine, baseUi(selection, { version: 2, phase: "question" })),
    "question",
  );
}

async function assertReteachAndChoiceModes({ accept, engine, selection }) {
  const reteachQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: selection.skillId,
    seed: selection.seed,
    theme: selection.theme,
  }, { kind: "reteach" });
  await accept("reteach phase", stateWithUi(engine, baseUi(reteachQuestion, { phase: "reteach", isReteach: true })));
  const selectionSlot = canonicalActiveSlot(
    engine,
    engine.SKILL_BY_ID[selection.skillId],
    selection.eligibleQuestionOrdinal,
  );
  assert.equal(selectionSlot.choicePosition, true, "selection coverage fixture must occupy a choice slot");
  const pickCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[selection.skillId],
    selection.eligibleQuestionOrdinal,
  );
  assert.equal(pickCandidates.length, 2);
  await accept("pick phase", stateWithUi(engine, baseUi(pickCandidates[0], {
    phase: "pick",
    choiceCandidates: clone(pickCandidates),
  })));
}

async function assertFeedbackAndAssistanceModes({ accept, capstone, engine, selection, submittedAttempt }) {
  const feedbackLine = engine.feedbackLine(submittedAttempt, 0, []);
  let feedbackState = stateWithUi(engine, baseUi(selection, {
    phase: "feedback",
    selected: selection.options[selection.correctIndex].optionId,
    feedback: feedbackLine,
    lastAttempt: submittedAttempt,
  }));
  feedbackState = engine.applyAttempt(feedbackState, submittedAttempt).state;
  feedbackState.feedbackHistory.push({
    stage: submittedAttempt.stage,
    branch: submittedAttempt.feedbackClass,
    line: feedbackLine,
    sessionId: submittedAttempt.sessionId,
    playDay: submittedAttempt.playDay,
    recordId: submittedAttempt.recordId,
    questionId: submittedAttempt.questionId,
  });
  await accept("feedback phase", feedbackState);
  const pendingFeedbackState = stateWithUi(engine, baseUi(selection, {
    phase: "feedback",
    selected: selection.options[selection.correctIndex].optionId,
    feedback: feedbackLine,
    lastAttempt: submittedAttempt,
    attemptCommitted: false,
  }));
  await accept("pending feedback survives reload before its attempt is committed", pendingFeedbackState);
  await accept("open tutorial and exact step survive reload", stateWithUi(engine, baseUi(selection, {
    selected: selection.options[selection.correctIndex].optionId,
    modelTouched: true,
    hintUsed: true,
    tutorialOpen: true,
    tutorialStep: 2,
  })));
  await accept("capstone question", stateWithUi(engine, baseUi(capstone, { screen: "capstone" })));
  await accept("fatigue without a question", stateWithUi(engine, baseUi(null, { screen: "fatigue" })));
  return { feedbackLine };
}

async function assertSavedSessionPresence({ accept, feedbackLine, rejectState, rejectUi, selection, submittedAttempt, validState }) {
  const optionalMaxIdle = clone(validState);
  delete optionalMaxIdle.activeSession.uiState.maxIdleMs;
  await accept("legacy snapshot without max idle", optionalMaxIdle);
  const noIndex = clone(validState);
  delete noIndex.activeSession.index;
  await rejectState("active session UI without index", noIndex, /active session/iu);
  const noIndexOrUi = clone(validState);
  delete noIndexOrUi.activeSession.index;
  delete noIndexOrUi.activeSession.uiState;
  await rejectState("active session without index or UI", noIndexOrUi, /active session/iu);
  const noUi = clone(validState);
  delete noUi.activeSession.uiState;
  await rejectState("active session without UI", noUi, /active session/iu);
  const inactive = clone(validState);
  inactive.activeSession = null;
  await accept("no active session", inactive);
  await rejectUi("tutorial open without assisted-attempt marker", baseUi(selection, {
    tutorialOpen: true,
    tutorialStep: 2,
  }));
  await rejectUi("tutorial open during feedback", baseUi(selection, {
    phase: "feedback",
    feedback: feedbackLine,
    lastAttempt: submittedAttempt,
    attemptCommitted: false,
    modelTouched: true,
    hintUsed: true,
    tutorialOpen: true,
    tutorialStep: 2,
  }));
}

const savedStatePhaseSteps = Object.freeze([
  assertInitialSavedModes,
  assertVersionTwoPhaseMigration,
  assertReteachAndChoiceModes,
  assertFeedbackAndAssistanceModes,
  assertSavedSessionPresence,
]);

const savedStateSteps = Object.freeze([
  ...savedStateFixtureSteps,
  ...savedStatePhaseSteps,
  ...savedStateRootSetupSteps,
  ...savedStateMigrationSteps,
  ...savedStateRootFinalSteps,
  ...savedStateUiSteps,
  ...savedStateQuestionSteps,
]);

export async function registerSavedStateContracts(t, engine, validAttemptFor) {
  const context = { t, engine, validAttemptFor };
  for (const step of savedStateSteps) Object.assign(context, await step(context));
}
