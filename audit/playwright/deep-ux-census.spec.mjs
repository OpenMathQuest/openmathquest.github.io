import { captureTutorialPhaseEffect, geometryCensus } from "./deep-ux-dom-observations.mjs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { AXE_CORE_VERSION, AXE_NEGATIVE_CONTROL_ID, AXE_RUN_TAGS, axeManualReviewRecords, axeViolationIssues, recordAxeManualReview, scanAxeAccessibility, verifyAxeNegativeControl } from "../lib/axe-accessibility.mjs";
import { PLAYWRIGHT_FOCUSED_SERVER_ROUTES } from "../lib/playwright-focused-contract.mjs";
import { deepUxActivateNativeControl as activate, deepUxEffectBoundRerenderAction, deepUxEnterGrownUps, deepUxFirstScreenResponseRequired, deepUxNativeScrollDelta, deepUxPartialResponseControlPriority } from "../lib/playwright-deep-ux-census.mjs";

const planPath = process.env.MQ_DEEP_UX_PLAN_PATH;
const shardDirectory = process.env.MQ_DEEP_UX_SHARD_DIRECTORY;
const artifactDirectory = process.env.MQ_DEEP_UX_ARTIFACT_DIRECTORY;
if (!planPath || !shardDirectory || !artifactDirectory) throw new Error("Deep UX Census paths are required.");
const plan = JSON.parse(await readFile(planPath, "utf8"));
const scenarioById = new Map(plan.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
const allowedPaths = new Set([
  ...PLAYWRIGHT_FOCUSED_SERVER_ROUTES.map(([route]) => route),
  "/__math_quest_health__",
]);

const truncate = (value, length = 2_000) => String(value ?? "")
  .replace(/\x1B\[[0-?]*[ -/]*[@-~]/gu, "")
  .replace(/\s+/gu, " ")
  .trim()
  .slice(0, length);
const relativeArtifact = (absolute) => path.relative(process.cwd(), absolute).replaceAll("\\", "/");

async function positionOuterDocumentControl(locator, page) {
  const viewportHeight = page.viewportSize()?.height || 390;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const delta = deepUxNativeScrollDelta(await locator.boundingBox(), viewportHeight);
    if (delta === 0) return;
    if (delta === null) throw new Error("The control cannot fit within the outer document viewport.");
    const moved = await page.evaluate((amount) => {
      const outer = document.scrollingElement;
      if (!outer || outer !== document.documentElement) return false;
      const before = outer.scrollTop;
      outer.scrollBy({ top: amount, left: 0, behavior: "instant" });
      return outer.scrollTop !== before;
    }, delta);
    if (!moved) throw new Error("The outer document could not bring the control into view.");
    await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  }
  throw new Error("The outer document did not settle with the control in view.");
}

async function provePrimaryResponseActionability(primary, page, scenario, viewportId) {
  try {
    await activate(primary, page, { preserveScroll: true, trial: true });
    return;
  } catch (initialError) {
    // A 390px-high landscape phone cannot always contain a later-grade model
    // and its response together. Early learning remains first-screen strict.
    // For later content, move only the document's outer scrolling element,
    // then prove that the real control is actionable without Playwright auto-scroll.
    // Playwright exposes tap but no touch-swipe API, and wheel input is ignored
    // by Chromium's mobile emulation.
    if (deepUxFirstScreenResponseRequired(scenario, viewportId)) throw initialError;
    try {
      await positionOuterDocumentControl(primary, page);
      await activate(primary, page, { preserveScroll: true, trial: true });
    } catch {
      throw initialError;
    }
  }
}

async function openLab(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const health = await page.request.get("/__math_quest_health__");
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toEqual({
    schemaVersion: 1,
    identity: "math-quest-local-server:v2",
    release: plan.release,
    port: 8771,
    rootId: process.env.MQ_PLAYWRIGHT_ROOT_ID,
    servedPayloadSha256: process.env.MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256,
  });
  await deepUxEnterGrownUps(page);
  await activate(page.getByRole("button", { name: "Parent test lab", exact: true }), page);
  await expect(page.getByRole("heading", { name: "Parent test lab", exact: true })).toBeVisible();
  return page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
}

async function selectIfChanged(locator, value) {
  if (await locator.inputValue() !== String(value)) await locator.selectOption(String(value));
}

async function waitForLabRender(page) {
  await expect(page.locator(".lab-workspace")).toHaveAttribute("data-render-settled", "true");
}

async function renderScenario(page, scenario) {
  await selectIfChanged(page.locator("[data-lab-level]"), scenario.level);
  await selectIfChanged(page.locator("[data-lab-skill]"), scenario.skillId);
  await selectIfChanged(page.locator("[data-lab-tier]"), scenario.tier);
  await selectIfChanged(page.locator("[data-lab-representation]"), scenario.representation);
  await selectIfChanged(page.locator("[data-lab-theme]"), scenario.theme);
  const sample = page.locator("[data-lab-sample]");
  const wanted = String(scenario.ordinal + 1);
  if (await sample.inputValue() !== wanted) {
    await sample.fill(wanted);
    await sample.press("Tab");
  }
  const question = page.locator("article.lab-question");
  await expect(question).toHaveAttribute("data-skill-id", scenario.skillId);
  await expect(question).toHaveAttribute("data-tier", scenario.tier);
  await expect(question).toHaveAttribute("data-representation", scenario.representation);
  await expect(question).toHaveAttribute("data-theme", scenario.theme);
  await expect(question).toHaveAttribute("data-input-method", scenario.inputMethod);
  await expect(question).toHaveAttribute("data-sample-key", scenario.sampleKey);
  await waitForLabRender(page);
  // Parent Test controls are intentionally outside the census cell. Position the
  // rendered question once during fixture setup, then require every measured
  // response action to remain actionable without any further scrolling.
  await page.evaluate(() => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  await page.evaluate(() => document.fonts.ready);
  const questionHeading = question.locator("h2");
  await questionHeading.scrollIntoViewIfNeeded({ timeout: 2_500 });
  await expect(questionHeading).toBeInViewport({ ratio: 1 });
  return question;
}

async function makePartialResponse(question, page) {
  const responseFingerprint = () => question.locator(".answer-controls").evaluate((root) => JSON.stringify({
    markup: root.innerHTML,
    controls: [...root.querySelectorAll("button,input,select,textarea")].map((element) => ({
      tag: element.tagName,
      action: element.getAttribute("data-lab-action"),
      value: "value" in element ? element.value : null,
      checked: "checked" in element ? element.checked : null,
      pressed: element.getAttribute("aria-pressed"),
      selected: element.getAttribute("aria-selected"),
      disabled: Boolean(element.disabled),
    })),
  }));
  const before = await responseFingerprint();
  let available = false;
  const candidates = question.locator('[data-lab-action="select"],[data-lab-action="response"],[data-lab-action="model-cell"],[data-lab-action="line-mark"],[data-lab-action="key"]');
  const controls = await candidates.evaluateAll((elements) => elements.map((element, index) => ({
    index,
    disabled: Boolean(element.disabled),
    ariaPressed: element.getAttribute("aria-pressed"),
  })));
  const preferred = controls
    .map((control) => ({ ...control, priority: deepUxPartialResponseControlPriority(control) }))
    .filter((control) => control.priority >= 0)
    .sort((left, right) => right.priority - left.priority || left.index - right.index)[0];
  if (preferred) {
    await activate(candidates.nth(preferred.index), page);
    await waitForLabRender(page);
    available = true;
  } else if (await question.locator("input[data-fraction-part]:not([disabled])").first().count()) {
    const fraction = question.locator("input[data-fraction-part]:not([disabled])").first();
    await fraction.fill("1", { timeout: 2_500 });
    available = true;
  } else if (await question.locator("input[data-response-input]:not([disabled])").first().count()) {
    const input = question.locator("input[data-response-input]:not([disabled])").first();
    await input.fill("1", { timeout: 2_500 });
    available = true;
  } else if (await question.locator("select[data-response-input]:not([disabled])").first().count()) {
    const select = question.locator("select[data-response-input]:not([disabled])").first();
    const value = await select.locator("option:not([value=''])").first().getAttribute("value");
    if (value !== null) await select.selectOption(value);
    available = value !== null;
  }
  return { available, changed: available && await responseFingerprint() !== before };
}

async function expectTutorialRenderedPhaseEffect(panel) {
  const effect = await panel.evaluate(captureTutorialPhaseEffect);
  expect(effect.anchorCount).toBe(1);
  expect(effect.actualMathSurface).toBe(true);
  expect(effect.anchorRole).toBe(effect.declaredAnchor);
  expect(effect.cueId).toBe(effect.declaredCue);
  expect(effect.describedByInstruction).toBe(true);
  expect(effect.outlineWidth).toBeGreaterThanOrEqual(4);
  expect(effect.overlayVisible).toBe(true);
  expect(effect.overlayHasSvgGeometry).toBe(true);
  return JSON.stringify({
    outlineWidth: effect.outlineWidth,
    outlineColor: effect.outlineColor,
    outlineStyle: effect.outlineStyle,
    outlineOffset: effect.outlineOffset,
    overlayGeometry: effect.overlayGeometry,
  });
}

async function writeAnomalyArtifacts(page, question, anomalyBase, geometry) {
  const safe = `${anomalyBase.cellId}-${anomalyBase.state}-${anomalyBase.code}`.replace(/[^A-Za-z0-9_.@-]/gu, "_").slice(0, 180);
  await mkdir(artifactDirectory, { recursive: true });
  const screenshot = path.join(artifactDirectory, `${safe}.webp`);
  const aria = path.join(artifactDirectory, `${safe}.aria.txt`);
  const geometryPath = path.join(artifactDirectory, `${safe}.geometry.json`);
  const target = await question.count() ? question : page.locator("body");
  await target.screenshot({ path: screenshot, type: "webp", quality: 82, animations: "disabled", caret: "hide" });
  await writeFile(aria, `${await target.ariaSnapshot({ mode: "ai", boxes: true, depth: 12, timeout: 2_500, signal: AbortSignal.timeout(2_500) })}\n`, "utf8");
  await writeFile(geometryPath, `${JSON.stringify(geometry, null, 2)}\n`, "utf8");
  return { screenshotFile: relativeArtifact(screenshot), ariaFile: relativeArtifact(aria), geometryFile: relativeArtifact(geometryPath) };
}

function stateAnomalyBase({ cell, scenario, viewportId }, state, issue) {
  return {
    cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId,
    skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation,
    theme: scenario.theme, ordinal: scenario.ordinal, state,
    code: issue.code, message: truncate(issue.message),
  };
}

async function inspectRenderedState(context, state) {
  const { page, question, axeManualReview, anomalies } = context;
  const geometry = await geometryCensus(question, page);
  const axeResults = await scanAxeAccessibility(page, "article.lab-question");
  geometry.issues.push(...axeViolationIssues(axeResults));
  recordAxeManualReview(axeManualReview, axeResults, context.cell.cellId, state);
  for (const issue of geometry.issues) {
    const base = stateAnomalyBase(context, state, issue);
    anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, geometry) });
  }
}

