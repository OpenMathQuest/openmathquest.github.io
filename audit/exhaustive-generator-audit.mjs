import { loadShippedEngine } from "./lib/engine-loader.mjs";
import { canonicalizeJson, loadManifest } from "./lib/curriculum-manifest.mjs";
import { correctStrategyBuildResponse } from "./tests/strategy-build-oracle.mjs";

const { engine, sha256 } = await loadShippedEngine(new URL("../index.html", import.meta.url));
const manifestArtifact = await loadManifest(new URL("../curriculum/math-quest-manifest-v1.json", import.meta.url));
const manifest = manifestArtifact.manifest;
const tiers = Object.freeze(["EASY", "HARD/TARGET"]);
const representations = Object.freeze(["CONCRETE", "PICTORIAL", "ABSTRACT"]);
const themes = Object.freeze(["ocean", "forest", "space"]);
const legacyScalarConstructionMethods = new Set([
  "TEN_FRAME", "NUMBER_BOND", "NUMBER_LINE", "BAR_MODEL", "NUMBER_PAD",
  "FRACTION_ENTRY", "MIXED_NUMBER_ENTRY",
]);
const structuredResponseMethods = new Set(Object.entries(engine.CONSTANTS.INPUT_CLASS_BY_METHOD)
  .filter(([method, inputClass]) => inputClass === "CONSTRUCTION" && !legacyScalarConstructionMethods.has(method))
  .map(([method]) => method));
const explicitResultKeys = new Set([
  "result", "answer", "correct", "correctAnswer", "pairs", "finish", "classification",
  "suitableUnit", "perimeter", "durationMinutes", "difference", "mode", "missing",
  "missingCount", "totalArea",
]);
const answerBearingRoles = new Set(["result", "target", "end", "equivalent"]);
const ATTRIBUTE_PROPERTY_TARGET = Object.freeze({
  "3 sides": "triangle",
  "4 equal sides": "square",
  "6 flat faces": "cube",
  "one curved surface and no flat faces": "sphere",
  "a right angle": "rectangle",
  "2 pairs of parallel sides and a right angle": "rectangle",
  "perpendicular sides and 2 long sides": "rectangle",
});
const ordinals = 32;
const expectedQuestions = engine.SKILLS.length * tiers.length * representations.length * themes.length * ordinals;
const choiceSeeds = Object.freeze([0x4d515631, 1831565813]);
const choiceOrdinals = Object.freeze([0, 4, 8, 12, 16, 20, 24, 28, 32]);
const expectedChoiceSearches = engine.SKILLS.length * tiers.length * representations.length * themes.length * choiceSeeds.length * choiceOrdinals.length;
const records = new Map(engine.CHILD_STRINGS.map((record) => [record.id, record]));
const keypadKeys = records.get("ui.keypadKey")?.slots?.key ?? [];
const keypadCharacters = new Set(keypadKeys.flatMap((key) => key === "Clear" || key === "⌫" ? [] : key === "−" ? ["−", "-"] : [key]));
const issues = new Set();
const promptIds = new Set();
const inputMethods = new Set();
const answerKinds = new Set();
const generatedSkills = new Set();
const observedStructuredMethods = new Set();
const sampleIdentities = new Map();
const contractMutationMethods = new Set();
let sourceStimulusMutationProved = false;
let mq007WrongSortProved = false;
let questionCount = 0;
let choiceSearchCount = 0;
let choicePairCount = 0;
let suppressedChoiceCount = 0;

function issue(message) {
  if (issues.size < 500) issues.add(message);
}

function optionValue(option) {
  return option && Object.hasOwn(option, "value") ? option.value : option?.optionId;
}

function correct(engineQuestion, value) {
  try { return engine.gradeAnswer(engineQuestion, value).correct === true; }
  catch { return false; }
}

function rationalNumber(value) {
  const parsed = engine.parseRational(value);
  return parsed ? Number(parsed.n) / Number(parsed.d) : Number.NaN;
}

function normalizedAttributeToken(value) {
  return String(value ?? "").normalize("NFC").trim().toLowerCase();
}

function attributeItemMatchesRule(item, rule) {
  const attribute = normalizedAttributeToken(rule?.attribute);
  const value = normalizedAttributeToken(rule?.value);
  if (attribute === "shape") return normalizedAttributeToken(item?.shape) === value;
  if (attribute === "solid") return normalizedAttributeToken(item?.solid) === value;
  if (attribute === "property") {
    const target = ATTRIBUTE_PROPERTY_TARGET[value];
    return Boolean(target)
      && [item?.shape, item?.solid].some((candidate) => normalizedAttributeToken(candidate) === target);
  }
  return false;
}

function sortCategoryId(item, rule, categories) {
  const attribute = String(rule?.attribute ?? "").trim();
  const itemValue = normalizedAttributeToken(item?.[attribute]);
  const category = categories.find((candidate) => {
    const values = [candidate?.value, candidate?.id].map(normalizedAttributeToken);
    return itemValue.length > 0 && values.includes(itemValue);
  });
  return category?.id === undefined ? null : String(category.id);
}

