import { serviceWorkerFixture } from "./service-worker-fixture.mjs";
import "./browser-readiness-contract.test.mjs";
import "./browser-frame-contract.test.mjs";
import "./browser-runner-lifecycle.test.mjs";
import "./browser-fixture-contract.test.mjs";
import { createHtmlSourceExtractor, createSourceExtractor } from "./source-extraction.mjs";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, webcrypto } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";
import "./page-adapter-effects.test.mjs";
import { releaseCertificationRunEligible } from "../lib/gate-integrity-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pwaStatusSource = await readFile(path.join(root, "assets", "js", "math-quest-pwa-status.js"), "utf8");
const execFile = promisify(execFileCallback);
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const RELEASE_ENTRY_SPECS = Object.freeze([
  ["./assets/design/math-quest-design-tokens-v1.css", "text/css"],
  ["./assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["./assets/icons/apple-touch-icon.png", "image/png"],
  ["./assets/icons/icon-192.png", "image/png"],
  ["./assets/icons/icon-512.png", "image/png"],
  ["./assets/js/math-quest-progress-source.js", "text/javascript"], ["./assets/js/math-quest-pwa-status.js", "text/javascript"],
  ["./assets/sounds/close.wav", "audio/wav"],
  ["./assets/sounds/confirm.wav", "audio/wav"],
  ["./assets/sounds/incorrect.wav", "audio/wav"],
  ["./assets/sounds/tap.wav", "audio/wav"],
  ["./index.html", "text/html"],
  ["./manifest.webmanifest", "application/manifest+json"],
  ["./curriculum/math-quest-tutorial-manifest-v1.json", "application/json"],
  ["./LICENSE", "application/octet-stream"],
  ["./PRIVACY.md", "text/markdown"],
  ["./THIRD_PARTY_NOTICES.md", "text/markdown"],
]);
const PAGES_TAGGED_ARTIFACT_SPECS = Object.freeze([
  ["assets/design/math-quest-design-tokens-v1.css", "text/css"],
  ["assets/fonts/Inter-Variable.ttf", "font/ttf"],
  ["assets/icons/apple-touch-icon.png", "image/png"],
  ["assets/icons/icon-192.png", "image/png"],
  ["assets/icons/icon-512.png", "image/png"],
  ["assets/js/math-quest-progress-source.js", "text/javascript"], ["assets/js/math-quest-pwa-status.js", "text/javascript"],
  ["assets/sounds/close.wav", "audio/wav"],
  ["assets/sounds/confirm.wav", "audio/wav"],
  ["assets/sounds/incorrect.wav", "audio/wav"],
  ["assets/sounds/tap.wav", "audio/wav"],
  ["curriculum/math-quest-manifest-v1.json", "application/json"],
  ["curriculum/math-quest-tutorial-manifest-v1.json", "application/json"],
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


const sourceExtractions = new Map();

function extractionFor(source, sourceType) {
  const key = sourceType + source;
  if (!sourceExtractions.has(key)) {
    sourceExtractions.set(key, sourceType === "html"
      ? createHtmlSourceExtractor(source)
      : createSourceExtractor(source, { sourceType }));
  }
  return sourceExtractions.get(key);
}

function matchingDelimiter(source, openIndex, open, close) {
  return extractionFor(source, "module").matchingDelimiter(openIndex, open, close);
}

function adapterFunction(source, name) {
  return extractionFor(source, "script").functionDeclaration(name);
}

function htmlFunction(source, name) {
  return extractionFor(source, "html").functionDeclaration(name);
}

function explicitHtmlRelativePathArray(source, marker) {
  return explicitRelativePathArray(extractionFor(source, "html").scriptContaining(marker), marker);
}

async function readPwaAdapter() {
  const page = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = [...page.matchAll(/<script(?![^>]*\bsrc\s*=)(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map((match) => match[1]);
  assert.equal(scripts.length, 2);
  return scripts[1];
}

function adapterPwaStatusFunctions(adapter) {
  const start = adapter.indexOf("let pwaDialogOpen=");
  const end = adapter.indexOf("function validateReadiness(");
  assert.notEqual(start, -1, "the shipped PWA dialog-state boundary must exist");
  assert.notEqual(end, -1, "validateReadiness must have one shipped declaration");
  assert.ok(end > start, "PWA status helpers must precede validateReadiness");
  return `${pwaStatusSource}\n${adapter.slice(start, end)}`;
}

test("legacy recovery links remain one-use but the current page exposes no forced-navigation responder", async () => {
  const adapter = await readFile(path.join(root, "index.html"), "utf8");
  const consumeSource = htmlFunction(adapter, "consumeLegacyBeta1RecoveryMarker");

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
    explicitHtmlRelativePathArray(page, "PWA_REQUIRED_PATHS=Object.freeze("),
    ["./release-shell-v1.json", ...expectedEntries],
  );
  assert.deepEqual(
    explicitHtmlRelativePathArray(browserAudit, "const expectedShellEntryPaths = Object.freeze("),
    expectedEntries,
  );
});

function assertReleaseManifestIdentity(manifest) {
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
      release: "1.0.0-beta.9",
      buildId: "math-quest-pwa-v1.0.0-beta.9",
      cacheName: "math-quest-static-v1.0.0-beta.9",
      entryPath: "./index.html",
      excludedPaths: ["./release-shell-v1.json", "./sw.js"],
    },
  );
}

async function assertPreparedRelease(preparedManifestText, preparedWorker) {
  const preparedManifest = JSON.parse(preparedManifestText);
  assertReleaseManifestIdentity(preparedManifest);
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
}

async function assertPreparationPreservesOccupiedTargets(temporaryRoot, preparedDirectory) {
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
}

async function copyFrozenEntryInputs(freezeFixture) {
  for (const [entryPath] of RELEASE_ENTRY_SPECS) {
    const destination = path.join(freezeFixture, entryPath.slice(2));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(root, entryPath.slice(2))));
  }

}

async function createFreezeFixture(temporaryRoot, originalWorker) {
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
  await writeFile(path.join(freezeFixture, "VERSION"), "1.0.0-beta.9\n", "utf8");
  await copyFrozenEntryInputs(freezeFixture);
  return { freezeFixture, fixtureToolPath };
}

async function freezeAndReadManifest(freezeFixture, fixtureToolPath) {
  await execFile(process.execPath, [fixtureToolPath, "--write"], { cwd: freezeFixture });
  await execFile(process.execPath, [fixtureToolPath, "--check"], { cwd: freezeFixture });
  return readFile(path.join(freezeFixture, "release-shell-v1.json"), "utf8");
}

async function assertRepeatedFreezeBinding(temporaryRoot, originalWorker) {
  const { freezeFixture, fixtureToolPath } = await createFreezeFixture(temporaryRoot, originalWorker);
  const firstFrozenManifest = await freezeAndReadManifest(freezeFixture, fixtureToolPath);
  const firstFrozenHash = sha256(Buffer.from(firstFrozenManifest, "utf8"));
  await writeFile(
    path.join(freezeFixture, "PRIVACY.md"),
    Buffer.concat([
      await readFile(path.join(freezeFixture, "PRIVACY.md")),
      Buffer.from("\nDisposable second generation.\n", "utf8"),
    ]),
  );
  const secondFrozenManifest = await freezeAndReadManifest(freezeFixture, fixtureToolPath);
  const secondFrozenHash = sha256(Buffer.from(secondFrozenManifest, "utf8"));
  assert.notEqual(secondFrozenHash, firstFrozenHash);
  const secondFrozenWorker = await readFile(path.join(freezeFixture, "sw.js"), "utf8");
  assert.match(secondFrozenWorker,
    new RegExp(`const RELEASE_MANIFEST_SHA256 = "${secondFrozenHash}";`, "u"));
  assert.doesNotMatch(secondFrozenWorker, new RegExp(firstFrozenHash, "u"),
    "a new manifest binding must not turn the prior release cache into a deletion target");
  assert.doesNotMatch(secondFrozenWorker, /KNOWN_OBSOLETE_CACHES|clients\.claim\(\)/u);
}

async function prepareAndCheckRelease(preparedDirectory) {
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
  await assertPreparedRelease(preparedManifestText, preparedWorker);
}

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
    await prepareAndCheckRelease(preparedDirectory);
    await assertPreparationPreservesOccupiedTargets(temporaryRoot, preparedDirectory);
    await assertRepeatedFreezeBinding(temporaryRoot, originalWorker);
    assert.deepEqual(await readFile(manifestPath), originalManifest);
    assert.deepEqual(await readFile(workerPath), originalWorker);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function assertFrozenManifestEntries(manifest) {
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
}

test("Beta 9 release-shell manifest binds every declared byte", async () => {
  const [text, worker] = await Promise.all([
    readFile(path.join(root, "release-shell-v1.json"), "utf8"),
    readFile(path.join(root, "sw.js"), "utf8"),
  ]);
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.includes("\r"), false);
  const manifest = JSON.parse(text);
  assertReleaseManifestIdentity(manifest);
  await assertFrozenManifestEntries(manifest);
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

test("each service-worker installation owns a distinct nonce-bound staging cache", async () => {
  const worker = await readFile(path.join(root, "sw.js"), "utf8");
  const productVersion = (await readFile(path.join(root, "VERSION"), "utf8")).trim();
  const escapedProductVersion = productVersion.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  let generation = 0;
  const freshName = new vm.Script(`(()=>{
    const CACHE_STORAGE_NAME="math-quest-static-${productVersion}-${"a".repeat(64)}";
    ${adapterFunction(worker, "hex")}
    ${adapterFunction(worker, "freshStagingCacheName")}
    return freshStagingCacheName;
  })()`).runInNewContext({
    crypto: { getRandomValues(bytes) { generation += 1; bytes.fill(generation); return bytes; } },
    Uint8Array,
  });
  const first = freshName();
  const second = freshName();
  assert.notEqual(first, second);
  const expectedStagingName = new RegExp(`^math-quest-static-${escapedProductVersion}-[a-f0-9]{64}-[a-f0-9]{32}-staging$`, "u");
  assert.match(first, expectedStagingName);
  assert.match(second, expectedStagingName);
  assert.match(worker, /const stagingCacheName = freshStagingCacheName\(\);/u);
  assert.match(worker, /caches\.open\(stagingCacheName\)/u);
  assert.match(worker, /caches\.delete\(stagingCacheName\)/u);
  assert.doesNotMatch(worker, /const STAGING_CACHE_NAME/u);
});

function caregiverCopyHarness(adapter) {
  const statusFunctions = adapterPwaStatusFunctions(adapter);
  return new vm.Script(`(()=> {
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
}

function configureVerifiedCopy(harness) {
  harness.setController({ id: "exact-controller" });
  harness.pwa.phase = "READY";
  harness.pwa.details = { ready: true };
}

test("caregiver update copy distinguishes a verified active shell from fresh setup", async () => {
  const adapter = await readPwaAdapter();
  const harness = caregiverCopyHarness(adapter);

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

  configureVerifiedCopy(harness);
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

  configureVerifiedCopy(harness);
  assert.match(
    harness.failActivation(),
    /(?:current|verified|this)\s+(?:offline\s+)?version\s+(?:remains|is still)\s+(?:usable|available|ready)/iu,
  );
});

test("service-worker exceptions are mapped to bounded caregiver copy without raw browser tuples", async () => {
  const adapter = await readPwaAdapter();
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

function assertFreshCandidateFailure(harness, continuityClaim, rawTuple) {
  assert.equal(harness.pwa.phase, "NOT_CONTROLLED");
  assert.equal(harness.pwa.updatePhase, "ERROR");
  assert.doesNotMatch(harness.pwa.updateError, continuityClaim);
  assert.match(harness.pwa.updateError, /stay online|retry|offline setup/iu);
  assert.doesNotMatch(harness.pwa.updateError, rawTuple);
  assert.doesNotMatch(harness.render(), continuityClaim);
  assert.doesNotMatch(harness.render(), rawTuple);
}

test("fresh candidate failures render retry guidance without claiming an offline fallback", async () => {
  const adapter = await readPwaAdapter();
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
  assertFreshCandidateFailure(harness, continuityClaim, rawTuple);

  assert.equal(await harness.check(true), false);
  assertFreshCandidateFailure(harness, continuityClaim, rawTuple);
});

function candidateFailureHarness(adapter) {
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
      status:()=>MathQuestPwaStatus.readinessStatusText(pwa.phase),
      watch:watchPwaRegistration,
      triggerUpdateFound(){updateFound();},
      rejectCandidate(){worker.state="redundant";workerStateChange();registration.installing=null;},
      check:checkPwaUpdateAtBoundary
    };
  })()`, { filename: "pwa-candidate-lifecycle-effect.js" }).runInNewContext({ candidateEffects, hostileUpdateError });

  return { candidateHarness, hostileUpdateError };
}

function controllerChangeHarness(adapter, controllerEffects) {
  return new vm.Script(`(()=>{
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
      applying:false,applyAcknowledged:false,reloadSuggested:false,reloaded:false,applyWorker:null
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
        pwa.applying=false;
        pwa.applyWorker=null;
        app.inert=false;
      },
      beginApplying(){pwa.applying=true;pwa.applyWorker={state:"activated"};},
      input(){return effects.inputValue;}
    };
  })()`, { filename: "pwa-controller-boundary-effect.js" }).runInNewContext({ controllerEffects });
}

test("active readiness survives candidate failures and controller changes require a deliberate reload", async () => {
  const adapter = await readPwaAdapter();
  const { candidateHarness, hostileUpdateError } = candidateFailureHarness(adapter);

  await assert.rejects(candidateHarness.registration.update(), (error) => error === hostileUpdateError,
    "the candidate fixture must throw its configured network error rather than an unrelated harness failure");
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

});

async function assertNameGateControllerTransition(controllerHarness, controllerEffects) {
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
}

async function assertSessionControllerTransition(controllerHarness, controllerEffects) {
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
}

async function assertApplyingControllerTransition(controllerHarness, controllerEffects) {
  controllerHarness.resetForControlledPage();
  controllerEffects.saves = 0;
  controllerEffects.reloads = 0;
  controllerHarness.beginApplying();
  await controllerHarness.route();
  assert.equal(controllerEffects.saves, 1, "the tab that chose Apply must commit before its controller-change reload");
  assert.equal(controllerEffects.reloads, 1, "the tab that chose Apply must reload exactly once through the real controller-change route");
  assert.equal(controllerHarness.pwa.reloaded, true);
}

test("controller changes preserve unfinished input until deliberate reload", async () => {
  const adapter = await readPwaAdapter();
  const controllerEffects = {
    inputValue: "Nia",
    readinessQueries: 0,
    saves: 0,
    reloads: 0,
    cleared: 0,
    cancelledSpeech: 0,
    stoppedSounds: 0,
  };
  const controllerHarness = controllerChangeHarness(adapter, controllerEffects);

  await assertNameGateControllerTransition(controllerHarness, controllerEffects);
  await assertSessionControllerTransition(controllerHarness, controllerEffects);
  await assertApplyingControllerTransition(controllerHarness, controllerEffects);
});

test("only the initiating tab reloads after its waiting worker activates", async () => {
  const adapter = await readPwaAdapter();
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

test("[NC-LAUNCHER-FOREIGN-HOST] Windows launcher snapshots only the reviewed runtime and rejects a foreign Host", async () => {
  const [server, manifestText] = await Promise.all([
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

function snapshotProgramFromWorkflow(pagesWorkflow) {
  const releaseCommit = "a".repeat(40);
  const successfulDispatch = { event: "workflow_dispatch", status: "completed", conclusion: "success", head_sha: releaseCommit };
  assert.equal(releaseCertificationRunEligible(successfulDispatch, [{ name: "full-audit", status: "completed", conclusion: "success" }], releaseCommit), true);
  assert.equal(releaseCertificationRunEligible(successfulDispatch, [{ name: "audit-execution-qualification", status: "completed", conclusion: "success" }], releaseCommit), false);
  assert.equal(releaseCertificationRunEligible({ ...successfulDispatch, head_sha: "b".repeat(40) }, [{ name: "full-audit", status: "completed", conclusion: "success" }], releaseCommit), false);
  assert.match(pagesWorkflow, /actions\/runs\/\$\{run_id\}\/jobs\?filter=all/iu);
  assert.match(pagesWorkflow, /\.name == "full-audit" and \.status == "completed" and \.conclusion == "success"/u);
  const scriptMatch = pagesWorkflow.match(
    /- name: Construct, verify, and seal exact tagged Pages snapshot[\s\S]*?node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n {10}NODE/u,
  );
  assert.ok(scriptMatch, "the executable snapshot program is extractable");
  const snapshotProgram = scriptMatch[1]
    .split(/\r?\n/u)
    .map((line) => line.replace(/^ {10}/u, ""))
    .join("\n");
  return snapshotProgram;
}

function snapshotReleaseEntries(fixtureBytes) {
  return RELEASE_ENTRY_SPECS.map(([entryPath, mime]) => {
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
}

function snapshotFixtureBytes() {
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

  const releaseEntries = snapshotReleaseEntries(fixtureBytes);
  const releaseManifestBytes = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      release: "1.0.0-beta.9",
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

  return { fixtureBytes, committedIndex };
}

async function commitSnapshotFixture(fixture, fixtureBytes) {
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

  return releaseCommit;
}

async function assertSnapshotArtifacts(fixture, siteRoot, committedIndex, outputPath) {
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
  const expectedDeployedFileCount = PAGES_TAGGED_ARTIFACT_SPECS.length + 1; // generated .nojekyll
  assert.match(
    await readFile(outputPath, "utf8"),
    new RegExp(`^sha256=[a-f0-9]{64}\\r?\\nfile_count=${expectedDeployedFileCount}\\r?\\n$`, "u"),
  );
}

async function runDirtyWorktreeSnapshot(fixture, snapshotProgram, releaseCommit) {
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

  return outputPath;
}

test("[NC-PAGES-WRONG-COMMIT-OR-MISSING-CERTIFICATION] Pages snapshot ignores a worktree mutation after the release commit", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "mq-pages-snapshot-"));
  const pagesWorkflow = await readFile(
    path.join(root, ".github", "workflows", "pages.yml"),
    "utf8",
  );
  const snapshotProgram = snapshotProgramFromWorkflow(pagesWorkflow);
  const siteRoot = path.join(fixture, "_site");

  try {
    const { fixtureBytes, committedIndex } = snapshotFixtureBytes();
    const releaseCommit = await commitSnapshotFixture(fixture, fixtureBytes);

    const outputPath = await runDirtyWorktreeSnapshot(fixture, snapshotProgram, releaseCommit);
    await assertSnapshotArtifacts(fixture, siteRoot, committedIndex, outputPath);
  } finally {
    if (await readFile(path.join(fixture, ".git", "HEAD"), "utf8").catch(() => null)) {
      if (await readFile(path.join(siteRoot, ".nojekyll")).catch(() => null)) {
        await makeTreeWritable(siteRoot);
      }
    }
    await rm(fixture, { recursive: true, force: true });
  }
});

async function loadServiceWorkerFixture() {
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
    release: "1.0.0-beta.9",
    buildId: "math-quest-pwa-v1.0.0-beta.9",
    cacheName: "math-quest-static-v1.0.0-beta.9",
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
  const logicalBeta8Name = "math-quest-static-v1.0.0-beta.9";
  const beta8Name = `${logicalBeta8Name}-${expectedManifestHash}`;
  const publicBeta3PhysicalName =
    "math-quest-static-v1.0.0-beta.3-9e5fedc72ef838eab3dccf2437a594fa24bdd12f173e81f19c91c5f71a9509b7";
  return serviceWorkerFixture({root,scope,workerText,releaseManifest,releaseManifestText,expectedManifestHash,logicalBeta8Name,beta8Name,publicBeta3PhysicalName});
}

async function assertOfflineInstallPreservesPriorShells(fixture) {
  fixture.cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["old", "old"]]));
  fixture.cacheStores.set(fixture.publicBeta3PhysicalName, new Map([["public-beta3-shell", "preserve-until-claim"]]));
  fixture.state.networkEnabled = false;
  let failedInstallPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { failedInstallPromise = promise; } });
  await assert.rejects(failedInstallPromise);
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(fixture.cacheStores.has(fixture.beta8Name), false);
}

async function assertTamperedManifestRejected(fixture) {
  fixture.cacheStores.set(fixture.logicalBeta8Name, new Map([["same-identity-old-shell", "preserve"]]));
  const firstManifestHashIndex = fixture.releaseManifestText.indexOf(fixture.releaseManifest.entries[0].sha256);
  assert.ok(firstManifestHashIndex > 0);
  const sameLengthTamperedManifest =
    fixture.releaseManifestText.slice(0, firstManifestHashIndex)
    + (fixture.releaseManifestText[firstManifestHashIndex] === "0" ? "1" : "0")
    + fixture.releaseManifestText.slice(firstManifestHashIndex + 1);
  assert.equal(Buffer.byteLength(sameLengthTamperedManifest), Buffer.byteLength(fixture.releaseManifestText));
  fixture.networkOverrides.set("./release-shell-v1.json", {
    bytes: Buffer.from(sameLengthTamperedManifest, "utf8"),
  });
  fixture.state.networkEnabled = true;
  let tamperedManifestInstallPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { tamperedManifestInstallPromise = promise; } });
  await assert.rejects(tamperedManifestInstallPromise, /release-manifest-hash/u);
  fixture.networkOverrides.delete("./release-shell-v1.json");
  assert.equal(fixture.cacheStores.has(fixture.beta8Name), false);
  assert.equal(fixture.cacheStores.has(fixture.logicalBeta8Name), true);
}