async function writeCensusShard({ viewportId, browserIdentity, browser, cells, executed, anomalies, axeManualReview, startedAt, progressPath }) {
  const shard = {
    schemaVersion: 1, contractId: "math-quest-playwright-deep-ux-census-shard-v1",
    planSha256: plan.planSha256, projectId: viewportId,
    browserProduct: String(browserIdentity.product || ""), browserVersion: browser.version(),
    expectedCellIds: cells.map((item) => item.cell.cellId).sort(), executed, anomalies,
    axe: { engineVersion: AXE_CORE_VERSION, runTags: AXE_RUN_TAGS, negativeControl: { id: AXE_NEGATIVE_CONTROL_ID, status: "PASS" }, manualReviewItems: axeManualReviewRecords(axeManualReview) },
    durationMs: Date.now() - startedAt,
  };
  await mkdir(shardDirectory, { recursive: true });
  await writeFile(path.join(shardDirectory, `${viewportId}.json`), `${JSON.stringify(shard)}\n`, "utf8");
  await rm(progressPath, { force: true });
  expect(anomalies, `${viewportId} Deep UX anomalies`).toEqual([]);
}

async function inspectInitialResponse(context) {
  const { page, question, cell, scenario, viewportId, anomalies } = context;
  const primary = question.locator('.answer-controls button:not([disabled]),.answer-controls input:not([disabled]),.answer-controls select:not([disabled])').first();
  if (await primary.count()) {
    try { await provePrimaryResponseActionability(primary, page, scenario, viewportId); }
    catch (error) {
      const geometry = await geometryCensus(question, page);
      const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "INITIAL", code: "PRIMARY_RESPONSE_REQUIRES_SCROLL", message: truncate(error?.message || "The first response control is not actionable without scrolling.") };
      anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, geometry) });
    }
  }
}

