import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadShippedEngine } from "./engine-loader.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const governedSourceExtension = /\.(?:css|html|js|mjs|ps1)$/u;
const compiledAssetExtension = /\.(?:gif|ico|jpe?g|mp3|mp4|ogg|otf|png|ttf|wav|webm|webp|woff2?)$/iu;
const productionPayloadPath = /^(?:assets\/|audit\.html$|index\.html$|manifest\.webmanifest$|release-shell-v1\.json$|sw\.js$)/u;
const repositoryPathTimeoutMs = 30_000;

export function repositoryPaths(root = repositoryRoot) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024 * 1024,
    timeout: repositoryPathTimeoutMs,
    windowsHide: true,
  }).split("\0").filter(Boolean).sort();
}

function sourceLineCount(text) {
  const normalized = String(text);
  return normalized.split(/\r?\n/u).length - (normalized.endsWith("\n") ? 1 : 0);
}

export function sourceLineMeasurements(root = repositoryRoot, paths = repositoryPaths(root)) {
  return Object.fromEntries(paths
    .filter((relativePath) => governedSourceExtension.test(relativePath))
    .map((relativePath) => [
      relativePath,
      sourceLineCount(readFileSync(path.join(root, ...relativePath.split("/")), "utf8")),
    ]));
}

function inlineBuffers(html, expression) {
  return [...html.matchAll(expression)].map((match) => Buffer.from(match[1], "utf8"));
}

function buffersForPaths(root, paths) {
  return paths.map((relativePath) => readFileSync(path.join(root, ...relativePath.split("/"))));
}

export function shippedByteArtifacts(root = repositoryRoot, paths = repositoryPaths(root)) {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const stylesheetPaths = paths.filter((relativePath) => relativePath.endsWith(".css"));
  const compiledAssetPaths = paths.filter((relativePath) => relativePath.startsWith("assets/") && compiledAssetExtension.test(relativePath));
  const payloadPaths = paths.filter((relativePath) => productionPayloadPath.test(relativePath));
  return Object.freeze({
    stylesheetBytes: Buffer.concat([
      ...inlineBuffers(html, /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/giu),
      ...buffersForPaths(root, stylesheetPaths),
    ]),
    javascriptBytes: Buffer.concat([
      ...inlineBuffers(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/giu),
      readFileSync(path.join(root, "sw.js")),
    ]),
    compiledAssetBytes: Buffer.concat(buffersForPaths(root, compiledAssetPaths)),
    productionPayloadBytes: Buffer.concat(buffersForPaths(root, payloadPaths)),
  });
}

export function shippedByteMeasurements(root = repositoryRoot, paths = repositoryPaths(root)) {
  const artifacts = shippedByteArtifacts(root, paths);
  return Object.freeze(Object.fromEntries(Object.entries(artifacts).map(([name, bytes]) => [name, bytes.length])));
}

function executeEngineScenarioRepeat(engine, repeat) {
  let executions = 0;
  for (const skill of engine.SKILLS) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (const ordinal of [0, 1]) {
        const representations = Array.isArray(skill.representations) ? skill.representations : [];
        const question = engine.makeQuestion({
          skillId: skill.skillId,
          tier,
          representation: representations[0] ?? (skill.phases.includes("P") ? "PICTORIAL" : "ABSTRACT"),
          seed: 0x51f15e + repeat,
          ordinal,
        });
        engine.validateQuestionContract(question);
        engine.makeTeachingSupport(question);
        executions += 1;
      }
    }
  }
  return executions;
}

export async function engineScenarioMeasurement(root = repositoryRoot) {
  const { engine } = await loadShippedEngine(path.join(root, "index.html"));
  const startedAt = performance.now();
  let executions = 0;
  for (let repeat = 0; repeat < 10; repeat += 1) {
    executions += executeEngineScenarioRepeat(engine, repeat);
  }
  return Object.freeze({ executions, wallTimeMs: Math.ceil(performance.now() - startedAt) });
}
