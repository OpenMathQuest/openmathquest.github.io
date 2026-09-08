// Behavioral Free Play checks; state progression remains ordered within BEH-30.
function initialUnlocks({ engine, assert, createState, appliedState, attemptFor, state }) {
  state.fresh = createState(engine);
  state.before = engine.exportState(state.fresh);
  assert.ok(engine.playgroundCatalog(state.fresh).every((activity) => activity.unlocked === false));
  
  state.fresh.skills["MQ-010"].acquisition = "LEARNING";
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").unlocked, false);
  state.fresh.skills["MQ-010"].acquisition = "PLACED";
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").unlocked, false);
  state.fresh.skills["MQ-010"].acquisition = "UNSEEN";
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-010"]));
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").unlocked, true);
  assert.deepEqual([...engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").tools], ["COUNTERS"]);
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "BALANCE_BAY").unlocked, false);
}

function counterConstruction({ engine, assert, state }) {
  const many = engine.makePlaygroundRound({ state: state.fresh, activityId: "MANY_WAYS", mode: "SOLO", seed: 17, roundNumber: 0 });
  assert.deepEqual(many, engine.makePlaygroundRound({ state: state.fresh, activityId: "MANY_WAYS", mode: "SOLO", seed: 17, roundNumber: 0 }));
  assert.equal(many.sourceKind, "NUMERAL");
  assert.equal(many.buildKind, "COUNTERS");
  const exactCells = Array.from({ length: many.maxValue }, (_, index) => index < many.target);
  const exactGrade = engine.gradePlaygroundConstruction(many, { cells: exactCells });
  assert.equal(exactGrade.valid, true);
  assert.equal(exactGrade.correct, true);
  assert.equal(exactGrade.reason, null);
  assert.equal(exactGrade.actual, many.target);
  assert.equal(exactGrade.target, many.target);
  assert.equal(exactGrade.comparison, "EQUAL");
  assert.equal(exactGrade.mathematicallyEqual, true);
  const adjacentCount = many.target === many.maxValue ? many.target - 1 : many.target + 1;
  const adjacentCells = Array.from({ length: many.maxValue }, (_, index) => index < adjacentCount);
  const adjacentGrade = engine.gradePlaygroundConstruction(many, { cells: adjacentCells });
  assert.equal(adjacentGrade.correct, false);
  assert.equal(adjacentGrade.mathematicallyEqual, false);
}

function partsUnlock({ engine, assert, appliedState, attemptFor, state }) {
  for (const acquisition of ["LEARNING", "PLACED"]) {
    const candidate = structuredClone(state.fresh);
    candidate.skills["MQ-011"].acquisition = acquisition;
    const candidateTools = engine.playgroundCatalog(candidate)
      .find((activity) => activity.activityId === "MANY_WAYS").tools;
    assert.ok(!candidateTools.includes("PARTS"));
  }
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-011"]));
  assert.deepEqual([...engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").tools], ["COUNTERS", "PARTS"]);
  const partRound = Array.from({ length: 32 }, (_, seed) => engine.makePlaygroundRound({ state: state.fresh, activityId: "MANY_WAYS", mode: "SOLO", seed })).find((round) => round.buildKind === "PARTS");
  assert.ok(partRound);
  assert.equal(engine.gradePlaygroundConstruction(partRound, { left: 0, right: partRound.target }).valid, false);
  assert.equal(engine.gradePlaygroundConstruction(partRound, { left: 1, right: partRound.target - 1 }).correct, true);
}

function expandedToolUnlocks({ engine, assert, appliedState, attemptFor, state }) {
  const toolGate = (skillId, acquisition) => {
    const candidate = structuredClone(state.fresh);
    candidate.skills[skillId].acquisition = acquisition;
    return engine.playgroundCatalog(candidate).find((activity) => activity.activityId === "MANY_WAYS");
  };
  assert.equal(toolGate("MQ-019", "LEARNING").maxValue, 5);
  assert.equal(toolGate("MQ-019", "PLACED").maxValue, 5);
  assert.ok(!toolGate("MQ-020", "LEARNING").tools.includes("FIVE_FRAME_SOURCE"));
  assert.ok(!toolGate("MQ-020", "PLACED").tools.includes("FIVE_FRAME_SOURCE"));
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-019"]));
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").maxValue, 10);
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-020"]));
  assert.ok(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "MANY_WAYS").tools.includes("FIVE_FRAME_SOURCE"));
}

function sourceAndPartsRanges({ engine, assert, state }) {
  const sourceKinds = new Set();
  for (let seed = 0; seed < 256; seed += 1) {
    const round = engine.makePlaygroundRound({ state: state.fresh, activityId: "MANY_WAYS", mode: "SOLO", seed });
    sourceKinds.add(round.sourceKind);
    if (round.sourceKind === "FIVE_FRAME") {
      assert.ok(round.target >= 1 && round.target <= 5);
      assert.ok(round.targetChoices.every((value) => value >= 1 && value <= 5));
    } else {
      assert.ok(round.target >= 0 && round.target <= 10);
    }
  }
  assert.deepEqual([...sourceKinds].sort(), ["FIVE_FRAME", "NUMERAL"]);
  const prePartsRange = Array.from({ length: 256 }, (_, seed) => engine.makePlaygroundRound({
    state: state.fresh,
    activityId: "MANY_WAYS",
    mode: "SOLO",
    seed,
  })).filter((round) => round.buildKind === "PARTS" && round.sourceKind === "NUMERAL");
  assert.ok(prePartsRange.length > 0);
  assert.ok(prePartsRange.every((round) => round.maxValue === 5 && round.targetChoices.every((value) => value <= 5)));
}

function balanceAcquisitionGate({ engine, assert, createState }) {
  const balanceGateState = (skill021, skill023) => {
    const candidate = createState(engine);
    candidate.skills["MQ-021"].acquisition = skill021;
    candidate.skills["MQ-023"].acquisition = skill023;
    return engine.playgroundCatalog(candidate).find((activity) => activity.activityId === "BALANCE_BAY").unlocked;
  };
  assert.equal(balanceGateState("PRACTISING", "UNSEEN"), false);
  assert.equal(balanceGateState("UNSEEN", "PRACTISING"), false);
  assert.equal(balanceGateState("LEARNING", "PRACTISING"), false);
  assert.equal(balanceGateState("PLACED", "PRACTISING"), false);
  assert.equal(balanceGateState("PRACTISING", "LEARNING"), false);
  assert.equal(balanceGateState("PRACTISING", "PLACED"), false);
  assert.equal(balanceGateState("PRACTISING", "PRACTISING"), true);
  assert.equal(balanceGateState("SOLID", "SOLID"), true);
}

function expandedPartsAndBalance({ engine, assert, appliedState, attemptFor, state }) {
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-023"]));
  const postPartsRange = Array.from({ length: 256 }, (_, seed) => engine.makePlaygroundRound({
    state: state.fresh,
    activityId: "MANY_WAYS",
    mode: "SOLO",
    seed,
  })).filter((round) => round.buildKind === "PARTS" && round.sourceKind === "NUMERAL");
  assert.ok(postPartsRange.length > 0);
  assert.ok(postPartsRange.every((round) => round.maxValue === 10));
  assert.ok(postPartsRange.some((round) => round.target > 5 || round.targetChoices.some((value) => value > 5)));
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "BALANCE_BAY").unlocked, false);
  state.fresh = appliedState(engine, state.fresh, attemptFor(engine, engine.SKILL_BY_ID["MQ-021"]));
  assert.equal(engine.playgroundCatalog(state.fresh).find((activity) => activity.activityId === "BALANCE_BAY").unlocked, true);
}

