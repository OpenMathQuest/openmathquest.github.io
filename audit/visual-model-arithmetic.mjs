import { descriptorMagnitude, descriptorOmits, exactNumber, finite, normalized, numericValuesMatch, object, own, positiveSafeInteger } from "./visual-model-values.mjs";

function arrayOperationMatches(values, operation, unknown) {
  return values.operation === operation && values.unknown === unknown;
}

function validNumberLineDomain(min, max, step) {
  return min !== null && max !== null && step !== null && min < max && step > 0;
}

function properRemainder(quotient, remainder, divisor) {
  return Number.isSafeInteger(quotient) && Number.isSafeInteger(remainder) && remainder > 0 && remainder < divisor;
}

function exactRepresentation(entry) {
  return object(entry) && typeof entry.role === "string"
    && exactNumber(entry.value ?? entry.label ?? entry.fraction ?? entry.decimal) !== null;
}

function descriptorResultValue(value) {
  return value?.value ?? value?.label ?? value;
}

function decimalPlaceTruth(question, representations) {
  const denominator = decimalPlaceDenominator(question.params);
  const decimal = representations?.find((entry) => entry.kind === "decimal");
  const fraction = representations?.find((entry) => entry.kind === "fraction");
  const expected = decimalPlaceValue(question.params, denominator);
  return Boolean(decimal && fraction && decimalFractionPartsMatch(question.params, fraction, denominator)
    && exactNumber(decimal.value) === expected && exactNumber(fraction.value) === expected
    && exactNumber(question.answer?.value) === expected);
}

function decimalPlaceDenominator(params) {
  return params?.place === "tenths" ? 10 : params?.place === "hundredths" ? 100 : 1000;
}

function decimalPlaceValue(params, denominator) {
  return Number(params?.whole) + Number(params?.fractional) / denominator;
}

function decimalFractionPartsMatch(params, fraction, denominator) {
  return Number(fraction.denominator) === denominator
    && Number(fraction.numerator) === Number(params?.whole) * denominator + Number(params?.fractional);
}

function tenFrameSemanticEvidence(candidates, frames, strategy) {
  return (Array.isArray(candidates) && candidates.length >= 2)
    || (Array.isArray(frames) && frames.length >= 2)
    || (object(strategy) && ["start", "change", "result"].every((key) => own(strategy, key)));
}

function tenFrameStimulus(values, frame) {
  return values.data?.stimulus === true && Number(frame?.capacity) === 10;
}

function tenFrameShownValue(question, frame) {
  return Number(frame?.value) === Number(question.params?.shown);
}

function tenFrameAnswerFree(values, frame) {
  return !own(values, "strategy") && !own(frame || {}, "label");
}

function hiddenFrameCountsMatch(question, frame) {
  return Number(frame?.coveredCount) === 10 - Number(frame?.value)
    && exactNumber(question.answer?.value) === Number(frame?.coveredCount);
}

const TEN_FRAME_ACTIVITIES = Object.freeze({
  "question.frameNumber": ({ question, values, frame, activity }) => Boolean(activity === "frame-to-number"
    && tenFrameStimulus(values, frame) && Number(frame?.value) === exactNumber(question.answer?.value)),
  "question.makeTenFrame": ({ question, values, frame, activity }) => Boolean(activity === "make-ten"
    && tenFrameStimulus(values, frame) && tenFrameShownValue(question, frame)
    && Number(frame?.value) + exactNumber(question.answer?.value) === 10 && tenFrameAnswerFree(values, frame)),
  "question.hiddenPart": ({ question, values, frame, activity }) => Boolean(activity === "hidden-part"
    && tenFrameStimulus(values, frame) && tenFrameShownValue(question, frame)
    && hiddenFrameCountsMatch(question, frame) && tenFrameAnswerFree(values, frame)),
});

function arrayFairShareTruth({ answerValue, groups, promptId, question, total, values }) {
  const sourceExact = [total, groups].every(positiveSafeInteger)
    && arrayOperationMatches(values, "fairShare", "equalShares")
    && numericValuesMatch(question.params, { total, recipients: groups });
  const derivedAnswer = sourceExact && total % groups === 0 ? "yes" : "no";
  const answerFree = descriptorOmits(values, ["perGroup", "columns", "remainder"]);
  const truthful = sourceExact && answerFree && answerValue.toLowerCase() === derivedAnswer;
  return { pass: Boolean(truthful), reason: { promptId, total, groups, derivedAnswer, sourceExact, answerFree } };
}

