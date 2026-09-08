import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createSourceExtractor } from "./source-extraction.mjs";
import { buildExhaustiveResponseState } from "../lib/exhaustive-response-fixtures.mjs";

const extractor = createSourceExtractor(readFileSync(new URL("../exhaustive-generator-audit.mjs", import.meta.url), "utf8"), { sourceType: "module" });
const context = { skill: { skillId: "MQ-001" }, tier: "EASY", representation: "CONCRETE", theme: "ocean", ordinal: 0, choiceSeed: 1 };

function auditFunctions(names, globals) {
  const declarations = names.map((name) => extractor.functionDeclaration(name)).join("\n");
  return new vm.Script(`(()=>{${declarations};return {${names.join(",")}};})()`).runInNewContext(globals);
}

test("a returned null question cannot silently skip an audited sample", () => {
  const globals = { questionCount: 0, generatedSkills: new Set(), promptIds: new Set(), inputMethods: new Set(), answerKinds: new Set(), engine: { makeQuestion: () => null }, issue: () => assert.fail("not a caught generation exception") };
  const { auditQuestionSample } = auditFunctions(["sampleLabel", "makeAuditedQuestion", "recordQuestionMetadata", "auditQuestionSample"], globals);
  assert.throws(() => auditQuestionSample(context, new Map()), (error) => error.name === "TypeError" && /null/u.test(error.message));
  assert.equal(globals.questionCount, 1);
});

test("a caught generation exception records its failure and preserves attempt counting", () => {
  const issues = [];
  const globals = { questionCount: 0, engine: { makeQuestion: () => { throw new Error("generation failed"); } }, issue: (message) => issues.push(message) };
  const { auditQuestionSample } = auditFunctions(["sampleLabel", "makeAuditedQuestion", "auditQuestionSample"], globals);
  auditQuestionSample(context, new Map());
  assert.equal(globals.questionCount, 1);
  assert.deepEqual(issues, ["MQ-001/EASY/CONCRETE/ocean/0: fail-closed generation unavailable (generation failed)"]);
});

test("a returned null choice collection cannot silently skip required checks", () => {
  const globals = { choiceSearchCount: 0, engine: { makeQuestionChoices: () => null }, issue: () => assert.fail("not a caught generation exception") };
  const { auditChoiceSearch } = auditFunctions(["choiceLabel", "makeAuditedChoices", "auditChoiceSearch"], globals);
  assert.throws(() => auditChoiceSearch(context, false), (error) => error.name === "TypeError" && /null/u.test(error.message));
  assert.equal(globals.choiceSearchCount, 1);
});

test("malformed generated identities retain the requested skill in sample diagnostics", () => {
  const issues = [];
  const question = { skillId: "MQ-002", level: 1, theme: "ocean", tier: "EASY", promptStringId: "missing", modelDescriptor: null, inputClass: "CONSTRUCTION", inputMethod: "NUMBER_PAD", options: [{}], optionCount: 1, correctIndex: 0, answer: { value: "2" } };
  const globals = {
    questionCount: 0, generatedSkills: new Set(), promptIds: new Set(), inputMethods: new Set(), answerKinds: new Set(), records: new Map(), choiceOrdinals: [],
    engine: { makeQuestion: () => question, CONSTANTS: { INPUT_CLASS_BY_METHOD: { NUMBER_PAD: "CONSTRUCTION" } } },
    issue: (message) => issues.push(message), checkQuestionContract: () => {}, correctSubmission: () => "2", correct: () => false, checkReachability: () => {},
  };
  const names = ["sampleLabel", "makeAuditedQuestion", "recordQuestionMetadata", "checkRequestedQuestion", "checkPromptRendering", "checkModelInstruction", "checkGeneratedSubmission", "checkQuestionOptions", "auditQuestionSample"];
  auditFunctions(names, globals).auditQuestionSample({ ...context, skill: { skillId: "MQ-001", level: 1 } }, new Map());
  assert.deepEqual(issues, [
    "MQ-001: identity or level changed",
    "MQ-001: unknown prompt string missing",
    "MQ-001: missing registered model instruction",
    "MQ-001: generated answer fails its own grader (2)",
    "MQ-001: construction exposes selection metadata",
  ]);
});

function choiceProbe(compareWithBase) {
  const first = { questionId: "q1", prompt: "first", sampleKey: "s1", contract: "returned" };
  const second = { questionId: "q2", prompt: "second", sampleKey: "s2", contract: "returned" };
  const issues = [];
  const reached = [];
  const globals = {
    choiceSearchCount: 0, choicePairCount: 0, suppressedChoiceCount: 0,
    engine: { makeQuestionChoices: () => Object.freeze([first, second]), makeQuestion: () => ({ ...first, contract: "base" }) },
    issue: (message) => issues.push(message), choiceContract: (question) => question.contract,
    checkQuestionContract: () => {}, correctSubmission: () => "correct", correct: () => true,
    checkReachability: (question) => reached.push(question.questionId),
  };
  const names = ["choiceLabel", "makeAuditedChoices", "auditChoiceSearch", "checkFirstChoice", "checkChoiceCandidate", "checkChoiceSelection", "checkChoiceDiversity"];
  auditFunctions(names, globals).auditChoiceSearch(context, compareWithBase);
  return { issues, reached, globals };
}

