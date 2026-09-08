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

function matchesShapeProperty(item, value) {
  const target = ATTRIBUTE_PROPERTY_TARGET[value];
  return Boolean(target)
    && [item?.shape, item?.solid].some((candidate) => normalizedAttributeToken(candidate) === target);
}

function attributeItemMatchesRule(item, rule) {
  const attribute = normalizedAttributeToken(rule?.attribute);
  const value = normalizedAttributeToken(rule?.value);
  if (attribute === "shape") return normalizedAttributeToken(item?.shape) === value;
  if (attribute === "solid") return normalizedAttributeToken(item?.solid) === value;
  if (attribute === "property") return matchesShapeProperty(item, value);
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

function validateFiniteTree(value, label, requireCondition) {
  if (typeof value === "number") requireCondition(Number.isFinite(value), `${label}: non-finite number`);
  if (Array.isArray(value)) value.forEach((item, index) => validateFiniteTree(item, `${label}[${index}]`, requireCondition));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) validateFiniteTree(item, `${label}.${key}`, requireCondition);
  }
}

function validateVisualPromptModel(question, value, oracle) {
  const { requireCondition } = oracle;
  requireCondition(typeof value.kind === "string" && value.kind, `${question.skillId}: visual prompt has no semantic kind`);
  const itemCount = Array.isArray(value.items) ? value.items.length : 0;
  const candidateCount = Array.isArray(value.candidates) ? value.candidates.length : 0;
  const dataCount = value.data && typeof value.data === "object" ? Object.keys(value.data).length : 0;
  const notationCount = value.notation && typeof value.notation === "object" ? Object.keys(value.notation).length : 0;
  requireCondition(itemCount + candidateCount + dataCount + notationCount > 0, `${question.skillId}: visual prompt has no answer-free stimulus data`);
}

function validateCategorizedAttributeSet(question, value, categories, ruleAttribute, oracle) {
  const { requireCondition } = oracle;
  requireCondition([2, 3].includes(categories.length), `${question.skillId}: categorized attribute set does not have two or three categories`);
  requireCondition(normalizedAttributeToken(ruleAttribute).length > 0, `${question.skillId}: categorized attribute set has no rule attribute`);
  requireCondition(categories.every((category) => ["id", "label", "value"]
    .every((key) => normalizedAttributeToken(category?.[key]).length > 0)), `${question.skillId}: sort category is incomplete`);
  requireCondition(new Set(categories.map((category) => String(category.id))).size === categories.length, `${question.skillId}: sort category ids are not unique`);
  requireCondition(new Set(categories.map((category) => normalizedAttributeToken(category.value))).size === categories.length, `${question.skillId}: sort category values are not unique`);
  const assignments = value.items.map((item) => sortCategoryId(item, value.rule, categories));
  requireCondition(assignments.every(Boolean), `${question.skillId}: an item does not map to a declared sort category`);
  requireCondition(new Set(assignments).size === categories.length, `${question.skillId}: not every sort category is represented`);
}

