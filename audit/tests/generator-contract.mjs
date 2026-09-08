import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";

function assertCountSetActivity({ engine, question, values }) {
  const count = Number(values.items[0].magnitude);
  assert.equal(values.data.stimulus, true);
  assert.equal(count, Number(question.answer.value));
  const response = question.inputMethod === "COUNT_TOUCH"
    ? { touched: Array.from({ length: count }, (_, index) => `i${index}`), count: String(count) }
    : { optionId: question.options.find((option) => String(option.value) === String(count))?.optionId };
  assert.equal(engine.gradeAnswer(question, response).correct, true);
}

function assertPatternNextActivity({ engine, question, values }) {
  const sequence = String(question.params.pattern).split(/\s+/u).filter(Boolean);
  const unit = String(question.params.unit).split(/\s+/u).filter(Boolean);
  assert.deepEqual(sequence, Array.from({ length: sequence.length / unit.length }, () => unit).flat());
  assert.equal(question.answer.value, unit[sequence.length % unit.length]);
  assert.equal(values.data.stimulus, true);
  assert.equal(Object.hasOwn(values, "strategy"), false);
  assert.equal(engine.gradeAnswer(question, { tokens: [question.answer.value] }).correct, true);
}

function assertNumberFrameActivity({ question, values }) {
  const frame = values.frames[0];
  assert.equal(frame.capacity, 10);
  assert.equal(frame.value, Number(question.answer.value));
}

function assertMakeTenActivity({ question, values }) {
  const frame = values.frames[0];
  assert.equal(frame.value + Number(question.answer.value), 10);
  assert.equal(frame.capacity, 10);
  assert.equal(Object.hasOwn(values, "strategy"), false, "cold stimulus must not expose the missing addend");
  assert.equal(Object.hasOwn(frame, "label"), false, "visible labels must come only from registered child strings");
}

function assertHiddenPartActivity({ question, values }) {
  const frame = values.frames[0];
  assert.equal(frame.value + frame.coveredCount, 10);
  assert.equal(frame.coveredCount, Number(question.answer.value));
  assert.equal(Object.hasOwn(values, "strategy"), false, "covered frame must not expose the hidden count as an equation");
  assert.equal(Object.hasOwn(frame, "label"), false, "visible labels must come only from registered child strings");
}

function assertNumericExtremaActivity({ question }) {
  const shown = [question.params.a, question.params.b, question.params.c].map(Number);
  const expected = question.semanticPromptStringId === "question.numberLeast" ? Math.min(...shown) : Math.max(...shown);
  assert.equal(Number(question.answer.value), expected);
  assert.equal(new Set(shown).size, 3);
}

const activityChecks = new Map([
  ["question.countSet", assertCountSetActivity],
  ["question.patternVisualNext", assertPatternNextActivity],
  ["question.frameNumber", assertNumberFrameActivity],
  ["question.makeTenFrame", assertMakeTenActivity],
  ["question.hiddenPart", assertHiddenPartActivity],
  ["question.numberOrder", assertNumericExtremaActivity],
  ["question.numberLeast", assertNumericExtremaActivity],
]);

const activityOrdinals = Object.entries({
  "MQ-002": [0],
  "MQ-004": [0, 1, 2],
  "MQ-008": [0],
  "MQ-019": [0, 1],
  "MQ-023": [0, 1, 2],
  "MQ-025": [0, 1, 2],
});

function* activityRequests() {
  for (let seed = 1; seed <= 12; seed += 1) {
    for (const [skillId, ordinals] of activityOrdinals) {
      for (const ordinal of ordinals) yield { skillId, seed, ordinal, eligibleQuestionOrdinal: ordinal, theme: "ocean", representation: "PICTORIAL" };
    }
  }
}

function assertUniqueActivityChoice(engine, question) {
  if (question.inputClass === "SELECTION") {
    const correct = question.options.filter((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
    assert.equal(correct.length, 1, `${question.questionId}: activity must have exactly one correct choice`);
  }
}

export function assertEarlyActivityContracts(engine) {
  assert.equal(engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION, "question-generator-v6");
  assert.equal(engine.CONSTANTS.ACTIVE_UI_VERSION, 3);
  const seen = new Set();
  for (const args of activityRequests()) {
    const question = engine.makeQuestion(args);
    seen.add(question.semanticPromptStringId);
    const values = question.modelDescriptor.values;
    activityChecks.get(question.semanticPromptStringId)?.({ engine, question, values });
    assertUniqueActivityChoice(engine, question);
  }
  for (const id of ["question.countSet", "question.patternVisualNext", "question.frameNumber", "question.makeTenFrame", "question.hiddenPart", "question.numberOrder", "question.numberLeast"]) {
    assert.equal(seen.has(id), true, `deterministic activity cycle omitted ${id}`);
  }
}

const representations = ["CONCRETE", "PICTORIAL", "ABSTRACT"];
const themes = ["ocean", "forest", "space"];
const seeds = [0, 1, 0x43504131, 0xffffffff];

const structuredResponseMethods = new Set([
  "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
  "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
  "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
  "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
  "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
]);

function* skillRequests(skill) {
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
          yield args;
        }
      }
    }
  }
}

function assertGeneratedCase(engine, skill, args) {
  const { tier, representation, seed, ordinal, theme } = args;
  const taskTypes = skill.constraints.taskTypes;
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
  return question;
}

