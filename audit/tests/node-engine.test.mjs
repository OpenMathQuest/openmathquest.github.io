import { assertEarlyActivityContracts, assertGeneratorRepresentationMatrix, registerGeneratorBoundaryTests } from "./generator-contract.mjs";
import { registerPublicEngineBoundaryTests } from "./public-api-contract.mjs";
import { registerSavedDateContracts, assertCompletedResponseRoundtrips, assertSavedQuestionRegeneration, registerSavedQuestionBindingTests } from "./saved-state-boundary-contract.mjs";
import { registerSavedStateContracts } from "./saved-state-contract.mjs";
import { assertSessionPrefixContracts } from "./session-prefix-contract.mjs";
import { registerPlacementApiBoundaryTests } from "./placement-api-boundary-contract.mjs";
import { registerResponseActionTests } from "./response-action-contract.mjs";
import { registerResponsePersistenceTests } from "./response-persistence-contract.mjs";
import { registerResponseCompletionTests } from "./response-completion-contract.mjs";
import { registerResponsePredicateTests } from "./response-predicate-contract.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test, { after } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "../lib/curriculum-manifest.mjs";
import { childStringArtifact } from "../lib/child-strings.mjs";
import { runEngineSuite } from "./engine-suite.mjs";
import "./placement-fixtures.test.mjs";
import { baseUi, stateWithUi, findActiveQuestion, choiceResolutionsForActivated } from "./session-fixtures.mjs";
import { structuredResponseQuestions } from "./response-fixtures.mjs";
import { registerResponsePolicyCoverageTests } from "./response-boundary-contract.mjs";
import { assertEngineCoverageContracts } from "./tutorial-engine-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexPath = () => process.env.MQ_INDEX_PATH || path.join(root, "index.html"); const engineFilename = () => process.env.MQ_ENGINE_COVERAGE_FILE || "math-quest.coverage.engine.js";
const clone = (value) => JSON.parse(JSON.stringify(value)); let sharedSuitePromise;
const structuredAudit = { engine: null, semantic: null };
after(async () => {
  const outputPath = process.env.MQ_STRUCTURED_AUDIT_FILE;
  if (!outputPath) return;
  if (!structuredAudit.engine || !structuredAudit.semantic) {
    throw new Error("The structured coverage audit cannot be emitted before engine and semantic suites complete.");
  }
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    artifactKind: "MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1",
    complete: true,
    engine: structuredAudit.engine,
    semantic: structuredAudit.semantic,
  })}\n`, { encoding: "utf8", flag: "wx" });
});
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

async function coveredEngineSuite() { const suite = await sharedEngineSuite(); assertEngineCoverageContracts(suite.engine); return suite; }

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
  const suite = await coveredEngineSuite();
  const stringArtifact = childStringArtifact(suite.engine.CHILD_STRINGS ?? suite.engine.CHILD_STRING_TABLE);
  structuredAudit.engine = {
    sha256: suite.extracted.sha256,
    summary: suite.summary,
    results: suite.harness.results,
    effectMap: suite.harness.effectMap,
    childStringCandidateSha256: stringArtifact.sha256,
    childStringConstants: {
      pendingApproval: suite.engine.CONSTANTS.CHILD_STRINGS_PENDING_APPROVAL,
      approvalSha256: suite.engine.CONSTANTS.CHILD_STRING_APPROVAL_SHA256 ?? suite.engine.CONSTANTS.CHILD_STRING_DIGEST ?? null,
    },
  };
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
  const manifestArtifact = await loadManifest(path.join(root, "curriculum", "math-quest-manifest-v1.json"));
  const expectedTaskTypes = manifestArtifact.manifest.skills.reduce(
    (total, skill) => total + new Set(skill.constraints.taskTypes).size,
    0,
  );
  assert.equal(typeof runManifestSemanticSuite, "function");
  const suite = await runManifestSemanticSuite({
    root,
    indexPath: process.env.MQ_INDEX_PATH || path.join(root, "index.html"),
    engineFilename: process.env.MQ_ENGINE_COVERAGE_FILE || "math-quest.semantic.engine.js",
  });
  structuredAudit.semantic = {
    assertions: suite.assertions,
    summary: suite.summary,
    failures: suite.failures,
    contractPass: suite.ok === true,
  };
  assert.ok(Array.isArray(suite.assertions), "semantic suite must return an assertions array");
  assert.equal(suite.assertions.length, 130, "semantic assertion count drifted");
  assert.equal(suite.summary?.skills, manifestArtifact.manifest.skills.length, "semantic skill count drifted");
  assert.equal(suite.summary?.taskTypes, expectedTaskTypes, "semantic task-type coverage is incomplete");
  assert.equal(suite.summary?.questions, manifestArtifact.manifest.skills.length * 2 * 24, "semantic deterministic-question count drifted");
  for (const result of suite.assertions) {
    await t.test(`${result.id} ${result.title}`, () => {
      if (result.status === "SKIP") return;
      const passed = result.status ? result.status === "PASS" : result.ok === true;
      assert.equal(passed, true, result.details || result.reason || JSON.stringify(result));
    });
  }
  assert.equal(suite.ok, true, JSON.stringify(suite.failures || [], null, 2));
});

test("MQ-002 keeps exact quantities while each world uses its own countable objects", async () => {
  const { engine } = await sharedEngineSuite();
  const expected = {
    ocean: { noun: "shells", objectKind: "shell" },
    forest: { noun: "acorns", objectKind: "acorn" },
    space: { noun: "moon rocks", objectKind: "moon-rock" },
  };
  let zeroOrdinal = -1;
  for (let ordinal = 0; ordinal < 24; ordinal += 1) {
    const questions = Object.entries(expected).map(([theme, contract]) => {
      const question = engine.makeQuestion({
        skillId: "MQ-002",
        tier: "EASY",
        representation: "CONCRETE",
        theme,
        seed: 0x4d510002,
        ordinal,
        eligibleQuestionOrdinal: ordinal,
      });
      const item = question.modelDescriptor.values.items[0];
      assert.equal(question.params.noun, contract.noun);
      assert.equal(item.objectKind, contract.objectKind);
      assert.equal(item.magnitude, Number(question.answer.value));
      assert.equal(question.inputMethod, "COUNT_TOUCH");
      return question;
    });
    assert.equal(new Set(questions.map((question) => question.answer.value)).size, 1, "world choice must not change the mathematics");
    const count = Number(questions[0].answer.value);
    const exact = { touched: Array.from({ length: count }, (_, index) => `i${index}`), count: String(count) };
    for (const question of questions) {
      assert.equal(engine.gradeAnswer(question, exact).correct, true);
      assert.equal(engine.gradeAnswer(question, { ...exact, count: String(count === 10 ? 9 : count + 1) }).correct, false);
      if (count > 0) {
        assert.equal(engine.gradeAnswer(question, { touched: exact.touched.slice(0, -1), count: exact.count }).correct, false);
        assert.equal(engine.gradeAnswer(question, { touched: [...exact.touched, exact.touched[0]], count: exact.count }).valid, false);
        assert.equal(engine.gradeAnswer(question, { touched: [...exact.touched.slice(0, -1), `i${count}`], count: exact.count }).correct, false);
      }
    }
    if (count === 0) zeroOrdinal = ordinal;
  }
  assert.notEqual(zeroOrdinal, -1, "the deterministic audit cycle must include zero");
  const zero = engine.makeQuestion({
    skillId: "MQ-002",
    tier: "EASY",
    representation: "CONCRETE",
    theme: "ocean",
    seed: 0x4d510002,
    ordinal: zeroOrdinal,
    eligibleQuestionOrdinal: zeroOrdinal,
  });
  const zeroState = engine.createResponseState(zero);
  assert.equal(engine.isResponseComplete(zero, zeroState), false);
  zeroState.count = "0";
  assert.equal(engine.isResponseComplete(zero, zeroState), true);
  assert.equal(engine.gradeAnswer(zero, { touched: [], count: "0" }).correct, true);
});

test("screen-native early activities expose exact visible sources without revealing their answers", async () => {
  const { engine } = await sharedEngineSuite();
  assertEarlyActivityContracts(engine);
});

test("MQ-006 uses two varied pictorial activities with a large truthful duration contrast", async () => {
  const { engine } = await sharedEngineSuite();
  const positions = new Set();
  const pairs = new Set();
  for (let ordinal = 0; ordinal < 24; ordinal += 1) {
    const question = engine.makeQuestion({
      skillId: "MQ-006",
      tier: "EASY",
      representation: "PICTORIAL",
      theme: "forest",
      seed: 0x4d510006,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
    });
    const descriptor = question.modelDescriptor.values;
    assert.equal(question.semanticPromptStringId, "question.eventDuration");
    assert.equal(question.optionCount, 2);
    assert.match(question.prompt, /^Look at the time cards\./u);
    assert.deepEqual(new Set(question.options.map((option) => option.value)), new Set(["first", "second"]));
    assert.equal(descriptor.kind, "durationPair");
    assert.equal(descriptor.items.length, 2);
    assert.equal(descriptor.candidates.length, 2);
    assert.ok(Math.max(question.params.first, question.params.second) >= 4 * Math.min(question.params.first, question.params.second));
    assert.equal(question.answer.value, question.params.first > question.params.second ? "first" : "second");
    assert.ok(descriptor.items.every((item) => item.kind === "durationEvent" && item.unit === "minutes" && item.magnitude > 0));
    assert.equal(descriptor.situation.id, "activity-times");
    assert.equal(descriptor.situation.sourceKind, "activity durations");
    assert.equal(descriptor.situation.actionKind, "compare duration");
    assert.ok(descriptor.candidates.every((candidate) => candidate.label.includes(candidate.magnitude === 1 ? "1 minute" : `${candidate.magnitude} minutes`)));
    assert.ok(descriptor.candidates.every((candidate) => !/\b1 minutes\b/u.test(candidate.label)));
    assert.deepEqual(
      new Set(descriptor.candidates.map((candidate) => candidate.optionValue)),
      new Set(question.options.map((option) => option.value)),
    );
    const correct = question.options.find((option) => option.value === question.answer.value);
    const wrong = question.options.find((option) => option.value !== question.answer.value);
    assert.equal(engine.gradeAnswer(question, { optionId: correct.optionId }).correct, true);
    assert.equal(engine.gradeAnswer(question, { optionId: wrong.optionId }).correct, false);
    const attempt = engine.submitAnswer(question, { optionId: correct.optionId }, {
      promptFinishedAt: 1000,
      submittedAt: 6000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [{ optionId: correct.optionId, at: 1000 }],
      sessionId: "mq006-audit",
      playDay: 1,
    });
    assert.equal(attempt.evidenceClass, "GUESS_PRONE_SELECTION");
    assert.equal(engine.updateFastTrackEligibility({ current: "FAST_TRACK_ELIGIBLE", attempt }), "STANDARD_ONLY");
    positions.add(question.answer.value);
    pairs.add([question.params.firstObject, question.params.secondObject].sort().join("|"));
  }
  assert.deepEqual(positions, new Set(["first", "second"]));
  assert.equal(pairs.size, 3);
});

test("nested save snapshots validate every persisted discriminator", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerSavedStateContracts(t, engine, validAttemptFor);
});

test("persisted event days cannot outrun the rollback-defense watermark", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerSavedDateContracts(t, engine, findQuestion);
});

test("legacy mastery witnesses cannot regain current SOLID status after one current attempt", async () => {
  const { engine } = await sharedEngineSuite();
  const skill = engine.SKILL_BY_ID["MQ-003"];
  assert.ok(skill, "the migration fixture skill must exist");
  assert.equal(skill.constraints.taskTypes.length, 1, "the fixture must isolate one task-type obligation");

  const attempt = (index, sampleKeyVersion = engine.CONSTANTS.SAMPLE_KEY_VERSION) => ({
    recordId: `legacy-witness-${index}`,
    questionId: `legacy-witness-question-${index}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType: skill.constraints.taskTypes[0],
    tier: "HARD/TARGET",
    representation: index === 0 ? "CONCRETE" : "PICTORIAL",
    inputClass: "SELECTION",
    inputMethod: "PICTURE_CHOICE",
    selectionOptionCount: 4,
    evidenceClass: "GUESS_PRONE_SELECTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: false,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${sampleKeyVersion}|sample-${index}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 4_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: true,
    applied: false,
    preview: false,
    capstone: false,
    reteachStep: false,
    sessionId: `legacy-witness-session-${index}`,
    playDay: 22_000 + index,
  });

  let state = engine.createInitialState(22_000);
  for (let index = 0; index < engine.CONSTANTS.FAST_GUESS_SUCCESSES; index += 1) {
    state = engine.applyAttempt(state, attempt(index)).state;
  }
  assert.equal(state.skills[skill.skillId].acquisition, "SOLID", "the control fixture must first earn current mastery");

  const legacy = clone(state);
  const legacyVersion = "manifest-skill-profile-canonical-params-v1";
  for (const row of legacy.skills[skill.skillId].evidence) {
    row.sampleKey = row.sampleKey.replace(engine.CONSTANTS.SAMPLE_KEY_VERSION, legacyVersion);
  }
  delete legacy.skills[skill.skillId].masteryVerifiedPlayDay;
  delete legacy.skills[skill.skillId].masteryContractVersion;

  const loaded = engine.loadState(JSON.stringify(legacy), 22_010);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.migrated, true);
  const migrated = loaded.state.skills[skill.skillId];
  assert.equal(migrated.acquisition, "PRACTISING");
  assert.deepEqual(clone(migrated.witnessIds), []);
  assert.equal(migrated.evidence.length, engine.CONSTANTS.FAST_GUESS_SUCCESSES, "migration preserves historical detail");

  const applied = engine.applyAttempt(loaded.state, attempt(11));
  const record = applied.state.skills[skill.skillId];
  assert.equal(record.acquisition, "PRACTISING", "legacy evidence must not count toward the current mastery contract");
  assert.deepEqual(clone(record.witnessIds), []);
  assert.equal(record.masteryVerifiedPlayDay, null);
  assert.equal(record.masteryContractVersion, "");
  assert.equal(applied.effects.some((effect) => effect.type === "SKILL_SOLID"), false);
  assert.equal(
    record.evidence.filter((row) => row.sampleKey.includes(`|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|`)).length,
    1,
    "only the newly submitted attempt is current-contract evidence",
  );
});

