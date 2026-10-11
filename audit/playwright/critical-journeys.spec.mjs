import { exerciseAssistedRetry, exerciseDifferentExampleTutorial, exerciseTutorialKeyboard, exerciseTutorialReload } from "./assisted-learning-journey.mjs";
import { exerciseActivatedDesignTokens } from "./design-token-observations.mjs";
import { exerciseFunctionalArt, seedGovernedEarlyLearningSession } from "./functional-art-journey.mjs";
import { earlyCountingSnapshot, earlyFrameSnapshot, questionShellSnapshot, questionZoneSnapshot } from "./art-dom-observations.mjs";
import { exerciseKeyboardParentLab } from "./parent-lab-journey.mjs";
import { exercisePrivateBackupExport, exercisePrivateQaEntry, exerciseProgressProtection, exerciseSavedProgressRecovery, exerciseQaPlacementDraftEntry } from "./adult-boundary-journey.mjs";
import { readFile } from "node:fs/promises";
import {
  designTokenProjectionProperties,
  expectedRuntimeConsumers,
} from "../lib/design-token-projection.mjs";
import {
  ART_QUESTION_SHELL_RAIL_LABELS,
  ART_QUESTION_ZONE_NARROW_MAX_PX,
  artEarlyCountingIssues,
  artEarlyFrameIssues,
  artQuestionShellIssues,
  artQuestionZoneIssues,
} from "../lib/art-question-shell.mjs";
import {
  activate,
  activateNamedButton,
  answerPatternResponse,
  answerSelection,
  completeCurrentPairLinkQuestion,
  expect,
  expectSelectedState,
  expectOnFirstScreen,
  openFirstQuestion,
  openFreshHome,
  openPreviewSelectionQuestion,
  openRegularPatternQuestion,
  optionIdsForCurrentQuestion,
  patternResponsePlan,
  test,
} from "./fixtures.mjs";

const GOVERNED_ART_VIEWPORTS = Object.freeze([
    { id: "phone-portrait", width: 390, height: 844 },
    { id: "phone-landscape", width: 844, height: 390 },
    { id: "tablet-portrait", width: 820, height: 1180 },
    { id: "tablet-landscape", width: 1024, height: 768 },
    { id: "large-tablet-landscape", width: 1180, height: 820 },
    { id: "desktop", width: 1366, height: 768 },
]);

const DESIGN_TOKENS = JSON.parse(await readFile(new URL("../../assets/design/math-quest-design-tokens-v1.json", import.meta.url), "utf8"));
const FUNCTIONAL_ART_STYLE_ORIGINS = Object.freeze({
  earlyCounting: 'style[data-mq-functional-art="ART-MIG-06"]',
  shellAndZones: 'style[data-mq-functional-art="ART-MIG-05"]',
});
const EXPECTED_RUNTIME_TOKEN_CONSUMERS = Object.freeze(expectedRuntimeConsumers(DESIGN_TOKENS).map((record) => Object.freeze({
  origin: record.selector.includes('[data-input-method="count_touch"]') || record.selector.includes('[data-input-method="ten_frame"]')
    ? FUNCTIONAL_ART_STYLE_ORIGINS.earlyCounting
    : FUNCTIONAL_ART_STYLE_ORIGINS.shellAndZones,
  ...record,
})).sort((left, right) => `${left.origin}\u0000${left.selector}\u0000${left.cssProperty}`.localeCompare(`${right.origin}\u0000${right.selector}\u0000${right.cssProperty}`, "en")));
const EXPECTED_PROJECTED_PROPERTIES = Object.freeze(designTokenProjectionProperties(DESIGN_TOKENS).map((record) => record.name));

for (const [id, mode] of [["[PW-F-19]", "success"], ["[PW-F-20]", "cancel"], ["[PW-F-21]", "reject"]]) {
  test(`${id} private backup ${mode} preserves progress and completes its native browser effects`, async ({ page }) => {
    await exercisePrivateBackupExport(page, mode);
  });
}

