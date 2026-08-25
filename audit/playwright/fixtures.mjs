import { expect, test as base } from "@playwright/test";

const ALLOWED_PATHS = new Set([
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/release-shell-v1.json",
  "/sw.js",
  "/curriculum/math-quest-tutorial-manifest-v1.json",
  "/assets/design/math-quest-design-tokens-v1.css",
  "/assets/fonts/Inter-Variable.ttf",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/sounds/close.wav",
  "/assets/sounds/confirm.wav",
  "/assets/sounds/incorrect.wav",
  "/assets/sounds/tap.wav",
  "/LICENSE",
  "/PRIVACY.md",
  "/THIRD_PARTY_NOTICES.md",
  "/__math_quest_health__",
]);

export const test = base.extend({
  mathQuestGuard: [async ({ browser, page }, use, testInfo) => {
    const pageErrors = [];
    const consoleErrors = [];
    const unexpectedRequests = [];
    testInfo.annotations.push({ type: "browser-version", description: browser.version() });
    const browserSession = await browser.newBrowserCDPSession();
    const browserIdentity = await browserSession.send("Browser.getVersion");
    await browserSession.detach();
    testInfo.annotations.push({ type: "browser-product", description: String(browserIdentity.product || "") });
    page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:8771"
          || url.search !== ""
          || !ALLOWED_PATHS.has(url.pathname)) {
        unexpectedRequests.push(`${request.method()} ${url.origin}${url.pathname}${url.search}`);
      }
    });
    await use({ pageErrors, consoleErrors, unexpectedRequests });
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(consoleErrors, "browser console errors").toEqual([]);
    expect(unexpectedRequests, "unexpected or query-bearing browser requests").toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function activate(locator, page) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    await locator.tap();
    return;
  }
  await locator.click();
}

export async function openFreshHome(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const health = await page.request.get("/__math_quest_health__");
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toEqual({
    schemaVersion: 1, identity: "math-quest-local-server:v2", release: "1.0.0-beta.7", port: 8771,
    rootId: process.env.MQ_PLAYWRIGHT_ROOT_ID,
    servedPayloadSha256: process.env.MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256,
  });
  const withoutName = page.getByRole("button", { name: "Continue without a name" });
  await expect(withoutName).toBeVisible();
  await activate(withoutName, page);
  await expect(page.getByRole("heading", { name: "Math Quest", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start/u })).toBeVisible();
}

export async function openFirstQuestion(page) {
  await openFreshHome(page);
  await activate(page.getByRole("button", { name: /Start/u }), page);
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await activate(chooseQuestion.first(), page);
  const question = page.locator("section.question");
  await expect(question).toBeVisible();
  return question;
}

export async function completeCurrentPairLinkQuestion(page) {
  const question = page.locator('section.question[data-input-method="PAIR_LINK"]');
  await expect(question).toBeVisible();
  const firstRow = question.getByRole("group", { name: /^Step 1:/u });
  const secondRow = question.getByRole("group", { name: /^Step 2:/u });
  const pairCount = Math.min(
    await firstRow.getByRole("button").count(),
    await secondRow.getByRole("button").count(),
  );
  expect(pairCount).toBeGreaterThan(0);
  for (let index = 0; index < pairCount; index += 1) {
    await activate(firstRow.getByRole("button", { disabled: false }).first(), page);
    await activate(secondRow.getByRole("button", { disabled: false }).first(), page);
  }
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeEnabled();
  await activate(confirm, page);
  const feedback = page.locator('[data-feedback-state="correct"]');
  await expect(feedback).toBeVisible();
  await expect(feedback).toBeFocused();
}

export async function openRegularPatternQuestion(page) {
  const firstQuestion = await openFirstQuestion(page);
  await expect(firstQuestion).toHaveAttribute("data-input-method", "PAIR_LINK");
  await completeCurrentPairLinkQuestion(page);
  await activate(page.getByRole("button", { name: "Next", exact: true }), page);
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await activate(chooseQuestion.first(), page);
  const question = page.locator('section.question[data-skill-id="MQ-004"][data-input-method="PATTERN_BUILD"]');
  await expect(question).toBeVisible();
  return question;
}

export async function patternResponsePlan(page) {
  return page.evaluate(() => {
    const engine = window.MathQuestEngine;
    const bytes = localStorage.getItem(engine.CONSTANTS.STORAGE_NAMESPACE);
    const question = bytes ? JSON.parse(bytes)?.activeSession?.uiState?.question : null;
    if (!question || question.skillId !== "MQ-004" || question.inputMethod !== "PATTERN_BUILD") {
      throw new Error("The regular pattern-response fixture is unavailable.");
    }
    const correct = String(question.answer?.value || "").trim().split(/\s+/u).filter(Boolean);
    const choices = Array.isArray(question.params?.tokenChoices) ? question.params.tokenChoices.map(String) : [];
    if (!correct.length || choices.length < 2 || correct.some((token) => !choices.includes(token))) {
      throw new Error("The regular pattern-response fixture has no distinct valid alternative.");
    }
    const incorrect = correct.slice();
    incorrect[0] = choices.find((token) => token !== correct[0]);
    if (engine.gradeAnswer(question, { tokens: incorrect }).correct
        || !engine.gradeAnswer(question, { tokens: correct }).correct) {
      throw new Error("The regular pattern-response fixture does not separate correct and incorrect work.");
    }
    return { correct, incorrect };
  });
}