function sortPlacementsFromDescriptor(question) {
  const values = question.modelDescriptor?.values ?? {};
  const items = Array.isArray(values.items) ? values.items : [];
  const categories = Array.isArray(values.categories) ? values.categories : [];
  if (categories.length) {
    return Object.fromEntries(items.map((item, index) => [
      `i${index}`,
      sortCategoryId(item, values.rule, categories) ?? "",
    ]));
  }
  return Object.fromEntries(items.map((item, index) => [
    `i${index}`,
    attributeItemMatchesRule(item, values.rule) ? "matches" : "other",
  ]));
}

function incorrectSortSubmission(question, payload) {
  const categories = Array.isArray(question.modelDescriptor?.values?.categories)
    ? question.modelDescriptor.values.categories
    : [];
  const categoryIds = categories.map((category) => String(category.id));
  const placements = Object.fromEntries(Object.entries(payload.placements).map(([itemId, bin]) => {
    if (categoryIds.length >= 2) {
      const current = categoryIds.indexOf(String(bin));
      return [itemId, categoryIds[(current + 1 + categoryIds.length) % categoryIds.length]];
    }
    return [itemId, bin === "matches" ? "other" : "matches"];
  }));
  return { ...payload, placements };
}

function correctStructuredState(question) {
  const state = engine.createResponseState(question);
  const p = question.params ?? {};
  const answer = String(question.answer?.value ?? "");
  const count = Number(question.answer?.value);
  switch (question.inputMethod) {
    case "COUNT_TOUCH":
      state.touched = Array.from({ length: count }, (_, index) => `i${index}`);
      state.count = answer;
      break;
    case "ORDER_BUILD":
      state.order = [Number(p.before), count, Number(p.after)];
      break;
    case "PLACE_VALUE_BUILD":
      state.action = question.semanticPromptStringId === "question.renamePlace"
        ? "trade"
        : question.semanticPromptStringId === "question.scalePlace"
          ? "shift"
          : ["question.addition", "question.appliedAddition", "question.subtraction", "question.appliedSubtraction"].includes(question.semanticPromptStringId)
            ? "partition"
            : "build";
      state.value = answer;
      break;
    case "STRATEGY_BUILD": {
      const response = correctStrategyBuildResponse(
        question,
        question.skillId === "MQ-095" ? "mental" : null,
      );
      state.strategy = response.strategy;
      state.work = [...response.work];
      state.value = response.value;
      break;
    }
    case "COIN_BUILD": {
      const coinCount = Number(answer);
      const coinValue = coinCount > 0 ? Number(p.amount) / coinCount : Number.NaN;
      state.coins = Array.from({ length: coinCount }, () => coinValue);
      break;
    }
    case "SYMMETRY_BUILD":
      state.lines = Array.isArray(p.requiredLineIds)
        ? [...p.requiredLineIds]
        : Array.from({ length: count }, (_, index) => `line${index + 1}`);
      break;
    case "EXPRESSION_BUILD":
      state.rule = String(p.rule);
      state.value = answer;
      break;
    case "PAIR_LINK": {
      const pairs = Math.min(Number(p.leftCount ?? p.count), Number(p.rightCount ?? p.count));
      state.links = Array.from({ length: pairs }, (_, index) => [`a${index}`, `b${index}`]);
      state.pending = null;
      if (Object.hasOwn(state, "relation")) state.relation = String(question.answer.value);
      break;
    }
    case "SORT_BINS": {
      state.placements = sortPlacementsFromDescriptor(question);
      state.pending = null;
      break;
    }
    case "SHARE_DEAL": {
      const groups = Number(p.recipients);
      const perGroup = Math.floor(Number(p.total) / groups);
      const items = Array.from({ length: Number(p.total) }, (_, index) => `item${index}`);
      state.recipients = Object.fromEntries(Array.from({ length: groups }, (_, index) => [
        `r${index + 1}`,
        items.slice(index * perGroup, (index + 1) * perGroup),
      ]));
      state.pool = items.slice(groups * perGroup);
      state.history = items.slice(0, groups * perGroup).map((item) => {
        const destination = Object.entries(state.recipients).find(([, placed]) => placed.includes(item))?.[0];
        return [destination, item];
      });
      break;
    }
    case "GROUP_BUILD": {
      const groups = Number(p.groups ?? p.a);
      const perGroup = Number(p.perGroup ?? p.b);
      const items = Array.from({ length: groups * perGroup }, (_, index) => `item${index}`);
      state.recipients = Object.fromEntries(Array.from({ length: groups }, (_, index) => [
        `g${index + 1}`,
        items.slice(index * perGroup, (index + 1) * perGroup),
      ]));
      state.pool = [];
      state.history = items.map((item) => {
        const destination = Object.entries(state.recipients).find(([, placed]) => placed.includes(item))?.[0];
        return [destination, item];
      });
      break;
    }
    case "BOND_SPLIT": {
      const whole = Number(p.whole);
      let first = Number(p.part);
      let second = count;
      if (question.semanticPromptStringId === "question.secondPartition") {
        const original = [Number(p.firstA), Number(p.firstB)].sort((left, right) => left - right);
        first = Array.from({ length: Math.max(0, whole - 1) }, (_, index) => index + 1)
          .find((candidate) => {
            const proposal = [candidate, whole - candidate].sort((left, right) => left - right);
            return candidate > 0 && whole - candidate > 0 && engine.canonical(proposal) !== engine.canonical(original);
          });
        if (!Number.isInteger(first)) {
          issue(`${question.skillId}: no distinct second partition fixture is reachable`);
          return null;
        }
        second = whole - first;
      }
      const items = Array.from({ length: whole }, (_, index) => `item${index}`);
      state.groups = { g1: items.slice(0, first), g2: items.slice(first, first + second) };
      state.pool = [];
      state.history = items.map((item) => [state.groups.g1.includes(item) ? "g1" : "g2", item]);
      break;
    }
    case "PATTERN_BUILD":
      state.tokens = answer.trim().split(/\s+/u).filter(Boolean);
      break;
    case "LANDMARK_PLACE":
      state.relation = answer;
      break;
    case "SLOT_COMPOSER": {
      const operation = /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "\u2212" : "+";
      state.slots = [String(p.a), operation, String(p.b), "=", answer];
      state.actions = [];
      break;
    }
    case "FACT_FAMILY": {
      const a = Number(p.a), b = Number(p.b), whole = Number(p.whole);
      state.selected = p.equationFamily === "multiply-divide"
        ? [`${a}\u00d7${b}=${whole}`, `${b}\u00d7${a}=${whole}`, `${whole}\u00f7${a}=${b}`, `${whole}\u00f7${b}=${a}`]
        : [`${a}+${b}=${whole}`, `${b}+${a}=${whole}`, `${whole}\u2212${a}=${b}`, `${whole}\u2212${b}=${a}`];
      break;
    }
    case "GRAPH_BUILD": {
      const keys = ["circles", "triangles", "cats", "dogs", "birds", "first", "second", "symbols"];
      state.categories = Object.fromEntries(keys.filter((key) => Number.isFinite(Number(p[key]))).map((key) => [key, Number(p[key])]));
      if (question.semanticPromptStringId === "question.surveyResponseList") state.interpretation = answer;
      if (question.semanticPromptStringId === "question.scaledSurveyPlan") state.scale = answer;
      break;
    }
    case "FRACTION_PARTITION": {
      const value = engine.parseRational(answer);
      const denominator = Number(state.denominator);
      const shadedCount = value ? Math.abs(Number(value.n)) * denominator / Number(value.d) : Number.NaN;
      if (!Number.isInteger(shadedCount)) {
        issue(`${question.skillId}: fraction partition fixture is unreachable`);
        return null;
      }
      state.templateId = denominator === 2 ? "radial" : "vertical";
      state.shaded = Array.from({ length: shadedCount }, (_, index) => `part${index}`);
      break;
    }
    case "GRID_ROUTE": {
      state.moves = Array.isArray(p.moves) ? [...p.moves] : [];
      const trace = engine.traceGridRoute(question, state.moves);
      if (!trace) {
        issue(`${question.skillId}: grid route cannot be traced from its displayed start`);
        return null;
      }
      state.end = { ...trace.end };
      break;
    }
    case "CLOCK_READ": {
      const match = answer.match(/^(\d+):(\d{2})$/u);
      state.hour = match?.[1] ?? "";
      state.minute = match?.[2] ?? "";
      break;
    }
    case "METRIC_SCALE":
      state.value = answer;
      break;
    case "ANGLE_MEASURE":
      state.degrees = answer;
      break;
    case "ACTION_SCENE":
      state.value = answer;
      state.actions = Array.from(
        { length: Math.abs(Number(p.b) || 0) },
        () => /subtraction|leaving/iu.test(question.semanticPromptStringId) ? "remove" : "join",
      );
      break;
    case "MEASURE_OBJECT":
      state.value = answer;
      state.actions = Array.from({ length: Number(p.count) }, () => "place-unit");
      break;
    case "AREA_DECOMPOSE":
      state.cutIds = ["cut1"];
      state.part0 = String(Number(p.l1) * Number(p.w1));
      state.part1 = String(Number(p.l2) * Number(p.w2));
      state.total = answer;
      break;
    case "VOLUME_INSPECT":
      state.viewedLayers = Array.from({ length: Number(p.height) }, (_, index) => index + 1);
      state.method = String(p.method);
      state.value = answer;
      break;
    default:
      issue(`${question.skillId}: audit lacks a structured response fixture for ${question.inputMethod}`);
      return null;
  }
  return state;
}

