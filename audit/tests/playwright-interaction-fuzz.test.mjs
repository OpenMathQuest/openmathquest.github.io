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
  interactionFuzzFailureDiagnostic,
  interactionFuzzFailureRecorder,
  interactionFuzzMinimizedFailureEvidence,
  interactionFuzzOriginalFailureFindings,
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

function failedActionTrace(message) {
  return [{
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
  }];
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
      minimizedActionTrace: failedActionTrace(message),
      replayActionTrace: failedActionTrace(message),
      originalFailure: {
        message,
        actionTrace: failedActionTrace(message),
        screenshotPath: `audit/.tmp-playwright-interaction-fuzz/${project.id}-failure.png`,
        captureError: null,
      },
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

test("minimized evidence preserves the original failure across a later passing shrink and replay", async () => {
  let mutableFinalProbe = null;
  const captures = [];
  const recorder = interactionFuzzFailureRecorder(async (original) => {
    original.screenshotPath = "synthetic-original-image";
    captures.push(structuredClone(original));
  });
  const details = await fc.check(fc.asyncProperty(fc.integer({ min: 6, max: 7 }), async (value) => {
    mutableFinalProbe = value;
    const error = value === 7 ? new Error("retained failure 7") : null;
    await recorder.record({ trace: [value], error });
    if (error) throw error;
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
    recorder.snapshot(),
  );
  assert.equal(evidence.replayVerified, true);
  assert.deepEqual(evidence.minimizedActionTrace, [7]);
  assert.deepEqual(evidence.replayActionTrace, [7]);
  assert.deepEqual(evidence.originalFailure, captures[0]);
  assert.equal(captures.length, 1);
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

function assertDiagnosticIncludes(diagnostic, expected) {
  for (const message of expected) assert.ok(diagnostic.includes(message));
}

test("a passing replay cannot replace original or minimized failure evidence or pass validation", async () => {
  const project = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0];
  const shard = validFailedShard(project);
  const captured = [];
  const recorder = interactionFuzzFailureRecorder(async (original) => {
    original.screenshotPath = shard.failure.screenshotPath;
    captured.push(structuredClone(original));
  });
  const first = { trace: failedActionTrace("original failure"), error: new Error("original failure") };
  await recorder.record(first);
  first.trace[0].findings = ["later mutation"];
  await recorder.record({ trace: failedActionTrace("minimized failure"), error: new Error("minimized failure") });
  await recorder.record({ trace: [], error: null });
  const details = { failed: true, counterexample: ["commands"], errorInstance: new Error("minimized failure") };
  const evidence = await interactionFuzzMinimizedFailureEvidence(details, shard.failure.counterexample,
    async () => ({ trace: [], error: null }), recorder.snapshot());
  assert.equal(captured.length, 1, "capture must precede and never be replaced by shrink/replay");
  assert.deepEqual(evidence.originalFailure, captured[0]);
  assert.deepEqual(evidence.originalFailure.actionTrace[0].findings, ["original failure"]);
  assert.deepEqual(evidence.minimizedActionTrace[0].findings, ["minimized failure"]);
  assert.deepEqual(evidence.replayActionTrace, []);
  assert.equal(evidence.replayVerified, false);
  shard.failure = { ...evidence, screenshotPath: captured[0].screenshotPath };
  const findings = playwrightInteractionFuzzShardFindings(shard);
  assert.match(findings.join("\n"), /replay is not verified/u);
  const diagnostic = interactionFuzzFailureDiagnostic("ORIGINAL_FAST_CHECK_REPORT", shard, findings);
  assertDiagnosticIncludes(diagnostic, ["ORIGINAL_FAST_CHECK_REPORT", "original failure", "minimized failure", "replay is not verified"]);
});

test("original failure records are closed and failed capture retains its trace while failing validation", async () => {
  const project = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0];
  const shard = validFailedShard(project);
  const record = {
    schemaVersion: PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
    contractId: PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
    projectId: project.id,
    originalFailure: shard.failure.originalFailure,
  };
  assert.deepEqual(interactionFuzzOriginalFailureFindings(record), []);
  assert.match(interactionFuzzOriginalFailureFindings({ ...record, extra: true }).join("\n"), /unknown or missing/u);
  const recorder = interactionFuzzFailureRecorder(async () => { throw new Error("screenshot unavailable"); });
  await recorder.record({ trace: shard.failure.originalFailure.actionTrace, error: new Error("original failure") });
  record.originalFailure = recorder.snapshot().original;
  assert.equal(record.originalFailure.message, "original failure");
  assert.equal(record.originalFailure.captureError, "screenshot unavailable");
  assert.deepEqual(record.originalFailure.actionTrace, shard.failure.originalFailure.actionTrace);
  assert.match(interactionFuzzOriginalFailureFindings(record).join("\n"), /capture was incomplete/u);
});

test("a thrown replay executor retains the original diagnostic and cannot verify replay", async () => {
  const shard = validFailedShard(PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS[0]);
  const evidence = await interactionFuzzMinimizedFailureEvidence(
    { failed: true, counterexample: ["commands"], errorInstance: new Error(shard.failure.message) },
    shard.failure.counterexample,
    async () => { throw new Error("replay setup failed"); },
    { original: shard.failure.originalFailure, latest: { actionTrace: shard.failure.minimizedActionTrace } },
  );
  assert.equal(evidence.replayVerified, false);
  assert.equal(evidence.replayMessage, "replay setup failed");
  assert.deepEqual(evidence.originalFailure, shard.failure.originalFailure);
});

test("CI failure artifacts are restricted to exact synthetic fuzz reports and original captures", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/audit.yml", import.meta.url), "utf8");
  const block = workflow.split("      - name: Retain synthetic interaction-fuzz failure evidence\n")[1].split("\n  full-audit:")[0];
  assert.match(block, /if: failure\(\)/u);
  assert.match(block, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u);
  assert.match(block, /include-hidden-files: true/u);
  const paths = block.split("          path: |\n")[1].split("          include-hidden-files:")[0].trim().split("\n").map((value) => value.trim());
  assert.deepEqual(paths, [
    "audit/.tmp-playwright-interaction-fuzz-report.json",
    "audit/.tmp-playwright-interaction-fuzz/edge-desktop.json",
    "audit/.tmp-playwright-interaction-fuzz/edge-phone.json",
    "audit/.tmp-playwright-interaction-fuzz/edge-desktop-original-failure.json",
    "audit/.tmp-playwright-interaction-fuzz/edge-phone-original-failure.json",
    "audit/.tmp-playwright-interaction-fuzz/edge-desktop-failure.png",
    "audit/.tmp-playwright-interaction-fuzz/edge-phone-failure.png",
  ]);
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
  assert.deepEqual(playwrightInteractionFuzzArtifactFindings([shard], new Set([
    `${project.id}-failure.png`, `${project.id}-original-failure.json`,
  ])), []);

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
  assert.match(spec, /(?=[\s\S]*#app button)(?=[\s\S]*PageTransitionEvent\("pagehide"\))(?=[\s\S]*localStorage\.clear\(\))(?=[\s\S]*fc\.commands\()/u);
  assert.match(spec, /fc\.asyncModelRun\(/u);
  assert.match(spec, /fc\.check\(/u);
  assert.doesNotMatch(spec, /force\s*:/u);
  assert.match(fixture, /await locator\.tap\(\)/u);
  assert.match(fixture, /await locator\.click\(\)/u);
  assert.match(config, /PLAYWRIGHT_INTERACTION_FUZZ_RETRIES/u);
  assert.match(config, /PLAYWRIGHT_INTERACTION_FUZZ_WORKERS/u);
});
