import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "./mutation-runner.mjs";
import { runArchitectureGate } from "./run-architecture-gate.mjs";
import { runCompilerContracts } from "./run-compiler-contracts.mjs";
import { runCoverage } from "./run-coverage.mjs";
import { runDifferentialEquivalence } from "./run-differential-equivalence.mjs";
import { runFunctionQualityGate } from "./run-function-quality-gate.mjs";
import { runPerformanceBudgets } from "./run-performance-budgets.mjs";
import { runPropertyFuzzStage } from "./run-property-fuzz-stage.mjs";
import { runQualityGates } from "./run-quality-gates.mjs";
import { runSecurityDependencyGate } from "./run-security-dependency-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const windowsPowerShell = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
);
const windowsPowerShellEnvironment = Object.freeze({
  ...process.env,
  PSModulePath: [
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "Modules"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsPowerShell", "Modules"),
  ].join(path.delimiter),
});

function combinedReport(reports) {
  const findings = reports.flatMap((report) => report.findings || []);
  return Object.freeze({
    status: reports.every((report) => report.status === "PASS") && findings.length === 0 ? "PASS" : "FAIL",
    components: Object.freeze(reports.map((report) => report.status)),
    findings: Object.freeze(findings.map(String)),
  });
}

function temporaryNodeSource() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mq-ai-loop-node-"));
  const executable = path.join(directory, "node.exe");
  copyFileSync(process.execPath, executable);
  return Object.freeze({ directory, executable });
}

function removeTemporaryNodeSource(directory) {
  const resolved = path.resolve(directory);
  const temporaryPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(temporaryPrefix) || !path.basename(resolved).startsWith("mq-ai-loop-node-")) {
    throw new Error("Refusing to remove an unrecognized AI-loop Node staging directory");
  }
  rmSync(resolved, { recursive: true, force: true });
}

function runDevelopmentAudit() {
  const nodeSource = temporaryNodeSource();
  try {
    const result = spawnSync(windowsPowerShell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(root, "audit", "run-audit.ps1"),
      "-NodePath", nodeSource.executable,
      "-DevelopmentOnly",
    ], {
      cwd: root,
      env: windowsPowerShellEnvironment,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status === 0) return Object.freeze({ status: "PASS", findings: Object.freeze([]) });
    const output = (result.stderr || result.stdout || "development audit failed").trim();
    return Object.freeze({ status: "FAIL", findings: Object.freeze([output]) });
  } finally {
    removeTemporaryNodeSource(nodeSource.directory);
  }
}

export function coverageStageFindings(coverage) {
  if (coverage.status === "PASS") return [];
  const details = [coverage.nodeProbeError, coverage.testProcessError, coverage.aggregationError,
    ...(coverage.calibration?.reasons || []), ...(coverage.structuredAuditIssues || [])].filter(Boolean).map(String);
  return details.length ? details : [`Coverage reported FAIL: branch=${coverage.branchPct}, calibrated=${coverage.calibrated}, processStatus=${coverage.testProcessStatus}`];
}

async function runTestsAndCoverage() {
  const development = runDevelopmentAudit();
  if (development.status !== "PASS") return development;
  const coverage = await runCoverage({ nodePath: process.execPath });
  const combined = combinedReport([development, { ...coverage, findings: coverageStageFindings(coverage) }]);
  return Object.freeze({ ...combined, coverage });
}

async function runComplexityStage(context) {
  const functions = await runFunctionQualityGate();
  if (functions.status !== "PASS") return functions;
  const branchCoverage = context.reports.tests?.coverage?.branchPct;
  const quality = await runQualityGates({ engineBranchCoveragePercent: branchCoverage });
  return combinedReport([functions, quality]);
}

export function createAiChangeLoopOperations() {
  return Object.freeze({
    "compiler-types": () => runCompilerContracts(),
    "static-architecture": () => runArchitectureGate(),
    tests: () => runTestsAndCoverage(),
    "differential-equivalence": () => runDifferentialEquivalence(),
    "property-fuzz": () => runPropertyFuzzStage(),
    mutation: () => runMutations(),
    "security-dependencies": () => runSecurityDependencyGate(),
    "complexity-duplication-size": (context) => runComplexityStage(context),
    "performance-budgets": () => runPerformanceBudgets(),
  });
}
