import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi } from "./session-fixtures.mjs";
import assert from "node:assert/strict";

async function assertActiveSessionEnvelope({ engine, firstSkillId, rejectState, validState }) {
  for (const [name, mutate] of [
    ["not an object", () => "active"],
    ["session id", (active) => { active.sessionId = 7; }],
    ["play day noninteger", (active) => { active.playDay = 1.5; }],
    ["play day negative", (active) => { active.playDay = -1; }],
    ["play day beyond maximum seen day", (active) => { active.playDay = 22_001; }],
    ["queue type", (active) => { active.queue = null; }],
    ["queue over daily maximum", (active) => {
      active.queue = Array.from(
        { length: engine.CONSTANTS.DAILY_PRACTICE_MAX + 1 },
        (_, ordinal) => ({ skillId: firstSkillId, ordinal }),
      );
    }],
    ["queue slot type", (active) => { active.queue = [null]; }],
    ["queue skill", (active) => { active.queue[0].skillId = "not-a-skill"; }],
    ["queue ordinal noninteger", (active) => { active.queue[0].ordinal = 0.5; }],
    ["queue ordinal negative", (active) => { active.queue[0].ordinal = -1; }],
    ["index noninteger", (active) => { active.index = 0.5; }],
    ["index negative", (active) => { active.index = -1; }],
    ["index beyond queue", (active) => { active.index = active.queue.length + 1; }],
    ["UI type", (active) => { active.uiState = "saved-ui"; }],
  ]) {
    const state = clone(validState);
    const replacement = mutate(state.activeSession);
    if (replacement !== undefined) state.activeSession = replacement;
    await rejectState(`active/${name}`, state, /active session/iu);
  }
}

async function assertActiveSessionQueueBindings({ engine, fullyPopulatedActiveState, rejectState }) {
  for (const [name, mutate] of [
    ["unknown field", (active) => { active.surprise = true; }],
    ["level noninteger", (active) => { active.level = 1.5; }],
    ["level below minimum", (active) => { active.level = engine.CONSTANTS.LEVEL_MIN - 1; }],
    ["level above maximum", (active) => { active.level = engine.CONSTANTS.LEVEL_MAX + 1; }],
    ["stage", (active) => { active.stage = "UNKNOWN"; }],
    ["level-stage mismatch", (active) => { active.level = engine.CONSTANTS.LEVEL_MAX; }],
    ["seed negative", (active) => { active.seed = -1; }],
    ["seed noninteger", (active) => { active.seed = 1.5; }],
    ["seed above uint32", (active) => { active.seed = 2 ** 32; }],
    ["base slots noninteger", (active) => { active.baseSlotCount = 0.5; }],
    ["base slots above daily maximum", (active) => { active.baseSlotCount = engine.CONSTANTS.DAILY_PRACTICE_MAX + 1; }],
    ["practice limit negative", (active) => { active.effectivePracticeLimit = -1; }],
    ["planned count above daily maximum", (active) => { active.effectivePlannedCount = engine.CONSTANTS.DAILY_PRACTICE_MAX + 1; }],
    ["served count noninteger", (active) => { active.servedCount = 0.5; }],
    ["time cap negative", (active) => { active.effectiveTimeCapMs = -1; }],
    ["elapsed time type", (active) => { active.elapsedMs = "0"; }],
    ["adult time reduced type", (active) => { active.adultTimeReduced = 0; }],
    ["one more type", (active) => { active.oneMore = 0; }],
    ["classifications type", (active) => { active.classifications = null; }],
    ["classifications duplicate", (active) => { active.classifications = ["CAP", "CAP"]; }],
    ["classifications empty item", (active) => { active.classifications = [""]; }],
    ["world", (active) => { active.world = "desert"; }],
    ["stop reason", (active) => { active.stopReason = "STOP"; }],
    ["served ordinals type", (active) => { active.servedOrdinals = null; }],
    ["served ordinals over daily maximum", (active) => {
      active.servedOrdinals = Array(engine.CONSTANTS.DAILY_PRACTICE_MAX + 1).fill(0);
    }],
    ["served ordinal noninteger", (active) => { active.servedOrdinals = [0.5]; }],
    ["served ordinal negative", (active) => { active.servedOrdinals = [-1]; }],
    ["served ordinal duplicate", (active) => {
      active.servedOrdinals = [active.queue[0].ordinal, active.queue[0].ordinal];
      active.servedCount = 2;
    }],
    ["served ordinal outside queue", (active) => {
      active.servedOrdinals = [Math.max(...active.queue.map((slot) => slot.ordinal)) + 1];
      active.servedCount = 1;
    }],
    ["served count mismatch", (active) => {
      active.servedOrdinals = [active.queue[0].ordinal];
      active.servedCount = 0;
    }],
    ["queue unknown field", (active) => { active.queue[0].surprise = true; }],
    ["queue base ordinal noninteger", (active) => { active.queue[0].baseOrdinal = 0.5; }],
    ["queue base ordinal negative", (active) => { active.queue[0].baseOrdinal = -1; }],
    ["queue tier", (active) => { active.queue[0].tier = "HARD"; }],
    ["queue representation", (active) => { active.queue[0].representation = ""; }],
    ["queue obligation", (active) => { active.queue[0].obligation = ""; }],
  ]) {
    const state = clone(fullyPopulatedActiveState);
    mutate(state.activeSession);
    await rejectState(`active/full/${name}`, state, /active session/iu);
  }
}

