import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ART_MIGRATION_BASELINE_PATH,
  ART_MIGRATION_BROWSER_EVIDENCE_BYTES,
  ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256,
  ART_MIGRATION_BROWSER_EVIDENCE_PATH,
  ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256,
  ART_MIGRATION_BROWSER_SERVED_PATH_SET_SHA256,
  ART_MIGRATION_STATES,
  ART_MIGRATION_VIEWPORTS,
  artMigrationCanonicalJson,
  artMigrationSha256,
  loadArtMigrationBaseline,
  loadArtMigrationBrowserEvidence,
  observeArtMigrationSource,
  validateArtMigrationBaseline,
  validateArtMigrationBrowserEvidence,
  visualObservationFromBrowserEvidence,
} from "../lib/art-migration-baseline.mjs";

const baseline = JSON.parse(await readFile(ART_MIGRATION_BASELINE_PATH, "utf8"));
const browserEvidenceBytes = await readFile(ART_MIGRATION_BROWSER_EVIDENCE_PATH);
const browserEvidence = JSON.parse(browserEvidenceBytes.toString("utf8"));
const observation = observeArtMigrationSource(baseline);
const clone = () => structuredClone(baseline);
const validate = (candidate, options = {}) => validateArtMigrationBaseline(candidate, {
  sourceObservation: observation,
  browserEvidence,
  browserEvidenceBytes,
  ...options,
});

test("ART-MIG-01 binds the exact historical revision, 50 joined fixtures, and 36 sanitized rendered results", async () => {
  const loaded = await loadArtMigrationBaseline(undefined, { sourceObservation: observation });
  assert.equal(loaded.validation.status, "PASS");
  assert.equal(loaded.baseline.sourceRevision.commitSha1, "cb25cf1734c0481ed0670b58137e76d312d05857");
  assert.equal(loaded.baseline.sourceRevision.treeOidSha1, "9e82db9f23a997fe5cd173d503274de5097c5c2e");
  assert.equal(loaded.baseline.runtimeBindings.find((record) => record.id === "RUNTIME-INDEX").rawByteSha256, "63f3accf255f15345996978002de7b0bc737d755f643819096d91fc4dc4365c0");
  assert.equal(loaded.baseline.fixtureContract.declarationSha256, "4b69dda64c3583466501652e65ca73605e357e81c21ec1d98d8575e7df07e88f");
  assert.equal(loaded.baseline.fixtureContract.evaluatedSpecSha256, "c7582b185721f36a2232b883c2bd28724feb593a093c1e95ba1f60b2e7e5d548");
  assert.equal(loaded.baseline.fixtureContract.fullIdentityRowsSha256, "da665f8956bd58ded9857a061d68584bdb6fa546be037e9334aada7cf168ea94");
  assert.equal(loaded.baseline.fixtureContract.records.length, 50);
  assert.equal(loaded.baseline.fixtureContract.coverage.levels.length, 21);
  assert.equal(loaded.baseline.fixtureContract.coverage.strands.length, 6);
  assert.equal(loaded.baseline.fixtureContract.coverage.generatorProfiles.length, 26);
  assert.equal(loaded.baseline.fixtureContract.coverage.releaseReachableInputMethods.length, 33);
  assert.deepEqual(loaded.baseline.visualEvidence.viewports, ART_MIGRATION_VIEWPORTS);
  assert.deepEqual(loaded.baseline.visualEvidence.states, ART_MIGRATION_STATES);
  assert.equal(loaded.baseline.visualEvidence.results.length, 36);
  assert.equal(loaded.baseline.visualEvidence.results.every((record) => record.status === "PASS"), true);
  assert.equal(loaded.baseline.visualEvidence.passingArtifactPolicy, "NO_SCREENSHOTS_TRACES_VIDEO_OR_CHILD_DATA");
  assert.equal(loaded.baseline.visualEvidence.disposition, "FREEZES_CURRENT_BEHAVIOR_WITHOUT_APPROVING_VISUAL_QUALITY");
  assert.equal(loaded.baseline.browserEvidenceBinding.rawByteSha256, ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256);
  assert.equal(loaded.baseline.browserEvidenceBinding.canonicalJsonSha256, ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256);
  assert.equal(loaded.baseline.browserEvidenceBinding.bytes, ART_MIGRATION_BROWSER_EVIDENCE_BYTES);
});

