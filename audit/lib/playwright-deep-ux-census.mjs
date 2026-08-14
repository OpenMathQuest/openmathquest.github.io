import { createHash } from "node:crypto";

export const DEEP_UX_CENSUS_SCHEMA_VERSION = 1;
export const DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION = 1;
export const DEEP_UX_CENSUS_POLICY_ID = "math-quest-playwright-deep-ux-census-v1";
export const DEEP_UX_CENSUS_REPORT_ID = "math-quest-playwright-deep-ux-census-report-v1";
export const DEEP_UX_CENSUS_PLANNER_VERSION = "deep-ux-layout-risk-v1";
export const DEEP_UX_CENSUS_SEED = 1297175628;
export const DEEP_UX_CENSUS_ORDINALS = 32;
export const DEEP_UX_NATIVE_ACTION_TIMEOUT_MS = 10_000;
export const DEEP_UX_CENSUS_TIERS = Object.freeze(["EASY", "HARD/TARGET"]);
export const DEEP_UX_CENSUS_REPRESENTATIONS = Object.freeze(["CONCRETE", "PICTORIAL", "ABSTRACT"]);
export const DEEP_UX_CENSUS_THEMES = Object.freeze(["ocean", "forest", "space"]);
export const DEEP_UX_CENSUS_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "phone-portrait", width: 390, height: 844, touch: true, mobile: true, deviceScaleFactor: 3 }),
  Object.freeze({ id: "phone-landscape", width: 844, height: 390, touch: true, mobile: true, deviceScaleFactor: 3 }),
  Object.freeze({ id: "tablet-portrait", width: 820, height: 1180, touch: true, mobile: true, deviceScaleFactor: 2 }),
  Object.freeze({ id: "tablet-landscape", width: 1024, height: 768, touch: true, mobile: true, deviceScaleFactor: 2 }),
  Object.freeze({ id: "large-tablet-landscape", width: 1180, height: 820, touch: true, mobile: true, deviceScaleFactor: 2 }),
  Object.freeze({ id: "desktop", width: 1366, height: 768, touch: false, mobile: false, deviceScaleFactor: 1 }),
]);
export const DEEP_UX_CENSUS_STATES = Object.freeze([
  "INITIAL",
  "PARTIAL_RESPONSE",
  "EXPECTED_REVEALED",
  "TEACHING_MODEL_WHEN_AVAILABLE",
]);
export const DEEP_UX_BETA_CADENCE = Object.freeze({
  firstRequiredBetaOrdinal: 4,
  modulus: 2,
  remainder: 0,
});

const CLOSED_PLAN_KEYS = Object.freeze([
  "schemaVersion", "policyId", "plannerVersion", "engineSha256", "curriculumSha256",
  "release", "seed", "sourceQuestionCount", "riskSignatureCount", "scenarioCount",
  "viewportCount", "fullCellCount", "executionMode", "requestedCellLimit", "planSha256",
  "viewports", "states", "scenarios", "cells",
]);
const CLOSED_SCENARIO_KEYS = Object.freeze([
  "scenarioId", "signature", "skillId", "level", "tier", "representation", "theme", "ordinal",
  "inputClass", "inputMethod", "taskType", "semanticPromptStringId", "modelType", "sampleKey", "metrics",
]);
const CLOSED_METRIC_KEYS = Object.freeze([
  "promptLength", "maximumOptionLength", "optionCount", "maximumNumericWidth", "modelNodeCount",
  "modelArrayItems", "modelDepth", "modelTextLength", "maximumDenominator", "riskScore",
]);
const CLOSED_CELL_KEYS = Object.freeze(["cellId", "scenarioId", "viewportId"]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function closedKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
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
  const matches = canonical(value).match(/-?\d+(?:\.\d+)?/gu) || [];
  return matches.reduce((maximum, item) => Math.max(maximum, item.replace(/[^0-9]/gu, "").length), 0);
}

function optionText(option) {
  return canonical({ label: option?.label, value: option?.value, visual: option?.visual, descriptor: option?.modelDescriptor });
}

