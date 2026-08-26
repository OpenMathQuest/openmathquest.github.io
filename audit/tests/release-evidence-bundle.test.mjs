import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateExternalReleaseEvidence, parsePublicationClearance } from "../lib/publication-clearance.mjs";
import { loadReleaseEvidenceBundle } from "../lib/release-evidence-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("the checked-in release evidence bundle validates every bound artifact", async () => {
  const loaded = await loadReleaseEvidenceBundle();
  assert.equal(loaded.valid, true, loaded.issues.join("; "));
  if (loaded.lifecycleState === "QUALIFICATION_PENDING") {
    assert.equal(loaded.releaseReady, false);
  } else {
    assert.equal(loaded.lifecycleState, "EVIDENCE_REVIEWED");
    assert.equal(loaded.releaseReady, true);
  }
  assert.equal(loaded.bindings["EXT-CANARY"].evidenceClass, "CANONICAL_ARTIFACT");
  assert.equal(loaded.bindings["EXT-HOST"].evidenceClass, "STRUCTURED_ASSERTION");
  assert.equal(loaded.bindings["EXT-HOST"].claimBoundary, "BINDS_THE_RECORDED_DEFERRAL_NOT_EXTERNAL_HOST_APPROVAL");
  assert.equal(loaded.bindings["EXT-DEVICE"].digest, "NONE");
  assert.match(loaded.bindings["REVIEW-BUNDLE"].digest, /^[a-f0-9]{64}$/u);
});

test("publication clearance digests exactly match the validated bundle bindings", async () => {
  const [loaded, clearanceText] = await Promise.all([
    loadReleaseEvidenceBundle(),
    readFile(path.join(root, "PUBLICATION_CLEARANCE.md"), "utf8"),
  ]);
  const parsed = parsePublicationClearance(clearanceText);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  if (parsed.status === "PENDING") {
    assert.equal(loaded.releaseReady, false);
    assert.equal(loaded.lifecycleState, "QUALIFICATION_PENDING");
    assert.equal(loaded.bindings["EXT-CANARY"].digest, "PENDING");
    assert.equal(parsed.canaryReconciliationEvidenceSha256, "PENDING");
    return;
  }
  const pairs = [
    ["EXT-HOST", parsed.hostQualificationEvidenceSha256],
    ["EXT-CANARY", parsed.canaryReconciliationEvidenceSha256],
    ["EXT-DEVICE", parsed.physicalDeviceEvidenceSha256],
    ["EXT-REVIEWERS", parsed.independentReviewerEvidenceSha256],
    ["EXT-ADJUDICATION", parsed.adjudicationEvidenceSha256],
    ["EXT-FINDINGS", parsed.findingDispositionEvidenceSha256],
    ["EXT-HOSTED-WINDOWS", parsed.hostedWindowsEvidenceSha256],
    ["EXT-OWNER", parsed.ownerAuthorizationEvidenceSha256],
    ["REVIEW-BUNDLE", parsed.reviewBundleSha256],
  ];
  for (const [id, digest] of pairs) assert.equal(loaded.bindings[id].digest, digest, id);
});

