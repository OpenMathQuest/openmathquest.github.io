import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";
import { securityCommandResult } from "./lib/security-command-runtime.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const commandTimeoutMs = 60_000;

async function installedSourceBinding(dependencyRoot, contract) {
  for (const file of contract.files) {
    const bytes = await readFile(path.join(dependencyRoot, contract.packagePath, file.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== file.sha256) throw new Error(`Installed guarded dependency differs from reviewed source: ${file.path}`);
  }
  return { status: "PASS", files: contract.files.length, sourceCommit: contract.sourceCommit };
}

async function createFixtures(directory) {
  const files = {
    "valid.css": "a { color: red; }\n",
    "invalid.css": "a { colro: red; }\n",
    "valid.md": "# Heading\n\nText.\n",
    "invalid.md": "# Heading\n\n### Skipped heading level\n",
    ".stylelintrc.json": JSON.stringify({ rules: { "property-no-unknown": true } }),
    ".markdownlint-cli2.jsonc": JSON.stringify({ config: { default: false, MD001: true } }),
  };
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(path.join(directory, name), text)));
}

function runLinter(dependencyRoot, directory, tool, pattern) {
  const entry = tool === "stylelint"
    ? "node_modules/stylelint/bin/stylelint.mjs"
    : "node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs";
  const args = [path.join(dependencyRoot, entry), pattern];
  if (tool === "stylelint") args.push("--formatter=json", "--config=" + path.join(directory, ".stylelintrc.json"));
  return securityCommandResult(process.execPath, args, { cwd: directory, timeoutMs: commandTimeoutMs });
}

function requireResult(result, status, matched, label) {
  if (result.status !== status || !matched) {
    throw new Error(`${label} failed (exit ${result.status}):\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function stylelintRows(result) {
  let rows;
  try { rows = JSON.parse(result.stderr); }
  catch { throw new Error(`Stylelint did not return JSON:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`); }
  return rows.map((row) => ({
    file: path.basename(row.source),
    warnings: row.warnings.map(({ rule, severity }) => ({ rule, severity })),
  })).sort((left, right) => left.file.localeCompare(right.file, "en"));
}

function nestedFilePattern(depth, extension) {
  return "{valid,".repeat(depth) + "invalid" + "}".repeat(depth) + extension;
}

function checkStylelint(dependencyRoot, directory, maximumDepth) {
  const valid = runLinter(dependencyRoot, directory, "stylelint", "valid.css");
  requireResult(valid, 0, JSON.stringify(stylelintRows(valid)) === JSON.stringify([
    { file: "valid.css", warnings: [] },
  ]), "Stylelint valid-file selection");
  for (const pattern of ["{valid,invalid}.css", nestedFilePattern(maximumDepth, ".css")]) {
    const invalid = runLinter(dependencyRoot, directory, "stylelint", pattern);
    requireResult(invalid, 2, JSON.stringify(stylelintRows(invalid)) === JSON.stringify([
      { file: "invalid.css", warnings: [{ rule: "property-no-unknown", severity: "error" }] },
      { file: "valid.css", warnings: [] },
    ]), "Stylelint brace expansion and real rule failure");
  }
  return { validFiles: 1, expandedFiles: 2, detectedViolations: 1, acceptedDepthBoundary: maximumDepth };
}

function checkMarkdownlint(dependencyRoot, directory, maximumDepth) {
  const valid = runLinter(dependencyRoot, directory, "markdownlint", "valid.md");
  const validOutput = valid.stdout + valid.stderr;
  requireResult(valid, 0, /Linting: 1 file\b/u.test(validOutput) && /Summary: 0/u.test(validOutput), "Markdownlint valid-file selection");
  for (const pattern of ["{valid,invalid}.md", nestedFilePattern(maximumDepth, ".md")]) {
    const invalid = runLinter(dependencyRoot, directory, "markdownlint", pattern);
    const invalidOutput = invalid.stdout + invalid.stderr;
    requireResult(invalid, 1, /Linting: 2 files/u.test(invalidOutput) && /invalid\.md:3.*MD001/u.test(invalidOutput), "Markdownlint brace expansion and real rule failure");
  }
  return { validFiles: 1, expandedFiles: 2, detectedViolations: 1, acceptedDepthBoundary: maximumDepth };
}

function checkDepthRejection(dependencyRoot, directory, maximumDepth) {
  const pattern = "{".repeat(4000) + "valid,invalid" + "}".repeat(4000);
  for (const tool of ["stylelint", "markdownlint"]) {
    const suffix = tool === "stylelint" ? ".css" : ".md";
    const result = runLinter(dependencyRoot, directory, tool, pattern + suffix);
    const output = result.stdout + result.stderr;
    const diagnostic = `Input depth (${maximumDepth + 1}), exceeds max depth (${maximumDepth})`;
    const exitCode = tool === "stylelint" ? 1 : 2;
    requireResult(result, exitCode, output.includes(diagnostic) && !/Maximum call stack size exceeded/u.test(output), tool + " controlled depth rejection");
  }
  return { passed: true, tools: 2, inputDepth: 4000, admittedDepthLimit: maximumDepth };
}

async function removeFixtures(directory, prefix) {
  if (!path.resolve(directory).startsWith(prefix)) throw new Error("Compatibility fixture cleanup escaped its owned prefix.");
  await rm(directory, { recursive: true, force: true });
}

async function checkSourceTamper(dependencyRoot, directory, contract) {
  const alteredRoot = path.join(directory, "altered-installation");
  const packageRoot = path.join(alteredRoot, contract.packagePath);
  for (const file of contract.files) {
    const destination = path.join(packageRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(dependencyRoot, contract.packagePath, file.path), destination);
  }
  const changedFile = path.join(packageRoot, "lib", "compile.js");
  await writeFile(changedFile, (await readFile(changedFile, "utf8")) + "\n");
  const result = securityCommandResult(process.execPath, [fileURLToPath(import.meta.url), alteredRoot], {
    cwd: root, timeoutMs: commandTimeoutMs,
  });
  const report = JSON.parse(result.stdout);
  const detected = report.status === "FAIL"
    && report.findings?.some((finding) => finding.includes("differs from reviewed source: lib/compile.js"));
  requireResult(result, 1, detected, "Native installed-source tamper rejection");
  return { id: "NC-CI-GLOB-SOURCE-TAMPER", passed: true, changedFiles: 1 };
}

export async function runCiDependencyCompatibility(dependencyRoot = root) {
  const policy = await loadQualityGatePolicy();
  const contract = policy.supplyChain.guardedBraces;
  const binding = await installedSourceBinding(dependencyRoot, contract);
  const prefix = path.join(path.resolve(os.tmpdir()), "mq-ci-dependency-");
  const directory = await mkdtemp(prefix);
  try {
    await createFixtures(directory);
    const stylelint = checkStylelint(dependencyRoot, directory, contract.maximumDepth);
    const markdownlint = checkMarkdownlint(dependencyRoot, directory, contract.maximumDepth);
    const negativeControl = { id: contract.negativeControlId, ...checkDepthRejection(dependencyRoot, directory, contract.maximumDepth) };
    const sourceTamperControl = await checkSourceTamper(dependencyRoot, directory, contract);
    return { schemaVersion: 1, status: "PASS", advisory: contract.advisory, binding, stylelint, markdownlint, negativeControl, sourceTamperControl };
  } finally {
    await removeFixtures(directory, prefix);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runCiDependencyCompatibility(process.argv[2] ? path.resolve(process.argv[2]) : root);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ schemaVersion: 1, status: "FAIL", findings: [error.message] }, null, 2) + "\n");
    process.exitCode = 1;
  }
}
