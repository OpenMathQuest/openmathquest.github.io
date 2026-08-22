import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fc from "fast-check";
import {
  PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
  PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
  PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
  PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS,
  PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
  PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
  PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
  PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
  PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
  buildPlaywrightInteractionFuzzReport,
  interactionFuzzAllowedActionFindings,
  interactionFuzzEffectFindings,
  interactionFuzzReplayPath,
  playwrightInteractionFuzzReportFindings,
  playwrightInteractionFuzzShardFindings,
} from "../lib/playwright-interaction-fuzz.mjs";

function validShard(project) {
  return {
    schemaVersion: PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
    contractId: PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
    certificationClaim: PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
    status: "passed",
    project: {
      id: project.id,
      inputMethod: project.inputMethod,
      viewport: project.viewport,
      hasTouch: project.hasTouch,
    },
    toolchain: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
    seed: project.seed,
    path: null,
    replayPath: null,
    configuredRuns: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    maxCommandsPerRun: PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
    workers: PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
    retries: PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
    numRuns: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    numSkips: 0,
    numShrinks: 0,
    browserActionExecutions: 1,
    failure: null,
  };
}

test("interaction-fuzz effect oracle rejects a native no-op negative control", () => {
  const control = {
    effectDigest: "a".repeat(64),
    rootVisible: true,
    locationPath: "/index.html",
    saveValidationError: null,
    childIdentityMode: "anonymous",
  };
  assert.deepEqual(interactionFuzzEffectFindings(control, { ...control, effectDigest: "b".repeat(64) }), []);
  assert.match(interactionFuzzEffectFindings(control, structuredClone(control)).join("\n"), /no observable state effect/u);
});

test("fast-check command runner shrinks a no-op mutation to replayable evidence", () => {
  class InjectNoOpCommand {
    check() { return true; }
    run() {
      const snapshot = {
        effectDigest: "c".repeat(64),
        rootVisible: true,
        locationPath: "/index.html",
        saveValidationError: null,
        childIdentityMode: "anonymous",
      };
      const findings = interactionFuzzEffectFindings(snapshot, structuredClone(snapshot));
      if (findings.length) throw new Error(findings.join("; "));
    }
    toString() { return "injectNoOp()"; }
  }
  const commands = fc.commands([fc.constant(new InjectNoOpCommand())], { maxCommands: 3, size: "medium" });
  const details = fc.check(fc.property(commands, (sequence) => {
    fc.modelRun(() => ({ model: {}, real: {} }), sequence);
  }), { seed: 123, numRuns: 1, verbose: 2 });
  assert.equal(details.failed, true);
  assert.equal(details.counterexamplePath, "0");
  assert.match(String(details.errorInstance?.message || details.errorInstance), /no observable state effect/u);
  const counterexample = fc.stringify(details.counterexample);
  assert.match(counterexample, /injectNoOp\(\)/u);
  assert.notEqual(interactionFuzzReplayPath(counterexample), null);
});

test("interaction-fuzz action policy rejects a destructive-action mutation", () => {
  assert.deepEqual(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "select",
    responseAction: null,
  }), []);
  assert.match(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "reset",
    responseAction: null,
  }).join("\n"), /forbidden data-action/u);
});

test("interaction-fuzz shard and aggregate reports validate literal outcomes", () => {
  const shards = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.map(validShard);
  for (const shard of shards) assert.deepEqual(playwrightInteractionFuzzShardFindings(shard), []);
  const report = buildPlaywrightInteractionFuzzReport(shards);
  assert.deepEqual(playwrightInteractionFuzzReportFindings(report), []);
  assert.deepEqual(report.summary, {
    expectedProjects: 2,
    passedProjects: 2,
    failedProjects: 0,
    browserActionExecutions: 2,
  });
});

test("interaction-fuzz contract fails closed when retries, inventory, or pass evidence drift", () => {
  const retryMutation = validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0]);
  retryMutation.retries = 1;
  assert.match(playwrightInteractionFuzzShardFindings(retryMutation).join("\n"), /retry count changed/u);

  const actionlessMutation = validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0]);
  actionlessMutation.browserActionExecutions = 0;
  assert.match(playwrightInteractionFuzzShardFindings(actionlessMutation).join("\n"), /no randomized browser action/u);

  const missingProject = buildPlaywrightInteractionFuzzReport([validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0])]);
  assert.match(playwrightInteractionFuzzReportFindings(missingProject).join("\n"), /exactly one shard per closed project/u);
});

test("interaction-fuzz implementation uses fast-check commands and native unforced Playwright activation", async () => {
  const [spec, fixture, config] = await Promise.all([
    readFile(new URL("../playwright/interaction-fuzz.spec.mjs", import.meta.url), "utf8"),
    readFile(new URL("../playwright/fixtures.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../playwright.interaction-fuzz.config.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(spec, /fc\.commands\(/u);
  assert.match(spec, /fc\.asyncModelRun\(/u);
  assert.match(spec, /fc\.check\(/u);
  assert.doesNotMatch(spec, /force\s*:/u);
  assert.match(fixture, /await locator\.tap\(\)/u);
  assert.match(fixture, /await locator\.click\(\)/u);
  assert.match(config, /PLAYWRIGHT_INTERACTION_FUZZ_RETRIES/u);
  assert.match(config, /PLAYWRIGHT_INTERACTION_FUZZ_WORKERS/u);
});
