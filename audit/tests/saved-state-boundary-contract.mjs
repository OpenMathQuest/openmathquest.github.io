import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi, findActiveQuestion, questionsForActiveSlot, canonicalActiveSlot, makeSessionCheckpointQuestion } from "./session-fixtures.mjs";

function dateBoundaryContext(engine, findQuestion) {
  const maximum = 22_000;
  const question = findQuestion(engine, (candidate) => (
    candidate.inputClass === "SELECTION" && candidate.options.length >= 2
  ));
  const wrong = question.options.find((option, index) => index !== question.correctIndex);
  const attempt = engine.submitAnswer(
    question,
    { optionId: wrong.optionId },
    {
      promptFinishedAt: 1_000,
      submittedAt: 4_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      sessionId: "day-bound-session",
      playDay: maximum,
    },
  );
  let baseline = engine.createInitialState(maximum);
  baseline = engine.applyAttempt(baseline, attempt).state;
  assert.equal(engine.validateState(baseline), null, "generated attempt state is the valid control");
  const skillId = attempt.skillId;
  return { engine, maximum, attempt, baseline, skillId };
}

function futureDateRejection(t, context) {
  const { engine, baseline, maximum } = context;
  return async (name, mutate) => t.test(name, () => {
    const state = clone(baseline);
    mutate(state, context);
    assert.equal(engine.validateState(state), "Saved dates exceed the maximum seen play day.");
    const loaded = engine.loadState(JSON.stringify(state), maximum);
    assert.equal(loaded.ok, false);
    assert.match(loaded.error, /maximum seen play day/iu);
  });
}

const futureDateCases = [
  ["DAY-BOUND practice-count key", (state, { maximum }) => {
    state.practiceCountByDay[String(maximum + 1)] = 1;
  }],
  ["DAY-BOUND evidence", (state, { maximum, skillId }) => {
    state.skills[skillId].evidence[0].playDay = maximum + 1;
  }],
  ["DAY-BOUND miss", (state, { maximum, skillId }) => {
    state.skills[skillId].misses[0].playDay = maximum + 1;
  }],
  ["DAY-BOUND last spacing day", (state, { maximum, skillId }) => {
    state.skills[skillId].lastSpacingDay = maximum + 1;
  }],
  ["DAY-BOUND restore day", (state, { maximum, skillId }) => {
    state.skills[skillId].restoreNeeded = true;
    state.skills[skillId].restoreAfterDay = maximum + 1;
  }],
  ["DAY-BOUND mastery verification day", (state, { engine, maximum, skillId }) => {
    const record = state.skills[skillId];
    record.acquisition = "SOLID";
    record.restoreNeeded = false;
    record.restoreAfterDay = null;
    record.masteryVerifiedPlayDay = maximum + 1;
    record.masteryContractVersion = engine.CONSTANTS.MASTERY_CONTRACT_VERSION;
  }],
  ["DAY-BOUND session log", (state, { maximum }) => {
    state.sessionLog.push({ sessionId: "future-session", playDay: maximum + 1 });
  }],
  ["DAY-BOUND feedback history", (state, { maximum, attempt }) => {
    state.feedbackHistory.push({
      stage: attempt.stage,
      branch: attempt.feedbackClass,
      line: "Saved feedback.",
      sessionId: attempt.sessionId,
      playDay: maximum + 1,
    });
  }],
  ["DAY-BOUND reteach queue", (state, { maximum, skillId }) => {
    state.reteachQueue = [{ skillId, reason: "SAME_SESSION", playDay: maximum + 1 }];
  }],
  ["DAY-BOUND cold-test window", (state, { engine, maximum, attempt, skillId }) => {
    state.currentLevelColdWindow.push({
      recordId: "future-cold",
      skillId,
      level: engine.SKILL_BY_ID[skillId].level,
      feedbackClass: attempt.feedbackClass,
      evidenceClass: attempt.evidenceClass,
      playDay: maximum + 1,
      coldTest: true,
    });
  }],
  ["DAY-BOUND level-reteach target", (state, { maximum, skillId }) => {
    state.levelReteachActive = true;
    state.levelReteachTargets = [skillId];
    state.levelReteachTargetSince = { [skillId]: maximum + 1 };
  }],
  ["DAY-BOUND latency history", (state, { maximum }) => {
    state.latencyHistory[0].playDay = maximum + 1;
  }],
];

