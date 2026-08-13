import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PLAYWRIGHT_FOCUSED_SERVER_ROUTES } from "../lib/playwright-focused-contract.mjs";
import { deepUxFirstScreenResponseRequired, deepUxNativeScrollDelta, deepUxPartialResponseControlPriority } from "../lib/playwright-deep-ux-census.mjs";

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

async function activate(locator, page, { preserveScroll = false, trial = false } = {}) {
  const options = preserveScroll ? { scroll: "none", trial, timeout: 2_500 } : { trial, timeout: 2_500 };
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap(options);
  else await locator.click(options);
}

async function provePrimaryResponseActionability(primary, page, scenario, viewportId) {
  try {
    await activate(primary, page, { preserveScroll: true, trial: true });
    return;
  } catch (initialError) {
    // A 390px-high landscape phone cannot always contain a later-grade model
    // and its response together. Early learning remains first-screen strict.
    // For later content, prove that one deliberate native outer-page scroll
    // exposes a normally actionable control; Playwright may not auto-scroll it.
    if (deepUxFirstScreenResponseRequired(scenario, viewportId)) throw initialError;
    const viewportHeight = page.viewportSize()?.height || 390;
    const viewportWidth = page.viewportSize()?.width || 844;
    await page.mouse.move(Math.floor(viewportWidth / 2), Math.floor(viewportHeight / 2));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const delta = deepUxNativeScrollDelta(await primary.boundingBox(), viewportHeight);
      if (delta === null || delta === 0) break;
      await page.mouse.wheel(0, delta);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      try {
        await activate(primary, page, { preserveScroll: true, trial: true });
        return;
      } catch {}
    }
    throw initialError;
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
  const withoutName = page.getByRole("button", { name: "Continue without a name", exact: true });
  if (await withoutName.count()) await activate(withoutName, page);
  await activate(page.getByRole("button", { name: "Grown-ups corner", exact: true }), page);
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
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => document.fonts.ready);
  const questionHeading = question.locator("h2");
  await questionHeading.scrollIntoViewIfNeeded({ timeout: 2_500 });
  await expect(questionHeading).toBeInViewport({ ratio: 1 });
  return question;
}

