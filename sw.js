"use strict";

const RELEASE = "1.0.0-beta.7";
const BUILD_ID = "math-quest-pwa-v1.0.0-beta.7";
const CACHE_NAME = "math-quest-static-v1.0.0-beta.7";
const RELEASE_MANIFEST_URL = "./release-shell-v1.json";
const RELEASE_MANIFEST_SHA256 = "3470fe4d464d301434f0a7d0bb9840940b6c26ca8fd243c3ee3e58f0d6a4138e";
const CACHE_STORAGE_NAME = `${CACHE_NAME}-${RELEASE_MANIFEST_SHA256}`;
function freshStagingCacheName() {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  return `${CACHE_STORAGE_NAME}-${Array.from(nonce, (value) => value.toString(16).padStart(2, "0")).join("")}-staging`;
}
const APP_ENTRY_PATHS = new Set([
  new URL("./", self.registration.scope).pathname,
  new URL("./index.html", self.registration.scope).pathname,
]);
const LEGAL_DOCUMENT_RELATIVE_PATHS = Object.freeze([
  "./LICENSE",
  "./PRIVACY.md",
  "./THIRD_PARTY_NOTICES.md",
]);
const LEGAL_DOCUMENT_PATHS = new Set(LEGAL_DOCUMENT_RELATIVE_PATHS.map((relative) => new URL(relative, self.registration.scope).pathname));
const ACTIVATION_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;
const MANIFEST_PATH = new URL(RELEASE_MANIFEST_URL, self.registration.scope).pathname;
const SHELL_RELATIVE_PATHS = Object.freeze([
  "./assets/fonts/Inter-Variable.ttf",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/sounds/close.wav",
  "./assets/sounds/confirm.wav",
  "./assets/sounds/incorrect.wav",
  "./assets/sounds/tap.wav",
  "./index.html",
  "./manifest.webmanifest",
  "./curriculum/math-quest-tutorial-manifest-v1.json",
  "./LICENSE",
  "./PRIVACY.md",
  "./THIRD_PARTY_NOTICES.md",
]);
const SHELL_PATHS = new Set(SHELL_RELATIVE_PATHS.map((relative) => new URL(relative, self.registration.scope).pathname));
let releaseManifestPromise = null;
let exactCachePopulationPromise = null;
let pendingActivationChallenge = null;
let activationChallengeGeneration = 0;

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(buffer) {
  return hex(await crypto.subtle.digest("SHA-256", buffer));
}

function mediaType(response) {
  return String(response.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
}

function exactSameOriginResponse(response, expectedUrl, expectedMime) {
  if (!response || !response.ok || response.status !== 200 || response.redirected) return false;
  const actual = new URL(response.url);
  const expected = new URL(expectedUrl, self.registration.scope);
  return actual.origin === self.location.origin
    && actual.pathname === expected.pathname
    && mediaType(response) === expectedMime;
}

function validManifestShape(manifest) {
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.release !== RELEASE
    || manifest.buildId !== BUILD_ID
    || manifest.cacheName !== CACHE_NAME
    || manifest.entryPath !== "./index.html"
    || !Array.isArray(manifest.excludedPaths)
    || manifest.excludedPaths.length !== 2
    || manifest.excludedPaths[0] !== "./release-shell-v1.json"
    || manifest.excludedPaths[1] !== "./sw.js"
    || !Array.isArray(manifest.entries)
    || manifest.entries.length === 0
  ) return false;

  const paths = new Set();
  for (const entry of manifest.entries) {
    if (
      !entry
      || typeof entry.path !== "string"
      || !entry.path.startsWith("./")
      || entry.path.includes("..")
      || paths.has(entry.path)
      || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes)
      || entry.bytes <= 0
      || entry.status !== 200
      || typeof entry.mime !== "string"
      || entry.mime !== entry.mime.toLowerCase()
      || entry.mime.includes(";")
    ) return false;
    paths.add(entry.path);
  }
  return manifest.entries.length === SHELL_RELATIVE_PATHS.length
    && manifest.entries.every((entry, index) => entry.path === SHELL_RELATIVE_PATHS[index])
    && paths.has(manifest.entryPath);
}

