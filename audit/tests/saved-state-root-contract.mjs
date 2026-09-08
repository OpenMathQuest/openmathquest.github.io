import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";

async function assertSaveEnvelope({ engine, rejectState, validState }) {
  for (const [name, value, expected] of [
    ["root/null", null, /not an object/iu],
    ["root/array", [], /not an object/iu],
    ["root/schema", { ...clone(validState), schemaVersion: -1 }, /schema/iu],
    ["root/manifest id", { ...clone(validState), curriculumManifestId: "wrong" }, /curriculum/iu],
    ["root/manifest version", { ...clone(validState), curriculumVersion: "wrong" }, /curriculum/iu],
    ["root/manifest digest", { ...clone(validState), curriculumSha256: "0".repeat(64) }, /curriculum/iu],
    ["root/unknown field", { ...clone(validState), surprise: true }, /unknown save field/iu],
    ["root/earned level noninteger", { ...clone(validState), earnedLevel: 1.5 }, /earned level/iu],
    ["root/earned level below minimum", { ...clone(validState), earnedLevel: engine.CONSTANTS.LEVEL_MIN - 1 }, /earned level/iu],
    ["root/earned level above maximum", { ...clone(validState), earnedLevel: engine.CONSTANTS.LEVEL_MAX + 1 }, /earned level/iu],
    ["root/preview level noninteger", { ...clone(validState), previewLevel: 1.5 }, /preview level/iu],
    ["root/preview level below minimum", { ...clone(validState), previewLevel: engine.CONSTANTS.LEVEL_MIN - 1 }, /preview level/iu],
    ["root/preview level above maximum", { ...clone(validState), previewLevel: engine.CONSTANTS.LEVEL_MAX + 1 }, /preview level/iu],
    ["root/play day noninteger", { ...clone(validState), maxSeenPlayDay: 1.5 }, /play day/iu],
    ["root/play day negative", { ...clone(validState), maxSeenPlayDay: -1 }, /play day/iu],
    ["root/placement draft generation noninteger", { ...clone(validState), placementDraftGeneration: 1.5 }, /placement draft generation/iu],
    ["root/placement draft generation negative", { ...clone(validState), placementDraftGeneration: -1 }, /placement draft generation/iu],
    ["root/placement draft generation unsafe", { ...clone(validState), placementDraftGeneration: Number.MAX_SAFE_INTEGER + 1 }, /placement draft generation/iu],
    ["root/skills missing", { ...clone(validState), skills: null }, /skill records/iu],
  ]) {
    await rejectState(name, value, expected);
  }
  const missingPlacementDraftGeneration = clone(validState);
  delete missingPlacementDraftGeneration.placementDraftGeneration;
  await rejectState("root/placement draft generation missing", missingPlacementDraftGeneration, /missing required save field/iu);
}

async function createPlacedSaveFixture({ accept, engine }) {
  const placementState = engine.createInitialState(22_000);
  placementState.earnedLevel = 2;
  const placedSkillId = engine.SKILLS.find((skill) => skill.level === 1).skillId;
  const selectedLevelSkillId = engine.SKILLS.find((skill) => skill.level === 2).skillId;
  placementState.skills[placedSkillId].acquisition = "PLACED";
  placementState.skills[placedSkillId].lastSpacingDay = 22_000;
  placementState.skills[placedSkillId].dueDay = 22_000 + engine.CONSTANTS.PLACEMENT_REVIEW_MAX;
  placementState.placement = {
    contractVersion: engine.CONSTANTS.PLACEMENT_CONTRACT_VERSION,
    runNonce: 3,
    highestAppliedLevel: 2,
    placedSkillIds: [placedSkillId],
    lastConfirmed: {
      contractVersion: engine.CONSTANTS.PLACEMENT_CONTRACT_VERSION,
      curriculumSha256: engine.CURRICULUM_MANIFEST_SHA256,
      playDay: 22_000,
      recommendedLevel: 2,
      chosenLevel: 2,
      appliedLevel: 2,
      questionCount: engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS,
      responseCounts: {
        correct: engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS,
        incorrect: 0,
        notSure: 0,
      },
      confidence: "STANDARD",
    },
  };
  await accept("placement provenance", placementState);
  return { placementState, placedSkillId, selectedLevelSkillId };
}

