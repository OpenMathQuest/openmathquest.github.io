import assert from "node:assert/strict";

const clone = (value) => JSON.parse(JSON.stringify(value));

function assertFractionGradeFallback(engine) {
  const question = {
    inputMethod: "FRACTION_PARTITION",
    inputClass: "CONSTRUCTION",
    answer: { kind: "rational", value: "1/2", targetForm: "VALUE" },
  };
  for (const payload of [{}, []]) {
    const grade = engine.gradeAnswer(question, payload);
    assert.equal(Object.isFrozen(grade), true, "empty fraction payload fallback must remain frozen");
    assert.deepEqual(clone(grade), {
      correct: false,
      valid: false,
      reason: "INVALID_FRACTION",
      canonical: null,
    });
  }
}

function assertPairGradeFallback(engine) {
  const question = {
    inputMethod: "PAIR_LINK",
    inputClass: "CONSTRUCTION",
    semanticPromptStringId: "question.pairObjects",
    params: { leftCount: 2, rightCount: 2 },
    answer: { kind: "text", value: "same" },
  };
  assert.deepEqual(clone(engine.gradeAnswer(question, { links: [[1]] })), {
    correct: false,
    valid: false,
    canonical: '{"links":[["1","undefined"]]}',
  });
  assert.deepEqual(clone(engine.gradeAnswer(question, { links: [[]] })), {
    correct: false,
    valid: false,
    canonical: '{"links":[["undefined","undefined"]]}',
  });
  assert.throws(
    () => engine.gradeAnswer(question, { links: [null] }),
    /Cannot read properties of null/u,
  );
}

function assertNumericTextPlaceGrade(engine) {
  const question = {
    inputMethod: "PLACE_VALUE_BUILD",
    inputClass: "CONSTRUCTION",
    semanticPromptStringId: "question.placePartition",
    skillId: "MQ-038",
    params: {},
    answer: { kind: "text", value: 5 },
  };
  assert.deepEqual(clone(engine.gradeAnswer(question, { action: "build", value: "5" })), {
    correct: true,
    valid: true,
    canonical: '{"action":"build","value":"5"}',
  });
}

export function assertResponseFallbackContract(engine) {
  const nullBoundary = [
    clone(engine.createResponseState(null)),
    clone(engine.serializeResponse(null, null)),
    engine.isResponseComplete(null, null),
  ];
  assert.deepEqual(nullBoundary, [{}, {}, false]);

  const fallbackStates = [
    clone(engine.createResponseState({ inputMethod: "SHARE_DEAL" })),
    clone(engine.createResponseState({
      inputMethod: "GROUP_BUILD",
      params: { a: 2 },
      answer: { value: 3 },
    })),
    clone(engine.createResponseState({
      inputMethod: "GRID_ROUTE",
      params: { start: { x: 0, y: 0 } },
    })),
    engine.isResponseComplete({
      inputMethod: "GRID_ROUTE",
      params: { start: "A1", moves: [] },
    }, {}),
  ];
  assert.deepEqual(fallbackStates, [
    { recipients: {}, pool: [], nextRecipient: 1, history: [] },
    {
      recipients: { g1: [], g2: [] },
      pool: ["item0", "item1", "item2"],
      nextRecipient: 1,
      history: [],
    },
    { moves: [], end: { x: 1, y: 1 } },
    false,
  ]);

  for (const inputMethod of ["toString", "constructor", "__proto__"]) {
    const grade = engine.gradeAnswer({
      inputMethod,
      inputClass: "CONSTRUCTION",
      answer: { kind: "text", value: "yes" },
    }, { value: "yes" });
    assert.equal(Object.isFrozen(grade), true, `${inputMethod} fallback grade must remain frozen`);
    assert.deepEqual(clone(grade), { correct: true, valid: true, canonical: "yes" });
  }

  assertFractionGradeFallback(engine);
  assertPairGradeFallback(engine);
  assertNumericTextPlaceGrade(engine);
}

