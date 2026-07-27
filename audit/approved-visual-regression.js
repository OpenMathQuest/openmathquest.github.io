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
    return Array.from({ length: Math.max(3, declared * Math.max(longestFacet, volumeFacetSpan)) }, (_, index) => index);
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
      const targetIndexes = values.targetIndexes;
      const nonTargetIndexes = values.nonTargetIndexes;
      const attribute = rule?.attribute ?? rule?.property;
      const targetValue = rule?.value ?? rule?.targetValue;
      const complete = Array.isArray(items) && items.length >= 3
        && items.every((item) => ["shape", "color", "size"].every((key) => typeof item?.[key] === "string" && item[key]));
      const indexes = Array.isArray(targetIndexes) && targetIndexes.length
        && Array.isArray(nonTargetIndexes) && nonTargetIndexes.length
        && new Set([...targetIndexes, ...nonTargetIndexes]).size === items?.length;
      const truthful = Boolean(indexes && attribute && targetValue !== undefined
        && targetIndexes.every((index) => items[index]?.[attribute] === targetValue)
        && nonTargetIndexes.every((index) => items[index]?.[attribute] !== targetValue));
      return { pass: Boolean(complete && truthful), reason: { complete, truthful, items: items?.length || 0 } };
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
      return { pass: Boolean(semanticEvidence), reason: { candidates: candidates?.length || 0, frames: frames?.length || 0, strategy: Boolean(strategy) } };
    }

    if (model.type === "array") {
      const total = Number(values.total);
      const remainder = Number(values.remainder ?? 0);
      const multiplication = finite(values.rows) && finite(values.columns)
        && Number(values.rows) * Number(values.columns) === total;
      const division = finite(values.groups) && finite(values.perGroup)
        && Number(values.groups) * Number(values.perGroup) + remainder === total;
      let interpretationExact = true;
      if (question.skillId === "MQ-114") {
        const expectedPrompt = {
          "whole-remainder": "question.remainderWhole",
          fraction: "question.remainderFraction",
          "round-up": "question.remainderInterpret",
          "round-down": "question.remainderFullGroups",
        }[question.params?.interpretation];
        interpretationExact = Boolean(expectedPrompt
          && values.interpretation === question.params.interpretation
          && values.operation === question.params.interpretation
          && question.semanticPromptStringId === expectedPrompt
          && Number(values.groups) === Number(question.params.quotient)
          && Number(values.perGroup) === Number(question.params.divisor)
          && Number(values.remainder) === Number(question.params.remainder));
      }
      return { pass: Number.isFinite(total) && (multiplication || division) && interpretationExact, reason: { total, remainder, multiplication, division, interpretationExact } };
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
      const complete = Array.isArray(bars) && bars.length
        && bars.every((bar) => finite(bar.total) && Array.isArray(bar.segments) && bar.segments.length
          && bar.segments.every((segment) => finite(segment.value) && normalized(segment.label))
          && Math.abs(Number(bar.total) - bar.segments.reduce((sum, segment) => sum + Number(segment.value), 0)) < 1e-12);
      return { pass: Boolean(complete && normalized(values.unknownLabel)), reason: { bars: bars?.length || 0, complete: Boolean(complete), unknownLabel: values.unknownLabel } };
    }

    if (model.type === "areaGrid") {
      const width = Number(values.width);
      const height = Number(values.height);
      const parts = values.parts;
      const partValue = (part) => values.operation === "perimeter"
        ? 2 * (Number(part.width) + Number(part.height))
        : Number(part.width) * Number(part.height);
      const partsExact = Array.isArray(parts) && parts.length
        && parts.every((part) => finite(part.width) && finite(part.height) && finite(part.value)
          && partValue(part) === Number(part.value));
      const promptId = normalized(question.semanticPromptStringId);
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
      const minuteMode = values.durationMinutes !== undefined;
      const startDay = minuteMode && values.startDay !== undefined ? Number(values.startDay) : 0;
      const endDay = minuteMode && values.endDay !== undefined ? Number(values.endDay) : startDay;
      const start = minuteMode
        ? startDay * 1440 + Number(values.startHour) * 60 + Number(values.startMinute ?? 0)
        : Number(values.start ?? values.startHour);
      const end = minuteMode
        ? endDay * 1440 + Number(values.endHour) * 60 + Number(values.endMinute ?? 0)
        : Number(values.end ?? values.endHour);
      const duration = Number(values.duration ?? (minuteMode ? values.durationMinutes : values.durationHours));
      const cycle = minuteMode && values.startDay === undefined && values.endDay === undefined ? 1440 : 24;
      const coherent = [start, end, duration].every(Number.isFinite)
        && (((end - start + cycle) % cycle === duration) || end - start === duration);
      const formatExact = question.semanticPromptStringId !== "question.timetableInterval"
        || (["12-hour", "24-hour"].includes(values.format)
          && values.format === question.params?.format
          && values.startTime === question.params?.startTime
          && values.endTime === question.params?.endTime
          && question.prompt.includes(values.startTime)
          && question.prompt.includes(values.endTime));
      return { pass: Boolean(coherent && values.direction === "forward" && formatExact), reason: { mode: minuteMode ? "minutes" : "hours", startDay, endDay, start, end, duration, coherent, formatExact } };
    }

    if (model.type === "visualPrompt") {
      const kind = normalized(values.kind);
      const items = Array.isArray(values.items) ? values.items : [];
      const candidates = Array.isArray(values.candidates) ? values.candidates : [];
      const data = object(values.data) ? values.data : {};
      let truthful = Boolean(kind && (items.length || candidates.length || Object.keys(data).length));
      if (/money/iu.test(kind)) {
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
        truthful &&= shown.length >= 3 && shown.every(Number.isFinite) && new Set(shown).size === shown.length;
      } else if (kind === "numericPrompt") {
        truthful &&= typeof data.semanticPromptStringId === "string";
      } else if (kind === "volume") {
        const item = items[0];
        const length = Number(data.length);
        const width = Number(data.width);
        const height = Number(data.height);
        const total = length * width * height;
        const representationExact = data.representation === "unit-cubes"
          && item?.kind === "prism" && Number(item.total) === total
          || data.representation === "layers" && item?.kind === "cubeLayers"
            && Number(item.layers) === height && Number(item.cubesPerLayer) === length * width && Number(item.total) === total;
        truthful &&= representationExact && Number(data.total) === total && exactNumber(question.answer?.value) === total;
      } else if (/geometry|shape|solid|volume|measure|pattern|quantity|number|ordinal|skip/iu.test(kind)) {
        truthful &&= items.length >= 1;
      }
      return { pass: Boolean(truthful), reason: { kind, items: items.length, candidates: candidates.length, dataKeys: Object.keys(data) } };
    }

    return { pass: false, reason: `unsupported model descriptor type: ${model.type}` };
  }

  function inputContract(question) {
    if (question?.inputClass === "SELECTION") return uniqueGradedChoice(this, question);
    if (question?.inputClass !== "CONSTRUCTION") return false;
    const graded = this.gradeAnswer(question, { value: question.answer?.value });
    return Boolean(graded.correct && graded.valid);
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
          const semanticFacet = [
            question.params?.place,
            question.params?.interpretation,
            question.params?.format,
            question.params?.representation,
            question.params?.unit,
            question.params?.solid,
          ].filter(Boolean).join("|");
          const semanticKey = `${question.modelDescriptor.type}|${question.semanticPromptStringId}${semanticFacet ? `|${semanticFacet}` : ""}`;
          if (!bySemanticModel.has(semanticKey)) bySemanticModel.set(semanticKey, { skill, tier, ordinal, question });
        }
      }
    }
    return { byMethod, byDescriptor, bySemanticModel };
  }

  function controlContract(wrapper, question) {
    if (!wrapper || wrapper.dataset.inputMethod !== question.inputMethod) return false;
    if (question.inputClass === "SELECTION") return Boolean(wrapper.querySelector('[data-lab-action="select"]'));
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

  async function run({ engine, hostWindow, hostDocument, storageKey, childNameKey = "math-quest:child-name:v1", pause }) {
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
    const descriptorTypes = [...new Set(allQuestions.map((question) => question.modelDescriptor?.type))].sort();
    titles["VIS-CAPABILITIES"] = "Both answer classes and every generated input/model capability are discoverable";
    tests["VIS-CAPABILITIES"] = result(
      classes.includes("SELECTION") && classes.includes("CONSTRUCTION") && methods.length >= 2 && descriptorTypes.length >= 2,
      { classes, methods, descriptorTypes, inspected: allQuestions.length },
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
    let frame = null;
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
      frame = hostDocument.createElement("iframe");
      frame.title = "Manifest-driven visual regression Parent Test Lab";
      Object.assign(frame.style, { position: "fixed", left: "-20000px", top: "0", width: "1366px", height: "768px", opacity: "0", pointerEvents: "none" });
      frame.src = `index.html?manifest-visual-regression=${Date.now()}`;
      hostDocument.body.append(frame);
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        frame.onload = () => { clearTimeout(timer); resolve(); };
      });
      await pause();

      const labWindow = frame.contentWindow;
      const labDocument = frame.contentDocument;
      labDocument.querySelector('[data-action="grown"]')?.click();
      await pause();
      const baseline = labWindow.localStorage.getItem(storageKey);
      const storagePrototype = labWindow.Storage.prototype;
      const originalSetItem = storagePrototype.setItem;
      let writes = 0;
      storagePrototype.setItem = function (...args) {
        writes += 1;
        return originalSetItem.apply(this, args);
      };

      const change = (element) => element.dispatchEvent(new labWindow.Event("change", { bubbles: true }));
      const resize = async (width, height) => {
        frame.style.width = `${width}px`;
        frame.style.height = `${height}px`;
        labWindow.dispatchEvent(new labWindow.Event("resize"));
        await pause();
        await pause();
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
        titles["VIS-LAB-CONTROLS"] = "Parent Test Lab renders every discovered input method without writing progress";
        tests["VIS-LAB-CONTROLS"] = result(
          methodRows.length === methods.length
            && methodRows.every((row) => row.pass)
            && storageUnchanged
            && labDocument.querySelector(".lab-question")?.dataset.labMode === "isolated"
            && labDocument.querySelector(".lab-question")?.dataset.storageIntact === "true",
          { methods: methodRows, writes, bytesIdentical: labWindow.localStorage.getItem(storageKey) === baseline },
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
            const noAnswerLeak = !volume?.querySelector(".visual-number");
            variantRendered = Boolean(volume && noAnswerLeak
              && Number(volume.dataset.length) === Number(question.params.length)
              && Number(volume.dataset.width) === Number(question.params.width)
              && Number(volume.dataset.height) === Number(question.params.height));
            if (question.params.representation === "unit-cubes") {
              variantRendered &&= volume.querySelectorAll(".prism-cubes i").length === Number(question.answer.value);
            } else {
              variantRendered &&= volume.querySelectorAll(".cube-layer-grid i").length === Number(question.params.length) * Number(question.params.width);
            }
          } else if (question.skillId === "MQ-123") {
            const span = labDocument.querySelector(".clock-span");
            const labels = [...labDocument.querySelectorAll(".clock-card strong")].map((node) => normalized(node.textContent));
            variantRendered = Boolean(span?.dataset.timeFormat === question.params.format
              && labels.some((label) => label.includes(question.params.startTime))
              && labels.some((label) => label.includes(question.params.endTime)));
          }
          modelRows.push({ semanticKey, type, promptId: question.semanticPromptStringId, skillId: auditCase.skill.skillId, modelHasRenderableData: Boolean(modelHasRenderableData), rendered, variantRendered, pass: !modelHasRenderableData || rendered && variantRendered });
        }
        titles["VIS-LAB-MODELS"] = "Every semantically renderable prompt/model variant appears as derived math in Parent Test Lab";
        tests["VIS-LAB-MODELS"] = result(modelRows.every((row) => row.pass), { models: modelRows });

        const profileCases = expectedProfiles.map((profile) => ({
          profile,
          skill: engine.SKILLS.find((skill) => skill.generatorProfile === profile),
          tier: "HARD/TARGET",
          ordinal: 0,
        }));
        const desktopRows = [];
        for (const [width, height, viewport] of [
          [1366, 768, "desktop"],
          [820, 1180, "tablet"],
        ]) {
          await resize(width, height);
          for (const auditCase of profileCases) {
            if (!auditCase.skill) {
              desktopRows.push({ profile: auditCase.profile, viewport, pass: false, reason: "capability absent" });
              continue;
            }
            await selectCase(auditCase);
            const toggle = labDocument.querySelector('[data-lab-action="model"]');
            if (toggle && !toggle.disabled && /show/iu.test(toggle.textContent)) {
              toggle.click();
              await pause();
            }
            const article = labDocument.querySelector(".lab-question");
            const grade = labDocument.querySelector('[data-lab-action="grade"]');
            const answer = labDocument.querySelector(".answer-controls");
            const gradeRect = grade?.getBoundingClientRect();
            const answerRect = answer?.getBoundingClientRect();
            const noOverflow = labDocument.documentElement.scrollWidth <= labDocument.documentElement.clientWidth + 1;
            const pass = Boolean(article && gradeRect && answerRect && gradeRect.bottom <= labWindow.innerHeight + 1
              && answerRect.top < labWindow.innerHeight && noOverflow);
            desktopRows.push({
              profile: auditCase.profile,
              skillId: auditCase.skill.skillId,
              viewport,
              pass,
              gradeBottom: gradeRect && Math.round(gradeRect.bottom),
              noOverflow,
            });
          }
        }
        titles["VIS-DESKTOP-LAYOUT"] = "Every generator profile keeps Parent Test answers visible at desktop and tablet sizes";
        tests["VIS-DESKTOP-LAYOUT"] = result(desktopRows.every((row) => row.pass), {
          inspected: desktopRows.length,
          failures: desktopRows.filter((row) => !row.pass).slice(0, 10),
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
      } finally {
        storagePrototype.setItem = originalSetItem;
      }
    } catch (error) {
      for (const [id, title] of [
        ["VIS-LAB-CONTROLS", "Parent Test Lab renders every discovered input method without writing progress"],
        ["VIS-LAB-MODELS", "Every semantically renderable model type appears as derived math in Parent Test Lab"],
        ["VIS-DESKTOP-LAYOUT", "Every generator profile keeps Parent Test answers visible at desktop and tablet sizes"],
        ["VIS-MOBILE-LAYOUT", "Every manifest level is question-first, legible, and actionable at 390×844"],
      ]) {
        titles[id] ||= title;
        tests[id] ||= result(false, String(error?.stack || error?.message || error));
      }
    } finally {
      if (frame) frame.remove();
      if (originalSave === null) hostWindow.localStorage.removeItem(storageKey);
      else hostWindow.localStorage.setItem(storageKey, originalSave);
      if (originalChildName === null) hostWindow.localStorage.removeItem(childNameKey);
      else hostWindow.localStorage.setItem(childNameKey, originalChildName);
    }

    return Object.freeze({ titles: Object.freeze(titles), tests: Object.freeze(tests) });
  }

  window.MathQuestApprovedVisualRegression = Object.freeze({ run });
})();
