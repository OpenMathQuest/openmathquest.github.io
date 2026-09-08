import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  activateCanaryHomeUpdate,
  beta1GradedSelectionAnswer,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  PLAYWRIGHT_CORE_VERSION,
  RETAINED_BETA1_COMPLETE_VALUE,
  RETAINED_BETA1_FRESH_START_NOTICE_SHA256,
  canaryWorkspaceRemovalAllowed,
  canaryBackendRequestViolation,
  canaryBrowserArguments,
  canaryWaitingCacheReady,
  openCanaryInstallHelp,
  observeCanaryRetainedFreshStartNotice,
  reloadCanaryCandidateFromBeta1,
  profileProcessSetSha256,
  sha256Bytes,
  validateCanaryBrowserArguments,
  validateCanaryBrowserTlsSecurity,
  validateCanaryRootScopeProof,
  waitForCanaryHomeUpdate,
} from "./lib/trusted-https-canary.mjs";
import {
  SHA40,
  SHA64,
  SOURCE_KEY,
  PROTECTED_KEY,
  RETAINED_GUARD_KEY,
  PROFILE_KEY,
  BETA1_CACHE,
  CANDIDATE_CACHE_PREFIX,
  BETA1_RUNTIME_PATHS,
  parseArguments,
  hashFileBytes,
  hashFile,
  run,
  verifyAndMaterializeSnapshots,
  snapshotServerState,
  startBackend,
  stopServer,
  reservePort,
  caddyfileText,
  waitFor,
  findUniqueFile,
  startCaddy,
  stopChild,
  IMPORT_DISPOSABLE_ROOT_SCRIPT,
  REMOVE_DISPOSABLE_ROOT_SCRIPT,
  portAccepting,
  assertLoopbackListener,
  inspectTrustedTls,
  persistCleanupIdentifiers,
  emptyChecks,
  checkedStep,
} from "./lib/trusted-https-canary-runner-platform.mjs";
import {
  findEdgeExecutable,
  profileBoundEdgeProcesses,
  profileProcessIdentityRecords,
  closePersistentContext,
  boundedBrowserOperation,
  boundedPageEvaluate,
  closeAuxiliaryContext,
  trackRequests,
  inspectExactCandidateCache,
  verifyDetachedHttpsResponses,
  caddyAccessLogProof,
  exactActiveReadiness,
  runtimeAllowlist,
} from "./lib/trusted-https-canary-runner-browser.mjs";

import { finishCanaryRun } from "./lib/trusted-https-canary-runner-report.mjs";

function createCanaryRunState(args) {
  return {
    candidateSha: String(args.candidate),
    outputPath: path.resolve(args.output),
    caddyPath: path.resolve(args.caddy),
    workRoot: path.resolve(args["work-root"]),
    checks: emptyChecks(),
    cleanup: [],
    cleanupFlags: {
      browserClosed: false,
      caddyStopped: false,
      backendStopped: false,
      certificateRemoved: false,
      profileRemoved: false,
      temporaryFilesRemoved: false,
      portClosed: false,
    },
    failure: null,
    snapshots: null,
    backendState: null,
    backend: null,
    caddy: null,
    context: null,
    networkContext: null,
    certificateThumbprint: null,
    rootCertificate: null,
    originPort: 0,
    tls: null,
    sourceBytes: null,
    protectedBytes: null,
    browserVersion: null,
    edgePath: null,
    edgeSha256: null,
    caddyExecutableSha256: null,
    browserRequests: [],
    requestTrackers: [],
    networkProof: null,
    waitingCacheProof: null,
    activeCacheProof: null,
    offlineCacheProof: null,
    repairedCacheProof: null,
    retiredSourceProjection: null,
    freshProtectedProjection: null,
    retainedFreshStartNoticeSha256: null,
    expectedFreshBytes: null,
    privacySummary: null,
    offlineProof: null,
    candidateMainFrameNavigations: [],
    beta1MainFrameNavigations: [],
    expectedCandidateReloadUrl: null,
    initialCandidateUrlSha256: null,
    remainingMatchingCertificateCount: null,
    observedProfileProcessCount: null,
    observedProfileProcessSetSha256: null,
    remainingProfileProcessCount: null,
    remainingProfileProcessSetSha256: null,
  };
}

function registerTemporaryFilesCleanup(state) {
  state.cleanup.push({ id: "temporary-files", run: async function removeTemporaryFiles() {
    if (!canaryWorkspaceRemovalAllowed(state.remainingProfileProcessCount)) return false;
    await rm(state.workRoot, { recursive: true, force: true });
    try {
      await stat(state.workRoot);
      state.cleanupFlags.temporaryFilesRemoved = false;
    } catch {
      state.cleanupFlags.temporaryFilesRemoved = true;
    }
    return state.cleanupFlags.temporaryFilesRemoved;
  } });
}

function registerProfileCleanup(state) {
  state.cleanup.push({ id: "profile", run: async function removeProfile() {
    if (!canaryWorkspaceRemovalAllowed(state.remainingProfileProcessCount)) return false;
    await rm(state.profilePath, { recursive: true, force: true });
    try {
      await stat(state.profilePath);
      state.cleanupFlags.profileRemoved = false;
    } catch {
      state.cleanupFlags.profileRemoved = true;
    }
    return state.cleanupFlags.profileRemoved;
  } });
}

function registerCertificateCleanup(state) {
  state.cleanup.push({ id: "certificate", run: async function removeCertificate() {
    if (state.certificateThumbprint) {
      const count = Number(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", REMOVE_DISPOSABLE_ROOT_SCRIPT], {
        env: { ...process.env, MQ_CANARY_CERT_THUMBPRINT: state.certificateThumbprint },
        timeoutMs: 30_000,
      }));
      state.remainingMatchingCertificateCount = count;
      state.cleanupFlags.certificateRemoved = count === 0;
    } else {
      state.remainingMatchingCertificateCount = null;
      state.cleanupFlags.certificateRemoved = false;
    }
    return state.cleanupFlags.certificateRemoved;
  } });
}