async function geometryCensus(question, page) {
  return question.evaluate((root) => {
    const allowedNestedScroller = (element) => element.matches(".route-grid-scroll");
    const visible = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    };
    const labelled = (element) => {
      const id = element.id;
      const labelledBy = String(element.getAttribute("aria-labelledby") || "").trim().split(/\s+/u).filter(Boolean);
      const labelledText = labelledBy.length && labelledBy.every((labelId) => document.getElementById(labelId))
        ? labelledBy.map((labelId) => document.getElementById(labelId).textContent).join(" ")
        : "";
      const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "";
      const wrappingLabel = element.closest("label")?.textContent;
      return String(element.getAttribute("aria-label") || labelledText || explicitLabel || wrappingLabel || element.getAttribute("alt") || element.textContent || element.getAttribute("title") || "").trim();
    };
    const controls = [...root.querySelectorAll("button,input,select,textarea,[role='button']")].filter((element) => visible(element) && !element.disabled);
    const textParents = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (String(node.textContent || "").trim() && node.parentElement && visible(node.parentElement)) textParents.push(node.parentElement);
    }
    for (const control of controls) if (!textParents.includes(control)) textParents.push(control);
    const clippedByAncestor = (element) => {
      const box = element.getBoundingClientRect();
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (allowedNestedScroller(ancestor)) {
          if (ancestor === root) break;
          continue;
        }
        const style = getComputedStyle(ancestor);
        const ancestorBox = ancestor.getBoundingClientRect();
        if (/^(?:auto|scroll|hidden|clip)$/u.test(style.overflowX)
            && (box.left < ancestorBox.left - 1 || box.right > ancestorBox.right + 1)) return true;
        if (/^(?:auto|scroll|hidden|clip)$/u.test(style.overflowY)
            && (box.top < ancestorBox.top - 1 || box.bottom > ancestorBox.bottom + 1)) return true;
        if (ancestor === root) break;
      }
      return false;
    };
    const controlBoxes = controls.map((element) => {
      const box = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), label: labelled(element).slice(0, 100), width: box.width, height: box.height, clipped: clippedByAncestor(element) };
    });
    const fontSizes = textParents.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite);
    const nestedScrollers = [...root.querySelectorAll("*")].filter((element) => {
      if (!visible(element) || allowedNestedScroller(element)) return false;
      const style = getComputedStyle(element);
      return /^(?:auto|scroll)$/u.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    });
    const rootBox = root.getBoundingClientRect();
    const grade = root.querySelector('[data-lab-action="grade"]');
    const response = root.querySelector(".answer-controls");
    const placeholderText = /(?:\bundefined\b|\bNaN\b|\[object Object\])/u.test(root.innerText);
    const issues = [];
    if (root.dataset.contractValid !== "true") issues.push({ code: "QUESTION_CONTRACT_INVALID", message: "The rendered question reports an invalid production contract." });
    if (root.dataset.storageIntact !== "true") issues.push({ code: "SAVE_ISOLATION_FAILED", message: "The Parent Test Lab reports that the learning save changed." });
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push({ code: "HORIZONTAL_OVERFLOW", message: `Document width ${document.documentElement.scrollWidth} exceeds viewport ${innerWidth}.` });
    if (rootBox.right > innerWidth + 1 || rootBox.left < -1) issues.push({ code: "QUESTION_HORIZONTAL_CLIP", message: "The question extends beyond the horizontal viewport." });
    const tooSmall = controlBoxes.filter((box) => box.width < 44 || box.height < 44);
    if (tooSmall.length) issues.push({ code: "CONTROL_TARGET_TOO_SMALL", message: `${tooSmall.length} enabled control(s) are below 44 by 44 CSS pixels.` });
    const blank = controlBoxes.filter((box) => !box.label);
    if (blank.length) issues.push({ code: "CONTROL_NAME_MISSING", message: `${blank.length} visible enabled control(s) have no accessible name.` });
    const clipped = controlBoxes.filter((box) => box.clipped);
    if (clipped.length) issues.push({ code: "CONTROL_CLIPPED", message: `${clipped.length} enabled control(s) are clipped by an ancestor and cannot be reached through ordinary outer-page scrolling.` });
    if (nestedScrollers.length) issues.push({ code: "UNAPPROVED_NESTED_SCROLL", message: `${nestedScrollers.length} unapproved nested vertical scroller(s) hide question content.` });
    const minimumFont = fontSizes.length ? Math.min(...fontSizes) : 0;
    if (minimumFont < 16) issues.push({ code: "TEXT_BELOW_FLOOR", message: `Minimum visible question text is ${minimumFont}px, below 16px.` });
    if (placeholderText) issues.push({ code: "PLACEHOLDER_TEXT_VISIBLE", message: "Undefined, NaN, or object placeholder text is visible." });
    if (!response || !grade) issues.push({ code: "RESPONSE_OR_GRADE_MISSING", message: "The response area or Test answer control is missing." });
    if (grade && !visible(grade)) issues.push({ code: "GRADE_NOT_VISIBLE", message: "The Test answer control is not visibly rendered." });
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      question: { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height },
      minimumFont,
      minimumControlWidth: controlBoxes.length ? Math.min(...controlBoxes.map((box) => box.width)) : 0,
      minimumControlHeight: controlBoxes.length ? Math.min(...controlBoxes.map((box) => box.height)) : 0,
      controlCount: controlBoxes.length,
      optionCount: Number(root.dataset.optionCount || 0),
      controls: controlBoxes,
      issues,
    };
  });
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

