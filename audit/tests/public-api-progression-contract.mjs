import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";

function assertSpacingTransitions({ engine }) {
  const spacingRecord = { intervalIndex: 0, dueDay: null };
  assert.deepEqual(
    clone(engine.updateSpacing({ record: spacingRecord, attempt: null, playDay: -1 })),
    spacingRecord,
  );
  const cleanSpacing = engine.updateSpacing({
    record: spacingRecord,
    attempt: { feedbackClass: "FIRST_TRY_CLEAN", playDay: 10 },
  });
  assert.equal(cleanSpacing.intervalIndex, 1);
  assert.equal(cleanSpacing.lastSpacingDay, 10);
  const resetSpacing = engine.updateSpacing({
    record: { intervalIndex: 4, dueDay: 20 },
    attempt: { feedbackClass: "INCORRECT", playDay: 10 },
  });
  assert.equal(resetSpacing.intervalIndex, 0);
  assert.equal(resetSpacing.dueDay, 11);
}

function assertFastTrackTransitions({ engine }) {
  assert.equal(engine.updateFastTrackEligibility({
    current: "FAST_TRACK_ELIGIBLE",
    attempt: { evidenceClass: "NON_EVIDENCE" },
  }), "FAST_TRACK_ELIGIBLE");
  assert.equal(engine.updateFastTrackEligibility({
    current: "FAST_TRACK_ELIGIBLE",
    attempt: {
      evidenceClass: "GUESS_PRONE_SELECTION",
      inputClass: "SELECTION",
      selectionOptionCount: 3,
      feedbackClass: "FIRST_TRY_CLEAN",
    },
  }), "STANDARD_ONLY");
  assert.equal(engine.updateFastTrackEligibility({
    current: "FAST_TRACK_ELIGIBLE",
    attempt: { evidenceClass: "CONSTRUCTION", inputClass: "CONSTRUCTION", feedbackClass: "FIRST_TRY_CLEAN" },
  }), "FAST_TRACK_ELIGIBLE");
  assert.equal(engine.updateFastTrackEligibility({
    current: "FAST_TRACK_ELIGIBLE",
    attempt: { evidenceClass: "CONSTRUCTION", inputClass: "CONSTRUCTION", feedbackClass: "INCORRECT" },
  }), "STANDARD_ONLY");
}

function assertLevelReteachEdges({ engine }) {
  assert.equal(engine.evaluateLevelReteaching().count, 0);
  const prerequisiteSkill = engine.SKILL_BY_ID["MQ-002"];
  const misses = Array.from({ length: engine.CONSTANTS.LEVEL_RETEACH_WINDOW }, (_, index) => ({
    recordId: `m${index}`,
    skillId: prerequisiteSkill.skillId,
    level: prerequisiteSkill.level,
    feedbackClass: "INCORRECT",
    evidenceClass: "CONSTRUCTION",
    coldTest: true,
  }));
  const reteach = engine.evaluateLevelReteaching({ coldTests: misses, currentLevel: prerequisiteSkill.level });
  assert.equal(reteach.active, true);
  assert.deepEqual([...reteach.targets], [...prerequisiteSkill.prerequisites]);
  const eightClean = misses.map((row, index) => ({
    ...row,
    feedbackClass: index < 8 ? "FIRST_TRY_CLEAN" : "INCORRECT",
  }));
  assert.equal(
    engine.evaluateLevelReteaching({ coldTests: eightClean, currentLevel: prerequisiteSkill.level }).active,
    false,
  );
  const excluded = misses.map((row, index) => (
    index === 0 ? { ...row, coldTest: false } : row
  ));
  assert.equal(
    engine.evaluateLevelReteaching({ coldTests: excluded, currentLevel: prerequisiteSkill.level }).count,
    engine.CONSTANTS.LEVEL_RETEACH_WINDOW - 1,
  );
}

function assertPromotionDefaults({ engine }) {
  assert.equal(engine.evaluatePromotion().promote, false);
  const initial = engine.createInitialState(0);
  assert.equal(engine.evaluatePromotion({ state: initial, currentLevel: 999 }).promote, false);
  assert.equal(engine.evaluatePromotion({ state: initial }).ratio, 0);
}

