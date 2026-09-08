import assert from "node:assert/strict";
import test from "node:test";
import { completePlacement } from "../lib/placement-fixtures.mjs";

function placementFixtureProbe(questions, maximum = questions.length) {
  const visits = [];
  const engine = {
    CONSTANTS: { PLACEMENT_MAX_QUESTIONS: maximum },
    createPlacementRun: (options) => ({ ...options, answers: [] }),
    placementCurrentQuestion: (run) => {
      visits.push(run.answers.length);
      return questions[run.answers.length] ?? null;
    },
  };
  return { engine, visits };
}

test("placement fixture reuses each observed question without replaying the same prefix", () => {
  const questions = ["first", "second", "third"].map((questionId) => ({ questionId }));
  const { engine, visits } = placementFixtureProbe(questions);
  const responses = [true, false, "not-sure"];
  const policyVisits = [];
  const state = { maxSeenPlayDay: "2026-09-04" };
  const run = completePlacement(engine, state, (question, index, current) => {
    assert.equal(question, questions[index]);
    assert.equal(current.answers.length, index);
    policyVisits.push(index);
    return responses[index];
  });
  assert.deepEqual(visits, [0, 1, 2, 3]);
  assert.deepEqual(policyVisits, [0, 1, 2]);
  assert.deepEqual(run.answers, [
    { questionId: "first", responseKind: "correct" },
    { questionId: "second", responseKind: "incorrect" },
    { questionId: "third", responseKind: "not-sure" },
  ]);
  assert.equal(run.playDay, state.maxSeenPlayDay);
});

test("placement fixture preserves early completion and overflow rejection", () => {
  const empty = placementFixtureProbe([], 2);
  const state = { maxSeenPlayDay: "2026-09-04" };
  const run = completePlacement(empty.engine, state, () => assert.fail("no pending question"));
  assert.deepEqual(run.answers, []);
  assert.deepEqual(empty.visits, [0]);
  const overflow = placementFixtureProbe([{ questionId: "one" }, { questionId: "two" }], 1);
  assert.throws(() => completePlacement(overflow.engine, state, () => true), /exceeded the approved maximum/u);
  assert.deepEqual(overflow.visits, [0, 1]);
});

test("placement fixture still rejects a duplicate global Not sure action", () => {
  const question = { questionId: "duplicate", inputClass: "SELECTION", options: [{ label: " Not sure ", value: "x" }] };
  const { engine, visits } = placementFixtureProbe([question]);
  assert.throws(
    () => completePlacement(engine, { maxSeenPlayDay: "2026-09-04" }, () => assert.fail("invalid selection")),
    /duplicates the global Not sure action/u,
  );
  assert.deepEqual(visits, [0]);
});
