import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import "./page-adapter-effects.test.mjs";
import {
  AUDIT_COMPLETION_EXPRESSION,
  AUDIT_SERVED_RELATIVE_PATHS,
  BROWSER_AUDIT_SHARDS,
  BROWSER_AUDIT_TIMING,
  EXPECTED_BROWSER_RESULT_IDS,
  browserLaunchArgs,
  requestBrowserClose,
  serveWorkspace,
  validateBrowserAuditPayload,
  waitForBrowserCleanup,
  waitForAuditPageCompletion,
} from "../lib/browser-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const execFile = promisify(execFileCallback);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const RELEASE_ENTRY_SPECS = Object.freeze([
  ["./assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["./assets/icons/apple-touch-icon.png", "image/png"],
  ["./assets/icons/icon-192.png", "image/png"],
  ["./assets/icons/icon-512.png", "image/png"],
  ["./assets/sounds/close.wav", "audio/wav"],
  ["./assets/sounds/confirm.wav", "audio/wav"],
  ["./assets/sounds/incorrect.wav", "audio/wav"],
  ["./assets/sounds/tap.wav", "audio/wav"],
  ["./index.html", "text/html"],
  ["./manifest.webmanifest", "application/manifest+json"],
  ["./LICENSE", "application/octet-stream"],
  ["./PRIVACY.md", "text/markdown"],
  ["./THIRD_PARTY_NOTICES.md", "text/markdown"],
]);
const PAGES_TAGGED_ARTIFACT_SPECS = Object.freeze([
  ["assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["assets/icons/apple-touch-icon.png", "image/png"],
  ["assets/icons/icon-192.png", "image/png"],
  ["assets/icons/icon-512.png", "image/png"],
  ["assets/sounds/close.wav", "audio/wav"],
  ["assets/sounds/confirm.wav", "audio/wav"],
  ["assets/sounds/incorrect.wav", "audio/wav"],
  ["assets/sounds/tap.wav", "audio/wav"],
  ["curriculum/math-quest-manifest-v1.json", "application/json"],
  ["curriculum/PROVENANCE.md", "text/markdown"],
  ["index.html", "text/html"],
  ["manifest.webmanifest", "application/manifest+json"],
  ["release-shell-v1.json", "application/json"],
  ["sw.js", "text/javascript"],
  ["LICENSE", "application/octet-stream"],
  ["OPEN_SOURCE_POLICY.md", "text/markdown"],
  ["PRIVACY.md", "text/markdown"],
  ["THIRD_PARTY_NOTICES.md", "text/markdown"],
  ["licenses/Inter-OFL.txt", "text/plain"],
  ["licenses/app-icons.md", "text/markdown"],
  ["licenses/component-register-v1.json", "application/json"],
  ["licenses/sound-effects.md", "text/markdown"],
]);

function explicitRelativePathArray(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, marker);
  const arrayStart = source.indexOf("[", markerIndex);
  assert.notEqual(arrayStart, -1, `${marker} array start`);
  const arrayEnd = matchingDelimiter(source, arrayStart, "[", "]");
  const body = source.slice(arrayStart, arrayEnd + 1);
  assert.doesNotMatch(body, /\.\.\./u, `${marker} must remain an explicit oracle`);
  return [...body.matchAll(/"(\.\/[^"]+)"/gu)].map((match) => match[1]);
}

function matchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close && --depth === 0) return index;
  }
  throw new Error(`unclosed ${open}${close} delimiter`);
}

function adapterFunction(adapter, name) {
  const matches = [...adapter.matchAll(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, "gu"))];
  assert.equal(matches.length, 1, `${name} must have one shipped declaration`);
  const parametersStart = adapter.indexOf("(", matches[0].index);
  const parametersEnd = matchingDelimiter(adapter, parametersStart, "(", ")");
  const bodyStart = adapter.indexOf("{", parametersEnd);
  const bodyEnd = matchingDelimiter(adapter, bodyStart, "{", "}");
  return adapter.slice(matches[0].index, bodyEnd + 1);
}

function adapterPwaStatusFunctions(adapter) {
  const start = adapter.indexOf("let pwaDialogOpen=");
  const end = adapter.indexOf("function validateReadiness(");
  assert.notEqual(start, -1, "the shipped PWA dialog-state boundary must exist");
  assert.notEqual(end, -1, "validateReadiness must have one shipped declaration");
  assert.ok(end > start, "PWA status helpers must precede validateReadiness");
  return adapter.slice(start, end);
}

test("legacy recovery links remain one-use but the current page exposes no forced-navigation responder", async () => {
  const adapter = await readFile(path.join(root, "index.html"), "utf8");
  const consumeSource = adapterFunction(adapter, "consumeLegacyBeta1RecoveryMarker");

  function consume(href, { replaceThrows = false } = {}) {
    const location = new URL(href);
    const replacements = [];
    const history = {
      state: Object.freeze({ retained: true }),
      replaceState(state, title, nextHref) {
        if (replaceThrows) throw new Error("injected-history-failure");
        replacements.push({ state, title, href: nextHref });
      },
    };
    const consumed = vm.runInNewContext(`(${consumeSource})()`, {
      URL,
      URLSearchParams,
      history,
      location,
    });
    return { consumed, replacements };
  }

  const exact = consume("https://example.test/play/?retained=yes&legacy-recovery=beta1#question");
  assert.equal(exact.consumed, true);
  assert.deepEqual(exact.replacements, [{
    state: { retained: true },
    title: "",
    href: "https://example.test/play/?retained=yes#question",
  }]);

  for (const href of [
    "https://example.test/play/?retained=yes#question",
    "https://example.test/play/?legacy-recovery=beta2#question",
  ]) {
    const ignored = consume(href);
    assert.equal(ignored.consumed, false);
    assert.deepEqual(ignored.replacements, []);
  }

  const historyUnavailable = consume(
    "https://example.test/play/?legacy-recovery=beta1",
    { replaceThrows: true },
  );
  assert.equal(historyUnavailable.consumed, true, "recovery remains visible when URL cleanup is unavailable");
  assert.deepEqual(historyUnavailable.replacements, []);

  for (const forbidden of [
    "respondToClientVersionChallenge",
    "MATH_QUEST_CLIENT_VERSION_CHALLENGE_V1",
    "MATH_QUEST_CLIENT_VERSION_RESPONSE_V1",
    "math-quest-client-version-v1",
  ]) assert.doesNotMatch(adapter, new RegExp(forbidden, "u"), forbidden);
  assert.match(adapter, /navigator\.serviceWorker\.addEventListener\("controllerchange",routePwaControllerChange\)/u);
});

async function makeTreeWritable(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await makeTreeWritable(entryPath);
    else await chmod(entryPath, 0o644);
  }
}

