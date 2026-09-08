import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const assetUrl = new URL("../../assets/js/math-quest-pwa-status.js", import.meta.url);
const pageUrl = new URL("../../index.html", import.meta.url);
const launcherIdentityUrl = new URL("../test-launcher-identity.ps1", import.meta.url);
const playwrightIdentityUrl = new URL("../lib/playwright-focused-contract.mjs", import.meta.url);
const playwrightFixturesUrl = new URL("../playwright/fixtures.mjs", import.meta.url);

const UPDATE_STATUS_CASES = Object.freeze([
  [undefined, ""],
  [{ applying: true, applyAcknowledged: false }, "Requesting verified update activation."],
  [{ applying: true, applyAcknowledged: true }, "This tab is finishing the verified update and will reload. Other open Math Quest tabs are never forced to reload; close and reopen or reload them yourself."],
  [{ updatePhase: "IDLE", verified: false }, ""],
  [{ updatePhase: "READY", verified: false }, "A verified update is ready. Apply it only from Home or the Grown-ups corner."],
  [{ updatePhase: "READY", verified: true }, "A verified update is ready. Apply it only from Home or the Grown-ups corner."],
  [{ updatePhase: "CACHING", verified: false }, "A candidate update is caching. Stay online until offline setup finishes."],
  [{ updatePhase: "CACHING", verified: true }, "A candidate update is caching. The current verified offline version remains available."],
  [{ updatePhase: "CHECKING", verified: false }, "Checking for an update. Stay online until offline setup finishes."],
  [{ updatePhase: "CHECKING", verified: true }, "Checking for an update. The current verified offline version remains available."],
  [{ updatePhase: "RELOAD_PENDING", verified: false }, "Verified offline files are active. Reload this tab from Home or the Grown-ups corner when you are ready; it will not reload by itself."],
  [{ updatePhase: "RELOAD_PENDING", verified: true }, "Verified offline files are active. Reload this tab from Home or the Grown-ups corner when you are ready; it will not reload by itself."],
  [{ updatePhase: "ERROR", verified: false }, "The update needs attention. Stay online and retry after offline setup finishes."],
  [{ updatePhase: "ERROR", verified: true }, "The update needs attention. The current verified offline version remains available."],
  [{ updatePhase: "UNKNOWN", verified: true }, ""],
]);
const READINESS_STATUS_CASES = Object.freeze([
  ["READY", "Ready for an offline check"],
  ["CACHING", "Caching app files — stay online until setup finishes"],
  ["RECOVERY", "Recovery needed"],
  ["ONLINE_ONLY", "Online only"],
  ["NOT_CONTROLLED", "Not controlled — stay online and reload"],
  ["UNKNOWN", "Not controlled — stay online and reload"],
]);
const READINESS_NOW = Date.parse("2026-08-28T12:00:00.000Z");
const READINESS_REQUIRED_PATHS = Object.freeze(["./index.html", "./PRIVACY.md"]);
const READINESS_CONTRACT = Object.freeze({
  release: "1.0.0-beta.8",
  buildId: "math-quest-pwa-v1.0.0-beta.8",
  cacheIdentity: "math-quest-static-v1.0.0-beta.8",
  requiredPaths: READINESS_REQUIRED_PATHS,
  now: () => READINESS_NOW,
  expectedType: "MATH_QUEST_READINESS_V1",
  expectedWorkerState: null,
  activationChallenge: null,
});

