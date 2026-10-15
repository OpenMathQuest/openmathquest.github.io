import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { evaluateEngine, loadShippedEngine } from "./engine-loader.mjs";
import { loadQualityGatePolicy } from "./quality-gate-policy.mjs";

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

function canonicalChildRecords(table) {
  const records = Array.isArray(table)
    ? table.map((record) => ({ ...record }))
    : Object.entries(table || {}).map(([id, record]) => ({ id, ...record }));
  return records.map((record) => normalize(record)).sort((a, b) => compareCodeUnits(a.id, b.id));
}

function jcsSerialize(value) {
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

function replaceApprovedDeclaration(source, before, after) {
  assert.equal(source.split(before).length, 2, "approved wording needs one exact declaration");
  return source.replace(before, after);
}

function approvedWordingSource(loaded, baseline, transition) {
  const before = childStringArtifact(baseline.CHILD_STRINGS);
  const after = childStringArtifact(loaded.engine.CHILD_STRINGS);
  assert.equal(before.sha256, transition.baselineChildStringsSha256, "wording baseline changed");
  assert.equal(after.sha256, transition.candidateChildStringsSha256, "approved wording fingerprint changed");
  assert.equal(after.records.length, transition.recordCount, "approved wording count changed");
  assert.equal(new Set(after.records.map((record) => record.id)).size, transition.recordCount, "wording IDs are not unique");
  assert.equal(baseline.CONSTANTS.CHILD_STRING_APPROVAL_SHA256, before.sha256, "baseline approval differs");
  assert.equal(loaded.engine.CONSTANTS.CHILD_STRING_APPROVAL_SHA256, after.sha256, "candidate approval differs");
  assert.equal(loaded.engine.CONSTANTS.CHILD_STRINGS_PENDING_APPROVAL, false, "wording approval is pending");
  const changed = after.records.filter((record) => record.id === transition.changedRecordId);
  assert.equal(changed.length, 1, "approved wording record is not unique");
  assert.equal(changed[0].text, transition.afterText, "approved wording text changed");
  const reverted = after.records.map((record) => record.id === transition.changedRecordId
    ? { ...record, text: transition.beforeText } : record);
  assert.equal(childStringArtifact(reverted).sha256, before.sha256, "unapproved child wording or metadata drift");
  const declaration = (text) => `childString(${JSON.stringify(transition.changedRecordId)},${JSON.stringify(text)}`;
  const source = replaceApprovedDeclaration(loaded.source, declaration(transition.afterText), declaration(transition.beforeText));
  return replaceApprovedDeclaration(source,
    `CHILD_STRING_APPROVAL_SHA256:${JSON.stringify(after.sha256)}`,
    `CHILD_STRING_APPROVAL_SHA256:${JSON.stringify(before.sha256)}`);
}

function wordingTransitionControls(loaded, baseline, transition) {
  const pending = { ...loaded, engine: { ...loaded.engine,
    CONSTANTS: { ...loaded.engine.CONSTANTS, CHILD_STRINGS_PENDING_APPROVAL: true } } };
  const declaration = `childString(${JSON.stringify(transition.changedRecordId)},${JSON.stringify(transition.afterText)}`;
  const duplicate = { ...loaded, source: `${loaded.source}\n/* ${declaration} */` };
  const missing = { ...loaded, source: loaded.source.replace(declaration, "UNAPPROVED_DECLARATION(") };
  assert.throws(() => approvedWordingSource(pending, baseline, transition), /approval is pending/u);
  assert.throws(() => approvedWordingSource(duplicate, baseline, transition), /one exact declaration/u);
  assert.throws(() => approvedWordingSource(missing, baseline, transition), /one exact declaration/u);
  assert.throws(() => approvedWordingSource(loaded, baseline,
    { ...transition, candidateChildStringsSha256: "0".repeat(64) }), /fingerprint changed/u);
  assert.throws(() => approvedWordingSource(loaded, baseline,
    { ...transition, afterText: `${transition.afterText} unapproved` }), /text changed/u);
  const neighborId = loaded.engine.CHILD_STRINGS.find((record) => record.id !== transition.changedRecordId).id;
  const records = loaded.engine.CHILD_STRINGS.map((record) => record.id === neighborId
    ? { ...record, text: `${record.text} unapproved` } : record);
  const changedHash = childStringArtifact(records).sha256;
  const neighbor = { ...loaded, engine: { ...loaded.engine, CHILD_STRINGS: records,
    CONSTANTS: { ...loaded.engine.CONSTANTS, CHILD_STRING_APPROVAL_SHA256: changedHash } } };
  assert.throws(() => approvedWordingSource(neighbor, baseline,
    { ...transition, candidateChildStringsSha256: changedHash }), /unapproved child wording or metadata drift/u);
}

function verifyApprovedEngineSources(actual, comparison, transition) {
  const hash = (source) => createHash("sha256").update(source).digest("hex");
  assert.equal(hash(actual), transition.candidateEngineSha256, "unapproved candidate engine source");
  assert.equal(hash(comparison), transition.comparisonEngineSha256, "unapproved comparison engine source");
}

export async function loadApprovedComparisonEngine(indexPath, baseline) {
  const loaded = await loadShippedEngine(indexPath);
  const { approvedChildWordingTransition: transition } = await loadQualityGatePolicy();
  const source = approvedWordingSource(loaded, baseline, transition);
  wordingTransitionControls(loaded, baseline, transition);
  verifyApprovedEngineSources(loaded.source, source, transition);
  assert.throws(() => verifyApprovedEngineSources(`${loaded.source}\n/* unapproved */`, source, transition), /unapproved candidate engine source/u);
  assert.throws(() => verifyApprovedEngineSources(loaded.source, `${source}\n/* unapproved */`, transition), /unapproved comparison engine source/u);
  const engine = evaluateEngine(source, { filename: "approved-wording-comparison.engine.js" });
  assert.equal(childStringArtifact(engine.CHILD_STRINGS).sha256, transition.baselineChildStringsSha256);
  return Object.freeze({ ...loaded, engine, approvedChildWordingTransition: Object.freeze({
    status: "VERIFIED_OWNER_APPROVED_WORDING_TRANSITION", ...transition, rejectionControls: 8,
    boundary: "COMPARISON_COPY_ONLY; shipped engine and actual new prompt remain unchanged",
  }) });
}

function validateChildStringId(record, label, ids, errors) {
  if (typeof record.id !== "string" || !record.id) errors.push(`${label}: stable id missing`);
  else if (ids.has(record.id)) errors.push(`${label}: duplicate stable id`);
  else ids.add(record.id);
}

function validateChildStringPoolEntry(record, label, poolPositions, errors) {
  if (!Number.isInteger(record.poolPosition) || record.poolPosition < 0) errors.push(`${label}: ordered runtime pool position missing`);
  if (!record.category) errors.push(`${label}: category missing`);
  if (record.category && Number.isInteger(record.poolPosition) && record.poolPosition >= 0) {
    const poolKey = `${record.category}\u0000${record.poolPosition}`;
    if (poolPositions.has(poolKey)) errors.push(`${label}: duplicate ${record.category} pool position ${record.poolPosition} (also ${poolPositions.get(poolKey)})`);
    else poolPositions.set(poolKey, label);
  }
}

function validateChildStringMetadata(record, label, errors) {
  if (typeof record.text !== "string" && typeof record.template !== "string") errors.push(`${label}: text/template missing`);
  if (!("slotDefinitions" in record)) errors.push(`${label}: slotDefinitions missing (use an empty object when there are no slots)`);
  if (!("allowedLiteralVocabulary" in record)) errors.push(`${label}: allowedLiteralVocabulary missing (use an empty array when not applicable)`);
  if (!("numericRange" in record)) errors.push(`${label}: numericRange missing (use null when not applicable)`);
  if (!("formatterRule" in record)) errors.push(`${label}: formatterRule missing (use null when not applicable)`);
  if (!("ritualSetMembership" in record)) errors.push(`${label}: ritualSetMembership missing (use an empty array when not applicable)`);
}

function validateChildPoolSequences(poolPositions, errors) {
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
}

export function validateChildStringRecords(records) {
  const errors = [];
  const ids = new Set();
  const poolPositions = new Map();
  for (const [index, record] of records.entries()) {
    const label = record?.id || `record[${index}]`;
    if (!record || typeof record !== "object") { errors.push(`${label}: not an object`); continue; }
    validateChildStringId(record, label, ids, errors);
    validateChildStringPoolEntry(record, label, poolPositions, errors);
    validateChildStringMetadata(record, label, errors);
  }
  validateChildPoolSequences(poolPositions, errors);
  return errors;
}
