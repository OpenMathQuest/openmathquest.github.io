import { arrayDescriptorTruth, comparisonDescriptorTruth, fractionPairDescriptorTruth, numberBondDescriptorTruth, numberLineDescriptorTruth, placeValueDescriptorTruth, tenFrameDescriptorTruth } from "./visual-model-arithmetic.mjs";
import { areaGridDescriptorTruth, attributeSetDescriptorTruth, clockSpanDescriptorTruth } from "./visual-model-geometry.mjs";
import { proportionalBarDescriptorTruth } from "./visual-model-money.mjs";
import { exactNumber, finite, hasForbiddenDescriptorKey, normalized, numericValuesMatch, object, own } from "./visual-model-values.mjs";

function descriptorTruth(question) {
  const model = question?.modelDescriptor;
  if (!object(model) || typeof model.type !== "string" || !object(model.values)) return { pass: false, reason: "missing typed model descriptor" };
  if (hasForbiddenDescriptorKey(model.values)) return { pass: false, reason: "descriptor leaks an answer or correctIndex field" };
  const values = model.values;
  const kind = model.type;
  if (typeof kind === "string" && Object.hasOwn(DESCRIPTOR_TRUTH, kind)) {
    const validate = DESCRIPTOR_TRUTH[kind];
    return validate(question, values, model);
  }
  return { pass: false, reason: `unsupported model descriptor type: ${model.type}` };
}

function practiceMoneyVisualTruth({ candidates, data, items, question, truthful }) {
  const item = items[0];
  const candidateValues = candidates.map((candidate) => normalized(candidate.optionValue));
  const questionValues = (question.options || []).map((option) => normalized(option.value));
  const tokenExact = practiceTokenDescriptorExact({ data, item, items });
  const candidatesExact = candidates.length === 5
          && candidateValues.every(Boolean)
          && new Set(candidateValues).size === 5
          && JSON.stringify([...candidateValues].sort()) === JSON.stringify([...questionValues].sort())
          && candidateValues.filter((value) => value === normalized(question.answer?.value)).length === 1;
  truthful &&= Boolean(tokenExact && candidatesExact);
  return truthful;
}

function moneyAmountsVisualTruth({ items, question, truthful }) {
  const cents = items.map((item) => Number(item.cents)).filter(Number.isFinite);
  truthful &&= cents.length >= 1;
  if (/compare/iu.test(normalized(question.semanticPromptStringId))) truthful &&= cents.length >= 2 && new Set(cents).size >= 2;
  return truthful;
}

function arithmeticSetsVisualTruth({ data, question, truthful }) {
  const left = Number(data.left);
  const right = Number(data.right);
  const operations = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "−": (a, b) => a - b,
    "×": (a, b) => a * b,
    "*": (a, b) => a * b,
    "÷": (a, b) => a / b,
    "/": (a, b) => a / b,
  };
  const operation = operations[data.operation];
  const expected = operation && Number.isFinite(left) && Number.isFinite(right) ? operation(left, right) : null;
  truthful &&= expected !== null && exactNumber(question.answer?.value) === expected;
  return truthful;
}

function graphSeriesVisualTruth({ data, items, truthful }) {
  const series = items[0]?.series ?? data.series;
  truthful &&= object(series) && Object.values(series).every(finite);
  return truthful;
}

function numberOrderVisualTruth({ data, items, question, truthful }) {
  const shown = items.map((item) => Number(item.value));
  const goal = data.goal;
  const expected = goal === "least" ? Math.min(...shown) : Math.max(...shown);
  truthful &&= shown.length >= 3 && shown.every(Number.isFinite) && new Set(shown).size === shown.length
          && data.stimulus === true && ["least", "greatest"].includes(goal) && exactNumber(question.answer?.value) === expected;
  return truthful;
}

function countSetVisualTruth({ data, items, question, truthful }) {
  truthful &&= data.stimulus === true && items.length === 1 && Number(items[0]?.magnitude) === Number(data.count)
          && exactNumber(question.answer?.value) === Number(data.count);
  return truthful;
}

function patternNextVisualTruth({ data, items, question, truthful }) {
  const sequence = items[0]?.sequence;
  const unit = String(question.params?.unit || "").split(/\s+/u).filter(Boolean);
  truthful &&= data.stimulus === true && Array.isArray(sequence) && sequence.length >= 4 && unit.length === 2
          && repeatingPatternAnswer(sequence, unit, question.answer?.value);
  return truthful;
}

function numeralFormVisualTruth({ candidates, data, items, question, truthful }) {
  const numberWords = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
    "nineteen", "twenty",
  ];
  const word = normalized(data.numberWord).toLowerCase();
  const derived = numberWords.indexOf(word);
  const candidateValues = candidates.map((candidate) => exactNumber(candidate?.optionValue));
  const selectionCandidatesExact = numeralSelectionCandidatesExact({ candidateValues, candidates, derived });
  const constructionPromptExact = question.inputClass === "CONSTRUCTION"
          && question.inputMethod === "NUMBER_PAD"
          && candidates.length === 0;
  const semanticExact = numeralWordValueExact({ data, derived, question, word });
  const answerFree = items.length === 0;
  truthful &&= (selectionCandidatesExact || constructionPromptExact) && semanticExact && answerFree;
  return truthful;
}

