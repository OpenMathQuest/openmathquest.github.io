import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Linter } from "eslint";
import {
  NEW_FUNCTION_LIMITS,
  executableInlineScripts,
  functionQualityCensus,
} from "../lib/function-quality-metrics.mjs";

const representativeSource = [
  "export function branchy(a = 0, b) {",
  "  let total = 0;",
  "  if (a && b) total += 1;",
  "  for (let i = 0; i < 3; i += 1) {",
  "    total += i;",
  "  }",
  "  return choose(total ? a : b);",
  "}",
  "",
].join("\n");

function eslintComplexity(source) {
  const linter = new Linter();
  const messages = linter.verify(source, [{
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: { complexity: ["error", { max: 0, variant: "classic" }] },
  }], { filename: "representative.mjs" });
  const match = messages.find((message) => message.ruleId === "complexity")?.message.match(/complexity of (\d+)/u);
  return Number(match?.[1]);
}

test("function census reproduces ESLint classic complexity and fixed ABC semantics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mq-function-metrics-"));
  try {
    await writeFile(path.join(root, "representative.mjs"), representativeSource, "utf8");
    const report = functionQualityCensus(root, ["representative.mjs"]);
    assert.deepEqual(report.parseErrors, []);
    assert.equal(report.functions, 1);
    const row = report.rows[0];
    assert.equal(row.cyclomatic, 6);
    assert.equal(row.cyclomatic, eslintComplexity(representativeSource));
    assert.deepEqual(
      { assignments: row.assignments, branches: row.branches, conditions: row.conditions, abcMagnitude: row.abcMagnitude },
      { assignments: 6, branches: 1, conditions: 5, abcMagnitude: 7.87 },
    );
    assert.equal(row.cognitive, 4);
    assert.equal(row.maxNesting, 1);
    assert.deepEqual(row.thresholdViolations, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("executable HTML script discovery excludes data and external scripts", () => {
  const html = [
    "<script type=\"application/json\">{\"not\":\"code\"}</script>",
    "<script src=\"external.js\"></script>",
    "<script>const local = () => true;</script>",
  ].join("\n");
  const scripts = executableInlineScripts(html, "sample.html");
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].relativePath, "sample.html#inline-script-1");
  assert.equal(scripts[0].lineOffset, 2);
});

test("function census measures executable inline HTML instead of silently ignoring its virtual filename", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mq-inline-function-metrics-"));
  try {
    await writeFile(path.join(root, "sample.html"), [
      "<!doctype html>",
      "<script type=\"application/json\">{\"not\":\"code\"}</script>",
      "<script>function measuredInline(value) { return value ? 1 : 0; }</script>",
      "",
    ].join("\n"), "utf8");
    const report = functionQualityCensus(root, ["sample.html"]);
    assert.deepEqual(report.parseErrors, []);
    assert.equal(report.functions, 1);
    assert.equal(report.rows[0].functionId, "sample.html#inline-script-1::measuredInline#1");
    assert.equal(report.rows[0].startLine, 3);
    assert.equal(report.rows[0].cyclomatic, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cyclomatic negative control crosses the immutable new-function limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mq-function-mutant-"));
  const mutant = "export const mutant = () => a && b && c && d && e && f && g && h && i && j && k;\n";
  try {
    await writeFile(path.join(root, "mutant.mjs"), mutant, "utf8");
    const row = functionQualityCensus(root, ["mutant.mjs"]).rows[0];
    assert.equal(row.cyclomatic, 11);
    assert.equal(row.thresholdViolations.some((item) => item.metric === "cyclomatic"), true);
    assert.equal(NEW_FUNCTION_LIMITS.cyclomatic, 10);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
