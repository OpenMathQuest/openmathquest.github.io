import { activateNamedButton, expect, expectMinimumTarget } from "./fixtures.mjs";

export async function tutorialIdentity(page) {
  const panel = page.locator('[data-tutorial="different-example"]');
  await expect(panel).toBeVisible();
  return {
    sourceQuestionId: await panel.getAttribute("data-source-question-id"),
    exampleQuestionId: await panel.getAttribute("data-example-question-id"),
    answerDisclosurePolicy: await panel.getAttribute("data-answer-disclosure-policy"),
    resolutionMode: await panel.getAttribute("data-resolution-mode"),
  };
}

export async function expectTutorialStep(page, step, identity = null) {
  const panel = page.locator('[data-tutorial="different-example"]');
  await expectTutorialPhaseHeading(panel, step);
  if (identity) await expectTutorialIdentityAttributes(panel, identity);
  await expect(panel.locator(".tutorial-phase-cue")).toHaveCount(0);
  await expect(panel).not.toHaveAttribute("data-visual-anchor-ids", "");
  await expect(panel).not.toHaveAttribute("data-visual-cue-ids", "");
  expectTutorialAnchorEffect(await tutorialPhaseSignature(page));
  await expectTutorialAnswerBoundary(panel, step);
  const actions = panel.locator("button:visible");
  for (let index = 0; index < await actions.count(); index += 1) {
    await expectMinimumTarget(actions.nth(index));
  }
  return panel;
}

export async function tutorialPhaseSignature(page) {
  return page.locator('[data-tutorial="different-example"]').evaluate((panel) => {
    const anchor = panel.querySelector(".tutorial-example [data-visual-anchor-role]");
    const cue = panel.querySelector(".tutorial-example [data-visual-cue-id]");
    const anchorStyle = getComputedStyle(anchor);
    const attribute = (element, name) => element?.getAttribute(name) || "";
    const overlayIsVisible = (element) => {
      if (!element) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      phase: panel.dataset.tutorialPhaseId,
      declaredAnchor: panel.dataset.visualAnchorIds,
      declaredCue: panel.dataset.visualCueIds,
      anchorCount: panel.querySelectorAll(".tutorial-example [data-visual-anchor-role][data-visual-cue-id]").length,
      actualMathSurface: anchor?.matches(".prompt,.stimulus,.model") || false,
      anchorRole: attribute(anchor, "data-visual-anchor-role"),
      cueId: attribute(cue, "data-visual-cue-id"),
      describedByInstruction: anchor?.getAttribute("aria-describedby") === panel.querySelector(".tutorial-instruction")?.id,
      overlayHasSvgGeometry: Boolean(panel.querySelector(".tutorial-example [data-visual-anchor-role] > .tutorial-anchor-overlay svg :is(circle,rect,path,line,polyline)")),
      overlayVisible: overlayIsVisible(panel.querySelector(".tutorial-anchor-overlay")),
      outlineWidth: Number.parseFloat(anchorStyle.outlineWidth),
      outlineColor: anchorStyle.outlineColor,
      outlineStyle: anchorStyle.outlineStyle,
      outlineOffset: anchorStyle.outlineOffset,
      overlayGeometry: panel.querySelector(".tutorial-anchor-overlay svg")?.innerHTML || "",
    };
  });
}

export function tutorialVisualOnlySignature(effect) {
  return JSON.stringify({
    outlineWidth: effect.outlineWidth,
    outlineColor: effect.outlineColor,
    outlineStyle: effect.outlineStyle,
    outlineOffset: effect.outlineOffset,
    overlayGeometry: effect.overlayGeometry,
  });
}

export async function walkTutorialSteps(page, identity) {
  let panel = await expectTutorialStep(page, 1, identity);
  for (const step of [2, 3]) {
    await activateNamedButton(page, "Next step");
    panel = await expectTutorialStep(page, step, identity);
  }
  return panel;
}

const TUTORIAL_PHASE_LABELS = Object.freeze([
  "Notice — Step 1 of 3",
  "Plan — Step 2 of 3",
  "Check — Step 3 of 3",
]);

async function expectTutorialPhaseHeading(panel, step) {
  await expect(panel).toHaveAttribute("data-tutorial-step", String(step));
  await expect(panel).toHaveAttribute("data-tutorial-phase-id", ["NOTICE", "PLAN", "CHECK"][step - 1]);
  await expect(panel.getByRole("heading", { name: TUTORIAL_PHASE_LABELS[step - 1], exact: true })).toBeFocused();
}

async function expectTutorialIdentityAttributes(panel, identity) {
  const attributes = {
    "data-source-question-id": identity.sourceQuestionId,
    "data-example-question-id": identity.exampleQuestionId,
    "data-answer-disclosure-policy": identity.answerDisclosurePolicy,
    "data-resolution-mode": identity.resolutionMode,
  };
  for (const [attribute, value] of Object.entries(attributes)) {
    await expect(panel).toHaveAttribute(attribute, value);
  }
}

function expectTutorialAnchorEffect(renderedEffect) {
  expect(renderedEffect).toMatchObject({
    anchorCount: 1,
    actualMathSurface: true,
    anchorRole: renderedEffect.declaredAnchor,
    cueId: renderedEffect.declaredCue,
    describedByInstruction: true,
    overlayHasSvgGeometry: true,
    overlayVisible: true,
  });
  expect(renderedEffect.outlineWidth).toBeGreaterThanOrEqual(4);
}

async function expectTutorialAnswerBoundary(panel, step) {
  const disclosurePolicy = await panel.getAttribute("data-answer-disclosure-policy");
  const shouldRenderDifferentAnswer = step === 3 && disclosurePolicy === "DIFFERENT_ANSWER_REQUIRED";
  await expect(panel).toHaveAttribute("data-terminal-answer-rendered", String(shouldRenderDifferentAnswer));
  if (shouldRenderDifferentAnswer) await expect(panel.locator('[data-worked-result="true"]')).toBeVisible();
  else await expect(panel.locator('[data-worked-result="true"]')).toHaveCount(0);
}