async function inspectPartialResponse(context) {
  const { page, question, cell, scenario, viewportId, anomalies, progress } = context;
  const responseTransition = await makePartialResponse(question, page);
  if (responseTransition.available && responseTransition.changed) { await inspectRenderedState(context, "PARTIAL_RESPONSE"); await progress("PARTIAL_INSPECTED"); }
  else if (!responseTransition.available) {
    const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "PARTIAL_RESPONSE", code: "PARTIAL_RESPONSE_UNAVAILABLE", message: "No visible native response control could create a partial answer." };
    anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, await geometryCensus(question, page)) });
  } else {
    const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "PARTIAL_RESPONSE", code: "RESPONSE_ACTION_NO_EFFECT", message: "The first native response action did not change the rendered response state." };
    anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, await geometryCensus(question, page)) });
  }
}

async function revealExpectedAnswer(context) {
  const { page, question, progress } = context;
  const expected = question.getByRole("button", { name: "Show expected", exact: true });
  await deepUxEffectBoundRerenderAction(
    () => activate(expected, page),
    async () => {
      await waitForLabRender(page);
      const rendered = page.locator("article.lab-question");
      return await rendered.locator("[data-lab-expected]").isVisible()
        && await rendered.getByRole("button", { name: "Hide expected", exact: true }).isVisible();
    },
  );
  context.question = page.locator("article.lab-question");
  await expect(context.question.locator("[data-lab-expected]")).toBeVisible();
  await expect(context.question.getByRole("button", { name: "Hide expected", exact: true })).toBeVisible();
  await inspectRenderedState(context, "EXPECTED_REVEALED");
  await progress("EXPECTED_INSPECTED");
}

