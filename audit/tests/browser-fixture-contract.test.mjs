import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadShippedEngine } from "../lib/engine-loader.mjs";
import { createHtmlSourceExtractor } from "./source-extraction.mjs";
import { loadLocalBrowserModule } from "./browser-module-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const browserAudit = await readFile(path.join(root, "audit.html"), "utf8");
const extraction = createHtmlSourceExtractor(browserAudit);
const browserFunction = (name) => extraction.functionDeclaration(name);

function sessionQuestions(engine) {
  const generated = [];
  for (const skill of engine.SKILLS) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (let ordinal = 0; ordinal < 12; ordinal += 1) {
        const representation = skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT";
        generated.push(engine.makeQuestion({
          skillId: skill.skillId,
          tier,
          representation,
          seed: 1732050807,
          ordinal,
          eligibleQuestionOrdinal: ordinal,
          scheduledReview: false,
          coldTest: false,
          preview: false,
          theme: "ocean",
          scaffolded: false,
        }));
      }
    }
  }
  return generated;
}

function assertSessionFixture(engine, activeStateFor, label, question) {
  assert.ok(question, `${label} fixture must remain generated`);
  const state = activeStateFor(engine, 20_000, question);
  assert.equal(engine.validateState(state), null, label);
  const exported = engine.exportState(state);
  const restored = engine.loadState(exported, 20_000);
  assert.equal(restored.ok, true, label);
  assert.notEqual(restored.state.activeSession, null, label);
  assert.equal(restored.state.activeSession.uiState.question.questionId, state.activeSession.uiState.question.questionId, label);
  assert.equal(state.activeSession.uiState.version, engine.CONSTANTS.ACTIVE_UI_VERSION, label);
  assert.equal(state.activeSession.uiState.tutorialOpen, false, label);
  assert.equal(state.activeSession.uiState.tutorialStep, 1, label);
  assert.equal(state.activeSession.uiState.attemptCommitted, true, label);
}

test("browser-audit session fixtures use the shipped active-UI schema and export as valid state", async () => {
  const loaded = await loadShippedEngine(new URL("../../index.html", import.meta.url));
  const baseUi = vm.runInNewContext(`(${browserFunction("baseUi")})`);
  const activeStateFor = vm.runInNewContext(
    `(${browserFunction("activeStateFor")})`,
    { baseUi },
  );
  const { engine } = loaded;
  const generated = sessionQuestions(engine);
  const fixtures = [
    ["native selection", generated.find((question) => question.inputClass === "SELECTION")],
    ["incorrect COUNT_TOUCH", generated.find((question) => question.inputMethod === "COUNT_TOUCH")],
    ["MQ-048 practice token", generated.find((question) => question.skillId === "MQ-048")],
  ];
  for (const [label, question] of fixtures) {
    assertSessionFixture(engine, activeStateFor, label, question);
  }

  const stale = activeStateFor(engine, 20_000, fixtures[0][1]);
  stale.activeSession.uiState.version -= 1;
  assert.equal(engine.validateState(stale), "Invalid active session.");
  assert.throws(() => engine.exportState(stale), /Invalid active session/u);

  const tutorial = activeStateFor(engine, 20_000, fixtures[0][1], {
    hintUsed: true,
    tutorialOpen: true,
    tutorialStep: 3,
  });
  assert.equal(engine.validateState(tutorial), null);
  assert.equal(tutorial.activeSession.uiState.hintUsed, true);
  assert.equal(tutorial.activeSession.uiState.tutorialOpen, true);
  assert.equal(tutorial.activeSession.uiState.tutorialStep, 3);

});

test("browser layout permits only the governed tutorial overflow", () => {
  const layoutViewportFlowOutcome = vm.runInNewContext(
    `(${browserFunction("layoutViewportFlowOutcome")})`,
  );
  assert.equal(layoutViewportFlowOutcome({
    tutorialRequired: false,
    documentFitsFirstScreen: true,
    tutorialActionsReachable: false,
    noNestedTutorialScroll: false,
  }).pass, true, "ordinary question rows retain the first-screen contract");
  assert.equal(layoutViewportFlowOutcome({
    tutorialRequired: false,
    documentFitsFirstScreen: false,
    tutorialActionsReachable: true,
    noNestedTutorialScroll: true,
  }).pass, false, "ordinary question rows cannot borrow the tutorial outer-scroll exception");
  const unapprovedTutorialOverflow = layoutViewportFlowOutcome({
    tutorialRequired: true,
    documentFitsFirstScreen: false,
    tutorialActionsReachable: true,
    noNestedTutorialScroll: true,
  });
  assert.equal(unapprovedTutorialOverflow.pass, false, "tutorial rows cannot use unrestricted outer-page scrolling");
  assert.equal(unapprovedTutorialOverflow.approvedOuterScroll, false, "the diagnostic cannot claim an unapproved outer-scroll exception");
  const approvedTutorialOverflow = layoutViewportFlowOutcome({
    tutorialRequired: true,
    documentFitsFirstScreen: false,
    tutorialActionsReachable: true,
    noNestedTutorialScroll: true,
    outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL",
    viewportWidth: 844,
    viewportHeight: 390,
    laterGradeLargeModel: true,
  });
  assert.equal(approvedTutorialOverflow.pass, true, "only the exact later-grade 844x390 large-model exception may use outer-page scrolling");
  assert.equal(approvedTutorialOverflow.approvedOuterScroll, true, "the diagnostic must report only the exact approved exception");
});

