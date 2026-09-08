// Ordered boundary checks executed by the shared engine audit harness.
export const boundaryChecks = Object.freeze([
  {
    id: "BND-01",
    title: "7/12 activates level re-teaching; 8/12 does not",
    effect: "Changing the inclusive seven-clean boundary fails",
    run(assert, { attemptFor, constants, engine, firstSkill }) {
      const skill = firstSkill();
      const cold = (clean) => Array.from({ length: 12 }, (_, index) => ({
        ...attemptFor(engine, skill, {
          ordinal: index,
          playDay: 21_000 + index,
          coldTest: true,
          feedbackClass: index < clean ? "FIRST_TRY_CLEAN" : "INCORRECT",
          firstAnswerCorrect: index < clean,
        }),
      }));
      assert.equal(engine.evaluateLevelReteaching({ coldTests: cold(7), currentLevel: skill.level }).active, true);
      assert.equal(engine.evaluateLevelReteaching({ coldTests: cold(8), currentLevel: skill.level }).active, false);
      assert.equal(constants.LEVEL_RETEACH_WINDOW, 12);
      assert.equal(constants.LEVEL_RETEACH_MAX_CLEAN, 7);
    },
  },
  {
    id: "BND-02",
    title: "Promotion checks exact 0.80 and every gateway",
    effect: "A non-solid gateway defeats an otherwise sufficient solid ratio",
    run(assert, { constants, engine, promotionFixtureLevel, promotionState, skills }) {
      const level = promotionFixtureLevel(skills);
      const eligible = promotionState(engine, skills, level, true);
      const blocked = promotionState(engine, skills, level, false);
      assert.equal(constants.PROMOTION_SOLID_RATIO, 0.8);
      assert.equal(engine.evaluatePromotion({ state: eligible, currentLevel: level }).promote, true);
      assert.equal(engine.evaluatePromotion({ state: blocked, currentLevel: level }).promote, false);
    },
  },
  {
    id: "BND-03",
    title: "Selection debounce is inclusive at 600 ms",
    effect: "599 ms is unchanged; 600 ms is deliberate change",
    run(assert, { constants, correctOption, engine, selectionFixture, skills }) {
      const { question } = selectionFixture(engine, skills, (candidate) => candidate.options.length >= 2);
      const correct = correctOption(engine, question);
      const other = question.options.find((option) => option.optionId !== correct.optionId);
      const submit = (delta) => engine.submitAnswer(question, { optionId: correct.optionId }, {
        promptFinishedAt: 0,
        submittedAt: 2_000,
        manipulationMs: 0,
        replayMs: 0,
        idleMs: 0,
        selectionEvents: [{ optionId: other.optionId, at: 1_000 }, { optionId: correct.optionId, at: 1_000 + delta }],
      });
      assert.equal(submit(599).changed, false);
      assert.equal(submit(600).changed, true);
      assert.equal(constants.SELECTION_DEBOUNCE_MS, 600);
    },
  },
  {
    id: "BND-04",
    title: "Every spacing transition, reset, final repeat, and overdue case is exact",
    effect: "Any interval index or date transition mismatch fails",
    run(assert, { attemptFor, constants, createState, engine, firstSkill }) {
      const intervals = [1, 1, 2, 4, 7, 12];
      assert.deepEqual([...constants.SPACING_INTERVAL_DAYS], intervals);
      const skill = firstSkill();
      for (let index = 0; index < intervals.length; index += 1) {
        const state = createState(engine);
        Object.assign(state.skills[skill.id], { acquisition: "PRACTISING", intervalIndex: index, dueDay: 20_000 });
        const record = engine.applyAttempt(state, attemptFor(engine, skill, { ordinal: index, scheduledReview: true, playDay: 20_005 })).state.skills[skill.id];
        const expectedIndex = Math.min(index + 1, intervals.length - 1);
        assert.equal(record.intervalIndex, expectedIndex);
        assert.equal(record.dueDay, 20_005 + intervals[expectedIndex]);
      }
      const resetState = createState(engine);
      Object.assign(resetState.skills[skill.id], { acquisition: "PRACTISING", intervalIndex: 4, dueDay: 20_000 });
      const reset = engine.applyAttempt(resetState, attemptFor(engine, skill, { scheduledReview: true, playDay: 20_005, feedbackClass: "INCORRECT", firstAnswerCorrect: false })).state.skills[skill.id];
      assert.equal(reset.intervalIndex, 0);
      assert.equal(reset.dueDay, 20_006);
    },
  },
  {
    id: "BND-05",
    title: "Fast-track eligibility changes only on structurally eligible non-clean attempts",
    effect: "NON_EVIDENCE leaves eligibility; non-clean evidence removes it",
    run(assert, { attemptFor, createState, engine, firstSkill }) {
      const skill = firstSkill();
      const state = createState(engine);
      const untouched = engine.applyAttempt(state, attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, evidenceClass: "NON_EVIDENCE" })).state;
      assert.equal(untouched.skills[skill.id].fastTrack, "FAST_TRACK_ELIGIBLE");
      const changed = engine.applyAttempt(state, attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false })).state;
      assert.equal(changed.skills[skill.id].fastTrack, "STANDARD_ONLY");
      assert.equal(engine.updateFastTrackEligibility({ current: "FAST_TRACK_ELIGIBLE", attempt: null }), "FAST_TRACK_ELIGIBLE");
    },
  },
  {
    id: "BND-06",
    title: "All session stop paths retain active re-teach and capstone",
    effect: "Natural, time, adult, fatigue, and daily classifiers remain independent",
    run(assert, { constants, engine }) {
      const mappings = [
        ["NATURAL", "NATURAL"],
        ["TIME_CAP", "TIME_CAPPED"],
        ["ADULT_TIME_CAP", "ADULT_TIME_CAPPED"],
        ["FATIGUE", "FATIGUE_STOPPED"],
        ["ADULT_CAP", "ADULT_CAPPED"],
        ["ADULT_STOP", "ADULT_STOPPED"],
        ["DAILY_CAP", "DAILY_CAPPED"],
      ];
      for (const [input, expected] of mappings) {
        const classified = engine.classifySessionStop({ reason: input, activeReteach: true, capstonePending: true });
        assert.equal(classified.stateClassification, expected);
        assert.equal(classified.finishReteach, true);
        assert.equal(classified.runCapstone, true);
      }
      assert.equal(constants.TIME_CAP_MS_BY_STAGE.GRADES_3_5, 840_000);
    },
  },
  {
    id: "BND-07",
    title: "Fraction notation and canonical forms are exact",
    effect: "Denominator, zero, decimal, mixed, and simplest-form boundaries each affect grading",
    run(assert, { answerFor, engine, questionArgs, skills }) {
      const half = engine.parseRational("1/2");
      const twoFourths = engine.parseRational("2/4");
      assert.equal(`${half.n}/${half.d}`, `${twoFourths.n}/${twoFourths.d}`);
      const simplest = { inputClass: "CONSTRUCTION", answer: { kind: "rational", value: "1/2", targetForm: "SIMPLEST" } };
      assert.equal(engine.gradeAnswer(simplest, "2/4").correct, false);
      assert.equal(engine.gradeAnswer(simplest, "1/2").correct, true);
      assert.equal(engine.parseFraction("1 1/2", { targetForm: "SIMPLEST" }).valid, true);
      assert.equal(engine.parseFraction("1 2/4", { targetForm: "SIMPLEST" }).valid, false);
      const zero = engine.parseRational("0/5");
      assert.equal(zero.n.toString(), "0");
      assert.equal(zero.d.toString(), "1");
      for (const value of ["1/-2", "-1/-2", "1 1/-2"]) assert.equal(engine.parseFraction(value).valid, false, value);
      for (const value of ["0/5", "-0", "0.0"]) assert.equal(engine.parseFraction(value, { targetForm: "CANONICAL" }).valid, false, value);
      assert.equal(engine.parseFraction("0", { targetForm: "CANONICAL" }).valid, true);
      assert.equal(engine.parseFraction("0.5", { targetForm: "DECIMAL" }).valid, true);
      assert.equal(engine.parseFraction("1/2", { targetForm: "DECIMAL" }).valid, false);
      assertGeneratedFractionForms({ engine, assert, skills, questionArgs, answerFor });

    },
  },
  {
    id: "BND-08",
    title: "Repeated misses trigger on same-session and chronic boundaries",
    effect: "Pre-K one miss, later two misses, and 3-of-6 across two sessions are inclusive",
    run(assert, { attemptFor, createState, engine, requireSkill, skills, stageFor }) {
      const preSkill = requireSkill(skills, "early-stage skill", (skill) => stageFor(engine, skill) === "PRE_K");
      const laterSkill = requireSkill(skills, "non-PRE_K skill", (skill) => stageFor(engine, skill) !== "PRE_K");
      const miss = (skill, sessionId, ordinal) => attemptFor(engine, skill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, sessionId, ordinal });
      assert.ok(engine.applyAttempt(createState(engine), miss(preSkill, "a", 0)).effects.some((effect) => effect.type === "RETEACH_REQUIRED"));
      let later = createState(engine);
      later.earnedLevel = laterSkill.level;
      later = engine.applyAttempt(later, miss(laterSkill, "a", 0)).state;
      assert.ok(engine.applyAttempt(later, miss(laterSkill, "a", 1)).effects.some((effect) => effect.type === "RETEACH_REQUIRED"));
      assertChronicMissBoundary({ engine, assert, laterSkill, createState, attemptFor, miss });

    },
  },
  {
    id: "BND-09",
    title: "Rapid-selection fatigue uses inclusive stage thresholds",
    effect: "An incorrect selection at the threshold signals; threshold plus one does not",
    run(assert, { constants, engine }) {
      assert.equal(engine.computeFatigue().offerStop, false);
      const stage = "PRE_K";
      const threshold = constants.RAPID_SELECTION_MS_BY_STAGE[stage];
      const streakLimit = constants.GUESSING_LIKE_STREAK_BY_STAGE[stage];
      const at = engine.computeFatigue({
        stage,
        attempts: [{ inputClass: "SELECTION", feedbackClass: "INCORRECT", elapsed: threshold }],
        priorGuessingLikeStreak: streakLimit - 1,
      });
      const over = engine.computeFatigue({
        stage,
        attempts: [{ inputClass: "SELECTION", feedbackClass: "INCORRECT", elapsed: threshold + 1 }],
        priorGuessingLikeStreak: streakLimit - 1,
      });
      assert.equal(at.signals.guessing, true);
      assert.equal(over.signals.guessing, false);
      const rising = engine.computeFatigue({
        stage,
        attempts: [0, 0, 0, 30_000, 10_000].map((elapsed) => ({ inputClass: "CONSTRUCTION", feedbackClass: "FIRST_TRY_CLEAN", elapsed })),
      });
      assert.equal(rising.signals.rising, true);
    },
  },
  {
    id: "BND-10",
    title: "Starting-point adaptive bracket stays within 10 to 20 questions",
    effect: "Every boundary is reachable and an isolated early mistake cannot trap the run at the curriculum floor",
    run(assert, { assertPlacementBoundaries, cloneJson, completePlacement, constants, createState, engine, recordPlacementResult, skills }) {
      assertPlacementBoundaries({ engine, assert, skills, constants, createState, completePlacement, cloneJson, recordPlacementResult });
    },
  },
]);

