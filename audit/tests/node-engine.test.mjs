import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "../lib/curriculum-manifest.mjs";
import { runEngineSuite } from "./engine-suite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexPath = () => process.env.MQ_INDEX_PATH || path.join(root, "index.html");
const engineFilename = () => process.env.MQ_ENGINE_COVERAGE_FILE || "math-quest.coverage.engine.js";
const clone = (value) => JSON.parse(JSON.stringify(value));
let sharedSuitePromise;
function sharedEngineSuite() {
  if (!sharedSuitePromise) {
    const only = process.env.MQ_AUDIT_ONLY ? new Set(process.env.MQ_AUDIT_ONLY.split(",").filter(Boolean)) : null;
    sharedSuitePromise = runEngineSuite({
      root,
      indexPath: indexPath(),
      engineFilename: engineFilename(),
      only,
    });
  }
  return sharedSuitePromise;
}

function findQuestion(engine, predicate) {
  for (const skill of engine.SKILLS) {
    const taskTypes = skill.constraints?.taskTypes || [skill.generatorProfile];
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (let ordinal = 0; ordinal < Math.max(24, taskTypes.length * 4); ordinal += 1) {
        const question = engine.makeQuestion({
          skillId: skill.skillId,
          tier,
          representation: skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT",
          seed: 0x6d617468,
          ordinal,
          eligibleQuestionOrdinal: ordinal,
        });
        if (predicate(question, skill)) return question;
      }
    }
  }
  throw new Error("No generated question satisfies the coverage fixture.");
}

