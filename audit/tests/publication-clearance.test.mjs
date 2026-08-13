import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BROWSER_RUNNER_EVIDENCE_PATH,
  browserRunnerTuplesMatch,
  parseReviewedBrowserRunnerEvidence,
} from "../lib/browser-runner-evidence.mjs";
import { observeBrowserRunnerEvidence } from "../lib/browser-smoke.mjs";
import {
  BETA4_CANARY_OWNER_SKIP_STATE,
  BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS,
  BETA4_RELEASE_TAG,
  clearanceMatches,
  computeReleaseDecision,
  CURRENT_EVIDENCE_SUCCESSOR_POLICY,
  CURRENT_RELEASE_TAG,
  EMERGENCY_BETA3_RELEASE_TAG,
  EMERGENCY_BETA3_WAIVED_GATE_IDS,
  evaluateExternalReleaseEvidence,
  EXTERNAL_RELEASE_GATE_IDS,
  OPTIONAL_EXTERNAL_RELEASE_GATE_IDS,
  parsePublicationClearance,
  PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS,
  PRERELEASE_HOST_QUALIFICATION_STATE,
  PUBLICATION_CLEARANCE_PATH,
  REQUIRED_EXTERNAL_RELEASE_GATE_IDS,
} from "../lib/publication-clearance.mjs";
import {
  evaluateRuntimeEquivalentEvidenceSuccessor,
  observeCommitPublicPayloadIdentity,
  observeRuntimeEquivalentEvidenceSuccessor,
  RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY,
  RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS,
} from "../lib/release-evidence-successor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const expected = Object.freeze({
  engineSha256: "1".repeat(64),
  manifestVersion: "1.0.0",
  manifestSha256: "2".repeat(64),
  rightsSha256: "3".repeat(64),
  payloadSha256: "4".repeat(64),
  payloadTreeOid: "5".repeat(40),
  qualificationPayloadSha256: "4".repeat(64),
  qualificationPayloadTreeOid: "5".repeat(40),
  qualificationCommitSha: "0".repeat(40),
  evidenceSuccessorValid: true,
  browserProductName: "Microsoft Edge",
  browserFullVersion: "150.0.4078.99",
  browserExecutableSha256: "6".repeat(64),
  runnerImageOS: "win25",
  runnerImageVersion: "20260720.1.0",
  browserRunnerEvidenceSha256: "7".repeat(64),
  browserRunnerEvidenceReviewed: true,
  releaseTag: CURRENT_RELEASE_TAG,
  now: new Date("2026-07-29T12:00:00Z"),
});

function approvedClearance(overrides = {}) {
  const fields = {
    "Status": "APPROVED",
    "Review date": "2026-07-28",
    "Review result": "PASS",
    "Required failures": "0",
    "Required skips": "0",
    "Residual risks": "No known unresolved release risks beyond the separately recorded hosting-provider metadata boundary.",
    "Reviewed engine SHA-256": expected.engineSha256,
    "Reviewed curriculum manifest version": expected.manifestVersion,
    "Reviewed curriculum manifest SHA-256": expected.manifestSha256,
    "Reviewed rights-state SHA-256": expected.rightsSha256,
    "Reviewed public payload SHA-256": expected.payloadSha256,
    "Reviewed public payload tree OID": expected.payloadTreeOid,
    "Qualification commit SHA": expected.qualificationCommitSha,
    "Evidence successor policy": CURRENT_EVIDENCE_SUCCESSOR_POLICY,
    "Reviewed browser product name": expected.browserProductName,
    "Reviewed browser full version": expected.browserFullVersion,
    "Reviewed browser executable SHA-256": expected.browserExecutableSha256,
    "Reviewed runner ImageOS": expected.runnerImageOS,
    "Reviewed runner ImageVersion": expected.runnerImageVersion,
    "External evidence reviewed at": "2026-07-28T12:00:00Z",
    "External evidence expires at": "2026-08-28T12:00:00Z",
    "Host qualification state": "APPROVED",
    "Host qualification evidence SHA-256": "8".repeat(64),
    "Canary reconciliation state": "RECONCILED",
    "Canary reconciliation evidence SHA-256": "9".repeat(64),
    "Physical-device evidence state": "COMPLETE",
    "Physical-device evidence SHA-256": "a".repeat(64),
    "Required physical-device lanes": "6",
    "Passed physical-device lanes": "6",
    "Primary iPad journey result": "PASS",
    "Independent-reviewer evidence state": "COMPLETE",
    "Independent-reviewer evidence SHA-256": "b".repeat(64),
    "Required independent-reviewer reports": "6",
    "Sealed independent-reviewer reports": "6",
    "Adjudication state": "APPROVED",
    "Adjudication evidence SHA-256": "c".repeat(64),
    "Adjudication recommendation": "RELEASE",
    "Finding-disposition state": "COMPLETE",
    "Finding-disposition evidence SHA-256": "d".repeat(64),
    "Open critical findings": "0",
    "Open high findings": "0",
    "Unaccepted medium findings": "0",
    "Unrecorded low findings": "0",
    "Hosted-Windows evidence state": "REVIEWED",
    "Hosted-Windows evidence SHA-256": expected.browserRunnerEvidenceSha256,
    "Owner authorization state": "PR_PUSH_AUTHORIZED",
    "Owner authorization evidence SHA-256": "e".repeat(64),
    "Authorized release tag": CURRENT_RELEASE_TAG,
    "Authorized protected ref": "refs/heads/main",
    "Review-bundle SHA-256": "f".repeat(64),
    ...overrides,
  };
  return `# Math Quest publication clearance\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n`;
}

