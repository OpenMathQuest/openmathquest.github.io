import assert from "node:assert/strict";

export const STRATEGY_BUILD_SKILL_IDS = Object.freeze([
  "MQ-040", "MQ-041", "MQ-079", "MQ-095", "MQ-097", "MQ-101",
]);

export const EXPECTED_STRATEGY_SEMANTIC_VARIANTS = Object.freeze([
  "MQ-040|add-by-counting-on|question.addition",
  "MQ-040|add-by-making-ten|question.makeTen",
  "MQ-040|add-by-known-bond|question.appliedAddition",
  "MQ-041|subtract-by-counting-back|question.subtraction",
  "MQ-041|subtract-by-counting-up|question.subtraction",
  "MQ-041|subtract-by-known-bond|question.appliedSubtraction",
  "MQ-079|multiply-two-digits-by-one-digit|question.multiplication",
  "MQ-079|multiply-two-digits-by-one-digit|question.appliedMultiplication",
  "MQ-095|addition|question.addition",
  "MQ-095|addition|question.appliedAddition",
  "MQ-095|subtraction|question.subtraction",
  "MQ-095|subtraction|question.appliedSubtraction",
  "MQ-097|addition|question.parity",
  "MQ-097|subtraction|question.parity",
  "MQ-097|multiplication|question.parity",
  "MQ-101|addition|question.missingPart",
  "MQ-101|subtraction|question.missingSubtrahend",
]);

const additionMethods = Object.freeze({
  "add-by-counting-on": "count-on",
  "add-by-making-ten": "make-ten",
  "add-by-known-bond": "known-bond",
});

const subtractionMethods = Object.freeze({
  "subtract-by-counting-back": "count-back",
  "subtract-by-counting-up": "count-up",
  "subtract-by-known-bond": "known-bond",
});

function integers(question) {
  const left = Number(question.params?.a);
  const right = Number(question.params?.b);
  assert.ok(Number.isSafeInteger(left) && Number.isSafeInteger(right), `${question.skillId}: integer operands`);
  return { left, right };
}

function parityExpression(question) {
  const match = String(question.params?.expression ?? "").match(/^(\d+)\s*([+−×])\s*(\d+)$/u);
  assert.ok(match, `${question.skillId}: governed parity expression`);
  return { left: Number(match[1]), operator: match[2], right: Number(match[3]) };
}

export function strategySemanticVariantKey(question) {
  return `${question.skillId}|${question.taskType}|${question.semanticPromptStringId}`;
}

export function strategyMethodOracle(question, selectedMethod = null) {
  switch (question.skillId) {
    case "MQ-040": return additionMethods[question.taskType] ?? null;
    case "MQ-041": return subtractionMethods[question.taskType] ?? null;
    case "MQ-079": return ["partition", "array", "written layout"][Number(question.ordinal) % 3] ?? null;
    case "MQ-095": {
      assert.ok(["mental", "written"].includes(selectedMethod), "MQ-095 requires an explicit self-selected method");
      return selectedMethod;
    }
    case "MQ-097": {
      const { left, operator, right } = parityExpression(question);
      if (operator === "×") {
        return left % 2 === 0 || right % 2 === 0
          ? "an even factor makes an even product"
          : "two odd factors make an odd product";
      }
      return left % 2 === right % 2
        ? "same-parity numbers give an even result"
        : "different-parity numbers give an odd result";
    }
    case "MQ-101": return "use subtraction";
    default: return null;
  }
}

export function strategyResultOracle(question) {
  if (["MQ-040", "MQ-041", "MQ-079", "MQ-095"].includes(question.skillId)) {
    const { left, right } = integers(question);
    if (question.skillId === "MQ-040" || question.skillId === "MQ-095" && question.taskType === "addition") return left + right;
    if (question.skillId === "MQ-041" || question.skillId === "MQ-095" && question.taskType === "subtraction") return left - right;
    if (question.skillId === "MQ-079") return left * right;
    assert.fail(`${question.skillId}: undeclared operation ${question.taskType}`);
  }
  if (question.skillId === "MQ-097") {
    const { left, operator, right } = parityExpression(question);
    const result = operator === "+" ? left + right : operator === "−" ? left - right : left * right;
    return result % 2 === 0 ? "even" : "odd";
  }
  if (question.skillId === "MQ-101") {
    const whole = Number(question.params?.whole);
    const known = question.semanticPromptStringId === "question.missingSubtrahend"
      ? Number(question.params?.result)
      : Number(question.params?.part);
    assert.ok(Number.isSafeInteger(whole) && Number.isSafeInteger(known), "MQ-101: whole and known part");
    return whole - known;
  }
  assert.fail(`${question.skillId}: no strategy result oracle`);
}

