import { createHash } from "node:crypto";
import path from "node:path";
import { loadReleaseVersionComparison, comparableReleaseConstants, comparableReleaseState, comparableReleaseExport } from "./release-version-comparison.mjs";
import { fileURLToPath } from "node:url";
import { evaluateEngine, extractEngineFromPageBytes, loadShippedEngine } from "./engine-loader.mjs";
import { hermeticGit } from "./repository-code-map.mjs";
import { loadTutorialMetadataAuthority, tutorialMetadataComparison, tutorialMetadataMutationFailures } from "./tutorial-metadata-transition.mjs";
import { completePlacement } from "./placement-fixtures.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FRACTION_INPUTS = Object.freeze([
  null, "", " ", "0", "-0", "+0", "2", "2/1", "1/2", "+1/2", "-3/2",
  "1/-2", "-1/-2", "0/5", "1/0", "0 1/2", "1 0/2", "1 1/2", "-1 1/2",
  "1 3/2", "1 1/-2", ".5", "-.5", "+0.5", "1.", "1.20", "bad", "1 / 2",
  "01/02",
]);
const FRACTION_TARGETS = Object.freeze([
  undefined, "VALUE", "SIMPLEST", "MIXED", "IMPROPER", "DECIMAL", "CANONICAL", "UNKNOWN",
  "facts", "parse", "proper", "same", "target",
]);
const GRID_ROUTE_CASES = Object.freeze([
  Object.freeze({ label: "missing", question: null, traces: [null, []] }),
  Object.freeze({ label: "wrong-method", question: { inputMethod: "NUMBER_PAD" }, traces: [[]] }),
  Object.freeze({
    label: "string-start",
    question: { inputMethod: "GRID_ROUTE", skillId: "MQ-034", params: { start: "C4", moves: ["R", "U", "L"] } },
    traces: [null, [], ["R"], ["R", "U", "L"], ["R", "U", "L", "D"], ["X"]],
  }),
  Object.freeze({
    label: "object-start",
    question: { inputMethod: "GRID_ROUTE", skillId: "MQ-089", params: { start: { x: 2, y: 3 }, gridSize: 7, moves: ["U", "R"] } },
    traces: [[], ["U"], ["U", "R"], ["L"]],
  }),
  Object.freeze({ label: "fallback-start", question: { inputMethod: "GRID_ROUTE", params: { x: 4, y: 5, moves: [] } }, traces: [[]] }),
  Object.freeze({ label: "default-start", question: { inputMethod: "GRID_ROUTE", params: { moves: [] } }, traces: [[]] }),
  Object.freeze({ label: "invalid-move", question: { inputMethod: "GRID_ROUTE", params: { start: "B2", moves: ["X"] } }, traces: [[]] }),
  Object.freeze({ label: "invalid-start", question: { inputMethod: "GRID_ROUTE", params: { start: { x: 1.5, y: 1 }, moves: [] } }, traces: [[]] }),
  Object.freeze({ label: "planned-off-board", question: { inputMethod: "GRID_ROUTE", params: { start: "A1", moves: ["L"] } }, traces: [[]] }),
  Object.freeze({ label: "trace-off-board", question: { inputMethod: "GRID_ROUTE", params: { start: "A1", gridSize: 4, moves: ["R"] } }, traces: [[], ["L"], ["R"]] }),
  Object.freeze({ label: "nonfinite-size", question: { inputMethod: "GRID_ROUTE", params: { start: "B2", gridSize: Number.POSITIVE_INFINITY, moves: [] } }, traces: [[]] }),
]);
const STRATEGY_CASES = Object.freeze([
  Object.freeze({ label: "addition-count-on", skillId: "MQ-040", taskType: "add-by-counting-on", params: { a: 8, b: 5 }, actions: ["count-on", "unknown"] }),
  Object.freeze({ label: "addition-make-ten", skillId: "MQ-040", taskType: "add-by-making-ten", params: { a: 8, b: 5 }, actions: ["make-ten"] }),
  Object.freeze({ label: "addition-known-bond", skillId: "MQ-040", taskType: "add-by-known-bond", params: { a: 8, b: 5 }, actions: ["known-bond"] }),
  Object.freeze({ label: "addition-unknown", skillId: "MQ-040", taskType: "unknown", params: { a: 8, b: 5 }, actions: ["unknown"] }),
  Object.freeze({ label: "subtraction-count-back", skillId: "MQ-041", taskType: "subtract-by-counting-back", params: { a: 13, b: 5 }, actions: ["count-back"] }),
  Object.freeze({ label: "subtraction-count-up", skillId: "MQ-041", taskType: "subtract-by-counting-up", params: { a: 13, b: 5 }, actions: ["count-up"] }),
  Object.freeze({ label: "subtraction-known-bond", skillId: "MQ-041", taskType: "subtract-by-known-bond", params: { a: 13, b: 5 }, actions: ["known-bond"] }),
  Object.freeze({ label: "subtraction-unknown", skillId: "MQ-041", taskType: "unknown", params: { a: 13, b: 5 }, actions: ["unknown"] }),
  Object.freeze({ label: "multiply-partition", skillId: "MQ-079", ordinalCycle: 0, params: { a: 23, b: 4 }, actions: ["partition"] }),
  Object.freeze({ label: "multiply-array", skillId: "MQ-079", ordinalCycle: 1, params: { a: 23, b: 4 }, actions: ["array"] }),
  Object.freeze({ label: "multiply-written", skillId: "MQ-079", ordinalCycle: 2, params: { a: 23, b: 4 }, actions: ["written layout"] }),
  Object.freeze({ label: "multiply-invalid-operands", skillId: "MQ-079", params: { a: 3, b: 100 }, actions: ["array"] }),
  Object.freeze({ label: "mental-addition", skillId: "MQ-095", taskType: "addition", params: { a: 150, b: 23 }, actions: ["mental"] }),
  Object.freeze({ label: "mental-subtraction", skillId: "MQ-095", taskType: "subtraction", params: { a: 150, b: 23 }, actions: ["mental"] }),
  Object.freeze({ label: "written-carry", skillId: "MQ-095", taskType: "addition", params: { a: 99, b: 2 }, actions: ["written"] }),
  Object.freeze({ label: "written-regroup", skillId: "MQ-095", taskType: "subtraction", params: { a: 1000, b: 1 }, actions: ["written"] }),
  Object.freeze({ label: "general-unknown", skillId: "MQ-095", taskType: "addition", params: { a: 9, b: 4 }, actions: ["unknown"] }),
  Object.freeze({ label: "parity-different", skillId: "MQ-097", params: { expression: "2 + 3" }, actions: ["prove"] }),
  Object.freeze({ label: "parity-same", skillId: "MQ-097", params: { expression: "2 + 4" }, actions: ["prove"] }),
  Object.freeze({ label: "parity-even-factor", skillId: "MQ-097", params: { expression: "2 × 3" }, actions: ["prove"] }),
  Object.freeze({ label: "parity-odd-factors", skillId: "MQ-097", params: { expression: "3 × 5" }, actions: ["prove"] }),
  Object.freeze({ label: "parity-invalid", skillId: "MQ-097", params: { expression: "invalid" }, actions: ["prove"] }),
  Object.freeze({ label: "missing-subtrahend", skillId: "MQ-101", semanticPromptStringId: "question.missingSubtrahend", params: { whole: 12, result: 5 }, actions: ["solve"] }),
  Object.freeze({ label: "missing-part", skillId: "MQ-101", semanticPromptStringId: "question.missingPart", params: { whole: 12, part: 7 }, actions: ["solve"] }),
  Object.freeze({ label: "unknown-skill", skillId: "MQ-X", answer: { kind: "text", value: "exact" }, actions: ["unknown"] }),
]);
const QUESTION_TIERS = Object.freeze(["EASY", "HARD/TARGET"]);
const QUESTION_THEMES = Object.freeze(["ocean", "forest", "space"]);
const SEMANTIC_DISCOVERY_ORDINALS = Object.freeze(Array.from({ length: 32 }, (_, ordinal) => ordinal));
const SEMANTIC_DISCOVERY_REQUEST_COUNT = 48_384;
const SEMANTIC_GENERATED_PROMPT_COUNT = 103;
const SEMANTIC_GENERATED_PROMPT_SHA256 = "a76df68903736830ff73179ddf5ee63b65b0e27089fb41001ae807489d113de8";
const SEMANTIC_GENERATED_CORPUS_SHA256 = "8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703";
const SEMANTIC_WITNESS_COUNT = 2_304;
const SEMANTIC_WITNESS_REGISTRY_SHA256 = "f30730884cb0ea5a9b125c95534d6f1bbc238489180d89d70e0bad522993af4b";
const CHANGED_SEMANTIC_PROMPT_IDS = Object.freeze([
  "question.hiddenPart",
  "question.integerOrderList",
  "question.numberLeast",
  "question.patternUnit",
  "question.remainderInterpret",
  "question.timeReadDigital",
]);
const UNGENERATED_CHANGED_PROMPT_IDS = Object.freeze([
  "question.integerOrderList",
  "question.patternUnit",
]);
const SEMANTIC_SUPPORT_CASES = Object.freeze([
  Object.freeze({ id: "question.hiddenPart", params: { shown: 6 }, answer: 4 }),
  Object.freeze({ id: "question.integerOrderList", params: { values: [5, -2, 1] }, answer: "-2, 1, 5", answerKind: "text" }),
  Object.freeze({ id: "question.numberLeast", params: { a: 8, b: 3, c: 5 }, answer: 3 }),
  Object.freeze({ id: "question.patternUnit", params: { pattern: "red blue red blue", unit: "red blue", unitMarked: true }, answer: "red blue", answerKind: "text" }),
  Object.freeze({ id: "question.remainderInterpret", params: { interpretation: "round-up", total: 17, divisor: 5, quotient: 3, remainder: 2 }, answer: 4 }),
  Object.freeze({ id: "question.timeReadDigital", params: { hour: 9, minuteText: "05" }, answer: "9:05", answerKind: "text" }),
]);

