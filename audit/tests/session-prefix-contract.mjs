import assert from "node:assert/strict";
import { cloneJson as clone } from "../lib/test-harness.mjs";
import { baseUi, stateWithUi, findActiveQuestion, canonicalActiveSlot, questionsForActiveSlot, choiceResolutionsForActivated, makeSessionCheckpointQuestion } from "./session-fixtures.mjs";

function prefixContext(t, engine) {
  const question = findActiveQuestion(
    engine,
    (candidate) => candidate.eligibleQuestionOrdinal === 1,
  );
  const ordinary = stateWithUi(engine, baseUi(question));
  assert.deepEqual(ordinary.activeSession.servedOrdinals, [0, 1]);
  assert.equal(engine.validateState(ordinary), null, "ordinary current question control");
  const reject = async (name, state) => t.test(name, () => {
    assert.equal(engine.validateState(state), "Invalid active session.");
    assert.equal(engine.loadState(JSON.stringify(state), 22_000).ok, false);
  });
  return { engine, question, ordinary, reject };
}

async function assertOrdinaryPrefix({ engine, ordinary, reject }) {
  const undercounted = clone(ordinary);
  undercounted.activeSession.servedCount = 1;
  undercounted.activeSession.servedOrdinals = [0];
  await reject("SERVE-PREFIX ordinary current slot cannot be omitted", undercounted);
  const live = engine.createInitialState(22_000);
  const imported = engine.importState(live, JSON.stringify(undercounted), 22_000);
  assert.equal(imported.ok, false);
  assert.equal(imported.state, live, "hostile served undercount must not replace live progress");
  const reordered = clone(ordinary);
  reordered.activeSession.servedOrdinals = [1, 0];
  await reject("SERVE-PREFIX served slots cannot be reordered", reordered);
}

function choiceContext(engine) {
  const pickQuestion = findActiveQuestion(engine, (candidate, skill) => {
    const index = candidate.eligibleQuestionOrdinal;
    return index > 0
      && canonicalActiveSlot(engine, skill, index).choicePosition
      && questionsForActiveSlot(engine, skill, index).length === 2;
  });
  const pickIndex = pickQuestion.eligibleQuestionOrdinal;
  const pickCandidates = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    pickIndex,
  );
  return { pickQuestion, pickIndex, pickCandidates };
}

async function assertUnresolvedPick({ engine, pickCandidates, pickIndex, reject }) {
  const pick = stateWithUi(engine, baseUi(pickCandidates[0], {
    phase: "pick",
    choiceCandidates: clone(pickCandidates),
  }));
  assert.equal(pick.activeSession.servedCount, pickIndex);
  assert.deepEqual(
    pick.activeSession.servedOrdinals,
    pick.activeSession.queue.slice(0, pickIndex).map((slot) => slot.ordinal),
  );
  assert.equal(engine.validateState(pick), null, "pick control stops before the unactivated current slot");
  const preResolvedPick = clone(pick);
  preResolvedPick.activeSession.uiState.choiceResolved[
    String(preResolvedPick.activeSession.queue[pickIndex].ordinal)
  ] = 0;
  await reject("CHOICE-EXACT unresolved pick cannot pre-resolve its current slot", preResolvedPick);
  const pickOvercount = clone(pick);
  pickOvercount.activeSession.servedCount += 1;
  pickOvercount.activeSession.servedOrdinals.push(pick.activeSession.queue[pickIndex].ordinal);
  await reject("SERVE-PREFIX pick cannot count an unactivated choice slot", pickOvercount);
}

