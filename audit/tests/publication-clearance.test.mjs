import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  clearanceMatches,
  computeReleaseDecision,
  evaluateExternalReleaseEvidence,
  EXTERNAL_RELEASE_GATE_IDS,
  parsePublicationClearance,
  PUBLICATION_CLEARANCE_PATH,
} from "../lib/publication-clearance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const expected = Object.freeze({
  engineSha256: "1".repeat(64),
  manifestVersion: "1.0.0",
  manifestSha256: "2".repeat(64),
  rightsSha256: "3".repeat(64),
  payloadSha256: "4".repeat(64),
  payloadTreeOid: "5".repeat(40),
  browserProductName: "Microsoft Edge",
  browserFullVersion: "150.0.4078.99",
  browserExecutableSha256: "6".repeat(64),
  runnerImageOS: "win25",
  runnerImageVersion: "20260720.1.0",
  browserRunnerEvidenceSha256: "7".repeat(64),
  browserRunnerEvidenceReviewed: true,
  now: new Date("2026-07-29T12:00:00Z"),
});

function approvedClearance(overrides = {}) {
  const fields = {
    "Status": "APPROVED",
    "Review date": "2026-07-28",
    "Review result": "PASS",
    "Required failures": "0",
    "Required skips": "0",
    "Residual risks": "MEDIUM: windows-latest floats; the exact observed browser and image tuple is approved.",
    "Reviewed engine SHA-256": expected.engineSha256,
    "Reviewed curriculum manifest version": expected.manifestVersion,
    "Reviewed curriculum manifest SHA-256": expected.manifestSha256,
    "Reviewed rights-state SHA-256": expected.rightsSha256,
    "Reviewed public payload SHA-256": expected.payloadSha256,
    "Reviewed public payload tree OID": expected.payloadTreeOid,
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
    "Authorized release tag": "v1.0.0-beta.2",
    "Authorized protected ref": "refs/heads/main",
    "Review-bundle SHA-256": "f".repeat(64),
    ...overrides,
  };
  return `# Math Quest publication clearance\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n`;
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
    assert.equal(clearanceMatches(clearance, expected), false);
  } else {
    assert.equal(clearance.status, "APPROVED");
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

test("all eight external release records are first-class fail-closed inputs", () => {
  const parsed = parsePublicationClearance(approvedClearance());
  const evidence = evaluateExternalReleaseEvidence(parsed, expected, expected.now);
  assert.equal(parsed.valid, true, parsed.issues.join("; "));
  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.requiredCount, 8);
  assert.deepEqual(evidence.gates.map((item) => item.id), EXTERNAL_RELEASE_GATE_IDS);
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
    ["Authorized release tag", "v1.0.0-beta.3", "EXT-OWNER"],
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
    ["payloadSha256", "0".repeat(64)],
    ["payloadTreeOid", "0".repeat(40)],
  ]) {
    const mismatch = evaluateExternalReleaseEvidence(baseline, { ...expected, [key]: value }, expected.now);
    assert.equal(mismatch.status, "BLOCKED", `${key} candidate mismatch must block`);
    assert.equal(clearanceMatches(baseline, { ...expected, [key]: value }), false);
  }

  for (const field of [
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
