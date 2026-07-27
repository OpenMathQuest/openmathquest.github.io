import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractEngine, evaluateEngine, scanAmbientReferences } from "../lib/engine-loader.mjs";
import { childStringArtifact, validateChildStringRecords } from "../lib/child-strings.mjs";
import { canonicalizeJson, loadManifest } from "../lib/curriculum-manifest.mjs";
import { AuditHarness, canonicalStringify, cloneJson, functionFrom } from "../lib/test-harness.mjs";

const REQUIRED_APIS = Object.freeze([
  ["createInitialState", "createState"],
  ["loadState"],
  ["exportState"],
  ["importState"],
  ["makeQuestion"],
  ["makeQuestionChoices"],
  ["gradeAnswer"],
  ["submitAnswer"],
  ["buildSessionQueue", "buildQueue"],
  ["applyAttempt"],
  ["completeSession"],
]);

function normalizeSkills(value) {
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  return rows.map((raw) => ({
    raw,
    id: raw.skillId ?? raw.id,
    level: Number(raw.level),
    band: raw.band,
    strand: raw.strand,
    title: raw.title ?? raw.name,
    objective: raw.objective,
    masteryRole: raw.masteryRole ?? raw.classification,
    prerequisites: raw.prerequisites ?? [],
    phases: raw.phases ?? [],
    representation: raw.representation,
    family: raw.family,
    generatorProfile: raw.generatorProfile,
    constraints: raw.constraints ?? {},
  }));
}

function manifestProjection(skill) {
  return {
    id: skill.id,
    level: skill.level,
    band: skill.band,
    strand: skill.strand,
    title: skill.title,
    objective: skill.objective,
    masteryRole: skill.masteryRole,
    prerequisites: skill.prerequisites,
    phases: skill.phases,
    representation: skill.representation,
    family: skill.family,
    generatorProfile: skill.generatorProfile,
    constraints: skill.constraints,
    assessment: skill.raw.assessment,
    rationaleId: skill.raw.rationaleId,
    benchmarkIds: skill.raw.benchmarkIds,
  };
}

function requireSkill(skills, description, predicate) {
  const matches = skills.filter(predicate);
  if (!matches.length) throw new Error(`Manifest has no skill with required capability: ${description}.`);
  return matches[0];
}

function skillByFamily(skills, family, predicate = () => true) {
  return requireSkill(
    skills,
    `family=${family}`,
    (skill) => skill.family === family && typeof skill.generatorProfile === "string" && predicate(skill),
  );
}

function stageFor(engine, skill) {
  return skill.raw.stage ?? engine.stageForLevel(skill.level);
}

function stateValue(result) {
  return result?.state ?? result?.newState ?? result;
}

function optionValue(option) {
  return option && typeof option === "object" && Object.hasOwn(option, "value") ? option.value : option;
}

function createState(engine, playDay = 21_000) {
  return engine.createInitialState(playDay);
}

function buildQueue(engine, state, options) {
  return engine.buildSessionQueue(state, options);
}

function appliedState(engine, state, attempt) {
  return stateValue(engine.applyAttempt(state, attempt));
}

