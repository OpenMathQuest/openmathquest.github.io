import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertRightsInputBindings } from "./rights-state-fixture.mjs";
import path from "node:path";
import test from "node:test";
import "./playwright-server-lifecycle.test.mjs";
import { fileURLToPath } from "node:url";
import {
  PLAYWRIGHT_FOCUSED_AUTOMATIC_RETRIES,
  PLAYWRIGHT_FOCUSED_CONTRACT_ID,
  PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS,
  PLAYWRIGHT_FOCUSED_EXPECT_TIMEOUT_MS,
  PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
  PLAYWRIGHT_FOCUSED_TEST_TIMEOUT_MS,
  PLAYWRIGHT_FOCUSED_WORKERS,
  PLAYWRIGHT_TEST_VERSION,
  playwrightChildProcessRunning,
  playwrightFocusedExpectedServerIdentity,
  playwrightFocusedReportFindings,
  playwrightFocusedServerIdentityMatches,
  reviewedEdgeExecutable,
} from "../lib/playwright-focused-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lifecycleSource = await readFile(new URL("../lib/playwright-server-lifecycle.mjs", import.meta.url), "utf8");
const digest = "a".repeat(64);

test("[NC-PLAYWRIGHT-HELPER-RIGHTS-BINDING] extracted browser helper bytes remain bound to rights evidence", async () => {
  await assertRightsInputBindings([
    "audit/lib/playwright-deep-ux-sampling.mjs",
    "audit/playwright/art-dom-observations.mjs",
    "audit/playwright/assisted-learning-journey.mjs",
    "audit/playwright/deep-ux-dom-observations.mjs",
    "audit/playwright/design-token-observations.mjs",
    "audit/playwright/functional-art-journey.mjs",
    "audit/playwright/parent-lab-journey.mjs",
    "audit/playwright/tutorial-observations.mjs",
  ]);
});

const REPORT_TOOLCHAIN = Object.freeze({
    runnerPackage: "@playwright/test",
    runnerVersion: PLAYWRIGHT_TEST_VERSION,
    browserProduct: "Microsoft Edge",
    browserVersion: "151.0.4129.72",
    browserExecutableSha256: digest,
    serverRootId: digest,
    servedPayloadSha256: digest,
});

const validReport = () => ({
  schemaVersion: PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
  contractId: PLAYWRIGHT_FOCUSED_CONTRACT_ID,
  generatedAt: "2026-08-12T12:00:00.000Z",
  toolchain: { ...REPORT_TOOLCHAIN },
  privacy: {
    usesSyntheticStateOnly: true,
    includesChildName: false,
    includesChildProgress: false,
    includesTraceOnPass: false,
    includesScreenshotOnPass: false,
    uploadsFailureArtifacts: false,
  },
  accessibility: {
    enginePackage: "axe-core",
    engineVersion: "4.13.0",
    runTags: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"],
    negativeControl: { id: "NC-AXE-UNNAMED-BUTTON-DETECTED", status: "PASS" },
    violationCount: 0,
    manualReviewItems: [],
  },
  summary: {
    expected: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length,
    actual: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length,
    passed: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length,
    failed: 0,
    skipped: 0,
    unknown: 0,
    duplicates: 0,
  },
  results: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.map((key) => {
    const [projectId, caseId] = key.split(":");
    return { key, projectId, caseId, status: "passed", durationMs: 12, attempts: 1 };
  }),
});

test("[NC-PLAYWRIGHT-MISSING-SKIPPED-RETRIED-RESULT] focused Playwright report accepts only the exact clean project/case matrix", () => {
  const expected = { expectedExecutableSha256: digest, expectedRootId: digest, expectedServedPayloadSha256: digest };
  assert.deepEqual(playwrightFocusedReportFindings(validReport(), expected), []);
  for (const mutate of [
    (report) => { report.results.pop(); report.summary.actual -= 1; report.summary.passed -= 1; },
    (report) => { report.results[0].status = "skipped"; report.summary.passed -= 1; report.summary.skipped += 1; },
    (report) => { report.results[0].attempts = 2; },
    (report) => { report.results[0].caseId = "PW-F-99"; report.results[0].key = `${report.results[0].projectId}:PW-F-99`; },
    (report) => { report.privacy.includesTraceOnPass = true; },
    (report) => { report.toolchain.serverRootId = "b".repeat(64); },
    (report) => { report.toolchain.servedPayloadSha256 = "b".repeat(64); },
    (report) => { report.toolchain.browserExecutableSha256 = "b".repeat(64); },
    (report) => { report.accessibility.negativeControl.status = "FAIL"; },
    (report) => { report.accessibility.violationCount = 1; },
  ]) {
    const mutant = validReport();
    mutate(mutant);
    assert.notEqual(playwrightFocusedReportFindings(mutant, expected).length, 0);
  }
});