async function assertPlacementProvenance({ engine, placedSkillId, placementState, rejectState, selectedLevelSkillId }) {
  for (const [name, mutate] of [
    ["placement missing", (state) => { delete state.placement; }],
    ["placement unknown field", (state) => { state.placement.surprise = true; }],
    ["placement contract", (state) => { state.placement.contractVersion = "wrong"; }],
    ["placement run nonce noninteger", (state) => { state.placement.runNonce = 1.5; }],
    ["placement run nonce above uint32", (state) => { state.placement.runNonce = 0x1_0000_0000; }],
    ["placement highest noninteger", (state) => { state.placement.highestAppliedLevel = 1.5; }],
    ["placement highest below minimum", (state) => { state.placement.highestAppliedLevel = engine.CONSTANTS.LEVEL_MIN - 1; }],
    ["placement highest above earned", (state) => { state.placement.highestAppliedLevel = state.earnedLevel + 1; }],
    ["placement ids type", (state) => { state.placement.placedSkillIds = null; }],
    ["placement id duplicate", (state) => { state.placement.placedSkillIds.push(placedSkillId); }],
    ["placement id unknown", (state) => { state.placement.placedSkillIds = ["not-a-skill"]; }],
    ["placement selected-level id", (state) => {
      state.skills[placedSkillId].acquisition = "UNSEEN";
      state.skills[selectedLevelSkillId].acquisition = "PLACED";
      state.placement.placedSkillIds = [selectedLevelSkillId];
    }],
    ["placement record not listed", (state) => { state.placement.placedSkillIds = []; }],
    ["placement listed record not placed", (state) => { state.skills[placedSkillId].acquisition = "UNSEEN"; }],
    ["placement record fake mastery day", (state) => { state.skills[placedSkillId].masteryVerifiedPlayDay = 22_000; }],
    ["placement record fake mastery contract", (state) => {
      state.skills[placedSkillId].masteryContractVersion = engine.CONSTANTS.MASTERY_CONTRACT_VERSION;
    }],
    ["placement confirmation missing", (state) => { state.placement.lastConfirmed = null; }],
    ["placement confirmation unknown field", (state) => { state.placement.lastConfirmed.surprise = true; }],
    ["placement confirmation contract", (state) => { state.placement.lastConfirmed.contractVersion = "wrong"; }],
    ["placement confirmation curriculum", (state) => { state.placement.lastConfirmed.curriculumSha256 = "0".repeat(64); }],
    ["placement confirmation future day", (state) => { state.placement.lastConfirmed.playDay = state.maxSeenPlayDay + 1; }],
    ["placement confirmation recommendation noninteger", (state) => { state.placement.lastConfirmed.recommendedLevel = 1.5; }],
    ["placement confirmation chosen above recommendation", (state) => { state.placement.lastConfirmed.chosenLevel = 3; }],
    ["placement confirmation chosen too far below", (state) => {
      state.placement.lastConfirmed.recommendedLevel = 3;
      state.placement.lastConfirmed.chosenLevel = 1;
    }],
    ["placement confirmation applied below chosen", (state) => { state.placement.lastConfirmed.appliedLevel = 1; }],
    ["placement confirmation question count below minimum", (state) => {
      state.placement.lastConfirmed.questionCount = engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS - 1;
    }],
    ["placement confirmation question count above maximum", (state) => {
      state.placement.lastConfirmed.questionCount = engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS + 1;
    }],
    ["placement confirmation response counts missing", (state) => {
      delete state.placement.lastConfirmed.responseCounts;
    }],
    ["placement confirmation response counts mismatch", (state) => {
      state.placement.lastConfirmed.responseCounts.correct -= 1;
    }],
    ["placement confirmation confidence mismatch", (state) => {
      state.placement.lastConfirmed.confidence = "LIMITED_ABSTENTION";
    }],
  ]) {
    const state = clone(placementState);
    mutate(state);
    await rejectState(`root/${name}`, state);
  }
}