async function verifyManifestResponse(response) {
  if (!exactSameOriginResponse(response, RELEASE_MANIFEST_URL, "application/json")) {
    throw new Error("release-manifest-response");
  }
  const bytes = await response.clone().arrayBuffer();
  if (await sha256(bytes) !== RELEASE_MANIFEST_SHA256) {
    throw new Error("release-manifest-hash");
  }
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("release-manifest-json");
  }
  if (!validManifestShape(manifest)) throw new Error("release-manifest-shape");
  return Object.freeze({
    ...manifest,
    entries: Object.freeze(manifest.entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

async function fetchManifestFromNetwork() {
  const response = await fetch(new Request(RELEASE_MANIFEST_URL, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  }));
  const manifest = await verifyManifestResponse(response);
  return { manifest, response };
}

async function cachedVerifiedManifest() {
  const cache = await caches.open(CACHE_STORAGE_NAME);
  const cached = await cache.match(RELEASE_MANIFEST_URL, { ignoreSearch: true });
  if (!cached) return null;
  try {
    return await verifyManifestResponse(cached);
  } catch {
    await cache.delete(RELEASE_MANIFEST_URL);
    return null;
  }
}

async function loadReleaseManifest() {
  if (!releaseManifestPromise) {
    releaseManifestPromise = (async () => {
      const cached = await cachedVerifiedManifest();
      if (cached) return cached;
      return (await fetchManifestFromNetwork()).manifest;
    })().catch((error) => {
      releaseManifestPromise = null;
      throw error;
    });
  }
  return releaseManifestPromise;
}

async function verifyEntryResponse(response, entry) {
  if (!exactSameOriginResponse(response, entry.path, entry.mime)) return false;
  const bytes = await response.clone().arrayBuffer();
  return bytes.byteLength === entry.bytes && await sha256(bytes) === entry.sha256;
}

async function fetchVerifiedEntry(entry) {
  const response = await fetch(new Request(entry.path, {
    cache: "reload",
    credentials: "same-origin",
    redirect: "error",
  }));
  if (!await verifyEntryResponse(response, entry)) {
    throw new Error(`shell-entry-invalid:${entry.path}`);
  }
  return response;
}

async function cacheContainsExactShell(cache, manifest) {
  const required = [RELEASE_MANIFEST_URL, ...manifest.entries.map((entry) => entry.path)];
  const requiredUrls = new Set(required.map((item) => new URL(item, self.registration.scope).href));
  const requests = await cache.keys();
  if (
    requests.length !== requiredUrls.size
    || requests.some((request) => !requiredUrls.has(new URL(request.url).href))
  ) return false;

  const manifestResponse = await cache.match(RELEASE_MANIFEST_URL, { ignoreSearch: true });
  if (!manifestResponse) return false;
  try {
    await verifyManifestResponse(manifestResponse);
  } catch {
    return false;
  }
  for (const entry of manifest.entries) {
    const response = await cache.match(entry.path, { ignoreSearch: true });
    if (!response) return false;
    try {
      if (!await verifyEntryResponse(response, entry)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function populateExactCacheOnce() {
  const { manifest, response: manifestResponse } = await fetchManifestFromNetwork();
  const stagingCacheName = freshStagingCacheName();
  const staging = await caches.open(stagingCacheName);
  let targetKnownInvalid = false;
  try {
    await staging.put(RELEASE_MANIFEST_URL, manifestResponse.clone());
    for (const entry of manifest.entries) {
      await staging.put(entry.path, await fetchVerifiedEntry(entry));
    }
    if (!await cacheContainsExactShell(staging, manifest)) {
      throw new Error("staged-shell-not-exact");
    }

    const cache = await caches.open(CACHE_STORAGE_NAME);
    if (await cacheContainsExactShell(cache, manifest)) {
      releaseManifestPromise = Promise.resolve(manifest);
      return manifest;
    }
    targetKnownInvalid = true;
    const required = [RELEASE_MANIFEST_URL, ...manifest.entries.map((entry) => entry.path)];
    for (const path of required) {
      const response = await staging.match(path, { ignoreSearch: true });
      if (!response) throw new Error(`staged-shell-entry-missing:${path}`);
      await cache.put(path, response);
    }
    const requiredUrls = new Set(required.map((path) => new URL(path, self.registration.scope).href));
    for (const request of await cache.keys()) {
      if (!requiredUrls.has(new URL(request.url).href)) await cache.delete(request);
    }
    if (!await cacheContainsExactShell(cache, manifest)) {
      throw new Error("installed-shell-not-exact");
    }
    releaseManifestPromise = Promise.resolve(manifest);
    return manifest;
  } catch (error) {
    if (targetKnownInvalid) {
      try {
        await caches.delete(CACHE_STORAGE_NAME);
      } catch {
        // Readiness will still fail closed if an invalid partial cache remains.
      }
    }
    releaseManifestPromise = null;
    throw error;
  } finally {
    try {
      await caches.delete(stagingCacheName);
    } catch {
      // A leftover staging cache is inert and can be cleaned on activation.
    }
  }
}

function populateExactCache() {
  if (!exactCachePopulationPromise) {
    exactCachePopulationPromise = populateExactCacheOnce()
      .finally(() => {
        exactCachePopulationPromise = null;
      });
  }
  return exactCachePopulationPromise;
}

async function requireExactInstalledShell() {
  const manifest = await loadReleaseManifest();
  const cache = await caches.open(CACHE_STORAGE_NAME);
  if (!await cacheContainsExactShell(cache, manifest)) {
    throw new Error("installed-shell-not-exact");
  }
}

async function cachedEntry(manifest, entry) {
  const cache = await caches.open(CACHE_STORAGE_NAME);
  const response = await cache.match(entry.path, { ignoreSearch: true });
  return response && await verifyEntryResponse(response, entry) ? response : null;
}

async function verifiedResponseFor(entry) {
  const manifest = await loadReleaseManifest();
  const cached = await cachedEntry(manifest, entry);
  if (cached) return cached;
  const repaired = await fetchVerifiedEntry(entry);
  await (await caches.open(CACHE_STORAGE_NAME)).put(entry.path, repaired.clone());
  return repaired;
}

function recoveryResponse() {
  return new Response(
    "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Math Quest recovery</title><main><h1>Math Quest needs an online repair</h1><p>Your progress has not been removed. Reconnect, then reopen Math Quest and choose Retry in the grown-up installation help.</p></main>",
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function readiness(reportedWorkerState) {
  const checkedAt = new Date().toISOString();
  const requiredPaths = [];
  try {
    const manifest = await loadReleaseManifest();
    const cache = await caches.open(CACHE_STORAGE_NAME);
    const cachedManifest = await cache.match(RELEASE_MANIFEST_URL, { ignoreSearch: true });
    let manifestReady = false;
    if (cachedManifest) {
      try {
        await verifyManifestResponse(cachedManifest);
        manifestReady = true;
      } catch {
        manifestReady = false;
      }
    }
    requiredPaths.push({ path: RELEASE_MANIFEST_URL, ready: manifestReady });
    for (const entry of manifest.entries) {
      requiredPaths.push({ path: entry.path, ready: Boolean(await cachedEntry(manifest, entry)) });
    }
    return {
      type: "MATH_QUEST_READINESS_V1",
      release: RELEASE,
      buildId: BUILD_ID,
      cacheIdentity: CACHE_NAME,
      requiredPaths,
      workerState: reportedWorkerState,
      checkedAt,
      ready: requiredPaths.every((item) => item.ready),
    };
  } catch {
    if (!requiredPaths.length) {
      requiredPaths.push(
        { path: RELEASE_MANIFEST_URL, ready: false },
        ...SHELL_RELATIVE_PATHS.map((path) => ({ path, ready: false })),
      );
    }
    return {
      type: "MATH_QUEST_READINESS_V1",
      release: RELEASE,
      buildId: BUILD_ID,
      cacheIdentity: CACHE_NAME,
      requiredPaths,
      workerState: reportedWorkerState,
      checkedAt,
      ready: false,
    };
  }
}

function exactActivationChallenge(value) {
  return typeof value === "string" && ACTIVATION_CHALLENGE_PATTERN.test(value);
}

async function recordWaitingReadinessChallenge(activationChallenge, generation) {
  const result = await readiness("waiting");
  const accepted = generation === activationChallengeGeneration
    && exactActivationChallenge(activationChallenge)
    && result.ready;
  if (accepted) pendingActivationChallenge = activationChallenge;
  return {
    ...result,
    type: "MATH_QUEST_WAITING_READINESS_V1",
    activationChallenge: accepted ? activationChallenge : null,
    ready: accepted,
  };
}

async function activateExactWaitingWorker(activationChallenge) {
  const expectedChallenge = pendingActivationChallenge;
  pendingActivationChallenge = null;
  activationChallengeGeneration += 1;
  if (
    !exactActivationChallenge(activationChallenge)
    || activationChallenge !== expectedChallenge
  ) return false;
  const result = await readiness("waiting");
  if (!result.ready) return false;
  await self.skipWaiting();
  return true;
}

function reply(event, payload) {
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage(payload);
  } else if (event.source && typeof event.source.postMessage === "function") {
    event.source.postMessage(payload);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(populateExactCache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await requireExactInstalledShell();
    // Each install owns and removes its nonce-bound staging cache. Prior
    // release caches remain available to older open tabs until their grown-up
    // deliberately reloads or closes them.
  })());
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "MATH_QUEST_GET_READINESS_V1") {
    event.waitUntil(readiness("active").then((result) => reply(event, result)));
    return;
  }
  if (type === "MATH_QUEST_GET_WAITING_READINESS_V1") {
    pendingActivationChallenge = null;
    const generation = ++activationChallengeGeneration;
    event.waitUntil(
      recordWaitingReadinessChallenge(event.data.activationChallenge, generation)
        .then((result) => reply(event, result)),
    );
    return;
  }
  if (type === "MATH_QUEST_REPAIR_SHELL_V1") {
    event.waitUntil(
      populateExactCache()
        .then(() => readiness("active"))
        .then((result) => reply(event, result))
        .catch(() => readiness("active").then((result) => reply(event, result))),
    );
    return;
  }
  if (type === "MATH_QUEST_SKIP_WAITING_V1") {
    event.waitUntil(activateExactWaitingWorker(event.data.activationChallenge));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    if (APP_ENTRY_PATHS.has(url.pathname)) {
      event.respondWith((async () => {
        try {
          const manifest = await loadReleaseManifest();
          const entry = manifest.entries.find((item) => item.path === manifest.entryPath);
          if (!entry) return recoveryResponse();
          return await verifiedResponseFor(entry);
        } catch {
          return recoveryResponse();
        }
      })());
      return;
    }
    if (!LEGAL_DOCUMENT_PATHS.has(url.pathname)) return;
  }

  if (url.pathname !== MANIFEST_PATH && !SHELL_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    try {
      if (url.pathname === MANIFEST_PATH) {
        const cache = await caches.open(CACHE_STORAGE_NAME);
        const response = await cache.match(RELEASE_MANIFEST_URL, { ignoreSearch: true });
        if (response) {
          try {
            await verifyManifestResponse(response);
            return response;
          } catch {
            await cache.delete(RELEASE_MANIFEST_URL);
          }
        }
        const fetched = await fetchManifestFromNetwork();
        await cache.put(RELEASE_MANIFEST_URL, fetched.response.clone());
        releaseManifestPromise = Promise.resolve(fetched.manifest);
        return fetched.response;
      }
      const manifest = await loadReleaseManifest();
      const entry = manifest.entries.find((item) => new URL(item.path, self.registration.scope).pathname === url.pathname);
      if (!entry) throw new Error("shell-entry-unregistered");
      return await verifiedResponseFor(entry);
    } catch {
      return new Response("Math Quest needs an online shell repair.", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  })());
});