function assertRepeatedMissEdges({ engine }) {
  assert.equal(engine.evaluateRepeatedMissReteach().active, false);
  const oneMiss = [{ recordId: "m1", sessionId: "s1", feedbackClass: "INCORRECT" }];
  assert.equal(engine.evaluateRepeatedMissReteach({ stage: "PRE_K", attempts: oneMiss }).sameSession, true);
  assert.equal(engine.evaluateRepeatedMissReteach({ stage: "K", attempts: oneMiss }).sameSession, false);
  assert.equal(engine.evaluateRepeatedMissReteach({
    stage: "K",
    attempts: [...oneMiss, { recordId: "m2", sessionId: "s1", feedbackClass: "INCORRECT" }],
  }).sameSession, true);
  const chronic = engine.evaluateRepeatedMissReteach({
    stage: "K",
    attempts: [
      { recordId: "m1", sessionId: "s1", feedbackClass: "INCORRECT" },
      { recordId: "c1", sessionId: "s1", feedbackClass: "FIRST_TRY_CLEAN" },
      { recordId: "m2", sessionId: "s2", feedbackClass: "INCORRECT" },
      { recordId: "c2", sessionId: "s2", feedbackClass: "FIRST_TRY_CLEAN" },
      { recordId: "m3", sessionId: "s2", feedbackClass: "INCORRECT" },
    ],
  });
  assert.equal(chronic.chronic, true);
  assert.match(chronic.triggerKey, /^CHRONIC:/u);
}

function assertFatigueSignals({ engine }) {
  const stage = engine.SKILLS[0].stage;
  assert.equal(engine.computeFatigue().offerStop, false);
  assert.equal(engine.computeFatigue({ stage, attempts: [], priorGuessingLikeStreak: "bad" }).guessingLikeStreak, 0);
  const rapid = {
    inputClass: "SELECTION",
    feedbackClass: "INCORRECT",
    elapsed: engine.CONSTANTS.RAPID_SELECTION_MS_BY_STAGE[stage],
    idleMs: 0,
  };
  assert.equal(engine.computeFatigue({ stage, attempts: [rapid], priorGuessingLikeStreak: 1 }).guessingLikeStreak, 2);
  assert.equal(engine.computeFatigue({
    stage,
    attempts: [{ ...rapid, feedbackClass: "FIRST_TRY_CLEAN" }],
    priorGuessingLikeStreak: 2,
  }).guessingLikeStreak, 0);
  assert.equal(engine.computeFatigue({
    stage,
    attempts: [{ ...rapid, elapsed: engine.CONSTANTS.RAPID_SELECTION_MS_BY_STAGE[stage] + 1 }],
    priorGuessingLikeStreak: 2,
  }).guessingLikeStreak, 0);
  const rising = Array.from({ length: engine.CONSTANTS.FATIGUE_WINDOW_ATTEMPTS }, (_, index) => ({
    ...rapid,
    inputClass: "CONSTRUCTION",
    elapsed: index * engine.CONSTANTS.FATIGUE_SLOPE_MS_BY_STAGE[stage],
  }));
  assert.equal(engine.computeFatigue({ stage, attempts: rising }).signals.rising, true);
  const idle = engine.computeFatigue({
    stage,
    attempts: [{ ...rapid, idleMs: engine.CONSTANTS.IDLE_MS_BY_STAGE[stage] }],
  });
  assert.equal(idle.signals.idle, true);
  return { stage };
}

function assertSessionStopDefaults({ engine }) {
  assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: -1 })], []);
  assert.equal(engine.classifySessionStop().stateClassification, "NATURAL");
  const unknown = engine.classifySessionStop({ reason: "CUSTOM", activeReteach: 0, capstonePending: 0 });
  assert.equal(unknown.stateClassification, "CUSTOM");
  assert.equal(unknown.finishReteach, false);
  assert.equal(unknown.runCapstone, false);
}