test("retained browser evidence passes the closed browser payload contract and reproduces every visual digest", async () => {
  const loaded = await loadArtMigrationBrowserEvidence();
  assert.equal(loaded.validation.status, "PASS");
  assert.equal(loaded.rawBytes.length, ART_MIGRATION_BROWSER_EVIDENCE_BYTES);
  assert.equal(artMigrationSha256(loaded.rawBytes), ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256);
  assert.equal(artMigrationSha256(artMigrationCanonicalJson(loaded.evidence)), ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256);
  assert.equal(loaded.evidence.payload.results.length, 36);
  assert.equal(loaded.evidence.runIntegrity.status, "PASS");
  assert.equal(loaded.evidence.runIntegrity.unexpectedRequestSignatures.length, 0);
  assert.equal(loaded.evidence.sourcePreparation.servedPathCount, 20);
  assert.equal(loaded.evidence.sourcePreparation.servedPaths.length, 20);
  assert.equal(loaded.evidence.sourcePreparation.servedPathSetSha256, ART_MIGRATION_BROWSER_SERVED_PATH_SET_SHA256);
  assert.equal(loaded.evidence.harnessAdapter.sourceRawByteSha256, "e0a7d0096fcc92c7d8cd60e06f0cfbf969a11947850b54fb28fd97d2b04f098f");
  assert.equal(loaded.evidence.harnessAdapter.transformedRawByteSha256, "45668e83807c74f433a99ed1cacf4b3d76371c194ed7c25f5e2229abe3517836");
  assert.equal(loaded.evidence.harnessAdapter.semanticBoundary, "MODULE_EXPORT_VISIBILITY_ONLY_FUNCTION_BODY_AND_CALL_PATH_UNCHANGED");
  assert.equal(loaded.evidence.capture.method, "EFFECT_SENSITIVE_BROWSER_AUDIT_VISUAL_SHARD_WITH_EXPORT_ONLY_ADAPTER");
  const visual = visualObservationFromBrowserEvidence(loaded.evidence);
  assert.deepEqual(visual.browserIdentity, baseline.visualEvidence.browserIdentity);
  assert.deepEqual(visual.results, baseline.visualEvidence.results);
  assert.equal(visual.resultSetSha256, baseline.visualEvidence.resultSetSha256);
});

test("retained browser evidence rejects drift in exact served-source provenance and the disclosed harness adapter", async () => {
  const staleSource = structuredClone(browserEvidence);
  staleSource.sourcePreparation.servedPaths[0].bytes += 1;
  const staleSourceBytes = Buffer.from(`${JSON.stringify(staleSource, null, 2)}\n`, "utf8");
  const staleSourceResult = await validateArtMigrationBrowserEvidence(staleSource, { rawBytes: staleSourceBytes });
  assert.equal(staleSourceResult.valid, false);
  assert.match(staleSourceResult.issues.join("\n"), /served-source preparation/u);

  const staleAdapter = structuredClone(browserEvidence);
  staleAdapter.harnessAdapter.transformedBytes += 1;
  const staleAdapterBytes = Buffer.from(`${JSON.stringify(staleAdapter, null, 2)}\n`, "utf8");
  const staleAdapterResult = await validateArtMigrationBrowserEvidence(staleAdapter, { rawBytes: staleAdapterBytes });
  assert.equal(staleAdapterResult.valid, false);
  assert.match(staleAdapterResult.issues.join("\n"), /harness adapter/u);
});