function registerBackendCleanup(state) {
  state.cleanup.push({ id: "backend", run: async function closeBackend() {
    state.cleanupFlags.backendStopped = await stopServer(state.backend?.server);
    state.backend = null;
    return state.cleanupFlags.backendStopped;
  } });
}

function registerCaddyCleanup(state) {
  state.cleanup.push({ id: "caddy", run: async function closeCaddy() {
    state.cleanupFlags.caddyStopped = await stopChild(state.caddy);
    state.caddy = null;
    state.cleanupFlags.portClosed = state.originPort ? !await portAccepting(state.originPort) : true;
    return state.cleanupFlags.caddyStopped && state.cleanupFlags.portClosed;
  } });
}

function registerBrowserCleanup(state) {
  state.cleanup.push({ id: "browser", run: async function closeBrowser() {
    if (state.networkContext) await closeAuxiliaryContext(state.networkContext, state.context, state.profilePath);
    state.networkContext = null;
    if (state.context) await closePersistentContext(state.context, state.profilePath);
    state.context = null;
    let lastRows = await profileBoundEdgeProcesses(state.profilePath);
    try {
      await waitFor(async () => {
        lastRows = await profileBoundEdgeProcesses(state.profilePath);
        return lastRows.length === 0;
      }, "Edge processes retained the disposable canary profile after Playwright close", 10_000, 200);
    } catch {
      const lingering = await profileProcessIdentityRecords(lastRows);
      state.remainingProfileProcessCount = lingering.length;
      state.remainingProfileProcessSetSha256 = profileProcessSetSha256(lingering);
      state.cleanupFlags.browserClosed = false;
      return false;
    }
    state.remainingProfileProcessCount = 0;
    state.remainingProfileProcessSetSha256 = EMPTY_PROFILE_PROCESS_SET_SHA256;
    state.cleanupFlags.browserClosed = true;
    return true;
  } });
}

async function prepareCanaryWorkspace(state) {
  if (!SHA40.test(state.candidateSha)) throw new Error("Candidate SHA must be 40 lowercase hexadecimal characters.");
  if (process.platform !== "win32") throw new Error("The trusted-HTTPS canary runs only on disposable hosted Windows.");
  if (process.env.GITHUB_REPOSITORY !== "OpenMathQuest/openmathquest.github.io"
      || process.env.GITHUB_REF !== "refs/heads/main"
      || process.env.GITHUB_SHA !== state.candidateSha
      || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
      || !process.env.ImageOS
      || !process.env.ImageVersion) {
    throw new Error("Canary boundary requires the exact public protected-main SHA on GitHub-hosted Windows.");
  }
  assert.equal(process.env.MQ_CADDY_ARCHIVE_SHA256, CADDY_ARCHIVE_SHA256);
  assert.equal(process.env.MQ_CADDY_ARCHIVE_SHA512, CADDY_ARCHIVE_SHA512);
  await mkdir(state.workRoot, { recursive: true });
}

async function checkBeta1TagAndRuntimeIdentity(state) {
  await checkedStep(state.checks, "BETA1_TAG_AND_RUNTIME_IDENTITY", async () => {
    state.snapshots = await verifyAndMaterializeSnapshots(state.candidateSha, path.join(state.workRoot, "snapshots"));
  }, "Immutable Beta 1 and frozen-candidate runtime blobs matched their closed Git identities.");
}

async function verifyCanaryHostToolchain(state) {
  const caddyVersionOutput = await run(state.caddyPath, ["version"]);
  assert.match(caddyVersionOutput, new RegExp(`^v${CADDY_VERSION.replaceAll(".", "\\.")}(?:\\s|$)`, "u"));
  state.caddyExecutableSha256 = await hashFile(state.caddyPath);
  state.edgePath = await findEdgeExecutable();
  state.edgeSha256 = await hashFile(state.edgePath);
  const playwrightPackage = JSON.parse(await readFile(path.join(process.cwd(), "node_modules", "playwright-core", "package.json"), "utf8"));
  assert.equal(playwrightPackage.version, PLAYWRIGHT_CORE_VERSION);
  assert.equal(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent());if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Hosted canary requires the disposable Windows administrator boundary.'};'ADMINISTRATOR'"], { timeoutMs: 15_000 }), "ADMINISTRATOR");
}

async function startCanaryLoopbackServers(state) {
  state.backendState = snapshotServerState(state.snapshots.beta1);
  state.backend = await startBackend(state.backendState);
  state.originPort = await reservePort();
  state.caddyStorage = path.join(state.workRoot, "caddy-storage");
  state.caddyLog = path.join(state.workRoot, "caddy-access.jsonl");
  state.caddyConfig = path.join(state.workRoot, "Caddyfile");
  await mkdir(state.caddyStorage, { recursive: true });
  await writeFile(state.caddyConfig, caddyfileText({ port: state.originPort, backendPort: state.backend.port, storageRoot: state.caddyStorage, logPath: state.caddyLog }), "utf8");
  state.caddy = await startCaddy({ caddyPath: state.caddyPath, configPath: state.caddyConfig, port: state.originPort });
  await persistCleanupIdentifiers(state.workRoot, { processIds: [state.caddy.child.pid], originPort: state.originPort });
  await assertLoopbackListener(state.originPort, state.caddy.child.pid);
}