test("completed pattern, fact-family, and grid-route responses survive active-session round trips", async () => {
  const { engine } = await sharedEngineSuite();
  assertCompletedResponseRoundtrips(engine);
});

test("active served ordinals are exact runtime prefixes for every resumable phase", async (t) => {
  const { engine } = await sharedEngineSuite();
  await assertSessionPrefixContracts(t, engine);
});

test("simultaneous reteach and fatigue persists a cleared resumable checkpoint", async () => {
  const { engine } = await sharedEngineSuite();
  const question = findActiveQuestion(engine, (candidate) => (
    candidate.stage === "PRE_K"
    && candidate.eligibleQuestionOrdinal === 1
    && candidate.inputClass === "SELECTION"
    && candidate.options.length >= 2
  ));
  const wrong = question.options.find((option, index) => index !== question.correctIndex);
  const attempt = engine.submitAnswer(
    question,
    { optionId: wrong.optionId },
    {
      promptFinishedAt: 1_000,
      submittedAt: 2_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      sessionId: "coverage-session",
      playDay: 22_000,
    },
  );
  const before = stateWithUi(engine, baseUi(question));
  before.guessingLikeStreak = engine.CONSTANTS.GUESSING_LIKE_STREAK_BY_STAGE.PRE_K - 1;
  const applied = engine.applyAttempt(before, attempt);
  assert.ok(
    applied.effects.some((effect) => effect.type === "RETEACH_REQUIRED"),
    "the ordinary miss must trigger the reteach branch",
  );
  assert.ok(
    applied.effects.some((effect) => effect.type === "FATIGUE_OFFER"),
    "the same ordinary miss must trigger the fatigue branch",
  );

  const staleReteachQuestion = engine.makeQuestion({
    skillId: question.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: before.activeSession.seed,
    ordinal: 9_000 + before.activeSession.index,
    eligibleQuestionOrdinal: before.activeSession.index,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: before.activeSession.world,
    scaffolded: true,
    reteachStep: true,
  });
  const staleFatigue = clone(applied.state);
  staleFatigue.reteachQueue = [];
  staleFatigue.activeSession.uiState = baseUi(staleReteachQuestion, { screen: "fatigue" });
  assert.equal(
    engine.validateState(staleFatigue),
    "Invalid active session.",
    "the former stale reteach question cannot masquerade as the current queue question",
  );

  const fatigue = clone(applied.state);
  fatigue.reteachQueue = [];
  fatigue.activeSession.uiState = baseUi(null, {
    screen: "fatigue",
    choiceResolved: clone(before.activeSession.uiState.choiceResolved),
  });
  assert.equal(fatigue.activeSession.index, before.activeSession.index);
  assert.equal(fatigue.activeSession.servedCount, before.activeSession.servedCount);
  assert.deepEqual(
    clone(fatigue.activeSession.servedOrdinals),
    clone(before.activeSession.servedOrdinals),
  );
  assert.equal(engine.validateState(fatigue), null, "cleared fatigue checkpoint must validate");
  const bytes = engine.exportState(fatigue);
  const reloaded = engine.loadState(bytes, 22_000);
  assert.equal(reloaded.ok, true, reloaded.error);
  assert.equal(reloaded.state.activeSession.uiState.screen, "fatigue");
  assert.equal(reloaded.state.activeSession.uiState.question, null);
  assert.equal(reloaded.state.activeSession.index, before.activeSession.index);
  assert.deepEqual(
    clone(reloaded.state.activeSession.servedOrdinals),
    clone(before.activeSession.servedOrdinals),
  );
});

