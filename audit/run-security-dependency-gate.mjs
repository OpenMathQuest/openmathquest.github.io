import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ciDependencyPolicyFindings } from "./lib/ci-dependency-policy.mjs";
import { repositoryPaths } from "./lib/quality-budget-measurements.mjs";
import {
  artifactFindings,
  loadSecurityGatePolicy,
  markerFindings,
  securityToolCachePath,
  vulnerabilityFindings,
} from "./lib/security-gate-policy.mjs";
import {
  createTruffleHogWorktreeSnapshot,
  prepareSecurityExecutables,
  readMarkerSources,
  removePreparedSecurityExecutables,
  runSemgrepNegativeControl,
  runSemgrepScan,
  runTruffleHogHistoryScan,
  runTruffleHogNegativeControl,
  runTruffleHogWorktreeScan,
} from "./lib/security-scans.mjs";
import { npmAuditReportRejectionControl, runNpmAudit } from "./lib/security-command-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function stageProgress(id, status, elapsedMs = null) {
  if (!process.argv.includes("--progress")) return;
  const elapsed = elapsedMs == null ? "" : " " + elapsedMs + "ms";
  process.stderr.write("SECURITY_STAGE " + id + " " + status + elapsed + "\n");
}

async function measuredStage(timings, id, operation) {
  stageProgress(id, "START");
  const started = Date.now();
  const value = await operation();
  timings[id] = Date.now() - started;
  stageProgress(id, "PASS", timings[id]);
  return value;
}

function countPolicyFindings(policy, observations) {
  const findings = [];
  if (observations.semgrep.findings.length > policy.semgrep.maximumFindings) findings.push("Semgrep static-security findings exceed zero.");
  if (observations.semgrep.errors.length > policy.semgrep.maximumErrors) findings.push("Semgrep scan errors exceed zero.");
  if (observations.semgrep.scannedTargets !== observations.semgrep.plannedTargets) findings.push("Semgrep did not scan every planned JavaScript unit.");
  if (observations.truffleHog.worktree.findings.length > policy.truffleHog.maximumWorktreeFindings) findings.push("TruffleHog worktree findings exceed zero.");
  if (observations.truffleHog.history.findings.length > policy.truffleHog.maximumHistoryFindings) findings.push("TruffleHog history findings exceed zero.");
  if (observations.markers.length > policy.markers.maximumUntrackedMarkers) findings.push("Untracked work markers exceed zero.");
  if (observations.negativeControls.some((control) => !control.passed)) findings.push("One or more security negative controls did not prove failure detection.");
  return findings;
}

function sameMembers(left, right) {
  const first = [...left].sort();
  const second = [...right].sort();
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function control(id, passed, evidence) {
  return Object.freeze({ id, passed, evidence });
}

async function artifactHashNegativeControl(policy, cachePath) {
  const mutant = JSON.parse(JSON.stringify(policy));
  mutant.tools[0].artifact.sha256 = "0".repeat(64);
  const findings = await artifactFindings(mutant, cachePath);
  return findings.some((finding) => finding.kind === "SHA256_MISMATCH");
}

async function securityNegativeControls(policy, prepared, cachePath) {
  const semgrepIds = await runSemgrepNegativeControl({
    root, policy, executable: prepared.semgrep, temporaryRoot: prepared.temporaryRoot,
  });
  const truffleHog = await runTruffleHogNegativeControl({
    root, policy, executable: prepared.truffleHog, temporaryRoot: prepared.temporaryRoot,
  });
  const dependencyMutant = { metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 } } };
  const malformedReports = npmAuditReportRejectionControl();
  const markerMutant = [{ path: "negative-control.js", text: "// " + policy.markers.tokens[0] + ": deliberately lacks a tracking reference" }];
  return Object.freeze([
    control("NC-SEMGREP-EACH-RULE-MATCHES", sameMembers(semgrepIds, policy.semgrep.requiredRuleIds), { matchedRuleIds: semgrepIds }),
    control("NC-TRUFFLEHOG-DETECTS-DISPOSABLE-FIXTURE", truffleHog.findings.length > 0, { sanitizedFindings: truffleHog.findings.length }),
    control("NC-NPM-AUDIT-NONZERO-OR-VULNERABILITY-FAILS", vulnerabilityFindings(policy, dependencyMutant).length > 0 && malformedReports.passed, { rejectedLowSeverityCount: 1, malformedReports }),
    control(policy.negativeControls.find((id) => id.startsWith("NC-UNTRACKED-")), markerFindings(policy, markerMutant).length > 0, { rejectedUntrackedMarkers: 1 }),
    control("NC-TOOL-ARTIFACT-HASH-MISMATCH-FAILS", await artifactHashNegativeControl(policy, cachePath), { mutatedArtifactRecords: 1 }),
  ]);
}

