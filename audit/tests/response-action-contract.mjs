import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi } from "./session-fixtures.mjs";
import { completeResponseState } from "./response-fixtures.mjs";
import { correctStructuredResponse } from "./manifest-semantic-suite.mjs";
import { assertResponseFallbackContract } from "./response-boundary-contract.mjs";

function assertInitialResponseSchema(engine, method, question) {
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
}

function assertCompletedResponseSchema(engine, method, question) {
  const submittedResponse = correctStructuredResponse(engine, question);
  const completedResponse = completeResponseState(engine, question, submittedResponse);
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

function assertResponseSchema(engine, activeByMethod) {
  assertResponseFallbackContract(engine);
  for (const [method, question] of activeByMethod) {
    assertInitialResponseSchema(engine, method, question);
    assertCompletedResponseSchema(engine, method, question);
  }
}

const malformedActions = [
  ["COUNT_TOUCH", { touched: "not-an-array", count: "" }],
  ["COUNT_TOUCH", { touched: ["i0", "i0"], count: 2 }],
  ["COUNT_TOUCH", { touched: ["outside"], count: Number.POSITIVE_INFINITY }],
  ["ORDER_BUILD", { order: null }],
  ["ORDER_BUILD", { order: ["not-a-number"] }],
  ["COIN_BUILD", { coins: null }],
  ["SYMMETRY_BUILD", { lines: ["line1", "line1"] }],
  ["EXPRESSION_BUILD", { rule: "", value: Number.NaN }],
  ["PAIR_LINK", { links: [["a0"]] }],
  ["PAIR_LINK", { links: [["a999", "b999"]] }],
  ["PAIR_LINK", { links: [["a0", "b0"], ["a0", "b1"]] }],
  ["SORT_BINS", { placements: null }],
  ["SHARE_DEAL", { recipients: [], pool: [], history: [] }],
  ["SHARE_DEAL", { recipients: {}, pool: [], history: "not-an-array" }],
  ["SHARE_DEAL", { recipients: {}, pool: [], history: [["bad-row"]] }],
  ["GROUP_BUILD", { recipients: [], pool: [], history: [] }],
  ["GROUP_BUILD", { recipients: {}, pool: [], history: [["g999", "item0"]] }],
  ["BOND_SPLIT", { groups: [], pool: [], history: [] }],
  ["BOND_SPLIT", { groups: {}, pool: [], history: [["g1", "wrong-token"]] }],
  ["PATTERN_BUILD", { tokens: null }],
  ["PATTERN_BUILD", { tokens: ["not-an-allowed-token"] }],
  ["LANDMARK_PLACE", { relation: "above" }],
  ["SLOT_COMPOSER", { slots: [null, "", ""] }],
  ["FACT_FAMILY", { selected: ["duplicate", "duplicate"] }],
  ["GRAPH_BUILD", { categories: [] }],
  ["FRACTION_PARTITION", { denominator: 0, shadedCount: -1, templateId: "diagonal" }],
  ["FRACTION_PARTITION", {
    denominator: 2,
    shaded: ["part0", "part0"],
    templateId: "vertical",
  }],
  ["GRID_ROUTE", { moves: ["X"], end: { x: 0, y: 0 } }],
  ["CLOCK_READ", { hour: 13, minute: 60 }],
  ["CLOCK_READ", { hour: "", minute: "" }],
  ["METRIC_SCALE", { value: -1 }],
  ["METRIC_SCALE", { value: Number.POSITIVE_INFINITY }],
  ["ANGLE_MEASURE", { degrees: -1 }],
  ["ANGLE_MEASURE", { degrees: 181 }],
  ["MEASURE_OBJECT", { value: "", actions: ["wrong"] }],
  ["AREA_DECOMPOSE", { cutIds: ["wrong"], partAreas: [0], total: "" }],
  ["VOLUME_INSPECT", { viewedLayers: [1, 1], method: "guess", value: "" }],
];

const malformedQuestionCases = {
  placeActions({ engine, q }) {
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
  },
  coinDenomination({ engine, q }) {
    const noCoin = clone(q("COIN_BUILD"));
    noCoin.params.secondCoin = "unknown";
    assert.equal(engine.gradeAnswer(noCoin, { coins: [1] }).valid, false);
  },
  unknownSortRule({ engine, q }) {
    const sort = q("SORT_BINS");
    const uncategorized = clone(sort);
    uncategorized.modelDescriptor.values.categories = [];
    uncategorized.modelDescriptor.values.rule = { attribute: "property", value: "not-a-property" };
    const uncategorizedResult = engine.gradeAnswer(uncategorized, { placements: {} });
    assert.equal(uncategorizedResult.correct, false);
  },
  graphExplanation({ engine, q }) {
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
  },
  routeSpecification({ engine, q }) {
    const invalidRoute = clone(q("GRID_ROUTE"));
    invalidRoute.params.moves = ["X"];
    assert.equal(engine.gridRouteSpecification(invalidRoute), null);
    assert.equal(engine.traceGridRoute(invalidRoute, []), null);
    assert.equal(engine.gradeAnswer(invalidRoute, { moves: [], end: { x: 1, y: 1 } }).valid, false);
  },
  actionTokens({ engine, q }) {
    const action = q("ACTION_SCENE");
    for (const semanticPromptStringId of ["question.addition", "question.subtraction"]) {
      const fixture = { ...clone(action), semanticPromptStringId };
      const result = engine.gradeAnswer(fixture, { value: "", actions: ["wrong"] });
      assert.equal(result.valid, false, `ACTION_SCENE/${semanticPromptStringId}`);
    }
  },
};

function assertMalformedResponses(engine, activeByMethod) {
  const q = (method) => activeByMethod.get(method);
  for (const [method, payload] of malformedActions) {
    const result = engine.gradeAnswer(q(method), payload);
    assert.equal(result.correct, false, `${method} malformed action cannot be correct`);
    assert.equal(result.valid, false, `${method} malformed action must be invalid`);
  }
  for (const check of Object.values(malformedQuestionCases)) check({ engine, q });
}

function wrongAnswerContext(engine, activeByMethod) {
  const q = (method) => activeByMethod.get(method);
  const correct = (method) => clone(correctStructuredResponse(engine, q(method)));
  const validWrong = (method, payload) => {
    const result = engine.gradeAnswer(q(method), payload);
    assert.equal(result.valid, true, `${method} alternative remains a well-formed child action`);
    assert.equal(result.correct, false, `${method} alternative cannot become correct`);
  };
  return { q, correct, validWrong };
}

const wrongAnswerCases = {
  touchCount({ correct, validWrong }) {
    const response = correct("COUNT_TOUCH");
    response.count = Number(response.count) === 10 ? 9 : Number(response.count) + 1;
    validWrong("COUNT_TOUCH", response);
  },
  numberOrder({ correct, validWrong }) {
    const response = correct("ORDER_BUILD");
    [response.order[0], response.order[1]] = [response.order[1], response.order[0]];
    validWrong("ORDER_BUILD", response);
  },
  numericValue({ correct, validWrong }) {
    for (const method of ["PLACE_VALUE_BUILD", "EXPRESSION_BUILD", "METRIC_SCALE", "MEASURE_OBJECT"]) {
      const response = correct(method);
      response.value = Number(response.value) + 1;
      validWrong(method, response);
    }
  },
  coinTotal({ correct, validWrong }) {
    const response = correct("COIN_BUILD");
    response.coins.push(response.coins[0]);
    validWrong("COIN_BUILD", response);
  },
  pairCount({ correct, validWrong }) {
    const response = correct("PAIR_LINK");
    response.links.pop();
    validWrong("PAIR_LINK", response);
  },
  patternToken({ q, correct, validWrong }) {
    const response = correct("PATTERN_BUILD");
    const question = q("PATTERN_BUILD");
    const allowed = Array.isArray(question.params.tokenChoices)
      ? question.params.tokenChoices.map(String)
      : ["●", "▲", "■", "◆"];
    response.tokens[0] = allowed.find((token) => token !== response.tokens[0]) || "◆";
    validWrong("PATTERN_BUILD", response);
  },
  landmarkRelation({ correct, validWrong }) {
    const response = correct("LANDMARK_PLACE");
    response.relation = ["in", "on", "under", "beside", "between"]
      .find((relation) => relation !== response.relation);
    validWrong("LANDMARK_PLACE", response);
  },
  expressionAnswer({ correct, validWrong }) {
    const response = correct("SLOT_COMPOSER");
    response.slots[4] = String(Number(response.slots[4]) + 1);
    validWrong("SLOT_COMPOSER", response);
  },
  factFamily({ validWrong }) {
    validWrong("FACT_FAMILY", { selected: ["a", "b", "c", "d"] });
  },
  graphValue({ correct, validWrong }) {
    const response = correct("GRAPH_BUILD");
    const key = Object.keys(response.categories)[0];
    response.categories[key] = Number(response.categories[key]) + 1;
    validWrong("GRAPH_BUILD", response);
  },
  fractionAmount({ correct, validWrong }) {
    const response = correct("FRACTION_PARTITION");
    if (response.shaded.length < response.denominator) response.shaded.push(`part${response.shaded.length}`);
    else response.shaded.pop();
    validWrong("FRACTION_PARTITION", response);
  },
  routeMoves({ correct, validWrong }) {
    const response = correct("GRID_ROUTE");
    response.moves = [];
    validWrong("GRID_ROUTE", response);
  },
  clockMinute({ correct, validWrong }) {
    const response = correct("CLOCK_READ");
    response.minute = (Number(response.minute) + 1) % 60;
    validWrong("CLOCK_READ", response);
  },
  angleValue({ correct, validWrong }) {
    const response = correct("ANGLE_MEASURE");
    const wanted = Number(response.degrees);
    response.degrees = wanted <= 177 ? wanted + 3 : wanted - 3;
    validWrong("ANGLE_MEASURE", response);
  },
  areaTotal({ correct, validWrong }) {
    const response = correct("AREA_DECOMPOSE");
    response.partAreas[0] += 1;
    response.total += 1;
    validWrong("AREA_DECOMPOSE", response);
  },
  volumeValue({ correct, validWrong }) {
    const response = correct("VOLUME_INSPECT");
    response.value = Number(response.value) + 1;
    validWrong("VOLUME_INSPECT", response);
  },
};

function assertWrongAlternatives(engine, activeByMethod) {
  const context = wrongAnswerContext(engine, activeByMethod);
  for (const check of Object.values(wrongAnswerCases)) check(context);
}

export async function registerResponseActionTests(t, engine, activeByMethod) {
  await t.test("RESPONSE-SCHEMA empty states serialize and unknown fields fail persisted validation", () => assertResponseSchema(engine, activeByMethod));
  await t.test("RESPONSE-GRADING malformed method-specific actions stay invalid or incorrect", () => assertMalformedResponses(engine, activeByMethod));
  await t.test("RESPONSE-GRADING valid alternative actions remain wrong", () => assertWrongAlternatives(engine, activeByMethod));
}