async function assertPartialInstallRemoved(fixture) {
  fixture.cacheStores.set(fixture.beta8Name, new Map([
    [
      fixture.cacheKey("./orphan"),
      new fixture.MockResponse("orphan", new URL("./orphan", fixture.scope).href, "text/plain"),
    ],
  ]));
  fixture.state.cachePutFailure = {
    cacheName: fixture.beta8Name,
    url: fixture.cacheKey("./index.html"),
  };
  fixture.state.networkEnabled = true;
  let partialCopyInstallPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { partialCopyInstallPromise = promise; } });
  await assert.rejects(partialCopyInstallPromise, /injected-cache-put-failure/u);
  assert.equal(
    fixture.cacheStores.has(fixture.beta8Name),
    false,
    "a failed copy must remove the already-invalid partial candidate cache",
  );
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(fixture.cacheStores.has(fixture.logicalBeta8Name), true);
  assert.deepEqual(fixture.stagingNames(), []);
}

async function assertExactInstallIsIdempotent(fixture) {
  let installPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.equal(fixture.state.skipWaitingCalls, 0);
  fixture.beta8 = fixture.cacheStores.get(fixture.beta8Name);
  assert.equal(fixture.beta8.size, fixture.releaseManifest.entries.length + 1);

  fixture.state.cachePutFailure = { cacheName: fixture.beta8Name, url: null };
  let idempotentInstallPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { idempotentInstallPromise = promise; } });
  await idempotentInstallPromise;
  assert.ok(fixture.state.cachePutFailure, "an already exact live cache must receive no put effects");
  fixture.state.cachePutFailure = null;
}