async function assertSavedSkillRecords({ engine, rejectState, validState }) {
  const firstSkillId = engine.SKILLS[0].skillId;
  const missingSkill = clone(validState);
  delete missingSkill.skills[firstSkillId];
  await rejectState("root/skill count missing", missingSkill, /skill records/iu);
  const extraSkill = clone(validState);
  extraSkill.skills["not-a-skill"] = clone(extraSkill.skills[firstSkillId]);
  await rejectState("root/skill count extra", extraSkill, /skill records/iu);
  for (const [name, mutate] of [
    ["record missing", (state) => { state.skills[firstSkillId] = null; }],
    ["record acquisition", (state) => { state.skills[firstSkillId].acquisition = "UNKNOWN"; }],
    ["record fast track", (state) => { state.skills[firstSkillId].fastTrack = "UNKNOWN"; }],
    ["record evidence", (state) => { state.skills[firstSkillId].evidence = null; }],
    ["record misses", (state) => { state.skills[firstSkillId].misses = null; }],
    ["record interval noninteger", (state) => { state.skills[firstSkillId].intervalIndex = 0.5; }],
    ["record interval negative", (state) => { state.skills[firstSkillId].intervalIndex = -1; }],
    ["record interval beyond schedule", (state) => { state.skills[firstSkillId].intervalIndex = engine.CONSTANTS.SPACING_INTERVAL_DAYS.length; }],
    ["settings missing", (state) => { state.settings = null; }],
    ["grown-up cap noninteger", (state) => { state.settings.grownUpPracticeCap = 1.5; }],
    ["grown-up cap negative", (state) => { state.settings.grownUpPracticeCap = -1; }],
    ["grown-up cap above maximum", (state) => { state.settings.grownUpPracticeCap = 21; }],
    ["soft time cap type", (state) => { state.settings.grownUpSoftTimeCapMs = "1000"; }],
    ["soft time cap zero", (state) => { state.settings.grownUpSoftTimeCapMs = 0; }],
    ["soft time cap negative", (state) => { state.settings.grownUpSoftTimeCapMs = -1; }],
    ["automatic speech type", (state) => { state.settings.speechEnabled = "yes"; }],
  ]) {
    const state = clone(validState);
    mutate(state);
    await rejectState(`root/${name}`, state);
  }
  return { firstSkillId };
}

async function createPopulatedSaveFixture({ accept, engine, firstSkillId, validState }) {
  const populatedRoot = clone(validState);
  const firstSkill = engine.SKILL_BY_ID[firstSkillId];
  populatedRoot.practiceCountByDay = { "22000": 1 };
  populatedRoot.sessionLog = [{
    sessionId: "coverage-session",
    playDay: 22_000,
    level: firstSkill.level,
    servedPracticeCount: 1,
    classifications: ["NATURAL"],
    endedReason: "NATURAL",
    overrunMs: 0,
    overrunCauses: ["RETEACH"],
  }];
  populatedRoot.feedbackHistory = [{
    stage: firstSkill.stage,
    branch: "FIRST_TRY_CLEAN",
    line: "Saved feedback.",
    sessionId: "coverage-session",
    playDay: 22_000,
  }];
  populatedRoot.reteachQueue = [{
    skillId: firstSkillId,
    sessionId: "coverage-session",
    recordId: "coverage-attempt",
    playDay: 22_000,
    reason: "CHRONIC",
  }];
  populatedRoot.currentLevelColdWindow = [{
    recordId: "coverage-cold",
    skillId: firstSkillId,
    level: firstSkill.level,
    feedbackClass: "INCORRECT",
    evidenceClass: "GUESS_PRONE_SELECTION",
    playDay: 22_000,
    coldTest: true,
  }];
  populatedRoot.levelReteachActive = true;
  populatedRoot.levelReteachTargets = [firstSkillId];
  populatedRoot.levelReteachTargetSince = { [firstSkillId]: 22_000 };
  populatedRoot.guessingLikeStreak = 1;
  populatedRoot.latencyHistory = [{
    stage: firstSkill.stage,
    elapsed: 1_000,
    inputClass: "SELECTION",
    feedbackClass: "INCORRECT",
    idleMs: 0,
  }];
  await accept("fully populated root collections", populatedRoot);
  return { populatedRoot, firstSkill };
}

