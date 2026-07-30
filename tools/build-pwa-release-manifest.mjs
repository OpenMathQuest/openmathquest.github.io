import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "release-shell-v1.json");
const workerPath = path.join(root, "sw.js");
const RELEASE = "1.0.0-beta.2";
const BUILD_ID = "math-quest-pwa-v1.0.0-beta.2";
const CACHE_NAME = "math-quest-static-v1.0.0-beta.2";
const HASH_MARKER = /const RELEASE_MANIFEST_SHA256 = "[a-f0-9]{64}";/u;
const OBSOLETE_CACHES_MARKER =
  /const KNOWN_OBSOLETE_CACHES = Object\.freeze\(\[(?:\r?\n  "[a-z0-9.-]+",)+\r?\n\]\);/u;
const ENTRIES = Object.freeze([
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bindWorkerToManifest(worker, manifestHash) {
  const matches = worker.match(new RegExp(HASH_MARKER.source, "gu")) || [];
  if (matches.length !== 1) {
    throw new Error(`sw.js must contain exactly one release-manifest hash marker; found ${matches.length}.`);
  }
  const priorManifestHash = matches[0].match(/[a-f0-9]{64}/u)?.[0];
  const obsoleteDeclarations =
    worker.match(new RegExp(OBSOLETE_CACHES_MARKER.source, "gu")) || [];
  if (obsoleteDeclarations.length !== 1) {
    throw new Error(
      `sw.js must contain exactly one canonical obsolete-cache declaration; found ${obsoleteDeclarations.length}.`,
    );
  }
  const obsoleteCaches = [
    ...obsoleteDeclarations[0].matchAll(/  "([a-z0-9.-]+)",/gu),
  ].map((match) => match[1]);
  if (priorManifestHash !== manifestHash) {
    const priorPhysicalCache = `${CACHE_NAME}-${priorManifestHash}`;
    obsoleteCaches.push(priorPhysicalCache, `${priorPhysicalCache}-staging`);
  }
  const currentPhysicalCache = `${CACHE_NAME}-${manifestHash}`;
  const uniqueObsoleteCaches = [
    ...new Set(obsoleteCaches.filter(
      (cacheName) =>
        cacheName !== currentPhysicalCache
        && cacheName !== `${currentPhysicalCache}-staging`,
    )),
  ];
  const obsoleteDeclaration = [
    "const KNOWN_OBSOLETE_CACHES = Object.freeze([",
    ...uniqueObsoleteCaches.map((cacheName) => `  "${cacheName}",`),
    "]);",
  ].join("\n");
  return worker.replace(
    HASH_MARKER,
    `const RELEASE_MANIFEST_SHA256 = "${manifestHash}";`,
  ).replace(OBSOLETE_CACHES_MARKER, obsoleteDeclaration);
}

async function canonicalManifest() {
  const version = (await readFile(path.join(root, "VERSION"), "utf8")).trim();
  if (version !== RELEASE) throw new Error(`VERSION must be exactly ${RELEASE}; found ${version || "(empty)"}.`);
  const entries = [];
  for (const [entryPath, mime] of ENTRIES) {
    const bytes = await readFile(path.join(root, entryPath.slice(2)));
    entries.push({
      path: entryPath,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      mime,
      status: 200,
    });
  }
  return `${JSON.stringify({
    schemaVersion: 1,
    release: RELEASE,
    buildId: BUILD_ID,
    cacheName: CACHE_NAME,
    entryPath: "./index.html",
    excludedPaths: ["./release-shell-v1.json", "./sw.js"],
    entries,
  }, null, 2)}\n`;
}

function commandMode(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === "--check") {
    return { kind: "check" };
  }
  if (argumentsList.length === 1 && argumentsList[0] === "--write") {
    return { kind: "write" };
  }
  if (
    argumentsList.length === 2
    && argumentsList[0] === "--prepare-directory"
    && argumentsList[1].trim()
  ) {
    return {
      kind: "prepare",
      directory: path.resolve(process.cwd(), argumentsList[1]),
    };
  }
  throw new Error(
    "Usage: node tools/build-pwa-release-manifest.mjs "
    + "(--check | --write | --prepare-directory <empty-directory>)",
  );
}

async function restoreRootFiles(originalWorker, originalManifest) {
  const failures = [];
  try {
    await writeFile(workerPath, originalWorker, "utf8");
  } catch (error) {
    failures.push(`sw.js: ${error.message}`);
  }
  try {
    if (originalManifest === null) await rm(outputPath, { force: true });
    else await writeFile(outputPath, originalManifest, "utf8");
  } catch (error) {
    failures.push(`release-shell-v1.json: ${error.message}`);
  }
  if (failures.length) {
    throw new Error(`PWA manifest rollback failed (${failures.join("; ")}).`);
  }
}

async function assertPreparationTargetAbsent(targetPath) {
  try {
    await readFile(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Preparation target already exists: ${targetPath}`);
}

async function writeOwnedPreparationFile(targetPath, contents, createdPaths) {
  const handle = await open(targetPath, "wx");
  createdPaths.push(targetPath);
  try {
    await handle.writeFile(contents, "utf8");
  } finally {
    await handle.close();
  }
}

const expected = await canonicalManifest();
const expectedHash = sha256(Buffer.from(expected, "utf8"));
const mode = commandMode(process.argv.slice(2));
const worker = await readFile(workerPath, "utf8");
const boundWorker = bindWorkerToManifest(worker, expectedHash);

if (mode.kind === "check") {
  const actual = await readFile(outputPath, "utf8");
  if (actual !== expected) {
    throw new Error(
      "release-shell-v1.json is stale; freeze the candidate with "
      + "node tools/build-pwa-release-manifest.mjs --write",
    );
  }
  if (worker !== boundWorker) {
    throw new Error(
      "sw.js does not bind the exact release-shell-v1.json SHA-256; freeze the candidate with "
      + "node tools/build-pwa-release-manifest.mjs --write",
    );
  }
  process.stdout.write(`PWA release manifest verified: ${expectedHash}\n`);
} else if (mode.kind === "prepare") {
  if (mode.directory === root) {
    throw new Error("--prepare-directory must not be the repository root; use --write to freeze.");
  }
  await mkdir(mode.directory, { recursive: true });
  const preparedManifestPath = path.join(mode.directory, "release-shell-v1.json");
  const preparedWorkerPath = path.join(mode.directory, "sw.js");
  await Promise.all([
    assertPreparationTargetAbsent(preparedManifestPath),
    assertPreparationTargetAbsent(preparedWorkerPath),
  ]);
  const createdPaths = [];
  try {
    await writeOwnedPreparationFile(preparedWorkerPath, boundWorker, createdPaths);
    await writeOwnedPreparationFile(preparedManifestPath, expected, createdPaths);
  } catch (error) {
    await Promise.all(createdPaths.map((createdPath) => rm(createdPath, { force: true })));
    throw error;
  }
  process.stdout.write(
    `Prepared release-shell-v1.json and bound sw.js in ${mode.directory}: ${expectedHash}\n`,
  );
} else {
  const originalManifest = await readFile(outputPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  try {
    // Writing the worker first makes an interrupted freeze reject the older
    // manifest instead of accepting a manifest the worker did not bind.
    await writeFile(workerPath, boundWorker, "utf8");
    await writeFile(outputPath, expected, "utf8");
    const [writtenWorker, writtenManifest] = await Promise.all([
      readFile(workerPath, "utf8"),
      readFile(outputPath, "utf8"),
    ]);
    if (writtenWorker !== boundWorker || writtenManifest !== expected) {
      throw new Error("PWA release freeze did not round-trip exact bytes.");
    }
  } catch (error) {
    try {
      await restoreRootFiles(worker, originalManifest);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "PWA release freeze and rollback failed.");
    }
    throw error;
  }
  process.stdout.write(`Wrote release-shell-v1.json and bound sw.js to ${expectedHash}\n`);
}
