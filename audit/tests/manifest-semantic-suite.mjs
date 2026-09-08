import { validateSemanticPersistence } from "./semantic-persistence-validation.mjs";
import { masteryAttempt, validateMasteryCoverage } from "./semantic-mastery-validation.mjs";
import { validateInputFacets } from "./semantic-input-facets.mjs";
import { validateCurriculumFacets } from "./semantic-curriculum-facets.mjs";
import { validateSemanticMathRule } from "./semantic-math-validation.mjs";
import { validateSemanticModel } from "./semantic-model-validation.mjs";
import { applySharedResponseFixture } from "../lib/shared-response-fixtures.mjs";
import { incorrectSortSubmission } from "../lib/sort-response-fixtures.mjs";
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









function repeatedItems(prefix, count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => `${prefix}${index}`);
}

function semanticFractionResponseFixture(engine, question, state) {
  const fraction = engine.parseRational(question.answer.value);
  requireCondition(fraction, `${question.skillId}: direct fraction answer is not rational`);
  state.templateId = "vertical";
  const denominator = Number(state.denominator);
  const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
  requireCondition(Number.isInteger(shadedCount), `${question.skillId}: fraction partition is not reachable`);
  state.shaded = repeatedItems("part", shadedCount);
}

function semanticRouteResponseFixture(question, state, params) {
  state.moves = Array.isArray(params.moves) ? [...params.moves] : [];
  const coordinate = String(question.answer.value).match(/^\((\d+),(\d+)\)$/u);
  const gridCell = String(question.answer.value).match(/^([A-Z])(\d+)$/u);
  if (coordinate) state.end = { x: Number(coordinate[1]), y: Number(coordinate[2]) };
  else if (gridCell) state.end = { x: gridCell[1].charCodeAt(0) - 64, y: Number(gridCell[2]) };
  else state.value = String(question.answer.value);
}

function semanticClockResponseFixture(question, state) {
  const match = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
  requireCondition(match, `${question.skillId}: direct clock answer has no hour/minute`);
  state.hour = Number(match[1]);
  state.minute = Number(match[2]);
}

function semanticSpecificResponseFixture(engine, question, state, params, method) {
  if (method === "FRACTION_PARTITION") semanticFractionResponseFixture(engine, question, state);
  else if (method === "GRID_ROUTE") semanticRouteResponseFixture(question, state, params);
  else if (method === "CLOCK_READ") semanticClockResponseFixture(question, state);
  else {
    throw new Error(`${question.skillId}: no structured response fixture for ${method}`);
  }
}