async function installAndVerifyCanaryCertificate(state) {
  const rootPath = await waitFor(() => findUniqueFile(state.caddyStorage, "root.crt").catch(() => null), "Caddy did not create one disposable local root certificate");
  state.rootCertificate = new X509Certificate(await readFile(rootPath));
  state.certificateThumbprint = state.rootCertificate.fingerprint.replaceAll(":", "");
  await persistCleanupIdentifiers(state.workRoot, { processIds: [state.caddy.child.pid], certificateThumbprint: state.certificateThumbprint, originPort: state.originPort });
  assert.equal(Number(await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", IMPORT_DISPOSABLE_ROOT_SCRIPT], {
    env: { ...process.env, MQ_CANARY_CERT_PATH: rootPath, MQ_CANARY_CERT_THUMBPRINT: state.certificateThumbprint },
    timeoutMs: 30_000,
  })), 1);
  state.tls = await inspectTrustedTls(state.originPort);
  assert.equal(state.tls.subjectName, "localhost");
  assert.match(state.tls.issuer, /Caddy Local Authority/iu);
  assert.match(state.tls.sha256, SHA64);
  assert.ok(["Tls12", "Tls13"].includes(state.tls.protocol));
}

async function startTrustedCanaryHost(state) {
  await verifyCanaryHostToolchain(state);
  await startCanaryLoopbackServers(state);
  await installAndVerifyCanaryCertificate(state);
}

async function launchBeta1CanaryBrowser(state) {
  state.origin = `https://localhost:${state.originPort}/`;
  state.browserArgs = canaryBrowserArguments(state.profilePath);
  const argumentReview = validateCanaryBrowserArguments(state.browserArgs);
  assert.equal(argumentReview.valid, true, argumentReview.issues.join("; "));
  state.context = await chromium.launchPersistentContext(state.profilePath, {
    executablePath: state.edgePath,
    headless: true,
    args: state.browserArgs,
    serviceWorkers: "allow",
    viewport: { width: 1280, height: 800 },
    timeout: 30_000,
  });
  state.context.setDefaultTimeout(30_000);
  state.context.setDefaultNavigationTimeout(30_000);
}

async function observeBeta1CanaryBrowser(state) {
  const observedProfileProcesses = await waitFor(async () => {
    const rows = await profileBoundEdgeProcesses(state.profilePath);
    return rows.length ? rows : null;
  }, "The exact disposable Edge profile had no independently observable process", 10_000);
  const observedProfileIdentities = await profileProcessIdentityRecords(observedProfileProcesses);
  assert.ok(observedProfileIdentities.every((record) => record.executableSha256 === state.edgeSha256));
  state.observedProfileProcessCount = observedProfileIdentities.length;
  state.observedProfileProcessSetSha256 = profileProcessSetSha256(observedProfileIdentities);
  state.requestTrackers.push(await trackRequests(state.context, state.browserRequests, state.context, state.profilePath));
  state.browserVersion = state.context.browser()?.version() || null;
  assert.match(String(state.browserVersion), /^\d+\.\d+\.\d+\.\d+$/u);
  state.beta1Page = state.context.pages()[0] || await boundedBrowserOperation(state.context.newPage(), state.context, state.profilePath, "Playwright Beta 1 page creation");
  state.retainedBeta1Page = null;
  state.firstResponse = await state.beta1Page.goto(state.origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

async function openBeta1CanaryPage(state) {
  await launchBeta1CanaryBrowser(state);
  await observeBeta1CanaryBrowser(state);
}

async function checkHttpsTrustedNoBypass(state) {
  await checkedStep(state.checks, "HTTPS_TRUSTED_NO_BYPASS", async () => {
    assert.equal(state.firstResponse?.status(), 200);
    const security = await boundedBrowserOperation(state.firstResponse.securityDetails(), state.context, state.profilePath, "Playwright TLS security-details observation");
    const tlsSecurity = validateCanaryBrowserTlsSecurity(security, state.tls);
    assert.equal(tlsSecurity.valid, true, tlsSecurity.issues.join("; "));
    assert.equal(validateCanaryBrowserArguments(state.browserArgs).valid, true);
  }, "Edge trusted Caddy's disposable localhost certificate with no insecure browser flags.");
}

async function checkRootScopeExact(state) {
  await checkedStep(state.checks, "ROOT_SCOPE_EXACT", async () => {
    const manifestRecord = state.snapshots.beta1.files.get("/manifest.webmanifest");
    assert.ok(manifestRecord);
    const manifest = JSON.parse(manifestRecord.bytes.toString("utf8"));
    const scope = await boundedPageEvaluate(state.beta1Page, state.context, state.profilePath, async () => {
      const manifestLink = document.querySelector('link[rel="manifest"]');
      const registration = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Beta 1 service-worker readiness timed out.")), 20_000);
        navigator.serviceWorker.ready.then(
          (value) => { clearTimeout(timer); resolve(value); },
          (error) => { clearTimeout(timer); reject(error); },
        );
      });
      return { manifestHref: manifestLink?.href || "", workerScope: registration.scope };
    });
    const scopeProof = validateCanaryRootScopeProof({ manifest, ...scope, origin: state.origin });
    assert.equal(scopeProof.valid, true, scopeProof.issues.join("; "));
  }, "Manifest and service-worker scope remained the exact same-origin root scope.");
}

async function checkBeta1InstallCacheComplete(state) {
  await checkedStep(state.checks, "BETA1_INSTALL_CACHE_COMPLETE", async () => {
    await state.beta1Page.waitForFunction(async (cacheName) => {
      const names = await caches.keys();
      return Boolean(navigator.serviceWorker.controller) && names.includes(cacheName);
    }, BETA1_CACHE, { timeout: 30_000 });
    const cached = await boundedPageEvaluate(state.beta1Page, state.context, state.profilePath, async (cacheName) => {
      const cache = await caches.open(cacheName);
      return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
    }, BETA1_CACHE);
    for (const required of ["/", ...BETA1_RUNTIME_PATHS.filter((item) => item !== "sw.js").map((item) => `/${item}`)]) assert.ok(cached.includes(required), required);
  }, "Beta 1 installed its complete historical offline cache before the update began.");
}

