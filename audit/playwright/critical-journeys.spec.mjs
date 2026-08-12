import {
  activate,
  answerSelection,
  expect,
  expectOnFirstScreen,
  openFirstQuestion,
  openFreshHome,
  openPreviewSelectionQuestion,
  optionIdsForCurrentQuestion,
  test,
} from "./fixtures.mjs";

test("[PW-F-01] first use reaches Home and world selection is actionable", async ({ page }) => {
  await openFreshHome(page);
  const forest = page.getByRole("button", { name: "Forest", exact: true });
  await expectOnFirstScreen(forest, page);
  await activate(forest, page);
  await expect(forest).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Start/u })).toBeEnabled();
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

test("[PW-F-05] Help keeps the response and Confirm on the first screen", async ({ page }) => {
  const question = await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  const option = question.locator(`[data-action="select"][data-id="${ids.correct}"]`);
  await activate(option, page);
  const help = page.getByRole("button", { name: "Show one step", exact: true });
  await activate(help, page);
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  await expectOnFirstScreen(option, page);
  await expectOnFirstScreen(confirm, page);
  await expect(page.locator(".question-support")).toBeVisible();
});

test("[PW-F-06] native keyboard play, Home navigation, and Parent Test isolation work", async ({ page }) => {
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
  const enterLab = page.getByRole("button", { name: "Parent test lab", exact: true });
  const before = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  await activate(enterLab, page);
  await expect(page.getByRole("heading", { name: "Parent test lab", exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "Next sample", exact: true }), page);
  await activate(page.getByRole("button", { name: "Exit test lab", exact: true }), page);
  const after = await page.evaluate(() => localStorage.getItem(window.MathQuestEngine.CONSTANTS.STORAGE_NAMESPACE));
  expect(after).toBe(before);
});

test("[PW-F-07] a child can complete a direct-construction question with native pointer or touch actions", async ({ page }) => {
  const question = await openFirstQuestion(page);
  await expect(question).toHaveAttribute("data-input-method", "PAIR_LINK");
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
