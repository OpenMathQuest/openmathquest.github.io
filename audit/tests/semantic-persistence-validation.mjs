// Persistence acceptance and hostile-import rejection scenarios for the semantic suite.
function persistedConstructionFixture(engine, requireCondition, stateFrom) {
  let persisted = engine.createInitialState(30_000);
  let persistedQuestion = null;
  for (const skill of engine.SKILLS) {
    const candidate = engine.makeQuestion({
      skillId: skill.skillId,
      tier: "HARD/TARGET",
      representation: "PICTORIAL",
      seed: 0x4d515631,
      ordinal: 3,
    });
    if (candidate.inputClass === "CONSTRUCTION") {
      persistedQuestion = candidate;
      break;
    }
  }
  requireCondition(persistedQuestion, "hostile-import fixture could not find a construction question");
  const persistedAttempt = engine.submitAnswer(persistedQuestion, persistedQuestion.answer.value, {
    promptFinishedAt: 1_000,
    submittedAt: 5_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    selectionEvents: [],
    hintUsed: false,
    modelUsed: true,
    sessionId: "hostile-import-fixture",
    playDay: 30_000,
  });
  persisted = stateFrom(engine.applyAttempt(persisted, persistedAttempt));
  requireCondition(engine.validateState(persisted) === null, "valid nested evidence fixture does not export");
  return { persisted, persistedQuestion };
}

function validateCompatibleState(engine, persisted, requireCondition) {
  const compatiblePatchSave = JSON.parse(JSON.stringify(persisted));
  compatiblePatchSave.productVersion = "1.0.1-beta.2";
  requireCondition(engine.validateState(compatiblePatchSave) === null, "schema-compatible app patch version was rejected");
  requireCondition(engine.loadState(JSON.stringify(compatiblePatchSave), 30_000).ok === true, "schema-compatible app patch backup did not load");
  requireCondition(engine.createInitialState(30_000).maxSeenPlayDay === 30_000, "valid initial play day was not preserved");
  for (const invalidPlayDay of [-1, 1.5, Number.POSITIVE_INFINITY, "30000"]) {
    const initial = engine.createInitialState(invalidPlayDay);
    requireCondition(initial.maxSeenPlayDay === 0, `invalid initial play day was not normalized: ${String(invalidPlayDay)}`);
    requireCondition(engine.validateState(initial) === null, `invalid play-day input created an invalid initial state: ${String(invalidPlayDay)}`);
  }
}

function hostileStateMutations(persistedQuestion, firstSkill) {
  return [
    ["product version", (state) => { state.productVersion = 7; }],
    ["state seed", (state) => { state.seed = -1; }],
    ["root boolean", (state) => { state.levelReteachActive = "false"; }],
    ["daily practice count", (state) => { state.practiceCountByDay["30000"] = "1"; }],
    ["settings unknown key", (state) => { state.settings.onlineVoice = true; }],
    ["settings voice type", (state) => { state.settings.voiceURI = { uri: "voice" }; }],
    ["settings feedback schema", (state) => { state.settings.feedbackVoiceByClass.EXTRA = ""; }],
    ["skill due day", (state) => { state.skills[persistedQuestion.skillId].dueDay = "tomorrow"; }],
    ["skill restore fields", (state) => { state.skills[persistedQuestion.skillId].restoreNeeded = true; }],
    ["skill witness contents", (state) => { state.skills[persistedQuestion.skillId].witnessIds = ["missing-record"]; }],
    ["evidence feedback class", (state) => { state.skills[persistedQuestion.skillId].evidence[0].feedbackClass = "UNKNOWN"; }],
    ["evidence task type", (state) => { state.skills[persistedQuestion.skillId].evidence[0].taskType = "not-declared"; }],
    ["evidence finite latency", (state) => { state.skills[persistedQuestion.skillId].evidence[0].elapsed = "slow"; }],
    ["miss contents", (state) => { state.skills[firstSkill.skillId].misses = [{ playDay: "30000", sessionId: "s", recordId: "r" }]; }],
    ["session log contents", (state) => { state.sessionLog = [{ sessionId: "s", overrunMs: "0" }]; }],
    ["feedback history contents", (state) => { state.feedbackHistory = [{ stage: firstSkill.stage, branch: "UNKNOWN", line: "line", sessionId: "s" }]; }],
    ["re-teach queue skill", (state) => { state.reteachQueue = [{ skillId: "not-a-skill", reason: "SAME_SESSION" }]; }],
    ["cold-test discriminator", (state) => { state.currentLevelColdWindow = [{ recordId: "r", skillId: firstSkill.skillId, level: firstSkill.level, feedbackClass: "FIRST_TRY_CLEAN", evidenceClass: "CONSTRUCTION", playDay: 30_000, coldTest: false }]; }],
    ["re-teach target date", (state) => { state.levelReteachActive = true; state.levelReteachTargets = [firstSkill.skillId]; state.levelReteachTargetSince = { [firstSkill.skillId]: "30000" }; }],
    ["fatigue history input class", (state) => { state.latencyHistory = [{ stage: firstSkill.stage, elapsed: 1_000, inputClass: "GUESS", feedbackClass: "INCORRECT", idleMs: 0 }]; }],
    ["active queue unknown field", (state) => { state.activeSession = { sessionId: "s", playDay: 30_000, queue: [{ skillId: firstSkill.skillId, ordinal: 0, injected: true }] }; }],
  ];
}

function validateHostileState({ engine, persisted, live, liveBefore, requireCondition }, label, mutate) {
  const hostile = JSON.parse(JSON.stringify(persisted));
  mutate(hostile);
  const imported = engine.importState(live, JSON.stringify(hostile), 30_000);
  requireCondition(imported.ok === false, `${label}: hostile import was accepted`);
  requireCondition(imported.state === live, `${label}: failed import replaced the live state reference`);
  requireCondition(engine.canonical(live) === liveBefore, `${label}: failed import mutated live state bytes`);
  let exportRejected = false;
  try {
    engine.exportState(hostile);
  } catch {
    exportRejected = true;
  }
  requireCondition(exportRejected, `${label}: hostile state exported successfully`);
}

function validateHostileImports(engine, persisted, persistedQuestion, requireCondition) {
  const live = engine.createInitialState(30_000);
  const liveBefore = engine.canonical(live);
  const firstSkill = engine.SKILLS[0];
  const context = { engine, persisted, live, liveBefore, requireCondition };
  for (const [label, mutate] of hostileStateMutations(persistedQuestion, firstSkill)) {
    validateHostileState(context, label, mutate);
  }
}

export function validateSemanticPersistence(engine, { requireCondition, stateFrom }) {
  const { persisted, persistedQuestion } = persistedConstructionFixture(engine, requireCondition, stateFrom);
  validateCompatibleState(engine, persisted, requireCondition);
  validateHostileImports(engine, persisted, persistedQuestion, requireCondition);
}