async function checkBeta1SyntheticStateSeeded(state) {
  await checkedStep(state.checks, "BETA1_SYNTHETIC_STATE_SEEDED", async () => {
    await state.beta1Page.locator('[data-action="name-skip"]').click();
    const seeded = await boundedPageEvaluate(state.beta1Page, state.context, state.profilePath, ({ sourceKey, profileKey, selectionAnswerSource }) => {
      const E = MathQuestEngine;
      const gradedSelectionAnswer = (0, eval)(`(${selectionAnswerSource})`);
      let state = E.createInitialState(30_000);
      state.earnedLevel = 2;
      state.settings.grownUpPracticeCap = 17;
      state.settings.grownUpSoftTimeCapMs = 600_000;
      state.settings.speechRate = 0.9;
      state.settings.soundVolume = 0.4;
      state.seed = 2_147_483_647;
      const skill = E.SKILLS[0];
      let lastAttempt = null;
      for (let index = 0; index < 3; index += 1) {
        const question = E.makeQuestion({ skillId: skill.skillId, tier: index === 2 ? "HARD/TARGET" : "EASY", representation: "PICTORIAL", seed: 314159, ordinal: 2 + index, scheduledReview: index > 0, coldTest: true, theme: "forest" });
        const answer = question.inputClass === "SELECTION"
          ? gradedSelectionAnswer(question, E.gradeAnswer)
          : String(question.answer.value);
        const attempt = E.submitAnswer(question, answer, { promptFinishedAt: 1_000, submittedAt: 5_000 + index * 100, manipulationMs: 250, replayMs: 100, idleMs: 50 + index, hintUsed: false, selectionEvents: [], modelUsed: true, sessionId: "synthetic-beta1-session", playDay: 30_000 });
        if (!attempt.firstAnswerCorrect || !attempt.validTelemetry) throw new Error("Synthetic Beta 1 attempt was not a valid clean witness.");
        state = E.applyAttempt(state, attempt).state;
        lastAttempt = attempt;
      }
      state.feedbackHistory.push({ stage: lastAttempt.stage, branch: lastAttempt.feedbackClass, line: "Synthetic feedback preservation witness.", sessionId: lastAttempt.sessionId });
      state = E.completeSession(state, { sessionId: lastAttempt.sessionId, playDay: 30_000, level: 1, servedPracticeCount: 3, classifications: ["SYNTHETIC_CANARY"], endedReason: "NATURAL", overrunMs: 0, overrunCauses: [] });
      const projection = ({ schemaVersion: _schemaVersion, ...legacy }) => legacy;
      const bytes = E.exportState(state);
      localStorage.setItem(sourceKey, bytes);
      localStorage.setItem(profileKey, JSON.stringify({ schemaVersion: 1, mode: "anonymous", name: "" }));
      return { bytes, projection: projection(JSON.parse(bytes)) };
    }, { sourceKey: SOURCE_KEY, profileKey: PROFILE_KEY, selectionAnswerSource: beta1GradedSelectionAnswer.toString() });
    state.sourceBytes = seeded.bytes;
    state.retiredSourceProjection = seeded.projection;
    const source = JSON.parse(state.sourceBytes);
    assert.equal(source.schemaVersion, 2);
    assert.equal(source.earnedLevel, 2);
    assert.equal(source.practiceCountByDay["30000"], 3);
    assert.equal(source.sessionLog.length, 1);
    assert.equal(source.feedbackHistory.length, 1);
    assert.equal(Object.values(source.skills)[0]?.evidence?.length, 3);
    const profile = JSON.parse(await boundedPageEvaluate(state.beta1Page, state.context, state.profilePath, (key) => localStorage.getItem(key), PROFILE_KEY));
    assert.deepEqual(profile, { schemaVersion: 1, mode: "anonymous", name: "" });
  }, "A valid anonymous Beta 1 save with distinctive settings, skill evidence, spacing, daily count, feedback, session log, cold window, latency, and seed fields was stored locally.");
}

async function checkBeta1OfflineReload(state) {
  await checkedStep(state.checks, "BETA1_OFFLINE_RELOAD", async () => {
    await boundedBrowserOperation(state.context.setOffline(true), state.context, state.profilePath, "Playwright offline-mode activation");
    await state.beta1Page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 });
    assert.equal(await boundedBrowserOperation(state.beta1Page.title(), state.context, state.profilePath, "Playwright document-title observation"), "Math Quest");
    assert.equal(await boundedPageEvaluate(state.beta1Page, state.context, state.profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.1");
    await boundedBrowserOperation(state.context.setOffline(false), state.context, state.profilePath, "Playwright offline-mode release");
    state.retainedBeta1Page = await boundedBrowserOperation(state.context.newPage(), state.context, state.profilePath, "Playwright retained Beta 1 page creation");
    await state.retainedBeta1Page.goto(state.origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await state.retainedBeta1Page.waitForFunction(() => globalThis.MathQuestEngine?.CONSTANTS?.PRODUCT_VERSION === "1.0.0-beta.1", null, { timeout: 30_000 });
  }, "Beta 1 reloaded from its installed cache while Playwright network emulation was offline.");
}

async function checkSameOriginRuntimeSwitch(state) {
  await checkedStep(state.checks, "SAME_ORIGIN_RUNTIME_SWITCH", async () => {
    state.backendState.active = state.snapshots.candidate;
    assert.equal(state.beta1Page.url().startsWith(state.origin), true);
    state.networkContext = await boundedBrowserOperation(state.context.browser().newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } }), state.context, state.profilePath, "Playwright auxiliary context creation");
    state.networkContext.setDefaultTimeout(30_000);
    state.networkContext.setDefaultNavigationTimeout(30_000);
    state.requestTrackers.push(await trackRequests(state.networkContext, state.browserRequests, state.context, state.profilePath));
    state.networkProof = await verifyDetachedHttpsResponses({ origin: state.origin, context: state.networkContext, snapshots: state.snapshots, persistentContext: state.context, profilePath: state.profilePath });
    await closeAuxiliaryContext(state.networkContext, state.context, state.profilePath);
    state.networkContext = null;
  }, "The backend atomically switched Beta 1 to Beta 9 without changing scheme, host, port, or scope.");
}