test("generator, worker, page, and browser audit share one exact explicit shell path oracle", async () => {
  const [generator, worker, page, browserAudit] = await Promise.all([
    readFile(path.join(root, "tools", "build-pwa-release-manifest.mjs"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
    readFile(path.join(root, "index.html"), "utf8"),
    readFile(path.join(root, "audit.html"), "utf8"),
  ]);
  const expectedEntries = RELEASE_ENTRY_SPECS.map(([entryPath]) => entryPath);
  assert.deepEqual(
    explicitRelativePathArray(generator, "const ENTRIES = Object.freeze("),
    expectedEntries,
  );
  assert.deepEqual(
    explicitRelativePathArray(worker, "const SHELL_RELATIVE_PATHS = Object.freeze("),
    expectedEntries,
  );
  assert.deepEqual(
    explicitRelativePathArray(page, "PWA_REQUIRED_PATHS=Object.freeze("),
    ["./release-shell-v1.json", ...expectedEntries],
  );
  assert.deepEqual(
    explicitRelativePathArray(browserAudit, "const expectedShellEntryPaths = Object.freeze("),
    expectedEntries,
  );
});

test("hosted browser audit uses bounded real-time CDP completion and preserves workflow headroom", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "audit.yml"), "utf8");
  const releaseJob = workflow.split(/^  full-audit:\s*$/mu)[1] || "";
  const workflowTimeout = Number(releaseJob.match(/^\s*timeout-minutes:\s*(\d+)\s*$/mu)?.[1]);
  assert.equal(
    workflowTimeout,
    BROWSER_AUDIT_TIMING.workflowTimeoutMinutes,
    "the code policy and hosted workflow must share one reviewed job ceiling",
  );
  assert.equal(
    BROWSER_AUDIT_TIMING.inPageWatchdogMs,
    2_280_000,
    "the page must retain the owner-approved doubled 38-minute real-time watchdog",
  );
  assert.equal(
    BROWSER_AUDIT_TIMING.wallTimeoutMs,
    2_400_000,
    "the installed-browser controller must retain the doubled 40-minute fail-closed wall ceiling",
  );
  assert.ok(
    BROWSER_AUDIT_TIMING.wallTimeoutMs
      - BROWSER_AUDIT_TIMING.inPageWatchdogMs >= 120_000,
    "the fail-closed in-page watchdog must retain at least two real minutes for CDP serialization and shutdown",
  );
  assert.ok(
    BROWSER_AUDIT_TIMING.wallTimeoutMs
      + BROWSER_AUDIT_TIMING.requiredWorkflowHeadroomMs
      <= workflowTimeout * 60_000,
    "the browser wall limit must preserve reviewed setup, reporting, and artifact-upload headroom",
  );

  const profile = "C:\\audit\\isolated-profile";
  const url = "http://127.0.0.1:8771/audit.html?autorun=1";
  const args = browserLaunchArgs({ profile, url });
  assert.equal(args.some((argument) => argument.startsWith("--virtual-time-budget=")), false);
  assert.equal(args.includes("--dump-dom"), false);
  assert.equal(args.includes("--remote-debugging-address=127.0.0.1"), true);
  assert.equal(args.includes("--remote-debugging-port=0"), true);
  assert.equal(args.includes(`--user-data-dir=${profile}`), true);
  assert.equal(
    args.includes("--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1"),
    true,
  );
  for (const argument of [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ]) {
    assert.equal(args.includes(argument), true, argument);
  }
  assert.equal(args.at(-1), url);

  assert.equal(
    vm.runInNewContext(AUDIT_COMPLETION_EXPRESSION, { document: { documentElement: null } }),
    false,
    "the CDP completion probe must treat a transient document without a root as incomplete instead of throwing",
  );
  assert.equal(
    vm.runInNewContext(AUDIT_COMPLETION_EXPRESSION, {
      document: { documentElement: { dataset: { auditComplete: "true" } } },
    }),
    true,
    "the same completion probe must still recognize the exact terminal marker",
  );

  const cleanupWaits = [];
  await waitForBrowserCleanup(new Promise(() => {}), {
    remainingMs: () => BROWSER_AUDIT_TIMING.wallTimeoutMs,
    wait: async (delay) => { cleanupWaits.push(delay); },
  });
  assert.deepEqual(
    cleanupWaits,
    [BROWSER_AUDIT_TIMING.browserCloseGraceMs],
    "a CDP/control failure must bound browser-tree cleanup to the reviewed grace period rather than the remaining wall deadline",
  );

  let completionClock = 0;
  const completionEffects = [];
  const completion = await waitForAuditPageCompletion({
    timeoutMs: 1_000,
    pollIntervalMs: 250,
    now: () => completionClock,
    evaluate: async () => {
      completionEffects.push(`evaluate:${completionClock}`);
      return completionClock === 500;
    },
    wait: async (delay) => {
      completionEffects.push(`wait:${delay}`);
      completionClock += delay;
    },
  });
  assert.deepEqual(completion, { polls: 3, elapsedMs: 500 });
  assert.deepEqual(completionEffects, [
    "evaluate:0",
    "wait:250",
    "evaluate:250",
    "wait:250",
    "evaluate:500",
  ]);
  let timeoutClock = 0;
  await assert.rejects(
    waitForAuditPageCompletion({
      timeoutMs: 1_000,
      pollIntervalMs: 250,
      now: () => timeoutClock,
      evaluate: async () => false,
      wait: async (delay) => { timeoutClock += delay; },
    }),
    /did not report completion within 1000 ms/u,
  );
  assert.equal(timeoutClock, 1_000);

  const browserAudit = await readFile(path.join(root, "audit.html"), "utf8");
  const watchdogLiteral = browserAudit.match(/const AUDIT_WATCHDOG_MS = ([\d_]+);/u)?.[1];
  assert.equal(
    Number(String(watchdogLiteral).replaceAll("_", "")),
    BROWSER_AUDIT_TIMING.inPageWatchdogMs,
    "the browser page and installed-browser runner must share one watchdog policy",
  );
  const watchdogEffects = [];
  let watchdogCallback = null;
  const activeApp = {
    getAttribute(name) {
      return name === "aria-busy" ? "true" : null;
    },
    childElementCount: 7,
  };
  const activeFrame = {
    title: "active scenario",
    isConnected: true,
    getAttribute(name) {
      return name === "src" ? "index.html?browser-audit=active" : null;
    },
    contentDocument: {
      readyState: "complete",
      getElementById(id) {
        return id === "app" ? activeApp : null;
      },
    },
    remove() {
      watchdogEffects.push("remove");
    },
  };
  const primaryFrame = { src: "index.html" };
  const armBrowserAuditWatchdog = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "armBrowserAuditWatchdog")})`,
    {
      AUDIT_WATCHDOG_MS: BROWSER_AUDIT_TIMING.inPageWatchdogMs,
      auditFinalized: false,
      auditProgressMarker: "scenario:mq121-horizontal-containment-help:ready",
      results: [{ id: "BR-01" }],
      document: {
        querySelectorAll(selector) {
          assert.equal(selector, "iframe");
          return [activeFrame];
        },
      },
      add(id, title, pass, details) {
        watchdogEffects.push({
          id,
          title,
          pass,
          details: JSON.parse(JSON.stringify(details)),
        });
      },
      iframe: primaryFrame,
      restoreOriginalStorage() {
        watchdogEffects.push("restore");
      },
      renderResults() {
        watchdogEffects.push("render");
      },
      setTimeout(callback, delay) {
        watchdogCallback = callback;
        assert.equal(delay, BROWSER_AUDIT_TIMING.inPageWatchdogMs);
        return 91;
      },
    },
  );
  assert.equal(armBrowserAuditWatchdog([activeFrame]), 91);
  assert.equal(typeof watchdogCallback, "function");
  watchdogCallback();
  assert.equal(primaryFrame.src, "about:blank");
  assert.deepEqual(
    watchdogEffects,
    [
      {
        id: "BR-00",
        title: "Browser harness completes",
        pass: false,
        details: {
          reason: "The whole-run real-time watchdog expired before the audit completed.",
          watchdogMs: BROWSER_AUDIT_TIMING.inPageWatchdogMs,
          completedResults: 1,
          progressMarker: "scenario:mq121-horizontal-containment-help:ready",
          activeFrames: [{
            title: "active scenario",
            src: "index.html?browser-audit=active",
            connected: true,
            documentReadyState: "complete",
            appBusy: "true",
            appChildren: 7,
          }],
        },
      },
      "remove",
      "restore",
      "render",
    ],
  );
});

test("browser close and result reconciliation fail closed under hangs and malformed payloads", async (t) => {
  let closeCalls = 0;
  const startedAt = Date.now();
  const close = await requestBrowserClose("ws://127.0.0.1:1/devtools/browser/test", {
    timeoutMs: 25,
    connect: async () => ({
      send: async () => new Promise(() => {}),
      close() { closeCalls += 1; },
    }),
  });
  assert.equal(close.requested, true);
  assert.match(close.error, /Browser\.close exceeded 25 ms/u);
  assert.equal(closeCalls, 1, "the timed-out CDP client is closed exactly once");
  assert.ok(Date.now() - startedAt < 1_000, "a nonresponsive Browser.close cannot hang the runner");

  const validPayload = () => ({
    completed: true,
    generatedAt: "2026-07-30T12:00:00.000Z",
    shard: "all",
    results: EXPECTED_BROWSER_RESULT_IDS.map((id) => ({
      id,
      title: `Result ${id}`,
      status: "PASS",
      details: "",
    })),
    fail: 0,
    skipped: 0,
  });
  assert.equal(EXPECTED_BROWSER_RESULT_IDS.length, 72);
  assert.equal(validateBrowserAuditPayload(validPayload()).valid, true);
  const shardIds = Object.values(BROWSER_AUDIT_SHARDS).flat();
  assert.equal(new Set(shardIds).size, 72, "browser shard ids must not overlap");
  assert.deepEqual(new Set(shardIds), new Set(EXPECTED_BROWSER_RESULT_IDS), "browser shards must exactly partition the closed oracle");
  for (const [shard, ids] of Object.entries(BROWSER_AUDIT_SHARDS)) {
    const payload = {
      ...validPayload(),
      shard,
      results: validPayload().results.filter((result) => ids.includes(result.id)),
    };
    assert.equal(validateBrowserAuditPayload(payload, { shard }).valid, true, shard);
    assert.equal(validateBrowserAuditPayload({ ...payload, shard: "all" }, { shard }).valid, false, `${shard} identity is bound`);
  }

  const rejects = async (name, mutate, expected) => t.test(name, () => {
    const payload = validPayload();
    mutate(payload);
    const validation = validateBrowserAuditPayload(payload);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join("\n"), expected);
  });
  await rejects(
    "duplicate id",
    (payload) => { payload.results[1].id = payload.results[0].id; },
    /duplicated|missing/u,
  );
  await rejects(
    "missing result",
    (payload) => { payload.results.pop(); },
    /missing|count/u,
  );
  await rejects(
    "unknown id",
    (payload) => { payload.results[0].id = "BR-99"; },
    /unknown|missing/u,
  );
  await rejects(
    "malformed result field",
    (payload) => { payload.results[0].surprise = true; },
    /closed result schema/u,
  );
  await rejects(
    "unsupported status",
    (payload) => { payload.results[0].status = "SKIP"; },
    /invalid status/u,
  );
  await rejects(
    "fabricated aggregate",
    (payload) => {
      payload.results[0].status = "FAIL";
      payload.fail = 0;
    },
    /fail count/u,
  );
  await rejects(
    "unknown payload field",
    (payload) => { payload.surprise = true; },
    /closed result schema/u,
  );
});

test("browser scenarios await settled Home and release the writer lease before iframe removal", async () => {
  const browserAudit = await readFile(path.join(root, "audit.html"), "utf8");
  const armAuditFrameRemoval = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "armAuditFrameRemoval")})`,
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

  let homeReady = false;
  const requireScenarioHome = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "requireScenarioHome")})`,
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

  const keepAuditFramePainted = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "keepAuditFramePainted")})`,
  );
  const paintedScenario = { frame: { style: {} } };
  keepAuditFramePainted(paintedScenario);
  assert.deepEqual(
    paintedScenario.frame.style,
    { left: "0", opacity: "0.01", zIndex: "9999" },
  );

  const scenarioFrameSource = adapterFunction(browserAudit, "scenarioFrameBytes");
  assert.match(scenarioFrameSource, /armAuditFrameRemoval\(frame\)/u);
  const bootEffects = [];
  const bootFrame = {
    style: {},
    contentDocument: {},
    contentWindow: {},
    remove() {
      bootEffects.push("remove");
    },
  };
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
  };
  const scenarioFrameBytes = vm.runInNewContext(
    `(${scenarioFrameSource})`,
    scenarioFrameContext,
  );
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
    ],
  );
  failBoot = true;
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

