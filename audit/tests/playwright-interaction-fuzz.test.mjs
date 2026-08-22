import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import fc from "fast-check";
import {
  PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
  PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
  PLAYWRIGHT_INTERACTION_FUZZ_ALLOWED_RESPONSE_ACTIONS,
  PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
  PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS,
  PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
  PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
  PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
  PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
  PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
  buildPlaywrightInteractionFuzzReport,
  interactionFuzzAllowedActionFindings,
  interactionFuzzCanonicalReplayPath,
  interactionFuzzEffectFindings,
  interactionFuzzMinimizedFailureEvidence,
  interactionFuzzReplayPath,
  playwrightInteractionFuzzArtifactFindings,
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
    propertyEvaluations: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    browserActionExecutions: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    failure: null,
  };
}

function validFailedShard(project) {
  const message = "native activation produced no visible DOM effect";
  return {
    ...validShard(project),
    status: "failed",
    path: "0:1",
    replayPath: "A:A",
    numRuns: 1,
    numShrinks: 0,
    propertyEvaluations: 1,
    browserActionExecutions: 2,
    failure: {
      message,
      replayMessage: message,
      replayVerified: true,
      counterexample: 'activateAny(0) /*replayPath="A:A"*/',
      minimizedActionTrace: [{
        actionIndex: 0,
        familyId: "answer",
        generatedOrdinal: 0,
        selectedOrdinal: 0,
        dataAction: "response",
        responseAction: "undo",
        key: null,
        value: null,
        accessibleName: "Undo",
        beforeDomDigest: "a".repeat(64),
        afterDomDigest: "a".repeat(64),
        beforeSaveDigest: "b".repeat(64),
        afterSaveDigest: "b".repeat(64),
        locationPath: "/index.html",
        outcome: "failed",
        findings: [message],
      }],
      screenshotPath: `audit/.tmp-playwright-interaction-fuzz/${project.id}-failure.png`,
    },
  };
}

test("interaction-fuzz effect oracle rejects a native no-op negative control", () => {
  const control = {
    domDigest: "a".repeat(64),
    saveDigest: "c".repeat(64),
    rootVisible: true,
    locationPath: "/index.html",
    saveValidationError: null,
    childIdentityMode: "anonymous",
  };
  assert.deepEqual(interactionFuzzEffectFindings(control, { ...control, domDigest: "b".repeat(64) }), []);
  assert.match(interactionFuzzEffectFindings(control, structuredClone(control)).join("\n"), /no visible DOM effect/u);
});

test("fast-check command runner shrinks a no-op mutation to replayable evidence", () => {
  class InjectNoOpCommand {
    check() { return true; }
    run() {
      const snapshot = {
        domDigest: "c".repeat(64),
        saveDigest: "d".repeat(64),
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
  assert.match(String(details.errorInstance?.message || details.errorInstance), /no visible DOM effect/u);
  const counterexample = fc.stringify(details.counterexample);
  assert.match(counterexample, /injectNoOp\(\)/u);
  assert.notEqual(interactionFuzzReplayPath(counterexample), null);
});

test("command replay paths use fast-check's canonical run-length and bit encoding", () => {
  assert.equal(interactionFuzzCanonicalReplayPath("A:A"), "A:A");
  assert.equal(interactionFuzzCanonicalReplayPath("A:C"), "A:A", "unused high bits must not survive canonicalization");
  assert.equal(interactionFuzzCanonicalReplayPath("AA:A"), "B:A", "adjacent equal states must use one run");
  assert.equal(interactionFuzzCanonicalReplayPath("not-a-path"), null);
});

test("minimized evidence replays the retained failure instead of trusting a later passing shrink probe", async () => {
  let mutableFinalProbe = null;
  const details = fc.check(fc.property(fc.integer({ min: 6, max: 7 }), (value) => {
    mutableFinalProbe = value;
    if (value === 7) throw new Error("retained failure 7");
  }), { seed: 5, numRuns: 1, verbose: 2 });
  assert.equal(details.failed, true);
  assert.equal(mutableFinalProbe, 6, "the final mutable probe must demonstrate the original evidence bug");
  const evidence = await interactionFuzzMinimizedFailureEvidence(
    details,
    fc.stringify(details.counterexample),
    async (retainedValue) => {
      const trace = [retainedValue];
      let error = null;
      try {
        if (retainedValue === 7) throw new Error("retained failure 7");
      } catch (caught) {
        error = caught;
      }
      return { trace, error };
    },
  );
  assert.equal(evidence.replayVerified, true);
  assert.deepEqual(evidence.minimizedActionTrace, [7]);
  assert.equal(evidence.message, "retained failure 7");
  assert.equal(evidence.replayMessage, evidence.message);
});

test("interaction-fuzz action policy rejects a destructive-action mutation", () => {
  assert.deepEqual(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "response",
    responseAction: "undo",
  }), []);
  assert.match(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "reset",
    responseAction: null,
  }).join("\n"), /forbidden data-action/u);
  assert.match(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "response",
    responseAction: "placement-start",
  }).join("\n"), /unknown or forbidden data-response-action/u);
  assert.match(interactionFuzzAllowedActionFindings({
    familyId: "answer",
    dataAction: "response",
    responseAction: "future-unknown-action",
  }).join("\n"), /unknown or forbidden data-response-action/u);
});