async function assertQueueBooleanFields({ fullyPopulatedActiveState, rejectState }) {
  for (const key of ["scheduledReview", "coldTest", "choicePosition", "mandatorySecondExposure", "preview"]) {
    const state = clone(fullyPopulatedActiveState);
    state.activeSession.queue[0][key] = "false";
    await rejectState(`active/full/queue ${key} boolean`, state, /active session/iu);
  }
}

async function assertUiEnvelope({ rejectUi, selection, validUi }) {
  for (const [name, mutate] of [
    ["not an object", () => "saved-ui"],
    ["version", (ui) => { ui.version = 4; }],
    ["screen", (ui) => { ui.screen = "home"; }],
    ["phase", (ui) => { ui.phase = "answer"; }],
    ["question type", (ui) => { ui.question = "question"; }],
    ["candidate list type", (ui) => { ui.choiceCandidates = null; }],
    ["candidate list too long", (ui) => { ui.choiceCandidates = [selection, selection, selection]; }],
    ["candidate invalid", (ui) => { ui.choiceCandidates = ["question"]; }],
    ["choice resolution type", (ui) => { ui.choiceResolved = []; }],
    ["choice resolution value", (ui) => { ui.choiceResolved = { 0: 2 }; }],
    ["selected type", (ui) => { ui.selected = 0; }],
    ["entry type", (ui) => { ui.entry = 0; }],
    ["fraction parts type", (ui) => { ui.fractionParts = []; }],
    ["fraction whole type", (ui) => { ui.fractionParts.whole = 0; }],
    ["fraction numerator type", (ui) => { ui.fractionParts.numerator = 0; }],
    ["fraction denominator type", (ui) => { ui.fractionParts.denominator = 0; }],
    ["model cells type", (ui) => { ui.modelCells = null; }],
    ["model cells too long", (ui) => { ui.modelCells = Array(21).fill(false); }],
    ["model cell value", (ui) => { ui.modelCells = [0]; }],
    ["feedback type", (ui) => { ui.feedback = 7; }],
    ["last attempt type", (ui) => { ui.lastAttempt = "attempt"; }],
    ["replay time", (ui) => { ui.replayMs = -1; }],
    ["manipulation time", (ui) => { ui.manipulationMs = -1; }],
    ["maximum idle time", (ui) => { ui.maxIdleMs = -1; }],
    ["reteach skill", (ui) => { ui.reteachPending = "not-a-skill"; }],
  ]) {
    const ui = clone(validUi);
    const replacement = mutate(ui);
    await rejectUi(`UI/${name}`, replacement === undefined ? ui : replacement);
  }
}

async function assertUiBooleanFields({ rejectUi, validUi }) {
  for (const key of [
    "modelTouched",
    "hintUsed",
    "selectionChanged",
    "stopRequested",
    "fatiguePending",
    "reteachAdvancesIndex",
    "isReteach",
    "capstoneSubmitted",
  ]) {
    const ui = clone(validUi);
    ui[key] = "false";
    await rejectUi(`UI/${key} boolean`, ui);
  }
}