function correctSubmission(question) {
  if (!structuredResponseMethods.has(question.inputMethod)) return question.answer?.value;
  observedStructuredMethods.add(question.inputMethod);
  const state = correctStructuredState(question);
  if (!state) return null;
  if (!engine.isResponseComplete(question, state)) issue(`${question.skillId}: solved ${question.inputMethod} state is not complete`);
  const payload = engine.serializeResponse(question, state);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) issue(`${question.skillId}: ${question.inputMethod} did not serialize to an object payload`);
  const grade = engine.gradeAnswer(question, payload);
  if (!grade.valid || !grade.correct) issue(`${question.skillId}: correct ${question.inputMethod} payload did not self-grade`);
  if (question.inputMethod === "SORT_BINS" && payload?.placements) {
    const incorrectGrade = engine.gradeAnswer(question, incorrectSortSubmission(question, payload));
    if (!incorrectGrade.valid || incorrectGrade.correct) {
      issue(`${question.skillId}: displaced SORT_BINS placement was not valid-but-incorrect`);
    } else if (question.skillId === "MQ-007") {
      mq007WrongSortProved = true;
    }
  }
  const bypass = engine.gradeAnswer(question, question.answer?.value);
  if (bypass.valid || bypass.correct || bypass.reason !== "structured-response-required") issue(`${question.skillId}: ${question.inputMethod} accepted a scalar answer bypass`);
  return payload;
}