function assertSpacingDueBoundary({ engine, baseline, skillId, maximum }) {
  const dueBoundary = clone(baseline);
  dueBoundary.skills[skillId].dueDay = maximum + Math.max(...engine.CONSTANTS.SPACING_INTERVAL_DAYS);
  assert.equal(engine.validateState(dueBoundary), null, "the maximum declared spacing interval is a valid future due date");
  const dueBeyondBoundary = clone(dueBoundary);
  dueBeyondBoundary.skills[skillId].dueDay += 1;
  assert.equal(engine.validateState(dueBeyondBoundary), "Saved dates exceed the maximum seen play day.");
}

function assertOptionalLegacyDates({ engine, maximum }) {
  const legacyOptionalDates = engine.createInitialState(maximum);
  legacyOptionalDates.sessionLog = [{ sessionId: "legacy-session" }];
  legacyOptionalDates.feedbackHistory = [{
    stage: "PRE_K",
    branch: "INCORRECT",
    line: "Legacy feedback.",
    sessionId: "legacy-session",
  }];
  legacyOptionalDates.reteachQueue = [{ skillId: "MQ-001", reason: "SAME_SESSION" }];
  legacyOptionalDates.latencyHistory = [{
    stage: "PRE_K",
    elapsed: 1_000,
    inputClass: "SELECTION",
    feedbackClass: "INCORRECT",
    idleMs: 0,
  }];
  assert.equal(engine.validateState(legacyOptionalDates), null, "optional legacy event dates remain valid");
  assert.equal(engine.loadState(JSON.stringify(legacyOptionalDates), maximum).ok, true);
}

export async function registerSavedDateContracts(t, engine, findQuestion) {
  const context = dateBoundaryContext(engine, findQuestion);
  const rejectFuture = futureDateRejection(t, context);
  for (const [name, mutate] of futureDateCases) await rejectFuture(name, mutate);
  assertSpacingDueBoundary(context);
  assertOptionalLegacyDates(context);
}

function completedPatternFixture(engine, make) {
  const pattern = make("MQ-016");
  assert.equal(pattern.inputMethod, "PATTERN_BUILD");
  const patternResponse = engine.createResponseState(pattern);
  patternResponse.tokens = String(pattern.answer.value).trim().split(/\s+/u);
  return { name: "MQ-016 pattern", question: pattern, response: patternResponse };
}

function completedFactFamilyFixture(engine, make) {
  const factFamily = make("MQ-043");
  assert.equal(factFamily.inputMethod, "FACT_FAMILY");
  const factResponse = engine.createResponseState(factFamily);
  const { a, b, whole } = factFamily.params;
  factResponse.selected = [
    `${a}+${b}=${whole}`,
    `${b}+${a}=${whole}`,
    `${whole}\u2212${a}=${b}`,
    `${whole}\u2212${b}=${a}`,
  ];
  return { name: "MQ-043 fact family", question: factFamily, response: factResponse };
}

function completedRouteFixture(engine, make, skillId) {
  const route = make(skillId);
  assert.equal(route.inputMethod, "GRID_ROUTE");
  const routeResponse = engine.createResponseState(route);
  const specification = engine.gridRouteSpecification(route);
  assert.ok(specification);
  routeResponse.moves = [...specification.expectedMoves];
  routeResponse.end = { ...engine.traceGridRoute(route, routeResponse.moves).end };
  return { name: `${skillId} grid route`, question: route, response: routeResponse };
}

function saveCompletedResponse(engine, fixture) {
  assert.equal(engine.gradeAnswer(fixture.question, fixture.response).correct, true, `${fixture.name} control answer`);
  const saved = stateWithUi(engine, baseUi(fixture.question, {
    responseState: fixture.response,
    modelTouched: true,
  }));
  assert.equal(engine.validateState(saved), null, `${fixture.name} must be a valid active save`);
  assert.equal(
    saved.activeSession.queue[saved.activeSession.index].choicePosition,
    true,
    `${fixture.name} must cover a scheduler choice position`,
  );
  return saved;
}