async function assertChoiceUiBindings({ rejectUi, selection }) {
  await rejectUi("UI/pick on wrong screen", baseUi(selection, {
    screen: "capstone",
    phase: "pick",
    choiceCandidates: [selection, clone(selection)],
  }));
  await rejectUi("UI/pick candidate count", baseUi(selection, { phase: "pick", choiceCandidates: [selection] }));
  await rejectUi("UI/pick question required", baseUi(null, {
    phase: "pick",
    choiceCandidates: [selection, clone(selection)],
  }));
  const pickQuestionMismatch = clone(selection);
  pickQuestionMismatch.questionId = `${selection.questionId}-other`;
  await rejectUi("UI/pick question binding", baseUi(selection, {
    phase: "pick",
    choiceCandidates: [pickQuestionMismatch, clone(selection)],
  }));
  const pickMethodMismatch = clone(selection);
  pickMethodMismatch.inputMethod = `${selection.inputMethod}-other`;
  await rejectUi("UI/pick input method binding", baseUi(selection, {
    phase: "pick",
    choiceCandidates: [clone(selection), pickMethodMismatch],
  }));
}

async function assertFeedbackAndScreenBindings({ attempt, rejectUi, selection }) {
  await rejectUi("UI/question required outside fatigue", baseUi(null));
  await rejectUi("UI/capstone question required", baseUi(null, { screen: "capstone" }));
  await rejectUi("UI/capstone flag required", baseUi(selection, { screen: "capstone" }));
  await rejectUi("UI/feedback text required", baseUi(selection, { phase: "feedback", lastAttempt: attempt }));
  await rejectUi("UI/feedback attempt required", baseUi(selection, { phase: "feedback", feedback: "Saved feedback." }));
  const mismatchedAttempt = clone(attempt);
  mismatchedAttempt.questionId = `${selection.questionId}-other`;
  await rejectUi("UI/feedback question binding", baseUi(selection, {
    phase: "feedback",
    feedback: "Saved feedback.",
    lastAttempt: mismatchedAttempt,
  }));
  await rejectUi("UI/reteach flag required", baseUi(selection, { phase: "reteach", isReteach: false }));
  await rejectUi("UI/selected option must exist", baseUi(selection, { selected: "not-an-option" }));
}

export const savedStateUiSteps = Object.freeze([
  assertActiveSessionEnvelope,
  assertActiveSessionQueueBindings,
  assertQueueBooleanFields,
  assertUiEnvelope,
  assertUiBooleanFields,
  assertChoiceUiBindings,
  assertFeedbackAndScreenBindings,
]);

function questionIdentityAndPromptCases() {
  return [
    ["object", () => "question"],
    ["unknown field", (q) => { q.surprise = true; }],
    ["question id", (q) => { q.questionId = 1; }],
    ["skill id", (q) => { q.skillId = "not-a-skill"; }],
    ["level binding", (q) => { q.level += 1; }],
    ["stage binding", (q) => { q.stage = "UNKNOWN"; }],
    ["task type kind", (q) => { q.taskType = 1; }],
    ["task type declaration", (q) => { q.taskType = "not-a-task-type"; }],
    ["tier", (q) => { q.tier = "HARD"; }],
    ["representation", (q) => { q.representation = ""; }],
    ["input class", (q) => { q.inputClass = "TEXT"; }],
    ["input method", (q) => { q.inputMethod = null; }],
    ["evidence hint", (q) => { q.evidenceHint = "UNKNOWN"; }],
    ["prompt", (q) => { q.prompt = null; }],
    ["prompt empty", (q) => { q.prompt = ""; }],
    ["prompt string id", (q) => { q.promptStringId = ""; }],
    ["semantic prompt string id", (q) => { q.semanticPromptStringId = ""; }],
    ["prompt slots object", (q) => { q.promptSlots = []; }],
    ["prompt slots nonfinite", (q) => { q.promptSlots = { number: Number.POSITIVE_INFINITY }; }],
    ["prompt slots key too long", (q) => { q.promptSlots = { ["x".repeat(201)]: 1 }; }],
    ["prompt slots too many keys", (q) => {
      q.promptSlots = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`k${index}`, index]));
    }],
    ["prompt slots too deep", (q) => {
      let nested = {};
      q.promptSlots = nested;
      for (let depth = 0; depth < 12; depth += 1) {
        nested.next = {};
        nested = nested.next;
      }
    }]
  ];
}

