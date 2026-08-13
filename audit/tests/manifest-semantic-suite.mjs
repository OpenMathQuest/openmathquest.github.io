import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractEngine, evaluateEngine } from "../lib/engine-loader.mjs";
import { canonicalizeJson, loadManifest } from "../lib/curriculum-manifest.mjs";
import {
  EXPECTED_STRATEGY_SEMANTIC_VARIANTS,
  STRATEGY_BUILD_SKILL_IDS,
  correctStrategyBuildResponse,
  strategyMethodOracle,
  strategyResultOracle,
  strategySemanticVariantKey,
  strategyWorkOracle,
} from "./strategy-build-oracle.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAMPLE_ORDINALS = 24;

// This is an intentionally explicit release contract. Every curriculum skill
// maps each declared task type to the exact semantic prompt/model families that
// must be exercised over one deterministic ordinal cycle.
const EXPECTED_SIGNATURE_TEXT = `
MQ-001 pair-each-object=question.pairObjects/visualPrompt
MQ-002 count-a-set-to-three=question.countSet/visualPrompt
MQ-003 compare-tiny-sets=question.compare/comparison
MQ-004 continue-an-ab-repeat=question.patternNext/visualPrompt+question.patternVisualNext/visualPrompt
MQ-005 match-familiar-shapes=question.shape/visualPrompt
MQ-006 direct-compare=question.eventDuration/visualPrompt
MQ-007 sort=question.sortRule/attributeSet
MQ-008 count-a-set-to-five=question.countSet/visualPrompt
MQ-009 recognize-structured-set-to-three=question.structuredQuantity/visualPrompt
MQ-010 order-zero-to-five=question.orderSetConnection/visualPrompt
MQ-011 make-a-small-whole-two-ways=question.secondPartition/numberBond
MQ-012 compare-one-attribute-directly=question.directCompare/visualPrompt
MQ-013 show-one-joining=question.addition/visualPrompt
MQ-014 show-one-leaving=question.subtraction/visualPrompt
MQ-015 share-small-sets-fairly=question.fairShare/array
MQ-016 copy-a-three-part-repeat=question.copyPatternAction/visualPrompt
MQ-017 place-it-by-a-landmark=question.landmarkPosition/visualPrompt
MQ-018 record-a-two-group-sort=question.sortRecord/visualPrompt
MQ-019 connect-numbers-zero-to-ten=question.frameNumber/tenFrame+question.numberConnection/visualPrompt
MQ-020 recognize-structured-set-to-five=question.structuredQuantity/visualPrompt
MQ-021 compare-collections-to-ten=question.compare/comparison
MQ-022 recall-parts-of-five=question.missingPart/numberBond
MQ-023 build-and-break-ten=question.hiddenPart/tenFrame+question.makeTenFrame/tenFrame+question.missingPart/numberBond
MQ-024 classify-flat-shape=question.shapeProperty/attributeSet,classify-solid=question.shapeProperty/attributeSet
MQ-025 order-numbers-zero-to-twenty=question.numberBetween/numberLine+question.numberLeast/visualPrompt+question.numberOrder/visualPrompt
MQ-026 see-ten-inside-teen-numbers=question.teenBuild/tenFrame
MQ-027 find-one-more-or-less=question.oneMoreLess/numberLine
MQ-028 write-joining-equations-to-ten=question.addition/visualPrompt+question.appliedAddition/visualPrompt
MQ-029 write-leaving-equations-to-ten=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-030 make-two-equal-halves=question.makeHalves/fractionPair
MQ-031 read-and-form-numerals-to-twenty=question.numeralForm/visualPrompt
MQ-032 make-equal-groups-to-ten=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-033 extend=question.patternNext/visualPrompt
MQ-034 follow-a-short-route=question.routeFinish/visualPrompt
MQ-035 compare-two-objects-directly=question.directCompare/visualPrompt,name-compared-attribute=question.attributeName/visualPrompt
MQ-036 display-two-shown-categories=question.twoCategoryDisplay/visualPrompt
MQ-037 read-and-order-to-one-hundred-twenty=question.numberOrder/visualPrompt
MQ-038 partition-two-digit-numbers=question.placePartition/placeValue
MQ-039 count-in-twos-fives-and-tens=question.patternNext/visualPrompt
MQ-040 add-by-counting-on=question.addition/visualPrompt,add-by-making-ten=question.makeTen/numberBond,add-by-known-bond=question.appliedAddition/visualPrompt
MQ-041 subtract-by-counting-back=question.subtraction/visualPrompt,subtract-by-counting-up=question.subtraction/visualPrompt,subtract-by-known-bond=question.appliedSubtraction/visualPrompt
MQ-042 read-hour-and-half-hour=question.timeReadMinute/visualPrompt
MQ-043 build-an-add-subtract-family=question.factFamilyBuild/numberBond
MQ-044 balance-a-missing-part=question.missingPart/numberBond+question.missingSubtrahend/numberBond
MQ-045 make-equal-groups-and-shares=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-046 measure-with-equal-informal-units=question.informalMeasure/visualPrompt
MQ-047 find-halves-and-quarters=question.fraction/fractionPair
MQ-048 match-practice-token-5-cents=question.coinValue/visualPrompt,match-practice-token-10-cents=question.coinValue/visualPrompt,match-practice-token-25-cents=question.coinValue/visualPrompt,match-practice-token-1-dollar=question.coinValue/visualPrompt,match-practice-token-2-dollars=question.coinValue/visualPrompt
MQ-049 addition=question.makeTen/numberBond,subtraction=question.subtractMakeTen/numberBond
MQ-050 repartition-a-two-digit-number=question.renamePlace/placeValue
MQ-051 match-equivalent-coin-amounts=question.coinEquivalent/proportionalBar
MQ-052 classify-flat-shape=question.shapeProperty/attributeSet,classify-solid=question.shapeProperty/attributeSet
MQ-053 give-and-follow-directions=question.routeFinish/visualPrompt
MQ-054 make-a-one-to-one-data-display=question.responseListDifference/visualPrompt
MQ-055 read-and-order-to-one-thousand=question.numberOrder/visualPrompt
MQ-056 partition-and-rename-three-digits=question.renamePlace/placeValue
MQ-057 position-compare=question.decimalCompare/numberLine
MQ-058 addition=question.addition/visualPrompt+question.appliedAddition/visualPrompt,subtraction=question.factFamily/numberBond
MQ-059 add-two-digit-numbers=question.addition/visualPrompt+question.appliedAddition/visualPrompt
MQ-060 subtract-two-digit-numbers=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-061 recall-two-times-facts=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-062 recall-five-and-ten-times-facts=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-063 model-related-multiplication-and-division=question.relatedMultiplyDivide/array,write-related-multiplication-and-division-equations=question.factFamilyBuild/array
MQ-064 partition-halves-quarters-and-eighths=question.fraction/fractionPair
MQ-065 find-canadian-coin-change=question.moneyOperation/proportionalBar
MQ-066 read=question.timeReadMinute/visualPrompt
MQ-067 shift-by-one-ten-or-hundred=question.mentalShift/numberLine
MQ-068 continue-an-additive-rule=question.patternNext/visualPrompt
MQ-069 choose-and-use-early-metric-units=question.metricUnitChoice/visualPrompt+question.metricRead/visualPrompt
MQ-070 describe-flat-shape=question.featureDescription/visualPrompt,describe-solid=question.featureDescription/visualPrompt
MQ-071 read-a-simple-map-route=question.routeFinish/visualPrompt
MQ-072 build-and-interpret-survey-display=question.surveyResponseList/visualPrompt
MQ-073 read-and-order-beyond-ten-thousand=question.numberOrder/visualPrompt
MQ-074 partition-four-and-five-digit-numbers=question.renamePlace/placeValue
MQ-075 round-to-tens-and-hundreds=question.rounding/numberLine
MQ-076 addition=question.addition/visualPrompt+question.appliedAddition/visualPrompt,subtraction=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-077 recall-three-four-and-eight-times-facts=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-078 use-related-division-facts=question.division/visualPrompt+question.appliedDivision/visualPrompt
MQ-079 multiply-two-digits-by-one-digit=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-080 divide-two-digits-with-remainders=question.quotientRemainder/array
MQ-081 compare-proper-fractions=question.fractionCompare/fractionPair
MQ-082 add-and-subtract-like-fractions-within-one=question.fractionOperation/fractionPair
MQ-083 addition=question.missingPart/numberBond,subtraction=question.missingSubtrahend/numberBond
MQ-084 addition=question.patternNext/visualPrompt,subtraction=question.patternNext/visualPrompt,multiplication=question.patternNext/visualPrompt
MQ-085 find-change-from-canadian-price=question.moneyOperation/proportionalBar
MQ-086 read-time-to-the-minute=question.timeReadMinute/visualPrompt+question.durationMinutes/clockSpan+question.timeReadDigital/visualPrompt
MQ-087 polygon-perimeter=question.polygonPerimeter/visualPrompt
MQ-088 property-classification=question.shapeProperty/attributeSet
MQ-089 locate-places-on-a-grid-map=question.routeFinish/visualPrompt
MQ-090 repeat-and-compare=question.chanceRunCompare/visualPrompt
MQ-091 read-and-order-to-one-hundred-thousand=question.numberOrder/visualPrompt
MQ-092 scale-whole-numbers-by-ten-and-one-hundred=question.scalePlace/placeValue
MQ-093 round-to-ten-hundred-or-thousand=question.rounding/numberLine
MQ-094 read-negative-values-in-context=question.contextIntegerOrder/visualPrompt
MQ-095 addition=question.addition/visualPrompt+question.appliedAddition/visualPrompt,subtraction=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-096 multiply=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-097 addition=question.parity/visualPrompt,subtraction=question.parity/visualPrompt,multiplication=question.parity/visualPrompt
MQ-098 generate-equivalent-fractions=question.fractionEquivalent/fractionPair
MQ-099 connect-tenths-hundredths-and-decimals=question.decimal/fractionPair
MQ-100 compare-decimals=question.decimalCompare/fractionPair,order-decimals=question.decimalOrderList/visualPrompt
MQ-101 addition=question.missingPart/numberBond,subtraction=question.missingSubtrahend/numberBond
MQ-102 purchase=question.moneyPurchase/proportionalBar,change=question.moneyOperation/proportionalBar
MQ-103 addition=question.patternNext/visualPrompt,multiplication=question.patternNext/visualPrompt
MQ-104 addition=question.fractionOperation/fractionPair,subtraction=question.fractionOperation/fractionPair
MQ-105 rectangle-area=question.areaRectangle/areaGrid
MQ-106 identify=question.symmetry/visualPrompt,complete=question.symmetryComplete/visualPrompt
MQ-107 plan-and-display-a-scaled-survey=question.scaledSurveyPlan/visualPrompt+question.scaledSurveyVariation/visualPrompt
MQ-108 dependency-test=question.chanceClassify/visualPrompt
MQ-109 compare=question.contextIntegerCompare/visualPrompt,order=question.contextIntegerOrder/visualPrompt
MQ-110 compare=question.decimalCompare/fractionPair,order=question.decimalOrderList/visualPrompt
MQ-111 plausibility-check=question.estimateCalculation/placeValue
MQ-112 classify-prime=question.factorClass/visualPrompt,classify-composite=question.factorClass/visualPrompt,classify-square=question.factorClass/visualPrompt,classify-cube=question.factorClass/visualPrompt
MQ-113 multiply-large-numbers=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-114 divide-large-numbers-and-interpret-remainders=question.remainderWhole/array+question.remainderFraction/array+question.remainderInterpret/array+question.remainderFullGroups/array
MQ-115 addition=question.fractionOperation/fractionPair,subtraction=question.fractionOperation/fractionPair
MQ-116 percent-to-fraction=question.percentFraction/fractionPair,percent-to-decimal=question.percentDecimal/fractionPair
MQ-117 addition=question.decimalOperation/fractionPair,subtraction=question.decimalOperation/fractionPair
MQ-118 budget=question.moneyBudget/proportionalBar,total-cost=question.moneyTotalCost/proportionalBar
MQ-119 pattern-addition=question.patternRuleExpression/visualPrompt,pattern-subtraction=question.patternRuleExpression/visualPrompt,pattern-multiplication=question.patternRuleExpression/visualPrompt,pattern-division=question.patternRuleExpression/visualPrompt
MQ-120 metric-conversion=question.metricConversion/visualPrompt
MQ-121 composite-area=question.compositeArea/areaGrid
MQ-122 rectangular-prism-volume=question.prismVolume/visualPrompt
MQ-123 timetable-interval=question.timetableInterval/clockSpan
MQ-124 angle-measure=question.angleMeasure/visualPrompt
MQ-125 describe-transform=question.coordinateMove/visualPrompt
MQ-126 interpret-distribution=question.distributionShape/visualPrompt+question.distributionMode/visualPrompt
`.trim();

function parseExpectedSignatures() {
  const result = new Map();
  for (const line of EXPECTED_SIGNATURE_TEXT.split(/\r?\n/u)) {
    const [skillId, rest] = line.trim().split(/\s+/, 2);
    const taskMap = new Map();
    for (const taskRecord of rest.split(",")) {
      const equals = taskRecord.indexOf("=");
      const taskType = taskRecord.slice(0, equals);
      const signatures = new Set(taskRecord.slice(equals + 1).split("+"));
      taskMap.set(taskType, signatures);
    }
    result.set(skillId, taskMap);
  }
  return result;
}

const EXPECTED_SIGNATURES = parseExpectedSignatures();

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  return canonicalizeJson(JSON.parse(JSON.stringify(value)));
}

function rationalNumber(value) {
  const text = String(value).trim();
  const mixed = text.match(/^(-?\d+)\s+(\d+)\/(\d+)$/u);
  if (mixed) {
    const sign = Number(mixed[1]) < 0 ? -1 : 1;
    return Number(mixed[1]) + sign * Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = text.match(/^(-?\d+)\/(\d+)$/u);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text);
}

