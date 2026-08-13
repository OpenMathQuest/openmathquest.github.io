import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DIRECT_EVIDENCE_SUCCESSOR_POLICY = "DIRECT_EVIDENCE_SUCCESSOR_V1";
export const RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY = "RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1";
export const DIRECT_EVIDENCE_SUCCESSOR_PATHS = Object.freeze([
  "PUBLICATION_CLEARANCE.md",
  "audit/browser-runner-evidence-v1.json",
]);
export const RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS = DIRECT_EVIDENCE_SUCCESSOR_PATHS;

const SHA40 = /^[a-f0-9]{40}$/u;
const PUBLICATION_CLEARANCE_PATH = "PUBLICATION_CLEARANCE.md";

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

function publicPayloadIdentity(entries) {
  const payload = entries
    .filter((entry) => entry.path !== PUBLICATION_CLEARANCE_PATH)
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (!payload.length) throw new Error("the qualification public payload cannot be empty");
  const oidLength = payload[0].hash.length;
  const algorithm = oidLength === 40 ? "sha1" : oidLength === 64 ? "sha256" : null;
  if (!algorithm || payload.some((entry) => entry.hash.length !== oidLength)) {
    throw new Error("the qualification payload uses an unsupported or inconsistent Git object format");
  }
  const canonical = payload
    .map((entry) => `${entry.mode}\0${entry.hash}\0${0}\0${entry.path}\0`)
    .join("");
  const rootNode = { children: new Map() };
  for (const entry of payload) {
    if (!/^(?:100644|100755|120000)$/u.test(entry.mode)) {
      throw new Error(`${entry.path}: unsupported Git mode ${entry.mode}`);
    }
    const segments = entry.path.split("/");
    let node = rootNode;
    for (const segment of segments.slice(0, -1)) {
      const existing = node.children.get(segment);
      if (existing?.entry) throw new Error(`${entry.path}: a file conflicts with a directory`);
      if (!existing) node.children.set(segment, { children: new Map() });
      node = node.children.get(segment);
    }
    const name = segments.at(-1);
    if (!name || node.children.has(name)) throw new Error(`${entry.path}: duplicate or invalid path`);
    node.children.set(name, { entry });
  }
  const objectHash = (type, body) => createHash(algorithm)
    .update(Buffer.from(`${type} ${body.byteLength}\0`, "utf8"))
    .update(body)
    .digest();
  const treeHash = (node) => {
    const rows = [...node.children.entries()].map(([name, child]) => ({
      name,
      child,
      sortKey: Buffer.from(child.entry ? name : `${name}/`, "utf8"),
    })).sort((left, right) => Buffer.compare(left.sortKey, right.sortKey));
    const body = Buffer.concat(rows.map(({ name, child }) => {
      const mode = child.entry ? child.entry.mode : "40000";
      const oid = child.entry ? Buffer.from(child.entry.hash, "hex") : treeHash(child);
      return Buffer.concat([Buffer.from(`${mode} ${name}\0`, "utf8"), oid]);
    }));
    return objectHash("tree", body);
  };
  return Object.freeze({
    sha256: createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex"),
    treeOid: treeHash(rootNode).toString("hex"),
  });
}

export async function observeCommitPublicPayloadIdentity(root, commitSha) {
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "-z", "--full-tree", commitSha], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const entries = stdout.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    const metadata = record.slice(0, tab).split(" ");
    if (tab < 0 || metadata.length !== 3 || metadata[1] !== "blob") {
      throw new Error(`cannot parse qualification tree record: ${record}`);
    }
    return Object.freeze({ mode: metadata[0], hash: metadata[2], path: record.slice(tab + 1).replaceAll("\\", "/") });
  });
  return publicPayloadIdentity(entries);
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
    const qualificationPayload = await observeCommitPublicPayloadIdentity(root, qualificationCommitSha);
    const clearanceStatus = qualificationClearance.split(/\r?\n/u)[1]?.replace(/^Status:\s*/u, "") || "INVALID";
    return Object.freeze({
      ...evaluateDirectEvidenceSuccessor({
        candidateCommitSha,
        parentCommitShas,
        qualificationCommitSha,
        changedPaths: changedText ? changedText.split(/\r?\n/u) : [],
        qualificationClearanceStatus: clearanceStatus,
        qualificationBrowserEvidenceStatus: qualificationBrowserEvidence?.status,
      }),
      qualificationPayloadSha256: qualificationPayload.sha256,
      qualificationPayloadTreeOid: qualificationPayload.treeOid,
    });
  } catch (error) {
    return Object.freeze({
      valid: false,
      policy: DIRECT_EVIDENCE_SUCCESSOR_POLICY,
      candidateCommitSha: null,
      qualificationCommitSha: qualificationCommitSha || null,
      changedPaths: Object.freeze([]),
      qualificationPayloadSha256: null,
      qualificationPayloadTreeOid: null,
      issues: Object.freeze([`direct evidence successor observation failed: ${error.message || error}`]),
    });
  }
}

export function evaluateRuntimeEquivalentEvidenceSuccessor(input) {
  const observed = evaluateDirectEvidenceSuccessor(input);
  return Object.freeze({
    ...observed,
    policy: RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY,
  });
}

export async function observeRuntimeEquivalentEvidenceSuccessor(root, qualificationCommitSha) {
  const observed = await observeDirectEvidenceSuccessor(root, qualificationCommitSha);
  return Object.freeze({
    ...observed,
    policy: RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY,
  });
}