test("Playwright configuration preserves one-worker, zero-retry, installed-Edge and failure-only artifact policy", async () => {
  const config = await readFile(path.join(root, "playwright.config.mjs"), "utf8");
  assert.match(config, /workers:\s*PLAYWRIGHT_FOCUSED_WORKERS/u);
  assert.equal(PLAYWRIGHT_FOCUSED_WORKERS, 1);
  assert.match(config, /retries:\s*PLAYWRIGHT_FOCUSED_AUTOMATIC_RETRIES/u);
  assert.equal(PLAYWRIGHT_FOCUSED_AUTOMATIC_RETRIES, 0);
  assert.match(config, /timeout:\s*PLAYWRIGHT_FOCUSED_TEST_TIMEOUT_MS/u);
  assert.equal(PLAYWRIGHT_FOCUSED_TEST_TIMEOUT_MS, 60_000);
  assert.match(config, /expect:\s*\{\s*timeout:\s*PLAYWRIGHT_FOCUSED_EXPECT_TIMEOUT_MS\s*\}/u);
  assert.equal(PLAYWRIGHT_FOCUSED_EXPECT_TIMEOUT_MS, 7_500);
  assert.match(config, /executablePath/u);
  assert.match(config, /serviceWorkers:\s*"block"/u);
  assert.match(config, /trace:\s*"retain-on-failure"/u);
  assert.match(config, /screenshot:\s*"only-on-failure"/u);
  assert.match(config, /video:\s*"off"/u);
  assert.doesNotMatch(config, /channel:\s*["'](?:chromium|chrome|msedge)/u);
  assert.doesNotMatch(config, /webServer\s*:/u);
  const runner = await readFile(path.join(root, "audit", "run-playwright-focused.mjs"), "utf8");
  assert.match(runner, /playwrightFocusedExpectedServerIdentity\(root\)/u);
  assert.match(runner, /Port 8771 is occupied by an unexpected server/u);
  assert.match(runner, /ownedServer\.kill\(\)/u);
  assert.match(runner, /installedManifest\.version !== "1\.62\.1"/u);
  assert.match(runner, /reviewedEdgeExecutable\(requestedExecutable\)/u);
  assert.match(runner, /MQ_PLAYWRIGHT_RUNNER_VERSION: installedManifest\.version/u);
});

test("direct journeys use native Playwright actions and forbid synthetic interaction shortcuts", async () => {
  const sources = await Promise.all([
    "critical-journeys.spec", "fixtures", "art-dom-observations",
    "assisted-learning-journey", "design-token-observations",
    "functional-art-journey", "parent-lab-journey", "tutorial-observations",
  ].map((name) => readFile(path.join(root, "audit", "playwright", `${name}.mjs`), "utf8")));
  const source = sources.join("\n");
  for (const id of PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.filter((key) => key.startsWith("edge-desktop:")).map((key) => key.split(":")[1])) {
    assert.match(source, new RegExp(`\\[${id}\\]`, "u"));
  }
  assert.doesNotMatch(source, /dispatchEvent|\.focus\(|force:\s*true|waitForTimeout/u);
  assert.match(source, /getByRole/u);
  assert.match(source, /keyboard\.press/u);
  assert.match(source, /toBeFocused/u);
  assert.match(source, /boundingBox/u);
  assert.match(source, /locator\.tap\(\)/u);
  assert.match(source, /Browser\.getVersion/u);
});

test("only the reviewed system Edge executable paths are accepted", () => {
  assert.equal(reviewedEdgeExecutable("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"), true);
  assert.equal(reviewedEdgeExecutable("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"), true);
  assert.equal(reviewedEdgeExecutable("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"), false);
  assert.equal(reviewedEdgeExecutable("C:\\Temp\\msedge.exe"), false);
});

test("focused server identity binds the exact checkout root and served bytes", async () => {
  const identity = await playwrightFocusedExpectedServerIdentity(root);
  assert.equal(identity.rootId.length, 64);
  assert.equal(identity.servedPayloadSha256.length, 64);
  assert.equal(identity.identity, "math-quest-local-server:v2");
  const runner = await readFile(path.join(root, "audit", "run-playwright-focused.mjs"), "utf8");
  assert.equal(playwrightFocusedServerIdentityMatches(identity, identity), true);
  assert.equal(playwrightFocusedServerIdentityMatches({ ...identity, rootId: "b".repeat(64) }, identity), false);
  assert.equal(playwrightFocusedServerIdentityMatches({ ...identity, servedPayloadSha256: "b".repeat(64) }, identity), false);
  assert.equal(playwrightFocusedServerIdentityMatches({ ...identity, extra: true }, identity), false);
  assert.match(lifecycleSource, /playwrightFocusedServerIdentityMatches\(value, expectedHealth\)/u);
  assert.match(runner, /MQ_PLAYWRIGHT_ROOT_ID/u);
  assert.match(runner, /MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256/u);
});

test("disposable server cleanup treats both normal and signalled exits as stopped", () => {
  assert.equal(playwrightChildProcessRunning({ exitCode: null, signalCode: null }), true);
  assert.equal(playwrightChildProcessRunning({ exitCode: 0, signalCode: null }), false);
  assert.equal(playwrightChildProcessRunning({ exitCode: null, signalCode: "SIGTERM" }), false);
  assert.equal(playwrightChildProcessRunning(null), false);
});