test("[NC-PUBLICATION-ARBITRARY-HEX-DIGEST] a syntactically valid arbitrary digest cannot satisfy publication evidence", async () => {
  const [loaded, clearanceText] = await Promise.all([
    loadReleaseEvidenceBundle(),
    readFile(path.join(root, "PUBLICATION_CLEARANCE.md"), "utf8"),
  ]);
  const parsed = parsePublicationClearance(clearanceText);
  const expected = {
    engineSha256: parsed.reviewedEngineSha256,
    manifestVersion: parsed.reviewedManifestVersion,
    manifestSha256: parsed.reviewedManifestSha256,
    rightsSha256: parsed.reviewedRightsSha256,
    qualificationPayloadSha256: parsed.reviewedPayloadSha256,
    qualificationPayloadTreeOid: parsed.reviewedPayloadTreeOid,
    qualificationCommitSha: parsed.qualificationCommitSha,
    evidenceSuccessorValid: true,
    browserProductName: parsed.reviewedBrowserProductName,
    browserFullVersion: parsed.reviewedBrowserFullVersion,
    browserExecutableSha256: parsed.reviewedBrowserExecutableSha256,
    runnerImageOS: parsed.reviewedRunnerImageOS,
    runnerImageVersion: parsed.reviewedRunnerImageVersion,
    browserRunnerEvidenceSha256: parsed.hostedWindowsEvidenceSha256,
    browserRunnerEvidenceReviewed: true,
    releaseTag: parsed.authorizedReleaseTag,
    releaseEvidenceBindings: loaded.bindings,
  };
  const baseline = evaluateExternalReleaseEvidence(parsed, expected, new Date("2026-08-21T00:00:00Z"));
  assert.equal(baseline.status, "BLOCKED");
  for (const [field, gateId] of [
    ["hostQualificationEvidenceSha256", "EXT-HOST"],
    ["canaryReconciliationEvidenceSha256", "EXT-CANARY"],
    ["adjudicationEvidenceSha256", "EXT-ADJUDICATION"],
    ["findingDispositionEvidenceSha256", "EXT-FINDINGS"],
    ["ownerAuthorizationEvidenceSha256", "EXT-OWNER"],
    ["reviewBundleSha256", "EXT-OWNER"],
  ]) {
    const mutant = { ...parsed, [field]: "0".repeat(64) };
    const result = evaluateExternalReleaseEvidence(mutant, expected, new Date("2026-08-21T00:00:00Z"));
    assert.equal(result.status, "BLOCKED", field);
    assert.equal(result.gates.find((record) => record.id === gateId)?.status, "BLOCKED", field);
  }
});

test("artifact-byte drift invalidates the bundle instead of accepting its declared digest", async () => {
  const bundlePath = path.join(root, "audit", ".tmp-release-evidence-bundle-mutant.json");
  const bundle = JSON.parse(await readFile(path.join(root, "audit", "release-evidence-bundle-v1.json"), "utf8"));
  bundle.records.canaryReconciliation.artifactSha256 = "0".repeat(64);
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  try {
    const loaded = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(loaded.valid, false);
    assert.ok(loaded.issues.length > 0);
  } finally {
    await rm(bundlePath, { force: true });
  }
});

test("cross-record release identity contradictions fail closed", async () => {
  const bundlePath = path.join(root, "audit", ".tmp-release-evidence-cross-record-mutant.json");
  const baseline = JSON.parse(await readFile(path.join(root, "audit", "release-evidence-bundle-v1.json"), "utf8"));
  const reviewed = baseline.lifecycleState === "EVIDENCE_REVIEWED";
  for (const mutate of [
    (bundle) => { bundle.records.ownerAuthorization.releaseTag = "v9.9.9-beta.9"; },
    (bundle) => { bundle.records.canaryReconciliation.candidateSha = "0".repeat(40); },
    (bundle) => { bundle.records.adjudication.decisionBasis = reviewed ? "RECORDED_BETA9_CLEARANCE" : "RECORDED_BETA8_CLEARANCE"; },
    (bundle) => { bundle.releaseTag = "v1.0.0-beta.9"; },
    (bundle) => { bundle.lifecycleState = reviewed ? "QUALIFICATION_PENDING" : "EVIDENCE_REVIEWED"; },
  ]) {
    const bundle = structuredClone(baseline);
    mutate(bundle);
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    const loaded = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(loaded.valid, false);
    assert.ok(loaded.issues.length > 0, "cross-record contradiction must report at least one issue");
  }
  await rm(bundlePath, { force: true });
});