function attemptFor(engine, skill, overrides = {}) {
  const id = skill.id ?? skill.skillId;
  const level = Number(skill.level);
  return {
    recordId: `r-${overrides.playDay ?? 21_000}-${overrides.ordinal ?? 0}`,
    questionId: `q-${id}`,
    skillId: id,
    level,
    stage: skill.stage ?? engine.stageForLevel(level),
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    inputClass: "CONSTRUCTION",
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: false,
    scheduledReview: false,
    sampleKey: `${id}|target|${overrides.ordinal ?? 0}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 2_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: true,
    applied: false,
    preview: false,
    capstone: false,
    sessionId: "session-a",
    playDay: 21_000,
    ...overrides,
  };
}

function questionArgs(skill, tier = "HARD/TARGET", ordinal = 0, extra = {}) {
  const representations = Array.isArray(skill.raw.representations) ? skill.raw.representations : [];
  const preferred = representations[0] ?? (skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT");
  return {
    skillId: skill.id,
    tier,
    representation: preferred,
    seed: 0x51f15e,
    ordinal,
    ...extra,
  };
}

function deepFreezeTest(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreezeTest);
    Object.freeze(value);
  }
  return value;
}

function correctOption(engine, question) {
  if (question.inputClass !== "SELECTION") return null;
  const option = question.options?.[question.correctIndex];
  if (!option) throw new Error(`${question.skillId}: generated selection has no correct option.`);
  return option;
}

function answerFor(engine, question) {
  const option = correctOption(engine, question);
  return option ? { optionId: option.optionId } : question.answer.value;
}

function findQuestionFixture(engine, skills, description, predicate, skillPredicate = () => true) {
  for (const skill of skills.filter(skillPredicate)) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (let ordinal = 0; ordinal < 32; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, tier, ordinal, { representation: "PICTORIAL" }));
        if (predicate(question, skill)) return { skill, question };
      }
    }
  }
  throw new Error(`No generated question satisfies required capability: ${description}.`);
}

function promotionState(engine, skills, level, gatewaySolid = true) {
  const state = createState(engine);
  state.earnedLevel = level;
  const rows = skills.filter((skill) => skill.level === level);
  const gateways = rows.filter((skill) => skill.masteryRole === "GATEWAY");
  if (!rows.length || !gateways.length) throw new Error(`Level ${level} cannot exercise promotion.`);
  const required = Math.ceil(rows.length * engine.CONSTANTS.PROMOTION_SOLID_RATIO);
  const selected = [];
  selected.push(...gateways);
  for (const skill of rows) if (!selected.includes(skill) && selected.length < required) selected.push(skill);
  if (!gatewaySolid) {
    const removed = gateways[0];
    const replacement = rows.find((skill) => skill.masteryRole !== "GATEWAY" && !selected.includes(skill));
    if (!replacement) throw new Error(`Level ${level} has no supporting skill for gateway-block fixture.`);
    selected.splice(selected.indexOf(removed), 1, replacement);
  }
  const solid = new Set(selected.map((skill) => skill.id));
  for (const skill of rows) state.skills[skill.id].acquisition = solid.has(skill.id) ? "SOLID" : "PRACTISING";
  return state;
}

function promotionFixtureLevel(skills) {
  const levels = [...new Set(skills.map((skill) => skill.level))].sort((a, b) => a - b);
  for (const level of levels.slice(0, -1)) {
    const rows = skills.filter((skill) => skill.level === level);
    const gateways = rows.filter((skill) => skill.masteryRole === "GATEWAY");
    const supporting = rows.filter((skill) => skill.masteryRole !== "GATEWAY");
    const needed = Math.ceil(rows.length * 0.8);
    if (gateways.length && supporting.length > needed - gateways.length) return level;
  }
  throw new Error("Manifest has no level that can independently test the gateway promotion boundary.");
}

function selectionFixture(engine, skills, predicate = () => true) {
  return findQuestionFixture(
    engine,
    skills,
    "selection input generated from a declared generator profile",
    (question, skill) => question.inputClass === "SELECTION" && predicate(question, skill),
    (skill) => Boolean(skill.generatorProfile),
  );
}

function constructionFixture(engine, skills, predicate = () => true) {
  return findQuestionFixture(
    engine,
    skills,
    "construction input generated from a declared generator profile",
    (question, skill) => question.inputClass === "CONSTRUCTION" && predicate(question, skill),
    (skill) => Boolean(skill.generatorProfile),
  );
}

export async function runEngineSuite({
  root,
  indexPath = path.join(root, "index.html"),
  engineFilename,
  only = null,
} = {}) {
  const harness = new AuditHarness();
  let extracted;
  let engine;
  try {
    extracted = await extractEngine(indexPath);
    engine = evaluateEngine(extracted.source, { filename: engineFilename });
  } catch (error) {
    await harness.check(
      "CORE-00",
      "The exact shipped engine bytes load",
      "Unique markers and one directly evaluable expression",
      () => { throw error; },
    );
    return { harness, engine: null, extracted: null, summary: harness.summary() };
  }

  let manifestArtifact;
  try {
    manifestArtifact = await loadManifest(path.join(root, "curriculum", "math-quest-manifest-v1.json"));
  } catch (error) {
    await harness.check("CORE-00", "The canonical curriculum manifest loads", "Invalid or absent manifest bytes fail", () => { throw error; });
    return { harness, engine, extracted, summary: harness.summary() };
  }

  const manifest = manifestArtifact.manifest;
  const constants = engine.CONSTANTS ?? {};
  const skills = normalizeSkills(engine.SKILLS);
  const should = (id) => !only || only.has(id);
  const check = async (id, title, effect, fn, options) => {
    if (should(id)) await harness.check(id, title, effect, fn, options);
  };
  const firstSkill = () => requireSkill(skills, "first manifest skill", () => true);

  await check("CORE-01", "Unique markers and exact-byte SHA-256", "Marker duplication or any engine-byte change alters the extracted digest", (assert) => {
    assert.equal(extracted.startCount, 1);
    assert.equal(extracted.endCount, 1);
    assert.match(extracted.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(createHash("sha256").update(extracted.engineBytes).digest("hex"), extracted.sha256);
  });

  await check("CORE-02", "Stable public engine contract", "Removing any required independent API fails", (assert) => {
    assert.ok(engine.CONSTANTS && typeof engine.CONSTANTS === "object");
    assert.ok(Array.isArray(engine.SKILLS));
    assert.ok(engine.CURRICULUM_MANIFEST && typeof engine.CURRICULUM_MANIFEST === "object");
    assert.match(engine.CURRICULUM_MANIFEST_SHA256 ?? "", /^[a-f0-9]{64}$/u);
    for (const names of REQUIRED_APIS) assert.ok(functionFrom(engine, ...names), `Missing ${names.join("/")}`);
  });

  await check("CORE-03", "Ambient-reference source scan", "Any banned direct ambient identifier fails purity", (assert) => {
    assert.deepEqual(scanAmbientReferences(extracted.source), []);
  });

  await check("BEH-01", "The runtime exactly binds the neutral versioned manifest", "Any manifest, ordering, field, id, version, or hash drift fails", (assert) => {
    assert.equal(engine.CURRICULUM_MANIFEST.manifestId, manifest.manifestId);
    assert.equal(engine.CURRICULUM_MANIFEST.version, manifest.version);
    assert.equal(engine.CURRICULUM_MANIFEST_SHA256, manifestArtifact.sha256);
    assert.equal(canonicalizeJson(engine.CURRICULUM_MANIFEST), manifestArtifact.canonical);
    assert.equal(constants.CURRICULUM_MANIFEST_ID ?? manifest.manifestId, manifest.manifestId);
    assert.equal(constants.CURRICULUM_MANIFEST_VERSION ?? manifest.version, manifest.version);
    assert.equal(constants.CURRICULUM_MANIFEST_SHA256 ?? manifestArtifact.sha256, manifestArtifact.sha256);
    assert.equal(skills.length, manifest.skills.length);
    assert.equal(constants.LEVEL_MAX, manifest.levels.length);
    assert.equal(engine.LEVELS?.length ?? manifest.levels.length, manifest.levels.length);
    for (let index = 0; index < manifest.skills.length; index += 1) {
      assert.equal(skills[index].id, manifest.skills[index].id, `skill order ${index}`);
      assert.equal(canonicalizeJson(manifestProjection(skills[index])), canonicalizeJson(manifest.skills[index]), manifest.skills[index].id);
    }
  });

  await check("BEH-02", "Every declared generator profile produces deterministic graded work", "Missing, collapsed, or unanswerable profile routing fails", (assert) => {
    const profiles = new Map();
    for (const skill of skills) {
      assert.ok(skill.generatorProfile, `${skill.id}: generatorProfile`);
      profiles.set(skill.generatorProfile, (profiles.get(skill.generatorProfile) ?? 0) + 1);
      for (const tier of ["EASY", "HARD/TARGET"]) {
        const first = engine.makeQuestion(questionArgs(skill, tier, 0));
        const repeated = engine.makeQuestion(questionArgs(skill, tier, 0));
        assert.equal(first.skillId, skill.id);
        assert.equal(first.level, skill.level);
        assert.equal(first.tier, tier);
        assert.equal(canonicalStringify(first), canonicalStringify(repeated), `${skill.id}/${tier}: deterministic`);
        assert.equal(engine.gradeAnswer(first, first.answer.value).correct, true, `${skill.id}/${tier}: self-grade`);
      }
    }
    assert.deepEqual([...profiles].sort(), [...new Set(manifest.skills.map((skill) => skill.generatorProfile))].sort().map((profile) => [profile, manifest.skills.filter((skill) => skill.generatorProfile === profile).length]));
  });

  await check("BEH-03", "Every skill preserves manifest prerequisites, CPA phases, roles, and constraints", "Changing a prerequisite or teaching contract diverges from the canonical manifest", (assert) => {
    for (let index = 0; index < manifest.skills.length; index += 1) {
      const expected = manifest.skills[index];
      const actual = skills[index];
      assert.equal(canonicalizeJson(actual.prerequisites), canonicalizeJson(expected.prerequisites), `${actual.id}: prerequisites`);
      assert.equal(canonicalizeJson(actual.phases), canonicalizeJson(expected.phases), `${actual.id}: phases`);
      assert.equal(actual.representation, expected.representation, `${actual.id}: representation`);
      assert.equal(actual.masteryRole, expected.masteryRole, `${actual.id}: masteryRole`);
      assert.equal(actual.family, expected.family, `${actual.id}: family`);
      assert.equal(actual.generatorProfile, expected.generatorProfile, `${actual.id}: generatorProfile`);
      assert.equal(canonicalizeJson(actual.constraints), canonicalizeJson(expected.constraints), `${actual.id}: constraints`);
    }
  });

  await check("BEH-04", "Natural and truncated session limits are distinct", "Each stop path returns its configured count and minimum rule", (assert) => {
    const naturalState = createState(engine);
    const natural = buildQueue(engine, naturalState, { playDay: 21_000, seed: 1 });
    const adultState = createState(engine);
    adultState.settings.grownUpPracticeCap = 3;
    const adult = buildQueue(engine, adultState, { playDay: 21_000, seed: 1 });
    const dailyState = createState(engine);
    dailyState.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX - 1;
    const daily = buildQueue(engine, dailyState, { playDay: 21_000, seed: 1 });
    assert.equal(natural.effectivePlannedCount, constants.SESSION_PLANNED_BY_STAGE[natural.stage]);
    assert.equal(adult.effectivePracticeLimit, 3);
    assert.equal(daily.effectivePracticeLimit, 1);
    assert.ok(adult.classifications.includes("ADULT_CAPPED"));
    assert.ok(daily.classifications.includes("DAILY_CAPPED"));
    assert.ok(natural.queue.length <= natural.effectivePracticeLimit);
    const adapterSource = extracted.pageBytes.toString("utf8").slice(extracted.byteEndExclusive);
    assert.match(adapterSource, /effectiveTimeCapMs/u);
  });

  await check("BEH-05", "Capstone always runs and is non-evidence", "Completing any stop path retains a NON_EVIDENCE capstone and cannot clear re-teach", (assert) => {
    const skill = firstSkill();
    const question = engine.makeQuestion(questionArgs(skill, "EASY", 0, { capstone: true }));
    const telemetry = { promptFinishedAt: 0, submittedAt: 2_000, manipulationMs: 0, replayMs: 0, idleMs: 0, playDay: 21_000, sessionId: "capstone" };
    const attempt = engine.submitAnswer(question, answerFor(engine, question), telemetry);
    assert.equal(attempt.evidenceClass, "NON_EVIDENCE");
    for (const reason of ["NATURAL", "TIME_CAP", "ADULT_TIME_CAP", "FATIGUE", "ADULT_CAP", "ADULT_STOP", "DAILY_CAP"]) {
      const classified = engine.classifySessionStop({ reason, activeReteach: true, capstonePending: true });
      assert.equal(classified.finishReteach, true, reason);
      assert.equal(classified.runCapstone, true, reason);
    }
    const pending = createState(engine);
    pending.reteachQueue = [{ skillId: skill.id, reason: "SAME_SESSION" }];
    const afterCapstone = engine.applyAttempt(pending, attempt);
    assert.equal(afterCapstone.state.reteachQueue.length, 1);
    const reteachQuestion = engine.makeQuestion(questionArgs(skill, "EASY", 1, { scaffolded: true, reteachStep: true }));
    const reteachAttempt = engine.submitAnswer(reteachQuestion, answerFor(engine, reteachQuestion), telemetry);
    assert.equal(engine.applyAttempt(pending, reteachAttempt).state.reteachQueue.length, 0);
  });

  await check("BEH-06", "Pick-your-question positions and candidates are meaningful", "Changing the 1/5/9 and 1/3/5 cadence or returning duplicate cards fails", (assert) => {
    const prePlanned = constants.SESSION_PLANNED_BY_STAGE.PRE_K;
    const laterPlanned = constants.SESSION_PLANNED_BY_STAGE.K;
    assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: prePlanned })], Array.from({ length: Math.ceil(prePlanned / 4) }, (_, index) => 1 + index * 4));
    assert.deepEqual([...engine.choicePositions({ stage: "K", effectivePlannedCount: laterPlanned })], Array.from({ length: Math.ceil(laterPlanned / 2) }, (_, index) => 1 + index * 2));
    assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: 0 })], []);
    const contractFields = ["skillId", "tier", "representation", "applied", "inputClass", "inputMethod", "semanticPromptStringId"];
    for (const skill of skills) {
      const args = questionArgs(skill, "EASY", 0, { eligibleQuestionOrdinal: 0, theme: "ocean" });
      const choices = engine.makeQuestionChoices(args);
      assert.ok(Object.isFrozen(choices), `${skill.id}: frozen choices`);
      assert.deepEqual(choices, engine.makeQuestionChoices(args), `${skill.id}: deterministic choices`);
      assert.ok([1, 2].includes(choices.length), `${skill.id}: bounded choice count`);
      for (const choice of choices) assert.equal(engine.gradeAnswer(choice, choice.answer.value).correct, true, `${skill.id}: answerable`);
      if (choices.length === 2) {
        assert.notEqual(choices[0].prompt, choices[1].prompt, `${skill.id}: visible prompt`);
        assert.notEqual(choices[0].sampleKey, choices[1].sampleKey, `${skill.id}: sample`);
        for (const field of contractFields) assert.equal(choices[1][field], choices[0][field], `${skill.id}: ${field}`);
      }
    }
  });

  await check("BEH-07", "Assigned input methods can reach correct answers", "Every selection and construction target must be physically enterable", (assert) => {
    const selection = selectionFixture(engine, skills);
    const construction = constructionFixture(engine, skills);
    const selectionQuestion = selection.question;
    assert.equal(selectionQuestion.options.length, selectionQuestion.optionCount);
    assert.ok(selectionQuestion.optionCount >= 2);
    assert.equal(new Set(selectionQuestion.options.map((option) => canonicalStringify(optionValue(option)))).size, selectionQuestion.options.length);
    assert.equal(selectionQuestion.options.filter((option) => engine.gradeAnswer(selectionQuestion, optionValue(option)).correct).length, 1);
    assert.equal(engine.gradeAnswer(construction.question, construction.question.answer.value).correct, true);
    assert.doesNotThrow(() => engine.gradeAnswer(construction.question, "not-a-valid-answer"));
    assert.equal(engine.gradeAnswer(null, "1").valid, false);
    const rational = { inputClass: "CONSTRUCTION", answer: { kind: "rational", value: "1/2" } };
    assert.equal(engine.gradeAnswer(rational, "2/4").correct, true);
    assert.equal(engine.gradeAnswer(rational, "nope").valid, false);
    assert.equal(engine.parseFraction("1 1/2", { targetForm: "MIXED" }).valid, true);
    assert.equal(engine.parseFraction("3/2", { targetForm: "MIXED" }).valid, false);
    assert.equal(engine.parseFraction("3/2", { targetForm: "IMPROPER" }).valid, true);
    assert.equal(engine.fractionsEquivalent({ left: "1/2", right: "2/4" }).equivalent, true);
    assert.equal(engine.fractionsEquivalent({ left: "1/2", right: "2/5" }).equivalent, false);
    const seen = new Set();
    for (const skill of skills) {
      for (let ordinal = 0; ordinal < 4; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal, { representation: "PICTORIAL" }));
        seen.add(question.inputMethod);
        assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true, `${skill.id}/${ordinal}`);
        assert.equal(question.inputClass, constants.INPUT_CLASS_BY_METHOD[question.inputMethod], `${skill.id}: input contract`);
        if (question.inputClass === "SELECTION") {
          const correct = question.options.filter((option) => engine.gradeAnswer(question, optionValue(option)).correct);
          assert.equal(correct.length, 1, `${skill.id}: unique correct option`);
          assert.equal(question.options[question.correctIndex], correct[0], `${skill.id}: correctIndex`);
        } else {
          assert.equal(question.options.length, 0, `${skill.id}: construction options`);
          assert.equal(question.correctIndex, -1, `${skill.id}: construction index`);
        }
      }
    }
    assert.ok(seen.size >= 2, "manifest exercises more than one input method");
  });

  await check("BEH-08", "Mastery, re-teaching, demotion, pull-back, and promotion use locked rules", "Each independent progression branch remains observable", (assert) => {
    const level = promotionFixtureLevel(skills);
    const eligible = promotionState(engine, skills, level, true);
    assert.equal(engine.evaluatePromotion({ state: eligible, currentLevel: level }).promote, true);
    const blocked = promotionState(engine, skills, level, false);
    assert.equal(engine.evaluatePromotion({ state: blocked, currentLevel: level }).promote, false);
    const demotedSkill = requireSkill(skills, "gateway skill for demotion", (skill) => skill.masteryRole === "GATEWAY");
    const demotionState = createState(engine);
    Object.assign(demotionState.skills[demotedSkill.id], { acquisition: "SOLID", intervalIndex: 3, dueDay: 21_000 });
    const demoted = engine.applyAttempt(demotionState, attemptFor(engine, demotedSkill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, scheduledReview: true }));
    assert.equal(demoted.state.skills[demotedSkill.id].acquisition, "PRACTISING");
    assert.ok(demoted.effects.some((effect) => effect.type === "SKILL_DEMOTED"));
    assert.equal(constants.PROMOTION_SOLID_RATIO, 0.8);
  });

  await check("BEH-09", "Only FIRST_TRY_CLEAN can become credited evidence", "Hint, change, incorrect, and invalid telemetry branches cannot credit mastery", (assert) => {
    const { skill, question } = selectionFixture(engine, skills, (candidate) => candidate.options.length >= 2);
    const correct = correctOption(engine, question);
    const other = question.options.find((option) => option.optionId !== correct.optionId);
    const telemetry = { promptFinishedAt: 1_000, submittedAt: 3_000, manipulationMs: 0, replayMs: 0, idleMs: 0, selectionEvents: [{ optionId: correct.optionId, at: 1_500 }] };
    assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, telemetry).feedbackClass, "FIRST_TRY_CLEAN");
    assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, hintUsed: true }).feedbackClass, "CORRECT_WITH_STRUGGLE");
    assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, selectionEvents: [{ optionId: other.optionId, at: 1_000 }, { optionId: correct.optionId, at: 1_600 }] }).feedbackClass, "CORRECT_WITH_STRUGGLE");
    assert.equal(engine.submitAnswer(question, { optionId: other.optionId }, telemetry).feedbackClass, "INCORRECT");
    const invalid = engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, submittedAt: 1_500, manipulationMs: 700 });
    assert.equal(invalid.validTelemetry, false);
    assert.equal(invalid.evidenceClass, "NON_EVIDENCE");
    const tooFew = { ...question, options: question.options.slice(0, 1), optionCount: 1 };
    assert.equal(engine.submitAnswer(tooFew, { optionId: tooFew.options[0].optionId }, telemetry).evidenceClass, "NON_EVIDENCE");
    assert.equal(engine.deriveSelectionChanged({ selectionEvents: [{ value: "a", at: 0 }, { value: "b", at: 600 }] }).changed, true);
    assert.equal(engine.deriveSelectionChanged({ selectionEvents: [{ value: "a", at: 0 }, { value: "b", at: 599 }] }).changed, false);
    const applied = engine.applyAttempt(createState(engine), attemptFor(engine, skill, { evidenceClass: "NON_EVIDENCE", feedbackClass: "INCORRECT", firstAnswerCorrect: false }));
    assert.equal(applied.state.skills[skill.id].evidence.length, 0);
  });

  await check("BEH-10", "The engine is deterministic and does not mutate inputs", "Same inputs repeat exactly; frozen state survives calls", (assert) => {
    const skill = firstSkill();
    const args = questionArgs(skill, "HARD/TARGET", 7);
    assert.equal(canonicalStringify(engine.makeQuestion(args)), canonicalStringify(engine.makeQuestion(cloneJson(args))));
    const state = createState(engine);
    const before = canonicalStringify(state);
    engine.buildSessionQueue(deepFreezeTest(cloneJson(state)), { playDay: 21_000, seed: 7 });
    assert.equal(canonicalStringify(state), before);
  });

  await check("BEH-11", "The shipped page contains no runtime network call", "Adding a remote resource or network API fails", async (assert) => {
    const html = await readFile(indexPath, "utf8");
    assert.doesNotMatch(html, /<(?:script|img|audio|source|link)[^>]+(?:src|href)\s*=\s*["']https?:/iu);
    assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|\.)/u);
  });

  await check("BEH-12", "Save export and import round-trip canonically", "Serialization, schema, or manifest binding drift fails", (assert) => {
    const state = createState(engine);
    const exported = engine.exportState(state);
    const imported = stateValue(engine.importState(cloneJson(state), exported, 21_000));
    assert.equal(canonicalStringify(imported), canonicalStringify(state));
    assert.equal(state.schemaVersion, constants.STATE_SCHEMA_VERSION);
    assert.equal(state.curriculumManifestId, manifest.manifestId);
    assert.equal(state.curriculumVersion, manifest.version);
    assert.equal(state.curriculumSha256, manifestArtifact.sha256);
    for (const empty of [null, undefined, ""]) assert.equal(engine.loadState(empty, 21_000).ok, true);
    assert.equal(engine.loadState("{", 21_000).ok, false);
    for (const mutation of [
      { schemaVersion: 1 },
      { curriculumManifestId: "different-manifest" },
      { curriculumVersion: "999.0.0" },
      { curriculumSha256: "0".repeat(64) },
      { earnedLevel: 0 },
      { earnedLevel: constants.LEVEL_MAX + 1 },
      { skills: null },
    ]) {
      const bad = { ...cloneJson(state), ...mutation };
      assert.equal(engine.loadState(JSON.stringify(bad), 21_000).ok, false, canonicalStringify(mutation));
    }
  });

  await check("BEH-13", "Port and storage namespace remain isolated", "A legacy or colliding namespace and a non-loopback launcher fail", async (assert) => {
    assert.equal(constants.STORAGE_NAMESPACE, "math-quest:v2");
    const launcher = await readFile(path.join(root, "Math Quest.bat"), "utf8");
    const server = await readFile(path.join(root, "Serve-MathQuest.ps1"), "utf8");
    assert.match(`${launcher}\n${server}`, /8771/u);
    assert.doesNotMatch(`${launcher}\n${server}`, /8770/u);
    assert.match(server, /IPAddress\]::Loopback|127\.0\.0\.1/u);
    assert.match(extracted.pageBytes.toString("utf8"), /math-quest:v2/u);
  });

  await check("BEH-14", "Child prompt bytes and Canadian metric context align", "Unknown prompts, template drift, customary units, or non-Canadian money fail", (assert) => {
    const records = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE).records;
    const byId = new Map(records.map((record) => [record.id, record]));
    const allowed = new Set(["AFFIRMATION", "OBSERVATION", "INSTRUCTION", "MATH_CONTENT", "RITUAL"]);
    for (const record of records) assert.ok(allowed.has(record.category), `${record.id}: category`);
    for (const skill of skills) {
      for (const tier of ["EASY", "HARD/TARGET"]) {
        const question = engine.makeQuestion(questionArgs(skill, tier, 0));
        assert.ok(byId.has(question.promptStringId), `${skill.id}: ${question.promptStringId}`);
        assert.equal(byId.get(question.promptStringId)?.category, "MATH_CONTENT", `${skill.id}: category`);
        assert.equal(engine.renderChildString(question.promptStringId, question.promptSlots), question.prompt, `${skill.id}: prompt bytes`);
        assert.doesNotMatch(question.prompt, /\b(?:inches?|feet|foot|yards?|miles?|ounces?|pounds?|fahrenheit)\b/iu, `${skill.id}: customary unit`);
      }
    }
    for (const record of records.filter((row) => row.id.startsWith("question."))) {
      const placeholders = [...String(record.text).matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => match[1]);
      assert.deepEqual([...new Set(placeholders)].sort(), Object.keys(record.slotDefinitions ?? {}).sort(), `${record.id}: slots`);
    }
    const moneySkills = skills.filter((skill) => skill.family === "money");
    assert.ok(moneySkills.length, "manifest declares a money capability");
    const canadianCoinValues = new Set([5, 10, 25, 100, 200]);
    for (const skill of moneySkills) {
      for (let ordinal = 0; ordinal < 16; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
        assert.doesNotMatch(`${question.prompt} ${question.options.map((option) => optionValue(option)).join(" ")}`, /\b(?:USD|U\.S\. dollars?)\b/iu);
        for (const key of ["coin", "coin1", "coin2", "c1", "c2"]) {
          if (question.params?.[key] !== undefined) {
            const label = String(question.params[key]).trim();
            const raw = label.replace(/[$¢\s]/gu, "");
            const numeric = Number(raw) * (label.startsWith("$") ? 100 : 1);
            if (Number.isFinite(numeric)) assert.ok(canadianCoinValues.has(numeric), `${skill.id}: unsupported coin ${question.params[key]}`);
          }
        }
      }
    }
  });

  await check("BEH-15", "Forbidden reward and trait-praise language is absent", "Inserting a forbidden term in child-facing text fails", (assert) => {
    const text = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE).canonicalJson.toLowerCase();
    assert.doesNotMatch(text, /\b(?:smart|genius|gifted|brilliant child|perfect child|prize|reward|streak bonus|leaderboard)\b/u);
  });

  await check("BEH-16", "Applicable questions emit machine-checkable models", "Dropping a hard-tier descriptor fails across the catalog", (assert) => {
    for (const skill of skills) {
      const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", skill.level, { representation: "PICTORIAL" }));
      assert.ok(question.modelDescriptor && typeof question.modelDescriptor === "object", `${skill.id}: modelDescriptor`);
      assert.ok(question.modelDescriptor.type, `${skill.id}: model type`);
      assert.ok(question.modelDescriptor.instructionStringId, `${skill.id}: instructionStringId`);
      assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true, `${skill.id}: model answer`);
    }
  });

  await check("BEH-17", "Required neutral research and release artifacts exist", "Removing a governed public artifact fails", async (assert) => {
    for (const file of [
      "curriculum/math-quest-manifest-v1.json",
      "curriculum/PROVENANCE.md",
      "research/build-axioms.md",
      "research/pedagogy-notes.md",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      assert.ok((await readFile(path.join(root, file), "utf8")).trim().length > 0, file);
    }
  });

  await check("BEH-18", "Decimal parsing and generated decimal work are exact", "Binary-floating equality or malformed decimal acceptance fails", (assert) => {
    const half = engine.parseRational("0.5");
    const fractionHalf = engine.parseRational("1/2");
    assert.equal(half.n, fractionHalf.n);
    assert.equal(half.d, fractionHalf.d);
    assert.equal(engine.parseFraction("0.5", { targetForm: "DECIMAL" }).valid, true);
    assert.equal(engine.parseFraction("1/2", { targetForm: "DECIMAL" }).valid, false);
    const decimalSkills = skills.filter((skill) => skill.family === "decimal");
    assert.ok(decimalSkills.length, "manifest declares decimal skills");
    for (const skill of decimalSkills) {
      for (let ordinal = 0; ordinal < 24; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
        assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true, `${skill.id}/${ordinal}`);
        if (question.answer.kind === "rational") assert.ok(engine.parseRational(question.answer.value), `${skill.id}: exact rational answer`);
      }
    }
  });

  await check("BEH-19", "Adult caps, soft time, and daily ceiling survive save round-trip", "Each cap independently lowers its effective limit and persists", (assert) => {
    const state = createState(engine);
    state.earnedLevel = constants.LEVEL_MAX;
    state.settings.grownUpPracticeCap = 7;
    state.settings.grownUpSoftTimeCapMs = 600_000;
    state.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX - 2;
    const caps = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
    assert.equal(caps.effectivePracticeLimit, 2);
    assert.equal(caps.effectiveTimeCapMs, 600_000);
    const restored = stateValue(engine.importState(createState(engine), engine.exportState(state), 21_000));
    assert.equal(restored.settings.grownUpPracticeCap, 7);
    assert.equal(restored.settings.grownUpSoftTimeCapMs, 600_000);
  });

  await check("BEH-20", "Witness sets reject duplicate samples and NON_EVIDENCE", "Duplicate and non-evidentiary work cannot strengthen mastery or revoke fast-track", (assert) => {
    const skill = firstSkill();
    let state = createState(engine);
    assert.equal(engine.beginSkill(state, skill.id).skills[skill.id].acquisition, "LEARNING");
    assert.throws(() => engine.beginSkill(state, "missing-skill"), /Unknown skillId/u);
    assert.ok(engine.applyAttempt(state, null).effects.some((effect) => effect.type === "REJECTED_ATTEMPT"));
    const first = attemptFor(engine, skill, { playDay: 21_000, ordinal: 1, sampleKey: "same" });
    state = appliedState(engine, state, first);
    state = appliedState(engine, state, attemptFor(engine, skill, { playDay: 21_001, ordinal: 2, sampleKey: "same" }));
    assert.notEqual(state.skills[skill.id].acquisition, "SOLID");
    const priorFastTrack = state.skills[skill.id].fastTrack;
    state = appliedState(engine, state, attemptFor(engine, skill, { playDay: 21_002, feedbackClass: "INCORRECT", firstAnswerCorrect: false, evidenceClass: "NON_EVIDENCE" }));
    assert.equal(state.skills[skill.id].fastTrack, priorFastTrack);
    const standard = createState(engine);
    standard.skills[skill.id].fastTrack = "STANDARD_ONLY";
    let progressed = standard;
    for (let index = 0; index < 4; index += 1) {
      const evidenceClass = index === 3 ? "GUESS_PRONE_SELECTION" : "CONSTRUCTION";
      progressed = appliedState(engine, progressed, attemptFor(engine, skill, {
        playDay: 22_000 + index,
        ordinal: index,
        evidenceClass,
        inputClass: evidenceClass === "CONSTRUCTION" ? "CONSTRUCTION" : "SELECTION",
        sampleKey: `distinct-${index}`,
      }));
    }
    assert.equal(progressed.skills[skill.id].acquisition, "SOLID");
    const capped = createState(engine);
    capped.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX;
    assert.ok(engine.applyAttempt(capped, attemptFor(engine, skill)).effects.some((effect) => effect.type === "REJECTED_DAILY_CAP"));
  });

  await check("BEH-21", "Prerequisites gate practice while every manifest level remains previewable", "An unsolid prerequisite cannot enter ordinary work", (assert) => {
    assert.equal(constants.LEVEL_MAX, manifest.levels.length);
    const dependent = requireSkill(skills, "skill with prerequisites", (skill) => skill.prerequisites.length > 0);
    const state = createState(engine);
    state.earnedLevel = dependent.level;
    for (const peer of skills.filter((skill) => skill.level === dependent.level && skill.id !== dependent.id)) {
      state.skills[peer.id].acquisition = "PRACTISING";
    }
    let session = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
    assert.ok(!session.queue.some((slot) => slot.skillId === dependent.id && slot.obligation === "NEW"));
    for (const prerequisiteId of dependent.prerequisites) state.skills[prerequisiteId].acquisition = "SOLID";
    session = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
    assert.ok(session.queue.some((slot) => slot.skillId === dependent.id), `${dependent.id}: eligible after prerequisites`);
    const preview = createState(engine);
    preview.previewLevel = constants.LEVEL_MAX;
    const previewQueue = buildQueue(engine, preview, { playDay: 21_000, seed: 1 });
    assert.ok(previewQueue.queue.length);
    assert.ok(previewQueue.queue.every((slot) => slot.preview && slot.obligation === "PREVIEW"));
  });

  await check("BEH-22", "Level re-teaching blocks and clears through recovery evidence", "Active re-teaching cannot promote or clear without new spaced clean evidence", (assert) => {
    const skill = firstSkill();
    const state = createState(engine);
    state.currentLevelColdWindow = Array.from({ length: 11 }, (_, index) => ({
      skillId: skill.id,
      level: skill.level,
      coldTest: true,
      feedbackClass: index < 7 ? "FIRST_TRY_CLEAN" : "INCORRECT",
      evidenceClass: "CONSTRUCTION",
      playDay: 21_000 + index,
    }));
    const started = engine.applyAttempt(state, attemptFor(engine, skill, { playDay: 21_011, coldTest: true, feedbackClass: "INCORRECT", firstAnswerCorrect: false }));
    assert.equal(started.state.levelReteachActive, true);
    assert.ok(started.effects.some((effect) => effect.type === "LEVEL_RETEACH_STARTED"));
    const recovery = createState(engine);
    recovery.levelReteachActive = true;
    recovery.levelReteachTargets = [skill.id];
    recovery.levelReteachTargetSince[skill.id] = 21_999;
    recovery.skills[skill.id].acquisition = "SOLID";
    const cleared = engine.applyAttempt(recovery, attemptFor(engine, skill, { playDay: 22_000, scheduledReview: true }));
    assert.equal(cleared.state.levelReteachActive, false);
    assert.equal(canonicalStringify(cleared.state.levelReteachTargets), "[]");
  });

  await check("BEH-23", "A rapid clean selection resets guessing-like fatigue", "Keeping the streak after a clean attempt fails", (assert) => {
    const skill = firstSkill();
    const state = createState(engine);
    state.guessingLikeStreak = 1;
    const result = engine.applyAttempt(state, attemptFor(engine, skill, { inputClass: "SELECTION", evidenceClass: "GUESS_PRONE_SELECTION", elapsed: 1_000 }));
    assert.equal(result.state.guessingLikeStreak, 0);
    assert.ok(!result.effects.some((effect) => effect.type === "FATIGUE_OFFER"));
    const idle = engine.applyAttempt(createState(engine), attemptFor(engine, skill, { idleMs: constants.IDLE_MS_BY_STAGE.PRE_K }));
    assert.ok(idle.effects.some((effect) => effect.type === "FATIGUE_OFFER" && effect.signals.idle));
  });

  await check("BEH-24", "Feedback capacity and repetition window are enforced", "A normalized duplicate or exhausted pool fails capacity validation", (assert) => {
    const skill = firstSkill();
    const cleanAttempt = attemptFor(engine, skill, { stage: "PRE_K", feedbackClass: "FIRST_TRY_CLEAN" });
    const minimum = constants.FEEDBACK_POOL_MIN_BY_STAGE.PRE_K;
    const rendered = Array.from({ length: minimum }, (_, ordinal) => engine.feedbackLine(cleanAttempt, ordinal).normalize("NFC"));
    assert.equal(new Set(rendered).size, rendered.length);
    const first = engine.feedbackLine(cleanAttempt, 0);
    assert.notEqual(engine.feedbackLine(cleanAttempt, 0, [first]), first);
    const capacity = Math.max(...Object.values(constants.FEEDBACK_POOL_MIN_BY_STAGE));
    const all = Array.from({ length: capacity }, (_, ordinal) => engine.feedbackLine(cleanAttempt, ordinal));
    assert.equal(new Set(all.map((line) => line.normalize("NFC"))).size, capacity);
    assert.throws(() => engine.feedbackLine(cleanAttempt, 0, all), /exhausted/iu);
  });

  await check("BEH-25", "Child-string digest reproduces from shipped records", "Any approved child-string byte change changes SHA-256", (assert) => {
    const artifact = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE);
    assert.deepEqual(validateChildStringRecords(artifact.records), []);
    const approved = constants.CHILD_STRING_APPROVAL_SHA256 ?? constants.CHILD_STRING_DIGEST;
    if (constants.CHILD_STRING_CANONICALIZATION_VERSION !== "child-strings-v1" || !approved) {
      harness.skip(`Strings pending approval; computed candidate digest ${artifact.sha256}.`);
    }
    assert.equal(constants.CHILD_STRINGS_PENDING_APPROVAL, false);
    assert.equal(artifact.sha256, approved);
  }, { required: false });

  await check("BEH-26", "Preview attempts remain non-evidentiary", "Applying preview work cannot change earned progress", (assert) => {
    const skill = firstSkill();
    const before = createState(engine);
    const after = appliedState(engine, before, attemptFor(engine, skill, { preview: true, evidenceClass: "NON_EVIDENCE" }));
    assert.equal(after.earnedLevel, before.earnedLevel);
    assert.equal(canonicalStringify(after.skills), canonicalStringify(before.skills));
  });

  await check("BEH-27", "Save import is transactional and manifest-validated", "Malformed, old-schema, or wrong-manifest imports leave live state byte-equivalent", (assert) => {
    const live = createState(engine);
    const before = canonicalStringify(live);
    for (const value of [
      { schemaVersion: 1 },
      { schemaVersion: 999 },
      { ...cloneJson(live), curriculumSha256: "f".repeat(64) },
      "not-json",
    ]) {
      let rejected = false;
      try {
        const payload = typeof value === "string" ? value : JSON.stringify(value);
        const result = engine.importState(live, payload, 21_000);
        rejected = Boolean(result?.ok === false || result?.error);
      } catch {
        rejected = true;
      }
      assert.ok(rejected, canonicalStringify(value));
      assert.equal(canonicalStringify(live), before);
    }
  });

  await check("BEH-28", "Play-day rules handle midnight, reopen, and rollback", "Candidate days can advance but never lower maxSeenPlayDay", (assert) => {
    const state = createState(engine, 20_000);
    state.activeSession = { sessionId: "same-day", playDay: 20_000, queue: [] };
    const json = engine.exportState(state);
    assert.equal(engine.loadState(json, 20_001).state.maxSeenPlayDay, 20_001);
    assert.equal(engine.loadState(json, 19_999).state.maxSeenPlayDay, 20_000);
    assert.equal(engine.loadState(json, 20_000).state.activeSession.sessionId, "same-day");
    const manyLogs = createState(engine);
    manyLogs.sessionLog = Array.from({ length: 200 }, (_, index) => ({ sessionId: `old-${index}` }));
    manyLogs.previewLevel = Math.min(3, constants.LEVEL_MAX);
    manyLogs.activeSession = { sessionId: "active" };
    const completed = engine.completeSession(manyLogs, { sessionId: "new" });
    assert.equal(completed.sessionLog.length, 200);
    assert.equal(completed.sessionLog[0].sessionId, "old-1");
    assert.equal(completed.activeSession, null);
    assert.equal(completed.previewLevel, null);
  });

  await check("BND-01", "7/12 activates level re-teaching; 8/12 does not", "Changing the inclusive seven-clean boundary fails", (assert) => {
    const skill = firstSkill();
    const cold = (clean) => Array.from({ length: 12 }, (_, index) => ({
      ...attemptFor(engine, skill, {
        ordinal: index,
        playDay: 21_000 + index,
        coldTest: true,
        feedbackClass: index < clean ? "FIRST_TRY_CLEAN" : "INCORRECT",
        firstAnswerCorrect: index < clean,
      }),
    }));
    assert.equal(engine.evaluateLevelReteaching({ coldTests: cold(7), currentLevel: skill.level }).active, true);
    assert.equal(engine.evaluateLevelReteaching({ coldTests: cold(8), currentLevel: skill.level }).active, false);
    assert.equal(constants.LEVEL_RETEACH_WINDOW, 12);
    assert.equal(constants.LEVEL_RETEACH_MAX_CLEAN, 7);
  });

  await check("BND-02", "Promotion checks exact 0.80 and every gateway", "A non-solid gateway defeats an otherwise sufficient solid ratio", (assert) => {
    const level = promotionFixtureLevel(skills);
    const eligible = promotionState(engine, skills, level, true);
    const blocked = promotionState(engine, skills, level, false);
    assert.equal(constants.PROMOTION_SOLID_RATIO, 0.8);
    assert.equal(engine.evaluatePromotion({ state: eligible, currentLevel: level }).promote, true);
    assert.equal(engine.evaluatePromotion({ state: blocked, currentLevel: level }).promote, false);
  });

  await check("BND-03", "Selection debounce is inclusive at 600 ms", "599 ms is unchanged; 600 ms is deliberate change", (assert) => {
    const { question } = selectionFixture(engine, skills, (candidate) => candidate.options.length >= 2);
    const correct = correctOption(engine, question);
    const other = question.options.find((option) => option.optionId !== correct.optionId);
    const submit = (delta) => engine.submitAnswer(question, { optionId: correct.optionId }, {
      promptFinishedAt: 0,
      submittedAt: 2_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [{ optionId: other.optionId, at: 1_000 }, { optionId: correct.optionId, at: 1_000 + delta }],
    });
    assert.equal(submit(599).changed, false);
    assert.equal(submit(600).changed, true);
    assert.equal(constants.SELECTION_DEBOUNCE_MS, 600);
  });

  await check("BND-04", "Every spacing transition, reset, final repeat, and overdue case is exact", "Any interval index or date transition mismatch fails", (assert) => {
    const intervals = [1, 1, 2, 4, 7, 12];
    assert.deepEqual([...constants.SPACING_INTERVAL_DAYS], intervals);
    const skill = firstSkill();
    for (let index = 0; index < intervals.length; index += 1) {
      const state = createState(engine);
      Object.assign(state.skills[skill.id], { acquisition: "PRACTISING", intervalIndex: index, dueDay: 20_000 });
      const record = engine.applyAttempt(state, attemptFor(engine, skill, { ordinal: index, scheduledReview: true, playDay: 20_005 })).state.skills[skill.id];
      const expectedIndex = Math.min(index + 1, intervals.length - 1);
      assert.equal(record.intervalIndex, expectedIndex);
      assert.equal(record.dueDay, 20_005 + intervals[expectedIndex]);
    }
    const resetState = createState(engine);
    Object.assign(resetState.skills[skill.id], { acquisition: "PRACTISING", intervalIndex: 4, dueDay: 20_000 });
    const reset = engine.applyAttempt(resetState, attemptFor(engine, skill, { scheduledReview: true, playDay: 20_005, feedbackClass: "INCORRECT", firstAnswerCorrect: false })).state.skills[skill.id];
    assert.equal(reset.intervalIndex, 0);
    assert.equal(reset.dueDay, 20_006);
  });

  await check("BND-05", "Fast-track eligibility changes only on structurally eligible non-clean attempts", "NON_EVIDENCE leaves eligibility; non-clean evidence removes it", (assert) => {
    const skill = firstSkill();
    const state = createState(engine);
    const untouched = engine.applyAttempt(state, attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, evidenceClass: "NON_EVIDENCE" })).state;
    assert.equal(untouched.skills[skill.id].fastTrack, "FAST_TRACK_ELIGIBLE");
    const changed = engine.applyAttempt(state, attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false })).state;
    assert.equal(changed.skills[skill.id].fastTrack, "STANDARD_ONLY");
    assert.equal(engine.updateFastTrackEligibility({ current: "FAST_TRACK_ELIGIBLE", attempt: null }), "FAST_TRACK_ELIGIBLE");
  });

  await check("BND-06", "All session stop paths retain active re-teach and capstone", "Natural, time, adult, fatigue, and daily classifiers remain independent", (assert) => {
    const mappings = [
      ["NATURAL", "NATURAL"],
      ["TIME_CAP", "TIME_CAPPED"],
      ["ADULT_TIME_CAP", "ADULT_TIME_CAPPED"],
      ["FATIGUE", "FATIGUE_STOPPED"],
      ["ADULT_CAP", "ADULT_CAPPED"],
      ["ADULT_STOP", "ADULT_STOPPED"],
      ["DAILY_CAP", "DAILY_CAPPED"],
    ];
    for (const [input, expected] of mappings) {
      const classified = engine.classifySessionStop({ reason: input, activeReteach: true, capstonePending: true });
      assert.equal(classified.stateClassification, expected);
      assert.equal(classified.finishReteach, true);
      assert.equal(classified.runCapstone, true);
    }
    assert.equal(constants.TIME_CAP_MS_BY_STAGE.GRADES_3_5, 840_000);
  });

  await check("BND-07", "Fraction notation and canonical forms are exact", "Denominator, zero, decimal, mixed, and simplest-form boundaries each affect grading", (assert) => {
    const half = engine.parseRational("1/2");
    const twoFourths = engine.parseRational("2/4");
    assert.equal(`${half.n}/${half.d}`, `${twoFourths.n}/${twoFourths.d}`);
    const simplest = { inputClass: "CONSTRUCTION", answer: { kind: "rational", value: "1/2", targetForm: "SIMPLEST" } };
    assert.equal(engine.gradeAnswer(simplest, "2/4").correct, false);
    assert.equal(engine.gradeAnswer(simplest, "1/2").correct, true);
    assert.equal(engine.parseFraction("1 1/2", { targetForm: "SIMPLEST" }).valid, true);
    assert.equal(engine.parseFraction("1 2/4", { targetForm: "SIMPLEST" }).valid, false);
    const zero = engine.parseRational("0/5");
    assert.equal(zero.n.toString(), "0");
    assert.equal(zero.d.toString(), "1");
    for (const value of ["1/-2", "-1/-2", "1 1/-2"]) assert.equal(engine.parseFraction(value).valid, false, value);
    for (const value of ["0/5", "-0", "0.0"]) assert.equal(engine.parseFraction(value, { targetForm: "CANONICAL" }).valid, false, value);
    assert.equal(engine.parseFraction("0", { targetForm: "CANONICAL" }).valid, true);
    assert.equal(engine.parseFraction("0.5", { targetForm: "DECIMAL" }).valid, true);
    assert.equal(engine.parseFraction("1/2", { targetForm: "DECIMAL" }).valid, false);
    const fractionSkills = skills.filter((skill) => skill.family === "fraction");
    assert.ok(fractionSkills.length, "manifest declares fraction skills");
    for (const skill of fractionSkills) {
      for (let ordinal = 0; ordinal < 12; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
        assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true, `${skill.id}/${ordinal}`);
        if (question.answer.targetForm === "SIMPLEST") assert.equal(engine.parseFraction(question.answer.value, { targetForm: "SIMPLEST" }).valid, true, `${skill.id}/${ordinal}`);
      }
    }
  });

  await check("BND-08", "Repeated misses trigger on same-session and chronic boundaries", "Pre-K one miss, later two misses, and 3-of-6 across two sessions are inclusive", (assert) => {
    const preSkill = requireSkill(skills, "early-stage skill", (skill) => stageFor(engine, skill) === "PRE_K");
    const laterSkill = requireSkill(skills, "non-PRE_K skill", (skill) => stageFor(engine, skill) !== "PRE_K");
    const miss = (skill, sessionId, ordinal) => attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, sessionId, ordinal });
    assert.ok(engine.applyAttempt(createState(engine), miss(preSkill, "a", 0)).effects.some((effect) => effect.type === "RETEACH_REQUIRED"));
    let later = createState(engine);
    later.earnedLevel = laterSkill.level;
    later = engine.applyAttempt(later, miss(laterSkill, "a", 0)).state;
    assert.ok(engine.applyAttempt(later, miss(laterSkill, "a", 1)).effects.some((effect) => effect.type === "RETEACH_REQUIRED"));
    let chronic = createState(engine);
    chronic.earnedLevel = laterSkill.level;
    chronic = engine.applyAttempt(chronic, miss(laterSkill, "a", 0)).state;
    chronic = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "a", ordinal: 1 })).state;
    chronic = engine.applyAttempt(chronic, miss(laterSkill, "b", 2)).state;
    chronic = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "b", ordinal: 3 })).state;
    chronic = engine.applyAttempt(chronic, miss(laterSkill, "c", 4)).state;
    const result = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "c", ordinal: 5 }));
    assert.ok(result.state.reteachQueue.some((item) => item.skillId === laterSkill.id && item.reason === "CHRONIC"));
  });

  await check("BND-09", "Rapid-selection fatigue uses inclusive stage thresholds", "An incorrect selection at the threshold signals; threshold plus one does not", (assert) => {
    assert.equal(engine.computeFatigue().offerStop, false);
    const stage = "PRE_K";
    const threshold = constants.RAPID_SELECTION_MS_BY_STAGE[stage];
    const streakLimit = constants.GUESSING_LIKE_STREAK_BY_STAGE[stage];
    const at = engine.computeFatigue({
      stage,
      attempts: [{ inputClass: "SELECTION", feedbackClass: "INCORRECT", elapsed: threshold }],
      priorGuessingLikeStreak: streakLimit - 1,
    });
    const over = engine.computeFatigue({
      stage,
      attempts: [{ inputClass: "SELECTION", feedbackClass: "INCORRECT", elapsed: threshold + 1 }],
      priorGuessingLikeStreak: streakLimit - 1,
    });
    assert.equal(at.signals.guessing, true);
    assert.equal(over.signals.guessing, false);
    const rising = engine.computeFatigue({
      stage,
      attempts: [0, 0, 0, 30_000, 10_000].map((elapsed) => ({ inputClass: "CONSTRUCTION", feedbackClass: "FIRST_TRY_CLEAN", elapsed })),
    });
    assert.equal(rising.signals.rising, true);
  });

  return {
    harness,
    engine,
    extracted,
    skills,
    manifest,
    manifestArtifact,
    summary: harness.summary(),
  };
}
