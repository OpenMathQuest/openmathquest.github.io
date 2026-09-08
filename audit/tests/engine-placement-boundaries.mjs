// Exhaustive starting-point boundaries retained under the BND-10 result.
function createBoundaryFixtures({ engine, constants, createState, completePlacement }) {
  const state = createState(engine);
  const cases = [
    {
      name: "lowest",
      run: completePlacement(engine, state, () => false, { seed: 0x1001 }),
      count: 15,
      recommendedLevel: 1,
    },
    {
      name: "highest",
      run: completePlacement(engine, state, () => true, { seed: 0x1002 }),
      count: 18,
      recommendedLevel: constants.LEVEL_MAX,
    },
    {
      name: "middle boundary",
      run: completePlacement(engine, state, (question) => (
        question.level < 11
      ), { seed: 0x1003 }),
      count: 15,
      recommendedLevel: 11,
    },
    {
      name: "isolated first-answer mistake recovers",
      run: completePlacement(engine, state, (_question, index) => index !== 0, { seed: 0x1004 }),
      count: 18,
      recommendedLevel: constants.LEVEL_MAX,
      completedThrough: constants.PLACEMENT_SEARCH_LEVEL_MAX,
    },
    {
      name: "highest verification fallback",
      run: completePlacement(engine, state, (_question, index) => index < 15, { seed: 0x1006 }),
      count: 18,
      recommendedLevel: 20,
      completedThrough: 19,
    },
    {
      name: "floor verification independently recovers",
      run: completePlacement(engine, state, (question, index) => question.level === 1 && index >= 11, { seed: 0x1008 }),
      count: 15,
      recommendedLevel: 2,
      completedThrough: 1,
    },
  ];
  return { state, cases };
}

function assertNamedBoundaries({ engine, assert, constants, cloneJson, state, cases }) {
  for (const fixture of cases) {
    const validation = engine.validatePlacementRun(fixture.run, state);
    const recommendation = engine.placementRecommendation(fixture.run);
    assert.equal(validation.valid, true, `${fixture.name}: ${validation.error}`);
    assert.equal(validation.complete, true, fixture.name);
    assert.equal(validation.questionCount, fixture.count, fixture.name);
    assert.equal(recommendation.questionCount, fixture.count, fixture.name);
    assert.equal(recommendation.recommendedLevel, fixture.recommendedLevel, fixture.name);
    if (fixture.completedThrough !== undefined) {
      assert.equal(recommendation.completedThrough, fixture.completedThrough, fixture.name);
    }
    assert.ok(fixture.count >= constants.PLACEMENT_MIN_QUESTIONS, fixture.name);
    assert.ok(fixture.count <= constants.PLACEMENT_MAX_QUESTIONS, fixture.name);
    assert.equal(new Set(fixture.run.answers.map((answer) => answer.questionId)).size, fixture.run.answers.length, fixture.name);
    const replay = { ...cloneJson(fixture.run), answers: [] };
    const signatures = [];
    for (const answer of fixture.run.answers) {
      const question = engine.placementCurrentQuestion(replay);
      signatures.push(engine.placementVisibleTaskSignature(question));
      replay.answers.push(cloneJson(answer));
    }
    assert.equal(
      new Set(signatures).size,
      signatures.length,
      `${fixture.name} cannot repeat a semantically identical visible task`,
    );
  }
}

function assertAllRecommendations({ engine, assert, constants, completePlacement, state }) {
  const checkpointVoteShapes = [
    {
      name: "threshold with one incorrect vote",
      response(intendedPass, position) {
        return intendedPass ? position !== 2 : position === 2;
      },
    },
    {
      name: "threshold with an explicit Not sure vote",
      response(intendedPass, position) {
        if (position === 0) return intendedPass;
        if (position === 1) return "not-sure";
        return true;
      },
    },
  ];
  const exhaustiveRecommendationCounts = new Map();
  const exhaustiveQuestionCounts = new Set();
  let exhaustiveRouteCount = 0;
  for (let desiredLevel = constants.LEVEL_MIN; desiredLevel <= constants.LEVEL_MAX; desiredLevel += 1) {
    for (let shapeIndex = 0; shapeIndex < checkpointVoteShapes.length; shapeIndex += 1) {
      const shape = checkpointVoteShapes[shapeIndex];
      const seed = 0x2000 + desiredLevel * 2 + shapeIndex;
      const policy = (question, index) => shape.response(question.level < desiredLevel, index % 3);
      const firstRun = completePlacement(engine, state, policy, { seed });
      const repeatedRun = completePlacement(engine, state, policy, { seed });
      const recommendation = engine.placementRecommendation(firstRun);
      const routeLabel = `level ${desiredLevel}, ${shape.name}`;
      exhaustiveRouteCount += 1;
      exhaustiveRecommendationCounts.set(
        recommendation.recommendedLevel,
        (exhaustiveRecommendationCounts.get(recommendation.recommendedLevel) || 0) + 1,
      );
      exhaustiveQuestionCounts.add(recommendation.questionCount);
      assert.equal(recommendation.recommendedLevel, desiredLevel, routeLabel);
      assert.ok([15, 18].includes(recommendation.questionCount), `${routeLabel}: ${recommendation.questionCount} questions`);
      assert.equal(engine.canonical(firstRun), engine.canonical(repeatedRun), `${routeLabel}: deterministic replay`);
    }
  }
  assert.equal(exhaustiveRouteCount, 42);
  assert.deepEqual([...exhaustiveQuestionCounts].sort((left, right) => left - right), [15, 18]);
  assert.deepEqual(
    [...exhaustiveRecommendationCounts.keys()].sort((left, right) => left - right),
    Array.from(
      { length: constants.LEVEL_MAX - constants.LEVEL_MIN + 1 },
      (_, index) => index + constants.LEVEL_MIN,
    ),
    "all 21 starting recommendations are reachable",
  );
  assert.ok(
    [...exhaustiveRecommendationCounts.values()].every((count) => count === checkpointVoteShapes.length),
    "each starting recommendation is reached by both checkpoint vote shapes",
  );
}

