// Ordered placement isolation, recovery, and migration assertions for BEH-29.
function createPreservedProgress({ createState, engine, attemptFor, firstSkill, skills, assert }) {
  const base = createState(engine);
  base.settings.grownUpPracticeCap = 7;
  const evidenced = engine.applyAttempt(base, attemptFor(engine, firstSkill(), { ordinal: 91 })).state;
  const learningSkill = skills.find((skill) => skill.id !== firstSkill().id && skill.level === 1);
  const recoverySkill = skills.find((skill) => ![firstSkill().id, learningSkill.id].includes(skill.id) && skill.level === 1);
  evidenced.skills[learningSkill.id].acquisition = "LEARNING";
  evidenced.skills[recoverySkill.id].acquisition = "PRACTISING";
  evidenced.skills[recoverySkill.id].restoreNeeded = true;
  evidenced.skills[recoverySkill.id].restoreAfterDay = 21_000;
  evidenced.reteachQueue = [{ skillId: recoverySkill.id, reason: "CHRONIC" }];
  assert.equal(engine.validateState(evidenced), null);
  const preservedRecords = new Map(
    [firstSkill().id, learningSkill.id, recoverySkill.id]
      .map((id) => [id, engine.canonical(evidenced.skills[id])]),
  );
  const beforeState = engine.exportState(evidenced);
  return { evidenced, preservedRecords, beforeState };
}

function assertDeterministicPlacement({ engine, evidenced, assert }) {
  const deterministicA = engine.createPlacementRun({ state: evidenced, playDay: 21_000, seed: 0x706c6163, theme: "forest" });
  const deterministicB = engine.createPlacementRun({ state: evidenced, playDay: 21_000, seed: 0x706c6163, theme: "forest" });
  assert.equal(engine.canonical(deterministicA), engine.canonical(deterministicB));
  assert.equal(engine.canonical(engine.placementCurrentQuestion(deterministicA)), engine.canonical(engine.placementCurrentQuestion(deterministicB)));
  assert.equal(engine.placementCurrentQuestion(deterministicA).preview, true);
  return { deterministicA };
}

function assertPlacementPreparation({ engine, evidenced, assert }) {
  const firstPrepared = engine.beginPlacementRun({ state: evidenced, playDay: 21_000, theme: "forest" });
  const secondPrepared = engine.beginPlacementRun({ state: firstPrepared.state, playDay: 21_000, theme: "forest" });
  assert.equal(firstPrepared.state.placement.runNonce, evidenced.placement.runNonce + 1);
  assert.equal(secondPrepared.state.placement.runNonce, firstPrepared.state.placement.runNonce + 1);
  assert.equal(firstPrepared.run.nonce, firstPrepared.state.placement.runNonce);
  assert.equal(secondPrepared.run.nonce, secondPrepared.state.placement.runNonce);
  assert.notEqual(firstPrepared.run.seed, secondPrepared.run.seed);
  assert.notEqual(
    engine.placementCurrentQuestion(firstPrepared.run).questionId,
    engine.placementCurrentQuestion(secondPrepared.run).questionId,
    "each committed nonce derives a fresh deterministic question set",
  );
  assert.equal(
    engine.canonical(engine.placementCurrentQuestion(firstPrepared.run)),
    engine.canonical(engine.placementCurrentQuestion(firstPrepared.run)),
    "a run remains exactly resumable",
  );
  assert.equal(evidenced.placement.runNonce, 0, "preparation does not mutate the caller's state");
  assert.equal(engine.validatePlacementRun(firstPrepared.run, firstPrepared.state).valid, true);
  assert.match(engine.validatePlacementRun(firstPrepared.run, secondPrepared.state).error, /stale/iu);
}

