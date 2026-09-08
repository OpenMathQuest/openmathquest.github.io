import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Linter } from "eslint";
import { executableInlineScripts } from "./function-quality-metrics.mjs";
import {
  requireStatus,
  securityCommandResult,
  securityCommandTimeoutsMs,
} from "./security-command-runtime.mjs";

const markerSourceExtension = /\.(?:css|html|js|md|mjs|ps1|ya?ml)$/iu;
const embeddedManifestBlocks = Object.freeze([
  Object.freeze({ id: "CURRICULUM_MANIFEST_JSON", start: "/* ===CURRICULUM-MANIFEST-START=== */", end: "/* ===CURRICULUM-MANIFEST-END=== */" }),
  Object.freeze({ id: "TUTORIAL_MANIFEST_JSON", start: "/* ===TUTORIAL-MANIFEST-START=== */", end: "/* ===TUTORIAL-MANIFEST-END=== */" }),
]);

function normalizedAbsolute(value) {
  return path.resolve(value).toLowerCase();
}

function nestedValue(value, keys) {
  let current = value;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

function firstPresent(values, fallback = "") {
  const value = values.find((candidate) => candidate != null && candidate !== "");
  return value == null ? fallback : value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueMarkerIndex(source, marker) {
  const index = source.indexOf(marker);
  if (index !== -1 && source.indexOf(marker, index + marker.length) !== -1) {
    throw new Error("Embedded data marker is not unique: " + marker);
  }
  return index;
}

function elideManifestBlock(source, definition) {
  const start = uniqueMarkerIndex(source, definition.start);
  const end = uniqueMarkerIndex(source, definition.end);
  if (start === -1 && end === -1) return Object.freeze({ source, record: null });
  if (start === -1 || end <= start) throw new Error("Embedded data markers are incomplete for " + definition.id + ".");
  const blockEnd = end + definition.end.length;
  const block = source.slice(start, blockEnd);
  const valuePrefix = "const value=";
  const valueStart = block.indexOf(valuePrefix);
  const valueEnd = block.lastIndexOf(",freeze=input=>");
  if (valueStart === -1 || valueEnd <= valueStart) throw new Error("Embedded data binding is malformed for " + definition.id + ".");
  const literalStart = valueStart + valuePrefix.length;
  const literal = block.slice(literalStart, valueEnd);
  JSON.parse(literal);
  const replacement = block.slice(0, literalStart) + "{}" + block.slice(valueEnd);
  return Object.freeze({
    source: source.slice(0, start) + replacement + source.slice(blockEnd),
    record: Object.freeze({
      id: definition.id,
      validation: "JSON_PARSE_PASS",
      originalBytes: Buffer.byteLength(literal, "utf8"),
      originalSha256: sha256(Buffer.from(literal, "utf8")),
    }),
  });
}

export function elideValidatedEmbeddedManifestData(source) {
  let prepared = String(source);
  const records = [];
  for (const definition of embeddedManifestBlocks) {
    const result = elideManifestBlock(prepared, definition);
    prepared = result.source;
    if (result.record) records.push(result.record);
  }
  return Object.freeze({ source: prepared, records: Object.freeze(records) });
}

function parsedSourceCode(source, filename) {
  const linter = new Linter();
  const messages = linter.verify(source, [{
    languageOptions: { ecmaVersion: "latest", sourceType: "script" },
    rules: {},
  }], { filename });
  const errors = messages.filter((message) => message.fatal || message.severity === 2);
  if (errors.length) throw new Error("Engine segmentation requires an error-free JavaScript parse.");
  return linter.getSourceCode();
}

function engineBinding(sourceCode) {
  for (const statement of sourceCode.ast.body) {
    if (statement.type !== "VariableDeclaration") continue;
    const declarator = statement.declarations.find((candidate) => candidate.id?.name === "MathQuestEngine");
    const engineFunction = declarator?.init?.type === "CallExpression" ? declarator.init.callee : null;
    if (engineFunction?.type === "ArrowFunctionExpression" && engineFunction.body.type === "BlockStatement") {
      return Object.freeze({ statement, engineFunction });
    }
  }
  throw new Error("The marked engine script is missing its expected MathQuestEngine IIFE binding.");
}

function wrappedStatement(sourceCode, statement) {
  return Object.freeze({
    source: "function __mq_semgrep_segment__(){\n" + sourceCode.getText(statement) + "\n}\n",
    originalStartLine: statement.loc.start.line,
    originalEndLine: statement.loc.end.line,
  });
}

export function segmentMarkedEngineForSemgrep(source) {
  const text = String(source);
  if (!text.includes("/* ===ENGINE-START=== */")) return null;
  const sourceCode = parsedSourceCode(text, "marked-engine.js");
  const binding = engineBinding(sourceCode);
  const engineStatements = binding.engineFunction.body.body;
  const remainingStatements = sourceCode.ast.body.filter((statement) => statement !== binding.statement);
  const statements = [...engineStatements, ...remainingStatements];
  const segments = statements.map((statement) => wrappedStatement(sourceCode, statement));
  return Object.freeze({
    segments: Object.freeze(segments),
    record: Object.freeze({
      contract: "ESLINT_PARSED_ENGINE_TOP_LEVEL_STATEMENTS_V1",
      originalBytes: Buffer.byteLength(text, "utf8"),
      originalSha256: sha256(Buffer.from(text, "utf8")),
      executableStatements: statements.length,
      generatedSegments: segments.length,
      parseErrors: 0,
    }),
  });
}

function reviewedTool(policy, name) {
  const tool = policy.tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error("Reviewed security tool is missing: " + name + ".");
  return tool;
}

function isPortableArchiveMember(value) {
  const text = String(value);
  const segments = text.split("/");
  return !path.isAbsolute(text) && !text.includes("\\")
    && segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function archiveMemberSelection(artifact) {
  const executableRelativePath = artifact.executableRelativePath;
  if (!isPortableArchiveMember(executableRelativePath)) {
    throw new Error("Reviewed executable archive member must be a safe portable relative path.");
  }
  if (artifact.packaging === "TAR_GZIP") return executableRelativePath;
  if (artifact.packaging !== "ZIP_WHEEL") throw new Error("Reviewed artifact packaging is unsupported.");
  const directoryEnd = executableRelativePath.lastIndexOf("/");
  if (directoryEnd <= 0) throw new Error("Reviewed wheel executable must have a package directory.");
  return executableRelativePath.slice(0, directoryEnd + 1) + "*";
}

export function archiveExtractionArguments(artifactPath, destination, artifact) {
  return ["-xf", artifactPath, "-C", destination, archiveMemberSelection(artifact)];
}

async function extractArtifact(cachePath, tool, destination) {
  await mkdir(destination, { recursive: true });
  const artifactPath = path.join(cachePath, tool.artifact.filename);
  const argumentsList = archiveExtractionArguments(artifactPath, destination, tool.artifact);
  const result = securityCommandResult("tar", argumentsList, {
    timeoutMs: securityCommandTimeoutsMs.archiveExtraction,
  });
  requireStatus(result, [0], "Archive extraction for " + tool.name);
  const executablePath = path.join(destination, ...tool.artifact.executableRelativePath.split("/"));
  if (!existsSync(executablePath)) throw new Error(tool.name + " executable was absent after extraction.");
  return executablePath;
}

export async function prepareSecurityExecutables(policy, cachePath) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-security-tools-run-"));
  try {
    const semgrep = await extractArtifact(cachePath, reviewedTool(policy, "Semgrep"), path.join(temporaryRoot, "semgrep"));
    const truffleHog = await extractArtifact(cachePath, reviewedTool(policy, "TruffleHog"), path.join(temporaryRoot, "trufflehog"));
    return Object.freeze({ temporaryRoot, semgrep, truffleHog });
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function removePreparedSecurityExecutables(prepared) {
  await rm(prepared.temporaryRoot, { recursive: true, force: true });
}

function semgrepTarget(absolutePath, portablePath) {
  return ["CodeTarget", {
    path: { fpath: absolutePath, ppath: "/" + portablePath },
    analyzer: "javascript",
    products: ["sast"],
  }];
}

async function directSemgrepUnit(root, relativePath) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  return Object.freeze({
    target: semgrepTarget(absolutePath, relativePath),
    absolutePath,
    logicalPath: relativePath,
    lineOffset: 0,
  });
}

async function writeInlineScanUnit(input) {
  const absolutePath = path.join(input.inlineRoot, input.filename);
  await writeFile(absolutePath, input.source, "utf8");
  return Object.freeze({
    target: semgrepTarget(absolutePath, "__inline__/" + input.filename),
    absolutePath,
    logicalPath: input.unit.ownerPath,
    logicalUnit: input.unit.relativePath,
    lineOffset: input.lineOffset,
    ...input.metadata,
  });
}

async function engineInlineScanUnits(unit, inlineRoot, prefix, segmented, dataElisions) {
  return Promise.all(segmented.segments.map((segment, index) => {
    const filename = prefix + "-segment-" + String(index + 1).padStart(3, "0") + ".js";
    const metadata = index === 0 ? { dataElisions, segmentation: segmented.record } : {};
    const lineOffset = unit.lineOffset + segment.originalStartLine - 2;
    return writeInlineScanUnit({ unit, inlineRoot, filename, source: segment.source, lineOffset, metadata });
  }));
}

async function preparedInlineScanUnits(unit, index, inlineRoot) {
  const prefix = sha256(Buffer.from(unit.relativePath, "utf8")).slice(0, 16) + "-" + (index + 1);
  const prepared = elideValidatedEmbeddedManifestData(unit.source);
  const segmented = segmentMarkedEngineForSemgrep(prepared.source);
  if (segmented) return engineInlineScanUnits(unit, inlineRoot, prefix, segmented, prepared.records);
  return [await writeInlineScanUnit({
    unit, inlineRoot, filename: prefix + ".js", source: prepared.source, lineOffset: unit.lineOffset,
    metadata: { dataElisions: prepared.records },
  })];
}

async function inlineSemgrepUnits(root, relativePath, inlineRoot) {
  const html = await readFile(path.join(root, ...relativePath.split("/")), "utf8");
  const units = executableInlineScripts(html, relativePath);
  const prepared = await Promise.all(units.map((unit, index) => preparedInlineScanUnits(unit, index, inlineRoot)));
  return prepared.flat();
}

export async function buildSemgrepTargetPlan(root, paths, temporaryRoot) {
  const inlineRoot = path.join(temporaryRoot, "inline-scripts");
  await mkdir(inlineRoot, { recursive: true });
  const units = [];
  for (const relativePath of paths) {
    if (/\.(?:js|mjs)$/u.test(relativePath)) units.push(await directSemgrepUnit(root, relativePath));
    else if (relativePath.endsWith(".html")) units.push(...await inlineSemgrepUnits(root, relativePath, inlineRoot));
  }
  const targetPath = path.join(temporaryRoot, "semgrep-targets.json");
  await writeFile(targetPath, JSON.stringify(["Targets", units.map((unit) => unit.target)]), "utf8");
  const pathMap = new Map(units.map((unit) => [normalizedAbsolute(unit.absolutePath), unit]));
  const dataElisions = units.flatMap((unit) => (unit.dataElisions || []).map((record) => Object.freeze({
    path: unit.logicalPath,
    unit: unit.logicalUnit,
    ...record,
  })));
  const segmentations = units.filter((unit) => unit.segmentation).map((unit) => Object.freeze({
    path: unit.logicalPath,
    unit: unit.logicalUnit,
    ...unit.segmentation,
  }));
  return Object.freeze({
    targetPath, units: Object.freeze(units), pathMap,
    dataElisions: Object.freeze(dataElisions), segmentations: Object.freeze(segmentations),
  });
}

function variantName(value) {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object") return Object.keys(value)[0] || "UNKNOWN";
  return "UNKNOWN";
}

function semgrepError(error, pathMap) {
  const observedPath = firstPresent([
    nestedValue(error, ["location", "path"]),
    nestedValue(error, ["path"]),
  ]);
  const unit = observedPath ? pathMap.get(normalizedAbsolute(observedPath)) : null;
  return Object.freeze({
    type: variantName(firstPresent([error && error.error_type, error && error.type])),
    message: "Semgrep reported a parse or scan error; source-bearing diagnostics are redacted.",
    path: observedPath ? String(firstPresent([unit && unit.logicalPath, observedPath])) : null,
    line: Number(firstPresent([nestedValue(error, ["location", "start", "line"])], 0)) + Number(firstPresent([unit && unit.lineOffset], 0)),
  });
}

function semgrepFinding(result, pathMap) {
  const unit = pathMap.get(normalizedAbsolute(result.path));
  const logicalPath = firstPresent([unit && unit.logicalPath, result.path]);
  return Object.freeze({
    ruleId: String(result.check_id),
    path: String(logicalPath),
    unit: String(firstPresent([unit && unit.logicalUnit, logicalPath])),
    startLine: Number(firstPresent([nestedValue(result, ["start", "line"])], 0)) + Number(firstPresent([unit && unit.lineOffset], 0)),
    endLine: Number(firstPresent([nestedValue(result, ["end", "line"])], 0)) + Number(firstPresent([unit && unit.lineOffset], 0)),
    message: String(firstPresent([nestedValue(result, ["extra", "message"])], "Static-security rule matched.")),
  });
}

export function parseSemgrepReport(text, pathMap = new Map()) {
  const report = JSON.parse(String(text));
  const results = Array.isArray(report.results) ? report.results : [];
  const errors = Array.isArray(report.errors) ? report.errors : [];
  return Object.freeze({
    version: String(report.version || ""),
    findings: Object.freeze(results.map((result) => semgrepFinding(result, pathMap))),
    errors: Object.freeze(errors.map((error) => semgrepError(error, pathMap))),
    scannedTargets: Array.isArray(report.paths?.scanned) ? report.paths.scanned.length : 0,
  });
}

function semgrepArguments(rulesPath, targetPath) {
  return [
    "-json_nodots", "-rules", rulesPath, "-targets", targetPath,
    "-timeout", "30", "-timeout_threshold", "0", "-max_memory", "0", "-disable_rule_paths",
  ];
}

export async function runSemgrepScan(input) {
  const plan = await buildSemgrepTargetPlan(input.root, input.paths, input.temporaryRoot);
  const rulesPath = path.join(input.root, ...input.policy.semgrep.rulesPath.split("/"));
  const argumentsList = semgrepArguments(rulesPath, plan.targetPath);
  const result = requireStatus(securityCommandResult(input.executable, argumentsList, {
    cwd: input.root, timeoutMs: securityCommandTimeoutsMs.semgrep,
  }), [0], "Semgrep");
  const parsed = parseSemgrepReport(result.stdout, plan.pathMap);
  return Object.freeze({
    ...parsed,
    plannedTargets: plan.units.length,
    validatedDataElisions: plan.dataElisions,
    validatedSegmentations: plan.segmentations,
  });
}

function semgrepControlSource() {
  return [
    "eval(input);",
    "new Function(input);",
    "document.write(input);",
    "spawn(\"tool\", [], { shell: true });",
    "request({ rejectUnauthorized: false });",
    "process.env.NODE_TLS_REJECT_UNAUTHORIZED = \"0\";",
    "crypto.createHash(\"md5\");",
    "element.innerHTML = location.hash;",
    "",
  ].join("\n");
}

export async function runSemgrepNegativeControl(input) {
  const controlRoot = path.join(input.temporaryRoot, "semgrep-negative-control");
  await mkdir(controlRoot, { recursive: true });
  const sourcePath = path.join(controlRoot, "control.js");
  const targetPath = path.join(controlRoot, "targets.json");
  await writeFile(sourcePath, semgrepControlSource(), "utf8");
  await writeFile(targetPath, JSON.stringify(["Targets", [semgrepTarget(sourcePath, "control.js")]]), "utf8");
  const rulesPath = path.join(input.root, ...input.policy.semgrep.rulesPath.split("/"));
  const result = requireStatus(securityCommandResult(input.executable, semgrepArguments(rulesPath, targetPath), {
    cwd: input.root, timeoutMs: securityCommandTimeoutsMs.semgrepControl,
  }), [0], "Semgrep negative control");
  return parseSemgrepReport(result.stdout).findings.map((finding) => finding.ruleId).sort();
}

function escapeRegexPath(absolutePath) {
  const portable = absolutePath.replace(/\\/gu, "/");
  return portable.split("/").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[\\\\/]");
}

export function truffleHogIncludePatterns(root, paths) {
  return Object.freeze(paths.map((relativePath) => {
    const absolutePath = path.resolve(root, ...relativePath.split("/"));
    return "(?i)^" + escapeRegexPath(absolutePath) + "$";
  }));
}

function containedSnapshotPath(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, ...relativePath.split("/"));
  const withinRoot = path.relative(absoluteRoot, absolutePath);
  if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(".." + path.sep) || path.isAbsolute(withinRoot)) {
    throw new Error("TruffleHog snapshot path escapes its declared root.");
  }
  return absolutePath;
}

export async function createTruffleHogWorktreeSnapshot(root, paths, temporaryRoot) {
  const snapshotRoot = path.join(temporaryRoot, "trufflehog-worktree-snapshot");
  await mkdir(snapshotRoot, { recursive: true });
  const directories = new Set();
  const pathMap = new Map();
  for (const relativePath of paths) {
    const sourcePath = containedSnapshotPath(root, relativePath);
    const snapshotPath = containedSnapshotPath(snapshotRoot, relativePath);
    const directory = path.dirname(snapshotPath);
    if (!directories.has(directory)) {
      await mkdir(directory, { recursive: true });
      directories.add(directory);
    }
    await copyFile(sourcePath, snapshotPath);
    pathMap.set(normalizedAbsolute(snapshotPath), relativePath);
  }
  return Object.freeze({
    root: snapshotRoot,
    paths: Object.freeze([...paths]),
    pathMap,
  });
}

function truffleHogFinding(record, pathMap) {
  const data = firstPresent([nestedValue(record, ["SourceMetadata", "Data"])], {});
  const source = firstPresent([data.Filesystem, data.Git, data.GitHub], {});
  const observedPath = String(firstPresent([source.file, source.File]));
  const logicalPath = observedPath ? pathMap.get(normalizedAbsolute(observedPath)) : "";
  return Object.freeze({
    detector: String(firstPresent([record && record.DetectorName], "UNKNOWN")),
    decoder: String(firstPresent([record && record.DecoderName], "UNKNOWN")),
    verified: Boolean(record && record.Verified === true),
    path: String(firstPresent([logicalPath, observedPath])),
    line: Number(firstPresent([source.line, source.Line], 0)),
    commit: String(firstPresent([source.commit, source.Commit])),
  });
}

function jsonLines(text) {
  return String(text).split(/\r?\n/u).filter((line) => line.trim().startsWith("{")).map((line) => JSON.parse(line));
}

export function sanitizedTruffleHogFindings(text, pathMap = new Map()) {
  return Object.freeze(jsonLines(text).map((record) => truffleHogFinding(record, pathMap)));
}

function truffleHogScanSummary(stderr) {
  const records = jsonLines(stderr);
  const summary = records.findLast((record) => record.msg === "finished scanning") || {};
  return Object.freeze({
    chunks: Number(summary.chunks || 0),
    bytes: Number(summary.bytes || 0),
    verifiedFindings: Number(summary.verified_secrets || 0),
    unverifiedFindings: Number(summary.unverified_secrets || 0),
    toolVersion: String(summary.trufflehog_version || ""),
  });
}

function truffleHogCommonArguments(policy) {
  return [
    "--json", "--no-verification", "--results=unverified,unknown,verified",
    "--filter-entropy=" + policy.truffleHog.filterEntropy,
    "--no-update", "--fail-on-scan-errors", "--force-skip-binaries", "--force-skip-archives",
  ];
}

function truffleHogObservation(result, pathMap = new Map()) {
  return Object.freeze({
    findings: sanitizedTruffleHogFindings(result.stdout, pathMap),
    scan: truffleHogScanSummary(result.stderr),
  });
}

function truffleHogControlConfig() {
  return [
    "detectors:",
    "  - name: MathQuestGateControl",
    "    keywords:",
    "      - MATH_QUEST_SECURITY_NEGATIVE_CONTROL_DETECTED",
    "    regex:",
    "      marker: '(MATH_QUEST_SECURITY_NEGATIVE_CONTROL_DETECTED)'",
    "",
  ].join("\n");
}

export async function runTruffleHogWorktreeScan(input, commandResult = securityCommandResult) {
  const includePath = path.join(input.temporaryRoot, "trufflehog-include-paths.txt");
  await writeFile(includePath, truffleHogIncludePatterns(input.snapshot.root, input.snapshot.paths).join("\n") + "\n", "utf8");
  const argumentsList = [
    "filesystem", input.snapshot.root, "--include-paths=" + includePath,
    ...truffleHogCommonArguments(input.policy),
  ];
  const result = requireStatus(commandResult(input.executable, argumentsList, {
    cwd: input.snapshot.root, timeoutMs: securityCommandTimeoutsMs.truffleHogWorktree,
  }), [0], "TruffleHog worktree scan");
  return Object.freeze({
    ...truffleHogObservation(result, input.snapshot.pathMap),
    snapshot: Object.freeze({ mode: "BYTE_FOR_BYTE_SYSTEM_TEMP_COPY", paths: input.snapshot.paths.length }),
  });
}

function truffleHogHistoryObservation(result, historyScope) {
  return Object.freeze({
    ...truffleHogObservation(result),
    historyScope: Object.freeze(historyScope),
  });
}

export function runTruffleHogHistoryScan(input, commandResult = securityCommandResult) {
  const startCommit = input.policy.truffleHog.historyStartCommit;
  const range = startCommit + "..HEAD";
  const countResult = requireStatus(commandResult("git", ["rev-list", "--count", range], {
    cwd: input.root, timeoutMs: securityCommandTimeoutsMs.gitHistoryScope,
  }), [0], "Git history scope");
  if (!/^\d+\s*$/u.test(countResult.stdout)) throw new Error("Git history scope did not return an exact commit count.");
  const commitCount = Number(countResult.stdout.trim());
  if (!Number.isSafeInteger(commitCount)) throw new Error("Git history scope commit count is unsafe.");
  const historyScope = {
    startCommit,
    endRef: "HEAD",
    commitCount,
    status: commitCount === 0 ? "NO_COMMITS_AFTER_BASELINE" : "SCANNED",
  };
  if (commitCount === 0) {
    return truffleHogHistoryObservation({ stdout: "", stderr: "" }, historyScope);
  }
  const repositoryUri = "file://" + input.root.replace(/\\/gu, "/");
  const argumentsList = [
    "git", repositoryUri, "--since-commit=" + startCommit,
    ...truffleHogCommonArguments(input.policy),
  ];
  const result = requireStatus(commandResult(input.executable, argumentsList, {
    cwd: input.root, timeoutMs: securityCommandTimeoutsMs.truffleHogHistory,
  }), [0], "TruffleHog history scan");
  return truffleHogHistoryObservation(result, historyScope);
}

export async function runTruffleHogNegativeControl(input) {
  const controlRoot = path.join(input.temporaryRoot, "trufflehog-negative-control");
  await mkdir(controlRoot, { recursive: true });
  const configPath = path.join(controlRoot, "config.yml");
  const sourcePath = path.join(controlRoot, "control.txt");
  await writeFile(configPath, truffleHogControlConfig(), "utf8");
  await writeFile(sourcePath, "MATH_QUEST_SECURITY_NEGATIVE_CONTROL_DETECTED\n", "utf8");
  const argumentsList = [
    "filesystem", sourcePath, "--config=" + configPath, "--fail",
    ...truffleHogCommonArguments(input.policy),
  ];
  const result = requireStatus(securityCommandResult(input.executable, argumentsList, {
    cwd: input.root, timeoutMs: securityCommandTimeoutsMs.truffleHogControl,
  }), [183], "TruffleHog negative control");
  return truffleHogObservation(result);
}

export function markerSourceFiles(paths) {
  return Object.freeze(paths.filter((relativePath) => markerSourceExtension.test(relativePath)));
}

export async function readMarkerSources(root, paths) {
  return Promise.all(markerSourceFiles(paths).map(async (relativePath) => Object.freeze({
    path: relativePath,
    text: await readFile(path.join(root, ...relativePath.split("/")), "utf8"),
  })));
}
