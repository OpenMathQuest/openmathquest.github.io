import { activate, activateNamedButton, expect } from "./fixtures.mjs";
import { tutorialIdentity, walkTutorialSteps } from "./tutorial-observations.mjs";

async function waitForLabSettled(page) {
  await expect(page.locator(".lab-workspace")).toHaveAttribute("data-render-settled", "true");
}

async function selectLabSkill(page, level, skillId) {
  await page.locator("#lab-level").selectOption(String(level));
  await waitForLabSettled(page);
  await page.locator("#lab-skill").selectOption(skillId);
  await waitForLabSettled(page);
}

async function actionSceneDistractor(actionQuestion, resultChoices) {
  const prompt = await actionQuestion.locator(".prompt").innerText();
  const operation = /What is\s+(\d+)\s*([+−-])\s*(\d+)/u.exec(prompt);
  expect(operation).not.toBeNull();
  const expected = operation[2] === "+"
    ? Number(operation[1]) + Number(operation[3])
    : Number(operation[1]) - Number(operation[3]);
  const resultValues = (await resultChoices.allTextContents()).map((value) => Number(value.trim()));
  const wrongIndex = resultValues.findIndex((value) => Number.isFinite(value) && value !== expected);
  expect(wrongIndex).toBeGreaterThanOrEqual(0);
  return resultChoices.nth(wrongIndex);
}

async function revealLabActionChoices(page, actionQuestion) {
  await expect(actionQuestion).toBeVisible();
  await expect(actionQuestion.locator(".action-scene-count")).toBeVisible();
  await expect(actionQuestion.locator(".action-result-choices")).toHaveCount(0);
  await activate(actionQuestion.locator('[data-response-action="direct-action"]'), page);
  const resultChoices = actionQuestion.locator('[data-response-action="action-value"]');
  await expect(resultChoices.first()).toBeVisible();
  expect(await resultChoices.count()).toBeGreaterThanOrEqual(3);
  return resultChoices;
}

async function expectLabActionSceneRejectsWrongAnswer(page) {
  await selectLabSkill(page, 3, "MQ-013");
  const actionQuestion = page.locator('article.lab-question[data-input-method="ACTION_SCENE"]');
  const resultChoices = await revealLabActionChoices(page, actionQuestion);
  await activate(await actionSceneDistractor(actionQuestion, resultChoices), page);
  await activateNamedButton(page, "Test answer");
  await expect(page.locator("[data-lab-result]")).toHaveText("Not correct.");
}

async function expectLabShareMatsCentered(page) {
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
}

async function expectBoundedArrayRows(array) {
  await expect(array).toBeVisible();
  await expect(array.locator(".array-bounded-row")).toHaveCount(2);
  await expect(array.getByText("Row 1: 35", { exact: true })).toBeVisible();
  await expect(array.getByText("Row 2: 35", { exact: true })).toBeVisible();
  await expect(array.locator("i")).toHaveCount(70);
  await expectContentFits(array);
}

async function expectLabBoundedArrayTutorial(page) {
  await selectLabSkill(page, 11, "MQ-063");
  const sample = page.locator("#lab-sample");
  await sample.fill("614");
  await sample.press("Tab");
  await waitForLabSettled(page);
  await activateNamedButton(page, "Show tutorial");
  await waitForLabSettled(page);
  await expectBoundedArrayRows(page.locator('.tutorial-example .array-bounded[data-array-rows="2"][data-array-columns="35"]'));
  await activateNamedButton(page, "Back to your question");
  await waitForLabSettled(page);
}

async function expectLabAreaModelUniqueIds(page) {
  await selectLabSkill(page, 21, "MQ-121");
  const areaQuestion = page.locator('article.lab-question[data-skill-id="MQ-121"]');
  await activateNamedButton(page, "Show teaching model");
  await waitForLabSettled(page);
  const areaIds = await areaQuestion.locator("[id]").evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(areaIds).size).toBe(areaIds.length);
  await expectContentFits(areaQuestion);
}

async function expectLabPrismLegibility(page) {
  await selectLabSkill(page, 21, "MQ-122");
  const volumeQuestion = page.locator('article.lab-question[data-skill-id="MQ-122"]');
  await expect(volumeQuestion.locator(".isometric-prism")).toBeVisible();
  const prismPresentation = await volumeQuestion.locator(".isometric-prism").evaluate((element) => ({
    contained: element.getBoundingClientRect().width <= element.parentElement.getBoundingClientRect().width + 1,
    labelCount: element.querySelectorAll("text").length,
    minimumLabelFontSize: Math.min(...[...element.querySelectorAll("text")].map((label) => Number.parseFloat(getComputedStyle(label).fontSize))),
    separatorsUnfilled: [...element.querySelectorAll("polyline")].every((line) => getComputedStyle(line).fill === "none"),
  }));
  expect(prismPresentation.contained).toBe(true);
  expect(prismPresentation.labelCount).toBeGreaterThan(0);
  expect(prismPresentation.minimumLabelFontSize).toBeGreaterThanOrEqual(16);
  expect(prismPresentation.separatorsUnfilled).toBe(true);
}