function assertPlacementSubmissions({ deterministicA, engine, recordPlacementResult, assert, correctOption, cloneJson, evidenced, beforeState }) {
  let submissionRun = deterministicA;
  while (engine.placementCurrentQuestion(submissionRun)?.inputClass !== "SELECTION") {
    submissionRun = recordPlacementResult(engine, submissionRun, true);
  }
  const selectionQuestion = engine.placementCurrentQuestion(submissionRun);
  assert.equal(
    selectionQuestion.options.some((option) => (
      [option.label, option.value].some((value) => String(value).trim().toLowerCase() === "not sure")
    )),
    false,
    "the global Not sure action is never duplicated by a placement answer option",
  );
  const correct = correctOption(engine, selectionQuestion);
  const wrong = selectionQuestion.options.find((option) => option.optionId !== correct.optionId);
  const correctSubmission = engine.submitPlacementAnswer(submissionRun, { optionId: correct.optionId });
  const wrongSubmission = engine.submitPlacementAnswer(submissionRun, { optionId: wrong.optionId });
  const notSureSubmission = engine.submitPlacementNotSure(deterministicA);
  assert.equal(correctSubmission.grade.correct, true);
  assert.equal(wrongSubmission.grade.correct, false);
  assert.deepEqual(cloneJson(notSureSubmission.grade), {
    correct: false,
    valid: true,
    reason: "not-sure",
    canonical: "",
    notSure: true,
    responseKind: "not-sure",
  });
  assert.equal(notSureSubmission.run.answers.length, 1);
  assert.deepEqual(Object.keys(notSureSubmission.run.answers[0]).sort(), ["questionId", "responseKind"]);
  assert.equal(notSureSubmission.run.answers[0].responseKind, "not-sure");
  assert.equal(deterministicA.answers.length, 0);
  assert.equal(submissionRun.answers.length + 1, correctSubmission.run.answers.length);
  assert.deepEqual(Object.keys(correctSubmission.run.answers.at(-1)).sort(), ["questionId", "responseKind"]);
  assert.equal(correctSubmission.run.answers.at(-1).responseKind, "correct");
  assertPlacementRemainsNonEvidence({ engine, assert, selectionQuestion, correct, evidenced, beforeState });

}

function assertInvalidPlacementDrafts({ cloneJson, deterministicA, assert, engine, evidenced }) {
  const alteredRun = { ...cloneJson(deterministicA), unexpected: true };
  assert.equal(engine.validatePlacementRun(alteredRun, evidenced).valid, false);
  const unfinishedPriorContractDraft = {
    ...cloneJson(deterministicA),
    contractVersion: "starting-point-v2",
  };
  assert.equal(
    engine.validatePlacementRun(unfinishedPriorContractDraft, evidenced).valid,
    false,
    "an unfinished prior-contract placement draft cannot resume under the current contract",
  );
  assert.throws(
    () => engine.placementCurrentQuestion(unfinishedPriorContractDraft),
    /different placement, curriculum, or question contract/iu,
  );
  const staleState = cloneJson(evidenced);
  staleState.settings.grownUpPracticeCap = 8;
  assert.match(engine.validatePlacementRun(deterministicA, staleState).error, /stale/iu);
}

function assertAbstentionConfidence({ completePlacement, engine, evidenced, assert }) {
  const limitedRun = completePlacement(engine, evidenced, (_question, index) => (
    index === 0 ? "not-sure" : true
  ), { seed: 0x6e6f7473 });
  const limitedRecommendation = engine.placementRecommendation(limitedRun);
  assert.equal(limitedRecommendation.responseCounts.notSure, 1);
  assert.equal(limitedRecommendation.responseCounts.incorrect, 0);
  assert.equal(limitedRecommendation.confidence, "LIMITED_ABSTENTION");
  const comparableWrongRun = completePlacement(engine, evidenced, (_question, index) => (
    index === 0 ? false : true
  ), { seed: 0x6e6f7473 });
  const comparableWrongRecommendation = engine.placementRecommendation(comparableWrongRun);
  assert.equal(comparableWrongRecommendation.responseCounts.notSure, 0);
  assert.equal(comparableWrongRecommendation.responseCounts.incorrect, 1);
  assert.equal(comparableWrongRecommendation.confidence, "STANDARD");
  assert.equal(
    limitedRecommendation.recommendedLevel,
    comparableWrongRecommendation.recommendedLevel,
    "an abstention takes the same conservative branch but remains explicitly distinguishable",
  );
}