function forbiddenStimulusPath(value, path = "stimulus") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenStimulusPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (explicitResultKeys.has(key)) return `${path}.${key}`;
    if (key === "role" && answerBearingRoles.has(String(child))) return `${path}.role=${child}`;
    const found = forbiddenStimulusPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function checkQuestionContract(question) {
  if (typeof engine.validateQuestionContract !== "function" || typeof engine.questionContractErrors !== "function") {
    issue("engine does not expose the fail-closed question contract API");
    return;
  }
  const contract = engine.validateQuestionContract(question);
  const errors = engine.questionContractErrors(question);
  if (!contract || contract.valid !== true || !Array.isArray(contract.errors) || contract.errors.length) {
    issue(`${question.skillId}: fail-closed contract rejected generated question (${contract?.errors?.join(",") || "invalid result"})`);
  }
  if (engine.canonical(contract?.errors ?? []) !== engine.canonical(errors ?? [])) issue(`${question.skillId}: contract API disagrees with questionContractErrors`);
  const descriptor = question.modelDescriptor;
  if (!descriptor || typeof descriptor.type !== "string" || !descriptor.type || !descriptor.values || typeof descriptor.values !== "object" || !Object.keys(descriptor.values).length) {
    issue(`${question.skillId}: missing source stimulus descriptor`);
    return;
  }
  const forbidden = forbiddenStimulusPath(descriptor.values);
  if (forbidden) issue(`${question.skillId}: source stimulus contains answer-bearing field ${forbidden}`);
  const expectedIdentity = engine.canonical({
    taskType: question.taskType,
    representation: question.representation,
    inputMethod: question.inputMethod,
    params: question.params,
    stimulus: { type: descriptor.type, values: descriptor.values },
    answer: question.answer,
  });
  if (!String(question.sampleKey).includes(`|${engine.CONSTANTS.SAMPLE_KEY_VERSION}|`) || !String(question.sampleKey).endsWith(expectedIdentity)) {
    issue(`${question.skillId}: sample key does not include exact stimulus and answer identity`);
  }
  const priorIdentity = sampleIdentities.get(question.sampleKey);
  if (priorIdentity !== undefined && priorIdentity !== expectedIdentity) issue(`${question.skillId}: sample key aliases different stimulus/answer identities`);
  else sampleIdentities.set(question.sampleKey, expectedIdentity);
  if (!contractMutationMethods.has(question.inputMethod)) {
    contractMutationMethods.add(question.inputMethod);
    const mutated = JSON.parse(JSON.stringify(question));
    mutated.sampleKey += "|tampered";
    const mutatedContract = engine.validateQuestionContract(mutated);
    if (mutatedContract.valid || !mutatedContract.errors.includes("sample-identity")) issue(`${question.skillId}: sample-identity mutation escaped the fail-closed contract`);
    const payload = structuredResponseMethods.has(question.inputMethod) ? correctSubmission(question) : question.answer.value;
    const attempt = engine.submitAnswer(mutated, payload, {
      promptFinishedAt: 1_000,
      submittedAt: 5_000,
      manipulationMs: 0,
      replayMs: 0,
      idleMs: 0,
      selectionEvents: [],
      hintUsed: false,
      modelUsed: false,
      sessionId: "exhaustive-contract-mutation",
      playDay: 30_000,
    });
    if (attempt.evidenceClass !== "NON_EVIDENCE") issue(`${question.skillId}: invalid contract produced evidentiary attempt`);
  }
  if (!sourceStimulusMutationProved) {
    const withoutStimulus = JSON.parse(JSON.stringify(question));
    withoutStimulus.modelDescriptor.values = {};
    const missingContract = engine.validateQuestionContract(withoutStimulus);
    if (!missingContract.valid && missingContract.errors.includes("missing-source-stimulus")) sourceStimulusMutationProved = true;
  }
}

