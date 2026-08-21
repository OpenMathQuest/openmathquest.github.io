import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parseReviewedBrowserRunnerEvidence } from "./browser-runner-evidence.mjs";
import { canonicalizeJson } from "./curriculum-manifest.mjs";
import { parseTrustedHttpsCanaryEvidence } from "./trusted-https-canary.mjs";

export const RELEASE_EVIDENCE_BUNDLE_PATH = "audit/release-evidence-bundle-v1.json";
export const RELEASE_EVIDENCE_BUNDLE_SCHEMA_PATH = "audit/schemas/release-evidence-bundle-v1.schema.json";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const recordDigest = (record) => sha256(Buffer.from(canonicalizeJson(record), "utf8"));
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`;

export async function validateReleaseEvidenceBundleSchema(bundle, schemaPathOrUrl = new URL("../schemas/release-evidence-bundle-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } }).compile(schema);
  return Object.freeze(validate(bundle) ? [] : (validate.errors || []).map(schemaIssue));
}

function binding(record, digest, valid = true) {
  return Object.freeze({
    claimBoundary: record.claimBoundary,
    digest,
    evidenceClass: record.evidenceClass,
    state: record.state,
    valid,
  });
}

export async function loadReleaseEvidenceBundle(pathOrUrl = new URL("../release-evidence-bundle-v1.json", import.meta.url), { root = repositoryRoot } = {}) {
  const bundleBytes = await readFile(pathOrUrl);
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  const issues = [...await validateReleaseEvidenceBundleSchema(bundle)];
  const reviewedAt = Date.parse(bundle.reviewedAtUtc || "");
  const expiresAt = Date.parse(bundle.expiresAtUtc || "");
  if (!Number.isFinite(reviewedAt) || !Number.isFinite(expiresAt) || expiresAt <= reviewedAt) {
    issues.push("evidence timestamps are invalid or reversed");
  }
  const artifact = async (record, parser) => {
    try {
      const bytes = await readFile(path.join(root, ...record.artifactPath.split("/")));
      const digest = sha256(bytes);
      if (digest !== record.artifactSha256) issues.push(`${record.id} artifact SHA-256 does not match`);
      const parsed = parser(bytes.toString("utf8"));
      if (!parsed.valid) issues.push(`${record.id} artifact is invalid: ${parsed.issues.join("; ")}`);
      return binding(record, digest, digest === record.artifactSha256 && parsed.valid);
    } catch (error) {
      issues.push(`${record.id} artifact is unreadable: ${error.message}`);
      return binding(record, record.artifactSha256, false);
    }
  };
  const canary = await artifact(bundle.records.canaryReconciliation, (text) => parseTrustedHttpsCanaryEvidence(text, {
    candidateSha: bundle.records.canaryReconciliation.candidateSha,
    workflowRunId: String(bundle.records.canaryReconciliation.workflowRunId),
    workflowRunAttempt: String(bundle.records.canaryReconciliation.workflowRunAttempt),
    requireReconciled: true,
  }));
  const hostedWindows = await artifact(bundle.records.hostedWindows, parseReviewedBrowserRunnerEvidence);
  const bindings = Object.freeze({
    "EXT-HOST": binding(bundle.records.hostQualification, recordDigest(bundle.records.hostQualification)),
    "EXT-CANARY": canary,
    "EXT-DEVICE": binding(bundle.records.physicalDevice, "NONE"),
    "EXT-REVIEWERS": binding(bundle.records.independentReviewers, "NONE"),
    "EXT-ADJUDICATION": binding(bundle.records.adjudication, recordDigest(bundle.records.adjudication)),
    "EXT-FINDINGS": binding(bundle.records.findingDisposition, recordDigest(bundle.records.findingDisposition)),
    "EXT-HOSTED-WINDOWS": hostedWindows,
    "EXT-OWNER": binding(bundle.records.ownerAuthorization, recordDigest(bundle.records.ownerAuthorization)),
    "REVIEW-BUNDLE": Object.freeze({
      claimBoundary: "BINDS_THE_COMPLETE_CLOSED_RELEASE_EVIDENCE_BUNDLE",
      digest: sha256(bundleBytes),
      evidenceClass: "CANONICAL_BUNDLE",
      expiresAtUtc: bundle.expiresAtUtc,
      qualificationCommitSha: bundle.qualificationCommitSha,
      releaseTag: bundle.releaseTag,
      reviewedAtUtc: bundle.reviewedAtUtc,
      state: "VALIDATED",
      valid: issues.length === 0,
    }),
  });
  return Object.freeze({
    bindings,
    bundle: Object.freeze(bundle),
    issues: Object.freeze(issues),
    valid: issues.length === 0 && Object.values(bindings).every((record) => record.valid),
  });
}
