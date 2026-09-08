import { deepUxCanonicalValue as canonical, sha256, collectDeepUxRepresentatives } from "./playwright-deep-ux-sampling.mjs";
export { sha256 } from "./playwright-deep-ux-sampling.mjs";
import { axeReportFindings } from "./axe-accessibility.mjs";

const DEEP_UX_CENSUS_SCHEMA_VERSION = 1;
export const DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION = 2;
const DEEP_UX_CENSUS_POLICY_ID = "math-quest-playwright-deep-ux-census-v1";
export const DEEP_UX_CENSUS_REPORT_ID = "math-quest-playwright-deep-ux-census-report-v2";
const DEEP_UX_CENSUS_PLANNER_VERSION = "deep-ux-layout-risk-v1";
const DEEP_UX_CENSUS_SEED = 1297175628;
const DEEP_UX_CENSUS_ORDINALS = 32;
export const DEEP_UX_NATIVE_ACTION_TIMEOUT_MS = 10_000;
const DEEP_UX_CENSUS_TIERS = Object.freeze(["EASY", "HARD/TARGET"]);
const DEEP_UX_CENSUS_REPRESENTATIONS = Object.freeze(["CONCRETE", "PICTORIAL", "ABSTRACT"]);
const DEEP_UX_CENSUS_THEMES = Object.freeze(["ocean", "forest", "space"]);
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
  "TUTORIAL_STEP_1_DIFFERENT_EXAMPLE",
  "TUTORIAL_STEP_2_PLAN",
  "TUTORIAL_STEP_3_CHECK",
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

function closedKeys(value, keys) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
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

function assertNativeActionTargets(locator, page) {
  if (!locator || typeof locator.tap !== "function" || typeof locator.click !== "function" || !page || typeof page.evaluate !== "function") {
    throw new TypeError("A Playwright locator and page are required for a Deep UX native action.");
  }
}

export async function deepUxActivateNativeControl(locator, page, { preserveScroll = false, trial = false } = {}) {
  assertNativeActionTargets(locator, page);
  const options = preserveScroll
    ? { scroll: "none", trial, timeout: DEEP_UX_NATIVE_ACTION_TIMEOUT_MS }
    : { trial, timeout: DEEP_UX_NATIVE_ACTION_TIMEOUT_MS };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap(options);
  else await locator.click(options);
}

export async function deepUxEnterGrownUps(page) {
  const withoutName = page.getByRole("button", { name: "Continue without a name", exact: true });
  const grownUps = page.getByRole("button", { name: "Grown-ups corner", exact: true });
  await withoutName.or(grownUps).first().waitFor({ state: "visible", timeout: DEEP_UX_NATIVE_ACTION_TIMEOUT_MS });
  if (await withoutName.isVisible()) await deepUxActivateNativeControl(withoutName, page);
  await deepUxActivateNativeControl(grownUps, page);
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

function appendViewportRow(byViewport, row, selected, limit) {
  let added = false;
  for (const viewport of DEEP_UX_CENSUS_VIEWPORTS) {
    const cell = byViewport.get(viewport.id)?.[row];
    if (cell && selected.length < limit) {
      selected.push(cell);
      added = true;
    }
  }
  return added;
}

function balancedCellSample(cells, limit) {
  if (limit === null || limit === undefined || limit >= cells.length) return cells;
  const byViewport = new Map(DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => [viewport.id, []]));
  for (const cell of cells) byViewport.get(cell.viewportId)?.push(cell);
  const selected = [];
  for (let row = 0; selected.length < limit; row += 1) {
    const added = appendViewportRow(byViewport, row, selected, limit);
    if (!added) break;
  }
  return selected;
}

function assertDeepUxPlanInputs(engine, { engineSha256, executionMode, requestedCellLimit }) {
  if (!engine || !Array.isArray(engine.SKILLS) || typeof engine.makeQuestion !== "function") {
    throw new Error("The shipped Math Quest engine is required to build the Deep UX Census plan.");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(engineSha256 || ""))) throw new Error("The exact engine SHA-256 is required.");
  if (!new Set(["FULL", "BENCHMARK"]).has(executionMode)) throw new Error("Deep UX execution mode must be FULL or BENCHMARK.");
  if (executionMode === "BENCHMARK" && requestedCellLimit !== 100) {
    throw new Error("Benchmark mode requires exactly 100 cells.");
  }
}

