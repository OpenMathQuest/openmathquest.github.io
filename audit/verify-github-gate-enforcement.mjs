#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { evaluateGithubEnforcementSnapshot, loadGateIntegrityPolicy } from "./lib/gate-integrity-policy.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const windowsGh = "C:\\Program Files\\GitHub CLI\\gh.exe";

function argument(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function githubCliPath(environment = process.env) {
  return environment.MQ_GH_PATH || environment.GH_PATH
    || (process.platform === "win32" && existsSync(windowsGh) ? windowsGh : "gh");
}

async function ghJson(endpoint, { environment = process.env } = {}) {
  const { stdout } = await execFileAsync(githubCliPath(environment), ["api", "--method", "GET", endpoint], {
    cwd: root,
    encoding: "utf8",
    env: environment,
    timeout: 30_000,
    windowsHide: true,
  });
  return JSON.parse(stdout);
}

export function normalizeGithubEnforcementSnapshot(requiredStatusChecks, rulesetDetails) {
  const contexts = new Set([
    ...(Array.isArray(requiredStatusChecks?.contexts) ? requiredStatusChecks.contexts : []),
    ...(Array.isArray(requiredStatusChecks?.checks) ? requiredStatusChecks.checks.map((entry) => entry?.context) : []),
  ].filter((entry) => typeof entry === "string" && entry.length > 0));
  const tagRules = [];
  for (const ruleset of Array.isArray(rulesetDetails) ? rulesetDetails : []) {
    if (ruleset?.target !== "tag" || ruleset?.enforcement !== "active") continue;
    const types = new Set((ruleset.rules || []).map((entry) => entry?.type));
    for (const pattern of ruleset.conditions?.ref_name?.include || []) {
      tagRules.push({
        pattern,
        rules: [
          ...(types.has("deletion") ? ["DELETION_PROHIBITED"] : []),
          ...(types.has("update") ? ["UPDATE_PROHIBITED"] : []),
        ],
        bypassActorsObserved: Array.isArray(ruleset.bypass_actors),
        bypassActorCount: Array.isArray(ruleset.bypass_actors) ? ruleset.bypass_actors.length : null,
      });
    }
  }
  return Object.freeze({
    requiredPullRequestChecks: Object.freeze([...contexts].sort()),
    tagRules: Object.freeze(tagRules.sort((left, right) => left.pattern.localeCompare(right.pattern, "en"))),
  });
}

export async function readGithubEnforcementSnapshot(policy, options = {}) {
  const repository = policy.enforcement.repository;
  const branch = policy.enforcement.protectedBranch;
  const requiredStatusChecks = await ghJson(
    `repos/${repository}/branches/${encodeURIComponent(branch)}/protection/required_status_checks`,
    options,
  );
  const listed = await ghJson(`repos/${repository}/rulesets?per_page=100`, options);
  const tagSummaries = (Array.isArray(listed) ? listed : [])
    .filter((entry) => entry?.target === "tag" && entry?.enforcement === "active");
  const details = await Promise.all(tagSummaries.map((entry) => ghJson(`repos/${repository}/rulesets/${entry.id}`, options)));
  return normalizeGithubEnforcementSnapshot(requiredStatusChecks, details);
}

export async function verifyGithubGateEnforcement({ snapshotPath = null } = {}) {
  const policy = await loadGateIntegrityPolicy();
  const snapshot = snapshotPath
    ? JSON.parse(await readFile(path.resolve(root, snapshotPath), "utf8"))
    : await readGithubEnforcementSnapshot(policy);
  const evaluation = evaluateGithubEnforcementSnapshot(snapshot, policy);
  return Object.freeze({
    schemaVersion: 1,
    resultType: "MATH_QUEST_GITHUB_GATE_ENFORCEMENT_PREFLIGHT",
    repository: policy.enforcement.repository,
    protectedBranch: policy.enforcement.protectedBranch,
    status: evaluation.valid ? "PASS" : "FAIL",
    issues: evaluation.issues,
    snapshot,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyGithubGateEnforcement({ snapshotPath: argument("snapshot") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "PASS" ? 0 : 1;
  } catch (error) {
    const message = String(error?.message || error).replace(/(?:authorization|token)\s*[:=]\s*\S+/giu, "credential=[REDACTED]");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      resultType: "MATH_QUEST_GITHUB_GATE_ENFORCEMENT_PREFLIGHT",
      status: "ERROR",
      issues: [message],
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