function emergencyClearance(overrides = {}) {
  const waiverDigest = "e".repeat(64);
  return approvedClearance({
    "Status": "EMERGENCY_APPROVED",
    "Review result": "EMERGENCY_PASS",
    "Residual risks": "Emergency Beta 3: six external evidence gates were not completed; exact automated and hosted-Windows certification passed.",
    "Host qualification state": "WAIVED_BETA3",
    "Host qualification evidence SHA-256": waiverDigest,
    "Canary reconciliation state": "WAIVED_BETA3",
    "Canary reconciliation evidence SHA-256": waiverDigest,
    "Qualification commit SHA": "NOT_APPLICABLE_BETA3",
    "Evidence successor policy": "NOT_APPLICABLE_BETA3",
    "Physical-device evidence state": "WAIVED_BETA3",
    "Physical-device evidence SHA-256": waiverDigest,
    "Passed physical-device lanes": "0",
    "Primary iPad journey result": "NOT_RUN",
    "Independent-reviewer evidence state": "WAIVED_BETA3",
    "Independent-reviewer evidence SHA-256": waiverDigest,
    "Sealed independent-reviewer reports": "0",
    "Adjudication state": "WAIVED_BETA3",
    "Adjudication evidence SHA-256": waiverDigest,
    "Adjudication recommendation": "NOT_RUN",
    "Finding-disposition state": "AUTOMATED_ONLY",
    "Finding-disposition evidence SHA-256": waiverDigest,
    "Unaccepted medium findings": "UNKNOWN",
    "Unrecorded low findings": "UNKNOWN",
    "Owner authorization state": "EMERGENCY_BETA3_AUTHORIZED",
    "Owner authorization evidence SHA-256": waiverDigest,
    "Authorized release tag": EMERGENCY_BETA3_RELEASE_TAG,
    ...overrides,
  });
}

function optionalReviewerClearance(overrides = {}) {
  return approvedClearance({
    "Independent-reviewer evidence state": "OPTIONAL_NOT_RUN",
    "Independent-reviewer evidence SHA-256": "NONE",
    "Required independent-reviewer reports": "0",
    "Sealed independent-reviewer reports": "0",
    ...overrides,
  });
}

function optionalDeviceClearance(overrides = {}) {
  return approvedClearance({
    "Physical-device evidence state": "OPTIONAL_NOT_RUN",
    "Physical-device evidence SHA-256": "NONE",
    "Required physical-device lanes": "0",
    "Passed physical-device lanes": "0",
    "Primary iPad journey result": "NOT_RUN",
    ...overrides,
  });
}

function deferredHostClearance(overrides = {}) {
  return approvedClearance({
    "Residual risks": "Host privacy deferred until stable: GitHub Pages may receive ordinary request metadata, and its under-13 terms remain unqualified.",
    "Host qualification state": PRERELEASE_HOST_QUALIFICATION_STATE,
    "Host qualification evidence SHA-256": "8".repeat(64),
    ...overrides,
  });
}

function reviewedEvidence(overrides = {}) {
  return `${JSON.stringify({
    schemaVersion: 1,
    status: "REVIEWED",
    browserProductName: expected.browserProductName,
    browserFullVersion: expected.browserFullVersion,
    browserExecutableSha256: expected.browserExecutableSha256,
    runnerImageOS: expected.runnerImageOS,
    runnerImageVersion: expected.runnerImageVersion,
    ...overrides,
  }, null, 2)}\n`;
}