test("one-more capstones bind to the just-answered slot in a multi-skill session", async () => {
  const { engine } = await sharedEngineSuite();
  const state = engine.createInitialState(22_000);
  state.skills["MQ-001"].acquisition = "PRACTISING";
  state.skills["MQ-001"].dueDay = 22_000;
  const built = engine.buildSessionQueue(state, { playDay: 22_000, seed: state.seed });
  assert.deepEqual(
    clone(built.queue.slice(0, 3).map((slot) => slot.skillId)),
    ["MQ-001", "MQ-004", "MQ-006"],
    "fixture needs a due skill followed by two distinct fresh skills",
  );

  const capstoneFor = (slot) => engine.makeQuestion({
    skillId: slot.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: built.seed,
    ordinal: 1001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: "ocean",
    scaffolded: true,
    capstone: true,
  });
  const justAnswered = built.queue[1];
  const oneMoreQuestion = capstoneFor(justAnswered);
  state.activeSession = {
    ...built,
    index: 2,
    world: "ocean",
    servedCount: 2,
    servedOrdinals: built.queue.slice(0, 2).map((slot) => slot.ordinal),
    elapsedMs: 100,
    stopReason: "FATIGUE_STOPPED",
    classifications: ["FATIGUE_STOPPED"],
    oneMore: true,
    uiState: baseUi(oneMoreQuestion, {
      screen: "capstone",
      responseState: engine.createResponseState(oneMoreQuestion),
      stopRequested: true,
      choiceResolved: choiceResolutionsForActivated(
        engine,
        { ...built, world: "ocean", servedCount: 2 },
        2,
      ),
    }),
  };
  assert.equal(engine.validateState(state), null, "one-more uses the prior, just-answered queue slot");
  const restored = engine.loadState(engine.exportState(state), 22_000);
  assert.equal(restored.ok, true, restored.error);
  assert.equal(restored.state.activeSession.uiState.question.skillId, justAnswered.skillId);

  const directStop = clone(state);
  const currentSlot = built.queue[2];
  const directQuestion = capstoneFor(currentSlot);
  directStop.activeSession.oneMore = false;
  directStop.activeSession.servedCount = 3;
  directStop.activeSession.servedOrdinals = built.queue.slice(0, 3).map((slot) => slot.ordinal);
  directStop.activeSession.stopReason = "ADULT_STOPPED";
  directStop.activeSession.classifications = ["ADULT_STOPPED"];
  directStop.activeSession.uiState = baseUi(directQuestion, {
    screen: "capstone",
    responseState: engine.createResponseState(directQuestion),
    stopRequested: true,
    choiceResolved: choiceResolutionsForActivated(
      engine,
      directStop.activeSession,
      directStop.activeSession.servedCount,
    ),
  });
  assert.equal(engine.validateState(directStop), null, "a direct stop still uses the current queue slot");
});