function assertSavedChoiceResolution(engine, fixture, saved) {
  const activeSlot = saved.activeSession.queue[saved.activeSession.index];
  const activeCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[fixture.question.skillId],
    saved.activeSession.index,
  );
  const resolutionKey = String(activeSlot.ordinal);
  if (activeCandidates.length === 1) {
    assert.deepEqual(
      saved.activeSession.uiState.choiceResolved,
      {},
      `${fixture.name} singleton choice must auto-activate without a fabricated resolution`,
    );
    const forgedResolution = clone(saved);
    forgedResolution.activeSession.uiState.choiceResolved[resolutionKey] = 0;
    assert.equal(
      engine.validateState(forgedResolution),
      "Invalid active session.",
      `${fixture.name} singleton choice must reject a resolution the runtime never records`,
    );
    assert.equal(
      engine.loadState(JSON.stringify(forgedResolution), 22_000).ok,
      false,
      `${fixture.name} forged singleton resolution must fail reload`,
    );
  } else {
    assert.equal(
      saved.activeSession.uiState.choiceResolved[resolutionKey],
      activeCandidates.findIndex((candidate) => engine.canonical(candidate) === engine.canonical(fixture.question)),
      `${fixture.name} two-candidate choice records the exact activated variant`,
    );
    const missingResolution = clone(saved);
    delete missingResolution.activeSession.uiState.choiceResolved[resolutionKey];
    assert.equal(
      engine.validateState(missingResolution),
      "Invalid active session.",
      `${fixture.name} two-candidate choice cannot lose its resolution`,
    );
  }
}

function assertRestoredResponse(engine, fixture, saved) {
  const serialized = engine.exportState(saved);
  const restored = engine.loadState(serialized, 22_000);
  assert.equal(restored.ok, true, `${fixture.name} must reload`);
  assert.equal(restored.migrated, false, `${fixture.name} must not be discarded as a legacy question`);
  const restoredUi = restored.state.activeSession?.uiState;
  assert.ok(restoredUi, `${fixture.name} active UI must survive`);
  assert.deepEqual(clone(restoredUi.responseState), clone(fixture.response), `${fixture.name} response payload`);
  assert.equal(
    engine.gradeAnswer(restoredUi.question, restoredUi.responseState).correct,
    true,
    `${fixture.name} restored answer`,
  );
}

function assertLegacyCoordinateResponse(engine, make) {
  const coordinateRoute = make("MQ-125");
  const coordinateSpecification = engine.gridRouteSpecification(coordinateRoute);
  const legacyRouteSave = stateWithUi(engine, baseUi(coordinateRoute, {
    responseState: { moves: [], end: { x: 1, y: 1 } },
    modelTouched: true,
  }));
  const migratedRoute = engine.loadState(JSON.stringify(legacyRouteSave), 22_000);
  assert.equal(migratedRoute.ok, true, "legacy route response migrates");
  assert.equal(migratedRoute.migrated, true, "legacy route response reports migration");
  assert.deepEqual(
    clone(migratedRoute.state.activeSession.uiState.responseState),
    {
      moves: [],
      end: {
        x: coordinateSpecification.startX,
        y: coordinateSpecification.startY,
      },
    },
    "legacy route response restarts at the displayed origin",
  );
}

export function assertCompletedResponseRoundtrips(engine) {
  const make = (skillId) => findActiveQuestion(
    engine,
    (question) => question.skillId === skillId,
    { skillId },
  );
  const fixtures = [completedPatternFixture(engine, make), completedFactFamilyFixture(engine, make),
    ...["MQ-034", "MQ-125"].map(skillId => completedRouteFixture(engine, make, skillId))];
  for (const fixture of fixtures) {
    const saved = saveCompletedResponse(engine, fixture);
    assertSavedChoiceResolution(engine, fixture, saved);
    assertRestoredResponse(engine, fixture, saved);
  }
  assertLegacyCoordinateResponse(engine, make);
}

