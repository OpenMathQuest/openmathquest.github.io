import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const commandPath = path.join(root, "audit/compare-audit-execution-modes.mjs");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function comparisonFiles() {
  const policy = JSON.parse(await readFile(path.join(root, "audit/gate-integrity-policy-v1.json"), "utf8"));
  const candidateId = policy.executionPolicy.githubHosted.qualificationResult.candidateId;
  const directory = await mkdtemp(path.join(os.tmpdir(), "math-quest-execution-cli-"));
  const serial = { gate: { status: "PASS" }, auditOrchestration: {
    status: "PASS", executionMode: "SERIAL_REFERENCE", candidateId, wallDurationMs: 100,
  } };
  const parallel = structuredClone(serial);
  parallel.auditOrchestration.executionMode = "BOUNDED_PARALLEL";
  parallel.auditOrchestration.wallDurationMs = 50;
  const paths = Object.fromEntries(["serial", "parallel", "serial-timing", "parallel-timing"].map((name) => [name, path.join(directory, `${name}.json`)]));
  return { directory, paths, serial, parallel };
}

async function writeComparison(fixture) {
  await writeFile(fixture.paths.serial, JSON.stringify(fixture.serial), "utf8");
  await writeFile(fixture.paths.parallel, JSON.stringify(fixture.parallel), "utf8");
}

async function runComparison(fixture, withEntryTiming = false) {
  const args = [commandPath, `--serial=${fixture.paths.serial}`, `--parallel=${fixture.paths.parallel}`];
  if (withEntryTiming) args.push(`--serial-entry-timing=${fixture.paths["serial-timing"]}`, `--parallel-entry-timing=${fixture.paths["parallel-timing"]}`);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.signal, null, result.stderr);
  return { exitCode: result.status, report: JSON.parse(result.stdout) };
}

async function removeComparison(fixture) {
  assert.equal(path.dirname(fixture.directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(fixture.directory).startsWith("math-quest-execution-cli-"));
  await rm(fixture.directory, { recursive: true, force: true });
}

async function writeEntryTimings(fixture, serialMs, parallelMs) {
  const nodeExecutableSha256 = sha256(await readFile(process.execPath));
  for (const [name, wallDurationMs] of [["serial", serialMs], ["parallel", parallelMs]]) {
    const timing = {
      schemaVersion: 1, boundary: "TECHNICAL_ENTRY_POINT", executionStatus: "COMPLETED",
      reportSha256: sha256(await readFile(fixture.paths[name])), nodeExecutableSha256, wallDurationMs,
    };
    await writeFile(fixture.paths[`${name}-timing`], JSON.stringify(timing), "utf8");
  }
}

test("E2E comparison rejects a missing bounded duration after a valid file-fed control", async () => {
  const fixture = await comparisonFiles();
  try {
    await writeComparison(fixture);
    assert.equal((await runComparison(fixture)).exitCode, 0);
    for (const duration of [undefined, 0, -1, "50", null]) {
      fixture.parallel.auditOrchestration.wallDurationMs = duration;
      await writeComparison(fixture);
      const invalid = await runComparison(fixture);
      assert.equal(invalid.exitCode, 1);
      assert.ok(invalid.report.issues.includes("parallel wall duration must be a positive finite number"));
    }
  } finally { await removeComparison(fixture); }
});

async function wholeEntryTimingControl(fixture) {
  await writeComparison(fixture);
  await writeEntryTimings(fixture, 700, 650);
  const slow = await runComparison(fixture, true);
  assert.equal(slow.exitCode, 1);
  assert.equal(slow.report.measurementBoundary, "TECHNICAL_ENTRY_POINT");
  assert.equal(slow.report.measuredWallTimeReductionPercent, 7.14);
  await writeEntryTimings(fixture, 700, 400);
  assert.equal((await runComparison(fixture, true)).exitCode, 0);
}

async function staleEntryTimingControl(fixture) {
  fixture.parallel.gate.status = "FAIL";
  await writeComparison(fixture);
  const stale = await runComparison(fixture, true);
  assert.equal(stale.exitCode, 1);
  assert.ok(stale.report.issues.includes("parallel entry-point timing does not bind the exact report bytes"));
}

async function zeroEntryTimingControl(fixture) {
  fixture.parallel.gate.status = "PASS";
  await writeComparison(fixture);
  await writeEntryTimings(fixture, 700, 400);
  const timing = JSON.parse(await readFile(fixture.paths["parallel-timing"], "utf8"));
  timing.wallDurationMs = 0;
  await writeFile(fixture.paths["parallel-timing"], JSON.stringify(timing), "utf8");
  const zero = await runComparison(fixture, true);
  assert.equal(zero.exitCode, 1);
  assert.ok(zero.report.issues.includes("parallel entry-point duration must be a positive integer covering the inner lanes"));
}

test("E2E comparison counts the whole technical entry point and rejects stale timing bindings", async () => {
  const fixture = await comparisonFiles();
  try {
    await wholeEntryTimingControl(fixture);
    await staleEntryTimingControl(fixture);
    await zeroEntryTimingControl(fixture);
  } finally { await removeComparison(fixture); }
});