test("checked-in publication and browser evidence records are exact and mutually coherent", async () => {
  const [clearanceText, evidenceText] = await Promise.all([
    readFile(path.join(root, PUBLICATION_CLEARANCE_PATH), "utf8"),
    readFile(path.join(root, BROWSER_RUNNER_EVIDENCE_PATH), "utf8"),
  ]);
  const clearance = parsePublicationClearance(clearanceText);
  const evidence = parseReviewedBrowserRunnerEvidence(evidenceText);
  assert.equal(clearance.valid, true, clearance.issues.join("; "));
  assert.equal(evidence.valid, true, evidence.issues.join("; "));
  if (clearance.status === "PENDING") {
    assert.equal(evidence.status, "PENDING");
    assert.equal(clearance.hostQualificationState, PRERELEASE_HOST_QUALIFICATION_STATE);
    assert.match(clearance.hostQualificationEvidenceSha256, /^[a-f0-9]{64}$/u);
    assert.equal(clearanceMatches(clearance, expected), false);
  } else {
    assert.ok(["APPROVED", "EMERGENCY_APPROVED"].includes(clearance.status));
    assert.equal(evidence.status, "REVIEWED");
    assert.equal(browserRunnerTuplesMatch({
      browserProductName: clearance.reviewedBrowserProductName,
      browserFullVersion: clearance.reviewedBrowserFullVersion,
      browserExecutableSha256: clearance.reviewedBrowserExecutableSha256,
      runnerImageOS: clearance.reviewedRunnerImageOS,
      runnerImageVersion: clearance.reviewedRunnerImageVersion,
    }, evidence), true);
  }
});

test("an emergency Beta 3 waiver is exact, visible, tag-bound, and cannot impersonate passed evidence", () => {
  const parsed = parsePublicationClearance(emergencyClearance());
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  const emergencyExpected = { ...expected, releaseTag: EMERGENCY_BETA3_RELEASE_TAG };
  const evidence = evaluateExternalReleaseEvidence(parsed, emergencyExpected, expected.now);
  assert.equal(evidence.status, "EMERGENCY_WAIVER");
  assert.equal(evidence.passCount, 2);
  assert.equal(evidence.waivedCount, 6);
  assert.deepEqual(
    evidence.gates.filter((item) => item.status === "WAIVED").map((item) => item.id),
    EMERGENCY_BETA3_WAIVED_GATE_IDS,
  );
  assert.equal(evidence.gates.every((item) => item.status !== "BLOCKED"), true);
  assert.equal(clearanceMatches(parsed, emergencyExpected), true);
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "EMERGENCY_APPROVED",
    externalReleaseEvidence: evidence,
  }), true);

  for (const [field, value] of [
    ["Authorized release tag", CURRENT_RELEASE_TAG],
    ["Owner authorization state", "PR_PUSH_AUTHORIZED"],
    ["Passed physical-device lanes", "6"],
    ["Sealed independent-reviewer reports", "6"],
    ["Host qualification evidence SHA-256", "8".repeat(64)],
    ["Residual risks", "NONE"],
  ]) {
    const mutant = parsePublicationClearance(emergencyClearance({ [field]: value }));
    assert.equal(mutant.valid, false, `${field} must remain exact under emergency approval`);
    assert.equal(evaluateExternalReleaseEvidence(mutant, emergencyExpected, expected.now).status, "BLOCKED");
  }

  assert.equal(
    evaluateExternalReleaseEvidence(parsed, expected, expected.now).status,
    "BLOCKED",
    "the Beta 3 emergency record must never authorize the Beta 5 candidate",
  );

  assert.equal(computeReleaseDecision({
    technicalShippable: false,
    publicationStatus: "EMERGENCY_APPROVED",
    externalReleaseEvidence: evidence,
  }), false);
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), false);
});

test("an approved clearance matches only the exact complete browser/runner tuple", () => {
  const parsed = parsePublicationClearance(approvedClearance());
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(clearanceMatches(parsed, expected), true);
  for (const [key, value] of [
    ["browserProductName", "Google Chrome"],
    ["browserFullVersion", "150.0.4078.100"],
    ["browserExecutableSha256", "7".repeat(64)],
    ["runnerImageOS", "win22"],
    ["runnerImageVersion", "20260721.1.0"],
  ]) {
    assert.equal(
      clearanceMatches(parsed, { ...expected, [key]: value }),
      false,
      `${key} drift must invalidate approval`,
    );
  }
});

test("a valid Beta 5 evidence successor binds clearance to the qualification payload rather than its changed evidence payload", () => {
  const parsed = parsePublicationClearance(approvedClearance());
  const successorExpected = {
    ...expected,
    payloadSha256: "a".repeat(64),
    payloadTreeOid: "b".repeat(40),
  };
  assert.equal(clearanceMatches(parsed, successorExpected), true);
  assert.equal(evaluateExternalReleaseEvidence(parsed, successorExpected, expected.now).status, "PASS");
  for (const [key, value] of [
    ["qualificationPayloadSha256", "0".repeat(64)],
    ["qualificationPayloadTreeOid", "0".repeat(40)],
  ]) {
    const mutant = { ...successorExpected, [key]: value };
    assert.equal(clearanceMatches(parsed, mutant), false, `${key} drift must block the successor`);
    assert.equal(evaluateExternalReleaseEvidence(parsed, mutant, expected.now).status, "BLOCKED");
  }
});

