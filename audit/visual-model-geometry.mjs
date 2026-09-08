import { ATTRIBUTE_PROPERTY_TARGET, attributeItemValue, descriptorOmits, exactNumber, finite, nonnegativeSafeInteger, normalized, numericValuesMatch, own, positiveSafeInteger, preferredTextField } from "./visual-model-values.mjs";

function rectangleAreaSourceExact(question, values, width, height) {
  return [width, height].every(positiveSafeInteger) && values.operation === "area" && values.unit === "square centimetres"
    && numericValuesMatch(question.promptSlots, { width, length: height })
    && numericValuesMatch(question.params, { width, length: height });
}

function attributeSetSortRuleTruth({ answerFree, attribute, items, promptId, question, values }) {
  const categories = Array.isArray(values.categories) ? values.categories : [];
  const ids = categories.map((category) => normalized(category?.id));
  const categoryValues = categories.map((category) => normalized(category?.value).toLowerCase());
  const completeCategories = sortCategoriesComplete({ categories, categoryValues, ids });
  const completeItems = sortItemsComplete({ categories, items });
  const mapped = sortItemsMatchCategories({ attribute, categories, completeCategories, completeItems, items });
  const matchesParams = sortFixtureMatchesParameters(categories, items, question.params);
  const truthful = Boolean(answerFree && ["colour", "shape", "size"].includes(normalized(attribute).toLowerCase())
          && normalized(question.answer?.value).toLowerCase() === normalized(attribute).toLowerCase()
          && mapped && matchesParams);
  return {
    pass: Boolean(completeCategories && completeItems && truthful),
    reason: { promptId, completeCategories, completeItems, truthful, answerFree, mapped, matchesParams, attribute, categories: categories.length },
  };
}

function attributeSetShapePropertyTruth({ answerFree, attribute, items, promptId, question, targetValue }) {
  const property = normalized(targetValue).toLowerCase();
  const targetName = ATTRIBUTE_PROPERTY_TARGET[property];
  const expectedKind = question.taskType === "classify-solid" ? "solid" : "shape";
  const expectedPool = shapePropertyPool(expectedKind, question.taskType);
  const itemNames = Array.isArray(items)
    ? items.map((item) => normalized(item?.[expectedKind]).toLowerCase()) : [];
  const complete = shapeItemsComplete({ expectedKind, expectedPool, itemNames, items });
  const truthful = Boolean(answerFree && attribute === "property" && targetName
          && shapePropertyMeaningMatches({ question, property, targetName, itemNames }));
  return { pass: Boolean(complete && truthful), reason: { promptId, complete, truthful, answerFree, property, targetName } };
}

function areaGridAreaRectangleTruth({ answerFree, height, parts, promptId, question, values, width }) {
  const part = parts?.[0];
  const sourceExact = rectangleAreaSourceExact(question, values, width, height)
          && Array.isArray(parts) && parts.length === 1 && numericValuesMatch(part, { width, height });
  const derived = width * height;
  const truthful = sourceExact && answerFree && exactNumber(question.answer?.value) === derived;
  return { pass: Boolean(truthful), reason: { promptId, width, height, derived, sourceExact, answerFree } };
}

function areaGridCompositeAreaTruth({ answerFree, parts, promptId, question, values }) {
  const params = question.params || {};
  const firstWidth = Number(params.w1), firstHeight = Number(params.l1);
  const secondWidth = Number(params.w2), secondHeight = Number(params.l2);
  const expectedOutline = [
    [0, 0], [firstWidth + secondWidth, 0], [firstWidth + secondWidth, secondHeight],
    [firstWidth, secondHeight], [firstWidth, firstHeight], [0, firstHeight],
  ];
  const expectedCut = [{ x1: firstWidth, y1: 0, x2: firstWidth, y2: secondHeight }];
  const dimensionsExact = [firstWidth, firstHeight, secondWidth, secondHeight]
    .every((value) => positiveSafeInteger(value))
          && firstHeight > secondHeight;
  const partsExact = compositeAreaPartsExact({ firstHeight, firstWidth, parts, secondHeight, secondWidth });
  const structureExact = compositeAreaStructureExact({ expectedCut, expectedOutline, question, values });
  const derived = firstWidth * firstHeight + secondWidth * secondHeight;
  const truthful = dimensionsExact && partsExact && structureExact && answerFree
          && exactNumber(question.answer?.value) === derived;
  return { pass: Boolean(truthful), reason: { promptId, derived, dimensionsExact, partsExact, structureExact, answerFree } };
}