function numericPromptVisualTruth({ data, truthful }) {
  truthful &&= typeof data.semanticPromptStringId === "string";
  return truthful;
}

function volumeVisualTruth({ data, items, question, truthful }) {
  const item = items[0];
  const length = Number(data.length);
  const width = Number(data.width);
  const height = Number(data.height);
  const total = length * width * height;
  const representationExact = volumeRepresentationExact({ data, height, item, length, width });
  const answerFree = !own(data, "total") && !own(item, "total");
  truthful &&= representationExact && answerFree && total > 0 && exactNumber(question.answer?.value) === total;
  return truthful;
}

function visibleItemsVisualTruth({ items, truthful }) {
  truthful &&= items.length >= 1;
  return truthful;
}

const VISUAL_PROMPT_CONTRACTS = Object.freeze([
  { matches: ({ kind }) => kind === "practiceMoney", check: practiceMoneyVisualTruth },
  { matches: ({ kind }) => /money/iu.test(kind), check: moneyAmountsVisualTruth },
  { matches: ({ kind }) => kind === "arithmeticSets", check: arithmeticSetsVisualTruth },
  { matches: ({ kind }) => /graph/iu.test(kind), check: graphSeriesVisualTruth },
  { matches: ({ kind }) => kind === "numberOrder", check: numberOrderVisualTruth },
  { matches: ({ kind, question }) => kind === "objectSet" && question.semanticPromptStringId === "question.countSet", check: countSetVisualTruth },
  { matches: ({ kind, question }) => kind === "pattern" && question.semanticPromptStringId === "question.patternVisualNext", check: patternNextVisualTruth },
  { matches: ({ kind, question }) => kind === "number" && question.semanticPromptStringId === "question.numeralForm", check: numeralFormVisualTruth },
  { matches: ({ kind }) => kind === "numericPrompt", check: numericPromptVisualTruth },
  { matches: ({ kind }) => kind === "volume", check: volumeVisualTruth },
  { matches: ({ kind }) => /geometry|shape|solid|volume|measure|pattern|quantity|number|ordinal|skip/iu.test(kind), check: visibleItemsVisualTruth }
]);

function practiceTokenDescriptorExact({ data, item, items }) {
  return items.length === 1
          && item?.kind === "practiceCoin"
          && normalized(item.tokenId)
          && normalized(item.label)
          && data.tokenSetVersion === "practice-coins-v1";
}

function numeralSelectionCandidatesExact({ candidateValues, candidates, derived }) {
  return candidates.length >= 2 && candidateValues.every((value) => value !== null)
          && new Set(candidateValues).size === candidateValues.length
          && candidateValues.filter((value) => value === derived).length === 1
          && candidates.every((candidate) => normalized(candidate.label) === normalized(candidate.optionValue));
}

function numeralWordValueExact({ data, derived, question, word }) {
  return derived >= 0 && word === normalized(question.params?.numberWord).toLowerCase()
          && (!own(data, "numeral") || Number(data.numeral) === derived)
          && exactNumber(question.answer?.value) === derived;
}

function volumeRepresentationExact({ data, height, item, length, width }) {
  return data.representation === "unit-cubes"
          && item?.kind === "prism"
          && numericValuesMatch(item, { length, width, height })
          || data.representation === "layers" && item?.kind === "cubeLayers"
            && numericValuesMatch(item, { length, width, height, layers: height, cubesPerLayer: length * width });
}

function repeatingPatternAnswer(sequence, unit, answer) {
  return sequence.every((value, index) => value === unit[index % unit.length])
    && normalized(answer) === normalized(unit[sequence.length % unit.length]);
}

function visualPromptDescriptorTruth(question, values) {
    const kind = normalized(values.kind);
    const items = Array.isArray(values.items) ? values.items : [];
    const candidates = Array.isArray(values.candidates) ? values.candidates : [];
    const data = object(values.data) ? values.data : {};
    let truthful = Boolean(kind && (items.length || candidates.length || Object.keys(data).length));
    const context = { kind, question, items, candidates, data, truthful };
    const contract = VISUAL_PROMPT_CONTRACTS.find(({ matches }) => matches(context));
    if (contract) truthful = contract.check(context);
    return { pass: Boolean(truthful), reason: { kind, items: items.length, candidates: candidates.length, dataKeys: Object.keys(data) } };
  }

const DESCRIPTOR_TRUTH = Object.freeze({
  attributeSet: attributeSetDescriptorTruth,
  comparison: comparisonDescriptorTruth,
  fractionPair: fractionPairDescriptorTruth,
  numberBond: numberBondDescriptorTruth,
  tenFrame: tenFrameDescriptorTruth,
  array: arrayDescriptorTruth,
  placeValue: placeValueDescriptorTruth,
  numberLine: numberLineDescriptorTruth,
  proportionalBar: proportionalBarDescriptorTruth,
  areaGrid: areaGridDescriptorTruth,
  clockSpan: clockSpanDescriptorTruth,
  visualPrompt: visualPromptDescriptorTruth,
});
export { descriptorTruth };
