import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadShippedEngine } from "./lib/engine-loader.mjs";
import { CURRICULUM_PATH, loadManifest } from "./lib/curriculum-manifest.mjs";
import {
  clearanceMatches,
  CURRENT_RELEASE_TAG,
  evaluateExternalReleaseEvidence,
  parsePublicationClearance,
  PUBLICATION_CLEARANCE_PATH,
} from "./lib/publication-clearance.mjs";
import { rightsStateSha256 } from "./lib/rights-state.mjs";
import {
  BROWSER_RUNNER_EVIDENCE_PATH,
  parseReviewedBrowserRunnerEvidence,
} from "./lib/browser-runner-evidence.mjs";
import { observeDirectEvidenceSuccessor } from "./lib/release-evidence-successor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payloadSha256 = String(process.env.MQ_PUBLIC_PAYLOAD_SHA256 || "");
const payloadTreeOid = String(process.env.MQ_PUBLIC_PAYLOAD_TREE_OID || "");

try {
  if (!/^[a-f0-9]{64}$/u.test(payloadSha256) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(payloadTreeOid)) {
    throw new Error("Validated public-payload environment values are missing or malformed.");
  }
  const [text, browserEvidenceText, engine, manifest, rightsSha256] = await Promise.all([
    readFile(path.join(root, PUBLICATION_CLEARANCE_PATH), "utf8"),
    readFile(path.join(root, BROWSER_RUNNER_EVIDENCE_PATH), "utf8"),
    loadShippedEngine(path.join(root, "index.html")),
    loadManifest(path.join(root, CURRICULUM_PATH)),
    rightsStateSha256(root),
  ]);
  const parsed = parsePublicationClearance(text);
  if (!parsed.valid) throw new Error(`Publication clearance schema failed: ${parsed.issues.join("; ")}`);
  const browserEvidence = parseReviewedBrowserRunnerEvidence(browserEvidenceText);
  if (!browserEvidence.valid || browserEvidence.status !== "REVIEWED") {
    throw new Error(`Reviewed browser/runner evidence is not approved: ${browserEvidence.issues.join("; ") || browserEvidence.status}`);
  }
  const evidenceSuccessor = parsed.status === "EMERGENCY_APPROVED"
    ? { valid: true, issues: [] }
    : await observeDirectEvidenceSuccessor(root, parsed.qualificationCommitSha);
  if (!evidenceSuccessor.valid) {
    throw new Error(`Direct release-evidence successor is invalid: ${evidenceSuccessor.issues.join("; ")}`);
  }
  const expected = {
    engineSha256: engine.sha256,
    manifestVersion: manifest.manifest.version,
    manifestSha256: manifest.sha256,
    rightsSha256,
    payloadSha256,
    payloadTreeOid,
    browserProductName: browserEvidence.browserProductName,
    browserFullVersion: browserEvidence.browserFullVersion,
    browserExecutableSha256: browserEvidence.browserExecutableSha256,
    runnerImageOS: browserEvidence.runnerImageOS,
    runnerImageVersion: browserEvidence.runnerImageVersion,
    browserRunnerEvidenceSha256: createHash("sha256").update(browserEvidenceText, "utf8").digest("hex"),
    browserRunnerEvidenceReviewed: true,
    qualificationCommitSha: parsed.qualificationCommitSha,
    evidenceSuccessorValid: evidenceSuccessor.valid,
    releaseTag: CURRENT_RELEASE_TAG,
    now: new Date(),
  };
  if (!clearanceMatches(parsed, expected)) throw new Error("Publication clearance does not match the exact reviewed artifacts.");
  const externalReleaseEvidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  if (!["PASS", "EMERGENCY_WAIVER"].includes(externalReleaseEvidence.status)) {
    throw new Error(`External release evidence is blocked: ${externalReleaseEvidence.gates.filter((item) => !["PASS", "WAIVED", "DEFERRED", "OPTIONAL", "OWNER_SKIPPED"].includes(item.status)).map((item) => `${item.id}: ${item.details}`).join("; ")}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: parsed.status,
    reviewDate: parsed.reviewDate,
    payloadSha256,
    payloadTreeOid,
    externalReleaseEvidence: {
      status: externalReleaseEvidence.status,
      passCount: externalReleaseEvidence.passCount,
      waivedCount: externalReleaseEvidence.waivedCount,
      ownerSkippedCount: externalReleaseEvidence.ownerSkippedCount,
      deferredCount: externalReleaseEvidence.deferredCount,
      requiredCount: externalReleaseEvidence.requiredCount,
    },
    browserRunnerEvidence: {
      browserProductName: browserEvidence.browserProductName,
      browserFullVersion: browserEvidence.browserFullVersion,
      browserExecutableSha256: browserEvidence.browserExecutableSha256,
      runnerImageOS: browserEvidence.runnerImageOS,
      runnerImageVersion: browserEvidence.runnerImageVersion,
    },
  })}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