test("[PW-F-22] unavailable progress protection blocks play before any write and ordinary startup remains usable", async ({ page, mathQuestGuard }) => {
  await exerciseProgressProtection(page, mathQuestGuard);
});

test.describe("private QA entry", () => {
  test.use({ qaEntryQueries: true });
  test("[PW-F-23] private QA entry requires the exact query and an explicit grown-up action without changing progress", async ({ page, mathQuestGuard }) => {
    await exercisePrivateQaEntry(page, mathQuestGuard);
  });
  test("[PW-F-25] private QA confirmation precedes a real resumable placement draft and preserves both saved records", async ({ page }) => {
    await exerciseQaPlacementDraftEntry(page);
  });
});

test("[PW-F-24] malformed saved progress remains intact until a labelled native import restores durable validated progress", async ({ page }) => {
  await exerciseSavedProgressRecovery(page);
});

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
  await exerciseDifferentExampleTutorial(page);
});

test("[PW-F-06] keyboard play and isolated Parent Test mechanics remain child-legible", async ({ page }) => {
  test.setTimeout(90_000);
  await exerciseKeyboardParentLab(page);
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
  await exerciseAssistedRetry(page);
});

test("[PW-F-10] an open tutorial and its exact step survive a real page reload", async ({ page }) => {
  await exerciseTutorialReload(page);
});

test("[PW-F-11] Find Your Level keeps Replay and Not sure but never offers a tutorial", async ({ page }) => {
  await openFreshHome(page);
  await activateNamedButton(page, "Grown-ups corner");
  await activateNamedButton(page, "Starting point");
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(0);
  await activateNamedButton(page, "Start the check");
  await expect(page.locator("[data-placement-screen]")).toBeVisible();
  await expect(page.locator('[data-action="tutorial"]:visible')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Not sure", exact: true })).toBeVisible();
});

test("[PW-F-12] tutorial controls follow a native keyboard focus path", async ({ page }) => {
  await exerciseTutorialKeyboard(page);
});

test("[PW-F-13] activated design tokens expose exactly the governed ART-MIG-04 through ART-MIG-06 runtime consumers", async ({ page }) => {
  await exerciseActivatedDesignTokens(page, EXPECTED_PROJECTED_PROPERTIES, EXPECTED_RUNTIME_TOKEN_CONSUMERS);
});

test("[PW-F-14] functional art keeps identity, selection, focus, and speech status truthful", async ({ page }) => {
  await exerciseFunctionalArt(page);
});

test("[PW-F-15] one question shell and instrument rail preserve natural order across governed viewports", async ({ page }) => {
  const question = await openPreviewSelectionQuestion(page);
  const ids = await optionIdsForCurrentQuestion(page);
  await activate(question.locator(`[data-action="select"][data-id="${ids.correct}"]`), page);
  await expect(question.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
  const viewports = GOVERNED_ART_VIEWPORTS;
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const snapshot = await questionShellSnapshot(page);
    expect(artQuestionShellIssues(snapshot), viewport.id).toEqual([]);
    await expectInstrumentRailLabels(page);
  }
  await expectDuplicateRailRejected(page);
});

async function expectDuplicateRailRejected(page) {
  const clone = await page.locator('[data-art-instrument-rail="ART-MIG-04"]').evaluateHandle((rail) => {
    const clone = rail.cloneNode(true);
    rail.after(clone);
    return clone;
  });
  try {
    const issues = artQuestionShellIssues(await questionShellSnapshot(page));
    expect(issues, "NC-ART-DOM-DUPLICATE-RAIL").toContain("instrument-rail count is 2; expected 1");
  } finally {
    await clone.evaluate((element) => element.remove());
    await clone.dispose();
  }
}

async function expectInstrumentRailLabels(page) {
  await expect(page.locator('[data-art-question-shell="ART-MIG-04"]')).toBeVisible();
  const rail = page.locator('[data-art-instrument-rail="ART-MIG-04"]');
  await expect(rail).toBeVisible();
  for (const [action, label] of Object.entries(ART_QUESTION_SHELL_RAIL_LABELS)) {
    await expect(rail.locator(`button[data-action="${action}"]`)).toHaveText(label);
    await expect(rail.getByRole("button", { name: label, exact: true })).toHaveCount(1);
  }
}

test("[PW-F-16] observation and construction zones preserve semantics and responsive geometry", async ({ page }) => {
  const selection = await openPreviewSelectionQuestion(page);
  const touchProject = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const viewports = [
    ...GOVERNED_ART_VIEWPORTS,
    { id: "stack-boundary-900", width: 900, height: 900 },
    { id: "stack-boundary-901", width: 901, height: 900 },
    { id: "stack-boundary-1023", width: 1023, height: 768 },
  ];
  await expectSelectionZones(page, selection, { viewports, touchProject });
  await expectMissingZoneRejected(page);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const pattern = await openRegularPatternQuestion(page);
  const patternViewports = [viewports[0], viewports.find(({ id }) => id === "desktop")];
  await expectPatternZones(page, pattern, { viewports: patternViewports, touchProject });
  await expectReteachZones(page, { viewport: viewports[0], touchProject });
});

async function expectMissingZoneRejected(page) {
  const zone = await page.locator('[data-art-question-zone="OBSERVATION"]').evaluateHandle((element) => {
    element.removeAttribute("data-art-question-zone");
    return element;
  });
  try {
    const issues = artQuestionZoneIssues(await questionZoneSnapshot(page, "STACKED"));
    expect(issues, "NC-ART-DOM-MISSING-ZONE").toContain("observation-zone count is 0; expected 1");
  } finally {
    await zone.evaluate((element) => element.setAttribute("data-art-question-zone", "OBSERVATION"));
    await zone.dispose();
  }
}

async function expectSelectionZones(page, selection, { viewports, touchProject }) {
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
}

async function expectPatternZones(page, pattern, { viewports, touchProject }) {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const phoneFirstScreen = touchProject && viewport.id === "phone-portrait";
    expect(artQuestionZoneIssues(await questionZoneSnapshot(page, "STACKED", {
      requiresFirstScreenResponse: phoneFirstScreen,
      requiresFirstScreenTutorial: phoneFirstScreen,
    })), `interactive-${viewport.id}`).toEqual([]);
    await expect(pattern.locator('[data-art-question-zone="CONSTRUCTION"] .pattern-build-task .math-model')).toBeVisible();
    await expect(pattern.locator('[data-art-question-zone="OBSERVATION"] .pattern-build-task')).toHaveCount(0);
  }
}