async function assertInvalidNetworkEntriesPreserveExactShell(fixture) {
  fixture.exactTap = fixture.beta8.get(fixture.cacheKey("./assets/sounds/tap.wav"));
  const sameLengthTamperedTap = Buffer.from(fixture.exactTap.bytes);
  sameLengthTamperedTap[0] ^= 0x01;
  assert.equal(sameLengthTamperedTap.byteLength, fixture.exactTap.bytes.byteLength);
  fixture.networkOverrides.set("./assets/sounds/tap.wav", { bytes: sameLengthTamperedTap });
  let corruptNetworkInstallPromise;
  fixture.handlers.get("install")({ waitUntil(promise) { corruptNetworkInstallPromise = promise; } });
  await assert.rejects(corruptNetworkInstallPromise, /shell-entry-invalid/u);
  fixture.networkOverrides.delete("./assets/sounds/tap.wav");
  assert.equal(
    sha256(fixture.beta8.get(fixture.cacheKey("./assets/sounds/tap.wav")).bytes),
    sha256(fixture.exactTap.bytes),
    "a failed staging fetch must leave the exact live shell byte-for-byte intact",
  );
  assert.equal(fixture.beta8.size, fixture.releaseManifest.entries.length + 1);

  for (const [label, override] of [
    ["wrong MIME", { mime: "text/plain" }],
    ["redirect", { redirected: true }],
    ["unsuccessful status", { status: 503 }],
    ["cross-origin response", { url: "https://other.example/tap.wav" }],
  ]) {
    fixture.networkOverrides.set("./assets/sounds/tap.wav", override);
    let rejectedResponseInstallPromise;
    fixture.handlers.get("install")({
      waitUntil(promise) {
        rejectedResponseInstallPromise = promise;
      },
    });
    await assert.rejects(
      rejectedResponseInstallPromise,
      /shell-entry-invalid/u,
      label,
    );
    fixture.networkOverrides.delete("./assets/sounds/tap.wav");
    assert.equal(
      sha256(fixture.beta8.get(fixture.cacheKey("./assets/sounds/tap.wav")).bytes),
      sha256(fixture.exactTap.bytes),
      `${label} must not mutate the exact live shell`,
    );
  }
}

