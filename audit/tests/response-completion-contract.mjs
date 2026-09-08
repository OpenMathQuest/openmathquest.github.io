import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { correctStructuredResponse } from "./manifest-semantic-suite.mjs";
import { completeResponseState } from "./response-fixtures.mjs";

function completionContext(engine, activeByMethod) {
  const q = (method) => activeByMethod.get(method);
  const correct = (method) => {
    const question = q(method);
    const submitted = correctStructuredResponse(engine, question);
    const state = completeResponseState(engine, question, submitted);
    assert.equal(engine.isResponseComplete(question, state), true, `${method} complete control`);
    return state;
  };
  const incomplete = (method, state, label) => {
    assert.equal(engine.isResponseComplete(q(method), state), false, `${method}/${label}`);
  };
  return { engine, q, correct, incomplete };
}

const incompleteStates = [
  ["ORDER_BUILD", { order: [1, 2] }, "third position missing"],
  ["LANDMARK_PLACE", { relation: "" }, "relation missing"],
  ["SLOT_COMPOSER", { slots: ["1", "+", "2", "="] }, "answer slot missing"],
  ["FACT_FAMILY", { selected: ["a", "a", "b", "c"] }, "four distinct facts required"],
  ["METRIC_SCALE", { value: " " }, "reading missing"],
  ["ANGLE_MEASURE", { degrees: "not-a-number" }, "finite angle required"],
];

const completionCases = {
  touchCount({ correct, incomplete }) {
    const state = correct("COUNT_TOUCH");
    state.count = "";
    incomplete("COUNT_TOUCH", state, "count still blank after touches");
  },
  numericEntry({ correct, incomplete }) {
    for (const method of ["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"]) {
      const state = correct(method);
      state.value = " ";
      incomplete(method, state, "value blank after action");
    }
  },
  coinTotal({ correct, incomplete }) {
    const state = correct("COIN_BUILD");
    state.coins.pop();
    incomplete("COIN_BUILD", state, "coin total below target");
  },
  symmetryLines({ correct, incomplete }) {
    const state = correct("SYMMETRY_BUILD");
    state.lines.pop();
    incomplete("SYMMETRY_BUILD", state, "line missing");
  },
  pairEndpoint({ correct, incomplete }) {
    const state = correct("PAIR_LINK");
    state.pending = "a0";
    incomplete("PAIR_LINK", state, "unresolved endpoint");
  },
  sortItem({ correct, incomplete }) {
    const state = correct("SORT_BINS");
    state.pending = "i0";
    incomplete("SORT_BINS", state, "unresolved item");
  },
  shareRemainder({ correct, incomplete }) {
    const state = correct("SHARE_DEAL");
    state.pool.push("invented");
    incomplete("SHARE_DEAL", state, "remainder disagrees");
  },
  remainingTokens({ correct, incomplete }) {
    for (const method of ["GROUP_BUILD", "BOND_SPLIT"]) {
      const state = correct(method);
      state.pool.push("invented");
      incomplete(method, state, "token remains");
    }
  },
  patternTokens({ correct, incomplete }) {
    const state = correct("PATTERN_BUILD");
    state.tokens.pop();
    incomplete("PATTERN_BUILD", state, "pattern token missing");
  },
  graphExplanation({ engine, q, correct }) {
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
  },
  fractionPartition({ correct, incomplete }) {
    const state = correct("FRACTION_PARTITION");
    state.shaded = [];
    incomplete("FRACTION_PARTITION", state, "no region shaded");
    state.shaded = ["part0"];
    state.templateId = "";
    incomplete("FRACTION_PARTITION", state, "partition direction missing");
  },
  routeTrace({ engine, q, correct, incomplete }) {
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
  },
  clockReading({ correct, incomplete }) {
    const state = correct("CLOCK_READ");
    state.minute = "";
    incomplete("CLOCK_READ", state, "minute missing");
  },
  actionScene({ correct, incomplete }) {
    const state = correct("ACTION_SCENE");
    state.value = "";
    incomplete("ACTION_SCENE", state, "result missing after actions");
    state.value = "0";
    state.actions.pop();
    incomplete("ACTION_SCENE", state, "action missing");
  },
  measurementUnits({ correct, incomplete }) {
    const state = correct("MEASURE_OBJECT");
    state.value = "";
    incomplete("MEASURE_OBJECT", state, "reading missing after units");
    state.value = "0";
    state.actions.pop();
    incomplete("MEASURE_OBJECT", state, "unit placement missing");
  },
  areaParts({ correct, incomplete }) {
    const state = correct("AREA_DECOMPOSE");
    state.part1 = "";
    incomplete("AREA_DECOMPOSE", state, "second part missing");
    state.part1 = "1";
    state.cutIds = [];
    incomplete("AREA_DECOMPOSE", state, "cut missing");
  },
  volumeLayers({ correct, incomplete }) {
    const state = correct("VOLUME_INSPECT");
    state.method = "";
    incomplete("VOLUME_INSPECT", state, "method missing");
    state.method = "count";
    state.value = "";
    incomplete("VOLUME_INSPECT", state, "value missing");
    state.value = "1";
    state.viewedLayers.pop();
    incomplete("VOLUME_INSPECT", state, "layer unseen");
  },
};

function assertResponseSerialization(engine, activeByMethod) {
  const initial = (method) => clone(engine.createResponseState(activeByMethod.get(method)));
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
}

export async function registerResponseCompletionTests(t, engine, activeByMethod) {
  await t.test("RESPONSE-SERIALIZE preserves finite numbers and nulls unsafe numeric input", () => assertResponseSerialization(engine, activeByMethod));
  await t.test("RESPONSE-COMPLETE requires every visible action, not merely a final value", () => {
    const context = completionContext(engine, activeByMethod);
    for (const args of incompleteStates) context.incomplete(...args);
    for (const check of Object.values(completionCases)) check(context);
  });
}
