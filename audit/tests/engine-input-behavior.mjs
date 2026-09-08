// Ordered behavioral assertions retained under the original BEH-07 result.
function selectionAndConstruction({ engine, assert, skills, selectionFixture, constructionFixture, canonicalStringify, optionValue, answerFor, STRUCTURED_RESPONSE_METHODS }) {
  const selection = selectionFixture(engine, skills);
  const construction = constructionFixture(engine, skills);
  const selectionQuestion = selection.question;
  assert.equal(selectionQuestion.options.length, selectionQuestion.optionCount);
  assert.ok(selectionQuestion.optionCount >= 2);
  assert.equal(new Set(selectionQuestion.options.map((option) => canonicalStringify(optionValue(option)))).size, selectionQuestion.options.length);
  assert.equal(selectionQuestion.options.filter((option) => engine.gradeAnswer(selectionQuestion, optionValue(option)).correct).length, 1);
  assert.equal(engine.gradeAnswer(construction.question, answerFor(engine, construction.question)).correct, true);
  if (STRUCTURED_RESPONSE_METHODS.has(construction.question.inputMethod)) {
    const scalarBypass = engine.gradeAnswer(construction.question, construction.question.answer.value);
    assert.equal(scalarBypass.correct, false);
    assert.equal(scalarBypass.valid, false);
    assert.equal(scalarBypass.reason, "structured-response-required");
  }
  assert.doesNotThrow(() => engine.gradeAnswer(construction.question, "not-a-valid-answer"));
  assert.equal(engine.gradeAnswer(null, "1").valid, false);
  assertRationalInputs(engine, assert);
}

function strategyResponses({ engine, assert, skills, STRATEGY_BUILD_SKILL_IDS, requireSkill, questionArgs, strategySemanticVariantKey, correctStrategyBuildResponse, cloneJson, EXPECTED_STRATEGY_SEMANTIC_VARIANTS }) {
  const observedStrategyVariants = new Set();
  for (const skillId of STRATEGY_BUILD_SKILL_IDS) {
    const skill = requireSkill(skills, `${skillId} strategy build`, (candidate) => candidate.id === skillId);
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (let ordinal = 0; ordinal < 24; ordinal += 1) {
        const question = engine.makeQuestion({ ...questionArgs(skill, tier, ordinal), representation: "PICTORIAL" });
        assert.equal(question.inputMethod, "STRATEGY_BUILD", `${skillId}/${question.taskType}: governed renderer`);
        observedStrategyVariants.add(strategySemanticVariantKey(question));
        const selectedMethods = skillId === "MQ-095" ? ["mental", "written"] : [null];
        for (const selectedMethod of selectedMethods) {
          assertStrategyResponse(engine, assert, question, { skillId, selectedMethod, correctStrategyBuildResponse, cloneJson });
        }
      }
    }
  }
  assert.deepEqual([...observedStrategyVariants].sort(), [...EXPECTED_STRATEGY_SEMANTIC_VARIANTS].sort(), "all 17 STRATEGY_BUILD task/prompt variants");
}

function categorizedSort({ engine, assert, skills, requireSkill, questionArgs, structuredAnswerFor, incorrectSortSubmission }) {
  const mq007 = engine.makeQuestion({
    ...questionArgs(requireSkill(skills, "MQ-007 sorting", (skill) => skill.id === "MQ-007"), "EASY", 0),
    representation: "PICTORIAL",
  });
  assert.equal(mq007.inputMethod, "SORT_BINS");
  const sortCategories = mq007.modelDescriptor.values.categories;
  assert.ok(Array.isArray(sortCategories) && [2, 3].includes(sortCategories.length));
  const sorted = structuredAnswerFor(engine, mq007);
  assert.equal(engine.gradeAnswer(mq007, sorted).correct, true);
  const displacedSort = incorrectSortSubmission(mq007, sorted);
  const categoryIds = new Set(sortCategories.map((category) => String(category.id)));
  assert.ok(Object.values(displacedSort.placements).every((bin) => categoryIds.has(bin)));
  const displacedSortGrade = engine.gradeAnswer(mq007, displacedSort);
  assert.equal(displacedSortGrade.valid, true);
  assert.equal(displacedSortGrade.correct, false);
}

