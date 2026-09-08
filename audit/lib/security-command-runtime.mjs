import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { validatedVulnerabilityCounts } from "./security-gate-policy.mjs";

export const securityCommandTimeoutsMs = Object.freeze({
  archiveExtraction: 300000,
  gitHistoryScope: 30000,
  semgrep: 300000,
  semgrepControl: 60000,
  truffleHogWorktree: 300000,
  truffleHogHistory: 180000,
  truffleHogControl: 60000,
  npmVersion: 120000,
  npmConfiguration: 30000,
  npmAudit: 180000,
});

export function securityCommandResult(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    timeout: options.timeoutMs,
    killSignal: "SIGKILL",
    windowsHide: true,
  });
  if (result.error?.code === "ETIMEDOUT") throw new Error("Security command exceeded its fail-closed timeout.");
  if (result.error) throw result.error;
  return Object.freeze({
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  });
}

export function requireStatus(result, accepted, label) {
  if (!accepted.includes(result.status)) {
    throw new Error(label + " exited with status " + result.status + ".");
  }
  return result;
}

export function parseNpmAuditReport(text) {
  const report = JSON.parse(String(text));
  if (report && Object.hasOwn(report, "error")) throw new Error("npm audit returned an error report.");
  if (report?.auditReportVersion !== 2) throw new Error("npm audit report version is missing or unrecognized.");
  const counts = validatedVulnerabilityCounts(report);
  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)
    || Object.keys(report.vulnerabilities).length !== counts.total) {
    throw new Error("npm audit vulnerability records disagree with their counts.");
  }
  return report;
}

export function npmAuditReportRejectionControl() {
  const reports = [{}, { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }];
  const rejected = reports.filter((report) => {
    try { parseNpmAuditReport(JSON.stringify(report)); return false; }
    catch { return true; }
  }).length;
  return Object.freeze({ passed: rejected === reports.length, attempted: reports.length, rejected });
}

function isExistingDirectory(candidate) {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function configuredNpmTemporaryDirectory(policy, environment) {
  const variable = policy?.dependencyAudit?.temporaryDirectoryEnvironmentVariable;
  if (typeof variable !== "string" || variable === "") {
    throw new Error("The npm audit temporary-directory environment variable is not declared by policy.");
  }
  const configuredDirectory = environment[variable];
  if (configuredDirectory == null || configuredDirectory === "") return null;
  if (typeof configuredDirectory !== "string" || !path.isAbsolute(configuredDirectory)) {
    throw new Error(variable + " must name an absolute existing directory.");
  }
  const temporaryDirectory = path.resolve(configuredDirectory);
  if (!isExistingDirectory(temporaryDirectory)) {
    throw new Error(variable + " must name an absolute existing directory.");
  }
  return temporaryDirectory;
}

export function npmAuditEnvironment(policy, environment = process.env) {
  const childEnvironment = { ...environment, npm_config_update_notifier: "false" };
  const temporaryDirectory = configuredNpmTemporaryDirectory(policy, environment);
  return temporaryDirectory
    ? { ...childEnvironment, TEMP: temporaryDirectory, TMP: temporaryDirectory }
    : childEnvironment;
}

function scopedNpmCommand(root, policy, commandResult) {
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const environment = npmAuditEnvironment(policy);
  const flags = [`--prefix=${path.resolve(root)}`, "--global=false", `--registry=${policy.dependencyAudit.registry}`];
  return (args, timeoutMs) => commandResult(process.execPath, [npmCli, ...args, ...flags], {
    cwd: root, env: environment, timeoutMs,
  });
}

function requireApprovedRegistries(configuration, approved) {
  if (!configuration || !Object.hasOwn(configuration, "registry") || configuration.registry !== approved) {
    throw new Error("The approved npm registry is required.");
  }
  for (const [key, value] of Object.entries(configuration)) {
    if (/registry$/iu.test(key) && value != null && value !== "" && value !== approved) {
      throw new Error("A conflicting setting overrides the approved npm registry.");
    }
  }
}

export function runNpmAudit(root, policy, commandResult = securityCommandResult) {
  const run = scopedNpmCommand(root, policy, commandResult);
  const versionResult = requireStatus(run(["--version"], securityCommandTimeoutsMs.npmVersion), [0], "npm version");
  if (versionResult.stdout.trim() !== policy.dependencyAudit.version) throw new Error("The reviewed npm version is required.");
  const configuration = requireStatus(run(["config", "list", "--json"], securityCommandTimeoutsMs.npmConfiguration), [0], "npm configuration");
  requireApprovedRegistries(JSON.parse(configuration.stdout), policy.dependencyAudit.registry);
  const auditResult = run([
    "audit", "--json", "--package-lock-only", "--ignore-scripts", "--omit=optional", "--audit-level=low",
  ], securityCommandTimeoutsMs.npmAudit);
  if (auditResult.status == null) throw new Error("npm audit did not return an exit status.");
  requireStatus(auditResult, [0, 1], "npm audit");
  const report = parseNpmAuditReport(auditResult.stdout);
  if (auditResult.status !== 0 && report.metadata.vulnerabilities.total === 0) throw new Error("npm audit failed despite a clean report.");
  return Object.freeze({ version: versionResult.stdout.trim(), report });
}