test("ordinary and boundary choice searches retain their different reference contracts", () => {
  const ordinary = choiceProbe(false);
  assert.deepEqual(ordinary.issues, []);
  assert.deepEqual(ordinary.reached, ["q1", "q2"]);
  assert.equal(ordinary.globals.choicePairCount, 1);
  const boundary = choiceProbe(true);
  assert.deepEqual(boundary.issues, [
    "MQ-001/EASY/CONCRETE/ocean/1/0/0: mastery/input contract changed",
    "MQ-001/EASY/CONCRETE/ocean/1/0/1: mastery/input contract changed",
  ]);
  assert.deepEqual(boundary.reached, ["q1", "q2"]);
});

test("suppressed-choice probing retains the complete bounded 32-offset search", () => {
  const ordinals = [];
  const engine = { makeQuestion: (args) => { ordinals.push(args.ordinal); return { prompt: "different", sampleKey: "different", contract: args.ordinal === 64 ? "same" : "other" }; } };
  const { missedChoiceAlternative } = auditFunctions(["missedChoiceAlternative"], { engine, choiceContract: (question) => question.contract });
  assert.equal(missedChoiceAlternative({ ordinal: 32 }, { prompt: "base", sampleKey: "base" }, "same"), true);
  assert.deepEqual(ordinals, Array.from({ length: 32 }, (_, index) => index + 33));
});

test("nested answer-bearing stimulus paths retain their first-match diagnostics", () => {
  const names = ["forbiddenStimulusPath", "forbiddenArrayStimulusPath", "forbiddenObjectStimulusPath"];
  const { forbiddenStimulusPath } = auditFunctions(names, { explicitResultKeys: new Set(["answer"]), answerBearingRoles: new Set(["target"]) });
  assert.equal(forbiddenStimulusPath({ items: [{ label: "safe" }, { role: "target", answer: 3 }] }), "stimulus.items[1].role=target");
  assert.equal(forbiddenStimulusPath({ items: [{ answer: 3 }] }), "stimulus.items[0].answer");
  assert.equal(forbiddenStimulusPath({ items: [null, 0, "safe"] }), null);
});

test("scalar bypass failures remain visible for both acceptance and wrong rejection reason", () => {
  const issues = [];
  const engine = { gradeAnswer: () => ({ valid: true, correct: true }) };
  const { checkScalarBypass } = auditFunctions(["checkScalarBypass"], { engine, issue: (message) => issues.push(message) });
  const question = { skillId: "MQ-001", inputMethod: "PAIR_LINK", answer: { value: "equal" } };
  checkScalarBypass(question);
  engine.gradeAnswer = () => ({ valid: false, correct: false, reason: "wrong-reason" });
  checkScalarBypass(question);
  engine.gradeAnswer = () => ({ valid: false, correct: false, reason: "structured-response-required" });
  checkScalarBypass(question);
  assert.deepEqual(issues, Array(2).fill("MQ-001: PAIR_LINK accepted a scalar answer bypass"));
});

test("sample-key negative controls remain once-per-method and reject evidentiary mutations", () => {
  const issues = [];
  let attempts = 0;
  const engine = { validateQuestionContract: () => ({ valid: true, errors: [] }), submitAnswer: () => { attempts += 1; return { evidenceClass: "EVIDENCE" }; } };
  const globals = { engine, issue: (message) => issues.push(message), contractMutationMethods: new Set(), structuredResponseMethods: new Set() };
  const { checkSampleKeyMutation } = auditFunctions(["checkSampleKeyMutation"], globals);
  const question = { skillId: "MQ-001", inputMethod: "NUMBER_PAD", sampleKey: "original", answer: { value: "1" } };
  checkSampleKeyMutation(question);
  checkSampleKeyMutation(question);
  assert.equal(attempts, 1);
  assert.equal(question.sampleKey, "original");
  assert.deepEqual(issues, ["MQ-001: sample-identity mutation escaped the fail-closed contract", "MQ-001: invalid contract produced evidentiary attempt"]);
});

test("the orchestrator passes its independent strategy oracle into the library helper", () => {
  const question = { skillId: "MQ-095", inputMethod: "STRATEGY_BUILD", answer: { value: "3" } };
  const calls = [];
  const oracle = (actual, method) => { calls.push([actual, method]); return { strategy: "mental", work: ["1+2"], value: "3" }; };
  const engine = {
    createResponseState: () => ({}), isResponseComplete: () => true, serializeResponse: (_question, state) => state,
    gradeAnswer: (_question, payload) => typeof payload === "object"
      ? { valid: true, correct: true } : { valid: false, correct: false, reason: "structured-response-required" },
  };
  const globals = { engine, buildExhaustiveResponseState, correctStrategyBuildResponse: oracle, issue: (message) => assert.fail(message), structuredResponseMethods: new Set(["STRATEGY_BUILD"]), observedStructuredMethods: new Set() };
  const names = ["correctSubmission", "checkStructuredPayload", "checkSortMutation", "checkScalarBypass"];
  const result = auditFunctions(names, globals).correctSubmission(question);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], question);
  assert.equal(calls[0][1], "mental");
  assert.deepEqual({ ...result, work: [...result.work] }, { strategy: "mental", work: ["1+2"], value: "3" });
});