export function buildDeepUxCensusPlan(engine, {
  engineSha256,
  executionMode = "FULL",
  requestedCellLimit = null,
} = {}) {
  assertDeepUxPlanInputs(engine, { engineSha256, executionMode, requestedCellLimit });
  const { representatives, requiredWitnesses, sourceQuestionCount } = collectDeepUxRepresentatives(engine, {
    tiers: DEEP_UX_CENSUS_TIERS,
    representations: DEEP_UX_CENSUS_REPRESENTATIONS,
    themes: DEEP_UX_CENSUS_THEMES,
    ordinals: DEEP_UX_CENSUS_ORDINALS,
    seed: DEEP_UX_CENSUS_SEED,
  });

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

function validatePlanIdentity(plan, issues) {
  if (!closedKeys(plan, CLOSED_PLAN_KEYS)) issues.push("plan keys are not closed");
  if (plan.schemaVersion !== DEEP_UX_CENSUS_SCHEMA_VERSION) issues.push("schemaVersion is invalid");
  if (plan.policyId !== DEEP_UX_CENSUS_POLICY_ID) issues.push("policyId is invalid");
  if (plan.plannerVersion !== DEEP_UX_CENSUS_PLANNER_VERSION) issues.push("plannerVersion is invalid");
  if (!/^[a-f0-9]{64}$/u.test(String(plan.engineSha256 || ""))) issues.push("engine SHA-256 is invalid");
  if (!/^[a-f0-9]{64}$/u.test(String(plan.curriculumSha256 || ""))) issues.push("curriculum SHA-256 is invalid");
}

function validatePlanCollections(plan, issues) {
  if (!Array.isArray(plan.viewports) || canonical(plan.viewports) !== canonical(DEEP_UX_CENSUS_VIEWPORTS)) issues.push("viewport matrix is invalid");
  if (!Array.isArray(plan.states) || canonical(plan.states) !== canonical(DEEP_UX_CENSUS_STATES)) issues.push("state matrix is invalid");
  if (!Array.isArray(plan.scenarios) || plan.scenarios.some((item) => !closedKeys(item, CLOSED_SCENARIO_KEYS) || !closedKeys(item.metrics, CLOSED_METRIC_KEYS))) issues.push("scenario set is invalid");
  if (!Array.isArray(plan.cells) || plan.cells.some((item) => !closedKeys(item, CLOSED_CELL_KEYS))) issues.push("cell set is invalid");
}

function validatePlanScenarioIds(plan, issues) {
  const scenarioIds = new Set(plan?.scenarios?.map((item) => item.scenarioId));
  if (scenarioIds.size !== plan.scenarios?.length) issues.push("scenario IDs are duplicated");
  return scenarioIds;
}

function validatePlanCellIds(plan, issues) {
  if (new Set(plan?.cells?.map((item) => item.cellId)).size !== plan.cells?.length) issues.push("cell IDs are duplicated");
}

function validatePlanReferences(plan, issues) {
  const scenarioIds = validatePlanScenarioIds(plan, issues);
  validatePlanCellIds(plan, issues);
  const viewportIds = new Set(DEEP_UX_CENSUS_VIEWPORTS.map((item) => item.id));
  if (plan?.cells?.some((item) => !scenarioIds.has(item.scenarioId) || !viewportIds.has(item.viewportId))) issues.push("cell references are invalid");
}

function validatePlanCounts(plan, issues) {
  if (plan.sourceQuestionCount !== 72_576) issues.push("source question count must be exactly 72,576");
  if (plan.scenarioCount !== plan.scenarios?.length) issues.push("scenario count is inconsistent");
  if (plan.viewportCount !== DEEP_UX_CENSUS_VIEWPORTS.length) issues.push("viewport count is inconsistent");
  if (plan.fullCellCount !== plan.scenarioCount * plan.viewportCount) issues.push("full cell count is inconsistent");
}

function validatePlanExecutionMode(plan, issues) {
  if (plan.executionMode === "FULL" && plan.cells?.length !== plan.fullCellCount) issues.push("full mode omitted cells");
  if (plan.executionMode === "BENCHMARK" && plan.cells?.length !== plan.requestedCellLimit) issues.push("benchmark cell limit is inconsistent");
  if (!new Set(["FULL", "BENCHMARK"]).has(plan.executionMode)) issues.push("execution mode is invalid");
}

export function validateDeepUxCensusPlan(plan) {
  const issues = [];
  const input = plan ?? {};
  validatePlanIdentity(input, issues);
  validatePlanCollections(input, issues);
  validatePlanReferences(input, issues);
  validatePlanCounts(input, issues);
  validatePlanExecutionMode(input, issues);
  const { planSha256, ...body } = plan || {};
  if (planSha256 !== sha256(body)) issues.push("plan SHA-256 is invalid");
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function canonicalDeepUxJson(value) {
  return `${canonical(value)}\n`;
}

const REPORT_KEYS = Object.freeze([
  "schemaVersion", "contractId", "generatedAt", "status", "mode", "candidate", "cadence",
  "plan", "toolchain", "privacy", "execution", "axe", "anomalies",
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

function deepUxAxeFindings(report, expectedPlan) {
  const locations = expectedPlan ? new Set(expectedPlan.cells.map((cell) => cell.cellId)) : null;
  const validLocation = (row) => DEEP_UX_CENSUS_STATES.includes(row.state)
    && DEEP_UX_CENSUS_VIEWPORTS.some((viewport) => viewport.id === row.projectId)
    && typeof row.cellId === "string" && row.cellId.endsWith(`@${row.projectId}`) && (!locations || locations.has(row.cellId));
  const violationCount = (report.anomalies || []).filter((row) => String(row?.code || "").startsWith("AXE_")).length;
  return axeReportFindings(report.axe, { violationCount, locationKeys: ["projectId", "cellId", "state"], validLocation });
}

const hex64 = (value) => /^[a-f0-9]{64}$/u.test(String(value || ""));
const commitOrNull = (value) => value === null || /^[a-f0-9]{40}$/u.test(String(value || ""));

function validReportCandidate(v) {
  if (!closedKeys(v, REPORT_CANDIDATE_KEYS)) return false;
  return /^\d+\.\d+\.\d+-beta\.\d+$/u.test(v.release) && commitOrNull(v.commitSha)
    && [v.engineSha256, v.curriculumSha256, v.serverRootId, v.servedPayloadSha256].every(hex64);
}
function validReportCadence(v, release) {
  return closedKeys(v, REPORT_CADENCE_KEYS) && v.firstRequiredBetaOrdinal === DEEP_UX_BETA_CADENCE.firstRequiredBetaOrdinal
    && v.interval === DEEP_UX_BETA_CADENCE.modulus && v.requiredForRelease === deepUxCensusRequiredForVersion(release) && typeof v.satisfied === "boolean";
}
function validReportPlan(v) {
  if (!closedKeys(v, REPORT_PLAN_KEYS)) return false;
  return [v.plannerVersion === DEEP_UX_CENSUS_PLANNER_VERSION, hex64(v.planSha256), v.seed === DEEP_UX_CENSUS_SEED,
    v.sourceQuestionCount === 72_576, v.viewportCount === DEEP_UX_CENSUS_VIEWPORTS.length,
    canonical(v.states) === canonical(DEEP_UX_CENSUS_STATES), Number.isInteger(v.selectedCellCount), v.selectedCellCount > 0].every(Boolean);
}
function validReportToolchain(v) {
  return closedKeys(v, REPORT_TOOLCHAIN_KEYS) && v.runnerPackage === "@playwright/test" && v.runnerVersion === "1.62.1"
    && v.browserProduct === "Microsoft Edge" && /^\d+\.\d+\.\d+\.\d+$/u.test(v.browserVersion) && hex64(v.browserExecutableSha256);
}
function validReportPrivacy(v) {
  if (!closedKeys(v, REPORT_PRIVACY_KEYS)) return false;
  return [v.usesSyntheticStateOnly, v.failureArtifactsSyntheticOnly, v.failureArtifactsUploadedOnFailure].every((flag) => flag === true)
    && [v.includesChildName, v.includesChildProgress, v.includesPassScreenshots, v.includesPassTraces].every((flag) => flag === false);
}
function validReportExecution(v) {
  if (!closedKeys(v, REPORT_EXECUTION_KEYS) || !Array.isArray(v.projectCounts)) return false;
  return v.projectCounts.length === DEEP_UX_CENSUS_VIEWPORTS.length && v.projectCounts.every((row) => closedKeys(row, REPORT_PROJECT_KEYS))
    && hex64(v.expectedCellSetSha256) && hex64(v.executedCellSetSha256) && Number.isFinite(v.durationMs) && v.durationMs >= 0;
}
function validReportAnomaly(row) {
  return closedKeys(row, REPORT_ANOMALY_KEYS)
    && /^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.webp$/u.test(row.screenshotFile)
    && /^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.aria\.txt$/u.test(row.ariaFile)
    && /^audit\/\.tmp-playwright-deep-ux-artifacts\/[A-Za-z0-9_.@-]+\.geometry\.json$/u.test(row.geometryFile);
}
function reportStructureFindings(report) {
  const checks = [
    [report.schemaVersion === DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION && report.contractId === DEEP_UX_CENSUS_REPORT_ID && Number.isFinite(Date.parse(report.generatedAt)), "report identity or timestamp is invalid"],
    [["FULL", "BENCHMARK"].includes(report.mode), "report mode is invalid"],
    [validReportCandidate(report.candidate), "candidate identity is invalid"],
    [validReportCadence(report.cadence, report.candidate?.release), "cadence declaration is invalid"],
    [validReportPlan(report.plan), "plan summary is invalid"],
    [validReportToolchain(report.toolchain), "toolchain identity is invalid"],
    [validReportPrivacy(report.privacy), "privacy declaration is invalid"],
    [validReportExecution(report.execution), "execution summary is invalid"],
    [Array.isArray(report.anomalies) && report.anomalies.every(validReportAnomaly), "anomaly set or required anomaly evidence is invalid"],
  ];
  return checks.filter(([valid]) => !valid).map(([, message]) => message);
}
function reportCountFindings(report) {
  const e = report.execution;
  const totals = e.projectCounts.reduce((total, row) => ({
    expected: total.expected + row.expected, actual: total.actual + row.actual,
    passed: total.passed + row.passed, failed: total.failed + row.failed,
  }), { expected: 0, actual: 0, passed: 0, failed: 0 });
  const valid = totals.expected === e.expectedCells && totals.actual === e.actualCells
    && totals.passed === e.passedCells && totals.failed === e.failedCells
    && e.actualCells === e.passedCells + e.failedCells + e.skippedCells && e.expectedCells === report.plan.selectedCellCount;
  return valid ? [] : ["execution counts are inconsistent"];
}
function reportExecutedCleanly(report) {
  const e = report.execution;
  return e.expectedCells === e.actualCells && e.passedCells === e.expectedCells
    && [e.failedCells, e.skippedCells, e.unknownCells, e.duplicateCells, report.anomalies.length].every((count) => count === 0)
    && e.expectedCellSetSha256 === e.executedCellSetSha256;
}
function fullReportStatusFindings(report, clean) {
    const valid = report.status === (clean ? "PASS" : "FAIL") && report.plan.selectedCellCount === report.plan.fullCellCount
      && report.candidate.commitSha !== null && report.cadence.requiredForRelease === true && report.cadence.satisfied === clean;
    return valid ? [] : ["full census status cannot satisfy the scheduled release gate"];
}
function reportStatusFindings(report) {
  const clean = reportExecutedCleanly(report);
  if (report.mode === "FULL") return fullReportStatusFindings(report, clean);
  const valid = report.status === (clean ? "NON_CERTIFYING_PASS" : "NON_CERTIFYING_FAIL")
    && report.candidate.commitSha === null && report.cadence.satisfied === false;
  return valid ? [] : ["benchmark status must remain non-certifying"];
}
function reportPlanBindingFindings(report, expectedPlan) {
  if (!expectedPlan) return [];
  const expectedIds = expectedPlan.cells.map((cell) => cell.cellId).sort();
  const valid = report.plan.planSha256 === expectedPlan.planSha256 && report.plan.selectedCellCount === expectedIds.length
    && report.execution.expectedCellSetSha256 === sha256(expectedIds);
  return valid ? [] : ["report does not bind the exact selected plan"];
}
function reportDigestFindings(report, expected) {
  const bindings = [
    ["expectedExecutableSha256", report.toolchain.browserExecutableSha256, "browser executable digest mismatch"],
    ["expectedRootId", report.candidate.serverRootId, "server root digest mismatch"],
    ["expectedServedPayloadSha256", report.candidate.servedPayloadSha256, "served payload digest mismatch"],
  ];
  return bindings.filter(([key, value]) => expected[key] != null && expected[key] !== value).map(([, , message]) => message);
}
export function deepUxCensusReportFindings(report, expected = {}) {
  if (!closedKeys(report, REPORT_KEYS)) return ["report must use the exact closed schema"];
  const structure = reportStructureFindings(report);
  if (structure.length) return structure;
  return [...new Set([
    ...deepUxAxeFindings(report, expected.expectedPlan), ...reportCountFindings(report),
    ...reportStatusFindings(report), ...reportPlanBindingFindings(report, expected.expectedPlan),
    ...reportDigestFindings(report, expected),
  ])];
}