function stableJson(value) {
  const visit = (item) => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, visit(item[key])]));
  };
  return JSON.stringify(visit(value));
}

function digest(value) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function addObservation(observations, id, value) {
  observations.push(Object.freeze({ id, sha256: digest(value) }));
}

function questionArguments(skill, tier, ordinal) {
  const representations = Array.isArray(skill.representations) ? skill.representations : [];
  return {
    skillId: skill.skillId,
    tier,
    representation: representations[0] ?? (skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT"),
    seed: 0x51f15e,
    ordinal,
  };
}

function addQuestionObservations(observations, engine, request) {
  const { skill, tier, ordinal } = request;
  const id = skill.skillId + ":" + tier + ":" + ordinal;
  const question = engine.makeQuestion(questionArguments(skill, tier, ordinal));
  addObservation(observations, "question:" + id, question);
  addObservation(observations, "contract:" + id, engine.validateQuestionContract(question));
  addObservation(observations, "support:" + id, engine.makeTeachingSupport(question));
  addObservation(observations, "tutorial:" + id, engine.makeTutorialPlan(question));
  const response = engine.createResponseState(question);
  addObservation(observations, "empty-response:" + id, response);
  addObservation(observations, "serialized-empty-response:" + id, engine.serializeResponse(question, response));
  addObservation(observations, "empty-response-complete:" + id, engine.isResponseComplete(question, response));
  addObservation(observations, "grade-null:" + id, engine.gradeAnswer(question, null));
}

function generatorRepresentations(skill) {
  const declared = Array.isArray(skill.representations) ? skill.representations : [];
  return declared.length ? declared : [skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT"];
}

function semanticWorldRequests(base) {
  return QUESTION_THEMES.flatMap((theme) => [false, true].map((capstone) => Object.freeze({
    ...base,
    theme,
    capstone,
  })));
}

function semanticOrdinalRequests(base) {
  return SEMANTIC_DISCOVERY_ORDINALS.flatMap((ordinal) => semanticWorldRequests({
    ...base,
    ordinal,
    eligibleQuestionOrdinal: ordinal,
  }));
}

function semanticDiscoveryRequestsFor(skill) {
  return QUESTION_TIERS.flatMap((tier) => generatorRepresentations(skill).flatMap(
    (representation) => semanticOrdinalRequests({
      skillId: skill.skillId,
      tier,
      representation,
      seed: 0x51f15e,
    }),
  ));
}

function semanticWitnessKey(question, request) {
  return [
    request.skillId,
    question.taskType,
    question.semanticPromptStringId,
    question.modelDescriptor?.type || "",
    request.representation,
    request.tier,
    request.capstone ? "capstone" : "ordinary",
    request.theme,
  ].join("|");
}

function semanticWitnessRegistrySha256(witnesses) {
  const registry = witnesses
    .map(({ id, request }) => ({ id, request }))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return digest(registry);
}

function semanticDiscoveryFindings(discovery) {
  const findings = [];
  if (discovery.requestCount !== SEMANTIC_DISCOVERY_REQUEST_COUNT) findings.push("immutable semantic discovery request count drifted");
  if (discovery.promptIds.length !== SEMANTIC_GENERATED_PROMPT_COUNT) findings.push("immutable generated semantic-prompt count drifted");
  if (discovery.promptSha256 !== SEMANTIC_GENERATED_PROMPT_SHA256) findings.push("immutable generated semantic-prompt registry drifted");
  if (discovery.generatedCorpusSha256 !== SEMANTIC_GENERATED_CORPUS_SHA256) findings.push("immutable generated question corpus drifted");
  if (discovery.witnesses.length !== SEMANTIC_WITNESS_COUNT) findings.push("immutable semantic witness count drifted");
  if (discovery.witnessRegistrySha256 !== SEMANTIC_WITNESS_REGISTRY_SHA256) findings.push("immutable semantic witness request registry drifted");
  if (stableJson(discovery.ungeneratedChangedPromptIds) !== stableJson(UNGENERATED_CHANGED_PROMPT_IDS)) {
    findings.push("changed semantic-prompt reachability drifted");
  }
  return Object.freeze(findings);
}

function discoverSemanticWitnesses(engine) {
  const promptIds = new Set();
  const witnesses = new Map();
  const requests = [];
  const corpusHash = createHash("sha256");
  let requestCount = 0;
  for (const skill of engine.SKILLS) {
    for (const request of semanticDiscoveryRequestsFor(skill)) {
      const question = engine.makeQuestion(request);
      requestCount += 1;
      requests.push(request);
      corpusHash.update(stableJson({ request, question }) + "\n", "utf8");
      promptIds.add(question.semanticPromptStringId);
      const key = semanticWitnessKey(question, request);
      if (!witnesses.has(key)) witnesses.set(key, Object.freeze({ id: key, request }));
    }
  }
  const sortedPromptIds = Object.freeze([...promptIds].sort());
  const selectedWitnesses = Object.freeze([...witnesses.values()]);
  const discovery = {
    requestCount,
    promptIds: sortedPromptIds,
    promptSha256: digest(sortedPromptIds),
    generatedCorpusSha256: corpusHash.digest("hex"),
    requests: Object.freeze(requests),
    witnesses: selectedWitnesses,
    witnessRegistrySha256: semanticWitnessRegistrySha256(selectedWitnesses),
    ungeneratedChangedPromptIds: Object.freeze(CHANGED_SEMANTIC_PROMPT_IDS.filter((id) => !promptIds.has(id))),
  };
  return Object.freeze({ ...discovery, findings: semanticDiscoveryFindings(discovery) });
}

function addSemanticWitnessObservations(observations, engine, witnesses) {
  for (const witness of witnesses) {
    const question = engine.makeQuestion(witness.request);
    addObservation(observations, "semantic-question:" + witness.id, question);
    addObservation(observations, "semantic-support:" + witness.id, engine.makeTeachingSupport(question));
  }
}

function addGeneratedCorpusObservations(observations, engine, requests) {
  const recordsBySkill = new Map();
  for (const request of requests) {
    if (!recordsBySkill.has(request.skillId)) recordsBySkill.set(request.skillId, []);
    recordsBySkill.get(request.skillId).push(Object.freeze({
      request,
      questionSha256: digest(engine.makeQuestion(request)),
    }));
  }
  for (const [skillId, records] of recordsBySkill) addObservation(observations, "semantic-corpus:" + skillId, records);
}

function semanticSupportQuestion(record) {
  return Object.freeze({
    skillId: "MQ-001",
    representation: "PICTORIAL",
    semanticPromptStringId: record.id,
    params: record.params,
    answer: Object.freeze({ kind: record.answerKind || "integer", value: String(record.answer), targetForm: "VALUE" }),
    options: Object.freeze([]),
  });
}

function addSemanticSupportCaseObservations(observations, engine) {
  for (const record of SEMANTIC_SUPPORT_CASES) {
    addObservation(observations, "semantic-support:case:" + record.id, engine.makeTeachingSupport(semanticSupportQuestion(record)));
  }
}

function addFractionObservations(observations, engine) {
  for (const input of FRACTION_INPUTS) {
    for (const targetForm of FRACTION_TARGETS) {
      const options = targetForm === undefined ? undefined : { targetForm };
      addObservation(
        observations,
        `fraction:${JSON.stringify(input)}:${String(targetForm)}`,
        engine.parseFraction(input, options),
      );
    }
  }
}

function addGridRouteObservations(observations, engine) {
  for (const { label, question, traces } of GRID_ROUTE_CASES) {
    addObservation(observations, `grid:specification:${label}`, engine.gridRouteSpecification(question));
    for (const moves of traces) {
      addObservation(observations, `grid:trace:${label}:${JSON.stringify(moves)}`, engine.traceGridRoute(question, moves));
    }
  }
}

function strategyQuestion(engine, record) {
  const taskCount = Math.max(1, engine.SKILL_BY_ID[record.skillId]?.constraints?.taskTypes?.length || 1);
  return {
    answer: record.answer || { kind: "number", value: "0" },
    ordinal: Number(record.ordinalCycle || 0) * taskCount,
    params: record.params || {},
    questionId: `differential-strategy-${record.label}`,
    semanticPromptStringId: record.semanticPromptStringId || "",
    skillId: record.skillId,
    taskType: record.taskType || "",
  };
}

function addStrategyObservations(observations, engine) {
  for (const record of STRATEGY_CASES) {
    const question = strategyQuestion(engine, record);
    addObservation(observations, `strategy:result:${record.label}`, engine.strategyExpectedResult(question));
    addObservation(observations, `strategy:governed:${record.label}`, engine.governedStrategy(question));
    for (const action of record.actions) {
      addObservation(observations, `strategy:work:${record.label}:${action}`, engine.strategyWorkSpecification(question, action));
    }
  }
}

function addStageObservations(observations, engine) {
  for (let level = 1; level <= 21; level += 1) {
    addObservation(observations, "stage:" + level, engine.stageForLevel(level));
  }
}

function addStateObservations(observations, engine, version) {
  for (const playDay of [0, 21_000, 24_000]) {
    const state = engine.createInitialState(playDay);
    addObservation(observations, "state:" + playDay, comparableReleaseState(state, version));
    addObservation(observations, "state-export:" + playDay, comparableReleaseExport(engine.exportState(state), version));
    addObservation(observations, "queue:" + playDay, engine.buildSessionQueue(state, { playDay, seed: 0x51f15e }));
  }
}

function addDefaultQuestionObservations(observations, engine) {
  for (const skill of engine.SKILLS) {
    for (const tier of QUESTION_TIERS) {
      for (const ordinal of [0, 1]) addQuestionObservations(observations, engine, { skill, tier, ordinal });
    }
  }
}

function addPlacementObservations(observations, engine) {
  // These boundary witnesses come from the immutable R0 curriculum.
  for (const boundary of [0, 10, 21]) {
    const questions = [];
    const run = completePlacement(engine, engine.createInitialState(22000), (question) => {
      questions.push(question);
      return question.level <= boundary;
    }, { seed: 0x706c6163, theme: "ocean" });
    addObservation(observations, "placement:" + boundary, {
      questions, run, recommendation: engine.placementRecommendation(run),
    });
  }
}

function engineObservations(engine, semanticDiscovery, version) {
  const observations = [];
  addObservation(observations, "api", Object.keys(engine).sort());
  addObservation(observations, "constants", comparableReleaseConstants(engine.CONSTANTS, version));
  addObservation(observations, "levels", engine.LEVELS);
  addObservation(observations, "skills", engine.SKILLS);
  addObservation(observations, "curriculum-hash", engine.CURRICULUM_MANIFEST_SHA256);
  addObservation(observations, "tutorial-hash", engine.TUTORIAL_MANIFEST_SHA256);
  addObservation(observations, "empty-response:null", engine.createResponseState(null));
  addObservation(observations, "serialized-empty-response:null", engine.serializeResponse(null, null));
  addObservation(observations, "empty-response-complete:null", engine.isResponseComplete(null, null));
  addFractionObservations(observations, engine);
  addGridRouteObservations(observations, engine);
  addStrategyObservations(observations, engine);
  addSemanticWitnessObservations(observations, engine, semanticDiscovery.witnesses);
  addGeneratedCorpusObservations(observations, engine, semanticDiscovery.requests);
  addSemanticSupportCaseObservations(observations, engine);
  addStageObservations(observations, engine);
  addStateObservations(observations, engine, version);
  addPlacementObservations(observations, engine);
  addDefaultQuestionObservations(observations, engine);
  return Object.freeze(observations);
}

function observationFindings(baseline, candidate) {
  const findings = [];
  if (candidate.length !== baseline.length) findings.push("candidate emitted " + candidate.length + " observations; baseline emitted " + baseline.length);
  const candidateById = new Map(candidate.map((record) => [record.id, record.sha256]));
  for (const record of baseline) {
    if (!candidateById.has(record.id)) findings.push(record.id + " is missing from candidate observations");
    else if (candidateById.get(record.id) !== record.sha256) findings.push(record.id + " differs from the immutable baseline");
  }
  const baselineIds = new Set(baseline.map((record) => record.id));
  for (const record of candidate) if (!baselineIds.has(record.id)) findings.push(record.id + " is an unexpected candidate observation");
  return findings;
}

function differentialContext(baselineEngine, tutorialAuthority, releaseVersions) {
  const discovery = discoverSemanticWitnesses(baselineEngine);
  return Object.freeze({
    discovery,
    baselineEngine,
    tutorialAuthority,
    releaseVersions,
    baseline: engineObservations(baselineEngine, discovery, releaseVersions.baseline),
  });
}

function compareCandidate(context, candidateEngine) {
  const tutorial = tutorialMetadataComparison(context.baselineEngine, candidateEngine, context.tutorialAuthority);
  const candidate = engineObservations(tutorial.engine, context.discovery, context.releaseVersions.candidate);
  const findings = [...context.discovery.findings, ...observationFindings(context.baseline, candidate)];
  return Object.freeze({
    baselineCount: context.baseline.length,
    candidateCount: candidate.length,
    discoveryRequestCount: context.discovery.requestCount,
    generatedPromptCount: context.discovery.promptIds.length,
    generatedPromptSha256: context.discovery.promptSha256,
    generatedCorpusSha256: context.discovery.generatedCorpusSha256,
    semanticWitnessCount: context.discovery.witnesses.length,
    semanticWitnessRegistrySha256: context.discovery.witnessRegistrySha256,
    semanticSupportCaseIds: Object.freeze(SEMANTIC_SUPPORT_CASES.map((record) => record.id)),
    approvedMetadataTransition: Object.freeze(tutorial.evidence),
    approvedReleaseVersionTransition: context.releaseVersions.evidence,
    findings: Object.freeze(findings),
  });
}

function differentialFindings(baselineEngine, candidateEngine, tutorialAuthority, releaseVersions) {
  return compareCandidate(differentialContext(baselineEngine, tutorialAuthority, releaseVersions), candidateEngine);
}

export function loadEngineFromGit(commit, relativePath = "index.html") {
  const pageBytes = hermeticGit(["show", commit + ":" + relativePath], {
    root,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  return evaluateEngine(extractEngineFromPageBytes(pageBytes).source, { filename: commit + ":" + relativePath });
}

export async function compareWithBaseline(commit, indexPath = path.join(root, "index.html")) {
  const baselineEngine = loadEngineFromGit(commit);
  const { engine: candidateEngine } = await loadShippedEngine(indexPath);
  return differentialFindings(baselineEngine, candidateEngine, await loadTutorialMetadataAuthority(commit), await loadReleaseVersionComparison(commit));
}

function mutationDetected(context, mutant, observationPrefix) {
  return compareCandidate(context, mutant).findings.some((finding) => finding.startsWith(observationPrefix));
}

function semanticDiscoveryMutationFailures(discovery) {
  const source = discovery.witnesses.find(({ id }) => id.startsWith("MQ-001|"));
  if (!source) return ["semantic witness-registry mutation source is missing"];
  const request = Object.freeze({ ...source.request, ordinal: 31, eligibleQuestionOrdinal: 31 });
  const witnesses = Object.freeze(discovery.witnesses.map((witness) => witness === source
    ? Object.freeze({ ...witness, request })
    : witness));
  const mutant = {
    ...discovery,
    witnesses,
    witnessRegistrySha256: semanticWitnessRegistrySha256(witnesses),
  };
  return semanticDiscoveryFindings(mutant).includes("immutable semantic witness request registry drifted")
    ? []
    : ["semantic witness-registry mutation did not reject a later-ordinal representative"];
}

function coreMutationFailures(context, engine) {
  const findings = [];
  const stageMutant = { ...engine, stageForLevel: () => "MUTATED_STAGE" };
  if (!mutationDetected(context, stageMutant, "stage:")) {
    findings.push("differential mutation did not change an observable stage result");
  }
  const fractionMutant = {
    ...engine,
    parseFraction(...argumentsList) {
      const result = engine.parseFraction(...argumentsList);
      return { ...result, valid: !result.valid };
    },
  };
  if (!mutationDetected(context, fractionMutant, "fraction:")) {
    findings.push("differential mutation did not change an observable fraction result");
  }
  const gridMutant = { ...engine, gridRouteSpecification: () => null };
  if (!mutationDetected(context, gridMutant, "grid:specification:")) {
    findings.push("differential mutation did not change an observable grid-route result");
  }
  const questionGenerationMutant = {
    ...engine,
    makeQuestion(...argumentsList) {
      const question = engine.makeQuestion(...argumentsList);
      return { ...question, questionId: "mutated-" + question.questionId };
    },
  };
  if (!mutationDetected(context, questionGenerationMutant, "semantic-question:")) {
    findings.push("differential mutation did not change an observable generated question");
  }
  let semanticSupportCalls = 0;
  const semanticSupportMutant = {
    ...engine,
    makeTeachingSupport(question) {
      const support = engine.makeTeachingSupport(question);
      if (question?.semanticPromptStringId !== "question.hiddenPart") return support;
      semanticSupportCalls += 1;
      return { ...support, values: { ...support.values, differentialMutation: "semantic-model-drift" } };
    },
  };
  const semanticDriftDetected = mutationDetected(context, semanticSupportMutant, "semantic-support:");
  if (semanticSupportCalls === 0) findings.push("differential semantic-model mutation reached no hidden-part support witness");
  else if (!semanticDriftDetected) findings.push("differential mutation did not change an observable semantic support model");
  return findings;
}

function generatorCorpusMutationFailures(context, engine) {
  let mutatedCalls = 0;
  const mutant = {
    ...engine,
    makeQuestion(...argumentsList) {
      const question = engine.makeQuestion(...argumentsList);
      const request = argumentsList[0] || {};
      if (request.ordinal !== 31 || request.theme !== "space" || request.capstone !== true) return question;
      mutatedCalls += 1;
      return { ...question, questionId: "late-mutated-" + question.questionId };
    },
  };
  const detected = mutationDetected(context, mutant, "semantic-corpus:");
  if (mutatedCalls === 0) return ["differential generator-corpus mutation reached no late-facet request"];
  return detected ? [] : ["differential generator-corpus mutation did not change an exhaustive skill digest"];
}

function strategyMutationFailures(context, engine) {
  const findings = [];
  const governedStrategyMutant = { ...engine, governedStrategy: () => null };
  if (!mutationDetected(context, governedStrategyMutant, "strategy:governed:")) {
    findings.push("differential mutation did not change an observable governed strategy");
  }
  const strategyWorkMutant = { ...engine, strategyWorkSpecification: () => null };
  if (!mutationDetected(context, strategyWorkMutant, "strategy:work:")) {
    findings.push("differential mutation did not change an observable strategy-work result");
  }
  return findings;
}

function responseMutationFailures(context, engine) {
  const findings = [];
  const responseCreationMutant = { ...engine, createResponseState: () => ({}) };
  if (!mutationDetected(context, responseCreationMutant, "empty-response:")) {
    findings.push("differential mutation did not change an observable initial response state");
  }
  const responseSerializationMutant = { ...engine, serializeResponse: () => ({}) };
  if (!mutationDetected(context, responseSerializationMutant, "serialized-empty-response:")) {
    findings.push("differential mutation did not change an observable serialized response");
  }
  const responseCompletionMutant = { ...engine, isResponseComplete: () => true };
  if (!mutationDetected(context, responseCompletionMutant, "empty-response-complete:")) {
    findings.push("differential mutation did not change an observable response-completion result");
  }
  return findings;
}

export async function differentialMutationFailures(commit) {
  const baselineEngine = loadEngineFromGit(commit);
  const { engine } = await loadShippedEngine(path.join(root, "index.html"));
  const context = differentialContext(baselineEngine, await loadTutorialMetadataAuthority(commit), await loadReleaseVersionComparison(commit));
  return Object.freeze([
    ...tutorialMetadataMutationFailures(baselineEngine, engine, context.tutorialAuthority),
    ...semanticDiscoveryMutationFailures(context.discovery),
    ...coreMutationFailures(context, engine),
    ...generatorCorpusMutationFailures(context, engine),
    ...strategyMutationFailures(context, engine),
    ...responseMutationFailures(context, engine),
    ...placementMutationFailures(context, engine),
  ]);
}

function placementMutationFailures(context, engine) {
  const mutant = { ...engine, placementRecommendation: (run) => ({
    ...engine.placementRecommendation(run), recommendedLevel: -1,
  }) };
  return mutationDetected(context, mutant, "placement:")
    ? [] : ["differential mutation did not change an observable placement recommendation"];
}