function assertHighestRecommendation({ completePlacement, engine, evidenced, assert, constants, cloneJson }) {
  const highRun = completePlacement(engine, evidenced, () => true);
  const highRecommendation = engine.placementRecommendation(highRun);
  assert.equal(highRecommendation.recommendedLevel, constants.LEVEL_MAX);
  assert.deepEqual(cloneJson(highRecommendation.responseCounts), {
    correct: highRecommendation.questionCount,
    incorrect: 0,
    notSure: 0,
  });
  assert.equal(highRecommendation.confidence, "STANDARD");
  const applied = engine.applyPlacementRecommendation(evidenced, highRun);
  assert.equal(applied.ok, true, applied.error);
  assert.equal(applied.state.placementDraftGeneration, evidenced.placementDraftGeneration + 1);
  assert.equal(applied.state.earnedLevel, constants.LEVEL_MAX);
  assert.equal(applied.state.placement.highestAppliedLevel, constants.LEVEL_MAX);
  assert.deepEqual(cloneJson(applied.state.placement.lastConfirmed.responseCounts), cloneJson(highRecommendation.responseCounts));
  assert.equal(applied.state.placement.lastConfirmed.confidence, "STANDARD");
  return { highRun, applied };
}

function assertPlacedRecords({ evidenced, skills, constants, assert, applied, preservedRecords, engine }) {
  const recoveryIds = new Set([
    ...evidenced.reteachQueue.map((row) => row.skillId),
    ...evidenced.levelReteachTargets,
  ]);
  const expectedPlaced = skills.filter((skill) => {
    const record = evidenced.skills[skill.id];
    return skill.level < constants.LEVEL_MAX
      && record.acquisition === "UNSEEN"
      && record.evidence.length === 0
      && record.misses.length === 0
      && !record.restoreNeeded
      && !recoveryIds.has(skill.id);
  });
  assert.equal(applied.state.placement.placedSkillIds.length, expectedPlaced.length);
  assert.equal(
    skills.filter((skill) => skill.level === constants.LEVEL_MAX)
      .every((skill) => applied.state.skills[skill.id].acquisition === "UNSEEN"
        && !applied.state.placement.placedSkillIds.includes(skill.id)),
    true,
  );
  assert.equal(
    applied.state.placement.placedSkillIds
      .every((id) => {
        const record = applied.state.skills[id];
        return record.acquisition === "PLACED"
          && record.witnessIds.length === 0
          && record.masteryVerifiedPlayDay === null
          && record.masteryContractVersion === "";
      }),
    true,
  );
  for (const [id, before] of preservedRecords) {
    assert.equal(engine.canonical(applied.state.skills[id]), before, `${id} was not truly unseen`);
    assert.ok(!applied.state.placement.placedSkillIds.includes(id));
  }
}

function assertScheduledPlacementReviews({ applied, assert, constants, engine, cloneJson, evidenced, highRun }) {
  const scheduleEffect = applied.effects.find((effect) => effect.type === "PLACEMENT_REVIEWS_SCHEDULED");
  assert.ok(scheduleEffect);
  assert.equal(scheduleEffect.skillIds.length, constants.PLACEMENT_REVIEW_MAX);
  assert.equal(new Set(scheduleEffect.skillIds.map((id) => engine.SKILL_BY_ID[id].level)).size, constants.PLACEMENT_REVIEW_MAX);
  assert.deepEqual(
    cloneJson(scheduleEffect.skillIds.map((id) => engine.SKILL_BY_ID[id].level)),
    Array.from({ length: constants.PLACEMENT_REVIEW_MAX }, (_, index) => index + 1),
  );
  assert.deepEqual(
    cloneJson(scheduleEffect.skillIds.map((id) => applied.state.skills[id].dueDay)),
    Array.from({ length: constants.PLACEMENT_REVIEW_MAX }, (_, index) => 21_001 + index),
  );
  const strandCounts = Object.values(Object.groupBy(
    scheduleEffect.skillIds,
    (id) => engine.SKILL_BY_ID[id].strand,
  )).map((rows) => rows.length);
  assert.ok(Math.max(...strandCounts) - Math.min(...strandCounts) <= 1);
  assertPlacedStateIsolation({ engine, assert, applied, evidenced, highRun, constants });
  return { scheduleEffect };
}