test("browser audit waits through safe-boundary navigation and opens only the bound physical cache", async () => {
  const browserAudit = await readFile(path.join(root, "audit.html"), "utf8");
  const waitForNavigation = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "waitForScenarioNavigation")})`,
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
  const registration = { active: true };
  const controller = {
    postMessage(message, ports) {
      assert.equal(message.type, "MATH_QUEST_GET_READINESS_V1");
      assert.equal(Object.keys(message).join(","), "type");
      assert.equal(ports.length, 1);
      ports[0].reply(readinessReply);
    },
  };
  const queryReadiness = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "queryBrowserPwaReadiness")})`,
  );
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

  let controllerListenerRemoved = false;
  await assert.rejects(
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          controller: null,
          addEventListener() {},
          removeEventListener() { controllerListenerRemoved = true; },
        },
      },
      MessageChannel: FakeMessageChannel,
      setTimeout,
      clearTimeout,
    }, 5),
    (error) => {
      assert.match(error.message, /service worker controller readiness timed out after 5 ms/u);
      assert.equal(error.code, "PWA_READINESS_STAGE_TIMEOUT");
      assert.equal(error.stage, "controllerchange");
      assert.equal(error.timedOut, true);
      assert.equal(error.timeoutMs, 5);
      return true;
    },
  );
  assert.equal(controllerListenerRemoved, true, "a timed-out controller listener must be removed");

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

  const cleanupDoesNotHang = Promise.race([
    queryReadiness({
      navigator: {
        serviceWorker: {
          ready: Promise.resolve(registration),
          controller: null,
          addEventListener() {},
          removeEventListener() { throw new Error("listener cleanup failed"); },
        },
      },
      MessageChannel: FakeMessageChannel,
      setTimeout,
      clearTimeout,
    }, 5),
    new Promise((_, reject) => setTimeout(() => reject(new Error("cleanup test guard expired")), 100)),
  ]);
  await assert.rejects(cleanupDoesNotHang, (error) => {
    assert.equal(error.code, "PWA_READINESS_STAGE_TIMEOUT");
    assert.equal(error.stage, "controllerchange");
    assert.match(error.message, /listener cleanup failed/u);
    return true;
  });

  const physicalCacheNames = vm.runInNewContext(
    `(${adapterFunction(browserAudit, "pwaPhysicalCacheNames")})`,
  );
  const logicalIdentity = "math-quest-static-v1.0.0-beta.5";
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
  assert.match(
    browserAudit,
    /await waitForScenarioNavigation\(\s*placementScenario,\s*boundaryDocumentBeforePause,/u,
  );
  assert.match(
    browserAudit,
    /const pwaReadinessPromise = queryBrowserPwaReadiness\(win\)\.then\(/u,
  );
  assert.match(browserAudit, /const pwaReadiness = await pwaReadinessPromise;/u);
  assert.doesNotMatch(
    browserAudit,
    /boundary-pause[\s\S]{0,800}setTimeout\(resolve,\s*80\)/u,
  );
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

test("the real browser-smoke server emits the verified legal-document MIME types", async () => {
  const requests = [];
  const server = serveWorkspace(root, requests);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const documentPath of ["/PRIVACY.md", "/THIRD_PARTY_NOTICES.md"]) {
      const response = await fetch(`${origin}${documentPath}`);
      assert.equal(response.status, 200, documentPath);
      assert.equal(
        String(response.headers.get("content-type")).split(";", 1)[0],
        "text/markdown",
        documentPath,
      );
      const expected = await readFile(path.join(root, documentPath.slice(1)));
      assert.equal(
        sha256(Buffer.from(await response.arrayBuffer())),
        sha256(expected),
        documentPath,
      );
    }
    assert.deepEqual(
      requests.map((request) => request.pathname),
      ["/PRIVACY.md", "/THIRD_PARTY_NOTICES.md"],
    );
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test("every expected static browser-audit request is a real 200 response", async () => {
  const requests = [];
  const server = serveWorkspace(root, requests);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const relative of AUDIT_SERVED_RELATIVE_PATHS) {
      const response = await fetch(`${origin}/${relative}`);
      assert.equal(response.status, 200, relative);
      assert.ok(response.headers.get("content-type"), relative);
    }
    const absentFavicon = await fetch(`${origin}/favicon.ico`);
    assert.equal(absentFavicon.status, 204);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});

test("the generator prepares a self-consistent candidate without mutating the frozen shell", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "math-quest-pwa-prepare-"));
  const preparedDirectory = path.join(temporaryRoot, "prepared");
  const manifestPath = path.join(root, "release-shell-v1.json");
  const workerPath = path.join(root, "sw.js");
  const [originalManifest, originalWorker] = await Promise.all([
    readFile(manifestPath),
    readFile(workerPath),
  ]);
  try {
    await assert.rejects(
      execFile(process.execPath, [
        path.join(root, "tools", "build-pwa-release-manifest.mjs"),
      ], { cwd: root }),
      /Usage:.*--write/isu,
      "freezing the repository must require an explicit --write mode",
    );
    const result = await execFile(process.execPath, [
      path.join(root, "tools", "build-pwa-release-manifest.mjs"),
      "--prepare-directory",
      preparedDirectory,
    ], { cwd: root });
    assert.match(result.stdout, /Prepared release-shell-v1\.json and bound sw\.js/u);
    assert.deepEqual(
      (await readdir(preparedDirectory)).sort(),
      ["release-shell-v1.json", "sw.js"],
    );
    const [preparedManifestText, preparedWorker] = await Promise.all([
      readFile(path.join(preparedDirectory, "release-shell-v1.json"), "utf8"),
      readFile(path.join(preparedDirectory, "sw.js"), "utf8"),
    ]);
    const preparedManifest = JSON.parse(preparedManifestText);
    assert.deepEqual(
      {
        schemaVersion: preparedManifest.schemaVersion,
        release: preparedManifest.release,
        buildId: preparedManifest.buildId,
        cacheName: preparedManifest.cacheName,
        entryPath: preparedManifest.entryPath,
        excludedPaths: preparedManifest.excludedPaths,
      },
      {
        schemaVersion: 1,
        release: "1.0.0-beta.5",
        buildId: "math-quest-pwa-v1.0.0-beta.5",
        cacheName: "math-quest-static-v1.0.0-beta.5",
        entryPath: "./index.html",
        excludedPaths: ["./release-shell-v1.json", "./sw.js"],
      },
    );
    assert.deepEqual(
      preparedManifest.entries.map((entry) => [entry.path, entry.mime]),
      RELEASE_ENTRY_SPECS,
    );
    for (const entry of preparedManifest.entries) {
      const bytes = await readFile(path.join(root, entry.path.slice(2)));
      assert.equal(entry.bytes, bytes.byteLength, entry.path);
      assert.equal(entry.sha256, sha256(bytes), entry.path);
      assert.equal(entry.status, 200, entry.path);
    }
    const manifestHash = sha256(Buffer.from(preparedManifestText, "utf8"));
    assert.match(
      preparedWorker,
      new RegExp(`const RELEASE_MANIFEST_SHA256 = "${manifestHash}";`, "u"),
    );
    assert.doesNotMatch(preparedWorker, /KNOWN_OBSOLETE_CACHES|clients\.claim\(\)/u,
      "a prepared worker must not claim or remove storage beneath another open release");
    await assert.rejects(
      execFile(process.execPath, [
        path.join(root, "tools", "build-pwa-release-manifest.mjs"),
        "--prepare-directory",
        preparedDirectory,
      ], { cwd: root }),
      /EEXIST|already exists/iu,
      "preparation must not overwrite an earlier review candidate",
    );
    const guardedDirectory = path.join(temporaryRoot, "guarded");
    await mkdir(guardedDirectory);
    const guardedWorkerPath = path.join(guardedDirectory, "sw.js");
    await writeFile(guardedWorkerPath, "do-not-overwrite\n", "utf8");
    await assert.rejects(
      execFile(process.execPath, [
        path.join(root, "tools", "build-pwa-release-manifest.mjs"),
        "--prepare-directory",
        guardedDirectory,
      ], { cwd: root }),
      /already exists/iu,
    );
    assert.equal(await readFile(guardedWorkerPath, "utf8"), "do-not-overwrite\n");
    await assert.rejects(
      readFile(path.join(guardedDirectory, "release-shell-v1.json")),
      { code: "ENOENT" },
      "preflight must not create one file beside an occupied target",
    );

    const freezeFixture = path.join(temporaryRoot, "freeze-fixture");
    const fixtureToolPath = path.join(
      freezeFixture,
      "tools",
      "build-pwa-release-manifest.mjs",
    );
    await mkdir(path.dirname(fixtureToolPath), { recursive: true });
    await writeFile(
      fixtureToolPath,
      await readFile(path.join(root, "tools", "build-pwa-release-manifest.mjs")),
    );
    await writeFile(path.join(freezeFixture, "sw.js"), originalWorker);
    await writeFile(path.join(freezeFixture, "VERSION"), "1.0.0-beta.5\n", "utf8");
    for (const [entryPath] of RELEASE_ENTRY_SPECS) {
      const destination = path.join(freezeFixture, entryPath.slice(2));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(path.join(root, entryPath.slice(2))));
    }

    await execFile(process.execPath, [fixtureToolPath, "--write"], { cwd: freezeFixture });
    await execFile(process.execPath, [fixtureToolPath, "--check"], { cwd: freezeFixture });
    const firstFrozenManifest = await readFile(
      path.join(freezeFixture, "release-shell-v1.json"),
      "utf8",
    );
    const firstFrozenHash = sha256(Buffer.from(firstFrozenManifest, "utf8"));
    await writeFile(
      path.join(freezeFixture, "PRIVACY.md"),
      Buffer.concat([
        await readFile(path.join(freezeFixture, "PRIVACY.md")),
        Buffer.from("\nDisposable second generation.\n", "utf8"),
      ]),
    );
    await execFile(process.execPath, [fixtureToolPath, "--write"], { cwd: freezeFixture });
    await execFile(process.execPath, [fixtureToolPath, "--check"], { cwd: freezeFixture });
    const secondFrozenManifest = await readFile(
      path.join(freezeFixture, "release-shell-v1.json"),
      "utf8",
    );
    const secondFrozenHash = sha256(Buffer.from(secondFrozenManifest, "utf8"));
    assert.notEqual(secondFrozenHash, firstFrozenHash);
    const secondFrozenWorker = await readFile(path.join(freezeFixture, "sw.js"), "utf8");
    assert.match(secondFrozenWorker,
      new RegExp(`const RELEASE_MANIFEST_SHA256 = "${secondFrozenHash}";`, "u"));
    assert.doesNotMatch(secondFrozenWorker, new RegExp(firstFrozenHash, "u"),
      "a new manifest binding must not turn the prior release cache into a deletion target");
    assert.doesNotMatch(secondFrozenWorker, /KNOWN_OBSOLETE_CACHES|clients\.claim\(\)/u);
    assert.deepEqual(await readFile(manifestPath), originalManifest);
    assert.deepEqual(await readFile(workerPath), originalWorker);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Beta 5 release-shell manifest binds every declared byte", async () => {
  const [text, worker] = await Promise.all([
    readFile(path.join(root, "release-shell-v1.json"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
  ]);
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.includes("\r"), false);
  const manifest = JSON.parse(text);
  assert.deepEqual(
    {
      schemaVersion: manifest.schemaVersion,
      release: manifest.release,
      buildId: manifest.buildId,
      cacheName: manifest.cacheName,
      entryPath: manifest.entryPath,
      excludedPaths: manifest.excludedPaths,
    },
    {
      schemaVersion: 1,
      release: "1.0.0-beta.5",
      buildId: "math-quest-pwa-v1.0.0-beta.5",
      cacheName: "math-quest-static-v1.0.0-beta.5",
      entryPath: "./index.html",
      excludedPaths: ["./release-shell-v1.json", "./sw.js"],
    },
  );
  assert.equal(new Set(manifest.entries.map((entry) => entry.path)).size, manifest.entries.length);
  assert.deepEqual(
    manifest.entries.map((entry) => [entry.path, entry.mime]),
    RELEASE_ENTRY_SPECS,
  );
  for (const entry of manifest.entries) {
    const bytes = await readFile(path.join(root, entry.path.slice(2)));
    assert.equal(entry.sha256, sha256(bytes), entry.path);
    assert.equal(entry.bytes, bytes.byteLength, entry.path);
    assert.equal(entry.status, 200, entry.path);
    assert.match(entry.mime, /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u, entry.path);
  }
  assert.match(
    worker,
    new RegExp(`const RELEASE_MANIFEST_SHA256 = "${sha256(Buffer.from(text, "utf8"))}";`, "u"),
  );
});

