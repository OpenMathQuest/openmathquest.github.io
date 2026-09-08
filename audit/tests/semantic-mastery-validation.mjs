export function masteryAttempt(engine, skill, taskType, playDay, { ordinal, ...overrides }) {
  return {
    recordId: `semantic-${skill.skillId}-${taskType}-${ordinal}`,
    questionId: `semantic-q-${ordinal}`,
    skillId: skill.skillId,
    level: skill.level,
    stage: skill.stage,
    taskType,
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    inputClass: "CONSTRUCTION",
    inputMethod: "NUMBER_PAD",
    selectionOptionCount: 0,
    evidenceClass: "CONSTRUCTION",
    feedbackClass: "FIRST_TRY_CLEAN",
    coldTest: true,
    scheduledReview: false,
    sampleKey: `${skill.skillId}|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|${taskType}|${ordinal}`,
    firstAnswerCorrect: true,
    hintUsed: false,
    changed: false,
    elapsed: 4_000,
    idleMs: 0,
    validTelemetry: true,
    guessingLike: false,
    modelUsed: false,
    applied: false,
    preview: false,
    capstone: false,
    reteachStep: false,
    sessionId: "semantic-mastery",
    playDay,
    ...overrides,
  };
}

function validateOrderedPhases({ engine, requireCondition, stateFrom, skill }) {
  requireCondition(skill.constraints.taskTypes.length === 2, "mastery fixture no longer has two task types");
  let state = engine.createInitialState(30_000);
  state = stateFrom(engine.applyAttempt(state, masteryAttempt(engine, skill, skill.constraints.taskTypes[0], 30_000, { ordinal: 0, ...{ representation: "CONCRETE" } })));
  requireCondition(state.skills[skill.skillId].acquisition !== "SOLID", "one task type incorrectly satisfied multi-type mastery");
  state = stateFrom(engine.applyAttempt(state, masteryAttempt(engine, skill, skill.constraints.taskTypes[1], 30_001, { ordinal: 1, ...{ representation: "PICTORIAL" } })));
  requireCondition(state.skills[skill.skillId].acquisition !== "SOLID", "concrete and pictorial evidence skipped the declared abstract phase");
  state = stateFrom(engine.applyAttempt(state, masteryAttempt(engine, skill, skill.constraints.taskTypes[0], 30_002, { ordinal: 2, ...{ representation: "ABSTRACT" } })));
  requireCondition(state.skills[skill.skillId].acquisition === "SOLID", "ordered CPA evidence with complete task-type coverage did not satisfy mastery");
  const witnessed = new Set(state.skills[skill.skillId].evidence.map((attempt) => attempt.taskType));
  requireCondition(skill.constraints.taskTypes.every((taskType) => witnessed.has(taskType)), "solid record lacks a declared task-type witness");
  requireCondition(state.skills[skill.skillId].evidence.every((attempt) => attempt.modelUsed === false), "modelUsed telemetry was required for a model witness");
}

function validateAbstractOnly({ engine, requireCondition, stateFrom, skill }) {
  let abstractOnly = engine.createInitialState(30_000);
  for (let ordinal = 0; ordinal < Math.max(3, skill.constraints.taskTypes.length); ordinal += 1) {
    const taskType = skill.constraints.taskTypes[ordinal % skill.constraints.taskTypes.length];
    abstractOnly = stateFrom(engine.applyAttempt(
      abstractOnly,
      masteryAttempt(engine, skill, taskType, 30_010 + ordinal, { ordinal: ordinal, ...{ representation: "ABSTRACT" } }),
    ));
  }
  requireCondition(abstractOnly.skills[skill.skillId].acquisition !== "SOLID", "abstract-only witnesses satisfied a skill that declares concrete/pictorial phases");
}

function validateWitnessImplementation({ extracted, requireCondition }) {
  const qualifyingStart = extracted.source.indexOf("function qualifyingWitness");
  const qualifyingEnd = extracted.source.indexOf("function beginSkill", qualifyingStart);
  const qualifyingSource = extracted.source.slice(qualifyingStart, qualifyingEnd);
  requireCondition(qualifyingStart >= 0 && qualifyingEnd > qualifyingStart, "mastery witness implementation was not found");
  requireCondition(!/supplementalMasteryNeedles|MQ-0(?:35|40|41|48|63)|evidenceFacet|tokenId|strategy/u.test(qualifyingSource), "mastery witness contains a skill-specific or sample-key facet bypass instead of manifest task coverage");
}

function validateStrategyBreadth({ engine, requireCondition, stateFrom }) {
  for (const strategySkillId of ["MQ-040", "MQ-041"]) {
    const strategySkill = engine.SKILLS.find((candidate) => candidate.skillId === strategySkillId);
    let strategyState = engine.createInitialState(30_100);
    for (const [ordinal, representation] of ["CONCRETE", "PICTORIAL", "ABSTRACT"].entries()) {
      strategyState = stateFrom(engine.applyAttempt(strategyState, masteryAttempt(engine, strategySkill, strategySkill.constraints.taskTypes[0], 30_100 + ordinal, { ordinal: ordinal, ...{ representation } })));
    }
    requireCondition(strategyState.skills[strategySkillId].acquisition !== "SOLID", `${strategySkillId}: one declared strategy task incorrectly satisfied mastery`);
    for (let taskIndex = 1; taskIndex < strategySkill.constraints.taskTypes.length; taskIndex += 1) {
      strategyState = stateFrom(engine.applyAttempt(strategyState, masteryAttempt(engine, strategySkill, strategySkill.constraints.taskTypes[taskIndex], 30_102 + taskIndex, { ordinal: 2 + taskIndex, ...{ representation: "ABSTRACT" } })));
    }
    requireCondition(strategyState.skills[strategySkillId].acquisition === "SOLID", `${strategySkillId}: all declared strategy task types did not satisfy mastery`);
  }
}

