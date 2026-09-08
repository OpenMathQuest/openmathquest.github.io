import { loadShippedEngine } from "./lib/engine-loader.mjs";
import { canonicalizeJson, loadManifest } from "./lib/curriculum-manifest.mjs";
import { buildExhaustiveResponseState } from "./lib/exhaustive-response-fixtures.mjs";
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

function correctSubmission(question) {
  if (!structuredResponseMethods.has(question.inputMethod)) return question.answer?.value;
  observedStructuredMethods.add(question.inputMethod);
  const state = buildExhaustiveResponseState(question, { engine, issue, correctStrategyBuildResponse });
  if (!state) return null;
  if (!engine.isResponseComplete(question, state)) issue(`${question.skillId}: solved ${question.inputMethod} state is not complete`);
  const payload = engine.serializeResponse(question, state);
  checkStructuredPayload(question, payload);
  checkSortMutation(question, payload);
  checkScalarBypass(question);
  return payload;
}

function checkStructuredPayload(question, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) issue(`${question.skillId}: ${question.inputMethod} did not serialize to an object payload`);
  const grade = engine.gradeAnswer(question, payload);
  if (!grade.valid || !grade.correct) issue(`${question.skillId}: correct ${question.inputMethod} payload did not self-grade`);
}

function checkSortMutation(question, payload) {
  if (question.inputMethod !== "SORT_BINS" || !payload?.placements) return;
  const incorrectGrade = engine.gradeAnswer(question, incorrectSortSubmission(question, payload));
  if (!incorrectGrade.valid || incorrectGrade.correct) {
    issue(`${question.skillId}: displaced SORT_BINS placement was not valid-but-incorrect`);
  } else if (question.skillId === "MQ-007") {
    mq007WrongSortProved = true;
  }
}

function checkScalarBypass(question) {
  const bypass = engine.gradeAnswer(question, question.answer?.value);
  if (bypass.valid || bypass.correct || bypass.reason !== "structured-response-required") issue(`${question.skillId}: ${question.inputMethod} accepted a scalar answer bypass`);
}

function forbiddenStimulusPath(value, path = "stimulus") {
  if (Array.isArray(value)) return forbiddenArrayStimulusPath(value, path);
  if (!value || typeof value !== "object") return null;
  return forbiddenObjectStimulusPath(value, path);
}

function forbiddenArrayStimulusPath(value, path) {
  for (let index = 0; index < value.length; index += 1) {
    const found = forbiddenStimulusPath(value[index], `${path}[${index}]`);
    if (found) return found;
  }
  return null;
}

function forbiddenObjectStimulusPath(value, path) {
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
  checkContractResult(question, contract);
  if (engine.canonical(contract?.errors ?? []) !== engine.canonical(errors ?? [])) issue(`${question.skillId}: contract API disagrees with questionContractErrors`);
  const descriptor = question.modelDescriptor;
  if (!validStimulusDescriptor(descriptor)) {
    issue(`${question.skillId}: missing source stimulus descriptor`);
    return;
  }
  const forbidden = forbiddenStimulusPath(descriptor.values);
  if (forbidden) issue(`${question.skillId}: source stimulus contains answer-bearing field ${forbidden}`);
  checkSampleIdentity(question, descriptor);
  checkSampleKeyMutation(question);
  checkMissingStimulusMutation(question);
}

function contractErrorDetail(contract) {
  return contract?.errors?.join(",") || "invalid result";
}

function checkContractResult(question, contract) {
  if (!contract || contract.valid !== true || !Array.isArray(contract.errors) || contract.errors.length) {
    issue(`${question.skillId}: fail-closed contract rejected generated question (${contractErrorDetail(contract)})`);
  }
}

function validStimulusDescriptor(descriptor) {
  return Boolean(descriptor && typeof descriptor.type === "string" && descriptor.type
    && descriptor.values && typeof descriptor.values === "object" && Object.keys(descriptor.values).length);
}

