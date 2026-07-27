import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractEngine, evaluateEngine } from "../lib/engine-loader.mjs";
import { canonicalizeJson, loadManifest } from "../lib/curriculum-manifest.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAMPLE_ORDINALS = 24;

// This is an intentionally explicit release contract. Every curriculum skill
// maps each declared task type to the exact semantic prompt/model families that
// must be exercised over one deterministic ordinal cycle.
const EXPECTED_SIGNATURE_TEXT = `
MQ-001 pair-each-object=question.pairObjects/visualPrompt
MQ-002 count-a-set-to-three=question.countSet/visualPrompt
MQ-003 compare-tiny-sets=question.compare/comparison
MQ-004 continue-an-ab-repeat=question.patternNext/visualPrompt
MQ-005 match-familiar-shapes=question.shape/visualPrompt
MQ-006 direct-compare=question.directCompare/visualPrompt
MQ-007 sort=question.sortRule/attributeSet
MQ-008 count-a-set-to-five=question.countSet/visualPrompt
MQ-009 recognize-structured-set-to-three=question.structuredQuantity/visualPrompt
MQ-010 order-zero-to-five=question.orderSetConnection/visualPrompt
MQ-011 make-a-small-whole-two-ways=question.secondPartition/numberBond
MQ-012 compare-one-attribute-directly=question.directCompare/visualPrompt
MQ-013 show-one-joining=question.addition/visualPrompt
MQ-014 show-one-leaving=question.subtraction/visualPrompt
MQ-015 share-small-sets-fairly=question.fairShare/array
MQ-016 copy-a-three-part-repeat=question.patternNext/visualPrompt
MQ-017 place-it-by-a-landmark=question.landmarkPosition/visualPrompt
MQ-018 record-a-two-group-sort=question.sortRecord/visualPrompt
MQ-019 connect-numbers-zero-to-ten=question.numberConnection/visualPrompt
MQ-020 recognize-structured-set-to-five=question.structuredQuantity/visualPrompt
MQ-021 compare-collections-to-ten=question.compare/comparison
MQ-022 recall-parts-of-five=question.missingPart/numberBond
MQ-023 build-and-break-ten=question.missingPart/numberBond
MQ-024 classify-flat-shape=question.shapeProperty/visualPrompt,classify-solid=question.shapeProperty/visualPrompt
MQ-025 order-numbers-zero-to-twenty=question.numberBetween/numberLine
MQ-026 see-ten-inside-teen-numbers=question.teenBuild/tenFrame
MQ-027 find-one-more-or-less=question.oneMoreLess/numberLine
MQ-028 write-joining-equations-to-ten=question.addition/visualPrompt+question.appliedAddition/visualPrompt
MQ-029 write-leaving-equations-to-ten=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-030 make-two-equal-halves=question.fraction/fractionPair
MQ-031 read-and-form-numerals-to-twenty=question.numeralForm/visualPrompt
MQ-032 make-equal-groups-to-ten=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-033 extend=question.patternNext/visualPrompt
MQ-034 follow-a-short-route=question.routeFinish/visualPrompt
MQ-035 explain-a-direct-comparison=question.directCompare/visualPrompt+question.attributeName/visualPrompt
MQ-036 display-two-shown-categories=question.twoCategoryDisplay/visualPrompt
MQ-037 read-and-order-to-one-hundred-twenty=question.numberOrder/visualPrompt
MQ-038 partition-two-digit-numbers=question.placePartition/placeValue
MQ-039 count-in-twos-fives-and-tens=question.patternNext/visualPrompt
MQ-040 add-within-twenty=question.makeTen/numberBond
MQ-041 subtract-within-twenty=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-042 read-hour-and-half-hour=question.timeReadMinute/visualPrompt
MQ-043 build-an-add-subtract-family=question.missingPart/numberBond+question.factFamily/numberBond
MQ-044 balance-a-missing-part=question.missingPart/numberBond+question.missingSubtrahend/numberBond
MQ-045 make-equal-groups-and-shares=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-046 measure-with-equal-informal-units=question.informalMeasure/visualPrompt
MQ-047 find-halves-and-quarters=question.fraction/fractionPair
MQ-048 recognize-canadian-coin-values=question.coinValue/visualPrompt
MQ-049 addition=question.makeTen/numberBond,subtraction=question.subtractMakeTen/numberBond
MQ-050 repartition-a-two-digit-number=question.renamePlace/placeValue
MQ-051 match-equivalent-coin-amounts=question.coinEquivalent/proportionalBar
MQ-052 classify-flat-shape=question.shapeProperty/visualPrompt,classify-solid=question.shapeProperty/visualPrompt
MQ-053 give-and-follow-directions=question.routeFinish/visualPrompt
MQ-054 make-a-one-to-one-data-display=question.responseListDifference/visualPrompt
MQ-055 read-and-order-to-one-thousand=question.numberOrder/visualPrompt
MQ-056 partition-and-rename-three-digits=question.renamePlace/placeValue
MQ-057 position-compare=question.decimalCompare/numberLine
MQ-058 addition=question.factFamily/numberBond,subtraction=question.factFamily/numberBond
MQ-059 add-two-digit-numbers=question.addition/visualPrompt+question.appliedAddition/visualPrompt
MQ-060 subtract-two-digit-numbers=question.subtraction/visualPrompt+question.appliedSubtraction/visualPrompt
MQ-061 recall-two-times-facts=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-062 recall-five-and-ten-times-facts=question.multiplication/visualPrompt+question.appliedMultiplication/visualPrompt
MQ-063 link-multiplication-and-division=question.relatedMultiplyDivide/array
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
MQ-088 property-classification=question.shapeProperty/visualPrompt
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
    requireCondition(itemCount + candidateCount > 0, `${question.skillId}: visual prompt has neither a diagram nor candidates`);
  } else if (model.type === "attributeSet") {
    requireCondition(Array.isArray(value.items) && value.items.length >= 3, `${question.skillId}: attribute set is empty`);
    requireCondition(Array.isArray(value.targetIndexes) && value.targetIndexes.length > 0, `${question.skillId}: attribute set has no targets`);
    requireCondition(Array.isArray(value.nonTargetIndexes) && value.nonTargetIndexes.length > 0, `${question.skillId}: attribute set has no contrast`);
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
      const total = (bar.segments || []).reduce((sum, segment) => sum + rationalNumber(segment.value), 0);
      requireCondition(nearlyEqual(total, rationalNumber(bar.total)), `${question.skillId}: proportional-bar segments do not match total`);
    }
  } else if (model.type === "areaGrid") {
    requireCondition(Array.isArray(value.parts) && value.parts.length > 0, `${question.skillId}: area model has no rectangles`);
    const total = value.parts.reduce((sum, part) => sum + Number(part.width) * Number(part.height), 0);
    const declared = Number(value.total ?? value.value);
    requireCondition(nearlyEqual(total, declared), `${question.skillId}: area rectangles do not match declared area`);
  } else if (model.type === "clockSpan") {
    const startDay = Number(value.startDay ?? 0);
    const endDay = Number(value.endDay ?? startDay);
    const start = startDay * 1440 + Number(value.startHour) * 60 + Number(value.startMinute || 0);
    const end = endDay * 1440 + Number(value.endHour) * 60 + Number(value.endMinute || 0);
    requireCondition(end >= start, `${question.skillId}: clock span runs backwards`);
    requireCondition(nearlyEqual(end - start, Number(value.durationMinutes)), `${question.skillId}: clock span duration is inaccurate`);
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
  else if (id === "question.pairObjects") expect(Number(p.count));
  else if (id === "question.countSet") expect(String(p.marks || "").split(/\s+/u).filter(Boolean).length);
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
  else if (id === "question.numberBetween") expect((Number(p.before) + Number(p.after)) / 2);
  else if (id === "question.oneMoreLess") expect(Number(p.number) + (p.direction === "more" ? 1 : -1));
  else if (id === "question.secondPartition") expect(Number(p.whole) - Number(p.secondA));
  else if (id === "question.missingPart") expect(Number(p.whole) - Number(p.part));
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
  else if (id === "question.eventDuration") requireCondition(question.answer.value === (Number(p.longMinutes) > Number(p.shortMinutes) ? "second" : "first"), `${question.skillId}: duration comparison is inconsistent`);
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

function validateFacetCoverage(skill, questions) {
  const ids = new Set(questions.map((question) => question.semanticPromptStringId));
  const taskTypes = new Set(questions.map((question) => question.taskType));
  const values = (selector) => new Set(questions.map(selector).filter((value) => value !== undefined && value !== null && value !== ""));
  const requireSet = (actual, expected, label) => {
    for (const value of expected) requireCondition(actual.has(value), `${skill.id}: missing ${label} facet ${value}`);
  };
  if (skill.id === "MQ-005") {
    requireSet(values((question) => question.params.shape), skill.constraints.shapes, "shape");
    requireCondition(values((question) => question.params.color).size >= 4, `${skill.id}: colour variation is not exercised`);
    requireSet(values((question) => question.params.size), ["small", "large"], "size");
    requireCondition([...values((question) => question.params.rotation)].some((rotation) => Number(rotation) !== 0), `${skill.id}: turn variation is not exercised`);
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
    requireCondition(ids.size === 1 && ids.has("question.numberConnection"), `${skill.id}: name/numeral/position/collection connection is incomplete`);
    requireCondition(questions.every((question) => question.params.numberWord && question.params.beforeWord && question.modelDescriptor.values.data?.count === answerNumber(question)), `${skill.id}: number-connection facets drift`);
  } else if (skill.id === "MQ-024") {
    requireSet(taskTypes, ["classify-flat-shape", "classify-solid"], "dimension task type");
    requireSet(values((question) => question.params.property), ["3 sides", "4 equal sides", "6 flat faces", "one curved surface"], "visible property");
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
    requireCondition(ids.size === 1 && ids.has("question.relatedMultiplyDivide"), `${skill.id}: multiplication/division link is not composite`);
    requireCondition(questions.every((question) => Number(question.params.groups) * Number(question.params.perGroup) === Number(question.params.product)), `${skill.id}: related equation facts drift`);
  } else if (skill.id === "MQ-065") {
    requireCondition(questions.every((question) => Number(question.params.paid) <= Number(skill.constraints.amountMaxCents)
      && Number(question.params.cost) < Number(question.params.paid)
      && Number(question.params.cost) % Number(skill.constraints.incrementCents) === 0
      && answerNumber(question) === Number(question.params.paid) - Number(question.params.cost)), `${skill.id}: Canadian change task drifts from its price/payment contract`);
  } else if (skill.id === "MQ-069") {
    requireSet(ids, ["question.metricUnitChoice", "question.metricRead"], "choose/use prompt");
    const expected = ["centimetres", "metres", "grams", "kilograms", "millilitres", "litres"];
    requireSet(values((question) => question.params.unit || question.answer.value), expected, "metric unit");
    for (const unit of expected) {
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricUnitChoice" && question.answer.value === unit), `${skill.id}: ${unit} is never chosen`);
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricRead" && question.params.unit === unit), `${skill.id}: ${unit} is never used`);
    }
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
    requireSet(values((question) => question.params.context), skill.constraints.contexts, "integer context");
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
      return Number(p.quotient) * Number(p.divisor) + Number(p.remainder) === Number(p.total)
        && Number(p.total) <= Number(skill.constraints.dividendMax)
        && Number(p.divisor) <= Number(skill.constraints.divisorMax)
        && Number(p.remainder) > 0 && Number(p.remainder) < Number(p.divisor)
        && question.semanticPromptStringId === promptByInterpretation[p.interpretation]
        && model.operation === p.interpretation
        && model.interpretation === p.interpretation
        && model.unknown === unknownByInterpretation[p.interpretation]
        && Number(model.total) === Number(p.total)
        && Number(model.groups) === Number(p.quotient)
        && Number(model.perGroup) === Number(p.divisor)
        && Number(model.remainder) === Number(p.remainder);
    }), `${skill.id}: remainder interpretation answer/model contract drifts`);
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
        ? p.method === "count" && item?.kind === "prism" && Number(item.total) === total && total <= 48
        : p.method === "multiply" && item?.kind === "cubeLayers" && Number(item.layers) === height
          && Number(item.cubesPerLayer) === length * width && Number(item.total) === total;
      return dimensionsValid && solidValid && answerNumber(question) === total && representationValid
        && data?.representation === p.representation && data?.method === p.method
        && data?.unit === p.unit && data?.solid === p.solid
        && Number(data?.length) === length && Number(data?.width) === width
        && Number(data?.height) === height && Number(data?.total) === total;
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
  return engine.submitAnswer(question, question.answer.value, {
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

function masteryAttempt(skill, taskType, playDay, ordinal) {
  return {
    recordId: `semantic-${skill.skillId}-${taskType}-${ordinal}`,
    questionId: `semantic-q-${ordinal}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType,
    tier: "HARD/TARGET",
    representation: skill.representation,
    inputClass: "CONSTRUCTION",
    inputMethod: "NUMBER_PAD",
    selectionOptionCount: 0,
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: true,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${taskType}|${ordinal}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 4_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: true,
    applied: false,
    preview: false,
    capstone: false,
    reteachStep: false,
    sessionId: "semantic-mastery",
    playDay,
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
        representation: skill.representation,
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
          const args = { skillId: manifestSkill.id, tier, representation: skill.representation, seed: 0x51f15e, ordinal };
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
          requireCondition(engine.gradeAnswer(question, question.answer.value).correct, `${manifestSkill.id}: generated answer does not self-grade`);
          validateSelection(engine, question);
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
      validateFacetCoverage(manifestSkill, samples);
    });
  }

  await check("SEM-MASTERY-COVERAGE", "SOLID mastery requires a clean witness for every declared task type", () => {
    const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
    requireCondition(skill.constraints.taskTypes.length === 2, "mastery fixture no longer has two task types");
    let state = engine.createInitialState(30_000);
    state = stateFrom(engine.applyAttempt(state, masteryAttempt(skill, skill.constraints.taskTypes[0], 30_000, 0)));
    requireCondition(state.skills[skill.skillId].acquisition !== "SOLID", "one task type incorrectly satisfied multi-type mastery");
    state = stateFrom(engine.applyAttempt(state, masteryAttempt(skill, skill.constraints.taskTypes[1], 30_001, 1)));
    requireCondition(state.skills[skill.skillId].acquisition === "SOLID", "complete task-type coverage did not satisfy otherwise-qualified mastery");
    const witnessed = new Set(state.skills[skill.skillId].evidence.map((attempt) => attempt.taskType));
    requireCondition(skill.constraints.taskTypes.every((taskType) => witnessed.has(taskType)), "solid record lacks a declared task-type witness");
  });

  await check("SEM-INVALID-TASK-TYPE", "Undeclared attempt task types are rejected without evidence mutation", () => {
    const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
    const before = engine.createInitialState(30_000);
    const result = engine.applyAttempt(before, masteryAttempt(skill, "undeclared-task", 30_000, 0));
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