test("the Beta 5 runtime-equivalent evidence successor is one exact non-merge commit changing only the two governed records", () => {
  const candidateCommitSha = "1".repeat(40);
  const qualificationCommitSha = expected.qualificationCommitSha;
  const baseline = {
    candidateCommitSha,
    parentCommitShas: [qualificationCommitSha],
    qualificationCommitSha,
    changedPaths: [...RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS],
    qualificationClearanceStatus: "PENDING",
    qualificationBrowserEvidenceStatus: "PENDING",
  };
  const exact = evaluateRuntimeEquivalentEvidenceSuccessor(baseline);
  assert.equal(exact.valid, true, exact.issues.join("; "));
  assert.equal(exact.policy, RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY);
  assert.deepEqual(exact.changedPaths, RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS);

  for (const [label, mutation] of [
    ["merge commit", { parentCommitShas: [qualificationCommitSha, "2".repeat(40)] }],
    ["wrong parent", { parentCommitShas: ["2".repeat(40)] }],
    ["skipped ancestor", { qualificationCommitSha: "3".repeat(40) }],
    ["missing evidence path", { changedPaths: ["PUBLICATION_CLEARANCE.md"] }],
    ["extra documentation", { changedPaths: [...RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS, "README.md"] }],
    ["game byte change", { changedPaths: [...RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS, "index.html"] }],
    ["clearance already approved", { qualificationClearanceStatus: "APPROVED" }],
    ["browser evidence already reviewed", { qualificationBrowserEvidenceStatus: "REVIEWED" }],
  ]) {
    const result = evaluateRuntimeEquivalentEvidenceSuccessor({ ...baseline, ...mutation });
    assert.equal(result.valid, false, label);
  }
});