test("active-session questions must be exact deterministic regenerations", async () => {
  const { engine } = await sharedEngineSuite();
  assertSavedQuestionRegeneration(engine);
});

test("active feedback is bound to the approved deterministic line, response, and full attempt", async () => {
  const { engine } = await sharedEngineSuite();
  const question = findActiveQuestion(engine, (candidate) => candidate.inputClass === "SELECTION");
  const selected = question.options[question.correctIndex].optionId;
  const attempt = engine.submitAnswer(
    question,
    { optionId: selected },
    {
      promptFinishedAt: 1_000,
      submittedAt: 4_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      sessionId: "coverage-session",
      playDay: 22_000,
    },
  );
  const line = engine.feedbackLine(attempt, 0, []);
  let control = stateWithUi(engine, baseUi(question, {
    phase: "feedback",
    selected,
    feedback: line,
    lastAttempt: attempt,
  }));
  control = engine.applyAttempt(control, attempt).state;
  control.feedbackHistory.push({
    stage: attempt.stage,
    branch: attempt.feedbackClass,
    line,
    sessionId: attempt.sessionId,
    playDay: attempt.playDay,
    recordId: attempt.recordId,
    questionId: attempt.questionId,
  });
  assert.equal(engine.validateState(control), null);
  const promotedDuringFeedback = clone(control);
  promotedDuringFeedback.earnedLevel = Math.min(
    engine.CONSTANTS.LEVEL_MAX,
    promotedDuringFeedback.activeSession.level + 1,
  );
  const promotedBytes = engine.exportState(promotedDuringFeedback);
  const promotedReload = engine.loadState(promotedBytes, 22_000);
  assert.equal(promotedReload.ok, true, promotedReload.error);
  assert.equal(promotedReload.state.activeSession.level + 1, promotedReload.state.earnedLevel);
  assert.equal(promotedReload.state.activeSession.uiState.phase, "feedback");

  const hostileLine = clone(control);
  hostileLine.activeSession.uiState.feedback = "UNAPPROVED HOSTILE CHILD MESSAGE";
  hostileLine.feedbackHistory.at(-1).line = "UNAPPROVED HOSTILE CHILD MESSAGE";
  assert.equal(engine.validateState(hostileLine), "Invalid active session.");

  for (const mutate of [
    (state) => { delete state.activeSession.uiState.lastAttempt.firstAnswerCorrect; },
    (state) => { state.activeSession.uiState.lastAttempt.firstAnswerCorrect = false; },
    (state) => { state.activeSession.uiState.lastAttempt.feedbackClass = "INCORRECT"; },
    (state) => {
      const wrong = question.options.find((option) => option.optionId !== selected);
      state.activeSession.uiState.selected = wrong.optionId;
    },
  ]) {
    const hostile = clone(control);
    mutate(hostile);
    assert.equal(engine.validateState(hostile), "Invalid active session.");
    assert.equal(engine.loadState(JSON.stringify(hostile), 22_000).ok, false);
    const live = engine.createInitialState(22_000);
    const imported = engine.importState(live, JSON.stringify(hostile), 22_000);
    assert.equal(imported.ok, false);
    assert.equal(imported.state, live);
  }
});

