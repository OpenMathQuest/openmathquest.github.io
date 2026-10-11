import assert from "node:assert/strict";
import test from "node:test";
import { propertyFuzzResultFinding } from "../run-property-fuzz-stage.mjs";

test("original property diagnostics survive concurrent stderr, truncation pressure, and termination", () => {
  const result = {
    status: 1, signal: null, error: null,
    stdout: "ORIGINAL_FAILURE" + "x".repeat(5000),
    stderr: "REPLAY_FAILED",
  };
  for (const failed of [result, { ...result, signal: "SIGTERM" }, { ...result, error: "output buffer exceeded" }]) {
    const finding = propertyFuzzResultFinding("property check", failed);
    assert.match(finding, /ORIGINAL_FAILURE/u);
    assert.match(finding, /REPLAY_FAILED/u);
  }
  assert.equal(propertyFuzzResultFinding("property check", { ...result, status: 0 }), null);
});
