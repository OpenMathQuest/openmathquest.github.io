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
  for (const id of ["governance", "metadata", "product", "pwa", "engine", "guard"]) {
    assert.equal(plan.suites.includes(id), true, id);
  }
  assert.equal(plan.suites.includes("canary"), false);
  assert.equal(plan.suites.includes("launcher"), false);
});

test("launcher, canary, and engine routes remain distinct", () => {
  assert.equal(planDevelopmentSuites(["Serve-MathQuest.ps1"]).suites.includes("launcher"), true);
  assert.equal(planDevelopmentSuites(["audit/run-trusted-https-canary.mjs"]).suites.includes("canary"), true);
  assert.equal(planDevelopmentSuites(["curriculum/math-quest-manifest-v1.json"]).suites.includes("engine"), true);
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