async function dependencyIntegrityFindings() {
  const [qualityPolicyText, packageJsonText, packageLockText] = await Promise.all([
    readFile(path.join(root, "audit", "quality-gate-policy-v1.json"), "utf8"),
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "package-lock.json"), "utf8"),
  ]);
  return ciDependencyPolicyFindings({ qualityPolicyText, packageJsonText, packageLockText });
}

async function securityObservations(policy, prepared, paths, cachePath, timings) {
  const markerSources = await measuredStage(timings, "work-markers", () => readMarkerSources(root, paths));
  const semgrep = await measuredStage(timings, "semgrep", () => runSemgrepScan({
    root, paths, policy, executable: prepared.semgrep, temporaryRoot: prepared.temporaryRoot,
  }));
  const worktreeSnapshot = await measuredStage(timings, "trufflehog-worktree-snapshot", () => (
    createTruffleHogWorktreeSnapshot(root, paths, prepared.temporaryRoot)
  ));
  const worktree = await measuredStage(timings, "trufflehog-worktree", () => runTruffleHogWorktreeScan({
    snapshot: worktreeSnapshot, policy, executable: prepared.truffleHog, temporaryRoot: prepared.temporaryRoot,
  }));
  const history = await measuredStage(timings, "trufflehog-history", () => runTruffleHogHistoryScan({
    root, policy, executable: prepared.truffleHog,
  }));
  const dependencyAudit = await measuredStage(timings, "npm-audit", () => runNpmAudit(root, policy));
  const negativeControls = await measuredStage(timings, "negative-controls", () => securityNegativeControls(
    policy, prepared, cachePath,
  ));
  return Object.freeze({
    semgrep,
    truffleHog: Object.freeze({ worktree, history }),
    dependencyAudit: Object.freeze({
      toolVersion: dependencyAudit.version,
      vulnerabilities: dependencyAudit.report.metadata.vulnerabilities,
    }),
    markers: markerFindings(policy, markerSources),
    negativeControls,
    timingsMs: Object.freeze(timings),
  });
}

export async function runSecurityDependencyGate() {
  const timings = {};
  const policy = await measuredStage(timings, "policy", () => loadSecurityGatePolicy());
  const cachePath = securityToolCachePath(policy);
  const artifacts = await measuredStage(timings, "artifact-verification", () => artifactFindings(policy, cachePath));
  if (artifacts.length) {
    return Object.freeze({
      schemaVersion: 1,
      status: "FAIL",
      policyId: policy.policyId,
      artifacts,
      timingsMs: Object.freeze(timings),
      findings: ["Reviewed security tool artifacts are missing or invalid."],
    });
  }
  const prepared = await measuredStage(timings, "executable-preparation", () => prepareSecurityExecutables(policy, cachePath));
  try {
    const paths = await measuredStage(timings, "repository-paths", () => repositoryPaths(root));
    const observations = await securityObservations(policy, prepared, paths, cachePath, timings);
    const vulnerabilities = vulnerabilityFindings(policy, {
      metadata: { vulnerabilities: observations.dependencyAudit.vulnerabilities },
    });
    const findings = [
      ...countPolicyFindings(policy, observations),
      ...vulnerabilities.map((finding) => "npm audit " + finding.severity + " vulnerabilities exceed zero."),
      ...await dependencyIntegrityFindings(),
    ];
    return Object.freeze({
      schemaVersion: 1,
      status: findings.length ? "FAIL" : "PASS",
      policyId: policy.policyId,
      artifactCache: Object.freeze({ path: cachePath, verifiedArtifacts: policy.tools.length }),
      observations,
      findings: Object.freeze(findings),
    });
  } finally {
    await removePreparedSecurityExecutables(prepared);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runSecurityDependencyGate();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
