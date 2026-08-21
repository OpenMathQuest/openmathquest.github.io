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
  assert.equal(baseline.status, "PASS");
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
    assert.ok(loaded.issues.some((issue) => issue.includes("EXT-CANARY artifact SHA-256")));
  } finally {
    await rm(bundlePath, { force: true });
  }
});

test("cross-record release identity contradictions fail closed", async () => {
  const bundlePath = path.join(root, "audit", ".tmp-release-evidence-cross-record-mutant.json");
  const baseline = JSON.parse(await readFile(path.join(root, "audit", "release-evidence-bundle-v1.json"), "utf8"));
  for (const mutate of [
    (bundle) => { bundle.records.ownerAuthorization.releaseTag = "v9.9.9-beta.9"; },
    (bundle) => { bundle.records.canaryReconciliation.candidateSha = "0".repeat(40); },
  ]) {
    const bundle = structuredClone(baseline);
    mutate(bundle);
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    const loaded = await loadReleaseEvidenceBundle(bundlePath);
    assert.equal(loaded.valid, false);
    assert.ok(loaded.issues.some((issue) => /does not match the evidence bundle/u.test(issue)), loaded.issues.join("; "));
  }
  await rm(bundlePath, { force: true });
});
