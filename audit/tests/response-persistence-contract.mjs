import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi } from "./session-fixtures.mjs";

const numericStateMutations = [
  [["COUNT_TOUCH"], "duplicate touch", (response) => {
    response.touched = ["i0", "i0"];
  }],
  [["COUNT_TOUCH"], "outside touch", (response, question) => {
    response.touched = [`i${question.answer.value}`];
  }],
  [["COUNT_TOUCH"], "fractional count", (response) => {
    response.count = 1.5;
  }],
  [["COUNT_TOUCH"], "count above child control maximum", (response) => {
    response.count = 11;
  }],
  [["ORDER_BUILD"], "duplicate number", (response, question) => {
    response.order = [question.params.before, question.params.before];
  }],
  [["ORDER_BUILD"], "outside number", (response) => {
    response.order = [999_999];
  }],
  [["ORDER_BUILD"], "too many positions", (response, question) => {
    response.order = [question.params.before, question.answer.value, question.params.after, 0];
  }],
  [["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"], "unknown action or rule", (response) => {
    if (Object.hasOwn(response, "action")) response.action = "invented";
    else response.rule = 42;
  }],
  [["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"], "non-numeric entry", (response) => {
    response.value = "not-a-number";
  }],
  [["PLACE_VALUE_BUILD", "EXPRESSION_BUILD"], "non-finite entry", (response) => {
    response.value = Number.POSITIVE_INFINITY;
  }],
  [["COIN_BUILD"], "wrong denomination", (response) => {
    response.coins = [3];
  }],
  [["COIN_BUILD"], "too many coins", (response, question) => {
    response.coins = Array.from({ length: 101 }, () => Number(question.params.secondCoin?.replace(/\D/gu, "")) || 5);
  }],
  [["COIN_BUILD"], "amount exceeded", (response, question) => {
    const value = Number(question.params.secondCoin?.replace(/\D/gu, "")) || 5;
    response.coins = Array.from({ length: Math.floor(Number(question.params.amount) / value) + 1 }, () => value);
  }],
  [["SYMMETRY_BUILD"], "duplicate line", (response) => {
    response.lines = ["line1", "line1"];
  }],
  [["SYMMETRY_BUILD"], "unknown line", (response) => {
    response.lines = ["line999"];
  }],
];

