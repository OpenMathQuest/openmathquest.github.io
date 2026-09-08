// Ordered core checks executed by the shared engine audit harness.
export const coreChecks = Object.freeze([
  {
    id: "CORE-01",
    title: "Unique markers and exact-byte SHA-256",
    effect: "Marker duplication or any engine-byte change alters the extracted digest",
    run(assert, { createHash, extracted }) {
      assert.equal(extracted.startCount, 1);
      assert.equal(extracted.endCount, 1);
      assert.match(extracted.sha256, /^[a-f0-9]{64}$/u);
      assert.equal(createHash("sha256").update(extracted.engineBytes).digest("hex"), extracted.sha256);
    },
  },
  {
    id: "CORE-02",
    title: "Stable public engine contract",
    effect: "Removing any required independent API fails",
    run(assert, { REQUIRED_APIS, engine, functionFrom }) {
      assert.ok(engine.CONSTANTS && typeof engine.CONSTANTS === "object");
      assert.ok(Array.isArray(engine.SKILLS));
      assert.ok(engine.CURRICULUM_MANIFEST && typeof engine.CURRICULUM_MANIFEST === "object");
      assert.match(engine.CURRICULUM_MANIFEST_SHA256 ?? "", /^[a-f0-9]{64}$/u);
      for (const names of REQUIRED_APIS) assert.ok(functionFrom(engine, ...names), `Missing ${names.join("/")}`);
    },
  },
  {
    id: "CORE-03",
    title: "Ambient-reference source scan",
    effect: "Any banned direct ambient identifier fails purity",
    run(assert, { extracted, scanAmbientReferences }) {
      assert.deepEqual(scanAmbientReferences(extracted.source), []);
    },
  },
  {
    id: "BEH-01",
    title: "The runtime exactly binds the neutral versioned manifest",
    effect: "Any manifest, ordering, field, id, version, or hash drift fails",
    run(assert, { canonicalizeJson, constants, engine, manifest, manifestArtifact, manifestProjection, skills }) {
      assert.equal(engine.CURRICULUM_MANIFEST.manifestId, manifest.manifestId);
      assert.equal(engine.CURRICULUM_MANIFEST.version, manifest.version);
      assert.equal(engine.CURRICULUM_MANIFEST_SHA256, manifestArtifact.sha256);
      assert.equal(canonicalizeJson(engine.CURRICULUM_MANIFEST), manifestArtifact.canonical);
      assert.equal(constants.CURRICULUM_MANIFEST_ID ?? manifest.manifestId, manifest.manifestId);
      assert.equal(constants.CURRICULUM_MANIFEST_VERSION ?? manifest.version, manifest.version);
      assert.equal(constants.CURRICULUM_MANIFEST_SHA256 ?? manifestArtifact.sha256, manifestArtifact.sha256);
      assert.equal(skills.length, manifest.skills.length);
      assert.equal(constants.LEVEL_MAX, manifest.levels.length);
      assert.equal(engine.LEVELS?.length ?? manifest.levels.length, manifest.levels.length);
      for (let index = 0; index < manifest.skills.length; index += 1) {
        assert.equal(skills[index].id, manifest.skills[index].id, `skill order ${index}`);
        assert.equal(canonicalizeJson(manifestProjection(skills[index])), canonicalizeJson(manifest.skills[index]), manifest.skills[index].id);
      }
    },
  },
  {
    id: "BEH-02",
    title: "Every declared generator profile produces deterministic graded work",
    effect: "Missing, collapsed, or unanswerable profile routing fails",
    run(assert, { answerFor, canonicalStringify, engine, manifest, questionArgs, skills }) {
      const profiles = new Map();
      for (const skill of skills) {
        assert.ok(skill.generatorProfile, `${skill.id}: generatorProfile`);
        profiles.set(skill.generatorProfile, (profiles.get(skill.generatorProfile) ?? 0) + 1);
        for (const tier of ["EASY", "HARD/TARGET"]) {
          const first = engine.makeQuestion(questionArgs(skill, tier, 0));
          const repeated = engine.makeQuestion(questionArgs(skill, tier, 0));
          assert.equal(first.skillId, skill.id);
          assert.equal(first.level, skill.level);
          assert.equal(first.tier, tier);
          assert.equal(canonicalStringify(first), canonicalStringify(repeated), `${skill.id}/${tier}: deterministic`);
          assert.equal(engine.gradeAnswer(first, answerFor(engine, first)).correct, true, `${skill.id}/${tier}: self-grade`);
        }
      }
      assert.deepEqual([...profiles].sort(), [...new Set(manifest.skills.map((skill) => skill.generatorProfile))].sort().map((profile) => [profile, manifest.skills.filter((skill) => skill.generatorProfile === profile).length]));
    },
  },
  {
    id: "BEH-03",
    title: "Every skill preserves manifest prerequisites, CPA phases, roles, and constraints",
    effect: "Changing a prerequisite or teaching contract diverges from the canonical manifest",
    run(assert, { canonicalizeJson, manifest, skills }) {
      for (let index = 0; index < manifest.skills.length; index += 1) {
        const expected = manifest.skills[index];
        const actual = skills[index];
        assert.equal(canonicalizeJson(actual.prerequisites), canonicalizeJson(expected.prerequisites), `${actual.id}: prerequisites`);
        assert.equal(canonicalizeJson(actual.phases), canonicalizeJson(expected.phases), `${actual.id}: phases`);
        assert.equal(actual.representation, expected.representation, `${actual.id}: representation`);
        assert.equal(actual.masteryRole, expected.masteryRole, `${actual.id}: masteryRole`);
        assert.equal(actual.family, expected.family, `${actual.id}: family`);
        assert.equal(actual.generatorProfile, expected.generatorProfile, `${actual.id}: generatorProfile`);
        assert.equal(canonicalizeJson(actual.constraints), canonicalizeJson(expected.constraints), `${actual.id}: constraints`);
      }
    },
  },
  {
    id: "BEH-04",
    title: "Natural and truncated session limits are distinct",
    effect: "Each stop path returns its configured count and minimum rule",
    run(assert, { buildQueue, constants, createState, engine, extracted }) {
      const naturalState = createState(engine);
      const natural = buildQueue(engine, naturalState, { playDay: 21_000, seed: 1 });
      const adultState = createState(engine);
      adultState.settings.grownUpPracticeCap = 3;
      const adult = buildQueue(engine, adultState, { playDay: 21_000, seed: 1 });
      const dailyState = createState(engine);
      dailyState.practiceCountByDay["21000"] = constants.DAILY_PRACTICE_MAX - 1;
      const daily = buildQueue(engine, dailyState, { playDay: 21_000, seed: 1 });
      assert.equal(natural.effectivePlannedCount, constants.SESSION_PLANNED_BY_STAGE[natural.stage]);
      assert.equal(adult.effectivePracticeLimit, 3);
      assert.equal(daily.effectivePracticeLimit, 1);
      assert.ok(adult.classifications.includes("ADULT_CAPPED"));
      assert.ok(daily.classifications.includes("DAILY_CAPPED"));
      assert.ok(natural.queue.length <= natural.effectivePracticeLimit);
      const adapterSource = extracted.pageBytes.toString("utf8").slice(extracted.byteEndExclusive);
      assert.match(adapterSource, /effectiveTimeCapMs/u);
    },
  },
  {
    id: "BEH-05",
    title: "Capstone always runs and is non-evidence",
    effect: "Completing any stop path retains a NON_EVIDENCE capstone and cannot clear re-teach",
    run(assert, { answerFor, createState, engine, firstSkill, questionArgs }) {
      const skill = firstSkill();
      const question = engine.makeQuestion(questionArgs(skill, "EASY", 0, { capstone: true }));
      const telemetry = { promptFinishedAt: 0, submittedAt: 2_000, manipulationMs: 0, replayMs: 0, idleMs: 0, playDay: 21_000, sessionId: "capstone" };
      const attempt = engine.submitAnswer(question, answerFor(engine, question), telemetry);
      assert.equal(attempt.evidenceClass, "NON_EVIDENCE");
      for (const reason of ["NATURAL", "TIME_CAP", "ADULT_TIME_CAP", "FATIGUE", "ADULT_CAP", "ADULT_STOP", "DAILY_CAP"]) {
        const classified = engine.classifySessionStop({ reason, activeReteach: true, capstonePending: true });
        assert.equal(classified.finishReteach, true, reason);
        assert.equal(classified.runCapstone, true, reason);
      }
      const pending = createState(engine);
      pending.reteachQueue = [{ skillId: skill.id, reason: "SAME_SESSION" }];
      const afterCapstone = engine.applyAttempt(pending, attempt);
      assert.equal(afterCapstone.state.reteachQueue.length, 1);
      const reteachQuestion = engine.makeQuestion(questionArgs(skill, "EASY", 1, { scaffolded: true, reteachStep: true }));
      const reteachAttempt = engine.submitAnswer(reteachQuestion, answerFor(engine, reteachQuestion), telemetry);
      assert.equal(engine.applyAttempt(pending, reteachAttempt).state.reteachQueue.length, 0);
    },
  },
  {
    id: "BEH-06",
    title: "Pick-your-question positions and candidates are meaningful",
    effect: "Changing the 1/5/9 and 1/3/5 cadence or returning duplicate cards fails",
    run(assert, { answerFor, constants, engine, questionArgs, skills }) {
      const prePlanned = constants.SESSION_PLANNED_BY_STAGE.PRE_K;
      const laterPlanned = constants.SESSION_PLANNED_BY_STAGE.K;
      assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: prePlanned })], Array.from({ length: Math.ceil(prePlanned / 4) }, (_, index) => 1 + index * 4));
      assert.deepEqual([...engine.choicePositions({ stage: "K", effectivePlannedCount: laterPlanned })], Array.from({ length: Math.ceil(laterPlanned / 2) }, (_, index) => 1 + index * 2));
      assert.deepEqual([...engine.choicePositions({ stage: "PRE_K", effectivePlannedCount: 0 })], []);
      const contractFields = ["skillId", "tier", "representation", "applied", "inputClass", "inputMethod", "semanticPromptStringId"];
      for (const skill of skills) {
        const args = questionArgs(skill, "EASY", 0, { eligibleQuestionOrdinal: 0, theme: "ocean" });
        const choices = engine.makeQuestionChoices(args);
        assert.ok(Object.isFrozen(choices), `${skill.id}: frozen choices`);
        assert.deepEqual(choices, engine.makeQuestionChoices(args), `${skill.id}: deterministic choices`);
        assert.ok([1, 2].includes(choices.length), `${skill.id}: bounded choice count`);
        for (const choice of choices) assert.equal(engine.gradeAnswer(choice, answerFor(engine, choice)).correct, true, `${skill.id}: answerable`);
        if (choices.length === 2) {
          assert.notEqual(choices[0].prompt, choices[1].prompt, `${skill.id}: visible prompt`);
          assert.notEqual(choices[0].sampleKey, choices[1].sampleKey, `${skill.id}: sample`);
          for (const field of contractFields) assert.equal(choices[1][field], choices[0][field], `${skill.id}: ${field}`);
        }
      }
    },
  },
  {
    id: "BEH-07",
    title: "Assigned input methods can reach correct answers",
    effect: "Every selection and construction target must be physically enterable",
    run(assert, { EXPECTED_STRATEGY_SEMANTIC_VARIANTS, STRATEGY_BUILD_SKILL_IDS, STRUCTURED_RESPONSE_METHODS, answerFor, assertInputMethodBehavior, canonicalStringify, cloneJson, constants, constructionFixture, correctStrategyBuildResponse, engine, incorrectSortSubmission, optionValue, questionArgs, requireSkill, selectionFixture, skills, strategySemanticVariantKey, structuredAnswerFor }) {
      assertInputMethodBehavior({ engine, assert, skills, constants, selectionFixture, constructionFixture, canonicalStringify, optionValue, answerFor, STRUCTURED_RESPONSE_METHODS, STRATEGY_BUILD_SKILL_IDS, requireSkill, questionArgs, strategySemanticVariantKey, correctStrategyBuildResponse, cloneJson, EXPECTED_STRATEGY_SEMANTIC_VARIANTS, structuredAnswerFor, incorrectSortSubmission });
    },
  },
  {
    id: "BEH-08",
    title: "Mastery, re-teaching, demotion, pull-back, and promotion use locked rules",
    effect: "Each independent progression branch remains observable",
    run(assert, { attemptFor, constants, createState, engine, promotionFixtureLevel, promotionState, requireSkill, skills }) {
      const level = promotionFixtureLevel(skills);
      const eligible = promotionState(engine, skills, level, true);
      assert.equal(engine.evaluatePromotion({ state: eligible, currentLevel: level }).promote, true);
      const blocked = promotionState(engine, skills, level, false);
      assert.equal(engine.evaluatePromotion({ state: blocked, currentLevel: level }).promote, false);
      const demotedSkill = requireSkill(skills, "gateway skill for demotion", (skill) => skill.masteryRole === "GATEWAY");
      const demotionState = createState(engine);
      Object.assign(demotionState.skills[demotedSkill.id], { acquisition: "SOLID", intervalIndex: 3, dueDay: 21_000 });
      const demoted = engine.applyAttempt(demotionState, attemptFor(engine, demotedSkill, { feedbackClass: "INCORRECT", firstAnswerCorrect: false, scheduledReview: true }));
      assert.equal(demoted.state.skills[demotedSkill.id].acquisition, "PRACTISING");
      assert.ok(demoted.effects.some((effect) => effect.type === "SKILL_DEMOTED"));
      assert.equal(constants.PROMOTION_SOLID_RATIO, 0.8);
    },
  },
  {
    id: "BEH-09",
    title: "Only FIRST_TRY_CLEAN can become credited evidence",
    effect: "Hint, change, incorrect, and invalid telemetry branches cannot credit mastery",
    run(assert, { attemptFor, correctOption, createState, engine, selectionFixture, skills }) {
      const { skill, question } = selectionFixture(engine, skills, (candidate) => candidate.options.length >= 2);
      const correct = correctOption(engine, question);
      const other = question.options.find((option) => option.optionId !== correct.optionId);
      const telemetry = { promptFinishedAt: 1_000, submittedAt: 3_000, manipulationMs: 0, replayMs: 0, idleMs: 0, selectionEvents: [{ optionId: correct.optionId, at: 1_500 }] };
      assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, telemetry).feedbackClass, "FIRST_TRY_CLEAN");
      assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, hintUsed: true }).feedbackClass, "CORRECT_WITH_STRUGGLE");
      assert.equal(engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, selectionEvents: [{ optionId: other.optionId, at: 1_000 }, { optionId: correct.optionId, at: 1_600 }] }).feedbackClass, "CORRECT_WITH_STRUGGLE");
      assert.equal(engine.submitAnswer(question, { optionId: other.optionId }, telemetry).feedbackClass, "INCORRECT");
      const invalid = engine.submitAnswer(question, { optionId: correct.optionId }, { ...telemetry, submittedAt: 1_500, manipulationMs: 700 });
      assert.equal(invalid.validTelemetry, false);
      assert.equal(invalid.evidenceClass, "NON_EVIDENCE");
      const tooFew = { ...question, options: question.options.slice(0, 1), optionCount: 1 };
      assert.equal(engine.submitAnswer(tooFew, { optionId: tooFew.options[0].optionId }, telemetry).evidenceClass, "NON_EVIDENCE");
      assert.equal(engine.deriveSelectionChanged({ selectionEvents: [{ value: "a", at: 0 }, { value: "b", at: 600 }] }).changed, true);
      assert.equal(engine.deriveSelectionChanged({ selectionEvents: [{ value: "a", at: 0 }, { value: "b", at: 599 }] }).changed, false);
      const applied = engine.applyAttempt(createState(engine), attemptFor(engine, skill, { evidenceClass: "NON_EVIDENCE", feedbackClass: "INCORRECT", firstAnswerCorrect: false }));
      assert.equal(applied.state.skills[skill.id].evidence.length, 0);
    },
  },
  {
    id: "BEH-10",
    title: "The engine is deterministic and does not mutate inputs",
    effect: "Same inputs repeat exactly; frozen state survives calls",
    run(assert, { canonicalStringify, cloneJson, createState, deepFreezeTest, engine, firstSkill, questionArgs }) {
      const skill = firstSkill();
      const args = questionArgs(skill, "HARD/TARGET", 7);
      assert.equal(canonicalStringify(engine.makeQuestion(args)), canonicalStringify(engine.makeQuestion(cloneJson(args))));
      const state = createState(engine);
      const before = canonicalStringify(state);
      engine.buildSessionQueue(deepFreezeTest(cloneJson(state)), { playDay: 21_000, seed: 7 });
      assert.equal(canonicalStringify(state), before);
    },
  },
  {
    id: "BEH-11",
    title: "The shipped page contains no runtime network call",
    effect: "Adding a remote resource or network API fails",
    async run(assert, { indexPath, readFile }) {
      const html = await readFile(indexPath, "utf8");
      assert.doesNotMatch(html, /<(?:script|img|audio|source|link)[^>]+(?:src|href)\s*=\s*["']https?:/iu);
      assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|\.)/u);
    },
  },
  {
    id: "BEH-12",
    title: "Save export and import round-trip canonically",
    effect: "Serialization, schema, or manifest binding drift fails",
    run(assert, { canonicalStringify, cloneJson, constants, createState, engine, manifest, manifestArtifact, stateValue }) {
      const state = createState(engine);
      const exported = engine.exportState(state);
      const imported = stateValue(engine.importState(cloneJson(state), exported, 21_000));
      assert.equal(imported.placementDraftGeneration, state.placementDraftGeneration + 1);
      const importedProjection = cloneJson(imported);
      importedProjection.placementDraftGeneration = state.placementDraftGeneration;
      assert.equal(canonicalStringify(importedProjection), canonicalStringify(state));
      assert.equal(state.schemaVersion, constants.STATE_SCHEMA_VERSION);
      assert.equal(state.curriculumManifestId, manifest.manifestId);
      assert.equal(state.curriculumVersion, manifest.version);
      assert.equal(state.curriculumSha256, manifestArtifact.sha256);
      assert.equal(constants.BACKUP_MAX_BYTES, 5 * 1024 * 1024);
      assert.equal(constants.BACKUP_MAX_CHARACTERS, 5 * 1024 * 1024);
      assert.equal(
        canonicalStringify(engine.loadState(" ".repeat(constants.BACKUP_MAX_CHARACTERS + 1), 21_000)),
        canonicalStringify({ ok: false, error: "The backup is larger than the 5 MiB limit." }),
      );
      for (const empty of [null, undefined, ""]) assert.equal(engine.loadState(empty, 21_000).ok, true);
      assert.equal(engine.loadState("{", 21_000).ok, false);
      assertMalformedBackupLoads({ engine, assert, state, constants, cloneJson, canonicalStringify });

    },
  },
  {
    id: "BEH-13",
    title: "Port and storage namespace remain isolated",
    effect: "A legacy or colliding namespace and a non-loopback launcher fail",
    async run(assert, { constants, extracted, path, readFile, root }) {
      assert.equal(constants.STORAGE_NAMESPACE, "math-quest:progress:v2");
      assert.equal(constants.PREVIOUS_STORAGE_NAMESPACE, "math-quest:v2");
      const launcher = await readFile(path.join(root, "Math Quest.bat"), "utf8");
      const server = await readFile(path.join(root, "Serve-MathQuest.ps1"), "utf8");
      assert.match(`${launcher}\n${server}`, /8771/u);
      assert.doesNotMatch(`${launcher}\n${server}`, /8770/u);
      assert.match(server, /IPAddress\]::Loopback|127\.0\.0\.1/u);
      const pageText = extracted.pageBytes.toString("utf8");
      assert.match(pageText, /math-quest:progress:v2/u);
      assert.match(pageText, /beta1-migration-guard:v1/u);
      assert.match(pageText, /beta1-to-protected-v1/u);
      assert.match(pageText, /empty-to-protected-v1/u);
    },
  },
  {
    id: "BEH-14",
    title: "Child prompt bytes and Canadian metric context align",
    effect: "Unknown prompts, template drift, customary units, or non-Canadian money fail",
    run(assert, { assertCanadianMoneyQuestions, childStringArtifact, engine, questionArgs, skills }) {
      const records = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE).records;
      const byId = new Map(records.map((record) => [record.id, record]));
      const allowed = new Set(["AFFIRMATION", "OBSERVATION", "INSTRUCTION", "MATH_CONTENT", "RITUAL"]);
      for (const record of records) assert.ok(allowed.has(record.category), `${record.id}: category`);
      for (const skill of skills) {
        for (const tier of ["EASY", "HARD/TARGET"]) {
          const question = engine.makeQuestion(questionArgs(skill, tier, 0));
          assert.ok(byId.has(question.promptStringId), `${skill.id}: ${question.promptStringId}`);
          assert.equal(byId.get(question.promptStringId)?.category, "MATH_CONTENT", `${skill.id}: category`);
          assert.equal(engine.renderChildString(question.promptStringId, question.promptSlots), question.prompt, `${skill.id}: prompt bytes`);
          assert.doesNotMatch(question.prompt, /\b(?:inches?|feet|foot|yards?|miles?|ounces?|pounds?|fahrenheit)\b/iu, `${skill.id}: customary unit`);
        }
      }
      for (const record of records.filter((row) => row.id.startsWith("question."))) {
        const placeholders = [...String(record.text).matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map((match) => match[1]);
        assert.deepEqual([...new Set(placeholders)].sort(), Object.keys(record.slotDefinitions ?? {}).sort(), `${record.id}: slots`);
      }
      const moneySkills = skills.filter((skill) => skill.family === "money");
      assert.ok(moneySkills.length, "manifest declares a money capability");
      assertCanadianMoneyQuestions(engine, assert, moneySkills);
    },
  },
  {
    id: "BEH-15",
    title: "Forbidden reward and trait-praise language is absent",
    effect: "Inserting a forbidden term in child-facing text fails",
    run(assert, { childStringArtifact, engine }) {
      const text = childStringArtifact(engine.CHILD_STRINGS ?? engine.CHILD_STRING_TABLE).canonicalJson.toLowerCase();
      assert.doesNotMatch(text, /\b(?:smart|genius|gifted|brilliant child|perfect child|prize|reward|streak bonus|leaderboard)\b/u);
    },
  },
  {
    id: "BEH-16",
    title: "Applicable questions emit machine-checkable models",
    effect: "Dropping a hard-tier descriptor fails across the catalog",
    run(assert, { answerFor, engine, questionArgs, skills }) {
      for (const skill of skills) {
        const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", skill.level, { representation: "PICTORIAL" }));
        assert.ok(question.modelDescriptor && typeof question.modelDescriptor === "object", `${skill.id}: modelDescriptor`);
        assert.ok(question.modelDescriptor.type, `${skill.id}: model type`);
        assert.ok(question.modelDescriptor.instructionStringId, `${skill.id}: instructionStringId`);
        assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}: model answer`);
      }
    },
  },
  {
    id: "BEH-17",
    title: "Required governance, research, and release artifacts exist",
    effect: "Removing or weakening a governed public artifact fails",
    async run(assert, { path, readFile, root }) {
      for (const file of [
        "AGENTS.md",
        "audit/agent-collaboration-policy-v1.json",
        "audit/tests/agent-collaboration-policy.test.mjs",
        "audit/tests/audit-orchestration.test.mjs",
        "audit/certification-cadence-v1.json",
        "audit/repository-code-map-v1.json",
        "audit/lib/development-suite-plan.mjs",
        "audit/lib/feature-map.mjs",
        "audit/lib/playwright-focused-contract.mjs",
        "audit/lib/playwright-deep-ux-census.mjs",
        "audit/lib/repository-code-map.mjs",
        "audit/lib/tutorial-manifest.mjs",
        "audit/schemas/feature-map-v1.schema.json",
        "audit/schemas/repository-code-map-v1.schema.json",
        "audit/schemas/tutorial-manifest-v1.schema.json",
        "audit/lib/release-evidence-successor.mjs",
        "audit/tests/development-suite-plan.test.mjs",
        "audit/tests/feature-map.test.mjs",
        "audit/tests/playwright-focused-contract.test.mjs",
        "audit/tests/playwright-deep-ux-census.test.mjs",
        "audit/tests/repository-code-map.test.mjs",
        "audit/tests/tutorial-manifest.test.mjs",
        "audit/finished-work-policy-v1.json",
        "audit/tests/finished-work-policy.test.mjs",
        "curriculum/math-quest-manifest-v1.json",
        "curriculum/math-quest-feature-map-v1.json",
        "curriculum/math-quest-tutorial-manifest-v1.json",
        "curriculum/PROVENANCE.md",
        "research/build-axioms.md",
        "research/pedagogy-notes.md",
        "README.md",
        "THIRD_PARTY_NOTICES.md",
        "playwright.deep-ux.config.mjs",
        "tools/blast-radius-lookup.mjs",
        "tools/build-tutorial-manifest.mjs",
        "tools/sync-repository-code-map.mjs",
        "tools/sync-tutorial-manifest.mjs",
      ]) {
        assert.ok((await readFile(path.join(root, file), "utf8")).trim().length > 0, file);
      }
      const agentPolicy = await readFile(path.join(root, "AGENTS.md"), "utf8");
      for (const [requirement, pattern] of [
        ["permanent lifetime authority", /permanent project policy[\s\S]*lifetime of Math Quest/iu],
        ["all project change types", /whenever the game or repository changes[\s\S]*code, assets, educational content[\s\S]*project structure/iu],
        ["quality dimensions", /software correctness[\s\S]*educational and mathematical correctness[\s\S]*child comprehension[\s\S]*accessibility[\s\S]*release readiness/iu],
        ["uncertainty adds coverage", /When uncertain whether new coverage is\s+required, assume that it is required/iu],
        ["permanent defect regressions", /Every confirmed defect must become a permanent, effect-sensitive regression\s+test/iu],
        ["test and product failure classification", /Classify it explicitly as a product defect, test defect, environment or\s+harness defect, pending approval\/evidence gate/iu],
        ["obsolete tests retain their protected effect", /Revise or replace an obsolete test only when[\s\S]*equal or stronger effect-sensitive coverage protects[\s\S]*original safety or usability purpose/iu],
        ["green results cannot justify weakening", /Never weaken, delete, skip, or reclassify a test merely to obtain a passing\s+result/iu],
        ["no size or context omission", /Do not omit a certification requirement merely to reduce file size, token use,[\s\S]*instruction length/iu],
        ["mandatory fail-closed gate", /mandatory, fail-closed release gate/iu],
        ["focused development cadence", /During ordinary development[\s\S]*run the defined fast development suite[\s\S]*Do not run the complete certification gauntlet merely/iu],
        ["alternating-beta Deep UX Census", /every second semantic-version beta[\s\S]*Beta 4,[\s\S]*Beta 6,[\s\S]*72,576[\s\S]*100-cell[\s\S]*non-certifying/iu],
        ["permanent tutorial linkage", /Permanent tutorial linkage[\s\S]*every ordinary curriculum question[\s\S]*different example[\s\S]*curriculum\/math-quest-tutorial-manifest-v1\.json[\s\S]*new, removed, renamed, or moved skill[\s\S]*direct Playwright journeys[\s\S]*Deep UX Census/iu],
        ["frozen candidate final cadence", /complete certification system once after all planned release work[\s\S]*public payload are frozen[\s\S]*publication[\s\S]*next intended operation/iu],
        ["publication instruction authorizes final run", /clear owner instruction to publish[\s\S]*authorizes this final run/iu],
        ["exact immutable release identity", /exact immutable commit and exact[\s\S]*public payload that will be tagged and deployed/iu],
        ["post-run change restarts full gate", /change after the run invalidates the[\s\S]*freeze a new candidate[\s\S]*rerun the complete gauntlet from the beginning/iu],
        ["early full run needs owner approval", /recommend an earlier complete run[\s\S]*must obtain[\s\S]*owner's explicit approval/iu],
        ["formal completion waits for final certification", /no feature, refactor, optimization, content update, or release[\s\S]*formally complete until[\s\S]*final complete certification gate/iu], ["ordered implementation decision ladder and safeguards", /## Dependency and implementation policy[\s\S]*1\. \*\*Reuse an existing suitable implementation or repository utility in the[\s\S]*codebase[\s\S]*semantics, ownership, tests, and drift[\s\S]*do not force reuse[\s\S]*wrong abstraction[\s\S]*2\. \*\*Prefer the language standard library and built-in platform features[\s\S]*browser,[\s\S]*offline, security, privacy, accessibility, or reproducibility contracts[\s\S]*3\. \*\*Use an existing repository-declared and approved dependency[\s\S]*installed on the machine[\s\S]*not a project dependency[\s\S]*4\. \*\*If none of those fit, evaluate an established, well-maintained open-source[\s\S]*licence, provenance, maintenance, security, reproducibility, bundle[\s\S]*offline implications[\s\S]*ask the project owner for approval[\s\S]*licence named explicitly[\s\S]*5\. \*\*Otherwise write only the smallest task-specific implementation[\s\S]*Small local glue[\s\S]*owner approval before building a[\s\S]*substantial custom solution[\s\S]*6\. \*\*Run the applicable AI-change assurance and drift checks[\s\S]*compiler\/types[\s\S]*static architecture[\s\S]*tests and coverage[\s\S]*differential[\s\S]*property\/fuzz testing[\s\S]*mutation testing[\s\S]*security and[\s\S]*dependency checks[\s\S]*complexity\/duplication\/size checks[\s\S]*performance[\s\S]*governed order[\s\S]*Do not treat familiarity with a tool[\s\S]*installation on the machine[\s\S]*open-source label as approval[\s\S]*wait for owner approval[\s\S]*<!-- AI-FIRST-DRIFT-CONTROL-START -->/iu],
        ["one marked finished-work authority", /FINISHED-WORK-POLICY-START[\s\S]*What counts as finished work[\s\S]*FINISHED-WORK-POLICY-END/iu],
        ["no automatic child-data transmission", /must never automatically transmit child[\s\S]*deliberate[\s\S]*grown-up-controlled export or share/iu],
        ["truthful completion vocabulary", /implemented\*\* means[\s\S]*release-certified\*\* means[\s\S]*shipped\*\* means/iu],
        ["predefined finish line cannot narrow after difficulty", /Define the finish line before implementation begins[\s\S]*owner.s approval[\s\S]*Never narrow the finish line afterward/iu],
      ]) {
        assert.match(agentPolicy, pattern, `AGENTS.md: ${requirement}`);
      }
    },
  },
]);

function assertMalformedBackupLoads({ engine, assert, state, constants, cloneJson, canonicalStringify }) {
  for (const mutation of [
    { schemaVersion: 1 },
    { curriculumManifestId: "different-manifest" },
    { curriculumVersion: "999.0.0" },
    { curriculumSha256: "0".repeat(64) },
    { earnedLevel: 0 },
    { earnedLevel: constants.LEVEL_MAX + 1 },
    { skills: null },
  ]) {
    const bad = { ...cloneJson(state), ...mutation };
    assert.equal(engine.loadState(JSON.stringify(bad), 21_000).ok, false, canonicalStringify(mutation));
  }
}
