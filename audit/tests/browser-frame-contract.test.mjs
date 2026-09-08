import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createHtmlSourceExtractor } from "./source-extraction.mjs";

const browserAudit = await readFile(new URL("../../audit.html", import.meta.url), "utf8");
const extraction = createHtmlSourceExtractor(browserAudit);
const browserFunction = (name) => extraction.functionDeclaration(name);

const keepAuditFramePainted = vm.runInNewContext(
  `(${browserFunction("keepAuditFramePainted")})`,
);

function createBootFrame(bootEffects) {
  return {
    style: {},
    contentDocument: {},
    contentWindow: {},
    remove() {
      bootEffects.push("remove");
    },
  };
}

function createBootFixture(scenarioFrameSource) {
  const bootEffects = [];
  const bootFrame = createBootFrame(bootEffects);
  let failBoot = false;
  const scenarioFrameContext = {
    auditProgressMarker: "initializing",
    TEST_SAVE_KEY: "test-progress",
    auditWriterBarrier: async () => bootEffects.push("barrier"),
    localStorage: {
      setItem(key, value) {
        bootEffects.push(`stored:${key}:${value}`);
      },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "iframe");
        return bootFrame;
      },
      body: {
        append(candidate) {
          assert.equal(candidate, bootFrame);
          bootEffects.push("append");
        },
      },
    },
    armAuditFrameRemoval(candidate) {
      assert.equal(candidate, bootFrame);
      bootEffects.push("armed");
    },
    keepAuditFramePainted,
    async waitFrame(candidate) {
      assert.equal(candidate, bootFrame);
      assert.equal(candidate.style.left, "0");
      assert.equal(candidate.style.opacity, "0.01");
      assert.equal(candidate.style.zIndex, "9999");
      bootEffects.push("waited-while-painted");
      if (failBoot) throw new Error("boot-failure");
    },
    pause: async () => bootEffects.push("paused"),
    requireScenarioAppReady: async (candidate) => {
      assert.equal(candidate, bootFrame);
      bootEffects.push("ready");
    },
    requireStableRenderedGeometry: async (scenario, label) => {
      assert.equal(scenario.frame, bootFrame);
      assert.equal(scenario.doc, bootFrame.contentDocument);
      assert.equal(scenario.win, bootFrame.contentWindow);
      assert.equal(label, bootFrame.title);
      bootEffects.push("settled");
    },
  };
  const scenarioFrameBytes = vm.runInNewContext(
    `(${scenarioFrameSource})`,
    scenarioFrameContext,
  );
  return { bootEffects, bootFrame, scenarioFrameContext, scenarioFrameBytes, failBoot: () => { failBoot = true; } };
}

test("browser scenarios await settled Home and release the writer lease before iframe removal", async () => {
  const armAuditFrameRemoval = vm.runInNewContext(
    `(${browserFunction("armAuditFrameRemoval")})`,
  );
  const effects = [];
  class FrameEvent {
    constructor(type) {
      this.type = type;
    }
  }
  const frame = {
    contentWindow: {
      Event: FrameEvent,
      dispatchEvent(event) {
        effects.push(event.type);
      },
    },
    remove() {
      effects.push("remove");
    },
  };
  assert.equal(armAuditFrameRemoval(frame), frame);
  frame.remove();
  frame.remove();
  assert.deepEqual(
    effects,
    ["pagehide", "remove", "remove"],
    "pagehide must synchronously release the game's writer lease before the first physical removal",
  );

});

test("anonymous browser scenarios wait until Home is settled", async () => {
  let homeReady = false;
  const requireScenarioHome = vm.runInNewContext(
    `(${browserFunction("requireScenarioHome")})`,
    {
      scenarioAppReady: () => homeReady,
      async waitUntil(predicate) {
        assert.equal(await predicate(), false, "the transient pre-Home document must not pass");
        homeReady = true;
        assert.equal(await predicate(), true, "the settled Home document must pass");
        return true;
      },
    },
  );
  const homeFrame = {
    title: "anonymous first-use",
    contentDocument: {
      querySelector(selector) {
        if (selector === '[data-action="start"]') return homeReady ? {} : null;
        if (selector === '[data-action="name-skip"]') return homeReady ? null : {};
        return null;
      },
    },
  };
  assert.equal(await requireScenarioHome(homeFrame), true);

});