function responsePolicyHarness(engine, { findActiveQuestion, stateWithUi, baseUi }) {
  const fixture = (method, promptId = null) => findActiveQuestion(
    engine,
    (question) => question.inputMethod === method
      && (!promptId || question.semanticPromptStringId === promptId),
  );
  const stateFor = (question, response) => stateWithUi(
    engine,
    baseUi(question, { responseState: response }),
  );
  const accept = (question, label, change) => {
    const response = clone(engine.createResponseState(question));
    change(response);
    assert.equal(engine.validateState(stateFor(question, response)), null, label);
  };
  const reject = (question, label, change) => {
    const response = clone(engine.createResponseState(question));
    change(response);
    assert.equal(engine.validateState(stateFor(question, response)), "Invalid active session.", label);
  };
  return Object.freeze({ fixture, accept, reject });
}

function assertStrategyAndPairPolicyBoundaries({ fixture, accept, reject }) {
  const strategy = fixture("STRATEGY_BUILD");
  reject(strategy, "STRATEGY_BUILD/work list", (response) => {
    response.work = {};
  });
  reject(strategy, "STRATEGY_BUILD/work before strategy", (response) => {
    response.work = ["invented-step"];
  });
  const expression = fixture("EXPRESSION_BUILD");
  reject(expression, "EXPRESSION_BUILD/text limit", (response) => {
    response.value = "1".repeat(129);
  });

  const pair = fixture("PAIR_LINK", "question.pairObjects");
  reject(pair, "PAIR_LINK/link count", (response) => {
    const count = Math.min(Number(pair.params.leftCount), Number(pair.params.rightCount));
    response.links = Array.from({ length: count + 1 }, (_, index) => [`a${index}`, `b${index}`]);
  });
  reject(pair, "PAIR_LINK/linked pending endpoint", (response) => {
    response.links = [["a0", "b0"]];
    response.pending = "a0";
  });
  accept(pair, "PAIR_LINK/unlinked pending endpoint", (response) => {
    response.pending = "a0";
  });

  const comparison = fixture("PAIR_LINK", "question.compare");
  accept(comparison, "PAIR_LINK/comparison response", (response) => {
    assert.equal(response.relation, "");
  });
  reject(comparison, "PAIR_LINK/comparison relation", (response) => {
    response.relation = "invented";
  });
}

function assertSortAndTokenPolicyBoundaries({ fixture, accept, reject }) {
  const sort = fixture("SORT_BINS");
  reject(sort, "SORT_BINS/unplaced history item", (response) => {
    response.history = ["i0"];
  });
  reject(sort, "SORT_BINS/outside pending item", (response) => {
    response.pending = "i999";
  });
  accept(sort, "SORT_BINS/placed history item", (response) => {
    const categories = sort.modelDescriptor?.values?.categories;
    const binId = Array.isArray(categories) && categories.length ? String(categories[0].id) : "matches";
    response.placements = { i0: binId };
    response.history = ["i0"];
  });
  accept(sort, "SORT_BINS/unplaced pending item", (response) => {
    response.pending = "i0";
  });

  for (const method of ["SHARE_DEAL", "GROUP_BUILD"]) {
    const question = fixture(method);
    accept(question, `${method}/optional history`, (response) => {
      delete response.history;
    });
    reject(question, `${method}/cursor above range`, (response) => {
      response.nextRecipient = Object.keys(response.recipients).length + 1;
    });
    reject(question, `${method}/fractional cursor`, (response) => {
      response.nextRecipient = 1.5;
    });
    reject(question, `${method}/non-list recipient`, (response) => {
      response.recipients[Object.keys(response.recipients)[0]] = {};
    });
    reject(question, `${method}/history length`, (response) => {
      const recipient = Object.keys(response.recipients)[0];
      response.history = Array.from(
        { length: response.pool.length + 1 },
        () => [recipient, "item0"],
      );
    });
  }
}