function regenerationContext(engine) {
  const question = findActiveQuestion(engine, (candidate) => (
    candidate.inputClass === "SELECTION"
    && candidate.options.length >= 2
    && candidate.options[0].label !== candidate.options[1].label
  ));
  const control = stateWithUi(engine, baseUi(question));
  assert.equal(engine.validateState(control), null, "canonical control question must validate");
  return { engine, question, control };
}

function assertReorderedQuestionLabels({ engine, control }) {
  const hostile = clone(control);
  const hostileOptions = hostile.activeSession.uiState.question.options;
  [
    hostileOptions[0].label,
    hostileOptions[1].label,
  ] = [
    hostileOptions[1].label,
    hostileOptions[0].label,
  ];
  assert.equal(
    engine.validateQuestionContract(hostile.activeSession.uiState.question).valid,
    true,
    "the structural contract alone should demonstrate why exact regeneration is required",
  );
  assert.equal(engine.validateState(hostile), "Invalid active session.");
  assert.equal(engine.loadState(JSON.stringify(hostile), 22_000).ok, false);
  const liveState = engine.createInitialState(22_000);
  const imported = engine.importState(liveState, JSON.stringify(hostile), 22_000);
  assert.equal(imported.ok, false);
  assert.equal(imported.state, liveState, "transactional import must preserve the live state");
}

function assertQuestionSeedBinding({ engine, question, control }) {
  const selfConsistentReplacement = engine.makeQuestion({
    skillId: question.skillId,
    tier: question.tier,
    representation: question.representation,
    seed: (question.seed + 1) >>> 0,
    ordinal: question.ordinal,
    eligibleQuestionOrdinal: question.eligibleQuestionOrdinal,
    scheduledReview: question.scheduledReview,
    coldTest: question.coldTest,
    preview: question.preview,
    theme: question.theme,
    scaffolded: question.scaffolded,
    reteachStep: question.reteachStep,
    capstone: question.capstone,
  });
  assert.equal(engine.validateQuestionContract(selfConsistentReplacement).valid, true);
  const substituted = clone(control);
  substituted.activeSession.uiState.question = clone(selfConsistentReplacement);
  assert.equal(
    engine.validateState(substituted),
    "Invalid active session.",
    "a canonical question from a different seed must not escape its queue/session binding",
  );
}

function assertQuestionChoiceBinding({ engine, question }) {
  const exactSlot = canonicalActiveSlot(
    engine,
    engine.SKILL_BY_ID[question.skillId],
    question.eligibleQuestionOrdinal,
  );
  assert.equal(exactSlot.choicePosition, true, "exact-binding coverage fixture must occupy a choice slot");
  const choices = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[question.skillId],
    question.eligibleQuestionOrdinal,
  );
  assert.equal(choices.length, 2, "coverage fixture requires a two-question pick");
  const pickState = stateWithUi(engine, baseUi(choices[0], {
    phase: "pick",
    choiceCandidates: clone(choices),
  }));
  assert.equal(engine.validateState(pickState), null, "canonical pick candidates must validate");
  const swappedPick = clone(pickState);
  swappedPick.activeSession.uiState.choiceCandidates.reverse();
  swappedPick.activeSession.uiState.question = clone(swappedPick.activeSession.uiState.choiceCandidates[0]);
  assert.equal(engine.validateState(swappedPick), "Invalid active session.", "pick order is deterministic");
  pickState.activeSession.uiState.choiceCandidates[1].prompt += " altered";
  assert.equal(engine.validateState(pickState), "Invalid active session.");
}