export async function answerPatternResponse(page, tokens, expectedState, { beforeConfirm } = {}) {
  const tokenButtons = page.locator('[data-response-action="pattern-token"]');
  for (const token of tokens) {
    const index = await tokenButtons.evaluateAll(
      (buttons, expectedToken) => buttons.findIndex((button) => button.dataset.token === expectedToken),
      token,
    );
    if (index < 0) throw new Error(`Pattern token ${JSON.stringify(token)} is not rendered.`);
    await activate(tokenButtons.nth(index), page);
  }
  if (beforeConfirm) await beforeConfirm();
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeEnabled();
  await activate(confirm, page);
  const feedback = page.locator(`[data-feedback-state="${expectedState}"]`);
  await expect(feedback).toBeVisible();
  await expect(feedback).toBeFocused();
}

export async function openPreviewSelectionQuestion(page) {
  await openFreshHome(page);
  await activate(page.getByRole("button", { name: "Grown-ups corner", exact: true }), page);
  await activate(page.getByRole("button", { name: /^Preview level 4,/u }), page);
  await activate(page.getByRole("button", { name: "Start preview session", exact: true }), page);
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await activate(chooseQuestion.first(), page);
  const question = page.locator('section.question[data-input-method="PICTURE_CHOICE"]');
  await expect(question).toBeVisible();
  await expect.poll(async () => question.locator('.question-response [data-action="select"]').count()).toBeGreaterThanOrEqual(2);
  return question;
}

export async function optionIdsForCurrentQuestion(page) {
  return page.evaluate(() => {
    const engine = window.MathQuestEngine;
    const bytes = localStorage.getItem(engine.CONSTANTS.STORAGE_NAMESPACE);
    const question = bytes ? JSON.parse(bytes)?.activeSession?.uiState?.question : null;
    if (!question || !Array.isArray(question.options)) throw new Error("The synthetic session has no selection question.");
    const correct = question.options.find((option) => engine.gradeAnswer(question, { optionId: option.optionId }).correct);
    const incorrect = question.options.find((option) => option.optionId !== correct?.optionId);
    if (!correct || !incorrect) throw new Error("The selection fixture does not have distinct correct and incorrect options.");
    return { correct: correct.optionId, incorrect: incorrect.optionId };
  });
}

export async function answerSelection(page, optionId, expectedState) {
  const option = page.locator(`[data-action="select"][data-id="${optionId}"]`);
  await activate(option, page);
  await expect(option).toHaveAttribute("aria-pressed", "true");
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expect(confirm).toBeEnabled();
  await activate(confirm, page);
  const feedback = page.locator(`[data-feedback-state="${expectedState}"]`);
  await expect(feedback).toBeVisible();
  await expect(feedback).toBeFocused();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
}

export async function savedSessionSnapshot(page, requestedSkillId = null) {
  return page.evaluate((requestedSkillId) => {
    const engine = window.MathQuestEngine;
    const bytes = localStorage.getItem(engine.CONSTANTS.STORAGE_NAMESPACE);
    const saved = bytes ? JSON.parse(bytes) : null;
    const active = saved?.activeSession?.uiState || null;
    const skillId = requestedSkillId || active?.question?.skillId || null;
    const skill = skillId ? saved?.skills?.[skillId] : null;
    const evidenceCount = Object.values(saved?.skills || {}).reduce(
      (total, record) => total + (Array.isArray(record?.evidence) ? record.evidence.length : 0),
      0,
    );
    const practiceCount = Object.values(saved?.practiceCountByDay || {}).reduce(
      (total, count) => total + (Number(count) || 0),
      0,
    );
    return {
      questionId: active?.question?.questionId || null,
      skillId,
      sampleKey: active?.question?.sampleKey || null,
      selected: active?.selected ?? null,
      phase: active?.phase || null,
      tutorialOpen: active?.tutorialOpen === true,
      tutorialStep: Number(active?.tutorialStep || 0),
      hintUsed: active?.hintUsed === true,
      attemptCommitted: active?.attemptCommitted === true,
      lastFeedbackClass: active?.lastAttempt?.feedbackClass || null,
      lastEvidenceClass: active?.lastAttempt?.evidenceClass || null,
      evidenceCount,
      practiceCount,
      skillEvidenceCount: Array.isArray(skill?.evidence) ? skill.evidence.length : 0,
      skillMissCount: Array.isArray(skill?.misses) ? skill.misses.length : 0,
      skillAcquisition: skill?.acquisition || null,
      feedbackHistoryCount: Array.isArray(saved?.feedbackHistory) ? saved.feedbackHistory.length : 0,
    };
  }, requestedSkillId);
}

export function visibleTutorialButton(page) {
  return page.locator('[data-action="tutorial"]:visible').first();
}

export async function expectMinimumTarget(locator, minimum = 44) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
}

export async function tabUntilFocused(page, locator, maximumTabs = 60) {
  for (let index = 0; index < maximumTabs; index += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`The requested control did not receive focus after ${maximumTabs} native Tab presses.`);
}

export async function expectOnFirstScreen(locator, page) {
  await expect(locator).toBeVisible();
  const [box, viewport] = await Promise.all([locator.boundingBox(), Promise.resolve(page.viewportSize())]);
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}