function rootIdentityAndPracticeCases({ engine }) {
  return [
    ["product version type", (state) => { state.productVersion = 1; }],
    ["product version empty", (state) => { state.productVersion = ""; }],
    ["daily practice object", (state) => { state.practiceCountByDay = []; }],
    ["daily practice noncanonical day", (state) => { state.practiceCountByDay = { "01": 1 }; }],
    ["daily practice negative day", (state) => { state.practiceCountByDay = { "-1": 1 }; }],
    ["daily practice count noninteger", (state) => { state.practiceCountByDay = { "22000": 0.5 }; }],
    ["daily practice count negative", (state) => { state.practiceCountByDay = { "22000": -1 }; }],
    ["daily practice count above maximum", (state) => {
      state.practiceCountByDay = { "22000": engine.CONSTANTS.DAILY_PRACTICE_MAX + 1 };
    }]
  ];
}

function rootMasteryCases({ engine, firstSkillId, submittedAttempt }) {
  return [
    ["record unknown field", (state) => { state.skills[firstSkillId].surprise = true; }],
    ["record due day", (state) => { state.skills[firstSkillId].dueDay = -1; }],
    ["record last spacing day", (state) => { state.skills[firstSkillId].lastSpacingDay = 0.5; }],
    ["record restore needed type", (state) => { state.skills[firstSkillId].restoreNeeded = 0; }],
    ["record restore after day", (state) => { state.skills[firstSkillId].restoreAfterDay = -1; }],
    ["record trigger key", (state) => { state.skills[firstSkillId].lastReteachTriggerKey = 1; }],
    ["record evidence over maximum", (state) => {
      state.skills[firstSkillId].evidence = Array(100_001).fill(null);
    }],
    ["record evidence skill binding", (state) => {
      const row = clone(submittedAttempt);
      row.skillId = firstSkillId === submittedAttempt.skillId ? engine.SKILLS[1].skillId : submittedAttempt.skillId;
      state.skills[firstSkillId].evidence = [row];
    }],
    ["record miss object", (state) => { state.skills[firstSkillId].misses = [null]; }],
    ["record miss day", (state) => {
      state.skills[firstSkillId].misses = [{ playDay: -1, sessionId: "", recordId: "r" }];
    }],
    ["record miss session", (state) => {
      state.skills[firstSkillId].misses = [{ playDay: 0, sessionId: 1, recordId: "r" }];
    }],
    ["record miss record id", (state) => {
      state.skills[firstSkillId].misses = [{ playDay: 0, sessionId: "", recordId: "" }];
    }],
    ["record restore invariant true-null", (state) => {
      state.skills[firstSkillId].restoreNeeded = true;
      state.skills[firstSkillId].restoreAfterDay = null;
    }],
    ["record restore invariant false-day", (state) => {
      state.skills[firstSkillId].restoreNeeded = false;
      state.skills[firstSkillId].restoreAfterDay = 0;
    }],
    ["record witness duplicates", (state) => { state.skills[firstSkillId].witnessIds = ["r", "r"]; }],
    ["record witness missing evidence", (state) => { state.skills[firstSkillId].witnessIds = ["r"]; }]
  ];
}