test("the Git observer proves an actual immediate Beta 5 runtime-equivalent evidence successor", async () => {
  const repository = await mkdtemp(path.join(root, "audit", ".tmp-successor-observer-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  try {
    await mkdir(path.join(repository, "audit"));
    git("init");
    git("config", "user.name", "Math Quest Regression");
    git("config", "user.email", "math-quest-regression");
    await writeFile(path.join(repository, "PUBLICATION_CLEARANCE.md"), "# Test\nStatus: PENDING\n", "utf8");
    await writeFile(path.join(repository, "audit", "browser-runner-evidence-v1.json"), '{"status":"PENDING"}\n', "utf8");
    git("add", "PUBLICATION_CLEARANCE.md", "audit/browser-runner-evidence-v1.json");
    git("commit", "-m", "qualification");
    const qualificationCommitSha = git("rev-parse", "HEAD");
    await writeFile(path.join(repository, "PUBLICATION_CLEARANCE.md"), "# Test\nStatus: APPROVED\n", "utf8");
    await writeFile(path.join(repository, "audit", "browser-runner-evidence-v1.json"), '{"status":"REVIEWED"}\n', "utf8");
    git("add", "PUBLICATION_CLEARANCE.md", "audit/browser-runner-evidence-v1.json");
    git("commit", "-m", "evidence successor");
    const observed = await observeRuntimeEquivalentEvidenceSuccessor(repository, qualificationCommitSha);
    assert.equal(observed.valid, true, observed.issues.join("; "));
    assert.equal(observed.policy, RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_POLICY);
    assert.equal(observed.qualificationCommitSha, qualificationCommitSha);
    assert.deepEqual(observed.changedPaths, RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_PATHS);
    assert.match(observed.qualificationPayloadSha256, /^[a-f0-9]{64}$/u);
    assert.match(observed.qualificationPayloadTreeOid, /^[a-f0-9]{40}$/u);
    const successorPayload = await observeCommitPublicPayloadIdentity(repository, observed.candidateCommitSha);
    assert.notEqual(observed.qualificationPayloadSha256, successorPayload.sha256);
    assert.notEqual(observed.qualificationPayloadTreeOid, successorPayload.treeOid);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("five mandatory Beta 5 gates, the deferred host, and both optional cycles remain visible", () => {
  const parsed = parsePublicationClearance(approvedClearance());
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.requiredCount, 5);
  assert.equal(evidence.passCount, 5);
  assert.equal(evidence.ownerSkippedCount, 0);
  assert.equal(evidence.deferredCount, 0);
  assert.equal(evidence.optionalCount, 2);
  assert.equal(evidence.optionalCompletedCount, 2);
  assert.deepEqual(
    REQUIRED_EXTERNAL_RELEASE_GATE_IDS,
    EXTERNAL_RELEASE_GATE_IDS.filter((id) => !["EXT-DEVICE", "EXT-REVIEWERS"].includes(id)),
  );
  assert.deepEqual(OPTIONAL_EXTERNAL_RELEASE_GATE_IDS, ["EXT-DEVICE", "EXT-REVIEWERS"]);
  assert.deepEqual(PRERELEASE_DEFERRED_EXTERNAL_RELEASE_GATE_IDS, ["EXT-HOST"]);
  assert.deepEqual(BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS, ["EXT-CANARY"]);
  assert.deepEqual(evidence.gates.map((item) => item.id), EXTERNAL_RELEASE_GATE_IDS);
  assert.equal(evidence.gates.find((item) => item.id === "EXT-CANARY")?.status, "PASS");
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), true);

  for (const [field, value, gateId] of [
    ["Host qualification state", "PENDING", "EXT-HOST"],
    ["Canary reconciliation state", "PENDING", "EXT-CANARY"],
    ["Passed physical-device lanes", "5", "EXT-DEVICE"],
    ["Sealed independent-reviewer reports", "5", "EXT-REVIEWERS"],
    ["Adjudication recommendation", "BLOCK", "EXT-ADJUDICATION"],
    ["Unaccepted medium findings", "1", "EXT-FINDINGS"],
    ["Hosted-Windows evidence state", "PENDING", "EXT-HOSTED-WINDOWS"],
    ["Owner authorization state", "PENDING", "EXT-OWNER"],
    ["Host qualification evidence SHA-256", "A".repeat(64), "EXT-HOST"],
    ["Authorized release tag", "v1.0.0-beta.2", "EXT-OWNER"],
    ["Authorized protected ref", "refs/heads/release", "EXT-OWNER"],
  ]) {
    const mutant = parsePublicationClearance(approvedClearance({ [field]: value }));
    const mutantEvidence = evaluateExternalReleaseEvidence(mutant, expected, expected.now);
    assert.equal(mutantEvidence.status, "BLOCKED", `${field} mutant must block`);
    assert.equal(mutantEvidence.gates.find((item) => item.id === gateId)?.status, "BLOCKED");
    assert.equal(computeReleaseDecision({
      technicalShippable: true,
      publicationStatus: "APPROVED",
      externalReleaseEvidence: mutantEvidence,
    }), false, `${field} mutant must prevent Shippable YES`);
  }
});

test("the owner-directed host deferral is non-passing and release-eligible only for an exact prerelease record", () => {
  const parsed = parsePublicationClearance(deferredHostClearance());
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.requiredCount, 5);
  assert.equal(evidence.passCount, 5);
  assert.equal(evidence.ownerSkippedCount, 0);
  assert.equal(evidence.deferredCount, 1);
  assert.equal(evidence.prereleaseHostDeferralEligible, true);
  assert.equal(evidence.gates.find((item) => item.id === "EXT-HOST")?.status, "DEFERRED");
  assert.equal(evidence.gates.find((item) => item.id === "EXT-CANARY")?.status, "PASS");
  assert.equal(clearanceMatches(parsed, expected), true);
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), true);

  const stableEvidence = evaluateExternalReleaseEvidence(parsed, {
    ...expected,
    releaseTag: "v1.0.0",
  }, expected.now);
  assert.equal(stableEvidence.status, "BLOCKED");
  assert.equal(stableEvidence.prereleaseHostDeferralEligible, false);
  assert.equal(stableEvidence.gates.find((item) => item.id === "EXT-HOST")?.status, "BLOCKED");

  for (const [field, value] of [
    ["Host qualification evidence SHA-256", "NONE"],
    ["Host qualification evidence SHA-256", "A".repeat(64)],
    ["Residual risks", "NONE"],
  ]) {
    const mutant = parsePublicationClearance(deferredHostClearance({ [field]: value }));
    assert.equal(mutant.valid, false, `${field} must preserve the exact digest-bound disclosed deferral`);
    assert.equal(evaluateExternalReleaseEvidence(mutant, expected, expected.now).status, "BLOCKED");
  }

  const canaryPending = parsePublicationClearance(deferredHostClearance({
    "Canary reconciliation state": "PENDING",
  }));
  const canaryEvidence = evaluateExternalReleaseEvidence(canaryPending, expected, expected.now);
  assert.equal(canaryEvidence.status, "BLOCKED");
  assert.equal(canaryEvidence.gates.find((item) => item.id === "EXT-CANARY")?.status, "BLOCKED");

  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: { ...evidence, prereleaseHostDeferralEligible: false },
  }), false, "a synthetic DEFERRED status without evaluator-bound prerelease eligibility must not ship");
});

