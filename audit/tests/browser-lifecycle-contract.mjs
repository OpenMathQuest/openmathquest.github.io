import assert from "node:assert/strict";

export function assertBrowserLifecycleContracts(E, visualContract, auditPage) {
  const originalState = E.createInitialState(31_000);
  const traversal = visualContract.placementCases(E, originalState);
  const denseWitness = traversal.methods.find((row) => row.inputMethod === "SHARE_DEAL");
  assert.ok(denseWitness, "the adaptive traversal must retain a real SHARE_DEAL witness");
  assertPlacementReplayAfterStart(E, visualContract, originalState, denseWitness);
  assertPlacementLifecycleSource(auditPage);
  assertFeedbackAnnouncementSource(auditPage);
  assertWriterIsolationSource(auditPage);
}

function assertPlacementReplayAfterStart(E, visualContract, originalState, denseWitness) {
  const begun = E.beginPlacementRun({
    state: originalState,
    playDay: originalState.maxSeenPlayDay,
    theme: "ocean",
  });
  assert.notEqual(begun.state.placement.runNonce, denseWitness.run.nonce,
    "the real Start action must advance the private run identity");
  assert.equal(E.validatePlacementRun(denseWitness.run, begun.state).valid, false,
    "a pre-Start traversal fixture must be rejected as stale after Start commits a new nonce");

  let compatibleRun = E.createPlacementRun({
    state: begun.state,
    playDay: denseWitness.run.playDay,
    seed: denseWitness.run.seed,
    theme: denseWitness.run.theme,
  });
  for (const prior of denseWitness.run.answers) {
    const question = E.placementCurrentQuestion(compatibleRun);
    compatibleRun = prior.responseKind === "correct"
      ? E.submitPlacementAnswer(compatibleRun, visualContract.correctAnswer(E, question)).run
      : E.submitPlacementNotSure(compatibleRun).run;
  }
  assert.equal(E.validatePlacementRun(compatibleRun, begun.state).valid, true);
  assert.equal(
    E.placementVisibleTaskSignature(E.placementCurrentQuestion(compatibleRun)),
    E.placementVisibleTaskSignature(denseWitness.question),
    "replaying the same deterministic decisions on the committed identity must reach the same visible task",
  );
}

function assertPlacementLifecycleSource(auditPage) {
  const placementAudit = auditPage.match(
    /const denseWitness = traversal\.methodCases\.find\([\s\S]*?const placementFeedbackRows = \[\];/u,
  )?.[0];
  assert.ok(placementAudit, "the browser audit must retain its dense placement lifecycle fixture");
  assert.match(placementAudit, /denseRun = engine\.createPlacementRun\(\{[\s\S]*?state: startedState/u);
  assert.match(placementAudit, /engine\.validatePlacementRun\(denseRun, startedState\)/u);
  assert.match(placementAudit, /engine\.placementVisibleTaskSignature\(denseQuestion\)[\s\S]*?engine\.placementVisibleTaskSignature\(denseWitness\.question\)/u);
  const placementLifecycleAudit = auditPage.match(
    /const denseWitness = traversal\.methodCases\.find\([\s\S]*?const placementSelectionCase =/u,
  )?.[0];
  assert.ok(placementLifecycleAudit);
  assert.match(placementLifecycleAudit, /dispatchEvent\(new placementScenario\.win\.Event\("pagehide"\)\)[\s\S]*?localStorage\.setItem\(TEST_PLACEMENT_DRAFT_KEY, incorrectDraftBytes\)/u,
    "the outgoing writer must release before the audit restores shared draft bytes");
  assert.match(placementLifecycleAudit, /controllerSignalStayedAtQuestion/u,
    "the controller-change fixture must prove the active question first and then navigate only at Pause");
}

function assertFeedbackAnnouncementSource(auditPage) {
  const feedbackAudit = auditPage.match(
    /const feedbackRows = \[\];[\s\S]*?add\("BR-26"/u,
  )?.[0];
  assert.ok(feedbackAudit, "the browser audit must retain the exact feedback matrix");
  assert.match(feedbackAudit, /feedback\?\.dataset\.feedbackAnnouncement === "focus"/u);
  assert.match(feedbackAudit, /liveText === ""/u,
    "the focused outcome must not be duplicated through the global live region");
  assert.match(feedbackAudit, /attemptTruthMatches = attemptTruth === correct/u);
  assert.doesNotMatch(feedbackAudit, /liveText\.startsWith\(expectedStatus\)/u,
    "the obsolete duplicate-live-announcement oracle must not return");
}

function assertWriterIsolationSource(auditPage) {
  const writerIsolationAudit = auditPage.match(
    /function scenarioFailClosedState\(frame\)[\s\S]*?async function waitForScenarioNavigation/u,
  )?.[0];
  assert.ok(writerIsolationAudit,
    "the browser audit must retain its synthetic-frame writer-isolation boundary");
  assert.match(writerIsolationAudit, /typeof locks\.query !== "function"/u);
  assert.match(writerIsolationAudit, /consecutiveIdleObservations >= 2/u,
    "the handoff must observe an empty held/pending lock set across two task turns");
  assert.match(writerIsolationAudit, /await requireAuditWriterIdle\(\)/u);
  assert.match(writerIsolationAudit, /entered unexpected \$\{failClosedState\}/u,
    "ordinary fixtures must reject progress-protection and save-recovery screens explicitly");
  assert.match(auditPage, /allowFailClosedScreen: true/u,
    "only the deliberate BR-20 fail-closed fixtures may opt into those screens");
  assert.match(auditPage, /waitUntil\([\s\S]*?\}, 350, 20\);[\s\S]*?did not reach expected skill/u,
    "the existing seven-second BR-21 bound must remain intact rather than becoming a retry mask");
}
