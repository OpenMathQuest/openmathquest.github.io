import { createHash } from "node:crypto";

export function deepUxCanonicalValue(value) {
  if (Array.isArray(value)) return `[${value.map(deepUxCanonicalValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${deepUxCanonicalValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : deepUxCanonicalValue(value)).digest("hex");
}

function bucket(value, bounds) {
  const number = Number(value) || 0;
  const index = bounds.findIndex((bound) => number <= bound);
  return index < 0 ? `${bounds.at(-1) + 1}+` : index === 0 ? `0-${bounds[0]}` : `${bounds[index - 1] + 1}-${bounds[index]}`;
}

function walkModel(value, depth = 0, stats = { nodes: 0, arrayItems: 0, depth: 0, textLength: 0, denominators: [] }) {
  stats.nodes += 1;
  stats.depth = Math.max(stats.depth, depth);
  if (Array.isArray(value)) {
    stats.arrayItems += value.length;
    value.forEach((item) => walkModel(item, depth + 1, stats));
    return stats;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/denominator|\bdenom\b/iu.test(key) && Number.isFinite(Number(item))) stats.denominators.push(Math.abs(Number(item)));
      walkModel(item, depth + 1, stats);
    }
    return stats;
  }
  if (typeof value === "string") stats.textLength += value.length;
  return stats;
}

function maximumNumericWidth(value) {
  const matches = deepUxCanonicalValue(value).match(/-?\d+(?:\.\d+)?/gu) || [];
  return matches.reduce((maximum, item) => Math.max(maximum, item.replace(/[^0-9]/gu, "").length), 0);
}

function optionText(option) {
  return deepUxCanonicalValue({ label: option?.label, value: option?.value, visual: option?.visual, descriptor: option?.modelDescriptor });
}

function questionNumericWidth(question, options) {
  return maximumNumericWidth({
    prompt: question?.prompt,
    params: question?.params,
    answer: question?.answer,
    options,
    model: question?.modelDescriptor,
  });

}

function questionRiskMetrics(question) {
  const modelStats = walkModel(question?.modelDescriptor ?? {});
  const options = Array.isArray(question?.options) ? question.options : [];
  const promptLength = String(question?.prompt ?? "").length;
  const maximumOptionLength = options.reduce((maximum, option) => Math.max(maximum, optionText(option).length), 0);
  const numericWidth = questionNumericWidth(question, options);
  const maximumDenominator = modelStats.denominators.reduce((maximum, item) => Math.max(maximum, item), 0);
  const riskScore = promptLength * 2
    + maximumOptionLength
    + options.length * 30
    + numericWidth * 24
    + modelStats.nodes * 2
    + modelStats.arrayItems * 4
    + modelStats.depth * 18
    + modelStats.textLength
    + maximumDenominator * 8;
  return Object.freeze({
    promptLength,
    maximumOptionLength,
    optionCount: options.length,
    maximumNumericWidth: numericWidth,
    modelNodeCount: modelStats.nodes,
    modelArrayItems: modelStats.arrayItems,
    modelDepth: modelStats.depth,
    modelTextLength: modelStats.textLength,
    maximumDenominator,
    riskScore,
  });
}

function questionRiskSignature(question, metrics = questionRiskMetrics(question)) {
  return [
    question?.inputClass,
    question?.inputMethod,
    question?.modelDescriptor?.type || "none",
    bucket(metrics.promptLength, [32, 64, 96, 128, 180]),
    bucket(metrics.maximumOptionLength, [24, 48, 80, 120, 180]),
    bucket(metrics.optionCount, [0, 2, 4, 6, 8]),
    bucket(metrics.maximumNumericWidth, [0, 1, 2, 3, 4, 6]),
    bucket(metrics.modelArrayItems, [0, 4, 8, 12, 20, 40]),
    bucket(metrics.modelDepth, [1, 2, 3, 4, 6]),
    bucket(metrics.maximumDenominator, [0, 2, 3, 4, 6, 8, 12]),
  ].map((item) => String(item ?? "")).join("|");
}

function scenarioFromQuestion(question, metrics, signature) {
  const stable = {
    signature,
    skillId: question.skillId,
    level: question.level,
    tier: question.tier,
    representation: question.representation,
    theme: question.theme,
    ordinal: question.ordinal,
    inputClass: question.inputClass,
    inputMethod: question.inputMethod,
    taskType: question.taskType,
    semanticPromptStringId: question.semanticPromptStringId,
    modelType: question.modelDescriptor?.type || "none",
    sampleKey: question.sampleKey,
    metrics,
  };
  return Object.freeze({ scenarioId: `DUX-${sha256(stable).slice(0, 16)}`, ...stable });
}

function preferCandidate(current, candidate) {
  if (!current) return candidate;
  if (candidate.metrics.riskScore !== current.metrics.riskScore) {
    return candidate.metrics.riskScore > current.metrics.riskScore ? candidate : current;
  }
  return deepUxCanonicalValue(candidate) < deepUxCanonicalValue(current) ? candidate : current;
}

function collectVariantQuestions(engine, skill, { tier, representation, theme, seed, ordinals }, census) {
  const { representatives, requiredWitnesses } = census;
  for (let ordinal = 0; ordinal < ordinals; ordinal += 1) {
    const question = engine.makeQuestion({
      skillId: skill.skillId,
      tier,
      representation,
      theme,
      seed: seed,
      ordinal,
      eligibleQuestionOrdinal: ordinal,
      scheduledReview: false,
      coldTest: false,
      preview: true,
      scaffolded: true,
    });
    census.sourceQuestionCount += 1;
    const metrics = questionRiskMetrics(question);
    const signature = questionRiskSignature(question, metrics);
    const scenario = scenarioFromQuestion(question, metrics, signature);
    representatives.set(signature, preferCandidate(representatives.get(signature), scenario));
    for (const witnessKey of [
      `skill-tier|${skill.skillId}|${tier}`,
      `method-representation-theme|${question.inputMethod}|${representation}|${theme}`,
      `model-representation|${question.modelDescriptor?.type || "none"}|${representation}`,
    ]) {
      requiredWitnesses.set(witnessKey, preferCandidate(requiredWitnesses.get(witnessKey), scenario));
    }
  }
}

function collectSkillQuestions(engine, skill, options, census) {
  for (const tier of options.tiers) {
    for (const representation of options.representations) {
      for (const theme of options.themes) {
        collectVariantQuestions(engine, skill, { tier, representation, theme, seed: options.seed, ordinals: options.ordinals }, census);
      }
    }
  }
}

export function collectDeepUxRepresentatives(engine, options) {
  const census = { representatives: new Map(), requiredWitnesses: new Map(), sourceQuestionCount: 0 };
  for (const skill of engine.SKILLS) collectSkillQuestions(engine, skill, options, census);
  return census;
}