async function assertActivationRevalidatesCandidate(fixture) {
  fixture.self.registration.active = { scriptURL: fixture.self.location.href };
  fixture.beta8.set(
    fixture.cacheKey("./assets/sounds/tap.wav"),
    new fixture.MockResponse(
      "mutated before activation",
      new URL("./assets/sounds/tap.wav", fixture.scope).href,
      "audio/wav",
    ),
  );
  let rejectedActivatePromise;
  fixture.handlers.get("activate")({ waitUntil(promise) { rejectedActivatePromise = promise; } });
  await assert.rejects(rejectedActivatePromise, /installed-shell-not-exact/u);
  assert.equal(
    fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"),
    true,
    "activation must preserve the prior cache until the candidate is re-proved",
  );
  assert.equal(
    fixture.cacheStores.has(fixture.publicBeta3PhysicalName),
    true,
    "activation must preserve the exact public Beta 3 cache until the candidate is re-proved",
  );
  assert.equal(fixture.state.claimCalls, 0);
  fixture.beta8.set(fixture.cacheKey("./assets/sounds/tap.wav"), fixture.exactTap.clone());
}

async function assertActivationPreservesPriorCaches(fixture) {
  fixture.state.claimShouldFail = true;
  let activatePromise;
  fixture.handlers.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"), true);
  assert.equal(
    fixture.cacheStores.has(fixture.publicBeta3PhysicalName),
    true,
    "activation must preserve the exact public Beta 3 cache for any older open tab",
  );
  assert.equal(
    fixture.cacheStores.has(fixture.logicalBeta8Name),
    true,
    "activation must not destroy an older same-identity storage cache",
  );
  assert.equal(fixture.state.claimCalls, 0, "activation must not call clients.claim even when that API would fail");
  fixture.state.claimShouldFail = false;
  assert.equal(fixture.retainedClientNavigations.length, 0, "a post-Beta-1 cache witness preserves the safe-boundary update path");
}

