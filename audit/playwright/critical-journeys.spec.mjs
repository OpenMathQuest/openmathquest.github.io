import { readFile } from "node:fs/promises";
import {
  designTokenProjectionProperties,
  expectedRuntimeConsumers,
} from "../lib/design-token-projection.mjs";
import {
  ART_QUESTION_SHELL_RAIL_LABELS,
  ART_QUESTION_ZONE_NARROW_MAX_PX,
  artQuestionShellIssues,
  artQuestionZoneIssues,
} from "../lib/art-question-shell.mjs";
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

const DESIGN_TOKENS = JSON.parse(await readFile(new URL("../../assets/design/math-quest-design-tokens-v1.json", import.meta.url), "utf8"));
const FUNCTIONAL_ART_STYLE_ORIGIN = 'style[data-mq-functional-art="ART-MIG-05"]';
const EXPECTED_RUNTIME_TOKEN_CONSUMERS = Object.freeze(expectedRuntimeConsumers(DESIGN_TOKENS).map((record) => Object.freeze({
  origin: FUNCTIONAL_ART_STYLE_ORIGIN,
  ...record,
})));
const EXPECTED_PROJECTED_PROPERTIES = Object.freeze(designTokenProjectionProperties(DESIGN_TOKENS).map((record) => record.name));

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
      boxShadow: style.boxShadow,
      markerContent: marker.content,
    };
  });
  expect(presentation.backgroundImage).toContain("repeating-linear-gradient");
  expect(presentation.boxShadow).toContain("inset");
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

