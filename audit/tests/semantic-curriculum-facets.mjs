// Independent curriculum obligations; these do not supply production answers.
function validDurationChoices(question, optionValues) {
  return question.optionCount === 2 && optionValues.size === 2
    && optionValues.has("first") && optionValues.has("second");
}

function contrastingDurations(first, second) {
  return first > 0 && second > 0 && first !== second
    && Math.max(first, second) >= 4 * Math.min(first, second);
}

function validDurationStimulus(descriptor, items, candidates, optionValues) {
  return descriptor?.kind === "durationPair" && items.length === 2 && candidates.length === 2
    && items.every((item) => item.kind === "durationEvent" && item.magnitude > 0 && item.unit === "minutes")
    && candidates.every((candidate) => candidate.kind === "durationEvent" && optionValues.has(String(candidate.optionValue)));
}

function validMetricChoices(question, item, familyByUnit, family) {
  return question.options.filter((option) => String(option.value) === String(question.answer.value)).length === 1
    && (question.tier === "EASY"
      ? question.options.length === 2 && item.showFamilyCue === true
      : question.options.length === 4 && item.showFamilyCue === false
        && question.options.some((option) => option.value !== question.answer.value
          && familyByUnit.get(option.value) === family));
}

function matchingMetricObject(item, question, family) {
  return item?.kind === "metricObject" && item.objectKind === question.params.object
    && item.measureKind === family && item.unit === undefined;
}

function validRemainderQuantities(p, constraints) {
  return Number(p.quotient) * Number(p.divisor) + Number(p.remainder) === Number(p.total)
    && Number(p.total) <= Number(constraints.dividendMax)
    && Number(p.divisor) <= Number(constraints.divisorMax)
    && Number(p.remainder) > 0 && Number(p.remainder) < Number(p.divisor);
}

function boundedTimePart(value, maximum) {
  return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= maximum;
}

function validTimetableParts(p) {
  return boundedTimePart(p.startHour, 23) && boundedTimePart(p.endHour, 23)
    && boundedTimePart(p.startMinuteText, 59) && boundedTimePart(p.endMinuteText, 59);
}

function matchingTimetableModel(model, p, expectedStart, expectedEnd) {
  return model.format === p.format && model.startTime === expectedStart && model.endTime === expectedEnd
    && Number(model.startHour) === Number(p.startHour) && Number(model.endHour) === Number(p.endHour);
}

function matchingDecimalRepresentations(representations, partition, oracle) {
  const { decimal, fraction } = representations;
  const { whole, fractional, denominator } = partition;
  const { question, answerNumber, nearlyEqual, rationalNumber } = oracle;
  return decimal && fraction
    && nearlyEqual(rationalNumber(decimal.value), answerNumber(question))
    && nearlyEqual(rationalNumber(fraction.value), answerNumber(question))
    && Number(fraction.denominator) === denominator
    && Number(fraction.numerator) === whole * denominator + fractional;
}

function validVolumeRepresentation(p, item, dimensions) {
  const { length, width, height, total } = dimensions;
  if (p.representation === "unit-cubes") return validUnitCubeCount(p, item, total);
  return p.method === "multiply" && item?.kind === "cubeLayers" && Number(item.layers) === height
    && Number(item.cubesPerLayer) === length * width && item.total === undefined;
}

function validUnitCubeCount(p, item, total) {
  return p.method === "count" && item?.kind === "prism" && item.total === undefined && total <= 48;
}

function matchingVolumeMetadata(data, p, dimensions) {
  return data?.representation === p.representation && data?.method === p.method
    && data?.unit === p.unit && data?.solid === p.solid
    && matchingVolumeDimensions(data, dimensions);
}

function matchingVolumeDimensions(data, dimensions) {
  return Number(data?.length) === dimensions.length && Number(data?.width) === dimensions.width
    && Number(data?.height) === dimensions.height && data?.total === undefined;
}