async function expectReteachZones(page, { viewport, touchProject }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const responses = await patternResponsePlan(page);
  await answerPatternResponse(page, responses.incorrect, "incorrect");
  await activateNamedButton(page, "Next");
  const reteach = page.locator('section.question.phase-reteach[data-skill-id="MQ-004"]');
  await expect(reteach).toBeVisible();
  const reteachSnapshot = await questionZoneSnapshot(page, "STACKED", {
    requiresFirstScreenResponse: touchProject,
    requiresFirstScreenTutorial: touchProject,
  });
  expect(reteachSnapshot).toMatchObject({ referenceSupportCount: 1, referenceSupportInObservationCount: 1 });
  expect(reteachSnapshot.workedReferenceCount).toBeGreaterThan(0);
  expect(reteachSnapshot.workedReferenceInObservationCount).toBe(reteachSnapshot.workedReferenceCount);
  expect(artQuestionZoneIssues(reteachSnapshot), "real-reteach-phone-portrait").toEqual([]);
}

async function openGovernedEarlyCountingQuestion(page) {
  await page.clock.setFixedTime("2026-08-24T12:00:00-03:00");
  await openFreshHome(page);
  const identity = await seedGovernedEarlyLearningSession(page, {
    skillId: "MQ-002", seed: 6, sessionId: "art-mig-06-playwright",
    choicePlannedCounts: [1, 2], choiceResolved: {},
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const question = page.locator('section.question[data-skill-id="MQ-002"][data-input-method="COUNT_TOUCH"]');
  await expect(question).toBeVisible();
  expect(identity.questionId).toBe("MQ-002-1-53399667");
  expect(identity.answerOracle).toBe(3);
  return question;
}

test("[PW-F-17] ART-MIG-06 early counting preserves the oracle, answer boundary, counted cues, and responsive geometry", async ({ page }) => {
  const question = await openGovernedEarlyCountingQuestion(page);
  const viewports = GOVERNED_ART_VIEWPORTS;
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(artEarlyCountingIssues(await earlyCountingSnapshot(page, 0)), `initial-${viewport.id}`).toEqual([]);
  }
  await activate(question.locator('.touch-objects button[data-item-id="i0"]'), page);
  await expect(question.locator('.touch-objects button[data-item-id="i0"]')).toHaveAttribute("aria-pressed", "true");
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(artEarlyCountingIssues(await earlyCountingSnapshot(page, 1)), `partial-${viewport.id}`).toEqual([]);
  }
  await expectMissingCountingIdRejected(page, question);
});