function baseUi(question, overrides = {}) {
  return {
    version: 1,
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
    selectionChanged: false,
    feedback: null,
    lastAttempt: null,
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

function stateWithUi(engine, uiState) {
  const state = engine.createInitialState(22_000);
  state.activeSession = {
    sessionId: "coverage-session",
    playDay: 22_000,
    queue: [{ skillId: engine.SKILLS[0].skillId, ordinal: 0 }],
    index: 0,
    uiState,
  };
  return state;
}

function fullStateWithUi(engine, uiState) {
  const state = engine.createInitialState(22_000);
  const built = clone(engine.buildSessionQueue(state, { playDay: 22_000, seed: state.seed }));
  state.activeSession = {
    ...built,
    index: 0,
    world: "ocean",
    servedCount: 0,
    servedOrdinals: [],
    elapsedMs: 0,
    stopReason: null,
    classifications: [...built.classifications],
    oneMore: false,
    uiState,
  };
  return state;
}

function validAttemptFor(question) {
  return {
    recordId: "coverage-attempt",
    questionId: question.questionId,
    skillId: question.skillId,
    feedbackClass: "FIRST_TRY_CLEAN",
    taskType: question.taskType,
  };
}

test("canonical curriculum validator is closed at every governed object boundary", async (t) => {
  const loaded = await loadManifest(path.join(root, "curriculum", "math-quest-manifest-v1.json"));
  assert.deepEqual([...validateManifest(loaded.manifest)], []);
  const rejectsUnknown = async (name, mutate) => t.test(name, () => {
    const manifest = clone(loaded.manifest);
    mutate(manifest);
    const issues = validateManifest(manifest);
    assert.ok(issues.length > 0, `${name} unexpectedly passed the closed manifest schema`);
    assert.ok(issues.some((issue) => /unknown field|unregistered constraint/iu.test(issue)), issues.join("\n"));
  });
  await rejectsUnknown("MANIFEST-CLOSED root", (manifest) => { manifest.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED localization", (manifest) => { manifest.localization.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED licence", (manifest) => { manifest.licence.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED authorship", (manifest) => { manifest.authorshipMethod.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED localization review", (manifest) => { manifest.localizationReview.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED phase legend", (manifest) => { manifest.phaseLegend.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED constraint conventions", (manifest) => { manifest.constraintConventions.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED constraint policy", (manifest) => { manifest.constraintConventions.numberPolicy.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED task policy", (manifest) => { manifest.taskTypePolicy.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED constraint schema", (manifest) => { manifest.constraintSchema.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED band", (manifest) => { manifest.bands[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED level", (manifest) => { manifest.levels[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED rationale", (manifest) => { manifest.designRationales[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED source", (manifest) => { manifest.sources[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED benchmark", (manifest) => { manifest.benchmarkIndex[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED skill", (manifest) => { manifest.skills[0].surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED assessment", (manifest) => { manifest.skills[0].assessment.surprise = true; });
  await rejectsUnknown("MANIFEST-CLOSED skill constraint", (manifest) => { manifest.skills[0].constraints.surprise = true; });
});

test("exact shipped engine behavioral audit", async (t) => {
  const suite = await sharedEngineSuite();
  for (const result of suite.harness.results) {
    await t.test(`${result.id} ${result.title}`, () => {
      if (result.status === "SKIP" || (!result.required && result.status !== "PASS")) return;
      assert.equal(result.status, "PASS", result.details);
    });
  }
  assert.equal(suite.summary.requiredFailures, 0, JSON.stringify(suite.harness.results.filter((r) => r.required && r.status !== "PASS"), null, 2));
});

test("canonical manifest-to-generator semantic audit", async (t) => {
  const { runManifestSemanticSuite } = await import("./manifest-semantic-suite.mjs");
  assert.equal(typeof runManifestSemanticSuite, "function");
  const suite = await runManifestSemanticSuite({
    root,
    indexPath: process.env.MQ_INDEX_PATH || path.join(root, "index.html"),
    engineFilename: process.env.MQ_ENGINE_COVERAGE_FILE || "math-quest.semantic.engine.js",
  });
  assert.ok(Array.isArray(suite.assertions), "semantic suite must return an assertions array");
  assert.equal(suite.assertions.length, 130, "semantic assertion count drifted");
  assert.equal(suite.summary?.skills, 126, "semantic skill count drifted");
  assert.equal(suite.summary?.taskTypes, 156, "semantic task-type coverage is incomplete");
  assert.equal(suite.summary?.questions, 6_048, "semantic deterministic-question count drifted");
  for (const result of suite.assertions) {
    await t.test(`${result.id} ${result.title}`, () => {
      if (result.status === "SKIP") return;
      const passed = result.status ? result.status === "PASS" : result.ok === true;
      assert.equal(passed, true, result.details || result.reason || JSON.stringify(result));
    });
  }
  assert.equal(suite.ok, true, JSON.stringify(suite.failures || [], null, 2));
});

test("nested save snapshots validate every persisted discriminator", async (t) => {
  const { engine } = await sharedEngineSuite();
  const selection = findQuestion(engine, (question) => question.inputClass === "SELECTION" && question.options.length >= 2);
  const construction = findQuestion(engine, (question) => question.inputClass === "CONSTRUCTION");
  const capstone = engine.makeQuestion({
    skillId: selection.skillId,
    tier: "EASY",
    representation: selection.representation,
    seed: 0x6d617468,
    ordinal: 10_001,
    eligibleQuestionOrdinal: 0,
    scaffolded: true,
    capstone: true,
  });
  const attempt = validAttemptFor(selection);
  const validUi = baseUi(selection);
  const validState = stateWithUi(engine, validUi);
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
    return rejectUi(`question/${name}`, baseUi(replacement === undefined ? question : replacement));
  };

  await accept("question phase", validState);
  const fullyPopulatedActiveState = fullStateWithUi(engine, validUi);
  await accept("fully populated active session", fullyPopulatedActiveState);
  const configuredState = clone(validState);
  configuredState.previewLevel = engine.CONSTANTS.LEVEL_MAX;
  configuredState.settings.grownUpSoftTimeCapMs = 0;
  await accept("valid preview and zero time cap", configuredState);
  assert.equal(engine.loadState(clone(validState), 22_000).ok, true, "object-form save loads through defensive clone");
  await accept("construction question", stateWithUi(engine, baseUi(construction)));
  await accept("physical phase", stateWithUi(engine, baseUi(selection, { phase: "physical" })));
  await accept("reteach phase", stateWithUi(engine, baseUi(selection, { phase: "reteach", isReteach: true })));
  await accept("pick phase", stateWithUi(engine, baseUi(selection, {
    phase: "pick",
    choiceCandidates: [selection, clone(selection)],
  })));
  await accept("feedback phase", stateWithUi(engine, baseUi(selection, {
    phase: "feedback",
    feedback: "Saved feedback.",
    lastAttempt: submittedAttempt,
  })));
  await accept("capstone question", stateWithUi(engine, baseUi(capstone, { screen: "capstone" })));
  await accept("fatigue without a question", stateWithUi(engine, baseUi(null, { screen: "fatigue" })));
  const optionalMaxIdle = clone(validState);
  delete optionalMaxIdle.activeSession.uiState.maxIdleMs;
  await accept("legacy snapshot without max idle", optionalMaxIdle);
  const noIndex = clone(validState);
  delete noIndex.activeSession.index;
  await accept("active session without optional index", noIndex);
  const noUi = clone(validState);
  delete noUi.activeSession.uiState;
  await accept("active session without optional UI", noUi);
  const inactive = clone(validState);
  inactive.activeSession = null;
  await accept("no active session", inactive);

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
    ["root/skills missing", { ...clone(validState), skills: null }, /skill records/iu],
  ]) {
    await rejectState(name, value, expected);
  }

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
    ["soft time cap negative", (state) => { state.settings.grownUpSoftTimeCapMs = -1; }],
  ]) {
    const state = clone(validState);
    mutate(state);
    await rejectState(`root/${name}`, state);
  }

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

  for (const [name, mutate, base = validState] of [
    ["product version type", (state) => { state.productVersion = 1; }],
    ["product version empty", (state) => { state.productVersion = ""; }],
    ["daily practice object", (state) => { state.practiceCountByDay = []; }],
    ["daily practice noncanonical day", (state) => { state.practiceCountByDay = { "01": 1 }; }],
    ["daily practice negative day", (state) => { state.practiceCountByDay = { "-1": 1 }; }],
    ["daily practice count noninteger", (state) => { state.practiceCountByDay = { "22000": 0.5 }; }],
    ["daily practice count negative", (state) => { state.practiceCountByDay = { "22000": -1 }; }],
    ["daily practice count above maximum", (state) => {
      state.practiceCountByDay = { "22000": engine.CONSTANTS.DAILY_PRACTICE_MAX + 1 };
    }],
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
    ["record witness missing evidence", (state) => { state.skills[firstSkillId].witnessIds = ["r"]; }],
    ["settings voice URI", (state) => { state.settings.voiceURI = 1; }],
    ["settings speech rate type", (state) => { state.settings.speechRate = "1"; }],
    ["settings speech rate low", (state) => { state.settings.speechRate = 0.49; }],
    ["settings speech rate high", (state) => { state.settings.speechRate = 2.01; }],
    ["settings sound enabled", (state) => { state.settings.soundEnabled = 1; }],
    ["settings sound volume type", (state) => { state.settings.soundVolume = "1"; }],
    ["settings sound volume high", (state) => { state.settings.soundVolume = 1.01; }],
    ["settings feedback voices missing", (state) => { delete state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN; }],
    ["settings feedback voice type", (state) => { state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN = 1; }],
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
    ["feedback history session", (state) => { state.feedbackHistory[0].sessionId = 1; }, populatedRoot],
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
    ["cold window flag", (state) => { state.currentLevelColdWindow[0].coldTest = false; }, populatedRoot],
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
    }, populatedRoot],
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
    ["state seed above uint32", (state) => { state.seed = 2 ** 32; }],
  ]) {
    const state = clone(base);
    mutate(state);
    await rejectState(`root/${name}`, state);
  }

  const oldSettings = clone(validState);
  delete oldSettings.settings.soundEnabled;
  delete oldSettings.settings.soundVolume;
  delete oldSettings.settings.feedbackVoiceByClass;
  const migratedOldSettings = engine.loadState(JSON.stringify(oldSettings), 22_000);
  assert.equal(migratedOldSettings.ok, true);
  assert.equal(migratedOldSettings.state.settings.soundEnabled, false);
  assert.equal(migratedOldSettings.state.settings.soundVolume, 0.5);
  assert.deepEqual(Object.keys(migratedOldSettings.state.settings.feedbackVoiceByClass).sort(), [...engine.CONSTANTS.FEEDBACK_CLASSES].sort());
  for (const invalidSoundVolume of ["loud", -0.1, 1.1]) {
    const state = clone(validState);
    state.settings.soundEnabled = "yes";
    state.settings.soundVolume = invalidSoundVolume;
    state.settings.feedbackVoiceByClass = { FIRST_TRY_CLEAN: "voice-a" };
    const loaded = engine.loadState(JSON.stringify(state), 22_000);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.settings.soundEnabled, false);
    assert.equal(loaded.state.settings.soundVolume, 0.5);
    assert.equal(loaded.state.settings.feedbackVoiceByClass.FIRST_TRY_CLEAN, "voice-a");
    assert.equal(typeof loaded.state.settings.feedbackVoiceByClass.INCORRECT, "string");
  }

  for (const [name, mutate] of [
    ["not an object", (active) => "active"],
    ["session id", (active) => { active.sessionId = 7; }],
    ["play day noninteger", (active) => { active.playDay = 1.5; }],
    ["play day negative", (active) => { active.playDay = -1; }],
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
  for (const key of ["scheduledReview", "coldTest", "choicePosition", "mandatorySecondExposure", "preview"]) {
    const state = clone(fullyPopulatedActiveState);
    state.activeSession.queue[0][key] = "false";
    await rejectState(`active/full/queue ${key} boolean`, state, /active session/iu);
  }

  for (const [name, mutate] of [
    ["not an object", () => "saved-ui"],
    ["version", (ui) => { ui.version = 2; }],
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

  for (const [name, mutate, source] of [
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
    }],
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
    ["construction index negative one", (q) => { q.correctIndex = 0; }, construction],
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
    ["eligible ordinal negative", (q) => { q.eligibleQuestionOrdinal = -1; }],
  ]) {
    await rejectQuestion(name, mutate, source);
  }
  for (const key of ["preview", "scaffolded", "reteachStep", "capstone", "coldTest", "scheduledReview", "applied"]) {
    await rejectQuestion(`${key} boolean`, (question) => { question[key] = 0; });
  }

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

  const nestedInvalid = clone(validState);
  nestedInvalid.activeSession.uiState.question.optionCount += 1;
  const live = engine.createInitialState(22_000);
  const liveBefore = engine.canonical(live);
  const transactional = engine.importState(live, JSON.stringify(nestedInvalid), 22_000);
  assert.equal(transactional.ok, false);
  assert.equal(transactional.state, live);
  assert.equal(engine.canonical(live), liveBefore);
  assert.throws(() => engine.exportState(nestedInvalid), /active session/iu);
});

test("public engine APIs cover defensive and boundary branches effect-sensitively", async (t) => {
  const { engine } = await sharedEngineSuite();
  const selection = findQuestion(engine, (question) => question.inputClass === "SELECTION" && question.options.length >= 4);
  const construction = findQuestion(engine, (question) => question.inputClass === "CONSTRUCTION");
  const singleTaskConstruction = findQuestion(engine, (question, skill) => (
    question.inputClass === "CONSTRUCTION"
    && skill.constraints.taskTypes.length === 1
  ));
  const rationalQuestion = findQuestion(engine, (question) => question.answer.kind === "rational");
  const textQuestion = findQuestion(engine, (question) => question.answer.kind === "text");
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

  await t.test("API-PARSE rational and fraction edge forms", () => {
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
  });

  await t.test("API-GRADE selection, rational, and text defensive paths", () => {
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

    const normalizedText = clone(textQuestion);
    normalizedText.answer.value = "Yes";
    assert.equal(engine.gradeAnswer(normalizedText, "  yEs  ").correct, true);
    assert.equal(engine.gradeAnswer(normalizedText, null).valid, false);
  });

  await t.test("API-SUBMIT evidence and telemetry discriminators", () => {
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

    const fallbackQuestion = clone(construction);
    delete fallbackQuestion.stage;
    delete fallbackQuestion.taskType;
    const fallbackAttempt = engine.submitAnswer(fallbackQuestion, fallbackQuestion.answer.value, {});
    assert.equal(fallbackAttempt.stage, engine.stageForLevel(fallbackQuestion.level));
    assert.equal(
      fallbackAttempt.taskType,
      engine.SKILL_BY_ID[fallbackQuestion.skillId].generatorProfile,
    );

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
  });

  await t.test("API-PROGRESSION spacing, fast track, re-teaching, and promotion edges", () => {
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

    assert.equal(engine.evaluatePromotion().promote, false);
    const initial = engine.createInitialState(0);
    assert.equal(engine.evaluatePromotion({ state: initial, currentLevel: 999 }).promote, false);
    assert.equal(engine.evaluatePromotion({ state: initial }).ratio, 0);

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
  });

  await t.test("API-FATIGUE stop classification and feedback branches", () => {
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

    assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: -1 })], []);
    assert.equal(engine.classifySessionStop().stateClassification, "NATURAL");
    const unknown = engine.classifySessionStop({ reason: "CUSTOM", activeReteach: 0, capstonePending: 0 });
    assert.equal(unknown.stateClassification, "CUSTOM");
    assert.equal(unknown.finishReteach, false);
    assert.equal(unknown.runCapstone, false);

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

    assert.throws(() => engine.renderChildString("missing.child.string"), /Unknown child string/u);
    const slotted = engine.CHILD_STRINGS.find((record) => /\{[A-Za-z]/u.test(record.text));
    assert.ok(slotted);
    assert.throws(() => engine.renderChildString(slotted.id), /Missing child string slot/u);
  });

  await t.test("API-STATE and session builders expose fail-closed fallbacks", () => {
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
      sampleKey: `api-sample-${skill.skillId}-${overrides.playDay ?? 22_001}`,
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
    const missingDefaults = clone(initial);
    delete missingDefaults.reteachQueue;
    delete missingDefaults.levelReteachTargetSince;
    const rejected = engine.applyAttempt(missingDefaults, null);
    assert.equal(rejected.effects[0].type, "REJECTED_ATTEMPT");
    assert.deepEqual(clone(rejected.state.reteachQueue), []);
    assert.deepEqual(clone(rejected.state.levelReteachTargetSince), {});

    const previewAttempt = { ...clone(engine.submitAnswer(construction, construction.answer.value, validTelemetry)), preview: true };
    assert.deepEqual(clone(engine.applyAttempt(initial, previewAttempt).effects), []);

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

    const restoreSkill = engine.SKILL_BY_ID[singleTaskConstruction.skillId];
    const restoreState = engine.createInitialState(22_000);
    restoreState.earnedLevel = restoreSkill.level;
    restoreState.skills[restoreSkill.skillId].acquisition = "PRACTISING";
    restoreState.skills[restoreSkill.skillId].restoreNeeded = true;
    restoreState.skills[restoreSkill.skillId].restoreAfterDay = 22_000;
    const restored = engine.applyAttempt(restoreState, evidenceAttempt(restoreSkill, {
      scheduledReview: true,
      playDay: 22_001,
    }));
    assert.equal(restored.state.skills[restoreSkill.skillId].acquisition, "SOLID");
    assert.equal(restored.state.skills[restoreSkill.skillId].restoreNeeded, false);
    assert.ok(restored.effects.some((effect) => effect.type === "SKILL_RESTORED"));

    const sinceFallbackState = engine.createInitialState(0);
    sinceFallbackState.earnedLevel = restoreSkill.level;
    sinceFallbackState.levelReteachActive = true;
    sinceFallbackState.levelReteachTargets = [restoreSkill.skillId];
    sinceFallbackState.levelReteachTargetSince = {};
    sinceFallbackState.skills[restoreSkill.skillId].acquisition = "SOLID";
    const clearedTarget = engine.applyAttempt(sinceFallbackState, evidenceAttempt(restoreSkill, {
      scheduledReview: true,
      playDay: 1,
    }));
    assert.equal(clearedTarget.state.levelReteachActive, false);
    assert.deepEqual(clone(clearedTarget.state.levelReteachTargets), []);

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

    const noTargets = clone(initial);
    delete noTargets.levelReteachTargets;
    assert.ok(Array.isArray(engine.buildSessionQueue(noTargets, { playDay: 22_000, seed: 1 }).queue));
    const noPractice = clone(initial);
    noPractice.settings.grownUpPracticeCap = 0;
    const empty = engine.buildSessionQueue(noPractice, { playDay: 22_000, seed: 1 });
    assert.equal(empty.queue.length, 0);
    assert.ok(empty.classifications.includes("ADULT_CAPPED"));
    const allSolid = clone(initial);
    for (const skill of engine.SKILLS) {
      allSolid.skills[skill.skillId].acquisition = "SOLID";
      allSolid.skills[skill.skillId].dueDay = null;
    }
    assert.equal(engine.buildSessionQueue(allSolid, { playDay: 22_000, seed: 1 }).queue.length, 0);

    const dueSkills = engine.SKILLS.filter((skill) => skill.level === 4 && skill.phases.includes("A")).slice(0, 2);
    assert.equal(dueSkills.length, 2);
    const twoDue = engine.createInitialState(22_000);
    twoDue.earnedLevel = 4;
    for (const skill of engine.SKILLS) {
      twoDue.skills[skill.skillId].acquisition = "SOLID";
      twoDue.skills[skill.skillId].dueDay = null;
    }
    for (const skill of dueSkills) twoDue.skills[skill.skillId].dueDay = 22_000;
    const dueQueue = engine.buildSessionQueue(twoDue, { playDay: 22_000, seed: 1 }).queue;
    assert.equal(dueQueue[0].scheduledReview, true);
    assert.equal(dueQueue[1].scheduledReview, true);
    assert.equal(dueQueue[1].representation, "ABSTRACT");

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
  });
});
