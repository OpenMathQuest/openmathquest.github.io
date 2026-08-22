import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runBrowserSmoke } from "./lib/browser-smoke.mjs";
import { createAuditLaneEnvelope, failedAuditLaneResult, interpretJsonChildCompletion, AUDIT_LANE_IDS } from "./lib/bounded-audit-lanes.mjs";
import { PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS, playwrightFocusedReportFindings } from "./lib/playwright-focused-contract.mjs";
import { runMutations } from "./mutation-runner.mjs";
import { runCoverage } from "./run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const arg = (name) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
};

async function runJsonChild(script, args = []) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      report: interpretJsonChildCompletion({ stdout, stderr, exitCode: 0 }),
      processStatus: 0,
      stderr: String(stderr || "").slice(-4_000),
    };
  } catch (error) {
    interpretJsonChildCompletion({
      stdout: error.stdout,
      stderr: error.stderr,
      exitCode: typeof error.code === "number" ? error.code : 1,
      signal: error.signal,
      timedOut: error.killed === true && error.signal === "SIGTERM",
    });
  }
}

async function runPlaywrightFocusedAudit() {
  const reportPath = path.join(root, "audit", ".tmp-playwright-focused-report.json");
  let processFailure = null;
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(process.execPath, [path.join(root, "audit", "run-playwright-focused.mjs")], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    stdout = String(result.stdout || "");
    stderr = String(result.stderr || "");
  } catch (error) {
    processFailure = String(error.stack || error);
    stdout = String(error.stdout || "");
    stderr = String(error.stderr || "");
  }
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const findings = playwrightFocusedReportFindings(report);
    if (processFailure) findings.unshift(processFailure);
    return {
      ...report,
      status: findings.length ? "FAIL" : "PASS",
      findings: [...new Set(findings)],
      process: { status: processFailure ? "FAIL" : "PASS", stdout: stdout.slice(-8_000), stderr: stderr.slice(-8_000) },
    };
  } catch (error) {
    return {
      status: "FAIL",
      findings: [processFailure, String(error.stack || error)].filter(Boolean),
      summary: { expected: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length, actual: 0, passed: 0, failed: 0, skipped: 0, unknown: 0, duplicates: 0 },
      results: [],
      process: { status: "FAIL", stdout: stdout.slice(-8_000), stderr: stderr.slice(-8_000) },
    };
  }
}

const laneId = arg("lane");
const runId = arg("run-id");
const candidateId = arg("candidate-id");
const indexPath = arg("index-path") || path.join(root, "index.html");
const browserPath = arg("browser") || process.env.MQ_BROWSER_PATH || null;
const nestedProcessTimeoutArgument = arg("nested-process-timeout-ms");
const nestedProcessTimeoutMs = nestedProcessTimeoutArgument === null ? undefined : Number(nestedProcessTimeoutArgument);
if (!AUDIT_LANE_IDS.includes(laneId)) throw new TypeError(`Unknown audit lane ${String(laneId)}.`);
if (!runId || !candidateId) throw new TypeError("Audit lane run and candidate identities are required.");
if (nestedProcessTimeoutArgument !== null && (!Number.isSafeInteger(nestedProcessTimeoutMs) || nestedProcessTimeoutMs <= 0)) {
  throw new TypeError("Nested-process timeout must be a positive safe integer.");
}
if (nestedProcessTimeoutArgument !== null && laneId !== "coverage") throw new TypeError("Only the coverage lane accepts a nested-process timeout.");

const startedAt = performance.now();
let result;
let executionStatus = "COMPLETED";
let error = null;
try {
  if (laneId === "coverage") result = await runCoverage({ nodePath: process.execPath, indexPath, timeoutMs: nestedProcessTimeoutMs });
  if (laneId === "browser") result = await runBrowserSmoke({ root, browserPath });
  if (laneId === "playwright") result = await runPlaywrightFocusedAudit();
  if (laneId === "mutation") result = await runMutations({ indexPath });
  if (laneId === "generator") {
    const child = await runJsonChild(path.join(root, "audit", "exhaustive-generator-audit.mjs"));
    result = { ...child.report, processStatus: child.processStatus, stderr: child.stderr };
  }
} catch (caught) {
  executionStatus = caught?.executionStatus === "TIMEOUT" ? "TIMEOUT" : "ERROR";
  error = String(caught?.stack || caught);
  result = failedAuditLaneResult(laneId, error, executionStatus);
}

process.stdout.write(`${JSON.stringify(createAuditLaneEnvelope({
  candidateId,
  durationMs: performance.now() - startedAt,
  error,
  executionStatus,
  laneId,
  result,
  runId,
}))}\n`);
