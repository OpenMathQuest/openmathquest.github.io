import { descriptorTruth } from "./visual-model-oracle.mjs";
import { attributeItemMatchesRule, attributeItemValue, coinValueCents, descriptorMagnitude, exactArrayLength, exactNumber, facetSpan, finite, nonemptyArray, normalized, object } from "./visual-model-values.mjs";

"use strict";

const LAB_SEED = 1297175628;
const TIERS = Object.freeze(["EASY", "HARD/TARGET"]);
const sampleOrdinals = (skill) => {
  const declared = Array.isArray(skill?.taskTypes)
    ? skill.taskTypes.length
    : Array.isArray(skill?.constraints?.taskTypes) ? skill.constraints.taskTypes.length : 0;
  const constraints = skill?.constraints || {};
  const longestFacet = Math.max(
    1,
    Number(constraints.decimalPlacesMax) || 0,
    ...["remainderInterpretations", "formats"].map((key) => Array.isArray(constraints[key]) ? constraints[key].length : 0),
  );
  const volumeFacetSpan = ["representations", "volumeUnits", "solids"]
    .map((key) => facetSpan(constraints[key]))
    .reduce((product, length) => product * length, 1);
  const sortFacetSpan = facetSpan(constraints.attributes) * facetSpan(constraints.categoryCount);
  return Array.from({ length: Math.max(3, declared * Math.max(longestFacet, volumeFacetSpan, sortFacetSpan)) }, (_, index) => index);
};

const result = (pass, details) => Object.freeze({
  pass: Boolean(pass),
  details: typeof details === "string" ? details : JSON.stringify(details),
});
const slug = (value) => normalized(value).toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-|-$/gu, "");