function assertFeedbackBranches({ engine, stage }) {
  const baseAttempt = { skillId: engine.SKILLS[0].skillId, stage };
  const clean = engine.feedbackLine(baseAttempt, 0, null);
  const incorrect = engine.feedbackLine({ ...baseAttempt, feedbackClass: "INCORRECT" }, 0, []);
  const struggle = engine.feedbackLine({ ...baseAttempt, feedbackClass: "CORRECT_WITH_STRUGGLE" }, 0, []);
  assert.notEqual(clean, incorrect);
  assert.notEqual(clean, struggle);
  assert.notEqual(incorrect, struggle);
  const skipped = engine.feedbackLine(
    { ...baseAttempt, feedbackClass: "INCORRECT" },
    0,
    [{ stage, branch: "INCORRECT", line: incorrect }],
  );
  assert.notEqual(skipped, incorrect);
  assert.equal(
    engine.feedbackLine(
      { ...baseAttempt, feedbackClass: "INCORRECT" },
      0,
      [{ stage: "OTHER", branch: "INCORRECT", line: incorrect }],
    ),
    incorrect,
  );
}

function assertChildStringFailures({ engine }) {
  assert.throws(() => engine.renderChildString("missing.child.string"), /Unknown child string/u);
  const slotted = engine.CHILD_STRINGS.find((record) => /\{[A-Za-z]/u.test(record.text));
  assert.ok(slotted);
  assert.throws(() => engine.renderChildString(slotted.id), /Missing child string slot/u);
}

export const apiProgressionSteps = Object.freeze([
  assertSpacingTransitions,
  assertFastTrackTransitions,
  assertLevelReteachEdges,
  assertPromotionDefaults,
  assertRepeatedMissEdges,
]);

export const apiFatigueSteps = Object.freeze([
  assertFatigueSignals,
  assertSessionStopDefaults,
  assertFeedbackBranches,
  assertChildStringFailures,
]);

function createStateApiFixtures({ engine }) {
  assert.equal(engine.loadState("", -1).state.maxSeenPlayDay, 0);
  assert.equal(engine.loadState("{", 0).ok, false);
  const initial = engine.createInitialState(22_000);
  assert.equal(engine.loadState(initial, -1).state.maxSeenPlayDay, 22_000);
  const evidenceAttempt = (skill, overrides = {}) => ({
    recordId: `api-${skill.skillId}-${overrides.playDay ?? 22_001}`,
    questionId: `api-question-${skill.skillId}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType: skill.constraints.taskTypes[0],
    tier: "HARD/TARGET",
    representation: "ABSTRACT",
    inputClass: "CONSTRUCTION",
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: false,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|api-sample-${overrides.playDay ?? 22_001}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 0,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: true,
    applied: true,
    preview: false,
    capstone: false,
    sessionId: "api-session",
    playDay: 22_001,
    ...overrides,
  });
  return { initial, evidenceAttempt };
}

function assertRejectedAndPreviewAttempts({ construction, engine, initial, validTelemetry }) {
  const missingDefaults = clone(initial);
  delete missingDefaults.reteachQueue;
  delete missingDefaults.levelReteachTargetSince;
  const rejected = engine.applyAttempt(missingDefaults, null);
  assert.equal(rejected.effects[0].type, "REJECTED_ATTEMPT");
  assert.deepEqual(clone(rejected.state.reteachQueue), []);
  assert.deepEqual(clone(rejected.state.levelReteachTargetSince), {});
  const previewAttempt = { ...clone(engine.submitAnswer(construction, construction.answer.value, validTelemetry)), preview: true };
  assert.deepEqual(clone(engine.applyAttempt(initial, previewAttempt).effects), []);
}

function assertReteachAttemptCompletion({ construction, engine, initial, validTelemetry }) {
  const reteachState = clone(initial);
  reteachState.reteachQueue = [{ skillId: construction.skillId, reason: "SAME_SESSION" }];
  const reteachAttempt = {
    ...clone(engine.submitAnswer(construction, construction.answer.value, validTelemetry)),
    evidenceClass: "NON_EVIDENCE",
    reteachStep: true,
  };
  const completedReteach = engine.applyAttempt(reteachState, reteachAttempt);
  assert.equal(completedReteach.effects[0].type, "RETEACH_STEP_COMPLETE");
  assert.equal(completedReteach.state.reteachQueue.some((row) => row.skillId === construction.skillId), false);
}

function assertTaskAndPracticeEligibility({ construction, engine, initial, validTelemetry }) {
  const missingTaskType = clone(engine.submitAnswer(construction, construction.answer.value, validTelemetry));
  delete missingTaskType.taskType;
  const fallbackApplied = engine.applyAttempt(initial, missingTaskType);
  assert.equal(fallbackApplied.effects.some((effect) => effect.type === "REJECTED_ATTEMPT_TASK_TYPE"), false);
  assert.equal(
    fallbackApplied.state.skills[construction.skillId].evidence.at(-1).taskType,
    engine.SKILL_BY_ID[construction.skillId].constraints.taskTypes[0],
  );
  const invalidTaskType = { ...missingTaskType, taskType: "not-declared" };
  assert.equal(engine.applyAttempt(initial, invalidTaskType).effects[0].type, "REJECTED_ATTEMPT_TASK_TYPE");
  const capped = clone(initial);
  capped.practiceCountByDay["22000"] = engine.CONSTANTS.DAILY_PRACTICE_MAX;
  assert.equal(engine.applyAttempt(capped, {
    ...missingTaskType,
    taskType: engine.SKILL_BY_ID[construction.skillId].constraints.taskTypes[0],
  }).effects[0].type, "REJECTED_DAILY_CAP");
}

function assertGatewayPullback({ engine, evidenceAttempt }) {
  const gateway = engine.SKILLS.find((skill) => (
    skill.classification === "GATEWAY" && skill.level < engine.CONSTANTS.LEVEL_MAX
  ));
  assert.ok(gateway);
  const gatewayState = engine.createInitialState(22_000);
  gatewayState.earnedLevel = gateway.level + 1;
  gatewayState.skills[gateway.skillId].acquisition = "SOLID";
  const gatewayResult = engine.applyAttempt(gatewayState, evidenceAttempt(gateway, {
    feedbackClass: "INCORRECT",
    scheduledReview: true,
  }));
  assert.ok(gatewayResult.effects.some((effect) => effect.type === "SKILL_DEMOTED"));
  assert.ok(gatewayResult.effects.some((effect) => effect.type === "GATEWAY_PULLBACK"));
}

function assertMasteryRestoration({ engine, evidenceAttempt, singleTaskConstruction }) {
  const restoreSkill = engine.SKILL_BY_ID[singleTaskConstruction.skillId];
  const restoreState = engine.createInitialState(22_000);
  restoreState.earnedLevel = restoreSkill.level;
  restoreState.skills[restoreSkill.skillId].acquisition = "PRACTISING";
  restoreState.skills[restoreSkill.skillId].restoreNeeded = true;
  restoreState.skills[restoreSkill.skillId].restoreAfterDay = 22_000;
  const restoreRepresentation = ({ C: "CONCRETE", P: "PICTORIAL", A: "ABSTRACT" })[restoreSkill.phases.at(-1)];
  const restored = engine.applyAttempt(restoreState, evidenceAttempt(restoreSkill, {
    scheduledReview: true,
    playDay: 22_001,
    representation: restoreRepresentation,
  }));
  assert.equal(restored.state.skills[restoreSkill.skillId].acquisition, "SOLID");
  assert.equal(restored.state.skills[restoreSkill.skillId].restoreNeeded, false);
  assert.ok(restored.effects.some((effect) => effect.type === "SKILL_RESTORED"));
  return { restoreSkill, restoreRepresentation };
}

function assertReteachDateFallback({ engine, evidenceAttempt, restoreRepresentation, restoreSkill }) {
  const sinceFallbackState = engine.createInitialState(0);
  sinceFallbackState.earnedLevel = restoreSkill.level;
  sinceFallbackState.levelReteachActive = true;
  sinceFallbackState.levelReteachTargets = [restoreSkill.skillId];
  sinceFallbackState.levelReteachTargetSince = {};
  sinceFallbackState.skills[restoreSkill.skillId].acquisition = "SOLID";
  const clearedTarget = engine.applyAttempt(sinceFallbackState, evidenceAttempt(restoreSkill, {
    scheduledReview: true,
    playDay: 1,
    representation: restoreRepresentation,
  }));
  assert.equal(clearedTarget.state.levelReteachActive, false);
  assert.deepEqual(clone(clearedTarget.state.levelReteachTargets), []);
}

function assertPromotionEffects({ engine, evidenceAttempt }) {
  const promotionState = engine.createInitialState(0);
  const promotionLevel = promotionState.earnedLevel;
  const promotionSkill = engine.SKILLS.find((skill) => skill.level === promotionLevel);
  for (const skill of engine.SKILLS.filter((item) => item.level === promotionLevel)) {
    promotionState.skills[skill.skillId].acquisition = "SOLID";
  }
  const promoted = engine.applyAttempt(promotionState, evidenceAttempt(promotionSkill, {
    playDay: 0,
    elapsed: 0,
  }));
  assert.equal(promoted.state.earnedLevel, promotionLevel + 1);
  assert.ok(promoted.effects.some((effect) => effect.type === "LEVEL_PROMOTED"));
}

function assertEmptyQueueFallbacks({ engine, initial }) {
  const noTargets = clone(initial);
  delete noTargets.levelReteachTargets;
  assert.ok(Array.isArray(engine.buildSessionQueue(noTargets, { playDay: 22_000, seed: 1 }).queue));
  const noPractice = clone(initial);
  noPractice.settings.grownUpPracticeCap = 0;
  const empty = engine.buildSessionQueue(noPractice, { playDay: 22_000, seed: 1 });
  assert.equal(empty.queue.length, 0);
  assert.ok(empty.classifications.includes("ADULT_CAPPED"));
  const allSolid = clone(initial);
  markAllSkillsSolid(engine, allSolid);
  assert.equal(engine.buildSessionQueue(allSolid, { playDay: 22_000, seed: 1 }).queue.length, 0);
}

function assertDueReviewQueue({ engine }) {
  const dueSkills = engine.SKILLS.filter((skill) => skill.level === 4 && skill.phases.includes("A")).slice(0, 2);
  assert.equal(dueSkills.length, 2);
  const twoDue = engine.createInitialState(22_000);
  twoDue.earnedLevel = 4;
  markAllSkillsSolid(engine, twoDue);
  for (const skill of dueSkills) twoDue.skills[skill.skillId].dueDay = 22_000;
  const dueQueue = engine.buildSessionQueue(twoDue, { playDay: 22_000, seed: 1 }).queue;
  assert.equal(dueQueue[0].scheduledReview, true);
  assert.equal(dueQueue[1].scheduledReview, true);
  assert.equal(dueQueue[1].representation, "ABSTRACT");
  return { dueSkills, twoDue };
}

function assertRepeatedReviewAndPreviewQueues({ dueSkills, engine, initial, twoDue }) {
  const oneDue = clone(twoDue);
  oneDue.skills[dueSkills[1].skillId].dueDay = null;
  const repeatedDueQueue = engine.buildSessionQueue(oneDue, { playDay: 22_000, seed: 1 }).queue;
  assert.equal(repeatedDueQueue[0].scheduledReview, true);
  assert.equal(repeatedDueQueue[1].scheduledReview, false);
  const preview = clone(initial);
  preview.previewLevel = engine.CONSTANTS.LEVEL_MAX;
  const previewQueue = engine.buildSessionQueue(preview, { playDay: 22_000, seed: 1 });
  assert.ok(previewQueue.queue.length > 0);
  assert.ok(previewQueue.queue.every((slot) => slot.preview && slot.obligation === "PREVIEW"));
}

export const apiStateSteps = Object.freeze([
  createStateApiFixtures,
  assertRejectedAndPreviewAttempts,
  assertReteachAttemptCompletion,
  assertTaskAndPracticeEligibility,
  assertGatewayPullback,
  assertMasteryRestoration,
  assertReteachDateFallback,
  assertPromotionEffects,
  assertEmptyQueueFallbacks,
  assertDueReviewQueue,
  assertRepeatedReviewAndPreviewQueues,
]);

function markAllSkillsSolid(engine, state) {
  for (const skill of engine.SKILLS) {
    state.skills[skill.skillId].acquisition = "SOLID";
    state.skills[skill.skillId].dueDay = null;
  }
}
