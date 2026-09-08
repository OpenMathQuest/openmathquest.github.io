import { cloneJson as clone } from "../lib/test-harness.mjs";

export function canonicalActiveSlot(engine, skill, index, { preview = false } = {}) {
  const available = skill.phases.filter((phase) => ["C", "P", "A"].includes(phase));
  const phase = available[Math.min(index, Math.max(0, available.length - 1))] || available[0] || "P";
  const representation = { C: "CONCRETE", P: "PICTORIAL", A: "ABSTRACT" }[phase] || "PICTORIAL";
  const choicePosition = engine.choicePositions({
    stage: skill.stage,
    effectivePlannedCount: index + 1,
  }).includes(index + 1);
  return {
    skillId: skill.skillId,
    ordinal: index,
    baseOrdinal: index,
    tier: index % 3 === 2 ? "HARD/TARGET" : "EASY",
    representation,
    scheduledReview: false,
    coldTest: false,
    choicePosition,
    mandatorySecondExposure: false,
    obligation: preview ? "PREVIEW" : "NEW",
    preview,
  };
}

export function questionsForActiveSlot(engine, skill, index, { preview = false } = {}) {
  const slot = canonicalActiveSlot(engine, skill, index, { preview });
  const args = {
    ...slot,
    theme: "ocean",
    seed: 0x6d617468,
    ordinal: slot.choicePosition ? slot.ordinal * 2 : slot.ordinal,
    eligibleQuestionOrdinal: slot.baseOrdinal,
  };
  return slot.choicePosition ? engine.makeQuestionChoices(args) : [engine.makeQuestion(args)];
}

export function baseUi(question, overrides = {}) {
  return {
    version: 3,
    screen: "session",
    phase: "question",
    question,
    choiceCandidates: [],
    choiceResolved: {},
    selected: null,
    entry: "",
    fractionParts: { whole: "", numerator: "", denominator: "" },
    modelCells: [],
    modelTouched: false,
    hintUsed: false,
    tutorialOpen: false,
    tutorialStep: 1,
    selectionChanged: false,
    feedback: null,
    lastAttempt: null,
    attemptCommitted: true,
    replayMs: 0,
    manipulationMs: 0,
    maxIdleMs: 0,
    stopRequested: false,
    fatiguePending: false,
    reteachPending: null,
    reteachAdvancesIndex: false,
    isReteach: false,
    capstoneSubmitted: false,
    ...overrides,
  };
}

function uiScope(savedUi) {
  return {
    question: savedUi?.question || null,
    pick: savedUi?.phase === "pick",
    capstone: savedUi?.screen === "capstone",
    reteach: Boolean(savedUi?.isReteach),
  };
}

function activeQuestionContext(engine, scope) {
  const { question, capstone, reteach } = scope;
  const skill = question ? engine.SKILL_BY_ID[question.skillId] : null;
  const ordinary = Boolean(question && skill && !capstone && !reteach);
  const targetIndex = ordinary && Number.isInteger(question.eligibleQuestionOrdinal)
    ? question.eligibleQuestionOrdinal : 0;
  return { ...scope, skill, ordinary, targetIndex };
}

function activeFixtureQueue(engine, context) {
  const { question, skill, ordinary, targetIndex } = context;
  const queueLength = question && skill ? Math.max(1, targetIndex + 1) : 0;
  return Array.from({ length: queueLength }, (_, index) => canonicalActiveSlot(engine, skill, index, {
    preview: ordinary && Boolean(question.preview),
  }));
}

function fixtureServedLength(queue, context, savedUi) {
  if (!queue.length) return 0;
  if (context.pick) return context.targetIndex;
  if (context.reteach) return context.targetIndex + (savedUi.reteachAdvancesIndex ? 1 : 0);
  return context.targetIndex + 1;
}

function resolvedChoiceForSlot(engine, context, slot) {
  const { question, skill, ordinary, targetIndex } = context;
  const candidates = questionsForActiveSlot(engine, skill, slot.ordinal, {
    preview: ordinary && Boolean(question.preview),
  });
  if (candidates.length !== 2) return null;
  const variant = ordinary && slot.ordinal === targetIndex
    ? candidates.findIndex((candidate) => engine.canonical(candidate) === engine.canonical(question))
    : 0;
  return variant >= 0 ? variant : 0;
}

