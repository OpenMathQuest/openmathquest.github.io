import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extractEngineFromPageBytes, evaluateEngine } from "./engine-loader.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const QA_TOUR_SEED = 0x51415431;
const normalizePath = (value) => String(value || "").replace(/\\/gu, "/").replace(/^\.\//u, "");

const ART_MIGRATION_AUTHORITY_BINDINGS = Object.freeze([
  Object.freeze({ id: "AUTH-ART-DESIGN", path: "audit/art-design-decision-register-v1.json", json: true }),
  Object.freeze({ id: "AUTH-CODE-MAP", path: "audit/repository-code-map-v1.json", json: true }),
  Object.freeze({ id: "AUTH-CURRICULUM", path: "curriculum/math-quest-manifest-v1.json", json: true }),
  Object.freeze({ id: "AUTH-FEATURE-MAP", path: "curriculum/math-quest-feature-map-v1.json", json: true }),
  Object.freeze({ id: "AUTH-GATE-POLICY", path: "audit/gate-integrity-policy-v1.json", json: true }),
  Object.freeze({ id: "AUTH-TUTORIAL-MANIFEST", path: "curriculum/math-quest-tutorial-manifest-v1.json", json: true }),
]);

const ART_MIGRATION_RUNTIME_BINDINGS = Object.freeze([
  Object.freeze({ id: "RUNTIME-AUDIT-HARNESS", path: "audit.html", json: false }),
  Object.freeze({ id: "RUNTIME-BROWSER-ORCHESTRATOR", path: "audit/lib/browser-smoke.mjs", json: false }),
  Object.freeze({ id: "RUNTIME-DEEP-UX-CONTRACT", path: "audit/lib/playwright-deep-ux-census.mjs", json: false }),
  Object.freeze({ id: "RUNTIME-INDEX", path: "index.html", json: false }),
  Object.freeze({ id: "RUNTIME-PWA-SHELL", path: "release-shell-v1.json", json: true }),
  Object.freeze({ id: "RUNTIME-SERVICE-WORKER", path: "sw.js", json: false }),
  Object.freeze({ id: "RUNTIME-VISUAL-ORACLE", path: "audit/approved-visual-regression.js", json: false }),
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

export function artMigrationSourceBytes(root, revision, relativePath) {
  return Buffer.from(execFileSync("git", ["show", `${revision}:${normalizePath(relativePath)}`], {
    cwd: root,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  }));
}

function sourceBinding(root, revision, definition) {
  const bytes = artMigrationSourceBytes(root, revision, definition.path);
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

function extractQaTourFixture(pageBytes) {
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

function fixtureIdentityRow(spec, skill, question, fixtureId) {
  return {
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
  };
}

function deriveFixtureRecord(spec, index, context) {
  const { engine, featureMap, tutorial } = context;
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
  const identity = fixtureIdentityRow(spec, skill, question, fixtureId);
  const record = {
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
  return { identity, record };
}

function fixtureCoverage(records) {
  const distinct = (values, compare = (left, right) => String(left).localeCompare(String(right), "en")) => [...new Set(values)].sort(compare);
  return {
    questionCount: records.length,
    levels: distinct(records.map((record) => record.level), (left, right) => left - right),
    strands: distinct(records.map((record) => record.strand)),
    generatorProfiles: distinct(records.map((record) => record.generatorProfile)),
    releaseReachableInputMethods: distinct(records.map((record) => record.inputMethod)),
    strategyBuildSkillIds: distinct(records.filter((record) => record.inputMethod === "STRATEGY_BUILD").map((record) => record.skillId)),
  };
}

function deriveFixtureContract(indexBytes, featureMap, tutorial) {
  const extracted = extractEngineFromPageBytes(indexBytes);
  const engine = evaluateEngine(extracted.source);
  const { declaration, specs } = extractQaTourFixture(indexBytes);
  const context = { engine, featureMap, tutorial };
  const fixtures = specs.map((spec, index) => deriveFixtureRecord(spec, index, context));
  const fullIdentityRows = fixtures.map((fixture) => fixture.identity);
  const records = fixtures.map((fixture) => fixture.record);
  const specBytes = Buffer.from(JSON.stringify(specs), "utf8");
  const identityBytes = Buffer.from(JSON.stringify(fullIdentityRows), "utf8");
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
      evaluatedSpecBytes: specBytes.length,
      evaluatedSpecSha256: artMigrationSha256(specBytes),
      fullIdentityRowsBytes: identityBytes.length,
      fullIdentityRowsSha256: artMigrationSha256(identityBytes),
      storedRecordSetSha256: artMigrationSha256(artMigrationCanonicalJson(records)),
      records,
      coverage: fixtureCoverage(records),
      exclusions: [
        { featureId: "child.mechanic.number-bond", inputMethod: "NUMBER_BOND", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
        { featureId: "child.mechanic.number-choice", inputMethod: "NUMBER_CHOICE", state: "RENDERER_CAPABLE_NOT_RELEASE_REACHABLE_AT_SOURCE_REVISION", proofResultId: "VIS-CAPABILITIES" },
      ],
    },
  };
}

export function observeArtMigrationSource(baseline, { root = repositoryRoot } = {}) {
  const revision = baseline.sourceRevision.commitSha1;
  const authorityBindings = ART_MIGRATION_AUTHORITY_BINDINGS.map((definition) => sourceBinding(root, revision, definition));
  const runtimeBindings = ART_MIGRATION_RUNTIME_BINDINGS.map((definition) => sourceBinding(root, revision, definition));
  const authorityById = new Map(authorityBindings.map((record) => [record.id, record]));
  const runtimeById = new Map(runtimeBindings.map((record) => [record.id, record]));
  const indexBytes = artMigrationSourceBytes(root, revision, runtimeById.get("RUNTIME-INDEX").path);
  const featureMap = JSON.parse(artMigrationSourceBytes(root, revision, authorityById.get("AUTH-FEATURE-MAP").path).toString("utf8"));
  const tutorial = JSON.parse(artMigrationSourceBytes(root, revision, authorityById.get("AUTH-TUTORIAL-MANIFEST").path).toString("utf8"));
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