function rootAudioSettingCases() {
  return [
    ["settings voice URI", (state) => { state.settings.voiceURI = 1; }],
    ["settings speech rate type", (state) => { state.settings.speechRate = "1"; }],
    ["settings speech rate low", (state) => { state.settings.speechRate = 0.49; }],
    ["settings speech rate high", (state) => { state.settings.speechRate = 2.01; }],
    ["settings speech enabled", (state) => { state.settings.speechEnabled = 1; }],
    ["settings sound enabled", (state) => { state.settings.soundEnabled = 1; }],
    ["settings sound volume type", (state) => { state.settings.soundVolume = "1"; }],
    ["settings sound volume high", (state) => { state.settings.soundVolume = 1.01; }],
    ["settings feedback voices missing", (state) => { delete state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN; }],
    ["settings feedback voice type", (state) => { state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN = 1; }]
  ];
}

function rootSessionHistoryCases({ firstSkill, populatedRoot }) {
  return [
    ["session log type", (state) => { state.sessionLog = null; }],
    ["session log over maximum", (state) => { state.sessionLog = Array(201).fill({ sessionId: "s" }); }],
    ["session log row", (state) => { state.sessionLog = [null]; }],
    ["session log unknown field", (state) => { state.sessionLog[0].surprise = true; }, populatedRoot],
    ["session log session id", (state) => { state.sessionLog[0].sessionId = ""; }, populatedRoot],
    ["session log play day", (state) => { state.sessionLog[0].playDay = -1; }, populatedRoot],
    ["session log level", (state) => { state.sessionLog[0].level = 0; }, populatedRoot],
    ["session log served count", (state) => { state.sessionLog[0].servedPracticeCount = 0.5; }, populatedRoot],
    ["session log classifications", (state) => { state.sessionLog[0].classifications = ["X", "X"]; }, populatedRoot],
    ["session log ended reason", (state) => { state.sessionLog[0].endedReason = "STOP"; }, populatedRoot],
    ["session log overrun", (state) => { state.sessionLog[0].overrunMs = -1; }, populatedRoot],
    ["session log overrun causes", (state) => { state.sessionLog[0].overrunCauses = [""]; }, populatedRoot],
    ["feedback history type", (state) => { state.feedbackHistory = null; }],
    ["feedback history over maximum", (state) => {
      state.feedbackHistory = Array(5_001).fill({
        stage: firstSkill.stage,
        branch: "FIRST_TRY_CLEAN",
        line: "line",
        sessionId: "",
      });
    }],
    ["feedback history unknown field", (state) => { state.feedbackHistory[0].surprise = true; }, populatedRoot],
    ["feedback history stage", (state) => { state.feedbackHistory[0].stage = "UNKNOWN"; }, populatedRoot],
    ["feedback history branch", (state) => { state.feedbackHistory[0].branch = "UNKNOWN"; }, populatedRoot],
    ["feedback history line", (state) => { state.feedbackHistory[0].line = ""; }, populatedRoot],
    ["feedback history session", (state) => { state.feedbackHistory[0].sessionId = 1; }, populatedRoot]
  ];
}

