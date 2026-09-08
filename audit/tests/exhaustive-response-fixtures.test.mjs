import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { buildExhaustiveResponseState } from "../lib/exhaustive-response-fixtures.mjs";
import { correctStrategyBuildResponse } from "./strategy-build-oracle.mjs";

const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
const legacyScalarMethods = new Set(["TEN_FRAME", "NUMBER_BOND", "NUMBER_LINE", "BAR_MODEL", "NUMBER_PAD", "FRACTION_ENTRY", "MIXED_NUMBER_ENTRY"]);
const expectedCounts = {
  PAIR_LINK: 72, COUNT_TOUCH: 24, PATTERN_BUILD: 72, SORT_BINS: 96, ORDER_BUILD: 30,
  BOND_SPLIT: 54, ACTION_SCENE: 48, SHARE_DEAL: 24, LANDMARK_PLACE: 24,
  GRAPH_BUILD: 120, SLOT_COMPOSER: 48, FRACTION_PARTITION: 96, GROUP_BUILD: 54,
  GRID_ROUTE: 120, PLACE_VALUE_BUILD: 168, STRATEGY_BUILD: 144, CLOCK_READ: 48,
  FACT_FAMILY: 42, MEASURE_OBJECT: 24, COIN_BUILD: 24, METRIC_SCALE: 18,
  SYMMETRY_BUILD: 18, EXPRESSION_BUILD: 24, AREA_DECOMPOSE: 24,
  VOLUME_INSPECT: 24, ANGLE_MEASURE: 24,
};

function* fixtureQuestions() {
  for (const skill of engine.SKILLS) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      yield* skillFixtureQuestions(skill.skillId, tier);
    }
  }
}

function* skillFixtureQuestions(skillId, tier) {
  for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
    for (const ordinal of [0, 1, 7, 19]) {
      const question = engine.makeQuestion({ skillId, tier, representation, theme: "ocean", seed: 0x4d515631, ordinal, eligibleQuestionOrdinal: ordinal });
      if (question.inputClass === "CONSTRUCTION" && !legacyScalarMethods.has(question.inputMethod)) yield question;
    }
  }
}

test("exhaustive response fixtures preserve 1,464 pre-extraction states across all 26 methods", () => {
  const hash = createHash("sha256");
  const counts = {};
  for (const question of fixtureQuestions()) {
    const before = engine.canonical(question);
    const issues = [];
    const state = buildExhaustiveResponseState(question, { engine, issue: (message) => issues.push(message), correctStrategyBuildResponse });
    assert.equal(engine.canonical(question), before, "fixture building must not mutate its question");
    hash.update(JSON.stringify([question.questionId, state, issues]) + "\n");
    counts[question.inputMethod] = (counts[question.inputMethod] || 0) + 1;
  }
  assert.deepEqual(counts, expectedCounts);
  assert.equal(hash.digest("hex"), "f866a895590f7893150ced09e872f1f92767ae384a7e5a0c4aedb419f4313571");
});

function probe(method, overrides = {}, state = {}) {
  const issues = [];
  const question = { skillId: "MQ-001", inputMethod: method, params: {}, answer: { value: "1" }, ...overrides };
  const context = { engine: { ...engine, createResponseState: () => state }, issue: (message) => issues.push(message), correctStrategyBuildResponse };
  return { question, context, state, issues };
}

test("unknown and inherited method names fail closed instead of invoking object properties", () => {
  for (const method of ["UNKNOWN", "toString", "constructor", "__proto__"]) {
    const fixture = probe(method);
    assert.equal(buildExhaustiveResponseState(fixture.question, fixture.context), null);
    assert.deepEqual(fixture.issues, [`MQ-001: audit lacks a structured response fixture for ${method}`]);
  }
});

test("fixture handlers mutate and return the original response state", () => {
  const fixture = probe("COUNT_TOUCH", { answer: { value: "3" } }, { retained: true });
  assert.equal(buildExhaustiveResponseState(fixture.question, fixture.context), fixture.state);
  assert.deepEqual(fixture.state, { retained: true, touched: ["i0", "i1", "i2"], count: "3" });
  assert.deepEqual(fixture.issues, []);
});

test("unreachable fractional partitions preserve null and the specific failure", () => {
  const fixture = probe("FRACTION_PARTITION", { answer: { value: "1/2" } }, { denominator: 3 });
  assert.equal(buildExhaustiveResponseState(fixture.question, fixture.context), null);
  assert.deepEqual(fixture.issues, ["MQ-001: fraction partition fixture is unreachable"]);
});

test("untraceable routes preserve null and the specific failure", () => {
  const fixture = probe("GRID_ROUTE", { params: { moves: ["up"] } });
  fixture.context.engine.traceGridRoute = () => null;
  assert.equal(buildExhaustiveResponseState(fixture.question, fixture.context), null);
  assert.deepEqual(fixture.issues, ["MQ-001: grid route cannot be traced from its displayed start"]);
});

test("an unavailable distinct second partition remains a reported failure", () => {
  const fixture = probe("BOND_SPLIT", { semanticPromptStringId: "question.secondPartition", params: { whole: 2, firstA: 1, firstB: 1 } });
  assert.equal(buildExhaustiveResponseState(fixture.question, fixture.context), null);
  assert.deepEqual(fixture.issues, ["MQ-001: no distinct second partition fixture is reachable"]);
});

test("shared recipient histories preserve group ordering and undealt remainders", () => {
  const fixture = probe("SHARE_DEAL", { params: { recipients: 2, total: 5 } });
  buildExhaustiveResponseState(fixture.question, fixture.context);
  assert.deepEqual(fixture.state, {
    recipients: { r1: ["item0", "item1"], r2: ["item2", "item3"] },
    pool: ["item4"], history: [["r1", "item0"], ["r1", "item1"], ["r2", "item2"], ["r2", "item3"]],
  });
});
