import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { extractEngineFromPageBytes, evaluateEngine } from "./engine-loader.mjs";
import {
  AUDIT_SERVED_RELATIVE_PATHS,
  BROWSER_AUDIT_SHARDS,
  validateBrowserAuditPayload,
} from "./browser-smoke.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const ART_MIGRATION_BASELINE_PATH = new URL("../art-migration-baseline-v1.json", import.meta.url);
export const ART_MIGRATION_BASELINE_SCHEMA_PATH = new URL("../schemas/art-migration-baseline-v1.schema.json", import.meta.url);
export const ART_MIGRATION_BROWSER_EVIDENCE_PATH = new URL("../art-migration-browser-evidence-v1.json", import.meta.url);
export const ART_MIGRATION_BROWSER_EVIDENCE_SCHEMA_PATH = new URL("../schemas/art-migration-browser-evidence-v1.schema.json", import.meta.url);
export const ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256 = "b1134226011173f7c97556f762e316748f7d9ff24299df7077aaf002799e970b";
export const ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256 = "e0e16cd8d4695748d344b355ddcf709c6242fdd70f18cfcca67e7657f4945aeb";
export const ART_MIGRATION_BROWSER_EVIDENCE_BYTES = 300373;
export const ART_MIGRATION_BROWSER_SERVED_PATH_SET_SHA256 = "8cfe3c4c826e967bf7ca60d6f81489c62ea8134e90d6fdbdcb21687775e5ad1b";

export const ART_MIGRATION_AUTHORITY_BINDINGS = Object.freeze([
  Object.freeze({ id: "AUTH-ART-DESIGN", path: "audit/art-design-decision-register-v1.json", json: true }),
  Object.freeze({ id: "AUTH-CODE-MAP", path: "audit/repository-code-map-v1.json", json: true }),
  Object.freeze({ id: "AUTH-CURRICULUM", path: "curriculum/math-quest-manifest-v1.json", json: true }),
  Object.freeze({ id: "AUTH-FEATURE-MAP", path: "curriculum/math-quest-feature-map-v1.json", json: true }),
  Object.freeze({ id: "AUTH-GATE-POLICY", path: "audit/gate-integrity-policy-v1.json", json: true }),
  Object.freeze({ id: "AUTH-TUTORIAL-MANIFEST", path: "curriculum/math-quest-tutorial-manifest-v1.json", json: true }),
]);

export const ART_MIGRATION_RUNTIME_BINDINGS = Object.freeze([
  Object.freeze({ id: "RUNTIME-AUDIT-HARNESS", path: "audit.html", json: false }),
  Object.freeze({ id: "RUNTIME-BROWSER-ORCHESTRATOR", path: "audit/lib/browser-smoke.mjs", json: false }),
  Object.freeze({ id: "RUNTIME-DEEP-UX-CONTRACT", path: "audit/lib/playwright-deep-ux-census.mjs", json: false }),
  Object.freeze({ id: "RUNTIME-INDEX", path: "index.html", json: false }),
  Object.freeze({ id: "RUNTIME-PWA-SHELL", path: "release-shell-v1.json", json: true }),
  Object.freeze({ id: "RUNTIME-SERVICE-WORKER", path: "sw.js", json: false }),
  Object.freeze({ id: "RUNTIME-VISUAL-ORACLE", path: "audit/approved-visual-regression.js", json: false }),
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

const QA_TOUR_SEED = 0x51415431;
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

export const artMigrationCanonicalJson = (value) => JSON.stringify(canonicalValue(value));
export const artMigrationSha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))
    .map((key) => [key, canonicalValue(value[key])]));
}

function gitText(root, args) {
  return String(execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 })).trim();
}