function uniqueGradedChoice(engine, question) {
  if (question?.inputClass !== "SELECTION" || !Array.isArray(question.options)) return false;
  const labels = question.options.map((option) => normalized(option.label));
  const graded = question.options.filter((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
  return question.options.length >= 2 && new Set(labels).size === labels.length && graded.length === 1;
}

const STRUCTURED_RESPONSE_METHODS = new Set([
  "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
  "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
  "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
  "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
  "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
]);
const RENDERER_CAPABLE_METHODS = Object.freeze([
  "ACTION_SCENE", "ANGLE_MEASURE", "AREA_DECOMPOSE", "BAR_MODEL", "BOND_SPLIT",
  "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY",
  "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
  "LANDMARK_PLACE", "MEASURE_OBJECT", "METRIC_SCALE", "MIXED_NUMBER_ENTRY", "NUMBER_BOND",
  "NUMBER_CHOICE", "NUMBER_LINE", "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD",
  "PICTURE_CHOICE", "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD",
  "SYMMETRY_BUILD", "TEN_FRAME", "VOLUME_INSPECT",
]);
const RELEASE_REACHABLE_METHODS = Object.freeze([
  "ACTION_SCENE", "ANGLE_MEASURE", "AREA_DECOMPOSE", "BAR_MODEL", "BOND_SPLIT",
  "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY",
  "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
  "LANDMARK_PLACE", "MEASURE_OBJECT", "METRIC_SCALE", "MIXED_NUMBER_ENTRY", "NUMBER_LINE",
  "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
  "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
  "TEN_FRAME", "VOLUME_INSPECT",
]);
const PLACEMENT_REACHABLE_METHODS = Object.freeze([
  "ACTION_SCENE", "BAR_MODEL", "BOND_SPLIT", "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH",
  "EXPRESSION_BUILD", "FACT_FAMILY", "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD",
  "GRID_ROUTE", "GROUP_BUILD", "LANDMARK_PLACE", "MEASURE_OBJECT", "MIXED_NUMBER_ENTRY",
  "NUMBER_LINE", "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
  "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
  "TEN_FRAME",
]);
const PRACTICE_TOKEN_VISUAL_ORACLE = Object.freeze([
  Object.freeze({ tokenId: "single-dot", value: "5\u00a2" }),
  Object.freeze({ tokenId: "double-stripe", value: "10\u00a2" }),
  Object.freeze({ tokenId: "triangle-dots", value: "25\u00a2" }),
  Object.freeze({ tokenId: "cross-bars", value: "$1" }),
  Object.freeze({ tokenId: "ring-diamond", value: "$2" }),
]);
const PRACTICE_TOKEN_VISUAL_VIEWPORTS = Object.freeze([
  Object.freeze({ viewport: "desktop", width: 1366, height: 768 }),
  Object.freeze({ viewport: "tablet-portrait", width: 820, height: 1180 }),
  Object.freeze({ viewport: "ipad-landscape-large", width: 1180, height: 820 }),
  Object.freeze({ viewport: "ipad-landscape-standard", width: 1024, height: 768 }),
  Object.freeze({ viewport: "phone", width: 390, height: 844 }),
]);
const PRACTICE_TOKEN_VISUAL_STATES = Object.freeze(["ordinary", "tutorial-notice", "incorrect"]);

const indexedItems = (prefix, count) => Array.from(
  { length: Math.max(0, Number(count) || 0) },
  (_, index) => `${prefix}${index}`,
);

const STRATEGY_ANSWER_BUILDERS = Object.freeze({
  "MQ-040": ({ question, left, right }) => {
    const strategy = ({ "add-by-counting-on": "count-on", "add-by-making-ten": "make-ten", "add-by-known-bond": "known-bond" })[question.taskType];
    let work;
    if (strategy === "count-on") work = Array.from({ length: Math.min(left, right) }, (_, index) => String(Math.max(left, right) + index + 1));
    else if (strategy === "make-ten") work = [String(10 - left), String(right - (10 - left))];
    else work = [String(left), String(right)];
    return { strategy, work, value: left + right };
  },
  "MQ-041": ({ question, left, right }) => {
    const strategy = ({ "subtract-by-counting-back": "count-back", "subtract-by-counting-up": "count-up", "subtract-by-known-bond": "known-bond" })[question.taskType];
    const value = left - right;
    let work;
    if (strategy === "count-back") work = Array.from({ length: right }, (_, index) => String(left - index - 1));
    else if (strategy === "count-up") work = Array.from({ length: left - right }, (_, index) => String(right + index + 1));
    else work = [String(right), String(value)];
    return { strategy, work, value };
  },
  "MQ-079": ({ question, left, right }) => {
    const strategy = ["partition", "array", "written layout"][Number(question.ordinal) % 3];
    const value = left * right;
    const operands = [left, right], twoDigit = operands.find((number) => number >= 10), oneDigit = operands.find((number) => number <= 9);
    const tens = Math.floor(twoDigit / 10) * 10, ones = twoDigit % 10;
    let work;
    if (strategy === "array") work = [String(twoDigit), String(oneDigit)];
    else if (strategy === "partition") work = [String(tens), String(ones), String(tens * oneDigit), String(ones * oneDigit)];
    else {
      const onesProduct = ones * oneDigit;
      work = [String(onesProduct), String(Math.floor(onesProduct / 10)), String(Math.floor(twoDigit / 10) * oneDigit + Math.floor(onesProduct / 10))];
    }
    return { strategy, work, value };
  },
  "MQ-095": ({ question, left, right }) => {
    const value = question.taskType === "addition" ? left + right : left - right;
    const chunks = String(Math.abs(right)).split("").map((digit, index, digits) => Number(digit) * 10 ** (digits.length - index - 1)).filter(Boolean);
    let running = left;
    const work = chunks.map((chunk) => String(running = question.taskType === "addition" ? running + chunk : running - chunk));
    return { strategy: "mental", work, value };
  },
  "MQ-097": ({ expression }) => {
    if (!expression) return { strategy: null, work: [], value: undefined };
    const strategy = parityStrategy(expression);
    const a = Number(expression[1]), b = Number(expression[3]);
    const result = expression[2] === "+" ? a + b : expression[2] === "−" ? a - b : a * b;
    const value = result % 2 === 0 ? "even" : "odd";
    const work = [Number(expression[1]) % 2 ? "odd" : "even", Number(expression[3]) % 2 ? "odd" : "even"];
    return { strategy, work, value };
  },
  "MQ-101": ({ question, params }) => {
    const value = Number(params.whole) - Number(question.semanticPromptStringId === "question.missingSubtrahend" ? params.result : params.part);
    const work = [String(question.semanticPromptStringId === "question.missingSubtrahend" ? params.result : params.part), String(value)];
    return { strategy: "use subtraction", work, value };
  },
});

function parityStrategy(expression) {
  return expression[2] === "×"
    ? (Number(expression[1]) % 2 === 0 || Number(expression[3]) % 2 === 0 ? "an even factor makes an even product" : "two odd factors make an odd product")
    : (Number(expression[1]) % 2 === Number(expression[3]) % 2 ? "same-parity numbers give an even result" : "different-parity numbers give an odd result");
}

function strategyBuildAnswer(question) {
  const params = question.params || {};
  const left = Number(params.a);
  const right = Number(params.b);
  const expression = String(params.expression || "").match(/^(\d+)\s*([+−×])\s*(\d+)$/u);
  const build = typeof question.skillId === "string" && Object.hasOwn(STRATEGY_ANSWER_BUILDERS, question.skillId) && STRATEGY_ANSWER_BUILDERS[question.skillId];
  return build ? build({ question, params, left, right, expression }) : { strategy: null, work: [], value: undefined };
}

const VISUAL_RESPONSE_BUILDERS = Object.freeze({
  COUNT_TOUCH(engine, question, state) {
    state.touched = indexedItems("i", Number(question.answer.value));
    state.count = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  ORDER_BUILD(engine, question, state, params) {
    state.order = [Number(params.before), Number(question.answer.value), Number(params.after)];
    return engine.serializeResponse(question, state);
  },
  PLACE_VALUE_BUILD(engine, question, state, params) {
    state.action = Array.isArray(params.strategyChoices) && params.strategyChoices.length
      ? String(params.strategy ?? params.strategyChoices[0])
      : question.semanticPromptStringId === "question.renamePlace" ? "trade"
        : question.semanticPromptStringId === "question.scalePlace" ? "shift"
          : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId)
            ? "partition" : "build";
    state.value = Array.isArray(params.responseValueChoices) && params.responseValueChoices.length
      ? String(question.answer.value)
      : Number(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  STRATEGY_BUILD(engine, question) {
    return strategyBuildAnswer(question);
  },
  COIN_BUILD(engine, question, state, params) {
    state.coins = Array.from({ length: Number(question.answer.value) }, () => coinValueCents(params.secondCoin));
    return engine.serializeResponse(question, state);
  },
  SYMMETRY_BUILD(engine, question, state, params) {
    state.lines = Array.isArray(params.requiredLineIds)
      ? [...params.requiredLineIds]
      : Array.from({ length: Number(question.answer.value) }, (_, index) => `line${index + 1}`);
    return engine.serializeResponse(question, state);
  },
  EXPRESSION_BUILD(engine, question, state, params) {
    state.rule = String(params.rule);
    state.value = Number(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  PAIR_LINK(engine, question, state, params) {
    state.links = Array.from(
      { length: Math.min(Number(params.leftCount ?? params.count), Number(params.rightCount ?? params.count)) },
      (_, index) => [`a${index}`, `b${index}`],
    );
    if (question.semanticPromptStringId === "question.compare") {
      state.relation = String(question.answer.value);
    }
    return engine.serializeResponse(question, state);
  },
  SORT_BINS(engine, question, state) {
    const values = question.modelDescriptor.values;
    const categories = Array.isArray(values.categories) ? values.categories : [];
    if (categories.length) {
      state.placements = Object.fromEntries((values.items || []).map((item, index) => {
        const itemValue = attributeItemValue(item, values.rule?.attribute);
        const category = categories.find((candidate) => normalized(candidate.value).toLowerCase() === itemValue);
        return [`i${index}`, normalized(category?.id)];
      }));
    } else {
      const targets = new Set((values.items || [])
        .map((item, index) => attributeItemMatchesRule(item, values.rule) ? index : -1)
        .filter((index) => index >= 0));
      state.placements = Object.fromEntries(
        (values.items || []).map((_, index) => [`i${index}`, targets.has(index) ? "matches" : "other"]),
      );
    }
    return engine.serializeResponse(question, state);
  },
  SHARE_DEAL(engine, question, state, params) {
    const recipients = Number(params.recipients);
    const total = Number(params.total);
    const remainder = total % recipients;
    state.history = [];
    let next = 1;
    while (state.pool.length > remainder) {
      const recipient = `r${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history.push([recipient, item]);
      next = next % recipients + 1;
    }
    return engine.serializeResponse(question, state);
  },
  GROUP_BUILD(engine, question, state, params) {
    const groups = Number(params.groups ?? params.a);
    state.history = [];
    let next = 1;
    while (state.pool.length) {
      const recipient = `g${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history.push([recipient, item]);
      next = next % groups + 1;
    }
    return engine.serializeResponse(question, state);
  },
  BOND_SPLIT(engine, question, state, params) {
    const counts = question.semanticPromptStringId === "question.secondPartition"
      ? [Number(params.secondA), Number(question.answer.value)]
      : [Number(params.part), Number(question.answer.value)];
    for (let index = 0; index < counts[0]; index += 1) {
      const item = state.pool.shift();
      state.groups.g1.push(item);
      state.history.push(["g1", item]);
    }
    for (let index = 0; index < counts[1]; index += 1) {
      const item = state.pool.shift();
      state.groups.g2.push(item);
      state.history.push(["g2", item]);
    }
    return engine.serializeResponse(question, state);
  },
  PATTERN_BUILD(engine, question, state) {
    state.tokens = String(question.answer.value).trim().split(/\s+/u).filter(Boolean);
    return engine.serializeResponse(question, state);
  },
  LANDMARK_PLACE(engine, question, state) {
    state.relation = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  SLOT_COMPOSER(engine, question, state, params) {
    const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
    state.slots = [String(params.a), operation, String(params.b), "=", String(question.answer.value)];
    return engine.serializeResponse(question, state);
  },
  FACT_FAMILY(engine, question, state, params) {
    const a = Number(params.a), b = Number(params.b), whole = Number(params.whole);
    state.selected = params.equationFamily === "multiply-divide"
      ? [`${a}\u00d7${b}=${whole}`, `${b}\u00d7${a}=${whole}`, `${whole}\u00f7${a}=${b}`, `${whole}\u00f7${b}=${a}`]
      : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
    return engine.serializeResponse(question, state);
  },
  GRAPH_BUILD(engine, question, state, params) {
    const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
    state.categories = Object.fromEntries(
      keys.filter((key) => Number.isFinite(Number(params[key]))).map((key) => [key, Number(params[key])]),
    );
    if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = String(question.answer.value);
    if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = Number(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  FRACTION_PARTITION(engine, question, state) {
    const fraction = engine.parseRational(question.answer.value);
    if (!fraction) throw new Error(`${question.skillId}: invalid fraction audit fixture`);
    state.templateId = "vertical";
    const denominator = Number(state.denominator);
    const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
    if (!Number.isInteger(shadedCount)) throw new Error(`${question.skillId}: unreachable fraction audit fixture`);
    state.shaded = indexedItems("part", shadedCount);
    return engine.serializeResponse(question, state);
  },
  GRID_ROUTE(engine, question, state, params) {
    state.moves = Array.isArray(params.moves) ? [...params.moves] : [];
    const coordinate = String(question.answer.value).match(/^\((\d+),(\d+)\)$/u);
    const cell = String(question.answer.value).match(/^([A-Z])(\d+)$/u);
    if (coordinate) state.end = { x: Number(coordinate[1]), y: Number(coordinate[2]) };
    else if (cell) state.end = { x: cell[1].charCodeAt(0) - 64, y: Number(cell[2]) };
    else state.value = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  CLOCK_READ(engine, question, state) {
    const time = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
    if (!time) throw new Error(`${question.skillId}: invalid clock audit fixture`);
    state.hour = Number(time[1]);
    state.minute = Number(time[2]);
    return engine.serializeResponse(question, state);
  },
  METRIC_SCALE(engine, question, state) {
    state.value = Number(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  ANGLE_MEASURE(engine, question, state) {
    state.degrees = Number(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  ACTION_SCENE(engine, question, state, params) {
    state.actions = Array.from(
      { length: Math.abs(Number(params.b)) },
      () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
    );
    state.value = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  MEASURE_OBJECT(engine, question, state, params) {
    state.actions = Array.from({ length: Number(params.count) }, () => "place-unit");
    state.value = String(params.count);
    return engine.serializeResponse(question, state);
  },
  AREA_DECOMPOSE(engine, question, state, params) {
    state.cutIds = ["cut1"];
    state.part0 = String(Number(params.l1) * Number(params.w1));
    state.part1 = String(Number(params.l2) * Number(params.w2));
    state.total = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
  VOLUME_INSPECT(engine, question, state, params) {
    state.viewedLayers = Array.from({ length: Number(params.height) }, (_, index) => index + 1);
    state.method = String(params.method);
    state.value = String(question.answer.value);
    return engine.serializeResponse(question, state);
  },
});

function structuredAnswer(engine, question) {
  const state = engine.createResponseState(question);
  const params = question.params || {};
  const method = question.inputMethod;
  if (typeof method !== "string" || !Object.hasOwn(VISUAL_RESPONSE_BUILDERS, method)) {
    throw new Error(`${question.skillId}: no structured-response audit fixture for ${question.inputMethod}`);
  }
  const build = VISUAL_RESPONSE_BUILDERS[method];
  return build(engine, question, state, params);
}

function correctAnswer(engine, question) {
  if (question?.inputClass === "SELECTION") return correctSelectionAnswer(question);
  return STRUCTURED_RESPONSE_METHODS.has(question?.inputMethod)
    ? structuredAnswer(engine, question)
    : question?.answer?.value;
}

function correctSelectionAnswer(question) {
  const option = question.options?.[question.correctIndex];
  if (!option) throw new Error(`${question?.skillId || "unknown"}: placement selection has no correct option`);
  return { optionId: option.optionId };
}

function placementCases(engine, state, playDay = state.maxSeenPlayDay) {
  const methods = new Map();
  const rows = [];
  for (let desiredLevel = engine.CONSTANTS.LEVEL_MIN; desiredLevel <= engine.CONSTANTS.LEVEL_MAX; desiredLevel += 1) {
    const run = placementLevelRun(engine, state, playDay, desiredLevel, methods);
    rows.push(placementLevelResult(engine, state, run, desiredLevel));
  }
  return {
    rows,
    methods: [...methods.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([inputMethod, witness]) => ({ inputMethod, ...witness })),
  };
}

function placementDraftRecord(engine, state, run, question = engine.placementCurrentQuestion(run)) {
  return JSON.stringify({
    schemaVersion: 4,
    placementDraftGeneration: state.placementDraftGeneration,
    run,
    ui: {
      world: run.theme,
      phase: "question",
      questionId: question.questionId,
      selected: null,
      entry: "",
      fractionParts: { whole: "", numerator: "", denominator: "" },
      modelCells: [],
      responseState: engine.createResponseState(question),
      responseKind: null,
      feedbackKind: null,
    },
  });
}

function inputContract(question) {
  if (question?.inputClass === "SELECTION") return uniqueGradedChoice(this, question);
  if (question?.inputClass !== "CONSTRUCTION") return false;
  const response = correctAnswer(this, question);
  const graded = this.gradeAnswer(question, response);
  const contract = this.validateQuestionContract?.(question);
  return Boolean(graded.correct && graded.valid && (!contract || contract.valid));
}

function constraintSanity(skill, question) {
  const constraints = skill?.constraints || {};
  const values = question?.modelDescriptor?.values || {};
  const issues = [];
  const add = (rule, detail) => issues.push({ rule, detail });
  const within = (value, minimum, maximum, label) => {
    const number = exactNumber(value);
    if (number !== null && (number < minimum || number > maximum)) {
      add(label, { value, minimum, maximum });
    }
  };
  const context = { skill, question, constraints, values, add, within };
  for (const check of QUESTION_CONSTRAINT_CHECKS) check(context);

  return { pass: issues.length === 0, issues };
}

function make(engine, skill, tier = "HARD/TARGET", ordinal = 0) {
  return makeVisualQuestion(engine, skill, tier, ordinal, "ocean");
}

function makeVisualQuestion(engine, skill, tier, ordinal, theme) {
  return engine.makeQuestion({
    skillId: skill.skillId,
    tier,
    representation: skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT",
    seed: LAB_SEED,
    ordinal,
    eligibleQuestionOrdinal: ordinal,
    scheduledReview: false,
    coldTest: false,
    preview: true,
    theme,
    scaffolded: true,
  });
}

function semanticVisualObligationKey(question) {
  const semanticFacet = [
    question.params?.place,
    question.params?.interpretation,
    question.params?.format,
    question.params?.representation,
    question.params?.unit,
    question.params?.solid,
    question.params?.tokenId,
  ].filter(Boolean).join("|");
  return `${question.modelDescriptor.type}|${question.semanticPromptStringId}${semanticFacet ? `|${semanticFacet}` : ""}`;
}

function practiceTokenVisualObligations() {
  return Object.freeze(PRACTICE_TOKEN_VISUAL_ORACLE.flatMap(({ tokenId, value }) => (
    PRACTICE_TOKEN_VISUAL_VIEWPORTS.flatMap(({ viewport, width, height }) => (
      PRACTICE_TOKEN_VISUAL_STATES.map((state) => Object.freeze({
        tokenId,
        value,
        viewport,
        width,
        height,
        state,
      }))
    ))
  )));
}

function practiceTokenVisualRowKey(row) {
  return `${row.tokenId}|${row.value}|${row.viewport}|${row.width}x${row.height}|${row.state}`;
}

function practiceTokenStateTokenContract(state, sourceTokenId, renderedTokenIds, tutorialTokenIds) {
  const governedTokenIds = new Set(PRACTICE_TOKEN_VISUAL_ORACLE.map(({ tokenId }) => tokenId));
  const rendered = [...new Set(renderedTokenIds)];
  const tutorial = [...new Set(tutorialTokenIds)];
  if (state === "tutorial-notice") {
    return tutorial.length === 1
        && governedTokenIds.has(tutorial[0])
        && tutorial[0] !== sourceTokenId
        && rendered.length === 1
        && rendered[0] === tutorial[0];
  }
  return rendered.includes(sourceTokenId)
      && rendered.every((tokenId) => tokenId === sourceTokenId);
}

function* visualSamples(engine) {
  for (const skill of engine.SKILLS) {
    for (const tier of TIERS) {
      for (const ordinal of sampleOrdinals(skill)) yield { skill, tier, ordinal };
    }
  }
}

function generatedCaseMap(engine) {
  const byMethod = new Map();
  const byDescriptor = new Map();
  const bySemanticModel = new Map();
  for (const { skill, tier, ordinal } of visualSamples(engine)) {
    const question = make(engine, skill, tier, ordinal);
    if (!byMethod.has(question.inputMethod)) byMethod.set(question.inputMethod, { skill, tier, ordinal, question });
    if (!byDescriptor.has(question.modelDescriptor.type)) byDescriptor.set(question.modelDescriptor.type, { skill, tier, ordinal, question });
    const semanticKey = semanticVisualObligationKey(question);
    if (!bySemanticModel.has(semanticKey)) bySemanticModel.set(semanticKey, { skill, tier, ordinal, question });
  }
  return { byMethod, byDescriptor, bySemanticModel };
}

function controlContract(wrapper, question) {
  if (!wrapper || wrapper.dataset.inputMethod !== question.inputMethod) return false;
  if (question.inputClass === "SELECTION") return Boolean(wrapper.querySelector('[data-lab-action="select"]'));
  if (STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)) {
    const task = wrapper.querySelector(`[data-response-kind="${CSS.escape(question.inputMethod)}"]`);
    return Boolean(task && task.querySelector('[data-lab-action="response"],[data-response-input]'));
  }
  const selectors = {
    TEN_FRAME: '[data-lab-action="model-cell"]',
    NUMBER_LINE: '[data-lab-action="line-mark"]',
    NUMBER_BOND: '[data-lab-action="key"]',
    NUMBER_PAD: '[data-lab-action="key"]',
    FRACTION_ENTRY: '[data-control-part="numerator"],[data-control-part="denominator"]',
    MIXED_NUMBER_ENTRY: '[data-control-part="whole"],[data-control-part="numerator"],[data-control-part="denominator"]',
    BAR_MODEL: '[data-lab-action="bar-part"]',
  };
  const selector = selectors[question.inputMethod];
  if (!selector) return false;
  const found = wrapper.querySelectorAll(selector).length;
  return question.inputMethod === "FRACTION_ENTRY" ? found >= 2 : question.inputMethod === "MIXED_NUMBER_ENTRY" ? found >= 3 : found >= 1;
}

async function run({
  engine,
  hostWindow,
  hostDocument,
  storageKey,
  childNameKey = "math-quest:child-name:v1",
  placementDraftKey = "math-quest:placement-draft:v1",
  pause,
  settle,
  activeStateFactory,
}) {
  if (typeof settle !== "function") throw new TypeError("Visual regression requires the fail-closed rendered-geometry settlement oracle.");
  const tests = Object.create(null);
  const titles = Object.create(null);
  const profiles = engine?.CURRICULUM_MANIFEST?.generatorProfileEnum;
  const expectedProfiles = Array.isArray(profiles) ? profiles : [];
  auditVisualManifest({ engine, expectedProfiles, titles, tests });
  auditVisualProfiles({ engine, expectedProfiles, titles, tests });
  const allQuestions = generatedVisualQuestions(engine);
  auditVisualCapabilities({ engine, allQuestions, titles, tests });
  auditCanadianMoney({ engine, allQuestions, titles, tests });

  const originalSave = hostWindow.localStorage.getItem(storageKey);
  const originalChildName = hostWindow.localStorage.getItem(childNameKey);
  const originalPlacementDraft = hostWindow.localStorage.getItem(placementDraftKey);
  const visualSession = { frame: null, approvedChecksStarted: false, approvedChecksComplete: false };
  try {
    await auditVisualBrowser({ engine, hostWindow, hostDocument, storageKey, childNameKey, placementDraftKey, pause, settle, activeStateFactory, expectedProfiles, titles, tests, visualSession });
  } catch (error) {
    recordVisualBrowserFailure(error, visualSession, titles, tests);
  } finally {
    if (visualSession.frame) visualSession.frame.remove();
    restoreBrowserValue(hostWindow.localStorage, storageKey, originalSave);
    restoreBrowserValue(hostWindow.localStorage, childNameKey, originalChildName);
    restoreBrowserValue(hostWindow.localStorage, placementDraftKey, originalPlacementDraft);
  }

  return Object.freeze({ titles: Object.freeze(titles), tests: Object.freeze(tests) });
}

const approvedVisualRegression = Object.freeze({
  run,
  correctAnswer,
  placementCases,
  semanticVisualObligationKey,
  practiceTokenVisualObligations,
  practiceTokenVisualOracle: PRACTICE_TOKEN_VISUAL_ORACLE,
  practiceTokenStateTokenContract,
});

function recordVisualBrowserFailure(error, visualSession, titles, tests) {
  const approvedFailure = visualSession.approvedChecksStarted && !visualSession.approvedChecksComplete;
  for (const [id, title] of [
    ["VIS-PLACEMENT-LAYOUT", "Every reachable starting-point control is legible, actionable, and narratable in the child placement wrapper"],
    ["VIS-LAB-CONTROLS", "Parent Test Lab renders every exact release-reachable input method without writing progress"],
    ["VIS-LAB-MODELS", "Every semantically renderable model type appears as derived math in Parent Test Lab"],
    ["VIS-DESKTOP-LAYOUT", "Every generator profile keeps complete Parent Test answers, controls, and focus visible at desktop, tablet, and iPad-landscape sizes"],
    ["VIS-MOBILE-LAYOUT", "Every manifest level is question-first, legible, and actionable at 390×844"],
  ]) {
    titles[id] ||= title;
    if (approvedFailure || !tests[id]) tests[id] = result(false, String(error?.stack || error?.message || error));
  }
}

function restoreBrowserValue(storage, key, value) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

function finiteQuestionConstraint({ add, question }) {
  const walkFinite = (value, path = "question") => {
    if (typeof value === "number" && !Number.isFinite(value)) add("finite-number", { path, value: String(value) });
    else if (Array.isArray(value)) value.forEach((entry, index) => walkFinite(entry, `${path}[${index}]`));
    else if (object(value)) Object.entries(value).forEach(([key, entry]) => walkFinite(entry, `${path}.${key}`));
  };
  walkFinite({
    params: question?.params,
    answer: question?.answer,
    modelDescriptor: question?.modelDescriptor,
  });
}

function answerRangeConstraint({ constraints, question, values, within }) {
  if (finiteRange(constraints.range)) {
    const [minimum, maximum] = constraints.range.map(Number);
    within(question?.answer?.value, minimum, maximum, "range-answer");
    const type = question?.modelDescriptor?.type;
    if (type === "fractionPair") {
      (values.representations || []).forEach((representation, index) => {
        within(representation.value ?? representation.label, minimum, maximum, `range-representation-${index}`);
      });
    }
    if (type === "numberLine") {
      (values.points || []).forEach((point, index) => within(point?.value ?? point, minimum, maximum, `range-point-${index}`));
    }
  }
}

function subjectNumberBoundsConstraint({ constraints, question, skill, values, within }) {
  const subjectNumbers = quantitySubjectNumbers(skill, question, values);
  if (finite(constraints.minNumber) || finite(constraints.maxNumber)) {
    const minimum = finite(constraints.minNumber) ? Number(constraints.minNumber) : -Infinity;
    const maximum = finite(constraints.maxNumber) ? Number(constraints.maxNumber) : Infinity;
    subjectNumbers.forEach((number, index) => within(number, minimum, maximum, `number-bound-${index}`));
  }
}

function quantitySubjectNumbers(skill, question, values) {
  const numbers = [];
  if (finite(values.data?.count)) numbers.push(Number(values.data.count));
  appendDescriptorSubjects(numbers, question?.modelDescriptor?.type, values);
  if (!numbers.length && skill?.generatorProfile === "quantity-identify") appendKnownNumber(numbers, question?.answer?.value);
  return numbers;
}

function appendDescriptorSubjects(numbers, type, values) {
  if (type === "comparison") {
    for (const side of [values.left, values.right]) appendKnownNumber(numbers, descriptorMagnitude(side));
  }
  if (type === "placeValue") appendKnownNumber(numbers, values.source);
}

function appendKnownNumber(numbers, value) {
  const number = exactNumber(value);
  if (number !== null) numbers.push(number);
}

function denominatorBoundsConstraint({ add, constraints, question, values }) {
  const denominatorValues = questionDenominators(question, values);
  if (Array.isArray(constraints.denominators) && constraints.denominators.length) {
    const allowed = new Set(constraints.denominators.map(Number));
    denominatorValues.forEach((denominator) => {
      if (!allowed.has(denominator)) add("allowed-denominator", { denominator, allowed: [...allowed] });
    });
  }
  if (finite(constraints.denominatorMax)) {
    denominatorValues.forEach((denominator) => {
      if (denominator < 1 || denominator > Number(constraints.denominatorMax)) {
        add("denominatorMax", { denominator, maximum: Number(constraints.denominatorMax) });
      }
    });
  }
}

function decimalPlaceLimitConstraint({ add, constraints, question }) {
  if (finite(constraints.decimalPlacesMax)) {
    const decimalPlaces = (value) => {
      const text = normalized(value);
      const match = text.match(/^-?\d+\.(\d+)$/u);
      return match ? match[1].length : 0;
    };
    if (decimalPlaces(question?.answer?.value) > Number(constraints.decimalPlacesMax)) {
      add("decimalPlacesMax", { value: question.answer.value, maximum: Number(constraints.decimalPlacesMax) });
    }
  }
}

function visibleTermCountConstraint({ add, constraints, values }) {
  if (finite(constraints.termsMin)) {
    const sequences = (values.items || []).map((item) => item?.sequence).filter(Array.isArray);
    const visibleTerms = sequences.length ? Math.max(...sequences.map((sequence) => sequence.length + 1)) : 0;
    if (visibleTerms < Number(constraints.termsMin)) {
      add("termsMin", { visibleTerms, minimum: Number(constraints.termsMin) });
    }
  }
}

function repeatedUnitCountConstraint({ add, constraints, values }) {
  if (finite(constraints.repeatsShownMin)) {
    const sequence = (values.items || []).map((item) => item?.sequence).find(Array.isArray) || [];
    let repeats = 0;
    for (let period = 1; period <= Math.floor(sequence.length / 2); period += 1) {
      if (sequence.every((entry, index) => entry === sequence[index % period])) {
        repeats = Math.floor(sequence.length / period);
        break;
      }
    }
    if (repeats < Number(constraints.repeatsShownMin)) {
      add("repeatsShownMin", { repeats, minimum: Number(constraints.repeatsShownMin), sequence });
    }
  }
}

function explicitUnitMarkerConstraint({ add, constraints, question, values }) {
  if (constraints.unitMarked === true) {
    const explicitlyMarked = values?.data?.unitMarked === true
        || (values.items || []).some((item) => item?.unitMarked === true || finite(item?.markedUnitLength))
        || /\[[^\]]+\]\s+\[[^\]]+\]/u.test(normalized(question?.prompt));
    if (!explicitlyMarked) add("unitMarked", "The descriptor has no explicit repeating-unit marker.");
  }
}

function quantityStructureConstraint({ add, constraints, skill, values }) {
  if (skill?.generatorProfile === "quantity-identify" && nonemptyArray(constraints.structures)) {
    const structure = values.data?.structure || values.items?.[0]?.structure;
    if (!constraints.structures.includes(structure)) {
      add("structures", { structure: structure || null, allowed: constraints.structures });
    }
  }
}

function clockMinuteValuesConstraint({ add, constraints, question, values }) {
  if (Array.isArray(constraints.minuteValues) && constraints.minuteValues.length) {
    const minutes = [];
    (values.items || []).forEach((item) => {
      if (String(item?.kind).toLowerCase() === "clock" && finite(item.minute)) minutes.push(Number(item.minute));
    });
    if (finite(values.startMinute)) minutes.push(Number(values.startMinute));
    if (finite(values.endMinute)) minutes.push(Number(values.endMinute));
    const allowed = new Set(constraints.minuteValues.map(Number));
    minutes.forEach((minute) => {
      if (!allowed.has(minute)) add("minuteValues", { minute, allowed: [...allowed] });
    });
    clockAnswerLeak(question, values, add);
  }
}

function coordinateBoundsConstraint({ add, constraints, values }) {
  if (finite(constraints.coordinateMax) && values?.data?.start) {
    const points = [values.data.start];
    appendTextCoordinate(points, values.data.finish);
    (values.candidates || []).forEach((candidate) => {
      appendTextCoordinate(points, candidate?.optionValue ?? candidate?.label);
    });
    for (const [index, point] of points.entries()) checkCoordinateBounds({ index, point, constraints, add });
  }
}

function fractionPlaceModelConstraint({ add, question, skill, values }) {
  if (isFractionPlaceSkill(question, skill)) {
    const decimal = (values.representations || []).find((entry) => entry?.kind === "decimal");
    const fraction = (values.representations || []).find((entry) => entry?.kind === "fraction");
    if (decimal && fraction) {
      const mismatch = decimalFractionMismatch(decimal, fraction, question);
      if (mismatch) add("place-value-fraction-model", mismatch);
    }
  }
}

function isFractionPlaceSkill(question, skill) {
  return question?.modelDescriptor?.type === "fractionPair"
    && /tenths|hundredths/iu.test(`${normalized(skill?.title)} ${normalized(skill?.objective)}`);
}

const QUESTION_CONSTRAINT_CHECKS = Object.freeze([
  finiteQuestionConstraint,
  answerRangeConstraint,
  subjectNumberBoundsConstraint,
  denominatorBoundsConstraint,
  decimalPlaceLimitConstraint,
  visibleTermCountConstraint,
  repeatedUnitCountConstraint,
  explicitUnitMarkerConstraint,
  quantityStructureConstraint,
  clockMinuteValuesConstraint,
  coordinateBoundsConstraint,
  fractionPlaceModelConstraint
]);

function finiteRange(value) {
  return exactArrayLength(value, 2) && value.every(finite);
}

function questionDenominators(question, values) {
  const denominators = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (object(value)) Object.entries(value).forEach(([name, entry]) => {
      if (/denominator|^d\d+$/iu.test(name) && finite(entry)) denominators.push(Number(entry));
      else collect(entry);
    });
  };
  collect(question?.promptSlots || {});
  collect(question?.params || {});
  if (question?.modelDescriptor?.type === "fractionPair") {
    (values.representations || []).filter((entry) => entry?.role !== "result").forEach((entry) => {
      if (finite(entry.denominator)) denominators.push(Number(entry.denominator));
    });
  }
  return denominators;
}

function clockAnswerLeak(question, values, add) {
  const clock = (values.items || []).find((item) => String(item?.kind).toLowerCase() === "clock");
  if (/read/iu.test(normalized(question?.taskType)) && clock && finite(clock.hour) && finite(clock.minute)) {
    const exactTime = `${Number(clock.hour)}:${String(Number(clock.minute)).padStart(2, "0")}`;
    const prompt = normalized(question?.prompt);
    if (prompt.includes(exactTime)) add("clock-answer-leak", { exactTime, prompt });
  }
}

function appendTextCoordinate(points, text) {
  const coordinate = normalized(text).match(/^\((-?\d+),\s*(-?\d+)\)$/u);
  if (coordinate) points.push({ x: Number(coordinate[1]), y: Number(coordinate[2]) });
}

function checkCoordinateBounds({ index, point, constraints, add }) {
  if (!finite(point.x) || !finite(point.y)) {
    add("coordinate-finite", { index, point });
    return;
  }
  const maximum = Number(constraints.coordinateMax);
  if (Number(point.x) > maximum || Number(point.y) > maximum) add("coordinateMax", { index, point, maximum });
  if (outsideRequiredFirstQuadrant(point, constraints.quadrants)) add("first-quadrant", { index, point });
}

function outsideRequiredFirstQuadrant(point, quadrants) {
  return exactArrayLength(quadrants, 1) && Number(quadrants[0]) === 1 && (Number(point.x) <= 0 || Number(point.y) <= 0);
}

function decimalFractionMismatch(decimal, fraction, question) {
  const decimalText = normalized(decimal.label ?? question?.answer?.value);
  const decimalMatch = decimalText.match(/^-?\d+\.(\d{1,2})$/u);
  const expectedDenominator = decimalMatch ? 10 ** decimalMatch[1].length : null;
  const expectedNumerator = decimalMatch ? Math.round(Math.abs(Number(decimalText) % 1) * expectedDenominator) : null;
  if (expectedDenominator !== null && (Number(fraction.denominator) !== expectedDenominator || Number(fraction.numerator) !== expectedNumerator)) {
    return { decimal: decimalText, fraction: `${fraction.numerator}/${fraction.denominator}`, expected: `${expectedNumerator}/${expectedDenominator}` };
  }
  return null;
}

function placementLevelRun(engine, state, playDay, desiredLevel, methods) {
  let run = engine.createPlacementRun({
    state,
    playDay,
    seed: state.seed,
    theme: "ocean",
  });
  for (let index = 0; index < engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS; index += 1) {
    const validation = engine.validatePlacementRun(run, state);
    if (!validation.valid) throw new Error(validation.error);
    if (validation.complete) break;
    const question = engine.placementCurrentQuestion(run);
    if (!methods.has(question.inputMethod)) {
      methods.set(question.inputMethod, { run, question, desiredLevel });
    }
    const submitted = question.level < desiredLevel
      ? engine.submitPlacementAnswer(run, correctAnswer(engine, question))
      : engine.submitPlacementNotSure(run);
    run = submitted.run;
  }
  return run;
}

function placementLevelResult(engine, state, run, desiredLevel) {
  const validation = engine.validatePlacementRun(run, state);
  const recommendation = engine.placementRecommendation(run);
  return {
    desiredLevel,
    questionCount: run.answers.length,
    complete: validation.valid && validation.complete,
    recommendedLevel: recommendation?.recommendedLevel ?? null,
    pass: Boolean(
      validation.valid
          && validation.complete
          && run.answers.length >= engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS
          && run.answers.length <= engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS
          && recommendation?.recommendedLevel === desiredLevel
    ),
  };
}

function auditVisualManifest({ engine, expectedProfiles, titles, tests }) {
  const manifestSkills = engine?.CURRICULUM_MANIFEST?.skills;
  titles["VIS-MANIFEST"] = "Visual audit is bound to the exact shipped manifest";
  const taskContractsBound = Array.isArray(manifestSkills) && manifestSkills.every((record, index) => {
    const declared = record?.constraints?.taskTypes;
    const assessed = record?.assessment?.requiredTaskTypes;
    const runtime = engine.SKILLS[index]?.constraints?.taskTypes;
    return Array.isArray(declared) && declared.length
        && engine.canonical(declared) === engine.canonical(assessed)
        && engine.canonical(declared) === engine.canonical(runtime);
  });
  tests["VIS-MANIFEST"] = result(
    expectedProfiles.length > 0
        && Array.isArray(manifestSkills)
        && manifestSkills.length === engine.SKILLS.length
        && engine.SKILLS.every((skill) => expectedProfiles.includes(skill.generatorProfile))
        && taskContractsBound,
    visualManifestDetails(engine, expectedProfiles, taskContractsBound),
  );

}

function auditVisualProfiles({ engine, expectedProfiles, titles, tests }) {
  const allConstraintFailures = [];
  for (const profile of expectedProfiles) auditOneVisualProfile({ engine, profile, titles, tests, allConstraintFailures });

  titles["VIS-CONSTRAINTS"] = "Every generated question obeys its manifest constraints without leaking the answer";
  tests["VIS-CONSTRAINTS"] = result(allConstraintFailures.length === 0, {
    inspectedProfiles: expectedProfiles.length,
    failures: allConstraintFailures.slice(0, 12),
  });

}

function generatedVisualQuestions(engine) {
  const allQuestions = [];
  for (const { skill, tier, ordinal } of visualSamples(engine)) {
    allQuestions.push(make(engine, skill, tier, ordinal));
  }

  return allQuestions;
}

function auditVisualCapabilities({ engine, allQuestions, titles, tests }) {
  const classes = [...new Set(allQuestions.map((question) => question.inputClass))].sort();
  const methods = [...new Set(allQuestions.map((question) => question.inputMethod))].sort();
  const rendererCapableMethods = Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD || {}).sort();
  const descriptorTypes = [...new Set(allQuestions.map((question) => question.modelDescriptor?.type))].sort();
  const exactRendererSet = engine.canonical(rendererCapableMethods) === engine.canonical(RENDERER_CAPABLE_METHODS);
  const exactReachableSet = engine.canonical(methods) === engine.canonical(RELEASE_REACHABLE_METHODS);
  const rendererOnlyMethods = rendererCapableMethods.filter((method) => !methods.includes(method));
  titles["VIS-CAPABILITIES"] = "Renderer-capable and release-reachable input/model capabilities are exact and non-circular";
  tests["VIS-CAPABILITIES"] = result(
    classes.includes("SELECTION") && classes.includes("CONSTRUCTION")
        && exactRendererSet && exactReachableSet
        && engine.canonical(rendererOnlyMethods) === engine.canonical(["NUMBER_BOND", "NUMBER_CHOICE"])
        && descriptorTypes.length >= 2,
    {
      classes,
      rendererCapableMethods,
      releaseReachableMethods: methods,
      rendererOnlyMethods,
      descriptorTypes,
      inspected: allQuestions.length,
      reachabilityPolicy: "Only states emitted by the shipped manifest and generator are release-reachable. NUMBER_BOND and NUMBER_CHOICE remain renderer-capable but have no shipped question witness; impossible method/skill/mode combinations are excluded explicitly rather than counted as untested.",
    },
  );

}

function auditCanadianMoney({ engine, allQuestions, titles, tests }) {
  const moneySkills = engine.SKILLS.filter((skill) => skill.generatorProfile === "money-model");
  const canadianDenominations = new Set([5, 10, 25, 100, 200]);
  const moneyContractFailures = moneySkills.filter((skill) => {
    const denominations = skill.constraints?.denominationsCents;
    const invalidDenominations = denominations !== undefined
        && (!Array.isArray(denominations) || !denominations.length
          || denominations.some((cents) => !canadianDenominations.has(Number(cents))));
    return skill.constraints?.currency !== "CAD" || invalidDenominations;
  });
  const moneyQuestions = allQuestions.filter((question) => engine.SKILL_BY_ID[question.skillId]?.generatorProfile === "money-model");
  const moneyFailures = moneyQuestions.filter((question) => {
    const values = question.modelDescriptor?.values;
    const serialized = JSON.stringify({ prompt: question.prompt, slots: question.promptSlots, values });
    return !/(?:¢|\$|\bcents?\b)/iu.test(serialized) || /£|€|\bUSD\b/iu.test(serialized);
  });
  titles["VIS-CANADIAN-MONEY"] = "Money models use explicit Canadian-dollar denominations and no foreign currency";
  tests["VIS-CANADIAN-MONEY"] = result(moneySkills.length > 0 && moneyQuestions.length > 0
      && moneyContractFailures.length === 0 && moneyFailures.length === 0, {
    skills: moneySkills.length,
    inspected: moneyQuestions.length,
    contractFailures: moneyContractFailures.map((skill) => skill.skillId),
    questionFailures: moneyFailures.slice(0, 5).map((question) => question.questionId),
  });

}

function auditOneVisualProfile({ engine, profile, titles, tests, allConstraintFailures }) {
  const id = `PROFILE-${slug(profile)}`;
  titles[id] = `Generator profile “${profile}” is deterministic, gradable, and visually truthful`;
  const skills = engine.SKILLS.filter((skill) => skill.generatorProfile === profile);
  const failures = [];
  const counts = { inspected: 0, expectedInspected: 0 };
  if (!skills.length) failures.push({ reason: "capability is declared by the manifest but no skill uses it" });
  for (const skill of skills) auditVisualProfileSkill({ engine, skill, failures, allConstraintFailures, counts });
  tests[id] = result(failures.length === 0 && counts.inspected === counts.expectedInspected, {
    profile, skills: skills.length, inspected: counts.inspected, failures: failures.slice(0, 8),
  });
}

function auditVisualProfileSkill({ engine, skill, failures, allConstraintFailures, counts }) {

  const declaredTaskTypes = Array.isArray(skill.constraints?.taskTypes) ? skill.constraints.taskTypes : [];
  const seenTaskTypes = new Set();
  if (!declaredTaskTypes.length) failures.push({ skillId: skill.skillId, reason: "skill has no declared constraints.taskTypes capability contract" });
  for (const tier of TIERS) {
    const ordinals = sampleOrdinals(skill);
    counts.expectedInspected += ordinals.length;
    for (const ordinal of ordinals) {
      inspectVisualProfileSample({ engine, skill, tier, ordinal, declaredTaskTypes, seenTaskTypes, failures, allConstraintFailures, counts });
    }
  }
  const missingTaskTypes = declaredTaskTypes.filter((taskType) => !seenTaskTypes.has(taskType));
  if (missingTaskTypes.length) failures.push({ skillId: skill.skillId, reason: "declared task types were not generated", missingTaskTypes });

}

function inspectVisualProfileSample({ engine, skill, tier, ordinal, declaredTaskTypes, seenTaskTypes, failures, allConstraintFailures, counts }) {
  try {
    const question = make(engine, skill, tier, ordinal);
    const repeated = make(engine, skill, tier, ordinal);
    const deterministic = engine.canonical(question) === engine.canonical(repeated);
    const inputValid = inputContract.call(engine, question);
    const truth = descriptorTruth(question);
    const constraintCheck = constraintSanity(skill, question);
    if (!constraintCheck.pass) {
      allConstraintFailures.push({
        skillId: skill.skillId,
        tier,
        ordinal,
        taskType: question.taskType,
        issues: constraintCheck.issues,
      });
    }
    const taskTypeBound = declaredTaskTypes.includes(question.taskType);
    if (taskTypeBound) seenTaskTypes.add(question.taskType);
    const attempt = submitVisualProfileAnswer(engine, question);
    const taskTypePropagated = attempt.taskType === question.taskType;
    const bound = visualProfileQuestionBound(question, skill, tier, ordinal);
    counts.inspected += 1;
    if (!visualProfileObservationsPass({ deterministic, inputValid, truth, constraintCheck, bound, taskTypeBound, taskTypePropagated })) {
      failures.push({
        skillId: skill.skillId,
        tier,
        ordinal,
        deterministic,
        inputValid,
        bound,
        taskType: question.taskType,
        taskTypeBound,
        taskTypePropagated,
        descriptorType: question.modelDescriptor?.type,
        descriptor: truth.reason,
        constraints: constraintCheck.issues,
      });
    }
  } catch (error) {
    failures.push({ skillId: skill.skillId, tier, ordinal, error: String(error?.message || error) });
  }
}

function visualManifestDetails(engine, expectedProfiles, taskContractsBound) {
  return {
    manifestId: engine?.CURRICULUM_MANIFEST?.manifestId,
    version: engine?.CURRICULUM_MANIFEST?.version,
    sha256: engine?.CURRICULUM_MANIFEST_SHA256,
    profiles: expectedProfiles.length,
    skills: engine?.SKILLS?.length,
    taskContractsBound,
  };
}

function submitVisualProfileAnswer(engine, question) {
  const submittedAnswer = question.inputClass === "SELECTION"
    ? { optionId: question.options[question.correctIndex].optionId }
    : STRUCTURED_RESPONSE_METHODS.has(question.inputMethod) ? structuredAnswer(engine, question) : question.answer.value;
  return engine.submitAnswer(question, submittedAnswer, {
    promptFinishedAt: 0,
    submittedAt: 1000,
    manipulationMs: question.inputClass === "CONSTRUCTION" ? 200 : 0,
    replayMs: 0,
    idleMs: 0,
    hintUsed: false,
    selectionEvents: question.inputClass === "SELECTION" ? [{ optionId: question.options[question.correctIndex].optionId, at: 100 }] : [],
    modelUsed: true,
    sessionId: "visual-profile-audit",
    playDay: 20000,
  });
}

function visualProfileQuestionBound(question, skill, tier, ordinal) {
  return question.skillId === skill.skillId && question.level === skill.level && question.tier === tier && question.ordinal === ordinal;
}

function visualProfileObservationsPass({ deterministic, inputValid, truth, constraintCheck, bound, taskTypeBound, taskTypePropagated }) {
  return deterministic && inputValid && truth.pass && constraintCheck.pass && bound && taskTypeBound && taskTypePropagated;
}

function measureFloorMetrics(scope, { textSelector, requireText }, labWindow, visible) {
  if (!scope) return { minFont: 0, minControl: 0 };
  let text = [...scope.querySelectorAll(textSelector)].filter(visible);
  if (requireText) text = text.filter((node) => normalized(node.textContent));
  const controls = [...scope.querySelectorAll("button,input,select")].filter(visible);
  return { minFont: minimumFontSize(text, labWindow), minControl: minimumControlSize(controls) };
}

function minimumFontSize(nodes, labWindow) {
  return nodes.length ? Math.min(...nodes.map((node) => Number.parseFloat(labWindow.getComputedStyle(node).fontSize))) : 0;
}

function minimumControlSize(nodes) {
  return nodes.length ? Math.min(...nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return Math.min(rect.width, rect.height);
  })) : 0;
}

function roundedRectDimension(rect, dimension) {
  return rect ? Math.round(rect[dimension]) : null;
}

function feedbackObservation(labDocument, labWindow, expectedState) {
  const stateNode = labDocument.querySelector(`.feedback-state[data-feedback-state="${CSS.escape(expectedState)}"]`);
  const icon = stateNode?.querySelector(`.feedback-state__icon .mq-icon[data-icon="${CSS.escape(expectedState)}"]`);
  const status = stateNode?.querySelector(".feedback-state__copy strong");
  const next = labDocument.querySelector('[data-action="next"]');
  const stateRect = stateNode?.getBoundingClientRect();
  const iconRect = icon?.getBoundingClientRect();
  const statusRect = status?.getBoundingClientRect();
  const nextRect = next?.getBoundingClientRect();
  const statusFont = status ? Number.parseFloat(labWindow.getComputedStyle(status).fontSize) : 0;
  return { stateNode, icon, status, next, stateRect, iconRect, statusRect, nextRect, statusFont };
}

function feedbackBeforeNext({ stateNode, next, stateRect, nextRect, labWindow }) {
  return Boolean(stateNode && next && stateNode.compareDocumentPosition(next) & labWindow.Node.DOCUMENT_POSITION_FOLLOWING
    && stateRect && nextRect && stateRect.bottom <= nextRect.top + 1);
}

function feedbackInViewport({ stateRect, iconRect, statusRect, nextRect, labWindow }) {
  return Boolean(stateRect && iconRect && statusRect && nextRect && stateRect.top >= -1
    && stateRect.bottom <= labWindow.innerHeight + 1 && iconRect.top >= -1 && statusRect.top >= -1
    && nextRect.bottom <= labWindow.innerHeight + 1);
}

function feedbackVisualPass({ stateNode, icon, status, iconLarge, statusFont, beforeNext, visible }) {
  return Boolean(stateNode && visible(stateNode) && visible(icon) && visible(status) && normalized(status.textContent)
    && iconLarge && statusFont >= 27 && beforeNext);
}

function guideOnFirstScreen(guideRect, readyRect, labWindow) {
  return Boolean(guideRect && readyRect && guideRect.left >= -1 && guideRect.right <= labWindow.innerWidth + 1
    && guideRect.top >= -1 && readyRect.bottom <= labWindow.innerHeight + 1);
}

function guideInteractionReady({ questionNode, guide, guideState, cards, exactMappings, accessibleMappings, ready, visible, forbiddenControls }) {
  return questionNode && guide && guideState.activeSession.uiState.question.scaffolded === false
    && cards.length === PRACTICE_TOKEN_VISUAL_ORACLE.length && exactMappings && accessibleMappings
    && ready && visible(ready) && forbiddenControls === 0;
}

function guideGeometryPass({ contentOnFirstScreen, tokensLarge, metrics, noHorizontalOverflow, readyFocused }) {
  return contentOnFirstScreen && tokensLarge && meetsSizeFloors(metrics, 16, 44) && noHorizontalOverflow && readyFocused;
}

function visibleNodes(scope, selector, visible) {
  return [...(scope?.querySelectorAll(selector) || [])].filter(visible);
}

function practiceTokenElements({ labDocument }) {
  const questionNode = labDocument.querySelector('.question[data-skill-id="MQ-048"]');
  const { prompt, source, worked, tutorial } = queryElements(questionNode, {
    prompt: ".prompt", source: '.stimulus[data-answer-free="true"]', worked: '[data-worked-result="true"]', tutorial: '[data-tutorial="different-example"]',
  });
  const { tutorialInstruction, tutorialBack } = queryElements(tutorial, {
    tutorialInstruction: ".tutorial-instruction", tutorialBack: '[data-action="tutorial-back"]',
  });
  const { answer, confirm, outcome, next } = queryElements(questionNode, {
    answer: '.answer-controls[data-input-method="PICTURE_CHOICE"]', confirm: '[data-action="confirm"]',
    outcome: '.feedback-state[data-feedback-state="incorrect"]', next: '[data-action="next"]',
  });
  return { questionNode, prompt, source, worked, tutorial, tutorialInstruction, tutorialBack, answer, confirm, outcome, next };
}

function practiceTokenIdentity({ expected, questionNode, source, stateName, tutorial, visible }) {
  const expectedSelector = `.practice-coin-token[data-practice-token="${CSS.escape(expected.tokenId)}"]`;
  const tokenNodes = visibleNodes(questionNode, ".practice-coin-token[data-practice-token]", visible);
  const expectedTokenNodes = tokenNodes.filter((node) => node.dataset.practiceToken === expected.tokenId);
  const unexpectedTokenIds = [...new Set(tokenNodes
    .map((node) => node.dataset.practiceToken)
    .filter((tokenId) => tokenId !== expected.tokenId))];
  const tutorialTokenNodes = visibleNodes(tutorial, ".practice-coin-token[data-practice-token]", visible);
  const tutorialTokenIds = [...new Set(tutorialTokenNodes.map((node) => node.dataset.practiceToken))];
  const renderedTokenIds = [...new Set(tokenNodes.map((node) => node.dataset.practiceToken))];
  const tokenStateContract = practiceTokenStateTokenContract(
    stateName,
    expected.tokenId,
    renderedTokenIds,
    tutorialTokenIds,
  );
  const stateTokenNodes = stateName === "tutorial-notice"
    ? tutorialTokenNodes
    : expectedTokenNodes;
  const sourceToken = source?.querySelector(expectedSelector);
  return { expectedTokenNodes, unexpectedTokenIds, tutorialTokenIds, renderedTokenIds, tokenStateContract, stateTokenNodes, sourceToken };
}

function practiceTokenAnswerEvidence({ answer, engine, expected, optionOracle, question, source, stateName, visible, worked }) {
  const valueLeaksIntoSource = PRACTICE_TOKEN_VISUAL_ORACLE.some((row) => (
    normalized(source?.textContent).includes(normalized(row.value))
  ));
  const workedNamesValue = Boolean(worked && normalized(worked.textContent).includes(normalized(expected.value)));
  const renderedOptions = visibleNodes(answer, '[data-action="select"][data-id]', visible);
  const renderedOptionIds = renderedOptions.map((node) => node.dataset.id).sort();
  const expectedOptionIds = question.options.map((option) => option.optionId).sort();
  const exactOptions = stateName !== "ordinary" || Boolean(
    renderedOptions.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
              && engine.canonical(renderedOptionIds) === engine.canonical(expectedOptionIds)
              && engine.canonical(question.options.map((option) => option.value).sort()) === engine.canonical(optionOracle),
  );
  return { valueLeaksIntoSource, workedNamesValue, renderedOptions, exactOptions };
}

function practiceTokenGeometry({ answer, confirm, labWindow, next, outcome, prompt, source, stateName, stateTokenNodes, tutorial, tutorialBack, tutorialInstruction }) {
  const requiredElements = stateName === "incorrect"
    ? [prompt, source, outcome, next]
    : stateName === "tutorial-notice"
      ? [tutorial, prompt, source, tutorialInstruction, tutorialBack]
      : [prompt, source, answer, confirm];
  const requiredRects = requiredElements.map((element) => element?.getBoundingClientRect());
  const contentOnFirstScreen = requiredRects.every((rect) => rectFitsViewport(rect, labWindow));
  const tokenRects = stateTokenNodes.map((node) => node.getBoundingClientRect());
  const tokensOnFirstScreen = tokenRects.length >= 1
              && tokenRects.every((rect) => rect.left >= -1 && rect.right <= labWindow.innerWidth + 1
                && rect.top >= -1 && rect.bottom <= labWindow.innerHeight + 1);
  const tokensLarge = tokenRects.length > 0
              && tokenRects.every((rect) => rect.width >= 50 && rect.height >= 50);
  const responseBeforeAction = practiceTokenResponseBeforeAction({ stateName, tutorialInstruction, tutorialBack, answer, confirm });
  const feedbackBeforeAction = stateName !== "incorrect" || Boolean(
    outcome?.getBoundingClientRect().bottom <= next?.getBoundingClientRect().top + 1,
  );
  return { contentOnFirstScreen, tokensOnFirstScreen, tokensLarge, responseBeforeAction, feedbackBeforeAction };
}

function practiceTokenFingerprint({ labWindow, stateTokenNodes }) {
  const stateToken = stateTokenNodes[0] || null;
  const mark = stateToken?.querySelector(".practice-coin-token__mark");
  const markStyle = mark ? labWindow.getComputedStyle(mark) : null;
  const afterStyle = mark ? labWindow.getComputedStyle(mark, "::after") : null;
  const fingerprint = markStyle ? [
    markStyle.backgroundImage,
    markStyle.backgroundColor,
    markStyle.borderRadius,
    markStyle.borderTopWidth,
    markStyle.borderTopStyle,
    afterStyle?.content,
    afterStyle?.backgroundColor,
    afterStyle?.transform,
  ].join("|") : "";
  return fingerprint;
}

function practiceTokenStateEvidence({ feedbackFocusedAtTransition, outcome, question, stateName, tutorial, worked }) {
  if (stateName === "ordinary") return !worked && !outcome;
  if (stateName === "tutorial-notice") return practiceTokenNoticeEvidence(tutorial, question, worked, outcome);
  return Boolean(!worked && outcome && feedbackFocusedAtTransition);
}

function practiceTokenPass({ action, contentOnFirstScreen, exactOptions, expected, feedbackBeforeAction, fingerprint, metrics, noHorizontalOverflow, question, questionNode, responseBeforeAction, source, sourceToken, stateContract, stateName, tokenStateContract, tokensLarge, tokensOnFirstScreen, valueLeaksIntoSource, visible }) {
  return Boolean(
    practiceTokenQuestionMatches(questionNode, question, expected)
              && practiceTokenSourceMatches({ source, stateName, sourceToken, valueLeaksIntoSource, tokenStateContract, exactOptions })
              && action
              && visible(action)
              && stateContract
              && practiceTokenGeometryPass({ contentOnFirstScreen, tokensOnFirstScreen, tokensLarge, responseBeforeAction, feedbackBeforeAction, metrics, noHorizontalOverflow })
              && fingerprint,
  );
}

function practiceTokenResponseBeforeAction({ stateName, tutorialInstruction, tutorialBack, answer, confirm }) {
  return stateName === "incorrect" || Boolean(stateName === "tutorial-notice"
    ? tutorialInstruction?.getBoundingClientRect().bottom <= tutorialBack?.getBoundingClientRect().top + 1
    : answer?.getBoundingClientRect().bottom <= confirm?.getBoundingClientRect().top + 1);
}

function practiceTokenNoticeEvidence(tutorial, question, worked, outcome) {
  return Boolean(tutorial && tutorial.dataset.tutorialStep === "1" && tutorial.dataset.tutorialPhaseId === "NOTICE"
    && tutorial.dataset.sourceQuestionId === question.questionId && tutorial.dataset.exampleQuestionId !== question.questionId
    && tutorial.dataset.terminalAnswerRendered === "false" && !worked && !outcome);
}

function practiceTokenQuestionMatches(questionNode, question, expected) {
  return questionNode && questionNode.dataset.inputMethod === "PICTURE_CHOICE"
    && question.params?.tokenId === expected.tokenId && question.answer?.value === expected.value;
}

function practiceTokenSourceMatches({ source, stateName, sourceToken, valueLeaksIntoSource, tokenStateContract, exactOptions }) {
  return source && (stateName === "tutorial-notice" || sourceToken) && !valueLeaksIntoSource && tokenStateContract && exactOptions;
}

function practiceTokenGeometryPass({ contentOnFirstScreen, tokensOnFirstScreen, tokensLarge, responseBeforeAction, feedbackBeforeAction, metrics, noHorizontalOverflow }) {
  return contentOnFirstScreen && tokensOnFirstScreen && tokensLarge && responseBeforeAction && feedbackBeforeAction
    && meetsSizeFloors(metrics, 16, 44) && noHorizontalOverflow;
}

function queryElements(scope, selectors) {
  return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, scope?.querySelector(selector)]));
}

function placementScreenDiagnostic({ labDocument, labWindow, placementDraftKey, screen }) {
  const missingScreenDiagnostic = screen ? null : {
    draftPresent: Boolean(labWindow.localStorage.getItem(placementDraftKey)),
    warning: normalized(labDocument.querySelector(".runtime-warning:not([hidden])")?.textContent),
    visibleHeading: normalized(labDocument.querySelector("h1,h2")?.textContent),
    bodyText: normalized(labDocument.body?.textContent).slice(0, 320),
  };
  return missingScreenDiagnostic;
}

function placementControlsBeforeConfirm({ confirm, labWindow, response }) {
  const controlsBeforeConfirm = Boolean(
    response
          && confirm
          && [...response.querySelectorAll("button,input,select,textarea")]
            .filter((control) => control !== confirm)
            .every((control) => control.compareDocumentPosition(confirm) & labWindow.Node.DOCUMENT_POSITION_FOLLOWING),
  );
  return controlsBeforeConfirm;
}

function placementOverflowOffenders({ labWindow, screen, visible }) {
  const nestedVerticalOffenders = screen
    ? [screen, ...screen.querySelectorAll("*")].filter((element) => {
      if (!visible(element) || element.scrollHeight <= element.clientHeight + 1) return false;
      return ["auto", "scroll", "hidden", "clip"].includes(labWindow.getComputedStyle(element).overflowY);
    }).map((element) => ({
      element: `${element.localName}.${[...element.classList].slice(0, 3).join(".")}`,
      overflowY: labWindow.getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }))
    : [{ element: "missing-placement-screen" }];
  return nestedVerticalOffenders;
}

function placementLegibilityObservations({ labWindow, shell, visible }) {
  const essentialText = shell
    ? [...shell.querySelectorAll([
      ".placement-topbar h1",
      ".placement-topbar button",
      ".placement-question .prompt",
      ".placement-question .answer-controls>.small",
      ".placement-question .direct-status",
      ".placement-question .answer-controls button",
      ".placement-question .answer-controls label",
      ".placement-question .answer-controls output",
      ".placement-question .question-submit button",
    ].join(","))].filter(visible).filter((node) => normalized(node.textContent))
    : [];
  const essentialMinFont = minimumFontSize(essentialText, labWindow);
  const controls = shell
    ? [...shell.querySelectorAll("button,input,select,textarea")].filter(visible)
    : [];
  return { essentialMinFont, controls };
}

function placementKeyboardReachability({ controls, labDocument, notSure }) {
  const { enabledControls: enabledFocusControls, firstFocused: firstFocusReached, lastFocused: lastFocusReached } = focusControlEndpoints(controls, labDocument);
  const notSureFocusReached = focusReaches(notSure, labDocument);
  const keyboardFocusReachable = Boolean(
    enabledFocusControls.length >= 2
          && enabledFocusControls.every((control) => /^(?:BUTTON|INPUT|SELECT|TEXTAREA)$/u.test(control.tagName))
          && firstFocusReached
          && lastFocusReached
          && notSureFocusReached
  );
  return { enabledFocusControls, firstFocusReached, lastFocusReached, notSureFocusReached, keyboardFocusReachable };
}

function placementDescendantCollisions({ answer, visible }) {
  const rectanglesOverlap = (left, right) => Boolean(
    left
          && right
          && Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
          && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1
  );
  const descendantCollisions = [
    [".route-grid", ".arrow-pad"],
    [".pattern-token-bank", ".direct-undo"],
    [".pattern-slots", ".pattern-token-bank"],
    [".pattern-slots", ".direct-undo"],
  ].flatMap(([leftSelector, rightSelector]) => {
    const left = answer?.querySelector(leftSelector);
    const right = answer?.querySelector(rightSelector);
    if (!visible(left) || !visible(right)) return [];
    return rectanglesOverlap(left.getBoundingClientRect(), right.getBoundingClientRect())
      ? [{ left: leftSelector, right: rightSelector }]
      : [];
  });
  return descendantCollisions;
}

function placementNoticePosition({ inputMethod, question, visible }) {
  const placementNotice = question?.querySelector(":scope > .notice");
  const noticeRect = visible(placementNotice) ? placementNotice.getBoundingClientRect() : null;
  const postNoticeRects = [":scope > .early-symbol-cue", ":scope > .prompt", ":scope > .stimulus", ":scope > .question-response"]
    .map((selector) => question?.querySelector(selector)).filter(visible).map((element) => element.getBoundingClientRect());
  const noticeBeforeContent = inputMethod !== "PICTURE_CHOICE" || Boolean(
    noticeRect
          && postNoticeRects.length
          && noticeRect.bottom <= Math.min(...postNoticeRects.map((rect) => rect.top)) + 1
  );
  return noticeBeforeContent;
}

function insertPlacementNoticeProbe(question, inputMethod, labDocument) {
  if (inputMethod !== "PICTURE_CHOICE" || !question || question.querySelector(":scope > .notice")) return null;
  const progress = question.querySelector(":scope > .placement-progress");
  const noticeProbe = labDocument.createElement("div");
  noticeProbe.className = "notice";
  noticeProbe.dataset.visualNoticeProbe = "true";
  noticeProbe.textContent = "Grown-up notice: the paused questions need attention.";
  progress?.insertAdjacentElement("afterend", noticeProbe);
  return noticeProbe;
}

function rectFitsViewport(rect, labWindow) {
  return Boolean(rect && rect.left >= -1 && rect.right <= labWindow.innerWidth + 1 && rect.top >= -1 && rect.bottom <= labWindow.innerHeight + 1);
}

function placementNaturalOuterFlow(profile, confirmRect, labWindow, labDocument) {
  return Boolean(profile.allowNaturalOuterFlow && confirmRect && confirmRect.left >= -1 && confirmRect.right <= labWindow.innerWidth + 1
    && labDocument.documentElement.scrollHeight > labDocument.documentElement.clientHeight + 1);
}

function placementControlsUsable({ screen, answerRect, confirmRect, notSure, answer, inputMethod, controlsBeforeConfirm }) {
  return screen && answerRect && confirmRect && notSure && answer?.dataset.inputMethod === inputMethod
    && answerRect.bottom <= confirmRect.top + 1 && controlsBeforeConfirm;
}

function placementContentLegible({ nestedVerticalOffenders, descendantCollisions, noHorizontalOverflow, noticeBeforeContent, keyboardFocusReachable, essentialMinFont, minControl, confirmOnFirstScreen, naturalOuterFlow }) {
  return nestedVerticalOffenders.length === 0 && descendantCollisions.length === 0 && noHorizontalOverflow && noticeBeforeContent
    && keyboardFocusReachable && essentialMinFont >= 18 && minControl >= 44 && (confirmOnFirstScreen || naturalOuterFlow);
}

function focusReaches(element, labDocument) {
  element?.focus();
  return Boolean(element && labDocument.activeElement === element);
}

function placementWrapperObservation({ labDocument, labWindow, placementDraftKey, inputMethod }) {
  const screen = labDocument.querySelector('[data-placement-screen][data-placement-phase="question"]');
  const missingScreenDiagnostic = placementScreenDiagnostic({ labDocument, labWindow, placementDraftKey, screen });
  const shell = screen?.closest(".placement-shell");
  const question = screen?.querySelector(".placement-question");
  const noticeProbe = insertPlacementNoticeProbe(question, inputMethod, labDocument);
  const response = screen?.querySelector(".question-response");
  const { answer, confirm, notSure } = queryElements(response, {
    answer: ".answer-controls[data-input-method]", confirm: '.question-submit [data-action="confirm"]', notSure: '.question-submit [data-action="placement-not-sure"]',
  });
  const answerRect = answer?.getBoundingClientRect();
  const confirmRect = confirm?.getBoundingClientRect();

  return { screen, missingScreenDiagnostic, shell, question, noticeProbe, response, answer, confirm, notSure, answerRect, confirmRect };
}

function durationTrackRatio(magnitude, maximum) {
  return Number.isFinite(magnitude) && Number.isFinite(maximum) && maximum > 0 ? Math.max(0.12, Math.min(1, magnitude / maximum)) : 0;
}

function durationChoiceContent(visual) {
  const name = visual?.querySelector(".duration-event-choice__name");
  const track = visual?.querySelector(".duration-event-track");
  const fill = track?.querySelector(":scope > i");
  const time = visual?.querySelector(".duration-event-time");
  return { name, track, fill, time };
}

function childPairingTarget(labDocument) {
  const task = labDocument.querySelector('.pair-task[data-response-kind="PAIR_LINK"]');
  if (!task) throw new Error("The deterministic child-feedback fixture is no longer a PAIR_LINK question.");
  const target = Number(normalized(task.querySelector(".direct-status")?.textContent).match(/of\s+(\d+)/iu)?.[1]);
  if (!Number.isInteger(target) || target < 1) throw new Error("The PAIR_LINK fixture did not expose a positive pair target.");
  return target;
}

if (typeof window !== "undefined") window.MathQuestApprovedVisualRegression = approvedVisualRegression;
export { approvedVisualRegression };

async function auditVisualBrowser({ engine, hostWindow, hostDocument, storageKey, childNameKey, placementDraftKey, pause, settle, activeStateFactory, expectedProfiles, titles, tests, visualSession }) {
  const view = visualSession;
  const playDay = visualAuditPlayDay();
  await mountVisualAuditFrame({ childNameKey, engine, hostDocument, hostWindow, pause, placementDraftKey, playDay, storageKey, visualSession });

  const { settleLabRender, baseline, restoreStorageInstrumentation, instrumentStorage } = await prepareVisualLab({ pause, settle, storageKey, view, visualSession });

  const change = dispatchVisualChange.bind(null, { view });
  const resize = resizeVisualLab.bind(null, { pause, settleLabRender, view, visualSession });
  const replaceActiveFixture = replaceVisualFixture.bind(null, { engine, hostWindow, instrumentStorage, pause, placementDraftKey, restoreStorageInstrumentation, settleLabRender, storageKey, view, visualSession });
  const selectCase = selectVisualCase.bind(null, { change, engine, pause, settleLabRender, view });
  const visible = visibleVisualElement.bind(null, { view });
  const floorMetrics = visualLabFloorMetrics.bind(null, { view, visible });
  const scopedFloorMetrics = visualScopeFloorMetrics.bind(null, { view, visible });
  const makeThemed = makeVisualQuestion.bind(null, engine);
  const findOrdinal = findVisualOrdinal.bind(null, { makeThemed });
  const enterLabForTheme = enterVisualLabTheme.bind(null, { pause, settleLabRender, view });

  await auditPlacementWrappers({ baseline, engine, pause, placementDraftKey, playDay, replaceActiveFixture, resize, storageKey, tests, titles, view, visible });

  await auditOfflineStatusPanel({ pause, tests, titles, view });

  view.document.querySelector('[data-lab-action="enter"]')?.click();
  await pause();
  try {
    await auditVisualLab({ activeStateFactory, baseline, engine, enterLabForTheme, expectedProfiles, findOrdinal, floorMetrics, makeThemed, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, selectCase, storageKey, tests, titles, view, visible, visualSession });
  } finally {
    restoreStorageInstrumentation();
  }

}


function settleVisualLab({ settle, view }, label) { return settle({ doc: view.document, win: view.window }, label); }

function restoreVisualStorageInstrumentation({ view }) {
  if (view.storagePrototype && view.originalSetItem) view.storagePrototype.setItem = view.originalSetItem;
  view.storagePrototype = null;
  view.originalSetItem = null;
}

function instrumentVisualStorage({ view }) {
  view.storagePrototype = view.window.Storage.prototype;
  view.originalSetItem = view.storagePrototype.setItem;
  view.storagePrototype.setItem = function (...args) {
    view.writes += 1;
    return view.originalSetItem.apply(this, args);
  };
}

function dispatchVisualChange({ view }, element) { return element.dispatchEvent(new view.window.Event("change", { bubbles: true })); }

async function resizeVisualLab({ pause, settleLabRender, view, visualSession }, width, height) {
  visualSession.frame.style.width = `${width}px`;
  visualSession.frame.style.height = `${height}px`;
  view.window.dispatchEvent(new view.window.Event("resize"));
  await pause();
  await pause();
  await settleLabRender(`Manifest visual-regression viewport ${width}x${height}`);
}

async function replaceVisualFixture({ engine, hostWindow, instrumentStorage, pause, placementDraftKey, restoreStorageInstrumentation, settleLabRender, storageKey, view, visualSession }, state, name, { placementDraft = null } = {}) {
  restoreStorageInstrumentation();
  view.window.dispatchEvent(new view.window.Event("pagehide"));
  await new Promise(function releaseFixtureWriterTurn(resolve) { setTimeout(resolve, 20); });
  hostWindow.localStorage.setItem(storageKey, engine.exportState(state));
  if (placementDraft === null) hostWindow.localStorage.removeItem(placementDraftKey);
  else hostWindow.localStorage.setItem(placementDraftKey, placementDraft);
  const loaded = new Promise(function visualFixturePageLoad(resolve, reject) {
    const timer = setTimeout(() => reject(new Error(`${name} did not load within 5 seconds.`)), 5000);
    visualSession.frame.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    visualSession.frame.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${name} failed to load.`));
    }, { once: true });
  });
  visualSession.frame.src = `index.html?manifest-visual-regression=${encodeURIComponent(name)}-${Date.now()}`;
  await loaded;
  view.window = visualSession.frame.contentWindow;
  view.document = visualSession.frame.contentDocument;
  for (let attempt = 0; attempt < 500 && view.document.getElementById("app")?.inert !== false; attempt += 1) {
    await new Promise(function waitForVisualFixtureLease(resolve) { setTimeout(resolve, 10); });
  }
  if (view.document.querySelector("[data-progress-protection]") || view.document.getElementById("app")?.inert) {
    throw new Error(`${name} could not acquire the audit writer lease.`);
  }
  await pause();
  await pause();
  await settleLabRender(`${name} manifest visual-regression fixture`);
  instrumentStorage();
}

async function selectVisualCase({ change, engine, pause, settleLabRender, view }, { skill, tier = "HARD/TARGET", ordinal = 0 }) {
  let control = view.document.querySelector("[data-lab-level]");
  if (!control) throw new Error("Parent Test Lab level selector is absent.");
  control.value = String(skill.level);
  change(control);
  await pause();
  control = view.document.querySelector("[data-lab-skill]");
  if (!control || ![...control.options].some((option) => option.value === skill.skillId)) throw new Error(`Parent Test Lab cannot select ${skill.skillId}.`);
  control.value = skill.skillId;
  change(control);
  await pause();
  control = view.document.querySelector("[data-lab-tier]");
  control.value = tier;
  change(control);
  await pause();
  for (let index = 0; index < ordinal; index += 1) {
    view.document.querySelector('[data-lab-action="next"]')?.click();
    await pause();
  }
  await settleLabRender(`Parent Test Lab ${skill.skillId} ${tier} sample ${ordinal}`);
  return make(engine, skill, tier, ordinal);
}

function visibleVisualElement({ view }, element) {
  if (!element) return false;
  const style = view.window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function visualLabFloorMetrics({ view, visible }) { return measureFloorMetrics(view.document.querySelector(".lab-workspace"), {
  textSelector: "h1,h2,h3,p,label,button,input,select,output,.prompt,.small,.lab-meta span", requireText: false,
}, view.window, visible); }

function visualScopeFloorMetrics({ view, visible }, scope) { return measureFloorMetrics(scope, {
  textSelector: "h1,h2,h3,p,label,strong,b,button,input,select,output,.prompt,.small,.model-label,.direct-status", requireText: true,
}, view.window, visible); }

function findVisualOrdinal({ makeThemed }, skill, theme, predicate) {
  for (let ordinal = 0; ordinal < 96; ordinal += 1) {
    const question = makeThemed(skill, "EASY", ordinal, theme);
    if (predicate(question)) return ordinal;
  }
  return -1;
}

async function enterVisualLabTheme({ pause, settleLabRender, view }, theme) {
  if (view.document.querySelector(".lab-question")) {
    view.document.querySelector('[data-lab-action="exit"]')?.click();
    await pause();
  }
  if (!view.document.querySelector(`[data-action="world"][data-world="${CSS.escape(theme)}"]`)) {
    view.document.querySelector('[data-action="home"]')?.click();
    await pause();
  }
  const world = view.document.querySelector(`[data-action="world"][data-world="${CSS.escape(theme)}"]`);
  if (!world) throw new Error(`The child home screen cannot select the ${theme} world.`);
  world.click();
  await pause();
  view.document.querySelector('[data-action="grown"]')?.click();
  await pause();
  view.document.querySelector('[data-lab-action="enter"]')?.click();
  await pause();
  if (!view.document.querySelector(".lab-question")) throw new Error(`Parent Test Lab did not reopen for the ${theme} world.`);
  await settleLabRender(`Parent Test Lab ${theme} world`);
}


async function auditPlacementWrappers({ baseline, engine, pause, placementDraftKey, playDay, replaceActiveFixture, resize, storageKey, tests, titles, view, visible }) {
  const expectedPlacementMethods = PLACEMENT_REACHABLE_METHODS;
  const placementStateLoad = engine.loadState(baseline, playDay);
  if (!placementStateLoad.ok) throw new Error(`Placement visual baseline is invalid: ${placementStateLoad.error}`);
  const placementState = placementStateLoad.state;
  const placementTraversal = placementCases(engine, placementState, playDay);
  const placementProfiles = Object.freeze([
    { viewport: "desktop", width: 1366, height: 768 },
    { viewport: "tablet-portrait", width: 820, height: 1180 },
    { viewport: "ipad-landscape-large", width: 1180, height: 820 },
    { viewport: "ipad-landscape-standard", width: 1024, height: 768 },
    { viewport: "phone", width: 390, height: 844 },
  ]);
  const placementRows = [];
  const placementWrapperRows = [];
  const draftEvidence = { present: false };
  const placementLayoutSnapshot = capturePlacementLayout.bind(null, { placementDraftKey, view, visible });
  for (const witness of placementTraversal.methods) {await auditPlacementWitness({ draftEvidence, engine, pause, placementDraftKey, placementLayoutSnapshot, placementProfiles, placementRows, placementState, placementWrapperRows, replaceActiveFixture, resize, view, witness });}
  const placementMainBytesUnchanged = view.window.localStorage.getItem(storageKey) === baseline;
  const { neutralNotSure, placementDraftRemoved } = await discardVisualPlacementDraft({ pause, placementDraftKey, view });recordPlacementLayout({ draftEvidence, engine, expectedPlacementMethods, neutralNotSure, placementDraftRemoved, placementMainBytesUnchanged, placementProfiles, placementRows, placementTraversal, placementWrapperRows, tests, titles });view.writes = 0;
}

async function auditOfflineStatusPanel({ pause, tests, titles, view }) {
  view.document.querySelector('[data-action="install-help"]')?.click();
  await pause();
  const offlineStatus = view.document.querySelector("[data-pwa-status]");
  const candidateStatus = view.document.querySelector("[data-pwa-update]");
  const candidateError = view.document.querySelector("[data-pwa-update-error]");
  const readinessPanel = view.document.querySelector(".pwa-readiness");
  const activeStatusText = normalized(offlineStatus?.textContent);
  const pwaStatusSeparated = offlineDiagnosticsSeparated({ readinessPanel, offlineStatus, candidateStatus, candidateError, activeStatusText });
  titles["VIS-PWA-STATUS"] = "Active offline readiness and candidate-update status render as separate diagnostics";
  tests["VIS-PWA-STATUS"] = result(pwaStatusSeparated, {
    activeStatus: activeStatusText,
    activePhase: readinessPanel?.dataset.pwaPhase || null,
    candidateStatusNode: Boolean(candidateStatus),
    candidateErrorNode: Boolean(candidateError),
  });
  view.document.querySelector('[data-action="install-close"]')?.click();
  await pause();
}

async function auditVisualLab({ activeStateFactory, baseline, engine, enterLabForTheme, expectedProfiles, findOrdinal, floorMetrics, makeThemed, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, selectCase, storageKey, tests, titles, view, visible, visualSession }) {
  const { byMethod, bySemanticModel } = generatedCaseMap(engine);
  await auditLabControls({ baseline, byMethod, engine, selectCase, storageKey, tests, titles, view });
  await auditLabModels({ bySemanticModel, engine, pause, selectCase, tests, titles, view });
  await auditDesktopLabLayout({ engine, expectedProfiles, pause, resize, selectCase, tests, titles, view, visible });
  await auditMobileLabLayout({ engine, floorMetrics, pause, resize, selectCase, tests, titles, view });
  await auditApprovedChildViews({ activeStateFactory, engine, enterLabForTheme, findOrdinal, makeThemed, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, selectCase, tests, view, visible, visualSession });
}


function visualAuditPlayDay() {
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Halifax",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const playDay = Math.floor(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day) / 86400000);
  return playDay;
}

async function mountVisualAuditFrame({ childNameKey, engine, hostDocument, hostWindow, pause, placementDraftKey, playDay, storageKey, visualSession }) {
  hostWindow.localStorage.setItem(childNameKey, JSON.stringify({ schemaVersion: 1, mode: "named", name: "Pip" }));
  hostWindow.localStorage.setItem(storageKey, engine.exportState(engine.createInitialState(playDay)));
  hostWindow.localStorage.removeItem(placementDraftKey);
  visualSession.frame = hostDocument.createElement("iframe");
  visualSession.frame.title = "Manifest-driven visual regression Parent Test Lab";
  Object.assign(visualSession.frame.style, { position: "fixed", left: "-20000px", top: "0", width: "1366px", height: "768px", opacity: "0", pointerEvents: "none" });
  visualSession.frame.src = `index.html?manifest-visual-regression=${Date.now()}`;
  hostDocument.body.append(visualSession.frame);
  await new Promise(function initialVisualFrameLoad(resolve) {
    const timer = setTimeout(resolve, 5000);
    visualSession.frame.onload = () => { clearTimeout(timer); resolve(); };
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (visualSession.frame.contentDocument?.getElementById("app")?.inert === false) break;
    await pause();
  }

}

async function prepareVisualLab({ pause, settle, storageKey, view, visualSession }) {
  view.window = visualSession.frame.contentWindow;
  view.document = visualSession.frame.contentDocument;
  const settleLabRender = settleVisualLab.bind(null, { settle, view });
  if (view.document.querySelector("[data-progress-protection]")) {
    throw new Error(`Parent Test Lab could not acquire the audit writer lease: ${view.document.body.textContent.trim().slice(0, 240)}`);
  }
  if (view.document.getElementById("app")?.inert) {
    throw new Error("Parent Test Lab remained inert while waiting for the audit writer lease.");
  }
  await settleLabRender("Initial manifest visual-regression frame");
  view.document.querySelector('[data-action="grown"]')?.click();
  await pause();
  const baseline = view.window.localStorage.getItem(storageKey);
  view.writes = 0;
  view.storagePrototype = null;
  view.originalSetItem = null;
  const restoreStorageInstrumentation = restoreVisualStorageInstrumentation.bind(null, { view });
  const instrumentStorage = instrumentVisualStorage.bind(null, { view });
  instrumentStorage();
  return { settleLabRender, baseline, restoreStorageInstrumentation, instrumentStorage };
}

function offlineDiagnosticsSeparated({ readinessPanel, offlineStatus, candidateStatus, candidateError, activeStatusText }) {
  return Boolean(readinessPanel && offlineStatus && candidateStatus && candidateError
    && offlineStatus !== candidateStatus && offlineStatus !== candidateError
    && /^(?:Ready for an offline check|Caching the verified app files|Recovery needed|Online only|Not controlled)/u.test(activeStatusText)
    && !/candidate update|update activation/iu.test(activeStatusText));
}


function capturePlacementLayout({ placementDraftKey, view, visible }, profile, inputMethod) {
  const { screen, missingScreenDiagnostic, shell, question, noticeProbe, response, answer, confirm, notSure, answerRect, confirmRect } = placementWrapperObservation({ labDocument: view.document, labWindow: view.window, placementDraftKey, inputMethod });
  const controlsBeforeConfirm = placementControlsBeforeConfirm({ confirm, labWindow: view.window, response });
  const nestedVerticalOffenders = placementOverflowOffenders({ labWindow: view.window, screen, visible });
  const { essentialMinFont, controls } = placementLegibilityObservations({ labWindow: view.window, shell, visible });
  const { enabledFocusControls, firstFocusReached, lastFocusReached, notSureFocusReached, keyboardFocusReachable } = placementKeyboardReachability({ controls, labDocument: view.document, notSure });
  const minControl = minimumControlSize(controls);
  const noHorizontalOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
  const confirmOnFirstScreen = rectFitsViewport(confirmRect, view.window);
  const naturalOuterFlow = placementNaturalOuterFlow(profile, confirmRect, view.window, view.document);
  const descendantCollisions = placementDescendantCollisions({ answer, visible });
  const noticeBeforeContent = placementNoticePosition({ inputMethod, question, visible });
  const pass = Boolean(placementControlsUsable({ screen, answerRect, confirmRect, notSure, answer, inputMethod, controlsBeforeConfirm })
        && placementContentLegible({ nestedVerticalOffenders, descendantCollisions, noHorizontalOverflow, noticeBeforeContent, keyboardFocusReachable, essentialMinFont, minControl, confirmOnFirstScreen, naturalOuterFlow }));
  const result = {
    viewport: profile.viewport,
    width: profile.width,
    height: profile.height,
    inputMethod: answer?.dataset.inputMethod || null,
    confirmOnFirstScreen,
    naturalOuterFlow,
    controlsBeforeConfirm,
    noHorizontalOverflow,
    essentialMinFont,
    minControl,
    focusableControls: enabledFocusControls.length,
    firstFocusReached,
    lastFocusReached,
    notSureFocusReached,
    keyboardFocusReachable,
    nestedVerticalOffenders,
    descendantCollisions,
    noticeProbeInserted: Boolean(noticeProbe),
    noticeBeforeContent,
    confirmBottom: roundedRectDimension(confirmRect, "bottom"),
    documentScrollHeight: view.document.documentElement.scrollHeight,
    missingScreenDiagnostic,
    pass,
  };
  noticeProbe?.remove();
  return result;
}

function installPlacementSpeechRecorder({ view, witness }) {
  const speechCalls = [];
  const localVoice = {
    voiceURI: `placement-${witness.inputMethod.toLowerCase()}-local`,
    name: "Math Quest placement audit voice",
    lang: "en-CA",
    localService: true,
    default: true,
  };
  class PlacementAuditUtterance {
    constructor(text) {
      this.text = String(text);
      this.rate = 1;
      this.voice = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  Object.defineProperty(view.window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: PlacementAuditUtterance,
  });
  Object.defineProperty(view.window, "speechSynthesis", {
    configurable: true,
    value: {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [localVoice],
      cancel() {},
      speak(utterance) {
        speechCalls.push(String(utterance?.text || ""));
        view.window.queueMicrotask(() => utterance?.onend?.());
      },
      pause() {},
      resume() {},
    },
  });

  return speechCalls;
}

async function replayPlacementSpeech({ view, witness, pause }) {
  const speechCalls = installPlacementSpeechRecorder({ view, witness });
  const replay = view.document.querySelector('[data-action="replay"]');
  replay?.click();
  await pause();
  await pause();
  const spoken = normalized(speechCalls.at(-1));
  const promptSpoken = Boolean(spoken && spoken.includes(normalized(witness.question.prompt)));
  const renderedAnswer = view.document.querySelector(
    '[data-placement-screen][data-placement-phase="question"] .question-response .answer-controls[data-input-method]',
  );
  const optionLabels = witness.question.inputClass === "SELECTION"
    ? [...(renderedAnswer?.querySelectorAll('[data-action="select"][aria-label]') || [])]
      .map((option) => normalized(option.getAttribute("aria-label"))).filter(Boolean)
    : [];
  const optionsSpoken = optionLabels.length === 0
          || optionLabels.every((label) => spoken.includes(label));
  const positionalCueSpoken = optionLabels.length === 0
          || /(?:\boption\b|\bchoice\b|\bfirst\b|\bsecond\b|\bthird\b|\bfourth\b|\bleft\b|\bright\b|\btop\b|\bbottom\b|\b1\b|\b2\b)/iu.test(spoken);


  return { speechCalls, spoken, promptSpoken, optionLabels, optionsSpoken, positionalCueSpoken };
}

async function auditPlacementWitness({ draftEvidence, engine, pause, placementDraftKey, placementLayoutSnapshot, placementProfiles, placementRows, placementState, placementWrapperRows, replaceActiveFixture, resize, view, witness }) {

  await replaceActiveFixture(placementState, `placement-${witness.inputMethod}`, {
    placementDraft: placementDraftRecord(engine, placementState, witness.run, witness.question),
  });

  const { speechCalls, spoken, promptSpoken, optionLabels, optionsSpoken, positionalCueSpoken } = await replayPlacementSpeech({ view, witness, pause });
  for (const profile of placementProfiles) {
    await resize(profile.width, profile.height);
    draftEvidence.present ||= Boolean(view.window.localStorage.getItem(placementDraftKey));
    const layout = placementLayoutSnapshot(profile, witness.inputMethod);
    placementRows.push({
      ...layout,
      skillId: witness.question.skillId,
      questionId: witness.question.questionId,
      inputClass: witness.question.inputClass,
      replayCalls: speechCalls.length,
      promptSpoken,
      spoken,
      optionLabels,
      optionCount: optionLabels.length,
      optionsSpoken,
      positionalCueSpoken,
      pass: layout.pass
              && speechCalls.length === 1
              && promptSpoken
              && optionsSpoken
              && positionalCueSpoken,
    });
  }

  if (witness.inputMethod === "SHARE_DEAL") {
    for (const wrapperProfile of [
      { viewport: "desktop", width: 1366, height: 768, allowNaturalOuterFlow: false },
      { viewport: "tablet-portrait", width: 820, height: 1180, allowNaturalOuterFlow: false },
      { viewport: "ipad-landscape-large", width: 1180, height: 820, allowNaturalOuterFlow: false },
      { viewport: "ipad-landscape-standard", width: 1024, height: 768, allowNaturalOuterFlow: false },
      { viewport: "phone", width: 390, height: 844, allowNaturalOuterFlow: false },
      { viewport: "landscape-phone", width: 844, height: 390, allowNaturalOuterFlow: true },
    ]) {
      await resize(wrapperProfile.width, wrapperProfile.height);
      placementWrapperRows.push(placementLayoutSnapshot(wrapperProfile, witness.inputMethod));
    }
  }


}

async function discardVisualPlacementDraft({ pause, placementDraftKey, view }) {
  const notSureControl = view.document.querySelector('[data-action="placement-not-sure"]');
  notSureControl?.click();
  await pause();
  const notSureOutcome = view.document.querySelector('.feedback-state[data-feedback-state="neutral"]');
  const neutralNotSure = Boolean(
    notSureControl
        && notSureOutcome
        && view.document.activeElement === notSureOutcome
        && normalized(notSureOutcome.querySelector("strong")?.textContent) === "Not sure. Let’s try another."
  );
  view.document.querySelector('[data-action="placement-next"]')?.click();
  await pause();
  view.document.querySelector('[data-action="placement-pause"]')?.click();
  await pause();
  view.document.querySelector('[data-action="placement-discard"]')?.click();
  await pause();
  const placementDraftRemoved = view.window.localStorage.getItem(placementDraftKey) === null;

  return { neutralNotSure, placementDraftRemoved };
}

function recordPlacementLayout({ draftEvidence, engine, expectedPlacementMethods, neutralNotSure, placementDraftRemoved, placementMainBytesUnchanged, placementProfiles, placementRows, placementTraversal, placementWrapperRows, tests, titles }) {
  const placementMethodNames = [...new Set(placementRows.map((row) => row.inputMethod))].sort();
  const expectedPlacementMethodNames = [...expectedPlacementMethods].sort();
  const profileCounts = Object.fromEntries(placementProfiles.map((profile) => [
    profile.viewport,
    placementRows.filter((row) => row.viewport === profile.viewport).length,
  ]));
  const profileCountValues = Object.values(profileCounts);
  const profilesBalanced = profileCountValues.every((count) => count === expectedPlacementMethods.length);
  titles["VIS-PLACEMENT-LAYOUT"] = "Every reachable starting-point control is legible, actionable, and narratable in the child placement wrapper";
  tests["VIS-PLACEMENT-LAYOUT"] = result(
    placementTraversal.rows.every((row) => row.pass)
          && placementRows.length === expectedPlacementMethods.length * placementProfiles.length
          && engine.canonical(placementMethodNames) === engine.canonical(expectedPlacementMethodNames)
          && placementRows.every((row) => row.pass)
          && exactPassingRows(placementWrapperRows, 6)
          && profilesBalanced
          && placementMainBytesUnchanged
          && draftEvidence.present
          && neutralNotSure
          && placementDraftRemoved,
    {
      adaptiveBoundaries: placementTraversal.rows,
      methods: placementRows,
      profileCounts,
      profilesBalanced,
      wrapperProfiles: placementWrapperRows,
      mainBytesUnchanged: placementMainBytesUnchanged,
      separateDraftPresent: draftEvidence.present,
      neutralNotSure,
      draftRemovedAfterDiscard: placementDraftRemoved,
      matrixPolicy: "Each of the exact 29 placement-reachable methods is rendered at desktop, tablet portrait, both iPad-landscape sizes, and phone; the dense SHARE_DEAL wrapper additionally exercises short landscape-phone natural flow.",
      ipadEvidencePolicy: "The 1180x820 and 1024x768 rows are automated rendered-browser geometry and focus evidence only. Physical iPad Safari, touch, software-keyboard, and VoiceOver evidence remains pending until run on a real device; automation cannot convert it to PASS.",
      landscapePolicy: "844x390 may use natural outer-document flow; nested scrolling and horizontal overflow remain forbidden.",
    },
  );


}


function exactPassingRows(rows, expectedLength) {
  return rows.length === expectedLength && rows.every((row) => row.pass);
}


async function auditLabControls({ baseline, byMethod, engine, selectCase, storageKey, tests, titles, view }) {
  const methodRows = [];
  for (const [method, auditCase] of byMethod) {
    const question = await selectCase(auditCase);
    const wrapper = view.document.querySelector('.answer-controls[data-control-mode="lab"]');
    methodRows.push({
      method,
      skillId: auditCase.skill.skillId,
      inputClass: question.inputClass,
      pass: controlContract(wrapper, question),
      controlFamily: wrapper?.dataset.controlFamily || null,
    });
  }
  const storageUnchanged = view.window.localStorage.getItem(storageKey) === baseline && view.writes === 0;
  const methodNames = methodRows.map((row) => row.method).sort();
  titles["VIS-LAB-CONTROLS"] = "Parent Test Lab renders every exact release-reachable input method without writing progress";
  tests["VIS-LAB-CONTROLS"] = result(
    methodRows.length === RELEASE_REACHABLE_METHODS.length
            && engine.canonical(methodNames) === engine.canonical(RELEASE_REACHABLE_METHODS)
            && methodRows.every((row) => row.pass)
            && storageUnchanged
            && isolatedLabQuestion(view.document),
    {
      methods: methodRows,
      expectedMethods: RELEASE_REACHABLE_METHODS,
      rendererOnlyExcluded: ["NUMBER_BOND", "NUMBER_CHOICE"],
      writes: view.writes,
      bytesIdentical: view.window.localStorage.getItem(storageKey) === baseline,
    },
  );
}

async function auditLabModels({ bySemanticModel, engine, pause, selectCase, tests, titles, view }) {
  const modelRows = [];
  for (const [semanticKey, auditCase] of bySemanticModel) {
    modelRows.push(await inspectLabModel({ auditCase, semanticKey, selectCase, view, pause }));
  }
  const practiceTokenSemanticRows = modelRows.filter((row) => row.skillId === "MQ-048");
  const practiceTokenSemanticIds = [...new Set(practiceTokenSemanticRows.map((row) => row.tokenId).filter(Boolean))].sort();
  const expectedPracticeTokenIds = PRACTICE_TOKEN_VISUAL_ORACLE.map((row) => row.tokenId).sort();
  const practiceTokenSemanticsExact = practiceTokenSemanticRows.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
          && engine.canonical(practiceTokenSemanticIds) === engine.canonical(expectedPracticeTokenIds);
  titles["VIS-LAB-MODELS"] = "Every semantically renderable prompt/model variant appears as derived math in Parent Test Lab";
  tests["VIS-LAB-MODELS"] = result(modelRows.every((row) => row.pass) && practiceTokenSemanticsExact, {
    models: modelRows,
    practiceTokenSemantics: practiceTokenSemanticRows,
    practiceTokenSemanticsExact,
  });
}

async function auditDesktopLabLayout({ engine, expectedProfiles, pause, resize, selectCase, tests, titles, view, visible }) {
  const profileCases = expectedProfiles.map((profile) => ({
    profile,
    skill: engine.SKILLS.find((skill) => skill.generatorProfile === profile),
    tier: "HARD/TARGET",
    ordinal: 0,
  }));
  const desktopRows = [];
  for (const [width, height, viewport] of [
    [1366, 768, "desktop"],
    [820, 1180, "tablet-portrait"],
    [1180, 820, "ipad-landscape-large"],
    [1024, 768, "ipad-landscape-standard"],
  ]) {
    await resize(width, height);
    for (const auditCase of profileCases) {
      if (!auditCase.skill) {
        desktopRows.push({ profile: auditCase.profile, viewport, pass: false, reason: "capability absent" });
        continue;
      }
      await selectCase(auditCase);
      view.window.scrollTo(0, 0);
      await pause();
      const toggle = view.document.querySelector('[data-lab-action="model"]');
      if (toggle && !toggle.disabled && /show/iu.test(toggle.textContent)) {
        toggle.click();
        await pause();
      }
      view.window.scrollTo(0, 0);
      await pause();
      desktopRows.push(captureDesktopLabLayout({ auditCase, viewport, view, visible }));
    }
  }
  titles["VIS-DESKTOP-LAYOUT"] = "Every generator profile keeps complete Parent Test answers, controls, and focus visible at desktop, tablet, and iPad-landscape sizes";
  tests["VIS-DESKTOP-LAYOUT"] = result(desktopRows.every((row) => row.pass), {
    inspected: desktopRows.length,
    failures: desktopRows.filter((row) => !row.pass).slice(0, 10),
    ipadEvidencePolicy: "1180x820 and 1024x768 are automated rendered-browser geometry and focus rows; physical iPad Safari, software-keyboard, touch, and VoiceOver evidence remains pending.",
  });
}

async function auditMobileLabLayout({ engine, floorMetrics, pause, resize, selectCase, tests, titles, view }) {
  await resize(390, 844);
  const levelCases = engine.LEVELS.map((level) => ({
    level: level.number,
    skill: engine.SKILLS.find((skill) => skill.level === level.number),
    tier: "EASY",
    ordinal: 0,
  }));
  const mobileRows = [];
  for (const auditCase of levelCases) {
    if (!auditCase.skill) {
      mobileRows.push({ level: auditCase.level, pass: false, reason: "level has no skill" });
      continue;
    }
    await selectCase(auditCase);
    view.window.scrollTo(0, 0);
    await pause();
    mobileRows.push(captureMobileLabLayout({ auditCase, view, floorMetrics }));
  }
  titles["VIS-MOBILE-LAYOUT"] = "Every manifest level is question-first, legible, and actionable at 390×844";
  tests["VIS-MOBILE-LAYOUT"] = result(mobileRows.length === engine.LEVELS.length && mobileRows.every((row) => row.pass), {
    inspected: mobileRows.length,
    failures: mobileRows.filter((row) => !row.pass).slice(0, 10),
  });
}

async function auditApprovedChildViews({ activeStateFactory, engine, enterLabForTheme, findOrdinal, makeThemed, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, selectCase, tests, view, visible, visualSession }) {
  visualSession.approvedChecksStarted = true;
  const approvedEarlyRows = [];
  const mq002 = engine.SKILL_BY_ID["MQ-002"];
  const mq006 = engine.SKILL_BY_ID["MQ-006"];
  if (!mq002 || !mq006) throw new Error("Approved early-fix skills MQ-002 and MQ-006 must remain in the curriculum.");
  const { approvedViewports, mq002Source } = await auditThemedCounters({ approvedEarlyRows, enterLabForTheme, findOrdinal, makeThemed, mq002, pause, resize, scopedFloorMetrics, selectCase, view, visible });
  await auditDurationChoices({ approvedEarlyRows, approvedViewports, enterLabForTheme, makeThemed, mq006, pause, resize, scopedFloorMetrics, selectCase, view, visible });
  recordEarlyLabResults({ approvedEarlyRows, tests });
  const { feedbackRows, feedbackFixtureError } = await auditChildFeedback({ activeStateFactory, engine, findOrdinal, mq002, mq002Source, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, view, visible });
  const { practiceTokenRows, practiceTokenGuideRows, practiceTokenFixtureError } = await auditPracticeTokenViews({ activeStateFactory, engine, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, view, visible });
  recordApprovedViewportResults({ approvedEarlyRows, engine, feedbackFixtureError, feedbackRows, practiceTokenFixtureError, practiceTokenGuideRows, practiceTokenRows, tests });
  visualSession.approvedChecksComplete = true;
}

function isolatedLabQuestion(labDocument) {
  const question = labDocument.querySelector(".lab-question");
  return question?.dataset.labMode === "isolated" && question?.dataset.storageIntact === "true";
}


const VISUAL_MODEL_VARIANTS = Object.freeze({
  "MQ-099": ({ question, view }) => {
    let variantRendered = true;
    if (question.params.place === "hundredths") {
      const grid = view.document.querySelector('.decimal-hundred-grid[data-place="hundredths"]');
      variantRendered = Boolean(grid && grid.querySelectorAll("i").length === 100
                && grid.querySelectorAll("i.on").length === Number(question.params.whole) * 100 + Number(question.params.fractional));
    } else {
      variantRendered = view.document.querySelectorAll('.fraction-strip[data-place="tenths"] i').length === 10;
    }
    return variantRendered;
  },
  "MQ-114": ({ question, view }) => {
    let variantRendered = true;
    const array = view.document.querySelector(".array-exact");
    variantRendered = Boolean(array?.dataset.remainderInterpretation === question.params.interpretation
              && normalized(array.querySelector(".array-interpretation")?.textContent));
    return variantRendered;
  },
  "MQ-122": ({ question, view }) => {
    let variantRendered = true;
    const volume = view.document.querySelector(`.prism-visual[data-volume-representation="${CSS.escape(question.params.representation)}"]`);
    const prism = volume?.querySelector(".isometric-prism");
    const noAnswerLeak = !volume?.querySelector(".visual-number");
    const spatialMarks = prism?.querySelectorAll("g,polygon,polyline").length || 0;
    variantRendered = Boolean(volume && prism && spatialMarks > 0 && noAnswerLeak
            && prismDimensionsMatch(volume, question.params));
    return variantRendered;
  },
  "MQ-123": ({ question, view }) => {
    let variantRendered = true;
    const span = view.document.querySelector(".clock-span");
    const labels = [...view.document.querySelectorAll(".clock-card strong")].map((node) => normalized(node.textContent));
    variantRendered = Boolean(span?.dataset.timeFormat === question.params.format
              && labels.some((label) => label.includes(question.params.startTime))
              && labels.some((label) => label.includes(question.params.endTime)));
    return variantRendered;
  }
});

function renderedModelVariant(question, view) {
  const check = typeof question.skillId === "string" && Object.hasOwn(VISUAL_MODEL_VARIANTS, question.skillId) && VISUAL_MODEL_VARIANTS[question.skillId];
  return check ? check({ question, view }) : true;
}

function renderableModelData(type, values) {
  return type !== "visualPrompt" || values.items?.length || values.parts?.length || values.representations?.length;
}

function canShowDerivedModel(rendered, toggle) {
  return !rendered && toggle && !toggle.disabled && /show/iu.test(toggle.textContent);
}

function prismDimensionsMatch(volume, params) {
  return Number(volume.dataset.length) === Number(params.length) && Number(volume.dataset.width) === Number(params.width)
    && Number(volume.dataset.height) === Number(params.height);
}


async function inspectLabModel({ auditCase, semanticKey, selectCase, view, pause }) {

  const question = await selectCase(auditCase);
  const type = question.modelDescriptor.type;
  const toggle = view.document.querySelector('[data-lab-action="model"]');
  const descriptorValues = question.modelDescriptor.values;
  const modelHasRenderableData = renderableModelData(type, descriptorValues);
  let rendered = Boolean(view.document.querySelector(`.math-model[data-model-family="${CSS.escape(type)}"][data-model-derived="true"]`));
  if (canShowDerivedModel(rendered, toggle)) {
    toggle.click();
    await pause();
    rendered = Boolean(view.document.querySelector(`.math-model[data-model-family="${CSS.escape(type)}"][data-model-derived="true"]`));
  }
  const variantRendered = renderedModelVariant(question, view);

  return { semanticKey, type, promptId: question.semanticPromptStringId, skillId: auditCase.skill.skillId, tokenId: question.params?.tokenId || null, modelHasRenderableData: Boolean(modelHasRenderableData), rendered, variantRendered, pass: !modelHasRenderableData || rendered && variantRendered };
}

function focusControlEndpoints(controls, labDocument) {
  const enabledControls = controls.filter((control) => !control.disabled && control.tabIndex >= 0);
  const firstControl = enabledControls[0] || null;
  const lastControl = enabledControls.at(-1) || null;
  const firstFocused = focusReaches(firstControl, labDocument);
  const lastFocused = focusReaches(lastControl, labDocument);
  return { enabledControls, firstFocused, lastFocused };
}

function meetsSizeFloors(metrics, minimumFont, minimumControl) {
  return metrics.minFont >= minimumFont && metrics.minControl >= minimumControl;
}


function captureDesktopLabLayout({ auditCase, viewport, view, visible }) {
  const article = view.document.querySelector(".lab-question");
  const grade = view.document.querySelector('[data-lab-action="grade"]');
  const answer = view.document.querySelector(".answer-controls");
  const gradeRect = grade?.getBoundingClientRect();
  const answerRect = answer?.getBoundingClientRect();
  const controls = visibleNodes(article, "button,input,select,textarea", visible);
  const { enabledControls, firstFocused, lastFocused } = focusControlEndpoints(controls, view.document);
  const everyControlVisible = controls.length > 0 && controls.every((control) => {
    const rect = control.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= view.window.innerWidth + 1
                && rect.top >= -1 && rect.bottom <= view.window.innerHeight + 1;
  });
  const keyboardFocusReachable = enabledControls.length > 0
              && enabledControls.every((control) => /^(?:BUTTON|INPUT|SELECT|TEXTAREA)$/u.test(control.tagName))
              && firstFocused && lastFocused;
  const noOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
  const pass = desktopLabLayoutPass({ article, gradeRect, answerRect, view, everyControlVisible, keyboardFocusReachable, noOverflow });

  return {
    profile: auditCase.profile,
    skillId: auditCase.skill.skillId,
    viewport,
    pass,
    answerTop: answerRect && Math.round(answerRect.top),
    answerBottom: answerRect && Math.round(answerRect.bottom),
    gradeBottom: gradeRect && Math.round(gradeRect.bottom),
    controls: controls.length,
    everyControlVisible,
    firstFocused,
    lastFocused,
    keyboardFocusReachable,
    noOverflow,
  };
}

function captureMobileLabLayout({ auditCase, view, floorMetrics }) {
  const workspace = view.document.querySelector(".lab-workspace");
  const article = view.document.querySelector(".lab-question");
  const controls = view.document.querySelector(".lab-controls");
  const grade = view.document.querySelector('[data-lab-action="grade"]');
  const articleRect = article?.getBoundingClientRect();
  const controlsRect = controls?.getBoundingClientRect();
  const gradeRect = grade?.getBoundingClientRect();
  const metrics = floorMetrics();
  const questionFirst = labQuestionComesFirst(workspace, article, articleRect, controlsRect);
  const noOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
  const inViewport = Boolean(gradeRect && gradeRect.bottom <= view.window.innerHeight + 1);
  const pass = questionFirst && noOverflow && inViewport && meetsSizeFloors(metrics, 16, 44);

  return { level: auditCase.level, skillId: auditCase.skill.skillId, pass, questionFirst, noOverflow, inViewport, ...metrics };
}

function desktopLabLayoutPass({ article, gradeRect, answerRect, view, everyControlVisible, keyboardFocusReachable, noOverflow }) {
  return Boolean(article && gradeRect && answerRect && answerRect.top >= -1 && answerRect.bottom <= view.window.innerHeight + 1
    && gradeRect.top >= -1 && gradeRect.bottom <= view.window.innerHeight + 1 && everyControlVisible && keyboardFocusReachable && noOverflow);
}

function labQuestionComesFirst(workspace, article, articleRect, controlsRect) {
  return Boolean(workspace?.dataset.narrowOrder === "question-first" && article?.dataset.questionFirst === "true"
    && articleRect && controlsRect && articleRect.top < controlsRect.top);
}


async function auditThemedCounters({ approvedEarlyRows, enterLabForTheme, findOrdinal, makeThemed, mq002, pause, resize, scopedFloorMetrics, selectCase, view, visible }) {
  const glyphKinds = Object.freeze({ ocean: "shell", forest: "acorn", space: "moon-rock" });
  const glyphFingerprints = new Map();
  const approvedViewports = Object.freeze([
    Object.freeze([1366, 768, "desktop"]),
    Object.freeze([390, 844, "phone"]),
  ]);
  const mq002Source = (question) => {
    const item = question.modelDescriptor?.values?.items?.find((entry) => (
      normalized(entry?.kind).toLowerCase() === "counterset"
    ));
    return {
      count: Number(item?.magnitude),
      objectKind: normalized(item?.objectKind).toLowerCase(),
      paramsCount: Number(question.modelDescriptor?.values?.data?.count),
    };
  };
  for (const theme of Object.keys(glyphKinds)) {await auditCounterTheme({ approvedEarlyRows, approvedViewports, enterLabForTheme, findOrdinal, glyphFingerprints, glyphKinds, makeThemed, mq002, mq002Source, pause, resize, scopedFloorMetrics, selectCase, theme, view, visible });}
  for (const [, , viewport] of approvedViewports) {
    const viewportFingerprints = Object.keys(glyphKinds).map((theme) => glyphFingerprints.get(`${viewport}:${theme}`) || "");
    approvedEarlyRows.push({
      family: "MQ-002-DISTINCT",
      viewport,
      fingerprints: viewportFingerprints,
      visualPass: viewportFingerprints.every(Boolean) && new Set(viewportFingerprints).size === Object.keys(glyphKinds).length,
      controlPass: true,
      layoutPass: true,
    });
  }
  return { approvedViewports, mq002Source };
}

async function auditDurationChoices({ approvedEarlyRows, approvedViewports, enterLabForTheme, makeThemed, mq006, pause, resize, scopedFloorMetrics, selectCase, view, visible }) {
  await enterLabForTheme("ocean");
  for (const ordinal of [0, 1, 2]) {
    await resize(1366, 768);
    await selectCase({ skill: mq006, tier: "EASY", ordinal });
    const question = makeThemed(mq006, "EASY", ordinal, "ocean");
    let selectionWorks = false;
    for (const [width, height, viewport] of approvedViewports) {selectionWorks = await inspectDurationViewport({ approvedEarlyRows, height, ordinal, pause, question, resize, scopedFloorMetrics, selectionWorks, view, viewport, visible, width });}
  }

}

function recordEarlyLabResults({ approvedEarlyRows, tests }) {
  const baseControlResult = tests["VIS-LAB-CONTROLS"];
  const baseModelResult = tests["VIS-LAB-MODELS"];
  tests["VIS-LAB-CONTROLS"] = result(
    baseControlResult.pass && approvedEarlyRows.every((row) => row.controlPass),
    {
      base: JSON.parse(baseControlResult.details),
      approvedEarlyControls: approvedEarlyRows.map((row) => ({
        family: row.family,
        theme: row.theme,
        viewport: row.viewport,
        ordinal: row.ordinal,
        pass: row.controlPass,
      })),
    },
  );
  tests["VIS-LAB-MODELS"] = result(
    baseModelResult.pass && approvedEarlyRows.every((row) => row.visualPass),
    {
      base: JSON.parse(baseModelResult.details),
      approvedEarlyVisuals: approvedEarlyRows.map((row) => ({
        family: row.family,
        theme: row.theme,
        viewport: row.viewport,
        ordinal: row.ordinal,
        pass: row.visualPass,
        optionCount: row.optionCount,
        optionEvents: row.optionEvents,
        optionTracks: row.optionTracks,
        redundantSourceCount: row.redundantSourceCount,
      })),
    },
  );

}

async function auditChildFeedback({ activeStateFactory, engine, findOrdinal, mq002, mq002Source, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, view, visible }) {
  const advanceChildToQuestion = advanceVisualChildQuestion.bind(null, { pause, view });
  const submitPairing = submitVisualPairing.bind(null, { advanceChildToQuestion, pause, view });
  const submitIncorrectCountTouch = submitVisualIncorrectCount.bind(null, { pause, view });
  const feedbackSnapshot = captureChildFeedback.bind(null, { scopedFloorMetrics, view, visible });
  const feedbackRows = [];
  let feedbackFixtureError = null;
  try {
    await collectChildFeedbackRows({ activeStateFactory, engine, feedbackRows, feedbackSnapshot, findOrdinal, mq002, mq002Source, pause, playDay, replaceActiveFixture, resize, submitIncorrectCountTouch, submitPairing, view });
  } catch (error) {
    feedbackFixtureError = String(error?.stack || error?.message || error);
    appendMissingFeedbackRows(feedbackRows, feedbackFixtureError);
  }
  return { feedbackRows, feedbackFixtureError };
}

async function auditPracticeTokenViews({ activeStateFactory, engine, pause, playDay, replaceActiveFixture, resize, scopedFloorMetrics, view, visible }) {
  const practiceTokenRows = [];
  const practiceTokenGuideRows = [];
  let practiceTokenFixtureError = null;
  try {
    if (typeof activeStateFactory !== "function") {
      throw new Error("The visual audit did not receive its validated active-state fixture factory.");
    }
    const skill = engine.SKILL_BY_ID["MQ-048"];
    if (!skill) throw new Error("The exact MQ-048 practice-token visual obligation is unavailable.");

    const optionOracle = PRACTICE_TOKEN_VISUAL_ORACLE.map((row) => row.value).sort();
    const fixtures = findPracticeTokenFixtures({ engine, skill, activeStateFactory, playDay, optionOracle });

    const guideState = JSON.parse(JSON.stringify(fixtures[0].state));
    guideState.skills["MQ-048"].acquisition = "LEARNING";
    guideState.activeSession.uiState.phase = "practice-token-guide";
    guideState.activeSession.uiState.modelTouched = false;
    const practiceTokenGuideSnapshot = capturePracticeTokenGuide.bind(null, { engine, guideState, scopedFloorMetrics, view, visible });
    for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
      await resize(profile.width, profile.height);
      await replaceActiveFixture(guideState, `practice-token-first-use-guide-${profile.viewport}`);
      practiceTokenGuideRows.push(practiceTokenGuideSnapshot(profile));
    }

    const practiceTokenSnapshot = capturePracticeTokenState.bind(null, { engine, optionOracle, scopedFloorMetrics, view, visible });

    for (const fixture of fixtures) {await auditPracticeTokenJourney({ fixture, pause, practiceTokenRows, practiceTokenSnapshot, replaceActiveFixture, resize, view, visible });}
  } catch (error) {
    practiceTokenFixtureError = String(error?.stack || error?.message || error);
  }
  return { practiceTokenRows, practiceTokenGuideRows, practiceTokenFixtureError };
}

function recordApprovedViewportResults({ approvedEarlyRows, engine, feedbackFixtureError, feedbackRows, practiceTokenFixtureError, practiceTokenGuideRows, practiceTokenRows, tests }) {
  const baseDesktopResult = tests["VIS-DESKTOP-LAYOUT"];
  const baseMobileResult = tests["VIS-MOBILE-LAYOUT"];
  const desktopApproved = approvedEarlyRows.filter((row) => row.viewport === "desktop");
  const phoneApproved = approvedEarlyRows.filter((row) => row.viewport === "phone");
  const desktopFeedback = feedbackRows.filter((row) => row.viewport === "desktop");
  const phoneFeedback = feedbackRows.filter((row) => row.viewport === "phone");
  const desktopPracticeTokens = practiceTokenRows.filter((row) => row.viewport !== "phone");
  const phonePracticeTokens = practiceTokenRows.filter((row) => row.viewport === "phone");
  const desktopPracticeTokenGuides = practiceTokenGuideRows.filter((row) => row.viewport !== "phone");
  const phonePracticeTokenGuides = practiceTokenGuideRows.filter((row) => row.viewport === "phone");
  const evidence = practiceTokenMatrixEvidence(engine, practiceTokenRows);
  const shared = { ...evidence, feedbackFixtureError, practiceTokenFixtureError };
  tests["VIS-DESKTOP-LAYOUT"] = approvedViewportResult(baseDesktopResult, {
    approved: desktopApproved, feedback: desktopFeedback, tokens: desktopPracticeTokens, guides: desktopPracticeTokenGuides,
    expectedTokenRows: evidence.expectedDesktopPracticeTokenRows,
    expectedGuideRows: PRACTICE_TOKEN_VISUAL_VIEWPORTS.filter((row) => row.viewport !== "phone").length,
    policy: "Every one of the exact five MQ-048 token/value fixtures renders in ordinary, different-example Notice, and real incorrect-feedback states, returns explicitly to its source question, and keeps its distinct nonphysical first-use legend free of answer controls at desktop, tablet portrait, and both automated iPad-landscape viewports.",
  }, shared);
  tests["VIS-MOBILE-LAYOUT"] = approvedViewportResult(baseMobileResult, {
    approved: phoneApproved, feedback: phoneFeedback, tokens: phonePracticeTokens, guides: phonePracticeTokenGuides,
    expectedTokenRows: evidence.expectedPhonePracticeTokenRows, expectedGuideRows: 1,
    policy: "Every one of the exact five MQ-048 token/value fixtures renders in ordinary, different-example Notice, and real incorrect-feedback states, returns explicitly to its source question, and keeps its distinct nonphysical first-use legend free of answer controls at 390x844.",
  }, shared);

}


function practiceTokenMatrixEvidence(engine, practiceTokenRows) {
  const requiredPracticeTokenObligations = practiceTokenVisualObligations();
  const requiredPracticeTokenKeys = requiredPracticeTokenObligations.map(practiceTokenVisualRowKey).sort();
  const observedPracticeTokenKeys = practiceTokenRows.map(practiceTokenVisualRowKey).sort();
  const practiceTokenObligationsExact = engine.canonical(observedPracticeTokenKeys)
          === engine.canonical(requiredPracticeTokenKeys);
  const expectedDesktopPracticeTokenRows = requiredPracticeTokenObligations
    .filter((row) => row.viewport !== "phone").length;
  const expectedPhonePracticeTokenRows = requiredPracticeTokenObligations
    .filter((row) => row.viewport === "phone").length;
  const practiceTokenFingerprints = Object.fromEntries(PRACTICE_TOKEN_VISUAL_ORACLE.map(({ tokenId }) => [
    tokenId,
    practiceTokenRows.find((row) => row.tokenId === tokenId)?.fingerprint || "",
  ]));
  const practiceTokenFingerprintsDistinct = Object.values(practiceTokenFingerprints).every(Boolean)
          && new Set(Object.values(practiceTokenFingerprints)).size === PRACTICE_TOKEN_VISUAL_ORACLE.length;

  return { practiceTokenObligationsExact, expectedDesktopPracticeTokenRows, expectedPhonePracticeTokenRows, practiceTokenFingerprints, practiceTokenFingerprintsDistinct };
}

function approvedViewportResult(base, { approved, feedback, tokens, guides, expectedTokenRows, expectedGuideRows, policy }, shared) {
  return result(base.pass && approved.every((row) => row.visualPass && row.controlPass && row.layoutPass)
    && feedback.every((row) => row.visualPass && row.controlPass && row.layoutPass)
    && exactPassingRows(tokens, expectedTokenRows) && exactPassingRows(guides, expectedGuideRows)
    && shared.practiceTokenObligationsExact && shared.practiceTokenFingerprintsDistinct, {
    base: JSON.parse(base.details), approvedEarly: approved, childFeedback: feedback,
    childFeedbackFixtureError: shared.feedbackFixtureError, practiceTokens: tokens, practiceTokenGuides: guides,
    expectedPracticeTokenRows: expectedTokenRows, practiceTokenFingerprints: shared.practiceTokenFingerprints,
    practiceTokenFingerprintsDistinct: shared.practiceTokenFingerprintsDistinct,
    practiceTokenObligationsExact: shared.practiceTokenObligationsExact, practiceTokenFixtureError: shared.practiceTokenFixtureError,
    practiceTokenPolicy: policy,
  });
}


async function advanceVisualChildQuestion({ pause, view }) {
  for (let step = 0; step < 8; step += 1) {
    const pick = view.document.querySelector('[data-action="choose-question"]');
    if (pick) {
      pick.click();
      await pause();
      continue;
    }
    if (view.document.querySelector(".question-response")) return;
    await pause();
  }
  throw new Error("The child session did not reach an answerable question.");
}

async function submitVisualPairing({ advanceChildToQuestion, pause, view }, { advance = true } = {}) {
  if (advance) await advanceChildToQuestion();
  const target = childPairingTarget(view.document);
  for (let index = 0; index < target; index += 1) {
    const left = view.document.querySelector(`.pair-row:first-child .pair-object[data-item-id="a${index}"]:not(:disabled)`);
    if (!left) throw new Error(`PAIR_LINK left object ${index + 1} is unavailable.`);
    left.click();
    await pause();
    const right = view.document.querySelector(`.pair-row:nth-child(2) .pair-object[data-item-id="b${index}"]:not(:disabled)`);
    if (!right) throw new Error(`PAIR_LINK right object ${index + 1} is unavailable.`);
    right.click();
    await pause();
  }
  const confirm = view.document.querySelector('[data-action="confirm"]');
  if (!confirm || confirm.disabled) throw new Error("PAIR_LINK did not enable Confirm after a complete construction.");
  confirm.click();
  await pause();
  await pause();
  return { method: "PAIR_LINK", pairCount: target };
}

async function submitVisualIncorrectCount({ pause, view }) {
  let task = view.document.querySelector('.count-touch-task[data-response-kind="COUNT_TOUCH"]');
  if (!task) throw new Error("The explicit incorrect-feedback fixture is not a COUNT_TOUCH question.");
  const itemIds = [...task.querySelectorAll('[data-response-action="count-touch"][data-item-id]')]
    .map((button) => button.dataset.itemId);
  for (const itemId of itemIds) {
    const item = view.document.querySelector(
      `.count-touch-task [data-response-action="count-touch"][data-item-id="${CSS.escape(itemId)}"]:not([aria-pressed="true"])`,
    );
    if (!item) throw new Error(`COUNT_TOUCH object ${itemId} is unavailable before completion.`);
    item.click();
    await pause();
  }
  task = view.document.querySelector('.count-touch-task[data-response-kind="COUNT_TOUCH"]');
  const wrongChoice = [...task.querySelectorAll('[data-response-action="count-number"][data-count-value]')]
    .find((button) => Number(button.dataset.countValue) !== itemIds.length);
  if (!wrongChoice) throw new Error("COUNT_TOUCH did not expose a legitimate incorrect count choice.");
  const reportedCount = Number(wrongChoice.dataset.countValue);
  wrongChoice.click();
  await pause();
  const confirm = view.document.querySelector('[data-action="confirm"]');
  if (!confirm || confirm.disabled) {
    throw new Error("COUNT_TOUCH did not enable Confirm after every object and an explicit count were selected.");
  }
  confirm.click();
  await pause();
  await pause();
  return { method: "COUNT_TOUCH", objectCount: itemIds.length, reportedCount };
}

function captureChildFeedback({ scopedFloorMetrics, view, visible }, expectedState, viewport, fixture, outcomeFocusedAtTransition) {
  const { stateNode, icon, status, next, stateRect, iconRect, statusRect, nextRect, statusFont } = feedbackObservation(view.document, view.window, expectedState);
  const metrics = scopedFloorMetrics(view.document.querySelector(".question"));
  const beforeNext = feedbackBeforeNext({ stateNode, next, stateRect, nextRect, labWindow: view.window });
  const inViewport = feedbackInViewport({ stateRect, iconRect, statusRect, nextRect, labWindow: view.window });
  const iconLarge = Boolean(iconRect && iconRect.width >= 54 && iconRect.height >= 54);
  const noOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
  const outcomeFocused = Boolean(outcomeFocusedAtTransition);
  return {
    family: "CHILD-FEEDBACK",
    state: expectedState,
    viewport,
    fixture,
    visualPass: feedbackVisualPass({ stateNode, icon, status, iconLarge, statusFont, beforeNext, visible }),
    controlPass: Boolean(next && visible(next) && outcomeFocused && metrics.minControl >= 44),
    layoutPass: inViewport && noOverflow && meetsSizeFloors(metrics, 16, 44),
    status: normalized(status?.textContent),
    statusFont,
    iconWidth: roundedRectDimension(iconRect, "width"),
    iconHeight: roundedRectDimension(iconRect, "height"),
    beforeNext,
    outcomeFocused,
    inViewport,
    nextBottom: roundedRectDimension(nextRect, "bottom"),
    minFont: metrics.minFont,
    minControl: metrics.minControl,
    noOverflow,
  };
}

function appendMissingFeedbackRows(feedbackRows, feedbackFixtureError) {
  for (const state of ["correct", "incorrect"]) {
    for (const viewport of ["desktop", "phone"]) {
      if (feedbackRows.some((row) => row.state === state && row.viewport === viewport)) continue;
      feedbackRows.push({
        family: "CHILD-FEEDBACK",
        state,
        viewport,
        fixture: null,
        visualPass: false,
        controlPass: false,
        layoutPass: false,
        reason: feedbackFixtureError,
      });
    }
  }
}

async function collectChildFeedbackRows({ activeStateFactory, engine, feedbackRows, feedbackSnapshot, findOrdinal, mq002, mq002Source, pause, playDay, replaceActiveFixture, resize, submitIncorrectCountTouch, submitPairing, view }) {
  view.document.querySelector('[data-lab-action="exit"]')?.click();
  await pause();
  view.document.querySelector('[data-action="home"]')?.click();
  await pause();
  await resize(1366, 768);
  view.document.querySelector('[data-action="start"]')?.click();
  await pause();
  const correctFixture = await submitPairing();
  const correctFocusedAtTransition = view.document.activeElement
            === view.document.querySelector('.feedback-state[data-feedback-state="correct"]');
  await collectFeedbackViewports({ feedbackRows, feedbackSnapshot, resize }, "correct", correctFixture, correctFocusedAtTransition);
  await resize(1366, 768);
  const countState = incorrectCountFeedbackState({ activeStateFactory, engine, findOrdinal, mq002, mq002Source, playDay });
  await replaceActiveFixture(countState, "child-feedback-count-touch");
  const incorrectFixture = await submitIncorrectCountTouch();
  const incorrectFocusedAtTransition = view.document.activeElement
            === view.document.querySelector('.feedback-state[data-feedback-state="incorrect"]');
  await collectFeedbackViewports({ feedbackRows, feedbackSnapshot, resize }, "incorrect", incorrectFixture, incorrectFocusedAtTransition);
}


function incorrectCountFeedbackState({ activeStateFactory, engine, findOrdinal, mq002, mq002Source, playDay }) {
  if (typeof activeStateFactory !== "function") {
    throw new Error("The visual audit did not receive its validated active-state fixture factory.");
  }
  const countOrdinal = findOrdinal(mq002, "ocean", (question) => mq002Source(question).count > 0);
  if (countOrdinal < 0) throw new Error("COUNT_TOUCH did not generate a positive incorrect-feedback fixture.");
  const countQuestion = engine.makeQuestion({
    skillId: mq002.skillId,
    tier: "EASY",
    representation: mq002.phases.includes("P") ? "PICTORIAL" : "CONCRETE",
    seed: LAB_SEED,
    ordinal: countOrdinal,
    eligibleQuestionOrdinal: countOrdinal,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    theme: "ocean",
    scaffolded: true,
  });
  const countState = activeStateFactory(engine, playDay, countQuestion, {
    canonicalIndex: countOrdinal,
  });
  return countState;
}


async function collectFeedbackViewports({ feedbackRows, feedbackSnapshot, resize }, state, fixture, focusedAtTransition) {
  for (const [width, height, viewport] of [
    [1366, 768, "desktop"],
    [390, 844, "phone"],
  ]) {
    await resize(width, height);
    feedbackRows.push(feedbackSnapshot(state, viewport, fixture, focusedAtTransition));
  }
}


function capturePracticeTokenGuide({ engine, guideState, scopedFloorMetrics, view, visible }, profile) {
  const questionNode = view.document.querySelector('.question[data-skill-id="MQ-048"]');
  const guide = questionNode?.querySelector('[data-practice-token-guide="true"]');
  const cards = visibleNodes(guide, '.practice-token-guide__item[role="listitem"]', visible);
  const mappings = cards.map((card) => ({
    tokenId: card.querySelector('.practice-coin-token[data-practice-token]')?.dataset.practiceToken || "",
    value: card.dataset.practiceTokenValue || "",
    ariaLabel: card.getAttribute("aria-label") || "",
  }));
  const exactMappings = engine.canonical(mappings.map(({ tokenId, value }) => ({ tokenId, value })))
              === engine.canonical(PRACTICE_TOKEN_VISUAL_ORACLE);
  const accessibleMappings = mappings.every((mapping) => (
    mapping.ariaLabel
              && normalized(mapping.ariaLabel).includes(normalized(mapping.value))
  ));
  const ready = guide?.querySelector('[data-action="practice-token-ready"]');
  const forbiddenControls = guide?.querySelectorAll('[data-action="confirm"],[data-action="select"],input,select').length || 0;
  const guideRect = guide?.getBoundingClientRect();
  const readyRect = ready?.getBoundingClientRect();
  const tokenRects = cards.map((card) => card.querySelector('.practice-coin-token')?.getBoundingClientRect());
  const contentOnFirstScreen = guideOnFirstScreen(guideRect, readyRect, view.window);
  const tokensLarge = tokenRects.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
              && tokenRects.every((rect) => rect && rect.width >= 50 && rect.height >= 50);
  const metrics = scopedFloorMetrics(questionNode);
  const noHorizontalOverflow = view.document.documentElement.scrollWidth
              <= view.document.documentElement.clientWidth + 1;
  const readyFocused = view.document.activeElement === ready;
  const pass = Boolean(guideInteractionReady({ questionNode, guide, guideState, cards, exactMappings, accessibleMappings, ready, visible, forbiddenControls })
            && guideGeometryPass({ contentOnFirstScreen, tokensLarge, metrics, noHorizontalOverflow, readyFocused }));
  return {
    viewport: profile.viewport,
    width: profile.width,
    height: profile.height,
    mappingCount: mappings.length,
    mappings,
    exactMappings,
    accessibleMappings,
    forbiddenControls,
    contentOnFirstScreen,
    tokensLarge,
    minFont: metrics.minFont,
    minControl: metrics.minControl,
    noHorizontalOverflow,
    readyFocused,
    pass,
  };
}

function capturePracticeTokenState({ engine, optionOracle, scopedFloorMetrics, view, visible }, fixture, profile, stateName, feedbackFocusedAtTransition = null) {
  const question = fixture.question;
  const expected = fixture.expected;
  const { questionNode, prompt, source, worked, tutorial, tutorialInstruction, tutorialBack, answer, confirm, outcome, next } = practiceTokenElements({ labDocument: view.document });
  const action = stateName === "incorrect"
    ? next
    : stateName === "tutorial-notice"
      ? tutorialBack
      : confirm;
  const { expectedTokenNodes, unexpectedTokenIds, tutorialTokenIds, renderedTokenIds, tokenStateContract, stateTokenNodes, sourceToken } = practiceTokenIdentity({ expected, questionNode, source, stateName, tutorial, visible });
  const { valueLeaksIntoSource, workedNamesValue, renderedOptions, exactOptions } = practiceTokenAnswerEvidence({ answer, engine, expected, optionOracle, question, source, stateName, visible, worked });
  const { contentOnFirstScreen, tokensOnFirstScreen, tokensLarge, responseBeforeAction, feedbackBeforeAction } = practiceTokenGeometry({ answer, confirm, labWindow: view.window, next, outcome, prompt, source, stateName, stateTokenNodes, tutorial, tutorialBack, tutorialInstruction });
  const metrics = scopedFloorMetrics(questionNode);
  const noHorizontalOverflow = view.document.documentElement.scrollWidth
              <= view.document.documentElement.clientWidth + 1;
  const fingerprint = practiceTokenFingerprint({ labWindow: view.window, stateTokenNodes });
  const stateContract = practiceTokenStateEvidence({ feedbackFocusedAtTransition, outcome, question, stateName, tutorial, worked });
  const pass = practiceTokenPass({ action, contentOnFirstScreen, exactOptions, expected, feedbackBeforeAction, fingerprint, metrics, noHorizontalOverflow, question, questionNode, responseBeforeAction, source, sourceToken, stateContract, stateName, tokenStateContract, tokensLarge, tokensOnFirstScreen, valueLeaksIntoSource, visible });
  return {
    tokenId: expected.tokenId,
    value: expected.value,
    canonicalIndex: fixture.canonicalIndex,
    state: stateName,
    viewport: profile.viewport,
    width: profile.width,
    height: profile.height,
    renderedTokens: expectedTokenNodes.length,
    renderedTokenIds,
    unexpectedTokenIds,
    tutorialTokenIds,
    tutorialUsesDifferentToken: stateName !== "tutorial-notice"
                || Boolean(tutorialTokenIds.length === 1 && tutorialTokenIds[0] !== expected.tokenId),
    tokenStateContract,
    renderedOptions: renderedOptions.length,
    exactOptions,
    valueLeaksIntoSource,
    workedNamesValue,
    stateContract,
    contentOnFirstScreen,
    tokensOnFirstScreen,
    tokensLarge,
    responseBeforeAction,
    feedbackBeforeAction,
    feedbackFocusedAtTransition,
    minFont: metrics.minFont,
    minControl: metrics.minControl,
    noHorizontalOverflow,
    fingerprint,
    pass,
  };
}

function findPracticeTokenFixtures({ engine, skill, activeStateFactory, playDay, optionOracle }) {
  const fixtures = [];
  for (const expected of PRACTICE_TOKEN_VISUAL_ORACLE) {
    let fixture = null;
    for (let canonicalIndex = 0; canonicalIndex < 40 && !fixture; canonicalIndex += 1) {
      const probeQuestion = engine.makeQuestion({
        skillId: skill.skillId,
        tier: "EASY",
        representation: "PICTORIAL",
        seed: LAB_SEED,
        ordinal: canonicalIndex,
        eligibleQuestionOrdinal: canonicalIndex,
        scheduledReview: false,
        coldTest: false,
        preview: false,
        theme: "ocean",
        scaffolded: true,
      });
      const state = activeStateFactory(engine, playDay, probeQuestion, { canonicalIndex });
      const { activeQuestion, optionValues } = practiceTokenCandidateData(state);
      if (practiceTokenFixtureMatches({ activeQuestion, expected, optionValues, engine, optionOracle })) {
        fixture = { expected, canonicalIndex, state, question: activeQuestion };
      }
    }
    if (!fixture) throw new Error(`No real child-session fixture exposes ${expected.tokenId} as ${expected.value}.`);
    fixtures.push(fixture);
  }
  return fixtures;
}

function practiceTokenFixtureMatches({ activeQuestion, expected, optionValues, engine, optionOracle }) {
  return activeQuestion?.skillId === "MQ-048" && activeQuestion.params?.tokenId === expected.tokenId
    && activeQuestion.answer?.value === expected.value && activeQuestion.inputMethod === "PICTURE_CHOICE"
    && engine.canonical(optionValues) === engine.canonical(optionOracle);
}

function practiceTokenCandidateData(state) {
  const activeQuestion = state.activeSession?.uiState?.question;
  const optionValues = activeQuestion?.options?.map((option) => option.value).sort() || [];
  return { activeQuestion, optionValues };
}


async function auditPracticeTokenJourney({ fixture, pause, practiceTokenRows, practiceTokenSnapshot, replaceActiveFixture, resize, view, visible }) {

  await replaceActiveFixture(fixture.state, `practice-token-${fixture.expected.tokenId}`);
  await collectPracticeTokenViewports({ resize, practiceTokenRows, practiceTokenSnapshot }, fixture, "ordinary");

  await resize(1366, 768);
  await openPracticeTokenTutorial({ view, visible, fixture, pause });
  await collectPracticeTokenViewports({ resize, practiceTokenRows, practiceTokenSnapshot }, fixture, "tutorial-notice");

  await resize(1366, 768);
  await returnToPracticeTokenQuestion({ view, fixture, pause });
  const feedbackFocusedAtTransition = await submitWrongPracticeToken({ view, fixture, pause });
  await collectPracticeTokenViewports({ resize, practiceTokenRows, practiceTokenSnapshot }, fixture, "incorrect", feedbackFocusedAtTransition);

}


async function openPracticeTokenTutorial({ view, visible, fixture, pause }) {
  const help = [...view.document.querySelectorAll('[data-action="tutorial"]')].find((button) => visible(button));
  if (!help || help.disabled) throw new Error(`${fixture.expected.tokenId} did not expose its real Show me how control.`);
  help.click();
  await pause();
  await pause();


}

async function returnToPracticeTokenQuestion({ view, fixture, pause }) {
  const tutorialBack = view.document.querySelector('[data-action="tutorial-back"]');
  if (!tutorialBack || tutorialBack.disabled) {
    throw new Error(`${fixture.expected.tokenId} did not expose Back to your question.`);
  }
  tutorialBack.click();
  await pause();
  await pause();


}

async function submitWrongPracticeToken({ view, fixture, pause }) {
  const wrongOption = fixture.question.options.find((option) => option.value !== fixture.question.answer.value);
  const wrongControl = wrongOption
    ? view.document.querySelector(`[data-action="select"][data-id="${CSS.escape(wrongOption.optionId)}"]`)
    : null;
  if (!wrongControl) throw new Error(`${fixture.expected.tokenId} did not expose a legitimate incorrect option.`);
  wrongControl.click();
  await pause();
  const confirm = view.document.querySelector('[data-action="confirm"]');
  if (!confirm || confirm.disabled) throw new Error(`${fixture.expected.tokenId} did not enable Confirm after selection.`);
  confirm.click();
  await pause();
  await pause();
  const feedbackFocusedAtTransition = view.document.activeElement
              === view.document.querySelector('.feedback-state[data-feedback-state="incorrect"]');

  return feedbackFocusedAtTransition;
}

async function collectPracticeTokenViewports({ resize, practiceTokenRows, practiceTokenSnapshot }, fixture, stateName, ...focusEvidence) {
  for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
    await resize(profile.width, profile.height);
    practiceTokenRows.push(practiceTokenSnapshot(fixture, profile, stateName, ...focusEvidence));
  }
}


async function auditCounterTheme({ approvedEarlyRows, approvedViewports, enterLabForTheme, findOrdinal, glyphFingerprints, glyphKinds, makeThemed, mq002, mq002Source, pause, resize, scopedFloorMetrics, selectCase, theme, view, visible }) {

  await resize(1366, 768);
  await enterLabForTheme(theme);
  const positiveOrdinal = findOrdinal(mq002, theme, (question) => mq002Source(question).count > 0);
  const zeroOrdinal = findOrdinal(mq002, theme, (question) => mq002Source(question).count === 0);
  if (positiveOrdinal < 0 || zeroOrdinal < 0) {
    for (const [, , viewport] of approvedViewports) approvedEarlyRows.push({
      family: "MQ-002", theme, viewport, visualPass: false, controlPass: false,
      layoutPass: false, reason: "positive and zero samples were not both generated",
    });
    return;
  }

  await selectCase({ skill: mq002, tier: "EASY", ordinal: positiveOrdinal });
  const positiveQuestion = makeThemed(mq002, "EASY", positiveOrdinal, theme);
  const expectedKind = glyphKinds[theme];
  const positiveSource = mq002Source(positiveQuestion);
  const positiveCount = positiveSource.count;
  const positiveByViewport = await collectPositiveCounterGlyphs({ approvedViewports, expectedKind, glyphFingerprints, positiveCount, positiveSource, resize, theme, view, visible });

  const { zeroStateVisible, zeroStartsUnconfirmed, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite } = await exerciseExplicitZeroResponse({ expectedKind, makeThemed, mq002, mq002Source, pause, selectCase, theme, view, visible, zeroOrdinal });
  const controlPass = zeroStartsUnconfirmed && zeroConfirmReady && zeroCorrect && zeroGradeNoWrite;
  await recordZeroCounterLayouts({ approvedEarlyRows, approvedViewports, controlPass, expectedKind, positiveByViewport, positiveCount, positiveOrdinal, resize, scopedFloorMetrics, theme, view, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite, zeroOrdinal, zeroStartsUnconfirmed, zeroStateVisible });

}


async function collectPositiveCounterGlyphs({ approvedViewports, expectedKind, glyphFingerprints, positiveCount, positiveSource, resize, theme, view, visible }) {
  const positiveByViewport = new Map();
  for (const [width, height, viewport] of approvedViewports) {
    await resize(width, height);
    const article = view.document.querySelector(".lab-question");
    const tokens = [...article.querySelectorAll(".count-touch-task .themed-object-token")];
    const tokenStyle = tokens[0] ? view.window.getComputedStyle(tokens[0]) : null;
    const fingerprint = tokenStyle ? [
      tokenStyle.backgroundColor, tokenStyle.backgroundImage, tokenStyle.borderRadius,
      tokenStyle.rotate, tokenStyle.transform,
    ].join("|") : "";
    glyphFingerprints.set(`${viewport}:${theme}`, fingerprint);
    positiveByViewport.set(viewport, {
      exactGlyphs: tokens.length === positiveCount && positiveCount > 0
                  && positiveSource.paramsCount === positiveCount
                  && positiveSource.objectKind === expectedKind
                  && tokens.every((token) => token.dataset.objectKind === expectedKind && visible(token)),
      tokenCount: tokens.length,
    });
  }
  return positiveByViewport;
}

async function exerciseExplicitZeroResponse({ expectedKind, makeThemed, mq002, mq002Source, pause, selectCase, theme, view, visible, zeroOrdinal }) {
  await selectCase({ skill: mq002, tier: "EASY", ordinal: zeroOrdinal });
  const zeroQuestion = makeThemed(mq002, "EASY", zeroOrdinal, theme);
  const zeroSource = mq002Source(zeroQuestion);
  const zeroArticleBefore = view.document.querySelector(".lab-question");
  const zeroMat = zeroArticleBefore.querySelector(".touch-objects.empty-set .empty-set-mat");
  const zeroGlyphs = zeroArticleBefore.querySelectorAll(".count-touch-task .themed-object-token");
  const zeroGrade = zeroArticleBefore.querySelector('[data-lab-action="grade"]');
  const zeroChoice = zeroArticleBefore.querySelector('.count-number-bank [data-count-value="0"]');
  const zeroStateVisible = explicitZeroStimulus({ zeroMat, zeroGlyphs, zeroSource, expectedKind, visible });
  const zeroStartsUnconfirmed = Boolean(zeroGrade?.disabled && zeroChoice && visible(zeroChoice));
  const writesBeforeZeroResponse = view.writes;
  zeroChoice?.click();
  await pause();
  const selectedZero = view.document.querySelector('.count-number-bank [data-count-value="0"][aria-pressed="true"]');
  const readyZeroGrade = view.document.querySelector('[data-lab-action="grade"]');
  const zeroConfirmReady = Boolean(selectedZero && readyZeroGrade && !readyZeroGrade.disabled && visible(readyZeroGrade));
  readyZeroGrade?.click();
  await pause();
  const zeroCorrect = normalized(view.document.querySelector("[data-lab-result]")?.textContent) === "Correct.";
  const zeroGradeNoWrite = view.writes === writesBeforeZeroResponse;
  return { zeroStateVisible, zeroStartsUnconfirmed, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite };
}

async function recordZeroCounterLayouts({ approvedEarlyRows, approvedViewports, controlPass, expectedKind, positiveByViewport, positiveCount, positiveOrdinal, resize, scopedFloorMetrics, theme, view, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite, zeroOrdinal, zeroStartsUnconfirmed, zeroStateVisible }) {
  for (const [width, height, viewport] of approvedViewports) {
    await resize(width, height);
    const zeroArticleAfter = view.document.querySelector(".lab-question");
    const metrics = scopedFloorMetrics(zeroArticleAfter);
    const gradeRect = zeroArticleAfter.querySelector('[data-lab-action="grade"]')?.getBoundingClientRect();
    const noOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
    const layoutPass = Boolean(gradeRect && gradeRect.bottom <= view.window.innerHeight + 1
                && noOverflow && meetsSizeFloors(metrics, 16, 44));
    const positive = positiveByViewport.get(viewport);
    approvedEarlyRows.push({
      family: "MQ-002", theme, viewport, positiveOrdinal, zeroOrdinal, expectedKind,
      tokenCount: positive?.tokenCount || 0, positiveCount,
      visualPass: Boolean(positive?.exactGlyphs && zeroStateVisible),
      controlPass,
      layoutPass, minFont: metrics.minFont, minControl: metrics.minControl,
      gradeBottom: roundedRectDimension(gradeRect, "bottom"), noOverflow,
      zeroStartsUnconfirmed, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite,
    });
  }

}

function explicitZeroStimulus({ zeroMat, zeroGlyphs, zeroSource, expectedKind, visible }) {
  return Boolean(zeroMat && visible(zeroMat) && normalized(zeroMat.textContent) === "0"
    && zeroGlyphs.length === 0 && zeroSource.count === 0 && zeroSource.paramsCount === 0 && zeroSource.objectKind === expectedKind
    && /zero objects|set is empty/iu.test(zeroMat.getAttribute("aria-label") || ""));
}


async function inspectDurationViewport({ approvedEarlyRows, height, ordinal, pause, question, resize, scopedFloorMetrics, selectionWorks, view, viewport, visible, width }) {

  await resize(width, height);
  const { choices, optionEvents, optionTracks, redundantSourceCount, visualPass } = captureDurationChoiceEvidence({ question, view, visible });
  if (!selectionWorks) {
    choices[0]?.click();
    await pause();
  }
  const selectedChoice = view.document.querySelector('.answer-controls .choice[aria-pressed="true"]');
  const grade = view.document.querySelector('[data-lab-action="grade"]');
  selectionWorks = Boolean(selectedChoice && grade && !grade.disabled);
  const metrics = scopedFloorMetrics(view.document.querySelector(".lab-question"));
  const gradeRect = grade?.getBoundingClientRect();
  const noOverflow = view.document.documentElement.scrollWidth <= view.document.documentElement.clientWidth + 1;
  const layoutPass = Boolean(
    gradeRect
              && gradeRect.bottom <= view.window.innerHeight + 1
              && noOverflow
              && meetsSizeFloors(metrics, 16, 44),
  );
  approvedEarlyRows.push({
    family: "MQ-006",
    viewport,
    ordinal,
    optionCount: choices.length,
    optionEvents,
    optionTracks,
    redundantSourceCount,
    visualPass: visualPass,
    controlPass: selectionWorks,
    layoutPass,
    minFont: metrics.minFont,
    minControl: metrics.minControl,
    gradeBottom: roundedRectDimension(gradeRect, "bottom"),
    noOverflow,
  });

  return selectionWorks;
}


function durationChoiceTracks(choiceVisuals, expectedCandidates) {
  return choiceVisuals.map((visual, index) => {
    const expected = expectedCandidates[index] || {};
    const track = visual?.querySelector(".duration-event-track");
    const fill = track?.querySelector(":scope > i");
    const magnitude = Number(visual?.dataset.durationMagnitude);
    const maximum = Number(expected.maxMagnitude);
    const trackRect = track?.getBoundingClientRect();
    const fillRect = fill?.getBoundingClientRect();
    return {
      magnitude,
      maximum,
      expectedMagnitude: Number(expected.magnitude),
      expectedRatio: durationTrackRatio(magnitude, maximum),
      ratio: trackRect?.width ? fillRect.width / trackRect.width : 0,
    };
  });
}

function durationIconsFirst(choiceVisuals, visible) {
  return choiceVisuals.length === 2 && choiceVisuals.every((visual) => (
    visual
              && visual.firstElementChild?.classList.contains("duration-event-glyph")
              && visible(visual.firstElementChild)
              && Boolean(visual.firstElementChild.querySelector("svg"))
  ));
}

function completeDurationSources(choiceVisuals, expectedCandidates, visible) {
  return choiceVisuals.length === 2 && choiceVisuals.every((visual, index) => {
    const expected = expectedCandidates[index] || {};
    const expectedEvent = normalized(expected.event).toLowerCase();
    const expectedMagnitude = Number(expected.magnitude);
    const { name, track, fill, time } = durationChoiceContent(visual);
    return Boolean(
      visual
                && normalized(visual.dataset.durationEvent).toLowerCase() === expectedEvent
                && Number(visual.dataset.durationMagnitude) === expectedMagnitude
                && visible(name)
                && normalized(name.textContent).toLowerCase() === expectedEvent
                && visible(track)
                && visible(fill)
                && visible(time)
                && normalized(time.textContent) === `${expectedMagnitude} min`,
    );
  });
}

function durationTracksTruthful(optionTracks) {
  const observedTrackMaximum = Math.max(0, ...optionTracks.map((track) => track.ratio));
  const expectedTrackMaximum = Math.max(0, ...optionTracks.map((track) => track.expectedRatio));
  const tracksTruthful = optionTracks.length === 2
              && optionTracks.every((track) => Number.isFinite(track.magnitude)
                && track.magnitude > 0
                && Number.isFinite(track.maximum)
                && track.maximum >= track.magnitude
                && track.magnitude === track.expectedMagnitude
                && track.ratio > 0
                && observedTrackMaximum > 0
                && expectedTrackMaximum > 0
                && Math.abs(track.ratio / observedTrackMaximum - track.expectedRatio / expectedTrackMaximum) <= 0.04)
              && optionTracks[0].maximum === optionTracks[1].maximum
              && optionTracks[0].magnitude !== optionTracks[1].magnitude
              && Math.abs(optionTracks[0].ratio - optionTracks[1].ratio) >= 0.08
              && Math.sign(optionTracks[0].magnitude - optionTracks[1].magnitude)
                === Math.sign(optionTracks[0].ratio - optionTracks[1].ratio);
  return tracksTruthful;
}

function durationOptionSetEvidence({ question, choices, choiceVisuals, article, optionEvents, expectedOptionEvents }) {
  const exactTwo = question.options.length === 2
              && choices.length === 2
              && choiceVisuals.length === 2
              && article.querySelectorAll(".answer-controls .choice").length === 2;
  const optionTruth = new Set(optionEvents).size === 2
              && JSON.stringify(optionEvents) === JSON.stringify(expectedOptionEvents);
  return { exactTwo, optionTruth };
}

function captureDurationChoiceEvidence({ question, view, visible }) {
  const article = view.document.querySelector(".lab-question");
  const choices = [...article.querySelectorAll('.answer-controls[data-control-mode="lab"] .choices > .choice')];
  const choiceVisuals = choices.map((choice) => choice.querySelector(":scope > .duration-event-choice"));
  const optionEvents = choiceVisuals.map((visual) => normalized(visual?.dataset.durationEvent).toLowerCase());
  const expectedCandidates = question.modelDescriptor?.values?.candidates || [];
  const expectedOptionEvents = expectedCandidates.map((item) => normalized(item.event).toLowerCase());
  const redundantSourceCount = article.querySelectorAll(
    ".stimulus [data-duration-event], .stimulus .duration-event-visual, .stimulus .duration-event-choice",
  ).length;
  const optionTracks = durationChoiceTracks(choiceVisuals, expectedCandidates);
  const tracksTruthful = durationTracksTruthful(optionTracks);
  const iconFirst = durationIconsFirst(choiceVisuals, visible);
  const completeChoiceSources = completeDurationSources(choiceVisuals, expectedCandidates, visible);
  const { exactTwo, optionTruth } = durationOptionSetEvidence({ question, choices, choiceVisuals, article, optionEvents, expectedOptionEvents });

  const visualPass = exactTwo
                && iconFirst
                && completeChoiceSources
                && optionTruth
                && tracksTruthful
                && redundantSourceCount === 0;
  return { choices, optionEvents, optionTracks, redundantSourceCount, visualPass };
}

void 0;