function namedPromptCandidates(question) {
  if (question.semanticPromptStringId === "question.moneyCompare") return [question.params.c1, question.params.c2].map(String);
  if (question.semanticPromptStringId === "question.numberOrder") return [question.params.a, question.params.b, question.params.c].map(String);
  return null;
}

function engineSkillProjection(skill) {
  return {
    id: skill.skillId ?? skill.id,
    level: skill.level,
    band: skill.band,
    strand: skill.strand,
    title: skill.title ?? skill.name,
    objective: skill.objective,
    masteryRole: skill.masteryRole ?? skill.classification,
    prerequisites: skill.prerequisites,
    phases: skill.phases,
    representation: skill.representation,
    family: skill.family,
    generatorProfile: skill.generatorProfile,
    constraints: skill.constraints,
    rationaleId: skill.rationaleId,
    benchmarkIds: skill.benchmarkIds,
    assessment: skill.raw?.assessment ?? skill.assessment,
  };
}

if (engine.CURRICULUM_MANIFEST_SHA256 !== manifestArtifact.sha256) {
  issue(`engine manifest SHA-256 ${engine.CURRICULUM_MANIFEST_SHA256 ?? "(missing)"} != ${manifestArtifact.sha256}`);
}
if (engine.CURRICULUM_MANIFEST?.manifestId !== manifest.manifestId) {
  issue(`engine manifest id ${engine.CURRICULUM_MANIFEST?.manifestId ?? "(missing)"} != ${manifest.manifestId}`);
}
if (engine.CURRICULUM_MANIFEST?.version !== manifest.version) {
  issue(`engine manifest version ${engine.CURRICULUM_MANIFEST?.version ?? "(missing)"} != ${manifest.version}`);
}
try {
  if (canonicalizeJson(engine.CURRICULUM_MANIFEST) !== manifestArtifact.canonical) {
    issue("engine embedded manifest differs from the canonical shipped manifest");
  }
} catch (error) {
  issue(`engine embedded manifest is not canonicalizable: ${error.message}`);
}
if (engine.SKILLS.length !== manifest.skills.length) {
  issue(`engine skill count ${engine.SKILLS.length} != manifest skill count ${manifest.skills.length}`);
} else {
  for (let index = 0; index < manifest.skills.length; index += 1) {
    try {
      if (canonicalizeJson(engineSkillProjection(engine.SKILLS[index])) !== canonicalizeJson(manifest.skills[index])) {
        issue(`${manifest.skills[index].id}: engine skill fields differ from manifest`);
      }
    } catch (error) {
      issue(`${manifest.skills[index].id}: engine skill fields are incomplete (${error.message})`);
    }
  }
}

function choiceContract(question) {
  return JSON.stringify([
    question.skillId, question.taskType, question.tier, question.representation, question.applied, question.inputClass, question.inputMethod,
    question.answer?.kind, question.answer?.targetForm, question.semanticPromptStringId, question.modelDescriptor?.type,
  ]);
}

function checkReachability(question, structuredSubmission) {
  const answer = String(question.answer?.value ?? "");
  if (structuredResponseMethods.has(question.inputMethod)) {
    if (structuredSubmission === undefined) correctSubmission(question);
    return;
  }
  switch (question.inputMethod) {
    case "PICTURE_CHOICE":
    case "NUMBER_CHOICE":
      if (!question.options.some((option) => correct(question, optionValue(option)))) issue(`${question.skillId}: no selectable correct option`);
      break;
    case "TEN_FRAME": {
      const values = question.modelDescriptor?.type === "tenFrame" ? question.modelDescriptor.values : null;
      const target = Number(answer);
      if (!values || !Array.isArray(values.frames)) issue(`${question.skillId}: ten-frame lacks a source frame description`);
      if (!Number.isInteger(target) || target < 0 || target > 20) issue(`${question.skillId}: ten-frame target ${answer} outside reachable 0..20`);
      if (!correct(question, answer)) issue(`${question.skillId}: ten-frame target ${answer} does not self-grade`);
      break;
    }
    case "NUMBER_LINE": {
      const values = question.modelDescriptor?.type === "numberLine" ? question.modelDescriptor.values : null;
      const domain = values?.domain;
      const min = rationalNumber(domain?.min);
      const max = rationalNumber(domain?.max);
      const step = rationalNumber(domain?.step);
      const target = rationalNumber(answer);
      if (!values || !Array.isArray(values.points) || !values.domain) issue(`${question.skillId}: number-line lacks a source domain and points`);
      if (![min, max, step, target].every(Number.isFinite) || min >= max || step <= 0 || target < min || target > max) issue(`${question.skillId}: number-line domain does not bound target ${answer}`);
      if (!Array.isArray(values.jumps)) issue(`${question.skillId}: number-line jumps are not explicit`);
      if (!correct(question, answer)) issue(`${question.skillId}: number-line target ${answer} does not self-grade`);
      break;
    }
    case "FRACTION_ENTRY":
      if (!/^-?\d+\/\d+$/u.test(answer)) issue(`${question.skillId}: FRACTION_ENTRY cannot represent ${answer}`);
      break;
    case "MIXED_NUMBER_ENTRY":
      if (!/^-?\d+ \d+\/\d+$/u.test(answer)) issue(`${question.skillId}: MIXED_NUMBER_ENTRY cannot represent ${answer}`);
      break;
    case "NUMBER_BOND":
    case "BAR_MODEL":
    case "NUMBER_PAD":
      for (const character of answer) if (!keypadCharacters.has(character)) issue(`${question.skillId}: ${question.inputMethod} has no key for ${JSON.stringify(character)} in ${answer}`);
      if (!correct(question, answer)) issue(`${question.skillId}: ${question.inputMethod} target ${answer} does not self-grade`);
      break;
    default:
      issue(`${question.skillId}: unknown input method ${question.inputMethod}`);
  }
}

