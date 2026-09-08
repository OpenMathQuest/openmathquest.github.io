// Independent mathematical expectations, separate from production grading.
function validateWholeRemainder(context, quotient, remainder) {
  const { id, question, requireCondition } = context;
  requireCondition(id === "question.remainderWhole" && question.answer.kind === "text" && question.answer.targetForm === "VALUE", `${question.skillId}: whole-remainder answer contract drifted`);
  requireCondition(question.answer.value === `${quotient} R ${remainder}`, `${question.skillId}: whole-remainder answer is inconsistent`);
}

function validateFractionalRemainder(context, total, divisor) {
  const { expect, id, question, requireCondition } = context;
  requireCondition(id === "question.remainderFraction" && question.answer.kind === "rational" && question.answer.targetForm === "MIXED", `${question.skillId}: fractional-remainder answer contract drifted`);
  requireCondition(/^[-+]?\d+\s+\d+\/\d+$/u.test(question.answer.value), `${question.skillId}: fractional-remainder answer is not a mixed number`);
  expect(total / divisor, "fractional remainder");
}

function validateRoundedRemainder(context, quotient, roundUp) {
  const { expect, id, question, requireCondition } = context;
  const direction = roundUp ? "round-up" : "round-down";
  const expectedId = roundUp ? "question.remainderInterpret" : "question.remainderFullGroups";
  requireCondition(id === expectedId && question.answer.kind === "integer", `${question.skillId}: ${direction} answer contract drifted`);
  expect(roundUp ? quotient + 1 : quotient, `${direction} remainder`);
}