function assertExhaustedPlacementGeneration({ cloneJson, evidenced, assert, engine, completePlacement, highRun }) {
  const exhausted = cloneJson(evidenced);
  exhausted.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
  assert.equal(engine.validateState(exhausted), null);
  const exhaustedBefore = engine.canonical(exhausted);
  const exhaustedRun = completePlacement(engine, exhausted, () => true, { seed: 0x7ffffffe });
  const exhaustedRunBefore = engine.canonical(exhaustedRun);
  const exhaustedApply = engine.applyPlacementRecommendation(exhausted, exhaustedRun);
  assert.equal(exhaustedApply.ok, false);
  assert.equal(exhaustedApply.state, exhausted);
  assert.match(exhaustedApply.error, /generation is exhausted/iu);
  assert.equal(engine.canonical(exhausted), exhaustedBefore);
  assert.equal(engine.canonical(exhaustedRun), exhaustedRunBefore);
  const floorExhaustedOptions = { placementDraftGenerationFloor: Number.MAX_SAFE_INTEGER };
  const floorExhaustedOptionsBefore = engine.canonical(floorExhaustedOptions);
  const floorExhaustedApply = engine.applyPlacementRecommendation(evidenced, highRun, floorExhaustedOptions);
  assert.equal(floorExhaustedApply.ok, false);
  assert.equal(floorExhaustedApply.state, evidenced);
  assert.match(floorExhaustedApply.error, /generation is exhausted/iu);
  assert.equal(engine.canonical(floorExhaustedOptions), floorExhaustedOptionsBefore);
}

function assertEvidenceReplacement({ skills, applied, assert, constants, engine, attemptFor }) {
  const replacementSkill = skills.find((skill) => (
    skill.level < 13
    && skill.constraints.taskTypes.length === 1
    && applied.state.placement.placedSkillIds.includes(skill.id)
    && applied.state.skills[skill.id].evidence.length === 0
  ));
  assert.ok(replacementSkill, "a single-task placed skill is available for evidence replacement");
  let evidenceState = applied.state;
  const replacementWitnessCount = Math.max(
    constants.NORMAL_CONSTRUCTION_SUCCESSES,
    replacementSkill.phases.length,
    replacementSkill.constraints.taskTypes.length,
  );
  const phaseRepresentation = { C: "CONCRETE", P: "PICTORIAL", A: "ABSTRACT" };
  for (let index = 0; index < replacementWitnessCount; index += 1) {
    const result = engine.applyAttempt(evidenceState, attemptFor(engine, replacementSkill, {
      ordinal: 120 + index,
      playDay: 21_020 + index,
      sessionId: `placement-evidence-${index}`,
      taskType: replacementSkill.constraints.taskTypes[index % replacementSkill.constraints.taskTypes.length],
      representation: phaseRepresentation[
        replacementSkill.phases[Math.min(index, replacementSkill.phases.length - 1)]
      ],
      applied: true,
    }));
    evidenceState = result.state;
    if (index + 1 < replacementWitnessCount) {
      assert.ok(evidenceState.placement.placedSkillIds.includes(replacementSkill.id));
    } else {
      assert.ok(result.effects.some((effect) => (
        effect.type === "PLACEMENT_REPLACED_BY_EVIDENCE" && effect.skillId === replacementSkill.id
      )));
      assert.ok(!evidenceState.placement.placedSkillIds.includes(replacementSkill.id));
      assert.equal(evidenceState.skills[replacementSkill.id].witnessIds.length, replacementWitnessCount);
    }
  }
}