async function revealTeachingModel(context) {
  const { page, progress } = context;
  const model = page.locator('[data-lab-action="model"]');
  if (await model.isEnabled()) {
    await positionOuterDocumentControl(model, page);
    await deepUxEffectBoundRerenderAction(
      () => activate(model, page, { preserveScroll: true }),
      async () => {
        await waitForLabRender(page);
        const rendered = page.locator("article.lab-question");
        return await rendered.locator(".model[data-worked-result='true']").isVisible()
          && await page.getByRole("button", { name: "Hide teaching model", exact: true }).isVisible();
      },
    );
    context.question = page.locator("article.lab-question");
    await expect(context.question.locator(".model[data-worked-result='true']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide teaching model", exact: true })).toBeVisible();
    await inspectRenderedState(context, "TEACHING_MODEL_WHEN_AVAILABLE");
    await progress("MODEL_INSPECTED");
  }
}

async function readTutorialContract(page, scenario) {
  const tutorialContract = await page.evaluate(({ scenario, seed }) => {
    const engine = window.MathQuestEngine;
    const source = engine.makeQuestion({
      skillId: scenario.skillId,
      tier: scenario.tier,
      representation: scenario.representation,
      theme: scenario.theme,
      seed,
      ordinal: scenario.ordinal,
      eligibleQuestionOrdinal: scenario.ordinal,
      scheduledReview: false,
      coldTest: false,
      preview: true,
      scaffolded: true,
    });
    const tutorialPlan = engine.makeTutorialPlan(source);
    return tutorialPlan ? {
      resolutionMode: tutorialPlan.resolutionMode,
      answerDisclosurePolicy: tutorialPlan.answerDisclosurePolicy,
      sourceTerminalAnswerFingerprint: tutorialPlan.sourceTerminalAnswerFingerprint,
      exampleTerminalAnswerFingerprint: tutorialPlan.exampleTerminalAnswerFingerprint,
    } : null;
  }, { scenario, seed: plan.seed });
  return tutorialContract;
}