const rules = Object.freeze({
  "question.addition"({ expect, p }) {
    expect(Number(p.a) + Number(p.b));
  },
  "question.subtraction"({ expect, p }) {
    expect(Number(p.a) - Number(p.b));
  },
  "question.multiplication"({ expect, p }) {
    expect(Number(p.a) * Number(p.b));
  },
  "question.division"({ expect, p }) {
    expect(Number(p.a) / Number(p.b));
  },
  "question.remainder"({ expect, p }) {
    expect(Number(p.a) % Number(p.b));
  },
  "question.relatedMultiplyDivide"({ expect, p, question, requireCondition }) {
    requireCondition(Number(p.groups) * Number(p.perGroup) === Number(p.product), `${question.skillId}: related multiplication equation is inconsistent`);
    expect(Number(p.product) / Number(p.groups));
  },
  "question.quotientRemainder"({ p, question, requireCondition }) {
    requireCondition(Number(p.quotient) * Number(p.divisor) + Number(p.remainder) === Number(p.total), `${question.skillId}: quotient and remainder do not reconstruct the dividend`);
    requireCondition(Number(p.remainder) > 0 && Number(p.remainder) < Number(p.divisor), `${question.skillId}: remainder is outside its valid range`);
    requireCondition(question.answer.value === `${p.quotient} R ${p.remainder}`, `${question.skillId}: quotient/remainder answer text is inconsistent`);
  },
  "question.pairObjects"({ expect, p }) {
    expect(Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count)));
  },
  "question.countSet"({ expect, question, requireCondition }) {
    const shown = question.modelDescriptor.values.items?.[0];
    requireCondition(shown?.kind === "counterSet" && Number.isInteger(Number(shown.magnitude)), `${question.skillId}: count-the-group source is not a visible object set`);
    expect(Number(shown.magnitude));
  },
  "question.patternVisualNext"({ p, question, requireCondition }) {
    const sequence = String(p.pattern || "").split(/\s+/u).filter(Boolean);
    const unit = String(p.unit || "").split(/\s+/u).filter(Boolean);
    requireCondition(unit.length === 2 && unit[0] !== unit[1], `${question.skillId}: visual AB unit is not two distinct shapes`);
    requireCondition(sequence.length >= 4 && sequence.every((value, index) => value === unit[index % unit.length]), `${question.skillId}: visual AB sequence does not repeat its unit`);
    requireCondition(String(question.answer.value) === unit[sequence.length % unit.length], `${question.skillId}: visual pattern answer is not independently derived from the repeat`);
  },
  "question.structuredQuantity"({ expect, p, question, requireCondition }) {
    const pattern = String(p.pattern);
    const filled = (pattern.match(/●/gu) || []).length;
    const open = (pattern.match(/○/gu) || []).length;
    const expectedCells = p.structure === "dice" ? 9 : 5;
    requireCondition(pattern.startsWith("[") && pattern.endsWith("]"), `${question.skillId}: structured quantity is not a bounded text pattern`);
    requireCondition(filled + open === expectedCells, `${question.skillId}: structured quantity has the wrong number of positions`);
    requireCondition(p.structure !== "dice" || (pattern.match(/\//gu) || []).length === 2, `${question.skillId}: dice pattern does not preserve a three-row layout`);
    expect(filled);
  },
  "question.orderSetConnection"({ expect, p }) {
    expect(String(p.marks || "").split(/\s+/u).filter(Boolean).length);
  },
  "question.frameNumber"({ expect, question, requireCondition }) {
    const frame = question.modelDescriptor.values.frames?.[0];
    requireCondition(Number(frame?.capacity) === 10, `${question.skillId}: number frame does not have ten cells`);
    expect(Number(frame?.value));
  },
  "question.numberBetween"({ expect, p }) {
    expect((Number(p.before) + Number(p.after)) / 2);
  },
  "question.oneMoreLess"({ expect, p }) {
    expect(Number(p.number) + (p.direction === "more" ? 1 : -1));
  },
  "question.secondPartition"({ expect, p }) {
    expect(Number(p.whole) - Number(p.secondA));
  },
  "question.missingPart"({ expect, p }) {
    expect(Number(p.whole) - Number(p.part));
  },
  "question.makeTenFrame"({ expect, id, p, question, requireCondition }) {
    expect(10 - Number(p.shown));
    const values = question.modelDescriptor.values;
    const frame = values.frames?.[0];
    requireCondition(Number(frame?.capacity) === 10 && Number(frame?.value) === Number(p.shown), `${question.skillId}: ten-frame stimulus does not match the shown part`);
    requireCondition(!Object.hasOwn(values, "strategy"), `${question.skillId}: cold ten-frame stimulus exposes the missing answer`);
    requireCondition(!Object.hasOwn(frame || {}, "label"), `${question.skillId}: ten-frame stimulus bypasses the child-string authority`);
    if (id === "question.hiddenPart") requireCondition(Number(frame?.coveredCount) === 10 - Number(p.shown), `${question.skillId}: opaque cover does not bind the hidden part`);
  },
  "question.missingSubtrahend"({ expect, p }) {
    expect(Number(p.whole) - Number(p.result));
  },
  "question.factFamily"({ expect, p, question, requireCondition }) {
    requireCondition(Number(p.a) + Number(p.b) === Number(p.whole), `${question.skillId}: fact family parts do not make whole`);
    expect(Number(p.b));
  },
  "question.teenBuild"({ expect, p }) {
    expect(10 + Number(p.ones));
  },
  "question.dataDifference"({ expect, p }) {
    expect(Math.abs(Number(p.first) - Number(p.second)));
  },
  "question.responseListDifference"({ expect, p, question, requireCondition }) {
    const responses = String(p.responses).split(/\s*,\s*/u).filter(Boolean);
    const counts = Object.fromEntries(["cat", "dog", "bird"].map((value) => [value, responses.filter((response) => response === value).length]));
    requireCondition(counts.cat === Number(p.cats) && counts.dog === Number(p.dogs) && counts.bird === Number(p.birds), `${question.skillId}: response list does not match its one-to-one record`);
    expect(Math.abs(Number(p[`${String(p.moreCategory).replace(/s$/u, "")}s`]) - Number(p[`${String(p.lessCategory).replace(/s$/u, "")}s`])));
  },
  "question.sortRecord"({ p, question, requireCondition }) {
    const items = String(p.items).split(/\s+/u).filter(Boolean);
    requireCondition(items.filter((item) => item === "●").length === Number(p.circles) && items.filter((item) => item === "▲").length === Number(p.triangles), `${question.skillId}: displayed sort collection and record counts differ`);
    requireCondition(question.answer.value.includes("│".repeat(Number(p.circles))) && question.answer.value.includes("│".repeat(Number(p.triangles))), `${question.skillId}: one-mark record omits displayed items`);
  },
  "question.twoCategoryDisplay"({ p, question, requireCondition }) {
    const catTokens = String(p.firstGroup).trim().split(/\s+/u).filter((token) => token === "CAT");
    const dogTokens = String(p.secondGroup).trim().split(/\s+/u).filter((token) => token === "DOG");
    requireCondition(catTokens.length === Number(p.cats) && dogTokens.length === Number(p.dogs), `${question.skillId}: displayed groups and graph counts differ`);
    requireCondition(question.options.every((option) => /^CAT \|+\s+DOG \|+$/u.test(option.value.replaceAll("│", "|"))), `${question.skillId}: category display options are not stable open-font patterns`);
  },
  "question.scaledSurveyVariation"({ expect, p }) {
    expect(Math.abs(Number(p.first) - Number(p.second)));
  },
  "question.numberOrder"({ expect, p }) {
    expect(Math.max(Number(p.a), Number(p.b), Number(p.c)));
  },
  "question.numberLeast"({ expect, p }) {
    expect(Math.min(Number(p.a), Number(p.b), Number(p.c)));
  },
  "question.scalePlace"({ expect, p }) {
    expect(Number(p.number) * Number(p.factor));
  },
  "question.coinEquivalent"({ expect, p }) {
    const cents = Number(String(p.secondCoin).replace(/[^\d]/gu, "")) * (String(p.secondCoin).startsWith("$") ? 100 : 1);
    expect(Number(p.amount) / cents);
  },
  "question.moneyOperation"({ expect, p }) {
    expect(Number(p.paid) - Number(p.cost));
  },
  "question.moneyPurchase"({ expect, p }) {
    expect(Number(p.firstCost) + Number(p.secondCost));
  },
  "question.moneyTotalCost"({ expect, p }) {
    expect(Number(p.firstCost) + Number(p.secondCost) + Number(p.thirdCost));
  },
  "question.moneyBudget"({ expect, p }) {
    expect(Number(p.budget) - Number(p.firstCost) - Number(p.secondCost));
  },
  "question.areaRectangle"({ expect, p }) {
    expect(Number(p.length) * Number(p.width));
  },
  "question.compositeArea"({ expect, p }) {
    expect(Number(p.l1) * Number(p.w1) + Number(p.l2) * Number(p.w2));
  },
  "question.prismVolume"({ expect, p }) {
    expect(Number(p.length) * Number(p.width) * Number(p.height));
  },
  "question.polygonPerimeter"({ expect, p }) {
    expect(String(p.sides).split("+").reduce((sum, side) => sum + Number(side.trim()), 0));
  },
  "question.patternExpression"({ expect, p }) {
    expect(Number(p.start) + Number(p.step) * Number(p.n));
  },
  "question.patternRuleExpression"({ expect, p }) {
    const expected = p.operation === "addition" ? Number(p.n) + Number(p.constant)
      : p.operation === "subtraction" ? Number(p.n) - Number(p.constant)
        : p.operation === "multiplication" ? Number(p.n) * Number(p.constant)
          : Number(p.n) / Number(p.constant);
    expect(expected);
  },
  "question.remainderWhole"(context) {
    const { p, question, requireCondition } = context;
    const total = Number(p.total);
    const divisor = Number(p.divisor);
    const quotient = Number(p.quotient);
    const remainder = Number(p.remainder);
    requireCondition(quotient * divisor + remainder === total, `${question.skillId}: interpreted remainder does not reconstruct the dividend`);
    requireCondition(remainder > 0 && remainder < divisor, `${question.skillId}: interpreted remainder is outside its valid range`);
    if (p.interpretation === "whole-remainder") {
      validateWholeRemainder(context, quotient, remainder);
    } else if (p.interpretation === "fraction") {
      validateFractionalRemainder(context, total, divisor);
    } else if (p.interpretation === "round-up") {
      validateRoundedRemainder(context, quotient, true);
    } else if (p.interpretation === "round-down") {
      validateRoundedRemainder(context, quotient, false);
    } else {
      throw new Error(`${question.skillId}: unknown remainder interpretation ${String(p.interpretation)}`);
    }
  },
  "question.scaledSurveyPlan"({ expect, p }) {
    expect(Number(p.responses) / Number(p.symbols));
  },
  "question.symmetryComplete"({ expect, p }) {
    expect(Number(p.target) - Number(p.shown));
  },
  "question.coordinateMove"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === `(${Number(p.x) + Number(p.dx)},${Number(p.y) + Number(p.dy)})`, `${question.skillId}: coordinate move is inconsistent`);
  },
  "question.directCompare"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "first" : "second"), `${question.skillId}: direct comparison is inconsistent`);
  },
  "question.attributeName"({ question, requireCondition }) {
    requireCondition(["length", "mass", "capacity", "duration"].includes(question.answer.value), `${question.skillId}: attribute name is invalid`);
  },
  "question.fairShare"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.total) % Number(p.recipients) === 0 ? "yes" : "no"), `${question.skillId}: fair-share decision is inconsistent`);
  },
  "question.eventDuration"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "first" : "second"), `${question.skillId}: duration comparison is inconsistent`);
  },
  "question.compare"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.a) > Number(p.b) ? "more" : Number(p.a) < Number(p.b) ? "fewer" : "same"), `${question.skillId}: quantity comparison is inconsistent`);
  },
  "question.decimalCompare"({ expect, p }) {
    expect(Math.max(Number(p.left), Number(p.right)));
  },
  "question.contextIntegerCompare"({ expect, p }) {
    expect(Math.max(Number(p.first), Number(p.second)));
  },
  "question.integerOrderList"({ question, requireCondition, sortedCsv }) {
    const values = sortedCsv(question.answer.value);
    requireCondition(values.every((value, index) => index === 0 || values[index - 1] <= value), `${question.skillId}: ordered list is not least-to-greatest`);
  },
  "question.rounding"({ expect, p }) {
    expect(Math.round(Number(p.source) / Number(p.place)) * Number(p.place));
  },
  "question.durationMinutes"({ expect, p }) {
    const start = Number(p.startHour) * 60 + Number(p.startMinuteText);
    const end = Number(p.endHour) * 60 + Number(p.endMinuteText);
    expect(end - start);
  },
  "question.timetableInterval"({ expect, p }) {
    const start = Number(p.startDay) * 1440 + Number(p.startHour) * 60 + Number(p.startMinuteText);
    const end = Number(p.endDay) * 1440 + Number(p.endHour) * 60 + Number(p.endMinuteText);
    expect(end - start);
  },
  "question.timeReadMinute"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === `${p.hour}:${p.minuteText}`, `${question.skillId}: clock reading does not match its hands`);
  },
  "question.fractionEquivalent"({ answer, nearlyEqual, p, question, rationalNumber, requireCondition }) {
    requireCondition(nearlyEqual(rationalNumber(p.left), answer), `${question.skillId}: equivalent fraction changes value`);
  },
  "question.percentDecimal"({ expect, p }) {
    expect(Number(p.percent) / 100);
  },
  "question.decimal"({ expect, p }) {
    expect(Number(p.whole) + Number(p.fractional) / (p.place === "tenths" ? 10 : p.place === "hundredths" ? 100 : 1000));
  },
  "question.fractionOperation"({ expect, p, rationalNumber }) {
    const left = rationalNumber(p.left);
    const right = rationalNumber(p.right);
    expect(p.operator === "+" ? left + right : p.operator === "−" || p.operator === "-" ? left - right : left * right);
  },
  "question.chanceFrequency"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.first) > Number(p.second) ? "blue" : "gold"), `${question.skillId}: chance-frequency comparison is inconsistent`);
  },
  "question.chanceRunCompare"({ p, question, requireCondition }) {
    requireCondition(question.answer.value === (Number(p.run1Blue) > Number(p.run2Blue) ? "run one" : "run two"), `${question.skillId}: repeated-run comparison is inconsistent`);
    requireCondition(Number(p.run1Blue) <= Number(p.trials) && Number(p.run2Blue) <= Number(p.trials), `${question.skillId}: repeated-run frequency exceeds trials`);
  },
  "question.surveyMostLeast"({ id, p, question, requireCondition }) {
    const series = { cats: Number(p.cats), dogs: Number(p.dogs), birds: Number(p.birds) };
    const target = p.goal === "most" ? Math.max(...Object.values(series)) : Math.min(...Object.values(series));
    requireCondition(series[question.answer.value] === target, `${question.skillId}: survey most/least interpretation is inconsistent`);
    if (id === "question.surveyResponseList") {
      const responses = String(p.responses).split(/\s*,\s*/u).filter(Boolean);
      requireCondition(responses.filter((value) => value === "cat").length === series.cats
        && responses.filter((value) => value === "dog").length === series.dogs
        && responses.filter((value) => value === "bird").length === series.birds, `${question.skillId}: shown survey response list does not match the derived display`);
    }
  },
  "question.featureDescription"({ p, question, requireCondition }) {
    const descriptions = {
      circle: "one curved edge and no vertices",
      triangle: "3 straight sides and 3 vertices",
      square: "4 equal straight sides and 4 vertices",
      rectangle: "2 long and 2 short straight sides",
      cube: "6 square faces, 12 edges and 8 vertices",
      sphere: "one curved surface and no edges or vertices",
      cylinder: "2 flat circular faces and one curved surface",
      cone: "one flat circular face, one curved surface and one vertex",
    };
    requireCondition(question.answer.value === descriptions[p.shape], `${question.skillId}: shape feature description is inconsistent`);
  },
  "question.distributionMode"({ p, question, requireCondition }) {
    const series = { A: Number(p.a), B: Number(p.b), C: Number(p.c) };
    requireCondition(series[question.answer.value] === Math.max(...Object.values(series)), `${question.skillId}: distribution mode is inconsistent`);
  },
  "question.factorClass"({ p, question, requireCondition }) {
    const number = Number(p.number);
    const divisors = Array.from({ length: number }, (_, index) => index + 1).filter((value) => number % value === 0);
    const actual = p.classification === "prime" ? divisors.length === 2
      : p.classification === "composite" ? divisors.length > 2
        : p.classification === "square" ? Number.isInteger(Math.sqrt(number))
          : Number.isInteger(Math.cbrt(number));
    requireCondition(question.answer.value === (actual ? "yes" : "no"), `${question.skillId}: factor classification is inconsistent`);
  },
  "question.distributionShape"({ p, question, requireCondition, sortedCsv }) {
    const values = sortedCsv(p.values);
    const expected = values.every((value, index) => index === 0 || values[index - 1] < value) ? "rising"
      : values.every((value, index) => index === 0 || values[index - 1] > value) ? "falling"
        : values.every((value) => value === values[0]) ? "flat" : "peak in the middle";
    requireCondition(question.answer.value === expected, `${question.skillId}: distribution classification is inconsistent`);
  },
});

const aliases = Object.freeze({
  "question.appliedAddition": "question.addition",
  "question.makeTen": "question.addition",
  "question.appliedSubtraction": "question.subtraction",
  "question.subtractMakeTen": "question.subtraction",
  "question.appliedMultiplication": "question.multiplication",
  "question.appliedDivision": "question.division",
  "question.numberConnection": "question.orderSetConnection",
  "question.hiddenPart": "question.makeTenFrame",
  "question.remainderFraction": "question.remainderWhole",
  "question.remainderInterpret": "question.remainderWhole",
  "question.remainderFullGroups": "question.remainderWhole",
  "question.contextIntegerOrder": "question.integerOrderList",
  "question.decimalOrderList": "question.integerOrderList",
  "question.timeReadDigital": "question.timeReadMinute",
  "question.percentFraction": "question.percentDecimal",
  "question.decimalOperation": "question.fractionOperation",
  "question.surveyResponseList": "question.surveyMostLeast",
});

export function validateSemanticMathRule(id, context) {
  if (typeof id !== "string") return;
  const key = Object.hasOwn(aliases, id) ? aliases[id] : id;
  if (Object.hasOwn(rules, key)) return rules[key](context);
}