function questionAnswerAndOptionCases({ construction }) {
  return [
    ["answer object", (q) => { q.answer = []; }],
    ["answer unknown field", (q) => { q.answer.surprise = true; }],
    ["answer kind", (q) => { q.answer.kind = null; }],
    ["answer value", (q) => { q.answer.value = 1; }],
    ["answer target form", (q) => { q.answer.targetForm = ""; }],
    ["options list", (q) => { q.options = null; }],
    ["options over maximum", (q) => {
      q.options = Array.from({ length: 21 }, (_, index) => ({
        optionId: `o${index}`,
        label: String(index),
        value: String(index),
      }));
      q.optionCount = q.options.length;
      q.correctIndex = 0;
      q.answer.value = "0";
    }],
    ["correct index integer", (q) => { q.correctIndex = 0.5; }],
    ["option count integer", (q) => { q.optionCount = 0.5; }],
    ["option count matches", (q) => { q.optionCount += 1; }],
    ["option object", (q) => { q.options[0] = null; }],
    ["option unknown field", (q) => { q.options[0].surprise = true; }],
    ["option id", (q) => { q.options[0].optionId = null; }],
    ["option label", (q) => { q.options[0].label = null; }],
    ["option value", (q) => { q.options[0].value = null; }],
    ["option id duplicate", (q) => { q.options[1].optionId = q.options[0].optionId; }],
    ["correct option answer binding", (q) => { q.options[q.correctIndex].value = `${q.answer.value}-other`; }],
    ["selection options required", (q) => { q.options = []; q.optionCount = 0; q.correctIndex = 0; }],
    ["selection index negative", (q) => { q.correctIndex = -1; }],
    ["selection index beyond options", (q) => { q.correctIndex = q.options.length; }],
    ["construction options empty", (q) => {
      q.options = [{ optionId: "o0", label: "one", value: "1" }];
      q.optionCount = 1;
    }, construction],
    ["construction index negative one", (q) => { q.correctIndex = 0; }, construction]
  ];
}

function questionModelAndSeedCases() {
  return [
    ["params object", (q) => { q.params = []; }],
    ["params invalid tree", (q) => { q.params = { value: Number.NaN }; }],
    ["model descriptor object", (q) => { q.modelDescriptor = []; }],
    ["model descriptor type", (q) => { q.modelDescriptor.type = null; }],
    ["model descriptor values", (q) => { q.modelDescriptor.values = []; }],
    ["model instruction", (q) => { q.modelDescriptor.instruction = 1; }],
    ["model instruction id", (q) => { q.modelDescriptor.instructionStringId = ""; }],
    ["template id", (q) => { q.templateId = ""; }],
    ["sample key", (q) => { q.sampleKey = ""; }],
    ["theme", (q) => { q.theme = 1; }],
    ["seed negative", (q) => { q.seed = -1; }],
    ["seed above uint32", (q) => { q.seed = 2 ** 32; }],
    ["ordinal noninteger", (q) => { q.ordinal = 0.5; }],
    ["ordinal negative", (q) => { q.ordinal = -1; }],
    ["eligible ordinal noninteger", (q) => { q.eligibleQuestionOrdinal = 0.5; }],
    ["eligible ordinal negative", (q) => { q.eligibleQuestionOrdinal = -1; }]
  ];
}

const savedQuestionCaseBuilders = [questionIdentityAndPromptCases, questionAnswerAndOptionCases, questionModelAndSeedCases];

async function assertSavedQuestionDiscriminators(context) {
  const { rejectQuestion } = context;
  for (const [name, mutate, source] of savedQuestionCaseBuilders.flatMap(buildCases => buildCases(context))) {
    await rejectQuestion(name, mutate, source);
  }
}