test("browser layout rejects changes to any approved overflow predicate", () => {
  const layoutViewportFlowOutcome = vm.runInNewContext(
    `(${browserFunction("layoutViewportFlowOutcome")})`,
  );
  for (const mutation of [
    { outerScrollException: "OTHER", viewportWidth: 844, viewportHeight: 390, laterGradeLargeModel: true },
    { outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL", viewportWidth: 843, viewportHeight: 390, laterGradeLargeModel: true },
    { outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL", viewportWidth: 844, viewportHeight: 391, laterGradeLargeModel: true },
    { outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL", viewportWidth: 844, viewportHeight: 390, laterGradeLargeModel: false },
  ]) {
    const outcome = layoutViewportFlowOutcome({
      tutorialRequired: true,
      documentFitsFirstScreen: false,
      tutorialActionsReachable: true,
      noNestedTutorialScroll: true,
      ...mutation,
    });
    assert.equal(outcome.pass, false, "the short-landscape exception must fail closed when any approved predicate changes");
    assert.equal(outcome.approvedOuterScroll, false, "a rejected exception cannot be reported as approved");
  }
});

test("browser layout rejects unreachable or nested tutorial actions", () => {
  const layoutViewportFlowOutcome = vm.runInNewContext(
    `(${browserFunction("layoutViewportFlowOutcome")})`,
  );
  assert.equal(layoutViewportFlowOutcome({
    tutorialRequired: true,
    documentFitsFirstScreen: false,
    tutorialActionsReachable: false,
    noNestedTutorialScroll: true,
    outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL",
    viewportWidth: 844,
    viewportHeight: 390,
    laterGradeLargeModel: true,
  }).pass, false, "outer flow cannot hide a tutorial action");
  assert.equal(layoutViewportFlowOutcome({
    tutorialRequired: true,
    documentFitsFirstScreen: false,
    tutorialActionsReachable: true,
    noNestedTutorialScroll: false,
    outerScrollException: "LATER_GRADE_844x390_LARGE_MODEL",
    viewportWidth: 844,
    viewportHeight: 390,
    laterGradeLargeModel: true,
  }).pass, false, "a nested tutorial scroller remains prohibited");
  assert.match(browserAudit, /const viewportFlow = layoutViewportFlowOutcome\(\{/u,
    "the rendered BR-21 verdict and diagnostic must use the effect-tested viewport policy outcome");
  assert.match(browserAudit, /tutorialOuterScrollAllowed: viewportFlow\.approvedOuterScroll/u,
    "the rendered BR-21 diagnostic must come from the same effect-tested outcome as its verdict");
  assert.match(browserAudit, /viewportFlowPass: viewportFlow\.pass/u,
    "the rendered BR-21 pass diagnostic must come from the same effect-tested outcome as its verdict");

});

test("browser font measurement includes tutorial step labels", () => {
  const visibleMetrics = vm.runInNewContext(`(${browserFunction("visibleMetrics")})`);
  const tutorialStep = { fontSize: 14 };
  const ordinaryHeading = { fontSize: 18 };
  const metricScenario = {
    doc: {
      querySelector() {
        return {
          querySelectorAll(selector) {
            if (selector === "button,input,select") return [];
            return selector.includes(".tutorial-stepper li")
              ? [ordinaryHeading, tutorialStep]
              : [ordinaryHeading];
          },
        };
      },
    },
    win: {
      getComputedStyle(element) {
        return {
          display: "block",
          visibility: "visible",
          fontSize: `${element.fontSize}px`,
          fontFamily: "Inter",
        };
      },
    },
  };
  for (const element of [ordinaryHeading, tutorialStep]) {
    element.getBoundingClientRect = () => ({ width: 100, height: 44 });
  }
  assert.equal(
    visibleMetrics(metricScenario, ".tutorial-panel").minFont,
    14,
    "BR-21 must measure tutorial step labels so a below-floor label fails the rendered font oracle",
  );

});

test("visual layout measurements reset prior focus-induced scrolling", async () => {
  const filename = path.join(root, "audit", "approved-visual-regression.js");
  const visualAudit = await readFile(filename, "utf8");
  const module = await loadLocalBrowserModule(visualAudit + "\nexport { auditDesktopLabLayout, auditMobileLabLayout };\n", filename);
  await assertVisualScrollReset(module.auditDesktopLabLayout, "desktop");
  await assertVisualScrollReset(module.auditMobileLabLayout, "mobile");
});

async function assertVisualScrollReset(run, kind) {
  const reachedMeasurement = new Error("reached geometry measurement");
  const effects = [];
  const view = {
    window: { scrollY: 91, scrollTo(x, y) { assert.equal(x, 0); this.scrollY = y; effects.push("scroll"); } },
    document: { querySelector(selector) {
      assert.equal(view.window.scrollY, 0, `${kind} must reset scrolling before querying layout`);
      if (selector === '[data-lab-action="model"]') return {
        disabled: false, textContent: "Show model", click() { view.window.scrollY = 73; effects.push("toggle"); },
      };
      effects.push("measure");
      throw reachedMeasurement;
    } },
  };
  const engine = { SKILLS: [{ skillId: "probe", level: 1, generatorProfile: "probe" }], LEVELS: [{ number: 1 }] };
  const options = { engine, expectedProfiles: ["probe"], view, tests: {}, titles: {},
    resize: async () => { effects.push("resize"); },
    selectCase: async () => { view.window.scrollY = 91; effects.push("select"); },
    pause: async () => { effects.push("pause"); } };
  await assert.rejects(run(options), (error) => error === reachedMeasurement);
  const expected = kind === "desktop"
    ? ["resize", "select", "scroll", "pause", "toggle", "pause", "scroll", "pause", "measure"]
    : ["resize", "select", "scroll", "pause", "measure"];
  assert.deepEqual(effects, expected, `${kind} must preserve both selection and model-opening scroll barriers`);
}
