import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareAuditExecutionReports } from "./lib/bounded-audit-lanes.mjs";
import { GATE_INTEGRITY_POLICY } from "./lib/gate-integrity-policy.mjs";
import { exactKeys } from "./lib/audit-lane-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentsByName = new Map();
const allowedArguments = new Set(["serial", "parallel", "serial-entry-timing", "parallel-entry-timing"]);
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--([a-z-]+)=(.+)$/u);
  if (!match || !allowedArguments.has(match[1]) || argumentsByName.has(match[1])) throw new TypeError(`Unknown, empty or duplicate comparison argument: ${argument}`);
  argumentsByName.set(match[1], match[2]);
}
const arg = (name) => argumentsByName.get(name) ?? null;
const readReport = (bytes) => JSON.parse(bytes.toString("utf8"));
const readSource = async (value) => {
  const bytes = await readFile(path.resolve(root, value));
  return { report: readReport(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
};

function entryTimingIdentityIssues(timing, source, label) {
  const issues = [];
  if (timing.schemaVersion !== 1 || timing.boundary !== "TECHNICAL_ENTRY_POINT" || timing.executionStatus !== "COMPLETED") issues.push(`${label} entry-point timing has an invalid completion boundary`);
  if (timing.reportSha256 !== source.sha256) issues.push(`${label} entry-point timing does not bind the exact report bytes`);
  if (typeof timing.nodeExecutableSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(timing.nodeExecutableSha256)) issues.push(`${label} entry-point timing has an invalid Node executable digest`);
  return issues;
}

function entryTimingIssues(timing, source, label) {
  if (!exactKeys(timing, ["schemaVersion", "boundary", "executionStatus", "reportSha256", "nodeExecutableSha256", "wallDurationMs"])) {
    return [`${label} entry-point timing has missing or unknown fields`];
  }
  const issues = entryTimingIdentityIssues(timing, source, label);
  if (!Number.isSafeInteger(timing.wallDurationMs) || timing.wallDurationMs < 1 || timing.wallDurationMs < source.report.auditOrchestration?.wallDurationMs) issues.push(`${label} entry-point duration must be a positive integer covering the inner lanes`);
  return issues;
}

const serialPath = arg("serial");
const parallelPath = arg("parallel");
if (!serialPath || !parallelPath) throw new TypeError("--serial and --parallel report paths are required.");
const [serialSource, parallelSource] = await Promise.all([readSource(serialPath), readSource(parallelPath)]);
const serialTimingPath = arg("serial-entry-timing");
const parallelTimingPath = arg("parallel-entry-timing");
const hasEntryTiming = serialTimingPath !== null || parallelTimingPath !== null;
const timingIssues = [];
let serialReport = serialSource.report;
let parallelReport = parallelSource.report;
if (hasEntryTiming) {
  if (!serialTimingPath || !parallelTimingPath) timingIssues.push("both entry-point timing files are required");
  else {
    const [serialTiming, parallelTiming] = await Promise.all([readSource(serialTimingPath), readSource(parallelTimingPath)]);
    timingIssues.push(...entryTimingIssues(serialTiming.report, serialSource, "serial"), ...entryTimingIssues(parallelTiming.report, parallelSource, "parallel"));
    if (serialTiming.report.nodeExecutableSha256 !== parallelTiming.report.nodeExecutableSha256) timingIssues.push("entry-point timings do not bind the same Node executable");
    if (!timingIssues.length) {
      serialReport = { ...serialReport, auditOrchestration: { ...serialReport.auditOrchestration, wallDurationMs: serialTiming.report.wallDurationMs } };
      parallelReport = { ...parallelReport, auditOrchestration: { ...parallelReport.auditOrchestration, wallDurationMs: parallelTiming.report.wallDurationMs } };
    }
  }
}
const comparison = compareAuditExecutionReports(serialReport, parallelReport, {
  minimumReductionPercent: GATE_INTEGRITY_POLICY.executionPolicy.minimumMeasuredWallTimeReductionPercent,
});
comparison.measurementBoundary = hasEntryTiming ? "TECHNICAL_ENTRY_POINT" : "AUDIT_LANES";
comparison.schemaVersion = 2;
if (hasEntryTiming) {
  const inner = compareAuditExecutionReports(serialSource.report, parallelSource.report, {
    minimumReductionPercent: GATE_INTEGRITY_POLICY.executionPolicy.minimumMeasuredWallTimeReductionPercent,
  });
  comparison.issues.push(...inner.issues.filter((issue) => !comparison.issues.includes(issue)));
  comparison.innerLaneTiming = {
    serialWallDurationMs: inner.serialWallDurationMs,
    parallelWallDurationMs: inner.parallelWallDurationMs,
    measuredWallTimeReductionPercent: inner.measuredWallTimeReductionPercent,
  };
  comparison.sourceReportSha256 = { serial: serialSource.sha256, parallel: parallelSource.sha256 };
  if (timingIssues.length) {
    comparison.serialWallDurationMs = null;
    comparison.parallelWallDurationMs = null;
    comparison.measuredWallTimeReductionPercent = null;
  }
}
comparison.issues.push(...timingIssues);
comparison.status = comparison.issues.length ? "FAIL" : "PASS";
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
process.exitCode = comparison.status === "PASS" ? 0 : 1;