async function assertTutorialContract(tutorialPanel, tutorialContract) {
  expect(tutorialContract).not.toBeNull();
  await expect(tutorialPanel).toHaveAttribute("data-resolution-mode", tutorialContract.resolutionMode);
  await expect(tutorialPanel).toHaveAttribute("data-answer-disclosure-policy", tutorialContract.answerDisclosurePolicy);
  await expect(tutorialPanel).toHaveAttribute("data-answer-source", tutorialContract.answerDisclosurePolicy === "PROCEDURE_ONLY_REQUIRED" ? "procedure-only" : "different-terminal-answer");
  if (tutorialContract.answerDisclosurePolicy === "DIFFERENT_ANSWER_REQUIRED") {
    expect(tutorialContract.exampleTerminalAnswerFingerprint).not.toBe(tutorialContract.sourceTerminalAnswerFingerprint);
  }
}

async function tutorialExampleIdentity(tutorialPanel, sourceQuestionId) {
  const exampleQuestionId = await tutorialPanel.getAttribute("data-example-question-id");
  expect(exampleQuestionId).toBeTruthy();
  expect(exampleQuestionId).not.toBe(sourceQuestionId);
  return exampleQuestionId;
}

async function assertTutorialInitialPhase(tutorialPanel, sourceQuestionId) {
  const exampleQuestionId = await tutorialExampleIdentity(tutorialPanel, sourceQuestionId);
  await expect(tutorialPanel).toHaveAttribute("data-tutorial-step", "1");
  await expect(tutorialPanel).toHaveAttribute("data-tutorial-phase-id", "NOTICE");
  await expect(tutorialPanel.getByRole("heading", { name: "Notice — Step 1 of 3", exact: true })).toBeVisible();
  await expect(tutorialPanel.locator(".tutorial-phase-cue")).toHaveCount(0);
  await expect(tutorialPanel).not.toHaveAttribute("data-visual-anchor-ids", "");
  await expect(tutorialPanel).not.toHaveAttribute("data-visual-cue-ids", "");
  await expect(tutorialPanel).toHaveAttribute("data-terminal-answer-rendered", "false");
  await expect(tutorialPanel.locator(".model[data-worked-result='true']")).toHaveCount(0);
  return exampleQuestionId;
}