export function questionRiskMetrics(question) {
  const modelStats = walkModel(question?.modelDescriptor ?? {});
  const options = Array.isArray(question?.options) ? question.options : [];
  const promptLength = String(question?.prompt ?? "").length;
  const maximumOptionLength = options.reduce((maximum, option) => Math.max(maximum, optionText(option).length), 0);
  const numericWidth = maximumNumericWidth({
    prompt: question?.prompt,
    params: question?.params,
    answer: question?.answer,
    options,
    model: question?.modelDescriptor,
  });
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

export function questionRiskSignature(question, metrics = questionRiskMetrics(question)) {
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
  return canonical(candidate) < canonical(current) ? candidate : current;
}

function betaOrdinal(version) {
  const match = String(version || "").match(/^\d+\.\d+\.\d+-beta\.(0|[1-9]\d*)$/u);
  return match ? Number(match[1]) : null;
}

export function deepUxCensusRequiredForVersion(version) {
  const ordinal = betaOrdinal(version);
  return Number.isInteger(ordinal)
    && ordinal >= DEEP_UX_BETA_CADENCE.firstRequiredBetaOrdinal
    && ordinal % DEEP_UX_BETA_CADENCE.modulus === DEEP_UX_BETA_CADENCE.remainder;
}

export function deepUxFirstScreenResponseRequired(scenario, viewportId) {
  return viewportId !== "phone-landscape" || Number(scenario?.level) <= 7;
}

export function deepUxNativeScrollDelta(box, viewportHeight) {
  const height = Number(viewportHeight);
  if (!box || ![box.y, box.height, height].every(Number.isFinite) || box.height <= 0 || height <= 0) return null;
  const margin = Math.min(16, Math.max(4, Math.floor(height * 0.03)));
  if (box.height > height - margin * 2) return null;
  const topGap = box.y - margin;
  const bottomGap = box.y + box.height - (height - margin);
  if (topGap < 0) return -Math.min(Math.max(48, -topGap), Math.floor(height * 0.45));
  if (bottomGap > 0) return Math.min(Math.max(48, bottomGap), Math.floor(height * 0.45));
  return 0;
}

export function deepUxPartialResponseControlPriority(control) {
  if (!control || control.disabled === true) return -1;
  if (control.ariaPressed === "false") return 3;
  if (control.ariaPressed === null || control.ariaPressed === undefined || control.ariaPressed === "") return 2;
  if (control.ariaPressed === "true") return 1;
  return -1;
}

export async function deepUxActivateNativeControl(locator, page, { preserveScroll = false, trial = false } = {}) {
  if (!locator || typeof locator.tap !== "function" || typeof locator.click !== "function" || !page || typeof page.evaluate !== "function") {
    throw new TypeError("A Playwright locator and page are required for a Deep UX native action.");
  }
  const options = preserveScroll
    ? { scroll: "none", trial, timeout: DEEP_UX_NATIVE_ACTION_TIMEOUT_MS }
    : { trial, timeout: DEEP_UX_NATIVE_ACTION_TIMEOUT_MS };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap(options);
  else await locator.click(options);
}

export async function deepUxEffectBoundRerenderAction(action, observeEffect) {
  if (typeof action !== "function" || typeof observeEffect !== "function") {
    throw new TypeError("Deep UX rerender action and effect observer are required.");
  }
  if (await observeEffect()) {
    throw new Error("Deep UX rerender postcondition was already true before the action.");
  }
  let actionError = null;
  try {
    await action();
  } catch (error) {
    actionError = error;
  }
  if (!await observeEffect()) {
    if (actionError) throw actionError;
    throw new Error("Deep UX rerender action did not produce its exact postcondition.");
  }
  if (actionError && actionError?.name !== "TimeoutError") throw actionError;
  return Object.freeze({ effectObserved: true, actionCompleted: actionError === null });
}

function balancedCellSample(cells, limit) {
  if (limit === null || limit === undefined || limit >= cells.length) return cells;
  const byViewport = new Map(DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => [viewport.id, []]));
  for (const cell of cells) byViewport.get(cell.viewportId)?.push(cell);
  const selected = [];
  for (let row = 0; selected.length < limit; row += 1) {
    let added = false;
    for (const viewport of DEEP_UX_CENSUS_VIEWPORTS) {
      const cell = byViewport.get(viewport.id)?.[row];
      if (cell && selected.length < limit) {
        selected.push(cell);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}

export function buildDeepUxCensusPlan(engine, {
  engineSha256,
  executionMode = "FULL",
  requestedCellLimit = null,
} = {}) {
  if (!engine || !Array.isArray(engine.SKILLS) || typeof engine.makeQuestion !== "function") {
    throw new Error("The shipped Math Quest engine is required to build the Deep UX Census plan.");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(engineSha256 || ""))) throw new Error("The exact engine SHA-256 is required.");
  if (!new Set(["FULL", "BENCHMARK"]).has(executionMode)) throw new Error("Deep UX execution mode must be FULL or BENCHMARK.");
  if (executionMode === "BENCHMARK" && requestedCellLimit !== 100) {
    throw new Error("Benchmark mode requires exactly 100 cells.");
  }

  const representatives = new Map();
  const requiredWitnesses = new Map();
  let sourceQuestionCount = 0;
  for (const skill of engine.SKILLS) {
    for (const tier of DEEP_UX_CENSUS_TIERS) {
      for (const representation of DEEP_UX_CENSUS_REPRESENTATIONS) {
        for (const theme of DEEP_UX_CENSUS_THEMES) {
          for (let ordinal = 0; ordinal < DEEP_UX_CENSUS_ORDINALS; ordinal += 1) {
            const question = engine.makeQuestion({
              skillId: skill.skillId,
              tier,
              representation,
              theme,
              seed: DEEP_UX_CENSUS_SEED,
              ordinal,
              eligibleQuestionOrdinal: ordinal,
              scheduledReview: false,
              coldTest: false,
              preview: true,
              scaffolded: true,
            });
            sourceQuestionCount += 1;
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
      }
    }
  }

  const expectedSourceCount = engine.SKILLS.length
    * DEEP_UX_CENSUS_TIERS.length
    * DEEP_UX_CENSUS_REPRESENTATIONS.length
    * DEEP_UX_CENSUS_THEMES.length
    * DEEP_UX_CENSUS_ORDINALS;
  if (sourceQuestionCount !== expectedSourceCount) throw new Error("Deep UX source-question census is incomplete.");
  const scenarioMap = new Map();
  for (const scenario of [...representatives.values(), ...requiredWitnesses.values()]) scenarioMap.set(scenario.scenarioId, scenario);
  const scenarios = [...scenarioMap.values()].sort((left, right) => canonical(left).localeCompare(canonical(right), "en"));
  const allCells = scenarios.flatMap((scenario) => DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => Object.freeze({
    cellId: `${scenario.scenarioId}@${viewport.id}`,
    scenarioId: scenario.scenarioId,
    viewportId: viewport.id,
  })));
  const cells = balancedCellSample(allCells, executionMode === "BENCHMARK" ? requestedCellLimit : null);
  const body = {
    schemaVersion: DEEP_UX_CENSUS_SCHEMA_VERSION,
    policyId: DEEP_UX_CENSUS_POLICY_ID,
    plannerVersion: DEEP_UX_CENSUS_PLANNER_VERSION,
    engineSha256,
    curriculumSha256: engine.CURRICULUM_MANIFEST_SHA256,
    release: engine.CONSTANTS.PRODUCT_VERSION,
    seed: DEEP_UX_CENSUS_SEED,
    sourceQuestionCount,
    riskSignatureCount: representatives.size,
    scenarioCount: scenarios.length,
    viewportCount: DEEP_UX_CENSUS_VIEWPORTS.length,
    fullCellCount: allCells.length,
    executionMode,
    requestedCellLimit: executionMode === "BENCHMARK" ? requestedCellLimit : null,
    viewports: DEEP_UX_CENSUS_VIEWPORTS,
    states: DEEP_UX_CENSUS_STATES,
    scenarios,
    cells,
  };
  return Object.freeze({ ...body, planSha256: sha256(body) });
}

export function validateDeepUxCensusPlan(plan) {
  const issues = [];
  if (!closedKeys(plan, CLOSED_PLAN_KEYS)) issues.push("plan keys are not closed");
  if (plan?.schemaVersion !== DEEP_UX_CENSUS_SCHEMA_VERSION) issues.push("schemaVersion is invalid");
  if (plan?.policyId !== DEEP_UX_CENSUS_POLICY_ID) issues.push("policyId is invalid");
  if (plan?.plannerVersion !== DEEP_UX_CENSUS_PLANNER_VERSION) issues.push("plannerVersion is invalid");
  if (!/^[a-f0-9]{64}$/u.test(String(plan?.engineSha256 || ""))) issues.push("engine SHA-256 is invalid");
  if (!/^[a-f0-9]{64}$/u.test(String(plan?.curriculumSha256 || ""))) issues.push("curriculum SHA-256 is invalid");
  if (!Array.isArray(plan?.viewports) || canonical(plan.viewports) !== canonical(DEEP_UX_CENSUS_VIEWPORTS)) issues.push("viewport matrix is invalid");
  if (!Array.isArray(plan?.states) || canonical(plan.states) !== canonical(DEEP_UX_CENSUS_STATES)) issues.push("state matrix is invalid");
  if (!Array.isArray(plan?.scenarios) || plan.scenarios.some((item) => !closedKeys(item, CLOSED_SCENARIO_KEYS) || !closedKeys(item.metrics, CLOSED_METRIC_KEYS))) issues.push("scenario set is invalid");
  if (!Array.isArray(plan?.cells) || plan.cells.some((item) => !closedKeys(item, CLOSED_CELL_KEYS))) issues.push("cell set is invalid");
  if (new Set(plan?.scenarios?.map((item) => item.scenarioId)).size !== plan?.scenarios?.length) issues.push("scenario IDs are duplicated");
  if (new Set(plan?.cells?.map((item) => item.cellId)).size !== plan?.cells?.length) issues.push("cell IDs are duplicated");
  const scenarioIds = new Set(plan?.scenarios?.map((item) => item.scenarioId));
  const viewportIds = new Set(DEEP_UX_CENSUS_VIEWPORTS.map((item) => item.id));
  if (plan?.cells?.some((item) => !scenarioIds.has(item.scenarioId) || !viewportIds.has(item.viewportId))) issues.push("cell references are invalid");
  if (plan?.sourceQuestionCount !== 72_576) issues.push("source question count must be exactly 72,576");
  if (plan?.scenarioCount !== plan?.scenarios?.length) issues.push("scenario count is inconsistent");
  if (plan?.viewportCount !== DEEP_UX_CENSUS_VIEWPORTS.length) issues.push("viewport count is inconsistent");
  if (plan?.fullCellCount !== plan?.scenarioCount * plan?.viewportCount) issues.push("full cell count is inconsistent");
  if (plan?.executionMode === "FULL" && plan?.cells?.length !== plan?.fullCellCount) issues.push("full mode omitted cells");
  if (plan?.executionMode === "BENCHMARK" && plan?.cells?.length !== plan?.requestedCellLimit) issues.push("benchmark cell limit is inconsistent");
  if (!new Set(["FULL", "BENCHMARK"]).has(plan?.executionMode)) issues.push("execution mode is invalid");
  const { planSha256, ...body } = plan || {};
  if (planSha256 !== sha256(body)) issues.push("plan SHA-256 is invalid");
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function canonicalDeepUxJson(value) {
  return `${canonical(value)}\n`;
}

const REPORT_KEYS = Object.freeze([
  "schemaVersion", "contractId", "generatedAt", "status", "mode", "candidate", "cadence",
  "plan", "toolchain", "privacy", "execution", "anomalies",
]);
const REPORT_CANDIDATE_KEYS = Object.freeze([
  "release", "commitSha", "engineSha256", "curriculumSha256", "serverRootId", "servedPayloadSha256",
]);
const REPORT_CADENCE_KEYS = Object.freeze([
  "firstRequiredBetaOrdinal", "interval", "requiredForRelease", "satisfied",
]);
const REPORT_PLAN_KEYS = Object.freeze([
  "plannerVersion", "planSha256", "seed", "sourceQuestionCount", "riskSignatureCount", "scenarioCount",
  "viewportCount", "fullCellCount", "selectedCellCount", "states",
]);
const REPORT_TOOLCHAIN_KEYS = Object.freeze([
  "runnerPackage", "runnerVersion", "browserProduct", "browserVersion", "browserExecutableSha256",
]);
const REPORT_PRIVACY_KEYS = Object.freeze([
  "usesSyntheticStateOnly", "includesChildName", "includesChildProgress", "includesPassScreenshots",
  "includesPassTraces", "failureArtifactsSyntheticOnly", "failureArtifactsUploadedOnFailure",
]);
const REPORT_EXECUTION_KEYS = Object.freeze([
  "expectedCells", "actualCells", "passedCells", "failedCells", "skippedCells", "unknownCells",
  "duplicateCells", "expectedCellSetSha256", "executedCellSetSha256", "durationMs", "projectCounts",
]);
const REPORT_PROJECT_KEYS = Object.freeze(["projectId", "expected", "actual", "passed", "failed"]);
const REPORT_ANOMALY_KEYS = Object.freeze([
  "cellId", "scenarioId", "viewportId", "skillId", "tier", "representation", "theme", "ordinal",
  "state", "code", "message", "screenshotFile", "ariaFile", "geometryFile",
]);

const hex64 = (value) => /^[a-f0-9]{64}$/u.test(String(value || ""));
const commitOrNull = (value) => value === null || /^[a-f0-9]{40}$/u.test(String(value || ""));

export function deepUxCensusReportFindings(report, {
  expectedPlan = null,
  expectedExecutableSha256 = null,
  expectedRootId = null,
  expectedServedPayloadSha256 = null,
} = {}) {
  const findings = [];
  if (!closedKeys(report, REPORT_KEYS)) return ["report must use the exact closed schema"];
  if (report.schemaVersion !== DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION
      || report.contractId !== DEEP_UX_CENSUS_REPORT_ID
      || !Number.isFinite(Date.parse(report.generatedAt))) findings.push("report identity or timestamp is invalid");
  if (!new Set(["FULL", "BENCHMARK"]).has(report.mode)) findings.push("report mode is invalid");
  if (!closedKeys(report.candidate, REPORT_CANDIDATE_KEYS)
      || !/^\d+\.\d+\.\d+-beta\.\d+$/u.test(String(report.candidate?.release || ""))
      || !commitOrNull(report.candidate?.commitSha)
      || !hex64(report.candidate?.engineSha256)
      || !hex64(report.candidate?.curriculumSha256)
      || !hex64(report.candidate?.serverRootId)
      || !hex64(report.candidate?.servedPayloadSha256)) findings.push("candidate identity is invalid");
  if (!closedKeys(report.cadence, REPORT_CADENCE_KEYS)
      || report.cadence.firstRequiredBetaOrdinal !== DEEP_UX_BETA_CADENCE.firstRequiredBetaOrdinal
      || report.cadence.interval !== DEEP_UX_BETA_CADENCE.modulus
      || report.cadence.requiredForRelease !== deepUxCensusRequiredForVersion(report.candidate?.release)
      || typeof report.cadence.satisfied !== "boolean") findings.push("cadence declaration is invalid");
  if (!closedKeys(report.plan, REPORT_PLAN_KEYS)
      || report.plan.plannerVersion !== DEEP_UX_CENSUS_PLANNER_VERSION
      || !hex64(report.plan.planSha256)
      || report.plan.seed !== DEEP_UX_CENSUS_SEED
      || report.plan.sourceQuestionCount !== 72_576
      || report.plan.viewportCount !== DEEP_UX_CENSUS_VIEWPORTS.length
      || !Array.isArray(report.plan.states)
      || canonical(report.plan.states) !== canonical(DEEP_UX_CENSUS_STATES)
      || !Number.isInteger(report.plan.selectedCellCount)
      || report.plan.selectedCellCount < 1) findings.push("plan summary is invalid");
  if (!closedKeys(report.toolchain, REPORT_TOOLCHAIN_KEYS)
      || report.toolchain.runnerPackage !== "@playwright/test"
      || report.toolchain.runnerVersion !== "1.62.1"
      || report.toolchain.browserProduct !== "Microsoft Edge"
      || !/^\d+\.\d+\.\d+\.\d+$/u.test(String(report.toolchain.browserVersion || ""))
      || !hex64(report.toolchain.browserExecutableSha256)) findings.push("toolchain identity is invalid");
  if (!closedKeys(report.privacy, REPORT_PRIVACY_KEYS)
      || report.privacy.usesSyntheticStateOnly !== true
      || report.privacy.failureArtifactsSyntheticOnly !== true
      || report.privacy.failureArtifactsUploadedOnFailure !== true
      || [report.privacy.includesChildName, report.privacy.includesChildProgress, report.privacy.includesPassScreenshots, report.privacy.includesPassTraces].some((value) => value !== false)) {
    findings.push("privacy declaration is invalid");
  }
  if (!closedKeys(report.execution, REPORT_EXECUTION_KEYS)
      || !Array.isArray(report.execution?.projectCounts)
      || report.execution.projectCounts.length !== DEEP_UX_CENSUS_VIEWPORTS.length
      || report.execution.projectCounts.some((row) => !closedKeys(row, REPORT_PROJECT_KEYS))
      || !hex64(report.execution.expectedCellSetSha256)
      || !hex64(report.execution.executedCellSetSha256)
      || !Number.isFinite(report.execution.durationMs)
      || report.execution.durationMs < 0) findings.push("execution summary is invalid");
  if (!Array.isArray(report.anomalies)
      || report.anomalies.some((row) => !closedKeys(row, REPORT_ANOMALY_KEYS)
        || !/^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.webp$/u.test(String(row.screenshotFile || ""))
        || !/^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.aria\.txt$/u.test(String(row.ariaFile || ""))
        || !/^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.geometry\.json$/u.test(String(row.geometryFile || "")))) findings.push("anomaly set or required anomaly evidence is invalid");

  const e = report.execution || {};
  const projectTotals = (e.projectCounts || []).reduce((total, row) => ({
    expected: total.expected + row.expected,
    actual: total.actual + row.actual,
    passed: total.passed + row.passed,
    failed: total.failed + row.failed,
  }), { expected: 0, actual: 0, passed: 0, failed: 0 });
  if (projectTotals.expected !== e.expectedCells
      || projectTotals.actual !== e.actualCells
      || projectTotals.passed !== e.passedCells
      || projectTotals.failed !== e.failedCells
      || e.actualCells !== e.passedCells + e.failedCells + e.skippedCells
      || e.expectedCells !== report.plan?.selectedCellCount) findings.push("execution counts are inconsistent");
  const clean = e.expectedCells === e.actualCells
    && e.passedCells === e.expectedCells
    && e.failedCells === 0
    && e.skippedCells === 0
    && e.unknownCells === 0
    && e.duplicateCells === 0
    && e.expectedCellSetSha256 === e.executedCellSetSha256
    && report.anomalies?.length === 0;
  if (report.mode === "FULL") {
    if (report.status !== (clean ? "PASS" : "FAIL")
        || report.plan?.selectedCellCount !== report.plan?.fullCellCount
        || report.candidate?.commitSha === null
        || report.cadence?.requiredForRelease !== true
        || report.cadence?.satisfied !== clean) findings.push("full census status cannot satisfy the scheduled release gate");
  } else if (report.status !== (clean ? "NON_CERTIFYING_PASS" : "NON_CERTIFYING_FAIL")
      || report.candidate?.commitSha !== null
      || report.cadence?.satisfied !== false) findings.push("benchmark status must remain non-certifying");

  if (expectedPlan) {
    const expectedIds = [...expectedPlan.cells.map((cell) => cell.cellId)].sort();
    if (report.plan?.planSha256 !== expectedPlan.planSha256
        || report.plan?.selectedCellCount !== expectedIds.length
        || e.expectedCellSetSha256 !== sha256(expectedIds)) findings.push("report does not bind the exact selected plan");
  }
  if (expectedExecutableSha256 !== null && report.toolchain?.browserExecutableSha256 !== expectedExecutableSha256) findings.push("browser executable digest mismatch");
  if (expectedRootId !== null && report.candidate?.serverRootId !== expectedRootId) findings.push("server root digest mismatch");
  if (expectedServedPayloadSha256 !== null && report.candidate?.servedPayloadSha256 !== expectedServedPayloadSha256) findings.push("served payload digest mismatch");
  return [...new Set(findings)];
}