test("public engine APIs cover defensive and boundary branches effect-sensitively", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerPublicEngineBoundaryTests(t, engine, findQuestion);
});

test("every declared skill preserves its mathematical task across CPA representations and worlds", async () => {
  const { engine } = await sharedEngineSuite();
  assertGeneratorRepresentationMatrix(engine);
});

test("[NC-GENERATOR-CONTRACT-AND-STIMULUS-MUTATIONS] question generation and contract APIs fail closed with effect-specific reasons", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerGeneratorBoundaryTests(t, engine, findQuestion);
});

test("all structured response methods reject malformed child actions without changing their meaning", async (t) => {
  const { engine } = await sharedEngineSuite();
  const activeByMethod = structuredResponseQuestions(engine);
  await registerResponseActionTests(t, engine, activeByMethod);
});

test("structured response persistence rejects every method-specific boundary without replacing progress", async (t) => {
  const { engine } = await sharedEngineSuite();
  const activeByMethod = structuredResponseQuestions(engine);
  await registerResponsePersistenceTests(t, engine, activeByMethod);
  await registerResponseCompletionTests(t, engine, activeByMethod);
  await registerResponsePredicateTests(t, engine, activeByMethod);
});

test("grid-route geometry rejects ambiguous, unsafe, and off-board plans", async () => {
  const { engine } = await sharedEngineSuite();
  const route = findActiveQuestion(
    engine,
    (question) => question.inputMethod === "GRID_ROUTE",
  );
  assert.ok(engine.gridRouteSpecification(route), "canonical route fixture");
  assert.equal(engine.gridRouteSpecification(null), null);
  assert.equal(engine.gridRouteSpecification({ inputMethod: "NUMBER_PAD" }), null);

  const specification = (params) => engine.gridRouteSpecification({
    ...clone(route),
    params,
  });
  assert.equal(specification({ start: "C4", moves: [] }).startX, 3);
  assert.equal(specification({ start: "C4", moves: [] }).startY, 4);
  assert.deepEqual(
    clone(specification({ start: { x: 2, y: 3 }, moves: [] }).expectedEnd),
    { x: 2, y: 3 },
  );
  assert.deepEqual(
    clone(specification({ x: 4, y: 5, moves: [] }).expectedEnd),
    { x: 4, y: 5 },
  );
  assert.deepEqual(clone(specification({ moves: [] }).expectedEnd), { x: 1, y: 1 });
  for (const params of [
    { start: { x: 1.5, y: 1 }, moves: [] },
    { start: { x: 0, y: 1 }, moves: [] },
    { start: { x: 21, y: 1 }, moves: [] },
    { start: { x: 1, y: 1.5 }, moves: [] },
    { start: { x: 1, y: 0 }, moves: [] },
    { start: { x: 1, y: 21 }, moves: [] },
    { start: { x: "not-a-number", y: 1 }, moves: [] },
    { start: "not-a-cell", moves: ["X"] },
  ]) {
    assert.equal(specification(params), null, `unsafe route ${JSON.stringify(params)}`);
  }
  for (const params of [
    { start: "A1", moves: ["L"] },
    { start: "A1", moves: ["D"] },
    { start: "T20", moves: ["R"] },
    { start: "T20", moves: ["U"] },
  ]) {
    assert.equal(specification(params), null, `off-board route ${JSON.stringify(params)}`);
  }
  const explicit = specification({
    start: "B2",
    gridSize: 7,
    moves: ["R", "U", "L", "D"],
  });
  assert.equal(explicit.size, 7);
  assert.deepEqual(clone(explicit.expectedMoves), ["R", "U", "L", "D"]);
  assert.deepEqual(clone(explicit.expectedEnd), { x: 2, y: 2 });
  assert.equal(explicit.plannedPoints.length, 5);
  const nonfiniteSize = specification({
    start: "B2",
    gridSize: Number.POSITIVE_INFINITY,
    moves: [],
  });
  assert.equal(nonfiniteSize.size >= 4, true);

  assert.equal(engine.traceGridRoute(route, null), null);
  assert.equal(engine.traceGridRoute(route, ["X"]), null);
  const canonical = engine.gridRouteSpecification(route);
  assert.equal(
    engine.traceGridRoute(route, [...canonical.expectedMoves, "U"]),
    null,
  );
  const tiny = {
    ...clone(route),
    params: { start: "A1", gridSize: 4, moves: ["R"] },
  };
  assert.equal(engine.traceGridRoute(tiny, ["L"]), null);
  assert.deepEqual(
    clone(engine.traceGridRoute(tiny, []).end),
    { x: 1, y: 1 },
  );
  assert.deepEqual(
    clone(engine.traceGridRoute(tiny, ["R"]).end),
    { x: 2, y: 1 },
  );
});

test("active-session question bindings reject cross-phase and cross-progress snapshots", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerSavedQuestionBindingTests(t, engine);
});

test("starting-point placement APIs reject stale, malformed, and non-transactional requests", async (t) => {
  const { engine } = await sharedEngineSuite();
  await registerPlacementApiBoundaryTests(t, engine);
});
registerResponsePolicyCoverageTests({ test, sharedEngineSuite, findActiveQuestion, stateWithUi, baseUi });