for (const skill of engine.SKILLS) {
  for (const tier of tiers) {
    for (const representation of representations) {
      for (const theme of themes) {
        const correctPositionGroups = new Map();
        for (let ordinal = 0; ordinal < ordinals; ordinal += 1) {
          questionCount += 1;
          let question;
          try {
            question = engine.makeQuestion({
              skillId: skill.skillId,
              tier,
              representation,
              theme,
              seed: 0x4d515631,
              ordinal,
              eligibleQuestionOrdinal: ordinal,
            });
          } catch (error) {
            issue(`${skill.skillId}/${tier}/${representation}/${theme}/${ordinal}: fail-closed generation unavailable (${error?.code || error?.message || String(error)})`);
            continue;
          }
          generatedSkills.add(question.skillId);
          promptIds.add(question.promptStringId);
          inputMethods.add(question.inputMethod);
          answerKinds.add(question.answer?.kind);
          if (question.skillId !== skill.skillId || question.level !== skill.level) issue(`${skill.skillId}: identity or level changed`);
          if (question.theme !== theme || question.tier !== tier) issue(`${skill.skillId}: requested theme/tier was not retained`);
          if (!records.has(question.promptStringId)) issue(`${skill.skillId}: unknown prompt string ${question.promptStringId}`);
          else {
            let rendered = null;
            try { rendered = engine.renderChildString(question.promptStringId, question.promptSlots); }
            catch (error) { issue(`${skill.skillId}: prompt rendering threw ${error.message}`); }
            if (rendered !== null && rendered !== question.prompt) issue(`${skill.skillId}: prompt bytes do not regenerate (${question.promptStringId})`);
          }
          if (!question.modelDescriptor || !records.has(question.modelDescriptor.instructionStringId)) issue(`${skill.skillId}: missing registered model instruction`);
          else {
            const instruction = engine.renderChildString(question.modelDescriptor.instructionStringId, { representation: question.representation });
            if (instruction !== question.modelDescriptor.instruction) issue(`${skill.skillId}: model instruction bytes do not regenerate`);
          }
          checkQuestionContract(question);
          const submission = correctSubmission(question);
          if (!correct(question, submission)) issue(`${skill.skillId}: generated answer fails its own grader (${question.answer?.value})`);
          if (question.inputClass !== engine.CONSTANTS.INPUT_CLASS_BY_METHOD[question.inputMethod]) issue(`${skill.skillId}: ${question.inputMethod} disagrees with ${question.inputClass}`);

          if (question.inputClass === "SELECTION") {
            const expectedCount = Number(question.optionCount);
            const approvedFiveTokenRecognition = question.skillId === "MQ-048"
              && question.semanticPromptStringId === "question.coinValue"
              && expectedCount === 5;
            if (!Number.isInteger(expectedCount) || expectedCount < 2 || expectedCount > 4 && !approvedFiveTokenRecognition) issue(`${skill.skillId}: invalid selection optionCount ${question.optionCount}`);
            if (question.options.length !== expectedCount) issue(`${skill.skillId}: selection exposes ${question.options.length} options but declares ${expectedCount}`);
            const positionGroupKey = JSON.stringify([question.taskType, question.semanticPromptStringId, expectedCount]);
            const positionGroup = correctPositionGroups.get(positionGroupKey) ?? {
              selectionArity: expectedCount,
              taskType: question.taskType,
              semanticPromptStringId: question.semanticPromptStringId,
              correctPositions: Array.from({ length: expectedCount }, () => 0),
            };
            correctPositionGroups.set(positionGroupKey, positionGroup);
            const correctPositions = positionGroup.correctPositions;
            const ids = new Set(question.options.map((option) => option.optionId));
            const values = new Set(question.options.map((option) => JSON.stringify(optionValue(option))));
            if (ids.size !== question.options.length || values.size !== question.options.length) issue(`${skill.skillId}: duplicate option id/value`);
            const correctOptions = question.options.filter((option) => correct(question, optionValue(option)));
            if (correctOptions.length !== 1) issue(`${skill.skillId}: expected exactly one correct option, saw ${correctOptions.length}`);
            if (question.correctIndex < 0 || question.correctIndex >= question.options.length || question.options[question.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}: correctIndex does not identify the correct option`);
            else correctPositions[question.correctIndex] += 1;
            const namedCandidates = namedPromptCandidates(question);
            if (namedCandidates && JSON.stringify(question.options.map((option) => String(optionValue(option))).sort()) !== JSON.stringify([...namedCandidates].sort())) issue(`${skill.skillId}: named prompt candidates do not exactly match its options`);
            for (const option of question.options) {
              const generic = engine.renderChildString("option.value", { value: optionValue(option) });
              const shape = /^[●▲■▰] [A-Z][a-z]+$/u.test(option.label);
              if (option.label !== generic && !shape) issue(`${skill.skillId}: unregistered option label ${JSON.stringify(option.label)}`);
            }
          } else if (question.options.length || question.optionCount !== 0 || question.correctIndex !== -1) issue(`${skill.skillId}: construction exposes selection metadata`);

          checkReachability(question, submission);

          if (choiceOrdinals.includes(ordinal)) {
            for (const choiceSeed of choiceSeeds) {
              const args = { skillId: skill.skillId, tier, representation, theme, seed: choiceSeed, ordinal, eligibleQuestionOrdinal: ordinal / 2 };
              choiceSearchCount += 1;
              let choices;
              try {
                choices = engine.makeQuestionChoices(args);
              } catch (error) {
                issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: fail-closed choice generation unavailable (${error?.code || error?.message || String(error)})`);
                continue;
              }
              if (!Object.isFrozen(choices) || ![1, 2].includes(choices.length)) {
                issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: choice search returned an invalid collection`);
                continue;
              }
              const base = engine.makeQuestion(args);
              checkQuestionContract(base);
              if (choices[0].questionId !== base.questionId || choices[0].prompt !== base.prompt || choices[0].sampleKey !== base.sampleKey) {
                issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: first choice is not the requested base sample`);
              }
              for (const [choiceIndex, candidate] of choices.entries()) {
                checkQuestionContract(candidate);
                const candidateSubmission = correctSubmission(candidate);
                if (!correct(candidate, candidateSubmission)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: choice fails its own grader`);
                if (choiceContract(candidate) !== choiceContract(choices[0])) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: mastery/input contract changed`);
                if (candidate.inputClass === "SELECTION") {
                  const correctOptions = candidate.options.filter((option) => correct(candidate, optionValue(option)));
                  if (correctOptions.length !== 1 || candidate.options[candidate.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: selected card has no unique reachable answer`);
                }
                checkReachability(candidate, candidateSubmission);
              }
              if (choices.length === 2) {
                choicePairCount += 1;
                if (choices[0].prompt === choices[1].prompt) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two child-visible prompts are identical`);
                if (choices[0].sampleKey === choices[1].sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two cards share a sample key`);
              } else {
                suppressedChoiceCount += 1;
                const contract = choiceContract(base);
                let missedAlternative = false;
                for (let offset = 1; offset <= 32; offset += 1) {
                  const candidate = engine.makeQuestion({ ...args, ordinal: ordinal + offset });
                  if (candidate.prompt !== base.prompt && candidate.sampleKey !== base.sampleKey && choiceContract(candidate) === contract) { missedAlternative = true; break; }
                }
                if (missedAlternative) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: bounded search suppressed an available distinct choice`);
              }
            }
          }
        }
        if (choiceOrdinals.at(-1) >= ordinals) {
          const ordinal = choiceOrdinals.at(-1);
          for (const choiceSeed of choiceSeeds) {
            const args = { skillId: skill.skillId, tier, representation, theme, seed: choiceSeed, ordinal, eligibleQuestionOrdinal: ordinal / 2 };
            choiceSearchCount += 1;
            let choices;
            try {
              choices = engine.makeQuestionChoices(args);
            } catch (error) {
              issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: fail-closed choice generation unavailable (${error?.code || error?.message || String(error)})`);
              continue;
            }
            if (!Object.isFrozen(choices) || ![1, 2].includes(choices.length)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: choice search returned an invalid collection`);
            else {
              const base = engine.makeQuestion(args), contract = choiceContract(base);
              checkQuestionContract(base);
              if (choices[0].questionId !== base.questionId || choices[0].prompt !== base.prompt || choices[0].sampleKey !== base.sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: first choice is not the requested base sample`);
              for (const [choiceIndex, candidate] of choices.entries()) {
                checkQuestionContract(candidate);
                const candidateSubmission = correctSubmission(candidate);
                if (!correct(candidate, candidateSubmission)) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: choice fails its own grader`);
                if (choiceContract(candidate) !== contract) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: mastery/input contract changed`);
                if (candidate.inputClass === "SELECTION") {
                  const correctOptions = candidate.options.filter((option) => correct(candidate, optionValue(option)));
                  if (correctOptions.length !== 1 || candidate.options[candidate.correctIndex] !== correctOptions[0]) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}/${choiceIndex}: selected card has no unique reachable answer`);
                }
                checkReachability(candidate, candidateSubmission);
              }
              if (choices.length === 2) {
                choicePairCount += 1;
                if (choices[0].prompt === choices[1].prompt) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two child-visible prompts are identical`);
                if (choices[0].sampleKey === choices[1].sampleKey) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: two cards share a sample key`);
              } else {
                suppressedChoiceCount += 1;
                let missedAlternative = false;
                for (let offset = 1; offset <= 32; offset += 1) {
                  const candidate = engine.makeQuestion({ ...args, ordinal: ordinal + offset });
                  if (candidate.prompt !== base.prompt && candidate.sampleKey !== base.sampleKey && choiceContract(candidate) === contract) { missedAlternative = true; break; }
                }
                if (missedAlternative) issue(`${skill.skillId}/${tier}/${representation}/${theme}/${choiceSeed}/${ordinal}: bounded search suppressed an available distinct choice`);
              }
            }
          }
        }
        for (const { selectionArity, taskType, semanticPromptStringId, correctPositions } of correctPositionGroups.values()) {
          const sampledPositions = correctPositions.slice(0, selectionArity);
          const sampleCount = sampledPositions.reduce((sum, count) => sum + count, 0);
          const activePositions = sampledPositions.filter((count) => count > 0);
          const requiredDistinctPositions = Math.min(selectionArity, Math.max(2, Math.floor(sampleCount / selectionArity)));
          const maximumPositionShare = sampleCount > 0 ? Math.max(...sampledPositions) / sampleCount : 1;
          if (activePositions.length < requiredDistinctPositions || maximumPositionShare > 0.75) {
            issue(`${skill.skillId}/${taskType}/${semanticPromptStringId}: ${selectionArity}-option answer-position bias has ${sampleCount} samples, ${activePositions.length}/${requiredDistinctPositions} required distinct positions, ${(maximumPositionShare * 100).toFixed(2)}% maximum share, counts ${correctPositions.join(",")}`);
          }
        }
      }
    }
  }
}

