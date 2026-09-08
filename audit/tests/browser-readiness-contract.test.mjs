import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createHtmlSourceExtractor } from "./source-extraction.mjs";

const browserAudit = await readFile(new URL("../../audit.html", import.meta.url), "utf8");
const extraction = createHtmlSourceExtractor(browserAudit);
const browserFunction = (name) => extraction.functionDeclaration(name);

const readinessReply = { type: "MATH_QUEST_READINESS_V1", ready: true };
class FakeMessageChannel {
  constructor() {
    const port1 = {
      onmessage: null,
      onmessageerror: null,
      close() { this.closed = true; },
    };
    this.port1 = port1;
    this.port2 = {
      reply(value) { queueMicrotask(() => port1.onmessage?.({ data: value })); },
    };
  }
}
const controller = {
  postMessage(message, ports) {
    assert.equal(message.type, "MATH_QUEST_GET_READINESS_V1");
    assert.equal(Object.keys(message).join(","), "type");
    assert.equal(ports.length, 1);
    ports[0].reply(readinessReply);
  },
};
const registration = { active: controller };
const queryReadiness = vm.runInNewContext(
  `(${browserFunction("queryBrowserPwaReadiness")})`,
);

test("browser audit rejects safe-boundary navigation and opens only the bound physical cache", async () => {
  const waitForNavigation = vm.runInNewContext(
    `(${browserFunction("waitForScenarioNavigation")})`,
    {
      scenarioAppReady: () => true,
      waitUntil: async (predicate) => {
        assert.equal(await predicate(), false, "the pre-navigation document must not satisfy readiness");
        scenario.doc = restoredDocument;
        return predicate();
      },
    },
  );
  const initialDocument = {};
  const restoredDocument = {};
  const scenario = { doc: initialDocument, frame: {} };
  assert.equal(
    await waitForNavigation(
      scenario,
      initialDocument,
      (candidate) => candidate.doc === restoredDocument ? "restored" : false,
    ),
    "restored",
  );
  const observeNavigationQuiet = vm.runInNewContext(
    `(${browserFunction("observeScenarioNavigationQuiet")})`,
    { setTimeout },
  );
  const listeners = new Set();
  const stableDocument = {};
  const quietScenario = {
    doc: stableDocument,
    frame: {
      addEventListener(type, listener) {
        assert.equal(type, "load");
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        assert.equal(type, "load");
        listeners.delete(listener);
      },
    },
  };
  assert.equal(await observeNavigationQuiet(quietScenario, stableDocument, () => {}, 5), false);
  assert.equal(listeners.size, 0, "the bounded quiet observation must remove its listener");
  assert.equal(await observeNavigationQuiet(quietScenario, stableDocument, () => {
    setTimeout(() => {
      quietScenario.doc = {};
      for (const listener of listeners) listener();
    }, 1);
  }, 10), true);
  assert.equal(listeners.size, 0, "navigation observation must also remove its listener");

});

test("readiness uses the current controller and bounds registration startup", async () => {
  const queried = await queryReadiness({
    navigator: {
      serviceWorker: {
        ready: Promise.resolve(registration),
        controller,
        addEventListener() {},
        removeEventListener() {},
      },
    },
    MessageChannel: FakeMessageChannel,
    setTimeout,
    clearTimeout,
  });
  assert.equal(queried.registration, registration);
  assert.equal(queried.controller, controller);
  assert.equal(queried.readinessWorker, controller);
  assert.equal(queried.readiness, readinessReply);

  await assert.rejects(
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: new Promise(() => {}),
          controller: null,
          addEventListener() {},
          removeEventListener() {},
        },
      },
      MessageChannel: FakeMessageChannel,
      setTimeout,
      clearTimeout,
    }, 5),
    (error) => {
      assert.match(error.message, /service worker registration readiness timed out after 5 ms/u);
      assert.equal(error.code, "PWA_READINESS_STAGE_TIMEOUT");
      assert.equal(error.stage, "service-worker-ready");
      assert.equal(error.timedOut, true);
      assert.equal(error.timeoutMs, 5);
      return true;
    },
  );

});