function validatePredicateAttributeSet(question, value, ruleAttribute, oracle) {
  const { requireCondition } = oracle;
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

function validateAttributeSetModel(question, value, oracle) {
  const { requireCondition } = oracle;
  requireCondition(Array.isArray(value.items) && value.items.length >= 3, `${question.skillId}: attribute set is empty`);
  requireCondition(!Object.hasOwn(value, "targetIndexes") && !Object.hasOwn(value, "nonTargetIndexes"), `${question.skillId}: answer-bearing indexes leaked into the source stimulus`);
  const categories = Array.isArray(value.categories) ? value.categories : [];
  const ruleAttribute = String(value.rule?.attribute ?? "").trim();
  if (categories.length) validateCategorizedAttributeSet(question, value, categories, ruleAttribute, oracle);
  else validatePredicateAttributeSet(question, value, ruleAttribute, oracle);
}

function validateComparisonModel(question, value, oracle) {
  const { requireCondition } = oracle;
  requireCondition(Number.isFinite(Number(value.left?.magnitude)), `${question.skillId}: comparison left magnitude missing`);
  requireCondition(Number.isFinite(Number(value.right?.magnitude)), `${question.skillId}: comparison right magnitude missing`);
}

function validateNumberBondModel(question, value, oracle) {
  const { requireCondition, nearlyEqual } = oracle;
  requireCondition(Array.isArray(value.parts) && value.parts.length === 2, `${question.skillId}: number bond needs two parts`);
  requireCondition(nearlyEqual(Number(value.whole), Number(value.parts[0]) + Number(value.parts[1])), `${question.skillId}: number-bond parts do not make the whole`);
  requireCondition(["whole", "part0", "part1", "operator"].includes(value.unknown), `${question.skillId}: invalid number-bond unknown`);
}

function validateTenFrameModel(question, value, oracle) {
  const { requireCondition } = oracle;
  requireCondition(Array.isArray(value.frames) && value.frames.length > 0, `${question.skillId}: ten-frame model is empty`);
  requireCondition(value.frames.every((frame) => Number.isInteger(Number(frame.value)) && Number(frame.value) >= 0), `${question.skillId}: ten-frame value invalid`);
}

function validateArrayModel(question, value, oracle) {
  const { requireCondition } = oracle;
  const total = Number(value.total);
  requireCondition(Number.isInteger(total) && total > 0, `${question.skillId}: array total invalid`);
  if (value.groups !== undefined && value.perGroup !== undefined) {
    requireCondition(Number(value.groups) * Number(value.perGroup) + Number(value.remainder || 0) === total, `${question.skillId}: array groups do not reconstruct total`);
  }
}

function validateFractionPairModel(question, value, oracle) {
  const { requireCondition, rationalNumber } = oracle;
  requireCondition(Array.isArray(value.representations) && value.representations.length > 0, `${question.skillId}: fraction model is empty`);
  requireCondition(value.representations.every((item) => Number.isFinite(rationalNumber(item.value))), `${question.skillId}: fraction model contains an invalid value`);
}

function validatePlaceValueModel(question, value, oracle) {
  const { requireCondition } = oracle;
  requireCondition(value.source !== undefined, `${question.skillId}: place-value source missing`);
  requireCondition(Array.isArray(value.columns) && value.columns.length > 0, `${question.skillId}: place-value columns missing`);
}

function validateNumberLineModel(question, value, oracle) {
  const { requireCondition, rationalNumber } = oracle;
  const min = rationalNumber(value.domain?.min);
  const max = rationalNumber(value.domain?.max);
  const step = rationalNumber(value.domain?.step);
  requireCondition(Number.isFinite(min) && Number.isFinite(max) && max > min && step > 0, `${question.skillId}: invalid number-line domain`);
  requireCondition(Array.isArray(value.points) && value.points.length > 0, `${question.skillId}: number line has no points`);
  for (const point of value.points) {
    const pointValue = rationalNumber(point.value);
    requireCondition(pointValue >= min - 1e-9 && pointValue <= max + 1e-9, `${question.skillId}: number-line point is outside its domain`);
  }
}

function validateProportionalBarModel(question, value, oracle) {
  const { requireCondition, nearlyEqual, rationalNumber } = oracle;
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
}

function validateAreaGridModel(question, value, oracle) {
  const { requireCondition, nearlyEqual } = oracle;
  requireCondition(Array.isArray(value.parts) && value.parts.length > 0, `${question.skillId}: area model has no rectangles`);
  requireCondition(value.parts.every((part) => Number(part.width) > 0 && Number(part.height) > 0), `${question.skillId}: area model contains an invalid rectangle`);
  const total = value.parts.reduce((sum, part) => sum + Number(part.width) * Number(part.height), 0);
  const declared = Number(value.total ?? value.value);
  if (value.total !== undefined || value.value !== undefined) {
    requireCondition(nearlyEqual(total, declared), `${question.skillId}: area rectangles do not match declared area`);
  }
}

function validateClockSpanModel(question, value, oracle) {
  const { requireCondition, nearlyEqual } = oracle;
  const startDay = Number(value.startDay ?? 0);
  const endDay = Number(value.endDay ?? startDay);
  const start = startDay * 1440 + Number(value.startHour) * 60 + Number(value.startMinute || 0);
  const end = endDay * 1440 + Number(value.endHour) * 60 + Number(value.endMinute || 0);
  requireCondition(end >= start, `${question.skillId}: clock span runs backwards`);
  if (value.durationMinutes !== undefined) {
    requireCondition(nearlyEqual(end - start, Number(value.durationMinutes)), `${question.skillId}: clock span duration is inaccurate`);
  }
}

const modelValidators = Object.freeze({

  "visualPrompt": validateVisualPromptModel,

  "attributeSet": validateAttributeSetModel,

  "comparison": validateComparisonModel,

  "numberBond": validateNumberBondModel,

  "tenFrame": validateTenFrameModel,

  "array": validateArrayModel,

  "fractionPair": validateFractionPairModel,

  "placeValue": validatePlaceValueModel,

  "numberLine": validateNumberLineModel,

  "proportionalBar": validateProportionalBarModel,

  "areaGrid": validateAreaGridModel,

  "clockSpan": validateClockSpanModel,

});



export function validateSemanticModel(question, oracle) {

  const { requireCondition } = oracle;

  const model = question.modelDescriptor;
  requireCondition(model && typeof model === "object", `${question.skillId}: missing model descriptor`);
  requireCondition(typeof model.type === "string" && model.type, `${question.skillId}: missing model type`);
  requireCondition(model.values && typeof model.values === "object", `${question.skillId}: missing model values`);
  validateFiniteTree(model.values, `${question.skillId}.${model.type}`, requireCondition);
  const value = model.values;

  if (!Object.hasOwn(modelValidators, model.type)) {

    throw new Error(`${question.skillId}: unsupported model family ${model.type}`);

  }

  modelValidators[model.type](question, value, oracle);

}

