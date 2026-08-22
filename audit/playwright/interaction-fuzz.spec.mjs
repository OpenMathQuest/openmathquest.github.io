import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fc from "fast-check";
import {
  PLAYWRIGHT_INTERACTION_FUZZ_ACTION_FAMILIES,
  PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
  PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
  PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
  PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS,
  PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
  PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
  PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
  PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
  PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
  interactionFuzzAllowedActionFindings,
  interactionFuzzEffectFindings,
  interactionFuzzMinimizedFailureEvidence,
  interactionFuzzReplayPath,
  interactionFuzzSafeError,
  interactionFuzzSha256,
  playwrightInteractionFuzzShardFindings,
} from "../lib/playwright-interaction-fuzz.mjs";
import { activate, expect, test } from "./fixtures.mjs";

const outputDirectory = process.env.MQ_INTERACTION_FUZZ_OUTPUT_DIR;
if (!outputDirectory) throw new Error("MQ_INTERACTION_FUZZ_OUTPUT_DIR is required.");

async function availableCandidates(page, family) {
  return page.locator(family.selector).evaluateAll(
    (elements, suppliedFamilyId) => elements.map((element, index) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
      const selected = element.getAttribute("aria-pressed") === "true" || element.dataset.selectedLabel === "Selected";
      const dataAction = element.dataset.action || null;
      const responseAction = element.dataset.responseAction || null;
      const key = element.dataset.key || null;
      const destructiveKeyNoOp = dataAction === "key" && (key === "Clear" || key === "⌫");
      if (disabled || selected || destructiveKeyNoOp || box.width <= 0 || box.height <= 0
          || style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") return null;
      const accessibleName = String(
        element.getAttribute("aria-label")
          || element.getAttribute("title")
          || element.innerText
          || element.value
          || "",
      ).replace(/\s+/gu, " ").trim();
      return {
        familyId: suppliedFamilyId,
        domIndex: index,
        dataAction,
        responseAction,
        key,
        value: element.dataset.value || element.dataset.id || element.dataset.optionId || null,
        accessibleName,
      };
    }).filter(Boolean),
    family.id,
  );
}

async function allAvailableCandidates(page) {
  return (await Promise.all(
    PLAYWRIGHT_INTERACTION_FUZZ_ACTION_FAMILIES.map((family) => availableCandidates(page, family)),
  )).flat();
}

async function effectSnapshot(page) {
  const raw = await page.evaluate(() => {
    const root = document.querySelector("#app");
    const rootStyle = root ? getComputedStyle(root) : null;
    const rootBox = root?.getBoundingClientRect() || null;
    const storage = Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(Boolean)
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    );
    const engine = window.MathQuestEngine;
    const progressBytes = engine ? localStorage.getItem(engine.CONSTANTS.STORAGE_NAMESPACE) : null;
    let saveValidationError = null;
    if (!engine) saveValidationError = "MathQuestEngine unavailable";
    else if (progressBytes !== null) {
      try {
        saveValidationError = engine.validateState(JSON.parse(progressBytes));
      } catch (error) {
        saveValidationError = `unparseable saved progress: ${String(error?.message || error)}`;
      }
    }
    let childIdentityMode = "missing";
    try {
      const child = JSON.parse(localStorage.getItem("math-quest:child-name:v1") || "null");
      if (child?.mode === "anonymous" && child?.name === "") childIdentityMode = "anonymous";
      else if (child?.mode === "named" || child?.name) childIdentityMode = "named";
      else if (child !== null) childIdentityMode = "invalid";
    } catch {
      childIdentityMode = "invalid";
    }
    return {
      rootHtml: root?.innerHTML || "",
      formValues: Array.from(root?.querySelectorAll("input, select, textarea") || [], (control) => ({
        value: control.value,
        checked: "checked" in control ? Boolean(control.checked) : null,
        selectedIndex: "selectedIndex" in control ? control.selectedIndex : null,
      })),
      storage,
      rootVisible: Boolean(root && rootBox && rootBox.width > 0 && rootBox.height > 0
        && rootStyle?.display !== "none" && rootStyle?.visibility !== "hidden"),
      locationPath: location.pathname,
      saveValidationError,
      childIdentityMode,
    };
  });
  return {
    domDigest: interactionFuzzSha256({ rootHtml: raw.rootHtml, formValues: raw.formValues }),
    saveDigest: interactionFuzzSha256(raw.storage),
    rootVisible: raw.rootVisible,
    locationPath: raw.locationPath,
    saveValidationError: raw.saveValidationError,
    childIdentityMode: raw.childIdentityMode,
  };
}