function rootReteachEvidenceCases({ engine, populatedRoot }) {
  return [
    ["reteach queue type", (state) => { state.reteachQueue = null; }],
    ["reteach queue duplicate", (state) => { state.reteachQueue.push(clone(state.reteachQueue[0])); }, populatedRoot],
    ["reteach queue skill", (state) => { state.reteachQueue[0].skillId = "not-a-skill"; }, populatedRoot],
    ["reteach queue reason", (state) => { state.reteachQueue[0].reason = "UNKNOWN"; }, populatedRoot],
    ["reteach queue session", (state) => { state.reteachQueue[0].sessionId = 1; }, populatedRoot],
    ["reteach queue record", (state) => { state.reteachQueue[0].recordId = ""; }, populatedRoot],
    ["reteach queue play day", (state) => { state.reteachQueue[0].playDay = -1; }, populatedRoot],
    ["cold window type", (state) => { state.currentLevelColdWindow = null; }],
    ["cold window at maximum", (state) => {
      state.currentLevelColdWindow = Array(engine.CONSTANTS.LEVEL_RETEACH_WINDOW).fill(clone(populatedRoot.currentLevelColdWindow[0]));
    }],
    ["cold window unknown field", (state) => { state.currentLevelColdWindow[0].surprise = true; }, populatedRoot],
    ["cold window skill", (state) => { state.currentLevelColdWindow[0].skillId = "not-a-skill"; }, populatedRoot],
    ["cold window record", (state) => { state.currentLevelColdWindow[0].recordId = ""; }, populatedRoot],
    ["cold window level binding", (state) => { state.currentLevelColdWindow[0].level += 1; }, populatedRoot],
    ["cold window feedback", (state) => { state.currentLevelColdWindow[0].feedbackClass = "UNKNOWN"; }, populatedRoot],
    ["cold window evidence", (state) => { state.currentLevelColdWindow[0].evidenceClass = "UNKNOWN"; }, populatedRoot],
    ["cold window play day", (state) => { state.currentLevelColdWindow[0].playDay = -1; }, populatedRoot],
    ["cold window flag", (state) => { state.currentLevelColdWindow[0].coldTest = false; }, populatedRoot]
  ];
}

function rootLevelReteachCases({ firstSkillId, populatedRoot }) {
  return [
    ["level reteach active type", (state) => { state.levelReteachActive = 1; }],
    ["level reteach targets type", (state) => { state.levelReteachTargets = null; }],
    ["level reteach target skill", (state) => { state.levelReteachTargets = ["not-a-skill"]; }],
    ["level reteach target duplicate", (state) => { state.levelReteachTargets = [firstSkillId, firstSkillId]; }],
    ["level reteach active mismatch", (state) => {
      state.levelReteachActive = false;
      state.levelReteachTargets = [firstSkillId];
    }],
    ["level reteach dates type", (state) => { state.levelReteachTargetSince = []; }],
    ["level reteach dates count", (state) => { state.levelReteachTargetSince = {}; }, populatedRoot],
    ["level reteach dates target", (state) => {
      state.levelReteachTargetSince = { "not-a-skill": 0 };
    }, populatedRoot],
    ["level reteach dates day", (state) => {
      state.levelReteachTargetSince[firstSkillId] = -1;
    }, populatedRoot]
  ];
}

function rootLatencyAndSeedCases({ engine, populatedRoot }) {
  return [
    ["guessing streak noninteger", (state) => { state.guessingLikeStreak = 0.5; }],
    ["latency history type", (state) => { state.latencyHistory = null; }],
    ["latency history over maximum", (state) => {
      state.latencyHistory = Array(engine.CONSTANTS.FATIGUE_WINDOW_ATTEMPTS + 1).fill(populatedRoot.latencyHistory[0]);
    }],
    ["latency history unknown field", (state) => { state.latencyHistory[0].surprise = true; }, populatedRoot],
    ["latency history stage", (state) => { state.latencyHistory[0].stage = "UNKNOWN"; }, populatedRoot],
    ["latency history elapsed", (state) => { state.latencyHistory[0].elapsed = -1; }, populatedRoot],
    ["latency history input class", (state) => { state.latencyHistory[0].inputClass = "TEXT"; }, populatedRoot],
    ["latency history feedback", (state) => { state.latencyHistory[0].feedbackClass = "UNKNOWN"; }, populatedRoot],
    ["latency history idle", (state) => { state.latencyHistory[0].idleMs = -1; }, populatedRoot],
    ["state seed negative", (state) => { state.seed = -1; }],
    ["state seed above uint32", (state) => { state.seed = 2 ** 32; }]
  ];
}

const rootSchemaCaseBuilders = [rootIdentityAndPracticeCases, rootMasteryCases, rootAudioSettingCases, rootSessionHistoryCases, rootReteachEvidenceCases, rootLevelReteachCases, rootLatencyAndSeedCases];

async function assertRootCollectionDiscriminators(context) {
  const { rejectState, validState } = context;
  for (const [name, mutate, base = validState] of rootSchemaCaseBuilders.flatMap(buildCases => buildCases(context))) {
    const state = clone(base);
    mutate(state);
    await rejectState(`root/${name}`, state);
  }
}