async function expectMissingCountingIdRejected(page, question) {
  const object = await question.locator('.touch-objects button[data-item-id="i0"]').evaluateHandle((element) => {
    element.removeAttribute("data-item-id");
    return element;
  });
  try {
    const issues = artEarlyCountingIssues(await earlyCountingSnapshot(page, 1));
    expect(issues, "NC-ART-DOM-MISSING-COUNTING-ID").toContain("rendered object count does not equal the question-owned oracle");
  } finally {
    await object.evaluate((element) => element.setAttribute("data-item-id", "i0"));
    await object.dispose();
  }
}

async function openGovernedEarlyFrameQuestion(page) {
  await page.clock.setFixedTime("2026-08-24T12:00:00-03:00");
  await openFreshHome(page);
  const identity = await seedGovernedEarlyLearningSession(page, {
    skillId: "MQ-026", seed: 9, sessionId: "art-mig-06-early-frame-playwright",
    choicePlannedCounts: [2, 2], choiceResolved: { 0: 0 },
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const question = page.locator('section.question[data-skill-id="MQ-026"][data-input-method="TEN_FRAME"]');
  await expect(question).toBeVisible();
  expect(identity.questionId).toBe("MQ-026-1-3301471712");
  expect(identity.answerOracle).toBe(15);
  return question;
}

test("[PW-F-18] ART-MIG-06 early frame preserves the MQ-026 oracle, exact five-by-two trays, response count, filled cues, and responsive geometry", async ({ page }) => {
  const question = await openGovernedEarlyFrameQuestion(page);
  const viewports = GOVERNED_ART_VIEWPORTS;
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(artEarlyFrameIssues(await earlyFrameSnapshot(page, 0)), `initial-${viewport.id}`).toEqual([]);
  }
  for (let index = 0; index < 12; index += 1) {
    await activate(question.locator(`.model-cell[data-cell="${index}"]`), page);
  }
  await expect(question.locator('.model-cell[aria-pressed="true"]')).toHaveCount(12);
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    expect(artEarlyFrameIssues(await earlyFrameSnapshot(page, 12)), `partial-${viewport.id}`).toEqual([]);
  }
  await expectWrappedFrameCellRejected(page, question);
});

async function expectWrappedFrameCellRejected(page, question) {
  const wrapper = await question.locator('.model-cell[data-cell="0"]').evaluateHandle((cell) => {
    const wrapper = document.createElement("span");
    cell.replaceWith(wrapper);
    wrapper.append(cell);
    return wrapper;
  });
  try {
    const snapshot = await earlyFrameSnapshot(page, 12);
    const issues = artEarlyFrameIssues(snapshot);
    expect(issues, "NC-ART-DOM-WRAPPED-FRAME-CELL").toContain("early-frame must expose exactly two ten-cell frames");
    expect(snapshot.cellIndexes).toHaveLength(20);
    expect(snapshot.fiveByTwoStructure).toBe(false);
  } finally {
    await wrapper.evaluate((element) => element.replaceWith(element.firstElementChild));
    await wrapper.dispose();
  }
}
