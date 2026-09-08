import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const policyPath = path.join(root, "audit", "security-gate-policy-v1.json");
const schemaPath = path.join(root, "audit", "schemas", "security-gate-policy-v1.schema.json");
const expectedToolIds = Object.freeze([
  "semgrep-core-1.164.0-win-amd64",
  "trufflehog-3.97.0-win-amd64",
]);

let policyPromise;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactMembers(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function validateRules(policy) {
  const findings = [];
  const rulesFile = path.join(root, ...policy.semgrep.rulesPath.split("/"));
  const bytes = await readFile(rulesFile);
  if (bytes.length !== policy.semgrep.rulesBytes) findings.push("Semgrep rule-set byte length is stale.");
  if (sha256(bytes) !== policy.semgrep.rulesSha256) findings.push("Semgrep rule-set SHA-256 is stale.");
  let rules;
  try {
    rules = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    findings.push("Semgrep rule-set JSON is invalid: " + error.message);
    return findings;
  }
  const ids = Array.isArray(rules?.rules) ? rules.rules.map((rule) => rule?.id) : [];
  if (!exactMembers(ids, policy.semgrep.requiredRuleIds)) findings.push("Semgrep rule identifiers do not exactly match policy.");
  return findings;
}

async function loadAndValidatePolicy() {
  const [policyText, schemaText] = await Promise.all([
    readFile(policyPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const policy = JSON.parse(policyText);
  const schema = JSON.parse(schemaText);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const findings = validate(policy) ? [] : (validate.errors || []).map(
    (error) => (error.instancePath || "/") + " " + error.message,
  );
  if (!exactMembers(policy.tools.map((tool) => tool.id), expectedToolIds)) {
    findings.push("Security tool identifiers do not exactly match the reviewed pair.");
  }
  findings.push(...await validateRules(policy));
  if (findings.length) throw new Error("Security policy is invalid:\n- " + findings.join("\n- "));
  return Object.freeze(policy);
}

export async function loadSecurityGatePolicy() {
  policyPromise ||= loadAndValidatePolicy();
  return policyPromise;
}

export function securityToolCachePath(policy, environment = process.env) {
  const configured = environment[policy.artifactCacheEnvironmentVariable];
  return path.resolve(configured || path.join(os.tmpdir(), policy.defaultArtifactCacheDirectoryName));
}

export async function artifactFindings(policy, cachePath) {
  const findings = [];
  for (const tool of policy.tools) {
    const artifactPath = path.join(cachePath, tool.artifact.filename);
    const details = await stat(artifactPath).catch(() => null);
    if (!details?.isFile()) {
      findings.push(Object.freeze({ toolId: tool.id, kind: "MISSING", path: artifactPath }));
      continue;
    }
    if (details.size !== tool.artifact.bytes) {
      findings.push(Object.freeze({ toolId: tool.id, kind: "SIZE_MISMATCH", observed: details.size }));
      continue;
    }
    const observed = sha256(await readFile(artifactPath));
    if (observed !== tool.artifact.sha256) {
      findings.push(Object.freeze({ toolId: tool.id, kind: "SHA256_MISMATCH", observed }));
    }
  }
  return Object.freeze(findings);
}

function markerPattern(policy) {
  return new RegExp("\\b(" + policy.markers.tokens.join("|") + ")\\b", "gu");
}

export function markerFindings(policy, sourceFiles) {
  const tracking = new RegExp(policy.markers.trackingReferencePattern, "u");
  const explanation = new RegExp(policy.markers.explanationPattern, "u");
  const findings = [];
  for (const file of sourceFiles) {
    const lines = String(file.text).split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const tokens = [...lines[index].matchAll(markerPattern(policy))].map((match) => match[1]);
      if (tokens.length && (!tracking.test(lines[index]) || !explanation.test(lines[index]))) {
        findings.push(Object.freeze({ path: file.path, line: index + 1, tokens: Object.freeze(tokens) }));
      }
    }
  }
  return Object.freeze(findings);
}

export function vulnerabilityFindings(policy, auditReport) {
  const expected = policy.dependencyAudit.maximumVulnerabilities;
  const observed = validatedVulnerabilityCounts(auditReport);
  return Object.freeze(Object.keys(expected)
    .filter((severity) => observed[severity] > expected[severity])
    .map((severity) => Object.freeze({
      severity,
      observed: observed[severity],
      maximum: expected[severity],
    })));
}

export function securityToolRegisterRecords(policyText) {
  const findings = [];
  let policy;
  try {
    policy = JSON.parse(String(policyText));
  } catch {
    return Object.freeze({ records: Object.freeze([]), findings: Object.freeze(["audit/security-gate-policy-v1.json: invalid JSON"]) });
  }
  const records = (policy.tools || []).map((tool) => Object.freeze({
    id: tool.id,
    kind: tool.kind,
    version: tool.version,
    licence: tool.licenceExpression,
    sourceUrl: tool.sourceUrl,
    sourceCommit: tool.sourceCommit,
    licenceEvidence: tool.licenceEvidence,
    artifactUrl: tool.artifact?.url,
    artifactSha256: tool.artifact?.sha256,
    artifactBytes: tool.artifact?.bytes,
    ...(tool.artifact?.upstreamChecksumManifest
      ? { upstreamChecksumManifestSha256: tool.artifact.upstreamChecksumManifest.sha256 }
      : {}),
    attributionRecord: "licenses/ci-toolchain.md",
    bundled: false,
    scope: tool.scope,
  }));
  if (records.length !== 2) findings.push("audit/security-gate-policy-v1.json: two security-tool component records are required");
  return Object.freeze({ records: Object.freeze(records), findings: Object.freeze(findings) });
}

export function validatedVulnerabilityCounts(report) {
  const counts = report?.metadata?.vulnerabilities;
  const severities = ["info", "low", "moderate", "high", "critical"];
  const keys = [...severities, "total"];
  if (!counts || Array.isArray(counts) || Object.keys(counts).length !== keys.length
    || !keys.every((key) => Object.hasOwn(counts, key) && Number.isSafeInteger(counts[key]) && counts[key] >= 0)) {
    throw new Error("npm audit vulnerability counts must be complete nonnegative integers.");
  }
  if (severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total) {
    throw new Error("npm audit vulnerability counts have an inconsistent total.");
  }
  return counts;
}