test("closed response-action allowlist matches every statically declared child response control", async () => {
  const source = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  const declared = [...source.matchAll(/responseAction\(mode,"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(declared)].sort(), [...PLAYWRIGHT_INTERACTION_FUZZ_ALLOWED_RESPONSE_ACTIONS].sort());
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
    browserActionExecutions: PLAYWRIGHT_INTERACTION_FUZZ_RUNS * 2,
  });
});

test("interaction-fuzz contract fails closed when retries, inventory, or pass evidence drift", () => {
  const retryMutation = validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0]);
  retryMutation.retries = 1;
  assert.match(playwrightInteractionFuzzShardFindings(retryMutation).join("\n"), /retry count changed/u);

  const actionlessMutation = validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0]);
  actionlessMutation.browserActionExecutions = 0;
  assert.match(playwrightInteractionFuzzShardFindings(actionlessMutation).join("\n"), /too few randomized browser actions/u);

  const missingProject = buildPlaywrightInteractionFuzzReport([validShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0])]);
  assert.match(playwrightInteractionFuzzReportFindings(missingProject).join("\n"), /exactly one shard per closed project/u);
});

test("failed shard evidence is closed, replay-bound, feasible, and artifact-bound", () => {
  const project = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0];
  const shard = validFailedShard(project);
  assert.deepEqual(playwrightInteractionFuzzShardFindings(shard), []);
  assert.deepEqual(playwrightInteractionFuzzArtifactFindings([shard], new Set([`${project.id}-failure.png`])), []);

  const mutations = [
    { pattern: /closed project seed/u, mutate: (value) => { value.seed = 999; } },
    { pattern: /numRuns/u, mutate: (value) => { value.numRuns = 999; } },
    { pattern: /skipped property/u, mutate: (value) => { value.numSkips = 1; } },
    { pattern: /evaluation budget/u, mutate: (value) => { value.browserActionExecutions = 999_999; } },
    { pattern: /command replay path/u, mutate: (value) => { value.replayPath = null; } },
    { pattern: /noncanonical fast-check counterexample path/u, mutate: (value) => { value.path = "not-a-fast-check-path"; } },
    { pattern: /noncanonical fast-check counterexample path/u, mutate: (value) => { value.path = "00:01"; } },
    { pattern: /contradicts the minimized counterexample/u, mutate: (value) => { value.replayPath = "B:B"; } },
    { pattern: /noncanonical fast-check command replay path/u, mutate: (value) => { value.replayPath = "WRONG"; } },
    { pattern: /noncanonical fast-check command replay encoding/u, mutate: (value) => {
      value.replayPath = "A:C";
      value.failure.counterexample = 'activateAny(0) /*replayPath="A:C"*/';
    } },
    { pattern: /failure-evidence field/u, mutate: (value) => { value.failure = {}; } },
    { pattern: /replay is not verified/u, mutate: (value) => { value.failure.replayVerified = false; } },
    { pattern: /same failure/u, mutate: (value) => { value.failure.replayMessage = "different"; } },
    { pattern: /bounded nonempty minimized action trace/u, mutate: (value) => { value.failure.minimizedActionTrace = []; } },
    { pattern: /findings are malformed/u, mutate: (value) => { value.failure.minimizedActionTrace[0].findings = null; } },
    { pattern: /closed project path/u, mutate: (value) => { value.failure.screenshotPath = "wrong.png"; } },
  ];
  for (const { pattern, mutate } of mutations) {
    const value = structuredClone(shard);
    mutate(value);
    assert.match(playwrightInteractionFuzzShardFindings(value).join("\n"), pattern);
  }
  assert.match(playwrightInteractionFuzzArtifactFindings([shard], new Set()).join("\n"), /screenshot is missing/u);
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
