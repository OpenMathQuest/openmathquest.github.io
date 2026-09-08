import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { createSourceExtractor } from "./source-extraction.mjs";
import { completePlacement } from "../lib/placement-fixtures.mjs";

const loaded = await loadShippedEngine(new URL("../../index.html", import.meta.url));
const engine = loaded.engine;
const extraction = createSourceExtractor(loaded.source);
const orderingSource = ["buildPlacementSkillOrder", "placementSkillsForLevel"]
  .map((name) => extraction.functionDeclaration(name)).join("\n");
// Captured from qualified tree d217326f; these expectations do not use live ordering.
const expectedOrders = [
  ["MQ-001","MQ-004","MQ-002","MQ-005","MQ-003","MQ-006"],
  ["MQ-008","MQ-011","MQ-009","MQ-010","MQ-007","MQ-012"],
  ["MQ-015","MQ-016","MQ-013","MQ-014","MQ-017","MQ-018"],
  ["MQ-023","MQ-019","MQ-022","MQ-020","MQ-021","MQ-024"],
  ["MQ-025","MQ-028","MQ-026","MQ-029","MQ-027","MQ-030"],
  ["MQ-031","MQ-032","MQ-033","MQ-034","MQ-035","MQ-036"],
  ["MQ-037","MQ-040","MQ-038","MQ-041","MQ-039","MQ-042"],
  ["MQ-043","MQ-045","MQ-044","MQ-046","MQ-047","MQ-048"],
  ["MQ-050","MQ-049","MQ-051","MQ-052","MQ-053","MQ-054"],
  ["MQ-055","MQ-058","MQ-056","MQ-059","MQ-060","MQ-057"],
  ["MQ-061","MQ-066","MQ-062","MQ-063","MQ-064","MQ-065"],
  ["MQ-067","MQ-068","MQ-072","MQ-069","MQ-070","MQ-071"],
  ["MQ-076","MQ-073","MQ-077","MQ-074","MQ-075","MQ-078"],
  ["MQ-079","MQ-083","MQ-081","MQ-080","MQ-082","MQ-084"],
  ["MQ-087","MQ-090","MQ-088","MQ-086","MQ-085","MQ-089"],
  ["MQ-095","MQ-091","MQ-096","MQ-092","MQ-093","MQ-094"],
  ["MQ-098","MQ-100","MQ-099","MQ-101","MQ-097","MQ-102"],
  ["MQ-105","MQ-103","MQ-104","MQ-107","MQ-106","MQ-108"],
  ["MQ-109","MQ-113","MQ-110","MQ-111","MQ-112","MQ-114"],
  ["MQ-117","MQ-120","MQ-115","MQ-116","MQ-118","MQ-119"],
  ["MQ-121","MQ-124","MQ-122","MQ-125","MQ-126","MQ-123"],
];
const expectedJourneys = [
  {"boundary":0,"questions":15,"sha256":"bac53f1f27cda864acd3cc51f0ad09f395e108c0be084cd792a78c3850a7b7ec"},
  {"boundary":10,"questions":15,"sha256":"f4708d27bc5ba58b8a8b6809ff31b7e9de71d8f903a6a95cbb884ba54814db3e"},
  {"boundary":21,"questions":18,"sha256":"53f6903ce4b4341c6f1c60560ec722fba8ba9ef2c8ef32914338a2e5d70b229e"},
];

function orderingFixture() {
  const observations = { filter: 0, reduce: 0 };
  const skills = new Proxy(engine.SKILLS, {
    get(target, key, receiver) {
      if (key === "filter" || key === "reduce") return (...args) => {
        observations[key] += 1;
        return Reflect.apply(Array.prototype[key], target, args);
      };
      return Reflect.get(target, key, receiver);
    },
  });
  const order = vm.runInNewContext(orderingSource + "\nplacementSkillsForLevel", {
    SKILLS: skills,
    placementSkillOrders: new Map(),
  });
  return { order, observations };
}

const ids = (rows) => Array.from(rows, (skill) => skill.skillId);

