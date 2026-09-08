import { coreChecks } from "./engine-core-checks.mjs";
import { learningChecks } from "./engine-learning-checks.mjs";
import { boundaryChecks } from "./engine-boundary-checks.mjs";
import { assertPlacementBehavior } from "./engine-placement-behavior.mjs";
import { assertPlacementBoundaries } from "./engine-placement-boundaries.mjs";
import { assertImportBehavior } from "./engine-import-behavior.mjs";
import { assertInputMethodBehavior } from "./engine-input-behavior.mjs";
import { assertFreePlayBehavior } from "./engine-free-play-behavior.mjs";
import { applySharedResponseFixture } from "../lib/shared-response-fixtures.mjs";
import { incorrectSortSubmission } from "../lib/sort-response-fixtures.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractEngine, evaluateEngine, scanAmbientReferences } from "../lib/engine-loader.mjs";
import { childStringArtifact, validateChildStringRecords } from "../lib/child-strings.mjs";
import { canonicalizeJson, loadManifest } from "../lib/curriculum-manifest.mjs";
import { AuditHarness, canonicalStringify, cloneJson, functionFrom } from "../lib/test-harness.mjs";
import { completePlacement, recordPlacementResult } from "../lib/placement-fixtures.mjs";
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

function indexedItems(prefix, count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => `${prefix}${index}`);
}

function coreFractionResponseFixture(engine, question, state) {
  const fraction = engine.parseRational(question.answer.value);
  if (!fraction) throw new Error(`${question.skillId}: invalid fraction fixture`);
  state.templateId = "vertical";
  const denominator = Number(state.denominator);
  const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
  if (!Number.isInteger(shadedCount)) throw new Error(`${question.skillId}: unreachable fraction partition fixture`);
  state.shaded = indexedItems("part", shadedCount);
}

function coreRouteResponseFixture(engine, question, state, p) {
  state.moves = Array.isArray(p.moves) ? [...p.moves] : [];
  const trace = engine.traceGridRoute(question, state.moves);
  if (!trace) throw new Error(`${question.skillId}: invalid grid-route fixture`);
  state.end = { ...trace.end };
}

function coreClockResponseFixture(question, state) {
  const time = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
  if (!time) throw new Error(`${question.skillId}: invalid clock fixture`);
  state.hour = Number(time[1]);
  state.minute = Number(time[2]);
}

function coreSpecificResponseFixture(engine, question, state, p, method) {
  if (method === "FRACTION_PARTITION") coreFractionResponseFixture(engine, question, state);
  else if (method === "GRID_ROUTE") coreRouteResponseFixture(engine, question, state, p);
  else if (method === "CLOCK_READ") coreClockResponseFixture(question, state);
  else {
    throw new Error(`${question.skillId}: no structured response fixture for ${question.inputMethod}`);
  }
}

function structuredAnswerFor(engine, question) {
  const state = engine.createResponseState(question);
  const p = question.params || {};
  const method = question.inputMethod;
  if (method === "STRATEGY_BUILD") {
    return correctStrategyBuildResponse(question, question.skillId === "MQ-095" ? "mental" : null);
  }
  if (!applySharedResponseFixture(method, { state, question, p })) {
    coreSpecificResponseFixture(engine, question, state, p, method);
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

function replacePromotionGateway(selected, rows, gateways, level) {
  const replacement = rows.find((skill) => skill.masteryRole !== "GATEWAY" && !selected.includes(skill));
  if (!replacement) throw new Error(`Level ${level} has no supporting skill for gateway-block fixture.`);
  selected.splice(selected.indexOf(gateways[0]), 1, replacement);
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
  if (!gatewaySolid) replacePromotionGateway(selected, rows, gateways, level);
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

function assertCanadianCoinValues(assert, skill, question, canadianCoinValues) {
  for (const key of ["coin", "coin1", "coin2", "c1", "c2"]) {
    if (question.params?.[key] !== undefined) {
      const label = String(question.params[key]).trim();
      const raw = label.replace(/[$¢\s]/gu, "");
      const numeric = Number(raw) * (label.startsWith("$") ? 100 : 1);
      if (Number.isFinite(numeric)) assert.ok(canadianCoinValues.has(numeric), `${skill.id}: unsupported coin ${question.params[key]}`);
    }
  }
}

function assertCanadianMoneyQuestions(engine, assert, moneySkills) {
  const canadianCoinValues = new Set([5, 10, 25, 100, 200]);
  for (const skill of moneySkills) {
    for (let ordinal = 0; ordinal < 16; ordinal += 1) {
      const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
      assert.doesNotMatch(`${question.prompt} ${question.options.map((option) => optionValue(option)).join(" ")}`, /\b(?:USD|U\.S\. dollars?)\b/iu);
      assertCanadianCoinValues(assert, skill, question, canadianCoinValues);
    }
  }
}

async function executeEngineChecks(check, context) {
  for (const { id, title, effect, run, options } of [...coreChecks, ...learningChecks, ...boundaryChecks]) {
    await check(id, title, effect, (assert) => run(assert, context), options);
  }
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

  const context = {
    EXPECTED_STRATEGY_SEMANTIC_VARIANTS, REQUIRED_APIS, STRATEGY_BUILD_SKILL_IDS, STRUCTURED_RESPONSE_METHODS, answerFor,
    appliedState, assertCanadianMoneyQuestions, assertFreePlayBehavior, assertImportBehavior, assertInputMethodBehavior,
    assertPlacementBehavior, assertPlacementBoundaries, attemptFor, buildQueue, canonicalStringify,
    canonicalizeJson, childStringArtifact, cloneJson, completePlacement, constants,
    constructionFixture, correctOption, correctStrategyBuildResponse, createHash, createState,
    deepFreezeTest, engine, extracted, firstSkill, functionFrom,
    harness, incorrectSortSubmission, indexPath, manifest, manifestArtifact,
    manifestProjection, optionValue, path, promotionFixtureLevel, promotionState,
    questionArgs, readFile, recordPlacementResult, requireSkill, root,
    scanAmbientReferences, selectionFixture, skills, stageFor, stateValue,
    strategySemanticVariantKey, structuredAnswerFor, validateChildStringRecords,
  };
  await executeEngineChecks(check, context);

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
