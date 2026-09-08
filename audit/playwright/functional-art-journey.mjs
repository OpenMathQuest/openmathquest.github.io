import { activate, expect, expectMinimumTarget, expectSelectedState, openFreshHome, tabUntilFocused } from "./fixtures.mjs";

async function installSpeechFixture(page) {
  await page.addInitScript(() => {
    const utterances = [];
    let cancelCount = 0;
    const voice = { default: true, lang: "en-CA", localService: true, name: "Math Quest Test Voice", voiceURI: "mq-test-voice" };
    class TestUtterance {
      constructor(text) {
        this.text = String(text);
        this.lang = "";
        this.rate = 1;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
      }
    }
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
}

async function expectRocketIdentity(page) {
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
  return { rocket, rocketBefore };
}

async function expectWorldSelectionFocus(page, rocket, rocketBefore) {
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
  return forest;
}

async function expectSelectedTokensGoverned(forest) {
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
}

async function expectForcedColorSelection(page, forest) {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await tabUntilFocused(page, forest);
  const forcedState = await forest.evaluate((button) => ({
    outlineWidth: Number.parseFloat(getComputedStyle(button).outlineWidth),
    marker: getComputedStyle(button, "::after").content,
  }));
  expect(forcedState.outlineWidth).toBeGreaterThanOrEqual(4);
  expect(forcedState.marker).toContain("Selected");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
}

async function resonanceControls(page) {
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
  return { replay, disc };
}

async function expectSpeechStartAndEnd(page, replay, disc) {
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
}

async function expectSpeechErrorRecovery(page, replay, disc) {
  await activate(replay, page);
  await page.evaluate(() => { window.__mqSpeechTest.start(); window.__mqSpeechTest.error(); });
  await expect(disc).toHaveAttribute("data-speech-state", "IDLE");
}

async function expectStaleSpeechEndIgnored(page, replay, disc) {
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
}

async function openSessionForReplay(page) {
  await activate(page.getByRole("button", { name: /Start/u }), page);
  const chooseQuestion = page.locator('button[data-action="choose-question"]:visible');
  if (await chooseQuestion.count()) await activate(chooseQuestion.first(), page);
  await expect(page.locator('[data-action="physical-done"]')).toHaveCount(0);
  await expect(page.locator("section.question")).toBeVisible();
  await expect(page.locator("section.question .question-response")).toBeVisible();
}

async function sessionReplayControls(page) {
  const sessionReplayButtons = page.locator('button[data-action="replay"]');
  const sessionDiscs = page.locator("[data-resonance-disc]");
  expect(await sessionReplayButtons.count()).toBe(1);
  expect(await sessionDiscs.count()).toBe(1);
  const railReplay = page.locator('.instrument-rail button[data-action="replay"]');
  await expect(railReplay).toBeVisible();
  expect(await railReplay.evaluate((button) => button.nextElementSibling?.getAttribute("data-action"))).toBe("tutorial");
  return { railReplay, sessionDiscs };
}

async function expectRailReplayGeometry(railReplay) {
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
}

export async function exerciseFunctionalArt(page) {
  await installSpeechFixture(page);

  await openFreshHome(page);

  const { rocket, rocketBefore } = await expectRocketIdentity(page);

  const forest = await expectWorldSelectionFocus(page, rocket, rocketBefore);

  await expectSelectedTokensGoverned(forest);

  await expectForcedColorSelection(page, forest);

  const { replay, disc } = await resonanceControls(page);

  await expectSpeechStartAndEnd(page, replay, disc);

  await expectSpeechErrorRecovery(page, replay, disc);

  await expectStaleSpeechEndIgnored(page, replay, disc);

  await openSessionForReplay(page);

  const { railReplay, sessionDiscs } = await sessionReplayControls(page);

  await expectRailReplayGeometry(railReplay);
  await expectSessionSpeechTransitions(page, sessionDiscs);
}

async function expectSessionSpeechTransitions(page, sessionDiscs) {
  await activate(page.locator('button[data-action="replay"]:visible').first(), page);
  await page.evaluate(() => window.__mqSpeechTest.start());
  await expect.poll(() => sessionDiscs.evaluateAll((elements) => elements.every((element) => element.dataset.speechState === "SPEAKING"))).toBe(true);
  await page.evaluate(() => window.__mqSpeechTest.end());
  await expect.poll(() => sessionDiscs.evaluateAll((elements) => elements.every((element) => element.dataset.speechState === "IDLE"))).toBe(true);
}
