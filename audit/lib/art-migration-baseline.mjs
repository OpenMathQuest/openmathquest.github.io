import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import {
  artMigrationCanonicalJson,
  artMigrationSha256,
  artMigrationSourceBytes as gitBytes,
  observeArtMigrationSource,
} from "./art-migration-source.mjs";

import {
  BROWSER_AUDIT_SHARDS,
  validateBrowserAuditPayload,
} from "./browser-smoke.mjs";

export { artMigrationCanonicalJson, artMigrationSha256, observeArtMigrationSource };

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const ART_MIGRATION_BASELINE_PATH = new URL("../art-migration-baseline-v1.json", import.meta.url);
const ART_MIGRATION_BASELINE_SCHEMA_PATH = new URL("../schemas/art-migration-baseline-v1.schema.json", import.meta.url);
export const ART_MIGRATION_BROWSER_EVIDENCE_PATH = new URL("../art-migration-browser-evidence-v1.json", import.meta.url);
const ART_MIGRATION_BROWSER_EVIDENCE_SCHEMA_PATH = new URL("../schemas/art-migration-browser-evidence-v1.schema.json", import.meta.url);
export const ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256 = "b1134226011173f7c97556f762e316748f7d9ff24299df7077aaf002799e970b";
export const ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256 = "e0e16cd8d4695748d344b355ddcf709c6242fdd70f18cfcca67e7657f4945aeb";
export const ART_MIGRATION_BROWSER_EVIDENCE_BYTES = 300373;
export const ART_MIGRATION_BROWSER_SERVED_PATH_SET_SHA256 = "8cfe3c4c826e967bf7ca60d6f81489c62ea8134e90d6fdbdcb21687775e5ad1b";
export const ART_MIGRATION_BROWSER_SERVED_RELATIVE_PATHS = Object.freeze([
  "audit.html",
  "index.html",
  "manifest.webmanifest",
  "release-shell-v1.json",
  "sw.js",
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "curriculum/math-quest-tutorial-manifest-v1.json",
  "audit/approved-visual-regression.js",
  "assets/fonts/Inter-Variable.ttf",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/sounds/tap.wav",
  "assets/sounds/confirm.wav",
  "assets/sounds/incorrect.wav",
  "assets/sounds/close.wav",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
]);

export const ART_MIGRATION_VIEWPORTS = Object.freeze([
  Object.freeze({ id: "desktop", width: 1366, height: 768, touch: false, mobile: false, deviceScaleFactor: 1 }),
  Object.freeze({ id: "large-tablet-landscape", width: 1180, height: 820, touch: true, mobile: true, deviceScaleFactor: 2 }),
  Object.freeze({ id: "phone-landscape", width: 844, height: 390, touch: true, mobile: true, deviceScaleFactor: 3 }),
  Object.freeze({ id: "phone-portrait", width: 390, height: 844, touch: true, mobile: true, deviceScaleFactor: 3 }),
  Object.freeze({ id: "tablet-landscape", width: 1024, height: 768, touch: true, mobile: true, deviceScaleFactor: 2 }),
  Object.freeze({ id: "tablet-portrait", width: 820, height: 1180, touch: true, mobile: true, deviceScaleFactor: 2 }),
]);