test("service worker is fail-closed, waits on update, and reports only local shell readiness", async () => {
  const worker = await readFile(path.join(root, "sw.js"), "utf8");
  const install = worker.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/u)?.[0] || "";
  assert.match(install, /populateExactCache\(\)/u);
  assert.doesNotMatch(install, /skipWaiting/u);
  assert.match(worker, /if \(request\.method !== "GET"\) return;/u);
  assert.match(worker, /if \(url\.origin !== self\.location\.origin\) return;/u);
  assert.match(worker, /if \(!LEGAL_DOCUMENT_PATHS\.has\(url\.pathname\)\) return;/u);
  assert.match(worker, /if \(url\.pathname !== MANIFEST_PATH && !SHELL_PATHS\.has\(url\.pathname\)\) return;/u);
  assert.doesNotMatch(worker, /KNOWN_OBSOLETE_CACHES|clients\.claim\(\)/u,
    "activation must not take control from or remove storage beneath another open release");
  assert.doesNotMatch(worker, /startsWith\("math-quest-static-"\)/u);
  assert.match(worker, /MATH_QUEST_GET_READINESS_V1/u);
  assert.match(worker, /MATH_QUEST_GET_WAITING_READINESS_V1/u);
  assert.match(worker, /MATH_QUEST_WAITING_READINESS_V1/u);
  assert.match(worker, /MATH_QUEST_REPAIR_SHELL_V1/u);
  assert.match(worker, /MATH_QUEST_SKIP_WAITING_V1/u);
  assert.match(worker, /ACTIVATION_CHALLENGE_PATTERN = \/\^\[a-f0-9\]\{64\}\$\//u);
  assert.doesNotMatch(worker, /catch \{\s*return fetch\(request\);/u);
  const readinessFunction = worker.match(/async function readiness\([^)]*\) \{[\s\S]*?\n\}/u)?.[0] || "";
  assert.doesNotMatch(
    readinessFunction,
    /\b(?:childName|nickname|answers?|progress|sessionHistory|backup)\s*:/iu,
  );
  assert.doesNotMatch(readinessFunction, /scriptURL|self\.registration\.(?:active|waiting)/u);
});

