import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { completePlacement } from "../lib/placement-fixtures.mjs";
import { baseUi, stateWithUi, findActiveQuestion } from "./session-fixtures.mjs";

function placementContext(engine) {
  const baseline = engine.createInitialState(24_000);
  const completeIncorrect = (options = {}) => completePlacement(engine, baseline, (question) => {
    assert.ok(question, "placement fixture expected a current question");
    return false;
  }, { playDay: 24_000, seed: options.seed ?? 0x504c4143, theme: options.theme ?? "ocean" });
  return { engine, baseline, completeIncorrect };
}

function assertPlacementIsolation({ engine, baseline }) {
  assert.throws(() => engine.createPlacementRun(), /Save is not an object/u);
  const activeQuestion = findActiveQuestion(engine, () => true);
  const active = stateWithUi(engine, baseUi(activeQuestion));
  assert.equal(engine.validateState(active), null);
  assert.throws(
    () => engine.createPlacementRun({ state: active }),
    /finish or cancel the active session or preview/u,
  );
  assert.throws(
    () => engine.beginPlacementRun({ state: active }),
    /finish or cancel the active session or preview/u,
  );
  const preview = clone(baseline);
  preview.previewLevel = 2;
  assert.equal(engine.validateState(preview), null);
  assert.throws(
    () => engine.createPlacementRun({ state: preview }),
    /finish or cancel the active session or preview/u,
  );
  assert.throws(
    () => engine.beginPlacementRun({ state: preview }),
    /finish or cancel the active session or preview/u,
  );
}

function assertPlacementIdentity({ engine, baseline }) {
  const defaults = engine.createPlacementRun({ state: baseline });
  assert.equal(defaults.playDay, baseline.maxSeenPlayDay);
  assert.equal(defaults.nonce, baseline.placement.runNonce);
  assert.equal(Number.isInteger(defaults.seed), true);
  assert.equal(defaults.theme, "ocean");
  for (const options of [
    { playDay: 23_999 },
    { playDay: 24_000.5 },
    { nonce: 1 },
    { nonce: 1.5 },
    { seed: -1 },
    { seed: 0x1_0000_0000 },
    { theme: "online-world" },
  ]) {
    assert.throws(
      () => engine.createPlacementRun({ state: baseline, ...options }),
      /invalid day, nonce, seed, or theme/u,
    );
  }
}

function assertPlacementNonce({ engine, baseline }) {
  const exhausted = clone(baseline);
  exhausted.placement.runNonce = 0xffffffff;
  assert.equal(engine.validateState(exhausted), null);
  assert.throws(() => engine.beginPlacementRun({ state: exhausted }), /counter is exhausted/u);
  const prepared = engine.beginPlacementRun({ state: baseline, playDay: 24_001, theme: "space" });
  assert.equal(prepared.state.placement.runNonce, 1);
  assert.equal(prepared.run.nonce, 1);
  assert.equal(prepared.run.playDay, 24_001);
  assert.equal(prepared.run.theme, "space");
  assert.equal(engine.validatePlacementRun(prepared.run, prepared.state).valid, true);
}

function assertMalformedPlacementRuns(engine, run) {
  const invalidCases = [
    [null, /unknown or missing fields/u],
    [{}, /unknown or missing fields/u],
    [{ ...clone(run), surprise: true }, /unknown or missing fields/u],
    [{ ...clone(run), contractVersion: "wrong" }, /different placement/u],
    [{ ...clone(run), curriculumSha256: "0".repeat(64) }, /different placement/u],
    [{ ...clone(run), generatorContractVersion: "wrong" }, /different placement/u],
    [{ ...clone(run), baselineStateFingerprint: "bad" }, /identity is invalid/u],
    [{ ...clone(run), nonce: 1.5 }, /identity is invalid/u],
    [{ ...clone(run), seed: -1 }, /identity is invalid/u],
    [{ ...clone(run), playDay: -1 }, /identity is invalid/u],
    [{ ...clone(run), theme: "network" }, /identity is invalid/u],
    [{ ...clone(run), answers: null }, /answers are invalid/u],
    [{
      ...clone(run),
      answers: Array.from(
        { length: engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS + 1 },
        (_, index) => ({ questionId: `q${index}`, responseKind: "correct" }),
      ),
    }, /answers are invalid/u],
    [{ ...clone(run), answers: [{ questionId: "", responseKind: "correct" }] }, /answers are invalid/u],
    [{
      ...clone(run),
      answers: [{ questionId: "forged", responseKind: "maybe", surprise: true }],
    }, /answers are invalid/u],
  ];
  for (const [hostile, expected] of invalidCases) {
    const validation = engine.validatePlacementRun(hostile);
    assert.equal(validation.valid, false);
    assert.match(validation.error, expected);
    assert.equal(validation.complete, false);
  }
}

function assertPlacementStaleness({ engine, baseline }, run) {
  const invalidState = clone(baseline);
  invalidState.earnedLevel = 999;
  const invalidStateResult = engine.validatePlacementRun(run, invalidState);
  assert.equal(invalidStateResult.valid, false);
  assert.match(invalidStateResult.error, /earned level/u);
  const differentNonce = clone(baseline);
  differentNonce.placement.runNonce = 1;
  const nonceStale = engine.validatePlacementRun(run, differentNonce);
  assert.equal(nonceStale.valid, false);
  assert.match(nonceStale.error, /progress changed/u);
  const changedProgress = clone(baseline);
  changedProgress.settings.soundVolume = 0.25;
  const fingerprintStale = engine.validatePlacementRun(run, changedProgress);
  assert.equal(fingerprintStale.valid, false);
  assert.match(fingerprintStale.error, /progress changed/u);
}

