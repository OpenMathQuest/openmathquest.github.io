import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { structuredResponseQuestions } from "./response-fixtures.mjs";

const { engine } = await loadShippedEngine(new URL("../../index.html", import.meta.url));
const expectedEntriesSha256 = "8afdd1139434b70470ebb33880fa5ee8312ac29ef68b4fdb7a9a13d005d044d5";
const entriesHash = (questions) => createHash("sha256").update(JSON.stringify([...questions])).digest("hex");

function countedEngine() {
  let requests = 0;
  return {
    requests: () => requests,
    engine: {
      ...engine,
      makeQuestion(args) { requests += 1; return engine.makeQuestion(args); },
      makeQuestionChoices(args) { requests += 1; return engine.makeQuestionChoices(args); },
    },
  };
}

test("response fixtures replay exact witness requests instead of repeating discovery", () => {
  const observed = countedEngine();
  const first = structuredResponseQuestions(observed.engine);
  assert.equal(first.size, 26);
  assert.equal(entriesHash(first), expectedEntriesSha256);
  const discoveryRequests = observed.requests();
  assert.equal(discoveryRequests, 1873, "qualified predecessor discovery workload");
  const second = structuredResponseQuestions(observed.engine);
  assert.equal(observed.requests() - discoveryRequests, 26, "one fresh request per response witness");
  assert.equal(entriesHash(second), expectedEntriesSha256);
  for (const [method, question] of first) {
    assert.notEqual(question, second.get(method), method + " question identity");
    assert.notEqual(question.params, second.get(method).params, method + " parameter identity");
  }
  first.clear();
  second.delete("COUNT_TOUCH");
  assert.equal(entriesHash(structuredResponseQuestions(observed.engine)), expectedEntriesSha256);
});

test("response discovery belongs to one engine instance", () => {
  const first = countedEngine();
  const second = countedEngine();
  structuredResponseQuestions(first.engine);
  assert.equal(entriesHash(structuredResponseQuestions(second.engine)), expectedEntriesSha256);
  assert.equal(second.requests(), 1873, "a different engine must establish its own complete witnesses");
});

test("incomplete response discovery fails repeatedly without caching a partial result", () => {
  const incomplete = { ...engine, SKILLS: [] };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(() => structuredResponseQuestions(incomplete), /every structured child input method/u);
  }
});
