import { expect, test as base } from "@playwright/test";

const ALLOWED_PATHS = new Set([
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/release-shell-v1.json",
  "/sw.js",
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
    schemaVersion: 1, identity: "math-quest-local-server:v2", release: "1.0.0-beta.5", port: 8771,
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
  const physicalDone = page.locator('button[data-action="physical-done"]:visible');
  if (await physicalDone.count()) await activate(physicalDone.first(), page);
  const question = page.locator("section.question");
  await expect(question).toBeVisible();
  return question;
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
