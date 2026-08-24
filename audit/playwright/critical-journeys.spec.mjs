import { createHash } from "node:crypto";
import {
  activate,
  answerPatternResponse,
  answerSelection,
  completeCurrentPairLinkQuestion,
  expect,
  expectMinimumTarget,
  expectOnFirstScreen,
  openFirstQuestion,
  openFreshHome,
  openPreviewSelectionQuestion,
  openRegularPatternQuestion,
  optionIdsForCurrentQuestion,
  patternResponsePlan,
  savedSessionSnapshot,
  tabUntilFocused,
  test,
  visibleTutorialButton,
} from "./fixtures.mjs";

async function tutorialIdentity(page) {
  const panel = page.locator('[data-tutorial="different-example"]');
  await expect(panel).toBeVisible();
  return {
    sourceQuestionId: await panel.getAttribute("data-source-question-id"),
    exampleQuestionId: await panel.getAttribute("data-example-question-id"),
    answerDisclosurePolicy: await panel.getAttribute("data-answer-disclosure-policy"),
    resolutionMode: await panel.getAttribute("data-resolution-mode"),
  };
}

const TUTORIAL_PHASE_LABELS = Object.freeze([
  "Notice — Step 1 of 3",
  "Plan — Step 2 of 3",
  "Check — Step 3 of 3",
]);

async function expectTutorialStep(page, step, identity = null) {
  const panel = page.locator('[data-tutorial="different-example"]');
  await expect(panel).toHaveAttribute("data-tutorial-step", String(step));
  await expect(panel).toHaveAttribute("data-tutorial-phase-id", ["NOTICE", "PLAN", "CHECK"][step - 1]);
  await expect(panel.getByRole("heading", { name: TUTORIAL_PHASE_LABELS[step - 1], exact: true })).toBeFocused();
  if (identity) {
    await expect(panel).toHaveAttribute("data-source-question-id", identity.sourceQuestionId);
    await expect(panel).toHaveAttribute("data-example-question-id", identity.exampleQuestionId);
    await expect(panel).toHaveAttribute("data-answer-disclosure-policy", identity.answerDisclosurePolicy);
    await expect(panel).toHaveAttribute("data-resolution-mode", identity.resolutionMode);
  }
  await expect(panel.locator(".tutorial-phase-cue")).toHaveCount(0);
  await expect(panel).not.toHaveAttribute("data-visual-anchor-ids", "");
  await expect(panel).not.toHaveAttribute("data-visual-cue-ids", "");
  const renderedEffect = await tutorialPhaseSignature(page);
  expect(renderedEffect.anchorCount).toBe(1);
  expect(renderedEffect.actualMathSurface).toBe(true);
  expect(renderedEffect.anchorRole).toBe(renderedEffect.declaredAnchor);
  expect(renderedEffect.cueId).toBe(renderedEffect.declaredCue);
  expect(renderedEffect.describedByInstruction).toBe(true);
  expect(renderedEffect.overlayHasSvgGeometry).toBe(true);
  expect(renderedEffect.overlayVisible).toBe(true);
  expect(renderedEffect.outlineWidth).toBeGreaterThanOrEqual(4);
  const disclosurePolicy = await panel.getAttribute("data-answer-disclosure-policy");
  const shouldRenderDifferentAnswer = step === 3 && disclosurePolicy === "DIFFERENT_ANSWER_REQUIRED";
  await expect(panel).toHaveAttribute("data-terminal-answer-rendered", String(shouldRenderDifferentAnswer));
  if (shouldRenderDifferentAnswer) await expect(panel.locator('[data-worked-result="true"]')).toBeVisible();
  else await expect(panel.locator('[data-worked-result="true"]')).toHaveCount(0);
  const actions = panel.locator("button:visible");
  for (let index = 0; index < await actions.count(); index += 1) {
    await expectMinimumTarget(actions.nth(index));
  }
  return panel;
}