async function assertActivatedChoice({ engine, pickCandidates, pickIndex, pickQuestion, reject }) {
  const activatedChoice = stateWithUi(engine, baseUi(pickCandidates[1]));
  const activatedKey = String(activatedChoice.activeSession.queue[pickIndex].ordinal);
  assert.equal(activatedChoice.activeSession.uiState.choiceResolved[activatedKey], 1);
  assert.equal(engine.validateState(activatedChoice), null, "activated two-candidate choice control");
  const missingActivatedResolution = clone(activatedChoice);
  delete missingActivatedResolution.activeSession.uiState.choiceResolved[activatedKey];
  await reject("CHOICE-EXACT activated two-candidate slot cannot lose its resolution", missingActivatedResolution);
  const followingIndex = pickIndex + 1;
  const followingQuestion = questionsForActiveSlot(
    engine,
    engine.SKILL_BY_ID[pickQuestion.skillId],
    followingIndex,
  )[0];
  const afterChoice = stateWithUi(engine, baseUi(followingQuestion));
  assert.equal(afterChoice.activeSession.uiState.choiceResolved[activatedKey], 0);
  assert.equal(engine.validateState(afterChoice), null, "past two-candidate choice control");
  const missingPastResolution = clone(afterChoice);
  delete missingPastResolution.activeSession.uiState.choiceResolved[activatedKey];
  await reject("CHOICE-EXACT past two-candidate slot cannot lose its resolution", missingPastResolution);
}

async function assertFutureChoice({ engine, pickQuestion, pickIndex, reject }) {
  const futureSkill = engine.SKILL_BY_ID[pickQuestion.skillId];
  const futureIndex = pickIndex;
  const futureQueue = Array.from(
    { length: futureIndex + 1 },
    (_, index) => canonicalActiveSlot(engine, futureSkill, index),
  );
  const firstSlot = futureQueue[0];
  const firstQuestion = questionsForActiveSlot(engine, futureSkill, 0)[0];
  const futureRoot = stateWithUi(engine, baseUi(firstQuestion));
  futureRoot.activeSession.queue = futureQueue;
  futureRoot.activeSession.baseSlotCount = futureQueue.length;
  futureRoot.activeSession.effectivePracticeLimit = futureQueue.length;
  futureRoot.activeSession.effectivePlannedCount = futureQueue.length;
  futureRoot.activeSession.index = 0;
  futureRoot.activeSession.servedCount = 1;
  futureRoot.activeSession.servedOrdinals = [firstSlot.ordinal];
  futureRoot.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    futureRoot.activeSession,
    1,
  );
  assert.equal(engine.validateState(futureRoot), null, "full-queue future-resolution control");
  const futurePair = futureQueue[futureIndex];
  assert.ok(futurePair, "fixture needs an unactivated future two-candidate choice slot");
  const preResolvedFuture = clone(futureRoot);
  preResolvedFuture.activeSession.uiState.choiceResolved[String(futurePair.ordinal)] = 0;
  await reject("CHOICE-EXACT future two-candidate slot cannot be pre-resolved", preResolvedFuture);
}

async function assertFatiguePrefix({ engine, reject }) {
  const selection = findActiveQuestion(
    engine,
    (candidate) => candidate.eligibleQuestionOrdinal === 1 && candidate.inputClass === "SELECTION",
  );
  const selected = selection.options[selection.correctIndex].optionId;
  const attempt = engine.submitAnswer(
    selection,
    { optionId: selected },
    {
      promptFinishedAt: 1_000,
      submittedAt: 4_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      sessionId: "coverage-session",
      playDay: 22_000,
    },
  );
  const line = engine.feedbackLine(attempt, selection.eligibleQuestionOrdinal, []);
  let fatigue = stateWithUi(engine, baseUi(selection, {
    screen: "fatigue",
    phase: "feedback",
    selected,
    feedback: line,
    lastAttempt: attempt,
  }));
  fatigue = engine.applyAttempt(fatigue, attempt).state;
  fatigue.feedbackHistory.push({
    stage: attempt.stage,
    branch: attempt.feedbackClass,
    line,
    sessionId: attempt.sessionId,
    playDay: attempt.playDay,
    recordId: attempt.recordId,
    questionId: attempt.questionId,
  });
  assert.equal(engine.validateState(fatigue), null, "fatigue control retains the current served slot");
  const fatigueUndercount = clone(fatigue);
  fatigueUndercount.activeSession.servedCount -= 1;
  fatigueUndercount.activeSession.servedOrdinals.pop();
  await reject("SERVE-PREFIX fatigue cannot forget its triggering slot", fatigueUndercount);
}

