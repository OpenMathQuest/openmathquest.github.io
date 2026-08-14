import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEEP_UX_BETA_CADENCE,
  DEEP_UX_CENSUS_REPORT_ID,
  DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION,
  DEEP_UX_CENSUS_STATES,
  DEEP_UX_CENSUS_VIEWPORTS,
  DEEP_UX_NATIVE_ACTION_TIMEOUT_MS,
  buildDeepUxCensusPlan,
  deepUxActivateNativeControl,
  deepUxCensusReportFindings,
  deepUxCensusRequiredForVersion,
  deepUxEffectBoundRerenderAction,
  deepUxFirstScreenResponseRequired,
  deepUxNativeScrollDelta,
  deepUxPartialResponseControlPriority,
  sha256,
  validateDeepUxCensusPlan,
} from "../lib/playwright-deep-ux-census.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const digest = "a".repeat(64);

function fakeEngine() {
  return {
    SKILLS: Array.from({ length: 126 }, (_, index) => ({ skillId: `MQ-${String(index + 1).padStart(3, "0")}`, level: Math.floor(index / 6) + 1 })),
    CURRICULUM_MANIFEST_SHA256: "b".repeat(64),
    CONSTANTS: { PRODUCT_VERSION: "1.0.0-beta.4" },
    makeQuestion({ skillId, tier, representation, theme, ordinal }) {
      const index = Number(skillId.slice(3));
      const inputMethod = ["PICTURE_CHOICE", "NUMBER_PAD", "PAIR_LINK", "STRATEGY_BUILD"][ordinal % 4];
      return {
        skillId,
        level: Math.floor((index - 1) / 6) + 1,
        tier,
        representation,
        theme,
        ordinal,
        inputClass: inputMethod === "PICTURE_CHOICE" ? "SELECTION" : "CONSTRUCTION",
        inputMethod,
        taskType: `task-${ordinal % 7}`,
        semanticPromptStringId: `question.fake${ordinal % 5}`,
        prompt: `Build ${index + ordinal} using ${representation.toLowerCase()} objects in ${theme}.`,
        params: { a: index, b: ordinal, denominator: 2 + (ordinal % 7) },
        answer: { value: String(index + ordinal) },
        options: inputMethod === "PICTURE_CHOICE" ? [1, 2, 3, 4].map((value) => ({ label: String(value), value })) : [],
        modelDescriptor: { type: `model-${ordinal % 5}`, items: Array.from({ length: ordinal % 9 }, (_, item) => item) },
        sampleKey: `${skillId}|${tier}|${representation}|${theme}|${ordinal}`,
      };
    },
  };
}

function cleanReport(plan, mode = "FULL") {
  const ids = plan.cells.map((cell) => cell.cellId).sort();
  const projectCounts = DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => {
    const expected = plan.cells.filter((cell) => cell.viewportId === viewport.id).length;
    return { projectId: viewport.id, expected, actual: expected, passed: expected, failed: 0 };
  });
  return {
    schemaVersion: DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION,
    contractId: DEEP_UX_CENSUS_REPORT_ID,
    generatedAt: "2026-08-12T12:00:00.000Z",
    status: mode === "FULL" ? "PASS" : "NON_CERTIFYING_PASS",
    mode,
    candidate: { release: "1.0.0-beta.4", commitSha: mode === "FULL" ? "1".repeat(40) : null, engineSha256: digest, curriculumSha256: "b".repeat(64), serverRootId: digest, servedPayloadSha256: digest },
    cadence: { firstRequiredBetaOrdinal: 4, interval: 2, requiredForRelease: true, satisfied: mode === "FULL" },
    plan: { plannerVersion: plan.plannerVersion, planSha256: plan.planSha256, seed: plan.seed, sourceQuestionCount: plan.sourceQuestionCount, riskSignatureCount: plan.riskSignatureCount, scenarioCount: plan.scenarioCount, viewportCount: plan.viewportCount, fullCellCount: plan.fullCellCount, selectedCellCount: plan.cells.length, states: DEEP_UX_CENSUS_STATES },
    toolchain: { runnerPackage: "@playwright/test", runnerVersion: "1.62.1", browserProduct: "Microsoft Edge", browserVersion: "151.0.4129.72", browserExecutableSha256: digest },
    privacy: { usesSyntheticStateOnly: true, includesChildName: false, includesChildProgress: false, includesPassScreenshots: false, includesPassTraces: false, failureArtifactsSyntheticOnly: true, failureArtifactsUploadedOnFailure: true },
    execution: { expectedCells: ids.length, actualCells: ids.length, passedCells: ids.length, failedCells: 0, skippedCells: 0, unknownCells: 0, duplicateCells: 0, expectedCellSetSha256: sha256(ids), executedCellSetSha256: sha256(ids), durationMs: 123, projectCounts },
    anomalies: [],
  };
}