async function assertActivationDoesNotProbeOrNavigateClients(fixture) {
  const retainedBeta1Progress = Object.freeze({ bytes: "BETA1-PROGRESS-UNCHANGED" });
  fixture.retainedClients.push(...[
    "silent-current-entry",
    "suspended-unknown-post-beta1-entry",
    "malformed-unverifiable-entry",
    "true-silent-beta1-entry",
  ].map((id) => ({
    id,
    type: "window",
    url: new URL("./index.html", fixture.scope).href,
    postMessage: function recordRetainedClientChallenge(message) {
      fixture.retainedClientChallenges.push({ id: this.id, message: structuredClone(message) });
      if (id === "malformed-unverifiable-entry") queueMicrotask(() => fixture.handlers.get("message")({ data: { type: "MALFORMED_CLIENT_REPLY" }, source: this, ports: [] }));
    },
    async navigate(url) {
      fixture.retainedClientNavigations.push({ id: this.id, url });
      return this;
    },
  })));
  fixture.cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["legacy-shell", "beta1"]]));
  const matchAllCountBeforeUnverifiableActivation = fixture.matchAllOptions.length;
  let retainedBeta1ActivatePromise;
  fixture.handlers.get("activate")({ waitUntil(promise) { retainedBeta1ActivatePromise = promise; } });
  await retainedBeta1ActivatePromise;
  assert.equal(fixture.matchAllOptions.length, matchAllCountBeforeUnverifiableActivation, "activation must not inspect clients in order to guess their version");
  assert.deepEqual(fixture.retainedClientChallenges, [], "silent, suspended, unknown, malformed, and Beta 1 clients receive no identity probe");
  assert.deepEqual(fixture.retainedClientNavigations, [], "no silent, suspended, unknown, malformed, or Beta 1 client may be forcibly navigated");
  assert.equal(retainedBeta1Progress.bytes, "BETA1-PROGRESS-UNCHANGED", "service-worker activation cannot mutate local progress storage");
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"), true,
    "activation retains the Beta 1 cache while a true silent Beta 1 tab may still need it");
}