function assertGeneratedResponse(engine, question) {
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
  } else if (!structuredResponseMethods.has(question.inputMethod)) {
    assert.equal(engine.gradeAnswer(question, question.answer.value).correct, true);
  } else {
    const emptyState = engine.createResponseState(question);
    const serialized = engine.serializeResponse(question, emptyState);
    assert.equal(typeof serialized, "object");
    assert.equal(Array.isArray(serialized), false);
  }
}

function assertWorldMathInvariant(engine, skill) {
  const taskTypes = skill.constraints.taskTypes;
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

export function assertGeneratorRepresentationMatrix(engine) {
  let generated = 0;
  for (const skill of engine.SKILLS) {
    for (const args of skillRequests(skill)) {
      const question = assertGeneratedCase(engine, skill, args);
      assertGeneratedResponse(engine, question);
      generated += 1;
    }
    assertWorldMathInvariant(engine, skill);
  }
  assert.equal(generated > engine.SKILLS.length * 3 * 2, true);
}

function assertGenerationDomains(engine) {
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
}

function generatorContractContext(engine, findQuestion) {
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
  return { engine, selection, construction, direct, sourceVisual, angle, pair, route, categoricalSort, additionWithCap };
}

function expectQuestionReason(context, fixture, reason, mutate) {
  const hostile = clone(context[fixture]);
  mutate(hostile, context);
  const errors = clone(context.engine.questionContractErrors(hostile));
  assert.ok(errors.includes(reason), `${reason}: ${errors.join(", ")}`);
  assert.equal(context.engine.validateQuestionContract(hostile).valid, false);
}

const questionContractMutations = [
  ["selection", "invalid-answer-schema", (question) => { question.answer.kind = "imaginary"; }],
  ["selection", "undeclared-task-type", (question) => { question.taskType = "undeclared-task"; }],
  ["selection", "invalid-question-domain", (question) => { question.seed = -1; }],
  ["selection", "input-method-class-mismatch", (question) => {
    question.inputMethod = question.inputClass === "SELECTION" ? "NUMBER_PAD" : "PICTURE_CHOICE";
  }],
  ["direct", "objective-input-mismatch", (question) => { question.inputMethod = "NUMBER_PAD"; }],
  ["sourceVisual", "missing-source-stimulus", (question) => {
    question.modelDescriptor.type = "";
    question.modelDescriptor.values = {};
  }],
  ["sourceVisual", "answer-bearing-stimulus", (question) => {
    question.modelDescriptor.values = { ...question.modelDescriptor.values, result: "revealed" };
  }],
  ["selection", "prompt-identity", (question) => { question.prompt += " changed"; }],
  ["selection", "model-instruction-identity", (question) => {
    question.modelDescriptor.instruction += " changed";
  }],
  ["selection", "duplicate-options", (question) => {
    question.options[1].optionId = question.options[0].optionId;
  }],
  ["selection", "non-unique-mathematical-answer", (question) => {
    const wrongIndex = question.options.findIndex((option, index) => index !== question.correctIndex);
    question.options[wrongIndex].value = question.options[question.correctIndex].value;
    question.options[wrongIndex].label = `equivalent ${question.options[wrongIndex].label}`;
  }],
  ["construction", "construction-has-options", (question) => {
    question.options = [{ optionId: "forged", label: "forged", value: question.answer.value }];
    question.correctIndex = 0;
  }],
  ["selection", "generated-grammar", (question) => { question.prompt = "There are 1 lines."; }],
  ["angle", "angle-tolerance-contract", (question, { selection }) => {
    question.skillId = selection.skillId;
  }],
  ["additionWithCap", "addend-max", (question, { engine }) => {
    const cap = Number(engine.SKILL_BY_ID[question.skillId].constraints.addendMax);
    question.params.a = cap + 1;
  }],
  ["pair", "pairing-constraint", (question) => { question.params.leftCount = 0; }],
  ["route", "grid-route-contract", (question) => {
    question.answer.value = question.semanticPromptStringId === "question.coordinateMove" ? "(20,20)" : "T20";
  }],
  ["categoricalSort", "categorical-sort-contract", (question) => {
    question.modelDescriptor.values.categories[1].id = question.modelDescriptor.values.categories[0].id;
  }],
  ["selection", "sample-identity", (question) => { question.sampleKey += "|forged"; }],
];

function assertMissingQuestionContracts({ engine, selection }) {
  assert.deepEqual(clone(engine.questionContractErrors(null)), ["unknown-skill"]);
  assert.deepEqual(clone(engine.questionContractErrors({ skillId: "not-a-skill" })), ["unknown-skill"]);
  assert.deepEqual(
    clone(engine.questionContractErrors({ skillId: selection.skillId, answer: null })),
    ["invalid-question-shape"],
  );
}

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

function directObjectiveFixture(engine, skillId, inputMethod) {
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
  return fixture;
}

function assertDirectObjective(engine, skillId, inputMethod) {
  const fixture = directObjectiveFixture(engine, skillId, inputMethod);
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

function assertNeutralWorldFallback(engine) {
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
}

export async function registerGeneratorBoundaryTests(t, engine, findQuestion) {
  await t.test("GEN-API rejects invalid public generation domains", () => assertGenerationDomains(engine));
  await t.test("QUESTION-CONTRACT reports each externally observable contract failure", () => {
    const context = generatorContractContext(engine, findQuestion);
    assertMissingQuestionContracts(context);
    for (const [fixture, reason, mutate] of questionContractMutations) expectQuestionReason(context, fixture, reason, mutate);
    for (const [skillId, inputMethod] of directMethods) assertDirectObjective(engine, skillId, inputMethod);
    assertNeutralWorldFallback(engine);
  });
}