function assertFractionSlotRoutePolicyBoundaries({ fixture, accept, reject }) {
  const fixedFraction = fixture("FRACTION_PARTITION", "question.fraction");
  accept(fixedFraction, "FRACTION_PARTITION/fixed denominator", (response) => {
    assert.deepEqual(response.denominatorChoices, []);
  });
  const equivalentFraction = fixture("FRACTION_PARTITION", "question.fractionEquivalent");
  accept(equivalentFraction, "FRACTION_PARTITION/equivalent choices", (response) => {
    assert.ok(response.denominatorChoices.length > 0);
  });
  reject(fixedFraction, "FRACTION_PARTITION/fractional denominator", (response) => {
    response.denominator = 2.5;
  });
  reject(fixedFraction, "FRACTION_PARTITION/non-list templates", (response) => {
    response.templateChoices = {};
  });
  reject(fixedFraction, "FRACTION_PARTITION/non-list shading", (response) => {
    response.shaded = {};
  });

  const slot = fixture("SLOT_COMPOSER");
  reject(slot, "SLOT_COMPOSER/blank token", (response) => {
    response.slots = [""];
  });
  const route = fixture("GRID_ROUTE");
  reject(route, "GRID_ROUTE/move history limit", (response) => {
    response.moves = Array.from({ length: 501 }, () => "U");
  });
  reject(route, "GRID_ROUTE/end object", (response) => {
    response.end = [];
  });
}

function assertScalarFeedbackPersistence({ engine, findActiveQuestion, stateWithUi, baseUi }) {
  const question = findActiveQuestion(
    engine,
    (candidate) => candidate.inputClass === "CONSTRUCTION" && candidate.inputMethod === "NUMBER_PAD",
  );
  const entry = String(question.answer.value);
  const attempt = engine.submitAnswer(question, entry, {
    promptFinishedAt: 1_000,
    submittedAt: 4_000,
    manipulationMs: 100,
    replayMs: 100,
    idleMs: 0,
    sessionId: "coverage-session",
    playDay: 22_000,
  });
  const saved = stateWithUi(engine, baseUi(question, {
    phase: "feedback",
    entry,
    feedback: engine.feedbackLine(attempt, 0, []),
    lastAttempt: attempt,
    attemptCommitted: false,
  }));
  assert.equal(engine.validateState(saved), null);
  const hostile = clone(saved);
  hostile.activeSession.uiState.entry = String(Number(entry) + 1);
  assert.match(engine.validateState(hostile), /active session/iu);
}

function assertMandatorySecondExposurePersistence({ engine, findActiveQuestion, stateWithUi, baseUi }) {
  const question = findActiveQuestion(
    engine,
    (candidate, skill) => candidate.eligibleQuestionOrdinal === 0
      && skill.phases.filter((phase) => ["C", "P", "A"].includes(phase)).length >= 2,
  );
  const state = stateWithUi(engine, baseUi(question));
  const active = state.activeSession;
  const skill = engine.SKILL_BY_ID[question.skillId];
  const phases = skill.phases.filter((phase) => ["C", "P", "A"].includes(phase));
  const representation = ({ C: "CONCRETE", P: "PICTORIAL", A: "ABSTRACT" })[phases[1]];
  active.baseSlotCount = 1;
  active.effectivePracticeLimit = 2;
  active.effectivePlannedCount = 2;
  active.queue.push({
    ordinal: 1,
    baseOrdinal: null,
    skillId: question.skillId,
    tier: "EASY",
    representation,
    scheduledReview: false,
    coldTest: false,
    choicePosition: false,
    mandatorySecondExposure: true,
    obligation: "SAME_SESSION_SECOND",
    preview: false,
  });
  assert.equal(engine.validateState(state), null);
  const hostile = clone(state);
  hostile.activeSession.queue[1].baseOrdinal = 0;
  assert.match(engine.validateState(hostile), /active session/iu);
}

