import {
  activate, activateNamedButton, answerPatternResponse, expect, expectMinimumTarget,
  expectOnFirstScreen, expectSelectedState, openPreviewSelectionQuestion, openRegularPatternQuestion,
  optionIdsForCurrentQuestion, patternResponsePlan, savedSessionSnapshot, tabUntilFocused, visibleTutorialButton,
} from "./fixtures.mjs";
import { expectTutorialStep, tutorialIdentity, tutorialPhaseSignature, tutorialVisualOnlySignature } from "./tutorial-observations.mjs";

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

async function openTutorialForSelectedPreview(page) {
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
  return { ids, before, identity };
}

async function expectDifferentExampleContract(page, identity) {
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
}

async function expectDistinctTutorialVisualSteps(page, identity) {
  const phaseSignatures = [];
  await expectTutorialStep(page, 1, identity);
  await expectOnFirstScreen(page.getByRole("button", { name: "Next step", exact: true }), page);
  phaseSignatures.push(await tutorialPhaseSignature(page));
  for (const step of [2, 3]) {
    await activateNamedButton(page, "Next step");
    await expectTutorialStep(page, step, identity);
    phaseSignatures.push(await tutorialPhaseSignature(page));
  }
  expect(new Set(phaseSignatures.map(tutorialVisualOnlySignature)).size).toBe(3);
  await activateNamedButton(page, "Previous step");
  await expectTutorialStep(page, 2, identity);
}

export async function exerciseDifferentExampleTutorial(page) {
  const { ids, before, identity } = await openTutorialForSelectedPreview(page);
  expect(identity.sourceQuestionId).toBe(before.questionId);
  expect(identity.exampleQuestionId).not.toBe(identity.sourceQuestionId);
  await expectDifferentExampleContract(page, identity);
  await expectDistinctTutorialVisualSteps(page, identity);
  await activateNamedButton(page, "Back to your question");
  const restored = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await expect(restored).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
}

async function acceptIncorrectTutorialOffer(page, before) {
  const pending = await savedSessionSnapshot(page);
  expect(pending).toMatchObject({
    questionId: before.questionId, phase: "feedback", attemptCommitted: false,
    lastFeedbackClass: "INCORRECT", lastEvidenceClass: "CONSTRUCTION",
  });
  const offer = page.locator(".tutorial-offer");
  await expect(offer.getByText("Would a different example help?", { exact: true })).toBeVisible();
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(1);
  await activate(offer.getByRole("button", { name: "? Show me how", exact: true }), page);
  const identity = await tutorialIdentity(page);
  expect(identity.sourceQuestionId).toBe(before.questionId);
}

async function expectAssistedAttemptState(page, before) {
  const assisted = await savedSessionSnapshot(page);
  expect(assisted).toMatchObject({
    phase: "question", tutorialOpen: true, hintUsed: true, attemptCommitted: true,
    lastFeedbackClass: null, feedbackHistoryCount: before.feedbackHistoryCount + 1,
  });
  expectLearningCountsUnchanged(assisted, before);
}

export async function exerciseAssistedRetry(page) {
  const question = await openRegularPatternQuestion(page);
  await expectPatternResponseSingleRow(question);
  const responses = await patternResponsePlan(page);
  const before = await savedSessionSnapshot(page);
  expect(before.skillId).toBe("MQ-004");
  await answerPatternResponse(page, responses.incorrect, "incorrect", {
    beforeConfirm: () => expectPatternResponseSingleRow(question),
  });
  await acceptIncorrectTutorialOffer(page, before);
  await expectAssistedAttemptState(page, before);
  await activateNamedButton(page, "Back to your question");
  await answerPatternResponse(page, responses.correct, "correct", {
    beforeConfirm: () => expectPatternResponseSingleRow(question),
  });
  const correctRetry = await savedSessionSnapshot(page);
  expect(correctRetry).toMatchObject({
    attemptCommitted: false, lastFeedbackClass: "CORRECT_WITH_STRUGGLE", lastEvidenceClass: "NON_EVIDENCE",
  });
  await activateNamedButton(page, "Next");
  const retried = await savedSessionSnapshot(page, before.skillId);
  expectLearningCountsUnchanged(retried, before);
}

function expectLearningCountsUnchanged(current, before) {
  expect(current).toMatchObject({
    evidenceCount: before.evidenceCount,
    practiceCount: before.practiceCount,
    skillEvidenceCount: before.skillEvidenceCount,
    skillMissCount: before.skillMissCount,
  });
}

export async function exerciseTutorialReload(page) {
  await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  const option = page.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await activate(option, page);
  await activate(visibleTutorialButton(page), page);
  const identity = await tutorialIdentity(page);
  await activateNamedButton(page, "Next step");
  await expectTutorialStep(page, 2, identity);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectTutorialStep(page, 2, identity);
  await expectRestoredTutorialSelection(page, ids.correct);
}

async function expectRestoredTutorialSelection(page, selectedId) {
  const restoredState = await savedSessionSnapshot(page);
  expect(restoredState).toMatchObject({ tutorialOpen: true, tutorialStep: 2, selected: selectedId });
  await activateNamedButton(page, "Back to your question");
  await expect(page.locator(`[data-action="select"][data-id="${selectedId}"]`)).toHaveAttribute("aria-pressed", "true");
}

async function openTutorialWithKeyboard(page) {
  await openPreviewSelectionQuestion(page);
  const tutorial = visibleTutorialButton(page);
  await tabUntilFocused(page, tutorial);
  await expect(tutorial).toBeFocused();
  await page.keyboard.press("Enter");
  await expectTutorialStep(page, 1);
}

async function expectNextTutorialFocus(page, name) {
  const control = page.getByRole("button", { name, exact: true });
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
}

export async function exerciseTutorialKeyboard(page) {
  await openTutorialWithKeyboard(page);
  await expectNextTutorialFocus(page, "Next step");
  await page.keyboard.press("Enter");
  await expectTutorialStep(page, 2);
  await expectNextTutorialFocus(page, "Previous step");
  await expectNextTutorialFocus(page, "Next step");
  await expectNextTutorialFocus(page, "Back to your question");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-tutorial="different-example"]')).toHaveCount(0);
  await expect(page.locator("section.question .question-response")).toBeVisible();
}