function checkSampleIdentity(question, descriptor) {
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
}

function checkSampleKeyMutation(question) {
  if (contractMutationMethods.has(question.inputMethod)) return;
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

function checkMissingStimulusMutation(question) {
  if (sourceStimulusMutationProved) return;
  const withoutStimulus = JSON.parse(JSON.stringify(question));
  withoutStimulus.modelDescriptor.values = {};
  const missingContract = engine.validateQuestionContract(withoutStimulus);
  if (!missingContract.valid && missingContract.errors.includes("missing-source-stimulus")) sourceStimulusMutationProved = true;
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
  if (typeof question.inputMethod !== "string" || !Object.hasOwn(reachabilityChecks, question.inputMethod)) {
    issue(`${question.skillId}: unknown input method ${question.inputMethod}`);
    return;
  }
  reachabilityChecks[question.inputMethod](question, answer);
}

function checkSelectionReachability(question) {
  if (!question.options.some((option) => correct(question, optionValue(option)))) issue(`${question.skillId}: no selectable correct option`);
}

function checkTenFrameReachability(question, answer) {
  const values = question.modelDescriptor?.type === "tenFrame" ? question.modelDescriptor.values : null;
  const target = Number(answer);
  if (!values || !Array.isArray(values.frames)) issue(`${question.skillId}: ten-frame lacks a source frame description`);
  if (!Number.isInteger(target) || target < 0 || target > 20) issue(`${question.skillId}: ten-frame target ${answer} outside reachable 0..20`);
  if (!correct(question, answer)) issue(`${question.skillId}: ten-frame target ${answer} does not self-grade`);
}

function boundedNumberLineRange(min, max, step, target) {
  return [min, max, step, target].every(Number.isFinite) && min < max && step > 0 && target >= min && target <= max;
}

function numberLineBounds(domain, answer) {
  return [rationalNumber(domain?.min), rationalNumber(domain?.max), rationalNumber(domain?.step), rationalNumber(answer)];
}

function checkNumberLineReachability(question, answer) {
  const values = question.modelDescriptor?.type === "numberLine" ? question.modelDescriptor.values : null;
  const bounds = numberLineBounds(values?.domain, answer);
  if (!values || !Array.isArray(values.points) || !values.domain) issue(`${question.skillId}: number-line lacks a source domain and points`);
  if (!boundedNumberLineRange(...bounds)) issue(`${question.skillId}: number-line domain does not bound target ${answer}`);
  if (!Array.isArray(values.jumps)) issue(`${question.skillId}: number-line jumps are not explicit`);
  if (!correct(question, answer)) issue(`${question.skillId}: number-line target ${answer} does not self-grade`);
}

function checkKeypadReachability(question, answer) {
  for (const character of answer) if (!keypadCharacters.has(character)) issue(`${question.skillId}: ${question.inputMethod} has no key for ${JSON.stringify(character)} in ${answer}`);
  if (!correct(question, answer)) issue(`${question.skillId}: ${question.inputMethod} target ${answer} does not self-grade`);
}

const reachabilityChecks = Object.freeze({
  PICTURE_CHOICE: checkSelectionReachability,
  NUMBER_CHOICE: checkSelectionReachability,
  TEN_FRAME: checkTenFrameReachability,
  NUMBER_LINE: checkNumberLineReachability,
  FRACTION_ENTRY(question, answer) {
    if (!/^-?\d+\/\d+$/u.test(answer)) issue(`${question.skillId}: FRACTION_ENTRY cannot represent ${answer}`);
  },
  MIXED_NUMBER_ENTRY(question, answer) {
    if (!/^-?\d+ \d+\/\d+$/u.test(answer)) issue(`${question.skillId}: MIXED_NUMBER_ENTRY cannot represent ${answer}`);
  },
  NUMBER_BOND: checkKeypadReachability,
  BAR_MODEL: checkKeypadReachability,
  NUMBER_PAD: checkKeypadReachability,
});

function sampleLabel({ skill, tier, representation, theme, ordinal }) {
  return [skill.skillId, tier, representation, theme, ordinal].join("/");
}

function choiceLabel({ skill, tier, representation, theme, choiceSeed, ordinal }) {
  return [skill.skillId, tier, representation, theme, choiceSeed, ordinal].join("/");
}

function makeAuditedQuestion(context) {
  const { skill, tier, representation, theme, ordinal } = context;
  try {
    return { question: engine.makeQuestion({ skillId: skill.skillId, tier, representation, theme, seed: 0x4d515631, ordinal, eligibleQuestionOrdinal: ordinal }) };
  } catch (error) {
    issue(sampleLabel(context) + ": fail-closed generation unavailable (" + (error?.code || error?.message || String(error)) + ")");
    return null;
  }
}

function recordQuestionMetadata(question) {
  generatedSkills.add(question.skillId);
  promptIds.add(question.promptStringId);
  inputMethods.add(question.inputMethod);
  answerKinds.add(question.answer?.kind);
}

function checkRequestedQuestion(question, { skill, theme, tier }) {
  if (question.skillId !== skill.skillId || question.level !== skill.level) issue(skill.skillId + ": identity or level changed");
  if (question.theme !== theme || question.tier !== tier) issue(skill.skillId + ": requested theme/tier was not retained");
}

function checkPromptRendering(question, skillId) {
  if (!records.has(question.promptStringId)) {
    issue(skillId + ": unknown prompt string " + question.promptStringId);
    return;
  }
  let rendered = null;
  try { rendered = engine.renderChildString(question.promptStringId, question.promptSlots); }
  catch (error) { issue(skillId + ": prompt rendering threw " + error.message); }
  if (rendered !== null && rendered !== question.prompt) issue(skillId + ": prompt bytes do not regenerate (" + question.promptStringId + ")");
}

function checkModelInstruction(question, skillId) {
  if (!question.modelDescriptor || !records.has(question.modelDescriptor.instructionStringId)) {
    issue(skillId + ": missing registered model instruction");
    return;
  }
  const instruction = engine.renderChildString(question.modelDescriptor.instructionStringId, { representation: question.representation });
  if (instruction !== question.modelDescriptor.instruction) issue(skillId + ": model instruction bytes do not regenerate");
}

function checkGeneratedSubmission(question, submission, skillId) {
  if (!correct(question, submission)) issue(skillId + ": generated answer fails its own grader (" + question.answer?.value + ")");
  if (question.inputClass !== engine.CONSTANTS.INPUT_CLASS_BY_METHOD[question.inputMethod]) issue(skillId + ": " + question.inputMethod + " disagrees with " + question.inputClass);
}

function checkSelectionMetadata(question, skillId) {
  const expectedCount = Number(question.optionCount);
  const approvedFiveTokenRecognition = question.skillId === "MQ-048"
    && question.semanticPromptStringId === "question.coinValue" && expectedCount === 5;
  if (!Number.isInteger(expectedCount) || expectedCount < 2 || expectedCount > 4 && !approvedFiveTokenRecognition) issue(skillId + ": invalid selection optionCount " + question.optionCount);
  if (question.options.length !== expectedCount) issue(skillId + ": selection exposes " + question.options.length + " options but declares " + expectedCount);
  return expectedCount;
}

function selectionPositions(question, groups, expectedCount) {
  const key = JSON.stringify([question.taskType, question.semanticPromptStringId, expectedCount]);
  const group = groups.get(key) ?? {
    selectionArity: expectedCount, taskType: question.taskType,
    semanticPromptStringId: question.semanticPromptStringId,
    correctPositions: Array.from({ length: expectedCount }, () => 0),
  };
  groups.set(key, group);
  return group.correctPositions;
}

function checkOptionIdentities(question, skillId) {
  const ids = new Set(question.options.map((option) => option.optionId));
  const values = new Set(question.options.map((option) => JSON.stringify(optionValue(option))));
  if (ids.size !== question.options.length || values.size !== question.options.length) issue(skillId + ": duplicate option id/value");
}

function recordCorrectOptionPosition(question, positions, skillId) {
  const correctOptions = question.options.filter((option) => correct(question, optionValue(option)));
  if (correctOptions.length !== 1) issue(skillId + ": expected exactly one correct option, saw " + correctOptions.length);
  if (question.correctIndex < 0 || question.correctIndex >= question.options.length || question.options[question.correctIndex] !== correctOptions[0]) issue(skillId + ": correctIndex does not identify the correct option");
  else positions[question.correctIndex] += 1;
}

function checkNamedOptions(question, skillId) {
  const namedCandidates = namedPromptCandidates(question);
  if (namedCandidates && JSON.stringify(question.options.map((option) => String(optionValue(option))).sort()) !== JSON.stringify([...namedCandidates].sort())) issue(skillId + ": named prompt candidates do not exactly match its options");
}

function checkOptionLabels(question, skillId) {
  for (const option of question.options) {
    const generic = engine.renderChildString("option.value", { value: optionValue(option) });
    const shape = /^[●▲■▰] [A-Z][a-z]+$/u.test(option.label);
    if (option.label !== generic && !shape) issue(skillId + ": unregistered option label " + JSON.stringify(option.label));
  }
}

function checkQuestionOptions(question, groups, skillId) {
  if (question.inputClass !== "SELECTION") {
    if (question.options.length || question.optionCount !== 0 || question.correctIndex !== -1) issue(skillId + ": construction exposes selection metadata");
    return;
  }
  const expectedCount = checkSelectionMetadata(question, skillId);
  const positions = selectionPositions(question, groups, expectedCount);
  checkOptionIdentities(question, skillId);
  recordCorrectOptionPosition(question, positions, skillId);
  checkNamedOptions(question, skillId);
  checkOptionLabels(question, skillId);
}

function auditQuestionSample(context, groups) {
  questionCount += 1;
  const generated = makeAuditedQuestion(context);
  if (!generated) return;
  const { question } = generated;
  recordQuestionMetadata(question);
  checkRequestedQuestion(question, context);
  checkPromptRendering(question, context.skill.skillId);
  checkModelInstruction(question, context.skill.skillId);
  checkQuestionContract(question);
  const submission = correctSubmission(question);
  checkGeneratedSubmission(question, submission, context.skill.skillId);
  checkQuestionOptions(question, groups, context.skill.skillId);
  checkReachability(question, submission);
  if (choiceOrdinals.includes(context.ordinal)) auditChoiceSeeds(context, false);
}

function makeAuditedChoices(args, label) {
  try { return { choices: engine.makeQuestionChoices(args) }; }
  catch (error) {
    issue(label + ": fail-closed choice generation unavailable (" + (error?.code || error?.message || String(error)) + ")");
    return null;
  }
}

function checkFirstChoice(first, base, label) {
  if (first.questionId !== base.questionId || first.prompt !== base.prompt || first.sampleKey !== base.sampleKey) {
    issue(label + ": first choice is not the requested base sample");
  }
}

function checkChoiceSelection(candidate, label) {
  if (candidate.inputClass !== "SELECTION") return;
  const correctOptions = candidate.options.filter((option) => correct(candidate, optionValue(option)));
  if (correctOptions.length !== 1 || candidate.options[candidate.correctIndex] !== correctOptions[0]) issue(label + ": selected card has no unique reachable answer");
}

function checkChoiceCandidate(candidate, label, expectedContract) {
  checkQuestionContract(candidate);
  const submission = correctSubmission(candidate);
  if (!correct(candidate, submission)) issue(label + ": choice fails its own grader");
  if (choiceContract(candidate) !== expectedContract()) issue(label + ": mastery/input contract changed");
  checkChoiceSelection(candidate, label);
  checkReachability(candidate, submission);
}

function missedChoiceAlternative(args, base, contract) {
  for (let offset = 1; offset <= 32; offset += 1) {
    const candidate = engine.makeQuestion({ ...args, ordinal: args.ordinal + offset });
    if (candidate.prompt !== base.prompt && candidate.sampleKey !== base.sampleKey && choiceContract(candidate) === contract) return true;
  }
  return false;
}

function checkChoiceDiversity(choices, { args, base, label, baseContract }) {
  if (choices.length === 2) {
    choicePairCount += 1;
    if (choices[0].prompt === choices[1].prompt) issue(label + ": two child-visible prompts are identical");
    if (choices[0].sampleKey === choices[1].sampleKey) issue(label + ": two cards share a sample key");
  } else {
    suppressedChoiceCount += 1;
    if (missedChoiceAlternative(args, base, baseContract ?? choiceContract(base))) issue(label + ": bounded search suppressed an available distinct choice");
  }
}

function auditChoiceSearch(context, compareWithBase) {
  const { skill, tier, representation, theme, choiceSeed, ordinal } = context;
  const args = { skillId: skill.skillId, tier, representation, theme, seed: choiceSeed, ordinal, eligibleQuestionOrdinal: ordinal / 2 };
  const label = choiceLabel(context);
  choiceSearchCount += 1;
  const generated = makeAuditedChoices(args, label);
  if (!generated) return;
  const { choices } = generated;
  if (!Object.isFrozen(choices) || ![1, 2].includes(choices.length)) {
    issue(label + ": choice search returned an invalid collection");
    return;
  }
  const base = engine.makeQuestion(args);
  const baseContract = compareWithBase ? choiceContract(base) : null;
  checkQuestionContract(base);
  checkFirstChoice(choices[0], base, label);
  for (const [choiceIndex, candidate] of choices.entries()) {
    checkChoiceCandidate(candidate, label + "/" + choiceIndex, () => compareWithBase ? baseContract : choiceContract(choices[0]));
  }
  checkChoiceDiversity(choices, { args, base, label, baseContract });
}

function auditChoiceSeeds(context, compareWithBase) {
  for (const choiceSeed of choiceSeeds) auditChoiceSearch({ ...context, choiceSeed }, compareWithBase);
}

function checkPositionBias(skill, { selectionArity, taskType, semanticPromptStringId, correctPositions }) {
  const sampledPositions = correctPositions.slice(0, selectionArity);
  const sampleCount = sampledPositions.reduce((sum, count) => sum + count, 0);
  const activePositions = sampledPositions.filter((count) => count > 0);
  const requiredDistinctPositions = Math.min(selectionArity, Math.max(2, Math.floor(sampleCount / selectionArity)));
  const maximumPositionShare = sampleCount > 0 ? Math.max(...sampledPositions) / sampleCount : 1;
  if (activePositions.length < requiredDistinctPositions || maximumPositionShare > 0.75) {
    issue(skill.skillId + "/" + taskType + "/" + semanticPromptStringId + ": " + selectionArity + "-option answer-position bias has " + sampleCount + " samples, " + activePositions.length + "/" + requiredDistinctPositions + " required distinct positions, " + (maximumPositionShare * 100).toFixed(2) + "% maximum share, counts " + correctPositions.join(","));
  }
}

function auditQuestionGroup(context) {
  const groups = new Map();
  for (let ordinal = 0; ordinal < ordinals; ordinal += 1) auditQuestionSample({ ...context, ordinal }, groups);
  if (choiceOrdinals.at(-1) >= ordinals) auditChoiceSeeds({ ...context, ordinal: choiceOrdinals.at(-1) }, true);
  for (const group of groups.values()) checkPositionBias(context.skill, group);
}

function auditSkill(skill) {
  for (const tier of tiers) {
    for (const representation of representations) {
      for (const theme of themes) auditQuestionGroup({ skill, tier, representation, theme });
    }
  }
}

for (const skill of engine.SKILLS) auditSkill(skill);

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