function assertContraryReviewEvidence({ scheduleEffect, engine, assert, skills, applied, attemptFor }) {
  const sentinelId = scheduleEffect.skillIds.find((id) => engine.SKILL_BY_ID[id].classification === "GATEWAY");
  assert.ok(sentinelId, "placement schedules at least one gateway review");
  const sentinel = skills.find((skill) => skill.id === sentinelId);
  const sameLevelPlacedBefore = applied.state.placement.placedSkillIds.filter((id) => (
    engine.SKILL_BY_ID[id].level === sentinel.level
  ));
  const earnedBeforeFailure = applied.state.earnedLevel;
  const failedReview = engine.applyAttempt(applied.state, attemptFor(engine, sentinel, {
    ordinal: 201,
    playDay: applied.state.skills[sentinelId].dueDay,
    sessionId: "placement-review",
    scheduledReview: true,
    feedbackClass: "INCORRECT",
    firstAnswerCorrect: false,
  }));
  assert.equal(failedReview.state.earnedLevel, earnedBeforeFailure);
  assert.equal(failedReview.state.skills[sentinelId].acquisition, "PRACTISING");
  assert.equal(failedReview.state.skills[sentinelId].restoreNeeded, true);
  assert.ok(!failedReview.state.placement.placedSkillIds.includes(sentinelId));
  assert.ok(failedReview.effects.some((effect) => effect.type === "PLACEMENT_STATUS_REMOVED"));
  assert.ok(failedReview.effects.some((effect) => effect.type === "SKILL_DEMOTED"));
  const recheck = failedReview.effects.find((effect) => effect.type === "PLACEMENT_LEVEL_RECHECK_REQUIRED");
  assert.ok(recheck);
  assert.ok(recheck.skillIds.length > 1);
  assert.deepEqual(
    new Set(recheck.skillIds),
    new Set(sameLevelPlacedBefore),
  );
  assert.ok(
    recheck.skillIds.filter((id) => id !== sentinelId)
      .every((id) => failedReview.state.skills[id].dueDay <= failedReview.state.maxSeenPlayDay),
  );
  return { sentinelId, failedReview };
}

function assertLowerRetakePreservesRecovery({ completePlacement, engine, failedReview, assert, constants, sentinelId }) {
  const laterLowRun = completePlacement(
    engine,
    failedReview.state,
    () => false,
    { playDay: failedReview.state.maxSeenPlayDay + 1, seed: 0x6c6f7765 },
  );
  const noLower = engine.applyPlacementRecommendation(failedReview.state, laterLowRun);
  assert.equal(noLower.ok, true, noLower.error);
  assert.equal(noLower.state.earnedLevel, constants.LEVEL_MAX);
  assert.equal(noLower.state.skills[sentinelId].restoreNeeded, true);
  assert.ok(!noLower.state.placement.placedSkillIds.includes(sentinelId));
}

function assertEarlierLevelChoice({ createState, engine, completePlacement, constants, assert, skills }) {
  const earlierState = createState(engine);
  const earlierRun = completePlacement(engine, earlierState, () => true, { seed: 0x6561726c });
  const earlier = engine.applyPlacementRecommendation(earlierState, earlierRun, { startingLevel: constants.LEVEL_MAX - 1 });
  assert.equal(earlier.ok, true, earlier.error);
  assert.equal(earlier.state.earnedLevel, constants.LEVEL_MAX - 1);
  assert.equal(
    skills.filter((skill) => skill.level === constants.LEVEL_MAX - 1)
      .every((skill) => earlier.state.skills[skill.id].acquisition === "UNSEEN"),
    true,
  );
}

function assertLegacySchemaMigration({ cloneJson, createState, engine, assert }) {
  const legacy = cloneJson(createState(engine));
  legacy.schemaVersion = 2;
  delete legacy.placement;
  delete legacy.placementDraftGeneration;
  const migrated = engine.loadState(JSON.stringify(legacy), legacy.maxSeenPlayDay);
  assert.equal(migrated.ok, true, migrated.error);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.schemaVersion, 3);
  assert.equal(migrated.state.placementDraftGeneration, 0);
  assert.deepEqual(cloneJson(migrated.state.placement.placedSkillIds), []);
  const unknownLegacy = { ...legacy, unexpected: true };
  assert.equal(engine.loadState(JSON.stringify(unknownLegacy), legacy.maxSeenPlayDay).ok, false);
}