test("caregiver update copy distinguishes a verified active shell from fresh setup", async () => {
  const page = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 2);
  const adapter = scripts[1];
  const statusFunctions = adapterPwaStatusFunctions(adapter);
  const harness = new vm.Script(`(()=> {
    "use strict";
    const navigator={serviceWorker:{controller:null}};
    const pwa={
      phase:"NOT_CONTROLLED",
      details:null,
      applying:false,
      applyAcknowledged:false,
      updatePhase:"CHECKING",
      updateReady:false,
      updateError:null,
      registration:null,
      reloadSuggested:false,
      reloaded:false,
      applyAttempt:0,
      applyTimer:null,
      applyWorker:null,
      applyStateHandler:null
    };
    function refreshPwaStatus(){}
    ${statusFunctions}
    ${adapterFunction(adapter, "clearPwaActivationWait")}
    ${adapterFunction(adapter, "failPwaActivation")}
    return {
      pwa,
      status:pwaUpdateStatusText,
      verified:hasVerifiedActivePwaShell,
      setController(value){navigator.serviceWorker.controller=value;},
      failActivation(){
        pwa.applying=true;
        pwa.applyAcknowledged=false;
        pwa.updateError=null;
        failPwaActivation(pwa.applyAttempt,{acknowledged:false});
        return pwa.updateError;
      }
    };
  })()`, { filename: "pwa-caregiver-copy-effect.js" }).runInNewContext();

  for (const phase of ["CHECKING", "CACHING", "ERROR"]) {
    harness.pwa.updatePhase = phase;
    const text = harness.status();
    assert.doesNotMatch(
      text,
      /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
      `${phase} must not promise a preserved offline shell during fresh setup`,
    );
    assert.match(text, /stay online|retry|finish(?:ing)? offline setup/iu, phase);
    assert.equal(harness.verified(), false, phase);
  }

  harness.setController({ id: "exact-controller" });
  harness.pwa.phase = "READY";
  harness.pwa.details = { ready: true };
  assert.equal(harness.verified(), true);
  for (const phase of ["CHECKING", "CACHING", "ERROR"]) {
    harness.pwa.updatePhase = phase;
    assert.match(
      harness.status(),
      /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
      `${phase} may promise preservation only after exact active readiness`,
    );
  }

  harness.setController(null);
  assert.equal(harness.verified(), false);
  assert.doesNotMatch(
    harness.status(),
    /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
  harness.setController({ id: "exact-controller" });
  harness.pwa.details = { ready: false };
  assert.equal(harness.verified(), false);
  assert.doesNotMatch(
    harness.status(),
    /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
  const freshActivationFailure = harness.failActivation();
  assert.doesNotMatch(
    freshActivationFailure,
    /(?:current|verified|this)\s+(?:offline\s+)?version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
  assert.match(freshActivationFailure, /stay online|retry|offline setup/iu);

  harness.setController({ id: "exact-controller" });
  harness.pwa.phase = "READY";
  harness.pwa.details = { ready: true };
  assert.match(
    harness.failActivation(),
    /(?:current|verified|this)\s+(?:offline\s+)?version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
});

test("service-worker exceptions are mapped to bounded caregiver copy without raw browser tuples", async () => {
  const page = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 2);
  const adapter = scripts[1];
  const lifecycleSource = adapter.slice(
    adapter.indexOf("let pwaDialogOpen="),
    adapter.indexOf("function sessionElapsed("),
  );
  assert.ok(lifecycleSource.length > 0);
  assert.doesNotMatch(lifecycleSource, /\berror\.message\b|String\(error\)/u);

  const hostileRegistrationError = new Error(
    "Failed to register a ServiceWorker for scope ('https://example.test/math/') "
    + "with script ('https://example.test/math/sw.js'): The operation failed..",
  );
  hostileRegistrationError.name = "SecurityError";
  const registrationHarness = new vm.Script(`(()=> {
    "use strict";
    const serviceWorkerEligible=true;
    const navigator={serviceWorker:{
      controller:null,
      addEventListener(){},
      async register(){throw hostileRegistrationError;}
    }};
    const pwa={
      phase:"NOT_CONTROLLED",details:null,error:null,errorCode:null,
      updatePhase:"IDLE",updateReady:false,updateError:null,updateErrorCode:null,
      registration:null,reloadSuggested:false,lastUpdateCheck:0,
      listenerInstalled:false,controllerSeen:false,standalone:false
    };
    function refreshPwaStatus(){}
    function escape(value){return String(value);}
    function pwaReloadBoundary(){return true;}
    function routePwaControllerChange(){}
    ${adapterPwaStatusFunctions(adapter)}
    ${adapterFunction(adapter, "initializePwa")}
    ${adapterFunction(adapter, "installDialogHtml")}
    return {pwa,initialize:initializePwa,render:installDialogHtml};
  })()`, { filename: "pwa-registration-error-effect.js" }).runInNewContext({
    hostileRegistrationError,
  });
  await registrationHarness.initialize();
  assert.equal(registrationHarness.pwa.phase, "ONLINE_ONLY");
  assert.match(registrationHarness.pwa.error, /offline setup/iu);
  const registrationState = JSON.stringify(registrationHarness.pwa);
  assert.doesNotMatch(
    registrationState,
    /SecurityError|example\.test|ServiceWorker for scope|math\/sw\.js|operation failed|\.\./iu,
  );
  assert.ok(registrationHarness.pwa.error.length <= 180);
  const installationGuidance = registrationHarness.render();
  assert.match(installationGuidance, /data-pwa-error/iu);
  assert.match(installationGuidance, /offline setup/iu);
  assert.doesNotMatch(
    installationGuidance,
    /SecurityError|example\.test|ServiceWorker for scope|math\/sw\.js|operation failed|\.\./iu,
  );
});

test("fresh candidate failures render retry guidance without claiming an offline fallback", async () => {
  const page = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 2);
  const adapter = scripts[1];
  const hostileUpdateError = new Error(
    "Update failed for script ('https://example.test/math/sw.js') "
    + "at scope ('https://example.test/math/'): candidate network failed..",
  );
  hostileUpdateError.name = "NetworkError";
  const harness = new vm.Script(`(()=> {
    "use strict";
    let updateFound=null;
    let workerStateChange=null;
    const ui={screen:"home"};
    const worker={
      state:"installing",
      addEventListener(type,listener){if(type==="statechange")workerStateChange=listener;}
    };
    const registration={
      waiting:null,
      installing:worker,
      async update(){throw hostileUpdateError;},
      addEventListener(type,listener){if(type==="updatefound")updateFound=listener;}
    };
    const navigator={onLine:true,serviceWorker:{controller:null}};
    const pwa={
      phase:"NOT_CONTROLLED",details:null,error:null,standalone:false,
      applying:false,applyAcknowledged:false,updatePhase:"IDLE",
      updateReady:false,updateError:null,registration:null,
      reloadSuggested:false,lastUpdateCheck:0
    };
    function refreshPwaStatus(){}
    function queryPwaReadiness(){return false;}
    function escape(value){return String(value);}
    function pwaReloadBoundary(){return true;}
    ${adapterPwaStatusFunctions(adapter)}
    ${adapterFunction(adapter, "updateReadyState")}
    ${adapterFunction(adapter, "watchPwaRegistration")}
    ${adapterFunction(adapter, "checkPwaUpdateAtBoundary")}
    ${adapterFunction(adapter, "installDialogHtml")}
    return {
      pwa,
      registration,
      watch:watchPwaRegistration,
      triggerUpdateFound(){updateFound();},
      rejectCandidate(){worker.state="redundant";workerStateChange();registration.installing=null;},
      check:checkPwaUpdateAtBoundary,
      render:installDialogHtml
    };
  })()`, { filename: "pwa-fresh-candidate-failure-effect.js" }).runInNewContext({
    hostileUpdateError,
  });

  const continuityClaim =
    /(?:current|verified|this)\s+(?:verified\s+|offline\s+)?version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu;
  const rawTuple =
    /NetworkError|example\.test|math\/sw\.js|candidate network failed|scope\s*\(|script\s*\(|\.\./iu;
  harness.watch(harness.registration);
  harness.triggerUpdateFound();
  harness.rejectCandidate();
  assert.equal(harness.pwa.phase, "NOT_CONTROLLED");
  assert.equal(harness.pwa.updatePhase, "ERROR");
  assert.doesNotMatch(harness.pwa.updateError, continuityClaim);
  assert.match(harness.pwa.updateError, /stay online|retry|offline setup/iu);
  assert.doesNotMatch(harness.pwa.updateError, rawTuple);
  assert.doesNotMatch(harness.render(), continuityClaim);
  assert.doesNotMatch(harness.render(), rawTuple);

  assert.equal(await harness.check(true), false);
  assert.equal(harness.pwa.phase, "NOT_CONTROLLED");
  assert.equal(harness.pwa.updatePhase, "ERROR");
  assert.doesNotMatch(harness.pwa.updateError, continuityClaim);
  assert.match(harness.pwa.updateError, /stay online|retry|offline setup/iu);
  assert.doesNotMatch(harness.pwa.updateError, rawTuple);
  assert.doesNotMatch(harness.render(), continuityClaim);
  assert.doesNotMatch(harness.render(), rawTuple);
});

test("active readiness survives candidate failures and controller changes require a deliberate reload", async () => {
  const page = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 2);
  const adapter = scripts[1];
  const statusFunctions = adapterPwaStatusFunctions(adapter);

  const candidateEffects = { refreshes: 0 };
  const hostileUpdateError = new Error(
    "Update failed for script ('https://example.test/math/sw.js') "
    + "at scope ('https://example.test/math/'): candidate network failed..",
  );
  hostileUpdateError.name = "NetworkError";
  const candidateHarness = new vm.Script(`(()=>{
    "use strict";
    const effects=candidateEffects;
    let ui={screen:"home"};
    let updateFound=null;
    let workerStateChange=null;
    const worker={
      state:"installing",
      addEventListener(type,listener){if(type==="statechange")workerStateChange=listener;}
    };
    const registration={
      waiting:null,
      installing:worker,
      async update(){throw hostileUpdateError;},
      addEventListener(type,listener){if(type==="updatefound")updateFound=listener;}
    };
    const navigator={onLine:true,serviceWorker:{controller:{}}};
    const pwa={
      phase:"READY",details:{ready:true},error:null,
      updatePhase:"IDLE",updateReady:false,updateError:null,
      registration:null,reloadSuggested:false,lastUpdateCheck:0
    };
    function refreshPwaStatus(){effects.refreshes+=1;}
    ${statusFunctions}
    ${adapterFunction(adapter, "updateReadyState")}
    ${adapterFunction(adapter, "watchPwaRegistration")}
    ${adapterFunction(adapter, "checkPwaUpdateAtBoundary")}
    return {
      pwa,
      registration,
      status:pwaStatusText,
      watch:watchPwaRegistration,
      triggerUpdateFound(){updateFound();},
      rejectCandidate(){worker.state="redundant";workerStateChange();registration.installing=null;},
      check:checkPwaUpdateAtBoundary
    };
  })()`, { filename: "pwa-candidate-lifecycle-effect.js" }).runInNewContext({ candidateEffects });

  candidateHarness.watch(candidateHarness.registration);
  candidateHarness.triggerUpdateFound();
  assert.equal(candidateHarness.pwa.phase, "READY");
  assert.equal(candidateHarness.pwa.updatePhase, "CACHING");
  assert.equal(candidateHarness.status(), "Ready for an offline check");
  candidateHarness.rejectCandidate();
  assert.equal(candidateHarness.pwa.phase, "READY");
  assert.equal(candidateHarness.pwa.error, null);
  assert.equal(candidateHarness.pwa.updatePhase, "ERROR");
  assert.match(
    candidateHarness.pwa.updateError,
    /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
  assert.equal(await candidateHarness.check(true), false);
  assert.equal(candidateHarness.pwa.phase, "READY");
  assert.equal(candidateHarness.pwa.error, null);
  assert.equal(candidateHarness.pwa.updatePhase, "ERROR");
  assert.match(
    candidateHarness.pwa.updateError,
    /(?:current|verified)\s+offline\s+version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
  assert.doesNotMatch(
    JSON.stringify(candidateHarness.pwa),
    /NetworkError|example\.test|math\/sw\.js|candidate network failed|\.\./iu,
  );

  const controllerEffects = {
    inputValue: "Nia",
    readinessQueries: 0,
    saves: 0,
    reloads: 0,
    cleared: 0,
    cancelledSpeech: 0,
    stoppedSounds: 0,
  };
  const controllerHarness = new vm.Script(`(()=>{
    "use strict";
    const effects=controllerEffects;
    let ui={screen:"nameGate"};
    let pwaControllerChangeBusy=false;
    let backupImportBusy=false;
    const navigator={serviceWorker:{controller:{id:"first-controller"}}};
    const pwa={
      phase:"READY",details:{ready:true},error:null,
      updatePhase:"IDLE",updateReady:false,updateError:null,
      registration:{waiting:null},controllerSeen:false,pendingControllerReload:false,
      applying:false,applyAcknowledged:false,reloadSuggested:false,reloaded:false
    };
    const app={
      inert:false,
      setAttribute(){},
      removeAttribute(){}
    };
    const location={reload(){effects.reloads+=1;}};
    function refreshPwaStatus(){}
    function clearPwaActivationWait(){effects.cleared+=1;}
    function cancelSpeech(){effects.cancelledSpeech+=1;}
    function stopSounds(){effects.stoppedSounds+=1;}
    async function queryPwaReadiness(){effects.readinessQueries+=1;return true;}
    async function saveCommitted(){effects.saves+=1;return true;}
    ${adapterFunction(adapter, "setPwaUpdateState")}
    ${adapterFunction(adapter, "reportPwaUpdateError")}
    ${adapterFunction(adapter, "pwaReloadBoundary")}
    ${adapterFunction(adapter, "handlePwaControllerChange")}
    ${adapterFunction(adapter, "routePwaControllerChange")}
    return {
      pwa,
      route:routePwaControllerChange,
      reload:handlePwaControllerChange,
      setScreen(screen){ui.screen=screen;},
      resetForControlledPage(){
        pwa.reloaded=false;
        pwaControllerChangeBusy=false;
        pwa.pendingControllerReload=false;
        app.inert=false;
      },
      input(){return effects.inputValue;}
    };
  })()`, { filename: "pwa-controller-boundary-effect.js" }).runInNewContext({ controllerEffects });

  await controllerHarness.route();
  assert.equal(controllerHarness.input(), "Nia");
  assert.equal(controllerEffects.saves, 0);
  assert.equal(controllerEffects.reloads, 0);
  assert.equal(controllerEffects.readinessQueries, 1);
  assert.equal(controllerHarness.pwa.controllerSeen, true);
  assert.equal(controllerHarness.pwa.pendingControllerReload, true);

  controllerHarness.setScreen("home");
  assert.equal(controllerEffects.saves, 0, "reaching Home must not reload a tab that did not choose Apply");
  assert.equal(controllerEffects.reloads, 0, "reaching Home must preserve the grown-up's explicit reload choice");
  await controllerHarness.reload();
  assert.equal(controllerEffects.saves, 1);
  assert.equal(controllerEffects.reloads, 1);
  controllerHarness.resetForControlledPage();
  controllerEffects.saves = 0;
  controllerEffects.reloads = 0;

  controllerEffects.inputValue = "unfinished answer";
  controllerHarness.setScreen("session");
  await controllerHarness.route();
  assert.equal(controllerHarness.input(), "unfinished answer");
  assert.equal(controllerEffects.saves, 0);
  assert.equal(controllerEffects.reloads, 0);
  assert.equal(controllerHarness.pwa.pendingControllerReload, true);
  assert.equal(controllerHarness.pwa.updatePhase, "RELOAD_PENDING");

  controllerHarness.setScreen("home");
  assert.equal(controllerEffects.saves, 0, "a controller change must remain pending at Home");
  assert.equal(controllerEffects.reloads, 0, "an older open tab must never reload merely because it reached Home");
  await controllerHarness.reload();
  assert.equal(controllerEffects.saves, 1);
  assert.equal(controllerEffects.reloads, 1);
  assert.equal(controllerHarness.pwa.reloaded, true);

  const initiatingEffects = { reloads: 0 };
  const initiatingHarness = new vm.Script(`(()=>{
    "use strict";
    let stateHandler=null;
    const PWA_ACTIVATION_TIMEOUT_MS=12000;
    const pwa={applyAttempt:0,applying:false,applyAcknowledged:false,updatePhase:"IDLE",updateError:null,reloadSuggested:false,reloaded:false,applyWorker:null,applyStateHandler:null,applyTimer:null};
    const waiting={state:"waiting",addEventListener(type,handler){if(type==="statechange")stateHandler=handler;},removeEventListener(){}};
    function clearPwaActivationWait(){pwa.applyTimer=null;pwa.applyWorker=null;pwa.applyStateHandler=null;}
    function failPwaActivation(){throw new Error("activation unexpectedly failed");}
    function refreshPwaStatus(){}
    async function handlePwaControllerChange(){initiatingEffects.reloads+=1;}
    ${adapterFunction(adapter, "beginPwaActivationWait")}
    return {
      start(){beginPwaActivationWait(waiting);},
      activate(){waiting.state="activated";stateHandler();},
      pwa
    };
  })()`, { filename: "pwa-initiating-tab-activation-effect.js" }).runInNewContext({
    initiatingEffects,
    setTimeout: () => 1,
  });
  initiatingHarness.start();
  initiatingHarness.activate();
  await Promise.resolve();
  assert.equal(initiatingEffects.reloads, 1,
    "only the tab that explicitly began Apply may reload when its exact waiting worker activates");
});

test("install manifest preserves the Beta 1 app identity for an in-place update", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.deepEqual(
    {
      id: manifest.id,
      name: manifest.name,
      short_name: manifest.short_name,
      start_url: manifest.start_url,
      scope: manifest.scope,
      display: manifest.display,
      icons: manifest.icons,
    },
    {
      id: "./",
      name: "Math Quest",
      short_name: "Math Quest",
      start_url: "./",
      scope: "./",
      display: "standalone",
      icons: [
        {
          src: "./assets/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "./assets/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
  );
});

test("Windows launcher snapshots only the reviewed runtime and rejects a foreign Host", async () => {
  const [server, manifestText, pagesWorkflow] = await Promise.all([
    readFile(path.join(root, "Serve-MathQuest.ps1"), "utf8"),
    readFile(path.join(root, "release-shell-v1.json"), "utf8"),
    readFile(path.join(root, ".github", "workflows", "pages.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(server, /\$ExpectedHost = "127\.0\.0\.1:\$Port"/u);
  assert.match(server, /\$RuntimePathMap/u);
  assert.match(server, /\$RuntimeByteSnapshot/u);
  assert.match(server, /if \(-not \$RuntimePathMap\.ContainsKey\(\$normalizedPath\)\)/u);
  assert.match(server, /\$fileBytes = \$RuntimeByteSnapshot\[\$relativePath\]/u);
  assert.equal(
    [...server.matchAll(/\[System\.IO\.File\]::ReadAllBytes\(/gu)].length,
    1,
    "runtime files are read once while the immutable startup snapshot is built",
  );
  assert.match(server, /421 -Reason 'Misdirected Request'/u);
  for (const relative of ["./release-shell-v1.json", "./sw.js", ...manifest.entries.map((entry) => entry.path)]) {
    const localPath = relative.slice(2);
    assert.equal(server.includes(`@('/${localPath}', '${localPath}')`), true, localPath);
  }
  for (const blocked of ["/README.md", "/.git/config", "/audit.html", "/docs/"]) {
    assert.equal(server.includes(`@('${blocked}'`), false);
  }
});

test("Pages upload is an immutable, canonical snapshot of the verified tagged blobs", async () => {
  const [pagesWorkflow, manifestText] = await Promise.all([
    readFile(path.join(root, ".github", "workflows", "pages.yml"), "utf8"),
    readFile(path.join(root, "release-shell-v1.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const snapshotStep = pagesWorkflow.indexOf(
    "- name: Construct, verify, and seal exact tagged Pages snapshot",
  );
  const uploadStep = pagesWorkflow.indexOf("- name: Upload Pages artifact");
  assert.equal(snapshotStep >= 0, true);
  assert.equal(uploadStep > snapshotStep, true);
  assert.equal(
    pagesWorkflow.slice(snapshotStep, uploadStep).includes("install -m"),
    false,
    "the deployment snapshot must not copy mutable worktree files",
  );
  for (const requiredMechanism of [
    '["ls-tree", "-z", releaseCommit, "--", artifactPath]',
    '["cat-file", "blob", match[1]]',
    "entry.sha256 !== sha256(bytes)",
    "entry.bytes !== bytes.byteLength",
    "entry.mime !== expectedMime",
    "entry.status !== 200",
    "!snapshotBytes.equals(taggedBlobs.get(artifactPath))",
    "nonBoundComparisons !== expectedNonBoundComparisons",
    "const snapshotSha256 = sha256(",
    "await chmod(directory, 0o555)",
    'path: _site',
  ]) {
    assert.equal(
      pagesWorkflow.includes(requiredMechanism),
      true,
      requiredMechanism,
    );
  }
  for (const entry of manifest.entries) {
    assert.equal(
      pagesWorkflow.includes(
        `["${entry.path.slice(2)}", "${entry.mime}"]`,
      ),
      true,
      `snapshot MIME allowlist: ${entry.path}`,
    );
  }
  assert.match(
    pagesWorkflow,
    /snapshot_sha256: \$\{\{ steps\.snapshot\.outputs\.sha256 \}\}/u,
  );
  assert.match(
    pagesWorkflow,
    /\[\[ ! "\$SNAPSHOT_SHA256" =~ \^\[a-f0-9\]\{64\}\$ \]\]/u,
  );
});

test("Pages snapshot ignores a worktree mutation after the release commit", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "mq-pages-snapshot-"));
  const pagesWorkflow = await readFile(
    path.join(root, ".github", "workflows", "pages.yml"),
    "utf8",
  );
  const scriptMatch = pagesWorkflow.match(
    /node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n {10}NODE/u,
  );
  assert.ok(scriptMatch, "the executable snapshot program is extractable");
  const snapshotProgram = scriptMatch[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^ {10}/u, ""))
    .join("\n");
  const siteRoot = path.join(fixture, "_site");

  try {
    const runtimeAssets = RELEASE_ENTRY_SPECS
      .map(([entryPath]) => entryPath.slice(2))
      .filter((entryPath) => entryPath.startsWith("assets/"));
    const fixtureBytes = new Map(
      PAGES_TAGGED_ARTIFACT_SPECS.map(([artifactPath]) => [
        artifactPath,
        Buffer.from(`${artifactPath}\n`, "utf8"),
      ]),
    );
    const committedIndex = Buffer.from(
      `<main>${runtimeAssets
        .map((assetPath) => `<span data-asset="${assetPath}"></span>`)
        .join("")}</main>\n`,
      "utf8",
    );
    fixtureBytes.set("index.html", committedIndex);
    fixtureBytes.set(
      "manifest.webmanifest",
      Buffer.from('{"name":"Math Quest"}\n', "utf8"),
    );

    const releaseEntries = RELEASE_ENTRY_SPECS.map(([entryPath, mime]) => {
      const bytes = fixtureBytes.get(entryPath.slice(2));
      assert.ok(bytes, entryPath);
      return {
        path: entryPath,
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        mime,
        status: 200,
      };
    });
    const releaseManifestBytes = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        release: "1.0.0-beta.5",
        buildId: "fixture",
        cacheName: "fixture",
        entryPath: "./index.html",
        excludedPaths: ["./release-shell-v1.json", "./sw.js"],
        entries: releaseEntries,
      }, null, 2)}\n`,
      "utf8",
    );
    fixtureBytes.set("release-shell-v1.json", releaseManifestBytes);
    fixtureBytes.set(
      "sw.js",
      Buffer.from(
        `const RELEASE_MANIFEST_SHA256 = "${sha256(releaseManifestBytes)}";\n`,
        "utf8",
      ),
    );

    for (const [artifactPath] of PAGES_TAGGED_ARTIFACT_SPECS) {
      const destination = path.join(fixture, ...artifactPath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, fixtureBytes.get(artifactPath));
    }
    await execFile("git", ["init", "--quiet"], { cwd: fixture });
    await execFile("git", ["config", "core.autocrlf", "false"], { cwd: fixture });
    await execFile("git", ["config", "user.name", "Snapshot Fixture"], { cwd: fixture });
    await execFile(
      "git",
      ["config", "user.email", "snapshot-fixture"],
      { cwd: fixture },
    );
    await execFile("git", ["add", "."], { cwd: fixture });
    const emptyHooksDirectory = path.join(fixture, ".git", "empty-hooks");
    await mkdir(emptyHooksDirectory);
    await execFile("git", [
      "-c",
      "commit.gpgSign=false",
      "-c",
      `core.hooksPath=${emptyHooksDirectory}`,
      "commit",
      "--no-verify",
      "--quiet",
      "-m",
      "fixture",
    ], { cwd: fixture });
    const { stdout: releaseCommitOutput } = await execFile(
      "git",
      ["rev-parse", "HEAD^{commit}"],
      { cwd: fixture },
    );
    const releaseCommit = releaseCommitOutput.trim();

    await writeFile(
      path.join(fixture, "index.html"),
      Buffer.from("MUTATED WORKTREE BYTES\n", "utf8"),
    );
    const outputPath = path.join(fixture, "snapshot-output.txt");
    const summaryPath = path.join(fixture, "snapshot-summary.md");
    await execFile(
      process.execPath,
      ["--input-type=module", "--eval", snapshotProgram],
      {
        cwd: fixture,
        env: {
          ...process.env,
          RELEASE_COMMIT: releaseCommit,
          GITHUB_OUTPUT: outputPath,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
        maxBuffer: 8 * 1024 * 1024,
      },
    );

    assert.deepEqual(
      await readFile(path.join(siteRoot, "index.html")),
      committedIndex,
      "the immutable deployment snapshot comes from the commit, not the dirty worktree",
    );
    assert.notDeepEqual(
      await readFile(path.join(fixture, "index.html")),
      await readFile(path.join(siteRoot, "index.html")),
      "the fixture actually exercised different worktree and snapshot bytes",
    );
    assert.match(
      await readFile(outputPath, "utf8"),
      /^sha256=[a-f0-9]{64}\r?\nfile_count=23\r?\n$/u,
    );
  } finally {
    if (await readFile(path.join(fixture, ".git", "HEAD"), "utf8").catch(() => null)) {
      if (await readFile(path.join(siteRoot, ".nojekyll")).catch(() => null)) {
        await makeTreeWritable(siteRoot);
      }
    }
    await rm(fixture, { recursive: true, force: true });
  }
});

test("service-worker install, readiness, corruption, repair, and routing are effect-sensitive", async () => {
  const scope = "https://example.test/";
  const rawWorkerText = await readFile(path.join(root, "sw.js"), "utf8");
  const entries = await Promise.all(RELEASE_ENTRY_SPECS.map(async ([entryPath, mime]) => {
    const bytes = await readFile(path.join(root, entryPath.slice(2)));
    return {
      path: entryPath,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      mime,
      status: 200,
    };
  }));
  const releaseManifest = {
    schemaVersion: 1,
    release: "1.0.0-beta.5",
    buildId: "math-quest-pwa-v1.0.0-beta.5",
    cacheName: "math-quest-static-v1.0.0-beta.5",
    entryPath: "./index.html",
    excludedPaths: ["./release-shell-v1.json", "./sw.js"],
    entries,
  };
  const releaseManifestText = `${JSON.stringify(releaseManifest, null, 2)}\n`;
  const expectedManifestHash = sha256(Buffer.from(releaseManifestText, "utf8"));
  const manifestHashMarkers =
    rawWorkerText.match(/const RELEASE_MANIFEST_SHA256 = "[a-f0-9]{64}";/gu) || [];
  assert.equal(manifestHashMarkers.length, 1);
  const workerText = rawWorkerText.replace(
    /const RELEASE_MANIFEST_SHA256 = "[a-f0-9]{64}";/u,
    `const RELEASE_MANIFEST_SHA256 = "${expectedManifestHash}";`,
  );
  assert.match(
    workerText,
    new RegExp(`const RELEASE_MANIFEST_SHA256 = "${expectedManifestHash}";`, "u"),
  );
  const logicalBeta5Name = "math-quest-static-v1.0.0-beta.5";
  const beta5Name = `${logicalBeta5Name}-${expectedManifestHash}`;
  const beta5StagingName = `${beta5Name}-staging`;
  const publicBeta3PhysicalName =
    "math-quest-static-v1.0.0-beta.3-9e5fedc72ef838eab3dccf2437a594fa24bdd12f173e81f19c91c5f71a9509b7";
  const handlers = new Map();
  const cacheStores = new Map();
  const networkRequestCounts = new Map();
  const networkOverrides = new Map();
  let networkEnabled = true;
  let cachePutFailure = null;
  let skipWaitingCalls = 0;
  let claimCalls = 0;
  let claimShouldFail = false;
  const retainedClients = [];
  const retainedClientNavigations = [];
  const retainedClientChallenges = [];
  const matchAllOptions = [];

  class MockRequest {
    constructor(input, init = {}) {
      this.url = new URL(typeof input === "string" ? input : input.url, scope).href;
      this.method = init.method || input?.method || "GET";
      this.mode = init.mode || input?.mode || "same-origin";
    }
  }

  class MockResponse {
    constructor(bytes, url, mime, status = 200, { redirected = false } = {}) {
      this.bytes = Buffer.from(bytes);
      this.url = url;
      this.status = status;
      this.ok = status >= 200 && status < 300;
      this.redirected = redirected;
      this.headers = new Headers({ "Content-Type": mime });
    }
    clone() {
      return new MockResponse(
        this.bytes,
        this.url,
        this.headers.get("Content-Type"),
        this.status,
        { redirected: this.redirected },
      );
    }
    async arrayBuffer() {
      return Uint8Array.from(this.bytes).buffer;
    }
  }

  function cacheKey(input, ignoreSearch = false) {
    const url = new URL(typeof input === "string" ? input : input.url, scope);
    if (ignoreSearch) url.search = "";
    return url.href;
  }

  function cacheFor(name) {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    const store = cacheStores.get(name);
    return {
      async put(input, response) {
        const key = cacheKey(input);
        if (
          cachePutFailure
          && cachePutFailure.cacheName === name
          && (cachePutFailure.url === null || cachePutFailure.url === key)
        ) {
          cachePutFailure = null;
          throw new Error(`injected-cache-put-failure:${name}:${key}`);
        }
        store.set(key, response.clone());
      },
      async match(input, options = {}) {
        const response = store.get(cacheKey(input, Boolean(options.ignoreSearch)));
        return response ? response.clone() : undefined;
      },
      async delete(input) {
        return store.delete(cacheKey(input));
      },
      async keys() {
        return [...store.keys()].map((url) => new MockRequest(url));
      },
    };
  }

  const mimeByPath = new Map(releaseManifest.entries.map((entry) => [entry.path, entry.mime]));
  mimeByPath.set("./release-shell-v1.json", "application/json");
  async function networkFetch(input) {
    if (!networkEnabled) throw new Error("offline");
    const url = new URL(typeof input === "string" ? input : input.url, scope);
    const relative = `./${url.pathname.slice(1)}`;
    networkRequestCounts.set(relative, (networkRequestCounts.get(relative) || 0) + 1);
    if (!mimeByPath.has(relative)) return new MockResponse("not found", url.href, "text/plain", 404);
    const override = networkOverrides.get(relative);
    const bytes = override?.bytes ?? (relative === "./release-shell-v1.json"
      ? Buffer.from(releaseManifestText, "utf8")
      : await readFile(path.join(root, relative.slice(2))));
    return new MockResponse(
      bytes,
      override?.url || url.href,
      override?.mime || mimeByPath.get(relative),
      override?.status || 200,
      { redirected: Boolean(override?.redirected) },
    );
  }

  const self = {
    registration: {
      scope,
      active: null,
      waiting: null,
    },
    location: new URL("https://example.test/sw.js"),
    clients: {
      async claim() {
        claimCalls += 1;
        if (claimShouldFail) throw new Error("injected-clients-claim-failure");
      },
      async matchAll(options) {
        matchAllOptions.push(structuredClone(options));
        return [...retainedClients];
      },
    },
    addEventListener(type, listener) {
      handlers.set(type, listener);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
  };
  const context = vm.createContext({
    self,
    caches: {
      async open(name) {
        return cacheFor(name);
      },
      async keys() {
        return [...cacheStores.keys()];
      },
      async delete(name) {
        return cacheStores.delete(name);
      },
    },
    crypto: webcrypto,
    fetch: networkFetch,
    Request: MockRequest,
    Response,
    Headers,
    URL,
    TextDecoder,
    Date,
    Buffer,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(workerText, context, { filename: "sw.js" });

  cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["old", "old"]]));
  cacheStores.set(publicBeta3PhysicalName, new Map([["public-beta3-shell", "preserve-until-claim"]]));
  networkEnabled = false;
  let failedInstallPromise;
  handlers.get("install")({ waitUntil(promise) { failedInstallPromise = promise; } });
  await assert.rejects(failedInstallPromise);
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(cacheStores.has(beta5Name), false);

  cacheStores.set(logicalBeta5Name, new Map([["same-identity-old-shell", "preserve"]]));
  const firstManifestHashIndex = releaseManifestText.indexOf(releaseManifest.entries[0].sha256);
  assert.ok(firstManifestHashIndex > 0);
  const sameLengthTamperedManifest =
    releaseManifestText.slice(0, firstManifestHashIndex)
    + (releaseManifestText[firstManifestHashIndex] === "0" ? "1" : "0")
    + releaseManifestText.slice(firstManifestHashIndex + 1);
  assert.equal(Buffer.byteLength(sameLengthTamperedManifest), Buffer.byteLength(releaseManifestText));
  networkOverrides.set("./release-shell-v1.json", {
    bytes: Buffer.from(sameLengthTamperedManifest, "utf8"),
  });
  networkEnabled = true;
  let tamperedManifestInstallPromise;
  handlers.get("install")({ waitUntil(promise) { tamperedManifestInstallPromise = promise; } });
  await assert.rejects(tamperedManifestInstallPromise, /release-manifest-hash/u);
  networkOverrides.delete("./release-shell-v1.json");
  assert.equal(cacheStores.has(beta5Name), false);
  assert.equal(cacheStores.has(logicalBeta5Name), true);

  cacheStores.set(beta5Name, new Map([
    [
      cacheKey("./orphan"),
      new MockResponse("orphan", new URL("./orphan", scope).href, "text/plain"),
    ],
  ]));
  cachePutFailure = {
    cacheName: beta5Name,
    url: cacheKey("./index.html"),
  };
  networkEnabled = true;
  let partialCopyInstallPromise;
  handlers.get("install")({ waitUntil(promise) { partialCopyInstallPromise = promise; } });
  await assert.rejects(partialCopyInstallPromise, /injected-cache-put-failure/u);
  assert.equal(
    cacheStores.has(beta5Name),
    false,
    "a failed copy must remove the already-invalid partial candidate cache",
  );
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(cacheStores.has(logicalBeta5Name), true);
  assert.equal(cacheStores.has(beta5StagingName), false);

  let installPromise;
  handlers.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.equal(skipWaitingCalls, 0);
  let beta5 = cacheStores.get(beta5Name);
  assert.equal(beta5.size, releaseManifest.entries.length + 1);

  cachePutFailure = { cacheName: beta5Name, url: null };
  let idempotentInstallPromise;
  handlers.get("install")({ waitUntil(promise) { idempotentInstallPromise = promise; } });
  await idempotentInstallPromise;
  assert.ok(cachePutFailure, "an already exact live cache must receive no put effects");
  cachePutFailure = null;

  const exactTap = beta5.get(cacheKey("./assets/sounds/tap.wav"));
  const sameLengthTamperedTap = Buffer.from(exactTap.bytes);
  sameLengthTamperedTap[0] ^= 0x01;
  assert.equal(sameLengthTamperedTap.byteLength, exactTap.bytes.byteLength);
  networkOverrides.set("./assets/sounds/tap.wav", { bytes: sameLengthTamperedTap });
  let corruptNetworkInstallPromise;
  handlers.get("install")({ waitUntil(promise) { corruptNetworkInstallPromise = promise; } });
  await assert.rejects(corruptNetworkInstallPromise, /shell-entry-invalid/u);
  networkOverrides.delete("./assets/sounds/tap.wav");
  assert.equal(
    sha256(beta5.get(cacheKey("./assets/sounds/tap.wav")).bytes),
    sha256(exactTap.bytes),
    "a failed staging fetch must leave the exact live shell byte-for-byte intact",
  );
  assert.equal(beta5.size, releaseManifest.entries.length + 1);

  for (const [label, override] of [
    ["wrong MIME", { mime: "text/plain" }],
    ["redirect", { redirected: true }],
    ["unsuccessful status", { status: 503 }],
    ["cross-origin response", { url: "https://other.example/tap.wav" }],
  ]) {
    networkOverrides.set("./assets/sounds/tap.wav", override);
    let rejectedResponseInstallPromise;
    handlers.get("install")({
      waitUntil(promise) {
        rejectedResponseInstallPromise = promise;
      },
    });
    await assert.rejects(
      rejectedResponseInstallPromise,
      /shell-entry-invalid/u,
      label,
    );
    networkOverrides.delete("./assets/sounds/tap.wav");
    assert.equal(
      sha256(beta5.get(cacheKey("./assets/sounds/tap.wav")).bytes),
      sha256(exactTap.bytes),
      `${label} must not mutate the exact live shell`,
    );
  }

  self.registration.active = { scriptURL: self.location.href };
  beta5.set(
    cacheKey("./assets/sounds/tap.wav"),
    new MockResponse(
      "mutated before activation",
      new URL("./assets/sounds/tap.wav", scope).href,
      "audio/wav",
    ),
  );
  let rejectedActivatePromise;
  handlers.get("activate")({ waitUntil(promise) { rejectedActivatePromise = promise; } });
  await assert.rejects(rejectedActivatePromise, /installed-shell-not-exact/u);
  assert.equal(
    cacheStores.has("math-quest-static-v1.0.0-beta.1"),
    true,
    "activation must preserve the prior cache until the candidate is re-proved",
  );
  assert.equal(
    cacheStores.has(publicBeta3PhysicalName),
    true,
    "activation must preserve the exact public Beta 3 cache until the candidate is re-proved",
  );
  assert.equal(claimCalls, 0);
  beta5.set(cacheKey("./assets/sounds/tap.wav"), exactTap.clone());

  claimShouldFail = true;
  let activatePromise;
  handlers.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(
    cacheStores.has(publicBeta3PhysicalName),
    true,
    "activation must preserve the exact public Beta 3 cache for any older open tab",
  );
  assert.equal(
    cacheStores.has(logicalBeta5Name),
    true,
    "activation must not destroy an older same-identity storage cache",
  );
  assert.equal(claimCalls, 0, "activation must not call clients.claim even when that API would fail");
  claimShouldFail = false;
  assert.equal(retainedClientNavigations.length, 0, "a post-Beta-1 cache witness preserves the safe-boundary update path");

  const retainedBeta1Progress = Object.freeze({ bytes: "BETA1-PROGRESS-UNCHANGED" });
  retainedClients.push(...[
    "silent-current-entry",
    "suspended-unknown-post-beta1-entry",
    "malformed-unverifiable-entry",
    "true-silent-beta1-entry",
  ].map((id) => ({
    id,
    type: "window",
    url: new URL("./index.html", scope).href,
    postMessage(message) {
      retainedClientChallenges.push({ id: this.id, message: structuredClone(message) });
      if (id === "malformed-unverifiable-entry") queueMicrotask(() => handlers.get("message")({ data: { type: "MALFORMED_CLIENT_REPLY" }, source: this, ports: [] }));
    },
    async navigate(url) {
      retainedClientNavigations.push({ id: this.id, url });
      return this;
    },
  })));
  cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["legacy-shell", "beta1"]]));
  const matchAllCountBeforeUnverifiableActivation = matchAllOptions.length;
  let retainedBeta1ActivatePromise;
  handlers.get("activate")({ waitUntil(promise) { retainedBeta1ActivatePromise = promise; } });
  await retainedBeta1ActivatePromise;
  assert.equal(matchAllOptions.length, matchAllCountBeforeUnverifiableActivation, "activation must not inspect clients in order to guess their version");
  assert.deepEqual(retainedClientChallenges, [], "silent, suspended, unknown, malformed, and Beta 1 clients receive no identity probe");
  assert.deepEqual(retainedClientNavigations, [], "no silent, suspended, unknown, malformed, or Beta 1 client may be forcibly navigated");
  assert.equal(retainedBeta1Progress.bytes, "BETA1-PROGRESS-UNCHANGED", "service-worker activation cannot mutate local progress storage");
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.1"), true,
    "activation retains the Beta 1 cache while a true silent Beta 1 tab may still need it");

  cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["stale-beta1-shell", "beta1"]]));
  cacheStores.set("math-quest-static-v1.0.0-beta.2", new Map([["beta2-shell", "beta2"]]));
  let retainedBeta2ActivatePromise;
  handlers.get("activate")({ waitUntil(promise) { retainedBeta2ActivatePromise = promise; } });
  await retainedBeta2ActivatePromise;
  assert.deepEqual(retainedClientNavigations, [], "evicted or unrecognized cache lineage cannot authorize client navigation");
  assert.deepEqual(retainedClientChallenges, [], "cache lineage cannot authorize client identity probing");
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.1"), true, "Beta 1 storage remains available to an older open tab");
  assert.equal(cacheStores.has("math-quest-static-v1.0.0-beta.2"), true, "unknown older tabs keep their release storage until browser eviction");

  let readiness;
  let readinessPromise;
  handlers.get("message")({
    data: { type: "MATH_QUEST_GET_READINESS_V1" },
    ports: [{ postMessage(value) { readiness = value; } }],
    waitUntil(promise) { readinessPromise = promise; },
  });
  await readinessPromise;
  assert.equal(readiness.ready, true);
  assert.equal(readiness.requiredPaths.length, releaseManifest.entries.length + 1);
  assert.deepEqual(
    Object.keys(readiness).sort(),
    ["buildId", "cacheIdentity", "checkedAt", "ready", "release", "requiredPaths", "type", "workerState"].sort(),
  );

  const coldHandlers = new Map();
  let coldNetworkCalls = 0;
  const coldSelf = {
    registration: { scope, active: { scriptURL: self.location.href }, waiting: null },
    location: new URL("https://example.test/sw.js"),
    clients: { async claim() {} },
    addEventListener(type, listener) {
      coldHandlers.set(type, listener);
    },
    async skipWaiting() {},
  };
  vm.runInContext(workerText, vm.createContext({
    self: coldSelf,
    caches: {
      async open(name) {
        return cacheFor(name);
      },
      async keys() {
        return [...cacheStores.keys()];
      },
      async delete(name) {
        return cacheStores.delete(name);
      },
    },
    crypto: webcrypto,
    fetch() {
      coldNetworkCalls += 1;
      return new Promise(() => {});
    },
    Request: MockRequest,
    Response,
    Headers,
    URL,
    TextDecoder,
    Date,
    Buffer,
  }), { filename: "fresh-offline-sw.js" });
  let coldReadiness;
  let coldReadinessPromise;
  coldHandlers.get("message")({
    data: { type: "MATH_QUEST_GET_READINESS_V1" },
    ports: [{ postMessage(value) { coldReadiness = value; } }],
    waitUntil(promise) { coldReadinessPromise = promise; },
  });
  let coldTimeout;
  const coldResult = await Promise.race([
    coldReadinessPromise.then(() => coldReadiness),
    new Promise((_, reject) => {
      coldTimeout = setTimeout(
        () => reject(new Error("fresh worker waited on a never-settling network")),
        1000,
      );
    }),
  ]).finally(() => clearTimeout(coldTimeout));
  assert.equal(coldResult.ready, true);
  assert.equal(coldResult.requiredPaths.length, releaseManifest.entries.length + 1);
  assert.equal(coldNetworkCalls, 0, "a verified cached manifest must win before network");

  networkEnabled = false;
  const navigation = {
    request: new MockRequest("./", { mode: "navigate" }),
    respondWith(promise) { this.response = promise; },
  };
  handlers.get("fetch")(navigation);
  const offlineResponse = await navigation.response;
  assert.equal(offlineResponse.status, 200);
  assert.equal(sha256(Buffer.from(await offlineResponse.arrayBuffer())), releaseManifest.entries.find((entry) => entry.path === "./index.html").sha256);

  const pageText = await readFile(path.join(root, "index.html"), "utf8");
  const legalLinkPattern = /<a href="(\.\/(?:LICENSE|PRIVACY\.md|THIRD_PARTY_NOTICES\.md))"/gu;
  const legalLinks = [...pageText.matchAll(legalLinkPattern)].map((match) => match[1]);
  assert.deepEqual(
    [...legalLinks].sort(),
    ["./LICENSE", "./PRIVACY.md", "./THIRD_PARTY_NOTICES.md"],
    "the routed paths must come from the three shipped parent-facing links",
  );
  for (const href of legalLinks) {
    const clickNavigation = {
      intercepted: false,
      request: new MockRequest(href, { mode: "navigate" }),
      respondWith(promise) {
        this.intercepted = true;
        this.response = promise;
      },
    };
    handlers.get("fetch")(clickNavigation);
    assert.equal(clickNavigation.intercepted, true, href);
    const legalResponse = await clickNavigation.response;
    const entry = releaseManifest.entries.find((item) => item.path === href);
    assert.equal(legalResponse.status, 200, href);
    assert.equal(legalResponse.headers.get("Content-Type"), entry.mime, href);
    assert.equal(
      sha256(Buffer.from(await legalResponse.arrayBuffer())),
      entry.sha256,
      href,
    );
  }

  for (const href of ["./README.md", "./PRIVACY-copy.md", "./docs/release/readiness.md"]) {
    let intercepted = false;
    handlers.get("fetch")({
      request: new MockRequest(href, { mode: "navigate" }),
      respondWith() {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, `${href} must remain outside the worker scope`);
  }

  beta5.set(
    cacheKey("./PRIVACY.md"),
    new MockResponse(
      "corrupt legal text",
      new URL("./PRIVACY.md", scope).href,
      "text/markdown",
    ),
  );
  const corruptLegalNavigation = {
    request: new MockRequest("./PRIVACY.md", { mode: "navigate" }),
    respondWith(promise) {
      this.response = promise;
    },
  };
  handlers.get("fetch")(corruptLegalNavigation);
  assert.equal(
    (await corruptLegalNavigation.response).status,
    503,
    "an offline legal document with the wrong bytes must fail closed",
  );

  beta5.set(
    cacheKey("./index.html"),
    new MockResponse("corrupt", new URL("./index.html", scope).href, "text/html"),
  );
  const corruptNavigation = {
    request: new MockRequest("./", { mode: "navigate" }),
    respondWith(promise) { this.response = promise; },
  };
  handlers.get("fetch")(corruptNavigation);
  assert.equal((await corruptNavigation.response).status, 503);

  let failedRepair;
  let failedRepairPromise;
  handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { failedRepair = value; } }],
    waitUntil(promise) { failedRepairPromise = promise; },
  });
  await failedRepairPromise;
  assert.equal(failedRepair.ready, false);
  assert.equal(beta5.size, releaseManifest.entries.length + 1);

  networkEnabled = true;
  cachePutFailure = {
    cacheName: beta5Name,
    url: cacheKey("./index.html"),
  };
  let partialRepair;
  let partialRepairPromise;
  handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { partialRepair = value; } }],
    waitUntil(promise) { partialRepairPromise = promise; },
  });
  await partialRepairPromise;
  assert.equal(partialRepair.ready, false);
  assert.equal(
    cacheStores.get(beta5Name).size,
    0,
    "readiness may reopen the cache, but no partial candidate byte may survive",
  );

  let repair;
  let repairPromise;
  handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { repair = value; } }],
    waitUntil(promise) { repairPromise = promise; },
  });
  await repairPromise;
  assert.equal(repair.ready, true);
  beta5 = cacheStores.get(beta5Name);
  assert.equal(beta5.size, releaseManifest.entries.length + 1);

  const manifestFetchesBeforeConcurrentRepair =
    networkRequestCounts.get("./release-shell-v1.json") || 0;
  let concurrentRepairOne;
  let concurrentRepairTwo;
  let concurrentRepairPromiseOne;
  let concurrentRepairPromiseTwo;
  handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { concurrentRepairOne = value; } }],
    waitUntil(promise) { concurrentRepairPromiseOne = promise; },
  });
  handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { concurrentRepairTwo = value; } }],
    waitUntil(promise) { concurrentRepairPromiseTwo = promise; },
  });
  await Promise.all([concurrentRepairPromiseOne, concurrentRepairPromiseTwo]);
  assert.equal(concurrentRepairOne.ready, true);
  assert.equal(concurrentRepairTwo.ready, true);
  assert.equal(
    (networkRequestCounts.get("./release-shell-v1.json") || 0)
      - manifestFetchesBeforeConcurrentRepair,
    1,
    "simultaneous repair requests must share one exact-cache population transaction",
  );

  let crossOriginIntercepted = false;
  handlers.get("fetch")({
    request: new MockRequest("https://other.example/file", { mode: "same-origin" }),
    respondWith() { crossOriginIntercepted = true; },
  });
  assert.equal(crossOriginIntercepted, false);

  let postIntercepted = false;
  const post = new MockRequest("./index.html", { method: "POST" });
  handlers.get("fetch")({ request: post, respondWith() { postIntercepted = true; } });
  assert.equal(postIntercepted, false);

  function workerPort() {
    return {
      scriptURL: self.location.href,
      async postMessage(data) {
        let replyPayload;
        let effectPromise = null;
        handlers.get("message")({
          data,
          ports: [{ postMessage(value) { replyPayload = value; } }],
          waitUntil(promise) { effectPromise = Promise.resolve(promise); },
        });
        assert.ok(effectPromise, data.type);
        await effectPromise;
        return replyPayload;
      },
    };
  }

  const activeWorker = workerPort();
  const exactWaitingWorker = workerPort();
  self.registration.active = activeWorker;
  self.registration.waiting = exactWaitingWorker;
  assert.equal(
    activeWorker.scriptURL,
    exactWaitingWorker.scriptURL,
    "real deployments can expose identical active and waiting script URLs",
  );
  const controllerReadiness = await activeWorker.postMessage({
    type: "MATH_QUEST_GET_READINESS_V1",
  });
  assert.equal(controllerReadiness.workerState, "active");

  const noReadinessChallenge = "0".repeat(64);
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: noReadinessChallenge,
  });
  assert.equal(skipWaitingCalls, 0, "activation without waiting readiness must fail");

  const invalidReadiness = await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: "e".repeat(63),
  });
  assert.equal(invalidReadiness.ready, false);
  assert.equal(invalidReadiness.activationChallenge, null);
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: "e".repeat(63),
  });
  assert.equal(skipWaitingCalls, 0, "an invalid challenge must never activate");

  const acceptedChallenge = "a".repeat(64);
  const waitingReadiness = await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: acceptedChallenge,
  });
  assert.equal(waitingReadiness.type, "MATH_QUEST_WAITING_READINESS_V1");
  assert.equal(waitingReadiness.workerState, "waiting");
  assert.equal(waitingReadiness.ready, true);
  assert.equal(waitingReadiness.activationChallenge, acceptedChallenge);

  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: "b".repeat(64),
  });
  assert.equal(skipWaitingCalls, 0, "a mismatched challenge must fail");
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: acceptedChallenge,
  });
  assert.equal(skipWaitingCalls, 0, "a challenge consumed by a mismatch must be stale");

  const mutationChallenge = "c".repeat(64);
  assert.equal((await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: mutationChallenge,
  })).ready, true);
  const tapEntry = releaseManifest.entries.find((entry) => entry.path === "./assets/sounds/tap.wav");
  beta5.set(
    cacheKey(tapEntry.path),
    new MockResponse(
      "mutated after readiness",
      new URL(tapEntry.path, scope).href,
      tapEntry.mime,
    ),
  );
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: mutationChallenge,
  });
  assert.equal(skipWaitingCalls, 0, "cache mutation after readiness must fail revalidation");

  const tapBytes = await readFile(path.join(root, tapEntry.path.slice(2)));
  beta5.set(
    cacheKey(tapEntry.path),
    new MockResponse(tapBytes, new URL(tapEntry.path, scope).href, tapEntry.mime),
  );
  const finalChallenge = "d".repeat(64);
  assert.equal((await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: finalChallenge,
  })).ready, true);
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: finalChallenge,
  });
  assert.equal(skipWaitingCalls, 1);
  await exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: finalChallenge,
  });
  assert.equal(skipWaitingCalls, 1, "a successful challenge must be one-time");
});