async function tutorialPhaseSignature(page) {
  return page.locator('[data-tutorial="different-example"]').evaluate((panel) => ({
    phase: panel.dataset.tutorialPhaseId,
    declaredAnchor: panel.dataset.visualAnchorIds,
    declaredCue: panel.dataset.visualCueIds,
    anchorCount: panel.querySelectorAll(".tutorial-example [data-visual-anchor-role][data-visual-cue-id]").length,
    actualMathSurface: panel.querySelector(".tutorial-example [data-visual-anchor-role]")?.matches(".prompt,.stimulus,.model") || false,
    anchorRole: panel.querySelector(".tutorial-example [data-visual-anchor-role]")?.getAttribute("data-visual-anchor-role") || "",
    cueId: panel.querySelector(".tutorial-example [data-visual-cue-id]")?.getAttribute("data-visual-cue-id") || "",
    describedByInstruction: panel.querySelector(".tutorial-example [data-visual-anchor-role]")?.getAttribute("aria-describedby") === panel.querySelector(".tutorial-instruction")?.id,
    overlayHasSvgGeometry: Boolean(panel.querySelector(".tutorial-example [data-visual-anchor-role] > .tutorial-anchor-overlay svg :is(circle,rect,path,line,polyline)")),
    overlayVisible: (() => { const element = panel.querySelector(".tutorial-anchor-overlay"); if (!element) return false; const box = element.getBoundingClientRect(), style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden"; })(),
    outlineWidth: Number.parseFloat(getComputedStyle(panel.querySelector(".tutorial-example [data-visual-anchor-role]")).outlineWidth),
    outlineColor: getComputedStyle(panel.querySelector(".tutorial-example [data-visual-anchor-role]")).outlineColor,
    outlineStyle: getComputedStyle(panel.querySelector(".tutorial-example [data-visual-anchor-role]")).outlineStyle,
    outlineOffset: getComputedStyle(panel.querySelector(".tutorial-example [data-visual-anchor-role]")).outlineOffset,
    overlayGeometry: panel.querySelector(".tutorial-anchor-overlay svg")?.innerHTML || "",
  }));
}

function tutorialVisualOnlySignature(effect) {
  return JSON.stringify({
    outlineWidth: effect.outlineWidth,
    outlineColor: effect.outlineColor,
    outlineStyle: effect.outlineStyle,
    outlineOffset: effect.outlineOffset,
    overlayGeometry: effect.overlayGeometry,
  });
}

async function expectSelectedState(control, { labelled = false } = {}) {
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveClass(/\bselected-state\b/u);
  await expect(control).toHaveAttribute("data-selected-label", "Selected");
  const presentation = await control.evaluate((button) => {
    const style = getComputedStyle(button);
    const marker = getComputedStyle(button, "::after");
    return {
      backgroundImage: style.backgroundImage,
      outlineWidth: style.outlineWidth,
      markerContent: marker.content,
    };
  });
  expect(presentation.backgroundImage).toContain("repeating-linear-gradient");
  expect(Number.parseFloat(presentation.outlineWidth)).toBeGreaterThanOrEqual(4);
  expect(presentation.markerContent).not.toContain("✓");
  if (labelled) expect(presentation.markerContent).toContain("Selected");
}

async function expectPatternResponseSingleRow(question) {
  const row = question.locator(".pattern-response-row");
  await expect(row).toBeVisible();
  const geometry = await row.evaluate((element) => {
    const source = [...element.querySelectorAll(":scope > .math-model .pattern-cue-row > [data-token-kind]")];
    const slots = [...element.querySelectorAll(":scope > .pattern-slots > span")];
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, centerY: rect.top + rect.height / 2 };
    };
    return {
      flexWrap: getComputedStyle(element).flexWrap,
      source: source.map(box),
      slots: slots.map(box),
      contained: element.scrollWidth <= element.clientWidth + 1,
    };
  });
  expect(geometry.flexWrap).toBe("nowrap");
  expect(geometry.source.length).toBeGreaterThan(0);
  expect(geometry.slots.length).toBeGreaterThan(0);
  expect(geometry.contained).toBe(true);
  const centers = [...geometry.source, ...geometry.slots].map((box) => box.centerY);
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
  expect(geometry.slots[0].left).toBeGreaterThanOrEqual(geometry.source.at(-1).right - 1);
}

async function waitForLabSettled(page) {
  await expect(page.locator(".lab-workspace")).toHaveAttribute("data-render-settled", "true");
}

async function selectLabSkill(page, level, skillId) {
  await page.locator("#lab-level").selectOption(String(level));
  await waitForLabSettled(page);
  await page.locator("#lab-skill").selectOption(skillId);
  await waitForLabSettled(page);
}

test("[PW-F-01] first use reaches Home and world selection is actionable", async ({ page }) => {
  await openFreshHome(page);
  const forest = page.locator('[data-action="world"][data-world="forest"]');
  await expectOnFirstScreen(forest, page);
  await activate(forest, page);
  await expectSelectedState(forest, { labelled: true });
  await expect(page.getByRole("button", { name: /Start/u })).toBeEnabled();
  await page.setViewportSize({ width: 844, height: 390 });
  await expectOnFirstScreen(page.getByRole("button", { name: /Start/u }), page);
});