async function assertUnknownLineagePreservesClients(fixture) {
  fixture.cacheStores.set("math-quest-static-v1.0.0-beta.1", new Map([["stale-beta1-shell", "beta1"]]));
  fixture.cacheStores.set("math-quest-static-v1.0.0-beta.2", new Map([["beta2-shell", "beta2"]]));
  let retainedBeta2ActivatePromise;
  fixture.handlers.get("activate")({ waitUntil(promise) { retainedBeta2ActivatePromise = promise; } });
  await retainedBeta2ActivatePromise;
  assert.deepEqual(fixture.retainedClientNavigations, [], "evicted or unrecognized cache lineage cannot authorize client navigation");
  assert.deepEqual(fixture.retainedClientChallenges, [], "cache lineage cannot authorize client identity probing");
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.1"), true, "Beta 1 storage remains available to an older open tab");
  assert.equal(fixture.cacheStores.has("math-quest-static-v1.0.0-beta.2"), true, "unknown older tabs keep their release storage until browser eviction");
}

async function assertActiveReadinessShape(fixture) {
  let readiness;
  let readinessPromise;
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_GET_READINESS_V1" },
    ports: [{ postMessage(value) { readiness = value; } }],
    waitUntil(promise) { readinessPromise = promise; },
  });
  await readinessPromise;
  assert.equal(readiness.ready, true);
  assert.equal(readiness.requiredPaths.length, fixture.releaseManifest.entries.length + 1);
  assert.deepEqual(
    Object.keys(readiness).sort(),
    ["buildId", "cacheIdentity", "checkedAt", "ready", "release", "requiredPaths", "type", "workerState"].sort(),
  );
}