test("every stored fixture resolves exact Feature Map and Tutorial Manifest identities", () => {
  for (const record of baseline.fixtureContract.records) {
    assert.match(record.featureId, /^child\.mechanic\./u, record.id);
    assert.equal(record.tutorialAnchorRoleIds.length, 3, record.id);
    assert.equal(record.tutorialVisualCueIds.length, 3, record.id);
    assert.equal(record.tutorialObligationKey, `${record.skillId}|${record.taskType}`, record.id);
  }
  assert.deepEqual(baseline.fixtureContract.exclusions, [
    { featureId: "child.mechanic.number-bond", inputMethod: "NUMBER_BOND", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
    { featureId: "child.mechanic.number-choice", inputMethod: "NUMBER_CHOICE", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
  ]);
});

test("[NC-ART-MIG-01-STALE-OR-INCOMPLETE-BASELINE] stale, foreign, incomplete, retried, private, or arbitrary baseline evidence fails closed", async () => {
  const mutations = [
    ["foreign revision", (value) => { value.sourceRevision.commitSha1 = "a".repeat(40); }],
    ["changed runtime hash", (value) => { value.runtimeBindings.find((record) => record.id === "RUNTIME-INDEX").rawByteSha256 = "a".repeat(64); }],
    ["changed fixture ordinal", (value) => { value.fixtureContract.records[0].ordinal += 1; }],
    ["missing fixture", (value) => { value.fixtureContract.records.pop(); }],
    ["duplicate fixture", (value) => { value.fixtureContract.records[1] = structuredClone(value.fixtureContract.records[0]); }],
    ["missing method coverage", (value) => { value.fixtureContract.coverage.releaseReachableInputMethods.pop(); }],
    ["false exclusion", (value) => { value.fixtureContract.exclusions[0].proofResultId = "VIS-MANIFEST"; }],
    ["stale feature hash", (value) => { value.authorityBindings.find((record) => record.id === "AUTH-FEATURE-MAP").rawByteSha256 = "b".repeat(64); }],
    ["stale tutorial hash", (value) => { value.authorityBindings.find((record) => record.id === "AUTH-TUTORIAL-MANIFEST").rawByteSha256 = "c".repeat(64); }],
    ["missing visual result", (value) => { value.visualEvidence.results.pop(); }],
    ["skipped visual result", (value) => { value.visualEvidence.results[0].status = "SKIP"; }],
    ["automatic retry", (value) => { value.visualEvidence.capture.automaticRetries = 1; }],
    ["arbitrary details digest", (value) => { value.visualEvidence.results[0].detailsSha256 = "d".repeat(64); }],
    ["publication claim", (value) => { value.visualEvidence.browserIdentity.validForPublication = true; }],
    ["screenshot evidence", (value) => { value.visualEvidence.screenshotPath = "private.png"; }],
  ];
  for (const [label, mutate] of mutations) {
    const candidate = clone();
    mutate(candidate);
    const result = await validate(candidate);
    assert.equal(result.valid, false, label);
    assert.equal(result.status, "FAIL", label);
  }

  const coordinatedEvidence = structuredClone(browserEvidence);
  coordinatedEvidence.payload.results[0].details = JSON.stringify({ coordinatedFabrication: true });
  const coordinatedBytes = Buffer.from(`${JSON.stringify(coordinatedEvidence, null, 2)}\n`, "utf8");
  const coordinatedVisual = visualObservationFromBrowserEvidence(coordinatedEvidence);
  const coordinatedBaseline = clone();
  coordinatedBaseline.visualEvidence.results = coordinatedVisual.results;
  coordinatedBaseline.visualEvidence.resultSetSha256 = coordinatedVisual.resultSetSha256;
  coordinatedBaseline.browserEvidenceBinding = {
    path: "audit/art-migration-browser-evidence-v1.json",
    rawByteSha256: artMigrationSha256(coordinatedBytes),
    bytes: coordinatedBytes.length,
    canonicalJsonSha256: artMigrationSha256(artMigrationCanonicalJson(coordinatedEvidence)),
  };
  const coordinatedResult = await validateArtMigrationBaseline(coordinatedBaseline, {
    sourceObservation: observation,
    browserEvidence: coordinatedEvidence,
    browserEvidenceBytes: coordinatedBytes,
  });
  assert.equal(coordinatedResult.valid, false, "coordinated fabricated evidence and every dependent digest");
  assert.match(coordinatedResult.issues.join("\n"), /reviewed immutable value/u);
});
