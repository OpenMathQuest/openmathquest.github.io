import { createHash } from "node:crypto";

const SET_KEYS = /^(?:ritualSetMembership|ritualSetMembers|allowedLiteralVocabulary|setMembership)$/u;

function compareCodeUnits(a, b) {
  const left = String(a); const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalize(value, key = "") {
  if (typeof value === "string") return value.normalize("NFC").replace(/\r\n?/gu, "\n");
  if (Array.isArray(value)) {
    const list = value.map((entry) => normalize(entry, key));
    return SET_KEYS.test(key) ? list.sort(compareCodeUnits) : list;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(compareCodeUnits).map((name) => [name, normalize(value[name], name)]));
  }
  return value;
}

export function canonicalChildRecords(table) {
  const records = Array.isArray(table)
    ? table.map((record) => ({ ...record }))
    : Object.entries(table || {}).map(([id, record]) => ({ id, ...record }));
  return records.map((record) => normalize(record)).sort((a, b) => compareCodeUnits(a.id, b.id));
}

export function jcsSerialize(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("RFC 8785 rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcsSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort(compareCodeUnits).map((key) => `${JSON.stringify(key)}:${jcsSerialize(value[key])}`).join(",")}}`;
  }
  throw new TypeError(`RFC 8785 cannot serialize ${typeof value}.`);
}

export function childStringArtifact(table) {
  const records = canonicalChildRecords(table);
  const canonicalJson = jcsSerialize(records);
  const bytes = Buffer.from(canonicalJson, "utf8");
  return Object.freeze({
    version: "child-strings-v1",
    records,
    canonicalJson,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

export function validateChildStringRecords(records) {
  const errors = [];
  const ids = new Set();
  const poolPositions = new Map();
  for (const [index, record] of records.entries()) {
    const label = record?.id || `record[${index}]`;
    if (!record || typeof record !== "object") { errors.push(`${label}: not an object`); continue; }
    if (typeof record.id !== "string" || !record.id) errors.push(`${label}: stable id missing`);
    else if (ids.has(record.id)) errors.push(`${label}: duplicate stable id`);
    else ids.add(record.id);
    if (!Number.isInteger(record.poolPosition) || record.poolPosition < 0) errors.push(`${label}: ordered runtime pool position missing`);
    if (!record.category) errors.push(`${label}: category missing`);
    if (record.category && Number.isInteger(record.poolPosition) && record.poolPosition >= 0) {
      const poolKey = `${record.category}\u0000${record.poolPosition}`;
      if (poolPositions.has(poolKey)) errors.push(`${label}: duplicate ${record.category} pool position ${record.poolPosition} (also ${poolPositions.get(poolKey)})`);
      else poolPositions.set(poolKey, label);
    }
    if (typeof record.text !== "string" && typeof record.template !== "string") errors.push(`${label}: text/template missing`);
    if (!("slotDefinitions" in record)) errors.push(`${label}: slotDefinitions missing (use an empty object when there are no slots)`);
    if (!("allowedLiteralVocabulary" in record)) errors.push(`${label}: allowedLiteralVocabulary missing (use an empty array when not applicable)`);
    if (!("numericRange" in record)) errors.push(`${label}: numericRange missing (use null when not applicable)`);
    if (!("formatterRule" in record)) errors.push(`${label}: formatterRule missing (use null when not applicable)`);
    if (!("ritualSetMembership" in record)) errors.push(`${label}: ritualSetMembership missing (use an empty array when not applicable)`);
  }
  const positionsByCategory = new Map();
  for (const poolKey of poolPositions.keys()) {
    const [category, position] = poolKey.split("\u0000");
    if (!positionsByCategory.has(category)) positionsByCategory.set(category, []);
    positionsByCategory.get(category).push(Number(position));
  }
  for (const [category, positions] of positionsByCategory) {
    const ordered = positions.sort((left, right) => left - right);
    for (let expected = 0; expected < ordered.length; expected += 1) {
      if (ordered[expected] !== expected) { errors.push(`${category}: pool positions must be contiguous from 0; expected ${expected}, found ${ordered[expected]}`); break; }
    }
  }
  return errors;
}
