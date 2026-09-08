import assert from "node:assert/strict";
import test from "node:test";
import { runWithCleanup } from "../lib/operation-cleanup.mjs";

test("successful operation settles before cleanup and retains its exact result", async () => {
  const calls = [];
  const result = {};
  assert.equal(await runWithCleanup(async () => { calls.push("operation"); return result; }, async (value) => {
    assert.equal(value, result);
    await Promise.resolve();
    calls.push("cleanup");
  }), result);
  assert.deepEqual(calls, ["operation", "cleanup"]);
});

test("an operation error survives successful cleanup including non-Error throw values", async () => {
  for (const failure of [new Error("operation"), undefined, null, 0]) {
    let cleanups = 0;
    await assert.rejects(runWithCleanup(() => { throw failure; }, () => { cleanups += 1; }), (actual) => actual === failure);
    assert.equal(cleanups, 1);
  }
});

test("cleanup failure rejects success and preserves both failures when operation also fails", async () => {
  const cleanupError = new Error("cleanup");
  await assert.rejects(runWithCleanup(() => "done", () => { throw cleanupError; }), (actual) => actual === cleanupError);
  const operationError = new Error("operation");
  await assert.rejects(runWithCleanup(() => { throw operationError; }, () => { throw cleanupError; }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [operationError, cleanupError]);
    return true;
  });
});