function clockSpanDurationMinutesTruth({ answerFree, clockFieldsExact, endHour, endMinute, promptId, question, startHour, startMinute, values }) {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const derived = end - start;
  const paramsExact = numericValuesMatch(question.params, { startHour, startMinuteText: startMinute, endHour, endMinuteText: endMinute });
  const truthful = clockFieldsExact && paramsExact && derived > 0 && derived <= 59
          && values.direction === "forward" && answerFree
          && exactNumber(question.answer?.value) === derived;
  return { pass: Boolean(truthful), reason: { promptId, start, end, derived, clockFieldsExact, paramsExact, answerFree } };
}

function clockSpanTimetableIntervalTruth({ answerFree, clockFieldsExact, endHour, endMinute, promptId, question, startHour, startMinute, values }) {
  const startDay = Number(values.startDay), endDay = Number(values.endDay);
  const start = startDay * 1440 + startHour * 60 + startMinute;
  const end = endDay * 1440 + endHour * 60 + endMinute;
  const derived = end - start;
  const formatTime = (hour, minute, format) => format === "24-hour"
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
  const daysExact = forwardCalendarDays(startDay, endDay);
  const paramsExact = timetableParamsExact({ endDay, endHour, endMinute, question, startDay, startHour, startMinute, values });
  const formatExact = timetableFormatExact({ endHour, endMinute, formatTime, question, startHour, startMinute, values });
  const truthful = clockFieldsExact && daysExact && paramsExact && formatExact && derived > 0
          && values.direction === "forward" && answerFree
          && exactNumber(question.answer?.value) === derived;
  return { pass: Boolean(truthful), reason: { promptId, startDay, endDay, start, end, derived, clockFieldsExact, daysExact, paramsExact, formatExact, answerFree } };
}

function sortCategoriesComplete({ categories, categoryValues, ids }) {
  return categories.length >= 2 && categories.length <= 3
          && new Set(ids).size === categories.length && new Set(categoryValues).size === categories.length
          && categories.every((category) => /^c[0-2]$/u.test(normalized(category?.id))
            && normalized(category?.label) && normalized(category?.value));
}

function sortItemsComplete({ categories, items }) {
  return Array.isArray(items) && items.length === categories.length * 2
          && items.every((item) => ["shape", "color", "colour", "size"]
            .every((key) => typeof item?.[key] === "string" && normalized(item[key]))
            && finite(item.rotation));
}

function sortItemsMatchCategories({ attribute, categories, completeCategories, completeItems, items }) {
  return completeItems && completeCategories
          && items.every((item) => categories.filter((category) => (
            normalized(category.value).toLowerCase() === attributeItemValue(item, attribute)
          )).length === 1)
          && categories.every((category) => items.filter((item) => (
            attributeItemValue(item, attribute) === normalized(category.value).toLowerCase()
          )).length === 2);
}

function shapeItemsComplete({ expectedKind, expectedPool, itemNames, items }) {
  return itemNames.length === expectedPool.length
          && new Set(itemNames).size === expectedPool.length
          && expectedPool.every((name) => itemNames.includes(name))
          && items.every((item, index) => item?.kind === expectedKind
            && normalized(item.label).toLowerCase() === itemNames[index]
            && (expectedKind === "solid" || finite(item.rotation)));
}

function compositeAreaPartsExact({ firstHeight, firstWidth, parts, secondHeight, secondWidth }) {
  return Array.isArray(parts) && parts.length === 2
          && numericValuesMatch(parts[0], { width: firstWidth, height: firstHeight })
          && normalized(parts[0]?.label) === "left rectangle"
          && numericValuesMatch(parts[1], { width: secondWidth, height: secondHeight })
          && normalized(parts[1]?.label) === "right rectangle";
}