test("[PW-F-02] update control is visible and actionable on Home", async ({ page }) => {
  await openFreshHome(page);
  const update = page.getByRole("button", { name: "Check for updates", exact: true });
  const status = page.locator("[data-home-pwa-status]");
  await expect(update).toBeVisible();
  const updateBox = await update.boundingBox();
  expect(updateBox).not.toBeNull();
  expect(updateBox.height).toBeGreaterThanOrEqual(44);
  await expect(status).not.toHaveText("");
  await activate(update, page);
  await expect(status).not.toHaveText("");
});

test("[PW-F-03] a correct answer gives visible focused feedback", async ({ page }) => {
  await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  await answerSelection(page, ids.correct, "correct");
});

test("[PW-F-04] an incorrect answer gives visible focused feedback", async ({ page }) => {
  await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  await answerSelection(page, ids.incorrect, "incorrect");
});

test("[PW-F-05] a different-example tutorial teaches in three steps and preserves the live response", async ({ page }) => {
  const question = await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  const option = question.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await activate(option, page);
  await expectSelectedState(option, { labelled: true });
  const before = await savedSessionSnapshot(page);
  const tutorial = visibleTutorialButton(page);
  await expectOnFirstScreen(tutorial, page);
  await expectMinimumTarget(tutorial);
  await activate(tutorial, page);
  await page.setViewportSize({ width: 844, height: 390 });
  const identity = await tutorialIdentity(page);
  expect(identity.sourceQuestionId).toBe(before.questionId);
  expect(identity.exampleQuestionId).not.toBe(identity.sourceQuestionId);
  const tutorialContract = await page.evaluate(() => {
    const engine = window.MathQuestEngine;
    const bytes = localStorage.getItem(engine.CONSTANTS.STORAGE_NAMESPACE);
    const source = bytes ? JSON.parse(bytes)?.activeSession?.uiState?.question : null;
    const plan = source ? engine.makeTutorialPlan(source) : null;
    if (!plan) return null;
    return {
      parametersDiffer: engine.canonical(source.params) !== engine.canonical(plan.example.params),
      structureMatches: source.semanticPromptStringId === plan.example.semanticPromptStringId
        && source.representation === plan.example.representation
        && source.inputMethod === plan.example.inputMethod,
      taskMatches: source.taskType === plan.example.taskType,
      sourceTerminalAnswerFingerprint: plan.sourceTerminalAnswerFingerprint,
      exampleTerminalAnswerFingerprint: plan.exampleTerminalAnswerFingerprint,
      answerDisclosurePolicy: plan.answerDisclosurePolicy,
      resolutionMode: plan.resolutionMode,
    };
  });
  expect(tutorialContract).not.toBeNull();
  expect(tutorialContract.parametersDiffer).toBe(true);
  expect(tutorialContract.structureMatches).toBe(true);
  if (tutorialContract.resolutionMode === "SAME_TASK_DIFFERENT_ANSWER") expect(tutorialContract.taskMatches).toBe(true);
  if (tutorialContract.answerDisclosurePolicy === "DIFFERENT_ANSWER_REQUIRED") {
    expect(tutorialContract.exampleTerminalAnswerFingerprint).not.toBe(tutorialContract.sourceTerminalAnswerFingerprint);
  }
  expect(identity.answerDisclosurePolicy).toBe(tutorialContract.answerDisclosurePolicy);
  expect(identity.resolutionMode).toBe(tutorialContract.resolutionMode);
  const phaseSignatures = [];
  await expectTutorialStep(page, 1, identity);
  await expectOnFirstScreen(page.getByRole("button", { name: "Next step", exact: true }), page);
  phaseSignatures.push(await tutorialPhaseSignature(page));
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 2, identity);
  phaseSignatures.push(await tutorialPhaseSignature(page));
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 3, identity);
  phaseSignatures.push(await tutorialPhaseSignature(page));
  expect(new Set(phaseSignatures.map(tutorialVisualOnlySignature)).size).toBe(3);
  await activate(page.getByRole("button", { name: "Previous step", exact: true }), page);
  await expectTutorialStep(page, 2, identity);
  await activate(page.getByRole("button", { name: "Back to your question", exact: true }), page);
  const restored = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await expect(restored).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
});