async function beginTutorial(context) {
  const { page, question, scenario, progress } = context;
  const sourceQuestionId = await question.getAttribute("data-question-id");
  const tutorial = page.getByRole("button", { name: "Show tutorial", exact: true });
  await positionOuterDocumentControl(tutorial, page);
  await deepUxEffectBoundRerenderAction(
    () => activate(tutorial, page, { preserveScroll: true }),
    async () => {
      await waitForLabRender(page);
      const panel = page.locator('[data-tutorial="different-example"]');
      return await panel.isVisible()
        && await panel.getAttribute("data-tutorial-step") === "1"
        && await page.getByRole("button", { name: "Hide tutorial", exact: true }).isVisible();
    },
  );
  context.question = page.locator("article.lab-question");
  const tutorialPanel = context.question.locator('[data-tutorial="different-example"]');
  await expect(tutorialPanel).toHaveAttribute("data-source-question-id", sourceQuestionId || "");
  const tutorialContract = await readTutorialContract(page, scenario);
  await assertTutorialContract(tutorialPanel, tutorialContract);
  const exampleQuestionId = await assertTutorialInitialPhase(tutorialPanel, sourceQuestionId);
  const tutorialPhaseSignatures = [await expectTutorialRenderedPhaseEffect(tutorialPanel)];
  await inspectRenderedState(context, "TUTORIAL_STEP_1_DIFFERENT_EXAMPLE");
  await progress("TUTORIAL_STEP_1_INSPECTED");

  return { sourceQuestionId, exampleQuestionId, tutorialContract, tutorialPhaseSignatures };
}

async function assertTutorialStepIdentity(tutorialPanel, { sourceQuestionId, exampleQuestionId, step }) {
  await expect(tutorialPanel).toHaveAttribute("data-source-question-id", sourceQuestionId || "");
  await expect(tutorialPanel).toHaveAttribute("data-example-question-id", exampleQuestionId || "");
  await expect(tutorialPanel).toHaveAttribute("data-tutorial-step", String(step));
  await expect(tutorialPanel).toHaveAttribute("data-tutorial-phase-id", ["NOTICE", "PLAN", "CHECK"][step - 1]);
  await expect(tutorialPanel.getByRole("heading", { name: ["Notice — Step 1 of 3", "Plan — Step 2 of 3", "Check — Step 3 of 3"][step - 1], exact: true })).toBeVisible();
  await expect(tutorialPanel).not.toHaveAttribute("data-visual-anchor-ids", "");
  await expect(tutorialPanel).not.toHaveAttribute("data-visual-cue-ids", "");
}

async function assertTutorialAnswerState(tutorialPanel, step, tutorialContract) {
  const shouldRenderDifferentAnswer = step === 3 && tutorialContract.answerDisclosurePolicy === "DIFFERENT_ANSWER_REQUIRED";
  await expect(tutorialPanel).toHaveAttribute("data-terminal-answer-rendered", String(shouldRenderDifferentAnswer));
  if (shouldRenderDifferentAnswer) await expect(tutorialPanel.locator(".model[data-worked-result='true']")).toBeVisible();
  else await expect(tutorialPanel.locator(".model[data-worked-result='true']")).toHaveCount(0);
}

async function advanceTutorialTo(context, tutorial, { step, state, stage }) {
  const { page, progress } = context;
  const { sourceQuestionId, exampleQuestionId, tutorialContract, tutorialPhaseSignatures } = tutorial;
  const next = page.getByRole("button", { name: "Next step", exact: true });
  await deepUxEffectBoundRerenderAction(
    () => activate(next, page),
    async () => {
      await waitForLabRender(page);
      return await page.locator('[data-tutorial="different-example"]').getAttribute("data-tutorial-step") === String(step);
    },
  );
  context.question = page.locator("article.lab-question");
  const tutorialPanel = context.question.locator('[data-tutorial="different-example"]');
  await assertTutorialStepIdentity(tutorialPanel, { sourceQuestionId, exampleQuestionId, step });
  await assertTutorialAnswerState(tutorialPanel, step, tutorialContract);
  tutorialPhaseSignatures.push(await expectTutorialRenderedPhaseEffect(tutorialPanel));
  await inspectRenderedState(context, state);
  await progress(stage);
}