async function waitForEffect(page, beforeDomDigest, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = await effectSnapshot(page);
  while (snapshot.domDigest === beforeDomDigest && Date.now() < deadline) {
    await page.waitForTimeout(40);
    snapshot = await effectSnapshot(page);
  }
  return snapshot;
}

function guardFindings(guard, baseline) {
  return [
    ...guard.pageErrors.slice(baseline.pageErrors).map((message) => `pageerror: ${message}`),
    ...guard.consoleErrors.slice(baseline.consoleErrors).map((message) => `console: ${message}`),
    ...guard.unexpectedRequests.slice(baseline.unexpectedRequests).map((message) => `request: ${message}`),
  ];
}

async function openSyntheticAnonymousHome(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const anonymous = page.getByRole("button", { name: "Continue without a name", exact: true });
  await expect(anonymous).toBeVisible();
  await activate(anonymous, page);
  await expect(page.getByRole("button", { name: /Start/u })).toBeVisible();
  const initial = await effectSnapshot(page);
  expect(interactionFuzzEffectFindings({ ...initial, domDigest: "setup" }, initial)).toEqual([]);
}

class SafeActivateCommand {
  constructor(ordinal) {
    this.ordinal = ordinal;
  }

  check(model) {
    return Number(model.availableActionCount || 0) > 0;
  }

  async run(model, real) {
    const candidates = await allAvailableCandidates(real.page);
    if (!candidates.length) throw new Error("Model/DOM availability drift left no safe action.");
    const candidate = candidates[this.ordinal % candidates.length];
    const family = PLAYWRIGHT_INTERACTION_FUZZ_ACTION_FAMILIES.find((item) => item.id === candidate.familyId);
    if (!family) throw new Error(`Unknown selected action family ${candidate.familyId}.`);
    const locator = real.page.locator(family.selector).nth(candidate.domIndex);
    const traceRecord = {
      actionIndex: real.trace.length,
      familyId: candidate.familyId,
      generatedOrdinal: this.ordinal,
      selectedOrdinal: this.ordinal % candidates.length,
      dataAction: candidate.dataAction,
      responseAction: candidate.responseAction,
      key: candidate.key,
      value: candidate.value,
      accessibleName: candidate.accessibleName,
      beforeDomDigest: null,
      afterDomDigest: null,
      beforeSaveDigest: null,
      afterSaveDigest: null,
      locationPath: null,
      outcome: "failed",
      findings: [],
    };
    real.trace.push(traceRecord);
    try {
      const policyFindings = interactionFuzzAllowedActionFindings(candidate);
      if (policyFindings.length) throw new Error(policyFindings.join("; "));
      if (!candidate.accessibleName) throw new Error(`Safe action ${candidate.familyId} has no machine-visible accessible name.`);
      const before = await effectSnapshot(real.page);
      traceRecord.beforeDomDigest = before.domDigest;
      traceRecord.beforeSaveDigest = before.saveDigest;
      real.browserActionExecutions.value += 1;
      await activate(locator, real.page);
      const after = await waitForEffect(real.page, before.domDigest);
      traceRecord.afterDomDigest = after.domDigest;
      traceRecord.afterSaveDigest = after.saveDigest;
      traceRecord.locationPath = after.locationPath;
      traceRecord.findings = [
        ...interactionFuzzEffectFindings(before, after),
        ...guardFindings(real.guard, real.guardBaseline),
      ];
      if (traceRecord.findings.length) throw new Error(traceRecord.findings.join("; "));
      traceRecord.outcome = "passed";
      model.availableActionCount = (await allAvailableCandidates(real.page)).length;
    } catch (error) {
      if (!traceRecord.findings.length) traceRecord.findings = [interactionFuzzSafeError(error)];
      throw error;
    }
  }

  toString() {
    return `activateAny(${this.ordinal})`;
  }
}