test("browser audit frames remain painted during measurement", () => {
  const paintedScenario = { frame: { style: {} } };
  keepAuditFramePainted(paintedScenario);
  assert.deepEqual(
    paintedScenario.frame.style,
    { left: "0", opacity: "0.01", zIndex: "9999" },
  );

});

test("browser resizing awaits stable rendered geometry", async () => {
  const resizeScenarioSource = browserFunction("resizeScenario");
  assert.match(resizeScenarioSource, /await requireStableRenderedGeometry\(scenario,/u);
  const resizeEffects = [];
  let releaseSettlement;
  let markSettlementStarted;
  const settlementGate = new Promise((resolve) => { releaseSettlement = resolve; });
  const settlementStarted = new Promise((resolve) => { markSettlementStarted = resolve; });
  const resizedScenario = {
    frame: { style: {} },
    win: {
      Event: class { constructor(type) { this.type = type; } },
      dispatchEvent(event) { resizeEffects.push(event.type); },
    },
  };
  const resizeScenario = vm.runInNewContext(`(${resizeScenarioSource})`, {
    pause: async () => resizeEffects.push("pause"),
    requireStableRenderedGeometry: async (candidate, label) => {
      assert.equal(candidate, resizedScenario);
      assert.equal(label, "Resized browser audit 844x390");
      resizeEffects.push("settlement-started");
      markSettlementStarted();
      await settlementGate;
      resizeEffects.push("settled");
    },
  });
  let resizeResolved = false;
  const pendingResize = resizeScenario(resizedScenario, 844, 390).then(() => {
    resizeResolved = true;
    resizeEffects.push("resolved");
  });
  await settlementStarted;
  assert.equal(resizeResolved, false, "resizeScenario must not release its caller before settlement");
  assert.deepEqual(resizedScenario.frame.style, { width: "844px", height: "390px" });
  assert.deepEqual(resizeEffects, ["resize", "pause", "pause", "settlement-started"]);
  releaseSettlement();
  await pendingResize;
  assert.equal(resizeResolved, true);
  assert.deepEqual(resizeEffects, ["resize", "pause", "pause", "settlement-started", "settled", "resolved"]);

});

test("browser frame boot and failure preserve lifecycle ordering", async () => {
  const scenarioFrameSource = browserFunction("scenarioFrameBytes");
  assert.match(scenarioFrameSource, /armAuditFrameRemoval\(frame\)/u);
  const { bootEffects, bootFrame, scenarioFrameContext, scenarioFrameBytes, failBoot } = createBootFixture(scenarioFrameSource);
  const bootedScenario = await scenarioFrameBytes("paintable-boot", "bytes", 390, 844);
  assert.equal(bootedScenario.frame, bootFrame);
  assert.equal(scenarioFrameContext.auditProgressMarker, "scenario:paintable-boot:ready");
  assert.deepEqual(
    bootEffects,
    [
      "barrier",
      "stored:test-progress:bytes",
      "armed",
      "append",
      "waited-while-painted",
      "paused",
      "ready",
      "settled",
    ],
  );
  failBoot();
  const failedBootStart = bootEffects.length;
  await assert.rejects(
    scenarioFrameBytes("failed-boot", "bad-bytes"),
    /boot-failure/u,
  );
  assert.equal(scenarioFrameContext.auditProgressMarker, "scenario:failed-boot:failed");
  assert.deepEqual(
    bootEffects.slice(failedBootStart),
    [
      "barrier",
      "stored:test-progress:bad-bytes",
      "armed",
      "append",
      "waited-while-painted",
      "remove",
    ],
    "a failed boot must execute the same lease-releasing frame cleanup",
  );
  assert.match(
    browserAudit,
    /const homeAfterSkip = await requireScenarioHome\(\s*anonymousScenario\.frame,/u,
  );
});