async function returnFromTutorial(context, sourceQuestionId) {
  const { page, cell, scenario, viewportId, anomalies, saveBytes } = context;
  await deepUxEffectBoundRerenderAction(
    () => activate(page.getByRole("button", { name: "Back to your question", exact: true }), page),
    async () => {
      await waitForLabRender(page);
      const rendered = page.locator("article.lab-question");
      return await rendered.getAttribute("data-question-id") === sourceQuestionId
        && await rendered.locator(".answer-controls").isVisible()
        && await page.getByRole("button", { name: "Show tutorial", exact: true }).isVisible();
    },
  );
  context.question = page.locator("article.lab-question");
  const currentSave = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  if (currentSave !== saveBytes) {
    const geometry = await geometryCensus(context.question, page);
    const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "ISOLATION", code: "SAVE_BYTES_CHANGED", message: "Synthetic Parent Test activity changed the child's stored learning bytes." };
    anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, context.question, base, geometry) });
  }
}

async function traverseCensusCell(context) {
  const { page, scenario, progress } = context;
  context.question = await renderScenario(page, scenario);
  await progress("SCENARIO_RENDERED");
  await inspectRenderedState(context, "INITIAL");
  await progress("INITIAL_INSPECTED");
  await inspectInitialResponse(context);
  await inspectPartialResponse(context);
  await revealExpectedAnswer(context);
  await revealTeachingModel(context);
  const tutorial = await beginTutorial(context);
  await advanceTutorialTo(context, tutorial, { step: 2, state: "TUTORIAL_STEP_2_PLAN", stage: "TUTORIAL_STEP_2_INSPECTED" });
  await advanceTutorialTo(context, tutorial, { step: 3, state: "TUTORIAL_STEP_3_CHECK", stage: "TUTORIAL_STEP_3_INSPECTED" });
  const tutorialPhaseSignatures = tutorial.tutorialPhaseSignatures;
  expect(new Set(tutorialPhaseSignatures).size).toBe(3);
  await returnFromTutorial(context, tutorial.sourceQuestionId);
}

async function recordTraversalFailure(context, error) {
  const { page, question, cell, scenario, viewportId, anomalies } = context;
  const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "TRAVERSAL", code: "CELL_TRAVERSAL_FAILED", message: truncate(error?.message || error) };
  const fallback = question || page.locator("article.lab-question");
  let geometry = { issues: [], error: base.message };
  try { if (await fallback.count()) geometry = await geometryCensus(fallback, page); } catch {}
  anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, fallback, base, geometry) });
  try { await openLab(page); } catch {}
}

async function recordCensusBrowserError({ page, cells, viewportId, executed, anomalies }, error, code) {
  const cell = cells.find((item) => item.cell.cellId === error.cellId) || cells[0];
  if (!cell) return;
  let evidenceQuestion = page.locator("article.lab-question");
  try { evidenceQuestion = await renderScenario(page, cell.scenario); } catch {}
  let geometry = { issues: [], error: error.message };
  try { if (await evidenceQuestion.count()) geometry = await geometryCensus(evidenceQuestion, page); } catch {}
  const base = { cellId: cell.cell.cellId, scenarioId: cell.scenario.scenarioId, viewportId, skillId: cell.scenario.skillId, tier: cell.scenario.tier, representation: cell.scenario.representation, theme: cell.scenario.theme, ordinal: cell.scenario.ordinal, state: "BROWSER", code: code, message: error.message };
  anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, evidenceQuestion, base, geometry) });
  const row = executed.find((item) => item.cellId === cell.cell.cellId); if (row) row.passed = false;
}

async function recordCensusBrowserErrors(context, { pageErrors, consoleErrors, requestErrors }) {
  for (const source of [pageErrors, consoleErrors, requestErrors]) {
    const code = source === pageErrors ? "PAGE_ERROR" : source === consoleErrors ? "CONSOLE_ERROR" : "UNEXPECTED_REQUEST";
    for (const error of [...source]) await recordCensusBrowserError(context, error, code);
  }
}