async function openCandidateCanaryPage(state) {
  state.candidatePage = await boundedBrowserOperation(
    reloadCanaryCandidateFromBeta1(state.beta1Page, "1.0.0-beta.9"),
    state.context,
    state.profilePath,
    "Playwright same-tab Beta 1 to Beta 9 candidate transition",
  );
}

async function checkCandidateWaitingCacheReady(state) {
  await checkedStep(state.checks, "CANDIDATE_WAITING_CACHE_READY", async () => {
    const expectedCacheName = `${state.snapshots.manifest.cacheName}-${state.snapshots.identity.candidateReleaseManifestSha256}`;
    await state.candidatePage.waitForFunction(canaryWaitingCacheReady, {
      expectedCacheName,
      allowedCacheNames: [BETA1_CACHE, expectedCacheName],
      stableMs: 750,
    }, { timeout: 40_000, polling: 100 });
    state.waitingCacheProof = await inspectExactCandidateCache(state.candidatePage, state.snapshots, { allowBeta1: true, persistentContext: state.context, profilePath: state.profilePath });
    const retainedNotice = await observeCanaryRetainedFreshStartNotice(state.candidatePage);
    state.retainedFreshStartNoticeSha256 = sha256Bytes(retainedNotice);
    assert.equal(state.retainedFreshStartNoticeSha256, RETAINED_BETA1_FRESH_START_NOTICE_SHA256);
  }, "The original Beta 1 page deliberately reloaded into the exact Beta 9 candidate, visibly explained the fresh start to the grown-up, acquired the modern writer lease, reached Home, and observed a waiting worker only after every detached-manifest cache entry independently matched status, MIME, length, and SHA-256 with no staging or extra candidate cache.");
}

async function checkCandidateRealUiActivation(state) {
  await checkedStep(state.checks, "CANDIDATE_REAL_UI_ACTIVATION", async () => {
    state.expectedCandidateReloadUrl = state.candidatePage.url();
    state.initialCandidateUrlSha256 = hashFileBytes(Buffer.from(state.expectedCandidateReloadUrl, "utf8"));
    const initialDocumentIdentity = await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, () => ({ timeOrigin: performance.timeOrigin, url: location.href }));
    const recordCandidateNavigation = (frame) => {
      if (frame === state.candidatePage.mainFrame()) state.candidateMainFrameNavigations.push(frame.url());
    };
    const recordBeta1Navigation = (frame) => {
      if (frame === state.retainedBeta1Page.mainFrame()) state.beta1MainFrameNavigations.push(frame.url());
    };
    state.candidatePage.on("framenavigated", recordCandidateNavigation);
    state.retainedBeta1Page.on("framenavigated", recordBeta1Navigation);
    await activateCanaryHomeUpdate(state.candidatePage);
    await state.candidatePage.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration("./");
      return Boolean(navigator.serviceWorker.controller) && registration?.waiting === null;
    }, null, { timeout: 30_000 });
    await waitForCanaryHomeUpdate(state.candidatePage, "1.0.0-beta.9");
    await state.candidatePage.waitForFunction((priorTimeOrigin) => performance.timeOrigin !== priorTimeOrigin, initialDocumentIdentity.timeOrigin, { timeout: 30_000 });
    state.candidatePage.off("framenavigated", recordCandidateNavigation);
    assert.deepEqual(state.candidateMainFrameNavigations, [state.expectedCandidateReloadUrl]);
    assert.deepEqual(state.beta1MainFrameNavigations, []);
  }, "The visible grown-up Apply update control activated the exact worker and caused only its one reviewed safe-boundary self-reload; the retained tab was not inspected, probed, or navigated.");
}