function assertGeneratedFractionForms({ engine, assert, skills, questionArgs, answerFor }) {
  const fractionSkills = skills.filter((skill) => skill.family === "fraction");
  assert.ok(fractionSkills.length, "manifest declares fraction skills");
  for (const skill of fractionSkills) {
    for (let ordinal = 0; ordinal < 12; ordinal += 1) {
      const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
      assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
      if (question.answer.targetForm === "SIMPLEST") assert.equal(engine.parseFraction(question.answer.value, { targetForm: "SIMPLEST" }).valid, true, `${skill.id}/${ordinal}`);
    }
  }
}

function assertChronicMissBoundary({ engine, assert, laterSkill, createState, attemptFor, miss }) {
  let chronic = createState(engine);
  chronic.earnedLevel = laterSkill.level;
  chronic = engine.applyAttempt(chronic, miss(laterSkill, "a", 0)).state;
  chronic = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "a", ordinal: 1 })).state;
  chronic = engine.applyAttempt(chronic, miss(laterSkill, "b", 2)).state;
  chronic = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "b", ordinal: 3 })).state;
  chronic = engine.applyAttempt(chronic, miss(laterSkill, "c", 4)).state;
  const result = engine.applyAttempt(chronic, attemptFor(engine, laterSkill, { sessionId: "c", ordinal: 5 }));
  assert.ok(result.state.reteachQueue.some((item) => item.skillId === laterSkill.id && item.reason === "CHRONIC"));
}