function assertQuestionLevelBinding({ engine }) {
  const futureQuestion = findActiveQuestion(
    engine,
    (candidate) => candidate.skillId === "MQ-126",
    { skillId: "MQ-126" },
  );
  const futureLevelSession = stateWithUi(engine, baseUi(futureQuestion));
  futureLevelSession.earnedLevel = engine.CONSTANTS.LEVEL_MIN;
  assert.equal(futureLevelSession.earnedLevel, engine.CONSTANTS.LEVEL_MIN);
  assert.equal(
    engine.validateState(futureLevelSession),
    "Invalid active session.",
    "ordinary work cannot claim a future active level",
  );
  const hiddenFutureQueue = clone(futureLevelSession);
  hiddenFutureQueue.activeSession.level = hiddenFutureQueue.earnedLevel;
  hiddenFutureQueue.activeSession.stage = engine.stageForLevel(hiddenFutureQueue.earnedLevel);
  assert.equal(
    engine.validateState(hiddenFutureQueue),
    "Invalid active session.",
    "a future skill cannot hide inside a current-level ordinary queue",
  );
  const previewQuestion = findActiveQuestion(
    engine,
    (candidate) => candidate.skillId === "MQ-001",
    { preview: true, skillId: "MQ-001" },
  );
  const crossLevelPreview = stateWithUi(engine, baseUi(previewQuestion));
  crossLevelPreview.previewLevel = engine.CONSTANTS.LEVEL_MAX;
  crossLevelPreview.activeSession.level = engine.CONSTANTS.LEVEL_MAX;
  crossLevelPreview.activeSession.stage = engine.stageForLevel(engine.CONSTANTS.LEVEL_MAX);
  assert.equal(
    engine.validateState(crossLevelPreview),
    "Invalid active session.",
    "a preview queue contains only skills from its selected level",
  );
}

export function assertSavedQuestionRegeneration(engine) {
  const context = regenerationContext(engine);
  assertReorderedQuestionLabels(context);
  assertQuestionSeedBinding(context);
  assertQuestionChoiceBinding(context);
  assertQuestionLevelBinding(context);
}

function bindingContext(t, engine) {
  const ordinaryQuestion = findActiveQuestion(
    engine,
    (question) => question.level === 1 && question.inputClass === "SELECTION",
  );
  const ordinary = stateWithUi(engine, baseUi(ordinaryQuestion));
  assert.equal(engine.validateState(ordinary), null, "ordinary binding control");
  const reject = async (label, state) => t.test(label, () => {
    assert.equal(engine.validateState(state), "Invalid active session.");
    assert.throws(() => engine.exportState(state), /Invalid active session/u);
  });
  return { engine, ordinaryQuestion, ordinary, reject };
}

async function assertOrdinaryQuestionBinding({ engine, ordinaryQuestion, ordinary, reject }) {
  const previewMismatch = clone(ordinary);
  previewMismatch.previewLevel = ordinary.activeSession.level;
  await reject("ACTIVE-BIND non-preview queue cannot resume as preview", previewMismatch);
  const levelMismatch = clone(ordinary);
  levelMismatch.earnedLevel = ordinary.activeSession.level + 2;
  await reject("ACTIVE-BIND session level cannot trail earned progress by two levels", levelMismatch);
  const endedOrdinary = clone(ordinary);
  endedOrdinary.activeSession.index = endedOrdinary.activeSession.queue.length;
  await reject("ACTIVE-BIND ordinary question cannot remain after queue end", endedOrdinary);
  const unexpectedCandidates = clone(ordinary);
  unexpectedCandidates.activeSession.uiState.choiceCandidates = [clone(ordinaryQuestion)];
  await reject("ACTIVE-BIND activated question cannot retain choice cards", unexpectedCandidates);
  const fatigue = stateWithUi(engine, baseUi(null, { screen: "fatigue" }));
  assert.equal(engine.validateState(fatigue), null, "question-free fatigue control");
  const fatigueWithCandidate = clone(fatigue);
  fatigueWithCandidate.activeSession.uiState.choiceCandidates = [clone(ordinaryQuestion)];
  await reject("ACTIVE-BIND question-free fatigue cannot retain a candidate", fatigueWithCandidate);
}

