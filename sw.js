"use strict";

const CACHE_NAME = "math-quest-static-v1.0.0-beta.1";
const CORE_URLS = Object.freeze([
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/fonts/Inter-Variable.ttf",
  "./assets/sounds/tap.wav",
  "./assets/sounds/confirm.wav",
  "./assets/sounds/incorrect.wav",
  "./assets/sounds/close.wav",
  "./LICENSE",
  "./PRIVACY.md",
  "./THIRD_PARTY_NOTICES.md",
  "./licenses/Inter-OFL.txt",
  "./licenses/app-icons.md",
]);
const CORE_PATHS = new Set(CORE_URLS.map((relative) => new URL(relative, self.registration.scope).pathname));
const APP_ENTRY_PATHS = new Set([
  new URL("./", self.registration.scope).pathname,
  new URL("./index.html", self.registration.scope).pathname,
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("math-quest-static-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && APP_ENTRY_PATHS.has(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseUrl = new URL(response.url);
          if (
            response.ok
            && responseUrl.origin === self.location.origin
            && APP_ENTRY_PATHS.has(responseUrl.pathname)
            && String(response.headers.get("Content-Type") || "").toLowerCase().includes("text/html")
          ) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  if (!CORE_PATHS.has(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    })),
  );
});