async function checkRetainedBeta1ExplicitReload(state) {
  await checkedStep(state.checks, "RETAINED_BETA1_EXPLICIT_RELOAD", async () => {
    assert.deepEqual(state.beta1MainFrameNavigations, []);
    assert.equal(await boundedPageEvaluate(state.retainedBeta1Page, state.context, state.profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.1");
    await state.retainedBeta1Page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await state.retainedBeta1Page.waitForFunction(() => globalThis.MathQuestEngine?.CONSTANTS?.PRODUCT_VERSION === "1.0.0-beta.9", null, { timeout: 30_000 });
    assert.equal(await boundedPageEvaluate(state.retainedBeta1Page, state.context, state.profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.9");
    assert.deepEqual(state.beta1MainFrameNavigations, [state.origin]);
    state.retainedBeta1Page.removeAllListeners("framenavigated");
  }, "The retained Beta 1 tab remained untouched until an explicit user-equivalent reload, which then opened the verified current shell without a recovery query.");
}

async function checkResponsiveCandidateTabNotForced(state) {
  await checkedStep(state.checks, "RESPONSIVE_CANDIDATE_TAB_NOT_FORCED", async () => {
    assert.equal(new URL(state.candidatePage.url()).searchParams.has("legacy-recovery"), false);
    assert.equal(await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, () => MathQuestEngine.CONSTANTS.PRODUCT_VERSION), "1.0.0-beta.9");
  }, "The responsive Beta 9 tab remained on its safe-boundary current route.");
}

async function checkBeta1SourceBytesUnchanged(state) {
  await checkedStep(state.checks, "BETA1_SOURCE_BYTES_UNCHANGED", async () => {
    assert.equal(await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), state.sourceBytes);
  }, "The original Beta 1 localStorage bytes remained byte-for-byte unchanged.");
}

async function checkRetiredBeta1PreservedFreshStart(state) {
  await checkedStep(state.checks, "RETIRED_BETA1_PRESERVED_FRESH_START", async () => {
    await state.candidatePage.waitForFunction((key) => Boolean(localStorage.getItem(key)), PROTECTED_KEY, { timeout: 20_000 });
    const fresh = await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, ({ protectedKey, guardKey }) => {
      const bytes = localStorage.getItem(protectedKey);
      const state = JSON.parse(bytes);
      const expectedBytes = MathQuestEngine.exportState(MathQuestEngine.createInitialState(state.maxSeenPlayDay));
      const { schemaVersion: _schemaVersion, ...projection } = state;
      return { bytes, state, expectedBytes, projection, marker: localStorage.getItem(guardKey) };
    }, { protectedKey: PROTECTED_KEY, guardKey: RETAINED_GUARD_KEY });
    state.protectedBytes = fresh.bytes;
    state.expectedFreshBytes = fresh.expectedBytes;
    state.freshProtectedProjection = fresh.projection;
    assert.equal(state.protectedBytes, state.expectedFreshBytes, "protected Beta 9 progress must be the exact canonical initial state");
    assert.equal(fresh.state.schemaVersion, 3);
    assert.equal(fresh.state.earnedLevel, 1);
    assert.equal(Object.values(fresh.state.practiceCountByDay).reduce((sum, count) => sum + count, 0), 0);
    assert.equal(fresh.marker, RETAINED_BETA1_COMPLETE_VALUE);
    assert.equal(state.retainedFreshStartNoticeSha256, RETAINED_BETA1_FRESH_START_NOTICE_SHA256);
    assert.equal(await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), state.sourceBytes);
  }, "The incompatible Beta 1 save remained byte-identical, while Beta 9 committed its exact canonical fresh state, displayed the exact grown-up notice, and wrote a durable retained-source marker without transferring mastery, evidence, settings, logs, or counts.");
}

async function checkCandidateActiveCacheReady(state) {
  await checkedStep(state.checks, "CANDIDATE_ACTIVE_CACHE_READY", async () => {
    await openCanaryInstallHelp(state.candidatePage);
    await state.candidatePage.locator('[data-action="pwa-retry"]').click();
    await state.candidatePage.locator('[data-pwa-status]').filter({ hasText: "Ready for an offline check" }).waitFor({ state: "visible", timeout: 20_000 });
    const controllerState = await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, () => ({ controller: navigator.serviceWorker.controller?.scriptURL || null }));
    assert.equal(controllerState.controller, `${state.origin}sw.js`);
    state.activeCacheProof = await inspectExactCandidateCache(state.candidatePage, state.snapshots, { allowBeta1: true, persistentContext: state.context, profilePath: state.profilePath });
    assert.equal(await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), state.sourceBytes);
    assert.equal(await boundedPageEvaluate(state.candidatePage, state.context, state.profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), state.protectedBytes);
  }, "The activated Beta 9 worker independently matched the exact detached cache and controller identity, retained the Beta 1 cache for the still-open older tab, excluded staging or unrecognized caches, and left both progress records unchanged.");
}

async function stopOnlineCanaryHost(state) {
  process.stdout.write("[canary] START ONLINE_TO_OFFLINE_SHUTDOWN\n");
  await closePersistentContext(state.context, state.profilePath);
  state.context = null;
  state.cleanupFlags.browserClosed = true;
  state.stoppedBackendPort = state.backend.port;
  await stopChild(state.caddy);
  state.caddy = null;
  await stopServer(state.backend.server);
  state.backend = null;
  assert.equal(await portAccepting(state.originPort), false);
  assert.equal(await portAccepting(state.stoppedBackendPort), false);
  process.stdout.write("[canary] PASS ONLINE_TO_OFFLINE_SHUTDOWN\n");
  state.requestsBeforeColdStart = state.backendState.requests.length;
}

async function launchOfflineCanaryPage(state) {
  state.context = await chromium.launchPersistentContext(state.profilePath, {
    executablePath: state.edgePath,
    headless: true,
    args: canaryBrowserArguments(state.profilePath),
    serviceWorkers: "allow",
    viewport: { width: 1280, height: 800 },
    timeout: 30_000,
  });
  state.context.setDefaultTimeout(30_000);
  state.context.setDefaultNavigationTimeout(30_000);
  state.requestTrackers.push(await trackRequests(state.context, state.browserRequests, state.context, state.profilePath));
  const offlinePage = state.context.pages()[0] || await boundedBrowserOperation(state.context.newPage(), state.context, state.profilePath, "Playwright offline page creation");
  assert.equal(await portAccepting(state.originPort), false);
  assert.equal(await portAccepting(state.stoppedBackendPort), false);
  const offlineResponse = await offlinePage.goto(state.origin, { waitUntil: "domcontentloaded", timeout: 20_000 });
  assert.equal(offlineResponse?.fromServiceWorker(), true);
  await waitForCanaryHomeUpdate(offlinePage, "1.0.0-beta.9");
  assert.equal(await boundedPageEvaluate(offlinePage, state.context, state.profilePath, () => navigator.serviceWorker.controller?.scriptURL || null), `${state.origin}sw.js`);
  return offlinePage;
}

