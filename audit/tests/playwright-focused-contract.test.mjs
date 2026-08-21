import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PLAYWRIGHT_FOCUSED_CONTRACT_ID,
  PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS,
  PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
  PLAYWRIGHT_TEST_VERSION,
  playwrightChildProcessRunning,
  playwrightFocusedExpectedServerIdentity,
  playwrightFocusedReportFindings,
  playwrightFocusedServerIdentityMatches,
  reviewedEdgeExecutable,
} from "../lib/playwright-focused-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const digest = "a".repeat(64);

const validReport = () => ({
  schemaVersion: PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
  contractId: PLAYWRIGHT_FOCUSED_CONTRACT_ID,
  generatedAt: "2026-08-12T12:00:00.000Z",
  toolchain: {
    runnerPackage: "@playwright/test",
    runnerVersion: PLAYWRIGHT_TEST_VERSION,
    browserProduct: "Microsoft Edge",
    browserVersion: "151.0.4129.72",
    browserExecutableSha256: digest,
    serverRootId: digest,
    servedPayloadSha256: digest,
  },
  privacy: {
    usesSyntheticStateOnly: true,
    includesChildName: false,
    includesChildProgress: false,
    includesTraceOnPass: false,
    includesScreenshotOnPass: false,
    uploadsFailureArtifacts: false,
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
  ]) {
    const mutant = validReport();
    mutate(mutant);
    assert.notEqual(playwrightFocusedReportFindings(mutant, expected).length, 0);
  }
});

test("Playwright configuration preserves one-worker, zero-retry, installed-Edge and failure-only artifact policy", async () => {
  const config = await readFile(path.join(root, "playwright.config.mjs"), "utf8");
  assert.match(config, /workers:\s*1/u);
  assert.match(config, /retries:\s*0/u);
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
  const [spec, fixtures] = await Promise.all([
    readFile(path.join(root, "audit", "playwright", "critical-journeys.spec.mjs"), "utf8"),
    readFile(path.join(root, "audit", "playwright", "fixtures.mjs"), "utf8"),
  ]);
  const source = `${spec}\n${fixtures}`;
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
  assert.match(runner, /playwrightFocusedServerIdentityMatches\(value, expectedHealth\)/u);
  assert.match(runner, /MQ_PLAYWRIGHT_ROOT_ID/u);
  assert.match(runner, /MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256/u);
});

test("disposable server cleanup treats both normal and signalled exits as stopped", () => {
  assert.equal(playwrightChildProcessRunning({ exitCode: null, signalCode: null }), true);
  assert.equal(playwrightChildProcessRunning({ exitCode: 0, signalCode: null }), false);
  assert.equal(playwrightChildProcessRunning({ exitCode: null, signalCode: "SIGTERM" }), false);
  assert.equal(playwrightChildProcessRunning(null), false);
});