test("[PW-F-06] keyboard play and isolated Parent Test mechanics remain child-legible", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#child-name-input")).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Continue without a name" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Start/u })).toBeFocused();
  await page.keyboard.press("Enter");
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await page.keyboard.press("Enter");
  const physicalDone = page.locator('button[data-action="physical-done"]:visible');
  if (await physicalDone.count()) await page.keyboard.press("Enter");
  await expect(page.locator("section.question")).toBeVisible();
  await activate(page.getByRole("button", { name: "Home", exact: true }), page);
  await expect(page.getByRole("button", { name: /Start/u })).toBeVisible();
  await activate(page.getByRole("button", { name: "Grown-ups corner", exact: true }), page);
  await expect(page.getByRole("button", { name: "Leave preview", exact: true })).toHaveCount(0);
  const enterLab = page.getByRole("button", { name: "Parent test lab", exact: true });
  const before = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  await activate(enterLab, page);
  await expect(page.getByRole("heading", { name: "Parent test lab", exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "Next sample", exact: true }), page);
  const sourceQuestionId = await page.locator("article.lab-question").getAttribute("data-question-id");
  await activate(page.getByRole("button", { name: "Show tutorial", exact: true }), page);
  const identity = await tutorialIdentity(page);
  expect(identity.sourceQuestionId).toBe(sourceQuestionId);
  expect(identity.exampleQuestionId).not.toBe(sourceQuestionId);
  await expectTutorialStep(page, 1, identity);
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 2, identity);
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 3, identity);
  await activate(page.getByRole("button", { name: "Back to your question", exact: true }), page);
  await expect(page.locator("article.lab-question")).toHaveAttribute("data-question-id", sourceQuestionId || "");
  await expect(page.locator("article.lab-question .answer-controls")).toBeVisible();

  await page.locator("#lab-level").selectOption("3");
  await waitForLabSettled(page);
  await page.locator("#lab-skill").selectOption("MQ-013");
  await waitForLabSettled(page);
  const actionQuestion = page.locator('article.lab-question[data-input-method="ACTION_SCENE"]');
  await expect(actionQuestion).toBeVisible();
  await expect(actionQuestion.locator(".action-scene-count")).toBeVisible();
  await expect(actionQuestion.locator(".action-result-choices")).toHaveCount(0);
  await activate(actionQuestion.locator('[data-response-action="direct-action"]'), page);
  const resultChoices = actionQuestion.locator('[data-response-action="action-value"]');
  await expect(resultChoices.first()).toBeVisible();
  expect(await resultChoices.count()).toBeGreaterThanOrEqual(3);
  const prompt = await actionQuestion.locator(".prompt").innerText();
  const operation = /What is\s+(\d+)\s*([+−-])\s*(\d+)/u.exec(prompt);
  expect(operation).not.toBeNull();
  const expected = operation[2] === "+"
    ? Number(operation[1]) + Number(operation[3])
    : Number(operation[1]) - Number(operation[3]);
  const resultValues = (await resultChoices.allTextContents()).map((value) => Number(value.trim()));
  const wrongIndex = resultValues.findIndex((value) => Number.isFinite(value) && value !== expected);
  expect(wrongIndex).toBeGreaterThanOrEqual(0);
  await activate(resultChoices.nth(wrongIndex), page);
  await activate(page.getByRole("button", { name: "Test answer", exact: true }), page);
  await expect(page.locator("[data-lab-result]")).toHaveText("Not correct.");

  await page.locator("#lab-skill").selectOption("MQ-015");
  await waitForLabSettled(page);
  const shareQuestion = page.locator('article.lab-question[data-input-method="SHARE_DEAL"]');
  await expect(shareQuestion).toBeVisible();
  const shareGeometry = await shareQuestion.evaluate((element) => {
    const controls = element.querySelector(".answer-controls").getBoundingClientRect();
    const mats = element.querySelector(".share-mats");
    const matBox = mats.getBoundingClientRect();
    const cards = [...mats.querySelectorAll(".share-mat")].map((card) => card.getBoundingClientRect());
    return {
      cardCount: cards.length,
      centerDelta: Math.abs((cards.reduce((sum, card) => sum + card.left + card.width / 2, 0) / cards.length)
        - (controls.left + controls.width / 2)),
      rowDelta: cards.length > 1 ? Math.abs(cards[0].top - cards[1].top) : 0,
      contained: cards.every((card) => card.left >= matBox.left - 1 && card.right <= matBox.right + 1),
    };
  });
  expect(shareGeometry.cardCount).toBe(2);
  expect(shareGeometry.centerDelta).toBeLessThanOrEqual(2);
  expect(shareGeometry.rowDelta).toBeLessThanOrEqual(2);
  expect(shareGeometry.contained).toBe(true);

  await selectLabSkill(page, 11, "MQ-063");
  const sample = page.locator("#lab-sample");
  await sample.fill("614");
  await sample.press("Tab");
  await waitForLabSettled(page);
  await activate(page.getByRole("button", { name: "Show tutorial", exact: true }), page);
  await waitForLabSettled(page);
  const array = page.locator('.tutorial-example .array-bounded[data-array-rows="2"][data-array-columns="35"]');
  await expect(array).toBeVisible();
  await expect(array.locator(".array-bounded-row")).toHaveCount(2);
  await expect(array.getByText("Row 1: 35", { exact: true })).toBeVisible();
  await expect(array.getByText("Row 2: 35", { exact: true })).toBeVisible();
  await expect(array.locator("i")).toHaveCount(70);
  expect(await array.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await activate(page.getByRole("button", { name: "Back to your question", exact: true }), page);
  await waitForLabSettled(page);

  await selectLabSkill(page, 21, "MQ-121");
  const areaQuestion = page.locator('article.lab-question[data-skill-id="MQ-121"]');
  await activate(page.getByRole("button", { name: "Show teaching model", exact: true }), page);
  await waitForLabSettled(page);
  const areaIds = await areaQuestion.locator("[id]").evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(areaIds).size).toBe(areaIds.length);
  expect(await areaQuestion.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await selectLabSkill(page, 21, "MQ-122");
  const volumeQuestion = page.locator('article.lab-question[data-skill-id="MQ-122"]');
  await expect(volumeQuestion.locator(".isometric-prism")).toBeVisible();
  const prismPresentation = await volumeQuestion.locator(".isometric-prism").evaluate((element) => ({
    contained: element.getBoundingClientRect().width <= element.parentElement.getBoundingClientRect().width + 1,
    separatorsUnfilled: [...element.querySelectorAll("polyline")].every((line) => getComputedStyle(line).fill === "none"),
  }));
  expect(prismPresentation.contained).toBe(true);
  expect(prismPresentation.separatorsUnfilled).toBe(true);

  await selectLabSkill(page, 20, "MQ-115");
  const procedureQuestion = page.locator('article.lab-question[data-skill-id="MQ-115"]');
  for (let sample = 0; sample < 6 && await procedureQuestion.getAttribute("data-task-type") !== "subtraction"; sample += 1) {
    await activate(page.getByRole("button", { name: "Next sample", exact: true }), page);
  }
  await expect(procedureQuestion).toHaveAttribute("data-task-type", "subtraction");
  await activate(page.getByRole("button", { name: "Show tutorial", exact: true }), page);
  const procedureIdentity = await tutorialIdentity(page);
  expect(procedureIdentity.answerDisclosurePolicy).toBe("PROCEDURE_ONLY_REQUIRED");
  expect(procedureIdentity.resolutionMode).toBe("PROCEDURE_ONLY");
  await expectTutorialStep(page, 1, procedureIdentity);
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 2, procedureIdentity);
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  const procedurePanel = await expectTutorialStep(page, 3, procedureIdentity);
  await expect(procedurePanel).toHaveAttribute("data-answer-source", "procedure-only");
  await expect(procedurePanel.locator(".tutorial-example .model")).toHaveCount(0);
  const procedureDisclosure = await page.evaluate(() => {
    const article = document.querySelector('article.lab-question[data-skill-id="MQ-115"][data-task-type="subtraction"]');
    const panel = article?.querySelector('[data-tutorial="different-example"]');
    const exampleText = String(panel?.querySelector(".tutorial-example")?.textContent || "").replace(/\s+/gu, " ").trim();
    const terminal = "0";
    return { exampleText, terminalVisible: new RegExp(`(^|[^0-9])${terminal}([^0-9]|$)`, "u").test(exampleText) };
  });
  expect(procedureDisclosure.terminalVisible).toBe(false);
  await activate(page.getByRole("button", { name: "Exit test lab", exact: true }), page);
  await activate(page.getByRole("button", { name: "Home", exact: true }), page);
  await activate(page.getByRole("button", { name: "Note for parents", exact: true }), page);
  await activate(page.getByRole("button", { name: "Privacy", exact: true }), page);
  const legal = page.locator('[data-legal-document="privacy"]');
  await expect(legal.locator(":scope > h1")).toBeFocused();
  await expect(legal.getByRole("heading", { name: "Privacy", exact: true })).toHaveCount(1);
  await expect(legal.locator(".legal-document__body")).toContainText("Math Quest keeps gameplay information in the browser.");
  expect(await legal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await activate(page.getByRole("button", { name: "Back to the parent note", exact: true }), page);
  await activate(page.getByRole("button", { name: "Licences and attributions", exact: true }), page);
  const notices = page.locator('[data-legal-document="notices"]');
  await expect(notices.locator(":scope > h1")).toBeFocused();
  await expect(notices.getByRole("link", { name: "Open Government Licence v3.0", exact: true })).toHaveAttribute("href", "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/");
  await expect(notices.getByRole("table")).toHaveCount(1);
  await expect(notices.getByRole("columnheader", { name: "File", exact: true })).toBeVisible();
  const noticesText = await notices.locator(".legal-document__body").innerText();
  expect(noticesText).not.toMatch(/\]\(https:\/\/|<https:\/\/|\|\s*File\s*\|/u);
  expect(await notices.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await activate(page.getByRole("button", { name: "Back to the parent note", exact: true }), page);
  await activate(page.getByRole("button", { name: "MIT licence", exact: true }), page);
  const license = page.locator('[data-legal-document="license"]');
  await expect(license.locator(":scope > h1")).toBeFocused();
  await expect(license.locator(".legal-document__body")).toContainText("Permission is hereby granted, free of charge");
  expect(await license.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await activate(page.getByRole("button", { name: "Back to the parent note", exact: true }), page);
  const after = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  expect(after).toBe(before);
});

test("[PW-F-07] a child can complete a direct-construction question with native pointer or touch actions", async ({ page }) => {
  const question = await openFirstQuestion(page);
  await expect(question).toHaveAttribute("data-input-method", "PAIR_LINK");
  await completeCurrentPairLinkQuestion(page);
});

test("[PW-F-08] an unfinished selected answer survives a real page reload", async ({ page }) => {
  await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  const option = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await activate(option, page);
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await page.reload({ waitUntil: "domcontentloaded" });
  const restored = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await expect(restored).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
});

test("[PW-F-09] an incorrect answer offers one tutorial and returns to the same question for retry", async ({ page }) => {
  const question = await openRegularPatternQuestion(page);
  await expectPatternResponseSingleRow(question);
  const responses = await patternResponsePlan(page);
  const before = await savedSessionSnapshot(page);
  expect(before.skillId).toBe("MQ-004");
  await answerPatternResponse(page, responses.incorrect, "incorrect", {
    beforeConfirm: () => expectPatternResponseSingleRow(question),
  });
  const pending = await savedSessionSnapshot(page);
  expect(pending.questionId).toBe(before.questionId);
  expect(pending.phase).toBe("feedback");
  expect(pending.attemptCommitted).toBe(false);
  expect(pending.lastFeedbackClass).toBe("INCORRECT");
  expect(pending.lastEvidenceClass).toBe("CONSTRUCTION");
  const offer = page.locator(".tutorial-offer");
  await expect(offer.getByText("Would a different example help?", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(1);
  await activate(offer.getByRole("button", { name: "? Show me how", exact: true }), page);
  const identity = await tutorialIdentity(page);
  expect(identity.sourceQuestionId).toBe(before.questionId);
  const assisted = await savedSessionSnapshot(page);
  expect(assisted.phase).toBe("question");
  expect(assisted.tutorialOpen).toBe(true);
  expect(assisted.hintUsed).toBe(true);
  expect(assisted.attemptCommitted).toBe(true);
  expect(assisted.lastFeedbackClass).toBeNull();
  expect(assisted.feedbackHistoryCount).toBe(before.feedbackHistoryCount + 1);
  expect(assisted.evidenceCount).toBe(before.evidenceCount);
  expect(assisted.practiceCount).toBe(before.practiceCount);
  expect(assisted.skillEvidenceCount).toBe(before.skillEvidenceCount);
  expect(assisted.skillMissCount).toBe(before.skillMissCount);
  await activate(page.getByRole("button", { name: "Back to your question", exact: true }), page);
  await answerPatternResponse(page, responses.correct, "correct", {
    beforeConfirm: () => expectPatternResponseSingleRow(question),
  });
  const correctRetry = await savedSessionSnapshot(page);
  expect(correctRetry.attemptCommitted).toBe(false);
  expect(correctRetry.lastFeedbackClass).toBe("CORRECT_WITH_STRUGGLE");
  expect(correctRetry.lastEvidenceClass).toBe("NON_EVIDENCE");
  await activate(page.getByRole("button", { name: "Next", exact: true }), page);
  const retried = await savedSessionSnapshot(page, before.skillId);
  expect(retried.evidenceCount).toBe(before.evidenceCount);
  expect(retried.practiceCount).toBe(before.practiceCount);
  expect(retried.skillEvidenceCount).toBe(before.skillEvidenceCount);
  expect(retried.skillMissCount).toBe(before.skillMissCount);
});

test("[PW-F-10] an open tutorial and its exact step survive a real page reload", async ({ page }) => {
  await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  const option = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await activate(option, page);
  await activate(visibleTutorialButton(page), page);
  const identity = await tutorialIdentity(page);
  await activate(page.getByRole("button", { name: "Next step", exact: true }), page);
  await expectTutorialStep(page, 2, identity);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectTutorialStep(page, 2, identity);
  const restoredState = await savedSessionSnapshot(page);
  expect(restoredState.tutorialOpen).toBe(true);
  expect(restoredState.tutorialStep).toBe(2);
  expect(restoredState.selected).toBe(ids.correct);
  await activate(page.getByRole("button", { name: "Back to your question", exact: true }), page);
  await expect(page.locator(`[data-action="select"][data-id="${ids.correct}"]`)).toHaveAttribute("aria-pressed", "true");
});

test("[PW-F-11] Find Your Level keeps Replay and Not sure but never offers a tutorial", async ({ page }) => {
  await openFreshHome(page);
  await activate(page.getByRole("button", { name: "Grown-ups corner", exact: true }), page);
  await activate(page.getByRole("button", { name: "Starting point", exact: true }), page);
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(0);
  await activate(page.getByRole("button", { name: "Start the check", exact: true }), page);
  await expect(page.locator("[data-placement-screen]")).toBeVisible();
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Not sure", exact: true })).toBeVisible();
});

test("[PW-F-12] tutorial controls follow a native keyboard focus path", async ({ page }) => {
  await openPreviewSelectionQuestion(page);
  const tutorial = visibleTutorialButton(page);
  await tabUntilFocused(page, tutorial);
  await expect(tutorial).toBeFocused();
  await page.keyboard.press("Enter");
  await expectTutorialStep(page, 1);
  const next = page.getByRole("button", { name: "Next step", exact: true });
  await page.keyboard.press("Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Enter");
  await expectTutorialStep(page, 2);
  const previous = page.getByRole("button", { name: "Previous step", exact: true });
  await page.keyboard.press("Tab");
  await expect(previous).toBeFocused();
  await page.keyboard.press("Tab");
  const nextAgain = page.getByRole("button", { name: "Next step", exact: true });
  await expect(nextAgain).toBeFocused();
  await page.keyboard.press("Tab");
  const back = page.getByRole("button", { name: "Back to your question", exact: true });
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-tutorial="different-example"]')).toHaveCount(0);
  await expect(page.locator("section.question .question-response")).toBeVisible();
});

test("[PW-F-13] activated design tokens load without changing rendered pixels until consumed", async ({ page }) => {
  const projectionPath = "**/assets/design/math-quest-design-tokens-v1.css";
  const projectionSelector = 'link[data-mq-design-token-projection="v1"]';
  const pixelDigest = async () => createHash("sha256")
    .update(await page.screenshot({ animations: "disabled", caret: "hide", fullPage: true }))
    .digest("hex");
  const settle = async () => {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("#app")).toBeVisible();
  };
  const runtimeConsumerState = async () => page.evaluate(({ prefix, selector }) => {
    const projectionLink = document.querySelector(selector);
    const canonicalCss = (value) => String(value).replace(
      /\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giu,
      (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)),
    ).toLowerCase();
    const consumers = [];
    const inaccessible = [];
    const inspectStyle = (style, owner) => {
      for (let index = 0; index < style.length; index += 1) {
        const property = style.item(index);
        const declaration = canonicalCss(`${property}:${style.getPropertyValue(property)}`);
        if (declaration.includes(prefix)) consumers.push(`${owner}:${property}`);
      }
    };
    const inspectRules = (rules, owner) => {
      for (let index = 0; index < rules.length; index += 1) {
        const rule = rules[index];
        if (canonicalCss(rule.cssText).includes(prefix)) consumers.push(`${owner}:rule-${index}:css-text`);
        if (rule.style) inspectStyle(rule.style, `${owner}:rule-${index}`);
        if (rule.cssRules) inspectRules(rule.cssRules, `${owner}:rule-${index}`);
        if (rule.styleSheet) {
          try { inspectRules(rule.styleSheet.cssRules, `${owner}:rule-${index}:import`); }
          catch (error) { inaccessible.push(`${owner}:rule-${index}:import:${error.name}`); }
        }
      }
    };
    [...document.styleSheets].forEach((sheet, index) => {
      if (sheet === projectionLink?.sheet) return;
      try { inspectRules(sheet.cssRules, `sheet-${index}`); }
      catch (error) { inaccessible.push(`sheet-${index}:${error.name}`); }
    });
    [...document.querySelectorAll("[style]")].forEach((element, index) => inspectStyle(element.style, `inline-${index}`));
    return { consumers, inaccessible };
  }, { prefix: "--mq-conservatory-", selector: projectionSelector });

  await settle();
  await expect(page.locator(projectionSelector)).toHaveCount(1);
  const cssom = await page.evaluate(({ expectedPathname, prefix, selector }) => {
    const projectionLinks = [...document.querySelectorAll("link[href]")]
      .filter((candidate) => new URL(candidate.getAttribute("href"), document.baseURI).pathname === expectedPathname);
    const markerLinks = [...document.querySelectorAll("link[data-mq-design-token-projection]")];
    const link = document.querySelector(selector);
    const sheet = link?.sheet || null;
    const rules = sheet ? [...sheet.cssRules] : [];
    const rootRule = rules[0] || null;
    const properties = rootRule?.style
      ? Array.from({ length: rootRule.style.length }, (_, index) => rootRule.style.item(index))
      : [];
    return {
      exactProjectionLinkCount: projectionLinks.length,
      exactMarkerLinkCount: markerLinks.length,
      projectionLinkIsMarkerLink: projectionLinks[0] === markerLinks[0],
      href: link?.getAttribute("href") || null,
      rel: link?.getAttribute("rel") || null,
      loaded: Boolean(sheet),
      ruleCount: rules.length,
      rootSelector: rootRule?.selectorText || null,
      properties,
      namespaceClosed: properties.every((property) => property.startsWith(prefix)),
    };
  }, {
    expectedPathname: "/assets/design/math-quest-design-tokens-v1.css",
    prefix: "--mq-conservatory-",
    selector: projectionSelector,
  });
  expect(cssom.exactProjectionLinkCount).toBe(1);
  expect(cssom.exactMarkerLinkCount).toBe(1);
  expect(cssom.projectionLinkIsMarkerLink).toBe(true);
  expect(cssom.href).toBe("assets/design/math-quest-design-tokens-v1.css");
  expect(cssom.rel).toBe("stylesheet");
  expect(cssom.loaded).toBe(true);
  expect(cssom.ruleCount).toBe(1);
  expect(cssom.rootSelector).toBe(":root");
  expect(cssom.properties).toHaveLength(63);
  expect(cssom.namespaceClosed).toBe(true);
  expect(await runtimeConsumerState()).toEqual({ consumers: [], inaccessible: [] });
  const futureConsumer = await page.addStyleTag({
    content: ".future-only-state{transform:translateX(var(--mq-conservatory-dimension-body-min))}",
  });
  expect((await runtimeConsumerState()).consumers.length).toBeGreaterThan(0);
  await futureConsumer.evaluate((element) => element.remove());
  expect(await runtimeConsumerState()).toEqual({ consumers: [], inaccessible: [] });
  const futureProperty = await page.addStyleTag({
    content: "@property --mq-conservatory-future-length{syntax:'<length>';inherits:false;initial-value:0px}",
  });
  expect((await runtimeConsumerState()).consumers.length).toBeGreaterThan(0);
  await futureProperty.evaluate((element) => element.remove());
  expect(await runtimeConsumerState()).toEqual({ consumers: [], inaccessible: [] });
  const activatedDigest = await pixelDigest();

  await page.route(projectionPath, (route) => route.fulfill({
    status: 200,
    contentType: "text/css; charset=utf-8",
    body: "",
  }));
  await settle();
  const emptyProjectionDigest = await pixelDigest();
  expect(activatedDigest).toBe(emptyProjectionDigest);
  await page.unroute(projectionPath);

  await page.route(projectionPath, (route) => route.fulfill({
    status: 200,
    contentType: "text/css; charset=utf-8",
    body: ":root{--mq-conservatory-negative-control:translateX(17px)}#app{transform:var(--mq-conservatory-negative-control)!important}",
  }));
  await settle();
  const consumedProjectionDigest = await pixelDigest();
  expect(consumedProjectionDigest).not.toBe(activatedDigest);
});