function nearlyEqual(left, right, tolerance = 1e-9) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function answerNumber(question) {
  return rationalNumber(question.answer.value);
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

function repeatedItems(prefix, count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => `${prefix}${index}`);
}

function coinCents(label) {
  const text = String(label ?? "").trim();
  const amount = Number(text.replace(/[^\d]/gu, ""));
  return text.startsWith("$") ? amount * 100 : amount;
}

export function correctStructuredResponse(engine, question) {
  const state = engine.createResponseState(question);
  const method = question.inputMethod;
  const params = question.params || {};
  if (method === "COUNT_TOUCH") {
    state.touched = repeatedItems("i", Number(question.answer.value));
    state.count = String(question.answer.value);
  } else if (method === "ORDER_BUILD") {
    state.order = [Number(params.before), Number(question.answer.value), Number(params.after)];
  } else if (method === "STRATEGY_BUILD") {
    return correctStrategyBuildResponse(question, question.skillId === "MQ-095" ? "mental" : null);
  } else if (method === "PLACE_VALUE_BUILD") {
    state.action = Array.isArray(params.strategyChoices)
      ? String(params.strategyAny ? params.strategyChoices[0] : params.strategy)
      : question.semanticPromptStringId === "question.renamePlace" ? "trade"
        : question.semanticPromptStringId === "question.scalePlace" ? "shift"
          : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId) ? "partition"
            : "build";
    state.value = question.answer.kind === "text" ? String(question.answer.value) : Number(question.answer.value);
  } else if (method === "COIN_BUILD") {
    state.coins = Array.from({ length: Number(question.answer.value) }, () => coinCents(params.secondCoin));
  } else if (method === "SYMMETRY_BUILD") {
    state.lines = Array.isArray(params.requiredLineIds)
      ? [...params.requiredLineIds]
      : Array.from({ length: Number(question.answer.value) }, (_, index) => `line${index + 1}`);
  } else if (method === "EXPRESSION_BUILD") {
    state.rule = String(params.rule);
    state.value = Number(question.answer.value);
  } else if (method === "PAIR_LINK") {
    state.links = Array.from(
      { length: Math.min(Number(params.leftCount ?? params.count), Number(params.rightCount ?? params.count)) },
      (_, index) => [`a${index}`, `b${index}`],
    );
    if (Object.hasOwn(state, "relation")) state.relation = String(question.answer.value);
  } else if (method === "SORT_BINS") {
    state.placements = sortPlacementsFromDescriptor(question);
  } else if (method === "SHARE_DEAL") {
    const recipientCount = Number(params.recipients);
    const total = Number(params.total);
    const remainder = total % recipientCount;
    let next = 1;
    while (state.pool.length > remainder) {
      const recipient = `r${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history = (state.history || []).concat([[recipient, item]]);
      next = next % recipientCount + 1;
    }
  } else if (method === "GROUP_BUILD") {
    const groups = Number(params.groups ?? params.a);
    let next = 1;
    while (state.pool.length) {
      const recipient = `g${next}`;
      const item = state.pool.shift();
      state.recipients[recipient].push(item);
      state.history = (state.history || []).concat([[recipient, item]]);
      next = next % groups + 1;
    }
  } else if (method === "BOND_SPLIT") {
    const counts = question.semanticPromptStringId === "question.secondPartition"
      ? [Number(params.secondA), Number(question.answer.value)]
      : [Number(params.part), Number(question.answer.value)];
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
  } else if (method === "PATTERN_BUILD") {
    state.tokens = String(question.answer.value).trim().split(/\s+/u).filter(Boolean);
  } else if (method === "LANDMARK_PLACE") {
    state.relation = String(question.answer.value);
  } else if (method === "SLOT_COMPOSER") {
    const operator = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
    state.slots = [String(params.a), operator, String(params.b), "=", String(question.answer.value)];
  } else if (method === "FACT_FAMILY") {
    const a = Number(params.a), b = Number(params.b), whole = Number(params.whole);
    state.selected = params.equationFamily === "multiply-divide"
      ? [`${a}×${b}=${whole}`, `${b}×${a}=${whole}`, `${whole}÷${a}=${b}`, `${whole}÷${b}=${a}`]
      : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
  } else if (method === "GRAPH_BUILD") {
    const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
    state.categories = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(params[key]))).map((key) => [key, Number(params[key])]));
    if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = String(question.answer.value);
    if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = Number(question.answer.value);
  } else if (method === "FRACTION_PARTITION") {
    const fraction = engine.parseRational(question.answer.value);
    requireCondition(fraction, `${question.skillId}: direct fraction answer is not rational`);
    state.templateId = "vertical";
    const denominator = Number(state.denominator);
    const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
    requireCondition(Number.isInteger(shadedCount), `${question.skillId}: fraction partition is not reachable`);
    state.shaded = repeatedItems("part", shadedCount);
  } else if (method === "GRID_ROUTE") {
    state.moves = Array.isArray(params.moves) ? [...params.moves] : [];
    const coordinate = String(question.answer.value).match(/^\((\d+),(\d+)\)$/u);
    const gridCell = String(question.answer.value).match(/^([A-Z])(\d+)$/u);
    if (coordinate) state.end = { x: Number(coordinate[1]), y: Number(coordinate[2]) };
    else if (gridCell) state.end = { x: gridCell[1].charCodeAt(0) - 64, y: Number(gridCell[2]) };
    else state.value = String(question.answer.value);
  } else if (method === "CLOCK_READ") {
    const match = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
    requireCondition(match, `${question.skillId}: direct clock answer has no hour/minute`);
    state.hour = Number(match[1]);
    state.minute = Number(match[2]);
  } else if (method === "METRIC_SCALE") {
    state.value = Number(question.answer.value);
  } else if (method === "ANGLE_MEASURE") {
    state.degrees = Number(question.answer.value);
  } else if (method === "ACTION_SCENE") {
    state.actions = Array.from(
      { length: Math.abs(Number(params.b)) },
      () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
    );
    state.value = String(question.answer.value);
  } else if (method === "MEASURE_OBJECT") {
    state.actions = Array.from({ length: Number(params.count) }, () => "place-unit");
    state.value = String(params.count);
  } else if (method === "AREA_DECOMPOSE") {
    state.cutIds = ["cut1"];
    state.part0 = String(Number(params.l1) * Number(params.w1));
    state.part1 = String(Number(params.l2) * Number(params.w2));
    state.total = String(question.answer.value);
  } else if (method === "VOLUME_INSPECT") {
    state.viewedLayers = Array.from({ length: Number(params.height) }, (_, index) => index + 1);
    state.method = String(params.method);
    state.value = String(question.answer.value);
  } else {
    throw new Error(`${question.skillId}: no structured response fixture for ${method}`);
  }
  return engine.serializeResponse(question, state);
}

function validateStructuredResponse(engine, question) {
  if (!STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)) return;
  requireCondition(question.inputClass === "CONSTRUCTION", `${question.skillId}: ${question.inputMethod} is not construction`);
  requireCondition(question.options.length === 0 && question.correctIndex === -1, `${question.skillId}: direct response exposes selection controls`);
  const response = correctStructuredResponse(engine, question);
  requireCondition(engine.gradeAnswer(question, response).correct, `${question.skillId}: ${question.inputMethod} cannot submit a canonical correct response`);
  const scalar = engine.gradeAnswer(question, question.answer.value);
  requireCondition(scalar.valid === false && scalar.reason === "structured-response-required", `${question.skillId}: ${question.inputMethod} accepts a scalar answer bypass`);
  if (question.inputMethod === "SORT_BINS") {
    const incorrectGrade = engine.gradeAnswer(question, incorrectSortSubmission(question, response));
    requireCondition(incorrectGrade.valid === true && incorrectGrade.correct === false, `${question.skillId}: displaced sort placement was not valid-but-incorrect`);
  }
  if (question.inputMethod === "FRACTION_PARTITION") {
    requireCondition(typeof response.templateId === "string" && response.templateId.length > 0, `${question.skillId}: fraction partition response omits templateId`);
    const withoutTemplate = { ...response };
    delete withoutTemplate.templateId;
    requireCondition(engine.gradeAnswer(question, withoutTemplate).correct === false, `${question.skillId}: fraction partition accepts a missing templateId`);
  }
}

function validateSelection(engine, question) {
  if (question.inputClass !== "SELECTION") return;
  requireCondition(Array.isArray(question.options) && question.options.length >= 2, `${question.skillId}: selection needs at least two choices`);
  requireCondition(question.options[question.correctIndex]?.value === question.answer.value, `${question.skillId}: correctIndex does not identify the answer`);
  const correct = question.options.filter((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
  requireCondition(correct.length === 1, `${question.skillId}: expected one mathematically correct choice, found ${correct.length}`);
}

function validateFiniteTree(value, label) {
  if (typeof value === "number") requireCondition(Number.isFinite(value), `${label}: non-finite number`);
  if (Array.isArray(value)) value.forEach((item, index) => validateFiniteTree(item, `${label}[${index}]`));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) validateFiniteTree(item, `${label}.${key}`);
  }
}

function validateModel(question) {
  const model = question.modelDescriptor;
  requireCondition(model && typeof model === "object", `${question.skillId}: missing model descriptor`);
  requireCondition(typeof model.type === "string" && model.type, `${question.skillId}: missing model type`);
  requireCondition(model.values && typeof model.values === "object", `${question.skillId}: missing model values`);
  validateFiniteTree(model.values, `${question.skillId}.${model.type}`);
  const value = model.values;
  if (model.type === "visualPrompt") {
    requireCondition(typeof value.kind === "string" && value.kind, `${question.skillId}: visual prompt has no semantic kind`);
    const itemCount = Array.isArray(value.items) ? value.items.length : 0;
    const candidateCount = Array.isArray(value.candidates) ? value.candidates.length : 0;
    const dataCount = value.data && typeof value.data === "object" ? Object.keys(value.data).length : 0;
    const notationCount = value.notation && typeof value.notation === "object" ? Object.keys(value.notation).length : 0;
    requireCondition(itemCount + candidateCount + dataCount + notationCount > 0, `${question.skillId}: visual prompt has no answer-free stimulus data`);
  } else if (model.type === "attributeSet") {
    requireCondition(Array.isArray(value.items) && value.items.length >= 3, `${question.skillId}: attribute set is empty`);
    requireCondition(!Object.hasOwn(value, "targetIndexes") && !Object.hasOwn(value, "nonTargetIndexes"), `${question.skillId}: answer-bearing indexes leaked into the source stimulus`);
    const categories = Array.isArray(value.categories) ? value.categories : [];
    const ruleAttribute = String(value.rule?.attribute ?? "").trim();
    if (categories.length) {
      requireCondition([2, 3].includes(categories.length), `${question.skillId}: categorized attribute set does not have two or three categories`);
      requireCondition(normalizedAttributeToken(ruleAttribute).length > 0, `${question.skillId}: categorized attribute set has no rule attribute`);
      requireCondition(categories.every((category) => ["id", "label", "value"]
        .every((key) => normalizedAttributeToken(category?.[key]).length > 0)), `${question.skillId}: sort category is incomplete`);
      requireCondition(new Set(categories.map((category) => String(category.id))).size === categories.length, `${question.skillId}: sort category ids are not unique`);
      requireCondition(new Set(categories.map((category) => normalizedAttributeToken(category.value))).size === categories.length, `${question.skillId}: sort category values are not unique`);
      const assignments = value.items.map((item) => sortCategoryId(item, value.rule, categories));
      requireCondition(assignments.every(Boolean), `${question.skillId}: an item does not map to a declared sort category`);
      requireCondition(new Set(assignments).size === categories.length, `${question.skillId}: not every sort category is represented`);
    } else {
      const normalizedRuleAttribute = normalizedAttributeToken(ruleAttribute);
      const ruleValue = normalizedAttributeToken(value.rule?.value);
      requireCondition(["shape", "solid", "property"].includes(normalizedRuleAttribute), `${question.skillId}: attribute set has an unsupported rule attribute`);
      requireCondition(ruleValue.length > 0, `${question.skillId}: attribute set has no rule value`);
      if (normalizedRuleAttribute === "property") {
        requireCondition(Boolean(ATTRIBUTE_PROPERTY_TARGET[ruleValue]), `${question.skillId}: attribute set has an unsupported semantic property`);
      }
      const matches = value.items.filter((item) => attributeItemMatchesRule(item, value.rule));
      requireCondition(matches.length > 0, `${question.skillId}: attribute set has no rule-matching item`);
      requireCondition(matches.length < value.items.length, `${question.skillId}: attribute set has no visible contrast`);
    }
  } else if (model.type === "comparison") {
    requireCondition(Number.isFinite(Number(value.left?.magnitude)), `${question.skillId}: comparison left magnitude missing`);
    requireCondition(Number.isFinite(Number(value.right?.magnitude)), `${question.skillId}: comparison right magnitude missing`);
  } else if (model.type === "numberBond") {
    requireCondition(Array.isArray(value.parts) && value.parts.length === 2, `${question.skillId}: number bond needs two parts`);
    requireCondition(nearlyEqual(Number(value.whole), Number(value.parts[0]) + Number(value.parts[1])), `${question.skillId}: number-bond parts do not make the whole`);
    requireCondition(["whole", "part0", "part1", "operator"].includes(value.unknown), `${question.skillId}: invalid number-bond unknown`);
  } else if (model.type === "tenFrame") {
    requireCondition(Array.isArray(value.frames) && value.frames.length > 0, `${question.skillId}: ten-frame model is empty`);
    requireCondition(value.frames.every((frame) => Number.isInteger(Number(frame.value)) && Number(frame.value) >= 0), `${question.skillId}: ten-frame value invalid`);
  } else if (model.type === "array") {
    const total = Number(value.total);
    requireCondition(Number.isInteger(total) && total > 0, `${question.skillId}: array total invalid`);
    if (value.groups !== undefined && value.perGroup !== undefined) {
      requireCondition(Number(value.groups) * Number(value.perGroup) + Number(value.remainder || 0) === total, `${question.skillId}: array groups do not reconstruct total`);
    }
  } else if (model.type === "fractionPair") {
    requireCondition(Array.isArray(value.representations) && value.representations.length > 0, `${question.skillId}: fraction model is empty`);
    requireCondition(value.representations.every((item) => Number.isFinite(rationalNumber(item.value))), `${question.skillId}: fraction model contains an invalid value`);
  } else if (model.type === "placeValue") {
    requireCondition(value.source !== undefined, `${question.skillId}: place-value source missing`);
    requireCondition(Array.isArray(value.columns) && value.columns.length > 0, `${question.skillId}: place-value columns missing`);
  } else if (model.type === "numberLine") {
    const min = rationalNumber(value.domain?.min);
    const max = rationalNumber(value.domain?.max);
    const step = rationalNumber(value.domain?.step);
    requireCondition(Number.isFinite(min) && Number.isFinite(max) && max > min && step > 0, `${question.skillId}: invalid number-line domain`);
    requireCondition(Array.isArray(value.points) && value.points.length > 0, `${question.skillId}: number line has no points`);
    for (const point of value.points) {
      const pointValue = rationalNumber(point.value);
      requireCondition(pointValue >= min - 1e-9 && pointValue <= max + 1e-9, `${question.skillId}: number-line point is outside its domain`);
    }
  } else if (model.type === "proportionalBar") {
    requireCondition(Array.isArray(value.bars) && value.bars.length > 0, `${question.skillId}: proportional-bar model is empty`);
    for (const bar of value.bars) {
      const segments = bar.segments || [];
      requireCondition(segments.length > 0, `${question.skillId}: proportional bar has no segments`);
      const known = segments.filter((segment) => segment.unknown !== true && segment.value !== undefined);
      requireCondition(known.every((segment) => Number.isFinite(rationalNumber(segment.value))), `${question.skillId}: proportional bar contains an invalid known segment`);
      if (bar.total !== undefined && known.length === segments.length) {
        const total = known.reduce((sum, segment) => sum + rationalNumber(segment.value), 0);
        requireCondition(nearlyEqual(total, rationalNumber(bar.total)), `${question.skillId}: proportional-bar segments do not match total`);
      }
    }
  } else if (model.type === "areaGrid") {
    requireCondition(Array.isArray(value.parts) && value.parts.length > 0, `${question.skillId}: area model has no rectangles`);
    requireCondition(value.parts.every((part) => Number(part.width) > 0 && Number(part.height) > 0), `${question.skillId}: area model contains an invalid rectangle`);
    const total = value.parts.reduce((sum, part) => sum + Number(part.width) * Number(part.height), 0);
    const declared = Number(value.total ?? value.value);
    if (value.total !== undefined || value.value !== undefined) {
      requireCondition(nearlyEqual(total, declared), `${question.skillId}: area rectangles do not match declared area`);
    }
  } else if (model.type === "clockSpan") {
    const startDay = Number(value.startDay ?? 0);
    const endDay = Number(value.endDay ?? startDay);
    const start = startDay * 1440 + Number(value.startHour) * 60 + Number(value.startMinute || 0);
    const end = endDay * 1440 + Number(value.endHour) * 60 + Number(value.endMinute || 0);
    requireCondition(end >= start, `${question.skillId}: clock span runs backwards`);
    if (value.durationMinutes !== undefined) {
      requireCondition(nearlyEqual(end - start, Number(value.durationMinutes)), `${question.skillId}: clock span duration is inaccurate`);
    }
  } else {
    throw new Error(`${question.skillId}: unsupported model family ${model.type}`);
  }
}

function sortedCsv(value) {
  return String(value).split(",").map((item) => Number(item.trim()));
}

function validateSemanticMath(question) {
  const id = question.semanticPromptStringId;
  const p = question.params;
  const answer = answerNumber(question);
  const expect = (value, label = id) => requireCondition(nearlyEqual(answer, value), `${question.skillId}: ${label} answer is mathematically inconsistent`);
  if (["question.addition", "question.appliedAddition", "question.makeTen"].includes(id)) expect(Number(p.a) + Number(p.b));
  else if (["question.subtraction", "question.appliedSubtraction", "question.subtractMakeTen"].includes(id)) expect(Number(p.a) - Number(p.b));
  else if (["question.multiplication", "question.appliedMultiplication"].includes(id)) expect(Number(p.a) * Number(p.b));
  else if (["question.division", "question.appliedDivision"].includes(id)) expect(Number(p.a) / Number(p.b));
  else if (id === "question.remainder") expect(Number(p.a) % Number(p.b));
  else if (id === "question.relatedMultiplyDivide") {
    requireCondition(Number(p.groups) * Number(p.perGroup) === Number(p.product), `${question.skillId}: related multiplication equation is inconsistent`);
    expect(Number(p.product) / Number(p.groups));
  } else if (id === "question.quotientRemainder") {
    requireCondition(Number(p.quotient) * Number(p.divisor) + Number(p.remainder) === Number(p.total), `${question.skillId}: quotient and remainder do not reconstruct the dividend`);
    requireCondition(Number(p.remainder) > 0 && Number(p.remainder) < Number(p.divisor), `${question.skillId}: remainder is outside its valid range`);
    requireCondition(question.answer.value === `${p.quotient} R ${p.remainder}`, `${question.skillId}: quotient/remainder answer text is inconsistent`);
  }
  else if (id === "question.pairObjects") expect(Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count)));
  else if (id === "question.countSet") {
    const shown = question.modelDescriptor.values.items?.[0];
    requireCondition(shown?.kind === "counterSet" && Number.isInteger(Number(shown.magnitude)), `${question.skillId}: count-the-group source is not a visible object set`);
    expect(Number(shown.magnitude));
  }
  else if (id === "question.patternVisualNext") {
    const sequence = String(p.pattern || "").split(/\s+/u).filter(Boolean);
    const unit = String(p.unit || "").split(/\s+/u).filter(Boolean);
    requireCondition(unit.length === 2 && unit[0] !== unit[1], `${question.skillId}: visual AB unit is not two distinct shapes`);
    requireCondition(sequence.length >= 4 && sequence.every((value, index) => value === unit[index % unit.length]), `${question.skillId}: visual AB sequence does not repeat its unit`);
    requireCondition(String(question.answer.value) === unit[sequence.length % unit.length], `${question.skillId}: visual pattern answer is not independently derived from the repeat`);
  }
  else if (id === "question.structuredQuantity") {
    const pattern = String(p.pattern);
    const filled = (pattern.match(/●/gu) || []).length;
    const open = (pattern.match(/○/gu) || []).length;
    const expectedCells = p.structure === "dice" ? 9 : 5;
    requireCondition(pattern.startsWith("[") && pattern.endsWith("]"), `${question.skillId}: structured quantity is not a bounded text pattern`);
    requireCondition(filled + open === expectedCells, `${question.skillId}: structured quantity has the wrong number of positions`);
    requireCondition(p.structure !== "dice" || (pattern.match(/\//gu) || []).length === 2, `${question.skillId}: dice pattern does not preserve a three-row layout`);
    expect(filled);
  }
  else if (id === "question.orderSetConnection" || id === "question.numberConnection") expect(String(p.marks || "").split(/\s+/u).filter(Boolean).length);
  else if (id === "question.frameNumber") {
    const frame = question.modelDescriptor.values.frames?.[0];
    requireCondition(Number(frame?.capacity) === 10, `${question.skillId}: number frame does not have ten cells`);
    expect(Number(frame?.value));
  }
  else if (id === "question.numberBetween") expect((Number(p.before) + Number(p.after)) / 2);
  else if (id === "question.oneMoreLess") expect(Number(p.number) + (p.direction === "more" ? 1 : -1));
  else if (id === "question.secondPartition") expect(Number(p.whole) - Number(p.secondA));
  else if (id === "question.missingPart") expect(Number(p.whole) - Number(p.part));
  else if (id === "question.makeTenFrame" || id === "question.hiddenPart") {
    expect(10 - Number(p.shown));
    const values = question.modelDescriptor.values;
    const frame = values.frames?.[0];
    requireCondition(Number(frame?.capacity) === 10 && Number(frame?.value) === Number(p.shown), `${question.skillId}: ten-frame stimulus does not match the shown part`);
    requireCondition(!Object.hasOwn(values, "strategy"), `${question.skillId}: cold ten-frame stimulus exposes the missing answer`);
    requireCondition(!Object.hasOwn(frame || {}, "label"), `${question.skillId}: ten-frame stimulus bypasses the child-string authority`);
    if (id === "question.hiddenPart") requireCondition(Number(frame?.coveredCount) === 10 - Number(p.shown), `${question.skillId}: opaque cover does not bind the hidden part`);
  }
  else if (id === "question.missingSubtrahend") expect(Number(p.whole) - Number(p.result));
  else if (id === "question.factFamily") {
    requireCondition(Number(p.a) + Number(p.b) === Number(p.whole), `${question.skillId}: fact family parts do not make whole`);
    expect(Number(p.b));
  } else if (id === "question.teenBuild") expect(10 + Number(p.ones));
  else if (id === "question.dataDifference") expect(Math.abs(Number(p.first) - Number(p.second)));
  else if (id === "question.responseListDifference") {
    const responses = String(p.responses).split(/\s*,\s*/u).filter(Boolean);
    const counts = Object.fromEntries(["cat", "dog", "bird"].map((value) => [value, responses.filter((response) => response === value).length]));
    requireCondition(counts.cat === Number(p.cats) && counts.dog === Number(p.dogs) && counts.bird === Number(p.birds), `${question.skillId}: response list does not match its one-to-one record`);
    expect(Math.abs(Number(p[`${String(p.moreCategory).replace(/s$/u, "")}s`]) - Number(p[`${String(p.lessCategory).replace(/s$/u, "")}s`])));
  } else if (id === "question.sortRecord") {
    const items = String(p.items).split(/\s+/u).filter(Boolean);
    requireCondition(items.filter((item) => item === "●").length === Number(p.circles) && items.filter((item) => item === "▲").length === Number(p.triangles), `${question.skillId}: displayed sort collection and record counts differ`);
    requireCondition(question.answer.value.includes("│".repeat(Number(p.circles))) && question.answer.value.includes("│".repeat(Number(p.triangles))), `${question.skillId}: one-mark record omits displayed items`);
  } else if (id === "question.twoCategoryDisplay") {
    const catTokens = String(p.firstGroup).trim().split(/\s+/u).filter((token) => token === "CAT");
    const dogTokens = String(p.secondGroup).trim().split(/\s+/u).filter((token) => token === "DOG");
    requireCondition(catTokens.length === Number(p.cats) && dogTokens.length === Number(p.dogs), `${question.skillId}: displayed groups and graph counts differ`);
    requireCondition(question.options.every((option) => /^CAT \|+\s+DOG \|+$/u.test(option.value.replaceAll("│", "|"))), `${question.skillId}: category display options are not stable open-font patterns`);
  }
  else if (id === "question.scaledSurveyVariation") expect(Math.abs(Number(p.first) - Number(p.second)));
  else if (id === "question.numberOrder") expect(Math.max(Number(p.a), Number(p.b), Number(p.c)));
  else if (id === "question.numberLeast") expect(Math.min(Number(p.a), Number(p.b), Number(p.c)));
  else if (id === "question.scalePlace") expect(Number(p.number) * Number(p.factor));
  else if (id === "question.coinEquivalent") {
    const cents = Number(String(p.secondCoin).replace(/[^\d]/gu, "")) * (String(p.secondCoin).startsWith("$") ? 100 : 1);
    expect(Number(p.amount) / cents);
  } else if (id === "question.moneyOperation") expect(Number(p.paid) - Number(p.cost));
  else if (id === "question.moneyPurchase") expect(Number(p.firstCost) + Number(p.secondCost));
  else if (id === "question.moneyTotalCost") expect(Number(p.firstCost) + Number(p.secondCost) + Number(p.thirdCost));
  else if (id === "question.moneyBudget") expect(Number(p.budget) - Number(p.firstCost) - Number(p.secondCost));
  else if (id === "question.areaRectangle") expect(Number(p.length) * Number(p.width));
  else if (id === "question.compositeArea") expect(Number(p.l1) * Number(p.w1) + Number(p.l2) * Number(p.w2));
  else if (id === "question.prismVolume") expect(Number(p.length) * Number(p.width) * Number(p.height));
  else if (id === "question.polygonPerimeter") expect(String(p.sides).split("+").reduce((sum, side) => sum + Number(side.trim()), 0));
  else if (id === "question.patternExpression") expect(Number(p.start) + Number(p.step) * Number(p.n));
  else if (id === "question.patternRuleExpression") {
    const expected = p.operation === "addition" ? Number(p.n) + Number(p.constant)
      : p.operation === "subtraction" ? Number(p.n) - Number(p.constant)
        : p.operation === "multiplication" ? Number(p.n) * Number(p.constant)
          : Number(p.n) / Number(p.constant);
    expect(expected);
  }
  else if (["question.remainderWhole", "question.remainderFraction", "question.remainderInterpret", "question.remainderFullGroups"].includes(id)) {
    const total = Number(p.total);
    const divisor = Number(p.divisor);
    const quotient = Number(p.quotient);
    const remainder = Number(p.remainder);
    requireCondition(quotient * divisor + remainder === total, `${question.skillId}: interpreted remainder does not reconstruct the dividend`);
    requireCondition(remainder > 0 && remainder < divisor, `${question.skillId}: interpreted remainder is outside its valid range`);
    if (p.interpretation === "whole-remainder") {
      requireCondition(id === "question.remainderWhole" && question.answer.kind === "text" && question.answer.targetForm === "VALUE", `${question.skillId}: whole-remainder answer contract drifted`);
      requireCondition(question.answer.value === `${quotient} R ${remainder}`, `${question.skillId}: whole-remainder answer is inconsistent`);
    } else if (p.interpretation === "fraction") {
      requireCondition(id === "question.remainderFraction" && question.answer.kind === "rational" && question.answer.targetForm === "MIXED", `${question.skillId}: fractional-remainder answer contract drifted`);
      requireCondition(/^[-+]?\d+\s+\d+\/\d+$/u.test(question.answer.value), `${question.skillId}: fractional-remainder answer is not a mixed number`);
      expect(total / divisor, "fractional remainder");
    } else if (p.interpretation === "round-up") {
      requireCondition(id === "question.remainderInterpret" && question.answer.kind === "integer", `${question.skillId}: round-up answer contract drifted`);
      expect(quotient + 1, "round-up remainder");
    } else if (p.interpretation === "round-down") {
      requireCondition(id === "question.remainderFullGroups" && question.answer.kind === "integer", `${question.skillId}: round-down answer contract drifted`);
      expect(quotient, "round-down remainder");
    } else {
      throw new Error(`${question.skillId}: unknown remainder interpretation ${String(p.interpretation)}`);
    }
  }
  else if (id === "question.scaledSurveyPlan") expect(Number(p.responses) / Number(p.symbols));
  else if (id === "question.symmetryComplete") expect(Number(p.target) - Number(p.shown));
  else if (id === "question.coordinateMove") requireCondition(question.answer.value === `(${Number(p.x) + Number(p.dx)},${Number(p.y) + Number(p.dy)})`, `${question.skillId}: coordinate move is inconsistent`);
  else if (id === "question.directCompare") requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "first" : "second"), `${question.skillId}: direct comparison is inconsistent`);
  else if (id === "question.attributeName") requireCondition(["length", "mass", "capacity", "duration"].includes(question.answer.value), `${question.skillId}: attribute name is invalid`);
  else if (id === "question.fairShare") requireCondition(question.answer.value === (Number(p.total) % Number(p.recipients) === 0 ? "yes" : "no"), `${question.skillId}: fair-share decision is inconsistent`);
  else if (id === "question.eventDuration") requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "first" : "second"), `${question.skillId}: duration comparison is inconsistent`);
  else if (id === "question.compare") requireCondition(question.answer.value === (Number(p.a) > Number(p.b) ? "more" : Number(p.a) < Number(p.b) ? "fewer" : "same"), `${question.skillId}: quantity comparison is inconsistent`);
  else if (id === "question.decimalCompare") expect(Math.max(Number(p.left), Number(p.right)));
  else if (id === "question.contextIntegerCompare") expect(Math.max(Number(p.first), Number(p.second)));
  else if (["question.integerOrderList", "question.contextIntegerOrder", "question.decimalOrderList"].includes(id)) {
    const values = sortedCsv(question.answer.value);
    requireCondition(values.every((value, index) => index === 0 || values[index - 1] <= value), `${question.skillId}: ordered list is not least-to-greatest`);
  } else if (id === "question.rounding") expect(Math.round(Number(p.source) / Number(p.place)) * Number(p.place));
  else if (id === "question.durationMinutes") {
    const start = Number(p.startHour) * 60 + Number(p.startMinuteText);
    const end = Number(p.endHour) * 60 + Number(p.endMinuteText);
    expect(end - start);
  } else if (id === "question.timetableInterval") {
    const start = Number(p.startDay) * 1440 + Number(p.startHour) * 60 + Number(p.startMinuteText);
    const end = Number(p.endDay) * 1440 + Number(p.endHour) * 60 + Number(p.endMinuteText);
    expect(end - start);
  } else if (id === "question.timeReadMinute" || id === "question.timeReadDigital") {
    requireCondition(question.answer.value === `${p.hour}:${p.minuteText}`, `${question.skillId}: clock reading does not match its hands`);
  } else if (id === "question.fractionEquivalent") {
    requireCondition(nearlyEqual(rationalNumber(p.left), answer), `${question.skillId}: equivalent fraction changes value`);
  } else if (id === "question.percentDecimal" || id === "question.percentFraction") expect(Number(p.percent) / 100);
  else if (id === "question.decimal") expect(Number(p.whole) + Number(p.fractional) / (p.place === "tenths" ? 10 : p.place === "hundredths" ? 100 : 1000));
  else if (id === "question.fractionOperation" || id === "question.decimalOperation") {
    const left = rationalNumber(p.left);
    const right = rationalNumber(p.right);
    expect(p.operator === "+" ? left + right : p.operator === "−" || p.operator === "-" ? left - right : left * right);
  } else if (id === "question.chanceFrequency") {
    requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "blue" : "gold"), `${question.skillId}: chance-frequency comparison is inconsistent`);
  } else if (id === "question.chanceRunCompare") {
    requireCondition(question.answer.value === (Number(p.run1Blue) > Number(p.run2Blue) ? "run one" : "run two"), `${question.skillId}: repeated-run comparison is inconsistent`);
    requireCondition(Number(p.run1Blue) <= Number(p.trials) && Number(p.run2Blue) <= Number(p.trials), `${question.skillId}: repeated-run frequency exceeds trials`);
  } else if (id === "question.surveyMostLeast" || id === "question.surveyResponseList") {
    const series = { cats: Number(p.cats), dogs: Number(p.dogs), birds: Number(p.birds) };
    const target = p.goal === "most" ? Math.max(...Object.values(series)) : Math.min(...Object.values(series));
    requireCondition(series[question.answer.value] === target, `${question.skillId}: survey most/least interpretation is inconsistent`);
    if (id === "question.surveyResponseList") {
      const responses = String(p.responses).split(/\s*,\s*/u).filter(Boolean);
      requireCondition(responses.filter((value) => value === "cat").length === series.cats
        && responses.filter((value) => value === "dog").length === series.dogs
        && responses.filter((value) => value === "bird").length === series.birds, `${question.skillId}: shown survey response list does not match the derived display`);
    }
  } else if (id === "question.featureDescription") {
    const descriptions = {
      circle: "one curved edge and no vertices",
      triangle: "3 straight sides and 3 vertices",
      square: "4 equal straight sides and 4 vertices",
      rectangle: "2 long and 2 short straight sides",
      cube: "6 square faces, 12 edges and 8 vertices",
      sphere: "one curved surface and no edges or vertices",
      cylinder: "2 flat circular faces and one curved surface",
      cone: "one flat circular face, one curved surface and one vertex",
    };
    requireCondition(question.answer.value === descriptions[p.shape], `${question.skillId}: shape feature description is inconsistent`);
  } else if (id === "question.distributionMode") {
    const series = { A: Number(p.a), B: Number(p.b), C: Number(p.c) };
    requireCondition(series[question.answer.value] === Math.max(...Object.values(series)), `${question.skillId}: distribution mode is inconsistent`);
  } else if (id === "question.factorClass") {
    const number = Number(p.number);
    const divisors = Array.from({ length: number }, (_, index) => index + 1).filter((value) => number % value === 0);
    const actual = p.classification === "prime" ? divisors.length === 2
      : p.classification === "composite" ? divisors.length > 2
        : p.classification === "square" ? Number.isInteger(Math.sqrt(number))
          : Number.isInteger(Math.cbrt(number));
    requireCondition(question.answer.value === (actual ? "yes" : "no"), `${question.skillId}: factor classification is inconsistent`);
  } else if (id === "question.distributionShape") {
    const values = sortedCsv(p.values);
    const expected = values.every((value, index) => index === 0 || values[index - 1] < value) ? "rising"
      : values.every((value, index) => index === 0 || values[index - 1] > value) ? "falling"
        : values.every((value) => value === values[0]) ? "flat" : "peak in the middle";
    requireCondition(question.answer.value === expected, `${question.skillId}: distribution classification is inconsistent`);
  }
}

function validateFacetCoverage(engine, skill, questions) {
  const ids = new Set(questions.map((question) => question.semanticPromptStringId));
  const taskTypes = new Set(questions.map((question) => question.taskType));
  const values = (selector) => new Set(questions.map(selector).filter((value) => value !== undefined && value !== null && value !== ""));
  const requireSet = (actual, expected, label) => {
    for (const value of expected) requireCondition(actual.has(value), `${skill.id}: missing ${label} facet ${value}`);
  };
  requireCondition(questions.every((question) => !/\b1 (?:shells|acorns|moon rocks|groups|tens|tenths|times)\b|\ba elevation\b|[.!?]{2,}$/iu.test(question.prompt)), `${skill.id}: generated singular grammar or punctuation regressed`);
  if (["MQ-003", "MQ-021"].includes(skill.id)) {
    requireCondition(questions.every((question) => question.inputMethod === "PAIR_LINK"
      && question.semanticPromptStringId === "question.compare"
      && Number.isInteger(Number(question.params.leftCount))
      && Number.isInteger(Number(question.params.rightCount))
      && Number(question.params.leftCount) >= 0
      && Number(question.params.rightCount) >= 0), `${skill.id}: comparison does not require one-to-one pairing`);
  }
  if (skill.id === "MQ-027") {
    requireCondition(questions.every((question) => question.options.length >= 2
      && question.options.every((option) => /^\d+$/u.test(String(option.value)))
      && question.options.filter((option) => String(option.value) === String(question.answer.value)).length === 1), `${skill.id}: one-more/less distractors are not unique numeric candidates`);
  }
  if (skill.id === "MQ-031") requireCondition(questions.every((question) => question.inputMethod === "NUMBER_PAD" && question.inputClass === "CONSTRUCTION"), `${skill.id}: numeral formation is not constructive`);
  if (skill.id === "MQ-035") {
    const expectedByTask = new Map([
      ["compare-two-objects-directly", ["question.directCompare", "compare"]],
      ["name-compared-attribute", ["question.attributeName", "name-attribute"]],
    ]);
    requireCondition(questions.every((question) => {
      const expected = expectedByTask.get(question.taskType);
      return expected && question.semanticPromptStringId === expected[0] && question.params.evidenceFacet === expected[1];
    }), `${skill.id}: declared comparison task type is not bound to its evidence`);
  }
  if (skill.id === "MQ-048") {
    const expectedValues = ["5¢", "10¢", "25¢", "$1", "$2"];
    const expectedByTask = new Map([
      ["match-practice-token-5-cents", ["single-dot", "5¢"]],
      ["match-practice-token-10-cents", ["double-stripe", "10¢"]],
      ["match-practice-token-25-cents", ["triangle-dots", "25¢"]],
      ["match-practice-token-1-dollar", ["cross-bars", "$1"]],
      ["match-practice-token-2-dollars", ["ring-diamond", "$2"]],
    ]);
    requireCondition(questions.every((question) => question.options.length === 5
      && canonical(question.options.map((option) => option.value).sort()) === canonical([...expectedValues].sort())
      && question.options.filter((option) => option.value === question.answer.value).length === 1
      && expectedByTask.get(question.taskType)?.[0] === question.params.tokenId
      && expectedByTask.get(question.taskType)?.[1] === question.answer.value), `${skill.id}: token task mapping or answer presence leaks through the choice set`);
    requireSet(values((question) => question.params.tokenId), ["single-dot", "double-stripe", "triangle-dots", "cross-bars", "ring-diamond"], "practice-token identity");
  }
  if (["MQ-040", "MQ-041"].includes(skill.id)) {
    requireSet(values((question) => strategyMethodOracle(question)), skill.constraints.strategies, "strategy witness");
    requireCondition(questions.every((question) => {
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && canonical(Object.keys(response).sort()) === canonical(["strategy", "value", "work"])
        && response.strategy === strategyMethodOracle(question)
        && canonical(response.work) === canonical(strategyWorkOracle(question))
        && response.value === strategyResultOracle(question)
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: independent method, work, and result evidence is not collected`);
  }
  if (skill.id === "MQ-058") {
    requireCondition(questions.filter((question) => question.taskType === "addition").every((question) => ["question.addition", "question.appliedAddition"].includes(question.semanticPromptStringId)), `${skill.id}: addition witness does not display addition`);
    requireCondition(questions.filter((question) => question.taskType === "subtraction").every((question) => question.semanticPromptStringId === "question.factFamily"), `${skill.id}: subtraction witness does not display subtraction`);
  }
  if (skill.id === "MQ-063") {
    requireSet(ids, ["question.relatedMultiplyDivide", "question.factFamilyBuild"], "model/equation link");
    requireSet(values((question) => question.params.evidenceFacet), ["group-model", "related-equations"], "multiplication/division evidence");
    requireCondition(questions.every((question) => question.taskType === "write-related-multiplication-and-division-equations"
      ? question.semanticPromptStringId === "question.factFamilyBuild" && question.params.evidenceFacet === "related-equations" && question.inputMethod === "FACT_FAMILY"
      : question.taskType === "model-related-multiplication-and-division" && question.semanticPromptStringId === "question.relatedMultiplyDivide" && question.params.evidenceFacet === "group-model" && question.inputMethod === "GROUP_BUILD"), `${skill.id}: declared link task omits its constructive response`);
  }
  if (skill.id === "MQ-071") {
    requireCondition(questions.every((question) => question.inputMethod === "GRID_ROUTE"
      && question.params.keyRequired === true
      && question.params.landmarks?.length >= 2
      && question.params.mapKey?.length >= 2
      && question.params.mapKey.every((entry) => entry.symbol && entry.label)), `${skill.id}: required map key or landmarks are missing`);
  }
  if (skill.id === "MQ-078") requireCondition(questions.every((question) => answerNumber(question) <= 12), `${skill.id}: known-fact quotient exceeds twelve`);
  if (skill.id === "MQ-079") {
    requireSet(values((question) => strategyMethodOracle(question)), ["partition", "array", "written layout"], "multiplication strategy");
    requireCondition(questions.every((question) => {
      const operands = [Number(question.params.a), Number(question.params.b)];
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && operands.filter((value) => value >= 10 && value <= 99).length === 1
        && operands.filter((value) => value >= 1 && value <= 9).length === 1
        && response.value === operands[0] * operands[1]
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: exact 10-99 by 1-9 strategy work is not collected`);
  }
  if (skill.id === "MQ-095") requireCondition(questions.every((question) => question.inputMethod === "STRATEGY_BUILD"
    && ["mental", "written"].every((method) => {
      const response = correctStrategyBuildResponse(question, method);
      return response.strategy === method && response.work.length > 0 && engine.gradeAnswer(question, response).correct;
    })), `${skill.id}: independently derived mental and written work is not collected`);
  if (skill.id === "MQ-097") {
    requireCondition(questions.every((question) => {
      const response = correctStrategyBuildResponse(question);
      return question.inputMethod === "STRATEGY_BUILD"
        && canonical(question.params.responseValueChoices) === canonical(["odd", "even"])
        && response.work.length === 2
        && engine.gradeAnswer(question, response).correct;
    }), `${skill.id}: parity result or proof rule is invalid`);
  }
  if (skill.id === "MQ-101") requireCondition(questions.every((question) => {
    const response = correctStrategyBuildResponse(question);
    return question.inputMethod === "STRATEGY_BUILD"
      && response.strategy === "use subtraction"
      && response.work.length === 2
      && engine.gradeAnswer(question, response).correct;
  }), `${skill.id}: inverse-operation work is not independently verified`);
  if (skill.id === "MQ-106") {
    requireCondition(questions.some((question) => Number(question.params.rotation) !== 0), `${skill.id}: shape orientation never varies`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.symmetryComplete").every((question) => {
      const expected = question.params.shape === "triangle" ? ["line1", "line3", "line4"] : question.params.shape === "rectangle" ? ["line1", "line2"] : ["line1", "line2", "line3", "line4"];
      return canonical([...question.params.shownLineIds, ...question.params.requiredLineIds]) === canonical(expected);
    }), `${skill.id}: symmetry axes do not match the shown shape`);
  }
  if (skill.id === "MQ-002" || skill.id === "MQ-008") {
    requireCondition(ids.size === 1 && ids.has("question.countSet"), `${skill.id}: count-the-group prompt drifted`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.data?.count === answerNumber(question)
      && question.modelDescriptor.values.items?.[0]?.magnitude === answerNumber(question)), `${skill.id}: visible object group does not independently match its answer`);
  } else if (skill.id === "MQ-004") {
    requireSet(ids, ["question.patternNext", "question.patternVisualNext"], "screen-native pattern prompt");
    const visualQuestions = questions.filter((question) => question.semanticPromptStringId === "question.patternVisualNext");
    requireCondition(visualQuestions.length > 0 && visualQuestions.every((question) => question.params.situationId === "shape-cards"
      && question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.items?.[0]?.sequence?.length >= 4
      && question.inputMethod === "PATTERN_BUILD"
      && new Set(question.params.tokenChoices).size === 4), `${skill.id}: visual pattern stimulus or choices are incomplete`);
  } else if (skill.id === "MQ-005") {
    requireSet(values((question) => question.params.shape), skill.constraints.shapes, "shape");
    requireCondition(values((question) => question.params.color).size >= 4, `${skill.id}: colour variation is not exercised`);
    requireSet(values((question) => question.params.size), ["small", "large"], "size");
    requireCondition([...values((question) => question.params.rotation)].some((rotation) => Number(rotation) !== 0), `${skill.id}: turn variation is not exercised`);
  } else if (skill.id === "MQ-006") {
    const sourcePairs = new Set(questions.map((question) => [question.params.firstObject, question.params.secondObject].sort().join("|")));
    requireCondition(ids.size === 1 && ids.has("question.eventDuration"), `${skill.id}: early duration comparison uses the wrong prompt family`);
    requireCondition(questions.every((question) => {
      const first = Number(question.params.first), second = Number(question.params.second), descriptor = question.modelDescriptor?.values;
      const optionValues = new Set(question.options.map((option) => String(option.value)));
      const candidates = descriptor?.candidates || [], items = descriptor?.items || [];
      return question.optionCount === 2
        && optionValues.size === 2
        && optionValues.has("first")
        && optionValues.has("second")
        && first > 0
        && second > 0
        && first !== second
        && Math.max(first, second) >= 4 * Math.min(first, second)
        && descriptor?.kind === "durationPair"
        && items.length === 2
        && candidates.length === 2
        && items.every((item) => item.kind === "durationEvent" && item.magnitude > 0 && item.unit === "minutes")
        && candidates.every((candidate) => candidate.kind === "durationEvent" && optionValues.has(String(candidate.optionValue)));
    }), `${skill.id}: two-choice duration source/candidate contract drifted`);
    requireCondition(sourcePairs.size >= 3, `${skill.id}: familiar activity variation is not exercised`);
    requireSet(values((question) => question.answer.value), ["first", "second"], "correct answer position");
  } else if (skill.id === "MQ-007") {
    requireSet(values((question) => question.modelDescriptor.values.rule?.attribute), skill.constraints.attributes, "sort attribute");
    requireSet(values((question) => question.modelDescriptor.values.categories?.length), skill.constraints.categoryCount, "sort category count");
    requireCondition(questions.every((question) => question.modelDescriptor.values.items.length <= Number(skill.constraints.itemCountMax)), `${skill.id}: categorized sort exceeds its item-count bound`);
  } else if (skill.id === "MQ-009" || skill.id === "MQ-020") {
    requireSet(values((question) => question.params.structure), skill.constraints.structures, "structured-set representation");
    requireCondition(questions.every((question) => Number(question.answer.value) >= Number(skill.constraints.minNumber)
      && Number(question.answer.value) <= Number(skill.constraints.maxNumber)
      && question.modelDescriptor.values.data?.count === Number(question.answer.value)), `${skill.id}: structured-set count falls outside its declared bounds`);
  } else if (skill.id === "MQ-010") {
    requireCondition(ids.size === 1 && ids.has("question.orderSetConnection"), `${skill.id}: sequence/set connection is not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.count === answerNumber(question)), `${skill.id}: collection does not match numeral`);
  } else if (skill.id === "MQ-012") {
    requireSet(values((question) => question.params.attributeKind), skill.constraints.attributes, "direct-comparison attribute");
    requireCondition(questions.every((question) => !/\d/u.test(question.prompt)), `${skill.id}: direct comparison leaks a numbered scale`);
  } else if (skill.id === "MQ-015") {
    requireSet(values((question) => question.answer.value), ["yes", "no"], "equal-share result");
    requireCondition(questions.every((question) => Number(question.params.recipients) === 2 && Number(question.params.total) <= 6), `${skill.id}: fair-share bounds drift`);
  } else if (skill.id === "MQ-017") {
    requireSet(values((question) => question.params.relation), skill.constraints.relations, "landmark relation");
    requireCondition(questions.every((question) => question.modelDescriptor.values.items?.[0]?.kind === "landmark"), `${skill.id}: landmark relation lacks a spatial scene`);
  } else if (skill.id === "MQ-018") {
    requireCondition(ids.size === 1 && ids.has("question.sortRecord"), `${skill.id}: sort and one-mark record are not a composite task`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.responses?.length === Number(question.params.circles) + Number(question.params.triangles)), `${skill.id}: displayed collection is not preserved in the record model`);
  } else if (skill.id === "MQ-019") {
    requireSet(ids, ["question.numberConnection", "question.frameNumber"], "number/structured-frame prompt");
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.numberConnection").every((question) => question.params.numberWord && question.params.beforeWord && question.modelDescriptor.values.data?.count === answerNumber(question)), `${skill.id}: number-connection facets drift`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.frameNumber").every((question) => question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.frames?.[0]?.capacity === 10
      && question.modelDescriptor.values.frames?.[0]?.value === answerNumber(question)), `${skill.id}: ten-frame/numeral connection drifts`);
  } else if (skill.id === "MQ-023") {
    requireSet(ids, ["question.missingPart", "question.makeTenFrame", "question.hiddenPart"], "part-of-ten activity");
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.makeTenFrame").every((question) => Number(question.params.shown) + answerNumber(question) === 10
      && question.inputMethod === "PICTURE_CHOICE"
      && question.modelDescriptor.values.data?.stimulus === true), `${skill.id}: make-ten activity does not complete ten`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.hiddenPart").every((question) => Number(question.params.shown) + answerNumber(question) === 10
      && question.inputMethod === "PICTURE_CHOICE"
      && question.modelDescriptor.values.frames?.[0]?.coveredCount === answerNumber(question)), `${skill.id}: hidden-part activity does not preserve the ten-cell whole`);
  } else if (skill.id === "MQ-024") {
    requireSet(taskTypes, ["classify-flat-shape", "classify-solid"], "dimension task type");
    requireSet(values((question) => question.params.property), ["3 sides", "4 equal sides", "6 flat faces", "one curved surface and no flat faces"], "visible property");
  } else if (skill.id === "MQ-025") {
    requireSet(ids, ["question.numberBetween", "question.numberOrder", "question.numberLeast"], "number-order activity");
    for (const question of questions.filter((candidate) => candidate.semanticPromptStringId === "question.numberOrder" || candidate.semanticPromptStringId === "question.numberLeast")) {
      const shown = [Number(question.params.a), Number(question.params.b), Number(question.params.c)];
      requireCondition(new Set(shown).size === 3 && shown.every((value) => value >= 0 && value <= 20), `${skill.id}: extrema choices are not three distinct in-range numerals`);
      requireCondition(question.options.length === 3 && question.modelDescriptor.values.data?.stimulus === true, `${skill.id}: extrema activity is not a visible three-choice comparison`);
    }
  } else if (skill.id === "MQ-033") {
    requireCondition(questions.every((question) => question.params.unitMarked === true
      && question.modelDescriptor.values.data?.unitMarked === true
      && /^\[.+\](?:\s+\[.+\])+$/u.test(String(question.params.pattern))), `${skill.id}: repeating unit is not explicitly marked`);
  } else if (skill.id === "MQ-035") {
    requireSet(ids, ["question.directCompare", "question.attributeName"], "comparison/explanation prompt");
    requireSet(values((question) => question.params.attributeKind || question.answer.value), skill.constraints.attributes, "named attribute");
  } else if (skill.id === "MQ-036") {
    requireCondition(ids.size === 1 && ids.has("question.twoCategoryDisplay"), `${skill.id}: displayed categories and one-to-one graph are not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.scale === 1), `${skill.id}: early display does not preserve one mark per object`);
  } else if (skill.id === "MQ-042") {
    requireSet(values((question) => Number(question.params.minuteText)), skill.constraints.minuteValues, "clock minute");
    requireCondition(questions.every((question) => question.semanticPromptStringId === "question.timeReadMinute"), `${skill.id}: read-only objective drifts into another clock action`);
  } else if (skill.id === "MQ-051") {
    requireCondition(questions.every((question) => {
      const firstCoin = Number(String(question.params.firstCoin).replace(/[^\d]/gu, "")) * (String(question.params.firstCoin).startsWith("$") ? 100 : 1);
      const secondCoin = Number(String(question.params.secondCoin).replace(/[^\d]/gu, "")) * (String(question.params.secondCoin).startsWith("$") ? 100 : 1);
      return Number(question.params.firstCount) * firstCoin === Number(question.params.amount)
        && Number(question.answer.value) * secondCoin === Number(question.params.amount);
    }), `${skill.id}: the two coin combinations are not equivalent`);
  } else if (skill.id === "MQ-052") {
    requireSet(taskTypes, ["classify-flat-shape", "classify-solid"], "classification dimension");
    requireCondition(questions.filter((question) => question.taskType === "classify-flat-shape").every((question) => ["triangle", "square"].includes(question.answer.value)), `${skill.id}: flat-shape task leaks solids`);
    requireCondition(questions.filter((question) => question.taskType === "classify-solid").every((question) => ["cube", "sphere"].includes(question.answer.value)), `${skill.id}: solid task leaks flat shapes`);
  } else if (skill.id === "MQ-054") {
    requireCondition(ids.size === 1 && ids.has("question.responseListDifference"), `${skill.id}: response-list collection, display, and comparison are not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.scale === 1 && question.modelDescriptor.values.data?.responses?.length > 0), `${skill.id}: one-to-one response evidence is missing`);
  } else if (skill.id === "MQ-063") {
    requireCondition(questions.every((question) => Number(question.params.groups ?? question.params.a) * Number(question.params.perGroup ?? question.params.b) === Number(question.params.product ?? question.params.whole)), `${skill.id}: related equation facts drift`);
  } else if (skill.id === "MQ-065") {
    requireCondition(questions.every((question) => Number(question.params.paid) <= Number(skill.constraints.amountMaxCents)
      && Number(question.params.cost) < Number(question.params.paid)
      && Number(question.params.cost) % Number(skill.constraints.incrementCents) === 0
      && answerNumber(question) === Number(question.params.paid) - Number(question.params.cost)), `${skill.id}: Canadian change task drifts from its price/payment contract`);
  } else if (skill.id === "MQ-069") {
    requireSet(ids, ["question.metricUnitChoice", "question.metricRead"], "choose/use prompt");
    const expected = ["centimetres", "metres", "grams", "kilograms", "millilitres", "litres"];
    const familyByUnit = new Map([
      ["centimetres", "length"],
      ["metres", "length"],
      ["grams", "mass"],
      ["kilograms", "mass"],
      ["millilitres", "capacity"],
      ["litres", "capacity"],
    ]);
    const objectByUnit = new Map([
      ["centimetres", "pencil"],
      ["metres", "door"],
      ["grams", "apple"],
      ["kilograms", "child"],
      ["millilitres", "cup"],
      ["litres", "bucket"],
    ]);
    const situationByFamily = new Map([
      ["length", "ruler-bench"],
      ["mass", "mass-scale"],
      ["capacity", "capacity-scale"],
    ]);
    requireSet(values((question) => question.params.unit || question.answer.value), expected, "metric unit");
    for (const unit of expected) {
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricUnitChoice" && question.answer.value === unit), `${skill.id}: ${unit} is never chosen`);
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricRead" && question.params.unit === unit), `${skill.id}: ${unit} is never used`);
    }
    const choices = questions.filter((question) => question.semanticPromptStringId === "question.metricUnitChoice");
    const readings = questions.filter((question) => question.semanticPromptStringId === "question.metricRead");
    requireCondition(choices.every((question) => question.prompt.includes(`measure the ${familyByUnit.get(question.answer.value)} of this ${question.params.object}`)), `${skill.id}: a unit-choice prompt does not name the intended measurable attribute and object`);
    requireCondition(choices.every((question) => {
      const family = familyByUnit.get(question.answer.value);
      const item = question.modelDescriptor.values.items?.[0];
      return question.params.object === objectByUnit.get(question.answer.value)
        && question.params.measureKind === family
        && question.params.situationId === situationByFamily.get(family)
        && item?.kind === "metricObject"
        && item.objectKind === question.params.object
        && item.measureKind === family
        && item.unit === undefined
        && question.modelDescriptor.values.data?.suitableUnit === undefined
        && question.options.filter((option) => String(option.value) === String(question.answer.value)).length === 1
        && (question.tier === "EASY"
          ? question.options.length === 2 && item.showFamilyCue === true
          : question.options.length === 4
            && item.showFamilyCue === false
            && question.options.some((option) => (
              option.value !== question.answer.value
              && familyByUnit.get(option.value) === family
            )));
    }), `${skill.id}: unit-choice picture, answer-scrub, situation, or tier contract drifted`);
    requireCondition(readings.every((question) => (
      question.params.situationId === situationByFamily.get(familyByUnit.get(question.params.unit))
      && Number(question.answer.value) >= 1
      && Number(question.answer.value) <= (question.tier === "EASY" ? 10 : 20)
      && Number(question.params.scaleMaximum) === (question.tier === "EASY" ? 10 : 20)
    )), `${skill.id}: metric-reading family, bound, or scale maximum drifted`);
    requireCondition(
      readings.some((question) => question.tier === "HARD/TARGET" && Number(question.answer.value) > 10),
      `${skill.id}: hard metric readings never exceed the Easy bound`,
    );
  } else if (skill.id === "MQ-070") {
    requireSet(taskTypes, ["describe-flat-shape", "describe-solid"], "description dimension");
    requireCondition(questions.filter((question) => question.taskType === "describe-flat-shape").every((question) => ["circle", "triangle", "square", "rectangle"].includes(question.params.shape)), `${skill.id}: flat-shape descriptions leak solids`);
    requireCondition(questions.filter((question) => question.taskType === "describe-solid").every((question) => ["cube", "sphere", "cylinder", "cone"].includes(question.params.shape)), `${skill.id}: solid descriptions leak flat shapes`);
  } else if (skill.id === "MQ-072") {
    requireSet(values((question) => question.params.display), ["tally", "picture graph"], "survey display");
    requireSet(values((question) => question.params.goal), ["most", "least"], "survey interpretation");
    requireCondition(questions.every((question) => String(question.params.responses).split(/\s*,\s*/u).length > 0), `${skill.id}: task omits shown response-list evidence`);
  } else if (skill.id === "MQ-086") {
    requireSet(ids, ["question.timeReadMinute", "question.timeReadDigital", "question.durationMinutes"], "time representation");
    requireCondition(questions.some((question) => Number(question.params.minuteText || question.params.startMinuteText) > 0), `${skill.id}: time-to-the-minute never leaves :00`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.durationMinutes").every((question) => answerNumber(question) <= 59), `${skill.id}: duration exceeds one hour`);
  } else if (skill.id === "MQ-090") {
    requireCondition(ids.size === 1 && ids.has("question.chanceRunCompare"), `${skill.id}: task is not a repeated-run comparison`);
    requireSet(values((question) => Number(question.params.trials)), skill.constraints.trialsPerRun, "trial-count");
    requireCondition(questions.every((question) => Number(question.params.run1Blue) !== Number(question.params.run2Blue)), `${skill.id}: repeated runs are not contrastive`);
  } else if (skill.id === "MQ-080") {
    requireCondition(ids.size === 1 && ids.has("question.quotientRemainder"), `${skill.id}: task omits quotient or remainder`);
    requireCondition(questions.every((question) => Number(question.params.remainder) > 0 && Number(question.params.remainder) < Number(question.params.divisor)), `${skill.id}: invalid remainder generated`);
  } else if (skill.id === "MQ-081") {
    requireSet(values((question) => question.params.comparisonType), skill.constraints.comparisonTypes, "fraction comparison type");
    requireCondition(questions.every((question) => {
      const left = rationalNumber(question.params.left);
      const right = rationalNumber(question.params.right);
      return left >= 0 && left <= 1 && right >= 0 && right <= 1 && !nearlyEqual(left, right);
    }), `${skill.id}: fraction comparison is equal or outside zero to one`);
  } else if (skill.id === "MQ-084") {
    requireSet(taskTypes, skill.constraints.operations, "number-rule operation");
    requireCondition(questions.every((question) => String(question.params.pattern).split(",").length >= Number(skill.constraints.termsMin)), `${skill.id}: fewer terms are shown than declared`);
  } else if (skill.id === "MQ-085") {
    requireCondition(questions.every((question) => Number(question.params.paid) % 100 === 0
      && Number(question.params.cost) < Number(question.params.paid)
      && Number(question.params.cost) % Number(skill.constraints.incrementCents) === 0), `${skill.id}: whole-dollar payment/change contract drifts`);
  } else if (skill.id === "MQ-107") {
    requireSet(ids, ["question.scaledSurveyPlan", "question.scaledSurveyVariation"], "plan/variation prompt");
    requireSet(values((question) => question.params.variableType), skill.constraints.variableTypes, "survey variable type");
    requireSet(values((question) => Number(question.params.scale || question.answer.value)), skill.constraints.scaleValues, "many-to-one scale");
  } else if (skill.id === "MQ-109") {
    requireSet(taskTypes, ["compare", "order"], "integer operation");
    requireCondition(questions.every((question) => question.taskType === "compare"
      ? Number(question.params.first) < 0 || Number(question.params.second) < 0
      : sortedCsv(question.answer.value).some((value) => value < 0)), `${skill.id}: a contextual task omits negative integers`);
    requireSet(values((question) => question.params.contextKey), skill.constraints.contexts, "integer context");
    const contextPolicies = {
      temperature: { label: "temperature (°C)", min: -40, max: 45 },
      elevation: { label: "elevation (metres)", min: -100, max: 1000 },
      score: { label: "game score (points)", min: -100, max: Number(skill.constraints.positiveMax) },
    };
    requireCondition(questions.every((question) => {
      const policy = contextPolicies[question.params.contextKey];
      if (!policy || question.params.context !== policy.label) return false;
      const generatedValues = question.taskType === "compare"
        ? [Number(question.params.first), Number(question.params.second)]
        : question.options.flatMap((option) => sortedCsv(option.value));
      return generatedValues.every((value) => Number.isInteger(value)
        && value >= policy.min
        && value <= policy.max);
    }), `${skill.id}: a contextual value or unit label is implausible`);
    requireCondition(questions.some((question) => question.params.contextKey === "score"
      && (question.taskType === "compare"
        ? Math.max(Number(question.params.first), Number(question.params.second)) > 1000
        : question.options.some((option) => sortedCsv(option.value).some((value) => value > 1000)))),
    `${skill.id}: score context never preserves declared large-number coverage`);
  } else if (skill.id === "MQ-100") {
    requireSet(taskTypes, ["compare-decimals", "order-decimals"], "decimal comparison operation");
    requireCondition(questions.filter((question) => question.taskType === "compare-decimals").every((question) => Number(question.params.left) !== Number(question.params.right)), `${skill.id}: decimal compare repeats the same value`);
    requireCondition(questions.filter((question) => question.taskType === "order-decimals").every((question) => sortedCsv(question.answer.value).length === 3), `${skill.id}: decimal order does not include three values`);
  } else if (skill.id === "MQ-099") {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.place)), ["tenths", "hundredths"], `${tier} decimal place`);
      requireCondition(rows.some((question) => question.params.place === "hundredths" && Number(question.params.fractional) % 10 !== 0), `${skill.id}: ${tier} never generates a genuine hundredths value`);
    }
    requireCondition(questions.every((question) => {
      const denominator = question.params.place === "tenths" ? 10 : 100;
      const whole = Number(question.params.whole);
      const fractional = Number(question.params.fractional);
      const representations = question.modelDescriptor.values.representations || [];
      const decimal = representations.find((representation) => representation.kind === "decimal");
      const fraction = representations.find((representation) => representation.kind === "fraction");
      return answerNumber(question) >= Number(skill.constraints.range[0])
        && answerNumber(question) <= Number(skill.constraints.range[1])
        && Number.isInteger(fractional) && fractional >= 0 && fractional < denominator
        && nearlyEqual(answerNumber(question), whole + fractional / denominator)
        && decimal && fraction
        && nearlyEqual(rationalNumber(decimal.value), answerNumber(question))
        && nearlyEqual(rationalNumber(fraction.value), answerNumber(question))
        && Number(fraction.denominator) === denominator
        && Number(fraction.numerator) === whole * denominator + fractional;
    }), `${skill.id}: decimal-place fraction model or zero-to-one range drifts`);
  } else if (skill.id === "MQ-103") {
    requireSet(taskTypes, skill.constraints.operations, "generating operation");
    requireCondition(questions.every((question) => String(question.params.pattern).split(",").length >= Number(skill.constraints.termsMin)), `${skill.id}: fewer generated terms are shown than declared`);
  } else if (skill.id === "MQ-112") {
    requireSet(taskTypes, ["classify-prime", "classify-composite", "classify-square", "classify-cube"], "factor classification");
    for (const taskType of skill.constraints.taskTypes) {
      const rows = questions.filter((question) => question.taskType === taskType);
      requireSet(new Set(rows.map((question) => question.answer.value)), ["yes", "no"], `${taskType} truth value`);
      requireCondition(rows.every((question) => question.modelDescriptor.values.data?.factorPairs?.length), `${skill.id}: ${taskType} lacks factor evidence`);
    }
  } else if (skill.id === "MQ-114") {
    const promptByInterpretation = {
      "whole-remainder": "question.remainderWhole",
      fraction: "question.remainderFraction",
      "round-up": "question.remainderInterpret",
      "round-down": "question.remainderFullGroups",
    };
    const unknownByInterpretation = {
      "whole-remainder": "quotientAndRemainder",
      fraction: "mixedQuotient",
      "round-up": "groupsNeeded",
      "round-down": "fullGroups",
    };
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.interpretation)), skill.constraints.remainderInterpretations, `${tier} remainder interpretation`);
    }
    requireSet(ids, Object.values(promptByInterpretation), "remainder prompt");
    requireCondition(questions.every((question) => {
      const p = question.params;
      const model = question.modelDescriptor.values;
      const answerBearingFieldHidden = model.groups === undefined;
      const divisorShown = Number(model.perGroup) === Number(p.divisor);
      return Number(p.quotient) * Number(p.divisor) + Number(p.remainder) === Number(p.total)
        && Number(p.total) <= Number(skill.constraints.dividendMax)
        && Number(p.divisor) <= Number(skill.constraints.divisorMax)
        && Number(p.remainder) > 0 && Number(p.remainder) < Number(p.divisor)
        && question.semanticPromptStringId === promptByInterpretation[p.interpretation]
        && model.operation === p.interpretation
        && model.interpretation === p.interpretation
        && model.unknown === unknownByInterpretation[p.interpretation]
        && Number(model.total) === Number(p.total)
        && divisorShown
        && answerBearingFieldHidden
        && model.remainder === undefined;
    }), `${skill.id}: remainder interpretation or answer-free stimulus contract drifts`);
  } else if (skill.id === "MQ-116") {
    requireSet(taskTypes, ["percent-to-fraction", "percent-to-decimal"], "percent conversion");
    requireCondition(questions.every((question) => nearlyEqual(answerNumber(question), Number(question.params.percent) / 100)), `${skill.id}: percent conversion changes value`);
  } else if (skill.id === "MQ-119") {
    requireSet(taskTypes, ["pattern-addition", "pattern-subtraction", "pattern-multiplication", "pattern-division"], "pattern operation");
    requireSet(values((question) => question.params.operation), ["addition", "subtraction", "multiplication", "division"], "expression operation");
    requireCondition(questions.filter((question) => question.params.operation === "division").every((question) => Number(question.params.n) % Number(question.params.constant) === 0), `${skill.id}: division expression does not have a whole-number value`);
  } else if (skill.id === "MQ-122") {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.representation)), skill.constraints.representations, `${tier} volume representation`);
      requireSet(new Set(rows.map((question) => question.params.method)), ["count", "multiply"], `${tier} volume method`);
      requireSet(new Set(rows.map((question) => question.params.unit)), skill.constraints.volumeUnits, `${tier} volume unit`);
      requireSet(new Set(rows.map((question) => question.params.solid)), skill.constraints.solids, `${tier} solid`);
      requireCondition(new Set(rows.map((question) => [question.params.representation, question.params.unit, question.params.solid].join("|"))).size === 8, `${skill.id}: ${tier} does not exercise all declared volume facet combinations`);
    }
    requireCondition(questions.every((question) => {
      const p = question.params;
      const length = Number(p.length);
      const width = Number(p.width);
      const height = Number(p.height);
      const total = length * width * height;
      const data = question.modelDescriptor.values.data;
      const item = question.modelDescriptor.values.items?.[0];
      const dimensionsValid = [length, width, height].every((value, index) => Number.isInteger(value) && value > 0 && value <= Number(skill.constraints.dimensionsMax[index]));
      const solidValid = p.solid === "cube" ? length === width && width === height : !(length === width && width === height);
      const representationValid = p.representation === "unit-cubes"
        ? p.method === "count" && item?.kind === "prism" && item.total === undefined && total <= 48
        : p.method === "multiply" && item?.kind === "cubeLayers" && Number(item.layers) === height
          && Number(item.cubesPerLayer) === length * width && item.total === undefined;
      return dimensionsValid && solidValid && answerNumber(question) === total && representationValid
        && data?.representation === p.representation && data?.method === p.method
        && data?.unit === p.unit && data?.solid === p.solid
        && Number(data?.length) === length && Number(data?.width) === width
        && Number(data?.height) === height && data?.total === undefined;
    }), `${skill.id}: volume representation, dimensions, or product drifts`);
  } else if (skill.id === "MQ-123") {
    const display = (hour, minute, format) => format === "24-hour"
      ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.format)), skill.constraints.formats, `${tier} timetable format`);
      requireCondition(rows.some((question) => Number(question.params.endDay) > Number(question.params.startDay)), `${skill.id}: ${tier} never crosses midnight`);
      requireCondition(rows.some((question) => answerNumber(question) > 1440), `${skill.id}: ${tier} never exercises a multi-day interval`);
      requireCondition(rows.some((question) => Number(question.params.startMinuteText) !== 0 || Number(question.params.endMinuteText) !== 0), `${skill.id}: ${tier} never exercises minute precision`);
    }
    requireCondition(questions.every((question) => {
      const p = question.params;
      const expectedStart = display(Number(p.startHour), Number(p.startMinuteText), p.format);
      const expectedEnd = display(Number(p.endHour), Number(p.endMinuteText), p.format);
      const model = question.modelDescriptor.values;
      return Number.isInteger(Number(p.startHour)) && Number(p.startHour) >= 0 && Number(p.startHour) <= 23
        && Number.isInteger(Number(p.endHour)) && Number(p.endHour) >= 0 && Number(p.endHour) <= 23
        && Number.isInteger(Number(p.startMinuteText)) && Number(p.startMinuteText) >= 0 && Number(p.startMinuteText) <= 59
        && Number.isInteger(Number(p.endMinuteText)) && Number(p.endMinuteText) >= 0 && Number(p.endMinuteText) <= 59
        && p.startTime === expectedStart && p.endTime === expectedEnd
        && question.prompt.includes(expectedStart) && question.prompt.includes(expectedEnd)
        && answerNumber(question) > 0 && answerNumber(question) <= Number(skill.constraints.daySpanMax) * 1440
        && model.format === p.format && model.startTime === expectedStart && model.endTime === expectedEnd
        && Number(model.startHour) === Number(p.startHour) && Number(model.endHour) === Number(p.endHour);
    }), `${skill.id}: timetable notation or elapsed-time model drifts`);
  } else if (skill.id === "MQ-125") {
    requireCondition(questions.every((question) => Number(question.params.x) >= 1
      && Number(question.params.y) >= 1
      && Number(question.params.x) + Number(question.params.dx) <= Number(skill.constraints.coordinateMax)
      && Number(question.params.y) + Number(question.params.dy) <= Number(skill.constraints.coordinateMax)), `${skill.id}: translated point leaves the declared first-quadrant grid`);
  } else if (skill.id === "MQ-126") {
    requireSet(ids, ["question.distributionShape", "question.distributionMode"], "shape/mode statistic");
    requireSet(values((question) => question.params.displayType), ["line graph", "comparative display"], "display type");
    requireSet(values((question) => question.semanticPromptStringId === "question.distributionShape" ? "shape" : "mode"), skill.constraints.statistics, "statistic");
  }
}

