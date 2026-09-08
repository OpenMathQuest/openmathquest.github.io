import { readFile } from "node:fs/promises";
import path from "node:path";
import { publicationBrowserEvidenceState } from "./browser-runner-evidence.mjs";
import { clearanceMatches, CURRENT_EVIDENCE_SUCCESSOR_POLICY, CURRENT_RELEASE_TAG, evaluateExternalReleaseEvidence, parsePublicationClearance, PUBLICATION_CLEARANCE_PATH } from "./publication-clearance.mjs";
import { observeEvidenceSuccessor } from "./release-evidence-successor.mjs";
import { loadReleaseEvidenceBundle } from "./release-evidence-bundle.mjs";

function expectedPublicationBindings({ engineSha256, curriculumManifest, rightsSha256, publicCandidate, reviewedBrowserEvidence, now, browserEvidenceState }) {
  const reviewedBrowserTuple = browserEvidenceState.reviewedTuple ?? {};
  const expected = {
    engineSha256,
    manifestVersion: curriculumManifest.version,
    manifestSha256: curriculumManifest.sha256,
    rightsSha256,
    payloadSha256: publicCandidate.payloadSha256,
    payloadTreeOid: publicCandidate.payloadTreeOid,
    browserProductName: reviewedBrowserTuple.browserProductName,
    browserFullVersion: reviewedBrowserTuple.browserFullVersion,
    browserExecutableSha256: reviewedBrowserTuple.browserExecutableSha256,
    runnerImageOS: reviewedBrowserTuple.runnerImageOS,
    runnerImageVersion: reviewedBrowserTuple.runnerImageVersion,
    browserRunnerEvidenceSha256: reviewedBrowserEvidence.sha256,
    browserRunnerEvidenceReviewed: browserEvidenceState.valid,
    releaseTag: CURRENT_RELEASE_TAG,
    now,
  };
  return expected;
}

function successfulPublicationReport({ approved, parsed, releaseEvidenceBundle, browserEvidenceReady, browserEvidenceState, evidenceSuccessor, externalReleaseEvidence }) {
  return {
    status: approved ? parsed.status : "BLOCKED",
    reviewDate: parsed.reviewDate,
    reviewResult: parsed.reviewResult,
    requiredFailures: parsed.requiredFailures,
    requiredSkips: parsed.requiredSkips,
    residualRisks: parsed.residualRisks,
    releaseEvidenceBundle: {
      status: releaseEvidenceBundle.valid ? "VALIDATED" : "BLOCKED",
      issues: releaseEvidenceBundle.issues,
    },
    reviewedEngineSha256: parsed.reviewedEngineSha256,
    reviewedManifestVersion: parsed.reviewedManifestVersion,
    reviewedManifestSha256: parsed.reviewedManifestSha256,
    reviewedRightsSha256: parsed.reviewedRightsSha256,
    reviewedPayloadSha256: parsed.reviewedPayloadSha256,
    reviewedPayloadTreeOid: parsed.reviewedPayloadTreeOid,
    reviewedBrowserProductName: parsed.reviewedBrowserProductName,
    reviewedBrowserFullVersion: parsed.reviewedBrowserFullVersion,
    reviewedBrowserExecutableSha256: parsed.reviewedBrowserExecutableSha256,
    reviewedRunnerImageOS: parsed.reviewedRunnerImageOS,
    reviewedRunnerImageVersion: parsed.reviewedRunnerImageVersion,
    browserEvidenceReady,
    liveBrowserEvidenceValid: browserEvidenceState.liveValid,
    reviewedBrowserEvidenceValid: browserEvidenceState.reviewedValid,
    browserTuplesMatch: browserEvidenceState.tuplesMatch,
    evidenceSuccessor,
    externalReleaseEvidence,
    schemaIssues: parsed.issues,
    reason: publicationReason({ approved, parsed, externalReleaseEvidence, evidenceSuccessor }),
  };
}

function blockedPublicationReport({ error, expected, now }) {
  const parsed = parsePublicationClearance("");
  return {
    status: "BLOCKED",
    reviewedEngineSha256: null,
    reviewedManifestVersion: null,
    reviewedManifestSha256: null,
    reviewedRightsSha256: null,
    reviewedPayloadSha256: null,
    reviewedPayloadTreeOid: null,
    reviewedBrowserProductName: null,
    reviewedBrowserFullVersion: null,
    reviewedBrowserExecutableSha256: null,
    reviewedRunnerImageOS: null,
    reviewedRunnerImageVersion: null,
    browserEvidenceReady: false,
    liveBrowserEvidenceValid: false,
    reviewedBrowserEvidenceValid: false,
    browserTuplesMatch: false,
    externalReleaseEvidence: evaluateExternalReleaseEvidence(parsed, expected, now),
    schemaIssues: ["publication clearance is absent or unreadable"],
    reason: `PUBLICATION_CLEARANCE.md is absent or unreadable; all external release evidence and owner authorization remain blocked (${String(error)}).`,
  };
}

