import { observePromiseSettlement, recoverAndDrainOperation, captureCanaryObservation } from "../lib/trusted-https-canary.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createSourceExtractor } from "./source-extraction.mjs";

const runnerSource = await readFile(new URL("../run-trusted-https-canary.mjs", import.meta.url), "utf8");
const extract = createSourceExtractor(runnerSource, { sourceType: "module" });

async function canarySnapshotManifestValidator() {
  const source = await readFile(new URL("../lib/trusted-https-canary-runner-platform.mjs", import.meta.url), "utf8");
  const extractor = createSourceExtractor(source, { sourceType: "module" });
  const marker = "const EXPECTED_RELEASE_ENTRIES = Object.freeze(";
  const start = source.indexOf(marker);
  assert.ok(start >= 0);
  assert.equal(source.lastIndexOf(marker), start);
  const open = source.indexOf("[", start);
  const close = extractor.matchingDelimiter(open, "[", "]");
  return vm.runInThisContext(`(assert) => {
    ${source.slice(start, close + 1)});
    ${extractor.functionDeclaration("verifySnapshotManifest")}
    return verifySnapshotManifest;
  }`)(assert);
}

test("canary accepts the actual shipped release manifest including browser helpers", async () => {
  const verify = await canarySnapshotManifestValidator();
  const manifest = JSON.parse(await readFile(new URL("../../release-shell-v1.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => verify(manifest));
});

test("[NC-CANARY-RUNTIME-ALLOWLIST] missing helpers and altered runtime entries fail closed", async () => {
  const verify = await canarySnapshotManifestValidator();
  const manifest = JSON.parse(await readFile(new URL("../../release-shell-v1.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => verify(manifest));
  for (const helper of ["math-quest-progress-source.js", "math-quest-pwa-status.js"]) {
    const missing = structuredClone(manifest);
    missing.entries = missing.entries.filter((entry) => !entry.path.endsWith(helper));
    assert.notDeepEqual(missing, manifest);
    assert.throws(() => verify(missing), { name: "AssertionError" });
  }
  for (const mutate of [
    (entries) => { entries[0].mime = "application/octet-stream"; },
    (entries) => { entries.push({ ...entries[0], path: "./assets/js/unreviewed.js" }); },
    (entries) => { entries.push({ ...entries[0] }); },
    (entries) => { entries.reverse(); },
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed.entries);
    assert.notDeepEqual(changed, manifest);
    assert.throws(() => verify(changed), { name: "AssertionError" });
  }
});

function activeCacheRunFixture() {
  const controls = [];
  const locator = {
    async click() { controls.push("click"); },
    filter(options) { controls.push(options.hasText); return this; },
    async waitFor(options) { controls.push(options.state); },
  };
  const page = { locator(selector) { controls.push(selector); return locator; } };
  const state = {
    checks: [], candidatePage: page, context: {}, profilePath: "disposable-profile",
    origin: "https://localhost:1234/", snapshots: {}, activeCacheProof: null,
    sourceBytes: "retained-source", protectedBytes: "protected-progress",
  };
  const records = new Map([["source", state.sourceBytes], ["protected", state.protectedBytes]]);
  return { state, records, controls, controllerUrl: `${state.origin}sw.js`, proof: { exact: true } };
}

function activeCacheCheck(fixture) {
  const sandbox = {
    assert, SOURCE_KEY: "source", PROTECTED_KEY: "protected",
    checkedStep: async (_checks, id, action) => {
      assert.equal(id, "CANDIDATE_ACTIVE_CACHE_READY");
      await action();
    },
    openCanaryInstallHelp: async (page) => assert.equal(page, fixture.state.candidatePage),
    boundedPageEvaluate: async (page, context, profilePath, action, key) => {
      assert.equal(page, fixture.state.candidatePage);
      assert.equal(context, fixture.state.context);
      assert.equal(profilePath, fixture.state.profilePath);
      return vm.runInNewContext(`(${action})(key)`, {
        key, navigator: { serviceWorker: { controller: { scriptURL: fixture.controllerUrl } } },
        localStorage: { getItem: (name) => fixture.records.get(name) },
      });
    },
    inspectExactCandidateCache: async () => fixture.proof,
  };
  return vm.runInNewContext(`(${extract.functionDeclaration("checkCandidateActiveCacheReady")})`, sandbox);
}

test("canary active-cache observation retains the browser context and both progress witnesses", async () => {
  const fixture = activeCacheRunFixture();
  await activeCacheCheck(fixture)(fixture.state);
  assert.equal(fixture.state.activeCacheProof, fixture.proof);
  assert.deepEqual(fixture.controls, [
    '[data-action="pwa-retry"]', "click", "[data-pwa-status]",
    "Ready for an offline check", "visible",
  ]);
  assert.deepEqual([...fixture.records.values()], ["retained-source", "protected-progress"]);
});

test("canary active-cache evidence rejects a foreign controller or changed progress", async () => {
  const foreign = activeCacheRunFixture();
  foreign.controllerUrl = "https://elsewhere.invalid/sw.js";
  await assert.rejects(activeCacheCheck(foreign)(foreign.state), { name: "AssertionError" });
  assert.equal(foreign.state.activeCacheProof, null);
  for (const key of ["source", "protected"]) {
    const fixture = activeCacheRunFixture();
    fixture.records.set(key, "changed");
    await assert.rejects(activeCacheCheck(fixture)(fixture.state), { name: "AssertionError" });
  }
});

function assertCanaryBoundedRunnerSource(runnerText) {
  assert.match(runnerText, /\[canary\] START \$\{id\}/u);
  assert.match(runnerText, /\[canary\] PASS \$\{id\}/u);
  assert.match(runnerText, /\[canary\] FAIL \$\{id\}/u);
  assert.match(runnerText, /Beta 1 service-worker readiness timed out/u);
  assert.match(runnerText, /START ONLINE_TO_OFFLINE_SHUTDOWN/u);
  assert.match(runnerText, /closePersistentContext\(context, profilePath\)/u);
  assert.match(runnerText, /boundedPageEvaluate/u);
  assert.match(runnerText, /boundedBrowserOperation/u);
  assert.match(runnerText, /closeAuxiliaryContext/u);
  assert.match(runnerText, /closeAllConnections/u);
  assert.doesNotMatch(runnerText, /await\s+(?:[A-Za-z_$][\w$]*\.)+evaluate\s*\(/u);
  assert.doesNotMatch(runnerText, /networkBrowser/u);
  assert.doesNotMatch(runnerText, /await\s+(?:state\.)?networkContext\.close\s*\(/u);
  assert.doesNotMatch(runnerText, /await\s+(?:state\.)?context\.newPage\s*\(/u);
  assert.doesNotMatch(runnerText, /await\s+(?:state\.)?context\.setOffline\s*\(/u);
  assert.doesNotMatch(runnerText, /allHeaders\(\)\s*\)\.catch/u);
  assert.doesNotMatch(runnerText, /\.allHeaders\(\)|Playwright request-header observation/u);
}

function assertCanaryRequestAndTlsSource(runnerText) {
  assert.match(runnerText, /canaryRequestHeaderFlags\(request\.headers\(\)\)/u);
  assert.match(runnerText, /canaryBackendRequestViolation\(item, allowed\)/u);
  assert.match(runnerText, /Backend request violation count=/u);
  assert.match(runnerText, /EXPECTED_BROWSER_PROBE_PATHS = Object\.freeze\(\["\/favicon\.ico"\]\)/u);
  assert.match(runnerText, /responseStatus: 404/u);
  assert.match(runnerText, /status: row\.responseStatus/u);
  assert.match(runnerText, /trustedTlsInspectionScript\(\)/u);
  assert.match(runnerText, /validateCanaryBrowserTlsSecurity\(security, state\.tls\)/u);
  assert.match(runnerText, /validateCanaryRootScopeProof\(\{ manifest, \.\.\.scope, origin: state\.origin \}\)/u);
  assert.doesNotMatch(runnerText, /fetch\("\.\/manifest\.webmanifest"/u);
}

function assertCanaryNativeJourneySource(runnerText) {
  assert.match(runnerText, /selectionAnswerSource: beta1GradedSelectionAnswer\.toString\(\)/u);
  assert.match(runnerText, /waitForCanaryHomeUpdate\(state\.candidatePage, "1\.0\.0-beta\.9"\)/u);
  assert.match(runnerText, /activateCanaryHomeUpdate\(state\.candidatePage\)/u);
  assert.match(runnerText, /reloadCanaryCandidateFromBeta1\(state\.beta1Page, "1\.0\.0-beta\.9"\)/u);
  assert.match(runnerText, /RETIRED_BETA1_PRESERVED_FRESH_START/u);
  assert.match(runnerText, /MathQuestEngine\.exportState\(MathQuestEngine\.createInitialState\(state\.maxSeenPlayDay\)\)/u);
  assert.match(runnerText, /assert\.equal\(state\.protectedBytes, state\.expectedFreshBytes/u);
  assert.match(runnerText, /assert\.equal\(fresh\.marker, RETAINED_BETA1_COMPLETE_VALUE\)/u);
  assert.match(runnerText, /observeCanaryRetainedFreshStartNotice\(state\.candidatePage\)/u);
  assert.match(runnerText, /state\.candidatePage\.waitForFunction\(canaryWaitingCacheReady/u);
  assert.match(runnerText, /boundedPageEvaluate\([\s\S]*exactCandidateCacheObservation/u);
  assert.match(runnerText, /assert\.equal\(state\.retainedFreshStartNoticeSha256, RETAINED_BETA1_FRESH_START_NOTICE_SHA256\)/u);
  assert.doesNotMatch(runnerText, /projectApprovedShape|SCHEMA3_MIGRATION_PRESERVED/u);
  assert.doesNotMatch(runnerText, /Playwright candidate page creation|waitForCanaryWriterBlocked|closeCanaryWriterPage/u);
  assert.match(runnerText, /openCanaryInstallHelp\(state\.candidatePage\)/u);
  assert.doesNotMatch(runnerText, /candidatePage\.locator\('\[data-action="pwa-apply"\]'\)/u);
  assert.doesNotMatch(runnerText, /async function waitForCandidateHome|async function openInstallHelp/u);
  assert.match(runnerText, /const answer = question\.inputClass === "SELECTION"\s*\? gradedSelectionAnswer\(question, E\.gradeAnswer\)\s*:\s*String\(question\.answer\.value\)/u);
  assert.match(runnerText, /E\.submitAnswer\(question, answer,/u);
}

function assertCanaryCertificateCleanupSource(runnerText, wrapperText) {
  assert.doesNotMatch(runnerText, /HashData|ToHexString/u);
  assert.match(runnerText, /assert\.deepEqual\(state\.requestTrackers\.flatMap\(\(tracker\) => tracker\.observationFailures\), \[\]\)/u);
  assert.match(runnerText, /X509Store\]::new\('Root',\[Security\.Cryptography\.X509Certificates\.StoreLocation\]::LocalMachine\)/u);
  assert.match(runnerText, /WindowsBuiltInRole\]::Administrator/u);
  assert.match(runnerText, /\$store\.Add\(\$certificate\)/u);
  assert.match(runnerText, /\$store\.Remove\(\$certificate\)/u);
  assert.match(runnerText, /canonicalCertificateThumbprint\(state\.certificateThumbprint\)/u);
  assert.match(runnerText, /persistCleanupIdentifiers\(state\.workRoot, \{ processIds: \[state\.caddy\.child\.pid\], certificateThumbprint: state\.certificateThumbprint, originPort: state\.originPort \}\);\s*assert\.equal\(Number\(await run\("powershell\.exe"/u);
  assert.match(wrapperText, /certificateCleanup\.WaitForExit\(30000\)/u);
  assert.match(wrapperText, /certificateCleanup\.Kill\(\)/u);
  assert.match(wrapperText, /Fallback certificate removal did not remove the exact canary root/u);
  assert.match(wrapperText, /X509Store\]::new\('Root', \[Security\.Cryptography\.X509Certificates\.StoreLocation\]::LocalMachine\)/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /StoreLocation\]::CurrentUser/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /Import-Certificate/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /certutil\.exe/u);
  assert.doesNotMatch(runnerText, /\$args\[0\]/u);
}

test("canary checks emit progress markers and bind open-ended waits", async () => {
  await assertCanarySettlementBounds();
  await assertCanaryRecoveryDrain();
  await assertCanaryFailedObservation();
  const [runnerText, wrapperText] = await Promise.all([
    readRunnerModules(),
    readFile(new URL("../run-trusted-https-canary.ps1", import.meta.url), "utf8"),
  ]);
  assertCanaryBoundedRunnerSource(runnerText);
  assertCanaryRequestAndTlsSource(runnerText);
  assertCanaryNativeJourneySource(runnerText);
  assertCanaryCertificateCleanupSource(runnerText, wrapperText);

});

async function readRunnerModules() {
  const helpers = await Promise.all([
    readFile(new URL("../lib/trusted-https-canary-runner-platform.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/trusted-https-canary-runner-browser.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/trusted-https-canary-runner-report.mjs", import.meta.url), "utf8"),
  ]);
  return [runnerSource, ...helpers].join("\n");
}

test("canary bounded-operation guards reject direct calls through local and per-run references", async () => {
  const sources = await readRunnerModules();
  assertCanaryBoundedRunnerSource(sources);
  for (const expression of [
    "await context.newPage()", "await state.context.newPage()",
    "await context.setOffline(true)", "await state.context.setOffline(true)",
    "await networkContext.close()", "await state.networkContext.close()",
    "await page.evaluate(() => 1)", "await state.candidatePage.evaluate(() => 1)",
  ]) {
    assert.throws(() => assertCanaryBoundedRunnerSource(`${sources}\n${expression};`),
      { code: "ERR_ASSERTION" }, expression);
  }
});

async function assertCanarySettlementBounds() {
  assert.deepEqual(await observePromiseSettlement(Promise.resolve("done"), 100), { settled: true, value: "done", error: null });
  const delayed = new Promise((resolve) => { setTimeout(() => resolve("later"), 30); });
  assert.deepEqual(await observePromiseSettlement(delayed, 5), { settled: false, value: undefined, error: null });
  assert.deepEqual(await observePromiseSettlement(delayed, 100), { settled: true, value: "later", error: null });
}

async function assertCanaryRecoveryDrain() {
  let resourceOpen = true;
  let mutatedAfterTimeout = false;
  let operationSettled = false;
  const recoverable = new Promise((resolve) => { setTimeout(() => {
    if (resourceOpen) mutatedAfterTimeout = true;
    operationSettled = true;
    resolve("drained");
  }, 30); });
  await assert.rejects(recoverAndDrainOperation(recoverable, {
    timeoutMs: 5,
    drainTimeoutMs: 100,
    label: "delayed browser operation",
    recover: async () => { resourceOpen = false; },
  }), /settled only after recovery/u);
  assert.equal(operationSettled, true);
  assert.equal(mutatedAfterTimeout, false);
}

async function assertCanaryFailedObservation() {
  const observationFailures = [];
  const failedHeaders = await captureCanaryObservation(Promise.reject(new Error("header observation failed")), observationFailures, "request headers");
  assert.deepEqual(failedHeaders, { ok: false, value: null });
  assert.deepEqual(observationFailures, [{ label: "request headers", error: "header observation failed" }]);
}