function arrayRelatedMultiplyDivideTruth({ answerValue, groups, promptId, question, total, values }) {
  const quotient = groups > 0 ? total / groups : NaN;
  const sourceExact = [total, groups].every(positiveSafeInteger) && Number.isSafeInteger(quotient)
          && arrayOperationMatches(values, "relatedMultiplyDivide", "quotient")
          && Number(values.rows) === groups
          && numericValuesMatch(question.params, { product: total, groups, perGroup: quotient });
  const answerFree = descriptorOmits(values, ["perGroup", "columns", "remainder"]);
  const truthful = sourceExact && answerFree && exactNumber(answerValue) === quotient;
  return { pass: Boolean(truthful), reason: { promptId, total, groups, quotient, sourceExact, answerFree } };
}

function arrayQuotientRemainderTruth({ answerValue, groups, promptId, question, total, values }) {
  const quotient = groups > 0 ? Math.floor(total / groups) : NaN;
  const derivedRemainder = groups > 0 ? total % groups : NaN;
  const sourceExact = [total, groups].every(positiveSafeInteger) && properRemainder(quotient, derivedRemainder, groups)
          && arrayOperationMatches(values, "quotientRemainder", "quotientAndRemainder")
          && numericValuesMatch(question.params, { total, divisor: groups, quotient, remainder: derivedRemainder });
  const answerFree = descriptorOmits(values, ["perGroup", "columns", "remainder"]);
  const derivedAnswer = `${quotient} R ${derivedRemainder}`;
  const truthful = sourceExact && answerFree && answerValue === derivedAnswer;
  return { pass: Boolean(truthful), reason: { promptId, total, groups, quotient, derivedRemainder, sourceExact, answerFree } };
}

function arrayRemainderInterpretationTruth({ interpretationConfig, values, total, question, answerValue, promptId }) {
  const divisor = Number(values.perGroup);
  const quotient = divisor > 0 ? Math.floor(total / divisor) : NaN;
  const derivedRemainder = divisor > 0 ? total % divisor : NaN;
  const fractionDivisor = remainderFractionDivisor(derivedRemainder, divisor);
  const derivedAnswer = interpretedRemainderAnswer(interpretationConfig.interpretation, { quotient, derivedRemainder, divisor, fractionDivisor });
  const sourceExact = interpretedRemainderSourceExact({ total, divisor, quotient, derivedRemainder, values, interpretationConfig, question });
  const answerFree = descriptorOmits(values, ["groups", "columns", "remainder"]);
  const truthful = sourceExact && answerFree && answerValue === derivedAnswer;
  return { pass: Boolean(truthful), reason: { promptId, total, divisor, quotient, derivedRemainder, derivedAnswer, sourceExact, answerFree } };
}

function arrayArithmeticTruth(values, total, promptId) {
  const remainder = Number(values.remainder ?? 0);
  const multiplication = finite(values.rows) && finite(values.columns)
        && Number(values.rows) * Number(values.columns) === total;
  const division = finite(values.groups) && finite(values.perGroup)
        && Number(values.groups) * Number(values.perGroup) + remainder === total;
  return { pass: Number.isFinite(total) && (multiplication || division), reason: { promptId, total, remainder, multiplication, division } };
}

function remainderFractionDivisor(remainder, divisor) {
  if (!Number.isSafeInteger(remainder) || !Number.isSafeInteger(divisor)) return 1;
  let a = Math.abs(remainder), b = Math.abs(divisor);
  while (b) [a, b] = [b, a % b];
  return a;
}

function interpretedRemainderAnswer(interpretation, { quotient, derivedRemainder, divisor, fractionDivisor }) {
  if (interpretation === "whole-remainder") return `${quotient} R ${derivedRemainder}`;
  if (interpretation === "fraction") return `${quotient} ${derivedRemainder / fractionDivisor}/${divisor / fractionDivisor}`;
  return String(interpretation === "round-up" ? quotient + 1 : quotient);
}

function interpretedRemainderSourceExact({ total, divisor, quotient, derivedRemainder, values, interpretationConfig, question }) {
  return [total, divisor].every(positiveSafeInteger) && properRemainder(quotient, derivedRemainder, divisor)
    && values.operation === interpretationConfig.interpretation
    && values.interpretation === interpretationConfig.interpretation && values.unknown === interpretationConfig.unknown
    && numericValuesMatch(question.params, { total, divisor, quotient, remainder: derivedRemainder })
    && question.params?.interpretation === interpretationConfig.interpretation;
}

function comparisonDescriptorTruth(question, values) {
    const sides = object(values.left) && object(values.right);
    const relation = normalized(values.relation);
    const magnitudes = [values.left, values.right].map(descriptorMagnitude);
    const explicit = magnitudes.every((value) => exactNumber(value) !== null);
    const noInventedOperation = !own(values, "operator") && !/[+×÷]/u.test(JSON.stringify(values));
    return { pass: Boolean(sides && explicit && relation && noInventedOperation), reason: { relation, magnitudes, noInventedOperation } };
  }

