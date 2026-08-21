import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractEngine } from "./lib/engine-loader.mjs";
import { ENGINE_BRANCH_COVERAGE_MINIMUM_PERCENT } from "./lib/gate-integrity-policy.mjs";
import { calibrateNativeCoverage, findCoverageRow, runNativeCoverage } from "./lib/native-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MINIMUM_ENGINE_BRANCH_COVERAGE_PCT = ENGINE_BRANCH_COVERAGE_MINIMUM_PERCENT;

function probeNode24(nodePath) {
  const probe = spawnSync(nodePath, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  const version = String(probe.stdout || "").trim();
  return { version, ok: probe.status === 0 && /^v24\./u.test(version), status: probe.status, error: probe.error ? String(probe.error) : null };
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateStructuredAudit(value, engineSha256) {
  const issues = [];
  if (!exactKeys(value, ["schemaVersion", "artifactKind", "complete", "engine", "semantic"])) issues.push("structured audit root is not closed");
  if (value?.schemaVersion !== 1 || value?.artifactKind !== "MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1" || value?.complete !== true) issues.push("structured audit identity is invalid");
  if (!exactKeys(value?.engine, ["sha256", "summary", "results", "effectMap", "childStringCandidateSha256", "childStringConstants"])) issues.push("structured engine result is not closed");
  if (value?.engine?.sha256 !== engineSha256) issues.push("structured engine SHA does not match the exact staged engine");
  if (!Array.isArray(value?.engine?.results) || value.engine.results.length === 0) issues.push("structured engine results are absent");
  if (!exactKeys(value?.engine?.summary, ["PASS", "FAIL", "SKIP", "total", "requiredFailures"])
    || value.engine.summary.PASS !== 43 || value.engine.summary.FAIL !== 0
    || value.engine.summary.SKIP !== 0 || value.engine.summary.total !== 43
    || value.engine.summary.requiredFailures !== 0) issues.push("structured engine summary is not an exact all-pass result");
  if (!Array.isArray(value?.engine?.results) || value.engine.results.length !== 43
    || new Set(value.engine.results.map((result) => result?.id)).size !== 43
    || value.engine.results.some((result) => result?.status !== "PASS")) issues.push("structured engine assertions are not 43 unique passes");
  if (!/^[a-f0-9]{64}$/u.test(value?.engine?.childStringCandidateSha256 || "")) issues.push("structured child-string candidate digest is invalid");
  if (!exactKeys(value?.engine?.childStringConstants, ["pendingApproval", "approvalSha256"])) issues.push("structured child-string constants are not closed");
  if (!exactKeys(value?.semantic, ["assertions", "summary", "failures", "contractPass"])) issues.push("structured semantic result is not closed");
  if (!Array.isArray(value?.semantic?.assertions) || value.semantic.assertions.length === 0 || value.semantic.contractPass !== true) issues.push("structured semantic results are incomplete");
  if (!exactKeys(value?.semantic?.summary, ["total", "passed", "failed", "skills", "taskTypes", "questions"])
    || value.semantic.summary.total !== 130 || value.semantic.summary.passed !== 130
    || value.semantic.summary.failed !== 0 || value.semantic.summary.skills !== 126
    || value.semantic.summary.taskTypes !== 166 || value.semantic.summary.questions !== 6_048) issues.push("structured semantic summary is not the exact approved all-pass contract");
  if (!Array.isArray(value?.semantic?.assertions) || value.semantic.assertions.length !== 130
    || new Set(value.semantic.assertions.map((assertion) => assertion?.id)).size !== 130
    || value.semantic.assertions.some((assertion) => assertion?.status !== "PASS")
    || !Array.isArray(value.semantic.failures) || value.semantic.failures.length !== 0) issues.push("structured semantic assertions are not 130 unique passes");
  if (value?.engine?.results?.length !== 43) issues.push("structured engine result count is not 43");
  if (value?.semantic?.assertions?.length !== 130) issues.push("structured semantic result count is not 130");
  return { valid: issues.length === 0, issues };
}

function sourceLocation(source, offset) {
  const before = source.slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  const lastBreak = before.lastIndexOf("\n");
  return { line, column: offset - lastBreak };
}

function uncoveredBranchRanges(source, script) {
  const unique = new Map();
  for (const fn of script.functions || []) {
    for (const range of (fn.ranges || []).slice(1)) {
      if (Number(range.count) > 0) continue;
      const key = `${range.startOffset}:${range.endOffset}`;
      if (unique.has(key)) continue;
      const start = sourceLocation(source, range.startOffset);
      const end = sourceLocation(source, range.endOffset);
      unique.set(key, {
        functionName: fn.functionName || "(anonymous)",
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
        snippet: source
          .slice(range.startOffset, Math.min(range.endOffset, range.startOffset + 240))
          .replace(/\s+/gu, " ")
          .trim(),
      });
    }
  }
  return [...unique.values()].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
}

async function nativeBranchRangeTotals(directory, suffix, source) {
  const matches = [];
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    let payload;
    try { payload = JSON.parse(await readFile(path.join(directory, name), "utf8")); } catch { continue; }
    for (const script of payload.result || []) {
      const url = String(script.url || "").replace(/\\/gu, "/");
      if (!url.toLowerCase().endsWith(suffix.toLowerCase())) continue;
      matches.push(script);
    }
  }
  if (!matches.length) return {
    virtualFilenameObserved: false,
    virtualFilename: null,
    rawVirtualUrl: null,
    scriptInstanceCount: 0,
    rangeMapsIdentical: false,
    sourceSpanMatches: false,
    aggregationError: "No exact staged-engine coverage script was observed.",
    branchTotal: 0,
    branchCovered: 0,
    branchMetric: "native V8 non-root block ranges",
    uncoveredBranchRangeCount: 0,
    uncoveredBranchRanges: [],
    uncoveredBranchRangesTruncated: false,
    uncoveredBranchFunctions: [],
  };

  const rangeMap = (script) => JSON.stringify((script.functions || []).map((fn) => ({
    functionName: fn.functionName || "",
    isBlockCoverage: fn.isBlockCoverage === true,
    ranges: (fn.ranges || []).map((range) => [range.startOffset, range.endOffset]),
  })));
  const firstMap = rangeMap(matches[0]);
  const rangeMapsIdentical = matches.every((script) => rangeMap(script) === firstMap);
  const normalizedUrls = new Set(matches.map((script) => String(script.url || "").replace(/\\/gu, "/").toLowerCase()));
  const sourceSpanMatches = matches.every((script) => {
    const rootRange = script.functions?.[0]?.ranges?.[0];
    return rootRange?.startOffset === 0 && rootRange?.endOffset === source.length;
  });
  let aggregationError = null;
  if (!rangeMapsIdentical) aggregationError = "Exact-URL coverage scripts exposed mismatched function/range maps.";
  else if (normalizedUrls.size !== 1) aggregationError = "Coverage scripts matched the suffix but did not share one exact virtual URL.";
  else if (!sourceSpanMatches) aggregationError = "Coverage script root span did not match the exact evaluated source bytes.";

  const merged = {
    ...matches[0],
    functions: (matches[0].functions || []).map((fn, functionIndex) => ({
      ...fn,
      ranges: (fn.ranges || []).map((range, rangeIndex) => ({
        ...range,
        count: matches.reduce(
          (sum, script) => sum + Number(script.functions?.[functionIndex]?.ranges?.[rangeIndex]?.count || 0),
          0,
        ),
      })),
    })),
  };
  const ranges = (merged.functions || []).flatMap((fn) => (fn.ranges || []).slice(1));
  const uncovered = uncoveredBranchRanges(source, merged);
  const uncoveredByFunction = new Map();
  for (const item of uncovered) {
    const entry = uncoveredByFunction.get(item.functionName) || { functionName: item.functionName, count: 0, lines: new Set() };
    entry.count += 1;
    entry.lines.add(item.startLine);
    uncoveredByFunction.set(item.functionName, entry);
  }
  return {
    virtualFilenameObserved: true,
    virtualFilename: path.posix.basename(String(matches[0].url || "").replace(/\\/gu, "/")),
    rawVirtualUrl: matches[0].url,
    scriptInstanceCount: matches.length,
    rangeMapsIdentical,
    sourceSpanMatches,
    aggregationError,
    branchTotal: ranges.length,
    branchCovered: ranges.filter((range) => Number(range.count) > 0).length,
    branchMetric: "native V8 non-root block ranges",
    uncoveredBranchRangeCount: uncovered.length,
    uncoveredBranchRanges: uncovered.slice(0, 500),
    uncoveredBranchRangesTruncated: uncovered.length > 500,
    uncoveredBranchFunctions: [...uncoveredByFunction.values()]
      .map((entry) => ({ functionName: entry.functionName, count: entry.count, lines: [...entry.lines].sort((a, b) => a - b) }))
      .sort((a, b) => b.count - a.count || a.functionName.localeCompare(b.functionName)),
  };
}

export async function runCoverage({ nodePath = process.execPath, indexPath = path.join(root, "index.html") } = {}) {
  const node = probeNode24(nodePath);
  const calibration = calibrateNativeCoverage(nodePath, root);
  const report = {
    status: "FAIL", provider: "node:test native V8 coverage", calibrated: calibration.ok,
    nodeVersion: node.version, node24: node.ok, nodeProbeStatus: node.status, nodeProbeError: node.error,
    calibration: {
      reasons: calibration.reasons,
      fullBranchPct: calibration.full?.branchPct ?? null,
      partialBranchPct: calibration.partial?.branchPct ?? null,
      aggregateBranchPct: calibration.aggregate?.branchPct ?? null,
      processStatus: calibration.run.status,
      output: `${calibration.run.stdout}\n${calibration.run.stderr}`.slice(-8_000),
    },
    fallbackAttempts: [], engineSha256: null, stagedSha256: null, exactBytes: false,
    branchPct: null, branchTotal: 0, branchCovered: 0, branchMetric: "native V8 non-root block ranges", virtualFilenameObserved: false, virtualFilename: null,
    linePct: null, functionPct: null, engineRow: null, testProcessStatus: null, testOutput: "",
    structuredAuditValid: false, structuredAuditIssues: [], structuredAuditSha256: null, structuredAudit: null,
    coveredSuites: [
      "exact shipped engine behavioral audit",
      "canonical manifest-to-generator semantic audit",
      "nested save snapshot contract audit",
    ],
  };
  if (!node.ok) {
    report.calibration.reasons.push(`coverage requires Node 24; probe returned ${node.version || node.error || node.status}`);
    report.calibrated = false;
  }
  if (!report.calibrated) {
    report.fallbackAttempts.push({ provider: "pinned c8", status: "UNAVAILABLE", reason: "No repository-pinned c8 installation is present." });
    report.fallbackAttempts.push({ provider: "node:inspector + pinned v8-to-istanbul", status: "UNAVAILABLE", reason: "No repository-pinned v8-to-istanbul installation is present." });
    return report;
  }

  const extracted = await extractEngine(indexPath);
  report.engineSha256 = extracted.sha256;
  const tempRoot = await mkdtemp(path.join(root, "audit", ".tmp-engine-coverage-"));
  try {
    const enginePath = path.join(tempRoot, "math-quest.engine.js");
    await writeFile(enginePath, extracted.engineBytes);
    const staged = await readFile(enginePath);
    report.stagedSha256 = createHash("sha256").update(staged).digest("hex");
    report.exactBytes = staged.equals(extracted.engineBytes) && report.stagedSha256 === report.engineSha256;
    if (!report.exactBytes) return report;
    const testFile = path.join(root, "audit", "tests", "node-engine.test.mjs");
    const structuredAuditPath = path.join(tempRoot, "instrumented-engine-semantic-v1.json");
    const rawCoverageDir = path.join(tempRoot, "v8-raw");
    await mkdir(rawCoverageDir);
    const run = runNativeCoverage(nodePath, testFile, {
      cwd: tempRoot,
      env: { MQ_ENGINE_COVERAGE_FILE: enginePath, MQ_INDEX_PATH: indexPath, MQ_STRUCTURED_AUDIT_FILE: structuredAuditPath, NODE_V8_COVERAGE: rawCoverageDir },
      timeoutMs: 180_000,
    });
    const row = findCoverageRow(run.rows, "math-quest.engine.js");
    const evaluatedSource = `(\n${extracted.source}\n)`;
    const totals = await nativeBranchRangeTotals(rawCoverageDir, "math-quest.engine.js", evaluatedSource);
    report.testProcessStatus = run.status;
    report.testOutput = `${run.stdout}\n${run.stderr}`.slice(-30_000);
    report.engineRow = row?.raw ?? null;
    report.nativeReportedBranchPct = row?.branchPct ?? null;
    try {
      const structuredBytes = await readFile(structuredAuditPath);
      const structured = JSON.parse(structuredBytes.toString("utf8"));
      const validation = validateStructuredAudit(structured, report.engineSha256);
      report.structuredAuditValid = validation.valid;
      report.structuredAuditIssues = validation.issues;
      report.structuredAuditSha256 = createHash("sha256").update(structuredBytes).digest("hex");
      report.structuredAudit = validation.valid ? structured : null;
    } catch (error) {
      report.structuredAuditIssues = [`structured audit could not be read: ${String(error)}`];
    }
    Object.assign(report, totals);
    report.rawBlockRangePct = totals.branchTotal > 0
      ? Math.round((totals.branchCovered / totals.branchTotal) * 10_000) / 100
      : null;
    report.branchPct = row?.branchPct ?? null;
    report.linePct = row?.linePct ?? null;
    report.functionPct = row?.functionPct ?? null;
    report.status = node.ok
      && run.status === 0
      && row
      && report.structuredAuditValid
      && report.branchPct >= MINIMUM_ENGINE_BRANCH_COVERAGE_PCT
      && totals.virtualFilenameObserved
      && totals.branchTotal > 0
      && totals.rangeMapsIdentical
      && totals.sourceSpanMatches
      && !totals.aggregationError
      ? "PASS"
      : "FAIL";
    if (!row) report.fallbackAttempts.push({ provider: "native V8 coverage", status: "FAIL", reason: "Report omitted the exact staged engine filename." });
    return report;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runCoverage({ nodePath: process.execPath, indexPath: process.env.MQ_INDEX_PATH || path.join(root, "index.html") });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
