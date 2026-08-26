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
export const PENDING_TRUSTED_HTTPS_CANARY_PATH = "audit/trusted-https-canary-v1.json";

const PENDING_CANARY_KEYS = Object.freeze(["schemaVersion", "status", "intendedReleaseTag"]);

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const recordDigest = (record) => sha256(Buffer.from(canonicalizeJson(record), "utf8"));
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`;

export function parsePendingTrustedHttpsCanaryEvidence(text, expectedReleaseTag) {
  const issues = [];
  const source = String(text);
  if (source.includes("\r")) issues.push("pending canary evidence must use LF line endings");
  if (!source.endsWith("\n") || source.endsWith("\n\n")) issues.push("pending canary evidence must end with exactly one LF");
  let fields = {};
  try {
    fields = JSON.parse(source);
  } catch {
    issues.push("pending canary evidence is not valid JSON");
  }
  const keys = fields && typeof fields === "object" && !Array.isArray(fields) ? Object.keys(fields) : [];
  if (JSON.stringify(keys) !== JSON.stringify(PENDING_CANARY_KEYS)) {
    issues.push("pending canary evidence must contain only the exact ordered schema");
  }
  if (fields.schemaVersion !== 1) issues.push("pending canary schemaVersion must be 1");
  if (fields.status !== "PENDING") issues.push("pending canary status must be PENDING");
  if (!/^v\d+\.\d+\.\d+-beta\.(0|[1-9]\d*)$/u.test(String(fields.intendedReleaseTag || ""))) {
    issues.push("pending canary intendedReleaseTag must be a semantic beta tag");
  }
  if (expectedReleaseTag && fields.intendedReleaseTag !== expectedReleaseTag) {
    issues.push("pending canary intendedReleaseTag does not match the release evidence bundle");
  }
  if (keys.length && `${JSON.stringify(fields, null, 2)}\n` !== source) {
    issues.push("pending canary evidence must use the canonical two-space JSON form");
  }
  return Object.freeze({ fields: Object.freeze(fields), issues: Object.freeze(issues), valid: issues.length === 0 });
}

export async function validateReleaseEvidenceBundleSchema(bundle, schemaPathOrUrl = new URL("../schemas/release-evidence-bundle-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } }).compile(schema);
  return Object.freeze(validate(bundle) ? [] : (validate.errors || []).map(schemaIssue));
}

function binding(record, digest, valid = true, metadata = {}) {
  return Object.freeze({
    claimBoundary: record.claimBoundary,
    digest,
    evidenceClass: record.evidenceClass,
    state: record.state,
    valid,
    ...metadata,
  });
}

export async function loadReleaseEvidenceBundle(pathOrUrl = new URL("../release-evidence-bundle-v1.json", import.meta.url), { root = repositoryRoot } = {}) {
  const bundleBytes = await readFile(pathOrUrl);
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  const issues = [...await validateReleaseEvidenceBundleSchema(bundle)];
  const lifecycleState = bundle.lifecycleState || "EVIDENCE_REVIEWED";
  const qualificationPending = lifecycleState === "QUALIFICATION_PENDING";
  const betaMatch = /^v\d+\.\d+\.\d+-beta\.(0|[1-9]\d*)$/u.exec(String(bundle.releaseTag || ""));
  const betaOrdinal = betaMatch ? Number(betaMatch[1]) : null;
  const expectedPolicy = betaOrdinal !== null && betaOrdinal >= 8
    ? "RELEASE_EVIDENCE_SUCCESSOR_V2"
    : "RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1";
  const expectedDecisionBasis = betaOrdinal === null ? null : `RECORDED_BETA${betaOrdinal}_CLEARANCE`;
  if (bundle.evidenceSuccessorPolicy !== expectedPolicy) {
    issues.push("evidence successor policy does not match the bundle release tag");
  }
  if (!qualificationPending && bundle.records?.adjudication?.decisionBasis !== expectedDecisionBasis) {
    issues.push("adjudication decisionBasis does not match the bundle release tag");
  }
  if (!("lifecycleState" in bundle)
      && (betaOrdinal !== 7 || bundle.evidenceSuccessorPolicy !== "RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1")) {
    issues.push("only the historical Beta 7 V1 bundle may omit lifecycleState");
  }
  if ("lifecycleState" in bundle && !qualificationPending && bundle.lifecycleState !== "EVIDENCE_REVIEWED") {
    issues.push("reviewed release evidence must use lifecycleState EVIDENCE_REVIEWED");
  }
  const reviewedAt = Date.parse(bundle.reviewedAtUtc || "");
  const expiresAt = Date.parse(bundle.expiresAtUtc || "");
  if (!qualificationPending && (!Number.isFinite(reviewedAt) || !Number.isFinite(expiresAt) || expiresAt <= reviewedAt)) {
    issues.push("evidence timestamps are invalid or reversed");
  }
  const ownerReleaseMatches = bundle.records?.ownerAuthorization?.releaseTag === bundle.releaseTag;
  const canaryCandidateMatches = bundle.records?.canaryReconciliation?.candidateSha === bundle.qualificationCommitSha;
  if (!qualificationPending && !ownerReleaseMatches) issues.push("EXT-OWNER releaseTag does not match the evidence bundle releaseTag");
  if (!qualificationPending && !canaryCandidateMatches) issues.push("EXT-CANARY candidateSha does not match the evidence bundle qualificationCommitSha");
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
  let canary;
  let hostedWindows;
  if (qualificationPending) {
    try {
      const canaryBytes = await readFile(path.join(root, ...bundle.records.canaryReconciliation.artifactPath.split("/")));
      const pendingCanary = parsePendingTrustedHttpsCanaryEvidence(canaryBytes.toString("utf8"), bundle.releaseTag);
      if (!pendingCanary.valid) issues.push(...pendingCanary.issues.map((issue) => `EXT-CANARY ${issue}`));
      canary = binding(bundle.records.canaryReconciliation, "PENDING", pendingCanary.valid);
    } catch (error) {
      issues.push(`EXT-CANARY pending artifact is unreadable: ${error.message}`);
      canary = binding(bundle.records.canaryReconciliation, "PENDING", false);
    }
    hostedWindows = binding(bundle.records.hostedWindows, "PENDING");
  } else {
    canary = await artifact(bundle.records.canaryReconciliation, (text) => parseTrustedHttpsCanaryEvidence(text, {
      candidateSha: bundle.records.canaryReconciliation.candidateSha,
      workflowRunId: String(bundle.records.canaryReconciliation.workflowRunId),
      workflowRunAttempt: String(bundle.records.canaryReconciliation.workflowRunAttempt),
      requireReconciled: true,
    }));
    hostedWindows = await artifact(bundle.records.hostedWindows, (text) => {
      const parsed = parseReviewedBrowserRunnerEvidence(text);
      return parsed.status === bundle.records.hostedWindows.state
        ? parsed
        : { ...parsed, valid: false, issues: [...parsed.issues, `review state ${parsed.status || "MISSING"} does not match ${bundle.records.hostedWindows.state}`] };
    });
  }
  const bindings = Object.freeze({
    "EXT-HOST": binding(bundle.records.hostQualification, recordDigest(bundle.records.hostQualification)),
    "EXT-CANARY": canary,
    "EXT-DEVICE": binding(bundle.records.physicalDevice, "NONE"),
    "EXT-REVIEWERS": binding(bundle.records.independentReviewers, "NONE"),
    "EXT-ADJUDICATION": binding(bundle.records.adjudication, qualificationPending ? "PENDING" : recordDigest(bundle.records.adjudication)),
    "EXT-FINDINGS": binding(bundle.records.findingDisposition, qualificationPending ? "PENDING" : recordDigest(bundle.records.findingDisposition)),
    "EXT-HOSTED-WINDOWS": hostedWindows,
    "EXT-OWNER": binding(
      bundle.records.ownerAuthorization,
      qualificationPending ? "PENDING" : recordDigest(bundle.records.ownerAuthorization),
      qualificationPending || ownerReleaseMatches,
      { protectedRef: bundle.records.ownerAuthorization.protectedRef, releaseTag: bundle.records.ownerAuthorization.releaseTag },
    ),
    "REVIEW-BUNDLE": Object.freeze({
      claimBoundary: "BINDS_THE_COMPLETE_CLOSED_RELEASE_EVIDENCE_BUNDLE",
      digest: sha256(bundleBytes),
      evidenceClass: "CANONICAL_BUNDLE",
      expiresAtUtc: bundle.expiresAtUtc,
      qualificationCommitSha: qualificationPending ? null : bundle.qualificationCommitSha,
      releaseTag: bundle.releaseTag,
      reviewedAtUtc: bundle.reviewedAtUtc,
      state: qualificationPending ? "QUALIFICATION_PENDING" : "VALIDATED",
      valid: issues.length === 0,
    }),
  });
  return Object.freeze({
    bindings,
    bundle: Object.freeze(bundle),
    lifecycleState,
    issues: Object.freeze(issues),
    releaseReady: !qualificationPending && issues.length === 0 && Object.values(bindings).every((record) => record.valid),
    valid: issues.length === 0 && Object.values(bindings).every((record) => record.valid),
  });
}
