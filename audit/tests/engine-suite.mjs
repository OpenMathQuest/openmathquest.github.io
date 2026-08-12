import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractEngine, evaluateEngine, scanAmbientReferences } from "../lib/engine-loader.mjs";
import { childStringArtifact, validateChildStringRecords } from "../lib/child-strings.mjs";
import { canonicalizeJson, loadManifest } from "../lib/curriculum-manifest.mjs";
import { AuditHarness, canonicalStringify, cloneJson, functionFrom } from "../lib/test-harness.mjs";
import {
  EXPECTED_STRATEGY_SEMANTIC_VARIANTS,
  STRATEGY_BUILD_SKILL_IDS,
  correctStrategyBuildResponse,
  strategySemanticVariantKey,
} from "./strategy-build-oracle.mjs";

const REQUIRED_APIS = Object.freeze([
  ["createInitialState", "createState"],
  ["loadState"],
  ["exportState"],
  ["importState"],
  ["createResetState"],
  ["makeQuestion"],
  ["makeQuestionChoices"],
  ["gradeAnswer"],
  ["submitAnswer"],
  ["createPlacementRun"],
  ["validatePlacementRun"],
  ["placementCurrentQuestion"],
  ["submitPlacementAnswer"],
  ["submitPlacementNotSure"],
  ["placementRecommendation"],
  ["applyPlacementRecommendation"],
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
  const { ordinal = 0, ...attemptOverrides } = overrides;
  return {
    recordId: `r-${attemptOverrides.playDay ?? 21_000}-${ordinal}`,
    questionId: `q-${id}`,
    skillId: id,
    level,
    stage: skill.stage ?? engine.stageForLevel(level),
    taskType: skill.constraints?.taskTypes?.[0] ?? skill.generatorProfile,
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    inputClass: "CONSTRUCTION",
    selectionOptionCount: 0,
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: false,
    scheduledReview: false,
    sampleKey: `${id}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|target|${ordinal}`,
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
    ...attemptOverrides,
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

const STRUCTURED_RESPONSE_METHODS = new Set([
  "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
  "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
  "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
  "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
  "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
]);

const ATTRIBUTE_PROPERTY_TARGET = Object.freeze({
  "3 sides": "triangle",
  "4 equal sides": "square",
  "6 flat faces": "cube",
  "one curved surface and no flat faces": "sphere",
  "a right angle": "rectangle",
  "2 pairs of parallel sides and a right angle": "rectangle",
  "perpendicular sides and 2 long sides": "rectangle",
});

function normalizedAttributeToken(value) {
  return String(value ?? "").normalize("NFC").trim().toLowerCase();
}

function attributeItemMatchesRule(item, rule) {
  const attribute = normalizedAttributeToken(rule?.attribute);
  const value = normalizedAttributeToken(rule?.value);
  if (attribute === "shape") return normalizedAttributeToken(item?.shape) === value;
  if (attribute === "solid") return normalizedAttributeToken(item?.solid) === value;
  if (attribute === "property") {
    const target = ATTRIBUTE_PROPERTY_TARGET[value];
    return Boolean(target)
      && [item?.shape, item?.solid].some((candidate) => normalizedAttributeToken(candidate) === target);
  }
  return false;
}

function sortCategoryId(item, rule, categories) {
  const attribute = String(rule?.attribute ?? "").trim();
  const itemValue = normalizedAttributeToken(item?.[attribute]);
  const category = categories.find((candidate) => {
    const values = [candidate?.value, candidate?.id].map(normalizedAttributeToken);
    return itemValue.length > 0 && values.includes(itemValue);
  });
  return category?.id === undefined ? null : String(category.id);
}

function sortPlacementsFromDescriptor(question) {
  const values = question.modelDescriptor?.values ?? {};
  const items = Array.isArray(values.items) ? values.items : [];
  const categories = Array.isArray(values.categories) ? values.categories : [];
  if (categories.length) {
    return Object.fromEntries(items.map((item, index) => [
      `i${index}`,
      sortCategoryId(item, values.rule, categories) ?? "",
    ]));
  }
  return Object.fromEntries(items.map((item, index) => [
    `i${index}`,
    attributeItemMatchesRule(item, values.rule) ? "matches" : "other",
  ]));
}

function incorrectSortSubmission(question, payload) {
  const categories = Array.isArray(question.modelDescriptor?.values?.categories)
    ? question.modelDescriptor.values.categories
    : [];
  const categoryIds = categories.map((category) => String(category.id));
  const placements = Object.fromEntries(Object.entries(payload.placements).map(([itemId, bin]) => {
    if (categoryIds.length >= 2) {
      const current = categoryIds.indexOf(String(bin));
      return [itemId, categoryIds[(current + 1 + categoryIds.length) % categoryIds.length]];
    }
    return [itemId, bin === "matches" ? "other" : "matches"];
  }));
  return { ...payload, placements };
}

function indexedItems(prefix, count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => `${prefix}${index}`);
}

function coinValueCents(label) {
  const text = String(label ?? "").trim();
  const value = Number(text.replace(/[^\d]/gu, ""));
  return text.startsWith("$") ? value * 100 : value;
}

function structuredAnswerFor(engine, question) {
  const state = engine.createResponseState(question);
  const p = question.params || {};
  switch (question.inputMethod) {
    case "COUNT_TOUCH":
      state.touched = indexedItems("i", Number(question.answer.value));
      state.count = String(question.answer.value);
      break;
    case "ORDER_BUILD":
      state.order = [Number(p.before), Number(question.answer.value), Number(p.after)];
      break;
    case "STRATEGY_BUILD":
      return correctStrategyBuildResponse(question, question.skillId === "MQ-095" ? "mental" : null);
    case "PLACE_VALUE_BUILD":
      state.action = Array.isArray(p.strategyChoices)
        ? String(p.strategyAny ? p.strategyChoices[0] : p.strategy)
        : question.semanticPromptStringId === "question.renamePlace" ? "trade"
          : question.semanticPromptStringId === "question.scalePlace" ? "shift"
            : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId) ? "partition"
              : "build";
      state.value = question.answer.kind === "text" ? String(question.answer.value) : Number(question.answer.value);
      break;
    case "COIN_BUILD":
      state.coins = Array.from({ length: Number(question.answer.value) }, () => coinValueCents(p.secondCoin));
      break;
    case "SYMMETRY_BUILD":
      state.lines = Array.isArray(p.requiredLineIds)
        ? [...p.requiredLineIds]
        : Array.from({ length: Number(question.answer.value) }, (_, index) => `line${index + 1}`);
      break;
    case "EXPRESSION_BUILD":
      state.rule = String(p.rule);
      state.value = Number(question.answer.value);
      break;
    case "PAIR_LINK":
      state.links = Array.from(
        { length: Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count)) },
        (_, index) => [`a${index}`, `b${index}`],
      );
      if (Object.hasOwn(state, "relation")) state.relation = String(question.answer.value);
      break;
    case "SORT_BINS": {
      state.placements = sortPlacementsFromDescriptor(question);
      break;
    }
    case "SHARE_DEAL": {
      const recipientCount = Number(p.recipients);
      const total = Number(p.total);
      const remainder = total % recipientCount;
      let next = 1;
      while (state.pool.length > remainder) {
        const recipient = `r${next}`;
        const item = state.pool.shift();
        state.recipients[recipient].push(item);
        state.history = (state.history || []).concat([[recipient, item]]);
        next = next % recipientCount + 1;
      }
      break;
    }
    case "GROUP_BUILD": {
      const groups = Number(p.groups ?? p.a);
      let next = 1;
      while (state.pool.length) {
        const recipient = `g${next}`;
        const item = state.pool.shift();
        state.recipients[recipient].push(item);
        state.history = (state.history || []).concat([[recipient, item]]);
        next = next % groups + 1;
      }
      break;
    }
    case "BOND_SPLIT": {
      const counts = question.semanticPromptStringId === "question.secondPartition"
        ? [Number(p.secondA), Number(question.answer.value)]
        : [Number(p.part), Number(question.answer.value)];
      while (state.groups.g1.length < counts[0]) {
        const item = state.pool.shift();
        state.groups.g1.push(item);
        state.history.push(["g1", item]);
      }
      while (state.groups.g2.length < counts[1]) {
        const item = state.pool.shift();
        state.groups.g2.push(item);
        state.history.push(["g2", item]);
      }
      break;
    }
    case "PATTERN_BUILD":
      state.tokens = String(question.answer.value).trim().split(/\s+/u).filter(Boolean);
      break;
    case "LANDMARK_PLACE":
      state.relation = String(question.answer.value);
      break;
    case "SLOT_COMPOSER": {
      const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
      state.slots = [String(p.a), operation, String(p.b), "=", String(question.answer.value)];
      break;
    }
    case "FACT_FAMILY": {
      const a = Number(p.a), b = Number(p.b), whole = Number(p.whole);
      state.selected = p.equationFamily === "multiply-divide"
        ? [`${a}×${b}=${whole}`, `${b}×${a}=${whole}`, `${whole}÷${a}=${b}`, `${whole}÷${b}=${a}`]
        : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
      break;
    }
    case "GRAPH_BUILD": {
      const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
      state.categories = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(p[key]))).map((key) => [key, Number(p[key])]));
      if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = String(question.answer.value);
      if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = Number(question.answer.value);
      break;
    }
    case "FRACTION_PARTITION": {
      const fraction = engine.parseRational(question.answer.value);
      if (!fraction) throw new Error(`${question.skillId}: invalid fraction fixture`);
      state.templateId = "vertical";
      const denominator = Number(state.denominator);
      const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
      if (!Number.isInteger(shadedCount)) throw new Error(`${question.skillId}: unreachable fraction partition fixture`);
      state.shaded = indexedItems("part", shadedCount);
      break;
    }
    case "GRID_ROUTE": {
      state.moves = Array.isArray(p.moves) ? [...p.moves] : [];
      const trace = engine.traceGridRoute(question, state.moves);
      if (!trace) throw new Error(`${question.skillId}: invalid grid-route fixture`);
      state.end = { ...trace.end };
      break;
    }
    case "CLOCK_READ": {
      const time = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
      if (!time) throw new Error(`${question.skillId}: invalid clock fixture`);
      state.hour = Number(time[1]);
      state.minute = Number(time[2]);
      break;
    }
    case "METRIC_SCALE":
      state.value = Number(question.answer.value);
      break;
    case "ANGLE_MEASURE":
      state.degrees = Number(question.answer.value);
      break;
    case "ACTION_SCENE":
      state.actions = Array.from(
        { length: Math.abs(Number(p.b)) },
        () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
      );
      state.value = String(question.answer.value);
      break;
    case "MEASURE_OBJECT":
      state.actions = Array.from({ length: Number(p.count) }, () => "place-unit");
      state.value = String(p.count);
      break;
    case "AREA_DECOMPOSE":
      state.cutIds = ["cut1"];
      state.part0 = String(Number(p.l1) * Number(p.w1));
      state.part1 = String(Number(p.l2) * Number(p.w2));
      state.total = String(question.answer.value);
      break;
    case "VOLUME_INSPECT":
      state.viewedLayers = Array.from({ length: Number(p.height) }, (_, index) => index + 1);
      state.method = String(p.method);
      state.value = String(question.answer.value);
      break;
    default:
      throw new Error(`${question.skillId}: no structured response fixture for ${question.inputMethod}`);
  }
  return engine.serializeResponse(question, state);
}

