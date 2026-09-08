import assert from "node:assert/strict";
import test from "node:test";
import { validateChildStringRecords } from "../lib/child-strings.mjs";

const record = (overrides = {}) => ({
  id: "child.test.first",
  category: "test",
  poolPosition: 0,
  text: "Test text.",
  slotDefinitions: {},
  allowedLiteralVocabulary: [],
  numericRange: null,
  formatterRule: null,
  ritualSetMembership: [],
  ...overrides,
});

test("child strings accept text or templates and do not change the supplied records", () => {
  const rows = [record(), record({ id: "child.test.second", poolPosition: 1, text: undefined, template: "Test template." })];
  const before = structuredClone(rows);
  assert.deepEqual(validateChildStringRecords(rows), []);
  assert.deepEqual(rows, before);
  assert.deepEqual(validateChildStringRecords([]), []);
});

test("missing child-string metadata reports every required field in order", () => {
  assert.deepEqual(validateChildStringRecords([{}]), [
    "record[0]: stable id missing",
    "record[0]: ordered runtime pool position missing",
    "record[0]: category missing",
    "record[0]: text/template missing",
    "record[0]: slotDefinitions missing (use an empty object when there are no slots)",
    "record[0]: allowedLiteralVocabulary missing (use an empty array when not applicable)",
    "record[0]: numericRange missing (use null when not applicable)",
    "record[0]: formatterRule missing (use null when not applicable)",
    "record[0]: ritualSetMembership missing (use an empty array when not applicable)",
  ]);
});

test("non-object child-string entries fail before field validation", () => {
  assert.deepEqual(validateChildStringRecords([null, false, 0, "text"]), [
    "record[0]: not an object", "record[1]: not an object",
    "record[2]: not an object", "record[3]: not an object",
  ]);
});

test("duplicate child-string ids and runtime pool slots remain separate findings", () => {
  assert.deepEqual(validateChildStringRecords([record(), record()]), [
    "child.test.first: duplicate stable id",
    "child.test.first: duplicate test pool position 0 (also child.test.first)",
  ]);
});

test("runtime pools require nonnegative integer positions and one contiguous sequence per category", () => {
  for (const poolPosition of [-1, 0.5, NaN, undefined]) {
    assert.deepEqual(validateChildStringRecords([record({ poolPosition })]), ["child.test.first: ordered runtime pool position missing"]);
  }
  assert.deepEqual(validateChildStringRecords([
    record({ category: "first", poolPosition: 1 }),
    record({ id: "child.test.second", category: "second", poolPosition: 0 }),
    record({ id: "child.test.third", category: "second", poolPosition: 2 }),
  ]), [
    "first: pool positions must be contiguous from 0; expected 0, found 1",
    "second: pool positions must be contiguous from 0; expected 1, found 2",
  ]);
});
