import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const fullPath = fileURLToPath(new URL("./mq-coverage-calibration-full.js", import.meta.url));
const partialPath = fileURLToPath(new URL("./mq-coverage-calibration-partial.js", import.meta.url));
const aggregatePath = fileURLToPath(new URL("./mq-coverage-calibration-aggregate.js", import.meta.url));
const full = new vm.Script(readFileSync(fullPath, "utf8"), { filename: fullPath }).runInNewContext();

const partial = new vm.Script(readFileSync(partialPath, "utf8"), { filename: partialPath }).runInNewContext();
const aggregateLeft = new vm.Script(readFileSync(aggregatePath, "utf8"), { filename: aggregatePath }).runInNewContext();
const aggregateRight = new vm.Script(readFileSync(aggregatePath, "utf8"), { filename: aggregatePath }).runInNewContext();

test("native coverage sees both sides of a vm.Script branch", () => {
  assert.equal(full(true), "left");
  assert.equal(full(false), "right");
});

test("native coverage detects an intentionally uncovered vm.Script branch", () => {
  assert.equal(partial(true), "left");
});

test("native coverage aggregates complementary executions of identical vm.Script bytes", () => {
  assert.equal(aggregateLeft(true), "left");
  assert.equal(aggregateRight(false), "right");
});