function writtenWork(left, right, operator) {
  const width = Math.max(String(Math.abs(left)).length, String(Math.abs(right)).length);
  const top = String(Math.abs(left)).padStart(width, "0").split("").map(Number);
  const bottom = String(Math.abs(right)).padStart(width, "0").split("").map(Number);
  const work = [];
  if (operator === "+") {
    let carry = 0;
    for (let index = width - 1; index >= 0; index -= 1) {
      const column = top[index] + bottom[index] + carry;
      work.push(String(column));
      carry = Math.floor(column / 10);
    }
    if (carry) work.push(String(carry));
    return work;
  }
  const working = [...top];
  for (let index = width - 1; index >= 0; index -= 1) {
    let regroup = "no";
    if (working[index] < bottom[index]) {
      regroup = "yes";
      let lender = index - 1;
      while (lender >= 0 && working[lender] === 0) lender -= 1;
      assert.ok(lender >= 0, "subtraction generator keeps the minuend at least the subtrahend");
      working[lender] -= 1;
      for (let fill = lender + 1; fill < index; fill += 1) working[fill] = 9;
      working[index] += 10;
    }
    work.push(regroup, String(working[index] - bottom[index]));
  }
  return work;
}

export function strategyWorkOracle(question, selectedMethod = null) {
  const strategy = strategyMethodOracle(question, selectedMethod);
  const result = strategyResultOracle(question);
  if (question.skillId === "MQ-040") {
    const { left, right } = integers(question);
    if (strategy === "count-on") {
      const start = Math.max(left, right), count = Math.min(left, right);
      return Array.from({ length: count }, (_, index) => String(start + index + 1));
    }
    if (strategy === "make-ten") {
      const fill = 10 - left;
      return [String(fill), String(right - fill)];
    }
    return [String(left), String(right)];
  }
  if (question.skillId === "MQ-041") {
    const { left, right } = integers(question);
    if (strategy === "count-back") return Array.from({ length: right }, (_, index) => String(left - index - 1));
    if (strategy === "count-up") return Array.from({ length: left - right }, (_, index) => String(right + index + 1));
    return [String(right), String(result)];
  }
  if (question.skillId === "MQ-079") {
    const { left, right } = integers(question);
    const multiplicand = [left, right].find((value) => value >= 10 && value <= 99);
    const multiplier = [left, right].find((value) => value >= 1 && value <= 9);
    assert.ok(Number.isSafeInteger(multiplicand) && Number.isSafeInteger(multiplier), "MQ-079 is exactly two digits by one digit");
    const tens = Math.floor(multiplicand / 10) * 10, ones = multiplicand % 10;
    if (strategy === "array") return [String(multiplicand), String(multiplier)];
    if (strategy === "partition") return [String(tens), String(ones), String(tens * multiplier), String(ones * multiplier)];
    const onesProduct = ones * multiplier;
    return [String(onesProduct), String(Math.floor(onesProduct / 10)), String(Math.floor(multiplicand / 10) * multiplier + Math.floor(onesProduct / 10))];
  }
  if (question.skillId === "MQ-095") {
    const { left, right } = integers(question);
    const operator = question.taskType === "addition" ? "+" : "−";
    if (strategy === "written") return writtenWork(left, right, operator);
    const chunks = String(Math.abs(right)).split("").map((digit, index, digits) => Number(digit) * 10 ** (digits.length - index - 1)).filter(Boolean);
    let running = left;
    return chunks.map((chunk) => String(running = operator === "+" ? running + chunk : running - chunk));
  }
  if (question.skillId === "MQ-097") {
    const { left, right } = parityExpression(question);
    return [left % 2 ? "odd" : "even", right % 2 ? "odd" : "even"];
  }
  if (question.skillId === "MQ-101") {
    const known = question.semanticPromptStringId === "question.missingSubtrahend"
      ? Number(question.params.result)
      : Number(question.params.part);
    return [String(known), String(result)];
  }
  assert.fail(`${question.skillId}: no strategy work oracle`);
}

export function correctStrategyBuildResponse(question, selectedMethod = null) {
  const strategy = strategyMethodOracle(question, selectedMethod);
  return {
    strategy,
    work: strategyWorkOracle(question, selectedMethod),
    value: strategyResultOracle(question),
  };
}
