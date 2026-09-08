

const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

const finite = (value) => Number.isFinite(Number(value));

const normalized = (value) => String(value ?? "").normalize("NFC").trim();

const ATTRIBUTE_PROPERTY_TARGET = Object.freeze({
  "3 sides": "triangle",
  "4 equal sides": "square",
  "6 flat faces": "cube",
  "one curved surface and no flat faces": "sphere",
  "a right angle": "rectangle",
  "2 pairs of parallel sides and a right angle": "rectangle",
  "perpendicular sides and 2 long sides": "rectangle",
});

function attributeItemMatchesRule(item, rule) {
  const attribute = preferredTextField(rule, "attribute", "property").toLowerCase();
  const value = preferredTextField(rule, "value", "targetValue").toLowerCase();
  const shape = normalized(item?.shape).toLowerCase();
  const solid = normalized(item?.solid).toLowerCase();
  if (attribute === "shape") return shape === value;
  if (attribute === "solid") return solid === value;
  if (attribute === "property") {
    const target = ATTRIBUTE_PROPERTY_TARGET[value];
    return Boolean(target && (shape === target || solid === target));
  }
  return false;
}

function attributeItemValue(item, attribute) {
  const key = normalized(attribute).toLowerCase();
  if (key === "colour" || key === "color") return preferredTextField(item, "colour", "color").toLowerCase();
  if (key === "shape") return normalized(item?.shape).toLowerCase().replace(/s$/u, "");
  if (key === "size") return normalized(item?.size).toLowerCase();
  if (key === "solid") return normalized(item?.solid).toLowerCase();
  return preferredTextField(item, key, "value").toLowerCase();
}

function ratioObjectNumber(value, numeratorKey, denominatorKey) {
  if (object(value) && own(value, numeratorKey) && own(value, denominatorKey) && Number(value[denominatorKey]) !== 0) {
    return Number(value[numeratorKey]) / Number(value[denominatorKey]);
  }
  return null;
}

function fractionTextNumber(text) {
  const fraction = text.match(/^(-?\d+)\s*\/\s*(\d+)$/u);
  return fraction && Number(fraction[2]) !== 0 ? Number(fraction[1]) / Number(fraction[2]) : null;
}

function mixedTextNumber(text) {
  const mixed = text.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/u);
  if (!mixed || Number(mixed[3]) === 0) return null;
  const sign = Number(mixed[1]) < 0 ? -1 : 1;
  return Number(mixed[1]) + sign * Number(mixed[2]) / Number(mixed[3]);
}

function exactNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ratio = ratioObjectNumber(value, "n", "d");
  if (ratio !== null) return ratio;
  const namedRatio = ratioObjectNumber(value, "numerator", "denominator");
  if (namedRatio !== null) return namedRatio;
  const text = normalized(value).replace(/,/gu, "");
  if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text);
  const fraction = fractionTextNumber(text);
  return fraction !== null ? fraction : mixedTextNumber(text);
}

function hasForbiddenDescriptorKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).some((key) => ["answer", "correctIndex"].includes(key))) return true;
  return Object.values(value).some(hasForbiddenDescriptorKey);
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function descriptorOmits(value, keys) {
  return keys.every((key) => !own(value, key));
}

function numericValuesMatch(record, expected) {
  return Object.entries(expected).every(([key, value]) => value === Number(record?.[key]));
}

function descriptorMagnitude(side) {
  return side?.magnitude ?? side?.value;
}

function coinValueCents(label) {
  const text = normalized(label);
  const value = Number(text.replace(/[^\d]/gu, ""));
  return text.startsWith("$") ? value * 100 : value;
}

function facetSpan(value) {
  return Array.isArray(value) && value.length ? value.length : 1;
}

function preferredTextField(record, primary, secondary) {
  return normalized(record?.[primary] ?? record?.[secondary]);
}

function exactArrayLength(value, length) {
  return Array.isArray(value) && value.length === length;
}

function nonemptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}


export { ATTRIBUTE_PROPERTY_TARGET, attributeItemMatchesRule, attributeItemValue, coinValueCents, descriptorMagnitude, descriptorOmits, exactArrayLength, exactNumber, facetSpan, finite, hasForbiddenDescriptorKey, nonemptyArray, nonnegativeSafeInteger, normalized, numericValuesMatch, object, own, positiveSafeInteger, preferredTextField };