async function assertQuestionBooleanFields({ rejectQuestion }) {
  for (const key of ["preview", "scaffolded", "reteachStep", "capstone", "coldTest", "scheduledReview", "applied"]) {
    await rejectQuestion(`${key} boolean`, (question) => { question[key] = 0; });
  }
}

async function assertAttemptEnvelope({ attempt, rejectUi, selection }) {
  for (const [name, mutate] of [
    ["object", () => "attempt"],
    ["record id", (row) => { row.recordId = null; }],
    ["question id", (row) => { row.questionId = null; }],
    ["skill id", (row) => { row.skillId = "not-a-skill"; }],
    ["feedback class", (row) => { row.feedbackClass = "UNKNOWN"; }],
    ["task type kind", (row) => { row.taskType = null; }],
    ["task type declaration", (row) => { row.taskType = "not-a-task-type"; }],
  ]) {
    const changed = clone(attempt);
    const replacement = mutate(changed);
    await rejectUi(`attempt/${name}`, baseUi(selection, {
      phase: "feedback",
      feedback: "Saved feedback.",
      lastAttempt: replacement === undefined ? changed : replacement,
    }));
  }
}

async function assertAttemptBindings({ rejectUi, selection, submittedAttempt }) {
  for (const [name, mutate] of [
    ["unknown field", (row) => { row.surprise = true; }],
    ["level binding", (row) => { row.level += 1; }],
    ["stage binding", (row) => { row.stage = "UNKNOWN"; }],
    ["tier", (row) => { row.tier = "HARD"; }],
    ["representation", (row) => { row.representation = ""; }],
    ["input class", (row) => { row.inputClass = "TEXT"; }],
    ["input method", (row) => { row.inputMethod = ""; }],
    ["selection count noninteger", (row) => { row.selectionOptionCount = 0.5; }],
    ["selection count negative", (row) => { row.selectionOptionCount = -1; }],
    ["selection count over maximum", (row) => { row.selectionOptionCount = 21; }],
    ["evidence class", (row) => { row.evidenceClass = "UNKNOWN"; }],
    ["sample key", (row) => { row.sampleKey = ""; }],
    ["session id", (row) => { row.sessionId = 1; }],
    ["play day noninteger", (row) => { row.playDay = 1.5; }],
    ["play day negative", (row) => { row.playDay = -1; }],
    ["elapsed", (row) => { row.elapsed = -1; }],
    ["idle time", (row) => { row.idleMs = Number.POSITIVE_INFINITY; }],
  ]) {
    const changed = clone(submittedAttempt);
    mutate(changed);
    await rejectUi(`attempt/full/${name}`, baseUi(selection, {
      phase: "feedback",
      feedback: "Saved feedback.",
      lastAttempt: changed,
    }));
  }
}

async function assertAttemptBooleanFields({ rejectUi, selection, submittedAttempt }) {
  for (const key of [
    "coldTest",
    "scheduledReview",
    "firstAnswerCorrect",
    "hintUsed",
    "changed",
    "validTelemetry",
    "guessingLike",
    "modelUsed",
    "applied",
    "preview",
    "capstone",
    "reteachStep",
  ]) {
    const changed = clone(submittedAttempt);
    changed[key] = 0;
    await rejectUi(`attempt/full/${key} boolean`, baseUi(selection, {
      phase: "feedback",
      feedback: "Saved feedback.",
      lastAttempt: changed,
    }));
  }
}

function assertNestedSaveTransactions({ engine, validState }) {
  const nestedInvalid = clone(validState);
  nestedInvalid.activeSession.uiState.question.optionCount += 1;
  const live = engine.createInitialState(22_000);
  const liveBefore = engine.canonical(live);
  const transactional = engine.importState(live, JSON.stringify(nestedInvalid), 22_000);
  assert.equal(transactional.ok, false);
  assert.equal(transactional.state, live);
  assert.equal(engine.canonical(live), liveBefore);
  assert.throws(() => engine.exportState(nestedInvalid), /active session/iu);
}

export const savedStateQuestionSteps = Object.freeze([
  assertSavedQuestionDiscriminators,
  assertQuestionBooleanFields,
  assertAttemptEnvelope,
  assertAttemptBindings,
  assertAttemptBooleanFields,
  assertNestedSaveTransactions,
]);
