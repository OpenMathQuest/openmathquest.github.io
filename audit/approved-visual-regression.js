(() => {
  "use strict";

  const LAB_SEED = 1297175628;
  const TIERS = Object.freeze(["EASY", "HARD/TARGET"]);
  const sampleOrdinals = (skill) => {
    const declared = Array.isArray(skill?.taskTypes)
      ? skill.taskTypes.length
      : Array.isArray(skill?.constraints?.taskTypes) ? skill.constraints.taskTypes.length : 0;
    const constraints = skill?.constraints || {};
    const longestFacet = Math.max(
      1,
      Number(constraints.decimalPlacesMax) || 0,
      ...["remainderInterpretations", "formats"].map((key) => Array.isArray(constraints[key]) ? constraints[key].length : 0),
    );
    const volumeFacetSpan = ["representations", "volumeUnits", "solids"]
      .map((key) => Array.isArray(constraints[key]) && constraints[key].length ? constraints[key].length : 1)
      .reduce((product, length) => product * length, 1);
    const sortFacetSpan = (Array.isArray(constraints.attributes) && constraints.attributes.length ? constraints.attributes.length : 1)
      * (Array.isArray(constraints.categoryCount) && constraints.categoryCount.length ? constraints.categoryCount.length : 1);
    return Array.from({ length: Math.max(3, declared * Math.max(longestFacet, volumeFacetSpan, sortFacetSpan)) }, (_, index) => index);
  };

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const finite = (value) => Number.isFinite(Number(value));
  const normalized = (value) => String(value ?? "").normalize("NFC").trim();
  const result = (pass, details) => Object.freeze({
    pass: Boolean(pass),
    details: typeof details === "string" ? details : JSON.stringify(details),
  });
  const slug = (value) => normalized(value).toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const ATTRIBUTE_PROPERTY_TARGET = Object.freeze({
    "3 sides": "triangle",
    "4 equal sides": "square",
    "6 flat faces": "cube",
    "one curved surface and no flat faces": "sphere",
    "a right angle": "rectangle",
    "2 pairs of parallel sides and a right angle": "rectangle",
    "perpendicular sides and 2 long sides": "rectangle",
  });

  function attributeItemMatchesRule(item, rule) {
    const attribute = normalized(rule?.attribute ?? rule?.property).toLowerCase();
    const value = normalized(rule?.value ?? rule?.targetValue).toLowerCase();
    const shape = normalized(item?.shape).toLowerCase();
    const solid = normalized(item?.solid).toLowerCase();
    if (attribute === "shape") return shape === value;
    if (attribute === "solid") return solid === value;
    if (attribute === "property") {
      const target = ATTRIBUTE_PROPERTY_TARGET[value];
      return Boolean(target && (shape === target || solid === target));
    }
    return false;
  }

  function attributeItemValue(item, attribute) {
    const key = normalized(attribute).toLowerCase();
    if (key === "colour" || key === "color") return normalized(item?.colour ?? item?.color).toLowerCase();
    if (key === "shape") return normalized(item?.shape).toLowerCase().replace(/s$/u, "");
    if (key === "size") return normalized(item?.size).toLowerCase();
    if (key === "solid") return normalized(item?.solid).toLowerCase();
    return normalized(item?.[key] ?? item?.value).toLowerCase();
  }

  function exactNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (object(value) && own(value, "n") && own(value, "d") && Number(value.d) !== 0) return Number(value.n) / Number(value.d);
    if (object(value) && own(value, "numerator") && own(value, "denominator") && Number(value.denominator) !== 0) return Number(value.numerator) / Number(value.denominator);
    const text = normalized(value).replace(/,/gu, "");
    if (/^-?\d+(?:\.\d+)?$/u.test(text)) return Number(text);
    const fraction = text.match(/^(-?\d+)\s*\/\s*(\d+)$/u);
    if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
    const mixed = text.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/u);
    if (mixed && Number(mixed[3]) !== 0) {
      const sign = Number(mixed[1]) < 0 ? -1 : 1;
      return Number(mixed[1]) + sign * Number(mixed[2]) / Number(mixed[3]);
    }
    return null;
  }

  function hasForbiddenDescriptorKey(value) {
    if (!value || typeof value !== "object") return false;
    if (Object.keys(value).some((key) => ["answer", "correctIndex"].includes(key))) return true;
    return Object.values(value).some(hasForbiddenDescriptorKey);
  }

  function uniqueGradedChoice(engine, question) {
    if (question?.inputClass !== "SELECTION" || !Array.isArray(question.options)) return false;
    const labels = question.options.map((option) => normalized(option.label));
    const graded = question.options.filter((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
    return question.options.length >= 2 && new Set(labels).size === labels.length && graded.length === 1;
  }

  function descriptorTruth(question) {
    const model = question?.modelDescriptor;
    if (!object(model) || typeof model.type !== "string" || !object(model.values)) return { pass: false, reason: "missing typed model descriptor" };
    if (hasForbiddenDescriptorKey(model.values)) return { pass: false, reason: "descriptor leaks an answer or correctIndex field" };
    const values = model.values;

    if (model.type === "attributeSet") {
      const items = values.items;
      const rule = values.rule;
      const attribute = rule?.attribute ?? rule?.property;
      const targetValue = rule?.value ?? rule?.targetValue;
      const promptId = normalized(question.semanticPromptStringId);
      const answerFree = !own(values, "targetIndexes") && !own(values, "nonTargetIndexes");

      if (promptId === "question.sortRule") {
        const categories = Array.isArray(values.categories) ? values.categories : [];
        const ids = categories.map((category) => normalized(category?.id));
        const categoryValues = categories.map((category) => normalized(category?.value).toLowerCase());
        const completeCategories = categories.length >= 2 && categories.length <= 3
          && new Set(ids).size === categories.length && new Set(categoryValues).size === categories.length
          && categories.every((category) => /^c[0-2]$/u.test(normalized(category?.id))
            && normalized(category?.label) && normalized(category?.value));
        const completeItems = Array.isArray(items) && items.length === categories.length * 2
          && items.every((item) => ["shape", "color", "colour", "size"]
            .every((key) => typeof item?.[key] === "string" && normalized(item[key]))
            && finite(item.rotation));
        const mapped = completeItems && completeCategories
          && items.every((item) => categories.filter((category) => (
            normalized(category.value).toLowerCase() === attributeItemValue(item, attribute)
          )).length === 1)
          && categories.every((category) => items.filter((item) => (
            attributeItemValue(item, attribute) === normalized(category.value).toLowerCase()
          )).length === 2);
        const projectedCategories = categories.map((category) => ({
          id: normalized(category.id),
          value: normalized(category.value),
          label: normalized(category.label),
        }));
        const projectedParamsCategories = (Array.isArray(question.params?.categories) ? question.params.categories : []).map((category) => ({
          id: normalized(category.id),
          value: normalized(category.value),
          label: normalized(category.label),
        }));
        const projectItem = (item) => ({
          shape: normalized(item?.shape),
          color: normalized(item?.color ?? item?.colour),
          colour: normalized(item?.colour ?? item?.color),
          size: normalized(item?.size),
          rotation: Number(item?.rotation) || 0,
        });
        const matchesParams = JSON.stringify(projectedCategories) === JSON.stringify(projectedParamsCategories)
          && JSON.stringify(items.map(projectItem)) === JSON.stringify((question.params?.sortItems || []).map(projectItem));
        const truthful = Boolean(answerFree && ["colour", "shape", "size"].includes(normalized(attribute).toLowerCase())
          && normalized(question.answer?.value).toLowerCase() === normalized(attribute).toLowerCase()
          && mapped && matchesParams);
        return {
          pass: Boolean(completeCategories && completeItems && truthful),
          reason: { promptId, completeCategories, completeItems, truthful, answerFree, mapped, matchesParams, attribute, categories: categories.length },
        };
      }

      if (promptId === "question.shapeProperty") {
        const property = normalized(targetValue).toLowerCase();
        const targetName = ATTRIBUTE_PROPERTY_TARGET[property];
        const expectedKind = question.taskType === "classify-solid" ? "solid" : "shape";
        const expectedPool = expectedKind === "solid"
          ? ["cube", "sphere", "cone", "cylinder"]
          : question.taskType === "property-classification"
            ? ["circle", "triangle", "parallelogram", "rectangle"]
            : ["circle", "triangle", "square", "rectangle"];
        const itemNames = Array.isArray(items)
          ? items.map((item) => normalized(item?.[expectedKind]).toLowerCase()) : [];
        const complete = itemNames.length === expectedPool.length
          && new Set(itemNames).size === expectedPool.length
          && expectedPool.every((name) => itemNames.includes(name))
          && items.every((item, index) => item?.kind === expectedKind
            && normalized(item.label).toLowerCase() === itemNames[index]
            && (expectedKind === "solid" || finite(item.rotation)));
        const truthful = Boolean(answerFree && attribute === "property" && targetName
          && property === normalized(question.params?.property).toLowerCase()
          && itemNames.filter((name) => name === targetName).length === 1
          && normalized(question.answer?.value).toLowerCase() === targetName);
        return { pass: Boolean(complete && truthful), reason: { promptId, complete, truthful, answerFree, property, targetName } };
      }

      return { pass: false, reason: { promptId, error: "unsupported answer-free attribute set" } };
    }

    if (model.type === "comparison") {
      const sides = object(values.left) && object(values.right);
      const relation = normalized(values.relation);
      const magnitudes = [values.left?.magnitude ?? values.left?.value, values.right?.magnitude ?? values.right?.value];
      const explicit = magnitudes.every((value) => exactNumber(value) !== null);
      const noInventedOperation = !own(values, "operator") && !/[+×÷]/u.test(JSON.stringify(values));
      return { pass: Boolean(sides && explicit && relation && noInventedOperation), reason: { relation, magnitudes, noInventedOperation } };
    }

    if (model.type === "fractionPair") {
      const representations = values.representations;
      const exact = Array.isArray(representations) && representations.length
        && representations.every((entry) => object(entry) && typeof entry.role === "string"
          && exactNumber(entry.value ?? entry.label ?? entry.fraction ?? entry.decimal) !== null);
      const resultExact = values.result === undefined || exactNumber(values.result?.value ?? values.result?.label ?? values.result) !== null;
      let placeExact = true;
      if (question.semanticPromptStringId === "question.decimal") {
        const denominator = question.params?.place === "tenths" ? 10 : question.params?.place === "hundredths" ? 100 : 1000;
        const decimal = representations?.find((entry) => entry.kind === "decimal");
        const fraction = representations?.find((entry) => entry.kind === "fraction");
        const expected = Number(question.params?.whole) + Number(question.params?.fractional) / denominator;
        placeExact = Boolean(decimal && fraction
          && Number(fraction.denominator) === denominator
          && Number(fraction.numerator) === Number(question.params?.whole) * denominator + Number(question.params?.fractional)
          && exactNumber(decimal.value) === expected && exactNumber(fraction.value) === expected
          && exactNumber(question.answer?.value) === expected);
      }
      return { pass: Boolean(exact && resultExact && normalized(values.relation) && placeExact), reason: { representations: representations?.length || 0, relation: values.relation, resultExact, placeExact } };
    }

    if (model.type === "numberBond") {
      const parts = values.parts;
      const whole = Number(values.whole);
      const known = Array.isArray(parts) && parts.length === 2 && parts.filter((part) => part !== null).every(finite);
      const operator = values.operator;
      const unknown = values.unknown;
      const coherent = Number.isFinite(whole) && known && ["whole", "part0", "part1", "operator"].includes(unknown)
        && (unknown === "operator" || ["+", "-", "−"].includes(operator));
      return { pass: Boolean(coherent), reason: { whole, parts, operator, unknown, coherent } };
    }

    if (model.type === "tenFrame") {
      const candidates = values.candidates;
      const frames = values.frames;
      const strategy = values.strategy;
      const semanticEvidence = (Array.isArray(candidates) && candidates.length >= 2)
        || (Array.isArray(frames) && frames.length >= 2)
        || (object(strategy) && ["start", "change", "result"].every((key) => own(strategy, key)));
      const promptId = normalized(question.semanticPromptStringId);
      const frame = frames?.[0];
      const activity = values.data?.activityKind;
      let activityExact = false;
      if (promptId === "question.frameNumber") activityExact = Boolean(activity === "frame-to-number"
        && values.data?.stimulus === true && Number(frame?.capacity) === 10
        && Number(frame?.value) === exactNumber(question.answer?.value));
      else if (promptId === "question.makeTenFrame") activityExact = Boolean(activity === "make-ten"
        && values.data?.stimulus === true && Number(frame?.capacity) === 10
        && Number(frame?.value) === Number(question.params?.shown)
        && Number(frame?.value) + exactNumber(question.answer?.value) === 10
        && !own(values, "strategy") && !own(frame || {}, "label"));
      else if (promptId === "question.hiddenPart") activityExact = Boolean(activity === "hidden-part"
        && values.data?.stimulus === true && Number(frame?.capacity) === 10
        && Number(frame?.value) === Number(question.params?.shown)
        && Number(frame?.coveredCount) === 10 - Number(frame?.value)
        && exactNumber(question.answer?.value) === Number(frame?.coveredCount)
        && !own(values, "strategy") && !own(frame || {}, "label"));
      return { pass: Boolean(activityExact || semanticEvidence), reason: { candidates: candidates?.length || 0, frames: frames?.length || 0, strategy: Boolean(strategy), activityExact } };
    }

    if (model.type === "array") {
      const total = Number(values.total);
      const groups = Number(values.groups);
      const promptId = normalized(question.semanticPromptStringId);
      const answerValue = normalized(question.answer?.value);

      if (promptId === "question.fairShare") {
        const sourceExact = Number.isSafeInteger(total) && total > 0
          && Number.isSafeInteger(groups) && groups > 0
          && values.operation === "fairShare" && values.unknown === "equalShares"
          && total === Number(question.params?.total) && groups === Number(question.params?.recipients);
        const derivedAnswer = sourceExact && total % groups === 0 ? "yes" : "no";
        const answerFree = !own(values, "perGroup") && !own(values, "columns") && !own(values, "remainder");
        const truthful = sourceExact && answerFree && answerValue.toLowerCase() === derivedAnswer;
        return { pass: Boolean(truthful), reason: { promptId, total, groups, derivedAnswer, sourceExact, answerFree } };
      }

      if (promptId === "question.relatedMultiplyDivide") {
        const quotient = groups > 0 ? total / groups : NaN;
        const sourceExact = Number.isSafeInteger(total) && total > 0
          && Number.isSafeInteger(groups) && groups > 0 && Number.isSafeInteger(quotient)
          && values.operation === "relatedMultiplyDivide" && values.unknown === "quotient"
          && Number(values.rows) === groups
          && total === Number(question.params?.product) && groups === Number(question.params?.groups)
          && quotient === Number(question.params?.perGroup);
        const answerFree = !own(values, "perGroup") && !own(values, "columns") && !own(values, "remainder");
        const truthful = sourceExact && answerFree && exactNumber(answerValue) === quotient;
        return { pass: Boolean(truthful), reason: { promptId, total, groups, quotient, sourceExact, answerFree } };
      }

      if (promptId === "question.quotientRemainder") {
        const quotient = groups > 0 ? Math.floor(total / groups) : NaN;
        const derivedRemainder = groups > 0 ? total % groups : NaN;
        const sourceExact = Number.isSafeInteger(total) && total > 0
          && Number.isSafeInteger(groups) && groups > 0
          && Number.isSafeInteger(quotient) && Number.isSafeInteger(derivedRemainder)
          && derivedRemainder > 0 && derivedRemainder < groups
          && values.operation === "quotientRemainder" && values.unknown === "quotientAndRemainder"
          && total === Number(question.params?.total) && groups === Number(question.params?.divisor)
          && quotient === Number(question.params?.quotient) && derivedRemainder === Number(question.params?.remainder);
        const answerFree = !own(values, "perGroup") && !own(values, "columns") && !own(values, "remainder");
        const derivedAnswer = `${quotient} R ${derivedRemainder}`;
        const truthful = sourceExact && answerFree && answerValue === derivedAnswer;
        return { pass: Boolean(truthful), reason: { promptId, total, groups, quotient, derivedRemainder, sourceExact, answerFree } };
      }

      const interpretationConfig = {
        "question.remainderWhole": { interpretation: "whole-remainder", unknown: "quotientAndRemainder" },
        "question.remainderFraction": { interpretation: "fraction", unknown: "mixedQuotient" },
        "question.remainderInterpret": { interpretation: "round-up", unknown: "groupsNeeded" },
        "question.remainderFullGroups": { interpretation: "round-down", unknown: "fullGroups" },
      }[promptId];
      if (interpretationConfig) {
        const divisor = Number(values.perGroup);
        const quotient = divisor > 0 ? Math.floor(total / divisor) : NaN;
        const derivedRemainder = divisor > 0 ? total % divisor : NaN;
        const commonDivisor = (left, right) => {
          let a = Math.abs(left), b = Math.abs(right);
          while (b) [a, b] = [b, a % b];
          return a;
        };
        const fractionDivisor = Number.isSafeInteger(derivedRemainder) && Number.isSafeInteger(divisor)
          ? commonDivisor(derivedRemainder, divisor) : 1;
        const derivedAnswer = interpretationConfig.interpretation === "whole-remainder"
          ? `${quotient} R ${derivedRemainder}`
          : interpretationConfig.interpretation === "fraction"
            ? `${quotient} ${derivedRemainder / fractionDivisor}/${divisor / fractionDivisor}`
            : String(interpretationConfig.interpretation === "round-up" ? quotient + 1 : quotient);
        const sourceExact = Number.isSafeInteger(total) && total > 0
          && Number.isSafeInteger(divisor) && divisor > 0
          && Number.isSafeInteger(quotient) && Number.isSafeInteger(derivedRemainder)
          && derivedRemainder > 0 && derivedRemainder < divisor
          && values.operation === interpretationConfig.interpretation
          && values.interpretation === interpretationConfig.interpretation
          && values.unknown === interpretationConfig.unknown
          && total === Number(question.params?.total) && divisor === Number(question.params?.divisor)
          && quotient === Number(question.params?.quotient) && derivedRemainder === Number(question.params?.remainder)
          && question.params?.interpretation === interpretationConfig.interpretation;
        const answerFree = !own(values, "groups") && !own(values, "columns") && !own(values, "remainder");
        const truthful = sourceExact && answerFree && answerValue === derivedAnswer;
        return { pass: Boolean(truthful), reason: { promptId, total, divisor, quotient, derivedRemainder, derivedAnswer, sourceExact, answerFree } };
      }

      const remainder = Number(values.remainder ?? 0);
      const multiplication = finite(values.rows) && finite(values.columns)
        && Number(values.rows) * Number(values.columns) === total;
      const division = finite(values.groups) && finite(values.perGroup)
        && Number(values.groups) * Number(values.perGroup) + remainder === total;
      return { pass: Number.isFinite(total) && (multiplication || division), reason: { promptId, total, remainder, multiplication, division } };
    }

    if (model.type === "placeValue") {
      const source = values.source;
      const columns = values.columns;
      const explicit = source !== undefined && Array.isArray(columns) && columns.length
        && columns.every((column) => object(column) && finite(column.place) && finite(column.digit));
      return { pass: Boolean(explicit), reason: { source, columns: columns?.length || 0, explicit: Boolean(explicit) } };
    }

    if (model.type === "numberLine") {
      const domain = values.domain;
      const min = exactNumber(domain?.min);
      const max = exactNumber(domain?.max);
      const step = exactNumber(domain?.step);
      const points = values.points;
      const bounded = min !== null && max !== null && step !== null && min < max && step > 0
        && Array.isArray(points) && points.length
        && points.every((point) => {
          const number = exactNumber(object(point) ? point.value : point);
          return number !== null && number >= min && number <= max;
        });
      return { pass: Boolean(bounded), reason: { min, max, step, points: points?.length || 0, bounded: Boolean(bounded) } };
    }

    if (model.type === "proportionalBar") {
      const bars = values.bars;
      const promptId = normalized(question.semanticPromptStringId);
      const params = question.params || {};
      const answer = exactNumber(question.answer?.value);
      const answerFreeResult = !own(values, "result");
      const knownSegment = (segment) => object(segment) && finite(segment.value)
        && normalized(segment.label) && normalized(segment.units) && segment.unknown !== true;
      const unknownSegment = (segment, label) => object(segment) && segment.unknown === true
        && normalized(segment.label) === normalized(label) && normalized(segment.units)
        && !own(segment, "value") && !own(segment, "count") && !own(segment, "coinValue");
      const barBase = (bar) => object(bar) && normalized(bar.label) && Number(bar.scale) === 1
        && Array.isArray(bar.segments) && bar.segments.length > 0;

      if (promptId === "question.coinEquivalent") {
        const firstCount = Number(params.firstCount);
        const firstCoin = coinValueCents(params.firstCoin);
        const secondCoin = coinValueCents(params.secondCoin);
        const amount = Number(params.amount);
        const derived = secondCoin > 0 ? amount / secondCoin : NaN;
        const first = bars?.[0], second = bars?.[1], unknown = second?.segments?.[0];
        const firstExact = barBase(first) && Number(first.total) === amount
          && first.segments.length === firstCount
          && first.segments.every((segment, index) => knownSegment(segment)
            && Number(segment.value) === firstCoin && normalized(segment.units) === "cents"
            && normalized(segment.label) === `coin ${index + 1}`);
        const secondExact = barBase(second) && Number(second.total) === amount
          && second.segments.length === 1 && unknownSegment(unknown, "coin count")
          && normalized(unknown.units) === `${normalized(params.secondCoin)} coins`;
        const sourceExact = Number.isSafeInteger(firstCount) && firstCount > 0
          && Number.isSafeInteger(firstCoin) && firstCoin > 0
          && Number.isSafeInteger(secondCoin) && secondCoin > 0
          && Number.isSafeInteger(amount) && amount > 0 && firstCount * firstCoin === amount
          && Number.isSafeInteger(derived) && derived > 0
          && Array.isArray(bars) && bars.length === 2 && firstExact && secondExact
          && values.relation === "equal money value" && values.unknownLabel === "coin count";
        const truthful = sourceExact && answerFreeResult && answer === derived;
        return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, firstExact, secondExact, derived } };
      }

      if (promptId === "question.moneyOperation") {
        const cost = Number(params.cost), paid = Number(params.paid), derived = paid - cost;
        const bar = bars?.[0], segments = bar?.segments || [];
        const costSegment = segments.find((segment) => normalized(segment.label) === "cost");
        const changeSegment = segments.find((segment) => normalized(segment.label) === "change");
        const sourceExact = Number.isSafeInteger(cost) && cost >= 0
          && Number.isSafeInteger(paid) && paid > cost
          && Array.isArray(bars) && bars.length === 1 && barBase(bar) && Number(bar.total) === paid
          && segments.length === 2 && knownSegment(costSegment) && Number(costSegment.value) === cost
          && normalized(costSegment.units) === "cents" && unknownSegment(changeSegment, "change")
          && normalized(changeSegment.units) === "cents"
          && values.relation === "money parts" && values.unknownLabel === "change";
        const truthful = sourceExact && answerFreeResult && answer === derived;
        return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, cost, paid, derived } };
      }

      if (promptId === "question.moneyBudget") {
        const budget = Number(params.budget);
        const costs = [Number(params.firstCost), Number(params.secondCost)];
        const derived = budget - costs.reduce((sum, value) => sum + value, 0);
        const bar = bars?.[0], segments = bar?.segments || [];
        const known = segments.filter((segment) => segment.unknown !== true);
        const remaining = segments.find((segment) => normalized(segment.label) === "remaining");
        const sourceExact = Number.isSafeInteger(budget) && budget > 0
          && costs.every((value) => Number.isSafeInteger(value) && value >= 0) && derived >= 0
          && Array.isArray(bars) && bars.length === 1 && barBase(bar) && Number(bar.total) === budget
          && segments.length === 3 && known.length === 2
          && known.every((segment, index) => knownSegment(segment) && Number(segment.value) === costs[index]
            && normalized(segment.label) === `${index ? "second" : "first"} cost`
            && normalized(segment.units) === "cents")
          && unknownSegment(remaining, "remaining") && normalized(remaining.units) === "cents"
          && values.relation === "budget parts" && values.unknownLabel === "remaining";
        const truthful = sourceExact && answerFreeResult && answer === derived;
        return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, budget, costs, derived } };
      }

      if (["question.moneyPurchase", "question.moneyTotalCost"].includes(promptId)) {
        const costKeys = Object.keys(params).filter((key) => /Cost$/u.test(key));
        const costs = costKeys.map((key) => Number(params[key]));
        const derived = costs.reduce((sum, value) => sum + value, 0);
        const bar = bars?.[0], segments = bar?.segments || [];
        const sourceExact = costKeys.length >= 2 && costs.every((value) => Number.isSafeInteger(value) && value >= 0)
          && Array.isArray(bars) && bars.length === 1 && barBase(bar) && !own(bar, "total")
          && segments.length === costs.length
          && segments.every((segment, index) => knownSegment(segment)
            && Number(segment.value) === costs[index]
            && normalized(segment.label) === costKeys[index].replace(/Cost$/u, " cost")
            && normalized(segment.units) === "cents")
          && values.relation === "total cost" && values.unknownLabel === "total";
        const truthful = sourceExact && answerFreeResult && answer === derived;
        return { pass: Boolean(truthful), reason: { promptId, sourceExact, answerFreeResult, costs, derived } };
      }

      return { pass: false, reason: { promptId, error: "unsupported answer-free proportional bar" } };
    }

    if (model.type === "areaGrid") {
      const width = Number(values.width);
      const height = Number(values.height);
      const parts = values.parts;
      const promptId = normalized(question.semanticPromptStringId);
      const answerFree = !own(values, "total") && !own(values, "value")
        && Array.isArray(parts) && parts.every((part) => !own(part, "value"));

      if (promptId === "question.areaRectangle") {
        const part = parts?.[0];
        const sourceExact = Number.isSafeInteger(width) && width > 0
          && Number.isSafeInteger(height) && height > 0
          && values.operation === "area" && values.unit === "square centimetres"
          && width === Number(question.promptSlots?.width) && height === Number(question.promptSlots?.length)
          && width === Number(question.params?.width) && height === Number(question.params?.length)
          && Array.isArray(parts) && parts.length === 1
          && Number(part?.width) === width && Number(part?.height) === height;
        const derived = width * height;
        const truthful = sourceExact && answerFree && exactNumber(question.answer?.value) === derived;
        return { pass: Boolean(truthful), reason: { promptId, width, height, derived, sourceExact, answerFree } };
      }

      if (promptId === "question.compositeArea") {
        const firstWidth = Number(question.params?.w1), firstHeight = Number(question.params?.l1);
        const secondWidth = Number(question.params?.w2), secondHeight = Number(question.params?.l2);
        const expectedOutline = [
          [0, 0], [firstWidth + secondWidth, 0], [firstWidth + secondWidth, secondHeight],
          [firstWidth, secondHeight], [firstWidth, firstHeight], [0, firstHeight],
        ];
        const expectedCut = [{ x1: firstWidth, y1: 0, x2: firstWidth, y2: secondHeight }];
        const dimensionsExact = [firstWidth, firstHeight, secondWidth, secondHeight]
          .every((value) => Number.isSafeInteger(value) && value > 0)
          && firstHeight > secondHeight;
        const partsExact = Array.isArray(parts) && parts.length === 2
          && Number(parts[0]?.width) === firstWidth && Number(parts[0]?.height) === firstHeight
          && normalized(parts[0]?.label) === "left rectangle"
          && Number(parts[1]?.width) === secondWidth && Number(parts[1]?.height) === secondHeight
          && normalized(parts[1]?.label) === "right rectangle";
        const structureExact = values.operation === "area" && values.layout === "joined-l"
          && values.layout === question.params?.layout
          && values.unit === question.params?.areaUnitWord
          && values.lengthUnitSymbol === question.params?.lengthUnitSymbol
          && JSON.stringify(values.outline) === JSON.stringify(expectedOutline)
          && JSON.stringify(values.candidateCuts) === JSON.stringify(expectedCut);
        const derived = firstWidth * firstHeight + secondWidth * secondHeight;
        const truthful = dimensionsExact && partsExact && structureExact && answerFree
          && exactNumber(question.answer?.value) === derived;
        return { pass: Boolean(truthful), reason: { promptId, derived, dimensionsExact, partsExact, structureExact, answerFree } };
      }

      const partValue = (part) => values.operation === "perimeter"
        ? 2 * (Number(part.width) + Number(part.height))
        : Number(part.width) * Number(part.height);
      const partsExact = Array.isArray(parts) && parts.length
        && parts.every((part) => finite(part.width) && finite(part.height) && finite(part.value)
          && partValue(part) === Number(part.value));
      let promptTruth = false;
      if (promptId === "question.perimeterRectangle") {
        promptTruth = values.operation === "perimeter" && width === Number(question.promptSlots?.width)
          && height === Number(question.promptSlots?.length) && Number(question.answer?.value) === 2 * (width + height);
      } else if (promptId === "question.areaRectangle") {
        promptTruth = values.operation === "area" && width === Number(question.promptSlots?.width)
          && height === Number(question.promptSlots?.length) && Number(question.answer?.value) === width * height;
      } else if (promptId === "question.compositeArea") {
        promptTruth = values.operation === "area" && Array.isArray(parts) && parts.length >= 2
          && Number(question.answer?.value) === parts.reduce((sum, part) => sum + Number(part.value), 0);
      } else if (promptId === "question.compositePerimeter") {
        const shared = Number(values.shared);
        const summedPerimeters = Array.isArray(parts) ? parts.reduce((sum, part) => sum + Number(part.value), 0) : NaN;
        promptTruth = values.operation === "perimeter" && Array.isArray(parts) && parts.length >= 2
          && Number.isFinite(shared) && Number(values.total) === summedPerimeters - 2 * shared
          && Number(question.answer?.value) === Number(values.total);
      } else if (promptId === "question.compositeMissing") {
        const totalLength = Number(values.totalLength);
        const knownLength = Number(values.knownLength);
        const missingLength = Number(values.missingLength);
        promptTruth = values.operation === "missing-length"
          && totalLength === Number(question.promptSlots?.totalLength)
          && knownLength === Number(question.promptSlots?.knownLength)
          && missingLength === totalLength - knownLength
          && Number(question.answer?.value) === missingLength;
      } else {
        promptTruth = width > 0 && height > 0;
      }
      const structureTruth = promptId === "question.compositeMissing" ? promptTruth : Boolean(partsExact);
      return { pass: Boolean(structureTruth && promptTruth), reason: { promptId, width, height, parts: parts?.length || 0, partsExact, operation: values.operation, promptTruth } };
    }

    if (model.type === "clockSpan") {
      const promptId = normalized(question.semanticPromptStringId);
      const startHour = Number(values.startHour), startMinute = Number(values.startMinute);
      const endHour = Number(values.endHour), endMinute = Number(values.endMinute);
      const minuteFields = [startHour, startMinute, endHour, endMinute];
      const clockFieldsExact = minuteFields.every(Number.isSafeInteger)
        && [startHour, endHour].every((hour) => hour >= 0 && hour <= 23)
        && [startMinute, endMinute].every((minute) => minute >= 0 && minute <= 59);
      const answerFree = !own(values, "duration") && !own(values, "durationMinutes") && !own(values, "durationHours");

      if (promptId === "question.durationMinutes") {
        const start = startHour * 60 + startMinute;
        const end = endHour * 60 + endMinute;
        const derived = end - start;
        const paramsExact = startHour === Number(question.params?.startHour)
          && startMinute === Number(question.params?.startMinuteText)
          && endHour === Number(question.params?.endHour)
          && endMinute === Number(question.params?.endMinuteText);
        const truthful = clockFieldsExact && paramsExact && derived > 0 && derived <= 59
          && values.direction === "forward" && answerFree
          && exactNumber(question.answer?.value) === derived;
        return { pass: Boolean(truthful), reason: { promptId, start, end, derived, clockFieldsExact, paramsExact, answerFree } };
      }

      if (promptId === "question.timetableInterval") {
        const startDay = Number(values.startDay), endDay = Number(values.endDay);
        const start = startDay * 1440 + startHour * 60 + startMinute;
        const end = endDay * 1440 + endHour * 60 + endMinute;
        const derived = end - start;
        const formatTime = (hour, minute, format) => format === "24-hour"
          ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
          : `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`;
        const daysExact = Number.isSafeInteger(startDay) && startDay >= 0
          && Number.isSafeInteger(endDay) && endDay >= startDay;
        const paramsExact = values.format === question.params?.format
          && startDay === Number(question.params?.startDay) && endDay === Number(question.params?.endDay)
          && startHour === Number(question.params?.startHour) && endHour === Number(question.params?.endHour)
          && startMinute === Number(question.params?.startMinuteText) && endMinute === Number(question.params?.endMinuteText)
          && values.startTime === question.params?.startTime && values.endTime === question.params?.endTime;
        const formatExact = ["12-hour", "24-hour"].includes(values.format)
          && values.startTime === formatTime(startHour, startMinute, values.format)
          && values.endTime === formatTime(endHour, endMinute, values.format)
          && question.prompt.includes(values.startTime) && question.prompt.includes(values.endTime);
        const truthful = clockFieldsExact && daysExact && paramsExact && formatExact && derived > 0
          && values.direction === "forward" && answerFree
          && exactNumber(question.answer?.value) === derived;
        return { pass: Boolean(truthful), reason: { promptId, startDay, endDay, start, end, derived, clockFieldsExact, daysExact, paramsExact, formatExact, answerFree } };
      }

      return { pass: false, reason: { promptId, error: "unsupported answer-free clock span" } };
    }

    if (model.type === "visualPrompt") {
      const kind = normalized(values.kind);
      const items = Array.isArray(values.items) ? values.items : [];
      const candidates = Array.isArray(values.candidates) ? values.candidates : [];
      const data = object(values.data) ? values.data : {};
      let truthful = Boolean(kind && (items.length || candidates.length || Object.keys(data).length));
      if (kind === "practiceMoney") {
        const item = items[0];
        const candidateValues = candidates.map((candidate) => normalized(candidate.optionValue));
        const questionValues = (question.options || []).map((option) => normalized(option.value));
        const tokenExact = items.length === 1
          && item?.kind === "practiceCoin"
          && normalized(item.tokenId)
          && normalized(item.label)
          && data.tokenSetVersion === "practice-coins-v1";
        const candidatesExact = candidates.length === 5
          && candidateValues.every(Boolean)
          && new Set(candidateValues).size === 5
          && JSON.stringify([...candidateValues].sort()) === JSON.stringify([...questionValues].sort())
          && candidateValues.filter((value) => value === normalized(question.answer?.value)).length === 1;
        truthful &&= Boolean(tokenExact && candidatesExact);
      } else if (/money/iu.test(kind)) {
        const cents = items.map((item) => Number(item.cents)).filter(Number.isFinite);
        truthful &&= cents.length >= 1;
        if (/compare/iu.test(normalized(question.semanticPromptStringId))) truthful &&= cents.length >= 2 && new Set(cents).size >= 2;
      } else if (kind === "arithmeticSets") {
        const left = Number(data.left);
        const right = Number(data.right);
        const operations = {
          "+": (a, b) => a + b,
          "-": (a, b) => a - b,
          "−": (a, b) => a - b,
          "×": (a, b) => a * b,
          "*": (a, b) => a * b,
          "÷": (a, b) => a / b,
          "/": (a, b) => a / b,
        };
        const operation = operations[data.operation];
        const expected = operation && Number.isFinite(left) && Number.isFinite(right) ? operation(left, right) : null;
        truthful &&= expected !== null && exactNumber(question.answer?.value) === expected;
      } else if (/graph/iu.test(kind)) {
        const series = items[0]?.series ?? data.series;
        truthful &&= object(series) && Object.values(series).every(finite);
      } else if (kind === "numberOrder") {
        const shown = items.map((item) => Number(item.value));
        const goal = data.goal;
        const expected = goal === "least" ? Math.min(...shown) : Math.max(...shown);
        truthful &&= shown.length >= 3 && shown.every(Number.isFinite) && new Set(shown).size === shown.length
          && data.stimulus === true && ["least", "greatest"].includes(goal) && exactNumber(question.answer?.value) === expected;
      } else if (kind === "objectSet" && question.semanticPromptStringId === "question.countSet") {
        truthful &&= data.stimulus === true && items.length === 1 && Number(items[0]?.magnitude) === Number(data.count)
          && exactNumber(question.answer?.value) === Number(data.count);
      } else if (kind === "pattern" && question.semanticPromptStringId === "question.patternVisualNext") {
        const sequence = items[0]?.sequence;
        const unit = String(question.params?.unit || "").split(/\s+/u).filter(Boolean);
        truthful &&= data.stimulus === true && Array.isArray(sequence) && sequence.length >= 4 && unit.length === 2
          && sequence.every((value, index) => value === unit[index % unit.length])
          && normalized(question.answer?.value) === normalized(unit[sequence.length % unit.length]);
      } else if (kind === "number" && question.semanticPromptStringId === "question.numeralForm") {
        const numberWords = [
          "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
          "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
          "nineteen", "twenty",
        ];
        const word = normalized(data.numberWord).toLowerCase();
        const derived = numberWords.indexOf(word);
        const candidateValues = candidates.map((candidate) => exactNumber(candidate?.optionValue));
        const selectionCandidatesExact = candidates.length >= 2 && candidateValues.every((value) => value !== null)
          && new Set(candidateValues).size === candidateValues.length
          && candidateValues.filter((value) => value === derived).length === 1
          && candidates.every((candidate) => normalized(candidate.label) === normalized(candidate.optionValue));
        const constructionPromptExact = question.inputClass === "CONSTRUCTION"
          && question.inputMethod === "NUMBER_PAD"
          && candidates.length === 0;
        const semanticExact = derived >= 0 && word === normalized(question.params?.numberWord).toLowerCase()
          && (!own(data, "numeral") || Number(data.numeral) === derived)
          && exactNumber(question.answer?.value) === derived;
        const answerFree = items.length === 0;
        truthful &&= (selectionCandidatesExact || constructionPromptExact) && semanticExact && answerFree;
      } else if (kind === "numericPrompt") {
        truthful &&= typeof data.semanticPromptStringId === "string";
      } else if (kind === "volume") {
        const item = items[0];
        const length = Number(data.length);
        const width = Number(data.width);
        const height = Number(data.height);
        const total = length * width * height;
        const representationExact = data.representation === "unit-cubes"
          && item?.kind === "prism"
          && Number(item.length) === length && Number(item.width) === width && Number(item.height) === height
          || data.representation === "layers" && item?.kind === "cubeLayers"
            && Number(item.length) === length && Number(item.width) === width && Number(item.height) === height
            && Number(item.layers) === height && Number(item.cubesPerLayer) === length * width;
        const answerFree = !own(data, "total") && !own(item, "total");
        truthful &&= representationExact && answerFree && total > 0 && exactNumber(question.answer?.value) === total;
      } else if (/geometry|shape|solid|volume|measure|pattern|quantity|number|ordinal|skip/iu.test(kind)) {
        truthful &&= items.length >= 1;
      }
      return { pass: Boolean(truthful), reason: { kind, items: items.length, candidates: candidates.length, dataKeys: Object.keys(data) } };
    }

    return { pass: false, reason: `unsupported model descriptor type: ${model.type}` };
  }

  const STRUCTURED_RESPONSE_METHODS = new Set([
    "COUNT_TOUCH", "ORDER_BUILD", "PLACE_VALUE_BUILD", "STRATEGY_BUILD", "COIN_BUILD", "SYMMETRY_BUILD",
    "EXPRESSION_BUILD", "PAIR_LINK", "SORT_BINS", "SHARE_DEAL", "GROUP_BUILD",
    "BOND_SPLIT", "PATTERN_BUILD", "LANDMARK_PLACE", "ACTION_SCENE", "SLOT_COMPOSER",
    "FACT_FAMILY", "GRAPH_BUILD", "FRACTION_PARTITION", "GRID_ROUTE", "CLOCK_READ",
    "METRIC_SCALE", "ANGLE_MEASURE", "MEASURE_OBJECT", "AREA_DECOMPOSE", "VOLUME_INSPECT",
  ]);
  const RENDERER_CAPABLE_METHODS = Object.freeze([
    "ACTION_SCENE", "ANGLE_MEASURE", "AREA_DECOMPOSE", "BAR_MODEL", "BOND_SPLIT",
    "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY",
    "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
    "LANDMARK_PLACE", "MEASURE_OBJECT", "METRIC_SCALE", "MIXED_NUMBER_ENTRY", "NUMBER_BOND",
    "NUMBER_CHOICE", "NUMBER_LINE", "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD",
    "PICTURE_CHOICE", "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD",
    "SYMMETRY_BUILD", "TEN_FRAME", "VOLUME_INSPECT",
  ]);
  const RELEASE_REACHABLE_METHODS = Object.freeze([
    "ACTION_SCENE", "ANGLE_MEASURE", "AREA_DECOMPOSE", "BAR_MODEL", "BOND_SPLIT",
    "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH", "EXPRESSION_BUILD", "FACT_FAMILY",
    "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD", "GRID_ROUTE", "GROUP_BUILD",
    "LANDMARK_PLACE", "MEASURE_OBJECT", "METRIC_SCALE", "MIXED_NUMBER_ENTRY", "NUMBER_LINE",
    "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
    "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
    "TEN_FRAME", "VOLUME_INSPECT",
  ]);
  const PLACEMENT_REACHABLE_METHODS = Object.freeze([
    "ACTION_SCENE", "BAR_MODEL", "BOND_SPLIT", "CLOCK_READ", "COIN_BUILD", "COUNT_TOUCH",
    "EXPRESSION_BUILD", "FACT_FAMILY", "FRACTION_ENTRY", "FRACTION_PARTITION", "GRAPH_BUILD",
    "GRID_ROUTE", "GROUP_BUILD", "LANDMARK_PLACE", "MEASURE_OBJECT", "MIXED_NUMBER_ENTRY",
    "NUMBER_LINE", "NUMBER_PAD", "ORDER_BUILD", "PAIR_LINK", "PATTERN_BUILD", "PICTURE_CHOICE",
    "PLACE_VALUE_BUILD", "SHARE_DEAL", "SLOT_COMPOSER", "SORT_BINS", "STRATEGY_BUILD", "SYMMETRY_BUILD",
    "TEN_FRAME",
  ]);
  const PRACTICE_TOKEN_VISUAL_ORACLE = Object.freeze([
    Object.freeze({ tokenId: "single-dot", value: "5\u00a2" }),
    Object.freeze({ tokenId: "double-stripe", value: "10\u00a2" }),
    Object.freeze({ tokenId: "triangle-dots", value: "25\u00a2" }),
    Object.freeze({ tokenId: "cross-bars", value: "$1" }),
    Object.freeze({ tokenId: "ring-diamond", value: "$2" }),
  ]);
  const PRACTICE_TOKEN_VISUAL_VIEWPORTS = Object.freeze([
    Object.freeze({ viewport: "desktop", width: 1366, height: 768 }),
    Object.freeze({ viewport: "tablet-portrait", width: 820, height: 1180 }),
    Object.freeze({ viewport: "ipad-landscape-large", width: 1180, height: 820 }),
    Object.freeze({ viewport: "ipad-landscape-standard", width: 1024, height: 768 }),
    Object.freeze({ viewport: "phone", width: 390, height: 844 }),
  ]);
  const PRACTICE_TOKEN_VISUAL_STATES = Object.freeze(["ordinary", "tutorial-notice", "incorrect"]);

  const indexedItems = (prefix, count) => Array.from(
    { length: Math.max(0, Number(count) || 0) },
    (_, index) => `${prefix}${index}`,
  );

  function coinValueCents(label) {
    const text = normalized(label);
    const value = Number(text.replace(/[^\d]/gu, ""));
    return text.startsWith("$") ? value * 100 : value;
  }

  function strategyBuildAnswer(question) {
    const params = question.params || {};
    const left = Number(params.a);
    const right = Number(params.b);
    const expression = String(params.expression || "").match(/^(\d+)\s*([+−×])\s*(\d+)$/u);
    let strategy = null;
    if (question.skillId === "MQ-040") strategy = ({
      "add-by-counting-on": "count-on", "add-by-making-ten": "make-ten", "add-by-known-bond": "known-bond",
    })[question.taskType];
    else if (question.skillId === "MQ-041") strategy = ({
      "subtract-by-counting-back": "count-back", "subtract-by-counting-up": "count-up", "subtract-by-known-bond": "known-bond",
    })[question.taskType];
    else if (question.skillId === "MQ-079") strategy = ["partition", "array", "written layout"][Number(question.ordinal) % 3];
    else if (question.skillId === "MQ-095") strategy = "mental";
    else if (question.skillId === "MQ-097" && expression) strategy = expression[2] === "×"
      ? (Number(expression[1]) % 2 === 0 || Number(expression[3]) % 2 === 0 ? "an even factor makes an even product" : "two odd factors make an odd product")
      : (Number(expression[1]) % 2 === Number(expression[3]) % 2 ? "same-parity numbers give an even result" : "different-parity numbers give an odd result");
    else if (question.skillId === "MQ-101") strategy = "use subtraction";
    let value;
    if (question.skillId === "MQ-040") value = left + right;
    else if (question.skillId === "MQ-041") value = left - right;
    else if (question.skillId === "MQ-079") value = left * right;
    else if (question.skillId === "MQ-095") value = question.taskType === "addition" ? left + right : left - right;
    else if (question.skillId === "MQ-097" && expression) {
      const a = Number(expression[1]), b = Number(expression[3]);
      const result = expression[2] === "+" ? a + b : expression[2] === "−" ? a - b : a * b;
      value = result % 2 === 0 ? "even" : "odd";
    } else if (question.skillId === "MQ-101") value = Number(params.whole) - Number(question.semanticPromptStringId === "question.missingSubtrahend" ? params.result : params.part);
    let work = [];
    if (question.skillId === "MQ-040") {
      if (strategy === "count-on") work = Array.from({ length: Math.min(left, right) }, (_, index) => String(Math.max(left, right) + index + 1));
      else if (strategy === "make-ten") work = [String(10 - left), String(right - (10 - left))];
      else work = [String(left), String(right)];
    } else if (question.skillId === "MQ-041") {
      if (strategy === "count-back") work = Array.from({ length: right }, (_, index) => String(left - index - 1));
      else if (strategy === "count-up") work = Array.from({ length: left - right }, (_, index) => String(right + index + 1));
      else work = [String(right), String(value)];
    } else if (question.skillId === "MQ-079") {
      const operands = [left, right], twoDigit = operands.find((number) => number >= 10), oneDigit = operands.find((number) => number <= 9);
      const tens = Math.floor(twoDigit / 10) * 10, ones = twoDigit % 10;
      if (strategy === "array") work = [String(twoDigit), String(oneDigit)];
      else if (strategy === "partition") work = [String(tens), String(ones), String(tens * oneDigit), String(ones * oneDigit)];
      else { const onesProduct = ones * oneDigit; work = [String(onesProduct), String(Math.floor(onesProduct / 10)), String(Math.floor(twoDigit / 10) * oneDigit + Math.floor(onesProduct / 10))]; }
    } else if (question.skillId === "MQ-095") {
      const chunks = String(Math.abs(right)).split("").map((digit, index, digits) => Number(digit) * 10 ** (digits.length - index - 1)).filter(Boolean);
      let running = left;
      work = chunks.map((chunk) => String(running = question.taskType === "addition" ? running + chunk : running - chunk));
    } else if (question.skillId === "MQ-097" && expression) work = [Number(expression[1]) % 2 ? "odd" : "even", Number(expression[3]) % 2 ? "odd" : "even"];
    else if (question.skillId === "MQ-101") work = [String(question.semanticPromptStringId === "question.missingSubtrahend" ? params.result : params.part), String(value)];
    return { strategy, work, value };
  }

  function structuredAnswer(engine, question) {
    const state = engine.createResponseState(question);
    const params = question.params || {};
    switch (question.inputMethod) {
      case "COUNT_TOUCH":
        state.touched = indexedItems("i", Number(question.answer.value));
        state.count = String(question.answer.value);
        break;
      case "ORDER_BUILD":
        state.order = [Number(params.before), Number(question.answer.value), Number(params.after)];
        break;
      case "PLACE_VALUE_BUILD":
        state.action = Array.isArray(params.strategyChoices) && params.strategyChoices.length
          ? String(params.strategy ?? params.strategyChoices[0])
          : question.semanticPromptStringId === "question.renamePlace" ? "trade"
            : question.semanticPromptStringId === "question.scalePlace" ? "shift"
              : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId)
                ? "partition" : "build";
        state.value = Array.isArray(params.responseValueChoices) && params.responseValueChoices.length
          ? String(question.answer.value)
          : Number(question.answer.value);
        break;
      case "STRATEGY_BUILD":
        return strategyBuildAnswer(question);
      case "COIN_BUILD":
        state.coins = Array.from({ length: Number(question.answer.value) }, () => coinValueCents(params.secondCoin));
        break;
      case "SYMMETRY_BUILD":
        state.lines = Array.isArray(params.requiredLineIds)
          ? [...params.requiredLineIds]
          : Array.from({ length: Number(question.answer.value) }, (_, index) => `line${index + 1}`);
        break;
      case "EXPRESSION_BUILD":
        state.rule = String(params.rule);
        state.value = Number(question.answer.value);
        break;
      case "PAIR_LINK":
        state.links = Array.from(
          { length: Math.min(Number(params.leftCount ?? params.count), Number(params.rightCount ?? params.count)) },
          (_, index) => [`a${index}`, `b${index}`],
        );
        if (question.semanticPromptStringId === "question.compare") {
          state.relation = String(question.answer.value);
        }
        break;
      case "SORT_BINS": {
        const values = question.modelDescriptor.values;
        const categories = Array.isArray(values.categories) ? values.categories : [];
        if (categories.length) {
          state.placements = Object.fromEntries((values.items || []).map((item, index) => {
            const itemValue = attributeItemValue(item, values.rule?.attribute);
            const category = categories.find((candidate) => normalized(candidate.value).toLowerCase() === itemValue);
            return [`i${index}`, normalized(category?.id)];
          }));
        } else {
          const targets = new Set((values.items || [])
            .map((item, index) => attributeItemMatchesRule(item, values.rule) ? index : -1)
            .filter((index) => index >= 0));
          state.placements = Object.fromEntries(
            (values.items || []).map((_, index) => [`i${index}`, targets.has(index) ? "matches" : "other"]),
          );
        }
        break;
      }
      case "SHARE_DEAL": {
        const recipients = Number(params.recipients);
        const total = Number(params.total);
        const remainder = total % recipients;
        state.history = [];
        let next = 1;
        while (state.pool.length > remainder) {
          const recipient = `r${next}`;
          const item = state.pool.shift();
          state.recipients[recipient].push(item);
          state.history.push([recipient, item]);
          next = next % recipients + 1;
        }
        break;
      }
      case "GROUP_BUILD": {
        const groups = Number(params.groups ?? params.a);
        state.history = [];
        let next = 1;
        while (state.pool.length) {
          const recipient = `g${next}`;
          const item = state.pool.shift();
          state.recipients[recipient].push(item);
          state.history.push([recipient, item]);
          next = next % groups + 1;
        }
        break;
      }
      case "BOND_SPLIT": {
        const counts = question.semanticPromptStringId === "question.secondPartition"
          ? [Number(params.secondA), Number(question.answer.value)]
          : [Number(params.part), Number(question.answer.value)];
        for (let index = 0; index < counts[0]; index += 1) {
          const item = state.pool.shift();
          state.groups.g1.push(item);
          state.history.push(["g1", item]);
        }
        for (let index = 0; index < counts[1]; index += 1) {
          const item = state.pool.shift();
          state.groups.g2.push(item);
          state.history.push(["g2", item]);
        }
        break;
      }
      case "PATTERN_BUILD":
        state.tokens = String(question.answer.value).trim().split(/\s+/u).filter(Boolean);
        break;
      case "LANDMARK_PLACE":
        state.relation = String(question.answer.value);
        break;
      case "SLOT_COMPOSER": {
        const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
        state.slots = [String(params.a), operation, String(params.b), "=", String(question.answer.value)];
        break;
      }
      case "FACT_FAMILY": {
        const a = Number(params.a), b = Number(params.b), whole = Number(params.whole);
        state.selected = params.equationFamily === "multiply-divide"
          ? [`${a}\u00d7${b}=${whole}`, `${b}\u00d7${a}=${whole}`, `${whole}\u00f7${a}=${b}`, `${whole}\u00f7${b}=${a}`]
          : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
        break;
      }
      case "GRAPH_BUILD": {
        const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
        state.categories = Object.fromEntries(
          keys.filter((key) => Number.isFinite(Number(params[key]))).map((key) => [key, Number(params[key])]),
        );
        if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = String(question.answer.value);
        if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = Number(question.answer.value);
        break;
      }
      case "FRACTION_PARTITION": {
        const fraction = engine.parseRational(question.answer.value);
        if (!fraction) throw new Error(`${question.skillId}: invalid fraction audit fixture`);
        state.templateId = "vertical";
        const denominator = Number(state.denominator);
        const shadedCount = Number(fraction.n) * denominator / Number(fraction.d);
        if (!Number.isInteger(shadedCount)) throw new Error(`${question.skillId}: unreachable fraction audit fixture`);
        state.shaded = indexedItems("part", shadedCount);
        break;
      }
      case "GRID_ROUTE": {
        state.moves = Array.isArray(params.moves) ? [...params.moves] : [];
        const coordinate = String(question.answer.value).match(/^\((\d+),(\d+)\)$/u);
        const cell = String(question.answer.value).match(/^([A-Z])(\d+)$/u);
        if (coordinate) state.end = { x: Number(coordinate[1]), y: Number(coordinate[2]) };
        else if (cell) state.end = { x: cell[1].charCodeAt(0) - 64, y: Number(cell[2]) };
        else state.value = String(question.answer.value);
        break;
      }
      case "CLOCK_READ": {
        const time = String(question.answer.value).match(/^(\d+):(\d{2})$/u);
        if (!time) throw new Error(`${question.skillId}: invalid clock audit fixture`);
        state.hour = Number(time[1]);
        state.minute = Number(time[2]);
        break;
      }
      case "METRIC_SCALE":
        state.value = Number(question.answer.value);
        break;
      case "ANGLE_MEASURE":
        state.degrees = Number(question.answer.value);
        break;
      case "ACTION_SCENE":
        state.actions = Array.from(
          { length: Math.abs(Number(params.b)) },
          () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
        );
        state.value = String(question.answer.value);
        break;
      case "MEASURE_OBJECT":
        state.actions = Array.from({ length: Number(params.count) }, () => "place-unit");
        state.value = String(params.count);
        break;
      case "AREA_DECOMPOSE":
        state.cutIds = ["cut1"];
        state.part0 = String(Number(params.l1) * Number(params.w1));
        state.part1 = String(Number(params.l2) * Number(params.w2));
        state.total = String(question.answer.value);
        break;
      case "VOLUME_INSPECT":
        state.viewedLayers = Array.from({ length: Number(params.height) }, (_, index) => index + 1);
        state.method = String(params.method);
        state.value = String(question.answer.value);
        break;
      default:
        throw new Error(`${question.skillId}: no structured-response audit fixture for ${question.inputMethod}`);
    }
    return engine.serializeResponse(question, state);
  }

  function correctAnswer(engine, question) {
    if (question?.inputClass === "SELECTION") {
      const option = question.options?.[question.correctIndex];
      if (!option) throw new Error(`${question?.skillId || "unknown"}: placement selection has no correct option`);
      return { optionId: option.optionId };
    }
    return STRUCTURED_RESPONSE_METHODS.has(question?.inputMethod)
      ? structuredAnswer(engine, question)
      : question?.answer?.value;
  }

  function placementCases(engine, state, playDay = state.maxSeenPlayDay) {
    const methods = new Map();
    const rows = [];
    for (let desiredLevel = engine.CONSTANTS.LEVEL_MIN; desiredLevel <= engine.CONSTANTS.LEVEL_MAX; desiredLevel += 1) {
      let run = engine.createPlacementRun({
        state,
        playDay,
        seed: state.seed,
        theme: "ocean",
      });
      for (let index = 0; index < engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS; index += 1) {
        const validation = engine.validatePlacementRun(run, state);
        if (!validation.valid) throw new Error(validation.error);
        if (validation.complete) break;
        const question = engine.placementCurrentQuestion(run);
        if (!methods.has(question.inputMethod)) {
          methods.set(question.inputMethod, { run, question, desiredLevel });
        }
        const submitted = question.level < desiredLevel
          ? engine.submitPlacementAnswer(run, correctAnswer(engine, question))
          : engine.submitPlacementNotSure(run);
        run = submitted.run;
      }
      const validation = engine.validatePlacementRun(run, state);
      const recommendation = engine.placementRecommendation(run);
      rows.push({
        desiredLevel,
        questionCount: run.answers.length,
        complete: validation.valid && validation.complete,
        recommendedLevel: recommendation?.recommendedLevel ?? null,
        pass: Boolean(
          validation.valid
          && validation.complete
          && run.answers.length >= engine.CONSTANTS.PLACEMENT_MIN_QUESTIONS
          && run.answers.length <= engine.CONSTANTS.PLACEMENT_MAX_QUESTIONS
          && recommendation?.recommendedLevel === desiredLevel
        ),
      });
    }
    return {
      rows,
      methods: [...methods.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([inputMethod, witness]) => ({ inputMethod, ...witness })),
    };
  }

  function placementDraftRecord(engine, state, run, question = engine.placementCurrentQuestion(run)) {
    return JSON.stringify({
      schemaVersion: 4,
      placementDraftGeneration: state.placementDraftGeneration,
      run,
      ui: {
        world: run.theme,
        phase: "question",
        questionId: question.questionId,
        selected: null,
        entry: "",
        fractionParts: { whole: "", numerator: "", denominator: "" },
        modelCells: [],
        responseState: engine.createResponseState(question),
        responseKind: null,
        feedbackKind: null,
      },
    });
  }

  function inputContract(question) {
    if (question?.inputClass === "SELECTION") return uniqueGradedChoice(this, question);
    if (question?.inputClass !== "CONSTRUCTION") return false;
    const response = STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)
      ? structuredAnswer(this, question) : question.answer?.value;
    const graded = this.gradeAnswer(question, response);
    const contract = this.validateQuestionContract?.(question);
    return Boolean(graded.correct && graded.valid && (!contract || contract.valid));
  }

  function constraintSanity(skill, question) {
    const constraints = skill?.constraints || {};
    const values = question?.modelDescriptor?.values || {};
    const issues = [];
    const add = (rule, detail) => issues.push({ rule, detail });
    const within = (value, minimum, maximum, label) => {
      const number = exactNumber(value);
      if (number !== null && (number < minimum || number > maximum)) {
        add(label, { value, minimum, maximum });
      }
    };
    const walkFinite = (value, path = "question") => {
      if (typeof value === "number" && !Number.isFinite(value)) add("finite-number", { path, value: String(value) });
      else if (Array.isArray(value)) value.forEach((entry, index) => walkFinite(entry, `${path}[${index}]`));
      else if (object(value)) Object.entries(value).forEach(([key, entry]) => walkFinite(entry, `${path}.${key}`));
    };
    walkFinite({
      params: question?.params,
      answer: question?.answer,
      modelDescriptor: question?.modelDescriptor,
    });

    if (Array.isArray(constraints.range) && constraints.range.length === 2
      && constraints.range.every(finite)) {
      const [minimum, maximum] = constraints.range.map(Number);
      within(question?.answer?.value, minimum, maximum, "range-answer");
      if (question?.modelDescriptor?.type === "fractionPair") {
        (values.representations || []).forEach((representation, index) => {
          within(representation.value ?? representation.label, minimum, maximum, `range-representation-${index}`);
        });
      }
      if (question?.modelDescriptor?.type === "numberLine") {
        (values.points || []).forEach((point, index) => within(point?.value ?? point, minimum, maximum, `range-point-${index}`));
      }
    }

    const subjectNumbers = [];
    if (finite(values?.data?.count)) subjectNumbers.push(Number(values.data.count));
    if (question?.modelDescriptor?.type === "comparison") {
      for (const side of [values.left, values.right]) {
        const magnitude = exactNumber(side?.magnitude ?? side?.value);
        if (magnitude !== null) subjectNumbers.push(magnitude);
      }
    }
    if (question?.modelDescriptor?.type === "placeValue") {
      const source = exactNumber(values.source);
      if (source !== null) subjectNumbers.push(source);
    }
    if (!subjectNumbers.length && skill?.generatorProfile === "quantity-identify") {
      const answer = exactNumber(question?.answer?.value);
      if (answer !== null) subjectNumbers.push(answer);
    }
    if (finite(constraints.minNumber) || finite(constraints.maxNumber)) {
      const minimum = finite(constraints.minNumber) ? Number(constraints.minNumber) : -Infinity;
      const maximum = finite(constraints.maxNumber) ? Number(constraints.maxNumber) : Infinity;
      subjectNumbers.forEach((number, index) => within(number, minimum, maximum, `number-bound-${index}`));
    }

    const denominatorValues = [];
    const collectDenominators = (value, key = "") => {
      if (Array.isArray(value)) value.forEach((entry) => collectDenominators(entry, key));
      else if (object(value)) Object.entries(value).forEach(([name, entry]) => {
        if (/denominator|^d\d+$/iu.test(name) && finite(entry)) denominatorValues.push(Number(entry));
        else collectDenominators(entry, name);
      });
    };
    collectDenominators(question?.promptSlots || {});
    collectDenominators(question?.params || {});
    if (question?.modelDescriptor?.type === "fractionPair") {
      (values.representations || []).filter((entry) => entry?.role !== "result").forEach((entry) => {
        if (finite(entry.denominator)) denominatorValues.push(Number(entry.denominator));
      });
    }
    if (Array.isArray(constraints.denominators) && constraints.denominators.length) {
      const allowed = new Set(constraints.denominators.map(Number));
      denominatorValues.forEach((denominator) => {
        if (!allowed.has(denominator)) add("allowed-denominator", { denominator, allowed: [...allowed] });
      });
    }
    if (finite(constraints.denominatorMax)) {
      denominatorValues.forEach((denominator) => {
        if (denominator < 1 || denominator > Number(constraints.denominatorMax)) {
          add("denominatorMax", { denominator, maximum: Number(constraints.denominatorMax) });
        }
      });
    }

    if (finite(constraints.decimalPlacesMax)) {
      const decimalPlaces = (value) => {
        const text = normalized(value);
        const match = text.match(/^-?\d+\.(\d+)$/u);
        return match ? match[1].length : 0;
      };
      if (decimalPlaces(question?.answer?.value) > Number(constraints.decimalPlacesMax)) {
        add("decimalPlacesMax", { value: question.answer.value, maximum: Number(constraints.decimalPlacesMax) });
      }
    }

    if (finite(constraints.termsMin)) {
      const sequences = (values.items || []).map((item) => item?.sequence).filter(Array.isArray);
      const visibleTerms = sequences.length ? Math.max(...sequences.map((sequence) => sequence.length + 1)) : 0;
      if (visibleTerms < Number(constraints.termsMin)) {
        add("termsMin", { visibleTerms, minimum: Number(constraints.termsMin) });
      }
    }

    if (finite(constraints.repeatsShownMin)) {
      const sequence = (values.items || []).map((item) => item?.sequence).find(Array.isArray) || [];
      let repeats = 0;
      for (let period = 1; period <= Math.floor(sequence.length / 2); period += 1) {
        if (sequence.every((entry, index) => entry === sequence[index % period])) {
          repeats = Math.floor(sequence.length / period);
          break;
        }
      }
      if (repeats < Number(constraints.repeatsShownMin)) {
        add("repeatsShownMin", { repeats, minimum: Number(constraints.repeatsShownMin), sequence });
      }
    }

    if (constraints.unitMarked === true) {
      const explicitlyMarked = values?.data?.unitMarked === true
        || (values.items || []).some((item) => item?.unitMarked === true || finite(item?.markedUnitLength))
        || /\[[^\]]+\]\s+\[[^\]]+\]/u.test(normalized(question?.prompt));
      if (!explicitlyMarked) add("unitMarked", "The descriptor has no explicit repeating-unit marker.");
    }

    if (skill?.generatorProfile === "quantity-identify" && Array.isArray(constraints.structures) && constraints.structures.length) {
      const structure = values?.data?.structure || values?.items?.[0]?.structure;
      if (!constraints.structures.includes(structure)) {
        add("structures", { structure: structure || null, allowed: constraints.structures });
      }
    }

    if (Array.isArray(constraints.minuteValues) && constraints.minuteValues.length) {
      const minutes = [];
      (values.items || []).forEach((item) => {
        if (String(item?.kind).toLowerCase() === "clock" && finite(item.minute)) minutes.push(Number(item.minute));
      });
      if (finite(values.startMinute)) minutes.push(Number(values.startMinute));
      if (finite(values.endMinute)) minutes.push(Number(values.endMinute));
      const allowed = new Set(constraints.minuteValues.map(Number));
      minutes.forEach((minute) => {
        if (!allowed.has(minute)) add("minuteValues", { minute, allowed: [...allowed] });
      });
      const clock = (values.items || []).find((item) => String(item?.kind).toLowerCase() === "clock");
      if (/read/iu.test(normalized(question?.taskType)) && clock && finite(clock.hour) && finite(clock.minute)) {
        const exactTime = `${Number(clock.hour)}:${String(Number(clock.minute)).padStart(2, "0")}`;
        if (normalized(question?.prompt).includes(exactTime)) {
          add("clock-answer-leak", { exactTime, prompt: normalized(question?.prompt) });
        }
      }
    }

    if (finite(constraints.coordinateMax) && values?.data?.start) {
      const points = [values.data.start];
      const finish = normalized(values.data.finish).match(/^\((-?\d+),\s*(-?\d+)\)$/u);
      if (finish) points.push({ x: Number(finish[1]), y: Number(finish[2]) });
      (values.candidates || []).forEach((candidate) => {
        const coordinate = normalized(candidate?.optionValue ?? candidate?.label)
          .match(/^\((-?\d+),\s*(-?\d+)\)$/u);
        if (coordinate) points.push({ x: Number(coordinate[1]), y: Number(coordinate[2]) });
      });
      for (const [index, point] of points.entries()) {
        if (!finite(point.x) || !finite(point.y)) {
          add("coordinate-finite", { index, point });
          continue;
        }
        const maximum = Number(constraints.coordinateMax);
        if (Number(point.x) > maximum || Number(point.y) > maximum) add("coordinateMax", { index, point, maximum });
        if (Array.isArray(constraints.quadrants) && constraints.quadrants.length === 1 && Number(constraints.quadrants[0]) === 1
          && (Number(point.x) <= 0 || Number(point.y) <= 0)) {
          add("first-quadrant", { index, point });
        }
      }
    }

    if (question?.modelDescriptor?.type === "fractionPair"
      && /tenths|hundredths/iu.test(`${normalized(skill?.title)} ${normalized(skill?.objective)}`)) {
      const decimal = (values.representations || []).find((entry) => entry?.kind === "decimal");
      const fraction = (values.representations || []).find((entry) => entry?.kind === "fraction");
      if (decimal && fraction) {
        const decimalText = normalized(decimal.label ?? question?.answer?.value);
        const decimalMatch = decimalText.match(/^-?\d+\.(\d{1,2})$/u);
        const expectedDenominator = decimalMatch ? 10 ** decimalMatch[1].length : null;
        const expectedNumerator = decimalMatch
          ? Math.round(Math.abs(Number(decimalText) % 1) * expectedDenominator)
          : null;
        if (expectedDenominator !== null
          && (Number(fraction.denominator) !== expectedDenominator
            || Number(fraction.numerator) !== expectedNumerator)) {
          add("place-value-fraction-model", {
            decimal: decimalText,
            fraction: `${fraction.numerator}/${fraction.denominator}`,
            expected: `${expectedNumerator}/${expectedDenominator}`,
          });
        }
      }
    }

    return { pass: issues.length === 0, issues };
  }

  function make(engine, skill, tier = "HARD/TARGET", ordinal = 0) {
    return engine.makeQuestion({
      skillId: skill.skillId,
      tier,
      representation: skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT",
      seed: LAB_SEED,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
      scheduledReview: false,
      coldTest: false,
      preview: true,
      theme: "ocean",
      scaffolded: true,
    });
  }

  function semanticVisualObligationKey(question) {
    const semanticFacet = [
      question.params?.place,
      question.params?.interpretation,
      question.params?.format,
      question.params?.representation,
      question.params?.unit,
      question.params?.solid,
      question.params?.tokenId,
    ].filter(Boolean).join("|");
    return `${question.modelDescriptor.type}|${question.semanticPromptStringId}${semanticFacet ? `|${semanticFacet}` : ""}`;
  }

  function practiceTokenVisualObligations() {
    return Object.freeze(PRACTICE_TOKEN_VISUAL_ORACLE.flatMap(({ tokenId, value }) => (
      PRACTICE_TOKEN_VISUAL_VIEWPORTS.flatMap(({ viewport, width, height }) => (
        PRACTICE_TOKEN_VISUAL_STATES.map((state) => Object.freeze({
          tokenId,
          value,
          viewport,
          width,
          height,
          state,
        }))
      ))
    )));
  }

  function practiceTokenVisualRowKey(row) {
    return `${row.tokenId}|${row.value}|${row.viewport}|${row.width}x${row.height}|${row.state}`;
  }

  function practiceTokenStateTokenContract(state, sourceTokenId, renderedTokenIds, tutorialTokenIds) {
    const governedTokenIds = new Set(PRACTICE_TOKEN_VISUAL_ORACLE.map(({ tokenId }) => tokenId));
    const rendered = [...new Set(renderedTokenIds)];
    const tutorial = [...new Set(tutorialTokenIds)];
    if (state === "tutorial-notice") {
      return tutorial.length === 1
        && governedTokenIds.has(tutorial[0])
        && tutorial[0] !== sourceTokenId
        && rendered.length === 1
        && rendered[0] === tutorial[0];
    }
    return rendered.includes(sourceTokenId)
      && rendered.every((tokenId) => tokenId === sourceTokenId);
  }

  function generatedCaseMap(engine) {
    const byMethod = new Map();
    const byDescriptor = new Map();
    const bySemanticModel = new Map();
    for (const skill of engine.SKILLS) {
      for (const tier of TIERS) {
        for (const ordinal of sampleOrdinals(skill)) {
          const question = make(engine, skill, tier, ordinal);
          if (!byMethod.has(question.inputMethod)) byMethod.set(question.inputMethod, { skill, tier, ordinal, question });
          if (!byDescriptor.has(question.modelDescriptor.type)) byDescriptor.set(question.modelDescriptor.type, { skill, tier, ordinal, question });
          const semanticKey = semanticVisualObligationKey(question);
          if (!bySemanticModel.has(semanticKey)) bySemanticModel.set(semanticKey, { skill, tier, ordinal, question });
        }
      }
    }
    return { byMethod, byDescriptor, bySemanticModel };
  }

  function controlContract(wrapper, question) {
    if (!wrapper || wrapper.dataset.inputMethod !== question.inputMethod) return false;
    if (question.inputClass === "SELECTION") return Boolean(wrapper.querySelector('[data-lab-action="select"]'));
    if (STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)) {
      const task = wrapper.querySelector(`[data-response-kind="${CSS.escape(question.inputMethod)}"]`);
      return Boolean(task && task.querySelector('[data-lab-action="response"],[data-response-input]'));
    }
    const selectors = {
      TEN_FRAME: '[data-lab-action="model-cell"]',
      NUMBER_LINE: '[data-lab-action="line-mark"]',
      NUMBER_BOND: '[data-lab-action="key"]',
      NUMBER_PAD: '[data-lab-action="key"]',
      FRACTION_ENTRY: '[data-control-part="numerator"],[data-control-part="denominator"]',
      MIXED_NUMBER_ENTRY: '[data-control-part="whole"],[data-control-part="numerator"],[data-control-part="denominator"]',
      BAR_MODEL: '[data-lab-action="bar-part"]',
    };
    const selector = selectors[question.inputMethod];
    if (!selector) return false;
    const found = wrapper.querySelectorAll(selector).length;
    return question.inputMethod === "FRACTION_ENTRY" ? found >= 2 : question.inputMethod === "MIXED_NUMBER_ENTRY" ? found >= 3 : found >= 1;
  }

  async function run({
    engine,
    hostWindow,
    hostDocument,
    storageKey,
    childNameKey = "math-quest:child-name:v1",
    placementDraftKey = "math-quest:placement-draft:v1",
    pause,
    settle,
    activeStateFactory,
  }) {
    if (typeof settle !== "function") throw new TypeError("Visual regression requires the fail-closed rendered-geometry settlement oracle.");
    const tests = Object.create(null);
    const titles = Object.create(null);
    const profiles = engine?.CURRICULUM_MANIFEST?.generatorProfileEnum;
    const expectedProfiles = Array.isArray(profiles) ? profiles : [];
    const manifestSkills = engine?.CURRICULUM_MANIFEST?.skills;
    const allConstraintFailures = [];

    titles["VIS-MANIFEST"] = "Visual audit is bound to the exact shipped manifest";
    const taskContractsBound = Array.isArray(manifestSkills) && manifestSkills.every((record, index) => {
      const declared = record?.constraints?.taskTypes;
      const assessed = record?.assessment?.requiredTaskTypes;
      const runtime = engine.SKILLS[index]?.constraints?.taskTypes;
      return Array.isArray(declared) && declared.length
        && engine.canonical(declared) === engine.canonical(assessed)
        && engine.canonical(declared) === engine.canonical(runtime);
    });
    tests["VIS-MANIFEST"] = result(
      expectedProfiles.length > 0
        && Array.isArray(manifestSkills)
        && manifestSkills.length === engine.SKILLS.length
        && engine.SKILLS.every((skill) => expectedProfiles.includes(skill.generatorProfile))
        && taskContractsBound,
      {
        manifestId: engine?.CURRICULUM_MANIFEST?.manifestId,
        version: engine?.CURRICULUM_MANIFEST?.version,
        sha256: engine?.CURRICULUM_MANIFEST_SHA256,
        profiles: expectedProfiles.length,
        skills: engine?.SKILLS?.length,
        taskContractsBound,
      },
    );

    for (const profile of expectedProfiles) {
      const id = `PROFILE-${slug(profile)}`;
      titles[id] = `Generator profile “${profile}” is deterministic, gradable, and visually truthful`;
      const skills = engine.SKILLS.filter((skill) => skill.generatorProfile === profile);
      const failures = [];
      let inspected = 0;
      let expectedInspected = 0;
      if (!skills.length) failures.push({ reason: "capability is declared by the manifest but no skill uses it" });
      for (const skill of skills) {
        const declaredTaskTypes = Array.isArray(skill.constraints?.taskTypes) ? skill.constraints.taskTypes : [];
        const seenTaskTypes = new Set();
        if (!declaredTaskTypes.length) failures.push({ skillId: skill.skillId, reason: "skill has no declared constraints.taskTypes capability contract" });
        for (const tier of TIERS) {
          const ordinals = sampleOrdinals(skill);
          expectedInspected += ordinals.length;
          for (const ordinal of ordinals) {
            try {
              const question = make(engine, skill, tier, ordinal);
              const repeated = make(engine, skill, tier, ordinal);
              const deterministic = engine.canonical(question) === engine.canonical(repeated);
              const inputValid = inputContract.call(engine, question);
              const truth = descriptorTruth(question);
              const constraintCheck = constraintSanity(skill, question);
              if (!constraintCheck.pass) {
                allConstraintFailures.push({
                  skillId: skill.skillId,
                  tier,
                  ordinal,
                  taskType: question.taskType,
                  issues: constraintCheck.issues,
                });
              }
              const taskTypeBound = declaredTaskTypes.includes(question.taskType);
              if (taskTypeBound) seenTaskTypes.add(question.taskType);
              const submittedAnswer = question.inputClass === "SELECTION"
                ? { optionId: question.options[question.correctIndex].optionId }
                : STRUCTURED_RESPONSE_METHODS.has(question.inputMethod)
                  ? structuredAnswer(engine, question)
                  : question.answer.value;
              const attempt = engine.submitAnswer(question, submittedAnswer, {
                promptFinishedAt: 0,
                submittedAt: 1000,
                manipulationMs: question.inputClass === "CONSTRUCTION" ? 200 : 0,
                replayMs: 0,
                idleMs: 0,
                hintUsed: false,
                selectionEvents: question.inputClass === "SELECTION" ? [{ optionId: question.options[question.correctIndex].optionId, at: 100 }] : [],
                modelUsed: true,
                sessionId: "visual-profile-audit",
                playDay: 20000,
              });
              const taskTypePropagated = attempt.taskType === question.taskType;
              const bound = question.skillId === skill.skillId && question.level === skill.level
                && question.tier === tier && question.ordinal === ordinal;
              inspected += 1;
              if (!(deterministic && inputValid && truth.pass && constraintCheck.pass
                && bound && taskTypeBound && taskTypePropagated)) {
                failures.push({
                  skillId: skill.skillId,
                  tier,
                  ordinal,
                  deterministic,
                  inputValid,
                  bound,
                  taskType: question.taskType,
                  taskTypeBound,
                  taskTypePropagated,
                  descriptorType: question.modelDescriptor?.type,
                  descriptor: truth.reason,
                  constraints: constraintCheck.issues,
                });
              }
            } catch (error) {
              failures.push({ skillId: skill.skillId, tier, ordinal, error: String(error?.message || error) });
            }
          }
        }
        const missingTaskTypes = declaredTaskTypes.filter((taskType) => !seenTaskTypes.has(taskType));
        if (missingTaskTypes.length) failures.push({ skillId: skill.skillId, reason: "declared task types were not generated", missingTaskTypes });
      }
      tests[id] = result(failures.length === 0 && inspected === expectedInspected, {
        profile,
        skills: skills.length,
        inspected,
        failures: failures.slice(0, 8),
      });
    }

    titles["VIS-CONSTRAINTS"] = "Every generated question obeys its manifest constraints without leaking the answer";
    tests["VIS-CONSTRAINTS"] = result(allConstraintFailures.length === 0, {
      inspectedProfiles: expectedProfiles.length,
      failures: allConstraintFailures.slice(0, 12),
    });

    const allQuestions = [];
    for (const skill of engine.SKILLS) for (const tier of TIERS) for (const ordinal of sampleOrdinals(skill)) {
      allQuestions.push(make(engine, skill, tier, ordinal));
    }
    const classes = [...new Set(allQuestions.map((question) => question.inputClass))].sort();
    const methods = [...new Set(allQuestions.map((question) => question.inputMethod))].sort();
    const rendererCapableMethods = Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD || {}).sort();
    const descriptorTypes = [...new Set(allQuestions.map((question) => question.modelDescriptor?.type))].sort();
    const exactRendererSet = engine.canonical(rendererCapableMethods) === engine.canonical(RENDERER_CAPABLE_METHODS);
    const exactReachableSet = engine.canonical(methods) === engine.canonical(RELEASE_REACHABLE_METHODS);
    const rendererOnlyMethods = rendererCapableMethods.filter((method) => !methods.includes(method));
    titles["VIS-CAPABILITIES"] = "Renderer-capable and release-reachable input/model capabilities are exact and non-circular";
    tests["VIS-CAPABILITIES"] = result(
      classes.includes("SELECTION") && classes.includes("CONSTRUCTION")
        && exactRendererSet && exactReachableSet
        && engine.canonical(rendererOnlyMethods) === engine.canonical(["NUMBER_BOND", "NUMBER_CHOICE"])
        && descriptorTypes.length >= 2,
      {
        classes,
        rendererCapableMethods,
        releaseReachableMethods: methods,
        rendererOnlyMethods,
        descriptorTypes,
        inspected: allQuestions.length,
        reachabilityPolicy: "Only states emitted by the shipped manifest and generator are release-reachable. NUMBER_BOND and NUMBER_CHOICE remain renderer-capable but have no shipped question witness; impossible method/skill/mode combinations are excluded explicitly rather than counted as untested.",
      },
    );

    const moneySkills = engine.SKILLS.filter((skill) => skill.generatorProfile === "money-model");
    const canadianDenominations = new Set([5, 10, 25, 100, 200]);
    const moneyContractFailures = moneySkills.filter((skill) => {
      const denominations = skill.constraints?.denominationsCents;
      const invalidDenominations = denominations !== undefined
        && (!Array.isArray(denominations) || !denominations.length
          || denominations.some((cents) => !canadianDenominations.has(Number(cents))));
      return skill.constraints?.currency !== "CAD" || invalidDenominations;
    });
    const moneyQuestions = allQuestions.filter((question) => engine.SKILL_BY_ID[question.skillId]?.generatorProfile === "money-model");
    const moneyFailures = moneyQuestions.filter((question) => {
      const values = question.modelDescriptor?.values;
      const serialized = JSON.stringify({ prompt: question.prompt, slots: question.promptSlots, values });
      return !/(?:¢|\$|\bcents?\b)/iu.test(serialized) || /£|€|\bUSD\b/iu.test(serialized);
    });
    titles["VIS-CANADIAN-MONEY"] = "Money models use explicit Canadian-dollar denominations and no foreign currency";
    tests["VIS-CANADIAN-MONEY"] = result(moneySkills.length > 0 && moneyQuestions.length > 0
      && moneyContractFailures.length === 0 && moneyFailures.length === 0, {
      skills: moneySkills.length,
      inspected: moneyQuestions.length,
      contractFailures: moneyContractFailures.map((skill) => skill.skillId),
      questionFailures: moneyFailures.slice(0, 5).map((question) => question.questionId),
    });

    const originalSave = hostWindow.localStorage.getItem(storageKey);
    const originalChildName = hostWindow.localStorage.getItem(childNameKey);
    const originalPlacementDraft = hostWindow.localStorage.getItem(placementDraftKey);
    let frame = null;
    let approvedChecksStarted = false;
    let approvedChecksComplete = false;
    try {
      const nowParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Halifax",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      const playDay = Math.floor(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day) / 86400000);
      hostWindow.localStorage.setItem(childNameKey, JSON.stringify({ schemaVersion: 1, mode: "named", name: "Pip" }));
      hostWindow.localStorage.setItem(storageKey, engine.exportState(engine.createInitialState(playDay)));
      hostWindow.localStorage.removeItem(placementDraftKey);
      frame = hostDocument.createElement("iframe");
      frame.title = "Manifest-driven visual regression Parent Test Lab";
      Object.assign(frame.style, { position: "fixed", left: "-20000px", top: "0", width: "1366px", height: "768px", opacity: "0", pointerEvents: "none" });
      frame.src = `index.html?manifest-visual-regression=${Date.now()}`;
      hostDocument.body.append(frame);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        frame.onload = () => { clearTimeout(timer); resolve(); };
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (frame.contentDocument?.getElementById("app")?.inert === false) break;
        await pause();
      }

      let labWindow = frame.contentWindow;
      let labDocument = frame.contentDocument;
      const settleLabRender = (label) => settle({ doc: labDocument, win: labWindow }, label);
      if (labDocument.querySelector("[data-progress-protection]")) {
        throw new Error(`Parent Test Lab could not acquire the audit writer lease: ${labDocument.body.textContent.trim().slice(0, 240)}`);
      }
      if (labDocument.getElementById("app")?.inert) {
        throw new Error("Parent Test Lab remained inert while waiting for the audit writer lease.");
      }
      await settleLabRender("Initial manifest visual-regression frame");
      labDocument.querySelector('[data-action="grown"]')?.click();
      await pause();
      const baseline = labWindow.localStorage.getItem(storageKey);
      let writes = 0;
      let storagePrototype = null;
      let originalSetItem = null;
      const restoreStorageInstrumentation = () => {
        if (storagePrototype && originalSetItem) storagePrototype.setItem = originalSetItem;
        storagePrototype = null;
        originalSetItem = null;
      };
      const instrumentStorage = () => {
        storagePrototype = labWindow.Storage.prototype;
        originalSetItem = storagePrototype.setItem;
        storagePrototype.setItem = function (...args) {
          writes += 1;
          return originalSetItem.apply(this, args);
        };
      };
      instrumentStorage();

      const change = (element) => element.dispatchEvent(new labWindow.Event("change", { bubbles: true }));
      const resize = async (width, height) => {
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        labWindow.dispatchEvent(new labWindow.Event("resize"));
        await pause();
        await pause();
        await settleLabRender(`Manifest visual-regression viewport ${width}x${height}`);
      };
      const replaceActiveFixture = async (state, name, { placementDraft = null } = {}) => {
        restoreStorageInstrumentation();
        labWindow.dispatchEvent(new labWindow.Event("pagehide"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        hostWindow.localStorage.setItem(storageKey, engine.exportState(state));
        if (placementDraft === null) hostWindow.localStorage.removeItem(placementDraftKey);
        else hostWindow.localStorage.setItem(placementDraftKey, placementDraft);
        const loaded = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${name} did not load within 5 seconds.`)), 5000);
          frame.addEventListener("load", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
          frame.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error(`${name} failed to load.`));
          }, { once: true });
        });
        frame.src = `index.html?manifest-visual-regression=${encodeURIComponent(name)}-${Date.now()}`;
        await loaded;
        labWindow = frame.contentWindow;
        labDocument = frame.contentDocument;
        for (let attempt = 0; attempt < 500 && labDocument.getElementById("app")?.inert !== false; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (labDocument.querySelector("[data-progress-protection]") || labDocument.getElementById("app")?.inert) {
          throw new Error(`${name} could not acquire the audit writer lease.`);
        }
        await pause();
        await pause();
        await settleLabRender(`${name} manifest visual-regression fixture`);
        instrumentStorage();
      };
      const selectCase = async ({ skill, tier = "HARD/TARGET", ordinal = 0 }) => {
        let control = labDocument.querySelector("[data-lab-level]");
        if (!control) throw new Error("Parent Test Lab level selector is absent.");
        control.value = String(skill.level);
        change(control);
        await pause();
        control = labDocument.querySelector("[data-lab-skill]");
        if (!control || ![...control.options].some((option) => option.value === skill.skillId)) throw new Error(`Parent Test Lab cannot select ${skill.skillId}.`);
        control.value = skill.skillId;
        change(control);
        await pause();
        control = labDocument.querySelector("[data-lab-tier]");
        control.value = tier;
        change(control);
        await pause();
        for (let index = 0; index < ordinal; index += 1) {
          labDocument.querySelector('[data-lab-action="next"]')?.click();
          await pause();
        }
        await settleLabRender(`Parent Test Lab ${skill.skillId} ${tier} sample ${ordinal}`);
        return make(engine, skill, tier, ordinal);
      };
      const visible = (element) => {
        if (!element) return false;
        const style = labWindow.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const floorMetrics = () => {
        const scope = labDocument.querySelector(".lab-workspace");
        if (!scope) return { minFont: 0, minControl: 0 };
        const text = [...scope.querySelectorAll("h1,h2,h3,p,label,button,input,select,output,.prompt,.small,.lab-meta span")].filter(visible);
        const controls = [...scope.querySelectorAll("button,input,select")].filter(visible);
        return {
          minFont: text.length ? Math.min(...text.map((node) => Number.parseFloat(labWindow.getComputedStyle(node).fontSize))) : 0,
          minControl: controls.length ? Math.min(...controls.map((node) => {
            const rect = node.getBoundingClientRect();
            return Math.min(rect.width, rect.height);
          })) : 0,
        };
      };
      const scopedFloorMetrics = (scope) => {
        if (!scope) return { minFont: 0, minControl: 0 };
        const text = [...scope.querySelectorAll("h1,h2,h3,p,label,strong,b,button,input,select,output,.prompt,.small,.model-label,.direct-status")]
          .filter(visible)
          .filter((node) => normalized(node.textContent));
        const controls = [...scope.querySelectorAll("button,input,select")].filter(visible);
        return {
          minFont: text.length
            ? Math.min(...text.map((node) => Number.parseFloat(labWindow.getComputedStyle(node).fontSize)))
            : 0,
          minControl: controls.length
            ? Math.min(...controls.map((node) => {
              const rect = node.getBoundingClientRect();
              return Math.min(rect.width, rect.height);
            }))
            : 0,
        };
      };
      const makeThemed = (skill, tier, ordinal, theme) => engine.makeQuestion({
        skillId: skill.skillId,
        tier,
        representation: skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT",
        seed: LAB_SEED,
        ordinal,
        eligibleQuestionOrdinal: ordinal,
        scheduledReview: false,
        coldTest: false,
        preview: true,
        theme,
        scaffolded: true,
      });
      const findOrdinal = (skill, theme, predicate) => {
        for (let ordinal = 0; ordinal < 96; ordinal += 1) {
          const question = makeThemed(skill, "EASY", ordinal, theme);
          if (predicate(question)) return ordinal;
        }
        return -1;
      };
      const enterLabForTheme = async (theme) => {
        if (labDocument.querySelector(".lab-question")) {
          labDocument.querySelector('[data-lab-action="exit"]')?.click();
          await pause();
        }
        if (!labDocument.querySelector(`[data-action="world"][data-world="${CSS.escape(theme)}"]`)) {
          labDocument.querySelector('[data-action="home"]')?.click();
          await pause();
        }
        const world = labDocument.querySelector(`[data-action="world"][data-world="${CSS.escape(theme)}"]`);
        if (!world) throw new Error(`The child home screen cannot select the ${theme} world.`);
        world.click();
        await pause();
        labDocument.querySelector('[data-action="grown"]')?.click();
        await pause();
        labDocument.querySelector('[data-lab-action="enter"]')?.click();
        await pause();
        if (!labDocument.querySelector(".lab-question")) throw new Error(`Parent Test Lab did not reopen for the ${theme} world.`);
        await settleLabRender(`Parent Test Lab ${theme} world`);
      };

      const expectedPlacementMethods = PLACEMENT_REACHABLE_METHODS;
      const placementStateLoad = engine.loadState(baseline, playDay);
      if (!placementStateLoad.ok) throw new Error(`Placement visual baseline is invalid: ${placementStateLoad.error}`);
      const placementState = placementStateLoad.state;
      const placementTraversal = placementCases(engine, placementState, playDay);
      const placementProfiles = Object.freeze([
        { viewport: "desktop", width: 1366, height: 768 },
        { viewport: "tablet-portrait", width: 820, height: 1180 },
        { viewport: "ipad-landscape-large", width: 1180, height: 820 },
        { viewport: "ipad-landscape-standard", width: 1024, height: 768 },
        { viewport: "phone", width: 390, height: 844 },
      ]);
      const placementRows = [];
      const placementWrapperRows = [];
      let placementDraftPresent = false;

      const placementLayoutSnapshot = (profile, inputMethod) => {
        const screen = labDocument.querySelector('[data-placement-screen][data-placement-phase="question"]');
        const missingScreenDiagnostic = screen ? null : {
          draftPresent: Boolean(labWindow.localStorage.getItem(placementDraftKey)),
          warning: normalized(labDocument.querySelector(".runtime-warning:not([hidden])")?.textContent),
          visibleHeading: normalized(labDocument.querySelector("h1,h2")?.textContent),
          bodyText: normalized(labDocument.body?.textContent).slice(0, 320),
        };
        const shell = screen?.closest(".placement-shell");
        const question = screen?.querySelector(".placement-question");
        let noticeProbe = null;
        if (inputMethod === "PICTURE_CHOICE" && question && !question.querySelector(":scope > .notice")) {
          const progress = question.querySelector(":scope > .placement-progress");
          noticeProbe = labDocument.createElement("div");
          noticeProbe.className = "notice";
          noticeProbe.dataset.visualNoticeProbe = "true";
          noticeProbe.textContent = "Grown-up notice: the paused questions need attention.";
          progress?.insertAdjacentElement("afterend", noticeProbe);
        }
        const response = screen?.querySelector(".question-response");
        const answer = response?.querySelector(".answer-controls[data-input-method]");
        const confirm = response?.querySelector('.question-submit [data-action="confirm"]');
        const notSure = response?.querySelector('.question-submit [data-action="placement-not-sure"]');
        const answerRect = answer?.getBoundingClientRect();
        const confirmRect = confirm?.getBoundingClientRect();
        const controlsBeforeConfirm = Boolean(
          response
          && confirm
          && [...response.querySelectorAll("button,input,select,textarea")]
            .filter((control) => control !== confirm)
            .every((control) => control.compareDocumentPosition(confirm) & labWindow.Node.DOCUMENT_POSITION_FOLLOWING),
        );
        const nestedVerticalOffenders = screen
          ? [screen, ...screen.querySelectorAll("*")].filter((element) => {
            if (!visible(element) || element.scrollHeight <= element.clientHeight + 1) return false;
            return ["auto", "scroll", "hidden", "clip"].includes(labWindow.getComputedStyle(element).overflowY);
          }).map((element) => ({
            element: `${element.localName}.${[...element.classList].slice(0, 3).join(".")}`,
            overflowY: labWindow.getComputedStyle(element).overflowY,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          }))
          : [{ element: "missing-placement-screen" }];
        const essentialText = shell
          ? [...shell.querySelectorAll([
            ".placement-topbar h1",
            ".placement-topbar button",
            ".placement-question .prompt",
            ".placement-question .answer-controls>.small",
            ".placement-question .direct-status",
            ".placement-question .answer-controls button",
            ".placement-question .answer-controls label",
            ".placement-question .answer-controls output",
            ".placement-question .question-submit button",
          ].join(","))].filter(visible).filter((node) => normalized(node.textContent))
          : [];
        const essentialMinFont = essentialText.length
          ? Math.min(...essentialText.map((node) => Number.parseFloat(labWindow.getComputedStyle(node).fontSize)))
          : 0;
        const controls = shell
          ? [...shell.querySelectorAll("button,input,select,textarea")].filter(visible)
          : [];
        const enabledFocusControls = controls.filter((control) => !control.disabled && control.tabIndex >= 0);
        const firstFocusControl = enabledFocusControls[0] || null;
        const lastFocusControl = enabledFocusControls.at(-1) || null;
        firstFocusControl?.focus();
        const firstFocusReached = Boolean(firstFocusControl && labDocument.activeElement === firstFocusControl);
        lastFocusControl?.focus();
        const lastFocusReached = Boolean(lastFocusControl && labDocument.activeElement === lastFocusControl);
        notSure?.focus();
        const notSureFocusReached = Boolean(notSure && labDocument.activeElement === notSure);
        const keyboardFocusReachable = Boolean(
          enabledFocusControls.length >= 2
          && enabledFocusControls.every((control) => /^(?:BUTTON|INPUT|SELECT|TEXTAREA)$/u.test(control.tagName))
          && firstFocusReached
          && lastFocusReached
          && notSureFocusReached
        );
        const minControl = controls.length
          ? Math.min(...controls.map((node) => {
            const rect = node.getBoundingClientRect();
            return Math.min(rect.width, rect.height);
          }))
          : 0;
        const noHorizontalOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
        const confirmOnFirstScreen = Boolean(
          confirmRect
          && confirmRect.left >= -1
          && confirmRect.right <= labWindow.innerWidth + 1
          && confirmRect.top >= -1
          && confirmRect.bottom <= labWindow.innerHeight + 1,
        );
        const naturalOuterFlow = Boolean(
          profile.allowNaturalOuterFlow
          && confirmRect
          && confirmRect.left >= -1
          && confirmRect.right <= labWindow.innerWidth + 1
          && labDocument.documentElement.scrollHeight > labDocument.documentElement.clientHeight + 1,
        );
        const rectanglesOverlap = (left, right) => Boolean(
          left
          && right
          && Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
          && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1
        );
        const descendantCollisions = [
          [".route-grid", ".arrow-pad"],
          [".pattern-token-bank", ".direct-undo"],
          [".pattern-slots", ".pattern-token-bank"],
          [".pattern-slots", ".direct-undo"],
        ].flatMap(([leftSelector, rightSelector]) => {
          const left = answer?.querySelector(leftSelector);
          const right = answer?.querySelector(rightSelector);
          if (!visible(left) || !visible(right)) return [];
          return rectanglesOverlap(left.getBoundingClientRect(), right.getBoundingClientRect())
            ? [{ left: leftSelector, right: rightSelector }]
            : [];
        });
        const placementNotice = question?.querySelector(":scope > .notice");
        const noticeRect = visible(placementNotice) ? placementNotice.getBoundingClientRect() : null;
        const postNoticeRects = [
          question?.querySelector(":scope > .early-symbol-cue"),
          question?.querySelector(":scope > .prompt"),
          question?.querySelector(":scope > .stimulus"),
          question?.querySelector(":scope > .question-response"),
        ].filter(visible).map((element) => element.getBoundingClientRect());
        const noticeBeforeContent = inputMethod !== "PICTURE_CHOICE" || Boolean(
          noticeRect
          && postNoticeRects.length
          && noticeRect.bottom <= Math.min(...postNoticeRects.map((rect) => rect.top)) + 1
        );
        const pass = Boolean(
          screen
          && answerRect
          && confirmRect
          && notSure
          && answer?.dataset.inputMethod === inputMethod
          && answerRect.bottom <= confirmRect.top + 1
          && controlsBeforeConfirm
          && nestedVerticalOffenders.length === 0
          && descendantCollisions.length === 0
          && noHorizontalOverflow
          && noticeBeforeContent
          && keyboardFocusReachable
          && essentialMinFont >= 18
          && minControl >= 44
          && (confirmOnFirstScreen || naturalOuterFlow),
        );
        const result = {
          viewport: profile.viewport,
          width: profile.width,
          height: profile.height,
          inputMethod: answer?.dataset.inputMethod || null,
          confirmOnFirstScreen,
          naturalOuterFlow,
          controlsBeforeConfirm,
          noHorizontalOverflow,
          essentialMinFont,
          minControl,
          focusableControls: enabledFocusControls.length,
          firstFocusReached,
          lastFocusReached,
          notSureFocusReached,
          keyboardFocusReachable,
          nestedVerticalOffenders,
          descendantCollisions,
          noticeProbeInserted: Boolean(noticeProbe),
          noticeBeforeContent,
          confirmBottom: confirmRect ? Math.round(confirmRect.bottom) : null,
          documentScrollHeight: labDocument.documentElement.scrollHeight,
          missingScreenDiagnostic,
          pass,
        };
        noticeProbe?.remove();
        return result;
      };

      for (const witness of placementTraversal.methods) {
        await replaceActiveFixture(placementState, `placement-${witness.inputMethod}`, {
          placementDraft: placementDraftRecord(engine, placementState, witness.run, witness.question),
        });

        const speechCalls = [];
        const localVoice = {
          voiceURI: `placement-${witness.inputMethod.toLowerCase()}-local`,
          name: "Math Quest placement audit voice",
          lang: "en-CA",
          localService: true,
          default: true,
        };
        class PlacementAuditUtterance {
          constructor(text) {
            this.text = String(text);
            this.rate = 1;
            this.voice = null;
            this.onend = null;
            this.onerror = null;
          }
        }
        Object.defineProperty(labWindow, "SpeechSynthesisUtterance", {
          configurable: true,
          value: PlacementAuditUtterance,
        });
        Object.defineProperty(labWindow, "speechSynthesis", {
          configurable: true,
          value: {
            speaking: false,
            pending: false,
            paused: false,
            getVoices: () => [localVoice],
            cancel() {},
            speak(utterance) {
              speechCalls.push(String(utterance?.text || ""));
              labWindow.queueMicrotask(() => utterance?.onend?.());
            },
            pause() {},
            resume() {},
          },
        });
        const replay = labDocument.querySelector('[data-action="replay"]');
        replay?.click();
        await pause();
        await pause();
        const spoken = normalized(speechCalls.at(-1));
        const promptSpoken = Boolean(spoken && spoken.includes(normalized(witness.question.prompt)));
        const renderedAnswer = labDocument.querySelector(
          '[data-placement-screen][data-placement-phase="question"] .question-response .answer-controls[data-input-method]',
        );
        const optionLabels = witness.question.inputClass === "SELECTION"
          ? [...(renderedAnswer?.querySelectorAll('[data-action="select"][aria-label]') || [])]
            .map((option) => normalized(option.getAttribute("aria-label"))).filter(Boolean)
          : [];
        const optionsSpoken = optionLabels.length === 0
          || optionLabels.every((label) => spoken.includes(label));
        const positionalCueSpoken = optionLabels.length === 0
          || /(?:\boption\b|\bchoice\b|\bfirst\b|\bsecond\b|\bthird\b|\bfourth\b|\bleft\b|\bright\b|\btop\b|\bbottom\b|\b1\b|\b2\b)/iu.test(spoken);

        for (const profile of placementProfiles) {
          await resize(profile.width, profile.height);
          placementDraftPresent ||= Boolean(labWindow.localStorage.getItem(placementDraftKey));
          const layout = placementLayoutSnapshot(profile, witness.inputMethod);
          placementRows.push({
            ...layout,
            skillId: witness.question.skillId,
            questionId: witness.question.questionId,
            inputClass: witness.question.inputClass,
            replayCalls: speechCalls.length,
            promptSpoken,
            spoken,
            optionLabels,
            optionCount: optionLabels.length,
            optionsSpoken,
            positionalCueSpoken,
            pass: layout.pass
              && speechCalls.length === 1
              && promptSpoken
              && optionsSpoken
              && positionalCueSpoken,
          });
        }

        if (witness.inputMethod === "SHARE_DEAL") {
          for (const wrapperProfile of [
            { viewport: "desktop", width: 1366, height: 768, allowNaturalOuterFlow: false },
            { viewport: "tablet-portrait", width: 820, height: 1180, allowNaturalOuterFlow: false },
            { viewport: "ipad-landscape-large", width: 1180, height: 820, allowNaturalOuterFlow: false },
            { viewport: "ipad-landscape-standard", width: 1024, height: 768, allowNaturalOuterFlow: false },
            { viewport: "phone", width: 390, height: 844, allowNaturalOuterFlow: false },
            { viewport: "landscape-phone", width: 844, height: 390, allowNaturalOuterFlow: true },
          ]) {
            await resize(wrapperProfile.width, wrapperProfile.height);
            placementWrapperRows.push(placementLayoutSnapshot(wrapperProfile, witness.inputMethod));
          }
        }
      }

      const placementMainBytesUnchanged = labWindow.localStorage.getItem(storageKey) === baseline;
      const notSureControl = labDocument.querySelector('[data-action="placement-not-sure"]');
      notSureControl?.click();
      await pause();
      const notSureOutcome = labDocument.querySelector('.feedback-state[data-feedback-state="neutral"]');
      const neutralNotSure = Boolean(
        notSureControl
        && notSureOutcome
        && labDocument.activeElement === notSureOutcome
        && normalized(notSureOutcome.querySelector("strong")?.textContent) === "Not sure. Let’s try another."
      );
      labDocument.querySelector('[data-action="placement-next"]')?.click();
      await pause();
      labDocument.querySelector('[data-action="placement-pause"]')?.click();
      await pause();
      labDocument.querySelector('[data-action="placement-discard"]')?.click();
      await pause();
      const placementDraftRemoved = labWindow.localStorage.getItem(placementDraftKey) === null;
      const placementMethodNames = [...new Set(placementRows.map((row) => row.inputMethod))].sort();
      const expectedPlacementMethodNames = [...expectedPlacementMethods].sort();
      const profileCounts = Object.fromEntries(placementProfiles.map((profile) => [
        profile.viewport,
        placementRows.filter((row) => row.viewport === profile.viewport).length,
      ]));
      const profileCountValues = Object.values(profileCounts);
      const profilesBalanced = profileCountValues.every((count) => count === expectedPlacementMethods.length);
      titles["VIS-PLACEMENT-LAYOUT"] = "Every reachable starting-point control is legible, actionable, and narratable in the child placement wrapper";
      tests["VIS-PLACEMENT-LAYOUT"] = result(
        placementTraversal.rows.every((row) => row.pass)
          && placementRows.length === expectedPlacementMethods.length * placementProfiles.length
          && engine.canonical(placementMethodNames) === engine.canonical(expectedPlacementMethodNames)
          && placementRows.every((row) => row.pass)
          && placementWrapperRows.length === 6
          && placementWrapperRows.every((row) => row.pass)
          && profilesBalanced
          && placementMainBytesUnchanged
          && placementDraftPresent
          && neutralNotSure
          && placementDraftRemoved,
        {
          adaptiveBoundaries: placementTraversal.rows,
          methods: placementRows,
          profileCounts,
          profilesBalanced,
          wrapperProfiles: placementWrapperRows,
          mainBytesUnchanged: placementMainBytesUnchanged,
          separateDraftPresent: placementDraftPresent,
          neutralNotSure,
          draftRemovedAfterDiscard: placementDraftRemoved,
          matrixPolicy: "Each of the exact 29 placement-reachable methods is rendered at desktop, tablet portrait, both iPad-landscape sizes, and phone; the dense SHARE_DEAL wrapper additionally exercises short landscape-phone natural flow.",
          ipadEvidencePolicy: "The 1180x820 and 1024x768 rows are automated rendered-browser geometry and focus evidence only. Physical iPad Safari, touch, software-keyboard, and VoiceOver evidence remains pending until run on a real device; automation cannot convert it to PASS.",
          landscapePolicy: "844x390 may use natural outer-document flow; nested scrolling and horizontal overflow remain forbidden.",
        },
      );
      writes = 0;

      labDocument.querySelector('[data-action="install-help"]')?.click();
      await pause();
      const offlineStatus = labDocument.querySelector("[data-pwa-status]");
      const candidateStatus = labDocument.querySelector("[data-pwa-update]");
      const candidateError = labDocument.querySelector("[data-pwa-update-error]");
      const readinessPanel = labDocument.querySelector(".pwa-readiness");
      const activeStatusText = normalized(offlineStatus?.textContent);
      const pwaStatusSeparated = Boolean(
        readinessPanel
        && offlineStatus
        && candidateStatus
        && candidateError
        && offlineStatus !== candidateStatus
        && offlineStatus !== candidateError
        && /^(?:Ready for an offline check|Caching the verified app files|Recovery needed|Online only|Not controlled)/u.test(activeStatusText)
        && !/candidate update|update activation/iu.test(activeStatusText)
      );
      titles["VIS-PWA-STATUS"] = "Active offline readiness and candidate-update status render as separate diagnostics";
      tests["VIS-PWA-STATUS"] = result(pwaStatusSeparated, {
        activeStatus: activeStatusText,
        activePhase: readinessPanel?.dataset.pwaPhase || null,
        candidateStatusNode: Boolean(candidateStatus),
        candidateErrorNode: Boolean(candidateError),
      });
      labDocument.querySelector('[data-action="install-close"]')?.click();
      await pause();

      labDocument.querySelector('[data-lab-action="enter"]')?.click();
      await pause();
      try {
        const { byMethod, bySemanticModel } = generatedCaseMap(engine);
        const methodRows = [];
        for (const [method, auditCase] of byMethod) {
          const question = await selectCase(auditCase);
          const wrapper = labDocument.querySelector('.answer-controls[data-control-mode="lab"]');
          methodRows.push({
            method,
            skillId: auditCase.skill.skillId,
            inputClass: question.inputClass,
            pass: controlContract(wrapper, question),
            controlFamily: wrapper?.dataset.controlFamily || null,
          });
        }
        const storageUnchanged = labWindow.localStorage.getItem(storageKey) === baseline && writes === 0;
        const methodNames = methodRows.map((row) => row.method).sort();
        titles["VIS-LAB-CONTROLS"] = "Parent Test Lab renders every exact release-reachable input method without writing progress";
        tests["VIS-LAB-CONTROLS"] = result(
          methodRows.length === RELEASE_REACHABLE_METHODS.length
            && engine.canonical(methodNames) === engine.canonical(RELEASE_REACHABLE_METHODS)
            && methodRows.every((row) => row.pass)
            && storageUnchanged
            && labDocument.querySelector(".lab-question")?.dataset.labMode === "isolated"
            && labDocument.querySelector(".lab-question")?.dataset.storageIntact === "true",
          {
            methods: methodRows,
            expectedMethods: RELEASE_REACHABLE_METHODS,
            rendererOnlyExcluded: ["NUMBER_BOND", "NUMBER_CHOICE"],
            writes,
            bytesIdentical: labWindow.localStorage.getItem(storageKey) === baseline,
          },
        );

        const modelRows = [];
        for (const [semanticKey, auditCase] of bySemanticModel) {
          const question = await selectCase(auditCase);
          const type = question.modelDescriptor.type;
          const toggle = labDocument.querySelector('[data-lab-action="model"]');
          const descriptorValues = question.modelDescriptor.values;
          const modelHasRenderableData = type !== "visualPrompt"
            || descriptorValues.items?.length
            || descriptorValues.parts?.length || descriptorValues.representations?.length;
          let rendered = Boolean(labDocument.querySelector(`.math-model[data-model-family="${CSS.escape(type)}"][data-model-derived="true"]`));
          if (!rendered && toggle && !toggle.disabled && /show/iu.test(toggle.textContent)) {
            toggle.click();
            await pause();
            rendered = Boolean(labDocument.querySelector(`.math-model[data-model-family="${CSS.escape(type)}"][data-model-derived="true"]`));
          }
          let variantRendered = true;
          if (question.skillId === "MQ-099") {
            if (question.params.place === "hundredths") {
              const grid = labDocument.querySelector('.decimal-hundred-grid[data-place="hundredths"]');
              variantRendered = Boolean(grid && grid.querySelectorAll("i").length === 100
                && grid.querySelectorAll("i.on").length === Number(question.params.whole) * 100 + Number(question.params.fractional));
            } else {
              variantRendered = labDocument.querySelectorAll('.fraction-strip[data-place="tenths"] i').length === 10;
            }
          } else if (question.skillId === "MQ-114") {
            const array = labDocument.querySelector(".array-exact");
            variantRendered = Boolean(array?.dataset.remainderInterpretation === question.params.interpretation
              && normalized(array.querySelector(".array-interpretation")?.textContent));
          } else if (question.skillId === "MQ-122") {
            const volume = labDocument.querySelector(`.prism-visual[data-volume-representation="${CSS.escape(question.params.representation)}"]`);
            const prism = volume?.querySelector(".isometric-prism");
            const noAnswerLeak = !volume?.querySelector(".visual-number");
            const spatialMarks = prism?.querySelectorAll("g,polygon,polyline").length || 0;
            variantRendered = Boolean(volume && prism && spatialMarks > 0 && noAnswerLeak
              && Number(volume.dataset.length) === Number(question.params.length)
              && Number(volume.dataset.width) === Number(question.params.width)
              && Number(volume.dataset.height) === Number(question.params.height));
          } else if (question.skillId === "MQ-123") {
            const span = labDocument.querySelector(".clock-span");
            const labels = [...labDocument.querySelectorAll(".clock-card strong")].map((node) => normalized(node.textContent));
            variantRendered = Boolean(span?.dataset.timeFormat === question.params.format
              && labels.some((label) => label.includes(question.params.startTime))
              && labels.some((label) => label.includes(question.params.endTime)));
          }
          modelRows.push({ semanticKey, type, promptId: question.semanticPromptStringId, skillId: auditCase.skill.skillId, tokenId: question.params?.tokenId || null, modelHasRenderableData: Boolean(modelHasRenderableData), rendered, variantRendered, pass: !modelHasRenderableData || rendered && variantRendered });
        }
        const practiceTokenSemanticRows = modelRows.filter((row) => row.skillId === "MQ-048");
        const practiceTokenSemanticIds = [...new Set(practiceTokenSemanticRows.map((row) => row.tokenId).filter(Boolean))].sort();
        const expectedPracticeTokenIds = PRACTICE_TOKEN_VISUAL_ORACLE.map((row) => row.tokenId).sort();
        const practiceTokenSemanticsExact = practiceTokenSemanticRows.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
          && engine.canonical(practiceTokenSemanticIds) === engine.canonical(expectedPracticeTokenIds);
        titles["VIS-LAB-MODELS"] = "Every semantically renderable prompt/model variant appears as derived math in Parent Test Lab";
        tests["VIS-LAB-MODELS"] = result(modelRows.every((row) => row.pass) && practiceTokenSemanticsExact, {
          models: modelRows,
          practiceTokenSemantics: practiceTokenSemanticRows,
          practiceTokenSemanticsExact,
        });

        const profileCases = expectedProfiles.map((profile) => ({
          profile,
          skill: engine.SKILLS.find((skill) => skill.generatorProfile === profile),
          tier: "HARD/TARGET",
          ordinal: 0,
        }));
        const desktopRows = [];
        for (const [width, height, viewport] of [
          [1366, 768, "desktop"],
          [820, 1180, "tablet-portrait"],
          [1180, 820, "ipad-landscape-large"],
          [1024, 768, "ipad-landscape-standard"],
        ]) {
          await resize(width, height);
          for (const auditCase of profileCases) {
            if (!auditCase.skill) {
              desktopRows.push({ profile: auditCase.profile, viewport, pass: false, reason: "capability absent" });
              continue;
            }
            await selectCase(auditCase);
            labWindow.scrollTo(0, 0);
            await pause();
            const toggle = labDocument.querySelector('[data-lab-action="model"]');
            if (toggle && !toggle.disabled && /show/iu.test(toggle.textContent)) {
              toggle.click();
              await pause();
            }
            labWindow.scrollTo(0, 0);
            await pause();
            const article = labDocument.querySelector(".lab-question");
            const grade = labDocument.querySelector('[data-lab-action="grade"]');
            const answer = labDocument.querySelector(".answer-controls");
            const gradeRect = grade?.getBoundingClientRect();
            const answerRect = answer?.getBoundingClientRect();
            const controls = [...(article?.querySelectorAll("button,input,select,textarea") || [])]
              .filter((control) => visible(control));
            const enabledControls = controls.filter((control) => !control.disabled && control.tabIndex >= 0);
            const firstControl = enabledControls[0] || null;
            const lastControl = enabledControls.at(-1) || null;
            firstControl?.focus();
            const firstFocused = Boolean(firstControl && labDocument.activeElement === firstControl);
            lastControl?.focus();
            const lastFocused = Boolean(lastControl && labDocument.activeElement === lastControl);
            const everyControlVisible = controls.length > 0 && controls.every((control) => {
              const rect = control.getBoundingClientRect();
              return rect.left >= -1 && rect.right <= labWindow.innerWidth + 1
                && rect.top >= -1 && rect.bottom <= labWindow.innerHeight + 1;
            });
            const keyboardFocusReachable = enabledControls.length > 0
              && enabledControls.every((control) => /^(?:BUTTON|INPUT|SELECT|TEXTAREA)$/u.test(control.tagName))
              && firstFocused && lastFocused;
            const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
            const pass = Boolean(article && gradeRect && answerRect
              && answerRect.top >= -1 && answerRect.bottom <= labWindow.innerHeight + 1
              && gradeRect.top >= -1 && gradeRect.bottom <= labWindow.innerHeight + 1
              && everyControlVisible && keyboardFocusReachable && noOverflow);
            desktopRows.push({
              profile: auditCase.profile,
              skillId: auditCase.skill.skillId,
              viewport,
              pass,
              answerTop: answerRect && Math.round(answerRect.top),
              answerBottom: answerRect && Math.round(answerRect.bottom),
              gradeBottom: gradeRect && Math.round(gradeRect.bottom),
              controls: controls.length,
              everyControlVisible,
              firstFocused,
              lastFocused,
              keyboardFocusReachable,
              noOverflow,
            });
          }
        }
        titles["VIS-DESKTOP-LAYOUT"] = "Every generator profile keeps complete Parent Test answers, controls, and focus visible at desktop, tablet, and iPad-landscape sizes";
        tests["VIS-DESKTOP-LAYOUT"] = result(desktopRows.every((row) => row.pass), {
          inspected: desktopRows.length,
          failures: desktopRows.filter((row) => !row.pass).slice(0, 10),
          ipadEvidencePolicy: "1180x820 and 1024x768 are automated rendered-browser geometry and focus rows; physical iPad Safari, software-keyboard, touch, and VoiceOver evidence remains pending.",
        });

        await resize(390, 844);
        const levelCases = engine.LEVELS.map((level) => ({
          level: level.number,
          skill: engine.SKILLS.find((skill) => skill.level === level.number),
          tier: "EASY",
          ordinal: 0,
        }));
        const mobileRows = [];
        for (const auditCase of levelCases) {
          if (!auditCase.skill) {
            mobileRows.push({ level: auditCase.level, pass: false, reason: "level has no skill" });
            continue;
          }
          await selectCase(auditCase);
          labWindow.scrollTo(0, 0);
          await pause();
          const workspace = labDocument.querySelector(".lab-workspace");
          const article = labDocument.querySelector(".lab-question");
          const controls = labDocument.querySelector(".lab-controls");
          const grade = labDocument.querySelector('[data-lab-action="grade"]');
          const articleRect = article?.getBoundingClientRect();
          const controlsRect = controls?.getBoundingClientRect();
          const gradeRect = grade?.getBoundingClientRect();
          const metrics = floorMetrics();
          const questionFirst = Boolean(workspace?.dataset.narrowOrder === "question-first"
            && article?.dataset.questionFirst === "true" && articleRect && controlsRect && articleRect.top < controlsRect.top);
          const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
          const inViewport = Boolean(gradeRect && gradeRect.bottom <= labWindow.innerHeight + 1);
          const pass = questionFirst && noOverflow && inViewport && metrics.minFont >= 16 && metrics.minControl >= 44;
          mobileRows.push({ level: auditCase.level, skillId: auditCase.skill.skillId, pass, questionFirst, noOverflow, inViewport, ...metrics });
        }
        titles["VIS-MOBILE-LAYOUT"] = "Every manifest level is question-first, legible, and actionable at 390×844";
        tests["VIS-MOBILE-LAYOUT"] = result(mobileRows.length === engine.LEVELS.length && mobileRows.every((row) => row.pass), {
          inspected: mobileRows.length,
          failures: mobileRows.filter((row) => !row.pass).slice(0, 10),
        });

        approvedChecksStarted = true;
        const approvedEarlyRows = [];
        const mq002 = engine.SKILL_BY_ID["MQ-002"];
        const mq006 = engine.SKILL_BY_ID["MQ-006"];
        if (!mq002 || !mq006) throw new Error("Approved early-fix skills MQ-002 and MQ-006 must remain in the curriculum.");

        const glyphKinds = Object.freeze({ ocean: "shell", forest: "acorn", space: "moon-rock" });
        const glyphFingerprints = new Map();
        const approvedViewports = Object.freeze([
          Object.freeze([1366, 768, "desktop"]),
          Object.freeze([390, 844, "phone"]),
        ]);
        const mq002Source = (question) => {
          const item = question.modelDescriptor?.values?.items?.find((entry) => (
            normalized(entry?.kind).toLowerCase() === "counterset"
          ));
          return {
            count: Number(item?.magnitude),
            objectKind: normalized(item?.objectKind).toLowerCase(),
            paramsCount: Number(question.modelDescriptor?.values?.data?.count),
          };
        };
        for (const theme of Object.keys(glyphKinds)) {
          await resize(1366, 768);
          await enterLabForTheme(theme);
            const positiveOrdinal = findOrdinal(mq002, theme, (question) => mq002Source(question).count > 0);
            const zeroOrdinal = findOrdinal(mq002, theme, (question) => mq002Source(question).count === 0);
            if (positiveOrdinal < 0 || zeroOrdinal < 0) {
              for (const [, , viewport] of approvedViewports) approvedEarlyRows.push({
                family: "MQ-002", theme, viewport, visualPass: false, controlPass: false,
                layoutPass: false, reason: "positive and zero samples were not both generated",
              });
              continue;
            }

            await selectCase({ skill: mq002, tier: "EASY", ordinal: positiveOrdinal });
            const positiveQuestion = makeThemed(mq002, "EASY", positiveOrdinal, theme);
            const expectedKind = glyphKinds[theme];
            const positiveSource = mq002Source(positiveQuestion);
            const positiveCount = positiveSource.count;
            const positiveByViewport = new Map();
            for (const [width, height, viewport] of approvedViewports) {
              await resize(width, height);
              const article = labDocument.querySelector(".lab-question");
              const tokens = [...article.querySelectorAll(".count-touch-task .themed-object-token")];
              const tokenStyle = tokens[0] ? labWindow.getComputedStyle(tokens[0]) : null;
              const fingerprint = tokenStyle ? [
                tokenStyle.backgroundColor, tokenStyle.backgroundImage, tokenStyle.borderRadius,
                tokenStyle.rotate, tokenStyle.transform,
              ].join("|") : "";
              glyphFingerprints.set(`${viewport}:${theme}`, fingerprint);
              positiveByViewport.set(viewport, {
                exactGlyphs: tokens.length === positiveCount && positiveCount > 0
                  && positiveSource.paramsCount === positiveCount
                  && positiveSource.objectKind === expectedKind
                  && tokens.every((token) => token.dataset.objectKind === expectedKind && visible(token)),
                tokenCount: tokens.length,
              });
            }

            await selectCase({ skill: mq002, tier: "EASY", ordinal: zeroOrdinal });
            const zeroQuestion = makeThemed(mq002, "EASY", zeroOrdinal, theme);
            const zeroSource = mq002Source(zeroQuestion);
            const zeroArticleBefore = labDocument.querySelector(".lab-question");
            const zeroMat = zeroArticleBefore.querySelector(".touch-objects.empty-set .empty-set-mat");
            const zeroGlyphs = zeroArticleBefore.querySelectorAll(".count-touch-task .themed-object-token");
            const zeroGrade = zeroArticleBefore.querySelector('[data-lab-action="grade"]');
            const zeroChoice = zeroArticleBefore.querySelector('.count-number-bank [data-count-value="0"]');
            const zeroStateVisible = Boolean(
              zeroMat
              && visible(zeroMat)
              && normalized(zeroMat.textContent) === "0"
              && zeroGlyphs.length === 0
              && zeroSource.count === 0
              && zeroSource.paramsCount === 0
              && zeroSource.objectKind === expectedKind
              && /zero objects|set is empty/iu.test(zeroMat.getAttribute("aria-label") || ""),
            );
            const zeroStartsUnconfirmed = Boolean(zeroGrade?.disabled && zeroChoice && visible(zeroChoice));
            const writesBeforeZeroResponse = writes;
            zeroChoice?.click();
            await pause();
            const selectedZero = labDocument.querySelector('.count-number-bank [data-count-value="0"][aria-pressed="true"]');
            const readyZeroGrade = labDocument.querySelector('[data-lab-action="grade"]');
            const zeroConfirmReady = Boolean(selectedZero && readyZeroGrade && !readyZeroGrade.disabled && visible(readyZeroGrade));
            readyZeroGrade?.click();
            await pause();
            const zeroCorrect = normalized(labDocument.querySelector("[data-lab-result]")?.textContent) === "Correct.";
            const zeroGradeNoWrite = writes === writesBeforeZeroResponse;
            for (const [width, height, viewport] of approvedViewports) {
              await resize(width, height);
              const zeroArticleAfter = labDocument.querySelector(".lab-question");
              const metrics = scopedFloorMetrics(zeroArticleAfter);
              const gradeRect = zeroArticleAfter.querySelector('[data-lab-action="grade"]')?.getBoundingClientRect();
              const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
              const layoutPass = Boolean(gradeRect && gradeRect.bottom <= labWindow.innerHeight + 1
                && noOverflow && metrics.minFont >= 16 && metrics.minControl >= 44);
              const positive = positiveByViewport.get(viewport);
              approvedEarlyRows.push({
                family: "MQ-002", theme, viewport, positiveOrdinal, zeroOrdinal, expectedKind,
                tokenCount: positive?.tokenCount || 0, positiveCount,
                visualPass: Boolean(positive?.exactGlyphs && zeroStateVisible),
                controlPass: zeroStartsUnconfirmed && zeroConfirmReady && zeroCorrect && zeroGradeNoWrite,
                layoutPass, minFont: metrics.minFont, minControl: metrics.minControl,
                gradeBottom: gradeRect ? Math.round(gradeRect.bottom) : null, noOverflow,
                zeroStartsUnconfirmed, zeroConfirmReady, zeroCorrect, zeroGradeNoWrite,
              });
            }
        }
        for (const [, , viewport] of approvedViewports) {
          const viewportFingerprints = Object.keys(glyphKinds).map((theme) => glyphFingerprints.get(`${viewport}:${theme}`) || "");
          approvedEarlyRows.push({
            family: "MQ-002-DISTINCT",
            viewport,
            fingerprints: viewportFingerprints,
            visualPass: viewportFingerprints.every(Boolean) && new Set(viewportFingerprints).size === Object.keys(glyphKinds).length,
            controlPass: true,
            layoutPass: true,
          });
        }

        await enterLabForTheme("ocean");
        for (const ordinal of [0, 1, 2]) {
            await resize(1366, 768);
            await selectCase({ skill: mq006, tier: "EASY", ordinal });
            const question = makeThemed(mq006, "EASY", ordinal, "ocean");
          let selectionWorks = false;
          for (const [width, height, viewport] of approvedViewports) {
            await resize(width, height);
            const article = labDocument.querySelector(".lab-question");
            const choices = [...article.querySelectorAll('.answer-controls[data-control-mode="lab"] .choices > .choice')];
            const choiceVisuals = choices.map((choice) => choice.querySelector(":scope > .duration-event-choice"));
            const optionEvents = choiceVisuals.map((visual) => normalized(visual?.dataset.durationEvent).toLowerCase());
            const expectedCandidates = question.modelDescriptor?.values?.candidates || [];
            const expectedOptionEvents = expectedCandidates.map((item) => normalized(item.event).toLowerCase());
            const redundantSourceCount = article.querySelectorAll(
              ".stimulus [data-duration-event], .stimulus .duration-event-visual, .stimulus .duration-event-choice",
            ).length;
            const optionTracks = choiceVisuals.map((visual, index) => {
              const expected = expectedCandidates[index] || {};
              const track = visual?.querySelector(".duration-event-track");
              const fill = track?.querySelector(":scope > i");
              const magnitude = Number(visual?.dataset.durationMagnitude);
              const maximum = Number(expected.maxMagnitude);
              const trackRect = track?.getBoundingClientRect();
              const fillRect = fill?.getBoundingClientRect();
              return {
                magnitude,
                maximum,
                expectedMagnitude: Number(expected.magnitude),
                expectedRatio: Number.isFinite(magnitude) && Number.isFinite(maximum) && maximum > 0
                  ? Math.max(0.12, Math.min(1, magnitude / maximum))
                  : 0,
                ratio: trackRect?.width ? fillRect.width / trackRect.width : 0,
              };
            });
            const observedTrackMaximum = Math.max(0, ...optionTracks.map((track) => track.ratio));
            const expectedTrackMaximum = Math.max(0, ...optionTracks.map((track) => track.expectedRatio));
            const tracksTruthful = optionTracks.length === 2
              && optionTracks.every((track) => Number.isFinite(track.magnitude)
                && track.magnitude > 0
                && Number.isFinite(track.maximum)
                && track.maximum >= track.magnitude
                && track.magnitude === track.expectedMagnitude
                && track.ratio > 0
                && observedTrackMaximum > 0
                && expectedTrackMaximum > 0
                && Math.abs(track.ratio / observedTrackMaximum - track.expectedRatio / expectedTrackMaximum) <= 0.04)
              && optionTracks[0].maximum === optionTracks[1].maximum
              && optionTracks[0].magnitude !== optionTracks[1].magnitude
              && Math.abs(optionTracks[0].ratio - optionTracks[1].ratio) >= 0.08
              && Math.sign(optionTracks[0].magnitude - optionTracks[1].magnitude)
                === Math.sign(optionTracks[0].ratio - optionTracks[1].ratio);
            const iconFirst = choiceVisuals.length === 2 && choiceVisuals.every((visual) => (
              visual
              && visual.firstElementChild?.classList.contains("duration-event-glyph")
              && visible(visual.firstElementChild)
              && Boolean(visual.firstElementChild.querySelector("svg"))
            ));
            const completeChoiceSources = choiceVisuals.length === 2 && choiceVisuals.every((visual, index) => {
              const expected = expectedCandidates[index] || {};
              const expectedEvent = normalized(expected.event).toLowerCase();
              const expectedMagnitude = Number(expected.magnitude);
              const name = visual?.querySelector(".duration-event-choice__name");
              const track = visual?.querySelector(".duration-event-track");
              const fill = track?.querySelector(":scope > i");
              const time = visual?.querySelector(".duration-event-time");
              return Boolean(
                visual
                && normalized(visual.dataset.durationEvent).toLowerCase() === expectedEvent
                && Number(visual.dataset.durationMagnitude) === expectedMagnitude
                && visible(name)
                && normalized(name.textContent).toLowerCase() === expectedEvent
                && visible(track)
                && visible(fill)
                && visible(time)
                && normalized(time.textContent) === `${expectedMagnitude} min`,
              );
            });
            const exactTwo = question.options.length === 2
              && choices.length === 2
              && choiceVisuals.length === 2
              && article.querySelectorAll(".answer-controls .choice").length === 2;
            const optionTruth = new Set(optionEvents).size === 2
              && JSON.stringify(optionEvents) === JSON.stringify(expectedOptionEvents);
            if (!selectionWorks) {
              choices[0]?.click();
              await pause();
            }
            const selectedChoice = labDocument.querySelector('.answer-controls .choice[aria-pressed="true"]');
            const grade = labDocument.querySelector('[data-lab-action="grade"]');
            selectionWorks = Boolean(selectedChoice && grade && !grade.disabled);
            const metrics = scopedFloorMetrics(labDocument.querySelector(".lab-question"));
            const gradeRect = grade?.getBoundingClientRect();
            const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
            const layoutPass = Boolean(
              gradeRect
              && gradeRect.bottom <= labWindow.innerHeight + 1
              && noOverflow
              && metrics.minFont >= 16
              && metrics.minControl >= 44,
            );
            approvedEarlyRows.push({
              family: "MQ-006",
              viewport,
              ordinal,
              optionCount: choices.length,
              optionEvents,
              optionTracks,
              redundantSourceCount,
              visualPass: exactTwo
                && iconFirst
                && completeChoiceSources
                && optionTruth
                && tracksTruthful
                && redundantSourceCount === 0,
              controlPass: selectionWorks,
              layoutPass,
              minFont: metrics.minFont,
              minControl: metrics.minControl,
              gradeBottom: gradeRect ? Math.round(gradeRect.bottom) : null,
              noOverflow,
            });
          }
        }

        const baseControlResult = tests["VIS-LAB-CONTROLS"];
        const baseModelResult = tests["VIS-LAB-MODELS"];
        tests["VIS-LAB-CONTROLS"] = result(
          baseControlResult.pass && approvedEarlyRows.every((row) => row.controlPass),
          {
            base: JSON.parse(baseControlResult.details),
            approvedEarlyControls: approvedEarlyRows.map((row) => ({
              family: row.family,
              theme: row.theme,
              viewport: row.viewport,
              ordinal: row.ordinal,
              pass: row.controlPass,
            })),
          },
        );
        tests["VIS-LAB-MODELS"] = result(
          baseModelResult.pass && approvedEarlyRows.every((row) => row.visualPass),
          {
            base: JSON.parse(baseModelResult.details),
            approvedEarlyVisuals: approvedEarlyRows.map((row) => ({
              family: row.family,
              theme: row.theme,
              viewport: row.viewport,
              ordinal: row.ordinal,
              pass: row.visualPass,
              optionCount: row.optionCount,
              optionEvents: row.optionEvents,
              optionTracks: row.optionTracks,
              redundantSourceCount: row.redundantSourceCount,
            })),
          },
        );

        const advanceChildToQuestion = async () => {
          for (let step = 0; step < 8; step += 1) {
            const physical = labDocument.querySelector('[data-action="physical-done"]');
            if (physical) {
              physical.click();
              await pause();
              continue;
            }
            const pick = labDocument.querySelector('[data-action="choose-question"]');
            if (pick) {
              pick.click();
              await pause();
              continue;
            }
            if (labDocument.querySelector(".question-response")) return;
            await pause();
          }
          throw new Error("The child session did not reach an answerable question.");
        };
        const submitPairing = async ({ advance = true } = {}) => {
          if (advance) await advanceChildToQuestion();
          const task = labDocument.querySelector('.pair-task[data-response-kind="PAIR_LINK"]');
          if (!task) throw new Error("The deterministic child-feedback fixture is no longer a PAIR_LINK question.");
          const target = Number(normalized(task.querySelector(".direct-status")?.textContent).match(/of\s+(\d+)/iu)?.[1]);
          if (!Number.isInteger(target) || target < 1) throw new Error("The PAIR_LINK fixture did not expose a positive pair target.");
          for (let index = 0; index < target; index += 1) {
            const left = labDocument.querySelector(`.pair-row:first-child .pair-object[data-item-id="a${index}"]:not(:disabled)`);
            if (!left) throw new Error(`PAIR_LINK left object ${index + 1} is unavailable.`);
            left.click();
            await pause();
            const right = labDocument.querySelector(`.pair-row:nth-child(2) .pair-object[data-item-id="b${index}"]:not(:disabled)`);
            if (!right) throw new Error(`PAIR_LINK right object ${index + 1} is unavailable.`);
            right.click();
            await pause();
          }
          const confirm = labDocument.querySelector('[data-action="confirm"]');
          if (!confirm || confirm.disabled) throw new Error("PAIR_LINK did not enable Confirm after a complete construction.");
          confirm.click();
          await pause();
          await pause();
          return { method: "PAIR_LINK", pairCount: target };
        };
        const submitIncorrectCountTouch = async () => {
          let task = labDocument.querySelector('.count-touch-task[data-response-kind="COUNT_TOUCH"]');
          if (!task) throw new Error("The explicit incorrect-feedback fixture is not a COUNT_TOUCH question.");
          const itemIds = [...task.querySelectorAll('[data-response-action="count-touch"][data-item-id]')]
            .map((button) => button.dataset.itemId);
          for (const itemId of itemIds) {
            const item = labDocument.querySelector(
              `.count-touch-task [data-response-action="count-touch"][data-item-id="${CSS.escape(itemId)}"]:not([aria-pressed="true"])`,
            );
            if (!item) throw new Error(`COUNT_TOUCH object ${itemId} is unavailable before completion.`);
            item.click();
            await pause();
          }
          task = labDocument.querySelector('.count-touch-task[data-response-kind="COUNT_TOUCH"]');
          const wrongChoice = [...task.querySelectorAll('[data-response-action="count-number"][data-count-value]')]
            .find((button) => Number(button.dataset.countValue) !== itemIds.length);
          if (!wrongChoice) throw new Error("COUNT_TOUCH did not expose a legitimate incorrect count choice.");
          const reportedCount = Number(wrongChoice.dataset.countValue);
          wrongChoice.click();
          await pause();
          const confirm = labDocument.querySelector('[data-action="confirm"]');
          if (!confirm || confirm.disabled) {
            throw new Error("COUNT_TOUCH did not enable Confirm after every object and an explicit count were selected.");
          }
          confirm.click();
          await pause();
          await pause();
          return { method: "COUNT_TOUCH", objectCount: itemIds.length, reportedCount };
        };
        const feedbackSnapshot = (expectedState, viewport, fixture, outcomeFocusedAtTransition) => {
          const stateNode = labDocument.querySelector(`.feedback-state[data-feedback-state="${CSS.escape(expectedState)}"]`);
          const icon = stateNode?.querySelector(`.feedback-state__icon .mq-icon[data-icon="${CSS.escape(expectedState)}"]`);
          const status = stateNode?.querySelector(".feedback-state__copy strong");
          const next = labDocument.querySelector('[data-action="next"]');
          const stateRect = stateNode?.getBoundingClientRect();
          const iconRect = icon?.getBoundingClientRect();
          const statusRect = status?.getBoundingClientRect();
          const nextRect = next?.getBoundingClientRect();
          const statusFont = status ? Number.parseFloat(labWindow.getComputedStyle(status).fontSize) : 0;
          const metrics = scopedFloorMetrics(labDocument.querySelector(".question"));
          const beforeNext = Boolean(
            stateNode
            && next
            && stateNode.compareDocumentPosition(next) & labWindow.Node.DOCUMENT_POSITION_FOLLOWING
            && stateRect
            && nextRect
            && stateRect.bottom <= nextRect.top + 1,
          );
          const inViewport = Boolean(
            stateRect
            && iconRect
            && statusRect
            && nextRect
            && stateRect.top >= -1
            && stateRect.bottom <= labWindow.innerHeight + 1
            && iconRect.top >= -1
            && statusRect.top >= -1
            && nextRect.bottom <= labWindow.innerHeight + 1,
          );
          const iconLarge = Boolean(iconRect && iconRect.width >= 54 && iconRect.height >= 54);
          const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
          const outcomeFocused = Boolean(outcomeFocusedAtTransition);
          return {
            family: "CHILD-FEEDBACK",
            state: expectedState,
            viewport,
            fixture,
            visualPass: Boolean(
              stateNode
              && visible(stateNode)
              && visible(icon)
              && visible(status)
              && normalized(status.textContent)
              && iconLarge
              && statusFont >= 27
              && beforeNext,
            ),
            controlPass: Boolean(next && visible(next) && outcomeFocused && metrics.minControl >= 44),
            layoutPass: inViewport && noOverflow && metrics.minFont >= 16 && metrics.minControl >= 44,
            status: normalized(status?.textContent),
            statusFont,
            iconWidth: iconRect ? Math.round(iconRect.width) : null,
            iconHeight: iconRect ? Math.round(iconRect.height) : null,
            beforeNext,
            outcomeFocused,
            inViewport,
            nextBottom: nextRect ? Math.round(nextRect.bottom) : null,
            minFont: metrics.minFont,
            minControl: metrics.minControl,
            noOverflow,
          };
        };

        const feedbackRows = [];
        let feedbackFixtureError = null;
        try {
          labDocument.querySelector('[data-lab-action="exit"]')?.click();
          await pause();
          labDocument.querySelector('[data-action="home"]')?.click();
          await pause();
          await resize(1366, 768);
          labDocument.querySelector('[data-action="start"]')?.click();
          await pause();
          const correctFixture = await submitPairing();
          const correctFocusedAtTransition = labDocument.activeElement
            === labDocument.querySelector('.feedback-state[data-feedback-state="correct"]');
          for (const [width, height, viewport] of [
            [1366, 768, "desktop"],
            [390, 844, "phone"],
          ]) {
            await resize(width, height);
            feedbackRows.push(feedbackSnapshot("correct", viewport, correctFixture, correctFocusedAtTransition));
          }
          await resize(1366, 768);
          if (typeof activeStateFactory !== "function") {
            throw new Error("The visual audit did not receive its validated active-state fixture factory.");
          }
          const countOrdinal = findOrdinal(mq002, "ocean", (question) => mq002Source(question).count > 0);
          if (countOrdinal < 0) throw new Error("COUNT_TOUCH did not generate a positive incorrect-feedback fixture.");
          const countQuestion = engine.makeQuestion({
            skillId: mq002.skillId,
            tier: "EASY",
            representation: mq002.phases.includes("P") ? "PICTORIAL" : "CONCRETE",
            seed: LAB_SEED,
            ordinal: countOrdinal,
            eligibleQuestionOrdinal: countOrdinal,
            scheduledReview: false,
            coldTest: false,
            preview: false,
            theme: "ocean",
            scaffolded: true,
          });
          const countState = activeStateFactory(engine, playDay, countQuestion, {
            canonicalIndex: countOrdinal,
          });
          await replaceActiveFixture(countState, "child-feedback-count-touch");
          const incorrectFixture = await submitIncorrectCountTouch();
          const incorrectFocusedAtTransition = labDocument.activeElement
            === labDocument.querySelector('.feedback-state[data-feedback-state="incorrect"]');
          for (const [width, height, viewport] of [
            [1366, 768, "desktop"],
            [390, 844, "phone"],
          ]) {
            await resize(width, height);
            feedbackRows.push(feedbackSnapshot("incorrect", viewport, incorrectFixture, incorrectFocusedAtTransition));
          }
        } catch (error) {
          feedbackFixtureError = String(error?.stack || error?.message || error);
          for (const state of ["correct", "incorrect"]) {
            for (const viewport of ["desktop", "phone"]) {
              if (feedbackRows.some((row) => row.state === state && row.viewport === viewport)) continue;
              feedbackRows.push({
                family: "CHILD-FEEDBACK",
                state,
                viewport,
                fixture: null,
                visualPass: false,
                controlPass: false,
                layoutPass: false,
                reason: feedbackFixtureError,
              });
            }
          }
        }

        const practiceTokenRows = [];
        const practiceTokenGuideRows = [];
        let practiceTokenFixtureError = null;
        try {
          if (typeof activeStateFactory !== "function") {
            throw new Error("The visual audit did not receive its validated active-state fixture factory.");
          }
          const skill = engine.SKILL_BY_ID["MQ-048"];
          if (!skill) throw new Error("The exact MQ-048 practice-token visual obligation is unavailable.");

          const optionOracle = PRACTICE_TOKEN_VISUAL_ORACLE.map((row) => row.value).sort();
          const fixtures = [];
          for (const expected of PRACTICE_TOKEN_VISUAL_ORACLE) {
            let fixture = null;
            for (let canonicalIndex = 0; canonicalIndex < 40 && !fixture; canonicalIndex += 1) {
              const probeQuestion = engine.makeQuestion({
                skillId: skill.skillId,
                tier: "EASY",
                representation: "PICTORIAL",
                seed: LAB_SEED,
                ordinal: canonicalIndex,
                eligibleQuestionOrdinal: canonicalIndex,
                scheduledReview: false,
                coldTest: false,
                preview: false,
                theme: "ocean",
                scaffolded: true,
              });
              const state = activeStateFactory(engine, playDay, probeQuestion, { canonicalIndex });
              const activeQuestion = state.activeSession?.uiState?.question;
              const optionValues = activeQuestion?.options?.map((option) => option.value).sort() || [];
              if (activeQuestion?.skillId === "MQ-048"
                && activeQuestion.params?.tokenId === expected.tokenId
                && activeQuestion.answer?.value === expected.value
                && activeQuestion.inputMethod === "PICTURE_CHOICE"
                && engine.canonical(optionValues) === engine.canonical(optionOracle)) {
                fixture = { expected, canonicalIndex, state, question: activeQuestion };
              }
            }
            if (!fixture) throw new Error(`No real child-session fixture exposes ${expected.tokenId} as ${expected.value}.`);
            fixtures.push(fixture);
          }

          const guideState = JSON.parse(JSON.stringify(fixtures[0].state));
          guideState.skills["MQ-048"].acquisition = "LEARNING";
          guideState.activeSession.uiState.phase = "physical";
          guideState.activeSession.uiState.modelTouched = false;
          const practiceTokenGuideSnapshot = (profile) => {
            const questionNode = labDocument.querySelector('.question[data-skill-id="MQ-048"]');
            const guide = questionNode?.querySelector('[data-practice-token-guide="true"]');
            const cards = [...(guide?.querySelectorAll('.practice-token-guide__item[role="listitem"]') || [])]
              .filter((node) => visible(node));
            const mappings = cards.map((card) => ({
              tokenId: card.querySelector('.practice-coin-token[data-practice-token]')?.dataset.practiceToken || "",
              value: card.dataset.practiceTokenValue || "",
              ariaLabel: card.getAttribute("aria-label") || "",
            }));
            const exactMappings = engine.canonical(mappings.map(({ tokenId, value }) => ({ tokenId, value })))
              === engine.canonical(PRACTICE_TOKEN_VISUAL_ORACLE);
            const accessibleMappings = mappings.every((mapping) => (
              mapping.ariaLabel
              && normalized(mapping.ariaLabel).includes(normalized(mapping.value))
            ));
            const ready = guide?.querySelector('[data-action="physical-done"]');
            const forbiddenControls = guide?.querySelectorAll('[data-action="confirm"],[data-action="select"],input,select').length || 0;
            const guideRect = guide?.getBoundingClientRect();
            const readyRect = ready?.getBoundingClientRect();
            const tokenRects = cards.map((card) => card.querySelector('.practice-coin-token')?.getBoundingClientRect());
            const contentOnFirstScreen = Boolean(
              guideRect
              && readyRect
              && guideRect.left >= -1
              && guideRect.right <= labWindow.innerWidth + 1
              && guideRect.top >= -1
              && readyRect.bottom <= labWindow.innerHeight + 1
            );
            const tokensLarge = tokenRects.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
              && tokenRects.every((rect) => rect && rect.width >= 50 && rect.height >= 50);
            const metrics = scopedFloorMetrics(questionNode);
            const noHorizontalOverflow = labDocument.documentElement.scrollWidth
              <= labDocument.documentElement.clientWidth + 1;
            const readyFocused = labDocument.activeElement === ready;
            const pass = Boolean(
              questionNode
              && guide
              && guideState.activeSession.uiState.question.scaffolded === false
              && cards.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
              && exactMappings
              && accessibleMappings
              && ready
              && visible(ready)
              && forbiddenControls === 0
              && contentOnFirstScreen
              && tokensLarge
              && metrics.minFont >= 16
              && metrics.minControl >= 44
              && noHorizontalOverflow
              && readyFocused
            );
            return {
              viewport: profile.viewport,
              width: profile.width,
              height: profile.height,
              mappingCount: mappings.length,
              mappings,
              exactMappings,
              accessibleMappings,
              forbiddenControls,
              contentOnFirstScreen,
              tokensLarge,
              minFont: metrics.minFont,
              minControl: metrics.minControl,
              noHorizontalOverflow,
              readyFocused,
              pass,
            };
          };
          for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
            await resize(profile.width, profile.height);
            await replaceActiveFixture(guideState, `practice-token-first-use-guide-${profile.viewport}`);
            practiceTokenGuideRows.push(practiceTokenGuideSnapshot(profile));
          }

          const practiceTokenSnapshot = (fixture, profile, stateName, feedbackFocusedAtTransition = null) => {
            const question = fixture.question;
            const expected = fixture.expected;
            const questionNode = labDocument.querySelector('.question[data-skill-id="MQ-048"]');
            const prompt = questionNode?.querySelector(".prompt");
            const source = questionNode?.querySelector('.stimulus[data-answer-free="true"]');
            const worked = questionNode?.querySelector('[data-worked-result="true"]');
            const tutorial = questionNode?.querySelector('[data-tutorial="different-example"]');
            const tutorialInstruction = tutorial?.querySelector(".tutorial-instruction");
            const tutorialBack = tutorial?.querySelector('[data-action="tutorial-back"]');
            const answer = questionNode?.querySelector('.answer-controls[data-input-method="PICTURE_CHOICE"]');
            const confirm = questionNode?.querySelector('[data-action="confirm"]');
            const outcome = questionNode?.querySelector('.feedback-state[data-feedback-state="incorrect"]');
            const next = questionNode?.querySelector('[data-action="next"]');
            const action = stateName === "incorrect"
              ? next
              : stateName === "tutorial-notice"
                ? tutorialBack
                : confirm;
            const expectedSelector = `.practice-coin-token[data-practice-token="${CSS.escape(expected.tokenId)}"]`;
            const tokenNodes = [...(questionNode?.querySelectorAll(".practice-coin-token[data-practice-token]") || [])]
              .filter((node) => visible(node));
            const expectedTokenNodes = tokenNodes.filter((node) => node.dataset.practiceToken === expected.tokenId);
            const unexpectedTokenIds = [...new Set(tokenNodes
              .map((node) => node.dataset.practiceToken)
              .filter((tokenId) => tokenId !== expected.tokenId))];
            const tutorialTokenNodes = [...(tutorial?.querySelectorAll(".practice-coin-token[data-practice-token]") || [])]
              .filter((node) => visible(node));
            const tutorialTokenIds = [...new Set(tutorialTokenNodes.map((node) => node.dataset.practiceToken))];
            const renderedTokenIds = [...new Set(tokenNodes.map((node) => node.dataset.practiceToken))];
            const tokenStateContract = practiceTokenStateTokenContract(
              stateName,
              expected.tokenId,
              renderedTokenIds,
              tutorialTokenIds,
            );
            const stateTokenNodes = stateName === "tutorial-notice"
              ? tutorialTokenNodes
              : expectedTokenNodes;
            const sourceToken = source?.querySelector(expectedSelector);
            const workedToken = worked?.querySelector(expectedSelector);
            const valueLeaksIntoSource = PRACTICE_TOKEN_VISUAL_ORACLE.some((row) => (
              normalized(source?.textContent).includes(normalized(row.value))
            ));
            const workedNamesValue = Boolean(worked && normalized(worked.textContent).includes(normalized(expected.value)));
            const renderedOptions = [...(answer?.querySelectorAll('[data-action="select"][data-id]') || [])]
              .filter((node) => visible(node));
            const renderedOptionIds = renderedOptions.map((node) => node.dataset.id).sort();
            const expectedOptionIds = question.options.map((option) => option.optionId).sort();
            const exactOptions = stateName !== "ordinary" || Boolean(
              renderedOptions.length === PRACTICE_TOKEN_VISUAL_ORACLE.length
              && engine.canonical(renderedOptionIds) === engine.canonical(expectedOptionIds)
              && engine.canonical(question.options.map((option) => option.value).sort()) === engine.canonical(optionOracle),
            );
            const requiredElements = stateName === "incorrect"
              ? [prompt, source, outcome, next]
              : stateName === "tutorial-notice"
                ? [tutorial, prompt, source, tutorialInstruction, tutorialBack]
                : [prompt, source, answer, confirm];
            const requiredRects = requiredElements.map((element) => element?.getBoundingClientRect());
            const contentOnFirstScreen = requiredRects.every((rect) => Boolean(
              rect
              && rect.left >= -1
              && rect.right <= labWindow.innerWidth + 1
              && rect.top >= -1
              && rect.bottom <= labWindow.innerHeight + 1
            ));
            const tokenRects = stateTokenNodes.map((node) => node.getBoundingClientRect());
            const tokensOnFirstScreen = tokenRects.length >= 1
              && tokenRects.every((rect) => rect.left >= -1 && rect.right <= labWindow.innerWidth + 1
                && rect.top >= -1 && rect.bottom <= labWindow.innerHeight + 1);
            const tokensLarge = tokenRects.length > 0
              && tokenRects.every((rect) => rect.width >= 50 && rect.height >= 50);
            const responseBeforeAction = stateName === "incorrect" || Boolean(
              stateName === "tutorial-notice"
                ? tutorialInstruction?.getBoundingClientRect().bottom <= tutorialBack?.getBoundingClientRect().top + 1
                : answer?.getBoundingClientRect().bottom <= confirm?.getBoundingClientRect().top + 1,
            );
            const feedbackBeforeAction = stateName !== "incorrect" || Boolean(
              outcome?.getBoundingClientRect().bottom <= next?.getBoundingClientRect().top + 1,
            );
            const metrics = scopedFloorMetrics(questionNode);
            const noHorizontalOverflow = labDocument.documentElement.scrollWidth
              <= labDocument.documentElement.clientWidth + 1;
            const stateToken = stateTokenNodes[0] || null;
            const mark = stateToken?.querySelector(".practice-coin-token__mark");
            const markStyle = mark ? labWindow.getComputedStyle(mark) : null;
            const afterStyle = mark ? labWindow.getComputedStyle(mark, "::after") : null;
            const fingerprint = markStyle ? [
              markStyle.backgroundImage,
              markStyle.backgroundColor,
              markStyle.borderRadius,
              markStyle.borderTopWidth,
              markStyle.borderTopStyle,
              afterStyle?.content,
              afterStyle?.backgroundColor,
              afterStyle?.transform,
            ].join("|") : "";
            const stateContract = stateName === "ordinary"
              ? !worked && !outcome
              : stateName === "tutorial-notice"
                ? Boolean(
                  tutorial
                  && tutorial.dataset.tutorialStep === "1"
                  && tutorial.dataset.tutorialPhaseId === "NOTICE"
                  && tutorial.dataset.sourceQuestionId === question.questionId
                  && tutorial.dataset.exampleQuestionId !== question.questionId
                  && tutorial.dataset.terminalAnswerRendered === "false"
                  && !worked
                  && !outcome,
                )
                : Boolean(!worked && outcome && feedbackFocusedAtTransition);
            const pass = Boolean(
              questionNode
              && questionNode.dataset.inputMethod === "PICTURE_CHOICE"
              && question.params?.tokenId === expected.tokenId
              && question.answer?.value === expected.value
              && source
              && (stateName === "tutorial-notice" || sourceToken)
              && !valueLeaksIntoSource
              && tokenStateContract
              && exactOptions
              && action
              && visible(action)
              && stateContract
              && contentOnFirstScreen
              && tokensOnFirstScreen
              && tokensLarge
              && responseBeforeAction
              && feedbackBeforeAction
              && metrics.minFont >= 16
              && metrics.minControl >= 44
              && noHorizontalOverflow
              && fingerprint,
            );
            return {
              tokenId: expected.tokenId,
              value: expected.value,
              canonicalIndex: fixture.canonicalIndex,
              state: stateName,
              viewport: profile.viewport,
              width: profile.width,
              height: profile.height,
              renderedTokens: expectedTokenNodes.length,
              renderedTokenIds,
              unexpectedTokenIds,
              tutorialTokenIds,
              tutorialUsesDifferentToken: stateName !== "tutorial-notice"
                || Boolean(tutorialTokenIds.length === 1 && tutorialTokenIds[0] !== expected.tokenId),
              tokenStateContract,
              renderedOptions: renderedOptions.length,
              exactOptions,
              valueLeaksIntoSource,
              workedNamesValue,
              stateContract,
              contentOnFirstScreen,
              tokensOnFirstScreen,
              tokensLarge,
              responseBeforeAction,
              feedbackBeforeAction,
              feedbackFocusedAtTransition,
              minFont: metrics.minFont,
              minControl: metrics.minControl,
              noHorizontalOverflow,
              fingerprint,
              pass,
            };
          };

          for (const fixture of fixtures) {
            await replaceActiveFixture(fixture.state, `practice-token-${fixture.expected.tokenId}`);
            for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
              await resize(profile.width, profile.height);
              practiceTokenRows.push(practiceTokenSnapshot(fixture, profile, "ordinary"));
            }

            await resize(1366, 768);
            const help = [...labDocument.querySelectorAll('[data-action="tutorial"]')].find((button) => visible(button));
            if (!help || help.disabled) throw new Error(`${fixture.expected.tokenId} did not expose its real Show me how control.`);
            help.click();
            await pause();
            await pause();
            for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
              await resize(profile.width, profile.height);
              practiceTokenRows.push(practiceTokenSnapshot(fixture, profile, "tutorial-notice"));
            }

            await resize(1366, 768);
            const tutorialBack = labDocument.querySelector('[data-action="tutorial-back"]');
            if (!tutorialBack || tutorialBack.disabled) {
              throw new Error(`${fixture.expected.tokenId} did not expose Back to your question.`);
            }
            tutorialBack.click();
            await pause();
            await pause();
            const wrongOption = fixture.question.options.find((option) => option.value !== fixture.question.answer.value);
            const wrongControl = wrongOption
              ? labDocument.querySelector(`[data-action="select"][data-id="${CSS.escape(wrongOption.optionId)}"]`)
              : null;
            if (!wrongControl) throw new Error(`${fixture.expected.tokenId} did not expose a legitimate incorrect option.`);
            wrongControl.click();
            await pause();
            const confirm = labDocument.querySelector('[data-action="confirm"]');
            if (!confirm || confirm.disabled) throw new Error(`${fixture.expected.tokenId} did not enable Confirm after selection.`);
            confirm.click();
            await pause();
            await pause();
            const feedbackFocusedAtTransition = labDocument.activeElement
              === labDocument.querySelector('.feedback-state[data-feedback-state="incorrect"]');
            for (const profile of PRACTICE_TOKEN_VISUAL_VIEWPORTS) {
              await resize(profile.width, profile.height);
              practiceTokenRows.push(practiceTokenSnapshot(fixture, profile, "incorrect", feedbackFocusedAtTransition));
            }
          }
        } catch (error) {
          practiceTokenFixtureError = String(error?.stack || error?.message || error);
        }

        const baseDesktopResult = tests["VIS-DESKTOP-LAYOUT"];
        const baseMobileResult = tests["VIS-MOBILE-LAYOUT"];
        const desktopApproved = approvedEarlyRows.filter((row) => row.viewport === "desktop");
        const phoneApproved = approvedEarlyRows.filter((row) => row.viewport === "phone");
        const desktopFeedback = feedbackRows.filter((row) => row.viewport === "desktop");
        const phoneFeedback = feedbackRows.filter((row) => row.viewport === "phone");
        const desktopPracticeTokens = practiceTokenRows.filter((row) => row.viewport !== "phone");
        const phonePracticeTokens = practiceTokenRows.filter((row) => row.viewport === "phone");
        const desktopPracticeTokenGuides = practiceTokenGuideRows.filter((row) => row.viewport !== "phone");
        const phonePracticeTokenGuides = practiceTokenGuideRows.filter((row) => row.viewport === "phone");
        const requiredPracticeTokenObligations = practiceTokenVisualObligations();
        const requiredPracticeTokenKeys = requiredPracticeTokenObligations.map(practiceTokenVisualRowKey).sort();
        const observedPracticeTokenKeys = practiceTokenRows.map(practiceTokenVisualRowKey).sort();
        const practiceTokenObligationsExact = engine.canonical(observedPracticeTokenKeys)
          === engine.canonical(requiredPracticeTokenKeys);
        const expectedDesktopPracticeTokenRows = requiredPracticeTokenObligations
          .filter((row) => row.viewport !== "phone").length;
        const expectedPhonePracticeTokenRows = requiredPracticeTokenObligations
          .filter((row) => row.viewport === "phone").length;
        const practiceTokenFingerprints = Object.fromEntries(PRACTICE_TOKEN_VISUAL_ORACLE.map(({ tokenId }) => [
          tokenId,
          practiceTokenRows.find((row) => row.tokenId === tokenId)?.fingerprint || "",
        ]));
        const practiceTokenFingerprintsDistinct = Object.values(practiceTokenFingerprints).every(Boolean)
          && new Set(Object.values(practiceTokenFingerprints)).size === PRACTICE_TOKEN_VISUAL_ORACLE.length;
        tests["VIS-DESKTOP-LAYOUT"] = result(
          baseDesktopResult.pass
            && desktopApproved.every((row) => row.visualPass && row.controlPass && row.layoutPass)
            && desktopFeedback.every((row) => row.visualPass && row.controlPass && row.layoutPass)
            && desktopPracticeTokens.length === expectedDesktopPracticeTokenRows
            && desktopPracticeTokens.every((row) => row.pass)
            && desktopPracticeTokenGuides.length === PRACTICE_TOKEN_VISUAL_VIEWPORTS.filter((row) => row.viewport !== "phone").length
            && desktopPracticeTokenGuides.every((row) => row.pass)
            && practiceTokenObligationsExact
            && practiceTokenFingerprintsDistinct,
          {
            base: JSON.parse(baseDesktopResult.details),
            approvedEarly: desktopApproved,
            childFeedback: desktopFeedback,
            childFeedbackFixtureError: feedbackFixtureError,
            practiceTokens: desktopPracticeTokens,
            practiceTokenGuides: desktopPracticeTokenGuides,
            expectedPracticeTokenRows: expectedDesktopPracticeTokenRows,
            practiceTokenFingerprints,
            practiceTokenFingerprintsDistinct,
            practiceTokenObligationsExact,
            practiceTokenFixtureError,
            practiceTokenPolicy: "Every one of the exact five MQ-048 token/value fixtures renders in ordinary, different-example Notice, and real incorrect-feedback states, returns explicitly to its source question, and keeps the separate first-use guide free of answer controls at desktop, tablet portrait, and both automated iPad-landscape viewports.",
          },
        );
        tests["VIS-MOBILE-LAYOUT"] = result(
          baseMobileResult.pass
            && phoneApproved.every((row) => row.visualPass && row.controlPass && row.layoutPass)
            && phoneFeedback.every((row) => row.visualPass && row.controlPass && row.layoutPass)
            && phonePracticeTokens.length === expectedPhonePracticeTokenRows
            && phonePracticeTokens.every((row) => row.pass)
            && phonePracticeTokenGuides.length === 1
            && phonePracticeTokenGuides.every((row) => row.pass)
            && practiceTokenObligationsExact
            && practiceTokenFingerprintsDistinct,
          {
            base: JSON.parse(baseMobileResult.details),
            approvedEarly: phoneApproved,
            childFeedback: phoneFeedback,
            childFeedbackFixtureError: feedbackFixtureError,
            practiceTokens: phonePracticeTokens,
            practiceTokenGuides: phonePracticeTokenGuides,
            expectedPracticeTokenRows: expectedPhonePracticeTokenRows,
            practiceTokenFingerprints,
            practiceTokenFingerprintsDistinct,
            practiceTokenObligationsExact,
            practiceTokenFixtureError,
            practiceTokenPolicy: "Every one of the exact five MQ-048 token/value fixtures renders in ordinary, different-example Notice, and real incorrect-feedback states, returns explicitly to its source question, and keeps the separate first-use guide free of answer controls at 390x844.",
          },
        );
        approvedChecksComplete = true;
      } finally {
        restoreStorageInstrumentation();
      }
    } catch (error) {
      const approvedFailure = approvedChecksStarted && !approvedChecksComplete;
      for (const [id, title] of [
        ["VIS-PLACEMENT-LAYOUT", "Every reachable starting-point control is legible, actionable, and narratable in the child placement wrapper"],
        ["VIS-LAB-CONTROLS", "Parent Test Lab renders every exact release-reachable input method without writing progress"],
        ["VIS-LAB-MODELS", "Every semantically renderable model type appears as derived math in Parent Test Lab"],
        ["VIS-DESKTOP-LAYOUT", "Every generator profile keeps complete Parent Test answers, controls, and focus visible at desktop, tablet, and iPad-landscape sizes"],
        ["VIS-MOBILE-LAYOUT", "Every manifest level is question-first, legible, and actionable at 390×844"],
      ]) {
        titles[id] ||= title;
        if (approvedFailure || !tests[id]) tests[id] = result(false, String(error?.stack || error?.message || error));
      }
    } finally {
      if (frame) frame.remove();
      if (originalSave === null) hostWindow.localStorage.removeItem(storageKey);
      else hostWindow.localStorage.setItem(storageKey, originalSave);
      if (originalChildName === null) hostWindow.localStorage.removeItem(childNameKey);
      else hostWindow.localStorage.setItem(childNameKey, originalChildName);
      if (originalPlacementDraft === null) hostWindow.localStorage.removeItem(placementDraftKey);
      else hostWindow.localStorage.setItem(placementDraftKey, originalPlacementDraft);
    }

    return Object.freeze({ titles: Object.freeze(titles), tests: Object.freeze(tests) });
  }

  window.MathQuestApprovedVisualRegression = Object.freeze({
    run,
    correctAnswer,
    placementCases,
    semanticVisualObligationKey,
    practiceTokenVisualObligations,
    practiceTokenVisualOracle: PRACTICE_TOKEN_VISUAL_ORACLE,
    practiceTokenStateTokenContract,
  });
})();