function validateTokenBreadth({ engine, requireCondition, canonical, stateFrom }) {
  const tokenSkill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-048");
  const expectedTokenTasks = ["match-practice-token-5-cents", "match-practice-token-10-cents", "match-practice-token-25-cents", "match-practice-token-1-dollar", "match-practice-token-2-dollars"];
  requireCondition(canonical(tokenSkill.phases) === canonical(["P"]) && tokenSkill.representation === "pictures-and-symbols", "MQ-048: manifest claims a representation phase the practice-token renderer does not provide");
  requireCondition(canonical(tokenSkill.constraints.taskTypes) === canonical(expectedTokenTasks), "MQ-048: manifest does not declare all five token-value mappings as mastery tasks");
  const tokenQuestions = expectedTokenTasks.map((taskType, ordinal) => engine.makeQuestion({
    skillId: tokenSkill.skillId,
    tier: ordinal === 2 ? "HARD/TARGET" : "EASY",
    representation: "PICTORIAL",
    seed: 1,
    ordinal,
    eligibleQuestionOrdinal: ordinal,
    coldTest: true,
  }));
  requireCondition(tokenQuestions.every((question, ordinal) => question.representation === "PICTORIAL" && question.taskType === expectedTokenTasks[ordinal]), "MQ-048: generated modes or task order drift from the P-only manifest");
  requireCondition(new Set(tokenQuestions.map((question) => question.params.tokenId)).size === 5, "MQ-048: deterministic five-question cycle does not expose all five practice tokens");
  const applyTokenQuestion = (stateBefore, question, playDay) => stateFrom(engine.applyAttempt(stateBefore, engine.submitAnswer(question, { optionId: question.options[question.correctIndex].optionId }, {
    promptFinishedAt: 0,
    submittedAt: 4_000,
    manipulationMs: 0,
    replayMs: 0,
    idleMs: 0,
    selectionEvents: [],
    sessionId: "semantic-token-breadth",
    playDay,
  })));
  let tokenState = engine.createInitialState(30_150);
  const falseAbstractQuestion = engine.makeQuestion({ skillId: tokenSkill.skillId, tier: "HARD/TARGET", representation: "ABSTRACT", seed: 1, ordinal: 4, eligibleQuestionOrdinal: 4, coldTest: true });
  tokenState = applyTokenQuestion(tokenState, falseAbstractQuestion, 30_150);
  for (let ordinal = 0; ordinal < tokenQuestions.length - 1; ordinal += 1) tokenState = applyTokenQuestion(tokenState, tokenQuestions[ordinal], 30_151 + ordinal);
  requireCondition(tokenState.skills[tokenSkill.skillId].acquisition !== "SOLID", "MQ-048: nonexistent Abstract witness counted toward P-only mastery");
  tokenState = applyTokenQuestion(tokenState, tokenQuestions.at(-1), 30_155);
  requireCondition(tokenState.skills[tokenSkill.skillId].acquisition === "SOLID", "MQ-048: all five distinct token witnesses did not satisfy mastery");
}

function validateFacetBreadth({ engine, requireCondition, stateFrom }) {
  for (const facetFixture of [
    { skillId: "MQ-035", phases: ["CONCRETE", "PICTORIAL"] },
    { skillId: "MQ-063", phases: ["CONCRETE", "PICTORIAL", "ABSTRACT"] },
  ]) {
    const facetSkill = engine.SKILLS.find((candidate) => candidate.skillId === facetFixture.skillId);
    let facetState = engine.createInitialState(30_200);
    for (const [ordinal, representation] of facetFixture.phases.entries()) {
      facetState = stateFrom(engine.applyAttempt(facetState, masteryAttempt(engine, facetSkill, facetSkill.constraints.taskTypes[0], 30_200 + ordinal, { ordinal: ordinal, ...{ representation } })));
    }
    requireCondition(facetState.skills[facetFixture.skillId].acquisition !== "SOLID", `${facetFixture.skillId}: one declared task type incorrectly satisfied mastery`);
    const finalOrdinal = facetFixture.phases.length;
    facetState = stateFrom(engine.applyAttempt(facetState, masteryAttempt(engine, facetSkill, facetSkill.constraints.taskTypes[1], 30_200 + finalOrdinal, { ordinal: finalOrdinal, ...{ representation: facetFixture.phases.at(-1) } })));
    requireCondition(facetState.skills[facetFixture.skillId].acquisition === "SOLID", `${facetFixture.skillId}: all declared task types did not satisfy mastery`);
  }
}

function validateAssistedEvidence({ engine, requireCondition, stateFrom, skill }) {
  const helped = engine.createInitialState(30_000);
  const helpedResult = stateFrom(engine.applyAttempt(
    helped,
    masteryAttempt(engine, skill, skill.constraints.taskTypes[0], 30_020, { ordinal: 0, ...{
      evidenceClass: "NON_EVIDENCE",
      hintUsed: true,
      modelUsed: true,
    } }),
  ));
  requireCondition(helpedResult.skills[skill.skillId].evidence.length === 0, "Help/model-assisted work entered mastery evidence");
}

export function validateMasteryCoverage(engine, extracted, oracle) {
  const skill = engine.SKILLS.find((candidate) => candidate.skillId === "MQ-049");
  const context = { engine, extracted, ...oracle, skill };
  validateOrderedPhases(context);
  validateAbstractOnly(context);
  validateWitnessImplementation(context);
  validateStrategyBreadth(context);
  validateTokenBreadth(context);
  validateFacetBreadth(context);
  validateAssistedEvidence(context);
}