function readinessPayload(overrides = {}) {
  return {
    type: "MATH_QUEST_READINESS_V1",
    release: READINESS_CONTRACT.release,
    buildId: READINESS_CONTRACT.buildId,
    cacheIdentity: READINESS_CONTRACT.cacheIdentity,
    requiredPaths: READINESS_REQUIRED_PATHS.map((path) => ({ path, ready: true })),
    workerState: "active",
    checkedAt: new Date(READINESS_NOW).toISOString(),
    ready: true,
    ...overrides,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function invalidReadinessCases() {
  const duplicatePaths = READINESS_REQUIRED_PATHS.map(() => ({ path: "./index.html", ready: true }));
  return [
    null,
    "reply",
    readinessPayload({ release: "1.0.0-beta.7" }),
    readinessPayload({ buildId: "wrong-build" }),
    readinessPayload({ cacheIdentity: "wrong-cache" }),
    readinessPayload({ type: "MATH_QUEST_WAITING_READINESS_V1" }),
    readinessPayload({ workerState: "activated" }),
    readinessPayload({ checkedAt: 1 }),
    readinessPayload({ checkedAt: "x".repeat(41) }),
    readinessPayload({ checkedAt: new Date(READINESS_NOW - 600_001).toISOString() }),
    readinessPayload({ requiredPaths: null }),
    readinessPayload({ requiredPaths: [{ path: "./index.html", ready: true }] }),
    readinessPayload({ requiredPaths: [null, { path: "./PRIVACY.md", ready: true }] }),
    readinessPayload({ requiredPaths: [{ path: "./index.html", ready: true, extra: true }, { path: "./PRIVACY.md", ready: true }] }),
    readinessPayload({ requiredPaths: [{ path: 1, ready: true }, { path: "./PRIVACY.md", ready: true }] }),
    readinessPayload({ requiredPaths: [{ path: "./index.html", ready: "yes" }, { path: "./PRIVACY.md", ready: true }] }),
    readinessPayload({ requiredPaths: duplicatePaths }),
    readinessPayload({ requiredPaths: [{ path: "./index.html", ready: true }, { path: "./OTHER.md", ready: true }] }),
    readinessPayload({ ready: "yes" }),
    readinessPayload({ requiredPaths: READINESS_REQUIRED_PATHS.map((path) => ({ path, ready: false })) }),
    { ...readinessPayload(), extra: true },
  ];
}

function evaluateStatusPolicy(source) {
  const context = vm.createContext({});
  new vm.Script(source, { filename: "math-quest-pwa-status.js" }).runInContext(context);
  return context.MathQuestPwaStatus;
}

async function loadStatusPolicy() {
  return evaluateStatusPolicy(await readFile(assetUrl, "utf8"));
}

function statusPolicyFindings(policy) {
  const findings = [];
  for (const [state, expected] of UPDATE_STATUS_CASES) {
    if (policy.updateStatusText(state) !== expected) findings.push(`update status mismatch for ${JSON.stringify(state)}`);
  }
  for (const [phase, expected] of READINESS_STATUS_CASES) {
    if (policy.readinessStatusText(phase) !== expected) findings.push(`readiness status mismatch for ${phase}`);
  }
  return findings;
}

test("PWA update status policy preserves every verified and unverified message", async () => {
  const policy = await loadStatusPolicy();
  assert.equal(Object.isFrozen(policy), true);
  assert.deepEqual(statusPolicyFindings(policy), []);
});

test("[NC-PWA-STATUS-MAPPING-DRIFT] altered status copy fails closed", async () => {
  const source = await readFile(assetUrl, "utf8");
  const mutatedSource = source.replace("Ready for an offline check", "Ready offline");
  assert.notEqual(mutatedSource, source, "the calibrated mutation must change the runtime policy");
  assert.match(statusPolicyFindings(evaluateStatusPolicy(mutatedSource)).join("\n"), /readiness status mismatch for READY/u);
});

test("PWA readiness validation preserves the exact release, path, time, and challenge contract", async () => {
  const policy = await loadStatusPolicy();
  const active = readinessPayload({
    requiredPaths: [...readinessPayload().requiredPaths].reverse(),
  });
  assert.deepEqual(plain(policy.validateReadiness(active, READINESS_CONTRACT)), readinessPayload());

  const boundary = readinessPayload({ checkedAt: new Date(READINESS_NOW - 600_000).toISOString() });
  assert.equal(policy.validateReadiness(boundary, READINESS_CONTRACT)?.ready, true);

  const activationChallenge = "ab".repeat(32);
  const waitingContract = {
    ...READINESS_CONTRACT,
    expectedType: "MATH_QUEST_WAITING_READINESS_V1",
    expectedWorkerState: "waiting",
    activationChallenge,
  };
  const waiting = readinessPayload({
    type: waitingContract.expectedType,
    workerState: waitingContract.expectedWorkerState,
    activationChallenge,
  });
  assert.deepEqual(plain(policy.validateReadiness(waiting, waitingContract)), waiting);
});

test("PWA readiness validation rejects every malformed contract axis", async () => {
  const policy = await loadStatusPolicy();
  for (const payload of invalidReadinessCases()) {
    assert.equal(policy.validateReadiness(payload, READINESS_CONTRACT), null);
  }
  assert.equal(policy.validateReadiness(readinessPayload(), {
    ...READINESS_CONTRACT,
    expectedWorkerState: "waiting",
  }), null);
  for (const activationChallenge of ["a".repeat(63), "A".repeat(64), "c".repeat(64)]) {
    const payload = readinessPayload({
      type: "MATH_QUEST_WAITING_READINESS_V1",
      workerState: "waiting",
      activationChallenge: "b".repeat(64),
    });
    assert.equal(policy.validateReadiness(payload, {
      ...READINESS_CONTRACT,
      expectedType: payload.type,
      expectedWorkerState: payload.workerState,
      activationChallenge,
    }), null);
  }
});

test("PWA readiness validation samples its injected clock only after structural checks pass", async () => {
  const policy = await loadStatusPolicy();
  let calls = 0;
  const contract = { ...READINESS_CONTRACT, now: () => { calls += 1; return READINESS_NOW; } };
  assert.equal(policy.validateReadiness(readinessPayload({ release: "wrong" }), contract), null);
  assert.equal(calls, 0);
  assert.equal(policy.validateReadiness(readinessPayload(), contract)?.ready, true);
  assert.equal(calls, 1);
});

test("[NC-PWA-READINESS-VALIDATION-DRIFT] accepting a stale record fails closed", async () => {
  const source = await readFile(assetUrl, "utf8");
  const mutant = source.replace("elapsed<=600000", "elapsed<=600001");
  assert.notEqual(mutant, source, "the calibrated mutation must alter the freshness boundary");
  const stale = readinessPayload({ checkedAt: new Date(READINESS_NOW - 600_001).toISOString() });
  assert.notEqual(evaluateStatusPolicy(mutant).validateReadiness(stale, READINESS_CONTRACT), null,
    "the protected contract must detect that the mutant accepts a stale record");
});

test("the shipped page loads the PWA status policy before the adapter and delegates to it", async () => {
  const html = await readFile(pageUrl, "utf8");
  const assetTag = '<script src="assets/js/math-quest-pwa-status.js"></script>';
  const assetIndex = html.indexOf(assetTag);
  const adapterIndex = html.indexOf("<script>", html.indexOf("/* ===ENGINE-END=== */"));

  assert.notEqual(assetIndex, -1, "the status policy asset must be loaded");
  assert.equal(assetIndex < adapterIndex, true, "the status policy must load before the adapter");
  assert.match(html, /MathQuestPwaStatus\.updateStatusText\(\{/u);
  assert.match(html, /MathQuestPwaStatus\.validateReadiness\(payload,\{/u);
  assert.equal([...html.matchAll(/MathQuestPwaStatus\.readinessStatusText\(pwa\.phase\)/gu)].length, 2);
});

test("[NC-PWA-STATUS-RUNTIME-INVENTORY-DRIFT] launcher and browser identities bind the status asset", async () => {
  const [launcherIdentity, playwrightIdentity, playwrightFixtures] = await Promise.all([
    readFile(launcherIdentityUrl, "utf8"),
    readFile(playwrightIdentityUrl, "utf8"),
    readFile(playwrightFixturesUrl, "utf8"),
  ]);
  assert.equal(launcherIdentity.includes("@('/assets/js/math-quest-pwa-status.js', 'assets/js/math-quest-pwa-status.js')"), true);
  assert.equal(playwrightIdentity.includes('["/assets/js/math-quest-pwa-status.js", "assets/js/math-quest-pwa-status.js"]'), true);
  assert.match(playwrightFixtures, /PLAYWRIGHT_FOCUSED_SERVER_ROUTES\.map\(\(\[route\]\) => route\)/u);
});