function gitBytes(root, revision, relativePath) {
  return Buffer.from(execFileSync("git", ["show", `${revision}:${normalizePath(relativePath)}`], {
    cwd: root,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function sourceBinding(root, revision, definition) {
  const bytes = gitBytes(root, revision, definition.path);
  return {
    id: definition.id,
    path: definition.path,
    gitBlobOidSha1: gitText(root, ["rev-parse", `${revision}:${definition.path}`]),
    rawByteSha256: artMigrationSha256(bytes),
    bytes: bytes.length,
    canonicalJsonSha256: definition.json
      ? artMigrationSha256(artMigrationCanonicalJson(JSON.parse(bytes.toString("utf8"))))
      : null,
  };
}

function secondInlineScript(pageBytes) {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(pageBytes);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  if (scripts.length !== 2) throw new Error(`Expected exactly two inline scripts; found ${scripts.length}.`);
  return scripts[1];
}

export function extractQaTourFixture(pageBytes) {
  const adapter = secondInlineScript(pageBytes);
  const start = adapter.indexOf("const QA_TOUR_V1=");
  const end = adapter.indexOf(";\n    const ACTIVE_UI_VERSION", start);
  if (start < 0 || end < 0) throw new Error("The exact QA_TOUR_V1 declaration boundary is absent.");
  const declaration = adapter.slice(start, end + 1);
  const specs = new vm.Script(`(()=>{"use strict";${declaration}return QA_TOUR_V1;})()`, {
    filename: "math-quest-art-migration-qa-tour.js",
  }).runInNewContext(Object.create(null));
  if (!Array.isArray(specs)) throw new Error("QA_TOUR_V1 did not evaluate to an array.");
  return Object.freeze({ declaration, specs });
}

function tutorialResolution(question, tutorial) {
  const method = tutorial.methodBindings.find((record) => record.inputMethod === question.inputMethod);
  if (!method) throw new Error(`No tutorial method binding exists for ${question.inputMethod}.`);
  const familyId = method.profileDriven
    ? tutorial.profileBindings.find((record) => record.generatorProfile === question.generatorProfile)?.familyId
    : method.familyId;
  const family = tutorial.tutorialFamilies.find((record) => record.familyId === familyId);
  if (!family) throw new Error(`No tutorial family resolves for ${question.inputMethod}/${question.generatorProfile}.`);
  const obligation = tutorial.obligationBindings.find((record) => record.skillId === question.skillId && record.taskType === question.taskType);
  if (!obligation) throw new Error(`No tutorial obligation resolves for ${question.skillId}/${question.taskType}.`);
  return {
    featureId: method.featureId,
    familyId,
    anchorRoleIds: family.phaseBindings.flatMap((record) => record.anchorRoleIds),
    visualCueIds: family.phaseBindings.flatMap((record) => record.visualCueIds),
    obligationKey: `${question.skillId}|${question.taskType}`,
  };
}

function deriveFixtureContract(indexBytes, featureMap, tutorial) {
  const extracted = extractEngineFromPageBytes(indexBytes);
  const engine = evaluateEngine(extracted.source);
  const { declaration, specs } = extractQaTourFixture(indexBytes);
  const fullIdentityRows = [];
  const records = specs.map((spec, index) => {
    const skill = engine.SKILL_BY_ID[spec.skillId];
    if (!skill) throw new Error(`QA fixture ${index + 1} names unknown skill ${spec.skillId}.`);
    const question = engine.makeQuestion({
      skillId: spec.skillId,
      tier: spec.tier,
      representation: spec.representation,
      seed: QA_TOUR_SEED,
      ordinal: spec.ordinal,
      eligibleQuestionOrdinal: spec.ordinal,
      scheduledReview: false,
      coldTest: false,
      preview: true,
      theme: spec.theme,
      scaffolded: true,
    });
    const feature = featureMap.features.find((record) => record.inputMethod === question.inputMethod);
    if (!feature) throw new Error(`No Feature Map record resolves for ${question.inputMethod}.`);
    const tutorialJoin = tutorialResolution({ ...question, generatorProfile: skill.generatorProfile }, tutorial);
    if (feature.id !== tutorialJoin.featureId) throw new Error(`${question.inputMethod} has inconsistent Feature Map and Tutorial Manifest identities.`);
    const fixtureId = `ART-FIX-${String(index + 1).padStart(3, "0")}`;
    fullIdentityRows.push({
      fixtureId,
      skillId: spec.skillId,
      level: skill.level,
      strand: skill.strand,
      generatorProfile: skill.generatorProfile,
      tier: spec.tier,
      representation: spec.representation,
      theme: spec.theme,
      ordinal: spec.ordinal,
      inputMethod: question.inputMethod,
      questionId: question.questionId,
      sampleKey: question.sampleKey,
      semanticPromptStringId: question.semanticPromptStringId,
      taskType: question.taskType,
    });
    return {
      id: fixtureId,
      order: index + 1,
      skillId: spec.skillId,
      featureId: feature.id,
      level: skill.level,
      strand: skill.strand,
      generatorProfile: skill.generatorProfile,
      tier: spec.tier,
      representation: spec.representation,
      theme: spec.theme,
      ordinal: spec.ordinal,
      inputMethod: question.inputMethod,
      taskType: question.taskType,
      semanticPromptStringId: question.semanticPromptStringId,
      questionId: question.questionId,
      sampleKeySha256: artMigrationSha256(question.sampleKey),
      tutorialFamilyId: tutorialJoin.familyId,
      tutorialAnchorRoleIds: tutorialJoin.anchorRoleIds,
      tutorialVisualCueIds: tutorialJoin.visualCueIds,
      tutorialObligationKey: tutorialJoin.obligationKey,
    };
  });
  const distinct = (values, compare = (left, right) => String(left).localeCompare(String(right), "en")) => [...new Set(values)].sort(compare);
  const levels = distinct(records.map((record) => record.level), (left, right) => left - right);
  const strands = distinct(records.map((record) => record.strand));
  const profiles = distinct(records.map((record) => record.generatorProfile));
  const inputMethods = distinct(records.map((record) => record.inputMethod));
  const strategyBuildSkillIds = distinct(records.filter((record) => record.inputMethod === "STRATEGY_BUILD").map((record) => record.skillId));
  return {
    engineBinding: {
      id: "DERIVED-ENGINE",
      sourceBindingId: "RUNTIME-INDEX",
      derivation: "ENGINE_MARKER_RAW_BYTES",
      bytes: extracted.engineBytes.length,
      rawByteSha256: extracted.sha256,
    },
    fixtureContract: {
      contractId: "qa-tour-v1",
      authorityPath: "index.html#QA_TOUR_V1",
      seed: QA_TOUR_SEED,
      generatorContractVersion: engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION,
      sampleKeyVersion: engine.CONSTANTS.SAMPLE_KEY_VERSION,
      declarationBytes: Buffer.byteLength(declaration, "utf8"),
      declarationSha256: artMigrationSha256(declaration),
      evaluatedSpecBytes: Buffer.byteLength(JSON.stringify(specs), "utf8"),
      evaluatedSpecSha256: artMigrationSha256(JSON.stringify(specs)),
      fullIdentityRowsBytes: Buffer.byteLength(JSON.stringify(fullIdentityRows), "utf8"),
      fullIdentityRowsSha256: artMigrationSha256(JSON.stringify(fullIdentityRows)),
      storedRecordSetSha256: artMigrationSha256(artMigrationCanonicalJson(records)),
      records,
      coverage: {
        questionCount: records.length,
        levels,
        strands,
        generatorProfiles: profiles,
        releaseReachableInputMethods: inputMethods,
        strategyBuildSkillIds,
      },
      exclusions: [
        { featureId: "child.mechanic.number-bond", inputMethod: "NUMBER_BOND", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
        { featureId: "child.mechanic.number-choice", inputMethod: "NUMBER_CHOICE", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
      ],
    },
  };
}

export function deriveVisualResultSetSha256(results) {
  return artMigrationSha256(artMigrationCanonicalJson(results));
}

export function visualObservationFromBrowserReport(report) {
  const results = sorted(
    (report?.results || []).filter((record) => BROWSER_AUDIT_SHARDS.visual.includes(record.id)),
    (record) => record.id,
  ).map((record) => ({
    id: record.id,
    status: record.status,
    detailsSha256: artMigrationSha256(record.details),
  }));
  return Object.freeze({
    browserIdentity: {
      productName: report?.evidence?.browserProductName ?? null,
      fullVersion: report?.evidence?.browserFullVersion ?? null,
      executableName: report?.evidence?.browserExecutableName ?? null,
      executableSha256: report?.evidence?.browserExecutableSha256 ?? null,
      runnerKind: report?.evidence?.runnerKind ?? null,
      status: report?.evidence?.status ?? null,
      browserIdentityValid: report?.evidence?.browserIdentityValid === true,
      validForPublication: report?.evidence?.validForPublication === true,
    },
    results,
    resultSetSha256: deriveVisualResultSetSha256(results),
  });
}

export function visualObservationFromBrowserEvidence(evidence) {
  return visualObservationFromBrowserReport({
    evidence: {
      browserProductName: evidence?.browserIdentity?.productName,
      browserFullVersion: evidence?.browserIdentity?.fullVersion,
      browserExecutableName: evidence?.browserIdentity?.executableName,
      browserExecutableSha256: evidence?.browserIdentity?.executableSha256,
      runnerKind: evidence?.browserIdentity?.runnerKind,
      status: evidence?.browserIdentity?.status,
      browserIdentityValid: evidence?.browserIdentity?.browserIdentityValid,
      validForPublication: evidence?.browserIdentity?.validForPublication,
    },
    results: evidence?.payload?.results || [],
  });
}

export function observeArtMigrationSource(baseline, { root = repositoryRoot } = {}) {
  const revision = baseline.sourceRevision.commitSha1;
  const authorityBindings = ART_MIGRATION_AUTHORITY_BINDINGS.map((definition) => sourceBinding(root, revision, definition));
  const runtimeBindings = ART_MIGRATION_RUNTIME_BINDINGS.map((definition) => sourceBinding(root, revision, definition));
  const authorityById = new Map(authorityBindings.map((record) => [record.id, record]));
  const runtimeById = new Map(runtimeBindings.map((record) => [record.id, record]));
  const indexBytes = gitBytes(root, revision, runtimeById.get("RUNTIME-INDEX").path);
  const featureMap = JSON.parse(gitBytes(root, revision, authorityById.get("AUTH-FEATURE-MAP").path).toString("utf8"));
  const tutorial = JSON.parse(gitBytes(root, revision, authorityById.get("AUTH-TUTORIAL-MANIFEST").path).toString("utf8"));
  const fixture = deriveFixtureContract(indexBytes, featureMap, tutorial);
  return {
    sourceRevision: {
      commitSha1: gitText(root, ["rev-parse", `${revision}^{commit}`]),
      parentSha1: gitText(root, ["rev-parse", `${revision}^`]),
      treeOidSha1: gitText(root, ["rev-parse", `${revision}^{tree}`]),
    },
    authorityBindings,
    runtimeBindings,
    engineBinding: fixture.engineBinding,
    fixtureContract: fixture.fixtureContract,
  };
}

export async function validateArtMigrationBaselineSchema(value, schemaPath = ART_MIGRATION_BASELINE_SCHEMA_PATH) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return validate(value) ? [] : (validate.errors || []).map(schemaIssue);
}

export async function validateArtMigrationBrowserEvidenceSchema(value, schemaPath = ART_MIGRATION_BROWSER_EVIDENCE_SCHEMA_PATH) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return validate(value) ? [] : (validate.errors || []).map(schemaIssue);
}

export async function validateArtMigrationBrowserEvidence(evidence, { rawBytes = null, root = repositoryRoot } = {}) {
  const issues = await validateArtMigrationBrowserEvidenceSchema(evidence);
  const bytes = rawBytes == null ? Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8") : Buffer.from(rawBytes);
  if (bytes.length !== ART_MIGRATION_BROWSER_EVIDENCE_BYTES) issues.push("browser evidence byte length is not the reviewed immutable value.");
  if (artMigrationSha256(bytes) !== ART_MIGRATION_BROWSER_EVIDENCE_RAW_SHA256) issues.push("browser evidence raw-byte digest is not the reviewed immutable value.");
  if (artMigrationSha256(artMigrationCanonicalJson(evidence)) !== ART_MIGRATION_BROWSER_EVIDENCE_CANONICAL_SHA256) {
    issues.push("browser evidence canonical digest is not the reviewed immutable value.");
  }
  const payloadValidation = validateBrowserAuditPayload(evidence?.payload, { shard: "visual" });
  if (!payloadValidation.valid) issues.push(...payloadValidation.errors.map((issue) => `browser evidence payload: ${issue}`));
  if (!same(evidence?.runIntegrity?.requestSignatures, EXPECTED_VISUAL_REQUEST_SIGNATURES)) {
    issues.push("browser evidence request signatures are not the reviewed closed request set.");
  }
  if (!same(evidence?.runIntegrity?.unexpectedRequestSignatures, [])) {
    issues.push("browser evidence contains unexpected request signatures.");
  }
  try {
    const servedPaths = [...AUDIT_SERVED_RELATIVE_PATHS]
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
  } catch (error) {
    issues.push(`browser evidence source-byte observation failed: ${String(error?.message || error)}`);
  }
  for (const result of evidence?.payload?.results || []) {
    try { JSON.parse(result.details); }
    catch { issues.push(`browser evidence result ${result.id || "UNKNOWN"} details are not canonical structured JSON.`); }
  }
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

function validateVisualEvidence(baseline, issues, browserEvidence = null) {
  const visual = baseline.visualEvidence;
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
  if (!same(visual.viewports, ART_MIGRATION_VIEWPORTS)) issues.push("visualEvidence viewport matrix is stale.");
  if (!same(visual.states, ART_MIGRATION_STATES)) issues.push("visualEvidence state matrix is stale.");
  if (browserEvidence) {
    if (!same(visual.capture, browserEvidence.capture)) issues.push("visualEvidence capture does not match retained browser evidence.");
    if (!same(visual.browserIdentity, browserEvidence.browserIdentity)) issues.push("visualEvidence browser identity does not match retained browser evidence.");
    const observation = visualObservationFromBrowserEvidence(browserEvidence);
    if (!same(visual.results, observation.results)) issues.push("visualEvidence result details digests do not match retained browser evidence.");
    if (visual.resultSetSha256 !== observation.resultSetSha256) issues.push("visualEvidence result-set digest does not match retained browser evidence.");
  }
  if (visual.passingArtifactPolicy !== "NO_SCREENSHOTS_TRACES_VIDEO_OR_CHILD_DATA") issues.push("visualEvidence passing-artifact policy is unsafe.");
}

export async function validateArtMigrationBaseline(baseline, {
  root = repositoryRoot,
  sourceObservation = null,
  browserEvidence = null,
  browserEvidenceBytes = null,
} = {}) {
  const issues = await validateArtMigrationBaselineSchema(baseline);
  if (issues.length) return Object.freeze({ valid: false, status: "FAIL", issues: Object.freeze(issues) });
  validateOrdering(baseline, issues);
  if (!SHA1_PATTERN.test(baseline.sourceRevision.commitSha1)) issues.push("sourceRevision commit is invalid.");
  let observed = sourceObservation;
  try { observed ||= observeArtMigrationSource(baseline, { root }); }
  catch (error) { issues.push(`source revision observation failed: ${String(error?.message || error)}`); }
  if (observed) {
    for (const key of ["sourceRevision", "authorityBindings", "runtimeBindings", "engineBinding", "fixtureContract"]) {
      if (!same(baseline[key], observed[key])) issues.push(`${key} does not match the exact historical source observation.`);
    }
  }
  const artBinding = observed?.authorityBindings?.find((record) => record.id === "AUTH-ART-DESIGN");
  if (artBinding) {
    const decisions = JSON.parse(gitBytes(root, observed.sourceRevision.commitSha1, artBinding.path).toString("utf8"));
    const step = decisions.migrationSequence.find((record) => record.id === baseline.migrationStepId);
    if (!step || step.directive !== "FREEZE_CURRENT_VISUAL_BASELINES_AND_REPRESENTATIVE_TASK_FIXTURES"
      || step.entryGate !== baseline.entryGateId || step.exitGate !== baseline.exitGateId) {
      issues.push("ART-MIG-01 does not bind the declared directive and gates.");
    }
  }
  let retainedBrowserEvidence = browserEvidence;
  let retainedBrowserEvidenceBytes = browserEvidenceBytes;
  try {
    if (!retainedBrowserEvidence) {
      retainedBrowserEvidenceBytes = await readFile(path.resolve(root, normalizePath(baseline.browserEvidenceBinding.path)));
      retainedBrowserEvidence = JSON.parse(retainedBrowserEvidenceBytes.toString("utf8"));
    }
    retainedBrowserEvidenceBytes ||= Buffer.from(`${JSON.stringify(retainedBrowserEvidence, null, 2)}\n`, "utf8");
    const retainedValidation = await validateArtMigrationBrowserEvidence(retainedBrowserEvidence, { rawBytes: retainedBrowserEvidenceBytes, root });
    if (!retainedValidation.valid) issues.push(...retainedValidation.issues.map((issue) => `retained browser evidence: ${issue}`));
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
  } catch (error) {
    issues.push(`retained browser evidence observation failed: ${String(error?.message || error)}`);
  }
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
