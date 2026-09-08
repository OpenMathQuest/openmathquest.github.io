import { coinValueCents, descriptorOmits, exactArrayLength, exactNumber, finite, nonnegativeSafeInteger, normalized, object, own, positiveSafeInteger } from "./visual-model-values.mjs";

function proportionalBarCoinEquivalentTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values }) {
  const firstCount = Number(params.firstCount);
  const firstCoin = coinValueCents(params.firstCoin);
  const secondCoin = coinValueCents(params.secondCoin);
  const amount = Number(params.amount);
  const derived = secondCoin > 0 ? amount / secondCoin : NaN;
  const { first, second, unknown } = equivalentCoinBars(bars);
  const firstExact = coinSourceBarExact({ amount, barBase, first, firstCoin, firstCount, knownSegment });
  const secondExact = coinUnknownBarExact({ amount, barBase, params, second, unknown, unknownSegment });
  const sourceExact = [firstCount, firstCoin, secondCoin, amount].every(positiveSafeInteger) && firstCount * firstCoin === amount
          && positiveSafeInteger(derived)
          && exactArrayLength(bars, 2) && firstExact && secondExact
          && moneyRelationMatches(values, "equal money value", "coin count");
  const truthful = sourceExact && answerFreeResult && answer === derived;
  return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, firstExact, secondExact, derived } };
}

function proportionalBarMoneyOperationTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values }) {
  const cost = Number(params.cost), paid = Number(params.paid), derived = paid - cost;
  const bar = bars?.[0], segments = segmentsForBar(bar);
  const costSegment = segments.find((segment) => normalized(segment.label) === "cost");
  const changeSegment = segments.find((segment) => normalized(segment.label) === "change");
  const sourceExact = validPaymentWithChange(cost, paid)
          && singleMoneyBarTotal(bars, barBase, paid)
          && segments.length === 2 && knownCentsSegment(costSegment, knownSegment, cost)
          && unknownCentsSegment(changeSegment, unknownSegment, "change")
          && moneyRelationMatches(values, "money parts", "change");
  const truthful = sourceExact && answerFreeResult && answer === derived;
  return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, cost, paid, derived } };
}

function proportionalBarMoneyBudgetTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values }) {
  const budget = Number(params.budget);
  const costs = [Number(params.firstCost), Number(params.secondCost)];
  const derived = budget - costs.reduce((sum, value) => sum + value, 0);
  const bar = bars?.[0], segments = segmentsForBar(bar);
  const known = segments.filter((segment) => segment.unknown !== true);
  const remaining = segments.find((segment) => normalized(segment.label) === "remaining");
  const sourceExact = validBudgetBalance(budget, costs, derived)
          && singleMoneyBarTotal(bars, barBase, budget)
          && segments.length === 3 && known.length === 2
          && known.every((segment, index) => knownSegment(segment) && Number(segment.value) === costs[index]
            && normalized(segment.label) === `${index ? "second" : "first"} cost`
            && normalized(segment.units) === "cents")
          && unknownCentsSegment(remaining, unknownSegment, "remaining")
          && moneyRelationMatches(values, "budget parts", "remaining");
  const truthful = sourceExact && answerFreeResult && answer === derived;
  return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, budget, costs, derived } };
}

function proportionalBarMoneyPurchaseTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, values }) {
  const costKeys = Object.keys(params).filter((key) => /Cost$/u.test(key));
  const costs = costKeys.map((key) => Number(params[key]));
  const derived = costs.reduce((sum, value) => sum + value, 0);
  const bar = bars?.[0], segments = segmentsForBar(bar);
  const sourceExact = costKeys.length >= 2 && costs.every((value) => nonnegativeSafeInteger(value))
          && singleAnswerFreeMoneyBar(bars, barBase)
          && segments.length === costs.length
          && segments.every((segment, index) => knownSegment(segment)
            && Number(segment.value) === costs[index]
            && normalized(segment.label) === costKeys[index].replace(/Cost$/u, " cost")
            && normalized(segment.units) === "cents")
          && moneyRelationMatches(values, "total cost", "total");
  const truthful = sourceExact && answerFreeResult && answer === derived;
  return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, costs, derived } };
}

function coinSourceBarExact({ amount, barBase, first, firstCoin, firstCount, knownSegment }) {
  return barBase(first) && Number(first.total) === amount
          && first.segments.length === firstCount
          && first.segments.every((segment, index) => knownSegment(segment)
            && Number(segment.value) === firstCoin && normalized(segment.units) === "cents"
            && normalized(segment.label) === `coin ${index + 1}`);
}

function coinUnknownBarExact({ amount, barBase, params, second, unknown, unknownSegment }) {
  return barBase(second) && Number(second.total) === amount
          && second.segments.length === 1 && unknownSegment(unknown, "coin count")
          && normalized(unknown.units) === `${normalized(params.secondCoin)} coins`;
}

function segmentsForBar(bar) {
  return bar?.segments || [];
}

function singleMoneyBarTotal(bars, barBase, total) {
  return exactArrayLength(bars, 1) && barBase(bars[0]) && Number(bars[0].total) === total;
}

function singleAnswerFreeMoneyBar(bars, barBase) {
  return exactArrayLength(bars, 1) && barBase(bars[0]) && !own(bars[0], "total");
}

function validPaymentWithChange(cost, paid) {
  return nonnegativeSafeInteger(cost) && Number.isSafeInteger(paid) && paid > cost;
}

function validBudgetBalance(budget, costs, derived) {
  return positiveSafeInteger(budget) && costs.every(nonnegativeSafeInteger) && derived >= 0;
}

function equivalentCoinBars(bars) {
  const first = bars?.[0], second = bars?.[1], unknown = second?.segments?.[0];
  return { first, second, unknown };
}

function knownCentsSegment(segment, knownSegment, value) {
  return knownSegment(segment) && Number(segment.value) === value && normalized(segment.units) === "cents";
}

function unknownCentsSegment(segment, unknownSegment, label) {
  return unknownSegment(segment, label) && normalized(segment.units) === "cents";
}

function moneyRelationMatches(values, relation, unknownLabel) {
  return values.relation === relation && values.unknownLabel === unknownLabel;
}

function proportionalBarDescriptorTruth(question, values) {
    const bars = values.bars;
    const promptId = normalized(question.semanticPromptStringId);
    const params = question.params || {};
    const answer = exactNumber(question.answer?.value);
    const answerFreeResult = !own(values, "result");
    const knownSegment = (segment) => object(segment) && finite(segment.value)
        && normalized(segment.label) && normalized(segment.units) && segment.unknown !== true;
    const unknownSegment = (segment, label) => object(segment) && segment.unknown === true
        && normalized(segment.label) === normalized(label) && normalized(segment.units)
        && descriptorOmits(segment, ["value", "count", "coinValue"]);
    const barBase = (bar) => object(bar) && normalized(bar.label) && Number(bar.scale) === 1
        && Array.isArray(bar.segments) && bar.segments.length > 0;
    if (promptId === "question.coinEquivalent") return proportionalBarCoinEquivalentTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values });
    if (promptId === "question.moneyOperation") return proportionalBarMoneyOperationTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values });
    if (promptId === "question.moneyBudget") return proportionalBarMoneyBudgetTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, unknownSegment, values });
    if (["question.moneyPurchase", "question.moneyTotalCost"].includes(promptId)) return proportionalBarMoneyPurchaseTruth({ answer, answerFreeResult, barBase, bars, knownSegment, params, promptId, values });
    return { pass: false, reason: { promptId, error: "unsupported answer-free proportional bar" } };
  }
export { proportionalBarDescriptorTruth };
