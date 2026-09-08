// Ordered learning checks executed by the shared engine audit harness.
export const learningChecks = Object.freeze([
  {
    id: "BEH-18",
    title: "Decimal parsing and generated decimal work are exact",
    effect: "Binary-floating equality or malformed decimal acceptance fails",
    run(assert, { answerFor, engine, questionArgs, skills }) {
      const half = engine.parseRational("0.5");
      const fractionHalf = engine.parseRational("1/2");
      assert.equal(half.n, fractionHalf.n);
      assert.equal(half.d, fractionHalf.d);
      assert.equal(engine.parseFraction("0.5", { targetForm: "DECIMAL" }).valid, true);
      assert.equal(engine.parseFraction("1/2", { targetForm: "DECIMAL" }).valid, false);
      const decimalSkills = skills.filter((skill) => skill.family === "decimal");
      assert.ok(decimalSkills.length, "manifest declares decimal skills");
      for (const skill of decimalSkills) {
        for (let ordinal = 0; ordinal < 24; ordinal += 1) {
          const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal));
          assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
          if (question.answer.kind === "rational") assert.ok(engine.parseRational(question.answer.value), `${skill.id}: exact rational answer`);
        }
      }
    },
  },
  {
    id: "BEH-19",
    title: "Adult caps, soft time, and daily ceiling survive save round-trip",
    effect: "Each cap independently lowers its effective limit and persists",
    run(assert, { buildQueue, constants, createState, engine, stateValue }) {
      const state = createState(engine);
      state.earnedLevel = constants.LEVEL_MAX;
      state.settings.grownUpPracticeCap = 7;
      state.settings.grownUpSoftTimeCapMs = 600_000;
      state.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX - 2;
      const caps = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
      assert.equal(caps.effectivePracticeLimit, 2);
      assert.equal(caps.effectiveTimeCapMs, 600_000);
      const restored = stateValue(engine.importState(createState(engine), engine.exportState(state), 21_000));
      assert.equal(restored.settings.grownUpPracticeCap, 7);
      assert.equal(restored.settings.grownUpSoftTimeCapMs, 600_000);
    },
  },
  {
    id: "BEH-20",
    title: "Witness sets reject duplicate samples and NON_EVIDENCE",
    effect: "Duplicate and non-evidentiary work cannot strengthen mastery or revoke fast-track",
    run(assert, { appliedState, attemptFor, constants, createState, engine, firstSkill }) {
      const skill = firstSkill();
      let state = createState(engine);
      assert.equal(engine.beginSkill(state, skill.id).skills[skill.id].acquisition, "LEARNING");
      assert.throws(() => engine.beginSkill(state, "missing-skill"), /Unknown skillId/u);
      assert.ok(engine.applyAttempt(state, null).effects.some((effect) => effect.type === "REJECTED_ATTEMPT"));
      const repeatedSampleKey = `${skill.id}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|same`;
      const first = attemptFor(engine, skill, {
        playDay: 21_000,
        ordinal: 1,
        representation: "CONCRETE",
        sampleKey: repeatedSampleKey,
      });
      state = appliedState(engine, state, first);
      state = appliedState(engine, state, attemptFor(engine, skill, {
        playDay: 21_001,
        ordinal: 2,
        representation: "PICTORIAL",
        sampleKey: repeatedSampleKey,
      }));
      assert.notEqual(state.skills[skill.id].acquisition, "SOLID");
      const priorFastTrack = state.skills[skill.id].fastTrack;
      state = appliedState(engine, state, attemptFor(engine, skill, { playDay: 21_002, feedbackClass: "INCORRECT", firstAnswerCorrect: false, evidenceClass: "NON_EVIDENCE" }));
      assert.equal(state.skills[skill.id].fastTrack, priorFastTrack);
      assertDistinctWitnessMastery({ engine, assert, skill, createState, appliedState, attemptFor });
      const capped = createState(engine);
      capped.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX;
      assert.ok(engine.applyAttempt(capped, attemptFor(engine, skill)).effects.some((effect) => effect.type === "REJECTED_DAILY_CAP"));
    },
  },
  {
    id: "BEH-21",
    title: "Prerequisites gate practice while every manifest level remains previewable",
    effect: "An unsolid prerequisite cannot enter ordinary work",
    run(assert, { buildQueue, constants, createState, engine, manifest, requireSkill, skills }) {
      assert.equal(constants.LEVEL_MAX, manifest.levels.length);
      const dependent = requireSkill(skills, "skill with prerequisites", (skill) => skill.prerequisites.length > 0);
      const state = createState(engine);
      state.earnedLevel = dependent.level;
      for (const peer of skills.filter((skill) => skill.level === dependent.level && skill.id !== dependent.id)) {
        state.skills[peer.id].acquisition = "PRACTISING";
      }
      let session = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
      assert.ok(!session.queue.some((slot) => slot.skillId === dependent.id && slot.obligation === "NEW"));
      for (const prerequisiteId of dependent.prerequisites) state.skills[prerequisiteId].acquisition = "SOLID";
      session = buildQueue(engine, state, { playDay: 21_000, seed: 1 });
      assert.ok(session.queue.some((slot) => slot.skillId === dependent.id), `${dependent.id}: eligible after prerequisites`);
      const preview = createState(engine);
      preview.previewLevel = constants.LEVEL_MAX;
      const previewQueue = buildQueue(engine, preview, { playDay: 21_000, seed: 1 });
      assert.ok(previewQueue.queue.length);
      assert.ok(previewQueue.queue.every((slot) => slot.preview && slot.obligation === "PREVIEW"));
    },
  },
  {
    id: "BEH-22",
    title: "Level re-teaching blocks and clears through recovery evidence",
    effect: "Active re-teaching cannot promote or clear without new spaced clean evidence",
    run(assert, { attemptFor, canonicalStringify, createState, engine, firstSkill }) {
      const skill = firstSkill();
      const state = createState(engine);
      state.currentLevelColdWindow = Array.from({ length: 11 }, (_, index) => ({
        skillId: skill.id,
        level: skill.level,
        coldTest: true,
        feedbackClass: index < 7 ? "FIRST_TRY_CLEAN" : "INCORRECT",
        evidenceClass: "CONSTRUCTION",
        playDay: 21_000 + index,
      }));
      const started = engine.applyAttempt(state, attemptFor(engine, skill, { playDay: 21_011, coldTest: true, feedbackClass: "INCORRECT", firstAnswerCorrect: false }));
      assert.equal(started.state.levelReteachActive, true);
      assert.ok(started.effects.some((effect) => effect.type === "LEVEL_RETEACH_STARTED"));
      const recovery = createState(engine);
      recovery.levelReteachActive = true;
      recovery.levelReteachTargets = [skill.id];
      recovery.levelReteachTargetSince[skill.id] = 21_999;
      recovery.skills[skill.id].acquisition = "SOLID";
      const cleared = engine.applyAttempt(recovery, attemptFor(engine, skill, { playDay: 22_000, scheduledReview: true }));
      assert.equal(cleared.state.levelReteachActive, false);
      assert.equal(canonicalStringify(cleared.state.levelReteachTargets), "[]");
    },
  },
  {
    id: "BEH-23",
    title: "A rapid clean selection resets guessing-like fatigue",
    effect: "Keeping the streak after a clean attempt fails",
    run(assert, { attemptFor, constants, createState, engine, firstSkill }) {
      const skill = firstSkill();
      const state = createState(engine);
      state.guessingLikeStreak = 1;
      const result = engine.applyAttempt(state, attemptFor(engine, skill, { inputClass: "SELECTION", evidenceClass: "GUESS_PRONE_SELECTION", elapsed: 1_000 }));
      assert.equal(result.state.guessingLikeStreak, 0);
      assert.ok(!result.effects.some((effect) => effect.type === "FATIGUE_OFFER"));
      const idle = engine.applyAttempt(createState(engine), attemptFor(engine, skill, { idleMs: constants.IDLE_MS_BY_STAGE.PRE_K }));
      assert.ok(idle.effects.some((effect) => effect.type === "FATIGUE_OFFER" && effect.signals.idle));
    },
  },
  {
    id: "BEH-24",
    title: "Feedback capacity and repetition window are enforced",
    effect: "A normalized duplicate or exhausted pool fails capacity validation",
    run(assert, { attemptFor, constants, engine, firstSkill }) {
      const skill = firstSkill();
      const cleanAttempt = attemptFor(engine, skill, { stage: "PRE_K", feedbackClass: "FIRST_TRY_CLEAN" });
      const minimum = constants.FEEDBACK_POOL_MIN_BY_STAGE.PRE_K;
      const rendered = Array.from({ length: minimum }, (_, ordinal) => engine.feedbackLine(cleanAttempt, ordinal).normalize("NFC"));
      assert.equal(new Set(rendered).size, rendered.length);
      const first = engine.feedbackLine(cleanAttempt, 0);
      assert.notEqual(engine.feedbackLine(cleanAttempt, 0, [first]), first);
      const capacity = Math.max(...Object.values(constants.FEEDBACK_POOL_MIN_BY_STAGE));
      const all = Array.from({ length: capacity }, (_, ordinal) => engine.feedbackLine(cleanAttempt, ordinal));
      assert.equal(new Set(all.map((line) => line.normalize("NFC"))).size, capacity);
      assert.throws(() => engine.feedbackLine(cleanAttempt, 0, all), /exhausted/iu);
    },
  },
  {
    id: "BEH-25",
    title: "Child-string digest reproduces from shipped records",
    effect: "Any approved child-string byte change changes SHA-256",
    options: { required: false },
    run(assert, { childStringArtifact, constants, engine, harness, validateChildStringRecords }) {
      const artifact = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE);
      assert.deepEqual(validateChildStringRecords(artifact.records), []);
      const approved = constants.CHILD_STRING_APPROVAL_SHA256 ?? constants.CHILD_STRING_DIGEST;
      if (constants.CHILD_STRING_CANONICALIZATION_VERSION !== "child-strings-v1" || !approved) {
        harness.skip(`Strings pending approval; computed candidate digest ${artifact.sha256}.`);
      }
      assert.equal(constants.CHILD_STRINGS_PENDING_APPROVAL, false);
      assert.equal(artifact.sha256, approved);
    },
  },
  {
    id: "BEH-26",
    title: "Preview attempts remain non-evidentiary",
    effect: "Applying preview work cannot change earned progress",
    run(assert, { appliedState, attemptFor, canonicalStringify, createState, engine, firstSkill }) {
      const skill = firstSkill();
      const before = createState(engine);
      const after = appliedState(engine, before, attemptFor(engine, skill, { preview: true, evidenceClass: "NON_EVIDENCE" }));
      assert.equal(after.earnedLevel, before.earnedLevel);
      assert.equal(canonicalStringify(after.skills), canonicalStringify(before.skills));
    },
  },
  {
    id: "BEH-27",
    title: "Save import is transactional and manifest-validated",
    effect: "Malformed, old-schema, or wrong-manifest imports leave live state byte-equivalent",
    run(assert, { assertImportBehavior, canonicalStringify, cloneJson, createState, engine }) {
      assertImportBehavior({ engine, assert, createState, canonicalStringify, cloneJson });
    },
  },
  {
    id: "BEH-28",
    title: "Play-day rules handle midnight, reopen, and rollback",
    effect: "Candidate days can advance but never lower maxSeenPlayDay",
    run(assert, { constants, createState, engine }) {
      const state = createState(engine, 20_000);
      state.activeSession = {
        sessionId: "same-day",
        playDay: 20_000,
        level: state.earnedLevel,
        stage: engine.stageForLevel(state.earnedLevel),
        seed: state.seed,
        queue: [],
        baseSlotCount: 0,
        effectivePracticeLimit: 0,
        effectivePlannedCount: 0,
        effectiveTimeCapMs: 60_000,
        adultTimeReduced: true,
        classifications: [],
        index: 0,
        world: "ocean",
        servedCount: 0,
        servedOrdinals: [],
        elapsedMs: 0,
        stopReason: null,
        oneMore: false,
        uiState: {
          version: constants.ACTIVE_UI_VERSION,
          screen: "fatigue",
          phase: "question",
          question: null,
          choiceCandidates: [],
          choiceResolved: {},
          selected: null,
          entry: "",
          fractionParts: { whole: "", numerator: "", denominator: "" },
          modelCells: [],
          responseState: {},
          modelTouched: false,
          hintUsed: false,
          tutorialOpen: false,
          tutorialStep: 1,
          selectionChanged: false,
          feedback: null,
          lastAttempt: null,
          attemptCommitted: true,
          replayMs: 0,
          manipulationMs: 0,
          maxIdleMs: 0,
          stopRequested: false,
          fatiguePending: false,
          reteachPending: null,
          reteachAdvancesIndex: false,
          isReteach: false,
          capstoneSubmitted: false,
        },
      };
      const json = engine.exportState(state);
      assert.equal(engine.loadState(json, 20_001).state.maxSeenPlayDay, 20_001);
      assert.equal(engine.loadState(json, 19_999).state.maxSeenPlayDay, 20_000);
      assert.equal(engine.loadState(json, 20_000).state.activeSession.sessionId, "same-day");
      const manyLogs = createState(engine);
      manyLogs.sessionLog = Array.from({ length: 200 }, (_, index) => ({ sessionId: `old-${index}`, playDay: 21_000 }));
      manyLogs.previewLevel = Math.min(3, constants.LEVEL_MAX);
      manyLogs.activeSession = { sessionId: "active" };
      const completed = engine.completeSession(manyLogs, { sessionId: "new", playDay: 21_000 });
      assert.equal(completed.sessionLog.length, constants.SESSION_LOG_MAX);
      assert.equal(completed.sessionLog[0].sessionId, "old-151");
      assert.equal(completed.activeSession, null);
      assert.equal(completed.previewLevel, null);
    },
  },
  {
    id: "BEH-29",
    title: "Starting-point placement is isolated, transactional, and reversible by evidence",
    effect: "Placement cannot leak practice evidence, overwrite recovery, complete the selected level, or survive contrary review evidence",
    run(assert, { assertPlacementBehavior, attemptFor, cloneJson, completePlacement, constants, correctOption, createState, engine, firstSkill, recordPlacementResult, skills }) {
      assertPlacementBehavior({ engine, assert, skills, constants, createState, attemptFor, firstSkill, cloneJson, completePlacement, recordPlacementResult, correctOption });
    },
  },
  {
    id: "BEH-30",
    title: "Math Quest Free Play unlocks exact introduced tools and grades without evidence mutation",
    effect: "Preview, placement, opening, or Free Play cannot unlock tools or change the learning save",
    run(assert, { appliedState, assertFreePlayBehavior, attemptFor, createState, engine }) {
      assertFreePlayBehavior(engine, assert, { createState, appliedState, attemptFor });
    },
  },
]);

function assertDistinctWitnessMastery({ engine, assert, skill, createState, appliedState, attemptFor }) {
  const standard = createState(engine);
  standard.skills[skill.id].fastTrack = "STANDARD_ONLY";
  let progressed = standard;
  for (let index = 0; index < 4; index += 1) {
    const evidenceClass = index === 3 ? "GUESS_PRONE_SELECTION" : "CONSTRUCTION";
    progressed = appliedState(engine, progressed, attemptFor(engine, skill, {
      playDay: 22_000 + index,
      ordinal: index,
      evidenceClass,
      inputClass: evidenceClass === "CONSTRUCTION" ? "CONSTRUCTION" : "SELECTION",
      representation: index === 0 ? "CONCRETE" : "PICTORIAL",
      sampleKey: `${skill.id}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|distinct-${index}`,
    }));
  }
  assert.equal(progressed.skills[skill.id].acquisition, "SOLID");
}
