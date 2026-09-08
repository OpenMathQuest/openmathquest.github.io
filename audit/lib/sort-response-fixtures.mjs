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
  if (attribute === "property") return matchesShapeProperty(item, value);
  return false;
}

function matchesShapeProperty(item, value) {
  const target = ATTRIBUTE_PROPERTY_TARGET[value];
  return Boolean(target)
    && [item?.shape, item?.solid].some((candidate) => normalizedAttributeToken(candidate) === target);
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

export function sortPlacementsFromDescriptor(question) {
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

export function incorrectSortSubmission(question, payload) {
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