async function assertColdWorkerUsesCachedManifest(fixture) {
  const coldHandlers = new Map();
  let coldNetworkCalls = 0;
  const coldSelf = {
    registration: { scope: fixture.scope, active: { scriptURL: fixture.self.location.href }, waiting: null },
    location: new URL("https://example.test/sw.js"),
    clients: { async claim() {} },
    addEventListener(type, listener) {
      coldHandlers.set(type, listener);
    },
    async skipWaiting() {},
  };
  vm.runInContext(fixture.workerText, vm.createContext({
    self: coldSelf,
    caches: {
      async open(name) {
        return fixture.cacheFor(name);
      },
      async keys() {
        return [...fixture.cacheStores.keys()];
      },
      async delete(name) {
        return fixture.cacheStores.delete(name);
      },
    },
    crypto: webcrypto,
    fetch() {
      coldNetworkCalls += 1;
      return new Promise(() => {});
    },
    Request: fixture.MockRequest,
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
  assert.equal(coldResult.requiredPaths.length, fixture.releaseManifest.entries.length + 1);
  assert.equal(coldNetworkCalls, 0, "a verified cached manifest must win before network");
}

async function assertOfflineNavigationBytes(fixture) {
  fixture.state.networkEnabled = false;
  const navigation = {
    request: new fixture.MockRequest("./", { mode: "navigate" }),
    respondWith(promise) { this.response = promise; },
  };
  fixture.handlers.get("fetch")(navigation);
  const offlineResponse = await navigation.response;
  assert.equal(offlineResponse.status, 200);
  assert.equal(sha256(Buffer.from(await offlineResponse.arrayBuffer())), fixture.releaseManifest.entries.find((entry) => entry.path === "./index.html").sha256);
}

async function assertOfflineLegalDocumentRoutes(fixture) {
  const pageText = await readFile(path.join(root, "index.html"), "utf8");
  const legalButtonPattern = /data-action="legal-open" data-legal-id="(privacy|notices|license)"/gu;
  const legalIds = [...pageText.matchAll(legalButtonPattern)].map((match) => match[1]);
  assert.deepEqual(
    [...legalIds].sort(),
    ["license", "notices", "privacy"],
    "the parent-facing reader must expose exactly the three governed legal documents",
  );
  const legalPaths = Object.freeze({
    license: "./LICENSE",
    notices: "./THIRD_PARTY_NOTICES.md",
    privacy: "./PRIVACY.md",
  });
  for (const legalId of legalIds) {
    const href = legalPaths[legalId];
    const clickNavigation = {
      intercepted: false,
      request: new fixture.MockRequest(href, { mode: "navigate" }),
      respondWith(promise) {
        this.intercepted = true;
        this.response = promise;
      },
    };
    fixture.handlers.get("fetch")(clickNavigation);
    assert.equal(clickNavigation.intercepted, true, href);
    const legalResponse = await clickNavigation.response;
    const entry = fixture.releaseManifest.entries.find((item) => item.path === href);
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
    fixture.handlers.get("fetch")({
      request: new fixture.MockRequest(href, { mode: "navigate" }),
      respondWith() {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, `${href} must remain outside the worker scope`);
  }
}

async function assertOfflineCorruptionFailsClosed(fixture) {
  fixture.beta8.set(
    fixture.cacheKey("./PRIVACY.md"),
    new fixture.MockResponse(
      "corrupt legal text",
      new URL("./PRIVACY.md", fixture.scope).href,
      "text/markdown",
    ),
  );
  const corruptLegalNavigation = {
    request: new fixture.MockRequest("./PRIVACY.md", { mode: "navigate" }),
    respondWith(promise) {
      this.response = promise;
    },
  };
  fixture.handlers.get("fetch")(corruptLegalNavigation);
  assert.equal(
    (await corruptLegalNavigation.response).status,
    503,
    "an offline legal document with the wrong bytes must fail closed",
  );

  fixture.beta8.set(
    fixture.cacheKey("./index.html"),
    new fixture.MockResponse("corrupt", new URL("./index.html", fixture.scope).href, "text/html"),
  );
  const corruptNavigation = {
    request: new fixture.MockRequest("./", { mode: "navigate" }),
    respondWith(promise) { this.response = promise; },
  };
  fixture.handlers.get("fetch")(corruptNavigation);
  assert.equal((await corruptNavigation.response).status, 503);

  let failedRepair;
  let failedRepairPromise;
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { failedRepair = value; } }],
    waitUntil(promise) { failedRepairPromise = promise; },
  });
  await failedRepairPromise;
  assert.equal(failedRepair.ready, false);
  assert.equal(fixture.beta8.size, fixture.releaseManifest.entries.length + 1);
}

async function assertPartialRepairRemovesPartialBytes(fixture) {
  fixture.state.networkEnabled = true;
  fixture.state.cachePutFailure = {
    cacheName: fixture.beta8Name,
    url: fixture.cacheKey("./index.html"),
  };
  let partialRepair;
  let partialRepairPromise;
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { partialRepair = value; } }],
    waitUntil(promise) { partialRepairPromise = promise; },
  });
  await partialRepairPromise;
  assert.equal(partialRepair.ready, false);
  assert.equal(
    fixture.cacheStores.get(fixture.beta8Name).size,
    0,
    "readiness may reopen the cache, but no partial candidate byte may survive",
  );
}

async function assertRepairRestoresExactCache(fixture) {
  let repair;
  let repairPromise;
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { repair = value; } }],
    waitUntil(promise) { repairPromise = promise; },
  });
  await repairPromise;
  assert.equal(repair.ready, true);
  fixture.beta8 = fixture.cacheStores.get(fixture.beta8Name);
  assert.equal(fixture.beta8.size, fixture.releaseManifest.entries.length + 1);
}

async function assertConcurrentRepairsShareOneTransaction(fixture) {
  const manifestFetchesBeforeConcurrentRepair =
    fixture.networkRequestCounts.get("./release-shell-v1.json") || 0;
  let concurrentRepairOne;
  let concurrentRepairTwo;
  let concurrentRepairPromiseOne;
  let concurrentRepairPromiseTwo;
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { concurrentRepairOne = value; } }],
    waitUntil(promise) { concurrentRepairPromiseOne = promise; },
  });
  fixture.handlers.get("message")({
    data: { type: "MATH_QUEST_REPAIR_SHELL_V1" },
    ports: [{ postMessage(value) { concurrentRepairTwo = value; } }],
    waitUntil(promise) { concurrentRepairPromiseTwo = promise; },
  });
  await Promise.all([concurrentRepairPromiseOne, concurrentRepairPromiseTwo]);
  assert.equal(concurrentRepairOne.ready, true);
  assert.equal(concurrentRepairTwo.ready, true);
  assert.equal(
    (fixture.networkRequestCounts.get("./release-shell-v1.json") || 0)
      - manifestFetchesBeforeConcurrentRepair,
    1,
    "simultaneous repair requests must share one exact-cache population transaction",
  );
}

async function assertForeignAndPostRequestsStayOutsideWorker(fixture) {
  let crossOriginIntercepted = false;
  fixture.handlers.get("fetch")({
    request: new fixture.MockRequest("https://other.example/file", { mode: "same-origin" }),
    respondWith() { crossOriginIntercepted = true; },
  });
  assert.equal(crossOriginIntercepted, false);

  let postIntercepted = false;
  const post = new fixture.MockRequest("./index.html", { method: "POST" });
  fixture.handlers.get("fetch")({ request: post, respondWith() { postIntercepted = true; } });
  assert.equal(postIntercepted, false);
}

