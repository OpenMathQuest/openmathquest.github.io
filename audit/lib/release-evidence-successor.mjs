import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DIRECT_EVIDENCE_SUCCESSOR_POLICY = "DIRECT_EVIDENCE_SUCCESSOR_V1";
export const DIRECT_EVIDENCE_SUCCESSOR_PATHS = Object.freeze([
  "PUBLICATION_CLEARANCE.md",
  "audit/browser-runner-evidence-v1.json",
]);

const SHA40 = /^[a-f0-9]{40}$/u;

function sortedUnique(values) {
  return [...new Set(values.map((value) => String(value).replaceAll("\\", "/")))].sort();
}

export function evaluateDirectEvidenceSuccessor({
  candidateCommitSha,
  parentCommitShas,
  qualificationCommitSha,
  changedPaths,
  qualificationClearanceStatus,
  qualificationBrowserEvidenceStatus,
}) {
  const issues = [];
  const parents = Array.isArray(parentCommitShas) ? parentCommitShas : [];
  const changed = sortedUnique(Array.isArray(changedPaths) ? changedPaths : []);
  if (!SHA40.test(String(candidateCommitSha || ""))) issues.push("candidate commit must be an exact 40-character SHA");
  if (!SHA40.test(String(qualificationCommitSha || ""))) issues.push("qualification commit must be an exact 40-character SHA");
  if (parents.length !== 1) issues.push("the evidence successor must have exactly one parent and cannot be a merge commit");
  if (parents[0] !== qualificationCommitSha) issues.push("the evidence successor's sole parent must be the named qualification commit");
  if (JSON.stringify(changed) !== JSON.stringify(DIRECT_EVIDENCE_SUCCESSOR_PATHS)) {
    issues.push(`the direct evidence successor must change exactly ${DIRECT_EVIDENCE_SUCCESSOR_PATHS.join(" and ")}, and no other path`);
  }
  if (qualificationClearanceStatus !== "PENDING") issues.push("the qualification commit must contain PENDING publication clearance");
  if (qualificationBrowserEvidenceStatus !== "PENDING") issues.push("the qualification commit must contain PENDING browser-runner evidence");
  return Object.freeze({
    valid: issues.length === 0,
    policy: DIRECT_EVIDENCE_SUCCESSOR_POLICY,
    candidateCommitSha: candidateCommitSha || null,
    qualificationCommitSha: qualificationCommitSha || null,
    changedPaths: Object.freeze(changed),
    issues: Object.freeze(issues),
  });
}

async function gitText(root, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function observeDirectEvidenceSuccessor(root, qualificationCommitSha) {
  try {
    const candidateCommitSha = await gitText(root, ["rev-parse", "HEAD^{commit}"]);
    const parentLine = await gitText(root, ["rev-list", "--parents", "-n", "1", candidateCommitSha]);
    const [, ...parentCommitShas] = parentLine.split(/\s+/u);
    const changedText = await gitText(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "--diff-filter=ACDMRTUXB",
      qualificationCommitSha,
      candidateCommitSha,
    ]);
    const qualificationClearance = await gitText(root, ["show", `${qualificationCommitSha}:PUBLICATION_CLEARANCE.md`]);
    const qualificationBrowserEvidence = JSON.parse(await gitText(root, ["show", `${qualificationCommitSha}:audit/browser-runner-evidence-v1.json`]));
    const clearanceStatus = qualificationClearance.split(/\r?\n/u)[1]?.replace(/^Status:\s*/u, "") || "INVALID";
    return evaluateDirectEvidenceSuccessor({
      candidateCommitSha,
      parentCommitShas,
      qualificationCommitSha,
      changedPaths: changedText ? changedText.split(/\r?\n/u) : [],
      qualificationClearanceStatus: clearanceStatus,
      qualificationBrowserEvidenceStatus: qualificationBrowserEvidence?.status,
    });
  } catch (error) {
    return Object.freeze({
      valid: false,
      policy: DIRECT_EVIDENCE_SUCCESSOR_POLICY,
      candidateCommitSha: null,
      qualificationCommitSha: qualificationCommitSha || null,
      changedPaths: Object.freeze([]),
      issues: Object.freeze([`direct evidence successor observation failed: ${error.message || error}`]),
    });
  }
}