test("alternating beta cadence starts with Beta 4 and never applies to stable or malformed versions", () => {
  assert.deepEqual(DEEP_UX_BETA_CADENCE, { firstRequiredBetaOrdinal: 4, modulus: 2, remainder: 0 });
  for (const version of ["1.0.0-beta.4", "1.0.0-beta.6", "2.3.1-beta.18"]) assert.equal(deepUxCensusRequiredForVersion(version), true, version);
  for (const version of ["1.0.0-beta.1", "1.0.0-beta.3", "1.0.0-beta.5", "1.0.0-beta.7", "1.0.0", "1.0.0-rc.4", "v1.0.0-beta.4", "1.0.0-beta.04"]) assert.equal(deepUxCensusRequiredForVersion(version), false, version);
});

test("only later-grade short-landscape questions may require deliberate outer scrolling", () => {
  assert.equal(deepUxFirstScreenResponseRequired({ level: 7 }, "phone-landscape"), true);
  assert.equal(deepUxFirstScreenResponseRequired({ level: 8 }, "phone-landscape"), false);
  assert.equal(deepUxFirstScreenResponseRequired({ level: 21 }, "phone-portrait"), true);
  assert.equal(deepUxFirstScreenResponseRequired({ level: 21 }, "desktop"), true);
  assert.equal(deepUxNativeScrollDelta({ y: 460, height: 58 }, 390), 139);
  assert.equal(deepUxNativeScrollDelta({ y: 312, height: 58 }, 390), 0);
  assert.equal(deepUxNativeScrollDelta({ y: -244, height: 58 }, 390), -175);
  assert.equal(deepUxNativeScrollDelta({ y: 10, height: 400 }, 390), null);
});

test("partial-response selection prefers a real unpressed choice and retains a pressed fallback", () => {
  assert.equal(deepUxPartialResponseControlPriority({ disabled: true, ariaPressed: "false" }), -1);
  assert.equal(deepUxPartialResponseControlPriority({ disabled: false, ariaPressed: "false" }), 3);
  assert.equal(deepUxPartialResponseControlPriority({ disabled: false, ariaPressed: null }), 2);
  assert.equal(deepUxPartialResponseControlPriority({ disabled: false, ariaPressed: "true" }), 1);
  assert.equal(deepUxPartialResponseControlPriority({ disabled: false, ariaPressed: "mixed" }), -1);
});

test("native census actions retain real touch or mouse input with a host-tolerant bounded deadline", async () => {
  assert.equal(DEEP_UX_NATIVE_ACTION_TIMEOUT_MS, 10_000);
  const calls = [];
  const locator = {
    tap: async (options) => calls.push(["tap", options]),
    click: async (options) => calls.push(["click", options]),
  };
  await deepUxActivateNativeControl(locator, { evaluate: async () => true }, { preserveScroll: true, trial: true });
  await deepUxActivateNativeControl(locator, { evaluate: async () => false });
  assert.deepEqual(calls, [
    ["tap", { scroll: "none", trial: true, timeout: 10_000 }],
    ["click", { trial: false, timeout: 10_000 }],
  ]);
  await assert.rejects(deepUxActivateNativeControl({}, { evaluate: async () => true }), /locator and page/u);
});

test("rerendering native actions require an exact false-to-true effect and fail closed on unrelated errors", async () => {
  let effect = false;
  assert.deepEqual(await deepUxEffectBoundRerenderAction(
    async () => { effect = true; },
    async () => effect,
  ), { effectObserved: true, actionCompleted: true });

  effect = false;
  const detachedTimeout = Object.assign(new Error("locator.tap timed out after the target rerendered"), { name: "TimeoutError" });
  assert.deepEqual(await deepUxEffectBoundRerenderAction(
    async () => { effect = true; throw detachedTimeout; },
    async () => effect,
  ), { effectObserved: true, actionCompleted: false });

  effect = false;
  await assert.rejects(deepUxEffectBoundRerenderAction(
    async () => { throw detachedTimeout; },
    async () => effect,
  ), (error) => error === detachedTimeout);

  effect = false;
  const unrelated = new Error("unrelated browser failure");
  await assert.rejects(deepUxEffectBoundRerenderAction(
    async () => { effect = true; throw unrelated; },
    async () => effect,
  ), (error) => error === unrelated);

  effect = true;
  await assert.rejects(deepUxEffectBoundRerenderAction(
    async () => {},
    async () => effect,
  ), /already true before the action/u);
});