async function observeOfflineCanaryPage(state, offlinePage) {
  const offlineReadiness = await exactActiveReadiness(offlinePage, state.snapshots, state.context, state.profilePath);
  state.offlineCacheProof = await inspectExactCandidateCache(offlinePage, state.snapshots, { allowBeta1: true, persistentContext: state.context, profilePath: state.profilePath });
  assert.equal(await boundedPageEvaluate(offlinePage, state.context, state.profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), state.sourceBytes);
  assert.equal(await boundedPageEvaluate(offlinePage, state.context, state.profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), state.protectedBytes);
  assert.equal(state.backendState.requests.length, state.requestsBeforeColdStart);
  assert.equal(await portAccepting(state.originPort), false);
  assert.equal(await portAccepting(state.stoppedBackendPort), false);
  state.offlineProof = Object.freeze({
    responseFromServiceWorker: true,
    originPortClosed: true,
    backendPortClosed: true,
    controllerScriptUrlSha256: hashFileBytes(Buffer.from(`${state.origin}sw.js`, "utf8")),
    readinessRelease: offlineReadiness.release,
    readinessBuildId: offlineReadiness.buildId,
    readinessCacheIdentity: offlineReadiness.cacheIdentity,
  });
}

async function checkCandidateOfflineColdRelaunch(state) {
  await checkedStep(state.checks, "CANDIDATE_OFFLINE_COLD_RELAUNCH", async () => {
    const offlinePage = await launchOfflineCanaryPage(state);
    await observeOfflineCanaryPage(state, offlinePage);
  }, "A new Edge process cold-launched through a real service-worker response while both ports stayed closed, then independently proved the exact active worker/readiness/cache identity and unchanged source/protected progress.");
}

async function restartCanaryHost(state) {
  state.backend = await startBackend(state.backendState);
  const restartedBackendPort = state.backend.port;
  await writeFile(state.caddyConfig, caddyfileText({ port: state.originPort, backendPort: restartedBackendPort, storageRoot: state.caddyStorage, logPath: state.caddyLog }), "utf8");
  state.caddy = await startCaddy({ caddyPath: state.caddyPath, configPath: state.caddyConfig, port: state.originPort });
  await persistCleanupIdentifiers(state.workRoot, { processIds: [state.caddy.child.pid], certificateThumbprint: state.certificateThumbprint, originPort: state.originPort });
  await assertLoopbackListener(state.originPort, state.caddy.child.pid);
  state.activePage = state.context.pages()[0];
}

async function checkCacheCorruptionDetected(state) {
  await checkedStep(state.checks, "CACHE_CORRUPTION_DETECTED", async () => {
    const deleted = await boundedPageEvaluate(state.activePage, state.context, state.profilePath, async (prefix) => {
      const name = (await caches.keys()).find((item) => item.startsWith(prefix) && !item.endsWith("-staging"));
      if (!name) return false;
      return (await caches.open(name)).delete("./index.html", { ignoreSearch: true });
    }, CANDIDATE_CACHE_PREFIX);
    assert.equal(deleted, true);
    await openCanaryInstallHelp(state.activePage);
    await state.activePage.locator('[data-action="pwa-retry"]').click();
    await state.activePage.locator('[data-pwa-status]').filter({ hasText: "Recovery needed" }).waitFor({ state: "visible", timeout: 20_000 });
    await state.activePage.locator('[data-action="pwa-repair"]').waitFor({ state: "visible", timeout: 10_000 });
  }, "Deleting one required entry caused the shipped readiness UI to fail closed into Recovery.");
}

async function checkTransactionalRepairSucceeded(state) {
  await checkedStep(state.checks, "TRANSACTIONAL_REPAIR_SUCCEEDED", async () => {
    const before = await boundedPageEvaluate(state.activePage, state.context, state.profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY);
    await state.activePage.locator('[data-action="pwa-repair"]').click();
    await state.activePage.locator('[data-pwa-status]').filter({ hasText: "Ready for an offline check" }).waitFor({ state: "visible", timeout: 30_000 });
    const after = await boundedPageEvaluate(state.activePage, state.context, state.profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY);
    assert.equal(after, before);
    assert.equal(after, state.protectedBytes);
    const cacheState = await boundedPageEvaluate(state.activePage, state.context, state.profilePath, async (prefix) => {
      const names = await caches.keys();
      const active = names.filter((name) => name.startsWith(prefix) && !name.endsWith("-staging"));
      const staging = names.filter((name) => name.endsWith("-staging"));
      const hasIndex = active.length === 1 && Boolean(await (await caches.open(active[0])).match("./index.html", { ignoreSearch: true }));
      return { active, staging, hasIndex };
    }, CANDIDATE_CACHE_PREFIX);
    assert.equal(cacheState.active.length, 1);
    assert.equal(cacheState.staging.length, 0);
    assert.equal(cacheState.hasIndex, true);
    state.repairedCacheProof = await inspectExactCandidateCache(state.activePage, state.snapshots, { allowBeta1: true, persistentContext: state.context, profilePath: state.profilePath });
    await exactActiveReadiness(state.activePage, state.snapshots, state.context, state.profilePath);
    assert.equal(await boundedPageEvaluate(state.activePage, state.context, state.profilePath, (key) => localStorage.getItem(key), SOURCE_KEY), state.sourceBytes);
    assert.equal(await boundedPageEvaluate(state.activePage, state.context, state.profilePath, (key) => localStorage.getItem(key), PROTECTED_KEY), state.protectedBytes);
  }, "The visible Repair control independently restored the exact detached cache transactionally without changing either source or protected progress.");
}