function answerFor(engine, question) {
  const option = correctOption(engine, question);
  if (option) return { optionId: option.optionId };
  return STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)
    ? structuredAnswerFor(engine, question)
    : question.answer.value;
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

function recordPlacementResult(engine, run, response) {
  const question = engine.placementCurrentQuestion(run);
  if (!question) throw new Error("Placement fixture tried to answer a completed run.");
  const responseKind = response === "not-sure"
    ? "not-sure"
    : response ? "correct" : "incorrect";
  return {
    ...cloneJson(run),
    answers: [
      ...cloneJson(run.answers),
      { questionId: question.questionId, responseKind },
    ],
  };
}

function completePlacement(engine, state, policy, options = {}) {
  let run = engine.createPlacementRun({
    state,
    playDay: options.playDay ?? state.maxSeenPlayDay,
    seed: options.seed ?? 0x706c6163,
    theme: options.theme ?? "ocean",
  });
  for (let index = 0; index < engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS; index += 1) {
    const question = engine.placementCurrentQuestion(run);
    if (!question) return run;
    if (question.inputClass === "SELECTION" && question.options.some((option) => (
      [option.label, option.value].some((value) => String(value).trim().toLowerCase() === "not sure")
    ))) {
      throw new Error(`Placement question ${question.questionId} duplicates the global Not sure action.`);
    }
    run = recordPlacementResult(engine, run, policy(question, index, run));
  }
  if (engine.placementCurrentQuestion(run)) throw new Error("Placement fixture exceeded the approved maximum.");
  return run;
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
        assert.equal(engine.gradeAnswer(first, answerFor(engine, first)).correct, true, `${skill.id}/${tier}: self-grade`);
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
      for (const choice of choices) assert.equal(engine.gradeAnswer(choice, answerFor(engine, choice)).correct, true, `${skill.id}: answerable`);
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
    assert.equal(engine.gradeAnswer(construction.question, answerFor(engine, construction.question)).correct, true);
    if (STRUCTURED_RESPONSE_METHODS.has(construction.question.inputMethod)) {
      const scalarBypass = engine.gradeAnswer(construction.question, construction.question.answer.value);
      assert.equal(scalarBypass.correct, false);
      assert.equal(scalarBypass.valid, false);
      assert.equal(scalarBypass.reason, "structured-response-required");
    }
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
    const observedStrategyVariants = new Set();
    for (const skillId of STRATEGY_BUILD_SKILL_IDS) {
      const skill = requireSkill(skills, `${skillId} strategy build`, (candidate) => candidate.id === skillId);
      for (const tier of ["EASY", "HARD/TARGET"]) {
        for (let ordinal = 0; ordinal < 24; ordinal += 1) {
          const question = engine.makeQuestion({ ...questionArgs(skill, tier, ordinal), representation: "PICTORIAL" });
          assert.equal(question.inputMethod, "STRATEGY_BUILD", `${skillId}/${question.taskType}: governed renderer`);
          observedStrategyVariants.add(strategySemanticVariantKey(question));
          const selectedMethods = skillId === "MQ-095" ? ["mental", "written"] : [null];
          for (const selectedMethod of selectedMethods) {
            const response = correctStrategyBuildResponse(question, selectedMethod);
            assert.deepEqual(Object.keys(response).sort(), ["strategy", "value", "work"], `${skillId}: closed response keys`);
            assert.equal(engine.gradeAnswer(question, response).correct, true, `${skillId}/${question.taskType}/${response.strategy}: independent response`);
            const missingWork = { strategy: response.strategy, work: response.work.slice(0, -1), value: response.value };
            assert.equal(engine.gradeAnswer(question, missingWork).correct, false, `${skillId}/${question.taskType}/${response.strategy}: missing work`);
            const wrongWork = { strategy: response.strategy, work: [...response.work], value: response.value };
            wrongWork.work[0] = `${String(wrongWork.work[0])}-wrong`;
            assert.equal(engine.gradeAnswer(question, wrongWork).correct, false, `${skillId}/${question.taskType}/${response.strategy}: wrong work`);
            const extraKey = { ...response, action: response.strategy };
            assert.equal(engine.gradeAnswer(question, extraKey).valid, false, `${skillId}: legacy/extra action key`);
            const hostileMetadata = cloneJson(question);
            hostileMetadata.params = { ...hostileMetadata.params, strategy: "hostile-hidden-strategy" };
            hostileMetadata.answer = { ...hostileMetadata.answer, value: "hostile-hidden-answer" };
            assert.equal(engine.gradeAnswer(hostileMetadata, response).correct, true, `${skillId}: grading trusted hidden strategy/answer`);
          }
        }
      }
    }
    assert.deepEqual([...observedStrategyVariants].sort(), [...EXPECTED_STRATEGY_SEMANTIC_VARIANTS].sort(), "all 17 STRATEGY_BUILD task/prompt variants");
    const mq007 = engine.makeQuestion({
      ...questionArgs(requireSkill(skills, "MQ-007 sorting", (skill) => skill.id === "MQ-007"), "EASY", 0),
      representation: "PICTORIAL",
    });
    assert.equal(mq007.inputMethod, "SORT_BINS");
    const sortCategories = mq007.modelDescriptor.values.categories;
    assert.ok(Array.isArray(sortCategories) && [2, 3].includes(sortCategories.length));
    const sorted = structuredAnswerFor(engine, mq007);
    assert.equal(engine.gradeAnswer(mq007, sorted).correct, true);
    const displacedSort = incorrectSortSubmission(mq007, sorted);
    const categoryIds = new Set(sortCategories.map((category) => String(category.id)));
    assert.ok(Object.values(displacedSort.placements).every((bin) => categoryIds.has(bin)));
    const displacedSortGrade = engine.gradeAnswer(mq007, displacedSort);
    assert.equal(displacedSortGrade.valid, true);
    assert.equal(displacedSortGrade.correct, false);
    const seen = new Set();
    for (const skill of skills) {
      for (let ordinal = 0; ordinal < 4; ordinal += 1) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal, { representation: "PICTORIAL" }));
        seen.add(question.inputMethod);
        assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
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
    assert.equal(imported.placementDraftGeneration, state.placementDraftGeneration + 1);
    const importedProjection = cloneJson(imported);
    importedProjection.placementDraftGeneration = state.placementDraftGeneration;
    assert.equal(canonicalStringify(importedProjection), canonicalStringify(state));
    assert.equal(state.schemaVersion, constants.STATE_SCHEMA_VERSION);
    assert.equal(state.curriculumManifestId, manifest.manifestId);
    assert.equal(state.curriculumVersion, manifest.version);
    assert.equal(state.curriculumSha256, manifestArtifact.sha256);
    assert.equal(constants.BACKUP_MAX_BYTES, 5 * 1024 * 1024);
    assert.equal(constants.BACKUP_MAX_CHARACTERS, 5 * 1024 * 1024);
    assert.equal(
      canonicalStringify(engine.loadState(" ".repeat(constants.BACKUP_MAX_CHARACTERS + 1), 21_000)),
      canonicalStringify({ ok: false, error: "The backup is larger than the 5 MiB limit." }),
    );
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
    assert.equal(constants.STORAGE_NAMESPACE, "math-quest:progress:v2");
    assert.equal(constants.PREVIOUS_STORAGE_NAMESPACE, "math-quest:v2");
    const launcher = await readFile(path.join(root, "Math Quest.bat"), "utf8");
    const server = await readFile(path.join(root, "Serve-MathQuest.ps1"), "utf8");
    assert.match(`${launcher}\n${server}`, /8771/u);
    assert.doesNotMatch(`${launcher}\n${server}`, /8770/u);
    assert.match(server, /IPAddress\]::Loopback|127\.0\.0\.1/u);
    const pageText = extracted.pageBytes.toString("utf8");
    assert.match(pageText, /math-quest:progress:v2/u);
    assert.match(pageText, /beta1-migration-guard:v1/u);
    assert.match(pageText, /beta1-to-protected-v1/u);
    assert.match(pageText, /empty-to-protected-v1/u);
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
      assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}: model answer`);
    }
  });

  await check("BEH-17", "Required governance, research, and release artifacts exist", "Removing or weakening a governed public artifact fails", async (assert) => {
    for (const file of [
      "AGENTS.md",
      "audit/agent-collaboration-policy-v1.json",
      "audit/tests/agent-collaboration-policy.test.mjs",
      "audit/tests/audit-orchestration.test.mjs",
      "audit/certification-cadence-v1.json",
      "audit/lib/development-suite-plan.mjs",
      "audit/lib/playwright-focused-contract.mjs",
      "audit/lib/playwright-deep-ux-census.mjs",
      "audit/lib/release-evidence-successor.mjs",
      "audit/tests/development-suite-plan.test.mjs",
      "audit/tests/playwright-focused-contract.test.mjs",
      "audit/tests/playwright-deep-ux-census.test.mjs",
      "audit/finished-work-policy-v1.json",
      "audit/tests/finished-work-policy.test.mjs",
      "curriculum/math-quest-manifest-v1.json",
      "curriculum/PROVENANCE.md",
      "research/build-axioms.md",
      "research/pedagogy-notes.md",
      "README.md",
      "THIRD_PARTY_NOTICES.md",
      "playwright.deep-ux.config.mjs",
    ]) {
      assert.ok((await readFile(path.join(root, file), "utf8")).trim().length > 0, file);
    }
    const agentPolicy = await readFile(path.join(root, "AGENTS.md"), "utf8");
    for (const [requirement, pattern] of [
      ["permanent lifetime authority", /permanent project policy[\s\S]*lifetime of Math Quest/iu],
      ["all project change types", /whenever the game or repository changes[\s\S]*code, assets, educational content[\s\S]*project structure/iu],
      ["quality dimensions", /software correctness[\s\S]*educational and mathematical correctness[\s\S]*child comprehension[\s\S]*accessibility[\s\S]*release readiness/iu],
      ["uncertainty adds coverage", /When uncertain whether new coverage is\s+required, assume that it is required/iu],
      ["permanent defect regressions", /Every confirmed defect must become a permanent, effect-sensitive regression\s+test/iu],
      ["test and product failure classification", /Classify it explicitly as a product defect, test defect, environment or\s+harness defect, pending approval\/evidence gate/iu],
      ["obsolete tests retain their protected effect", /Revise or replace an obsolete test only when[\s\S]*equal or stronger effect-sensitive coverage protects[\s\S]*original safety or usability purpose/iu],
      ["green results cannot justify weakening", /Never weaken, delete, skip, or reclassify a test merely to obtain a passing\s+result/iu],
      ["no size or context omission", /Do not omit a certification requirement merely to reduce file size, token use,[\s\S]*instruction length/iu],
      ["mandatory fail-closed gate", /mandatory, fail-closed release gate/iu],
      ["focused development cadence", /During ordinary development[\s\S]*run the defined fast development suite[\s\S]*Do not run the complete certification gauntlet merely/iu],
      ["alternating-beta Deep UX Census", /every second semantic-version beta[\s\S]*Beta 4,[\s\S]*Beta 6,[\s\S]*72,576[\s\S]*100-cell[\s\S]*non-certifying/iu],
      ["frozen candidate final cadence", /complete certification system once after all planned release work[\s\S]*public payload are frozen[\s\S]*publication[\s\S]*next intended operation/iu],
      ["publication instruction authorizes final run", /clear owner instruction to publish[\s\S]*authorizes this final run/iu],
      ["exact immutable release identity", /exact immutable commit and exact[\s\S]*public payload that will be tagged and deployed/iu],
      ["post-run change restarts full gate", /change after the run invalidates the[\s\S]*freeze a new candidate[\s\S]*rerun the complete gauntlet from the beginning/iu],
      ["early full run needs owner approval", /recommend an earlier complete run[\s\S]*must obtain[\s\S]*owner's explicit approval/iu],
      ["formal completion waits for final certification", /no feature, refactor, optimization, content update, or release[\s\S]*formally complete until[\s\S]*final complete certification gate/iu],
      ["one marked finished-work authority", /FINISHED-WORK-POLICY-START[\s\S]*What counts as finished work[\s\S]*FINISHED-WORK-POLICY-END/iu],
      ["no automatic child-data transmission", /must never automatically transmit child[\s\S]*deliberate[\s\S]*grown-up-controlled export or share/iu],
      ["truthful completion vocabulary", /implemented\*\* means[\s\S]*release-certified\*\* means[\s\S]*shipped\*\* means/iu],
      ["predefined finish line cannot narrow after difficulty", /Define the finish line before implementation begins[\s\S]*owner.s approval[\s\S]*Never narrow the finish line afterward/iu],
    ]) {
      assert.match(agentPolicy, pattern, `AGENTS.md: ${requirement}`);
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
        assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
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
    const repeatedSampleKey = `${skill.id}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|same`;
    const first = attemptFor(engine, skill, {
      playDay: 21_000,
      ordinal: 1,
      representation: "CONCRETE",
      sampleKey: repeatedSampleKey,
    });
    state = appliedState(engine, state, first);
    state = appliedState(engine, state, attemptFor(engine, skill, {
      playDay: 21_001,
      ordinal: 2,
      representation: "PICTORIAL",
      sampleKey: repeatedSampleKey,
    }));
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
        representation: index === 0 ? "CONCRETE" : "PICTORIAL",
        sampleKey: `${skill.id}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|distinct-${index}`,
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
    const baselineRun = engine.createPlacementRun({ state: live, playDay: 21_000, seed: 0x65706f63 });
    const baselineImport = engine.importState(live, before, 21_000);
    assert.equal(baselineImport.ok, true, baselineImport.error);
    assert.equal(baselineImport.state.placementDraftGeneration, live.placementDraftGeneration + 1);
    const importProjection = cloneJson(baselineImport.state);
    importProjection.placementDraftGeneration = live.placementDraftGeneration;
    assert.equal(canonicalStringify(importProjection), before, "baseline-identical import changes only its draft generation");
    assert.match(engine.validatePlacementRun(baselineRun, baselineImport.state).error, /stale/iu);
    const reset = engine.createResetState(live, 21_000);
    assert.equal(reset.placementDraftGeneration, live.placementDraftGeneration + 1);
    const resetProjection = cloneJson(reset);
    resetProjection.placementDraftGeneration = live.placementDraftGeneration;
    assert.equal(canonicalStringify(resetProjection), before, "baseline-identical reset changes only its draft generation");
    assert.match(engine.validatePlacementRun(baselineRun, reset).error, /stale/iu);
    const laterEpochBackup = cloneJson(live);
    laterEpochBackup.placementDraftGeneration = 7;
    const laterEpochImport = engine.importState(live, engine.exportState(laterEpochBackup), 21_000);
    assert.equal(laterEpochImport.ok, true, laterEpochImport.error);
    assert.equal(laterEpochImport.state.placementDraftGeneration, 8, "import advances beyond both local and imported generations");
    const draftFloorReset = engine.createResetState(live, 21_000, 11);
    assert.equal(draftFloorReset.placementDraftGeneration, 12, "reset advances beyond a surviving placement-draft generation");
    const draftFloorImport = engine.importState(live, before, 21_000, 13);
    assert.equal(draftFloorImport.ok, true, draftFloorImport.error);
    assert.equal(draftFloorImport.state.placementDraftGeneration, 14, "import advances beyond a surviving placement-draft generation");

    const exhaustedCurrent = cloneJson(live);
    exhaustedCurrent.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
    const exhaustedBefore = canonicalStringify(exhaustedCurrent);
    assert.throws(
      () => engine.createResetState(exhaustedCurrent, 21_000),
      /generation is exhausted/iu,
    );
    assert.equal(canonicalStringify(exhaustedCurrent), exhaustedBefore, "failed reset cannot mutate its input");
    const exhaustedImport = engine.importState(exhaustedCurrent, before, 21_000);
    assert.equal(exhaustedImport.ok, false);
    assert.equal(exhaustedImport.state, exhaustedCurrent);
    assert.match(exhaustedImport.error, /generation is exhausted/iu);
    assert.equal(canonicalStringify(exhaustedCurrent), exhaustedBefore, "failed import cannot mutate current progress");
    const floorExhaustedImport = engine.importState(live, before, 21_000, Number.MAX_SAFE_INTEGER);
    assert.equal(floorExhaustedImport.ok, false);
    assert.equal(floorExhaustedImport.state, live);
    assert.match(floorExhaustedImport.error, /generation is exhausted/iu);
    assert.equal(canonicalStringify(live), before, "overflow through a draft floor cannot mutate current progress");
    const exhaustedBackupObject = cloneJson(live);
    exhaustedBackupObject.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
    const exhaustedBackupBefore = canonicalStringify(exhaustedBackupObject);
    const exhaustedBackupImport = engine.importState(live, exhaustedBackupObject, 21_000);
    assert.equal(exhaustedBackupImport.ok, false);
    assert.equal(exhaustedBackupImport.state, live);
    assert.match(exhaustedBackupImport.error, /generation is exhausted/iu);
    assert.equal(canonicalStringify(exhaustedBackupObject), exhaustedBackupBefore, "failed import cannot mutate its backup input");
    assert.equal(canonicalStringify(live), before, "failed backup-generation overflow cannot mutate current progress");
  });

  await check("BEH-28", "Play-day rules handle midnight, reopen, and rollback", "Candidate days can advance but never lower maxSeenPlayDay", (assert) => {
    const state = createState(engine, 20_000);
    state.activeSession = {
      sessionId: "same-day",
      playDay: 20_000,
      level: state.earnedLevel,
      stage: engine.stageForLevel(state.earnedLevel),
      seed: state.seed,
      queue: [],
      baseSlotCount: 0,
      effectivePracticeLimit: 0,
      effectivePlannedCount: 0,
      effectiveTimeCapMs: 60_000,
      adultTimeReduced: true,
      classifications: [],
      index: 0,
      world: "ocean",
      servedCount: 0,
      servedOrdinals: [],
      elapsedMs: 0,
      stopReason: null,
      oneMore: false,
      uiState: {
        version: 1,
        screen: "fatigue",
        phase: "question",
        question: null,
        choiceCandidates: [],
        choiceResolved: {},
        selected: null,
        entry: "",
        fractionParts: { whole: "", numerator: "", denominator: "" },
        modelCells: [],
        responseState: {},
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
      },
    };
    const json = engine.exportState(state);
    assert.equal(engine.loadState(json, 20_001).state.maxSeenPlayDay, 20_001);
    assert.equal(engine.loadState(json, 19_999).state.maxSeenPlayDay, 20_000);
    assert.equal(engine.loadState(json, 20_000).state.activeSession.sessionId, "same-day");
    const manyLogs = createState(engine);
    manyLogs.sessionLog = Array.from({ length: 200 }, (_, index) => ({ sessionId: `old-${index}`, playDay: 21_000 }));
    manyLogs.previewLevel = Math.min(3, constants.LEVEL_MAX);
    manyLogs.activeSession = { sessionId: "active" };
    const completed = engine.completeSession(manyLogs, { sessionId: "new", playDay: 21_000 });
    assert.equal(completed.sessionLog.length, constants.SESSION_LOG_MAX);
    assert.equal(completed.sessionLog[0].sessionId, "old-151");
    assert.equal(completed.activeSession, null);
    assert.equal(completed.previewLevel, null);
  });

  await check("BEH-29", "Starting-point placement is isolated, transactional, and reversible by evidence", "Placement cannot leak practice evidence, overwrite recovery, complete the selected level, or survive contrary review evidence", (assert) => {
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
    const deterministicA = engine.createPlacementRun({ state: evidenced, playDay: 21_000, seed: 0x706c6163, theme: "forest" });
    const deterministicB = engine.createPlacementRun({ state: evidenced, playDay: 21_000, seed: 0x706c6163, theme: "forest" });
    assert.equal(engine.canonical(deterministicA), engine.canonical(deterministicB));
    assert.equal(engine.canonical(engine.placementCurrentQuestion(deterministicA)), engine.canonical(engine.placementCurrentQuestion(deterministicB)));
    assert.equal(engine.placementCurrentQuestion(deterministicA).preview, true);
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
    assert.equal(engine.submitAnswer(selectionQuestion, { optionId: correct.optionId }, {
      promptFinishedAt: 1_000,
      submittedAt: 3_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [],
    }).evidenceClass, "NON_EVIDENCE");
    assert.equal(engine.exportState(evidenced), beforeState);

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

    const priorSchema3 = cloneJson(createState(engine));
    delete priorSchema3.placementDraftGeneration;
    const migratedSchema3 = engine.loadState(JSON.stringify(priorSchema3), priorSchema3.maxSeenPlayDay);
    assert.equal(migratedSchema3.ok, true, migratedSchema3.error);
    assert.equal(migratedSchema3.migrated, true);
    assert.equal(migratedSchema3.state.placementDraftGeneration, 0);

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
  });

  await check("BEH-30", "Math Quest Free Play unlocks exact introduced tools and grades without evidence mutation", "Preview, placement, opening, or Free Play cannot unlock tools or change the learning save", (assert) => {
    let fresh = createState(engine);
    const before = engine.exportState(fresh);
    const catalog = () => engine.playgroundCatalog(fresh);
    assert.ok(catalog().every((activity) => activity.unlocked === false));

    fresh.skills["MQ-010"].acquisition = "LEARNING";
    assert.equal(catalog().find((activity) => activity.activityId === "MANY_WAYS").unlocked, false);
    fresh.skills["MQ-010"].acquisition = "PLACED";
    assert.equal(catalog().find((activity) => activity.activityId === "MANY_WAYS").unlocked, false);
    fresh.skills["MQ-010"].acquisition = "UNSEEN";
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-010"]));
    assert.equal(catalog().find((activity) => activity.activityId === "MANY_WAYS").unlocked, true);
    assert.deepEqual([...catalog().find((activity) => activity.activityId === "MANY_WAYS").tools], ["COUNTERS"]);
    assert.equal(catalog().find((activity) => activity.activityId === "BALANCE_BAY").unlocked, false);

    const many = engine.makePlaygroundRound({ state: fresh, activityId: "MANY_WAYS", mode: "SOLO", seed: 17, roundNumber: 0 });
    assert.deepEqual(many, engine.makePlaygroundRound({ state: fresh, activityId: "MANY_WAYS", mode: "SOLO", seed: 17, roundNumber: 0 }));
    assert.equal(many.sourceKind, "NUMERAL");
    assert.equal(many.buildKind, "COUNTERS");
    const exactCells = Array.from({ length: many.maxValue }, (_, index) => index < many.target);
    const exactGrade = engine.gradePlaygroundConstruction(many, { cells: exactCells });
    assert.equal(exactGrade.valid, true);
    assert.equal(exactGrade.correct, true);
    assert.equal(exactGrade.reason, null);
    assert.equal(exactGrade.actual, many.target);
    assert.equal(exactGrade.target, many.target);
    assert.equal(exactGrade.comparison, "EQUAL");
    assert.equal(exactGrade.mathematicallyEqual, true);
    const adjacentCount = many.target === many.maxValue ? many.target - 1 : many.target + 1;
    const adjacentCells = Array.from({ length: many.maxValue }, (_, index) => index < adjacentCount);
    const adjacentGrade = engine.gradePlaygroundConstruction(many, { cells: adjacentCells });
    assert.equal(adjacentGrade.correct, false);
    assert.equal(adjacentGrade.mathematicallyEqual, false);

    for (const acquisition of ["LEARNING", "PLACED"]) {
      const candidate = structuredClone(fresh);
      candidate.skills["MQ-011"].acquisition = acquisition;
      const candidateTools = engine.playgroundCatalog(candidate)
        .find((activity) => activity.activityId === "MANY_WAYS").tools;
      assert.ok(!candidateTools.includes("PARTS"));
    }
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-011"]));
    assert.deepEqual([...catalog().find((activity) => activity.activityId === "MANY_WAYS").tools], ["COUNTERS", "PARTS"]);
    const partRound = Array.from({ length: 32 }, (_, seed) => engine.makePlaygroundRound({ state: fresh, activityId: "MANY_WAYS", mode: "SOLO", seed })).find((round) => round.buildKind === "PARTS");
    assert.ok(partRound);
    assert.equal(engine.gradePlaygroundConstruction(partRound, { left: 0, right: partRound.target }).valid, false);
    assert.equal(engine.gradePlaygroundConstruction(partRound, { left: 1, right: partRound.target - 1 }).correct, true);

    const toolGate = (skillId, acquisition) => {
      const candidate = structuredClone(fresh);
      candidate.skills[skillId].acquisition = acquisition;
      return engine.playgroundCatalog(candidate).find((activity) => activity.activityId === "MANY_WAYS");
    };
    assert.equal(toolGate("MQ-019", "LEARNING").maxValue, 5);
    assert.equal(toolGate("MQ-019", "PLACED").maxValue, 5);
    assert.ok(!toolGate("MQ-020", "LEARNING").tools.includes("FIVE_FRAME_SOURCE"));
    assert.ok(!toolGate("MQ-020", "PLACED").tools.includes("FIVE_FRAME_SOURCE"));
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-019"]));
    assert.equal(catalog().find((activity) => activity.activityId === "MANY_WAYS").maxValue, 10);
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-020"]));
    assert.ok(catalog().find((activity) => activity.activityId === "MANY_WAYS").tools.includes("FIVE_FRAME_SOURCE"));
    const sourceKinds = new Set();
    for (let seed = 0; seed < 256; seed += 1) {
      const round = engine.makePlaygroundRound({ state: fresh, activityId: "MANY_WAYS", mode: "SOLO", seed });
      sourceKinds.add(round.sourceKind);
      if (round.sourceKind === "FIVE_FRAME") {
        assert.ok(round.target >= 1 && round.target <= 5);
        assert.ok(round.targetChoices.every((value) => value >= 1 && value <= 5));
      } else {
        assert.ok(round.target >= 0 && round.target <= 10);
      }
    }
    assert.deepEqual([...sourceKinds].sort(), ["FIVE_FRAME", "NUMERAL"]);
    const prePartsRange = Array.from({ length: 256 }, (_, seed) => engine.makePlaygroundRound({
      state: fresh,
      activityId: "MANY_WAYS",
      mode: "SOLO",
      seed,
    })).filter((round) => round.buildKind === "PARTS" && round.sourceKind === "NUMERAL");
    assert.ok(prePartsRange.length > 0);
    assert.ok(prePartsRange.every((round) => round.maxValue === 5 && round.targetChoices.every((value) => value <= 5)));

    const balanceGateState = (skill021, skill023) => {
      const candidate = createState(engine);
      candidate.skills["MQ-021"].acquisition = skill021;
      candidate.skills["MQ-023"].acquisition = skill023;
      return engine.playgroundCatalog(candidate).find((activity) => activity.activityId === "BALANCE_BAY").unlocked;
    };
    assert.equal(balanceGateState("PRACTISING", "UNSEEN"), false);
    assert.equal(balanceGateState("UNSEEN", "PRACTISING"), false);
    assert.equal(balanceGateState("LEARNING", "PRACTISING"), false);
    assert.equal(balanceGateState("PLACED", "PRACTISING"), false);
    assert.equal(balanceGateState("PRACTISING", "LEARNING"), false);
    assert.equal(balanceGateState("PRACTISING", "PLACED"), false);
    assert.equal(balanceGateState("PRACTISING", "PRACTISING"), true);
    assert.equal(balanceGateState("SOLID", "SOLID"), true);
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-023"]));
    const postPartsRange = Array.from({ length: 256 }, (_, seed) => engine.makePlaygroundRound({
      state: fresh,
      activityId: "MANY_WAYS",
      mode: "SOLO",
      seed,
    })).filter((round) => round.buildKind === "PARTS" && round.sourceKind === "NUMERAL");
    assert.ok(postPartsRange.length > 0);
    assert.ok(postPartsRange.every((round) => round.maxValue === 10));
    assert.ok(postPartsRange.some((round) => round.target > 5 || round.targetChoices.some((value) => value > 5)));
    assert.equal(catalog().find((activity) => activity.activityId === "BALANCE_BAY").unlocked, false);
    fresh = appliedState(engine, fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-021"]));
    assert.equal(catalog().find((activity) => activity.activityId === "BALANCE_BAY").unlocked, true);
    for (let seed = 0; seed < 64; seed += 1) {
      const balance = engine.makePlaygroundRound({ state: fresh, activityId: "BALANCE_BAY", mode: "FAMILY", seed, roundNumber: seed });
      assert.ok(balance.targetChoices.every((value) => value >= 3 && value <= 10));
      const target = balance.targetChoices[0];
      const duplicate = engine.gradePlaygroundConstruction(balance, { target, pieces: Array(target).fill(1) });
      assert.equal(duplicate.valid, true);
      assert.equal(duplicate.correct, false);
      assert.equal(duplicate.comparison, "DIFFERENT_WAY_NEEDED");
      assert.equal(duplicate.mathematicallyEqual, true);
      const distinct = engine.gradePlaygroundConstruction(balance, { target, pieces: [2, ...Array(target - 2).fill(1)] });
      assert.equal(distinct.correct, true);
      assert.equal(distinct.mathematicallyEqual, true);
      assert.equal(engine.gradePlaygroundConstruction(balance, { target, pieces: [3] }).valid, false);
      assert.equal(balance.makerRole, seed % 2 === 1 ? "GROWN_UP" : "CHILD");
    }
    assert.notEqual(engine.exportState(fresh), before);

    let isolated = createState(engine);
    isolated = appliedState(engine, isolated, attemptFor(engine, engine.SKILL_BY_ID["MQ-010"]));
    const isolatedBefore = engine.exportState(isolated);
    const isolatedRound = engine.makePlaygroundRound({ state: isolated, activityId: "MANY_WAYS", mode: "FAMILY", seed: 99 });
    engine.gradePlaygroundConstruction(isolatedRound, { target: isolatedRound.targetChoices[0], cells: Array(isolatedRound.maxValue).fill(false) });
    assert.equal(engine.exportState(isolated), isolatedBefore);
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
        assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
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

  await check("BND-10", "Starting-point adaptive bracket stays within 10 to 20 questions", "Every boundary is reachable and an isolated early mistake cannot trap the run at the curriculum floor", (assert) => {
    const state = createState(engine);
    const cases = [
      {
        name: "lowest",
        run: completePlacement(engine, state, () => false, { seed: 0x1001 }),
        count: 15,
        recommendedLevel: 1,
      },
      {
        name: "highest",
        run: completePlacement(engine, state, () => true, { seed: 0x1002 }),
        count: 18,
        recommendedLevel: constants.LEVEL_MAX,
      },
      {
        name: "middle boundary",
        run: completePlacement(engine, state, (question) => (
          question.level < 11
        ), { seed: 0x1003 }),
        count: 15,
        recommendedLevel: 11,
      },
      {
        name: "isolated first-answer mistake recovers",
        run: completePlacement(engine, state, (_question, index) => index !== 0, { seed: 0x1004 }),
        count: 18,
        recommendedLevel: constants.LEVEL_MAX,
        completedThrough: constants.PLACEMENT_SEARCH_LEVEL_MAX,
      },
      {
        name: "highest verification fallback",
        run: completePlacement(engine, state, (_question, index) => index < 15, { seed: 0x1006 }),
        count: 18,
        recommendedLevel: 20,
        completedThrough: 19,
      },
      {
        name: "floor verification independently recovers",
        run: completePlacement(engine, state, (question, index) => question.level === 1 && index >= 11, { seed: 0x1008 }),
        count: 15,
        recommendedLevel: 2,
        completedThrough: 1,
      },
    ];
    for (const fixture of cases) {
      const validation = engine.validatePlacementRun(fixture.run, state);
      const recommendation = engine.placementRecommendation(fixture.run);
      assert.equal(validation.valid, true, `${fixture.name}: ${validation.error}`);
      assert.equal(validation.complete, true, fixture.name);
      assert.equal(validation.questionCount, fixture.count, fixture.name);
      assert.equal(recommendation.questionCount, fixture.count, fixture.name);
      assert.equal(recommendation.recommendedLevel, fixture.recommendedLevel, fixture.name);
      if (fixture.completedThrough !== undefined) {
        assert.equal(recommendation.completedThrough, fixture.completedThrough, fixture.name);
      }
      assert.ok(fixture.count >= constants.PLACEMENT_MIN_QUESTIONS, fixture.name);
      assert.ok(fixture.count <= constants.PLACEMENT_MAX_QUESTIONS, fixture.name);
      assert.equal(new Set(fixture.run.answers.map((answer) => answer.questionId)).size, fixture.run.answers.length, fixture.name);
      const replay = { ...cloneJson(fixture.run), answers: [] };
      const signatures = [];
      for (const answer of fixture.run.answers) {
        const question = engine.placementCurrentQuestion(replay);
        signatures.push(engine.placementVisibleTaskSignature(question));
        replay.answers.push(cloneJson(answer));
      }
      assert.equal(
        new Set(signatures).size,
        signatures.length,
        `${fixture.name} cannot repeat a semantically identical visible task`,
      );
    }
    const checkpointVoteShapes = [
      {
        name: "threshold with one incorrect vote",
        response(intendedPass, position) {
          return intendedPass ? position !== 2 : position === 2;
        },
      },
      {
        name: "threshold with an explicit Not sure vote",
        response(intendedPass, position) {
          if (position === 0) return intendedPass;
          if (position === 1) return "not-sure";
          return true;
        },
      },
    ];
    const exhaustiveRecommendationCounts = new Map();
    const exhaustiveQuestionCounts = new Set();
    let exhaustiveRouteCount = 0;
    for (let desiredLevel = constants.LEVEL_MIN; desiredLevel <= constants.LEVEL_MAX; desiredLevel += 1) {
      for (let shapeIndex = 0; shapeIndex < checkpointVoteShapes.length; shapeIndex += 1) {
        const shape = checkpointVoteShapes[shapeIndex];
        const seed = 0x2000 + desiredLevel * 2 + shapeIndex;
        const policy = (question, index) => shape.response(question.level < desiredLevel, index % 3);
        const firstRun = completePlacement(engine, state, policy, { seed });
        const repeatedRun = completePlacement(engine, state, policy, { seed });
        const recommendation = engine.placementRecommendation(firstRun);
        const routeLabel = `level ${desiredLevel}, ${shape.name}`;
        exhaustiveRouteCount += 1;
        exhaustiveRecommendationCounts.set(
          recommendation.recommendedLevel,
          (exhaustiveRecommendationCounts.get(recommendation.recommendedLevel) || 0) + 1,
        );
        exhaustiveQuestionCounts.add(recommendation.questionCount);
        assert.equal(recommendation.recommendedLevel, desiredLevel, routeLabel);
        assert.ok([15, 18].includes(recommendation.questionCount), `${routeLabel}: ${recommendation.questionCount} questions`);
        assert.equal(engine.canonical(firstRun), engine.canonical(repeatedRun), `${routeLabel}: deterministic replay`);
      }
    }
    assert.equal(exhaustiveRouteCount, 42);
    assert.deepEqual([...exhaustiveQuestionCounts].sort((left, right) => left - right), [15, 18]);
    assert.deepEqual(
      [...exhaustiveRecommendationCounts.keys()].sort((left, right) => left - right),
      Array.from(
        { length: constants.LEVEL_MAX - constants.LEVEL_MIN + 1 },
        (_, index) => index + constants.LEVEL_MIN,
      ),
      "all 21 starting recommendations are reachable",
    );
    assert.ok(
      [...exhaustiveRecommendationCounts.values()].every((count) => count === checkpointVoteShapes.length),
      "each starting recommendation is reached by both checkpoint vote shapes",
    );

    const allSuccess = completePlacement(engine, state, () => true, { seed: 0x2fff });
    assert.equal(allSuccess.answers.length, 18, "the all-success route has six three-question groups");
    for (let faultPosition = 0; faultPosition < allSuccess.answers.length; faultPosition += 1) {
      for (const responseKind of ["incorrect", "not-sure"]) {
        const recoverable = completePlacement(engine, state, (_question, index) => {
          if (index !== faultPosition) return true;
          return responseKind === "not-sure" ? "not-sure" : false;
        }, { seed: 0x3000 + faultPosition * 2 + (responseKind === "not-sure" ? 1 : 0) });
        const recommendation = engine.placementRecommendation(recoverable);
        assert.equal(
          recommendation.recommendedLevel,
          constants.LEVEL_MAX,
          `${responseKind} at all-success position ${faultPosition + 1} remains recoverable`,
        );
        assert.equal(recommendation.completedThrough, constants.PLACEMENT_SEARCH_LEVEL_MAX);
        assert.equal(recommendation.questionCount, 18);
        assert.equal(recommendation.responseCounts[responseKind === "not-sure" ? "notSure" : "incorrect"], 1);
      }
    }

    const expectedPlacementMethods = [
      "ACTION_SCENE", "BAR_MODEL", "BOND_SPLIT", "CLOCK_READ", "COIN_BUILD",
      "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY", "FRACTION_ENTRY",
      "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
      "LANDMARK_PLACE", "MEASURE_OBJECT", "MIXED_NUMBER_ENTRY", "NUMBER_LINE",
      "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
      "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
      "TEN_FRAME",
    ];
    const placementMethods = new Set();
    for (let desiredLevel = constants.LEVEL_MIN; desiredLevel <= constants.LEVEL_MAX; desiredLevel += 1) {
      const traversed = completePlacement(engine, state, (question) => {
        placementMethods.add(question.inputMethod);
        return question.level < desiredLevel ? true : "not-sure";
      }, { seed: state.seed });
      assert.equal(engine.placementRecommendation(traversed).recommendedLevel, desiredLevel);
    }
    assert.deepEqual(
      [...placementMethods].sort(),
      expectedPlacementMethods,
      "adaptive placement exposes exactly the 28 governed child input methods",
    );
    let diverseRun = engine.createPlacementRun({ state, playDay: state.maxSeenPlayDay, seed: 0x1009, theme: "ocean" });
    const expectedHighestRoute = [10, 15, 18, 19, 20];
    for (const level of expectedHighestRoute) {
      const checkpointQuestions = [];
      for (let position = 0; position < constants.PLACEMENT_CHECKPOINT_SIZE; position += 1) {
        const checkpoint = engine.placementCurrentQuestion(diverseRun);
        assert.equal(checkpoint.level, level);
        checkpointQuestions.push(checkpoint);
        diverseRun = recordPlacementResult(engine, diverseRun, true);
      }
      const levelStrands = new Set(skills.filter((skill) => skill.level === level).map((skill) => skill.strand));
      if (levelStrands.size > 1) {
        assert.notEqual(
          engine.SKILL_BY_ID[checkpointQuestions[0].skillId].strand,
          engine.SKILL_BY_ID[checkpointQuestions[1].skillId].strand,
          `level ${level} checkpoint strands`,
        );
      }
    }
    const initial = engine.createPlacementRun({ state, playDay: state.maxSeenPlayDay, seed: 0x1005, theme: "space" });
    assert.equal(engine.placementRecommendation(initial), null);
    const first = engine.placementCurrentQuestion(initial);
    assert.equal(first.preview, true);
    assert.equal(first.tier, "HARD/TARGET");
    const wrongSequence = {
      ...cloneJson(initial),
      answers: [{ questionId: `${first.questionId}-wrong`, responseKind: "correct" }],
    };
    assert.equal(engine.validatePlacementRun(wrongSequence, state).valid, false);
    const overflow = {
      ...cloneJson(cases[0].run),
      answers: [...cloneJson(cases[0].run.answers), { questionId: "after-complete", responseKind: "correct" }],
    };
    assert.equal(engine.validatePlacementRun(overflow, state).valid, false);
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