test("planner inventories exactly 72,576 deterministic questions and creates a closed six-viewport risk plan", () => {
  const plan = buildDeepUxCensusPlan(fakeEngine(), { engineSha256: digest, executionMode: "FULL" });
  assert.equal(plan.sourceQuestionCount, 72_576);
  assert.equal(plan.viewportCount, 6);
  assert.equal(plan.fullCellCount, plan.scenarioCount * 6);
  assert.equal(plan.cells.length, plan.fullCellCount);
  assert.equal(validateDeepUxCensusPlan(plan).valid, true);
  const mutant = structuredClone(plan); mutant.cells.pop();
  assert.equal(validateDeepUxCensusPlan(mutant).valid, false);
});

test("100-cell benchmark is balanced, exact, and explicitly non-certifying", () => {
  const plan = buildDeepUxCensusPlan(fakeEngine(), { engineSha256: digest, executionMode: "BENCHMARK", requestedCellLimit: 100 });
  assert.equal(plan.cells.length, 100);
  const counts = DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => plan.cells.filter((cell) => cell.viewportId === viewport.id).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  const report = cleanReport(plan, "BENCHMARK");
  assert.deepEqual(deepUxCensusReportFindings(report, { expectedPlan: plan, expectedExecutableSha256: digest, expectedRootId: digest, expectedServedPayloadSha256: digest }), []);
  assert.equal(report.cadence.satisfied, false);
  assert.match(report.status, /^NON_CERTIFYING_/u);
  assert.throws(() => buildDeepUxCensusPlan(fakeEngine(), { engineSha256: digest, executionMode: "BENCHMARK", requestedCellLimit: 99 }), /exactly 100 cells/u);
});

test("compact report fails closed on missing cells, retries-by-proxy, forged identity, pass artifacts, or cadence claims", () => {
  const plan = buildDeepUxCensusPlan(fakeEngine(), { engineSha256: digest, executionMode: "FULL" });
  const expected = { expectedPlan: plan, expectedExecutableSha256: digest, expectedRootId: digest, expectedServedPayloadSha256: digest };
  assert.deepEqual(deepUxCensusReportFindings(cleanReport(plan), expected), []);
  for (const mutate of [
    (report) => { report.execution.actualCells -= 1; report.execution.passedCells -= 1; },
    (report) => { report.execution.executedCellSetSha256 = "c".repeat(64); },
    (report) => { report.toolchain.browserProduct = "Chromium"; },
    (report) => { report.privacy.includesPassScreenshots = true; },
    (report) => { report.cadence.satisfied = false; },
    (report) => { report.candidate.commitSha = null; },
    (report) => { report.anomalies = [{ cellId: "DUX-bad@desktop", scenarioId: "DUX-bad", viewportId: "desktop", skillId: "MQ-001", tier: "EASY", representation: "PICTORIAL", theme: "forest", ordinal: 0, state: "BROWSER", code: "PAGE_ERROR", message: "synthetic", screenshotFile: null, ariaFile: null, geometryFile: null }]; },
    (report) => { report.extra = true; },
  ]) {
    const report = cleanReport(plan); mutate(report);
    assert.notEqual(deepUxCensusReportFindings(report, expected).length, 0);
  }
});