function fractionPairDescriptorTruth(question, values) {
    const representations = values.representations;
    const exact = Array.isArray(representations) && representations.length && representations.every(exactRepresentation);
    const resultExact = values.result === undefined || exactNumber(descriptorResultValue(values.result)) !== null;
    const placeExact = question.semanticPromptStringId !== "question.decimal" || decimalPlaceTruth(question, representations);
    return { pass: Boolean(exact && resultExact && normalized(values.relation) && placeExact), reason: { representations: representations?.length || 0, relation: values.relation, resultExact, placeExact } };
  }

function numberBondDescriptorTruth(question, values) {
    const parts = values.parts;
    const whole = Number(values.whole);
    const known = Array.isArray(parts) && parts.length === 2 && parts.filter((part) => part !== null).every(finite);
    const operator = values.operator;
    const unknown = values.unknown;
    const coherent = Number.isFinite(whole) && known && ["whole", "part0", "part1", "operator"].includes(unknown)
        && (unknown === "operator" || ["+", "-", "−"].includes(operator));
    return { pass: Boolean(coherent), reason: { whole, parts, operator, unknown, coherent } };
  }

function tenFrameDescriptorTruth(question, values) {
    const candidates = values.candidates;
    const frames = values.frames;
    const strategy = values.strategy;
    const semanticEvidence = tenFrameSemanticEvidence(candidates, frames, strategy);
    const promptId = normalized(question.semanticPromptStringId);
    const frame = frames?.[0];
    const activity = values.data?.activityKind;
    const activityCheck = Object.hasOwn(TEN_FRAME_ACTIVITIES, promptId) && TEN_FRAME_ACTIVITIES[promptId];
    const activityExact = activityCheck ? activityCheck({ question, values, frame, activity }) : false;
    return { pass: Boolean(activityExact || semanticEvidence), reason: { candidates: candidates?.length || 0, frames: frames?.length || 0, strategy: Boolean(strategy), activityExact } };
  }

function arrayDescriptorTruth(question, values) {
    const total = Number(values.total);
    const groups = Number(values.groups);
    const promptId = normalized(question.semanticPromptStringId);
    const answerValue = normalized(question.answer?.value);
    if (promptId === "question.fairShare") return arrayFairShareTruth({ answerValue, groups, promptId, question, total, values });
    if (promptId === "question.relatedMultiplyDivide") return arrayRelatedMultiplyDivideTruth({ answerValue, groups, promptId, question, total, values });
    if (promptId === "question.quotientRemainder") return arrayQuotientRemainderTruth({ answerValue, groups, promptId, question, total, values });
    const interpretationConfig = {
      "question.remainderWhole": { interpretation: "whole-remainder", unknown: "quotientAndRemainder" },
      "question.remainderFraction": { interpretation: "fraction", unknown: "mixedQuotient" },
      "question.remainderInterpret": { interpretation: "round-up", unknown: "groupsNeeded" },
      "question.remainderFullGroups": { interpretation: "round-down", unknown: "fullGroups" },
    }[promptId];
    if (interpretationConfig) return arrayRemainderInterpretationTruth({ interpretationConfig, values, total, question, answerValue, promptId });
    return arrayArithmeticTruth(values, total, promptId);
  }

function placeValueDescriptorTruth(question, values) {
    const source = values.source;
    const columns = values.columns;
    const explicit = source !== undefined && Array.isArray(columns) && columns.length
        && columns.every((column) => object(column) && finite(column.place) && finite(column.digit));
    return { pass: Boolean(explicit), reason: { source, columns: columns?.length || 0, explicit: Boolean(explicit) } };
  }

function numberLineDescriptorTruth(question, values) {
    const domain = values.domain;
    const min = exactNumber(domain?.min);
    const max = exactNumber(domain?.max);
    const step = exactNumber(domain?.step);
    const points = values.points;
    const bounded = validNumberLineDomain(min, max, step)
        && Array.isArray(points) && points.length
        && points.every((point) => {
          const number = exactNumber(object(point) ? point.value : point);
          return number !== null && number >= min && number <= max;
        });
    return { pass: Boolean(bounded), reason: { min, max, step, points: points?.length || 0, bounded: Boolean(bounded) } };
  }
export { arrayDescriptorTruth, comparisonDescriptorTruth, fractionPairDescriptorTruth, numberBondDescriptorTruth, numberLineDescriptorTruth, placeValueDescriptorTruth, tenFrameDescriptorTruth };