function assertSingleFaultRecovery({ engine, assert, constants, completePlacement, state }) {
  const allSuccess = completePlacement(engine, state, () => true, { seed: 0x2fff });
  assert.equal(allSuccess.answers.length, 18, "the all-success route has six three-question groups");
  for (let faultPosition = 0; faultPosition < allSuccess.answers.length; faultPosition += 1) {
    for (const responseKind of ["incorrect", "not-sure"]) {
      const recoverable = completePlacement(engine, state, (_question, index) => {
        if (index !== faultPosition) return true;
        return responseKind === "not-sure" ? "not-sure" : false;
      }, { seed: 0x3000 + faultPosition * 2 + (responseKind === "not-sure" ? 1 : 0) });
      const recommendation = engine.placementRecommendation(recoverable);
      assert.equal(
        recommendation.recommendedLevel,
        constants.LEVEL_MAX,
        `${responseKind} at all-success position ${faultPosition + 1} remains recoverable`,
      );
      assert.equal(recommendation.completedThrough, constants.PLACEMENT_SEARCH_LEVEL_MAX);
      assert.equal(recommendation.questionCount, 18);
      assert.equal(recommendation.responseCounts[responseKind === "not-sure" ? "notSure" : "incorrect"], 1);
    }
  }
}

function assertPlacementMethods({ engine, assert, constants, completePlacement, state }) {
  const expectedPlacementMethods = [
    "ACTION_SCENE", "BAR_MODEL", "BOND_SPLIT", "CLOCK_READ", "COIN_BUILD",
    "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY", "FRACTION_ENTRY",
    "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
    "LANDMARK_PLACE", "MEASURE_OBJECT", "MIXED_NUMBER_ENTRY", "NUMBER_LINE",
    "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
    "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
    "TEN_FRAME",
  ];
  const placementMethods = new Set();
  for (let desiredLevel = constants.LEVEL_MIN; desiredLevel <= constants.LEVEL_MAX; desiredLevel += 1) {
    const traversed = completePlacement(engine, state, (question) => {
      placementMethods.add(question.inputMethod);
      return question.level < desiredLevel ? true : "not-sure";
    }, { seed: state.seed });
    assert.equal(engine.placementRecommendation(traversed).recommendedLevel, desiredLevel);
  }
  assert.deepEqual(
    [...placementMethods].sort(),
    expectedPlacementMethods,
    "adaptive placement exposes exactly the 28 governed child input methods",
  );
}

function assertCheckpointDiversity({ engine, assert, skills, constants, recordPlacementResult, state }) {
  let diverseRun = engine.createPlacementRun({ state, playDay: state.maxSeenPlayDay, seed: 0x1009, theme: "ocean" });
  const expectedHighestRoute = [10, 15, 18, 19, 20];
  for (const level of expectedHighestRoute) {
    const checkpointQuestions = [];
    for (let position = 0; position < constants.PLACEMENT_CHECKPOINT_SIZE; position += 1) {
      const checkpoint = engine.placementCurrentQuestion(diverseRun);
      assert.equal(checkpoint.level, level);
      checkpointQuestions.push(checkpoint);
      diverseRun = recordPlacementResult(engine, diverseRun, true);
    }
    const levelStrands = new Set(skills.filter((skill) => skill.level === level).map((skill) => skill.strand));
    if (levelStrands.size > 1) {
      assert.notEqual(
        engine.SKILL_BY_ID[checkpointQuestions[0].skillId].strand,
        engine.SKILL_BY_ID[checkpointQuestions[1].skillId].strand,
        `level ${level} checkpoint strands`,
      );
    }
  }
}

function assertInvalidSequences({ engine, assert, cloneJson, state, cases }) {
  const initial = engine.createPlacementRun({ state, playDay: state.maxSeenPlayDay, seed: 0x1005, theme: "space" });
  assert.equal(engine.placementRecommendation(initial), null);
  const first = engine.placementCurrentQuestion(initial);
  assert.equal(first.preview, true);
  assert.equal(first.tier, "HARD/TARGET");
  const wrongSequence = {
    ...cloneJson(initial),
    answers: [{ questionId: `${first.questionId}-wrong`, responseKind: "correct" }],
  };
  assert.equal(engine.validatePlacementRun(wrongSequence, state).valid, false);
  const overflow = {
    ...cloneJson(cases[0].run),
    answers: [...cloneJson(cases[0].run.answers), { questionId: "after-complete", responseKind: "correct" }],
  };
  assert.equal(engine.validatePlacementRun(overflow, state).valid, false);
}

export function assertPlacementBoundaries(context) {
  context = { ...context, ...createBoundaryFixtures(context) };
  assertNamedBoundaries(context);
  assertAllRecommendations(context);
  assertSingleFaultRecovery(context);
  assertPlacementMethods(context);
  assertCheckpointDiversity(context);
  assertInvalidSequences(context);
}