test("readiness can use an active worker before a controller exists", async () => {
  const activeWorkerWithoutController = await queryReadiness({
    navigator: {
      serviceWorker: {
        ready: Promise.resolve(registration),
        controller: null,
        addEventListener() { throw new Error("controllerchange must not be required"); },
        removeEventListener() { throw new Error("controllerchange must not be required"); },
      },
    },
    MessageChannel: FakeMessageChannel,
    setTimeout,
    clearTimeout,
  }, 25);
  assert.equal(activeWorkerWithoutController.controller, null);
  assert.equal(activeWorkerWithoutController.readinessWorker, controller);
  assert.equal(activeWorkerWithoutController.readiness, readinessReply);

});

test("readiness timeout closes its message channel", async () => {
  let readinessPortClosed = false;
  class SilentMessageChannel {
    constructor() {
      this.port1 = {
        onmessage: null,
        onmessageerror: null,
        close() { readinessPortClosed = true; },
      };
      this.port2 = {};
    }
  }
  await assert.rejects(
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          controller: { postMessage() {} },
          addEventListener() {},
          removeEventListener() {},
        },
      },
      MessageChannel: SilentMessageChannel,
      setTimeout,
      clearTimeout,
    }, 5),
    (error) => {
      assert.match(error.message, /service worker readiness response timed out after 5 ms/u);
      assert.equal(error.code, "PWA_READINESS_STAGE_TIMEOUT");
      assert.equal(error.stage, "readiness-message");
      assert.equal(error.timedOut, true);
      assert.equal(error.timeoutMs, 5);
      return true;
    },
  );
  assert.equal(readinessPortClosed, true, "a timed-out readiness channel must be closed");

});

test("registration rejection retains a classified readiness failure", async () => {
  await assert.rejects(
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.reject(new Error("registration unavailable")),
          controller: null,
          addEventListener() {},
          removeEventListener() {},
        },
      },
      MessageChannel: FakeMessageChannel,
      setTimeout,
      clearTimeout,
    }, 25),
    (error) => {
      assert.equal(error.code, "PWA_READINESS_STAGE_FAILED");
      assert.equal(error.stage, "service-worker-ready");
      assert.equal(error.timedOut, false);
      assert.match(error.message, /registration unavailable/u);
      return true;
    },
  );

});

test("readiness cleanup failure cannot hang or conceal the timeout", async () => {
  class ThrowingCloseMessageChannel {
    constructor() {
      this.port1 = {
        onmessage: null,
        onmessageerror: null,
        close() { throw new Error("readiness channel cleanup failed"); },
      };
      this.port2 = {};
    }
  }
  const cleanupDoesNotHang = Promise.race([
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          controller: { postMessage() {} },
          addEventListener() {},
          removeEventListener() {},
        },
      },
      MessageChannel: ThrowingCloseMessageChannel,
      setTimeout,
      clearTimeout,
    }, 5),
    new Promise((_, reject) => { setTimeout(() => reject(new Error("cleanup test guard expired")), 100); }),
  ]);
  await assert.rejects(cleanupDoesNotHang, (error) => {
    assert.equal(error.code, "PWA_READINESS_STAGE_TIMEOUT");
    assert.equal(error.stage, "readiness-message");
    assert.match(error.message, /readiness channel cleanup failed/u);
    return true;
  });

});

test("readiness fails when no worker can answer", async () => {
  await assert.rejects(
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.resolve({ active: null }),
          controller: null,
        },
      },
      MessageChannel: FakeMessageChannel,
      setTimeout,
      clearTimeout,
    }, 25),
    (error) => {
      assert.equal(error.code, "PWA_READINESS_STAGE_FAILED");
      assert.equal(error.stage, "readiness-worker");
      assert.equal(error.timedOut, false);
      assert.match(error.message, /no active service worker can answer readiness/u);
      return true;
    },
  );

});