export function correctStructuredResponse(engine, question) {
  const state = engine.createResponseState(question);
  const method = question.inputMethod;
  const params = question.params || {};
  if (method === "STRATEGY_BUILD") {
    return correctStrategyBuildResponse(question, question.skillId === "MQ-095" ? "mental" : null);
  }
  if (!applySharedResponseFixture(method, { state, question, p: params })) {
    semanticSpecificResponseFixture(engine, question, state, params, method);
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



const modelOracle = Object.freeze({ requireCondition, nearlyEqual, rationalNumber });

function validateModel(question) {
  validateSemanticModel(question, modelOracle);
}

function sortedCsv(value) {
  return String(value).split(",").map((item) => Number(item.trim()));
}

function validateSemanticMath(question) {
  const id = question.semanticPromptStringId;
  const p = question.params;
  const answer = answerNumber(question);
  const expect = (value, label = id) => requireCondition(nearlyEqual(answer, value), `${question.skillId}: ${label} answer is mathematically inconsistent`);
  return validateSemanticMathRule(id, { answer, expect, id, nearlyEqual, p, question, rationalNumber, requireCondition, sortedCsv });
}

function validateFacetCoverage(engine, skill, questions) {
  const ids = new Set(questions.map((question) => question.semanticPromptStringId));
  const taskTypes = new Set(questions.map((question) => question.taskType));
  const values = (selector) => new Set(questions.map(selector).filter((value) => value !== undefined && value !== null && value !== ""));
  const requireSet = (actual, expected, label) => {
    for (const value of expected) requireCondition(actual.has(value), `${skill.id}: missing ${label} facet ${value}`);
  };
  requireCondition(questions.every((question) => !/\b1 (?:shells|acorns|moon rocks|groups|tens|tenths|times)\b|\ba elevation\b|[.!?]{2,}$/iu.test(question.prompt)), `${skill.id}: generated singular grammar or punctuation regressed`);
  const context = { answerNumber, canonical, correctStrategyBuildResponse, engine, ids, nearlyEqual, questions, rationalNumber, requireCondition, requireSet, skill, sortedCsv, strategyMethodOracle, strategyResultOracle, strategyWorkOracle, taskTypes, values };
  validateInputFacets(skill.id, context);
  validateCurriculumFacets(skill.id, context);
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

function validateGeneratedSkillQuestion(engine, manifestSkill, question, repeat) {
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
}

function collectManifestSkillSamples(engine, manifestSkill, progress) {
  const observed = new Map(manifestSkill.constraints.taskTypes.map((taskType) => [taskType, new Set()]));
  const samples = [];
  for (const tier of ["EASY", "HARD/TARGET"]) {
    for (let ordinal = 0; ordinal < SAMPLE_ORDINALS; ordinal += 1) {
      const args = { skillId: manifestSkill.id, tier, representation: "PICTORIAL", seed: 0x51f15e, ordinal };
      const question = engine.makeQuestion(args);
      const repeat = engine.makeQuestion(args);
      samples.push(question);
      progress.questionCount += 1;
      validateGeneratedSkillQuestion(engine, manifestSkill, question, repeat);
      observed.get(question.taskType).add(`${question.semanticPromptStringId}/${question.modelDescriptor.type}`);
      progress.allObservedTaskTypes.add(`${manifestSkill.id}|${question.taskType}`);
    }
  }
  return { observed, samples };
}

function validateSkillTaskCoverage(manifestSkill, expectedTaskMap, observed) {
  for (const [taskType, expected] of expectedTaskMap) {
    requireCondition(canonical([...observed.get(taskType)].sort()) === canonical([...expected].sort()), `${manifestSkill.id}/${taskType}: observed ${[...observed.get(taskType)].sort().join(", ")}; expected ${[...expected].sort().join(", ")}`);
  }
}

function validateSkillStrategyCoverage(manifestSkill, samples) {
  if (STRATEGY_BUILD_SKILL_IDS.includes(manifestSkill.id)) {
    const expectedVariants = EXPECTED_STRATEGY_SEMANTIC_VARIANTS.filter((key) => key.startsWith(`${manifestSkill.id}|`));
    const observedVariants = [...new Set(samples.map(strategySemanticVariantKey))].sort();
    requireCondition(canonical(observedVariants) === canonical([...expectedVariants].sort()), `${manifestSkill.id}: STRATEGY_BUILD semantic variants drifted`);
  }
}

function validateManifestSkill(engine, manifestSkill, progress) {
  const expectedTaskMap = EXPECTED_SIGNATURES.get(manifestSkill.id);
  requireCondition(expectedTaskMap, `${manifestSkill.id}: no explicit semantic expectation`);
  requireCondition(canonical([...expectedTaskMap.keys()]) === canonical(manifestSkill.constraints.taskTypes), `${manifestSkill.id}: expected task-type map is stale`);
  const { observed, samples } = collectManifestSkillSamples(engine, manifestSkill, progress);
  validateSkillTaskCoverage(manifestSkill, expectedTaskMap, observed);
  validateSkillStrategyCoverage(manifestSkill, samples);
  validateFacetCoverage(engine, manifestSkill, samples);
}

async function checkManifestSkills(check, engine, manifestSkills) {
  const progress = { questionCount: 0, allObservedTaskTypes: new Set() };
  for (const manifestSkill of manifestSkills) {
    await check(`SEM-${manifestSkill.id}`, `${manifestSkill.id} ${manifestSkill.title} has objective-aligned deterministic tasks`, () => {
      validateManifestSkill(engine, manifestSkill, progress);
    });
  }
  return progress;
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

    validateSemanticPersistence(engine, { requireCondition, stateFrom });
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

  const { questionCount, allObservedTaskTypes } = await checkManifestSkills(check, engine, manifestSkills);

  await check("SEM-MASTERY-COVERAGE", "SOLID mastery requires task coverage and every declared CPA phase in order", () => {
    validateMasteryCoverage(engine, extracted, { requireCondition, canonical, stateFrom });
  });

  await check("SEM-INVALID-TASK-TYPE", "Undeclared attempt task types are rejected without evidence mutation", () => {
    const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
    const before = engine.createInitialState(30_000);
    const result = engine.applyAttempt(before, masteryAttempt(engine, skill, "undeclared-task", 30_000, { ordinal: 0 }));
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