function publicationApproved({ curriculumManifest, publicCandidate, browserEvidenceReady, releaseEvidenceBundle, externalReleaseEvidence, parsed, expected }) {
  return curriculumManifest.status === "PASS"
    && publicCandidate.status === "PASS"
    && browserEvidenceReady
    && releaseEvidenceBundle.valid
    && ["PASS", "EMERGENCY_WAIVER"].includes(externalReleaseEvidence.status)
    && clearanceMatches(parsed, expected);
}

export async function publicationClearance({ root, engineSha256, curriculumManifest, rightsSha256, publicCandidate, browser, reviewedBrowserEvidence, now }) {
  const clearancePath = path.join(root, PUBLICATION_CLEARANCE_PATH);
  const liveBrowserEvidence = browser?.evidence ?? {};
  const browserEvidenceState = publicationBrowserEvidenceState(liveBrowserEvidence, reviewedBrowserEvidence);
  const expected = expectedPublicationBindings({ engineSha256, curriculumManifest, rightsSha256, publicCandidate, reviewedBrowserEvidence, now, browserEvidenceState });
  try {
    const clearance = await readFile(clearancePath, "utf8");
    const parsed = parsePublicationClearance(clearance);
    const releaseEvidenceBundle = await loadReleaseEvidenceBundle();
    expected.releaseEvidenceBindings = releaseEvidenceBundle.bindings;
    if (!releaseEvidenceBundle.releaseReady && parsed.status !== "PENDING") {
      throw new Error(`Release evidence bundle is not release-ready: ${releaseEvidenceBundle.issues.join("; ") || releaseEvidenceBundle.lifecycleState}`);
    }
    const evidenceSuccessor = parsed.status === "EMERGENCY_APPROVED"
      ? { valid: true, issues: [] }
      : await observeEvidenceSuccessor(root, parsed.qualificationCommitSha, CURRENT_EVIDENCE_SUCCESSOR_POLICY, CURRENT_RELEASE_TAG);
    expected.qualificationCommitSha = parsed.qualificationCommitSha;
    expected.evidenceSuccessorValid = evidenceSuccessor.valid;
    expected.qualificationPayloadSha256 = evidenceSuccessor.qualificationPayloadSha256;
    expected.qualificationPayloadTreeOid = evidenceSuccessor.qualificationPayloadTreeOid;
    const browserEvidenceReady = browserEvidenceState.valid;
    const externalReleaseEvidence = evaluateExternalReleaseEvidence(parsed, expected, now);
    const approved = publicationApproved({ curriculumManifest, publicCandidate, browserEvidenceReady, releaseEvidenceBundle, externalReleaseEvidence, parsed, expected });
    return successfulPublicationReport({ approved, parsed, releaseEvidenceBundle, browserEvidenceReady, browserEvidenceState, evidenceSuccessor, externalReleaseEvidence });
  } catch (error) {
    return blockedPublicationReport({ error, expected, now });
  }
}


function publicationReason({ approved, parsed, externalReleaseEvidence, evidenceSuccessor }) {
  return approved
      ? parsed.status === "EMERGENCY_APPROVED"
        ? "Emergency Beta 3 clearance matches the exact candidate and reviewed hosted-Windows record, and the final hosted tuple is independently valid; six external evidence gates are transparently owner-waived for this tag only."
        : externalReleaseEvidence.prereleaseHostDeferralEligible
          ? "Reviewed publication clearance matches the exact prerelease candidate, direct evidence successor, reviewed qualification hosted-Windows record, independently valid final hosted tuple, every mandatory Beta external gate, the visible non-passing host deferral, both optional evidence records, and project-owner authorization."
          : "Reviewed publication clearance matches the exact candidate, reviewed qualification hosted-Windows record, independently valid final hosted tuple, every mandatory external gate, both visible optional evidence records, and project-owner authorization."
      : `PUBLICATION_CLEARANCE.md is absent, pending, stale, invalid, or does not match the exact candidate, direct evidence successor, reviewed qualification browser/runner record, independently valid final hosted tuple, required external gates, and visible optional, owner-skipped, or prerelease-deferred evidence records${[...parsed.issues, ...(evidenceSuccessor.issues || [])].length ? ` (${[...parsed.issues, ...(evidenceSuccessor.issues || [])].join("; ")})` : ""}.`;
}