test("a Beta 8 qualification bundle is structurally valid but cannot claim release readiness", async () => {
  const bundlePath = path.join(root, "audit", ".tmp-release-evidence-pending.json");
  const canaryPath = path.join(root, "audit", "trusted-https-canary-v1.json");
  const originalCanary = await readFile(canaryPath, "utf8");
  const baseline = JSON.parse(await readFile(path.join(root, "audit", "release-evidence-bundle-v1.json"), "utf8"));
  const bundle = structuredClone(baseline);
  bundle.lifecycleState = "QUALIFICATION_PENDING";
  bundle.releaseTag = "v1.0.0-beta.8";
  bundle.qualificationCommitSha = "PENDING";
  bundle.reviewedAtUtc = "PENDING";
  bundle.expiresAtUtc = "PENDING";
  bundle.evidenceSuccessorPolicy = "RELEASE_EVIDENCE_SUCCESSOR_V2";
  Object.assign(bundle.records.canaryReconciliation, {
    state: "PENDING",
    digestMode: "PENDING",
    artifactPath: "audit/trusted-https-canary-v1.json",
    artifactSha256: "PENDING",
    candidateSha: "PENDING",
    workflowRunId: "PENDING",
    workflowRunAttempt: "PENDING",
  });
  Object.assign(bundle.records.adjudication, {
    state: "PENDING", digestMode: "PENDING", recommendation: "PENDING", decisionBasis: "PENDING",
  });
  Object.assign(bundle.records.findingDisposition, {
    state: "PENDING", digestMode: "PENDING", openCritical: "PENDING", openHigh: "PENDING", unacceptedMedium: "PENDING", unrecordedLow: "PENDING",
  });
  Object.assign(bundle.records.hostedWindows, {
    state: "PENDING", digestMode: "PENDING", artifactSha256: "PENDING",
  });
  Object.assign(bundle.records.ownerAuthorization, {
    state: "PENDING", digestMode: "PENDING", releaseTag: "PENDING", protectedRef: "PENDING", authorizationScope: "PENDING",
  });
  const pendingCanary = { schemaVersion: 1, status: "PENDING", intendedReleaseTag: "v1.0.0-beta.8" };
  await writeFile(canaryPath, `${JSON.stringify(pendingCanary, null, 2)}\n`, "utf8");
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  try {
    const loaded = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(loaded.valid, true, loaded.issues.join("; "));
    assert.equal(loaded.releaseReady, false);
    assert.equal(loaded.lifecycleState, "QUALIFICATION_PENDING");
    assert.equal(loaded.bindings["EXT-CANARY"].state, "PENDING");
    assert.equal(loaded.bindings["REVIEW-BUNDLE"].state, "QUALIFICATION_PENDING");

    await writeFile(canaryPath, `${JSON.stringify({ ...pendingCanary, unexpected: true }, null, 2)}\n`, "utf8");
    const openCanary = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(openCanary.valid, false);
    assert.ok(openCanary.issues.some((issue) => issue.includes("exact ordered schema")));
    await writeFile(canaryPath, `${JSON.stringify(pendingCanary, null, 2)}\n`, "utf8");

    bundle.records.canaryReconciliation.state = "RECONCILED";
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    const mixed = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(mixed.valid, false);
    assert.ok(mixed.issues.some((issue) => issue.includes("must be equal to constant")));
  } finally {
    await rm(bundlePath, { force: true });
    await writeFile(canaryPath, originalCanary, "utf8");
  }
});

test("release consumers require releaseReady and cannot promote structural validity", async () => {
  const [auditSource, validatorSource] = await Promise.all([
    readFile(path.join(root, "audit", "run-audit.mjs"), "utf8"),
    readFile(path.join(root, "audit", "validate-publication-clearance.mjs"), "utf8"),
  ]);
  assert.match(auditSource, /!releaseEvidenceBundle\.releaseReady/u);
  assert.match(validatorSource, /!releaseEvidenceBundle\.releaseReady/u);
  assert.doesNotMatch(validatorSource, /!releaseEvidenceBundle\.valid/u);
});