function assertPriorSchemaGenerationMigration({ cloneJson, createState, engine, assert }) {
  const priorSchema3 = cloneJson(createState(engine));
  delete priorSchema3.placementDraftGeneration;
  const migratedSchema3 = engine.loadState(JSON.stringify(priorSchema3), priorSchema3.maxSeenPlayDay);
  assert.equal(migratedSchema3.ok, true, migratedSchema3.error);
  assert.equal(migratedSchema3.migrated, true);
  assert.equal(migratedSchema3.state.placementDraftGeneration, 0);
}

function assertLegacyPlacementMigration({ cloneJson, createState, engine, skills, constants, assert }) {
  const oldPlacement = cloneJson(createState(engine));
  const oldPlacedSkill = skills.find((skill) => skill.level === 1);
  oldPlacement.earnedLevel = 2;
  Object.assign(oldPlacement.skills[oldPlacedSkill.id], {
    acquisition: "SOLID",
    fastTrack: "STANDARD_ONLY",
    witnessIds: [],
    masteryVerifiedPlayDay: 21_000,
    masteryContractVersion: constants.SAMPLE_KEY_VERSION,
  });
  oldPlacement.placement = {
    contractVersion: "starting-point-v1",
    highestAppliedLevel: 2,
    placedSkillIds: [oldPlacedSkill.id],
    lastConfirmed: {
      contractVersion: "starting-point-v1",
      curriculumSha256: engine.CURRICULUM_MANIFEST_SHA256,
      playDay: 21_000,
      recommendedLevel: 2,
      chosenLevel: 2,
      appliedLevel: 2,
      questionCount: constants.PLACEMENT_MIN_QUESTIONS,
    },
  };
  const migratedPlacement = engine.loadState(JSON.stringify(oldPlacement), 21_000);
  assert.equal(migratedPlacement.ok, true, migratedPlacement.error);
  assert.equal(migratedPlacement.migrated, true);
  assert.equal(migratedPlacement.state.skills[oldPlacedSkill.id].acquisition, "PLACED");
  assert.equal(migratedPlacement.state.skills[oldPlacedSkill.id].masteryVerifiedPlayDay, null);
  assert.equal(migratedPlacement.state.skills[oldPlacedSkill.id].masteryContractVersion, "");
  assert.equal(migratedPlacement.state.placement.contractVersion, constants.PLACEMENT_CONTRACT_VERSION);
  assert.equal(migratedPlacement.state.placement.runNonce, 0);
  assert.equal(migratedPlacement.state.placement.lastConfirmed.confidence, "LEGACY_UNAVAILABLE");
  assert.equal(migratedPlacement.state.placement.lastConfirmed.responseCounts, null);
}

function assertPriorPlacementContractMigration({ cloneJson, applied, engine, assert, constants }) {
  const priorContractPlacement = cloneJson(applied.state);
  priorContractPlacement.placement.contractVersion = "starting-point-v2";
  priorContractPlacement.placement.lastConfirmed.contractVersion = "starting-point-v2";
  const priorCounts = cloneJson(priorContractPlacement.placement.lastConfirmed.responseCounts);
  const migratedPriorContract = engine.loadState(JSON.stringify(priorContractPlacement), 21_000);
  assert.equal(migratedPriorContract.ok, true, migratedPriorContract.error);
  assert.equal(migratedPriorContract.migrated, true);
  assert.equal(migratedPriorContract.state.placement.contractVersion, constants.PLACEMENT_CONTRACT_VERSION);
  assert.equal(migratedPriorContract.state.placement.lastConfirmed.contractVersion, constants.PLACEMENT_CONTRACT_VERSION);
  assert.deepEqual(cloneJson(migratedPriorContract.state.placement.lastConfirmed.responseCounts), priorCounts);
  assert.equal(migratedPriorContract.state.placement.lastConfirmed.confidence, "STANDARD");
  return { priorContractPlacement };
}