async function questionZoneSnapshot(page, expectedLayout, {
  requiresFirstScreenResponse = false,
  requiresFirstScreenTutorial = false,
} = {}) {
  return page.evaluate(({ expectedLayout, requiresFirstScreenResponse, requiresFirstScreenTutorial }) => {
    const question = document.querySelector('[data-art-question-shell="ART-MIG-04"]');
    const layout = question?.querySelector('[data-art-zone-layout="ART-MIG-05"]') || null;
    const supportScroll = layout?.closest(".support-scroll") || null;
    const observation = layout?.querySelector(':scope > [data-art-question-zone="OBSERVATION"]') || null;
    const construction = layout?.querySelector(':scope > [data-art-question-zone="CONSTRUCTION"]') || null;
    const response = construction?.querySelector(".question-response") || null;
    const answerRegion = response?.querySelector(".answer-controls") || null;
    const confirm = response?.querySelector('button[data-action="confirm"]') || null;
    const rail = document.querySelector('[data-art-instrument-rail="ART-MIG-04"]');
    const tutorialAction = rail?.querySelector('button[data-action="tutorial"]:not([hidden])') || null;
    const follows = (left, right) => Boolean(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
    const rendered = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const responseControls = answerRegion ? [...answerRegion.querySelectorAll("button,input,select,textarea,[tabindex]")]
      .filter((element) => !element.disabled && rendered(element)) : [];
    const firstResponse = responseControls[0] || null;
    const observationBounds = observation?.getBoundingClientRect() || null;
    const constructionBounds = construction?.getBoundingClientRect() || null;
    const firstResponseBounds = firstResponse?.getBoundingClientRect() || null;
    const tutorialActionBounds = tutorialAction?.getBoundingClientRect() || null;
    const onFirstScreen = (bounds) => Boolean(bounds
      && bounds.left >= -1
      && bounds.right <= innerWidth + 1
      && bounds.top >= -1
      && bounds.bottom <= innerHeight + 1);
    const overlapWidth = observationBounds && constructionBounds ? Math.max(0, Math.min(observationBounds.right, constructionBounds.right) - Math.max(observationBounds.left, constructionBounds.left)) : 0;
    const overlapHeight = observationBounds && constructionBounds ? Math.max(0, Math.min(observationBounds.bottom, constructionBounds.bottom) - Math.max(observationBounds.top, constructionBounds.top)) : 0;
    const observationStyle = observation ? getComputedStyle(observation) : null;
    const constructionStyle = construction ? getComputedStyle(construction) : null;
    const layoutStyle = layout ? getComputedStyle(layout) : null;
    const supportScrollStyle = supportScroll ? getComputedStyle(supportScroll) : null;
    const staticStimuli = question ? [...question.querySelectorAll('[data-answer-free="true"]')] : [];
    const referenceSupports = question ? [...question.querySelectorAll(".question-support")] : [];
    const workedReferences = question ? [...question.querySelectorAll('[data-worked-result="true"]')] : [];
    const targetRecords = [...responseControls, ...(confirm ? [confirm] : [])].map((element) => ({
      action: element.getAttribute("data-action") || element.getAttribute("data-response-action") || "answer",
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    return {
      layoutCount: question?.querySelectorAll('[data-art-zone-layout="ART-MIG-05"]').length || 0,
      observationCount: layout?.querySelectorAll(':scope > [data-art-question-zone="OBSERVATION"]').length || 0,
      constructionCount: layout?.querySelectorAll(':scope > [data-art-question-zone="CONSTRUCTION"]').length || 0,
      observationBeforeConstruction: follows(observation, construction),
      promptInObservation: Boolean(observation?.contains(layout?.querySelector(".prompt"))),
      staticStimulusCount: staticStimuli.length,
      staticStimulusInObservationCount: staticStimuli.filter((element) => observation?.contains(element)).length,
      referenceSupportCount: referenceSupports.length,
      referenceSupportInObservationCount: referenceSupports.filter((element) => observation?.contains(element)).length,
      workedReferenceCount: workedReferences.length,
      workedReferenceInObservationCount: workedReferences.filter((element) => observation?.contains(element)).length,
      responseInConstruction: Boolean(response && construction?.contains(response)),
      confirmInConstruction: Boolean(confirm && construction?.contains(confirm)),
      responseBeforeConfirm: responseControls.length > 0 && responseControls.every((control) => follows(control, confirm)),
      confirmBeforeRail: follows(confirm, rail),
      responseControlCount: responseControls.length,
      firstResponseDiscoverable: Boolean(firstResponseBounds && constructionBounds
        && firstResponseBounds.left >= constructionBounds.left - 1
        && firstResponseBounds.right <= constructionBounds.right + 1
        && firstResponseBounds.top >= constructionBounds.top - 1
        && firstResponseBounds.bottom <= constructionBounds.bottom + 1),
      requiresFirstScreenResponse,
      firstResponseOnFirstScreen: onFirstScreen(firstResponseBounds),
      requiresFirstScreenTutorial,
      tutorialActionOnFirstScreen: rendered(tutorialAction) && onFirstScreen(tutorialActionBounds),
      cssOrders: {
        observation: Number.parseInt(observationStyle?.order || "0", 10),
        construction: Number.parseInt(constructionStyle?.order || "0", 10),
        response: responseControls.map((control) => Number.parseInt(getComputedStyle(control).order || "0", 10)),
        confirm: Number.parseInt(confirm ? getComputedStyle(confirm).order : "0", 10),
      },
      tabIndexes: { response: responseControls.map((control) => control.tabIndex), confirm: confirm?.tabIndex ?? -1 },
      zoneOverlapArea: overlapWidth * overlapHeight,
      expectedLayout,
      stacked: Boolean(observationBounds && constructionBounds && constructionBounds.top >= observationBounds.bottom - 1),
      paired: Boolean(observationBounds && constructionBounds && constructionBounds.left >= observationBounds.right - 1 && overlapHeight > 0),
      observationBorderStyle: observationStyle?.borderTopStyle || "missing",
      constructionBorderStyle: constructionStyle?.borderTopStyle || "missing",
      observationBackground: observationStyle?.backgroundColor || "missing",
      constructionBackground: constructionStyle?.backgroundColor || "missing",
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      zoneScrollWidth: layout?.scrollWidth || 0,
      zoneClientWidth: layout?.clientWidth || 0,
      supportScrollWidth: supportScroll?.scrollWidth || 0,
      supportClientWidth: supportScroll?.clientWidth || 0,
      supportScrollHeight: supportScroll?.scrollHeight || 0,
      supportClientHeight: supportScroll?.clientHeight || 0,
      supportScrollOverflowX: supportScrollStyle?.overflowX || "missing",
      supportScrollOverflowY: supportScrollStyle?.overflowY || "missing",
      layoutOverflowX: layoutStyle?.overflowX || "missing",
      layoutOverflowY: layoutStyle?.overflowY || "missing",
      observationOverflowX: observationStyle?.overflowX || "missing",
      observationOverflowY: observationStyle?.overflowY || "missing",
      constructionOverflowX: constructionStyle?.overflowX || "missing",
      constructionOverflowY: constructionStyle?.overflowY || "missing",
      targets: targetRecords,
    };
  }, { expectedLayout, requiresFirstScreenResponse, requiresFirstScreenTutorial });
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
  await expect(page.locator('[data-action="physical-done"]')).toHaveCount(0);
  await expect(page.locator("section.question")).toBeVisible();
  await expect(page.locator("section.question .question-response")).toBeVisible();
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

test("[PW-F-13] activated design tokens expose exactly the governed ART-MIG-05 runtime consumers", async ({ page }) => {
  const projectionSelector = 'link[data-mq-design-token-projection="v1"]';
  const settle = async () => {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("#app")).toBeVisible();
  };
  const runtimeConsumerState = async () => page.evaluate(() => {
    const projectionLink = document.querySelector('link[data-mq-design-token-projection="v1"]');
    const styleElement = document.querySelector('style[data-mq-functional-art="ART-MIG-05"]');
    const consumers = [];
    const inaccessible = [];
    const unparsed = [];
    const canonicalCss = (value) => String(value).replace(
      /\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giu,
      (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)),
    ).toLowerCase();
    const inspectStyle = (style, selector, origin) => {
      for (let index = 0; index < style.length; index += 1) {
        const cssProperty = style.item(index);
        const value = style.getPropertyValue(cssProperty);
        const tokenNames = [...value.matchAll(/var\(\s*(--mq-conservatory-[a-z0-9-]+)\s*\)/gu)].map((match) => match[1]);
        if (tokenNames.length) consumers.push({ origin, selector: selector.toLowerCase(), cssProperty, tokenNames });
        if (canonicalCss(cssProperty).includes("--mq-conservatory-")) unparsed.push(`${origin}:${selector}:${cssProperty}:custom-property-declaration`);
        const namespaceUses = [...canonicalCss(value).matchAll(/--mq-conservatory-/gu)].length;
        if (namespaceUses !== tokenNames.length) unparsed.push(`${origin}:${selector}:${cssProperty}:unparsed-namespace-use`);
      }
    };
    const inspectRules = (rules, origin) => {
      for (let index = 0; index < rules.length; index += 1) {
        const rule = rules[index];
        if (rule.style) inspectStyle(rule.style, rule.selectorText || `@rule-${index}`, origin);
        if (rule.cssRules) inspectRules(rule.cssRules, origin);
        if (rule.styleSheet) {
          try { inspectRules(rule.styleSheet.cssRules, `${origin}:import-${index}`); }
          catch (error) { inaccessible.push(`${origin}:import-${index}:${error.name}`); }
        }
        if (!rule.style && !rule.cssRules && !rule.styleSheet && canonicalCss(rule.cssText).includes("--mq-conservatory-")) {
          unparsed.push(`${origin}:rule-${index}:unparsed-namespace-rule`);
        }
      }
    };
    [...document.styleSheets].forEach((sheet, index) => {
      if (sheet === projectionLink?.sheet) return;
      const origin = sheet.ownerNode === styleElement ? 'style[data-mq-functional-art="ART-MIG-05"]' : `sheet-${index}`;
      try { inspectRules(sheet.cssRules, origin); }
      catch (error) { inaccessible.push(`${origin}:${error.name}`); }
    });
    [...document.querySelectorAll("[style]")].forEach((element, index) => inspectStyle(element.style, `inline-${index}`, "inline-style"));
    consumers.sort((left, right) => `${left.origin}\u0000${left.selector}\u0000${left.cssProperty}`.localeCompare(`${right.origin}\u0000${right.selector}\u0000${right.cssProperty}`, "en"));
    return {
      consumers,
      inaccessible: [...new Set(inaccessible)].sort(),
      unparsed: [...new Set(unparsed)].sort(),
    };
  });

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
  expect(cssom.properties).toHaveLength(64);
  expect(cssom.namespaceClosed).toBe(true);
  expect([...cssom.properties].sort()).toEqual([...EXPECTED_PROJECTED_PROPERTIES].sort());
  const expectedRuntimeState = { consumers: EXPECTED_RUNTIME_TOKEN_CONSUMERS, inaccessible: [], unparsed: [] };
  expect(await runtimeConsumerState()).toEqual(expectedRuntimeState);
  const unlistedConsumer = await page.addStyleTag({
    content: ".future-only-state{transform:translateX(var(--mq-conservatory-dimension-body-min))}",
  });
  expect((await runtimeConsumerState()).consumers).toHaveLength(EXPECTED_RUNTIME_TOKEN_CONSUMERS.length + 1);
  await unlistedConsumer.evaluate((element) => element.remove());
  expect(await runtimeConsumerState()).toEqual(expectedRuntimeState);
  await page.locator("#app").evaluate((element) => { element.style.transform = "translateX(var(--mq-conservatory-dimension-body-min))"; });
  expect((await runtimeConsumerState()).consumers).toHaveLength(EXPECTED_RUNTIME_TOKEN_CONSUMERS.length + 1);
  await page.locator("#app").evaluate((element) => { element.style.transform = ""; });
  expect(await runtimeConsumerState()).toEqual(expectedRuntimeState);
  const unparsedProperty = await page.addStyleTag({
    content: "@property --mq-conservatory-future-length{syntax:'<length>';inherits:false;initial-value:0px}",
  });
  expect((await runtimeConsumerState()).unparsed.length).toBeGreaterThan(0);
  await unparsedProperty.evaluate((element) => element.remove());
  expect(await runtimeConsumerState()).toEqual(expectedRuntimeState);
  const resolvedValues = await page.evaluate((names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()])), EXPECTED_PROJECTED_PROPERTIES);
  expect(Object.keys(resolvedValues).sort()).toEqual([...EXPECTED_PROJECTED_PROPERTIES].sort());
  expect(Object.values(resolvedValues).every((value) => value.length > 0)).toBe(true);
});

test("[PW-F-14] functional art keeps identity, selection, focus, and speech status truthful", async ({ page }) => {
  await page.addInitScript(() => {
    const utterances = [];
    let cancelCount = 0;
    const voice = { default: true, lang: "en-CA", localService: true, name: "Math Quest Test Voice", voiceURI: "mq-test-voice" };
    class TestUtterance { constructor(text) { this.text = String(text); this.lang = ""; this.rate = 1; this.voice = null; this.onstart = null; this.onend = null; this.onerror = null; } }
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance) => { utterances.push(utterance); },
      cancel: () => { cancelCount += 1; },
      onvoiceschanged: null,
    };
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: TestUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(window, "__mqSpeechTest", { configurable: true, value: {
      count: () => utterances.length,
      cancelCount: () => cancelCount,
      start: (index = utterances.length - 1) => utterances[index]?.onstart?.(),
      end: (index = utterances.length - 1) => utterances[index]?.onend?.(),
      error: (index = utterances.length - 1) => utterances[index]?.onerror?.({ error: "synthesis-failed" }),
    } });
  });
  await openFreshHome(page);

  const title = page.getByRole("heading", { name: "Math Quest", exact: true });
  const rocket = page.locator('.brand-mark--inquiry svg[data-icon="rocket"]');
  await expect(title).toBeVisible();
  await expect(rocket).toHaveCount(1);
  await expect(rocket).toHaveAttribute("aria-hidden", "true");
  await expect(rocket).toHaveAttribute("focusable", "false");
  const rocketBefore = await rocket.evaluate((element) => ({
    body: element.innerHTML,
    animation: getComputedStyle(element).animationName,
    interactiveAncestor: Boolean(element.closest("button,a,[role=button]")),
    width: element.getBoundingClientRect().width,
  }));
  expect(rocketBefore.animation).toBe("none");
  expect(rocketBefore.interactiveAncestor).toBe(false);
  expect(rocketBefore.width).toBeLessThanOrEqual(44);

  const forest = page.locator('[data-action="world"][data-world="forest"]');
  await activate(forest, page);
  await expectSelectedState(forest, { labelled: true });
  await expect(rocket.evaluate((element) => element.innerHTML)).resolves.toBe(rocketBefore.body);
  await tabUntilFocused(page, forest);
  const focusAndSelection = await forest.evaluate((button) => {
    const style = getComputedStyle(button);
    const marker = getComputedStyle(button, "::after");
    const token = getComputedStyle(document.documentElement).getPropertyValue("--mq-conservatory-colour-action-focus").trim();
    const probe = document.createElement("span");
    probe.style.color = token;
    document.body.append(probe);
    const expectedFocusColour = getComputedStyle(probe).color;
    probe.remove();
    return {
      expectedFocusColour,
      focusColour: style.outlineColor,
      focusWidth: Number.parseFloat(style.outlineWidth),
      hatch: style.backgroundImage,
      inset: style.boxShadow,
      marker: marker.content,
    };
  });
  expect(focusAndSelection.focusColour).toBe(focusAndSelection.expectedFocusColour);
  expect(focusAndSelection.focusWidth).toBeGreaterThanOrEqual(5);
  expect(focusAndSelection.hatch).toContain("repeating-linear-gradient");
  expect(focusAndSelection.inset).toContain("inset");
  expect(focusAndSelection.marker).toContain("Selected");

  const governedSelection = await forest.evaluate((button) => {
    const structuralTokenName = "--mq-conservatory-colour-ink-structural";
    const surfaceTokenName = "--mq-conservatory-colour-surface-ivory";
    const root = document.documentElement;
    const previousStructural = root.style.getPropertyValue(structuralTokenName);
    const previousSurface = root.style.getPropertyValue(surfaceTokenName);
    root.style.setProperty(structuralTokenName, "rgb(1, 2, 3)");
    root.style.setProperty(surfaceTokenName, "rgb(4, 5, 6)");
    const style = getComputedStyle(button);
    const marker = getComputedStyle(button, "::after");
    const observed = {
      hatch: style.backgroundImage,
      inset: style.boxShadow,
      markerColour: marker.color,
      markerBackground: marker.backgroundColor,
      markerBorder: marker.borderColor,
    };
    if (previousStructural) root.style.setProperty(structuralTokenName, previousStructural);
    else root.style.removeProperty(structuralTokenName);
    if (previousSurface) root.style.setProperty(surfaceTokenName, previousSurface);
    else root.style.removeProperty(surfaceTokenName);
    return observed;
  });
  expect(governedSelection.hatch).toContain("rgb(1, 2, 3)");
  expect(governedSelection.inset).toContain("rgb(1, 2, 3)");
  expect(governedSelection.markerColour).toBe("rgb(1, 2, 3)");
  expect(governedSelection.markerBackground).toBe("rgb(4, 5, 6)");
  expect(governedSelection.markerBorder).toBe("rgb(1, 2, 3)");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await tabUntilFocused(page, forest);
  const forcedState = await forest.evaluate((button) => ({
    outlineWidth: Number.parseFloat(getComputedStyle(button).outlineWidth),
    marker: getComputedStyle(button, "::after").content,
  }));
  expect(forcedState.outlineWidth).toBeGreaterThanOrEqual(4);
  expect(forcedState.marker).toContain("Selected");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });

  const replay = page.getByRole("button", { name: "Replay", exact: true });
  const disc = replay.locator("[data-resonance-disc]");
  await expect(replay).toBeVisible();
  await expectMinimumTarget(replay);
  await expect(disc).toHaveCount(1);
  await expect(disc).toHaveAttribute("aria-hidden", "true");
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");
  await expect(page.locator("[data-resonance-disc][role],[data-resonance-disc][tabindex]" )).toHaveCount(0);
  expect(await disc.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  await expect(disc).toBeVisible();

  await activate(replay, page);
  expect(await page.evaluate(() => window.__mqSpeechTest.count())).toBe(1);
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");
  await page.evaluate(() => window.__mqSpeechTest.start());
  await expect(disc).toHaveAttribute("data-speech-state", "SPEAKING");
  const speakingGeometry = await disc.evaluate((element) => ({
    borderWidth: Number.parseFloat(getComputedStyle(element).borderWidth),
    transitionDuration: getComputedStyle(element).transitionDuration,
    innerInset: getComputedStyle(element, "::before").inset,
  }));
  expect(speakingGeometry.borderWidth).toBeGreaterThanOrEqual(6);
  expect(speakingGeometry.transitionDuration).toBe("0s");
  expect(speakingGeometry.innerInset).toBe("2px");
  await page.evaluate(() => window.__mqSpeechTest.end());
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");

  await activate(replay, page);
  await page.evaluate(() => { window.__mqSpeechTest.start(); window.__mqSpeechTest.error(); });
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");

  await activate(replay, page);
  await page.evaluate(() => window.__mqSpeechTest.start());
  const previousIndex = await page.evaluate(() => window.__mqSpeechTest.count() - 1);
  await activate(replay, page);
  await page.evaluate(() => window.__mqSpeechTest.start());
  await expect(disc).toHaveAttribute("data-speech-state", "SPEAKING");
  await page.evaluate((index) => window.__mqSpeechTest.end(index), previousIndex);
  await expect(disc).toHaveAttribute("data-speech-state", "SPEAKING");
  await page.evaluate(() => window.__mqSpeechTest.end());
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");
  expect(await page.evaluate(() => window.__mqSpeechTest.cancelCount())).toBeGreaterThan(0);

  await activate(page.getByRole("button", { name: /Start/u }), page);
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await activate(chooseQuestion.first(), page);
  await expect(page.locator('[data-action="physical-done"]')).toHaveCount(0);
  await expect(page.locator("section.question")).toBeVisible();
  await expect(page.locator("section.question .question-response")).toBeVisible();
  const sessionReplayButtons = page.locator('button[data-action="replay"]');
  const sessionDiscs = page.locator("[data-resonance-disc]");
  expect(await sessionReplayButtons.count()).toBe(1);
  expect(await sessionDiscs.count()).toBe(1);
  const railReplay = page.locator('.instrument-rail button[data-action="replay"]');
  await expect(railReplay).toBeVisible();
  expect(await railReplay.evaluate((button) => button.nextElementSibling?.getAttribute("data-action"))).toBe("tutorial");
  const replayGeometry = await railReplay.evaluate((button) => {
    const bounds = (element) => {
      const rectangle = element.getBoundingClientRect();
      return { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom };
    };
    const buttonBounds = bounds(button);
    const speaker = button.querySelector(".button-icon");
    const resonance = button.querySelector("[data-resonance-disc]");
    const tutorial = button.nextElementSibling instanceof HTMLElement ? button.nextElementSibling : null;
    const tutorialBounds = tutorial ? bounds(tutorial) : null;
    const overlapWidth = tutorialBounds ? Math.max(0, Math.min(buttonBounds.right, tutorialBounds.right) - Math.max(buttonBounds.left, tutorialBounds.left)) : 0;
    const overlapHeight = tutorialBounds ? Math.max(0, Math.min(buttonBounds.bottom, tutorialBounds.bottom) - Math.max(buttonBounds.top, tutorialBounds.top)) : 0;
    return {
      buttonBounds,
      childBounds: [speaker, resonance].filter(Boolean).map(bounds),
      clientHeight: button.clientHeight,
      clientWidth: button.clientWidth,
      scrollHeight: button.scrollHeight,
      scrollWidth: button.scrollWidth,
      tutorialOverlapArea: overlapWidth * overlapHeight,
    };
  });
  expect(replayGeometry.scrollWidth).toBeLessThanOrEqual(replayGeometry.clientWidth);
  expect(replayGeometry.scrollHeight).toBeLessThanOrEqual(replayGeometry.clientHeight);
  expect(replayGeometry.childBounds.every((child) => child.left >= replayGeometry.buttonBounds.left
    && child.right <= replayGeometry.buttonBounds.right
    && child.top >= replayGeometry.buttonBounds.top
    && child.bottom <= replayGeometry.buttonBounds.bottom)).toBe(true);
  expect(replayGeometry.tutorialOverlapArea).toBe(0);
  await activate(page.locator('button[data-action="replay"]:visible').first(), page);
  await page.evaluate(() => window.__mqSpeechTest.start());
  await expect.poll(() => sessionDiscs.evaluateAll((elements) => elements.every((element) => element.dataset.speechState === "SPEAKING"))).toBe(true);
  await page.evaluate(() => window.__mqSpeechTest.end());
  await expect.poll(() => sessionDiscs.evaluateAll((elements) => elements.every((element) => element.dataset.speechState === "IDLE"))).toBe(true);
});