test("the Beta 4 canary skip is historical and cannot authorize Beta 5", () => {
  assert.equal(CURRENT_RELEASE_TAG, "v1.0.0-beta.5");
  assert.equal(BETA4_RELEASE_TAG, "v1.0.0-beta.4");
  assert.deepEqual(BETA4_OWNER_SKIPPED_EXTERNAL_GATE_IDS, ["EXT-CANARY"]);
  const parsed = parsePublicationClearance(deferredHostClearance({
    "Residual risks": "Host privacy deferred until stable: provider metadata remains; Beta 4 canary owner-skipped: historical only.",
    "Canary reconciliation state": BETA4_CANARY_OWNER_SKIP_STATE,
    "Canary reconciliation evidence SHA-256": "NONE",
  }));
  assert.equal(parsed.valid, false);
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.gates.find((item) => item.id === "EXT-CANARY")?.status, "BLOCKED");
  assert.equal(clearanceMatches(parsed, expected), false);
});

test("declining the offered six-reviewer cycle is nonblocking but cannot conceal malformed or incomplete review evidence", () => {
  const parsed = parsePublicationClearance(optionalReviewerClearance());
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.requiredCount, 5);
  assert.equal(evidence.passCount, 5);
  assert.equal(evidence.ownerSkippedCount, 0);
  assert.equal(evidence.optionalCompletedCount, 1);
  assert.equal(evidence.gates.find((item) => item.id === "EXT-REVIEWERS")?.status, "OPTIONAL");
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), true);

  for (const [field, value] of [
    ["Independent-reviewer evidence SHA-256", "b".repeat(64)],
    ["Required independent-reviewer reports", "6"],
    ["Sealed independent-reviewer reports", "1"],
    ["Independent-reviewer evidence state", "PENDING"],
  ]) {
    const mutant = parsePublicationClearance(optionalReviewerClearance({ [field]: value }));
    assert.equal(mutant.valid, false, `${field} must preserve the exact optional-not-run state`);
    assert.equal(evaluateExternalReleaseEvidence(mutant, expected, expected.now).status, "BLOCKED");
  }

  const incompleteSelected = parsePublicationClearance(approvedClearance({
    "Sealed independent-reviewer reports": "5",
  }));
  assert.equal(incompleteSelected.valid, false);
  assert.equal(evaluateExternalReleaseEvidence(incompleteSelected, expected, expected.now).status, "BLOCKED");
});

test("declining the offered six-lane device cycle is nonblocking but cannot conceal malformed or partial device evidence", () => {
  const parsed = parsePublicationClearance(optionalDeviceClearance());
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.requiredCount, 5);
  assert.equal(evidence.passCount, 5);
  assert.equal(evidence.ownerSkippedCount, 0);
  assert.equal(evidence.optionalCompletedCount, 1);
  assert.equal(evidence.gates.find((item) => item.id === "EXT-DEVICE")?.status, "OPTIONAL");
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), true);

  for (const [field, value] of [
    ["Physical-device evidence SHA-256", "a".repeat(64)],
    ["Required physical-device lanes", "6"],
    ["Passed physical-device lanes", "1"],
    ["Primary iPad journey result", "PASS"],
    ["Physical-device evidence state", "PENDING"],
  ]) {
    const mutant = parsePublicationClearance(optionalDeviceClearance({ [field]: value }));
    assert.equal(mutant.valid, false, `${field} must preserve the exact optional-not-run state`);
    assert.equal(evaluateExternalReleaseEvidence(mutant, expected, expected.now).status, "BLOCKED");
  }

  const incompleteSelected = parsePublicationClearance(approvedClearance({
    "Passed physical-device lanes": "5",
  }));
  assert.equal(incompleteSelected.valid, false);
  assert.equal(evaluateExternalReleaseEvidence(incompleteSelected, expected, expected.now).status, "BLOCKED");
});