function assertPlacementSequence(engine, run) {
  const wrongSequence = clone(run);
  wrongSequence.answers = [{ questionId: "forged-question", responseKind: "correct" }];
  const sequenceResult = engine.validatePlacementRun(wrongSequence);
  assert.equal(sequenceResult.valid, false);
  assert.match(sequenceResult.error, /question sequence/u);
  assert.throws(() => engine.placementCurrentQuestion(wrongSequence), /question sequence/u);
}

function assertRejectedPlacementApplication({ engine, baseline }) {
  const run = engine.createPlacementRun({ state: baseline, playDay: 24_000, seed: 11 });
  assert.throws(() => engine.submitPlacementAnswer(run, null), /response is not valid/u);
  assert.throws(() => engine.submitPlacementAnswer(run, { optionId: "not-an-option" }), /response is not valid/u);
  const incomplete = engine.applyPlacementRecommendation(baseline, run);
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.state, baseline);
  assert.deepEqual(clone(incomplete.effects), []);
  assert.match(incomplete.error, /not complete/u);
  const staleState = clone(baseline);
  staleState.settings.soundVolume = 0.25;
  const stale = engine.applyPlacementRecommendation(staleState, run);
  assert.equal(stale.ok, false);
  assert.equal(stale.state, staleState);
  assert.deepEqual(clone(stale.effects), []);
  assert.match(stale.error, /progress changed/u);
  const invalidState = clone(baseline);
  invalidState.previewLevel = 999;
  const invalid = engine.applyPlacementRecommendation(invalidState, run);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state, invalidState);
  assert.deepEqual(clone(invalid.effects), []);
}

function assertPlacementConfirmationOptions({ engine, baseline }, lowRun) {
  const recommendation = engine.placementRecommendation(lowRun);
  assert.equal(recommendation.recommendedLevel, 1);
  assert.equal(recommendation.questionCount >= engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS, true);
  const wrongLevel = engine.applyPlacementRecommendation(baseline, lowRun, { startingLevel: 3 });
  assert.equal(wrongLevel.ok, false);
  assert.equal(wrongLevel.state, baseline);
  assert.deepEqual(clone(wrongLevel.effects), []);
  assert.match(wrongLevel.error, /recommendation or one level earlier/u);
  for (const playDay of [-1, 23_999, 24_000.5]) {
    const wrongDay = engine.applyPlacementRecommendation(baseline, lowRun, { playDay });
    assert.equal(wrongDay.ok, false);
    assert.equal(wrongDay.state, baseline);
    assert.deepEqual(clone(wrongDay.effects), []);
    assert.match(wrongDay.error, /confirmation day is invalid/u);
  }
}

function assertPlacementGenerationExhaustion({ engine, baseline, completeIncorrect }) {
  const exhaustedGeneration = clone(baseline);
  exhaustedGeneration.placementDraftGeneration = Number.MAX_SAFE_INTEGER;
  const exhaustedRun = completeIncorrect({ seed: 13 });
  const reboundRun = {
    ...clone(exhaustedRun),
    baselineStateFingerprint: engine.createPlacementRun({
      state: exhaustedGeneration,
      playDay: 24_000,
      seed: exhaustedRun.seed,
    }).baselineStateFingerprint,
  };
  const exhaustedApply = engine.applyPlacementRecommendation(
    exhaustedGeneration,
    reboundRun,
    { placementDraftGenerationFloor: Number.MAX_SAFE_INTEGER },
  );
  assert.equal(exhaustedApply.ok, false);
  assert.equal(exhaustedApply.state, exhaustedGeneration);
  assert.deepEqual(clone(exhaustedApply.effects), []);
  assert.match(exhaustedApply.error, /draft generation/u);
}

function assertConfirmedPlacement({ engine, baseline }, lowRun) {
  const applied = engine.applyPlacementRecommendation(baseline, lowRun);
  assert.equal(applied.ok, true);
  assert.equal(applied.state.earnedLevel, 1);
  assert.ok(applied.effects.some((effect) => effect.type === "PLACEMENT_CONFIRMED"));
  assert.throws(() => engine.submitPlacementNotSure(lowRun), /already complete/u);
  assert.throws(() => engine.submitPlacementAnswer(lowRun, "anything"), /already complete/u);
}

export async function registerPlacementApiBoundaryTests(t, engine) {
  const context = placementContext(engine);
  await t.test("PLACEMENT-CREATE validates state, isolation, identity, and nonce boundaries", () => {
    assertPlacementIsolation(context);
    assertPlacementIdentity(context);
    assertPlacementNonce(context);
  });
  await t.test("PLACEMENT-VALIDATE classifies malformed identity, answers, sequence, and staleness", () => {
    const run = engine.createPlacementRun({ state: context.baseline, playDay: 24_000, seed: 7 });
    assertMalformedPlacementRuns(engine, run);
    assertPlacementStaleness(context, run);
    assertPlacementSequence(engine, run);
  });
  await t.test("PLACEMENT-SUBMIT and APPLY remain transactional at every public failure boundary", () => {
    assertRejectedPlacementApplication(context);
    const lowRun = context.completeIncorrect({ seed: 12 });
    assertPlacementConfirmationOptions(context, lowRun);
    assertPlacementGenerationExhaustion(context);
    assertConfirmedPlacement(context, lowRun);
  });
}