test("placement ordering preserves every qualified level and rejects non-level inputs", () => {
  const { order } = orderingFixture();
  assert.equal(engine.LEVELS.length, expectedOrders.length);
  for (const [index, expected] of expectedOrders.entries()) {
    assert.deepEqual(ids(order(index + 1)), expected);
  }
  for (const invalid of [0, -1, 1.5, "1", null, undefined, NaN, Infinity, engine.CONSTANTS.LEVEL_MAX + 1]) {
    assert.throws(() => order(invalid), /does not have six auditable skills/u);
  }
});

test("placement reuses immutable curriculum ordering and protects it from mutation", () => {
  assert.equal(Object.isFrozen(engine.SKILLS), true);
  assert.equal(engine.SKILLS.every((skill) => Object.isFrozen(skill) && Object.isFrozen(skill.prerequisites)), true);
  const { order, observations } = orderingFixture();
  const first = order(1);
  const initialWork = { ...observations };
  assert.ok(initialWork.filter > 0 && initialWork.reduce > 0);
  try { first.reverse(); } catch (error) { assert.equal(error.name, "TypeError"); }
  assert.deepEqual(ids(order(1)), expectedOrders[0]);
  assert.deepEqual(observations, initialWork, "repeated placement questions must not repeat immutable curriculum ranking");
  assert.deepEqual(ids(order(2)), expectedOrders[1]);
  assert.ok(observations.filter > initialWork.filter);
});

test("public placement journeys preserve complete questions, results, and recommendations", () => {
  for (const expected of expectedJourneys) {
    const boundary = expected.boundary;
    const questions = [];
    const run = completePlacement(engine, engine.createInitialState(22000), (question) => {
      questions.push(question);
      return question.level <= boundary;
    }, { seed: 0x706c6163, theme: "ocean" });
    const results = { boundary, questions, run, recommendation: engine.placementRecommendation(run) };
    assert.equal(questions.length, expected.questions);
    assert.equal(createHash("sha256").update(JSON.stringify(results)).digest("hex"), expected.sha256);
  }
});

test("placement reuses only metadata while questions remain fresh and runs are revalidated", () => {
  const run = engine.createPlacementRun({ state: engine.createInitialState(22000), playDay: 22000 });
  const first = engine.placementCurrentQuestion(run);
  const second = engine.placementCurrentQuestion(run);
  assert.notEqual(first, second, "question objects must not become a shared mutable cache");
  assert.deepEqual(first, second);
  const malformed = { ...run, nonce: "bad" };
  for (const invoke of [
    () => engine.placementCurrentQuestion(malformed),
    () => engine.placementRecommendation(malformed),
    () => engine.submitPlacementAnswer(malformed, null),
    () => engine.submitPlacementNotSure(malformed),
  ]) assert.throws(invoke, /Placement run identity is invalid\./u);
});

test("persisted string lists retain uniqueness, text, and length boundaries", () => {
  const cases = [
    [[], null], [["A", "B"], null], [["A", "A"], "Invalid session log."],
    [[""], "Invalid session log."], [null, "Invalid session log."],
    [[1], "Invalid session log."], [["x".repeat(2000)], null],
    [["x".repeat(2001)], "Invalid session log."],
    [Array.from({ length: 30 }, (_, index) => String(index)), null],
    [Array.from({ length: 31 }, (_, index) => String(index)), "Invalid session log."],
  ];
  for (const field of ["classifications", "overrunCauses"]) {
    for (const [value, expected] of cases) {
      const state = engine.createInitialState(22000);
      state.sessionLog = [{ sessionId: "fixture", [field]: value }];
      assert.equal(engine.validateState(state), expected, field);
    }
  }
});

test("persisted string-list validation preserves guarded property reads", () => {
  const state = engine.createInitialState(22000);
  let reads = 0;
  state.sessionLog = [{ sessionId: "fixture", get classifications() { reads += 1; return ["A", "B"]; } }];
  assert.equal(engine.validateState(state), null);
  assert.equal(reads, 2);
});