test("external evidence rejects missing, stale, future, and mismatched records", () => {
  const baseline = parsePublicationClearance(approvedClearance());
  const stale = parsePublicationClearance(approvedClearance({
    "External evidence expires at": "2026-07-29T11:59:59Z",
  }));
  assert.equal(stale.valid, true, stale.issues.join("; "));
  assert.equal(evaluateExternalReleaseEvidence(stale, expected, expected.now).status, "BLOCKED");

  const future = parsePublicationClearance(approvedClearance({
    "External evidence reviewed at": "2026-07-30T12:00:00Z",
    "External evidence expires at": "2026-08-30T12:00:00Z",
  }));
  assert.equal(future.valid, true, future.issues.join("; "));
  assert.equal(evaluateExternalReleaseEvidence(future, expected, expected.now).status, "BLOCKED");

  const hostedMismatch = evaluateExternalReleaseEvidence(baseline, {
    ...expected,
    browserRunnerEvidenceSha256: "0".repeat(64),
  }, expected.now);
  assert.equal(hostedMismatch.status, "BLOCKED");
  assert.equal(hostedMismatch.gates.find((item) => item.id === "EXT-HOSTED-WINDOWS")?.status, "BLOCKED");
  assert.equal(clearanceMatches(baseline, {
    ...expected,
    browserRunnerEvidenceSha256: "0".repeat(64),
  }), false);
  const hostedPending = evaluateExternalReleaseEvidence(baseline, {
    ...expected,
    browserRunnerEvidenceReviewed: false,
  }, expected.now);
  assert.equal(hostedPending.status, "BLOCKED");
  assert.equal(hostedPending.gates.find((item) => item.id === "EXT-HOSTED-WINDOWS")?.status, "BLOCKED");

  for (const [key, value] of [
    ["engineSha256", "0".repeat(64)],
    ["manifestSha256", "0".repeat(64)],
    ["rightsSha256", "0".repeat(64)],
    ["qualificationPayloadSha256", "0".repeat(64)],
    ["qualificationPayloadTreeOid", "0".repeat(40)],
  ]) {
    const mismatch = evaluateExternalReleaseEvidence(baseline, { ...expected, [key]: value }, expected.now);
    assert.equal(mismatch.status, "BLOCKED", `${key} candidate mismatch must block`);
    assert.equal(clearanceMatches(baseline, { ...expected, [key]: value }), false);
  }

  for (const field of [
    "Qualification commit SHA",
    "Evidence successor policy",
    "Host qualification state",
    "Canary reconciliation evidence SHA-256",
    "Physical-device evidence state",
    "Independent-reviewer evidence state",
    "Adjudication state",
    "Finding-disposition state",
    "Hosted-Windows evidence state",
    "Owner authorization state",
  ]) {
    const missing = approvedClearance().replace(new RegExp(`^${field}:.*\\n`, "mu"), "");
    const parsed = parsePublicationClearance(missing);
    assert.equal(parsed.valid, false, `${field} omission must fail the closed schema`);
    assert.equal(evaluateExternalReleaseEvidence(parsed, expected, expected.now).status, "BLOCKED");
  }
});

test("the release decision rejects missing, duplicated, reordered, and blocked gate results", () => {
  const evidence = evaluateExternalReleaseEvidence(parsePublicationClearance(approvedClearance()), expected, expected.now);
  const decide = (gates) => computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: { ...evidence, status: "PASS", gates },
  });
  for (let index = 0; index < evidence.gates.length; index += 1) {
    const blocked = evidence.gates.map((item, itemIndex) => (
      itemIndex === index ? { ...item, status: "BLOCKED" } : item
    ));
    assert.equal(decide(blocked), false, `${evidence.gates[index].id} must be required`);
  }
  assert.equal(decide(evidence.gates.slice(1)), false);
  assert.equal(decide([...evidence.gates, evidence.gates[0]]), false);
  assert.equal(decide([evidence.gates[1], evidence.gates[0], ...evidence.gates.slice(2)]), false);
  assert.equal(computeReleaseDecision({
    technicalShippable: false,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: evidence,
  }), false);
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "BLOCKED",
    externalReleaseEvidence: evidence,
  }), false);
  assert.equal(computeReleaseDecision({
    technicalShippable: true,
    publicationStatus: "APPROVED",
    externalReleaseEvidence: { ...evidence, status: "BLOCKED" },
  }), false);
});

test("publication parser rejects malformed, missing, reordered, and extra browser tuple fields", () => {
  for (const [field, value] of [
    ["Reviewed browser product name", "Firefox"],
    ["Reviewed browser full version", "150.0"],
    ["Reviewed browser executable SHA-256", "A".repeat(64)],
    ["Reviewed runner ImageOS", "windows/latest"],
    ["Reviewed runner ImageVersion", "PENDING"],
  ]) {
    const parsed = parsePublicationClearance(approvedClearance({ [field]: value }));
    assert.equal(parsed.valid, false, `${field} mutation must fail the schema`);
  }
  const missing = approvedClearance().replace(/^Reviewed runner ImageOS:.*\n/mu, "");
  assert.equal(parsePublicationClearance(missing).valid, false);
  const reordered = approvedClearance().replace(
    /Reviewed runner ImageOS: ([^\n]+)\nReviewed runner ImageVersion: ([^\n]+)\n/u,
    "Reviewed runner ImageVersion: $2\nReviewed runner ImageOS: $1\n",
  );
  assert.equal(parsePublicationClearance(reordered).valid, false);
  assert.equal(parsePublicationClearance(`${approvedClearance()}Unexpected: field\n`).valid, false);
});