async function assertReteachPrefix({ engine, question, ordinary, reject }) {
  const reteachQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: question.skillId,
    seed: ordinary.activeSession.seed,
    theme: ordinary.activeSession.world,
  }, { kind: "reteach", index: ordinary.activeSession.index });
  const initialReteach = clone(ordinary);
  initialReteach.reteachQueue = [{
    skillId: question.skillId,
    reason: "SAME_SESSION",
    sessionId: initialReteach.activeSession.sessionId,
    recordId: "served-prefix-reteach",
    playDay: 22_000,
  }];
  initialReteach.activeSession.servedCount = initialReteach.activeSession.index;
  initialReteach.activeSession.servedOrdinals = initialReteach.activeSession.queue
    .slice(0, initialReteach.activeSession.index)
    .map((slot) => slot.ordinal);
  initialReteach.activeSession.uiState = baseUi(reteachQuestion, {
    phase: "reteach",
    isReteach: true,
    reteachAdvancesIndex: false,
    choiceResolved: choiceResolutionsForActivated(
      engine,
      initialReteach.activeSession,
      initialReteach.activeSession.servedCount,
    ),
  });
  assert.equal(engine.validateState(initialReteach), null, "initial queued reteach precedes current activation");
  const triggeredReteach = clone(initialReteach);
  triggeredReteach.activeSession.uiState.reteachAdvancesIndex = true;
  triggeredReteach.activeSession.servedCount += 1;
  triggeredReteach.activeSession.servedOrdinals.push(
    triggeredReteach.activeSession.queue[triggeredReteach.activeSession.index].ordinal,
  );
  triggeredReteach.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    triggeredReteach.activeSession,
    triggeredReteach.activeSession.servedCount,
  );
  assert.equal(engine.validateState(triggeredReteach), null, "triggered reteach follows current activation");
  const mismatchedReteach = clone(triggeredReteach);
  mismatchedReteach.activeSession.servedCount -= 1;
  mismatchedReteach.activeSession.servedOrdinals.pop();
  await reject("SERVE-PREFIX triggered reteach cannot claim initial-reteach progress", mismatchedReteach);
}

async function assertCapstonePrefix({ engine, ordinary, reject }) {
  const currentSlot = ordinary.activeSession.queue[ordinary.activeSession.index];
  const capstoneQuestion = makeSessionCheckpointQuestion(engine, {
    skillId: currentSlot.skillId,
    seed: ordinary.activeSession.seed,
    theme: ordinary.activeSession.world,
  }, { kind: "capstone" });
  const capstoneAfterActivation = clone(ordinary);
  capstoneAfterActivation.activeSession.uiState = baseUi(capstoneQuestion, {
    screen: "capstone",
    choiceResolved: choiceResolutionsForActivated(
      engine,
      capstoneAfterActivation.activeSession,
      capstoneAfterActivation.activeSession.servedCount,
    ),
  });
  assert.equal(engine.validateState(capstoneAfterActivation), null, "capstone after current activation");
  const capstoneBeforeActivation = clone(capstoneAfterActivation);
  capstoneBeforeActivation.activeSession.servedCount -= 1;
  capstoneBeforeActivation.activeSession.servedOrdinals.pop();
  capstoneBeforeActivation.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    capstoneBeforeActivation.activeSession,
    capstoneBeforeActivation.activeSession.servedCount,
  );
  assert.equal(engine.validateState(capstoneBeforeActivation), null, "capstone before current activation");
  const impossibleCapstone = clone(capstoneBeforeActivation);
  impossibleCapstone.activeSession.servedCount -= 1;
  impossibleCapstone.activeSession.servedOrdinals.pop();
  impossibleCapstone.activeSession.uiState.choiceResolved = choiceResolutionsForActivated(
    engine,
    impossibleCapstone.activeSession,
    impossibleCapstone.activeSession.servedCount,
  );
  await reject("SERVE-PREFIX capstone cannot omit an earlier activated prefix", impossibleCapstone);
}

export async function assertSessionPrefixContracts(t, engine) {
  const context = prefixContext(t, engine);
  await assertOrdinaryPrefix(context);
  const choices = { ...context, ...choiceContext(engine) };
  await assertUnresolvedPick(choices);
  await assertActivatedChoice(choices);
  await assertFutureChoice(choices);
  await assertFatiguePrefix(context);
  await assertReteachPrefix(context);
  await assertCapstonePrefix(context);
}