test("Playwright census uses native actionability, AI ARIA boxes, WebP anomaly capture, context network observation, and no pass artifacts", async () => {
  const [config, spec, censusLibrary, runner, index, workflow] = await Promise.all([
    readFile(path.join(root, "playwright.deep-ux.config.mjs"), "utf8"),
    readFile(path.join(root, "audit", "playwright", "deep-ux-census.spec.mjs"), "utf8"),
    readFile(path.join(root, "audit", "lib", "playwright-deep-ux-census.mjs"), "utf8"),
    readFile(path.join(root, "audit", "run-playwright-deep-ux-census.mjs"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "audit.yml"), "utf8"),
  ]);
  assert.match(config, /retries:\s*0/u);
  assert.match(config, /workers:\s*process\.env\.MQ_DEEP_UX_HOSTED === "1" \? 2 : 1/u);
  assert.match(config, /serviceWorkers:\s*"block"/u);
  assert.match(config, /actionTimeout:\s*2_500/u);
  assert.match(config, /trace:\s*"off"/u);
  assert.match(config, /screenshot:\s*"off"/u);
  assert.match(censusLibrary, /scroll:\s*"none"/u);
  assert.match(censusLibrary, /locator\.tap\(options\)/u);
  assert.match(censusLibrary, /locator\.click\(options\)/u);
  assert.match(spec, /deepUxFirstScreenResponseRequired\(scenario, viewportId\)/u);
  assert.match(spec, /deepUxNativeScrollDelta\(await locator\.boundingBox\(\), viewportHeight\)/u);
  assert.match(spec, /outer !== document\.documentElement/u);
  assert.match(spec, /outer\.scrollBy\(\{ top: amount, left: 0, behavior: "instant" \}\)/u);
  assert.match(spec, /outer\.scrollTop !== before/u);
  assert.match(spec, /deepUxActivateNativeControl as activate/u);
  assert.match(spec, /positionOuterDocumentControl\(model, page\)/u);
  assert.match(spec, /activate\(model, page, \{ preserveScroll: true \}\)/u);
  assert.doesNotMatch(spec, /locator\.(?:tap|click)\(/u);
  assert.match(spec, /ariaSnapshot\(\{ mode: "ai", boxes: true/u);
  assert.match(spec, /type: "webp"/u);
  assert.match(spec, /page\.context\(\)\.on\("request"/u);
  assert.match(spec, /questionHeading\.scrollIntoViewIfNeeded\(\{ timeout: 2_500 \}\)/u);
  assert.match(spec, /expect\(questionHeading\)\.toBeInViewport\(\{ ratio: 1 \}\)/u);
  assert.match(spec, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/u);
  assert.match(spec, /document\.createTreeWalker\(root, NodeFilter\.SHOW_TEXT\)/u);
  assert.match(spec, /labelledBy\.every\(\(labelId\) => document\.getElementById\(labelId\)\)/u);
  assert.match(spec, /UNAPPROVED_NESTED_SCROLL/u);
  assert.match(spec, /CONTROL_CLIPPED/u);
  assert.match(spec, /responseTransition\.available && responseTransition\.changed/u);
  assert.match(spec, /deepUxPartialResponseControlPriority\(control\)/u);
  assert.equal((spec.match(/deepUxEffectBoundRerenderAction\(/gu) || []).length, 2);
  assert.match(spec, /data-render-settled/u);
  assert.match(spec, /\[data-lab-expected\][\s\S]*toBeVisible/u);
  assert.match(spec, /\.model\[data-worked-result='true'\][\s\S]*toBeVisible/u);
  assert.doesNotMatch(spec, /screenshotFile:\s*null|ariaFile:\s*null|geometryFile:\s*null/u);
  assert.doesNotMatch(spec, /try\s*\{\s*await question\.screenshot[\s\S]*catch\s*\{\s*\}/u);
  assert.doesNotMatch(spec, /dispatchEvent|scrollIntoView\s*\(|waitForTimeout|\.focus\(/u);
  assert.doesNotMatch(spec, /page\.mouse\.wheel|Input\.synthesizeScrollGesture/u);
  assert.doesNotMatch(spec, /\.(?:click|tap)\(\{[^}]*force:\s*true/su);
  const uploadStep = workflow.split(/- name: Upload compact census report and anomaly-only evidence/u)[1] || "";
  assert.match(uploadStep, /include-hidden-files:\s*true/u);
  assert.match(runner, /--benchmark=100/u);
  assert.doesNotMatch(runner, /--benchmark=\(\\d\+\)/u);
  assert.match(runner, /RUNNER_ENVIRONMENT !== "github-hosted"/u);
  assert.match(runner, /MQ_DEEP_UX_CANDIDATE_SHA !== process\.env\.GITHUB_SHA/u);
  for (const hook of ["data-lab-representation", "data-lab-theme", "data-lab-sample", "data-sample-key"]) assert.match(index, new RegExp(hook, "u"));
});