function completeChoiceResolutions(engine, context, servedSlots, savedUi) {
  const current = savedUi?.choiceResolved;
  if (!current || typeof current !== "object" || Array.isArray(current)) return;
  const choiceResolved = { ...current };
  for (const slot of servedSlots) {
    const key = String(slot.ordinal);
    if (!slot.choicePosition || Object.hasOwn(choiceResolved, key)) continue;
    const variant = resolvedChoiceForSlot(engine, context, slot);
    if (variant !== null) choiceResolved[key] = variant;
  }
  savedUi.choiceResolved = choiceResolved;
}

function applyFixtureProgress(state, savedUi, context) {
  const { question, capstone, reteach } = context;
  if (question?.preview && !capstone && !reteach) state.previewLevel = question.level;
  if (question && !question.preview && Number.isInteger(question.level)) {
    state.earnedLevel = Math.max(state.earnedLevel, question.level);
  }
  if (reteach && savedUi.phase === "reteach") {
    state.reteachQueue = [{
      skillId: question.skillId,
      reason: "SAME_SESSION",
      sessionId: "coverage-session",
      recordId: "coverage-reteach",
      playDay: 22_000,
    }];
  }
}

function activeSessionFixture(engine, state, savedUi, context) {
  const { question, queue, servedLength, targetIndex } = context;
  return {
    sessionId: "coverage-session",
    playDay: 22_000,
    level: question?.level ?? state.earnedLevel,
    stage: question?.stage ?? engine.stageForLevel(state.earnedLevel),
    seed: question?.seed ?? state.seed,
    queue,
    baseSlotCount: queue.length,
    effectivePracticeLimit: queue.length,
    effectivePlannedCount: queue.length,
    effectiveTimeCapMs: 60_000,
    adultTimeReduced: true,
    classifications: [],
    index: targetIndex,
    world: question?.theme || "ocean",
    servedCount: servedLength,
    servedOrdinals: queue.slice(0, servedLength).map((slot) => slot.ordinal),
    elapsedMs: 0,
    stopReason: null,
    oneMore: false,
    uiState: savedUi,
  };
}

export function stateWithUi(engine, uiState) {
  const state = engine.createInitialState(22_000);
  const savedUi = clone(uiState);
  const context = activeQuestionContext(engine, uiScope(savedUi));
  const queue = activeFixtureQueue(engine, context);
  const servedLength = fixtureServedLength(queue, context, savedUi);
  completeChoiceResolutions(engine, context, queue.slice(0, servedLength), savedUi);
  applyFixtureProgress(state, savedUi, context);
  state.activeSession = activeSessionFixture(engine, state, savedUi, { ...context, queue, servedLength });
  return state;
}

export function findActiveQuestion(engine, predicate, { preview = false, skillId = null } = {}) {
  const skills = skillId ? [engine.SKILL_BY_ID[skillId]].filter(Boolean) : engine.SKILLS;
  for (const skill of skills) {
    const planned = engine.CONSTANTS.SESSION_PLANNED_BY_STAGE[skill.stage];
    for (let index = 0; index < planned; index += 1) {
      for (const question of questionsForActiveSlot(engine, skill, index, { preview })) {
        if (predicate(question, skill)) return question;
      }
    }
  }
  throw new Error("No canonical active-session question satisfies the coverage fixture.");
}

export function choiceResolutionsForActivated(engine, active, activatedCount = active.servedCount) {
  const choiceResolved = {};
  for (const slot of active.queue.slice(0, activatedCount)) {
    if (!slot.choicePosition) continue;
    const candidates = engine.makeQuestionChoices({
      ...slot,
      theme: active.world,
      seed: active.seed,
      ordinal: slot.ordinal * 2,
      eligibleQuestionOrdinal: slot.baseOrdinal ?? slot.ordinal,
    });
    if (candidates.length === 2) choiceResolved[String(slot.ordinal)] = 0;
  }
  return choiceResolved;
}

export function makeSessionCheckpointQuestion(engine, source, { kind, index = 0 }) {
  const capstone = kind === "capstone";
  if (!capstone && kind !== "reteach") throw new Error("Unknown session checkpoint fixture kind.");
  return engine.makeQuestion({
    skillId: source.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: source.seed,
    ordinal: capstone ? 1_001 : 9_000 + index,
    eligibleQuestionOrdinal: capstone ? 0 : index,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: source.theme,
    scaffolded: true,
    [capstone ? "capstone" : "reteachStep"]: true,
  });
}