async function assertCapstoneQuestionBinding({ engine, ordinaryQuestion, reject }) {
  const capstoneQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: ordinaryQuestion.skillId,
    seed: ordinaryQuestion.seed,
    theme: ordinaryQuestion.theme,
  }, { kind: "capstone" });
  const capstone = stateWithUi(engine, baseUi(capstoneQuestion, { screen: "capstone" }));
  assert.equal(engine.validateState(capstone), null, "capstone binding control");
  for (const [label, change] of [
    ["reteach flag", (state) => { state.activeSession.uiState.isReteach = true; }],
    ["candidate cards", (state) => {
      state.activeSession.uiState.choiceCandidates = [clone(capstoneQuestion)];
    }],
    ["physical phase", (state) => { state.activeSession.uiState.phase = "physical"; }],
    ["submitted flag before feedback", (state) => {
      state.activeSession.uiState.capstoneSubmitted = true;
    }],
  ]) {
    const hostile = clone(capstone);
    change(hostile);
    await reject(`ACTIVE-BIND capstone rejects ${label}`, hostile);
  }
  const otherSkill = engine.SKILLS.find((skill) => (
    skill.skillId !== ordinaryQuestion.skillId
    && skill.level === ordinaryQuestion.level
  ));
  assert.ok(otherSkill, "same-level capstone mismatch fixture");
  const otherCapstone = makeSessionCheckpointQuestion(engine, {
    skillId: otherSkill.skillId,
    seed: ordinaryQuestion.seed,
    theme: ordinaryQuestion.theme,
  }, { kind: "capstone" });
  const wrongCapstone = clone(capstone);
  wrongCapstone.activeSession.uiState.question = clone(otherCapstone);
  await reject("ACTIVE-BIND capstone skill must match the completed queue", wrongCapstone);
  return { otherSkill };
}

async function assertReteachQuestionBinding({ engine, ordinaryQuestion, otherSkill, reject }) {
  const reteachQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: ordinaryQuestion.skillId,
    seed: ordinaryQuestion.seed,
    theme: ordinaryQuestion.theme,
  }, { kind: "reteach" });
  const reteach = stateWithUi(engine, baseUi(reteachQuestion, {
    phase: "reteach",
    isReteach: true,
  }));
  assert.equal(engine.validateState(reteach), null, "reteach binding control");
  const reteachFatigue = clone(reteach);
  reteachFatigue.activeSession.uiState.screen = "fatigue";
  await reject("ACTIVE-BIND reteach must remain on the session screen", reteachFatigue);
  const reteachCandidates = clone(reteach);
  reteachCandidates.activeSession.uiState.choiceCandidates = [clone(reteachQuestion)];
  await reject("ACTIVE-BIND reteach cannot retain choice cards", reteachCandidates);
  const wrongQueueReteach = clone(reteach);
  wrongQueueReteach.reteachQueue[0].skillId = otherSkill.skillId;
  await reject("ACTIVE-BIND reteach question must match the queue head", wrongQueueReteach);
  const laterReteachQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: ordinaryQuestion.skillId,
    seed: ordinaryQuestion.seed,
    theme: ordinaryQuestion.theme,
  }, { kind: "reteach", index: 1 });
  const wrongReteachOrdinal = clone(reteach);
  wrongReteachOrdinal.activeSession.uiState.question = clone(laterReteachQuestion);
  await reject("ACTIVE-BIND reteach ordinal must match the session index", wrongReteachOrdinal);
}

async function assertPickQuestionBinding({ engine, reject }) {
  const pickQuestion = findActiveQuestion(engine, (candidate, skill) => {
    const slot = canonicalActiveSlot(engine, skill, candidate.eligibleQuestionOrdinal);
    return slot.choicePosition
      && questionsForActiveSlot(engine, skill, candidate.eligibleQuestionOrdinal).length === 2;
  });
  const pickCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    pickQuestion.eligibleQuestionOrdinal,
  );
  const pick = stateWithUi(engine, baseUi(pickCandidates[0], {
    phase: "pick",
    choiceCandidates: clone(pickCandidates),
  }));
  assert.equal(engine.validateState(pick), null, "two-card pick control");
  const prematureResolution = clone(pick);
  prematureResolution.activeSession.uiState.choiceResolved[
    String(prematureResolution.activeSession.queue[prematureResolution.activeSession.index].ordinal)
  ] = 0;
  await reject("ACTIVE-BIND unresolved pick cannot claim a chosen variant", prematureResolution);
}

export async function registerSavedQuestionBindingTests(t, engine) {
  const context = bindingContext(t, engine);
  await assertOrdinaryQuestionBinding(context);
  const extended = { ...context, ...await assertCapstoneQuestionBinding(context) };
  await assertReteachQuestionBinding(extended);
  await assertPickQuestionBinding(context);
}