function submittedAttempt(engine, question, playDay = 30_000) {
  const answer = STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)
    ? correctStructuredResponse(engine, question)
    : question.answer.value;
  return engine.submitAnswer(question, answer, {
    promptFinishedAt: 1_000,
    submittedAt: 5_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    selectionEvents: [],
    hintUsed: false,
    modelUsed: true,
    sessionId: "semantic-suite",
    playDay,
  });
}

function stateFrom(result) {
  return result?.state ?? result?.newState ?? result;
}

function masteryAttempt(engine, skill, taskType, playDay, ordinal, overrides = {}) {
  return {
    recordId: `semantic-${skill.skillId}-${taskType}-${ordinal}`,
    questionId: `semantic-q-${ordinal}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType,
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    inputClass: "CONSTRUCTION",
    inputMethod: "NUMBER_PAD",
    selectionOptionCount: 0,
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: true,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|${taskType}|${ordinal}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 4_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: false,
    applied: false,
    preview: false,
    capstone: false,
    reteachStep: false,
    sessionId: "semantic-mastery",
    playDay,
    ...overrides,
  };
}

export async function runManifestSemanticSuite({
  root = DEFAULT_ROOT,
  indexPath = path.join(root, "index.html"),
  engineFilename = "math-quest-engine.js",
} = {}) {
  const assertions = [];
  const check = async (id, title, fn) => {
    try {
      await fn();
      assertions.push({ id, title, status: "PASS", details: "effect-sensitive assertion passed" });
    } catch (error) {
      assertions.push({ id, title, status: "FAIL", details: error?.stack || String(error) });
    }
  };

  let engine;
  let extracted;
  let manifestArtifact;
  await check("SEM-CORE", "Shipped engine and canonical manifest load together", async () => {
    extracted = await extractEngine(indexPath);
    engine = evaluateEngine(extracted.source, { filename: engineFilename });
    manifestArtifact = await loadManifest(path.join(root, "curriculum", "math-quest-manifest-v1.json"));
    requireCondition(engine.CURRICULUM_MANIFEST_SHA256 === manifestArtifact.sha256, "embedded manifest hash differs from canonical manifest");
    requireCondition(canonical(engine.CURRICULUM_MANIFEST) === manifestArtifact.canonical, "embedded manifest bytes differ from canonical manifest");

    let persisted = engine.createInitialState(30_000);
    let persistedQuestion = null;
    for (const skill of engine.SKILLS) {
      const candidate = engine.makeQuestion({
        skillId: skill.skillId,
        tier: "HARD/TARGET",
        representation: "PICTORIAL",
        seed: 0x4d515631,
        ordinal: 3,
      });
      if (candidate.inputClass === "CONSTRUCTION") {
        persistedQuestion = candidate;
        break;
      }
    }
    requireCondition(persistedQuestion, "hostile-import fixture could not find a construction question");
    const persistedAttempt = engine.submitAnswer(persistedQuestion, persistedQuestion.answer.value, {
      promptFinishedAt: 1_000,
      submittedAt: 5_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [],
      hintUsed: false,
      modelUsed: true,
      sessionId: "hostile-import-fixture",
      playDay: 30_000,
    });
    persisted = stateFrom(engine.applyAttempt(persisted, persistedAttempt));
    requireCondition(engine.validateState(persisted) === null, "valid nested evidence fixture does not export");
    const compatiblePatchSave = JSON.parse(JSON.stringify(persisted));
    compatiblePatchSave.productVersion = "1.0.1-beta.2";
    requireCondition(engine.validateState(compatiblePatchSave) === null, "schema-compatible app patch version was rejected");
    requireCondition(engine.loadState(JSON.stringify(compatiblePatchSave), 30_000).ok === true, "schema-compatible app patch backup did not load");
    requireCondition(engine.createInitialState(30_000).maxSeenPlayDay === 30_000, "valid initial play day was not preserved");
    for (const invalidPlayDay of [-1, 1.5, Number.POSITIVE_INFINITY, "30000"]) {
      const initial = engine.createInitialState(invalidPlayDay);
      requireCondition(initial.maxSeenPlayDay === 0, `invalid initial play day was not normalized: ${String(invalidPlayDay)}`);
      requireCondition(engine.validateState(initial) === null, `invalid play-day input created an invalid initial state: ${String(invalidPlayDay)}`);
    }
    const live = engine.createInitialState(30_000);
    const liveBefore = engine.canonical(live);
    const firstSkill = engine.SKILLS[0];
    const hostileMutations = [
      ["product version", (state) => { state.productVersion = 7; }],
      ["state seed", (state) => { state.seed = -1; }],
      ["root boolean", (state) => { state.levelReteachActive = "false"; }],
      ["daily practice count", (state) => { state.practiceCountByDay["30000"] = "1"; }],
      ["settings unknown key", (state) => { state.settings.onlineVoice = true; }],
      ["settings voice type", (state) => { state.settings.voiceURI = { uri: "voice" }; }],
      ["settings feedback schema", (state) => { state.settings.feedbackVoiceByClass.EXTRA = ""; }],
      ["skill due day", (state) => { state.skills[persistedQuestion.skillId].dueDay = "tomorrow"; }],
      ["skill restore fields", (state) => { state.skills[persistedQuestion.skillId].restoreNeeded = true; }],
      ["skill witness contents", (state) => { state.skills[persistedQuestion.skillId].witnessIds = ["missing-record"]; }],
      ["evidence feedback class", (state) => { state.skills[persistedQuestion.skillId].evidence[0].feedbackClass = "UNKNOWN"; }],
      ["evidence task type", (state) => { state.skills[persistedQuestion.skillId].evidence[0].taskType = "not-declared"; }],
      ["evidence finite latency", (state) => { state.skills[persistedQuestion.skillId].evidence[0].elapsed = "slow"; }],
      ["miss contents", (state) => { state.skills[firstSkill.skillId].misses = [{ playDay: "30000", sessionId: "s", recordId: "r" }]; }],
      ["session log contents", (state) => { state.sessionLog = [{ sessionId: "s", overrunMs: "0" }]; }],
      ["feedback history contents", (state) => { state.feedbackHistory = [{ stage: firstSkill.stage, branch: "UNKNOWN", line: "line", sessionId: "s" }]; }],
      ["re-teach queue skill", (state) => { state.reteachQueue = [{ skillId: "not-a-skill", reason: "SAME_SESSION" }]; }],
      ["cold-test discriminator", (state) => { state.currentLevelColdWindow = [{ recordId: "r", skillId: firstSkill.skillId, level: firstSkill.level, feedbackClass: "FIRST_TRY_CLEAN", evidenceClass: "CONSTRUCTION", playDay: 30_000, coldTest: false }]; }],
      ["re-teach target date", (state) => { state.levelReteachActive = true; state.levelReteachTargets = [firstSkill.skillId]; state.levelReteachTargetSince = { [firstSkill.skillId]: "30000" }; }],
      ["fatigue history input class", (state) => { state.latencyHistory = [{ stage: firstSkill.stage, elapsed: 1_000, inputClass: "GUESS", feedbackClass: "INCORRECT", idleMs: 0 }]; }],
      ["active queue unknown field", (state) => { state.activeSession = { sessionId: "s", playDay: 30_000, queue: [{ skillId: firstSkill.skillId, ordinal: 0, injected: true }] }; }],
    ];
    for (const [label, mutate] of hostileMutations) {
      const hostile = JSON.parse(JSON.stringify(persisted));
      mutate(hostile);
      const imported = engine.importState(live, JSON.stringify(hostile), 30_000);
      requireCondition(imported.ok === false, `${label}: hostile import was accepted`);
      requireCondition(imported.state === live, `${label}: failed import replaced the live state reference`);
      requireCondition(engine.canonical(live) === liveBefore, `${label}: failed import mutated live state bytes`);
      let exportRejected = false;
      try {
        engine.exportState(hostile);
      } catch {
        exportRejected = true;
      }
      requireCondition(exportRejected, `${label}: hostile state exported successfully`);
    }
  });

  if (!engine || !manifestArtifact) {
    const failures = assertions.filter((assertion) => assertion.status === "FAIL");
    return { ok: false, assertions, failures, summary: { total: assertions.length, passed: 0, failed: failures.length, skills: 0, taskTypes: 0, questions: 0 } };
  }

  const manifestSkills = manifestArtifact.manifest.skills;
  await check("SEM-TAXONOMY", "All 126 skills declare identical generation and mastery task-type sets", () => {
    requireCondition(manifestSkills.length === 126, `expected 126 manifest skills, found ${manifestSkills.length}`);
    requireCondition(engine.SKILLS.length === 126, `expected 126 runtime skills, found ${engine.SKILLS.length}`);
    requireCondition(EXPECTED_SIGNATURES.size === 126, `expected 126 semantic signature records, found ${EXPECTED_SIGNATURES.size}`);
    for (const manifestSkill of manifestSkills) {
      const runtimeSkill = engine.SKILLS.find((skill) => skill.skillId === manifestSkill.id);
      requireCondition(runtimeSkill, `${manifestSkill.id}: runtime skill missing`);
      const declared = manifestSkill.constraints.taskTypes;
      requireCondition(canonical(declared) === canonical(manifestSkill.assessment.requiredTaskTypes), `${manifestSkill.id}: mastery task types drift from generation task types`);
      requireCondition(canonical(declared) === canonical(runtimeSkill.constraints.taskTypes), `${manifestSkill.id}: runtime task types drift from manifest`);
    }
  });

  let questionCount = 0;
  const allObservedTaskTypes = new Set();
  for (const manifestSkill of manifestSkills) {
    await check(`SEM-${manifestSkill.id}`, `${manifestSkill.id} ${manifestSkill.title} has objective-aligned deterministic tasks`, () => {
      const skill = engine.SKILLS.find((candidate) => candidate.skillId === manifestSkill.id);
      const expectedTaskMap = EXPECTED_SIGNATURES.get(manifestSkill.id);
      requireCondition(expectedTaskMap, `${manifestSkill.id}: no explicit semantic expectation`);
      requireCondition(canonical([...expectedTaskMap.keys()]) === canonical(manifestSkill.constraints.taskTypes), `${manifestSkill.id}: expected task-type map is stale`);
      const observed = new Map(manifestSkill.constraints.taskTypes.map((taskType) => [taskType, new Set()]));
      const samples = [];
      for (const tier of ["EASY", "HARD/TARGET"]) {
        for (let ordinal = 0; ordinal < SAMPLE_ORDINALS; ordinal += 1) {
          const args = { skillId: manifestSkill.id, tier, representation: "PICTORIAL", seed: 0x51f15e, ordinal };
          const question = engine.makeQuestion(args);
          const repeat = engine.makeQuestion(args);
          samples.push(question);
          questionCount += 1;
          requireCondition(canonical(question) === canonical(repeat), `${manifestSkill.id}: repeated generation is nondeterministic`);
          requireCondition(manifestSkill.constraints.taskTypes.includes(question.taskType), `${manifestSkill.id}: generated undeclared task type ${question.taskType}`);
          requireCondition(question.templateId.includes(question.taskType), `${manifestSkill.id}: template id omits task type`);
          requireCondition(question.sampleKey.includes(engine.CURRICULUM_MANIFEST_SHA256), `${manifestSkill.id}: sample key omits curriculum hash`);
          requireCondition(typeof question.prompt === "string" && question.prompt.trim().length >= 3, `${manifestSkill.id}: empty child prompt`);
          requireCondition(!/\{[a-z][A-Za-z0-9]*\}/u.test(question.prompt), `${manifestSkill.id}: unresolved prompt slot`);
          const generatedResponse = STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)
            ? correctStructuredResponse(engine, question)
            : question.answer.value;
          requireCondition(engine.gradeAnswer(question, generatedResponse).correct, `${manifestSkill.id}: generated answer does not self-grade`);
          validateSelection(engine, question);
          validateStructuredResponse(engine, question);
          validateModel(question);
          validateSemanticMath(question);
          const attempt = submittedAttempt(engine, question);
          requireCondition(attempt.taskType === question.taskType, `${manifestSkill.id}: submitted attempt loses task type`);
          observed.get(question.taskType).add(`${question.semanticPromptStringId}/${question.modelDescriptor.type}`);
          allObservedTaskTypes.add(`${manifestSkill.id}|${question.taskType}`);
        }
      }
      for (const [taskType, expected] of expectedTaskMap) {
        requireCondition(canonical([...observed.get(taskType)].sort()) === canonical([...expected].sort()), `${manifestSkill.id}/${taskType}: observed ${[...observed.get(taskType)].sort().join(", ")}; expected ${[...expected].sort().join(", ")}`);
      }
      if (STRATEGY_BUILD_SKILL_IDS.includes(manifestSkill.id)) {
        const expectedVariants = EXPECTED_STRATEGY_SEMANTIC_VARIANTS.filter((key) => key.startsWith(`${manifestSkill.id}|`));
        const observedVariants = [...new Set(samples.map(strategySemanticVariantKey))].sort();
        requireCondition(canonical(observedVariants) === canonical([...expectedVariants].sort()), `${manifestSkill.id}: STRATEGY_BUILD semantic variants drifted`);
      }
      validateFacetCoverage(engine, manifestSkill, samples);
    });
  }

  await check("SEM-MASTERY-COVERAGE", "SOLID mastery requires task coverage and every declared CPA phase in order", () => {
    const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
    requireCondition(skill.constraints.taskTypes.length === 2, "mastery fixture no longer has two task types");
    let state = engine.createInitialState(30_000);
    state = stateFrom(engine.applyAttempt(state, masteryAttempt(
      engine,
      skill,
      skill.constraints.taskTypes[0],
      30_000,
      0,
      { representation: "CONCRETE" },
    )));
    requireCondition(state.skills[skill.skillId].acquisition !== "SOLID", "one task type incorrectly satisfied multi-type mastery");
    state = stateFrom(engine.applyAttempt(state, masteryAttempt(
      engine,
      skill,
      skill.constraints.taskTypes[1],
      30_001,
      1,
      { representation: "PICTORIAL" },
    )));
    requireCondition(state.skills[skill.skillId].acquisition !== "SOLID", "concrete and pictorial evidence skipped the declared abstract phase");
    state = stateFrom(engine.applyAttempt(state, masteryAttempt(
      engine,
      skill,
      skill.constraints.taskTypes[0],
      30_002,
      2,
      { representation: "ABSTRACT" },
    )));
    requireCondition(state.skills[skill.skillId].acquisition === "SOLID", "ordered CPA evidence with complete task-type coverage did not satisfy mastery");
    const witnessed = new Set(state.skills[skill.skillId].evidence.map((attempt) => attempt.taskType));
    requireCondition(skill.constraints.taskTypes.every((taskType) => witnessed.has(taskType)), "solid record lacks a declared task-type witness");
    requireCondition(state.skills[skill.skillId].evidence.every((attempt) => attempt.modelUsed === false), "modelUsed telemetry was required for a model witness");

    let abstractOnly = engine.createInitialState(30_000);
    for (let ordinal = 0; ordinal < Math.max(3, skill.constraints.taskTypes.length); ordinal += 1) {
      const taskType = skill.constraints.taskTypes[ordinal % skill.constraints.taskTypes.length];
      abstractOnly = stateFrom(engine.applyAttempt(
        abstractOnly,
        masteryAttempt(engine, skill, taskType, 30_010 + ordinal, ordinal, { representation: "ABSTRACT" }),
      ));
    }
    requireCondition(abstractOnly.skills[skill.skillId].acquisition !== "SOLID", "abstract-only witnesses satisfied a skill that declares concrete/pictorial phases");

    const qualifyingStart = extracted.source.indexOf("function qualifyingWitness");
    const qualifyingEnd = extracted.source.indexOf("function beginSkill", qualifyingStart);
    const qualifyingSource = extracted.source.slice(qualifyingStart, qualifyingEnd);
    requireCondition(qualifyingStart >= 0 && qualifyingEnd > qualifyingStart, "mastery witness implementation was not found");
    requireCondition(!/supplementalMasteryNeedles|MQ-0(?:35|40|41|48|63)|evidenceFacet|tokenId|strategy/u.test(qualifyingSource), "mastery witness contains a skill-specific or sample-key facet bypass instead of manifest task coverage");

    for (const strategySkillId of ["MQ-040", "MQ-041"]) {
      const strategySkill = engine.SKILLS.find((candidate) => candidate.skillId === strategySkillId);
      let strategyState = engine.createInitialState(30_100);
      for (const [ordinal, representation] of ["CONCRETE", "PICTORIAL", "ABSTRACT"].entries()) {
        strategyState = stateFrom(engine.applyAttempt(strategyState, masteryAttempt(
          engine,
          strategySkill,
          strategySkill.constraints.taskTypes[0],
          30_100 + ordinal,
          ordinal,
          { representation },
        )));
      }
      requireCondition(strategyState.skills[strategySkillId].acquisition !== "SOLID", `${strategySkillId}: one declared strategy task incorrectly satisfied mastery`);
      for (let taskIndex = 1; taskIndex < strategySkill.constraints.taskTypes.length; taskIndex += 1) {
        strategyState = stateFrom(engine.applyAttempt(strategyState, masteryAttempt(
          engine,
          strategySkill,
          strategySkill.constraints.taskTypes[taskIndex],
          30_102 + taskIndex,
          2 + taskIndex,
          { representation: "ABSTRACT" },
        )));
      }
      requireCondition(strategyState.skills[strategySkillId].acquisition === "SOLID", `${strategySkillId}: all declared strategy task types did not satisfy mastery`);
    }

    const tokenSkill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-048");
    const expectedTokenTasks = ["match-practice-token-5-cents", "match-practice-token-10-cents", "match-practice-token-25-cents", "match-practice-token-1-dollar", "match-practice-token-2-dollars"];
    requireCondition(canonical(tokenSkill.phases) === canonical(["P"]) && tokenSkill.representation === "pictures-and-symbols", "MQ-048: manifest claims a representation phase the practice-token renderer does not provide");
    requireCondition(canonical(tokenSkill.constraints.taskTypes) === canonical(expectedTokenTasks), "MQ-048: manifest does not declare all five token-value mappings as mastery tasks");
    const tokenQuestions = expectedTokenTasks.map((taskType, ordinal) => engine.makeQuestion({
      skillId: tokenSkill.skillId,
      tier: ordinal === 2 ? "HARD/TARGET" : "EASY",
      representation: "PICTORIAL",
      seed: 1,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
      coldTest: true,
    }));
    requireCondition(tokenQuestions.every((question, ordinal) => question.representation === "PICTORIAL" && question.taskType === expectedTokenTasks[ordinal]), "MQ-048: generated modes or task order drift from the P-only manifest");
    requireCondition(new Set(tokenQuestions.map((question) => question.params.tokenId)).size === 5, "MQ-048: deterministic five-question cycle does not expose all five practice tokens");
    const applyTokenQuestion = (stateBefore, question, playDay) => stateFrom(engine.applyAttempt(stateBefore, engine.submitAnswer(question, { optionId: question.options[question.correctIndex].optionId }, {
      promptFinishedAt: 0,
      submittedAt: 4_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [],
      sessionId: "semantic-token-breadth",
      playDay,
    })));
    let tokenState = engine.createInitialState(30_150);
    const falseAbstractQuestion = engine.makeQuestion({ skillId: tokenSkill.skillId, tier: "HARD/TARGET", representation: "ABSTRACT", seed: 1, ordinal: 4, eligibleQuestionOrdinal: 4, coldTest: true });
    tokenState = applyTokenQuestion(tokenState, falseAbstractQuestion, 30_150);
    for (let ordinal = 0; ordinal < tokenQuestions.length - 1; ordinal += 1) tokenState = applyTokenQuestion(tokenState, tokenQuestions[ordinal], 30_151 + ordinal);
    requireCondition(tokenState.skills[tokenSkill.skillId].acquisition !== "SOLID", "MQ-048: nonexistent Abstract witness counted toward P-only mastery");
    tokenState = applyTokenQuestion(tokenState, tokenQuestions.at(-1), 30_155);
    requireCondition(tokenState.skills[tokenSkill.skillId].acquisition === "SOLID", "MQ-048: all five distinct token witnesses did not satisfy mastery");

    for (const facetFixture of [
      { skillId: "MQ-035", phases: ["CONCRETE", "PICTORIAL"] },
      { skillId: "MQ-063", phases: ["CONCRETE", "PICTORIAL", "ABSTRACT"] },
    ]) {
      const facetSkill = engine.SKILLS.find((candidate) => candidate.skillId === facetFixture.skillId);
      let facetState = engine.createInitialState(30_200);
      for (const [ordinal, representation] of facetFixture.phases.entries()) {
        facetState = stateFrom(engine.applyAttempt(facetState, masteryAttempt(
          engine,
          facetSkill,
          facetSkill.constraints.taskTypes[0],
          30_200 + ordinal,
          ordinal,
          { representation },
        )));
      }
      requireCondition(facetState.skills[facetFixture.skillId].acquisition !== "SOLID", `${facetFixture.skillId}: one declared task type incorrectly satisfied mastery`);
      const finalOrdinal = facetFixture.phases.length;
      facetState = stateFrom(engine.applyAttempt(facetState, masteryAttempt(
        engine,
        facetSkill,
        facetSkill.constraints.taskTypes[1],
        30_200 + finalOrdinal,
        finalOrdinal,
        { representation: facetFixture.phases.at(-1) },
      )));
      requireCondition(facetState.skills[facetFixture.skillId].acquisition === "SOLID", `${facetFixture.skillId}: all declared task types did not satisfy mastery`);
    }

    const helped = engine.createInitialState(30_000);
    const helpedResult = stateFrom(engine.applyAttempt(
      helped,
      masteryAttempt(engine, skill, skill.constraints.taskTypes[0], 30_020, 0, {
        evidenceClass: "NON_EVIDENCE",
        hintUsed: true,
        modelUsed: true,
      }),
    ));
    requireCondition(helpedResult.skills[skill.skillId].evidence.length === 0, "Help/model-assisted work entered mastery evidence");
  });

  await check("SEM-INVALID-TASK-TYPE", "Undeclared attempt task types are rejected without evidence mutation", () => {
    const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
    const before = engine.createInitialState(30_000);
    const result = engine.applyAttempt(before, masteryAttempt(engine, skill, "undeclared-task", 30_000, 0));
    const after = stateFrom(result);
    requireCondition(after.skills[skill.skillId].evidence.length === 0, "undeclared task type was stored");
    requireCondition(result.effects?.some((effect) => effect.type === "REJECTED_ATTEMPT_TASK_TYPE"), "undeclared task type lacked rejection effect");
  });

  const failures = assertions.filter((assertion) => assertion.status === "FAIL");
  const passed = assertions.filter((assertion) => assertion.status === "PASS").length;
  return {
    ok: failures.length === 0,
    assertions,
    failures,
    summary: {
      total: assertions.length,
      passed,
      failed: failures.length,
      skills: manifestSkills.length,
      taskTypes: allObservedTaskTypes.size,
      questions: questionCount,
    },
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await runManifestSemanticSuite();
  console.log(JSON.stringify({ ok: result.ok, summary: result.summary, failures: result.failures }, null, 2));
  if (!result.ok) process.exitCode = 1;
}