function assertMissingPriorNonceRejected({ cloneJson, priorContractPlacement, engine, assert }) {
  const malformedPriorContractWithoutNonce = cloneJson(priorContractPlacement);
  delete malformedPriorContractWithoutNonce.placement.runNonce;
  const rejectedPriorContractWithoutNonce = engine.loadState(
    JSON.stringify(malformedPriorContractWithoutNonce),
    21_000,
  );
  assert.equal(
    rejectedPriorContractWithoutNonce.ok,
    false,
    "starting-point-v2 saves must not borrow the v1-only runNonce synthesis",
  );
}

function assertMissingPriorOutcomeRejected({ cloneJson, priorContractPlacement, engine, assert }) {
  const malformedPriorContractWithoutOutcomeDetail = cloneJson(priorContractPlacement);
  delete malformedPriorContractWithoutOutcomeDetail.placement.lastConfirmed.responseCounts;
  delete malformedPriorContractWithoutOutcomeDetail.placement.lastConfirmed.confidence;
  const rejectedPriorContractWithoutOutcomeDetail = engine.loadState(
    JSON.stringify(malformedPriorContractWithoutOutcomeDetail),
    21_000,
  );
  assert.equal(
    rejectedPriorContractWithoutOutcomeDetail.ok,
    false,
    "starting-point-v2 saves must not borrow the v1-only outcome-detail synthesis",
  );
}

export function assertPlacementBehavior(context) {
  context = { ...context };
  Object.assign(context, createPreservedProgress(context));
  Object.assign(context, assertDeterministicPlacement(context));
  assertPlacementPreparation(context);
  assertPlacementSubmissions(context);
  assertInvalidPlacementDrafts(context);
  assertAbstentionConfidence(context);
  Object.assign(context, assertHighestRecommendation(context));
  assertPlacedRecords(context);
  Object.assign(context, assertScheduledPlacementReviews(context));
  assertExhaustedPlacementGeneration(context);
  assertEvidenceReplacement(context);
  Object.assign(context, assertContraryReviewEvidence(context));
  assertLowerRetakePreservesRecovery(context);
  assertEarlierLevelChoice(context);
  assertLegacySchemaMigration(context);
  assertPriorSchemaGenerationMigration(context);
  assertLegacyPlacementMigration(context);
  Object.assign(context, assertPriorPlacementContractMigration(context));
  assertMissingPriorNonceRejected(context);
  assertMissingPriorOutcomeRejected(context);
}

function assertPlacementRemainsNonEvidence({ engine, assert, selectionQuestion, correct, evidenced, beforeState }) {
  assert.equal(engine.submitAnswer(selectionQuestion, { optionId: correct.optionId }, {
    promptFinishedAt: 1_000,
    submittedAt: 3_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    selectionEvents: [],
  }).evidenceClass, "NON_EVIDENCE");
  assert.equal(engine.exportState(evidenced), beforeState);
}

function assertPlacedStateIsolation({ engine, assert, applied, evidenced, highRun, constants }) {
  assert.equal(engine.evaluatePromotion({ state: applied.state, currentLevel: 1 }).ratio, 0);
  const firstCurrentQueue = engine.buildSessionQueue(applied.state, { playDay: 21_000, seed: 91 });
  assert.ok(firstCurrentQueue.queue.some((slot) => (
    slot.obligation === "NEW" && engine.SKILL_BY_ID[slot.skillId].level === constants.LEVEL_MAX
  )), "PLACED prerequisites allow current-level practice");
  assert.equal(engine.canonical(applied.state.settings), engine.canonical(evidenced.settings));
  assert.equal(engine.canonical(applied.state.practiceCountByDay), engine.canonical(evidenced.practiceCountByDay));
  assert.equal(engine.canonical(applied.state.sessionLog), engine.canonical(evidenced.sessionLog));
  assert.equal(engine.canonical(applied.state.reteachQueue), engine.canonical(evidenced.reteachQueue));
  assert.equal(engine.validateState(applied.state), null);
  assert.equal(engine.importState(applied.state, engine.exportState(applied.state), 21_000).ok, true);
  assert.equal(engine.validatePlacementRun(highRun, applied.state).valid, false);
}