test("reviewed browser evidence is closed, canonical, and effect-sensitive", () => {
  const parsed = parseReviewedBrowserRunnerEvidence(reviewedEvidence());
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(parsed.status, "REVIEWED");
  assert.equal(browserRunnerTuplesMatch(parsed, expected), true);

  for (const [key, value] of [
    ["browserProductName", "Google Chrome"],
    ["browserFullVersion", "150.0.4078.100"],
    ["browserExecutableSha256", "7".repeat(64)],
    ["runnerImageOS", "win22"],
    ["runnerImageVersion", "20260721.1.0"],
  ]) {
    const changed = parseReviewedBrowserRunnerEvidence(reviewedEvidence({ [key]: value }));
    assert.equal(changed.valid, true, `${key} control should remain structurally valid`);
    assert.equal(browserRunnerTuplesMatch(parsed, changed), false, `${key} drift must be detected`);
  }

  const extra = JSON.parse(reviewedEvidence());
  extra.unexpected = true;
  assert.equal(parseReviewedBrowserRunnerEvidence(`${JSON.stringify(extra, null, 2)}\n`).valid, false);
  assert.equal(parseReviewedBrowserRunnerEvidence(reviewedEvidence().replace(/\n  /u, "\n    ")).valid, false);
  assert.equal(parseReviewedBrowserRunnerEvidence(reviewedEvidence().replace(/\n$/u, "")).valid, false);
});

test("live browser evidence binds the selected bytes and exact hosted image tuple", async () => {
  const directory = await mkdtemp(path.join(root, "audit", ".tmp-browser-evidence-"));
  const executable = path.join(directory, "msedge.exe");
  const bytes = Buffer.from("disposable browser identity fixture", "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(executable, bytes);
  try {
    const environment = {
      MQ_BROWSER_PRODUCT_NAME: expected.browserProductName,
      MQ_BROWSER_PRODUCT_VERSION: expected.browserFullVersion,
      MQ_BROWSER_EXECUTABLE_SHA256: sha256,
      MQ_AUDIT_RUNNER_KIND: "GITHUB_HOSTED",
      MQ_AUDIT_RUNNER_IMAGE_OS: expected.runnerImageOS,
      MQ_AUDIT_RUNNER_IMAGE_VERSION: expected.runnerImageVersion,
      MQ_AUDIT_RUNNER_LABEL: "windows-latest",
    };
    const observed = await observeBrowserRunnerEvidence(executable, environment);
    assert.equal(observed.status, "OBSERVED_GITHUB_HOSTED");
    assert.equal(observed.validForPublication, true);
    assert.equal(observed.browserExecutableSha256, sha256);

    const changedHash = await observeBrowserRunnerEvidence(executable, {
      ...environment,
      MQ_BROWSER_EXECUTABLE_SHA256: "7".repeat(64),
    });
    assert.equal(changedHash.validForPublication, false);
    assert.match(changedHash.issues.join("; "), /SHA-256 changed/u);

    const changedLabel = await observeBrowserRunnerEvidence(executable, {
      ...environment,
      MQ_AUDIT_RUNNER_LABEL: "windows-2025",
    });
    assert.equal(changedLabel.validForPublication, false);
    assert.match(changedLabel.issues.join("; "), /windows-latest/u);

    const local = await observeBrowserRunnerEvidence(executable, {
      MQ_BROWSER_PRODUCT_NAME: expected.browserProductName,
      MQ_BROWSER_PRODUCT_VERSION: expected.browserFullVersion,
      MQ_BROWSER_EXECUTABLE_SHA256: sha256,
      MQ_AUDIT_RUNNER_KIND: "LOCAL",
    });
    assert.equal(local.status, "OBSERVED_LOCAL");
    assert.equal(local.browserIdentityValid, true);
    assert.equal(local.validForPublication, false);
    assert.equal(local.runnerImageOS, null);
    assert.equal(local.runnerImageVersion, null);

    const unknownRunner = await observeBrowserRunnerEvidence(executable, {
      ...environment,
      MQ_AUDIT_RUNNER_KIND: "SELF_HOSTED",
    });
    assert.equal(unknownRunner.status, "INVALID");
    assert.equal(unknownRunner.validForPublication, false);
    assert.match(unknownRunner.issues.join("; "), /LOCAL or GITHUB_HOSTED/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