async function assertWaitingWorkerRequiresChallenge(fixture) {
  function workerPort() {
    return {
      scriptURL: fixture.self.location.href,
      async postMessage(data) {
        let replyPayload;
        let effectPromise = null;
        fixture.handlers.get("message")({
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

  fixture.activeWorker = workerPort();
  fixture.exactWaitingWorker = workerPort();
  fixture.self.registration.active = fixture.activeWorker;
  fixture.self.registration.waiting = fixture.exactWaitingWorker;
  assert.equal(
    fixture.activeWorker.scriptURL,
    fixture.exactWaitingWorker.scriptURL,
    "real deployments can expose identical active and waiting script URLs",
  );
  const controllerReadiness = await fixture.activeWorker.postMessage({
    type: "MATH_QUEST_GET_READINESS_V1",
  });
  assert.equal(controllerReadiness.workerState, "active");

  const noReadinessChallenge = "0".repeat(64);
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: noReadinessChallenge,
  });
  assert.equal(fixture.state.skipWaitingCalls, 0, "activation without waiting readiness must fail");

  const invalidReadiness = await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: "e".repeat(63),
  });
  assert.equal(invalidReadiness.ready, false);
  assert.equal(invalidReadiness.activationChallenge, null);
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: "e".repeat(63),
  });
  assert.equal(fixture.state.skipWaitingCalls, 0, "an invalid challenge must never activate");
}

async function assertMismatchedChallengeIsConsumed(fixture) {
  const acceptedChallenge = "a".repeat(64);
  const waitingReadiness = await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: acceptedChallenge,
  });
  assert.equal(waitingReadiness.type, "MATH_QUEST_WAITING_READINESS_V1");
  assert.equal(waitingReadiness.workerState, "waiting");
  assert.equal(waitingReadiness.ready, true);
  assert.equal(waitingReadiness.activationChallenge, acceptedChallenge);

  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: "b".repeat(64),
  });
  assert.equal(fixture.state.skipWaitingCalls, 0, "a mismatched challenge must fail");
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: acceptedChallenge,
  });
  assert.equal(fixture.state.skipWaitingCalls, 0, "a challenge consumed by a mismatch must be stale");
}

async function assertPostReadinessMutationBlocksActivation(fixture) {
  const mutationChallenge = "c".repeat(64);
  assert.equal((await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: mutationChallenge,
  })).ready, true);
  fixture.tapEntry = fixture.releaseManifest.entries.find((entry) => entry.path === "./assets/sounds/tap.wav");
  fixture.beta8.set(
    fixture.cacheKey(fixture.tapEntry.path),
    new fixture.MockResponse(
      "mutated after readiness",
      new URL(fixture.tapEntry.path, fixture.scope).href,
      fixture.tapEntry.mime,
    ),
  );
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: mutationChallenge,
  });
  assert.equal(fixture.state.skipWaitingCalls, 0, "cache mutation after readiness must fail revalidation");
}

async function assertSuccessfulChallengeIsOneTime(fixture) {
  const tapBytes = await readFile(path.join(root, fixture.tapEntry.path.slice(2)));
  fixture.beta8.set(
    fixture.cacheKey(fixture.tapEntry.path),
    new fixture.MockResponse(tapBytes, new URL(fixture.tapEntry.path, fixture.scope).href, fixture.tapEntry.mime),
  );
  const finalChallenge = "d".repeat(64);
  assert.equal((await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_GET_WAITING_READINESS_V1",
    activationChallenge: finalChallenge,
  })).ready, true);
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: finalChallenge,
  });
  assert.equal(fixture.state.skipWaitingCalls, 1);
  await fixture.exactWaitingWorker.postMessage({
    type: "MATH_QUEST_SKIP_WAITING_V1",
    activationChallenge: finalChallenge,
  });
  assert.equal(fixture.state.skipWaitingCalls, 1, "a successful challenge must be one-time");
}

const SERVICE_WORKER_SCENARIOS = Object.freeze([
  assertOfflineInstallPreservesPriorShells,
  assertTamperedManifestRejected,
  assertPartialInstallRemoved,
  assertExactInstallIsIdempotent,
  assertInvalidNetworkEntriesPreserveExactShell,
  assertActivationRevalidatesCandidate,
  assertActivationPreservesPriorCaches,
  assertActivationDoesNotProbeOrNavigateClients,
  assertUnknownLineagePreservesClients,
  assertActiveReadinessShape,
  assertColdWorkerUsesCachedManifest,
  assertOfflineNavigationBytes,
  assertOfflineLegalDocumentRoutes,
  assertOfflineCorruptionFailsClosed,
  assertPartialRepairRemovesPartialBytes,
  assertRepairRestoresExactCache,
  assertConcurrentRepairsShareOneTransaction,
  assertForeignAndPostRequestsStayOutsideWorker,
  assertWaitingWorkerRequiresChallenge,
  assertMismatchedChallengeIsConsumed,
  assertPostReadinessMutationBlocksActivation,
  assertSuccessfulChallengeIsOneTime,
]);

test("service-worker install, readiness, corruption, repair, and routing are effect-sensitive", async () => {
  const fixture = await loadServiceWorkerFixture();
  for (const scenario of SERVICE_WORKER_SCENARIOS) await scenario(fixture);
});
