import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const maximumBuffer = 64 * 1024 * 1024;

function runNode(argumentsList) {
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MQ_PLAYWRIGHT_EDGE_EXECUTABLE: process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE
        || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    },
    maxBuffer: maximumBuffer,
    windowsHide: true,
  });
  return Object.freeze({
    status: result.status,
    signal: result.signal,
    error: result.error?.message || null,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

export function propertyFuzzResultFinding(label, result) {
  if (result.status === 0 && !result.error && !result.signal) return null;
  const reason = result.error ? " could not start: " + result.error
    : result.signal ? " ended with signal " + result.signal : " exited " + result.status;
  return label + reason + ":\nstdout:\n" + String(result.stdout || "").trim()
    + "\nstderr:\n" + String(result.stderr || "").trim();
}

export function propertyFuzzStageMutationFailures() {
  const syntheticFailure = propertyFuzzResultFinding("synthetic property check", {
    status: 1,
    signal: null,
    error: null,
    stdout: "",
    stderr: "shrunk counterexample",
  });
  return /shrunk counterexample/u.test(syntheticFailure || "")
    ? Object.freeze([])
    : Object.freeze(["property/fuzz stage did not reject a failing shrunk counterexample"]);
}

export function runPropertyFuzzStage() {
  const contractTests = runNode(["--test", "audit/tests/playwright-interaction-fuzz.test.mjs"]);
  const interactionFuzz = contractTests.status === 0
    ? runNode(["audit/run-playwright-interaction-fuzz.mjs"])
    : Object.freeze({ status: null, signal: null, error: "blocked by failed property contracts", stdout: "", stderr: "" });
  const findings = [
    propertyFuzzResultFinding("fast-check property contracts", contractTests),
    propertyFuzzResultFinding("seeded browser interaction fuzz", interactionFuzz),
    ...propertyFuzzStageMutationFailures(),
  ].filter(Boolean);
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    contractTestStatus: contractTests.status,
    interactionFuzzStatus: interactionFuzz.status,
    findings,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runPropertyFuzzStage();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