function catalogInputMethods({ engine, assert, skills, constants, optionValue, answerFor, questionArgs }) {
  const seen = new Set();
  for (const skill of skills) {
    for (let ordinal = 0; ordinal < 4; ordinal += 1) {
      const question = engine.makeQuestion(questionArgs(skill, "HARD/TARGET", ordinal, { representation: "PICTORIAL" }));
      seen.add(question.inputMethod);
      assert.equal(engine.gradeAnswer(question, answerFor(engine, question)).correct, true, `${skill.id}/${ordinal}`);
      assert.equal(question.inputClass, constants.INPUT_CLASS_BY_METHOD[question.inputMethod], `${skill.id}: input contract`);
      if (question.inputClass === "SELECTION") {
        const correct = question.options.filter((option) => engine.gradeAnswer(question, optionValue(option)).correct);
        assert.equal(correct.length, 1, `${skill.id}: unique correct option`);
        assert.equal(question.options[question.correctIndex], correct[0], `${skill.id}: correctIndex`);
      } else {
        assert.equal(question.options.length, 0, `${skill.id}: construction options`);
        assert.equal(question.correctIndex, -1, `${skill.id}: construction index`);
      }
    }
  }
  assert.ok(seen.size >= 2, "manifest exercises more than one input method");
}

export function assertInputMethodBehavior(context) {
  selectionAndConstruction(context);
  strategyResponses(context);
  categorizedSort(context);
  catalogInputMethods(context);
}

function assertRationalInputs(engine, assert) {
  const rational = { inputClass: "CONSTRUCTION", answer: { kind: "rational", value: "1/2" } };
  assert.equal(engine.gradeAnswer(rational, "2/4").correct, true);
  assert.equal(engine.gradeAnswer(rational, "nope").valid, false);
  assert.equal(engine.parseFraction("1 1/2", { targetForm: "MIXED" }).valid, true);
  assert.equal(engine.parseFraction("3/2", { targetForm: "MIXED" }).valid, false);
  assert.equal(engine.parseFraction("3/2", { targetForm: "IMPROPER" }).valid, true);
  assert.equal(engine.fractionsEquivalent({ left: "1/2", right: "2/4" }).equivalent, true);
  assert.equal(engine.fractionsEquivalent({ left: "1/2", right: "2/5" }).equivalent, false);
}

function assertStrategyResponse(engine, assert, question, { skillId, selectedMethod, correctStrategyBuildResponse, cloneJson }) {
  const response = correctStrategyBuildResponse(question, selectedMethod);
  assert.deepEqual(Object.keys(response).sort(), ["strategy", "value", "work"], `${skillId}: closed response keys`);
  assert.equal(engine.gradeAnswer(question, response).correct, true, `${skillId}/${question.taskType}/${response.strategy}: independent response`);
  const missingWork = { strategy: response.strategy, work: response.work.slice(0, -1), value: response.value };
  assert.equal(engine.gradeAnswer(question, missingWork).correct, false, `${skillId}/${question.taskType}/${response.strategy}: missing work`);
  const wrongWork = { strategy: response.strategy, work: [...response.work], value: response.value };
  wrongWork.work[0] = `${String(wrongWork.work[0])}-wrong`;
  assert.equal(engine.gradeAnswer(question, wrongWork).correct, false, `${skillId}/${question.taskType}/${response.strategy}: wrong work`);
  const extraKey = { ...response, action: response.strategy };
  assert.equal(engine.gradeAnswer(question, extraKey).valid, false, `${skillId}: legacy/extra action key`);
  const hostileMetadata = cloneJson(question);
  hostileMetadata.params = { ...hostileMetadata.params, strategy: "hostile-hidden-strategy" };
  hostileMetadata.answer = { ...hostileMetadata.answer, value: "hostile-hidden-answer" };
  assert.equal(engine.gradeAnswer(hostileMetadata, response).correct, true, `${skillId}: grading trusted hidden strategy/answer`);
}