test("[PW-F-15] one question shell and instrument rail preserve natural order across governed viewports", async ({ page }) => {
  const question = await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  await activate(question.locator(`[data-action="select"][data-id="${ids.correct}"]`), page);
  await expect(question.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
  const viewports = [
    { id: "phone-portrait", width: 390, height: 844 },
    { id: "phone-landscape", width: 844, height: 390 },
    { id: "tablet-portrait", width: 820, height: 1180 },
    { id: "tablet-landscape", width: 1024, height: 768 },
    { id: "large-tablet-landscape", width: 1180, height: 820 },
    { id: "desktop", width: 1366, height: 768 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const snapshot = await page.evaluate(() => {
      const question = document.querySelector('[data-art-question-shell="ART-MIG-04"]');
      const rail = document.querySelector('[data-art-instrument-rail="ART-MIG-04"]');
      const response = question?.querySelector(".question-response") || null;
      const confirm = question?.querySelector('button[data-action="confirm"]') || null;
      const answerRegion = response?.querySelector(".answer-controls") || null;
      const confirmContainer = confirm?.closest(".question-submit") || null;
      const follows = (left, right) => Boolean(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
      const rendered = (element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
      };
      const responseControls = answerRegion ? [...answerRegion.querySelectorAll("button,input,select,textarea,[tabindex]")]
        .filter((element) => !element.disabled && rendered(element)) : [];
      const actionCounts = Object.fromEntries(["replay", "tutorial", "stop"].map((action) => [action, document.querySelectorAll(`button[data-action="${action}"]`).length]));
      const railActions = rail ? [...rail.querySelectorAll("button[data-action]")] : [];
      const questionBounds = question?.getBoundingClientRect() || null;
      const railBounds = rail?.getBoundingClientRect() || null;
      const overlapWidth = questionBounds && railBounds ? Math.max(0, Math.min(questionBounds.right, railBounds.right) - Math.max(questionBounds.left, railBounds.left)) : 0;
      const overlapHeight = questionBounds && railBounds ? Math.max(0, Math.min(questionBounds.bottom, railBounds.bottom) - Math.max(questionBounds.top, railBounds.top)) : 0;
      const questionStyle = question ? getComputedStyle(question) : null;
      const railStyle = rail ? getComputedStyle(rail) : null;
      return {
        questionCount: document.querySelectorAll('[data-art-question-shell="ART-MIG-04"]').length,
        railCount: document.querySelectorAll('[data-art-instrument-rail="ART-MIG-04"]').length,
        actionCounts,
        questionBeforeRail: follows(question, rail),
        responseControlCount: responseControls.length,
        responseRegionBeforeConfirm: follows(answerRegion, confirm),
        responseControlsBeforeConfirm: responseControls.length > 0 && responseControls.every((control) => follows(control, confirm)),
        confirmBeforeRail: follows(confirm, rail),
        railActionOrder: railActions.map((button) => button.getAttribute("data-action")),
        railLabels: railActions.map((button) => ({
          action: button.getAttribute("data-action"),
          visibleText: button.innerText.replace(/\s+/gu, " ").trim(),
        })),
        railVisible: Boolean(rail && !rail.hidden && railStyle?.display !== "none" && railStyle?.visibility !== "hidden" && rail.getBoundingClientRect().width > 0 && rail.getBoundingClientRect().height > 0),
        cssOrder: {
          question: Number.parseInt(questionStyle?.order || "0", 10),
          rail: Number.parseInt(railStyle?.order || "0", 10),
        },
        controlCssOrders: {
          answerRegion: Number.parseInt(answerRegion ? getComputedStyle(answerRegion).order : "0", 10),
          response: responseControls.map((control) => Number.parseInt(getComputedStyle(control).order || "0", 10)),
          confirmContainer: Number.parseInt(confirmContainer ? getComputedStyle(confirmContainer).order : "0", 10),
          confirm: Number.parseInt(confirm ? getComputedStyle(confirm).order : "0", 10),
          rail: railActions.map((button) => Number.parseInt(getComputedStyle(button).order || "0", 10)),
        },
        controlTabIndexes: {
          response: responseControls.map((control) => control.tabIndex),
          confirm: confirm?.tabIndex ?? -1,
          rail: railActions.map((button) => button.tabIndex),
        },
        targets: railActions.map((button) => ({
          action: button.getAttribute("data-action"),
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
          clientHeight: button.clientHeight,
          scrollHeight: button.scrollHeight,
        })),
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        questionOverflowX: questionStyle?.overflowX || "missing",
        questionOverflowY: questionStyle?.overflowY || "missing",
        questionRailOverlapArea: overlapWidth * overlapHeight,
      };
    });
    expect(artQuestionShellIssues(snapshot), viewport.id).toEqual([]);
    await expect(page.locator('[data-art-question-shell="ART-MIG-04"]')).toBeVisible();
    const rail = page.locator('[data-art-instrument-rail="ART-MIG-04"]');
    await expect(rail).toBeVisible();
    for (const [action, label] of Object.entries(ART_QUESTION_SHELL_RAIL_LABELS)) {
      await expect(rail.locator(`button[data-action="${action}"]`)).toHaveText(label);
      await expect(rail.getByRole("button", { name: label, exact: true })).toHaveCount(1);
    }
  }
});

test("[PW-F-16] observation and construction zones preserve semantics and responsive geometry", async ({ page }) => {
  const selection = await openPreviewSelectionQuestion(page);
  const touchProject = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const viewports = [
    { id: "phone-portrait", width: 390, height: 844 },
    { id: "phone-landscape", width: 844, height: 390 },
    { id: "tablet-portrait", width: 820, height: 1180 },
    { id: "tablet-landscape", width: 1024, height: 768 },
    { id: "large-tablet-landscape", width: 1180, height: 820 },
    { id: "desktop", width: 1366, height: 768 },
    { id: "stack-boundary-900", width: 900, height: 900 },
    { id: "stack-boundary-901", width: 901, height: 900 },
    { id: "stack-boundary-1023", width: 1023, height: 768 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const expectedLayout = viewport.width <= ART_QUESTION_ZONE_NARROW_MAX_PX ? "STACKED" : "PAIRED";
    const phoneFirstScreen = touchProject && viewport.id === "phone-portrait";
    expect(artQuestionZoneIssues(await questionZoneSnapshot(page, expectedLayout, {
      requiresFirstScreenResponse: phoneFirstScreen,
      requiresFirstScreenTutorial: phoneFirstScreen,
    })), viewport.id).toEqual([]);
    await expect(selection.locator('[data-art-question-zone="OBSERVATION"]')).toBeVisible();
    await expect(selection.locator('[data-art-question-zone="CONSTRUCTION"]')).toBeVisible();
  }

  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const pattern = await openRegularPatternQuestion(page);
  for (const viewport of [viewports[0], viewports.find(({ id }) => id === "desktop")]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const phoneFirstScreen = touchProject && viewport.id === "phone-portrait";
    expect(artQuestionZoneIssues(await questionZoneSnapshot(page, "STACKED", {
      requiresFirstScreenResponse: phoneFirstScreen,
      requiresFirstScreenTutorial: phoneFirstScreen,
    })), `interactive-${viewport.id}`).toEqual([]);
    await expect(pattern.locator('[data-art-question-zone="CONSTRUCTION"] .pattern-build-task .math-model')).toBeVisible();
    await expect(pattern.locator('[data-art-question-zone="OBSERVATION"] .pattern-build-task')).toHaveCount(0);
  }

  await page.setViewportSize({ width: viewports[0].width, height: viewports[0].height });
  const responses = await patternResponsePlan(page);
  await answerPatternResponse(page, responses.incorrect, "incorrect");
  await activate(page.getByRole("button", { name: "Next", exact: true }), page);
  const reteach = page.locator('section.question.phase-reteach[data-skill-id="MQ-004"]');
  await expect(reteach).toBeVisible();
  const reteachSnapshot = await questionZoneSnapshot(page, "STACKED", {
    requiresFirstScreenResponse: touchProject,
    requiresFirstScreenTutorial: touchProject,
  });
  expect(reteachSnapshot.referenceSupportCount).toBe(1);
  expect(reteachSnapshot.referenceSupportInObservationCount).toBe(1);
  expect(reteachSnapshot.workedReferenceCount).toBeGreaterThan(0);
  expect(reteachSnapshot.workedReferenceInObservationCount).toBe(reteachSnapshot.workedReferenceCount);
  expect(artQuestionZoneIssues(reteachSnapshot), "real-reteach-phone-portrait").toEqual([]);
});