function observeCensusPage(page, viewportId) {
  const pageErrors = [];
  const consoleErrors = [];
  const requestErrors = [];
  const state = { activeCellId: "SETUP" };
  const progressPath = path.join(shardDirectory, `${viewportId}.progress.json`);
  const progress = async (stage) => {
    await mkdir(shardDirectory, { recursive: true });
    await writeFile(progressPath, `${JSON.stringify({ viewportId, activeCellId: state.activeCellId, stage, at: new Date().toISOString() })}\n`, "utf8");
  };
  page.on("pageerror", (error) => pageErrors.push({ cellId: state.activeCellId, message: truncate(error?.message || error) }));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ cellId: state.activeCellId, message: truncate(message.text()) }); });
  page.context().on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:8771" || url.search !== "" || !allowedPaths.has(url.pathname)) {
      requestErrors.push({ cellId: state.activeCellId, message: truncate(`${request.method()} ${url.origin}${url.pathname}${url.search}`) });
    }
  });
  return Object.assign(state, { progress, progressPath, pageErrors, consoleErrors, requestErrors });
}

function orderedViewportCells(viewportId) {
  return plan.cells
    .filter((cell) => cell.viewportId === viewportId)
    .map((cell) => ({ cell, scenario: scenarioById.get(cell.scenarioId) }))
    .sort((left, right) => [left.scenario.level, left.scenario.skillId, left.scenario.tier, left.scenario.representation, left.scenario.theme, left.scenario.ordinal]
      .join("|").localeCompare([right.scenario.level, right.scenario.skillId, right.scenario.tier, right.scenario.representation, right.scenario.theme, right.scenario.ordinal].join("|"), "en"));
}

async function censusBrowserIdentity(browser) {
  const browserSession = await browser.newBrowserCDPSession();
  const browserIdentity = await browserSession.send("Browser.getVersion");
  await browserSession.detach();
  return browserIdentity;
}

async function executeCensusCells(cells, { page, viewportId, anomalies, axeManualReview, saveBytes, executed }, observation) {
  const { progress } = observation;
  for (const [cellIndex, { cell, scenario }] of cells.entries()) {
    observation.activeCellId = cell.cellId;
    await progress("CELL_START");
    if (plan.executionMode === "BENCHMARK" || cellIndex % 50 === 0) process.stdout.write(`[${viewportId}] ${cellIndex + 1}/${cells.length} ${cell.cellId}\n`);
    const beforeAnomalies = anomalies.length;
    const context = { page, cell, scenario, viewportId, anomalies, axeManualReview, progress, saveBytes, question: undefined };
    try { await traverseCensusCell(context); }
    catch (error) { await recordTraversalFailure(context, error); }
    executed.push({ cellId: cell.cellId, passed: anomalies.length === beforeAnomalies });
    await progress("CELL_DONE");
  }
}

test("[PW-DUX-01] deterministic deep UX census", async ({ page, browser }, testInfo) => {
  test.setTimeout(plan.executionMode === "FULL" ? 7_000_000 : 900_000);
  const viewportId = testInfo.project.name.replace(/^deep-ux-/u, "");
  await verifyAxeNegativeControl(browser);
  const axeManualReview = new Map();
  const cells = orderedViewportCells(viewportId);
  const browserIdentity = await censusBrowserIdentity(browser);
  const observation = observeCensusPage(page, viewportId);
  const { progress, progressPath } = observation;
  await progress("OPEN_LAB_START");
  const saveBytes = await openLab(page);
  await progress("OPEN_LAB_DONE");
  const anomalies = [];
  const executed = [];
  const startedAt = Date.now();
  await executeCensusCells(cells, { page, viewportId, anomalies, axeManualReview, saveBytes, executed }, observation);
  await recordCensusBrowserErrors({ page, cells, viewportId, executed, anomalies }, observation);
  await writeCensusShard({ viewportId, browserIdentity, browser, cells, executed, anomalies, axeManualReview, startedAt, progressPath });
});