function guardBaseline(guard) {
  return {
    pageErrors: guard.pageErrors.length,
    consoleErrors: guard.consoleErrors.length,
    unexpectedRequests: guard.unexpectedRequests.length,
  };
}

async function executeSequence(page, mathQuestGuard, commands, browserActionExecutions) {
  const trace = [];
  const baseline = guardBaseline(mathQuestGuard);
  let error = null;
  try {
    await fc.asyncModelRun(async () => {
      await openSyntheticAnonymousHome(page);
      const setupFindings = guardFindings(mathQuestGuard, baseline);
      if (setupFindings.length) throw new Error(setupFindings.join("; "));
      return {
        model: { availableActionCount: (await allAvailableCandidates(page)).length },
        real: { page, guard: mathQuestGuard, guardBaseline: baseline, browserActionExecutions, trace },
      };
    }, commands);
    await page.waitForTimeout(75);
    const settledFindings = guardFindings(mathQuestGuard, baseline);
    if (settledFindings.length) throw new Error(settledFindings.join("; "));
  } catch (caught) {
    error = caught;
  }
  return { trace, error };
}

function executionTreeCount(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce((count, node) => count + 1 + executionTreeCount(node?.children), 0);
}

test("seeded safe interaction sequences preserve state and produce observable effects", async ({ page, mathQuestGuard }, testInfo) => {
  const project = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.find((candidate) => candidate.id === testInfo.project.name);
  expect(project, `closed fuzz profile for ${testInfo.project.name}`).toBeTruthy();
  const commandArbitrary = fc.nat(127).map((ordinal) => new SafeActivateCommand(ordinal));
  const commandsArbitrary = fc.commands([commandArbitrary], {
    maxCommands: PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
    size: "medium",
  }).filter((commands) => Array.from(commands).length > 0);
  const browserActionExecutions = { value: 0 };
  const property = fc.asyncProperty(commandsArbitrary, async (commands) => {
    const outcome = await executeSequence(page, mathQuestGuard, commands, browserActionExecutions);
    if (outcome.error) throw outcome.error;
  });
  const details = await fc.check(property, {
    seed: project.seed,
    numRuns: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    verbose: 2,
  });
  const counterexampleText = details.counterexample === null ? null : await fc.asyncStringify(details.counterexample);
  const minimizedEvidence = details.failed
    ? await interactionFuzzMinimizedFailureEvidence(
      details,
      counterexampleText,
      (commands) => executeSequence(page, mathQuestGuard, commands, browserActionExecutions),
    )
    : null;
  const relativeFailureScreenshot = details.failed
    ? `audit/.tmp-playwright-interaction-fuzz/${project.id}-failure.png`
    : null;
  if (relativeFailureScreenshot) {
    await page.screenshot({ path: path.join(outputDirectory, `${project.id}-failure.png`), fullPage: true });
  }
  const shard = {
    schemaVersion: PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
    contractId: PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
    certificationClaim: PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
    status: details.failed ? "failed" : "passed",
    project: {
      id: project.id,
      inputMethod: project.inputMethod,
      viewport: project.viewport,
      hasTouch: project.hasTouch,
    },
    toolchain: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
    seed: details.seed,
    path: details.counterexamplePath,
    replayPath: interactionFuzzReplayPath(counterexampleText),
    configuredRuns: PLAYWRIGHT_INTERACTION_FUZZ_RUNS,
    maxCommandsPerRun: PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS,
    workers: PLAYWRIGHT_INTERACTION_FUZZ_WORKERS,
    retries: PLAYWRIGHT_INTERACTION_FUZZ_RETRIES,
    numRuns: details.numRuns,
    numSkips: details.numSkips,
    numShrinks: details.numShrinks,
    propertyEvaluations: executionTreeCount(details.executionSummary),
    browserActionExecutions: browserActionExecutions.value,
    failure: details.failed ? {
      ...minimizedEvidence,
      screenshotPath: relativeFailureScreenshot,
    } : null,
  };
  const shardFindings = playwrightInteractionFuzzShardFindings(shard);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, `${project.id}.json`), `${JSON.stringify(shard, null, 2)}\n`, "utf8");
  expect(shardFindings, "closed interaction-fuzz shard contract").toEqual([]);
  if (details.failed) throw new Error(await fc.asyncDefaultReportMessage(details));
});
