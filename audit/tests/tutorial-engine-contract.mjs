import assert from "node:assert/strict";
import { canonicalizeJson } from "../lib/curriculum-manifest.mjs";
import { assertEngineStrategyBoundaryContract } from "./engine-strategy-boundary-contract.mjs";

const EXPECTED_PHASES = Object.freeze(["NOTICE", "PLAN", "CHECK"]);
const EXPECTED_RESOLUTION_COUNTS = Object.freeze({
  SAME_TASK_DIFFERENT_ANSWER: 149,
  SIBLING_TASK_DIFFERENT_ANSWER: 5,
  PROCEDURE_ONLY: 12,
});

function responseStructure(engine, question, includeTaskType) {
  const structure = {
    semanticPromptStringId: question.semanticPromptStringId,
    representation: question.representation,
    inputClass: question.inputClass,
    inputMethod: question.inputMethod,
    answerKind: question.answer.kind,
    targetForm: question.answer.targetForm,
    optionCount: question.optionCount,
    responseKeys: Object.keys(engine.createResponseState(question)).sort(),
  };
  if (includeTaskType) structure.taskType = question.taskType;
  return canonicalizeJson(structure);
}

function factFamilyProjection(question) {
  const a = Number(question.params.a);
  const b = Number(question.params.b);
  const whole = Number(question.params.whole);
  const multiplyDivide = question.params.equationFamily === "multiply-divide";
  const equationFamily = multiplyDivide ? "multiply-divide" : "add-subtract";
  const equations = (multiplyDivide
    ? [`${a}×${b}=${whole}`, `${b}×${a}=${whole}`, `${whole}÷${a}=${b}`, `${whole}÷${b}=${a}`]
    : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}−${a}=${b}`, `${whole}−${b}=${a}`]).sort();
  return canonicalizeJson({ kind: "fact-family", equationFamily, equations });
}

function independentTerminalProjection(question) {
  return question.inputMethod === "FACT_FAMILY"
    ? factFamilyProjection(question)
    : canonicalizeJson({
      kind: question.answer.kind,
      targetForm: question.answer.targetForm,
      value: question.answer.value,
    });
}

export function tutorialSourceQuestion(engine, skill, taskIndex) {
  return engine.makeQuestion({
    skillId: skill.skillId,
    tier: "HARD/TARGET",
    representation: "PICTORIAL",
    theme: "forest",
    seed: 1_297_175_628,
    ordinal: taskIndex,
    eligibleQuestionOrdinal: taskIndex,
    scheduledReview: false,
    coldTest: false,
    preview: false,
    scaffolded: false,
  });
}

function assertPlanStructure(engine, source, plan, binding) {
  const example = plan.example;
  if (binding.resolutionMode === "SIBLING_TASK_DIFFERENT_ANSWER") {
    assert.equal(example.taskType, binding.siblingTaskType);
    assert.notEqual(example.taskType, source.taskType);
    assert.equal(responseStructure(engine, example, false), responseStructure(engine, source, false));
    assert.equal(plan.compatibilityContractId, "MQ048_TOKEN_VALUE_LOOKUP");
  } else {
    assert.equal(responseStructure(engine, example, true), responseStructure(engine, source, true));
  }
}

function assertPlanIdentity(source, plan, binding) {
  const example = plan.example;
  assert.equal(plan.resolutionMode, binding.resolutionMode);
  assert.equal(plan.answerDisclosurePolicy, binding.answerDisclosurePolicy);
  assert.equal(plan.contractVersion, "tutorial-contract-v2");
  assert.deepEqual(Array.from(plan.phaseBindings, (record) => record.phaseId), EXPECTED_PHASES);
  assert.ok(plan.visualTeachingContractId.startsWith("VISUAL_TEACHING_"));
  assert.notEqual(example.questionId, source.questionId);
  assert.notEqual(example.sampleKey, source.sampleKey);
  assert.notEqual(canonicalizeJson(example.params), canonicalizeJson(source.params));
  assert.equal(example.preview, true);
  assert.equal(example.scaffolded, true);
  assert.equal(example.coldTest, false);
  assert.equal(example.scheduledReview, false);
}

function assertAnswerPolicy(source, plan, binding, skill) {
  const example = plan.example;
  if (binding.answerDisclosurePolicy === "DIFFERENT_ANSWER_REQUIRED") {
    assert.notEqual(
      independentTerminalProjection(example),
      independentTerminalProjection(source),
      `${skill.skillId}/${source.taskType} must have a different terminal answer`,
    );
    return Number(String(example.answer.value) === String(source.answer.value));
  }
  assert.equal(binding.resolutionMode, "PROCEDURE_ONLY");
  assert.equal(example.taskType, source.taskType);
  return 0;
}

function assertObligation(engine, skill, taskType, taskIndex, binding) {
  const source = tutorialSourceQuestion(engine, skill, taskIndex);
  const plan = engine.makeTutorialPlan(source);
  assert.ok(binding, `${skill.skillId}/${taskType} needs an exact resolution binding`);
  assert.ok(plan, `${skill.skillId}/${taskType} needs a tutorial`);
  assert.equal(source.taskType, taskType);
  assertPlanStructure(engine, source, plan, binding);
  assertPlanIdentity(source, plan, binding);
  return assertAnswerPolicy(source, plan, binding, skill);
}

function assertInvalidTutorialBoundaries(engine) {
  const source = tutorialSourceQuestion(engine, engine.SKILLS[0], 0);
  assert.equal(engine.tutorialEntryFor(null), null);
  assert.equal(engine.tutorialEntryFor({ ...source, inputMethod: "UNKNOWN" }), null);
  assert.equal(engine.tutorialEntryFor({ ...source, semanticPromptStringId: "question.unknown" }), null);
  assert.equal(engine.tutorialEntryFor({ ...source, taskType: "unknown" }), null);
  assert.equal(engine.makeTutorialQuestion(null), null);
  assert.equal(engine.makeTutorialPlan(null), null);
  assert.equal(engine.makeTeachingSupport(null), null);
}

export function assertTutorialEngineContract(engine, manifest = engine.TUTORIAL_MANIFEST) {
  assertInvalidTutorialBoundaries(engine);
  let obligations = 0;
  let structuredAnswersBeyondShallowValue = 0;
  const resolutionCounts = { SAME_TASK_DIFFERENT_ANSWER: 0, SIBLING_TASK_DIFFERENT_ANSWER: 0, PROCEDURE_ONLY: 0 };
  const bindingByKey = new Map(manifest.obligationBindings.map((record) => [`${record.skillId}|${record.taskType}`, record]));
  for (const skill of engine.SKILLS) {
    const taskTypes = skill.constraints.taskTypes ?? [skill.generatorProfile];
    for (const [taskIndex, taskType] of taskTypes.entries()) {
      const binding = bindingByKey.get(`${skill.skillId}|${taskType}`);
      structuredAnswersBeyondShallowValue += assertObligation(engine, skill, taskType, taskIndex, binding);
      resolutionCounts[binding.resolutionMode] += 1;
      obligations += 1;
    }
  }
  assert.equal(obligations, manifest.curriculumBinding.taskObligationCount);
  assert.deepEqual(resolutionCounts, EXPECTED_RESOLUTION_COUNTS);
  assert.equal(
    structuredAnswersBeyondShallowValue,
    2,
    "both fact-family obligations need full-equation terminal projections rather than their shallow sentinel value",
  );
  return Object.freeze({ obligations, resolutionCounts: Object.freeze(resolutionCounts), structuredAnswersBeyondShallowValue });
}

export function assertEngineCoverageContracts(engine, manifest = engine.TUTORIAL_MANIFEST) {
  const tutorial = assertTutorialEngineContract(engine, manifest);
  assertEngineStrategyBoundaryContract(engine);
  return tutorial;
}