export const ART_MIGRATION_STATES = Object.freeze([
  "EXPECTED_REVEALED",
  "INITIAL",
  "PARTIAL_RESPONSE",
  "TEACHING_MODEL_WHEN_AVAILABLE",
  "TUTORIAL_STEP_1_DIFFERENT_EXAMPLE",
  "TUTORIAL_STEP_2_PLAN",
  "TUTORIAL_STEP_3_CHECK",
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (values, selector = (value) => value) => [...values].sort((left, right) => selector(left).localeCompare(selector(right), "en"));
const normalizePath = (value) => String(value || "").replace(/\\/gu, "/").replace(/^\.\//u, "");
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message}`;
const EXPECTED_VISUAL_REQUEST_SIGNATURES = Object.freeze([
  Object.freeze({ method: "GET", pathname: "/assets/fonts/Inter-Variable.ttf" }),
  Object.freeze({ method: "GET", pathname: "/assets/icons/apple-touch-icon.png" }),
  Object.freeze({ method: "GET", pathname: "/assets/icons/icon-192.png" }),
  Object.freeze({ method: "GET", pathname: "/assets/icons/icon-512.png" }),
  Object.freeze({ method: "GET", pathname: "/assets/sounds/close.wav" }),
  Object.freeze({ method: "GET", pathname: "/assets/sounds/confirm.wav" }),
  Object.freeze({ method: "GET", pathname: "/assets/sounds/incorrect.wav" }),
  Object.freeze({ method: "GET", pathname: "/assets/sounds/tap.wav" }),
  Object.freeze({ method: "GET", pathname: "/audit.html" }),
  Object.freeze({ method: "GET", pathname: "/audit/approved-visual-regression.js" }),
  Object.freeze({ method: "GET", pathname: "/curriculum/math-quest-tutorial-manifest-v1.json" }),
  Object.freeze({ method: "GET", pathname: "/favicon.ico" }),
  Object.freeze({ method: "GET", pathname: "/index.html" }),
  Object.freeze({ method: "GET", pathname: "/LICENSE" }),
  Object.freeze({ method: "GET", pathname: "/manifest.webmanifest" }),
  Object.freeze({ method: "GET", pathname: "/PRIVACY.md" }),
  Object.freeze({ method: "GET", pathname: "/release-shell-v1.json" }),
  Object.freeze({ method: "GET", pathname: "/sw.js" }),
  Object.freeze({ method: "GET", pathname: "/THIRD_PARTY_NOTICES.md" }),
]);

function deriveVisualResultSetSha256(results) {
  return artMigrationSha256(artMigrationCanonicalJson(results));
}

function browserIdentityFromEvidence(identity) {
  return {
    productName: identity.productName ?? null,
    fullVersion: identity.fullVersion ?? null,
    executableName: identity.executableName ?? null,
    executableSha256: identity.executableSha256 ?? null,
    runnerKind: identity.runnerKind ?? null,
    status: identity.status ?? null,
    browserIdentityValid: identity.browserIdentityValid === true,
    validForPublication: identity.validForPublication === true,
  };
}

function buildVisualEvidenceObservation(evidence) {
  const results = sorted(
    (evidence?.payload?.results || []).filter((record) => BROWSER_AUDIT_SHARDS.visual.includes(record.id)),
    (record) => record.id,
  ).map((record) => ({
    id: record.id,
    status: record.status,
    detailsSha256: artMigrationSha256(record.details),
  }));
  return Object.freeze({
    browserIdentity: browserIdentityFromEvidence(evidence?.browserIdentity || {}),
    results,
    resultSetSha256: deriveVisualResultSetSha256(results),
  });
}

export function visualObservationFromBrowserEvidence(evidence) {
  return buildVisualEvidenceObservation(evidence);
}

async function validateArtMigrationSchema(value, schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return validate(value) ? [] : (validate.errors || []).map(schemaIssue);
}

function validateBrowserEvidenceDigests(evidence, bytes, issues) {
  if (bytes.length !== ART_MIGRATION_BROWSER_EVIDENCE_BYTES) issues.push("browser evidence byte length is not the reviewed immutable value.");
  if (artMigrationSha256(bytes) !== ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256) issues.push("browser evidence raw-byte digest is not the reviewed immutable value.");
  if (artMigrationSha256(artMigrationCanonicalJson(evidence)) !== ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256) {
    issues.push("browser evidence canonical digest is not the reviewed immutable value.");
  }
}

function validateBrowserEvidenceRequests(evidence, issues) {
  const payloadValidation = validateBrowserAuditPayload(evidence?.payload, { shard: "visual" });
  if (!payloadValidation.valid) issues.push(...payloadValidation.errors.map((issue) => `browser evidence payload: ${issue}`));
  if (!same(evidence?.runIntegrity?.requestSignatures, EXPECTED_VISUAL_REQUEST_SIGNATURES)) {
    issues.push("browser evidence request signatures are not the reviewed closed request set.");
  }
  if (!same(evidence?.runIntegrity?.unexpectedRequestSignatures, [])) {
    issues.push("browser evidence contains unexpected request signatures.");
  }
}

function validateBrowserServedSource(evidence, root, issues) {
  const servedPaths = [...ART_MIGRATION_BROWSER_SERVED_RELATIVE_PATHS]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((relativePath) => {
      const bytesAtRevision = gitBytes(root, evidence.sourceRevision.commitSha1, relativePath);
      return { path: relativePath, rawByteSha256: artMigrationSha256(bytesAtRevision), bytes: bytesAtRevision.length };
    });
  const sourcePreparation = {
    method: "VERIFIED_WORKTREE_BYTES_EQUAL_GIT_OBJECT_BYTES_AT_SOURCE_REVISION",
    servedPathCount: servedPaths.length,
    servedPathSetDigestSemantics: "SHA256_CANONICAL_JSON_SORTED_OBJECT_KEYS_ARRAY_ORDER_PRESERVED",
    servedPathSetSha256: artMigrationSha256(artMigrationCanonicalJson(servedPaths)),
    servedPaths,
  };
  if (!same(evidence.sourcePreparation, sourcePreparation)
    || sourcePreparation.servedPathSetSha256 !== ART_MIGRATION_BROWSER_SERVED_PATH_SET_SHA256) {
    issues.push("browser evidence served-source preparation does not match the exact source-revision bytes.");
  }
}

function validateBrowserHarnessAdapter(evidence, root, issues) {
  const harnessBytes = gitBytes(root, evidence.sourceRevision.commitSha1, "audit/lib/browser-smoke.mjs");
  const before = "async function runBrowserAuditShard({";
  const after = "export async function runBrowserAuditShard({";
  const harnessSource = harnessBytes.toString("utf8");
  const replacementCount = harnessSource.split(before).length - 1;
  const transformedBytes = Buffer.from(harnessSource.replace(before, after), "utf8");
  const harnessAdapter = {
    sourcePath: "audit/lib/browser-smoke.mjs",
    sourceRawByteSha256: artMigrationSha256(harnessBytes),
    sourceBytes: harnessBytes.length,
    transformation: "ADD_EXPORT_KEYWORD_TO_UNIQUE_RUN_BROWSER_AUDIT_SHARD_DECLARATION_ONLY",
    before,
    after,
    replacementCount,
    transformedRawByteSha256: artMigrationSha256(transformedBytes),
    transformedBytes: transformedBytes.length,
    semanticBoundary: "MODULE_EXPORT_VISIBILITY_ONLY_FUNCTION_BODY_AND_CALL_PATH_UNCHANGED",
  };
  if (replacementCount !== 1 || !same(evidence.harnessAdapter, harnessAdapter)) {
    issues.push("browser evidence harness adapter is not the exact export-only source transformation.");
  }
}

function validateBrowserSourceBytes(evidence, root, issues) {
  try {
    validateBrowserServedSource(evidence, root, issues);
    validateBrowserHarnessAdapter(evidence, root, issues);
  } catch (error) {
    issues.push(`browser evidence source-byte observation failed: ${String(error?.message || error)}`);
  }
}

function validateBrowserResultDetails(evidence, issues) {
  for (const result of evidence?.payload?.results || []) {
    try { JSON.parse(result.details); }
    catch { issues.push(`browser evidence result ${result.id || "UNKNOWN"} details are not canonical structured JSON.`); }
  }
}

export async function validateArtMigrationBrowserEvidence(evidence, { rawBytes = null, root = repositoryRoot } = {}) {
  const issues = await validateArtMigrationSchema(evidence, ART_MIGRATION_BROWSER_EVIDENCE_SCHEMA_PATH);
  const bytes = rawBytes == null ? Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8") : Buffer.from(rawBytes);
  validateBrowserEvidenceDigests(evidence, bytes, issues);
  validateBrowserEvidenceRequests(evidence, issues);
  validateBrowserSourceBytes(evidence, root, issues);
  validateBrowserResultDetails(evidence, issues);
  const serialized = bytes.toString("utf8");
  if (/[A-Za-z]:\\\\|(?:^|["'])\/[Uu]sers\//u.test(serialized)) issues.push("browser evidence contains a private absolute path.");
  const status = issues.length === 0 ? "PASS" : "FAIL";
  return Object.freeze({
    valid: issues.length === 0,
    status,
    issues: Object.freeze(issues),
    observation: visualObservationFromBrowserEvidence(evidence),
  });
}

function validateOrdering(baseline, issues) {
  for (const [label, values] of [
    ["authorityBindings", baseline.authorityBindings],
    ["runtimeBindings", baseline.runtimeBindings],
    ["fixtureContract.records", baseline.fixtureContract.records],
    ["fixtureContract.exclusions", baseline.fixtureContract.exclusions],
    ["visualEvidence.viewports", baseline.visualEvidence.viewports],
    ["visualEvidence.states", baseline.visualEvidence.states],
    ["visualEvidence.results", baseline.visualEvidence.results],
  ]) {
    const key = label === "fixtureContract.records" ? "order" : label === "fixtureContract.exclusions" ? "featureId" : label.endsWith("states") ? null : "id";
    const expected = key === "order"
      ? [...values].sort((left, right) => left.order - right.order)
      : key
        ? sorted(values, (record) => record[key])
        : [...values].sort((left, right) => left.localeCompare(right, "en"));
    if (!same(values, expected)) issues.push(`${label} is not in its declared order.`);
  }
}

function validateVisualResultSet(visual, issues) {
  const expectedIds = [...BROWSER_AUDIT_SHARDS.visual].sort((left, right) => left.localeCompare(right, "en"));
  const actualIds = visual.results.map((record) => record.id);
  if (!same(actualIds, expectedIds)) issues.push("visualEvidence does not contain the exact 36-result visual shard.");
  if (visual.passedCount !== 36 || visual.failedCount !== 0 || visual.skippedCount !== 0 || visual.missingCount !== 0 || visual.unknownCount !== 0) {
    issues.push("visualEvidence result counts do not prove 36 exact passes.");
  }
  if (visual.results.some((record) => record.status !== "PASS" || !SHA256_PATTERN.test(record.detailsSha256))) {
    issues.push("visualEvidence contains a non-pass or invalid details digest.");
  }
  if (visual.resultSetSha256 !== deriveVisualResultSetSha256(visual.results)) issues.push("visualEvidence resultSetSha256 is stale.");
}

function validateRetainedVisualResults(visual, browserEvidence, issues) {
  if (!same(visual.capture, browserEvidence.capture)) issues.push("visualEvidence capture does not match retained browser evidence.");
  if (!same(visual.browserIdentity, browserEvidence.browserIdentity)) issues.push("visualEvidence browser identity does not match retained browser evidence.");
  const observation = visualObservationFromBrowserEvidence(browserEvidence);
  if (!same(visual.results, observation.results)) issues.push("visualEvidence result details digests do not match retained browser evidence.");
  if (visual.resultSetSha256 !== observation.resultSetSha256) issues.push("visualEvidence result-set digest does not match retained browser evidence.");
}

function validateVisualEvidence(baseline, issues, browserEvidence = null) {
  const visual = baseline.visualEvidence;
  validateVisualResultSet(visual, issues);
  if (!same(visual.viewports, ART_MIGRATION_VIEWPORTS)) issues.push("visualEvidence viewport matrix is stale.");
  if (!same(visual.states, ART_MIGRATION_STATES)) issues.push("visualEvidence state matrix is stale.");
  if (browserEvidence) validateRetainedVisualResults(visual, browserEvidence, issues);
  if (visual.passingArtifactPolicy !== "NO_SCREENSHOTS_TRACES_VIDEO_OR_CHILD_DATA") issues.push("visualEvidence passing-artifact policy is unsafe.");
}

function validateHistoricalSource(baseline, sourceObservation, root, issues) {
  let observed = sourceObservation;
  try { observed ||= observeArtMigrationSource(baseline, { root }); }
  catch (error) { issues.push(`source revision observation failed: ${String(error?.message || error)}`); }
  if (observed) {
    for (const key of ["sourceRevision", "authorityBindings", "runtimeBindings", "engineBinding", "fixtureContract"]) {
      if (!same(baseline[key], observed[key])) issues.push(`${key} does not match the exact historical source observation.`);
    }
  }
  return observed;
}

function validateMigrationDirective(baseline, observed, root, issues) {
  const artBinding = observed?.authorityBindings?.find((record) => record.id === "AUTH-ART-DESIGN");
  if (artBinding) {
    const decisions = JSON.parse(gitBytes(root, observed.sourceRevision.commitSha1, artBinding.path).toString("utf8"));
    const step = decisions.migrationSequence.find((record) => record.id === baseline.migrationStepId);
    if (!step || step.directive !== "FREEZE_CURRENT_VISUAL_BASELINES_AND_REPRESENTATIVE_TASK_FIXTURES"
      || step.entryGate !== baseline.entryGateId || step.exitGate !== baseline.exitGateId) {
      issues.push("ART-MIG-01 does not bind the declared directive and gates.");
    }
  }
}

function validateRetainedBrowserBinding(baseline, retainedBrowserEvidence, retainedBrowserEvidenceBytes, issues) {
  const observedBinding = {
    path: "audit/art-migration-browser-evidence-v1.json",
    rawByteSha256: artMigrationSha256(retainedBrowserEvidenceBytes),
    bytes: retainedBrowserEvidenceBytes.length,
    canonicalJsonSha256: artMigrationSha256(artMigrationCanonicalJson(retainedBrowserEvidence)),
  };
  if (!same(baseline.browserEvidenceBinding, observedBinding)) issues.push("browserEvidenceBinding does not match retained browser evidence bytes.");
  if (retainedBrowserEvidence.sourceRevision.commitSha1 !== baseline.sourceRevision.commitSha1
    || retainedBrowserEvidence.sourceRevision.treeOidSha1 !== baseline.sourceRevision.treeOidSha1) {
    issues.push("retained browser evidence does not bind the baseline source revision.");
  }
}

async function validateRetainedBrowserEvidence(baseline, options, root, issues) {
  let { browserEvidence: retainedBrowserEvidence, browserEvidenceBytes: retainedBrowserEvidenceBytes } = options;
  try {
    if (!retainedBrowserEvidence) {
      retainedBrowserEvidenceBytes = await readFile(path.resolve(root, normalizePath(baseline.browserEvidenceBinding.path)));
      retainedBrowserEvidence = JSON.parse(retainedBrowserEvidenceBytes.toString("utf8"));
    }
    retainedBrowserEvidenceBytes ||= Buffer.from(`${JSON.stringify(retainedBrowserEvidence, null, 2)}\n`, "utf8");
    const retainedValidation = await validateArtMigrationBrowserEvidence(retainedBrowserEvidence, { rawBytes: retainedBrowserEvidenceBytes, root });
    if (!retainedValidation.valid) issues.push(...retainedValidation.issues.map((issue) => `retained browser evidence: ${issue}`));
    validateRetainedBrowserBinding(baseline, retainedBrowserEvidence, retainedBrowserEvidenceBytes, issues);
  } catch (error) {
    issues.push(`retained browser evidence observation failed: ${String(error?.message || error)}`);
  }
  return retainedBrowserEvidence;
}

export async function validateArtMigrationBaseline(baseline, {
  root = repositoryRoot,
  sourceObservation = null,
  browserEvidence = null,
  browserEvidenceBytes = null,
} = {}) {
  const issues = await validateArtMigrationSchema(baseline, ART_MIGRATION_BASELINE_SCHEMA_PATH);
  if (issues.length) return Object.freeze({ valid: false, status: "FAIL", issues: Object.freeze(issues) });
  validateOrdering(baseline, issues);
  if (!SHA1_PATTERN.test(baseline.sourceRevision.commitSha1)) issues.push("sourceRevision commit is invalid.");
  const observed = validateHistoricalSource(baseline, sourceObservation, root, issues);
  validateMigrationDirective(baseline, observed, root, issues);
  const retainedBrowserEvidence = await validateRetainedBrowserEvidence(baseline, { browserEvidence, browserEvidenceBytes }, root, issues);
  validateVisualEvidence(baseline, issues, retainedBrowserEvidence);
  const status = issues.length === 0 ? "PASS" : "FAIL";
  return Object.freeze({ valid: issues.length === 0, status, issues: Object.freeze(issues), observation: observed, browserEvidence: retainedBrowserEvidence });
}

export async function loadArtMigrationBaseline(pathOrUrl = ART_MIGRATION_BASELINE_PATH, options = {}) {
  const baseline = JSON.parse(await readFile(pathOrUrl, "utf8"));
  const validation = await validateArtMigrationBaseline(baseline, options);
  if (!validation.valid) throw new Error(`Art migration baseline is invalid:\n${validation.issues.join("\n")}`);
  return Object.freeze({ baseline, validation });
}

export async function loadArtMigrationBrowserEvidence(pathOrUrl = ART_MIGRATION_BROWSER_EVIDENCE_PATH, { root = repositoryRoot } = {}) {
  const rawBytes = await readFile(pathOrUrl);
  const evidence = JSON.parse(rawBytes.toString("utf8"));
  const validation = await validateArtMigrationBrowserEvidence(evidence, { rawBytes, root });
  if (!validation.valid) throw new Error(`Art migration browser evidence is invalid:\n${validation.issues.join("\n")}`);
  return Object.freeze({ evidence, validation, rawBytes });
}