function compositeAreaStructureExact({ expectedCut, expectedOutline, question, values }) {
  return values.operation === "area" && values.layout === "joined-l"
          && values.layout === question.params?.layout
          && values.unit === question.params?.areaUnitWord
          && values.lengthUnitSymbol === question.params?.lengthUnitSymbol
          && JSON.stringify(values.outline) === JSON.stringify(expectedOutline)
          && JSON.stringify(values.candidateCuts) === JSON.stringify(expectedCut);
}

function timetableParamsExact({ endDay, endHour, endMinute, question, startDay, startHour, startMinute, values }) {
  return values.format === question.params?.format
          && numericValuesMatch(question.params, { startDay, endDay, startHour, endHour, startMinuteText: startMinute, endMinuteText: endMinute })
          && values.startTime === question.params?.startTime && values.endTime === question.params?.endTime;
}

function timetableFormatExact({ endHour, endMinute, formatTime, question, startHour, startMinute, values }) {
  return ["12-hour", "24-hour"].includes(values.format)
          && values.startTime === formatTime(startHour, startMinute, values.format)
          && values.endTime === formatTime(endHour, endMinute, values.format)
          && question.prompt.includes(values.startTime) && question.prompt.includes(values.endTime);
}

function forwardCalendarDays(startDay, endDay) {
  return nonnegativeSafeInteger(startDay) && Number.isSafeInteger(endDay) && endDay >= startDay;
}

function areaPartValuesExact(values, parts) {
  const partValue = (part) => values.operation === "perimeter"
    ? 2 * (Number(part.width) + Number(part.height)) : Number(part.width) * Number(part.height);
  return Array.isArray(parts) && parts.length
    && parts.every((part) => finite(part.width) && finite(part.height) && finite(part.value) && partValue(part) === Number(part.value));
}

const AREA_BOUNDARY_PROMPTS = Object.freeze({
  "question.perimeterRectangle": ({ question, values, width, height }) => values.operation === "perimeter"
    && width === Number(question.promptSlots?.width) && height === Number(question.promptSlots?.length)
    && Number(question.answer?.value) === 2 * (width + height),
  "question.compositePerimeter": ({ question, values, parts }) => {
    const shared = Number(values.shared);
    const summedPerimeters = Array.isArray(parts) ? parts.reduce((sum, part) => sum + Number(part.value), 0) : NaN;
    return values.operation === "perimeter" && Array.isArray(parts) && parts.length >= 2
      && Number.isFinite(shared) && Number(values.total) === summedPerimeters - 2 * shared
      && Number(question.answer?.value) === Number(values.total);
  },
  "question.compositeMissing": ({ question, values }) => {
    const totalLength = Number(values.totalLength);
    const knownLength = Number(values.knownLength);
    const missingLength = Number(values.missingLength);
    return values.operation === "missing-length" && totalLength === Number(question.promptSlots?.totalLength)
      && knownLength === Number(question.promptSlots?.knownLength) && missingLength === totalLength - knownLength
      && Number(question.answer?.value) === missingLength;
  },
});

function areaPartsAnswerFree(values, parts) {
  return descriptorOmits(values, ["total", "value"]) && Array.isArray(parts) && parts.every((part) => !own(part, "value"));
}

function sortCategoryProjection(category) {
  return { id: normalized(category.id), value: normalized(category.value), label: normalized(category.label) };
}

function sortItemProjection(item) {
  return {
    shape: normalized(item?.shape),
    color: preferredTextField(item, "color", "colour"),
    colour: preferredTextField(item, "colour", "color"),
    size: normalized(item?.size),
    rotation: Number(item?.rotation) || 0,
  };
}