function balanceConstruction({ engine, assert, state }) {
  for (let seed = 0; seed < 64; seed += 1) {
    const balance = engine.makePlaygroundRound({ state: state.fresh, activityId: "BALANCE_BAY", mode: "FAMILY", seed, roundNumber: seed });
    assert.ok(balance.targetChoices.every((value) => value >= 3 && value <= 10));
    const target = balance.targetChoices[0];
    const duplicate = engine.gradePlaygroundConstruction(balance, { target, pieces: Array(target).fill(1) });
    assert.equal(duplicate.valid, true);
    assert.equal(duplicate.correct, false);
    assert.equal(duplicate.comparison, "DIFFERENT_WAY_NEEDED");
    assert.equal(duplicate.mathematicallyEqual, true);
    const distinct = engine.gradePlaygroundConstruction(balance, { target, pieces: [2, ...Array(target - 2).fill(1)] });
    assert.equal(distinct.correct, true);
    assert.equal(distinct.mathematicallyEqual, true);
    assert.equal(engine.gradePlaygroundConstruction(balance, { target, pieces: [3] }).valid, false);
    assert.equal(balance.makerRole, seed % 2 === 1 ? "GROWN_UP" : "CHILD");
  }
  assert.notEqual(engine.exportState(state.fresh), state.before);
}

function isolatedFreePlay({ engine, assert, createState, appliedState, attemptFor }) {
  let isolated = createState(engine);
  isolated = appliedState(engine, isolated, attemptFor(engine, engine.SKILL_BY_ID["MQ-010"]));
  const isolatedBefore = engine.exportState(isolated);
  const isolatedRound = engine.makePlaygroundRound({ state: isolated, activityId: "MANY_WAYS", mode: "FAMILY", seed: 99 });
  engine.gradePlaygroundConstruction(isolatedRound, { target: isolatedRound.targetChoices[0], cells: Array(isolatedRound.maxValue).fill(false) });
  assert.equal(engine.exportState(isolated), isolatedBefore);
}

export function assertFreePlayBehavior(engine, assert, fixtures) {
  const context = { engine, assert, ...fixtures, state: {} };
  initialUnlocks(context);
  counterConstruction(context);
  partsUnlock(context);
  expandedToolUnlocks(context);
  sourceAndPartsRanges(context);
  balanceAcquisitionGate(context);
  expandedPartsAndBalance(context);
  balanceConstruction(context);
  isolatedFreePlay(context);
}
