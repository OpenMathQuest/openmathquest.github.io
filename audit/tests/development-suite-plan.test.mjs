import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEVELOPMENT_SUITE_IDS, planDevelopmentSuites } from "../lib/development-suite-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("no paths and unknown paths fail safe to the broad suite", () => {
  assert.deepEqual(planDevelopmentSuites([]).suites, DEVELOPMENT_SUITE_IDS);
  const unknown = planDevelopmentSuites(["unexpected/new-runtime.xyz"]);
  assert.equal(unknown.mode, "BROAD_UNKNOWN_PATH");
  assert.deepEqual(unknown.unknownPaths, ["unexpected/new-runtime.xyz"]);
  assert.deepEqual(unknown.suites, DEVELOPMENT_SUITE_IDS);
});

test("documentation-only work avoids product and engine execution", () => {
  const plan = planDevelopmentSuites(["docs/release/readiness.md"]);
  assert.equal(plan.mode, "FOCUSED_CHANGED_PATHS");
  assert.deepEqual(plan.suites, ["governance", "metadata", "guard"]);
});

test("single-file product changes select every affected independent layer", () => {
  const plan = planDevelopmentSuites(["index.html"]);
  for (const id of ["governance", "metadata", "product", "pwa", "engine", "tutorial", "driftless", "playwright", "guard"]) {
    assert.equal(plan.suites.includes(id), true, id);
  }
  assert.equal(plan.suites.includes("canary"), false);
  assert.equal(plan.suites.includes("launcher"), false);
});

test("launcher, canary, and engine routes remain distinct", () => {
  assert.equal(planDevelopmentSuites(["Serve-MathQuest.ps1"]).suites.includes("launcher"), true);
  assert.equal(planDevelopmentSuites(["Serve-MathQuest.ps1"]).suites.includes("playwright"), true);
  assert.equal(planDevelopmentSuites(["audit/run-trusted-https-canary.mjs"]).suites.includes("canary"), true);
  assert.equal(planDevelopmentSuites(["curriculum/math-quest-manifest-v1.json"]).suites.includes("engine"), true);
  assert.equal(planDevelopmentSuites(["curriculum/math-quest-manifest-v1.json"]).suites.includes("tutorial"), true);
  const tutorialManifest = planDevelopmentSuites(["curriculum/math-quest-tutorial-manifest-v1.json"]);
  assert.equal(tutorialManifest.suites.includes("tutorial"), true);
  assert.equal(tutorialManifest.suites.includes("driftless"), true);
  assert.equal(tutorialManifest.suites.includes("pwa"), true);
  const nodeEngine = planDevelopmentSuites(["audit/tests/node-engine.test.mjs"]);
  assert.equal(nodeEngine.mode, "FOCUSED_CHANGED_PATHS");
  assert.equal(nodeEngine.suites.includes("engine"), true);
  const curriculumSync = planDevelopmentSuites(["tools/sync-curriculum-manifest.mjs"]);
  assert.equal(curriculumSync.mode, "FOCUSED_CHANGED_PATHS");
  assert.equal(curriculumSync.suites.includes("engine"), true);
  assert.equal(curriculumSync.suites.includes("tutorial"), true);
});

test("VERSION routes every consumer of the current product identity", () => {
  const plan = planDevelopmentSuites(["VERSION"]);
  assert.equal(plan.mode, "FOCUSED_CHANGED_PATHS");
  for (const id of ["governance", "metadata", "launcher", "product", "pwa", "canary", "engine", "driftless", "playwright", "guard"]) {
    assert.equal(plan.suites.includes(id), true, id);
  }
  assert.equal(plan.suites.includes("tutorial"), false);
});

test("driftless maps and blast-radius controls select their shared focused gate", () => {
  for (const file of [
    "AGENTS.md",
    "audit/repository-code-map-v1.json",
    "audit/run-audit.mjs",
    "audit/verify-github-gate-enforcement.mjs",
    "audit/tests/audit-orchestration.test.mjs",
    "curriculum/math-quest-feature-map-v1.json",
    "tools/blast-radius-lookup.mjs",
    "audit/tests/feature-map.test.mjs",
  ]) {
    const plan = planDevelopmentSuites([file]);
    assert.equal(plan.suites.includes("driftless"), true, file);
    assert.equal(plan.mode, "FOCUSED_CHANGED_PATHS", file);
  }
});

test("Playwright Test changes select only the focused browser and shared policy layers", () => {
  const config = planDevelopmentSuites(["playwright.config.mjs"]);
  assert.deepEqual(config.suites, ["governance", "metadata", "playwright", "guard"]);
  const dependency = planDevelopmentSuites(["package-lock.json"]);
  assert.equal(dependency.suites.includes("canary"), true);
  assert.equal(dependency.suites.includes("playwright"), true);
  for (const file of [
    "playwright.deep-ux.config.mjs",
    "audit/lib/playwright-deep-ux-census.mjs",
    "audit/playwright/deep-ux-census.spec.mjs",
    "audit/run-playwright-deep-ux-census.mjs",
    "audit/tests/playwright-deep-ux-census.test.mjs",
  ]) assert.equal(planDevelopmentSuites([file]).suites.includes("playwright"), true, file);
});

test("unclassified files inside familiar directories fail safe to broad", () => {
  for (const file of [
    "audit/lib/unclassified.mjs",
    "tools/unclassified.mjs",
    ".github/unclassified.txt",
  ]) {
    const plan = planDevelopmentSuites([file]);
    assert.equal(plan.mode, "BROAD_UNKNOWN_PATH", file);
    assert.deepEqual(plan.suites, DEVELOPMENT_SUITE_IDS, file);
  }
});

test("every runtime asset change revalidates product and PWA shell bytes", () => {
  const plan = planDevelopmentSuites(["assets/sounds/confirm.wav"]);
  assert.equal(plan.suites.includes("product"), true);
  assert.equal(plan.suites.includes("pwa"), true);
  assert.equal(plan.suites.includes("playwright"), true);
});

test("path normalization, deduplication, and ordering are deterministic", () => {
  const plan = planDevelopmentSuites([".\\index.html", "index.html", "docs\\release\\readiness.md"]);
  assert.deepEqual(plan.changedPaths, ["docs/release/readiness.md", "index.html"]);
});

test("watcher uses a quiet-period batch and passes the complete path set once", async () => {
  const watcher = await readFile(path.join(root, "audit", "on-change-audit.ps1"), "utf8");
  assert.match(watcher, /HashSet\[string\]/u);
  assert.match(watcher, /quietDeadline/u);
  assert.match(watcher, /WaitForChanged/u);
  assert.match(watcher, /Invoke-DevelopmentChecks -ChangedPaths/u);
  assert.match(watcher, /OldName/u);
  assert.match(watcher, /__rename_unknown__/u);
  assert.doesNotMatch(watcher, /Start-Sleep -Milliseconds 750[\s\S]*Invoke-DevelopmentChecks/iu);
});