async function checkRuntimeRequestAllowlist(state) {
  await checkedStep(state.checks, "RUNTIME_REQUEST_ALLOWLIST", async () => {
    await Promise.all(state.requestTrackers.flatMap((tracker) => tracker.tasks));
    assert.deepEqual(state.requestTrackers.flatMap((tracker) => tracker.observationFailures), []);
    const allowed = runtimeAllowlist(state.snapshots);
    const external = state.browserRequests.filter((item) => item.origin !== state.origin.slice(0, -1));
    const unexpected = state.browserRequests.filter((item) => item.origin === state.origin.slice(0, -1) && (
      !allowed.has(item.pathname)
      || item.method !== "GET"
      || item.search !== ""
      || item.hasCredentials
      || item.bodyBytes !== 0
      || item.cookieHeader
      || item.authorizationHeader
      || item.sensitiveHeader
    ));
    assert.deepEqual(external, []);
    assert.deepEqual(unexpected, []);
    const backendViolations = state.backendState.requests.flatMap((item, requestIndex) => {
      const finding = canaryBackendRequestViolation(item, allowed);
      return finding ? [{ requestIndex, ...finding }] : [];
    });
    if (backendViolations.length > 0) {
      throw new Error(`Backend request violation count=${backendViolations.length} first=${JSON.stringify(backendViolations[0])}`);
    }
    const queryStringCount = state.browserRequests.filter((item) => item.search !== "").length;
    const allowedRecoveryQueryCount = 0;
    const channelCounts = state.requestTrackers.reduce((sum, tracker) => ({
      webSocket: sum.webSocket + tracker.channelCounts.webSocket,
      eventSource: sum.eventSource + tracker.channelCounts.eventSource,
      webTransport: sum.webTransport + tracker.channelCounts.webTransport,
      sendBeacon: sum.sendBeacon + tracker.channelCounts.sendBeacon,
    }), { webSocket: 0, eventSource: 0, webTransport: 0, sendBeacon: 0 });
    state.privacySummary = {
      requestMetadataSha256: hashFileBytes(Buffer.from(`${JSON.stringify(state.browserRequests.map((item) => ({ ...item })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))))}\n`, "utf8")),
      unexpectedRequestCount: unexpected.length,
      externalRequestCount: external.length,
      queryStringCount,
      allowedRecoveryQueryCount,
      unexpectedQueryStringCount: queryStringCount - allowedRecoveryQueryCount,
      requestBodyCount: state.browserRequests.filter((item) => item.bodyBytes > 0).length,
      cookieHeaderCount: state.browserRequests.filter((item) => item.cookieHeader).length,
      authorizationHeaderCount: state.browserRequests.filter((item) => item.authorizationHeader).length,
      sensitiveHeaderCount: state.browserRequests.filter((item) => item.sensitiveHeader).length,
      webSocketCount: channelCounts.webSocket,
      eventSourceCount: channelCounts.eventSource,
      otherActiveChannelCount: channelCounts.webTransport + channelCounts.sendBeacon,
    };
    assert.deepEqual({ ...state.privacySummary, requestMetadataSha256: "verified" }, {
      requestMetadataSha256: "verified",
      unexpectedRequestCount: 0,
      externalRequestCount: 0,
      queryStringCount: 0,
      allowedRecoveryQueryCount: 0,
      unexpectedQueryStringCount: 0,
      requestBodyCount: 0,
      cookieHeaderCount: 0,
      authorizationHeaderCount: 0,
      sensitiveHeaderCount: 0,
      webSocketCount: 0,
      eventSourceCount: 0,
      otherActiveChannelCount: 0,
    });
    state.networkProof = Object.freeze({ ...state.networkProof, caddyAccessLogSha256: await caddyAccessLogProof(state.caddyLog, state.backendState.requests) });
  }, "Every request retained its URL query, method, type, body digest, and sensitive-header presence, with no query-bearing request, external origin, child data, upload body, credential, WebSocket, EventSource, WebTransport, or beacon channel.");
}

async function verifyCanaryExecutableBytes(state) {
  const caddyShaAfter = await hashFile(state.caddyPath);
  const edgeShaAfter = await hashFile(state.edgePath);
  assert.equal(caddyShaAfter, state.caddyExecutableSha256);
  assert.equal(edgeShaAfter, state.edgeSha256);
}

const CANARY_PHASES = Object.freeze([
  checkBeta1TagAndRuntimeIdentity,
  startTrustedCanaryHost,
  openBeta1CanaryPage,
  checkHttpsTrustedNoBypass,
  checkRootScopeExact,
  checkBeta1InstallCacheComplete,
  checkBeta1SyntheticStateSeeded,
  checkBeta1OfflineReload,
  checkSameOriginRuntimeSwitch,
  openCandidateCanaryPage,
  checkCandidateWaitingCacheReady,
  checkCandidateRealUiActivation,
  checkRetainedBeta1ExplicitReload,
  checkResponsiveCandidateTabNotForced,
  checkBeta1SourceBytesUnchanged,
  checkRetiredBeta1PreservedFreshStart,
  checkCandidateActiveCacheReady,
  stopOnlineCanaryHost,
  checkCandidateOfflineColdRelaunch,
  restartCanaryHost,
  checkCacheCorruptionDetected,
  checkTransactionalRepairSucceeded,
  checkRuntimeRequestAllowlist,
  verifyCanaryExecutableBytes,
]);

async function executeCanaryPhases(state) {
  for (const phase of CANARY_PHASES) await phase(state);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const state = createCanaryRunState(args);
  await prepareCanaryWorkspace(state);
  registerTemporaryFilesCleanup(state);
  state.profilePath = path.join(state.workRoot, "edge-profile");
  registerProfileCleanup(state);
  registerCertificateCleanup(state);
  registerBackendCleanup(state);
  registerCaddyCleanup(state);
  registerBrowserCleanup(state);
  try {
    await executeCanaryPhases(state);
  } catch (error) {
    state.failure = error;
  }
  await finishCanaryRun(state);
}

main().catch((error) => {
  process.stderr.write(`Trusted-HTTPS canary failed: ${String(error?.stack || error)}\n`);
  process.exitCode = 1;
});