if (questionCount !== expectedQuestions) issue(`question count ${questionCount} != ${expectedQuestions}`);
if (choiceSearchCount !== expectedChoiceSearches) issue(`choice search count ${choiceSearchCount} != ${expectedChoiceSearches}`);
if (generatedSkills.size !== engine.SKILLS.length) issue(`generated ${generatedSkills.size}/${engine.SKILLS.length} skills`);
if (!sourceStimulusMutationProved) issue("missing-source-stimulus mutation was not rejected by the fail-closed contract");
if (!mq007WrongSortProved) issue("MQ-007 displaced sort placement was not rejected");
for (const method of structuredResponseMethods) {
  if (!observedStructuredMethods.has(method)) issue(`structured response method ${method} was not reached by the exhaustive corpus`);
}

const report = {
  status: issues.size ? "FAIL" : "PASS",
  engineSha256: sha256,
  manifestId: manifest.manifestId,
  manifestVersion: manifest.version,
  manifestSha256: manifestArtifact.sha256,
  questions: questionCount,
  choiceSearches: choiceSearchCount,
  choicePairs: choicePairCount,
  suppressedChoices: suppressedChoiceCount,
  skills: generatedSkills.size,
  promptIds: [...promptIds].sort(),
  inputMethods: [...inputMethods].sort(),
  structuredMethods: [...observedStructuredMethods].sort(),
  expectedStructuredMethods: [...structuredResponseMethods].sort(),
  answerKinds: [...answerKinds].sort(),
  issues: [...issues],
};

const output = process.argv.includes("--summary")
  ? {
      status: report.status,
      engineSha256: report.engineSha256,
      manifestId: report.manifestId,
      manifestVersion: report.manifestVersion,
      manifestSha256: report.manifestSha256,
      questions: report.questions,
      choiceSearches: report.choiceSearches,
      choicePairs: report.choicePairs,
      suppressedChoices: report.suppressedChoices,
      skills: report.skills,
      structuredMethods: report.structuredMethods,
      expectedStructuredMethods: report.expectedStructuredMethods,
      issueCount: report.issues.length,
      issues: report.issues.slice(0, 20),
    }
  : report;
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (issues.size) process.exitCode = 1;
