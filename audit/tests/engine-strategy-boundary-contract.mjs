import assert from "node:assert/strict";

function strategyQuestion(skillId, {
  answer = { kind: "number", value: "0" },
  ordinal = 0,
  params = {},
  semanticPromptStringId = "",
  taskType = "",
} = {}) {
  return {
    answer,
    ordinal,
    params,
    questionId: `strategy-boundary-${skillId}-${ordinal}`,
    semanticPromptStringId,
    skillId,
    taskType,
  };
}

function assertExpectedArithmeticResults(engine) {
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-040", { params: { a: 3, b: 4 } })), 7);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-041", { params: { a: 7, b: 3 } })), 4);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-079", { params: { a: 7, b: 3 } })), 21);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-095", { taskType: "addition", params: { a: 9, b: 4 } })), 13);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-095", { taskType: "subtraction", params: { a: 9, b: 4 } })), 5);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-095", { taskType: "unknown", params: { a: 9, b: 4 } })), null);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-040", { params: { a: "not-a-number", b: 4 } })), null);
}

function assertExpectedSpecialResults(engine) {
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-097", { params: { expression: "invalid" } })), null);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-097", { params: { expression: "2 + 3" } })), "odd");
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-097", { params: { expression: "3 × 3" } })), "odd");
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-101", { semanticPromptStringId: "question.missingSubtrahend", params: { whole: 12, result: 5 } })), 7);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-101", { params: { whole: 12, part: 7 } })), 5);
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-X", { answer: { kind: "text", value: "exact" } })), "exact");
  assert.equal(engine.strategyExpectedResult(strategyQuestion("MQ-X", { answer: { kind: "number", value: "6" } })), 6);
}

function assertEarlyGovernedStrategies(engine) {
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-040", { taskType: "add-by-counting-on" })), "count-on");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-040", { taskType: "add-by-making-ten" })), "make-ten");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-040", { taskType: "add-by-known-bond" })), "known-bond");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-040", { taskType: "unknown" })), null);
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-041", { taskType: "subtract-by-counting-back" })), "count-back");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-041", { taskType: "subtract-by-counting-up" })), "count-up");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-041", { taskType: "subtract-by-known-bond" })), "known-bond");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-041", { taskType: "unknown" })), null);
}

function assertMultiplicationMethodCycle(engine) {
  const taskCount = engine.SKILL_BY_ID["MQ-079"].constraints.taskTypes.length;
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-079", { ordinal: 0 })), "partition");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-079", { ordinal: taskCount })), "array");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-079", { ordinal: taskCount * 2 })), "written layout");
}

function assertAdvancedGovernedStrategies(engine) {
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-097", { params: { expression: "invalid" } })), null);
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-097", { params: { expression: "2 × 3" } })), "an even factor makes an even product");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-097", { params: { expression: "3 × 5" } })), "two odd factors make an odd product");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-097", { params: { expression: "2 + 4" } })), "same-parity numbers give an even result");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-097", { params: { expression: "2 + 3" } })), "different-parity numbers give an odd result");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-101")), "use subtraction");
  assert.equal(engine.governedStrategy(strategyQuestion("MQ-X")), null);
}

function assertEarlyNumberStrategies(engine) {
  const addition = strategyQuestion("MQ-040", { params: { a: 8, b: 5 } });
  const subtraction = strategyQuestion("MQ-041", { params: { a: 13, b: 5 } });
  assert.equal(engine.strategyWorkSpecification(addition, "count-on").kind, "number-line-jumps");
  assert.equal(engine.strategyWorkSpecification(subtraction, "count-back").kind, "number-line-jumps");
  assert.equal(engine.strategyWorkSpecification(subtraction, "count-up").kind, "number-line-jumps");
  assert.equal(engine.strategyWorkSpecification(addition, "make-ten").kind, "ten-frame-decomposition");
  assert.equal(engine.strategyWorkSpecification(addition, "known-bond").kind, "number-bond-decomposition");
  assert.equal(engine.strategyWorkSpecification(subtraction, "known-bond").kind, "number-bond-decomposition");
  assert.equal(engine.strategyWorkSpecification(addition, "unknown"), null);
}

function assertMultiplicationStrategies(engine) {
  const multiplication = strategyQuestion("MQ-079", { params: { a: 23, b: 4 } });
  assert.equal(engine.strategyWorkSpecification(multiplication, "array").kind, "array-construction");
  assert.equal(engine.strategyWorkSpecification(multiplication, "partition").kind, "partition-construction");
  assert.equal(engine.strategyWorkSpecification(multiplication, "written layout").kind, "written-construction");
  assert.equal(engine.strategyWorkSpecification(multiplication, "unknown"), null);
  assert.equal(engine.strategyWorkSpecification(strategyQuestion("MQ-079", { params: { a: 3, b: 100 } }), "array"), null);
}

function assertGeneralStrategies(engine) {
  const mentalAddition = strategyQuestion("MQ-095", { taskType: "addition", params: { a: 150, b: 23 } });
  const mentalSubtraction = strategyQuestion("MQ-095", { taskType: "subtraction", params: { a: 150, b: 23 } });
  const writtenCarry = strategyQuestion("MQ-095", { taskType: "addition", params: { a: 99, b: 2 } });
  const writtenRegroup = strategyQuestion("MQ-095", { taskType: "subtraction", params: { a: 1000, b: 1 } });
  assert.equal(engine.strategyWorkSpecification(mentalAddition, "mental").kind, "mental-construction");
  assert.equal(engine.strategyWorkSpecification(mentalSubtraction, "mental").kind, "mental-construction");
  assert.equal(engine.strategyWorkSpecification(writtenCarry, "written").kind, "written-construction");
  assert.equal(engine.strategyWorkSpecification(writtenRegroup, "written").kind, "written-construction");
  assert.equal(engine.strategyWorkSpecification(mentalAddition, "unknown"), null);
  assert.equal(engine.strategyWorkSpecification(strategyQuestion("MQ-097", { params: { expression: "2 + 3" } }), "prove").kind, "parity-proof");
  assert.equal(engine.strategyWorkSpecification(strategyQuestion("MQ-097", { params: { expression: "invalid" } }), "prove"), null);
  assert.equal(engine.strategyWorkSpecification(strategyQuestion("MQ-101", { semanticPromptStringId: "question.missingSubtrahend", params: { whole: 12, result: 5 } }), "solve").kind, "number-bond-decomposition");
  assert.equal(engine.strategyWorkSpecification(strategyQuestion("MQ-X"), "unknown"), null);
}

export function assertEngineStrategyBoundaryContract(engine) {
  assertExpectedArithmeticResults(engine);
  assertExpectedSpecialResults(engine);
  assertEarlyGovernedStrategies(engine);
  assertMultiplicationMethodCycle(engine);
  assertAdvancedGovernedStrategies(engine);
  assertEarlyNumberStrategies(engine);
  assertMultiplicationStrategies(engine);
  assertGeneralStrategies(engine);
}
