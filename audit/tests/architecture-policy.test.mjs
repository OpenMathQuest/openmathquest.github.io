import assert from "node:assert/strict";
import test from "node:test";
import {
  architectureFindings,
  architectureMutationFailures,
  loadArchitecturePolicy,
  validateArchitecturePolicy,
  validateArchitecturePolicySchema,
} from "../lib/architecture-policy.mjs";

test("the static architecture policy is closed and the current dependency graph passes", async () => {
  const policy = await loadArchitecturePolicy();
  assert.deepEqual(await validateArchitecturePolicySchema(policy), []);
  assert.deepEqual(await validateArchitecturePolicy(policy), []);
  assert.deepEqual(architectureFindings(policy), []);
});

test("[NC-ARCHITECTURE-BOUNDARIES-HAVE-EFFECT] forbidden dependencies, network APIs, writers, runtime coupling, and validation bypasses fail", async () => {
  const policy = await loadArchitecturePolicy();
  assert.deepEqual(architectureMutationFailures(policy), []);
});
