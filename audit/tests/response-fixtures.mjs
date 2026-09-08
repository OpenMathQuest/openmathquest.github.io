import assert from "node:assert/strict";
import { questionsForActiveSlot } from "./session-fixtures.mjs";
import { cloneJson } from "../lib/test-harness.mjs";

const STRUCTURED_METHODS = Object.freeze([
  "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
  "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
  "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
  "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
  "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
]);
const expectedMethods = new Set(STRUCTURED_METHODS);
const requestsByEngine = new WeakMap();

function recordResponseWitnesses(engine, skill, index, fixtures) {
  for (const [candidateIndex, question] of questionsForActiveSlot(engine, skill, index).entries()) {
    const method = question.inputMethod;
    if (!expectedMethods.has(method) || fixtures.questions.has(method)) continue;
    fixtures.questions.set(method, question);
    fixtures.requests.set(method, Object.freeze({ skillId: skill.skillId, index, candidateIndex }));
  }
}

function discoverResponseFixtures(engine) {
  const fixtures = { questions: new Map(), requests: new Map() };
  for (const skill of engine.SKILLS) {
    const planned = engine.CONSTANTS.SESSION_PLANNED_BY_STAGE[skill.stage];
    for (let index = 0; index < planned && fixtures.questions.size < expectedMethods.size; index += 1) {
      recordResponseWitnesses(engine, skill, index, fixtures);
    }
  }
  assert.deepEqual(
    [...fixtures.questions.keys()].sort(), [...expectedMethods].sort(),
    "every structured child input method needs an active-session fixture",
  );
  return fixtures;
}

function replayResponseFixtures(engine, requests) {
  return new Map([...requests].map(([method, request]) => {
    const skill = engine.SKILL_BY_ID[request.skillId];
    const question = questionsForActiveSlot(engine, skill, request.index)[request.candidateIndex];
    assert.equal(question.inputMethod, method, "a remembered request must still produce its response method");
    return [method, question];
  }));
}

export function structuredResponseQuestions(engine) {
  if (requestsByEngine.has(engine)) return replayResponseFixtures(engine, requestsByEngine.get(engine));
  const fixtures = discoverResponseFixtures(engine);
  requestsByEngine.set(engine, fixtures.requests);
  return fixtures.questions;
}

export function completeResponseState(engine, question, submitted) {
  const state = engine.createResponseState(question);
  if (question.inputMethod === "AREA_DECOMPOSE") {
    state.cutIds = [...submitted.cutIds];
    state.part0 = String(submitted.partAreas[0]);
    state.part1 = String(submitted.partAreas[1]);
    state.total = String(submitted.total);
  } else {
    Object.assign(state, cloneJson(submitted));
  }
  return state;
}