test("[PW-DUX-01] deterministic deep UX census", async ({ page, browser }, testInfo) => {
  test.setTimeout(plan.executionMode === "FULL" ? 7_000_000 : 900_000);
  const viewportId = testInfo.project.name.replace(/^deep-ux-/u, "");
  const cells = plan.cells
    .filter((cell) => cell.viewportId === viewportId)
    .map((cell) => ({ cell, scenario: scenarioById.get(cell.scenarioId) }))
    .sort((left, right) => [left.scenario.level, left.scenario.skillId, left.scenario.tier, left.scenario.representation, left.scenario.theme, left.scenario.ordinal]
      .join("|").localeCompare([right.scenario.level, right.scenario.skillId, right.scenario.tier, right.scenario.representation, right.scenario.theme, right.scenario.ordinal].join("|"), "en"));
  const browserSession = await browser.newBrowserCDPSession();
  const browserIdentity = await browserSession.send("Browser.getVersion");
  await browserSession.detach();
  const pageErrors = [];
  const consoleErrors = [];
  const requestErrors = [];
  let activeCellId = "SETUP";
  const progressPath = path.join(shardDirectory, `${viewportId}.progress.json`);
  const progress = async (stage) => {
    await mkdir(shardDirectory, { recursive: true });
    await writeFile(progressPath, `${JSON.stringify({ viewportId, activeCellId, stage, at: new Date().toISOString() })}\n`, "utf8");
  };
  page.on("pageerror", (error) => pageErrors.push({ cellId: activeCellId, message: truncate(error?.message || error) }));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ cellId: activeCellId, message: truncate(message.text()) }); });
  page.context().on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:8771" || url.search !== "" || !allowedPaths.has(url.pathname)) {
      requestErrors.push({ cellId: activeCellId, message: truncate(`${request.method()} ${url.origin}${url.pathname}${url.search}`) });
    }
  });
  await progress("OPEN_LAB_START");
  const saveBytes = await openLab(page);
  await progress("OPEN_LAB_DONE");
  const anomalies = [];
  const executed = [];
  const startedAt = Date.now();
  for (const [cellIndex, { cell, scenario }] of cells.entries()) {
    activeCellId = cell.cellId;
    await progress("CELL_START");
    if (plan.executionMode === "BENCHMARK" || cellIndex % 50 === 0) process.stdout.write(`[${viewportId}] ${cellIndex + 1}/${cells.length} ${cell.cellId}\n`);
    const beforeAnomalies = anomalies.length;
    let question;
    try {
      question = await renderScenario(page, scenario);
      await progress("SCENARIO_RENDERED");
      const inspectState = async (state) => {
        const geometry = await geometryCensus(question, page);
        for (const issue of geometry.issues) {
          const base = {
            cellId: cell.cellId,
            scenarioId: scenario.scenarioId,
            viewportId,
            skillId: scenario.skillId,
            tier: scenario.tier,
            representation: scenario.representation,
            theme: scenario.theme,
            ordinal: scenario.ordinal,
            state,
            code: issue.code,
            message: truncate(issue.message),
          };
          anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, geometry) });
        }
      };
      await inspectState("INITIAL");
      await progress("INITIAL_INSPECTED");
      const primary = question.locator('.answer-controls button:not([disabled]),.answer-controls input:not([disabled]),.answer-controls select:not([disabled])').first();
      if (await primary.count()) {
        try { await provePrimaryResponseActionability(primary, page, scenario, viewportId); }
        catch (error) {
          const geometry = await geometryCensus(question, page);
          const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "INITIAL", code: "PRIMARY_RESPONSE_REQUIRES_SCROLL", message: truncate(error?.message || "The first response control is not actionable without scrolling.") };
          anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, geometry) });
        }
      }
      const responseTransition = await makePartialResponse(question, page);
      if (responseTransition.available && responseTransition.changed) { await inspectState("PARTIAL_RESPONSE"); await progress("PARTIAL_INSPECTED"); }
      else if (!responseTransition.available) {
        const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "PARTIAL_RESPONSE", code: "PARTIAL_RESPONSE_UNAVAILABLE", message: "No visible native response control could create a partial answer." };
        anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, await geometryCensus(question, page)) });
      } else {
        const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "PARTIAL_RESPONSE", code: "RESPONSE_ACTION_NO_EFFECT", message: "The first native response action did not change the rendered response state." };
        anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, await geometryCensus(question, page)) });
      }
      const expected = question.getByRole("button", { name: "Show expected", exact: true });
      await activate(expected, page);
      await waitForLabRender(page);
      question = page.locator("article.lab-question");
      await expect(question.locator("[data-lab-expected]")).toBeVisible();
      await expect(question.getByRole("button", { name: "Hide expected", exact: true })).toBeVisible();
      await inspectState("EXPECTED_REVEALED");
      await progress("EXPECTED_INSPECTED");
      const model = page.locator('[data-lab-action="model"]');
      if (await model.isEnabled()) {
        await activate(model, page);
        await waitForLabRender(page);
        question = page.locator("article.lab-question");
        await expect(question.locator(".model[data-worked-result='true']")).toBeVisible();
        await expect(page.getByRole("button", { name: "Hide teaching model", exact: true })).toBeVisible();
        await inspectState("TEACHING_MODEL_WHEN_AVAILABLE");
        await progress("MODEL_INSPECTED");
      }
      const currentSave = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
      if (currentSave !== saveBytes) {
        const geometry = await geometryCensus(question, page);
        const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "ISOLATION", code: "SAVE_BYTES_CHANGED", message: "Synthetic Parent Test activity changed the child's stored learning bytes." };
        anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, question, base, geometry) });
      }
    } catch (error) {
      const base = { cellId: cell.cellId, scenarioId: scenario.scenarioId, viewportId, skillId: scenario.skillId, tier: scenario.tier, representation: scenario.representation, theme: scenario.theme, ordinal: scenario.ordinal, state: "TRAVERSAL", code: "CELL_TRAVERSAL_FAILED", message: truncate(error?.message || error) };
      const fallback = question || page.locator("article.lab-question");
      let geometry = { issues: [], error: base.message };
      try { if (await fallback.count()) geometry = await geometryCensus(fallback, page); } catch {}
      anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, fallback, base, geometry) });
      try { await openLab(page); } catch {}
    }
    executed.push({ cellId: cell.cellId, passed: anomalies.length === beforeAnomalies });
    await progress("CELL_DONE");
  }
  for (const source of [pageErrors, consoleErrors, requestErrors]) {
    for (const error of [...source]) {
      const cell = cells.find((item) => item.cell.cellId === error.cellId) || cells[0];
      if (!cell) continue;
      let evidenceQuestion = page.locator("article.lab-question");
      try { evidenceQuestion = await renderScenario(page, cell.scenario); } catch {}
      let geometry = { issues: [], error: error.message };
      try { if (await evidenceQuestion.count()) geometry = await geometryCensus(evidenceQuestion, page); } catch {}
      const base = { cellId: cell.cell.cellId, scenarioId: cell.scenario.scenarioId, viewportId, skillId: cell.scenario.skillId, tier: cell.scenario.tier, representation: cell.scenario.representation, theme: cell.scenario.theme, ordinal: cell.scenario.ordinal, state: "BROWSER", code: source === pageErrors ? "PAGE_ERROR" : source === consoleErrors ? "CONSOLE_ERROR" : "UNEXPECTED_REQUEST", message: error.message };
      anomalies.push({ ...base, ...await writeAnomalyArtifacts(page, evidenceQuestion, base, geometry) });
      const row = executed.find((item) => item.cellId === cell.cell.cellId); if (row) row.passed = false;
    }
  }
  const shard = {
    schemaVersion: 1,
    contractId: "math-quest-playwright-deep-ux-census-shard-v1",
    planSha256: plan.planSha256,
    projectId: viewportId,
    browserProduct: String(browserIdentity.product || ""),
    browserVersion: browser.version(),
    expectedCellIds: cells.map((item) => item.cell.cellId).sort(),
    executed,
    anomalies,
    durationMs: Date.now() - startedAt,
  };
  await mkdir(shardDirectory, { recursive: true });
  await writeFile(path.join(shardDirectory, `${viewportId}.json`), `${JSON.stringify(shard)}\n`, "utf8");
  await rm(progressPath, { force: true });
  expect(anomalies, `${viewportId} Deep UX anomalies`).toEqual([]);
});