const constructionStateMutations = [
  [["PAIR_LINK"], "malformed pair", (response) => {
    response.links = [["a0"]];
  }],
  [["PAIR_LINK"], "outside endpoints", (response) => {
    response.links = [["a999", "b999"]];
  }],
  [["PAIR_LINK"], "reused endpoint", (response) => {
    response.links = [["a0", "b0"], ["a0", "b1"]];
  }],
  [["PAIR_LINK"], "pending outside board", (response) => {
    response.pending = "a999";
  }],
  [["SORT_BINS"], "placements is not an object", (response) => {
    response.placements = [];
  }],
  [["SORT_BINS"], "outside item", (response) => {
    response.placements = { i999: "matches" };
  }],
  [["SORT_BINS"], "outside bin", (response) => {
    response.placements = { i0: "invented" };
  }],
  [["SORT_BINS"], "pending item already placed", (response) => {
    response.placements = { i0: "matches" };
    response.pending = "i0";
  }],
  [["SORT_BINS"], "history is not a list", (response) => {
    response.history = {};
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "container keys changed", (response) => {
    response.recipients = { invented: [] };
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "pool is not a list", (response) => {
    response.pool = {};
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "token identity changed", (response) => {
    response.pool[0] = "forged-token";
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "recipient cursor below range", (response) => {
    response.nextRecipient = 0;
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "history row malformed", (response) => {
    response.history = [["bad"]];
  }],
  [["SHARE_DEAL", "GROUP_BUILD"], "history destination unknown", (response) => {
    response.history = [["invented", "item0"]];
  }],
  [["BOND_SPLIT"], "group keys changed", (response) => {
    response.groups = { g1: [] };
  }],
  [["BOND_SPLIT"], "duplicate token", (response) => {
    response.pool[0] = response.pool[1];
  }],
  [["BOND_SPLIT"], "history order forged", (response) => {
    response.history = [["g1", "item1"]];
  }],
  [["PATTERN_BUILD"], "unknown token", (response) => {
    response.tokens = ["invented"];
  }],
  [["PATTERN_BUILD"], "too many tokens", (response, question) => {
    const length = question.semanticPromptStringId === "question.copyPatternAction"
      ? String(question.params.unit || "").trim().split(/\s+/u).filter(Boolean).length
      : 1;
    response.tokens = Array.from({ length: length + 1 }, () => "invented");
  }],
  [["LANDMARK_PLACE"], "unknown relation", (response) => {
    response.relation = "above";
  }],
  [["SLOT_COMPOSER"], "too many slots", (response) => {
    response.slots = Array.from({ length: 6 }, () => "0");
  }],
  [["SLOT_COMPOSER"], "non-list actions", (response) => {
    response.actions = {};
  }],
  [["FACT_FAMILY"], "duplicate fact", (response) => {
    response.selected = ["same", "same"];
  }],
  [["FACT_FAMILY"], "unknown fact", (response) => {
    response.selected = ["invented"];
  }],
];

const modelStateMutations = [
  [["GRAPH_BUILD"], "category keys changed", (response) => {
    response.categories.invented = 0;
  }],
  [["GRAPH_BUILD"], "negative category", (response) => {
    const key = Object.keys(response.categories)[0];
    response.categories[key] = -1;
  }],
  [["GRAPH_BUILD"], "fractional category", (response) => {
    const key = Object.keys(response.categories)[0];
    response.categories[key] = 1.5;
  }],
  [["GRAPH_BUILD"], "interpretation too long", (response) => {
    response.interpretation = "x".repeat(201);
  }],
  [["GRAPH_BUILD"], "scale is not numeric", (response) => {
    response.scale = "not-a-number";
  }],
  [["FRACTION_PARTITION"], "denominator below range", (response) => {
    response.denominator = 1;
  }],
  [["FRACTION_PARTITION"], "denominator above range", (response) => {
    response.denominator = 21;
  }],
  [["FRACTION_PARTITION"], "denominator choices changed", (response) => {
    response.denominatorChoices.push(19);
  }],
  [["FRACTION_PARTITION"], "template choices changed", (response) => {
    response.templateChoices = ["diagonal"];
  }],
  [["FRACTION_PARTITION"], "template is unknown", (response) => {
    response.templateId = "diagonal";
  }],
  [["FRACTION_PARTITION"], "duplicate shaded part", (response) => {
    response.shaded = ["part0", "part0"];
  }],
  [["FRACTION_PARTITION"], "outside shaded part", (response) => {
    response.shaded = ["part999"];
  }],
  [["GRID_ROUTE"], "unknown move", (response) => {
    response.moves = ["X"];
  }],
  [["GRID_ROUTE"], "end missing coordinate", (response) => {
    response.end = { x: 1 };
  }],
  [["GRID_ROUTE"], "end has extra coordinate", (response) => {
    response.end = { x: 1, y: 1, z: 1 };
  }],
  [["GRID_ROUTE"], "end disagrees with trace", (response) => {
    response.end.x += 1;
  }],
  [["CLOCK_READ"], "hour below range", (response) => {
    response.hour = 0;
  }],
  [["CLOCK_READ"], "hour above range", (response) => {
    response.hour = 13;
  }],
  [["CLOCK_READ"], "minute below range", (response) => {
    response.minute = -1;
  }],
  [["CLOCK_READ"], "minute above range", (response) => {
    response.minute = 60;
  }],
  [["METRIC_SCALE"], "negative value", (response) => {
    response.value = -1;
  }],
  [["ANGLE_MEASURE"], "negative angle", (response) => {
    response.degrees = -1;
  }],
  [["ANGLE_MEASURE"], "angle above straight", (response) => {
    response.degrees = 181;
  }],
  [["ACTION_SCENE"], "wrong action token", (response) => {
    response.actions = ["invented"];
  }],
  [["ACTION_SCENE"], "value is outside the displayed choices", (response, question, engine) => {
    response.value = String(Math.max(...engine.actionSceneSpecification(question).choices) + 100);
  }],
  [["MEASURE_OBJECT"], "wrong action token", (response) => {
    response.actions = ["invented"];
  }],
  [["MEASURE_OBJECT"], "value disagrees with actions", (response) => {
    response.value = "1";
  }],
  [["AREA_DECOMPOSE"], "unknown cut", (response) => {
    response.cutIds = ["invented"];
  }],
  [["AREA_DECOMPOSE"], "too many cuts", (response) => {
    response.cutIds = ["cut1", "cut1"];
  }],
  [["AREA_DECOMPOSE"], "non-numeric part", (response) => {
    response.part0 = "not-a-number";
  }],
  [["VOLUME_INSPECT"], "duplicate layer", (response) => {
    response.viewedLayers = [1, 1];
  }],
  [["VOLUME_INSPECT"], "outside layer", (response, question) => {
    response.viewedLayers = [Number(question.params.height) + 1];
  }],
  [["VOLUME_INSPECT"], "unknown method", (response) => {
    response.method = "estimate";
  }],
  [["VOLUME_INSPECT"], "non-numeric value", (response) => {
    response.value = "not-a-number";
  }],
];

function persistenceMutation(engine, activeByMethod) {
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
    change(response, activeByMethod.get(method), engine);
    reject(method, label, response);
  };
  return mutate;
}

function assertPersistenceCases(mutate, cases) {
  for (const [methods, label, change] of cases) {
    for (const method of methods) mutate(method, label, change);
  }
}

export async function registerResponsePersistenceTests(t, engine, activeByMethod) {
  const mutate = persistenceMutation(engine, activeByMethod);
  await t.test("RESPONSE-BOUNDARY touch, order, numeric, coin, and symmetry state", () => assertPersistenceCases(mutate, numericStateMutations));
  await t.test("RESPONSE-BOUNDARY links, sorts, token deals, and construction lists", () => assertPersistenceCases(mutate, constructionStateMutations));
  await t.test("RESPONSE-BOUNDARY graph, fraction, route, measurement, and model state", () => assertPersistenceCases(mutate, modelStateMutations));
}
