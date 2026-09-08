import assert from "node:assert/strict";
import test from "node:test";
import { propertyFuzzStageMutationFailures } from "../run-property-fuzz-stage.mjs";

test("[NC-PROPERTY-FUZZ-COUNTEREXAMPLE-CANNOT-PASS] a shrunk failing counterexample fails the ordered stage", () => {
  assert.deepEqual(propertyFuzzStageMutationFailures(), []);
});