const rules = Object.freeze({
  "MQ-002"({ answerNumber, ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.countSet"), `${skill.id}: count-the-group prompt drifted`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.data?.count === answerNumber(question)
      && question.modelDescriptor.values.items?.[0]?.magnitude === answerNumber(question)), `${skill.id}: visible object group does not independently match its answer`);
  },
  "MQ-004"({ ids, questions, requireCondition, requireSet, skill }) {
    requireSet(ids, ["question.patternNext", "question.patternVisualNext"], "screen-native pattern prompt");
    const visualQuestions = questions.filter((question) => question.semanticPromptStringId === "question.patternVisualNext");
    requireCondition(visualQuestions.length > 0 && visualQuestions.every((question) => question.params.situationId === "shape-cards"
      && question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.items?.[0]?.sequence?.length >= 4
      && question.inputMethod === "PATTERN_BUILD"
      && new Set(question.params.tokenChoices).size === 4), `${skill.id}: visual pattern stimulus or choices are incomplete`);
  },
  "MQ-005"({ requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.shape), skill.constraints.shapes, "shape");
    requireCondition(values((question) => question.params.color).size >= 4, `${skill.id}: colour variation is not exercised`);
    requireSet(values((question) => question.params.size), ["small", "large"], "size");
    requireCondition([...values((question) => question.params.rotation)].some((rotation) => Number(rotation) !== 0), `${skill.id}: turn variation is not exercised`);
  },
  "MQ-006"({ ids, questions, requireCondition, requireSet, skill, values }) {
    const sourcePairs = new Set(questions.map((question) => [question.params.firstObject, question.params.secondObject].sort().join("|")));
    requireCondition(ids.size === 1 && ids.has("question.eventDuration"), `${skill.id}: early duration comparison uses the wrong prompt family`);
    requireCondition(questions.every((question) => {
      const first = Number(question.params.first), second = Number(question.params.second), descriptor = question.modelDescriptor?.values;
      const optionValues = new Set(question.options.map((option) => String(option.value)));
      const candidates = descriptor?.candidates || [], items = descriptor?.items || [];
      return validDurationChoices(question, optionValues)
        && contrastingDurations(first, second)
        && validDurationStimulus(descriptor, items, candidates, optionValues);
    }), `${skill.id}: two-choice duration source/candidate contract drifted`);
    requireCondition(sourcePairs.size >= 3, `${skill.id}: familiar activity variation is not exercised`);
    requireSet(values((question) => question.answer.value), ["first", "second"], "correct answer position");
  },
  "MQ-007"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.modelDescriptor.values.rule?.attribute), skill.constraints.attributes, "sort attribute");
    requireSet(values((question) => question.modelDescriptor.values.categories?.length), skill.constraints.categoryCount, "sort category count");
    requireCondition(questions.every((question) => question.modelDescriptor.values.items.length <= Number(skill.constraints.itemCountMax)), `${skill.id}: categorized sort exceeds its item-count bound`);
  },
  "MQ-009"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.structure), skill.constraints.structures, "structured-set representation");
    requireCondition(questions.every((question) => Number(question.answer.value) >= Number(skill.constraints.minNumber)
      && Number(question.answer.value) <= Number(skill.constraints.maxNumber)
      && question.modelDescriptor.values.data?.count === Number(question.answer.value)), `${skill.id}: structured-set count falls outside its declared bounds`);
  },
  "MQ-010"({ answerNumber, ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.orderSetConnection"), `${skill.id}: sequence/set connection is not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.count === answerNumber(question)), `${skill.id}: collection does not match numeral`);
  },
  "MQ-012"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.attributeKind), skill.constraints.attributes, "direct-comparison attribute");
    requireCondition(questions.every((question) => !/\d/u.test(question.prompt)), `${skill.id}: direct comparison leaks a numbered scale`);
  },
  "MQ-015"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.answer.value), ["yes", "no"], "equal-share result");
    requireCondition(questions.every((question) => Number(question.params.recipients) === 2 && Number(question.params.total) <= 6), `${skill.id}: fair-share bounds drift`);
  },
  "MQ-017"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.relation), skill.constraints.relations, "landmark relation");
    requireCondition(questions.every((question) => question.modelDescriptor.values.items?.[0]?.kind === "landmark"), `${skill.id}: landmark relation lacks a spatial scene`);
  },
  "MQ-018"({ ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.sortRecord"), `${skill.id}: sort and one-mark record are not a composite task`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.responses?.length === Number(question.params.circles) + Number(question.params.triangles)), `${skill.id}: displayed collection is not preserved in the record model`);
  },
  "MQ-019"({ answerNumber, ids, questions, requireCondition, requireSet, skill, values }) {
    requireSet(ids, ["question.numberConnection", "question.frameNumber"], "number/structured-frame prompt");
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.numberConnection").every((question) => question.params.numberWord && question.params.beforeWord && question.modelDescriptor.values.data?.count === answerNumber(question)), `${skill.id}: number-connection facets drift`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.frameNumber").every((question) => question.modelDescriptor.values.data?.stimulus === true
      && question.modelDescriptor.values.frames?.[0]?.capacity === 10
      && question.modelDescriptor.values.frames?.[0]?.value === answerNumber(question)), `${skill.id}: ten-frame/numeral connection drifts`);
    requireCondition(questions.every((question) => question.options.length === 4
      && new Set(question.options.map((option) => Number(option.value))).size === 4
      && question.options.every((option) => Number.isInteger(Number(option.value)) && Number(option.value) >= 0 && Number(option.value) <= 10)), `${skill.id}: zero-to-ten choices are not four distinct bounded numerals`);
    requireSet(values((question) => Number(question.answer.value)), [0, 10], "zero-to-ten boundary answer");
  },
  "MQ-023"({ answerNumber, ids, questions, requireCondition, requireSet, skill }) {
    requireSet(ids, ["question.missingPart", "question.makeTenFrame", "question.hiddenPart"], "part-of-ten activity");
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.makeTenFrame").every((question) => Number(question.params.shown) + answerNumber(question) === 10
      && question.inputMethod === "PICTURE_CHOICE"
      && question.modelDescriptor.values.data?.stimulus === true), `${skill.id}: make-ten activity does not complete ten`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.hiddenPart").every((question) => Number(question.params.shown) + answerNumber(question) === 10
      && question.inputMethod === "PICTURE_CHOICE"
      && question.modelDescriptor.values.frames?.[0]?.coveredCount === answerNumber(question)), `${skill.id}: hidden-part activity does not preserve the ten-cell whole`);
  },
  "MQ-024"({ requireSet, taskTypes, values }) {
    requireSet(taskTypes, ["classify-flat-shape", "classify-solid"], "dimension task type");
    requireSet(values((question) => question.params.property), ["3 sides", "4 equal sides", "6 flat faces", "one curved surface and no flat faces"], "visible property");
  },
  "MQ-025"({ ids, questions, requireCondition, requireSet, skill }) {
    requireSet(ids, ["question.numberBetween", "question.numberOrder", "question.numberLeast"], "number-order activity");
    for (const question of questions.filter((candidate) => candidate.semanticPromptStringId === "question.numberOrder" || candidate.semanticPromptStringId === "question.numberLeast")) {
      const shown = [Number(question.params.a), Number(question.params.b), Number(question.params.c)];
      requireCondition(new Set(shown).size === 3 && shown.every((value) => value >= 0 && value <= 20), `${skill.id}: extrema choices are not three distinct in-range numerals`);
      requireCondition(question.options.length === 3 && question.modelDescriptor.values.data?.stimulus === true, `${skill.id}: extrema activity is not a visible three-choice comparison`);
    }
  },
  "MQ-033"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => question.params.unitMarked === true
      && question.modelDescriptor.values.data?.unitMarked === true
      && /^\[.+\](?:\s+\[.+\])+$/u.test(String(question.params.pattern))), `${skill.id}: repeating unit is not explicitly marked`);
  },
  "MQ-035"({ ids, requireSet, skill, values }) {
    requireSet(ids, ["question.directCompare", "question.attributeName"], "comparison/explanation prompt");
    requireSet(values((question) => question.params.attributeKind || question.answer.value), skill.constraints.attributes, "named attribute");
  },
  "MQ-036"({ ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.twoCategoryDisplay"), `${skill.id}: displayed categories and one-to-one graph are not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.scale === 1), `${skill.id}: early display does not preserve one mark per object`);
  },
  "MQ-042"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => Number(question.params.minuteText)), skill.constraints.minuteValues, "clock minute");
    requireCondition(questions.every((question) => question.semanticPromptStringId === "question.timeReadMinute"), `${skill.id}: read-only objective drifts into another clock action`);
  },
  "MQ-051"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => {
      const firstCoin = Number(String(question.params.firstCoin).replace(/[^\d]/gu, "")) * (String(question.params.firstCoin).startsWith("$") ? 100 : 1);
      const secondCoin = Number(String(question.params.secondCoin).replace(/[^\d]/gu, "")) * (String(question.params.secondCoin).startsWith("$") ? 100 : 1);
      return Number(question.params.firstCount) * firstCoin === Number(question.params.amount)
        && Number(question.answer.value) * secondCoin === Number(question.params.amount);
    }), `${skill.id}: the two coin combinations are not equivalent`);
  },
  "MQ-052"({ questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, ["classify-flat-shape", "classify-solid"], "classification dimension");
    requireCondition(questions.filter((question) => question.taskType === "classify-flat-shape").every((question) => ["triangle", "square"].includes(question.answer.value)), `${skill.id}: flat-shape task leaks solids`);
    requireCondition(questions.filter((question) => question.taskType === "classify-solid").every((question) => ["cube", "sphere"].includes(question.answer.value)), `${skill.id}: solid task leaks flat shapes`);
  },
  "MQ-054"({ ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.responseListDifference"), `${skill.id}: response-list collection, display, and comparison are not composite`);
    requireCondition(questions.every((question) => question.modelDescriptor.values.data?.scale === 1 && question.modelDescriptor.values.data?.responses?.length > 0), `${skill.id}: one-to-one response evidence is missing`);
  },
  "MQ-063"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => Number(question.params.groups ?? question.params.a) * Number(question.params.perGroup ?? question.params.b) === Number(question.params.product ?? question.params.whole)), `${skill.id}: related equation facts drift`);
  },
  "MQ-065"({ answerNumber, questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => Number(question.params.paid) <= Number(skill.constraints.amountMaxCents)
      && Number(question.params.cost) < Number(question.params.paid)
      && Number(question.params.cost) % Number(skill.constraints.incrementCents) === 0
      && answerNumber(question) === Number(question.params.paid) - Number(question.params.cost)), `${skill.id}: Canadian change task drifts from its price/payment contract`);
  },
  "MQ-069"({ ids, questions, requireCondition, requireSet, skill, values }) {
    requireSet(ids, ["question.metricUnitChoice", "question.metricRead"], "choose/use prompt");
    const expected = ["centimetres", "metres", "grams", "kilograms", "millilitres", "litres"];
    const familyByUnit = new Map([
      ["centimetres", "length"],
      ["metres", "length"],
      ["grams", "mass"],
      ["kilograms", "mass"],
      ["millilitres", "capacity"],
      ["litres", "capacity"],
    ]);
    const objectByUnit = new Map([
      ["centimetres", "pencil"],
      ["metres", "door"],
      ["grams", "apple"],
      ["kilograms", "child"],
      ["millilitres", "cup"],
      ["litres", "bucket"],
    ]);
    const situationByFamily = new Map([
      ["length", "ruler-bench"],
      ["mass", "mass-scale"],
      ["capacity", "capacity-scale"],
    ]);
    requireSet(values((question) => question.params.unit || question.answer.value), expected, "metric unit");
    for (const unit of expected) {
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricUnitChoice" && question.answer.value === unit), `${skill.id}: ${unit} is never chosen`);
      requireCondition(questions.some((question) => question.semanticPromptStringId === "question.metricRead" && question.params.unit === unit), `${skill.id}: ${unit} is never used`);
    }
    const choices = questions.filter((question) => question.semanticPromptStringId === "question.metricUnitChoice");
    const readings = questions.filter((question) => question.semanticPromptStringId === "question.metricRead");
    requireCondition(choices.every((question) => question.prompt.includes(`measure the ${familyByUnit.get(question.answer.value)} of this ${question.params.object}`)), `${skill.id}: a unit-choice prompt does not name the intended measurable attribute and object`);
    requireCondition(choices.every((question) => {
      const family = familyByUnit.get(question.answer.value);
      const item = question.modelDescriptor.values.items?.[0];
      return question.params.object === objectByUnit.get(question.answer.value)
        && question.params.measureKind === family
        && question.params.situationId === situationByFamily.get(family)
        && matchingMetricObject(item, question, family)
        && question.modelDescriptor.values.data?.suitableUnit === undefined
        && validMetricChoices(question, item, familyByUnit, family);
    }), `${skill.id}: unit-choice picture, answer-scrub, situation, or tier contract drifted`);
    requireCondition(readings.every((question) => (
      question.params.situationId === situationByFamily.get(familyByUnit.get(question.params.unit))
      && Number(question.answer.value) >= 1
      && Number(question.answer.value) <= (question.tier === "EASY" ? 10 : 20)
      && Number(question.params.scaleMaximum) === (question.tier === "EASY" ? 10 : 20)
    )), `${skill.id}: metric-reading family, bound, or scale maximum drifted`);
    requireCondition(
      readings.some((question) => question.tier === "HARD/TARGET" && Number(question.answer.value) > 10),
      `${skill.id}: hard metric readings never exceed the Easy bound`,
    );
  },
  "MQ-070"({ questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, ["describe-flat-shape", "describe-solid"], "description dimension");
    requireCondition(questions.filter((question) => question.taskType === "describe-flat-shape").every((question) => ["circle", "triangle", "square", "rectangle"].includes(question.params.shape)), `${skill.id}: flat-shape descriptions leak solids`);
    requireCondition(questions.filter((question) => question.taskType === "describe-solid").every((question) => ["cube", "sphere", "cylinder", "cone"].includes(question.params.shape)), `${skill.id}: solid descriptions leak flat shapes`);
  },
  "MQ-072"({ questions, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.display), ["tally", "picture graph"], "survey display");
    requireSet(values((question) => question.params.goal), ["most", "least"], "survey interpretation");
    requireCondition(questions.every((question) => String(question.params.responses).split(/\s*,\s*/u).length > 0), `${skill.id}: task omits shown response-list evidence`);
  },
  "MQ-086"({ answerNumber, ids, questions, requireCondition, requireSet, skill }) {
    requireSet(ids, ["question.timeReadMinute", "question.timeReadDigital", "question.durationMinutes"], "time representation");
    requireCondition(questions.some((question) => Number(question.params.minuteText || question.params.startMinuteText) > 0), `${skill.id}: time-to-the-minute never leaves :00`);
    requireCondition(questions.filter((question) => question.semanticPromptStringId === "question.durationMinutes").every((question) => answerNumber(question) <= 59), `${skill.id}: duration exceeds one hour`);
  },
  "MQ-090"({ ids, questions, requireCondition, requireSet, skill, values }) {
    requireCondition(ids.size === 1 && ids.has("question.chanceRunCompare"), `${skill.id}: task is not a repeated-run comparison`);
    requireSet(values((question) => Number(question.params.trials)), skill.constraints.trialsPerRun, "trial-count");
    requireCondition(questions.every((question) => Number(question.params.run1Blue) !== Number(question.params.run2Blue)), `${skill.id}: repeated runs are not contrastive`);
  },
  "MQ-080"({ ids, questions, requireCondition, skill }) {
    requireCondition(ids.size === 1 && ids.has("question.quotientRemainder"), `${skill.id}: task omits quotient or remainder`);
    requireCondition(questions.every((question) => Number(question.params.remainder) > 0 && Number(question.params.remainder) < Number(question.params.divisor)), `${skill.id}: invalid remainder generated`);
  },
  "MQ-081"({ nearlyEqual, questions, rationalNumber, requireCondition, requireSet, skill, values }) {
    requireSet(values((question) => question.params.comparisonType), skill.constraints.comparisonTypes, "fraction comparison type");
    requireCondition(questions.every((question) => {
      const left = rationalNumber(question.params.left);
      const right = rationalNumber(question.params.right);
      return left >= 0 && left <= 1 && right >= 0 && right <= 1 && !nearlyEqual(left, right);
    }), `${skill.id}: fraction comparison is equal or outside zero to one`);
  },
  "MQ-084"({ questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, skill.constraints.operations, "number-rule operation");
    requireCondition(questions.every((question) => String(question.params.pattern).split(",").length >= Number(skill.constraints.termsMin)), `${skill.id}: fewer terms are shown than declared`);
  },
  "MQ-085"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => Number(question.params.paid) % 100 === 0
      && Number(question.params.cost) < Number(question.params.paid)
      && Number(question.params.cost) % Number(skill.constraints.incrementCents) === 0), `${skill.id}: whole-dollar payment/change contract drifts`);
  },
  "MQ-107"({ ids, requireSet, skill, values }) {
    requireSet(ids, ["question.scaledSurveyPlan", "question.scaledSurveyVariation"], "plan/variation prompt");
    requireSet(values((question) => question.params.variableType), skill.constraints.variableTypes, "survey variable type");
    requireSet(values((question) => Number(question.params.scale || question.answer.value)), skill.constraints.scaleValues, "many-to-one scale");
  },
  "MQ-109"({ questions, requireCondition, requireSet, skill, sortedCsv, taskTypes, values }) {
    requireSet(taskTypes, ["compare", "order"], "integer operation");
    requireCondition(questions.every((question) => question.taskType === "compare"
      ? Number(question.params.first) < 0 || Number(question.params.second) < 0
      : sortedCsv(question.answer.value).some((value) => value < 0)), `${skill.id}: a contextual task omits negative integers`);
    requireSet(values((question) => question.params.contextKey), skill.constraints.contexts, "integer context");
    const contextPolicies = {
      temperature: { label: "temperature (°C)", min: -40, max: 45 },
      elevation: { label: "elevation (metres)", min: -100, max: 1000 },
      score: { label: "game score (points)", min: -100, max: Number(skill.constraints.positiveMax) },
    };
    requireCondition(questions.every((question) => {
      const policy = contextPolicies[question.params.contextKey];
      if (!policy || question.params.context !== policy.label) return false;
      const generatedValues = question.taskType === "compare"
        ? [Number(question.params.first), Number(question.params.second)]
        : question.options.flatMap((option) => sortedCsv(option.value));
      return generatedValues.every((value) => Number.isInteger(value)
        && value >= policy.min
        && value <= policy.max);
    }), `${skill.id}: a contextual value or unit label is implausible`);
    requireCondition(questions.some((question) => question.params.contextKey === "score"
      && (question.taskType === "compare"
        ? Math.max(Number(question.params.first), Number(question.params.second)) > 1000
        : question.options.some((option) => sortedCsv(option.value).some((value) => value > 1000)))),
    `${skill.id}: score context never preserves declared large-number coverage`);
  },
  "MQ-100"({ questions, requireCondition, requireSet, skill, sortedCsv, taskTypes }) {
    requireSet(taskTypes, ["compare-decimals", "order-decimals"], "decimal comparison operation");
    requireCondition(questions.filter((question) => question.taskType === "compare-decimals").every((question) => Number(question.params.left) !== Number(question.params.right)), `${skill.id}: decimal compare repeats the same value`);
    requireCondition(questions.filter((question) => question.taskType === "order-decimals").every((question) => sortedCsv(question.answer.value).length === 3), `${skill.id}: decimal order does not include three values`);
  },
  "MQ-099"({ answerNumber, nearlyEqual, questions, rationalNumber, requireCondition, requireSet, skill }) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.place)), ["tenths", "hundredths"], `${tier} decimal place`);
      requireCondition(rows.some((question) => question.params.place === "hundredths" && Number(question.params.fractional) % 10 !== 0), `${skill.id}: ${tier} never generates a genuine hundredths value`);
    }
    requireCondition(questions.every((question) => {
      const denominator = question.params.place === "tenths" ? 10 : 100;
      const whole = Number(question.params.whole);
      const fractional = Number(question.params.fractional);
      const representations = question.modelDescriptor.values.representations || [];
      const decimal = representations.find((representation) => representation.kind === "decimal");
      const fraction = representations.find((representation) => representation.kind === "fraction");
      return answerNumber(question) >= Number(skill.constraints.range[0])
        && answerNumber(question) <= Number(skill.constraints.range[1])
        && Number.isInteger(fractional) && fractional >= 0 && fractional < denominator
        && nearlyEqual(answerNumber(question), whole + fractional / denominator)
        && matchingDecimalRepresentations({ decimal, fraction }, { whole, fractional, denominator },
          { question, answerNumber, nearlyEqual, rationalNumber });
    }), `${skill.id}: decimal-place fraction model or zero-to-one range drifts`);
  },
  "MQ-103"({ questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, skill.constraints.operations, "generating operation");
    requireCondition(questions.every((question) => String(question.params.pattern).split(",").length >= Number(skill.constraints.termsMin)), `${skill.id}: fewer generated terms are shown than declared`);
  },
  "MQ-112"({ questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, ["classify-prime", "classify-composite", "classify-square", "classify-cube"], "factor classification");
    for (const taskType of skill.constraints.taskTypes) {
      const rows = questions.filter((question) => question.taskType === taskType);
      requireSet(new Set(rows.map((question) => question.answer.value)), ["yes", "no"], `${taskType} truth value`);
      requireCondition(rows.every((question) => question.modelDescriptor.values.data?.factorPairs?.length), `${skill.id}: ${taskType} lacks factor evidence`);
    }
  },
  "MQ-114"({ ids, questions, requireCondition, requireSet, skill }) {
    const promptByInterpretation = {
      "whole-remainder": "question.remainderWhole",
      fraction: "question.remainderFraction",
      "round-up": "question.remainderInterpret",
      "round-down": "question.remainderFullGroups",
    };
    const unknownByInterpretation = {
      "whole-remainder": "quotientAndRemainder",
      fraction: "mixedQuotient",
      "round-up": "groupsNeeded",
      "round-down": "fullGroups",
    };
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.interpretation)), skill.constraints.remainderInterpretations, `${tier} remainder interpretation`);
    }
    requireSet(ids, Object.values(promptByInterpretation), "remainder prompt");
    requireCondition(questions.every((question) => {
      const p = question.params;
      const model = question.modelDescriptor.values;
      const answerBearingFieldHidden = model.groups === undefined;
      const divisorShown = Number(model.perGroup) === Number(p.divisor);
      return validRemainderQuantities(p, skill.constraints)
        && question.semanticPromptStringId === promptByInterpretation[p.interpretation]
        && model.operation === p.interpretation
        && model.interpretation === p.interpretation
        && model.unknown === unknownByInterpretation[p.interpretation]
        && Number(model.total) === Number(p.total)
        && divisorShown
        && answerBearingFieldHidden
        && model.remainder === undefined;
    }), `${skill.id}: remainder interpretation or answer-free stimulus contract drifts`);
  },
  "MQ-116"({ answerNumber, nearlyEqual, questions, requireCondition, requireSet, skill, taskTypes }) {
    requireSet(taskTypes, ["percent-to-fraction", "percent-to-decimal"], "percent conversion");
    requireCondition(questions.every((question) => nearlyEqual(answerNumber(question), Number(question.params.percent) / 100)), `${skill.id}: percent conversion changes value`);
  },
  "MQ-119"({ questions, requireCondition, requireSet, skill, taskTypes, values }) {
    requireSet(taskTypes, ["pattern-addition", "pattern-subtraction", "pattern-multiplication", "pattern-division"], "pattern operation");
    requireSet(values((question) => question.params.operation), ["addition", "subtraction", "multiplication", "division"], "expression operation");
    requireCondition(questions.filter((question) => question.params.operation === "division").every((question) => Number(question.params.n) % Number(question.params.constant) === 0), `${skill.id}: division expression does not have a whole-number value`);
  },
  "MQ-122"({ answerNumber, questions, requireCondition, requireSet, skill }) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.representation)), skill.constraints.representations, `${tier} volume representation`);
      requireSet(new Set(rows.map((question) => question.params.method)), ["count", "multiply"], `${tier} volume method`);
      requireSet(new Set(rows.map((question) => question.params.unit)), skill.constraints.volumeUnits, `${tier} volume unit`);
      requireSet(new Set(rows.map((question) => question.params.solid)), skill.constraints.solids, `${tier} solid`);
      requireCondition(new Set(rows.map((question) => [question.params.representation, question.params.unit, question.params.solid].join("|"))).size === 8, `${skill.id}: ${tier} does not exercise all declared volume facet combinations`);
    }
    requireCondition(questions.every((question) => {
      const p = question.params;
      const length = Number(p.length);
      const width = Number(p.width);
      const height = Number(p.height);
      const total = length * width * height;
      const data = question.modelDescriptor.values.data;
      const item = question.modelDescriptor.values.items?.[0];
      const dimensionsValid = [length, width, height].every((value, index) => Number.isInteger(value) && value > 0 && value <= Number(skill.constraints.dimensionsMax[index]));
      const solidValid = p.solid === "cube" ? length === width && width === height : !(length === width && width === height);
      const dimensions = { length, width, height, total };
      const representationValid = validVolumeRepresentation(p, item, dimensions);
      return dimensionsValid && solidValid && answerNumber(question) === total && representationValid
        && matchingVolumeMetadata(data, p, dimensions);
    }), `${skill.id}: volume representation, dimensions, or product drifts`);
  },
  "MQ-123"({ answerNumber, questions, requireCondition, requireSet, skill }) {
    const display = (hour, minute, format) => format === "24-hour"
      ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
    for (const tier of ["EASY", "HARD/TARGET"]) {
      const rows = questions.filter((question) => question.tier === tier);
      requireSet(new Set(rows.map((question) => question.params.format)), skill.constraints.formats, `${tier} timetable format`);
      requireCondition(rows.some((question) => Number(question.params.endDay) > Number(question.params.startDay)), `${skill.id}: ${tier} never crosses midnight`);
      requireCondition(rows.some((question) => answerNumber(question) > 1440), `${skill.id}: ${tier} never exercises a multi-day interval`);
      requireCondition(rows.some((question) => Number(question.params.startMinuteText) !== 0 || Number(question.params.endMinuteText) !== 0), `${skill.id}: ${tier} never exercises minute precision`);
    }
    requireCondition(questions.every((question) => {
      const p = question.params;
      const expectedStart = display(Number(p.startHour), Number(p.startMinuteText), p.format);
      const expectedEnd = display(Number(p.endHour), Number(p.endMinuteText), p.format);
      const model = question.modelDescriptor.values;
      return validTimetableParts(p)
        && p.startTime === expectedStart && p.endTime === expectedEnd
        && question.prompt.includes(expectedStart) && question.prompt.includes(expectedEnd)
        && answerNumber(question) > 0 && answerNumber(question) <= Number(skill.constraints.daySpanMax) * 1440
        && matchingTimetableModel(model, p, expectedStart, expectedEnd);
    }), `${skill.id}: timetable notation or elapsed-time model drifts`);
  },
  "MQ-125"({ questions, requireCondition, skill }) {
    requireCondition(questions.every((question) => Number(question.params.x) >= 1
      && Number(question.params.y) >= 1
      && Number(question.params.x) + Number(question.params.dx) <= Number(skill.constraints.coordinateMax)
      && Number(question.params.y) + Number(question.params.dy) <= Number(skill.constraints.coordinateMax)), `${skill.id}: translated point leaves the declared first-quadrant grid`);
  },
  "MQ-126"({ ids, requireSet, skill, values }) {
    requireSet(ids, ["question.distributionShape", "question.distributionMode"], "shape/mode statistic");
    requireSet(values((question) => question.params.displayType), ["line graph", "comparative display"], "display type");
    requireSet(values((question) => question.semanticPromptStringId === "question.distributionShape" ? "shape" : "mode"), skill.constraints.statistics, "statistic");
  },
});

const aliases = Object.freeze({
  "MQ-008": "MQ-002",
  "MQ-020": "MQ-009",
});

export function validateCurriculumFacets(id, context) {
  if (typeof id !== "string") return;
  const key = Object.hasOwn(aliases, id) ? aliases[id] : id;
  if (Object.hasOwn(rules, key)) return rules[key](context);
}