function assertLegacyAudioDefaults({ engine, validState }) {
  const oldSettings = clone(validState);
  delete oldSettings.settings.speechEnabled;
  delete oldSettings.settings.soundEnabled;
  delete oldSettings.settings.soundVolume;
  delete oldSettings.settings.feedbackVoiceByClass;
  const migratedOldSettings = engine.loadState(JSON.stringify(oldSettings), 22_000);
  assert.equal(migratedOldSettings.ok, true);
  assert.equal(migratedOldSettings.migrated, true);
  assert.equal(migratedOldSettings.state.settings.speechEnabled, false);
  assert.equal(migratedOldSettings.state.settings.soundEnabled, false);
  assert.equal(migratedOldSettings.state.settings.soundVolume, 0.5);
  assert.deepEqual(Object.keys(migratedOldSettings.state.settings.feedbackVoiceByClass).sort(), [...engine.CONSTANTS.FEEDBACK_CLASSES].sort());
}

function assertMalformedAudioSettings({ engine, validState }) {
  for (const invalidSoundVolume of ["loud", -0.1, 1.1]) {
    const state = clone(validState);
    state.settings.speechEnabled = "yes";
    state.settings.soundEnabled = "yes";
    state.settings.soundVolume = invalidSoundVolume;
    state.settings.feedbackVoiceByClass = { FIRST_TRY_CLEAN: "voice-a" };
    const loaded = engine.loadState(JSON.stringify(state), 22_000);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.settings.speechEnabled, false);
    assert.equal(loaded.state.settings.soundEnabled, false);
    assert.equal(loaded.state.settings.soundVolume, 0.5);
    assert.equal(loaded.state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN, "voice-a");
    assert.equal(typeof loaded.state.settings.feedbackVoiceByClass.INCORRECT, "string");
  }
}

export const savedStateRootSetupSteps = Object.freeze([
  assertSaveEnvelope,
  createPlacedSaveFixture,
  assertPlacementProvenance,
  assertSavedSkillRecords,
  createPopulatedSaveFixture,
]);

export const savedStateRootFinalSteps = Object.freeze([
  assertRootCollectionDiscriminators,
  assertLegacyAudioDefaults,
  assertMalformedAudioSettings,
]);

function assertRetiredSessionContents(loaded, progress, sessions, feedback) {
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.activeSession, null);
  assert.equal(loaded.state.previewLevel, null);
  assert.deepEqual(clone(loaded.state.skills), progress);
  assert.deepEqual(clone(loaded.state.sessionLog), sessions);
  assert.deepEqual(clone(loaded.state.feedbackHistory), feedback);
}

function assertRetiredSampleContract({ engine, populatedRoot, selection }) {
  const legacyActiveContract = clone(populatedRoot);
  legacyActiveContract.skills[selection.skillId].acquisition = "LEARNING";
  const activeQuestions = [
    legacyActiveContract.activeSession.uiState.question,
    ...(legacyActiveContract.activeSession.uiState.choiceCandidates || []),
  ].filter(Boolean);
  assert.ok(activeQuestions.length > 0, "legacy active-session migration fixture has no questions");
  for (const question of activeQuestions) {
    assert.match(question.sampleKey, new RegExp(`\\|${engine.CONSTANTS.SAMPLE_KEY_VERSION}\\|`, "u"));
    question.sampleKey = question.sampleKey.replace(
      `|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|`,
      "|legacy-question-contract-v1|",
    );
    delete question.generatorContractVersion;
    assert.doesNotMatch(question.sampleKey, new RegExp(`\\|${engine.CONSTANTS.SAMPLE_KEY_VERSION}\\|`, "u"));
  }
  const preservedProgress = clone(legacyActiveContract.skills);
  const preservedSessionHistory = clone(legacyActiveContract.sessionLog);
  const preservedFeedbackHistory = clone(legacyActiveContract.feedbackHistory);
  const migratedActive = engine.loadState(JSON.stringify(legacyActiveContract), 22_001);
  assertRetiredSessionContents(migratedActive, preservedProgress, preservedSessionHistory, preservedFeedbackHistory);
}