function sortFixtureMatchesParameters(categories, items, params) {
  const projectedCategories = categories.map(sortCategoryProjection);
  const projectedParamsCategories = (Array.isArray(params?.categories) ? params.categories : []).map(sortCategoryProjection);
  return JSON.stringify(projectedCategories) === JSON.stringify(projectedParamsCategories)
    && JSON.stringify(items.map(sortItemProjection)) === JSON.stringify((params?.sortItems || []).map(sortItemProjection));
}

function shapePropertyPool(expectedKind, taskType) {
  if (expectedKind === "solid") return ["cube", "sphere", "cone", "cylinder"];
  return taskType === "property-classification" ? ["circle", "triangle", "parallelogram", "rectangle"] : ["circle", "triangle", "square", "rectangle"];
}

function shapePropertyMeaningMatches({ question, property, targetName, itemNames }) {
  return property === normalized(question.params?.property).toLowerCase()
    && itemNames.filter((name) => name === targetName).length === 1
    && normalized(question.answer?.value).toLowerCase() === targetName;
}

function attributeSetDescriptorTruth(question, values) {
    const items = values.items;
    const rule = values.rule;
    const attribute = rule?.attribute ?? rule?.property;
    const targetValue = rule?.value ?? rule?.targetValue;
    const promptId = normalized(question.semanticPromptStringId);
    const answerFree = descriptorOmits(values, ["targetIndexes", "nonTargetIndexes"]);
    if (promptId === "question.sortRule") return attributeSetSortRuleTruth({ answerFree, attribute, items, promptId, question, values });
    if (promptId === "question.shapeProperty") return attributeSetShapePropertyTruth({ answerFree, attribute, items, promptId, question, targetValue });
    return { pass: false, reason: { promptId, error: "unsupported answer-free attribute set" } };
  }

function areaGridDescriptorTruth(question, values) {
    const width = Number(values.width);
    const height = Number(values.height);
    const parts = values.parts;
    const promptId = normalized(question.semanticPromptStringId);
    const answerFree = areaPartsAnswerFree(values, parts);
    if (promptId === "question.areaRectangle") return areaGridAreaRectangleTruth({ answerFree, height, parts, promptId, question, values, width });
    if (promptId === "question.compositeArea") return areaGridCompositeAreaTruth({ answerFree, parts, promptId, question, values });
    const partsExact = areaPartValuesExact(values, parts);
    const check = Object.hasOwn(AREA_BOUNDARY_PROMPTS, promptId) && AREA_BOUNDARY_PROMPTS[promptId];
    const promptTruth = check ? check({ question, values, width, height, parts }) : width > 0 && height > 0;
    const structureTruth = promptId === "question.compositeMissing" ? promptTruth : Boolean(partsExact);
    return { pass: Boolean(structureTruth && promptTruth), reason: { promptId, width, height, parts: parts?.length || 0, partsExact, operation: values.operation, promptTruth } };
  }

function clockSpanDescriptorTruth(question, values) {
    const promptId = normalized(question.semanticPromptStringId);
    const startHour = Number(values.startHour), startMinute = Number(values.startMinute);
    const endHour = Number(values.endHour), endMinute = Number(values.endMinute);
    const minuteFields = [startHour, startMinute, endHour, endMinute];
    const clockFieldsExact = minuteFields.every(Number.isSafeInteger)
        && [startHour, endHour].every((hour) => hour >= 0 && hour <= 23)
        && [startMinute, endMinute].every((minute) => minute >= 0 && minute <= 59);
    const answerFree = descriptorOmits(values, ["duration", "durationMinutes", "durationHours"]);
    if (promptId === "question.durationMinutes") return clockSpanDurationMinutesTruth({ answerFree, clockFieldsExact, endHour, endMinute, promptId, question, startHour, startMinute, values });
    if (promptId === "question.timetableInterval") return clockSpanTimetableIntervalTruth({ answerFree, clockFieldsExact, endHour, endMinute, promptId, question, startHour, startMinute, values });
    return { pass: false, reason: { promptId, error: "unsupported answer-free clock span" } };
  }
export { areaGridDescriptorTruth, attributeSetDescriptorTruth, clockSpanDescriptorTruth };
