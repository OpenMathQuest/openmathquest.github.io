import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test, { after } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "../lib/curriculum-manifest.mjs";
import { childStringArtifact } from "../lib/child-strings.mjs";
import { runEngineSuite } from "./engine-suite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexPath = () => process.env.MQ_INDEX_PATH || path.join(root, "index.html");
const engineFilename = () => process.env.MQ_ENGINE_COVERAGE_FILE || "math-quest.coverage.engine.js";
const clone = (value) => JSON.parse(JSON.stringify(value));
let sharedSuitePromise;
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

function canonicalActiveSlot(engine, skill, index, { preview = false } = {}) {
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

function questionsForActiveSlot(engine, skill, index, { preview = false } = {}) {
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

function choiceResolutionsForActivated(engine, active, activatedCount = active.servedCount) {
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

function findActiveQuestion(engine, predicate, { preview = false, skillId = null } = {}) {
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

function baseUi(question, overrides = {}) {
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

function stateWithUi(engine, uiState) {
  const state = engine.createInitialState(22_000);
  const savedUi = clone(uiState);
  const question = savedUi?.question || null;
  const pick = savedUi?.phase === "pick";
  const capstone = savedUi?.screen === "capstone";
  const reteach = Boolean(savedUi?.isReteach);
  const seed = question?.seed ?? state.seed;
  const world = question?.theme || "ocean";
  const skill = question ? engine.SKILL_BY_ID[question.skillId] : null;
  const ordinary = Boolean(question && skill && !capstone && !reteach);
  const targetIndex = ordinary && Number.isInteger(question.eligibleQuestionOrdinal)
    ? question.eligibleQuestionOrdinal
    : 0;
  const queueLength = question && skill ? Math.max(1, targetIndex + 1) : 0;
  const queue = Array.from(
    { length: queueLength },
    (_, index) => canonicalActiveSlot(engine, skill, index, {
      preview: ordinary && Boolean(question.preview),
    }),
  );
  const servedLength = !queue.length
    ? 0
    : pick
      ? targetIndex
      : reteach
        ? targetIndex + (savedUi.reteachAdvancesIndex ? 1 : 0)
        : targetIndex + 1;
  const validChoiceResolutionObject = Boolean(
    savedUi?.choiceResolved
    && typeof savedUi.choiceResolved === "object"
    && !Array.isArray(savedUi.choiceResolved),
  );
  const choiceResolved = validChoiceResolutionObject ? { ...savedUi.choiceResolved } : null;
  if (validChoiceResolutionObject) {
    for (const slot of queue.slice(0, servedLength)) {
      const key = String(slot.ordinal);
      if (!slot.choicePosition || Object.hasOwn(choiceResolved, key)) continue;
      const candidates = questionsForActiveSlot(engine, skill, slot.ordinal, {
        preview: ordinary && Boolean(question.preview),
      });
      if (candidates.length === 2) {
        const variant = ordinary && slot.ordinal === targetIndex
          ? candidates.findIndex((candidate) => engine.canonical(candidate) === engine.canonical(question))
          : 0;
        choiceResolved[key] = variant >= 0 ? variant : 0;
      }
    }
  }
  if (validChoiceResolutionObject) {
    savedUi.choiceResolved = choiceResolved;
  }
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
  state.activeSession = {
    sessionId: "coverage-session",
    playDay: 22_000,
    level: question?.level ?? state.earnedLevel,
    stage: question?.stage ?? engine.stageForLevel(state.earnedLevel),
    seed,
    queue,
    baseSlotCount: queue.length,
    effectivePracticeLimit: queue.length,
    effectivePlannedCount: queue.length,
    effectiveTimeCapMs: 60_000,
    adultTimeReduced: true,
    classifications: [],
    index: targetIndex,
    world,
    servedCount: servedLength,
    servedOrdinals: queue.slice(0, servedLength).map((slot) => slot.ordinal),
    elapsedMs: 0,
    stopReason: null,
    oneMore: false,
    uiState: savedUi,
  };
  return state;
}

function fullStateWithUi(engine, uiState) {
  return stateWithUi(engine, uiState);
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
  assert.equal(engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION, "question-generator-v6");
  assert.equal(engine.CONSTANTS.ACTIVE_UI_VERSION, 3);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed += 1) {
    for (const [skillId, ordinals] of Object.entries({
      "MQ-002": [0],
      "MQ-004": [0, 1, 2],
      "MQ-008": [0],
      "MQ-019": [0, 1],
      "MQ-023": [0, 1, 2],
      "MQ-025": [0, 1, 2],
    })) {
      for (const ordinal of ordinals) {
        const question = engine.makeQuestion({ skillId, seed, ordinal, eligibleQuestionOrdinal: ordinal, theme: "ocean", representation: "PICTORIAL" });
        seen.add(question.semanticPromptStringId);
        const values = question.modelDescriptor.values;
        if (question.semanticPromptStringId === "question.countSet") {
          const count = Number(values.items[0].magnitude);
          assert.equal(values.data.stimulus, true);
          assert.equal(count, Number(question.answer.value));
          const response = question.inputMethod === "COUNT_TOUCH"
            ? { touched: Array.from({ length: count }, (_, index) => `i${index}`), count: String(count) }
            : { optionId: question.options.find((option) => String(option.value) === String(count))?.optionId };
          assert.equal(engine.gradeAnswer(question, response).correct, true);
        } else if (question.semanticPromptStringId === "question.patternVisualNext") {
          const sequence = String(question.params.pattern).split(/\s+/u).filter(Boolean);
          const unit = String(question.params.unit).split(/\s+/u).filter(Boolean);
          assert.deepEqual(sequence, Array.from({ length: sequence.length / unit.length }, () => unit).flat());
          assert.equal(question.answer.value, unit[sequence.length % unit.length]);
          assert.equal(values.data.stimulus, true);
          assert.equal(Object.hasOwn(values, "strategy"), false);
          assert.equal(engine.gradeAnswer(question, { tokens: [question.answer.value] }).correct, true);
        } else if (question.semanticPromptStringId === "question.frameNumber") {
          const frame = values.frames[0];
          assert.equal(frame.capacity, 10);
          assert.equal(frame.value, Number(question.answer.value));
        } else if (question.semanticPromptStringId === "question.makeTenFrame") {
          const frame = values.frames[0];
          assert.equal(frame.value + Number(question.answer.value), 10);
          assert.equal(frame.capacity, 10);
          assert.equal(Object.hasOwn(values, "strategy"), false, "cold stimulus must not expose the missing addend");
          assert.equal(Object.hasOwn(frame, "label"), false, "visible labels must come only from registered child strings");
        } else if (question.semanticPromptStringId === "question.hiddenPart") {
          const frame = values.frames[0];
          assert.equal(frame.value + frame.coveredCount, 10);
          assert.equal(frame.coveredCount, Number(question.answer.value));
          assert.equal(Object.hasOwn(values, "strategy"), false, "covered frame must not expose the hidden count as an equation");
          assert.equal(Object.hasOwn(frame, "label"), false, "visible labels must come only from registered child strings");
        } else if (question.semanticPromptStringId === "question.numberOrder" || question.semanticPromptStringId === "question.numberLeast") {
          const shown = [question.params.a, question.params.b, question.params.c].map(Number);
          const expected = question.semanticPromptStringId === "question.numberLeast" ? Math.min(...shown) : Math.max(...shown);
          assert.equal(Number(question.answer.value), expected);
          assert.equal(new Set(shown).size, 3);
        }
        if (question.inputClass === "SELECTION") {
          const correct = question.options.filter((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
          assert.equal(correct.length, 1, `${question.questionId}: activity must have exactly one correct choice`);
        }
      }
    }
  }
  for (const id of ["question.countSet", "question.patternVisualNext", "question.frameNumber", "question.makeTenFrame", "question.hiddenPart", "question.numberOrder", "question.numberLeast"]) {
    assert.equal(seen.has(id), true, `deterministic activity cycle omitted ${id}`);
  }
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
  const selection = findActiveQuestion(
    engine,
    (question) => question.inputClass === "SELECTION" && question.options.length >= 2,
  );
  const construction = findActiveQuestion(engine, (question) => question.inputClass === "CONSTRUCTION");
  const capstone = engine.makeQuestion({
    skillId: selection.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: 0x6d617468,
    ordinal: 1_001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: "ocean",
    scaffolded: true,
    capstone: true,
  });
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

  await accept("question phase", validState);
  const fullyPopulatedActiveState = fullStateWithUi(engine, validUi);
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
  const reteachQuestion = engine.makeQuestion({
    skillId: selection.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: selection.seed,
    ordinal: 9_000,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: selection.theme,
    scaffolded: true,
    reteachStep: true,
  });
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
  assert.equal(migratedActive.ok, true, migratedActive.error);
  assert.equal(migratedActive.migrated, true);
  assert.equal(migratedActive.state.activeSession, null);
  assert.equal(migratedActive.state.previewLevel, null);
  assert.deepEqual(clone(migratedActive.state.skills), preservedProgress);
  assert.deepEqual(clone(migratedActive.state.sessionLog), preservedSessionHistory);
  assert.deepEqual(clone(migratedActive.state.feedbackHistory), preservedFeedbackHistory);

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
  assert.equal(migratedPriorV5.ok, true, migratedPriorV5.error);
  assert.equal(migratedPriorV5.migrated, true);
  assert.equal(migratedPriorV5.state.activeSession, null);
  assert.equal(migratedPriorV5.state.previewLevel, null);
  assert.deepEqual(clone(migratedPriorV5.state.skills), priorV5Progress);
  assert.deepEqual(clone(migratedPriorV5.state.sessionLog), priorV5SessionHistory);
  assert.deepEqual(clone(migratedPriorV5.state.feedbackHistory), priorV5FeedbackHistory);

  const priorUiV1 = clone(populatedRoot);
  priorUiV1.activeSession.uiState.version = 1;
  delete priorUiV1.activeSession.uiState.tutorialOpen;
  delete priorUiV1.activeSession.uiState.tutorialStep;
  delete priorUiV1.activeSession.uiState.attemptCommitted;
  const priorUiV1Progress = clone(priorUiV1.skills);
  const priorUiV1SessionHistory = clone(priorUiV1.sessionLog);
  const priorUiV1FeedbackHistory = clone(priorUiV1.feedbackHistory);
  const migratedPriorUiV1 = engine.loadState(JSON.stringify(priorUiV1), 22_001);
  assert.equal(migratedPriorUiV1.ok, true, migratedPriorUiV1.error);
  assert.equal(migratedPriorUiV1.migrated, true);
  assert.equal(migratedPriorUiV1.state.activeSession, null);
  assert.equal(migratedPriorUiV1.state.previewLevel, null);
  assert.deepEqual(clone(migratedPriorUiV1.state.skills), priorUiV1Progress);
  assert.deepEqual(clone(migratedPriorUiV1.state.sessionLog), priorUiV1SessionHistory);
  assert.deepEqual(clone(migratedPriorUiV1.state.feedbackHistory), priorUiV1FeedbackHistory);

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
    ["settings speech enabled", (state) => { state.settings.speechEnabled = 1; }],
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

  for (const [name, mutate] of [
    ["not an object", (active) => "active"],
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
  for (const key of ["scheduledReview", "coldTest", "choicePosition", "mandatorySecondExposure", "preview"]) {
    const state = clone(fullyPopulatedActiveState);
    state.activeSession.queue[0][key] = "false";
    await rejectState(`active/full/queue ${key} boolean`, state, /active session/iu);
  }

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

test("persisted event days cannot outrun the rollback-defense watermark", async (t) => {
  const { engine } = await sharedEngineSuite();
  const maximum = 22_000;
  const question = findQuestion(engine, (candidate) => (
    candidate.inputClass === "SELECTION" && candidate.options.length >= 2
  ));
  const wrong = question.options.find((option, index) => index !== question.correctIndex);
  const attempt = engine.submitAnswer(
    question,
    { optionId: wrong.optionId },
    {
      promptFinishedAt: 1_000,
      submittedAt: 4_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      sessionId: "day-bound-session",
      playDay: maximum,
    },
  );
  let baseline = engine.createInitialState(maximum);
  baseline = engine.applyAttempt(baseline, attempt).state;
  assert.equal(engine.validateState(baseline), null, "generated attempt state is the valid control");
  const skillId = attempt.skillId;

  const rejectFuture = async (name, mutate) => t.test(name, () => {
    const state = clone(baseline);
    mutate(state);
    assert.equal(engine.validateState(state), "Saved dates exceed the maximum seen play day.");
    const loaded = engine.loadState(JSON.stringify(state), maximum);
    assert.equal(loaded.ok, false);
    assert.match(loaded.error, /maximum seen play day/iu);
  });

  await rejectFuture("DAY-BOUND practice-count key", (state) => {
    state.practiceCountByDay[String(maximum + 1)] = 1;
  });
  await rejectFuture("DAY-BOUND evidence", (state) => {
    state.skills[skillId].evidence[0].playDay = maximum + 1;
  });
  await rejectFuture("DAY-BOUND miss", (state) => {
    state.skills[skillId].misses[0].playDay = maximum + 1;
  });
  await rejectFuture("DAY-BOUND last spacing day", (state) => {
    state.skills[skillId].lastSpacingDay = maximum + 1;
  });
  await rejectFuture("DAY-BOUND restore day", (state) => {
    state.skills[skillId].restoreNeeded = true;
    state.skills[skillId].restoreAfterDay = maximum + 1;
  });
  await rejectFuture("DAY-BOUND mastery verification day", (state) => {
    const record = state.skills[skillId];
    record.acquisition = "SOLID";
    record.restoreNeeded = false;
    record.restoreAfterDay = null;
    record.masteryVerifiedPlayDay = maximum + 1;
    record.masteryContractVersion = engine.CONSTANTS.MASTERY_CONTRACT_VERSION;
  });
  await rejectFuture("DAY-BOUND session log", (state) => {
    state.sessionLog.push({ sessionId: "future-session", playDay: maximum + 1 });
  });
  await rejectFuture("DAY-BOUND feedback history", (state) => {
    state.feedbackHistory.push({
      stage: attempt.stage,
      branch: attempt.feedbackClass,
      line: "Saved feedback.",
      sessionId: attempt.sessionId,
      playDay: maximum + 1,
    });
  });
  await rejectFuture("DAY-BOUND reteach queue", (state) => {
    state.reteachQueue = [{ skillId, reason: "SAME_SESSION", playDay: maximum + 1 }];
  });
  await rejectFuture("DAY-BOUND cold-test window", (state) => {
    state.currentLevelColdWindow.push({
      recordId: "future-cold",
      skillId,
      level: engine.SKILL_BY_ID[skillId].level,
      feedbackClass: attempt.feedbackClass,
      evidenceClass: attempt.evidenceClass,
      playDay: maximum + 1,
      coldTest: true,
    });
  });
  await rejectFuture("DAY-BOUND level-reteach target", (state) => {
    state.levelReteachActive = true;
    state.levelReteachTargets = [skillId];
    state.levelReteachTargetSince = { [skillId]: maximum + 1 };
  });
  await rejectFuture("DAY-BOUND latency history", (state) => {
    state.latencyHistory[0].playDay = maximum + 1;
  });

  const dueBoundary = clone(baseline);
  dueBoundary.skills[skillId].dueDay = maximum + Math.max(...engine.CONSTANTS.SPACING_INTERVAL_DAYS);
  assert.equal(engine.validateState(dueBoundary), null, "the maximum declared spacing interval is a valid future due date");
  const dueBeyondBoundary = clone(dueBoundary);
  dueBeyondBoundary.skills[skillId].dueDay += 1;
  assert.equal(engine.validateState(dueBeyondBoundary), "Saved dates exceed the maximum seen play day.");

  const legacyOptionalDates = engine.createInitialState(maximum);
  legacyOptionalDates.sessionLog = [{ sessionId: "legacy-session" }];
  legacyOptionalDates.feedbackHistory = [{
    stage: "PRE_K",
    branch: "INCORRECT",
    line: "Legacy feedback.",
    sessionId: "legacy-session",
  }];
  legacyOptionalDates.reteachQueue = [{ skillId: "MQ-001", reason: "SAME_SESSION" }];
  legacyOptionalDates.latencyHistory = [{
    stage: "PRE_K",
    elapsed: 1_000,
    inputClass: "SELECTION",
    feedbackClass: "INCORRECT",
    idleMs: 0,
  }];
  assert.equal(engine.validateState(legacyOptionalDates), null, "optional legacy event dates remain valid");
  assert.equal(engine.loadState(JSON.stringify(legacyOptionalDates), maximum).ok, true);
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
  const make = (skillId) => findActiveQuestion(
    engine,
    (question) => question.skillId === skillId,
    { skillId },
  );
  const fixtures = [];

  const pattern = make("MQ-016");
  assert.equal(pattern.inputMethod, "PATTERN_BUILD");
  const patternResponse = engine.createResponseState(pattern);
  patternResponse.tokens = String(pattern.answer.value).trim().split(/\s+/u);
  fixtures.push({ name: "MQ-016 pattern", question: pattern, response: patternResponse });

  const factFamily = make("MQ-043");
  assert.equal(factFamily.inputMethod, "FACT_FAMILY");
  const factResponse = engine.createResponseState(factFamily);
  const { a, b, whole } = factFamily.params;
  factResponse.selected = [
    `${a}+${b}=${whole}`,
    `${b}+${a}=${whole}`,
    `${whole}\u2212${a}=${b}`,
    `${whole}\u2212${b}=${a}`,
  ];
  fixtures.push({ name: "MQ-043 fact family", question: factFamily, response: factResponse });

  for (const skillId of ["MQ-034", "MQ-125"]) {
    const route = make(skillId);
    assert.equal(route.inputMethod, "GRID_ROUTE");
    const routeResponse = engine.createResponseState(route);
    const specification = engine.gridRouteSpecification(route);
    assert.ok(specification);
    routeResponse.moves = [...specification.expectedMoves];
    routeResponse.end = { ...engine.traceGridRoute(route, routeResponse.moves).end };
    fixtures.push({ name: `${skillId} grid route`, question: route, response: routeResponse });
  }

  for (const fixture of fixtures) {
    assert.equal(engine.gradeAnswer(fixture.question, fixture.response).correct, true, `${fixture.name} control answer`);
    const saved = stateWithUi(engine, baseUi(fixture.question, {
      responseState: fixture.response,
      modelTouched: true,
    }));
    assert.equal(engine.validateState(saved), null, `${fixture.name} must be a valid active save`);
    assert.equal(
      saved.activeSession.queue[saved.activeSession.index].choicePosition,
      true,
      `${fixture.name} must cover a scheduler choice position`,
    );
    const activeSlot = saved.activeSession.queue[saved.activeSession.index];
    const activeCandidates = questionsForActiveSlot(
      engine,
      engine.SKILL_BY_ID[fixture.question.skillId],
      saved.activeSession.index,
    );
    const resolutionKey = String(activeSlot.ordinal);
    if (activeCandidates.length === 1) {
      assert.deepEqual(
        saved.activeSession.uiState.choiceResolved,
        {},
        `${fixture.name} singleton choice must auto-activate without a fabricated resolution`,
      );
      const forgedResolution = clone(saved);
      forgedResolution.activeSession.uiState.choiceResolved[resolutionKey] = 0;
      assert.equal(
        engine.validateState(forgedResolution),
        "Invalid active session.",
        `${fixture.name} singleton choice must reject a resolution the runtime never records`,
      );
      assert.equal(
        engine.loadState(JSON.stringify(forgedResolution), 22_000).ok,
        false,
        `${fixture.name} forged singleton resolution must fail reload`,
      );
    } else {
      assert.equal(
        saved.activeSession.uiState.choiceResolved[resolutionKey],
        activeCandidates.findIndex((candidate) => engine.canonical(candidate) === engine.canonical(fixture.question)),
        `${fixture.name} two-candidate choice records the exact activated variant`,
      );
      const missingResolution = clone(saved);
      delete missingResolution.activeSession.uiState.choiceResolved[resolutionKey];
      assert.equal(
        engine.validateState(missingResolution),
        "Invalid active session.",
        `${fixture.name} two-candidate choice cannot lose its resolution`,
      );
    }

    const serialized = engine.exportState(saved);
    const restored = engine.loadState(serialized, 22_000);
    assert.equal(restored.ok, true, `${fixture.name} must reload`);
    assert.equal(restored.migrated, false, `${fixture.name} must not be discarded as a legacy question`);
    const restoredUi = restored.state.activeSession?.uiState;
    assert.ok(restoredUi, `${fixture.name} active UI must survive`);
    assert.deepEqual(clone(restoredUi.responseState), clone(fixture.response), `${fixture.name} response payload`);
    assert.equal(
      engine.gradeAnswer(restoredUi.question, restoredUi.responseState).correct,
      true,
      `${fixture.name} restored answer`,
    );
  }

  const coordinateRoute = make("MQ-125");
  const coordinateSpecification = engine.gridRouteSpecification(coordinateRoute);
  const legacyRouteSave = stateWithUi(engine, baseUi(coordinateRoute, {
    responseState: { moves: [], end: { x: 1, y: 1 } },
    modelTouched: true,
  }));
  const migratedRoute = engine.loadState(JSON.stringify(legacyRouteSave), 22_000);
  assert.equal(migratedRoute.ok, true, "legacy route response migrates");
  assert.equal(migratedRoute.migrated, true, "legacy route response reports migration");
  assert.deepEqual(
    clone(migratedRoute.state.activeSession.uiState.responseState),
    {
      moves: [],
      end: {
        x: coordinateSpecification.startX,
        y: coordinateSpecification.startY,
      },
    },
    "legacy route response restarts at the displayed origin",
  );
});

test("active served ordinals are exact runtime prefixes for every resumable phase", async (t) => {
  const { engine } = await sharedEngineSuite();
  const question = findActiveQuestion(
    engine,
    (candidate) => candidate.eligibleQuestionOrdinal === 1,
  );
  const ordinary = stateWithUi(engine, baseUi(question));
  assert.deepEqual(ordinary.activeSession.servedOrdinals, [0, 1]);
  assert.equal(engine.validateState(ordinary), null, "ordinary current question control");

  const reject = async (name, state) => t.test(name, () => {
    assert.equal(engine.validateState(state), "Invalid active session.");
    assert.equal(engine.loadState(JSON.stringify(state), 22_000).ok, false);
  });

  const undercounted = clone(ordinary);
  undercounted.activeSession.servedCount = 1;
  undercounted.activeSession.servedOrdinals = [0];
  await reject("SERVE-PREFIX ordinary current slot cannot be omitted", undercounted);
  const live = engine.createInitialState(22_000);
  const imported = engine.importState(live, JSON.stringify(undercounted), 22_000);
  assert.equal(imported.ok, false);
  assert.equal(imported.state, live, "hostile served undercount must not replace live progress");

  const reordered = clone(ordinary);
  reordered.activeSession.servedOrdinals = [1, 0];
  await reject("SERVE-PREFIX served slots cannot be reordered", reordered);

  const pickQuestion = findActiveQuestion(engine, (candidate, skill) => {
    const index = candidate.eligibleQuestionOrdinal;
    return index > 0
      && canonicalActiveSlot(engine, skill, index).choicePosition
      && questionsForActiveSlot(engine, skill, index).length === 2;
  });
  const pickIndex = pickQuestion.eligibleQuestionOrdinal;
  const pickCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    pickIndex,
  );
  const pick = stateWithUi(engine, baseUi(pickCandidates[0], {
    phase: "pick",
    choiceCandidates: clone(pickCandidates),
  }));
  assert.equal(pick.activeSession.servedCount, pickIndex);
  assert.deepEqual(
    pick.activeSession.servedOrdinals,
    pick.activeSession.queue.slice(0, pickIndex).map((slot) => slot.ordinal),
  );
  assert.equal(engine.validateState(pick), null, "pick control stops before the unactivated current slot");
  const preResolvedPick = clone(pick);
  preResolvedPick.activeSession.uiState.choiceResolved[
    String(preResolvedPick.activeSession.queue[pickIndex].ordinal)
  ] = 0;
  await reject("CHOICE-EXACT unresolved pick cannot pre-resolve its current slot", preResolvedPick);
  const pickOvercount = clone(pick);
  pickOvercount.activeSession.servedCount += 1;
  pickOvercount.activeSession.servedOrdinals.push(pick.activeSession.queue[pickIndex].ordinal);
  await reject("SERVE-PREFIX pick cannot count an unactivated choice slot", pickOvercount);

  const activatedChoice = stateWithUi(engine, baseUi(pickCandidates[1]));
  const activatedKey = String(activatedChoice.activeSession.queue[pickIndex].ordinal);
  assert.equal(activatedChoice.activeSession.uiState.choiceResolved[activatedKey], 1);
  assert.equal(engine.validateState(activatedChoice), null, "activated two-candidate choice control");
  const missingActivatedResolution = clone(activatedChoice);
  delete missingActivatedResolution.activeSession.uiState.choiceResolved[activatedKey];
  await reject("CHOICE-EXACT activated two-candidate slot cannot lose its resolution", missingActivatedResolution);

  const followingIndex = pickIndex + 1;
  const followingQuestion = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    followingIndex,
  )[0];
  const afterChoice = stateWithUi(engine, baseUi(followingQuestion));
  assert.equal(afterChoice.activeSession.uiState.choiceResolved[activatedKey], 0);
  assert.equal(engine.validateState(afterChoice), null, "past two-candidate choice control");
  const missingPastResolution = clone(afterChoice);
  delete missingPastResolution.activeSession.uiState.choiceResolved[activatedKey];
  await reject("CHOICE-EXACT past two-candidate slot cannot lose its resolution", missingPastResolution);

  const futureSkill = engine.SKILL_BY_ID[pickQuestion.skillId];
  const futureIndex = pickIndex;
  const futureWorld = "ocean";
  const futureQueue = Array.from(
    { length: futureIndex + 1 },
    (_, index) => canonicalActiveSlot(engine, futureSkill, index),
  );
  const firstSlot = futureQueue[0];
  const firstQuestion = questionsForActiveSlot(engine, futureSkill, 0)[0];
  const futureRoot = stateWithUi(engine, baseUi(firstQuestion));
  futureRoot.activeSession.queue = futureQueue;
  futureRoot.activeSession.baseSlotCount = futureQueue.length;
  futureRoot.activeSession.effectivePracticeLimit = futureQueue.length;
  futureRoot.activeSession.effectivePlannedCount = futureQueue.length;
  futureRoot.activeSession.index = 0;
  futureRoot.activeSession.servedCount = 1;
  futureRoot.activeSession.servedOrdinals = [firstSlot.ordinal];
  futureRoot.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    futureRoot.activeSession,
    1,
  );
  assert.equal(engine.validateState(futureRoot), null, "full-queue future-resolution control");
  const futurePair = futureQueue[futureIndex];
  assert.ok(futurePair, "fixture needs an unactivated future two-candidate choice slot");
  const preResolvedFuture = clone(futureRoot);
  preResolvedFuture.activeSession.uiState.choiceResolved[String(futurePair.ordinal)] = 0;
  await reject("CHOICE-EXACT future two-candidate slot cannot be pre-resolved", preResolvedFuture);

  const selection = findActiveQuestion(
    engine,
    (candidate) => candidate.eligibleQuestionOrdinal === 1 && candidate.inputClass === "SELECTION",
  );
  const selected = selection.options[selection.correctIndex].optionId;
  const attempt = engine.submitAnswer(
    selection,
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
  const line = engine.feedbackLine(attempt, selection.eligibleQuestionOrdinal, []);
  let fatigue = stateWithUi(engine, baseUi(selection, {
    screen: "fatigue",
    phase: "feedback",
    selected,
    feedback: line,
    lastAttempt: attempt,
  }));
  fatigue = engine.applyAttempt(fatigue, attempt).state;
  fatigue.feedbackHistory.push({
    stage: attempt.stage,
    branch: attempt.feedbackClass,
    line,
    sessionId: attempt.sessionId,
    playDay: attempt.playDay,
    recordId: attempt.recordId,
    questionId: attempt.questionId,
  });
  assert.equal(engine.validateState(fatigue), null, "fatigue control retains the current served slot");
  const fatigueUndercount = clone(fatigue);
  fatigueUndercount.activeSession.servedCount -= 1;
  fatigueUndercount.activeSession.servedOrdinals.pop();
  await reject("SERVE-PREFIX fatigue cannot forget its triggering slot", fatigueUndercount);

  const reteachQuestion = engine.makeQuestion({
    skillId: question.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinary.activeSession.seed,
    ordinal: 9_000 + ordinary.activeSession.index,
    eligibleQuestionOrdinal: ordinary.activeSession.index,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinary.activeSession.world,
    scaffolded: true,
    reteachStep: true,
  });
  const initialReteach = clone(ordinary);
  initialReteach.reteachQueue = [{
    skillId: question.skillId,
    reason: "SAME_SESSION",
    sessionId: initialReteach.activeSession.sessionId,
    recordId: "served-prefix-reteach",
    playDay: 22_000,
  }];
  initialReteach.activeSession.servedCount = initialReteach.activeSession.index;
  initialReteach.activeSession.servedOrdinals = initialReteach.activeSession.queue
    .slice(0, initialReteach.activeSession.index)
    .map((slot) => slot.ordinal);
  initialReteach.activeSession.uiState = baseUi(reteachQuestion, {
    phase: "reteach",
    isReteach: true,
    reteachAdvancesIndex: false,
    choiceResolved: choiceResolutionsForActivated(
      engine,
      initialReteach.activeSession,
      initialReteach.activeSession.servedCount,
    ),
  });
  assert.equal(engine.validateState(initialReteach), null, "initial queued reteach precedes current activation");
  const triggeredReteach = clone(initialReteach);
  triggeredReteach.activeSession.uiState.reteachAdvancesIndex = true;
  triggeredReteach.activeSession.servedCount += 1;
  triggeredReteach.activeSession.servedOrdinals.push(
    triggeredReteach.activeSession.queue[triggeredReteach.activeSession.index].ordinal,
  );
  triggeredReteach.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    triggeredReteach.activeSession,
    triggeredReteach.activeSession.servedCount,
  );
  assert.equal(engine.validateState(triggeredReteach), null, "triggered reteach follows current activation");
  const mismatchedReteach = clone(triggeredReteach);
  mismatchedReteach.activeSession.servedCount -= 1;
  mismatchedReteach.activeSession.servedOrdinals.pop();
  await reject("SERVE-PREFIX triggered reteach cannot claim initial-reteach progress", mismatchedReteach);

  const currentSlot = ordinary.activeSession.queue[ordinary.activeSession.index];
  const capstoneQuestion = engine.makeQuestion({
    skillId: currentSlot.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinary.activeSession.seed,
    ordinal: 1_001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinary.activeSession.world,
    scaffolded: true,
    capstone: true,
  });
  const capstoneAfterActivation = clone(ordinary);
  capstoneAfterActivation.activeSession.uiState = baseUi(capstoneQuestion, {
    screen: "capstone",
    choiceResolved: choiceResolutionsForActivated(
      engine,
      capstoneAfterActivation.activeSession,
      capstoneAfterActivation.activeSession.servedCount,
    ),
  });
  assert.equal(engine.validateState(capstoneAfterActivation), null, "capstone after current activation");
  const capstoneBeforeActivation = clone(capstoneAfterActivation);
  capstoneBeforeActivation.activeSession.servedCount -= 1;
  capstoneBeforeActivation.activeSession.servedOrdinals.pop();
  capstoneBeforeActivation.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    capstoneBeforeActivation.activeSession,
    capstoneBeforeActivation.activeSession.servedCount,
  );
  assert.equal(engine.validateState(capstoneBeforeActivation), null, "capstone before current activation");
  const impossibleCapstone = clone(capstoneBeforeActivation);
  impossibleCapstone.activeSession.servedCount -= 1;
  impossibleCapstone.activeSession.servedOrdinals.pop();
  impossibleCapstone.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    impossibleCapstone.activeSession,
    impossibleCapstone.activeSession.servedCount,
  );
  await reject("SERVE-PREFIX capstone cannot omit an earlier activated prefix", impossibleCapstone);
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
  const question = findActiveQuestion(engine, (candidate) => (
    candidate.inputClass === "SELECTION"
    && candidate.options.length >= 2
    && candidate.options[0].label !== candidate.options[1].label
  ));
  const control = stateWithUi(engine, baseUi(question));
  assert.equal(engine.validateState(control), null, "canonical control question must validate");

  const hostile = clone(control);
  const hostileOptions = hostile.activeSession.uiState.question.options;
  [
    hostileOptions[0].label,
    hostileOptions[1].label,
  ] = [
    hostileOptions[1].label,
    hostileOptions[0].label,
  ];
  assert.equal(
    engine.validateQuestionContract(hostile.activeSession.uiState.question).valid,
    true,
    "the structural contract alone should demonstrate why exact regeneration is required",
  );
  assert.equal(engine.validateState(hostile), "Invalid active session.");
  assert.equal(engine.loadState(JSON.stringify(hostile), 22_000).ok, false);
  const liveState = engine.createInitialState(22_000);
  const imported = engine.importState(liveState, JSON.stringify(hostile), 22_000);
  assert.equal(imported.ok, false);
  assert.equal(imported.state, liveState, "transactional import must preserve the live state");

  const selfConsistentReplacement = engine.makeQuestion({
    skillId: question.skillId,
    tier: question.tier,
    representation: question.representation,
    seed: (question.seed + 1) >>> 0,
    ordinal: question.ordinal,
    eligibleQuestionOrdinal: question.eligibleQuestionOrdinal,
    scheduledReview: question.scheduledReview,
    coldTest: question.coldTest,
    preview: question.preview,
    theme: question.theme,
    scaffolded: question.scaffolded,
    reteachStep: question.reteachStep,
    capstone: question.capstone,
  });
  assert.equal(engine.validateQuestionContract(selfConsistentReplacement).valid, true);
  const substituted = clone(control);
  substituted.activeSession.uiState.question = clone(selfConsistentReplacement);
  assert.equal(
    engine.validateState(substituted),
    "Invalid active session.",
    "a canonical question from a different seed must not escape its queue/session binding",
  );

  const exactSlot = canonicalActiveSlot(
    engine,
    engine.SKILL_BY_ID[question.skillId],
    question.eligibleQuestionOrdinal,
  );
  assert.equal(exactSlot.choicePosition, true, "exact-binding coverage fixture must occupy a choice slot");
  const choices = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[question.skillId],
    question.eligibleQuestionOrdinal,
  );
  assert.equal(choices.length, 2, "coverage fixture requires a two-question pick");
  const pickState = stateWithUi(engine, baseUi(choices[0], {
    phase: "pick",
    choiceCandidates: clone(choices),
  }));
  assert.equal(engine.validateState(pickState), null, "canonical pick candidates must validate");
  const swappedPick = clone(pickState);
  swappedPick.activeSession.uiState.choiceCandidates.reverse();
  swappedPick.activeSession.uiState.question = clone(swappedPick.activeSession.uiState.choiceCandidates[0]);
  assert.equal(engine.validateState(swappedPick), "Invalid active session.", "pick order is deterministic");
  pickState.activeSession.uiState.choiceCandidates[1].prompt += " altered";
  assert.equal(engine.validateState(pickState), "Invalid active session.");

  const futureQuestion = findActiveQuestion(
    engine,
    (candidate) => candidate.skillId === "MQ-126",
    { skillId: "MQ-126" },
  );
  const futureLevelSession = stateWithUi(engine, baseUi(futureQuestion));
  futureLevelSession.earnedLevel = engine.CONSTANTS.LEVEL_MIN;
  assert.equal(futureLevelSession.earnedLevel, engine.CONSTANTS.LEVEL_MIN);
  assert.equal(
    engine.validateState(futureLevelSession),
    "Invalid active session.",
    "ordinary work cannot claim a future active level",
  );
  const hiddenFutureQueue = clone(futureLevelSession);
  hiddenFutureQueue.activeSession.level = hiddenFutureQueue.earnedLevel;
  hiddenFutureQueue.activeSession.stage = engine.stageForLevel(hiddenFutureQueue.earnedLevel);
  assert.equal(
    engine.validateState(hiddenFutureQueue),
    "Invalid active session.",
    "a future skill cannot hide inside a current-level ordinary queue",
  );

  const previewQuestion = findActiveQuestion(
    engine,
    (candidate) => candidate.skillId === "MQ-001",
    { preview: true, skillId: "MQ-001" },
  );
  const crossLevelPreview = stateWithUi(engine, baseUi(previewQuestion));
  crossLevelPreview.previewLevel = engine.CONSTANTS.LEVEL_MAX;
  crossLevelPreview.activeSession.level = engine.CONSTANTS.LEVEL_MAX;
  crossLevelPreview.activeSession.stage = engine.stageForLevel(engine.CONSTANTS.LEVEL_MAX);
  assert.equal(
    engine.validateState(crossLevelPreview),
    "Invalid active session.",
    "a preview queue contains only skills from its selected level",
  );
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
    const restoreRepresentation = ({ C: "CONCRETE", P: "PICTORIAL", A: "ABSTRACT" })[restoreSkill.phases.at(-1)];
    const restored = engine.applyAttempt(restoreState, evidenceAttempt(restoreSkill, {
      scheduledReview: true,
      playDay: 22_001,
      representation: restoreRepresentation,
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
      representation: restoreRepresentation,
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

test("every declared skill preserves its mathematical task across CPA representations and worlds", async () => {
  const { engine } = await sharedEngineSuite();
  const representations = ["CONCRETE", "PICTORIAL", "ABSTRACT"];
  const themes = ["ocean", "forest", "space"];
  const seeds = [0, 1, 0x43504131, 0xffffffff];
  let generated = 0;

  for (const skill of engine.SKILLS) {
    const taskTypes = skill.constraints.taskTypes;
    const sampleCount = Math.max(12, taskTypes.length * 6);
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (const representation of representations) {
        for (const seed of seeds) {
          for (let ordinal = 0; ordinal < sampleCount; ordinal += 1) {
            const theme = themes[(ordinal + seed) % themes.length];
            const args = {
              skillId: skill.skillId,
              tier,
              representation,
              theme,
              seed,
              ordinal,
              eligibleQuestionOrdinal: ordinal,
            };
            const question = engine.makeQuestion(args);
            const repeated = engine.makeQuestion(args);
            assert.equal(
              engine.canonical(question),
              engine.canonical(repeated),
              `${skill.skillId}/${tier}/${representation}/${seed}/${ordinal} must be deterministic`,
            );
            assert.equal(question.skillId, skill.skillId);
            assert.equal(question.representation, representation);
            assert.equal(question.theme, theme);
            assert.ok(taskTypes.includes(question.taskType));
            assert.equal(engine.validateQuestionContract(question).valid, true);
            assert.equal(question.modelDescriptor.instructionStringId, "instruction.model");
            assert.equal(typeof question.modelDescriptor.type, "string");
            assert.ok(question.modelDescriptor.type.length > 0);

            if (question.inputClass === "SELECTION") {
              const correct = question.options[question.correctIndex];
              assert.equal(engine.gradeAnswer(question, { optionId: correct.optionId }).correct, true);
              for (const option of question.options) {
                if (option.optionId === correct.optionId) continue;
                assert.equal(
                  engine.gradeAnswer(question, { optionId: option.optionId }).correct,
                  false,
                  `${question.questionId}/${option.optionId} must remain a distractor`,
                );
              }
            } else if (![
              "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
              "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
              "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
              "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
              "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
            ].includes(question.inputMethod)) {
              assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true);
            } else {
              const emptyState = engine.createResponseState(question);
              const serialized = engine.serializeResponse(question, emptyState);
              assert.equal(typeof serialized, "object");
              assert.equal(Array.isArray(serialized), false);
            }
            generated += 1;
          }
        }
      }
    }

    const worldQuestions = themes.map((theme) => engine.makeQuestion({
      skillId: skill.skillId,
      tier: "HARD/TARGET",
      representation: "PICTORIAL",
      theme,
      seed: 0x574f524c,
      ordinal: taskTypes.length * 9,
      eligibleQuestionOrdinal: taskTypes.length * 9,
    }));
    assert.equal(
      new Set(worldQuestions.map((question) => engine.canonical({
        taskType: question.taskType,
        answer: question.answer,
        optionValues: question.options.map((option) => option.value),
      }))).size,
      1,
      `${skill.skillId}: world choice must not alter the mathematical answer`,
    );
  }

  assert.equal(generated > engine.SKILLS.length * 3 * 2, true);
});

test("[NC-GENERATOR-CONTRACT-AND-STIMULUS-MUTATIONS] question generation and contract APIs fail closed with effect-specific reasons", async (t) => {
  const { engine } = await sharedEngineSuite();

  await t.test("GEN-API rejects invalid public generation domains", () => {
    assert.throws(() => engine.makeQuestion(), /Unknown skillId/u);
    assert.throws(() => engine.makeQuestion({ skillId: "not-a-skill" }), /Unknown skillId/u);
    assert.throws(() => engine.makeQuestion({ skillId: "MQ-001", tier: "MEDIUM" }), /Invalid tier/u);
    assert.throws(
      () => engine.makeQuestion({ skillId: "MQ-001", representation: "THOUGHT_ONLY" }),
      /Invalid representation/u,
    );
    for (const seed of [-1, 1.5, 0x1_0000_0000]) {
      assert.throws(() => engine.makeQuestion({ skillId: "MQ-001", seed }), /Invalid seed/u);
    }
    for (const args of [
      { ordinal: -1 },
      { ordinal: 1.5 },
      { ordinal: 0, eligibleQuestionOrdinal: -1 },
      { ordinal: 0, eligibleQuestionOrdinal: 1.5 },
    ]) {
      assert.throws(
        () => engine.makeQuestion({ skillId: "MQ-001", ...args }),
        /Invalid question ordinal/u,
      );
    }
  });

  await t.test("QUESTION-CONTRACT reports each externally observable contract failure", () => {
    const find = (predicate) => findQuestion(engine, predicate);
    const selection = find((question) => question.inputClass === "SELECTION" && question.options.length >= 2);
    const construction = find((question) => question.inputClass === "CONSTRUCTION");
    const direct = find((question) => question.inputMethod === "COUNT_TOUCH");
    const sourceVisual = find((question) => question.semanticPromptStringId === "question.pairObjects");
    const angle = find((question) => question.inputMethod === "ANGLE_MEASURE");
    const pair = find((question) => question.semanticPromptStringId === "question.pairObjects");
    const route = find((question) => question.inputMethod === "GRID_ROUTE");
    const categoricalSort = find((question) => (
      question.semanticPromptStringId === "question.sortRule"
      && Array.isArray(question.modelDescriptor.values.categories)
      && question.modelDescriptor.values.categories.length >= 2
    ));
    const additionWithCap = find((question, skill) => (
      Number.isFinite(Number(skill.constraints.addendMax))
      && ["question.addition", "question.appliedAddition"].includes(question.semanticPromptStringId)
    ));

    const expectReason = (question, reason, mutate) => {
      const hostile = clone(question);
      mutate(hostile);
      const errors = clone(engine.questionContractErrors(hostile));
      assert.ok(errors.includes(reason), `${reason}: ${errors.join(", ")}`);
      assert.equal(engine.validateQuestionContract(hostile).valid, false);
    };

    assert.deepEqual(clone(engine.questionContractErrors(null)), ["unknown-skill"]);
    assert.deepEqual(clone(engine.questionContractErrors({ skillId: "not-a-skill" })), ["unknown-skill"]);
    assert.deepEqual(
      clone(engine.questionContractErrors({ skillId: selection.skillId, answer: null })),
      ["invalid-question-shape"],
    );
    expectReason(selection, "invalid-answer-schema", (question) => { question.answer.kind = "imaginary"; });
    expectReason(selection, "undeclared-task-type", (question) => { question.taskType = "undeclared-task"; });
    expectReason(selection, "invalid-question-domain", (question) => { question.seed = -1; });
    expectReason(selection, "input-method-class-mismatch", (question) => {
      question.inputMethod = question.inputClass === "SELECTION" ? "NUMBER_PAD" : "PICTURE_CHOICE";
    });
    expectReason(direct, "objective-input-mismatch", (question) => { question.inputMethod = "NUMBER_PAD"; });
    expectReason(sourceVisual, "missing-source-stimulus", (question) => {
      question.modelDescriptor.type = "";
      question.modelDescriptor.values = {};
    });
    expectReason(sourceVisual, "answer-bearing-stimulus", (question) => {
      question.modelDescriptor.values = { ...question.modelDescriptor.values, result: "revealed" };
    });
    expectReason(selection, "prompt-identity", (question) => { question.prompt += " changed"; });
    expectReason(selection, "model-instruction-identity", (question) => {
      question.modelDescriptor.instruction += " changed";
    });
    expectReason(selection, "duplicate-options", (question) => {
      question.options[1].optionId = question.options[0].optionId;
    });
    expectReason(selection, "non-unique-mathematical-answer", (question) => {
      const wrongIndex = question.options.findIndex((option, index) => index !== question.correctIndex);
      question.options[wrongIndex].value = question.options[question.correctIndex].value;
      question.options[wrongIndex].label = `equivalent ${question.options[wrongIndex].label}`;
    });
    expectReason(construction, "construction-has-options", (question) => {
      question.options = [{ optionId: "forged", label: "forged", value: question.answer.value }];
      question.correctIndex = 0;
    });
    expectReason(selection, "generated-grammar", (question) => { question.prompt = "There are 1 lines."; });
    expectReason(angle, "angle-tolerance-contract", (question) => {
      question.skillId = selection.skillId;
    });
    expectReason(additionWithCap, "addend-max", (question) => {
      const cap = Number(engine.SKILL_BY_ID[question.skillId].constraints.addendMax);
      question.params.a = cap + 1;
    });
    expectReason(pair, "pairing-constraint", (question) => { question.params.leftCount = 0; });
    expectReason(route, "grid-route-contract", (question) => {
      question.answer.value = question.semanticPromptStringId === "question.coordinateMove" ? "(20,20)" : "T20";
    });
    expectReason(categoricalSort, "categorical-sort-contract", (question) => {
      question.modelDescriptor.values.categories[1].id = question.modelDescriptor.values.categories[0].id;
    });
    expectReason(selection, "sample-identity", (question) => { question.sampleKey += "|forged"; });

    const directMethods = [
      ["MQ-002", "COUNT_TOUCH"],
      ["MQ-010", "ORDER_BUILD"],
      ["MQ-038", "PLACE_VALUE_BUILD"],
      ["MQ-040", "STRATEGY_BUILD"],
      ["MQ-051", "COIN_BUILD"],
      ["MQ-007", "SORT_BINS"],
      ["MQ-106", "SYMMETRY_BUILD"],
      ["MQ-119", "EXPRESSION_BUILD"],
      ["MQ-030", "FRACTION_PARTITION"],
      ["MQ-034", "GRID_ROUTE"],
      ["MQ-018", "GRAPH_BUILD"],
      ["MQ-069", "METRIC_SCALE"],
    ];
    for (const [skillId, inputMethod] of directMethods) {
      let fixture = null;
      for (let ordinal = 0; ordinal < 24 && !fixture; ordinal += 1) {
        const candidate = engine.makeQuestion({
          skillId,
          tier: "HARD/TARGET",
          representation: "PICTORIAL",
          seed: 0x44495245,
          ordinal,
        });
        if (candidate.inputMethod === inputMethod) fixture = candidate;
      }
      assert.ok(fixture, `${skillId}/${inputMethod} direct fixture`);
      const mismatchedObjective = clone(fixture);
      mismatchedObjective.semanticPromptStringId = "question.generic";
      const errors = clone(engine.questionContractErrors(mismatchedObjective));
      assert.equal(
        errors.includes("objective-input-mismatch"),
        false,
        `${inputMethod} must be required only for its declared semantic objective`,
      );
    }

    for (const skillId of ["MQ-001", "MQ-002"]) {
      const neutralWorld = engine.makeQuestion({
        skillId,
        tier: "EASY",
        representation: "ABSTRACT",
        theme: "unspecified",
        seed: 0,
        ordinal: 0,
      });
      assert.equal(neutralWorld.theme, "unspecified");
      assert.match(
        neutralWorld.prompt,
        skillId === "MQ-001" ? /fish.*shell/iu : /objects|object/iu,
      );
      assert.equal(engine.validateQuestionContract(neutralWorld).valid, true);
    }
  });
});

test("all structured response methods reject malformed child actions without changing their meaning", async (t) => {
  const { engine } = await sharedEngineSuite();
  const { correctStructuredResponse } = await import("./manifest-semantic-suite.mjs");
  const structuredMethods = new Set([
    "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
    "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
    "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
    "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
    "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
  ]);
  const activeByMethod = new Map();
  for (const skill of engine.SKILLS) {
    const planned = engine.CONSTANTS.SESSION_PLANNED_BY_STAGE[skill.stage];
    for (let index = 0; index < planned && activeByMethod.size < structuredMethods.size; index += 1) {
      for (const question of questionsForActiveSlot(engine, skill, index)) {
        if (structuredMethods.has(question.inputMethod) && !activeByMethod.has(question.inputMethod)) {
          activeByMethod.set(question.inputMethod, question);
        }
      }
    }
  }
  assert.deepEqual(
    [...activeByMethod.keys()].sort(),
    [...structuredMethods].sort(),
    "every structured child input method needs an active-session fixture",
  );

  await t.test("RESPONSE-SCHEMA empty states serialize and unknown fields fail persisted validation", () => {
    assert.deepEqual(clone(engine.createResponseState(null)), {});
    assert.deepEqual(clone(engine.serializeResponse(null, null)), {});
    for (const [method, question] of activeByMethod) {
      const initialResponse = engine.createResponseState(question);
      const serialized = engine.serializeResponse(question, initialResponse);
      assert.equal(typeof serialized, "object", `${method} serialization`);
      assert.equal(Array.isArray(serialized), false, `${method} serialization object`);
      assert.equal(typeof engine.isResponseComplete(question, initialResponse), "boolean", `${method} completion`);

      const validSave = stateWithUi(engine, baseUi(question, { responseState: initialResponse }));
      assert.equal(engine.validateState(validSave), null, `${method} initial response must be resumable`);

      const unknownField = clone(validSave);
      unknownField.activeSession.uiState.responseState.unexpected = true;
      assert.equal(engine.validateState(unknownField), "Invalid active session.", `${method} unknown response field`);

      const nonObject = clone(validSave);
      nonObject.activeSession.uiState.responseState = [];
      assert.equal(engine.validateState(nonObject), "Invalid active session.", `${method} non-object response`);

      const missingPayload = engine.gradeAnswer(question, null);
      assert.equal(missingPayload.correct, false, `${method} missing payload correctness`);
      assert.equal(missingPayload.valid, false, `${method} missing payload validity`);
      assert.equal(missingPayload.reason, "structured-response-required", `${method} missing payload reason`);

      const submittedResponse = correctStructuredResponse(engine, question);
      const completedResponse = engine.createResponseState(question);
      if (method === "AREA_DECOMPOSE") {
        completedResponse.cutIds = [...submittedResponse.cutIds];
        completedResponse.part0 = String(submittedResponse.partAreas[0]);
        completedResponse.part1 = String(submittedResponse.partAreas[1]);
        completedResponse.total = String(submittedResponse.total);
      } else {
        Object.assign(completedResponse, clone(submittedResponse));
      }
      assert.equal(engine.isResponseComplete(question, completedResponse), true, `${method} completed response`);
      assert.deepEqual(
        clone(engine.serializeResponse(question, completedResponse)),
        clone(submittedResponse),
        `${method} submission serialization`,
      );
      const completedGrade = engine.gradeAnswer(question, submittedResponse);
      assert.equal(completedGrade.valid, true, `${method} completed response validity`);
      assert.equal(completedGrade.correct, true, `${method} completed response correctness`);
      const completedSave = stateWithUi(engine, baseUi(question, { responseState: completedResponse }));
      assert.equal(
        engine.validateState(completedSave),
        null,
        `${method} completed response must resume: ${JSON.stringify(completedResponse)}`,
      );
      const restored = engine.loadState(engine.exportState(completedSave), 22_000);
      assert.equal(restored.ok, true, `${method} completed response reload`);
      assert.deepEqual(
        clone(restored.state.activeSession.uiState.responseState),
        clone(completedResponse),
        `${method} completed response round trip`,
      );
    }
  });

  await t.test("RESPONSE-GRADING malformed method-specific actions stay invalid or incorrect", () => {
    const q = (method) => activeByMethod.get(method);
    const grade = (method, payload) => engine.gradeAnswer(q(method), payload);
    const invalid = (method, payload) => {
      const result = grade(method, payload);
      assert.equal(result.correct, false, `${method} malformed action cannot be correct`);
      assert.equal(result.valid, false, `${method} malformed action must be invalid`);
      return result;
    };

    invalid("COUNT_TOUCH", { touched: "not-an-array", count: "" });
    invalid("COUNT_TOUCH", { touched: ["i0", "i0"], count: 2 });
    invalid("COUNT_TOUCH", { touched: ["outside"], count: Number.POSITIVE_INFINITY });
    invalid("ORDER_BUILD", { order: null });
    invalid("ORDER_BUILD", { order: ["not-a-number"] });

    const place = q("PLACE_VALUE_BUILD");
    for (const semanticPromptStringId of [
      "question.renamePlace",
      "question.scalePlace",
      "question.addition",
      "question.appliedSubtraction",
      "question.placePartition",
    ]) {
      const fixture = { ...clone(place), semanticPromptStringId };
      const result = engine.gradeAnswer(fixture, { action: "wrong-action", value: "" });
      assert.equal(result.valid, false, `PLACE_VALUE_BUILD/${semanticPromptStringId}`);
      assert.equal(result.correct, false, `PLACE_VALUE_BUILD/${semanticPromptStringId}`);
    }

    invalid("COIN_BUILD", { coins: null });
    const noCoin = clone(q("COIN_BUILD"));
    noCoin.params.secondCoin = "unknown";
    assert.equal(engine.gradeAnswer(noCoin, { coins: [1] }).valid, false);
    invalid("SYMMETRY_BUILD", { lines: ["line1", "line1"] });
    invalid("EXPRESSION_BUILD", { rule: "", value: Number.NaN });
    invalid("PAIR_LINK", { links: [["a0"]] });
    invalid("PAIR_LINK", { links: [["a999", "b999"]] });
    invalid("PAIR_LINK", { links: [["a0", "b0"], ["a0", "b1"]] });

    const sort = q("SORT_BINS");
    invalid("SORT_BINS", { placements: null });
    const uncategorized = clone(sort);
    uncategorized.modelDescriptor.values.categories = [];
    uncategorized.modelDescriptor.values.rule = { attribute: "property", value: "not-a-property" };
    const uncategorizedResult = engine.gradeAnswer(uncategorized, { placements: {} });
    assert.equal(uncategorizedResult.correct, false);

    invalid("SHARE_DEAL", { recipients: [], pool: [], history: [] });
    invalid("SHARE_DEAL", { recipients: {}, pool: [], history: "not-an-array" });
    invalid("SHARE_DEAL", { recipients: {}, pool: [], history: [["bad-row"]] });
    invalid("GROUP_BUILD", { recipients: [], pool: [], history: [] });
    invalid("GROUP_BUILD", { recipients: {}, pool: [], history: [["g999", "item0"]] });
    invalid("BOND_SPLIT", { groups: [], pool: [], history: [] });
    invalid("BOND_SPLIT", { groups: {}, pool: [], history: [["g1", "wrong-token"]] });
    invalid("PATTERN_BUILD", { tokens: null });
    invalid("PATTERN_BUILD", { tokens: ["not-an-allowed-token"] });
    invalid("LANDMARK_PLACE", { relation: "above" });
    invalid("SLOT_COMPOSER", { slots: [null, "", ""] });
    invalid("FACT_FAMILY", { selected: ["duplicate", "duplicate"] });
    invalid("GRAPH_BUILD", { categories: [] });

    const survey = clone(q("GRAPH_BUILD"));
    survey.semanticPromptStringId = "question.surveyResponseList";
    const surveyMissingInterpretation = engine.gradeAnswer(survey, {
      categories: Object.fromEntries(
        Object.keys(engine.createResponseState(survey).categories).map((key) => [key, survey.params[key]]),
      ),
      interpretation: "",
    });
    assert.equal(surveyMissingInterpretation.valid, false);
    const scaled = clone(q("GRAPH_BUILD"));
    scaled.semanticPromptStringId = "question.scaledSurveyPlan";
    const scaledMissingScale = engine.gradeAnswer(scaled, {
      categories: Object.fromEntries(
        Object.keys(engine.createResponseState(scaled).categories).map((key) => [key, scaled.params[key]]),
      ),
      scale: "not-a-number",
    });
    assert.equal(scaledMissingScale.valid, false);

    invalid("FRACTION_PARTITION", { denominator: 0, shadedCount: -1, templateId: "diagonal" });
    invalid("FRACTION_PARTITION", {
      denominator: 2,
      shaded: ["part0", "part0"],
      templateId: "vertical",
    });
    invalid("GRID_ROUTE", { moves: ["X"], end: { x: 0, y: 0 } });
    const invalidRoute = clone(q("GRID_ROUTE"));
    invalidRoute.params.moves = ["X"];
    assert.equal(engine.gridRouteSpecification(invalidRoute), null);
    assert.equal(engine.traceGridRoute(invalidRoute, []), null);
    assert.equal(engine.gradeAnswer(invalidRoute, { moves: [], end: { x: 1, y: 1 } }).valid, false);

    invalid("CLOCK_READ", { hour: 13, minute: 60 });
    invalid("CLOCK_READ", { hour: "", minute: "" });
    invalid("METRIC_SCALE", { value: -1 });
    invalid("METRIC_SCALE", { value: Number.POSITIVE_INFINITY });
    invalid("ANGLE_MEASURE", { degrees: -1 });
    invalid("ANGLE_MEASURE", { degrees: 181 });

    const action = q("ACTION_SCENE");
    for (const semanticPromptStringId of ["question.addition", "question.subtraction"]) {
      const fixture = { ...clone(action), semanticPromptStringId };
      const result = engine.gradeAnswer(fixture, { value: "", actions: ["wrong"] });
      assert.equal(result.valid, false, `ACTION_SCENE/${semanticPromptStringId}`);
    }
    invalid("MEASURE_OBJECT", { value: "", actions: ["wrong"] });
    invalid("AREA_DECOMPOSE", { cutIds: ["wrong"], partAreas: [0], total: "" });
    invalid("VOLUME_INSPECT", { viewedLayers: [1, 1], method: "guess", value: "" });
  });

  await t.test("RESPONSE-GRADING valid alternative actions remain wrong", () => {
    const q = (method) => activeByMethod.get(method);
    const correct = (method) => clone(correctStructuredResponse(engine, q(method)));
    const validWrong = (method, payload) => {
      const result = engine.gradeAnswer(q(method), payload);
      assert.equal(result.valid, true, `${method} alternative remains a well-formed child action`);
      assert.equal(result.correct, false, `${method} alternative cannot become correct`);
    };

    {
      const response = correct("COUNT_TOUCH");
      response.count = Number(response.count) === 10 ? 9 : Number(response.count) + 1;
      validWrong("COUNT_TOUCH", response);
    }
    {
      const response = correct("ORDER_BUILD");
      [response.order[0], response.order[1]] = [response.order[1], response.order[0]];
      validWrong("ORDER_BUILD", response);
    }
    for (const method of ["PLACE_VALUE_BUILD", "EXPRESSION_BUILD", "METRIC_SCALE", "MEASURE_OBJECT"]) {
      const response = correct(method);
      response.value = Number(response.value) + 1;
      validWrong(method, response);
    }
    {
      const response = correct("COIN_BUILD");
      response.coins.push(response.coins[0]);
      validWrong("COIN_BUILD", response);
    }
    {
      const response = correct("PAIR_LINK");
      response.links.pop();
      validWrong("PAIR_LINK", response);
    }
    {
      const response = correct("PATTERN_BUILD");
      const question = q("PATTERN_BUILD");
      const allowed = Array.isArray(question.params.tokenChoices)
        ? question.params.tokenChoices.map(String)
        : ["●", "▲", "■", "◆"];
      response.tokens[0] = allowed.find((token) => token !== response.tokens[0]) || "◆";
      validWrong("PATTERN_BUILD", response);
    }
    {
      const response = correct("LANDMARK_PLACE");
      response.relation = ["in", "on", "under", "beside", "between"]
        .find((relation) => relation !== response.relation);
      validWrong("LANDMARK_PLACE", response);
    }
    {
      const response = correct("SLOT_COMPOSER");
      response.slots[4] = String(Number(response.slots[4]) + 1);
      validWrong("SLOT_COMPOSER", response);
    }
    validWrong("FACT_FAMILY", { selected: ["a", "b", "c", "d"] });
    {
      const response = correct("GRAPH_BUILD");
      const key = Object.keys(response.categories)[0];
      response.categories[key] = Number(response.categories[key]) + 1;
      validWrong("GRAPH_BUILD", response);
    }
    {
      const response = correct("FRACTION_PARTITION");
      if (response.shaded.length < response.denominator) response.shaded.push(`part${response.shaded.length}`);
      else response.shaded.pop();
      validWrong("FRACTION_PARTITION", response);
    }
    {
      const response = correct("GRID_ROUTE");
      response.moves = [];
      validWrong("GRID_ROUTE", response);
    }
    {
      const response = correct("CLOCK_READ");
      response.minute = (Number(response.minute) + 1) % 60;
      validWrong("CLOCK_READ", response);
    }
    {
      const response = correct("ANGLE_MEASURE");
      const wanted = Number(response.degrees);
      response.degrees = wanted <= 177 ? wanted + 3 : wanted - 3;
      validWrong("ANGLE_MEASURE", response);
    }
    {
      const response = correct("AREA_DECOMPOSE");
      response.partAreas[0] += 1;
      response.total += 1;
      validWrong("AREA_DECOMPOSE", response);
    }
    {
      const response = correct("VOLUME_INSPECT");
      response.value = Number(response.value) + 1;
      validWrong("VOLUME_INSPECT", response);
    }
  });
});

test("structured response persistence rejects every method-specific boundary without replacing progress", async (t) => {
  const { engine } = await sharedEngineSuite();
  const { correctStructuredResponse } = await import("./manifest-semantic-suite.mjs");
  const structuredMethods = new Set([
    "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
    "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
    "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
    "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
    "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
  ]);
  const activeByMethod = new Map();
  for (const skill of engine.SKILLS) {
    const planned = engine.CONSTANTS.SESSION_PLANNED_BY_STAGE[skill.stage];
    for (let index = 0; index < planned && activeByMethod.size < structuredMethods.size; index += 1) {
      for (const question of questionsForActiveSlot(engine, skill, index)) {
        if (structuredMethods.has(question.inputMethod) && !activeByMethod.has(question.inputMethod)) {
          activeByMethod.set(question.inputMethod, question);
        }
      }
    }
  }
  assert.deepEqual([...activeByMethod.keys()].sort(), [...structuredMethods].sort());

  const initial = (method) => clone(engine.createResponseState(activeByMethod.get(method)));
  const reject = (method, label, response) => {
    const question = activeByMethod.get(method);
    const control = stateWithUi(engine, baseUi(question, {
      responseState: initial(method),
    }));
    assert.equal(engine.validateState(control), null, `${method}/${label} control`);
    const hostile = stateWithUi(engine, baseUi(question, { responseState: response }));
    assert.equal(engine.validateState(hostile), "Invalid active session.", `${method}/${label}`);
    const live = engine.createInitialState(22_000);
    const imported = engine.importState(live, JSON.stringify(hostile), 22_000);
    if (method === "GRID_ROUTE" && imported.ok) {
      const loaded = engine.loadState(JSON.stringify(hostile), 22_000);
      assert.equal(loaded.ok, true, `${method}/${label} legacy repair loads`);
      assert.equal(loaded.migrated, true, `${method}/${label} legacy repair is explicit`);
      assert.equal(engine.validateState(imported.state), null, `${method}/${label} repaired import`);
      assert.notDeepEqual(
        clone(imported.state.activeSession.uiState.responseState),
        clone(response),
        `${method}/${label} hostile route cannot survive migration`,
      );
    } else {
      assert.equal(imported.ok, false, `${method}/${label} import`);
      assert.equal(imported.state, live, `${method}/${label} transaction`);
    }
  };
  const mutate = (method, label, change) => {
    const response = initial(method);
    change(response, activeByMethod.get(method));
    reject(method, label, response);
  };

  await t.test("RESPONSE-BOUNDARY touch, order, numeric, coin, and symmetry state", () => {
    mutate("COUNT_TOUCH", "duplicate touch", (response) => {
      response.touched = ["i0", "i0"];
    });
    mutate("COUNT_TOUCH", "outside touch", (response, question) => {
      response.touched = [`i${question.answer.value}`];
    });
    mutate("COUNT_TOUCH", "fractional count", (response) => {
      response.count = 1.5;
    });
    mutate("COUNT_TOUCH", "count above child control maximum", (response) => {
      response.count = 11;
    });
    mutate("ORDER_BUILD", "duplicate number", (response, question) => {
      response.order = [question.params.before, question.params.before];
    });
    mutate("ORDER_BUILD", "outside number", (response) => {
      response.order = [999_999];
    });
    mutate("ORDER_BUILD", "too many positions", (response, question) => {
      response.order = [question.params.before, question.answer.value, question.params.after, 0];
    });
    for (const method of ["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"]) {
      mutate(method, "unknown action or rule", (response) => {
        if (Object.hasOwn(response, "action")) response.action = "invented";
        else response.rule = 42;
      });
      mutate(method, "non-numeric entry", (response) => {
        response.value = "not-a-number";
      });
      mutate(method, "non-finite entry", (response) => {
        response.value = Number.POSITIVE_INFINITY;
      });
    }
    mutate("COIN_BUILD", "wrong denomination", (response) => {
      response.coins = [3];
    });
    mutate("COIN_BUILD", "too many coins", (response, question) => {
      response.coins = Array.from({ length: 101 }, () => Number(question.params.secondCoin?.replace(/\D/gu, "")) || 5);
    });
    mutate("COIN_BUILD", "amount exceeded", (response, question) => {
      const value = Number(question.params.secondCoin?.replace(/\D/gu, "")) || 5;
      response.coins = Array.from({ length: Math.floor(Number(question.params.amount) / value) + 1 }, () => value);
    });
    mutate("SYMMETRY_BUILD", "duplicate line", (response) => {
      response.lines = ["line1", "line1"];
    });
    mutate("SYMMETRY_BUILD", "unknown line", (response) => {
      response.lines = ["line999"];
    });
  });

  await t.test("RESPONSE-BOUNDARY links, sorts, token deals, and construction lists", () => {
    mutate("PAIR_LINK", "malformed pair", (response) => {
      response.links = [["a0"]];
    });
    mutate("PAIR_LINK", "outside endpoints", (response) => {
      response.links = [["a999", "b999"]];
    });
    mutate("PAIR_LINK", "reused endpoint", (response) => {
      response.links = [["a0", "b0"], ["a0", "b1"]];
    });
    mutate("PAIR_LINK", "pending outside board", (response) => {
      response.pending = "a999";
    });
    mutate("SORT_BINS", "placements is not an object", (response) => {
      response.placements = [];
    });
    mutate("SORT_BINS", "outside item", (response) => {
      response.placements = { i999: "matches" };
    });
    mutate("SORT_BINS", "outside bin", (response) => {
      response.placements = { i0: "invented" };
    });
    mutate("SORT_BINS", "pending item already placed", (response) => {
      response.placements = { i0: "matches" };
      response.pending = "i0";
    });
    mutate("SORT_BINS", "history is not a list", (response) => {
      response.history = {};
    });

    for (const method of ["SHARE_DEAL", "GROUP_BUILD"]) {
      mutate(method, "container keys changed", (response) => {
        response.recipients = { invented: [] };
      });
      mutate(method, "pool is not a list", (response) => {
        response.pool = {};
      });
      mutate(method, "token identity changed", (response) => {
        response.pool[0] = "forged-token";
      });
      mutate(method, "recipient cursor below range", (response) => {
        response.nextRecipient = 0;
      });
      mutate(method, "history row malformed", (response) => {
        response.history = [["bad"]];
      });
      mutate(method, "history destination unknown", (response) => {
        response.history = [["invented", "item0"]];
      });
    }
    mutate("BOND_SPLIT", "group keys changed", (response) => {
      response.groups = { g1: [] };
    });
    mutate("BOND_SPLIT", "duplicate token", (response) => {
      response.pool[0] = response.pool[1];
    });
    mutate("BOND_SPLIT", "history order forged", (response) => {
      response.history = [["g1", "item1"]];
    });
    mutate("PATTERN_BUILD", "unknown token", (response) => {
      response.tokens = ["invented"];
    });
    mutate("PATTERN_BUILD", "too many tokens", (response, question) => {
      const length = question.semanticPromptStringId === "question.copyPatternAction"
        ? String(question.params.unit || "").trim().split(/\s+/u).filter(Boolean).length
        : 1;
      response.tokens = Array.from({ length: length + 1 }, () => "invented");
    });
    mutate("LANDMARK_PLACE", "unknown relation", (response) => {
      response.relation = "above";
    });
    mutate("SLOT_COMPOSER", "too many slots", (response) => {
      response.slots = Array.from({ length: 6 }, () => "0");
    });
    mutate("SLOT_COMPOSER", "non-list actions", (response) => {
      response.actions = {};
    });
    mutate("FACT_FAMILY", "duplicate fact", (response) => {
      response.selected = ["same", "same"];
    });
    mutate("FACT_FAMILY", "unknown fact", (response) => {
      response.selected = ["invented"];
    });
  });

  await t.test("RESPONSE-BOUNDARY graph, fraction, route, measurement, and model state", () => {
    mutate("GRAPH_BUILD", "category keys changed", (response) => {
      response.categories.invented = 0;
    });
    mutate("GRAPH_BUILD", "negative category", (response) => {
      const key = Object.keys(response.categories)[0];
      response.categories[key] = -1;
    });
    mutate("GRAPH_BUILD", "fractional category", (response) => {
      const key = Object.keys(response.categories)[0];
      response.categories[key] = 1.5;
    });
    mutate("GRAPH_BUILD", "interpretation too long", (response) => {
      response.interpretation = "x".repeat(201);
    });
    mutate("GRAPH_BUILD", "scale is not numeric", (response) => {
      response.scale = "not-a-number";
    });
    mutate("FRACTION_PARTITION", "denominator below range", (response) => {
      response.denominator = 1;
    });
    mutate("FRACTION_PARTITION", "denominator above range", (response) => {
      response.denominator = 21;
    });
    mutate("FRACTION_PARTITION", "denominator choices changed", (response) => {
      response.denominatorChoices.push(19);
    });
    mutate("FRACTION_PARTITION", "template choices changed", (response) => {
      response.templateChoices = ["diagonal"];
    });
    mutate("FRACTION_PARTITION", "template is unknown", (response) => {
      response.templateId = "diagonal";
    });
    mutate("FRACTION_PARTITION", "duplicate shaded part", (response) => {
      response.shaded = ["part0", "part0"];
    });
    mutate("FRACTION_PARTITION", "outside shaded part", (response) => {
      response.shaded = ["part999"];
    });
    mutate("GRID_ROUTE", "unknown move", (response) => {
      response.moves = ["X"];
    });
    mutate("GRID_ROUTE", "end missing coordinate", (response) => {
      response.end = { x: 1 };
    });
    mutate("GRID_ROUTE", "end has extra coordinate", (response) => {
      response.end = { x: 1, y: 1, z: 1 };
    });
    mutate("GRID_ROUTE", "end disagrees with trace", (response) => {
      response.end.x += 1;
    });
    mutate("CLOCK_READ", "hour below range", (response) => {
      response.hour = 0;
    });
    mutate("CLOCK_READ", "hour above range", (response) => {
      response.hour = 13;
    });
    mutate("CLOCK_READ", "minute below range", (response) => {
      response.minute = -1;
    });
    mutate("CLOCK_READ", "minute above range", (response) => {
      response.minute = 60;
    });
    mutate("METRIC_SCALE", "negative value", (response) => {
      response.value = -1;
    });
    mutate("ANGLE_MEASURE", "negative angle", (response) => {
      response.degrees = -1;
    });
    mutate("ANGLE_MEASURE", "angle above straight", (response) => {
      response.degrees = 181;
    });
    mutate("ACTION_SCENE", "wrong action token", (response) => {
      response.actions = ["invented"];
    });
    mutate("ACTION_SCENE", "value is outside the displayed choices", (response, question) => {
      response.value = String(Math.max(...engine.actionSceneSpecification(question).choices) + 100);
    });
    mutate("MEASURE_OBJECT", "wrong action token", (response) => {
      response.actions = ["invented"];
    });
    mutate("MEASURE_OBJECT", "value disagrees with actions", (response) => {
      response.value = "1";
    });
    mutate("AREA_DECOMPOSE", "unknown cut", (response) => {
      response.cutIds = ["invented"];
    });
    mutate("AREA_DECOMPOSE", "too many cuts", (response) => {
      response.cutIds = ["cut1", "cut1"];
    });
    mutate("AREA_DECOMPOSE", "non-numeric part", (response) => {
      response.part0 = "not-a-number";
    });
    mutate("VOLUME_INSPECT", "duplicate layer", (response) => {
      response.viewedLayers = [1, 1];
    });
    mutate("VOLUME_INSPECT", "outside layer", (response, question) => {
      response.viewedLayers = [Number(question.params.height) + 1];
    });
    mutate("VOLUME_INSPECT", "unknown method", (response) => {
      response.method = "estimate";
    });
    mutate("VOLUME_INSPECT", "non-numeric value", (response) => {
      response.value = "not-a-number";
    });
  });

  await t.test("RESPONSE-SERIALIZE preserves finite numbers and nulls unsafe numeric input", () => {
    const numericMethods = [
      ["PLACE_VALUE_BUILD", "value"],
      ["EXPRESSION_BUILD", "value"],
      ["ANGLE_MEASURE", "degrees"],
      ["METRIC_SCALE", "value"],
    ];
    for (const [method, field] of numericMethods) {
      const question = activeByMethod.get(method);
      const response = initial(method);
      for (const [value, expected] of [
        [7, 7],
        [" 7.5 ", 7.5],
        ["", null],
        ["not-a-number", null],
        [Number.POSITIVE_INFINITY, null],
        [{}, null],
      ]) {
        response[field] = value;
        const serialized = engine.serializeResponse(question, response);
        assert.equal(serialized[field], expected, `${method}/${field}/${String(value)}`);
      }
    }
    const clockQuestion = activeByMethod.get("CLOCK_READ");
    assert.deepEqual(
      clone(engine.serializeResponse(clockQuestion, { hour: "3", minute: "not-a-number" })),
      { hour: 3, minute: null },
    );
    const actionQuestion = activeByMethod.get("ACTION_SCENE");
    assert.deepEqual(
      clone(engine.serializeResponse(actionQuestion, { value: null, actions: null })),
      { value: "", actions: [] },
    );
    const areaQuestion = activeByMethod.get("AREA_DECOMPOSE");
    assert.deepEqual(
      clone(engine.serializeResponse(areaQuestion, {
        cutIds: null,
        part0: "2",
        part1: Number.POSITIVE_INFINITY,
        total: {},
      })),
      { cutIds: [], partAreas: [2, null], total: null },
    );
    const volumeQuestion = activeByMethod.get("VOLUME_INSPECT");
    assert.deepEqual(
      clone(engine.serializeResponse(volumeQuestion, {
        viewedLayers: null,
        method: null,
        value: "4",
      })),
      { viewedLayers: [], method: "", value: 4 },
    );
  });

  await t.test("RESPONSE-COMPLETE requires every visible action, not merely a final value", () => {
    const q = (method) => activeByMethod.get(method);
    const correct = (method) => {
      const question = q(method);
      const submitted = clone(correctStructuredResponse(engine, question));
      const state = initial(method);
      if (method === "AREA_DECOMPOSE") {
        state.cutIds = [...submitted.cutIds];
        state.part0 = String(submitted.partAreas[0]);
        state.part1 = String(submitted.partAreas[1]);
        state.total = String(submitted.total);
      } else {
        Object.assign(state, submitted);
      }
      assert.equal(engine.isResponseComplete(question, state), true, `${method} complete control`);
      return state;
    };
    const incomplete = (method, state, label) => {
      assert.equal(engine.isResponseComplete(q(method), state), false, `${method}/${label}`);
    };

    {
      const state = correct("COUNT_TOUCH");
      state.count = "";
      incomplete("COUNT_TOUCH", state, "count still blank after touches");
    }
    incomplete("ORDER_BUILD", { order: [1, 2] }, "third position missing");
    for (const method of ["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"]) {
      const state = correct(method);
      state.value = " ";
      incomplete(method, state, "value blank after action");
    }
    {
      const state = correct("COIN_BUILD");
      state.coins.pop();
      incomplete("COIN_BUILD", state, "coin total below target");
    }
    {
      const state = correct("SYMMETRY_BUILD");
      state.lines.pop();
      incomplete("SYMMETRY_BUILD", state, "line missing");
    }
    {
      const state = correct("PAIR_LINK");
      state.pending = "a0";
      incomplete("PAIR_LINK", state, "unresolved endpoint");
    }
    {
      const state = correct("SORT_BINS");
      state.pending = "i0";
      incomplete("SORT_BINS", state, "unresolved item");
    }
    {
      const state = correct("SHARE_DEAL");
      state.pool.push("invented");
      incomplete("SHARE_DEAL", state, "remainder disagrees");
    }
    for (const method of ["GROUP_BUILD", "BOND_SPLIT"]) {
      const state = correct(method);
      state.pool.push("invented");
      incomplete(method, state, "token remains");
    }
    {
      const state = correct("PATTERN_BUILD");
      state.tokens.pop();
      incomplete("PATTERN_BUILD", state, "pattern token missing");
    }
    incomplete("LANDMARK_PLACE", { relation: "" }, "relation missing");
    incomplete("SLOT_COMPOSER", { slots: ["1", "+", "2", "="] }, "answer slot missing");
    incomplete("FACT_FAMILY", { selected: ["a", "a", "b", "c"] }, "four distinct facts required");
    {
      const question = clone(q("GRAPH_BUILD"));
      const state = correct("GRAPH_BUILD");
      question.semanticPromptStringId = "question.surveyResponseList";
      state.interpretation = "";
      assert.equal(engine.isResponseComplete(question, state), false, "GRAPH_BUILD interpretation required");
      state.interpretation = "child explanation";
      assert.equal(engine.isResponseComplete(question, state), true, "GRAPH_BUILD interpretation supplied");
      question.semanticPromptStringId = "question.scaledSurveyPlan";
      state.scale = "";
      assert.equal(engine.isResponseComplete(question, state), false, "GRAPH_BUILD scale required");
      state.scale = "2";
      assert.equal(engine.isResponseComplete(question, state), true, "GRAPH_BUILD scale supplied");
    }
    {
      const state = correct("FRACTION_PARTITION");
      state.shaded = [];
      incomplete("FRACTION_PARTITION", state, "no region shaded");
      state.shaded = ["part0"];
      state.templateId = "";
      incomplete("FRACTION_PARTITION", state, "partition direction missing");
    }
    {
      const state = correct("GRID_ROUTE");
      state.moves.pop();
      const trace = engine.traceGridRoute(q("GRID_ROUTE"), state.moves);
      state.end = trace ? { ...trace.end } : { x: 1, y: 1 };
      incomplete("GRID_ROUTE", state, "move missing");
      const completed = correct("GRID_ROUTE");
      completed.end.x += 1;
      incomplete("GRID_ROUTE", completed, "end x disagrees");
      completed.end.x -= 1;
      completed.end.y += 1;
      incomplete("GRID_ROUTE", completed, "end y disagrees");
    }
    {
      const state = correct("CLOCK_READ");
      state.minute = "";
      incomplete("CLOCK_READ", state, "minute missing");
    }
    incomplete("METRIC_SCALE", { value: " " }, "reading missing");
    incomplete("ANGLE_MEASURE", { degrees: "not-a-number" }, "finite angle required");
    {
      const state = correct("ACTION_SCENE");
      state.value = "";
      incomplete("ACTION_SCENE", state, "result missing after actions");
      state.value = "0";
      state.actions.pop();
      incomplete("ACTION_SCENE", state, "action missing");
    }
    {
      const state = correct("MEASURE_OBJECT");
      state.value = "";
      incomplete("MEASURE_OBJECT", state, "reading missing after units");
      state.value = "0";
      state.actions.pop();
      incomplete("MEASURE_OBJECT", state, "unit placement missing");
    }
    {
      const state = correct("AREA_DECOMPOSE");
      state.part1 = "";
      incomplete("AREA_DECOMPOSE", state, "second part missing");
      state.part1 = "1";
      state.cutIds = [];
      incomplete("AREA_DECOMPOSE", state, "cut missing");
    }
    {
      const state = correct("VOLUME_INSPECT");
      state.method = "";
      incomplete("VOLUME_INSPECT", state, "method missing");
      state.method = "count";
      state.value = "";
      incomplete("VOLUME_INSPECT", state, "value missing");
      state.value = "1";
      state.viewedLayers.pop();
      incomplete("VOLUME_INSPECT", state, "layer unseen");
    }
  });

  await t.test("RESPONSE-GRADE evaluates each defensive predicate before accepting mathematics", () => {
    const q = (method) => clone(activeByMethod.get(method));
    const correct = (method, question = q(method)) => clone(correctStructuredResponse(engine, question));
    const invalid = (method, question, response, label) => {
      const result = engine.gradeAnswer(question, response);
      assert.equal(result.valid, false, `${method}/${label} valid`);
      assert.equal(result.correct, false, `${method}/${label} correct`);
    };

    {
      const question = q("SYMMETRY_BUILD");
      const response = correct("SYMMETRY_BUILD", question);
      for (const [label, change] of [
        ["missing count fractional", (item) => { item.answer.value = "1.5"; }],
        ["missing count below one", (item) => { item.answer.value = "0"; }],
        ["target below missing", (item) => { item.params.target = 0; }],
        ["required count mismatch", (item) => { item.params.requiredLineIds = []; }],
        ["required lines duplicate", (item) => { item.params.requiredLineIds = ["line1", "line1"]; }],
      ]) {
        const hostile = clone(question);
        change(hostile);
        invalid("SYMMETRY_BUILD", hostile, response, label);
      }
    }
    {
      const question = q("PAIR_LINK");
      const response = correct("PAIR_LINK", question);
      for (const [label, change] of [
        ["left count fractional", (item) => { item.params.leftCount = 1.5; }],
        ["right count fractional", (item) => { item.params.rightCount = 1.5; }],
        ["too many links", (_, answer) => { answer.links.push(["a999", "b999"]); }],
        ["left endpoint malformed", (_, answer) => { answer.links[0][0] = "x0"; }],
        ["right endpoint malformed", (_, answer) => { answer.links[0][1] = "x0"; }],
        ["left endpoint outside", (item, answer) => { answer.links[0][0] = `a${item.params.leftCount}`; }],
        ["right endpoint outside", (item, answer) => { answer.links[0][1] = `b${item.params.rightCount}`; }],
      ]) {
        const hostile = clone(question);
        const answer = clone(response);
        change(hostile, answer);
        invalid("PAIR_LINK", hostile, answer, label);
      }
    }
    for (const method of ["SHARE_DEAL", "GROUP_BUILD", "BOND_SPLIT"]) {
      const question = q(method);
      const response = correct(method, question);
      const cases = method === "SHARE_DEAL"
        ? [
          ["total fractional", (item) => { item.params.total = 1.5; }],
          ["total negative", (item) => { item.params.total = -1; }],
          ["recipient count fractional", (item) => { item.params.recipients = 1.5; }],
          ["recipient count zero", (item) => { item.params.recipients = 0; }],
        ]
        : method === "GROUP_BUILD"
          ? [
            ["group count fractional", (item) => { item.params.groups = 1.5; }],
            ["group count zero", (item) => { item.params.groups = 0; }],
            ["per-group fractional", (item) => { item.params.perGroup = 1.5; }],
            ["per-group zero", (item) => { item.params.perGroup = 0; }],
            ["total fractional", (item) => { item.params.product = 1.5; }],
          ]
          : [
            ["whole fractional", (item) => { item.params.whole = 1.5; }],
            ["whole below two", (item) => { item.params.whole = 1; }],
          ];
      for (const [label, change] of cases) {
        const hostile = clone(question);
        change(hostile);
        invalid(method, hostile, response, label);
      }
    }
    {
      const question = q("SLOT_COMPOSER");
      const response = correct("SLOT_COMPOSER", question);
      const blank = clone(response);
      blank.slots[0] = "";
      invalid("SLOT_COMPOSER", question, blank, "blank slot");
      const direct = engine.gradeAnswer(question, response);
      assert.equal(direct.valid, true);
      assert.equal(direct.correct, true);
      if (!/subtraction|leaving/iu.test(question.semanticPromptStringId)) {
        const commuted = clone(response);
        [commuted.slots[0], commuted.slots[2]] = [commuted.slots[2], commuted.slots[0]];
        assert.equal(engine.gradeAnswer(question, commuted).correct, true, "commuted addition remains correct");
      }
    }
    {
      const question = q("FRACTION_PARTITION");
      const response = correct("FRACTION_PARTITION", question);
      for (const [label, change] of [
        ["duplicate regions", (answer) => { answer.shaded = ["part0", "part0"]; }],
        ["outside region", (answer) => { answer.shaded = ["part999"]; }],
        ["fractional denominator", (answer) => { answer.denominator = 2.5; }],
        ["zero denominator", (answer) => { answer.denominator = 0; }],
        ["fractional shading", (answer) => {
          delete answer.shaded;
          answer.shadedCount = 0.5;
        }],
        ["negative shading", (answer) => {
          delete answer.shaded;
          answer.shadedCount = -1;
        }],
        ["excess shading", (answer) => {
          delete answer.shaded;
          answer.shadedCount = Number(answer.denominator) + 1;
        }],
      ]) {
        const answer = clone(response);
        change(answer);
        invalid("FRACTION_PARTITION", question, answer, label);
      }
    }
    {
      const question = q("GRID_ROUTE");
      const response = correct("GRID_ROUTE", question);
      const missingEnd = { moves: response.moves, value: "" };
      invalid("GRID_ROUTE", question, missingEnd, "end absent");
      const wrongMoves = clone(response);
      wrongMoves.moves = [];
      const result = engine.gradeAnswer(question, wrongMoves);
      assert.equal(result.valid, true, "GRID_ROUTE geometric end is still well formed");
      assert.equal(result.correct, false, "GRID_ROUTE missing moves cannot be correct");
    }
    {
      const question = q("AREA_DECOMPOSE");
      const response = correct("AREA_DECOMPOSE", question);
      for (const [label, change] of [
        ["cut missing", (answer) => { answer.cutIds = []; }],
        ["cut wrong", (answer) => { answer.cutIds = ["wrong"]; }],
        ["part missing", (answer) => { answer.partAreas = [1]; }],
        ["part zero", (answer) => { answer.partAreas[0] = 0; }],
        ["total non-numeric", (answer) => { answer.total = "not-a-number"; }],
      ]) {
        const answer = clone(response);
        change(answer);
        invalid("AREA_DECOMPOSE", question, answer, label);
      }
    }
    {
      const question = q("VOLUME_INSPECT");
      const response = correct("VOLUME_INSPECT", question);
      for (const [label, change] of [
        ["height fractional", (item) => { item.params.height = 1.5; }],
        ["height zero", (item) => { item.params.height = 0; }],
        ["layer missing", (_, answer) => { answer.viewedLayers.pop(); }],
        ["method unknown", (_, answer) => { answer.method = "estimate"; }],
        ["value non-numeric", (_, answer) => { answer.value = "not-a-number"; }],
        ["duplicate layer", (_, answer) => { answer.viewedLayers.push(answer.viewedLayers[0]); }],
      ]) {
        const hostile = clone(question);
        const answer = clone(response);
        change(hostile, answer);
        invalid("VOLUME_INSPECT", hostile, answer, label);
      }
    }
  });
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
  const ordinaryQuestion = findActiveQuestion(
    engine,
    (question) => question.level === 1 && question.inputClass === "SELECTION",
  );
  const ordinary = stateWithUi(engine, baseUi(ordinaryQuestion));
  assert.equal(engine.validateState(ordinary), null, "ordinary binding control");

  const reject = async (label, state) => t.test(label, () => {
    assert.equal(engine.validateState(state), "Invalid active session.");
    assert.throws(() => engine.exportState(state), /Invalid active session/u);
  });

  const previewMismatch = clone(ordinary);
  previewMismatch.previewLevel = ordinary.activeSession.level;
  await reject("ACTIVE-BIND non-preview queue cannot resume as preview", previewMismatch);

  const levelMismatch = clone(ordinary);
  levelMismatch.earnedLevel = ordinary.activeSession.level + 2;
  await reject("ACTIVE-BIND session level cannot trail earned progress by two levels", levelMismatch);

  const endedOrdinary = clone(ordinary);
  endedOrdinary.activeSession.index = endedOrdinary.activeSession.queue.length;
  await reject("ACTIVE-BIND ordinary question cannot remain after queue end", endedOrdinary);

  const unexpectedCandidates = clone(ordinary);
  unexpectedCandidates.activeSession.uiState.choiceCandidates = [clone(ordinaryQuestion)];
  await reject("ACTIVE-BIND activated question cannot retain choice cards", unexpectedCandidates);

  const fatigue = stateWithUi(engine, baseUi(null, { screen: "fatigue" }));
  assert.equal(engine.validateState(fatigue), null, "question-free fatigue control");
  const fatigueWithCandidate = clone(fatigue);
  fatigueWithCandidate.activeSession.uiState.choiceCandidates = [clone(ordinaryQuestion)];
  await reject("ACTIVE-BIND question-free fatigue cannot retain a candidate", fatigueWithCandidate);

  const capstoneQuestion = engine.makeQuestion({
    skillId: ordinaryQuestion.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinaryQuestion.seed,
    ordinal: 1_001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinaryQuestion.theme,
    scaffolded: true,
    capstone: true,
  });
  const capstone = stateWithUi(engine, baseUi(capstoneQuestion, { screen: "capstone" }));
  assert.equal(engine.validateState(capstone), null, "capstone binding control");
  for (const [label, change] of [
    ["reteach flag", (state) => { state.activeSession.uiState.isReteach = true; }],
    ["candidate cards", (state) => {
      state.activeSession.uiState.choiceCandidates = [clone(capstoneQuestion)];
    }],
    ["physical phase", (state) => { state.activeSession.uiState.phase = "physical"; }],
    ["submitted flag before feedback", (state) => {
      state.activeSession.uiState.capstoneSubmitted = true;
    }],
  ]) {
    const hostile = clone(capstone);
    change(hostile);
    await reject(`ACTIVE-BIND capstone rejects ${label}`, hostile);
  }
  const otherSkill = engine.SKILLS.find((skill) => (
    skill.skillId !== ordinaryQuestion.skillId
    && skill.level === ordinaryQuestion.level
  ));
  assert.ok(otherSkill, "same-level capstone mismatch fixture");
  const otherCapstone = engine.makeQuestion({
    skillId: otherSkill.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinaryQuestion.seed,
    ordinal: 1_001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinaryQuestion.theme,
    scaffolded: true,
    capstone: true,
  });
  const wrongCapstone = clone(capstone);
  wrongCapstone.activeSession.uiState.question = clone(otherCapstone);
  await reject("ACTIVE-BIND capstone skill must match the completed queue", wrongCapstone);

  const reteachQuestion = engine.makeQuestion({
    skillId: ordinaryQuestion.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinaryQuestion.seed,
    ordinal: 9_000,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinaryQuestion.theme,
    scaffolded: true,
    reteachStep: true,
  });
  const reteach = stateWithUi(engine, baseUi(reteachQuestion, {
    phase: "reteach",
    isReteach: true,
  }));
  assert.equal(engine.validateState(reteach), null, "reteach binding control");
  const reteachFatigue = clone(reteach);
  reteachFatigue.activeSession.uiState.screen = "fatigue";
  await reject("ACTIVE-BIND reteach must remain on the session screen", reteachFatigue);
  const reteachCandidates = clone(reteach);
  reteachCandidates.activeSession.uiState.choiceCandidates = [clone(reteachQuestion)];
  await reject("ACTIVE-BIND reteach cannot retain choice cards", reteachCandidates);
  const wrongQueueReteach = clone(reteach);
  wrongQueueReteach.reteachQueue[0].skillId = otherSkill.skillId;
  await reject("ACTIVE-BIND reteach question must match the queue head", wrongQueueReteach);
  const laterReteachQuestion = engine.makeQuestion({
    skillId: ordinaryQuestion.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: ordinaryQuestion.seed,
    ordinal: 9_001,
    eligibleQuestionOrdinal: 1,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: ordinaryQuestion.theme,
    scaffolded: true,
    reteachStep: true,
  });
  const wrongReteachOrdinal = clone(reteach);
  wrongReteachOrdinal.activeSession.uiState.question = clone(laterReteachQuestion);
  await reject("ACTIVE-BIND reteach ordinal must match the session index", wrongReteachOrdinal);

  const pickQuestion = findActiveQuestion(engine, (candidate, skill) => {
    const slot = canonicalActiveSlot(engine, skill, candidate.eligibleQuestionOrdinal);
    return slot.choicePosition
      && questionsForActiveSlot(engine, skill, candidate.eligibleQuestionOrdinal).length === 2;
  });
  const pickCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    pickQuestion.eligibleQuestionOrdinal,
  );
  const pick = stateWithUi(engine, baseUi(pickCandidates[0], {
    phase: "pick",
    choiceCandidates: clone(pickCandidates),
  }));
  assert.equal(engine.validateState(pick), null, "two-card pick control");
  const prematureResolution = clone(pick);
  prematureResolution.activeSession.uiState.choiceResolved[
    String(prematureResolution.activeSession.queue[prematureResolution.activeSession.index].ordinal)
  ] = 0;
  await reject("ACTIVE-BIND unresolved pick cannot claim a chosen variant", prematureResolution);
});

test("starting-point placement APIs reject stale, malformed, and non-transactional requests", async (t) => {
  const { engine } = await sharedEngineSuite();
  const baseline = engine.createInitialState(24_000);
  const cloneRun = (run) => clone(run);
  const record = (run, responseKind) => {
    const question = engine.placementCurrentQuestion(run);
    assert.ok(question, "placement fixture expected a current question");
    return {
      ...cloneRun(run),
      answers: [...clone(run.answers), { questionId: question.questionId, responseKind }],
    };
  };
  const complete = (policy, options = {}) => {
    let run = engine.createPlacementRun({
      state: baseline,
      playDay: 24_000,
      seed: options.seed ?? 0x504c4143,
      theme: options.theme ?? "ocean",
    });
    for (let index = 0; index < engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS; index += 1) {
      const question = engine.placementCurrentQuestion(run);
      if (!question) return run;
      run = record(run, policy(question, index));
    }
    assert.equal(engine.placementCurrentQuestion(run), null);
    return run;
  };

  await t.test("PLACEMENT-CREATE validates state, isolation, identity, and nonce boundaries", () => {
    assert.throws(() => engine.createPlacementRun(), /Save is not an object/u);

    const activeQuestion = findActiveQuestion(engine, () => true);
    const active = stateWithUi(engine, baseUi(activeQuestion));
    assert.equal(engine.validateState(active), null);
    assert.throws(
      () => engine.createPlacementRun({ state: active }),
      /finish or cancel the active session or preview/u,
    );
    assert.throws(
      () => engine.beginPlacementRun({ state: active }),
      /finish or cancel the active session or preview/u,
    );

    const preview = clone(baseline);
    preview.previewLevel = 2;
    assert.equal(engine.validateState(preview), null);
    assert.throws(
      () => engine.createPlacementRun({ state: preview }),
      /finish or cancel the active session or preview/u,
    );
    assert.throws(
      () => engine.beginPlacementRun({ state: preview }),
      /finish or cancel the active session or preview/u,
    );

    const defaults = engine.createPlacementRun({ state: baseline });
    assert.equal(defaults.playDay, baseline.maxSeenPlayDay);
    assert.equal(defaults.nonce, baseline.placement.runNonce);
    assert.equal(Number.isInteger(defaults.seed), true);
    assert.equal(defaults.theme, "ocean");

    for (const options of [
      { playDay: 23_999 },
      { playDay: 24_000.5 },
      { nonce: 1 },
      { nonce: 1.5 },
      { seed: -1 },
      { seed: 0x1_0000_0000 },
      { theme: "online-world" },
    ]) {
      assert.throws(
        () => engine.createPlacementRun({ state: baseline, ...options }),
        /invalid day, nonce, seed, or theme/u,
      );
    }

    const exhausted = clone(baseline);
    exhausted.placement.runNonce = 0xffffffff;
    assert.equal(engine.validateState(exhausted), null);
    assert.throws(() => engine.beginPlacementRun({ state: exhausted }), /counter is exhausted/u);

    const prepared = engine.beginPlacementRun({ state: baseline, playDay: 24_001, theme: "space" });
    assert.equal(prepared.state.placement.runNonce, 1);
    assert.equal(prepared.run.nonce, 1);
    assert.equal(prepared.run.playDay, 24_001);
    assert.equal(prepared.run.theme, "space");
    assert.equal(engine.validatePlacementRun(prepared.run, prepared.state).valid, true);
  });

  await t.test("PLACEMENT-VALIDATE classifies malformed identity, answers, sequence, and staleness", () => {
    const run = engine.createPlacementRun({ state: baseline, playDay: 24_000, seed: 7 });
    const invalidCases = [
      [null, /unknown or missing fields/u],
      [{}, /unknown or missing fields/u],
      [{ ...cloneRun(run), surprise: true }, /unknown or missing fields/u],
      [{ ...cloneRun(run), contractVersion: "wrong" }, /different placement/u],
      [{ ...cloneRun(run), curriculumSha256: "0".repeat(64) }, /different placement/u],
      [{ ...cloneRun(run), generatorContractVersion: "wrong" }, /different placement/u],
      [{ ...cloneRun(run), baselineStateFingerprint: "bad" }, /identity is invalid/u],
      [{ ...cloneRun(run), nonce: 1.5 }, /identity is invalid/u],
      [{ ...cloneRun(run), seed: -1 }, /identity is invalid/u],
      [{ ...cloneRun(run), playDay: -1 }, /identity is invalid/u],
      [{ ...cloneRun(run), theme: "network" }, /identity is invalid/u],
      [{ ...cloneRun(run), answers: null }, /answers are invalid/u],
      [{
        ...cloneRun(run),
        answers: Array.from(
          { length: engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS + 1 },
          (_, index) => ({ questionId: `q${index}`, responseKind: "correct" }),
        ),
      }, /answers are invalid/u],
      [{ ...cloneRun(run), answers: [{ questionId: "", responseKind: "correct" }] }, /answers are invalid/u],
      [{
        ...cloneRun(run),
        answers: [{ questionId: "forged", responseKind: "maybe", surprise: true }],
      }, /answers are invalid/u],
    ];
    for (const [hostile, expected] of invalidCases) {
      const validation = engine.validatePlacementRun(hostile);
      assert.equal(validation.valid, false);
      assert.match(validation.error, expected);
      assert.equal(validation.complete, false);
    }

    const invalidState = clone(baseline);
    invalidState.earnedLevel = 999;
    const invalidStateResult = engine.validatePlacementRun(run, invalidState);
    assert.equal(invalidStateResult.valid, false);
    assert.match(invalidStateResult.error, /earned level/u);

    const differentNonce = clone(baseline);
    differentNonce.placement.runNonce = 1;
    const nonceStale = engine.validatePlacementRun(run, differentNonce);
    assert.equal(nonceStale.valid, false);
    assert.match(nonceStale.error, /progress changed/u);

    const changedProgress = clone(baseline);
    changedProgress.settings.soundVolume = 0.25;
    const fingerprintStale = engine.validatePlacementRun(run, changedProgress);
    assert.equal(fingerprintStale.valid, false);
    assert.match(fingerprintStale.error, /progress changed/u);

    const wrongSequence = cloneRun(run);
    wrongSequence.answers = [{ questionId: "forged-question", responseKind: "correct" }];
    const sequenceResult = engine.validatePlacementRun(wrongSequence);
    assert.equal(sequenceResult.valid, false);
    assert.match(sequenceResult.error, /question sequence/u);
    assert.throws(() => engine.placementCurrentQuestion(wrongSequence), /question sequence/u);
  });

  await t.test("PLACEMENT-SUBMIT and APPLY remain transactional at every public failure boundary", () => {
    const run = engine.createPlacementRun({ state: baseline, playDay: 24_000, seed: 11 });
    assert.throws(() => engine.submitPlacementAnswer(run, null), /response is not valid/u);
    assert.throws(() => engine.submitPlacementAnswer(run, { optionId: "not-an-option" }), /response is not valid/u);

    const incomplete = engine.applyPlacementRecommendation(baseline, run);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.state, baseline);
    assert.deepEqual(clone(incomplete.effects), []);
    assert.match(incomplete.error, /not complete/u);

    const staleState = clone(baseline);
    staleState.settings.soundVolume = 0.25;
    const stale = engine.applyPlacementRecommendation(staleState, run);
    assert.equal(stale.ok, false);
    assert.equal(stale.state, staleState);
    assert.deepEqual(clone(stale.effects), []);
    assert.match(stale.error, /progress changed/u);

    const invalidState = clone(baseline);
    invalidState.previewLevel = 999;
    const invalid = engine.applyPlacementRecommendation(invalidState, run);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.state, invalidState);
    assert.deepEqual(clone(invalid.effects), []);

    const lowRun = complete(() => "incorrect", { seed: 12 });
    const recommendation = engine.placementRecommendation(lowRun);
    assert.equal(recommendation.recommendedLevel, 1);
    assert.equal(recommendation.questionCount >= engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS, true);

    const wrongLevel = engine.applyPlacementRecommendation(baseline, lowRun, { startingLevel: 3 });
    assert.equal(wrongLevel.ok, false);
    assert.equal(wrongLevel.state, baseline);
    assert.deepEqual(clone(wrongLevel.effects), []);
    assert.match(wrongLevel.error, /recommendation or one level earlier/u);

    for (const playDay of [-1, 23_999, 24_000.5]) {
      const wrongDay = engine.applyPlacementRecommendation(baseline, lowRun, { playDay });
      assert.equal(wrongDay.ok, false);
      assert.equal(wrongDay.state, baseline);
      assert.deepEqual(clone(wrongDay.effects), []);
      assert.match(wrongDay.error, /confirmation day is invalid/u);
    }

    const exhaustedGeneration = clone(baseline);
    exhaustedGeneration.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
    const exhaustedRun = complete(() => "incorrect", { seed: 13 });
    const reboundRun = {
      ...cloneRun(exhaustedRun),
      baselineStateFingerprint: engine.createPlacementRun({
        state: exhaustedGeneration,
        playDay: 24_000,
        seed: exhaustedRun.seed,
      }).baselineStateFingerprint,
    };
    const exhaustedApply = engine.applyPlacementRecommendation(
      exhaustedGeneration,
      reboundRun,
      { placementDraftGenerationFloor: Number.MAX_SAFE_INTEGER },
    );
    assert.equal(exhaustedApply.ok, false);
    assert.equal(exhaustedApply.state, exhaustedGeneration);
    assert.deepEqual(clone(exhaustedApply.effects), []);
    assert.match(exhaustedApply.error, /draft generation/u);

    const applied = engine.applyPlacementRecommendation(baseline, lowRun);
    assert.equal(applied.ok, true);
    assert.equal(applied.state.earnedLevel, 1);
    assert.ok(applied.effects.some((effect) => effect.type === "PLACEMENT_CONFIRMED"));

    assert.throws(() => engine.submitPlacementNotSure(lowRun), /already complete/u);
    assert.throws(() => engine.submitPlacementAnswer(lowRun, "anything"), /already complete/u);
  });
});