function assertRetiredGeneratorContract({ engine, populatedRoot }) {
  const priorV5Active = clone(populatedRoot);
  const priorV5Questions = [
    priorV5Active.activeSession.uiState.question,
    ...(priorV5Active.activeSession.uiState.choiceCandidates || []),
  ].filter(Boolean);
  assert.ok(priorV5Questions.length > 0);
  for (const question of priorV5Questions) {
    question.generatorContractVersion = "question-generator-v5";
  }
  const priorV5Progress = clone(priorV5Active.skills);
  const priorV5SessionHistory = clone(priorV5Active.sessionLog);
  const priorV5FeedbackHistory = clone(priorV5Active.feedbackHistory);
  const migratedPriorV5 = engine.loadState(JSON.stringify(priorV5Active), 22_001);
  assertRetiredSessionContents(migratedPriorV5, priorV5Progress, priorV5SessionHistory, priorV5FeedbackHistory);
}

function assertRetiredUiContract({ engine, populatedRoot }) {
  const priorUiV1 = clone(populatedRoot);
  priorUiV1.activeSession.uiState.version = 1;
  delete priorUiV1.activeSession.uiState.tutorialOpen;
  delete priorUiV1.activeSession.uiState.tutorialStep;
  delete priorUiV1.activeSession.uiState.attemptCommitted;
  const priorUiV1Progress = clone(priorUiV1.skills);
  const priorUiV1SessionHistory = clone(priorUiV1.sessionLog);
  const priorUiV1FeedbackHistory = clone(priorUiV1.feedbackHistory);
  const migratedPriorUiV1 = engine.loadState(JSON.stringify(priorUiV1), 22_001);
  assertRetiredSessionContents(migratedPriorUiV1, priorUiV1Progress, priorUiV1SessionHistory, priorUiV1FeedbackHistory);
}

function assertCurrentAndExpiredSessionHandling({ engine, populatedRoot }) {
  const malformedCurrentActive = clone(populatedRoot);
  malformedCurrentActive.activeSession.uiState.question.inputClass = "BROKEN";
  const rejectedCurrentActive = engine.loadState(JSON.stringify(malformedCurrentActive), 22_001);
  assert.equal(rejectedCurrentActive.ok, false, "current-version malformed active session was migrated instead of rejected");
  const expiredMalformedActive = clone(malformedCurrentActive);
  const expiredSourceBefore = engine.canonical(expiredMalformedActive);
  const preservedExpiredProgress = clone(expiredMalformedActive.skills);
  const preservedExpiredHistory = clone(expiredMalformedActive.sessionLog);
  const loadedExpiredActive = engine.loadState(
    expiredMalformedActive,
    expiredMalformedActive.activeSession.playDay + engine.CONSTANTS.ACTIVE_SESSION_RETENTION_DAYS + 1,
  );
  assert.equal(loadedExpiredActive.ok, true, loadedExpiredActive.error);
  assert.equal(loadedExpiredActive.migrated, true);
  assert.equal(loadedExpiredActive.state.activeSession, null);
  assert.equal(loadedExpiredActive.state.previewLevel, null);
  assert.deepEqual(clone(loadedExpiredActive.state.skills), preservedExpiredProgress);
  assert.deepEqual(clone(loadedExpiredActive.state.sessionLog), preservedExpiredHistory);
  assert.equal(
    engine.canonical(expiredMalformedActive),
    expiredSourceBefore,
    "object-form loads must not mutate the caller's expired snapshot",
  );
}

export const savedStateMigrationSteps = Object.freeze([
  assertRetiredSampleContract,
  assertRetiredGeneratorContract,
  assertRetiredUiContract,
  assertCurrentAndExpiredSessionHandling,
]);