function assertCapstoneFeedbackCheckpoint({ engine, findActiveQuestion, stateWithUi, baseUi }) {
  const source = findActiveQuestion(engine, (candidate) => candidate.inputClass === "SELECTION");
  const question = engine.makeQuestion({
    skillId: source.skillId,
    tier: "EASY",
    representation: "PICTORIAL",
    seed: source.seed,
    ordinal: 1_001,
    eligibleQuestionOrdinal: 0,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: source.theme,
    scaffolded: true,
    capstone: true,
  });
  const selected = question.options[question.correctIndex].optionId;
  const attempt = engine.submitAnswer(question, { optionId: selected }, {
    promptFinishedAt: 1_000,
    submittedAt: 4_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    sessionId: "coverage-session",
    playDay: 22_000,
  });
  const saved = stateWithUi(engine, baseUi(question, {
    screen: "capstone",
    phase: "feedback",
    selected,
    feedback: engine.feedbackLine(attempt, 0, []),
    lastAttempt: attempt,
    attemptCommitted: false,
    capstoneSubmitted: true,
  }));
  assert.equal(engine.validateState(saved), null, "submitted capstone feedback must resume");
  const hostile = clone(saved);
  hostile.activeSession.uiState.capstoneSubmitted = false;
  assert.equal(engine.validateState(hostile), "Invalid active session.");
}

function assertAssistedInvalidTelemetryFeedback({ engine, findActiveQuestion, stateWithUi, baseUi }) {
  const question = findActiveQuestion(
    engine,
    (candidate) => candidate.eligibleQuestionOrdinal === 0 && candidate.inputClass === "SELECTION",
  );
  const selected = question.options[question.correctIndex].optionId;
  const attempt = engine.submitAnswer(question, { optionId: selected }, {
    promptFinishedAt: 4_000,
    submittedAt: 1_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    hintUsed: true,
    modelUsed: true,
    sessionId: "coverage-session",
    playDay: 22_000,
  });
  assert.equal(attempt.feedbackClass, "CORRECT_WITH_STRUGGLE");
  assert.equal(attempt.evidenceClass, "NON_EVIDENCE");
  assert.equal(attempt.validTelemetry, false);
  assert.equal(attempt.guessingLike, true);
  assert.equal(attempt.elapsed, 0);
  const saved = stateWithUi(engine, baseUi(question, {
    phase: "feedback",
    selected,
    modelTouched: true,
    hintUsed: true,
    feedback: engine.feedbackLine(attempt, 0, []),
    lastAttempt: attempt,
    attemptCommitted: false,
  }));
  assert.equal(engine.validateState(saved), null);
  const hostile = clone(saved);
  hostile.activeSession.uiState.lastAttempt.elapsed = 1;
  assert.equal(engine.validateState(hostile), "Invalid active session.");
}

export function registerResponsePolicyCoverageTests({
  test,
  sharedEngineSuite,
  findActiveQuestion,
  stateWithUi,
  baseUi,
}) {
  test("response policy helpers cover valid progress and hostile boundary variants", async (t) => {
    const { engine } = await sharedEngineSuite();
    const harness = responsePolicyHarness(engine, { findActiveQuestion, stateWithUi, baseUi });
    await t.test("strategy and pair progress boundaries", () => assertStrategyAndPairPolicyBoundaries(harness));
    await t.test("sort and token-history progress boundaries", () => assertSortAndTokenPolicyBoundaries(harness));
    await t.test("fraction, slot, and route boundaries", () => assertFractionSlotRoutePolicyBoundaries(harness));
    await t.test("scalar feedback binds its saved entry", () => assertScalarFeedbackPersistence({
      engine, findActiveQuestion, stateWithUi, baseUi,
    }));
    await t.test("mandatory second exposure stays canonical", () => assertMandatorySecondExposurePersistence({
      engine, findActiveQuestion, stateWithUi, baseUi,
    }));
    await t.test("capstone feedback retains its submitted checkpoint", () => assertCapstoneFeedbackCheckpoint({
      engine, findActiveQuestion, stateWithUi, baseUi,
    }));
    await t.test("assisted invalid telemetry retains zero elapsed", () => assertAssistedInvalidTelemetryFeedback({
      engine, findActiveQuestion, stateWithUi, baseUi,
    }));
  });
}