async function expectLabProcedureTutorialHidesTerminalAnswer(page) {
  await selectLabSkill(page, 20, "MQ-115");
  const procedureQuestion = page.locator('article.lab-question[data-skill-id="MQ-115"]');
  for (let sample = 0; sample < 6 && await procedureQuestion.getAttribute("data-task-type") !== "subtraction"; sample += 1) {
    await activateNamedButton(page, "Next sample");
  }
  await expect(procedureQuestion).toHaveAttribute("data-task-type", "subtraction");
  await activateNamedButton(page, "Show tutorial");
  const procedureIdentity = await tutorialIdentity(page);
  expect(procedureIdentity.answerDisclosurePolicy).toBe("PROCEDURE_ONLY_REQUIRED");
  expect(procedureIdentity.resolutionMode).toBe("PROCEDURE_ONLY");
  const procedurePanel = await walkTutorialSteps(page, procedureIdentity);
  await expectProcedureOnlyDisclosure(page, procedurePanel);
}

async function expectProcedureOnlyDisclosure(page, procedurePanel) {
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
}

async function expectParentPrivacyDocument(page) {
  await activateNamedButton(page, "Privacy");
  const legal = page.locator('[data-legal-document="privacy"]');
  await expect(legal.locator(":scope > h1")).toBeFocused();
  await expect(legal.getByRole("heading", { name: "Privacy", exact: true })).toHaveCount(1);
  await expect(legal.locator(".legal-document__body")).toContainText("Math Quest keeps gameplay information in the browser.");
  await expectContentFits(legal);
  await activateNamedButton(page, "Back to the parent note");
}

async function expectParentNoticesDocument(page) {
  await activateNamedButton(page, "Licences and attributions");
  const notices = page.locator('[data-legal-document="notices"]');
  await expect(notices.locator(":scope > h1")).toBeFocused();
  await expect(notices.getByRole("link", { name: "Open Government Licence v3.0", exact: true })).toHaveAttribute("href", "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/");
  await expect(notices.getByRole("table")).toHaveCount(1);
  await expect(notices.getByRole("columnheader", { name: "File", exact: true })).toBeVisible();
  const noticesText = await notices.locator(".legal-document__body").innerText();
  expect(noticesText).not.toMatch(/\]\(https:\/\/|<https:\/\/|\|\s*File\s*\|/u);
  await expectContentFits(notices);
  await activateNamedButton(page, "Back to the parent note");
}

async function expectParentLicenseDocument(page) {
  await activateNamedButton(page, "MIT licence");
  const license = page.locator('[data-legal-document="license"]');
  await expect(license.locator(":scope > h1")).toBeFocused();
  await expect(license.locator(".legal-document__body")).toContainText("Permission is hereby granted, free of charge");
  await expectContentFits(license);
  await activateNamedButton(page, "Back to the parent note");
}

async function expectParentLegalDocuments(page) {
  await activateNamedButton(page, "Note for parents");
  await expectParentPrivacyDocument(page);
  await expectParentNoticesDocument(page);
  await expectParentLicenseDocument(page);
}

async function expectContentFits(locator) {
  expect(await locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

async function openFirstQuestionWithKeyboard(page) {
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
  await expectQuestionResponseVisible(page);
}

async function expectQuestionResponseVisible(page) {
  await expect(page.locator('[data-action="physical-done"]')).toHaveCount(0);
  await expect(page.locator("section.question")).toBeVisible();
  await expect(page.locator("section.question .question-response")).toBeVisible();
}

async function openParentLabAfterKeyboardPlay(page) {
  await openFirstQuestionWithKeyboard(page);
  await activateNamedButton(page, "Home");
  await expect(page.getByRole("button", { name: /Start/u })).toBeVisible();
  await activateNamedButton(page, "Grown-ups corner");
  await expect(page.getByRole("button", { name: "Leave preview", exact: true })).toHaveCount(0);
  const enterLab = page.getByRole("button", { name: "Parent test lab", exact: true });
  const before = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  await activate(enterLab, page);
  await expect(page.getByRole("heading", { name: "Parent test lab", exact: true })).toBeVisible();
  return before;
}

async function expectLabDifferentExampleTutorial(page) {
  await activateNamedButton(page, "Next sample");
  const sourceQuestionId = await page.locator("article.lab-question").getAttribute("data-question-id");
  await activateNamedButton(page, "Show tutorial");
  const identity = await tutorialIdentity(page);
  expect(identity.sourceQuestionId).toBe(sourceQuestionId);
  expect(identity.exampleQuestionId).not.toBe(sourceQuestionId);
  await walkTutorialSteps(page, identity);
  await activateNamedButton(page, "Back to your question");
  await expect(page.locator("article.lab-question")).toHaveAttribute("data-question-id", sourceQuestionId || "");
  await expect(page.locator("article.lab-question .answer-controls")).toBeVisible();
}

export async function exerciseKeyboardParentLab(page) {
  const before = await openParentLabAfterKeyboardPlay(page);
  await expectLabDifferentExampleTutorial(page);
  await expectLabActionSceneRejectsWrongAnswer(page);

  await expectLabShareMatsCentered(page);

  await expectLabBoundedArrayTutorial(page);

  await expectLabAreaModelUniqueIds(page);

  await expectLabPrismLegibility(page);

  await expectLabProcedureTutorialHidesTerminalAnswer(page);

  await activateNamedButton(page, "Exit test lab");
  await activateNamedButton(page, "Home");
  await expectParentLegalDocuments(page);

  const after = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  expect(after).toBe(before);
}