test("browser shortcuts retain the native focused control", () => {
  const dispatchKey = vm.runInNewContext(
    `(${browserFunction("dispatchKey")})`,
  );
  let dispatchedTarget = null;
  const fakeDocument = {
    activeElement: null,
    documentElement: {},
    body: {
      dispatchEvent() { throw new Error("body must not receive the shortcut"); },
    },
    getElementById(id) { return id === "app" ? app : null; },
  };
  const app = {
    focus() { fakeDocument.activeElement = app; },
    dispatchEvent(event) {
      dispatchedTarget = app;
      assert.equal(event.key, "Enter");
      return true;
    },
  };
  const nativeButton = {
    dispatchEvent(event) {
      dispatchedTarget = nativeButton;
      assert.equal(event.key, "Enter");
      return true;
    },
  };
  fakeDocument.activeElement = nativeButton;
  class FakeKeyboardEvent {
    constructor(type, options) {
      this.type = type;
      this.defaultPrevented = false;
      Object.assign(this, options);
    }
  }
  const shortcut = dispatchKey(
    { doc: fakeDocument, win: { KeyboardEvent: FakeKeyboardEvent } },
    "Enter",
  );
  assert.equal(shortcut.target, nativeButton);
  assert.equal(dispatchedTarget, nativeButton);
  assert.equal(fakeDocument.activeElement, nativeButton);

});

test("browser audit uses only exact physical caches and safe-boundary navigation", () => {
  const physicalCacheNames = vm.runInNewContext(
    `(${browserFunction("pwaPhysicalCacheNames")})`,
  );
  const logicalIdentity = "math-quest-static-v1.0.0-beta.8";
  const manifestSha = "a".repeat(64);
  const physicalName = `${logicalIdentity}-${manifestSha}`;
  assert.deepEqual(
    [...physicalCacheNames(logicalIdentity, [
      logicalIdentity,
      physicalName,
      `${physicalName}-staging`,
      `math-quest-static-v1.0.0-beta.1-${manifestSha}`,
    ])],
    [physicalName],
  );
  assert.deepEqual(
    [...physicalCacheNames(logicalIdentity, [
      physicalName,
      `${logicalIdentity}-${"b".repeat(64)}`,
    ])],
    [physicalName, `${logicalIdentity}-${"b".repeat(64)}`],
  );
  assert.deepEqual(
    [...physicalCacheNames("math-quest-static-v1.0.0-beta.1", [physicalName])],
    [],
  );
  assert.doesNotMatch(
    browserAudit,
    /await waitForScenarioNavigation\(\s*placementScenario,\s*boundaryDocumentBeforePause,/u,
  );
  assert.match(browserAudit, /boundaryNavigationObserved = await observeScenarioNavigationQuiet\(/u);
  assert.match(browserAudit, /explicitResumeButton\s*&&\s*!boundaryNavigationObserved\s*&&\s*boundaryDraftRestored/u);
  assert.match(browserAudit, /placementScenario\.doc === boundaryDocumentBeforePause[\s\S]{0,500}\[data-question-id="\$\{boundaryQuestionId\}"\][\s\S]{0,500}=== boundaryQuestionId[\s\S]{0,500}=== boundaryDraftBeforePause/u);
  assert.doesNotMatch(browserAudit, /physical-done|shortcutTarget/u);
  assert.match(
    browserAudit,
    /const pwaReadinessPromise = queryBrowserPwaReadiness\(win\)\.then\(/u,
  );
  assert.match(browserAudit, /const pwaReadiness = await pwaReadinessPromise;/u);
  assert.match(
    browserAudit,
    /matchingCacheStorageNames\.length === 1\s*\?\s*matchingCacheStorageNames\[0\]/u,
  );
  assert.match(browserAudit, /shellManifestSha === cacheStorageManifestSha/u);
  assert.doesNotMatch(browserAudit, /win\.caches\.open\(cacheIdentity\)/u);
  assert.doesNotMatch(browserAudit, /fetch\("\.\/sw\.js"/u);
  assert.match(browserAudit, /queryBrowserPwaReadiness\(hostWindow, timeoutMs = 8000\)/u);
  assert.ok(
    browserAudit.indexOf('add("BR-24"') < browserAudit.indexOf("const visualRegression ="),
    "BR-24 must record its bounded verdict before later visual/profile checks run",
  );
});

