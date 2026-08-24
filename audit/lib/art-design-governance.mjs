import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const ART_DESIGN_DECISION_REGISTER_PATH = new URL("../art-design-decision-register-v1.json", import.meta.url);
export const ART_ASSET_REGISTER_PATH = new URL("../art-asset-register-v1.json", import.meta.url);
export const DESIGN_TOKENS_PATH = new URL("../../assets/design/math-quest-design-tokens-v1.json", import.meta.url);
export const ART_DESIGN_DECISION_SCHEMA_PATH = new URL("../schemas/art-design-decision-register-v1.schema.json", import.meta.url);
export const ART_ASSET_SCHEMA_PATH = new URL("../schemas/art-asset-register-v1.schema.json", import.meta.url);
export const DESIGN_TOKENS_SCHEMA_PATH = new URL("../schemas/design-tokens-v1.schema.json", import.meta.url);

const EXPECTED_STAGE_ORDER = Object.freeze([
  "COORDINATES", "PERSPECTIVE", "ENVELOPE", "BOXES", "AXES", "SECTIONS", "CURVES",
  "CONTOUR", "SHADOWS", "VALUES", "COLOUR", "MATERIALS", "DETAIL",
]);

const PROJECTABLE_DISPOSITIONS = new Set(["REVIEWED_ADOPTED", "REVIEWED_MODIFIED"]);
const ART_PROOF_IDS = new Set([
  "ACCESSIBILITY", "CONSTRUCTION", "HUMAN_LEGIBILITY", "MATHEMATICAL_NON_INTERFERENCE",
  "PLAIN_BASELINE", "PLAYWRIGHT", "PROVENANCE", "PWA", "RESPONSIVE", "RIGHTS", "VISUAL_QA",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (values, selector = (value) => value) => [...values].sort((left, right) => selector(left).localeCompare(selector(right), "en"));
const duplicates = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message}`;
const normalizePath = (value) => String(value || "").replace(/\\/gu, "/").replace(/^\.\//u, "");

function channel(value) {
  const component = Number.parseInt(value, 16) / 255;
  return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground, background) {
  const parse = (hex) => {
    const value = hex.slice(1);
    return 0.2126 * channel(value.slice(0, 2)) + 0.7152 * channel(value.slice(2, 4)) + 0.0722 * channel(value.slice(4, 6));
  };
  const first = parse(foreground);
  const second = parse(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function validateSchema(value, schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return validate(value) ? [] : (validate.errors || []).map(schemaIssue);
}

export const validateArtDesignDecisionSchema = (value, schemaPath = ART_DESIGN_DECISION_SCHEMA_PATH) => validateSchema(value, schemaPath);
export const validateArtAssetSchema = (value, schemaPath = ART_ASSET_SCHEMA_PATH) => validateSchema(value, schemaPath);
export const validateDesignTokensSchema = (value, schemaPath = DESIGN_TOKENS_SCHEMA_PATH) => validateSchema(value, schemaPath);

function ensureSorted(issues, values, selector, label) {
  if (!same(values, sorted(values, selector))) issues.push(`${label} must be sorted by its declared key.`);
}

function validateDecisionSemantics(decisions, issues) {
  const source = decisions.sourceDecisions;
  const rules = decisions.designRules;
  const sourceById = new Map(source.map((record) => [record.id, record]));
  const rulesById = new Map(rules.map((record) => [record.id, record]));
  ensureSorted(issues, rules, (record) => record.id, "designRules");
  for (const duplicate of duplicates(source.map((record) => record.id))) issues.push(`sourceDecisions repeats id ${duplicate}.`);
  for (const duplicate of duplicates(source.map((record) => record.sourceNumber))) issues.push(`sourceDecisions repeats sourceNumber ${duplicate}.`);
  for (const duplicate of duplicates(rules.map((record) => record.id))) issues.push(`designRules repeats id ${duplicate}.`);
  for (let index = 0; index < source.length; index += 1) {
    const expected = index + 1;
    const record = source[index];
    if (record.sourceNumber !== expected) issues.push(`sourceDecisions sourceNumber ${record.sourceNumber} is out of order; expected ${expected}.`);
    if (record.id !== `ART-SRC-${String(expected).padStart(3, "0")}`) issues.push(`source decision ${record.id} does not match sourceNumber ${expected}.`);
    if (record.sourcePath !== decisions.sourceBundle.decisionRegisterPath) issues.push(`${record.id} sourcePath does not match the source-bundle decision register path.`);
    if (record.sourceFileSha256 !== decisions.sourceBundle.decisionRegisterSha256) issues.push(`${record.id} sourceFileSha256 does not match the source-bundle decision register hash.`);
    const projectable = PROJECTABLE_DISPOSITIONS.has(record.disposition);
    if (projectable !== (record.designRuleIds.length > 0)) issues.push(`${record.id} projectability does not match its disposition.`);
  }
  for (const record of source) {
    for (const id of record.designRuleIds) {
      const rule = rulesById.get(id);
      if (!rule) issues.push(`${record.id} references unknown design rule ${id}.`);
      else if (!rule.sourceDecisionIds.includes(record.id)) issues.push(`${record.id} and ${id} are not bidirectionally linked.`);
    }
    if (PROJECTABLE_DISPOSITIONS.has(record.disposition)) {
      const activations = new Set(record.designRuleIds.map((id) => rulesById.get(id)?.activation).filter(Boolean));
      if (activations.size !== 1) issues.push(`${record.id} design rules do not resolve to one activation class.`);
      const expectedProjection = activations.has("GOVERNANCE_ACTIVE") ? "ACTIVE_RULE" : "ROADMAP_RULE";
      if (activations.size === 1 && record.runtimeProjection !== expectedProjection) issues.push(`${record.id} runtimeProjection ${record.runtimeProjection} conflicts with ${[...activations][0]}.`);
    } else {
      const expectedProjection = record.disposition === "REVIEWED_REJECTED" ? "FORBIDDEN" : "REFERENCE_ONLY";
      if (record.runtimeProjection !== expectedProjection) issues.push(`${record.id} nonprojectable disposition requires runtimeProjection ${expectedProjection}.`);
    }
  }
  for (const rule of rules) {
    for (const id of rule.sourceDecisionIds) {
      const decision = sourceById.get(id);
      if (!decision) issues.push(`${rule.id} references unknown source decision ${id}.`);
      else if (!PROJECTABLE_DISPOSITIONS.has(decision.disposition)) issues.push(`${rule.id} projects nonprojectable source decision ${id}.`);
      else if (!decision.designRuleIds.includes(rule.id)) issues.push(`${rule.id} and ${id} are not bidirectionally linked.`);
    }
    for (const proof of rule.requiredProofs) if (!ART_PROOF_IDS.has(proof)) issues.push(`${rule.id} has unknown proof ${proof}.`);
  }
  const activeRuleKeys = rules.filter((rule) => rule.activation === "GOVERNANCE_ACTIVE").map((rule) => `${rule.scopeId}|${rule.propertyId}`);
  for (const duplicate of duplicates(activeRuleKeys)) issues.push(`active design rules conflict at ${duplicate}.`);

  const stages = decisions.constructionWorkflow.stages;
  if (!same(stages.map((record) => record.id), EXPECTED_STAGE_ORDER)) issues.push("constructionWorkflow stages do not equal the mandatory sequence.");
  if (!same(stages.map((record) => record.order), Array.from({ length: 13 }, (_, index) => index + 1))) issues.push("constructionWorkflow stage orders are not contiguous.");
  const steps = decisions.constructionWorkflow.steps;
  if (!same(steps.map((record) => record.order), Array.from({ length: 53 }, (_, index) => index + 1))) issues.push("constructionWorkflow step orders are not contiguous from 1 through 53.");
  if (!same(steps.map((record) => record.id), Array.from({ length: 53 }, (_, index) => `ART-WF-${String(index + 1).padStart(2, "0")}`))) issues.push("constructionWorkflow step ids do not match their order.");
  const coveredStages = new Set(steps.map((record) => record.stage));
  for (const stage of EXPECTED_STAGE_ORDER) if (!coveredStages.has(stage)) issues.push(`constructionWorkflow has no step assigned to stage ${stage}.`);
  const tiers = new Map(decisions.constructionWorkflow.tiers.map((record) => [record.id, record]));
  if (tiers.get("TIER_1")?.minimumApplicableSteps !== 53 || tiers.get("TIER_1")?.maximumApplicableSteps !== 53) issues.push("TIER_1 must require all 53 steps.");
  if (tiers.get("TIER_2")?.minimumApplicableSteps !== 25 || tiers.get("TIER_2")?.maximumApplicableSteps !== 35) issues.push("TIER_2 must require 25 through 35 applicable steps.");
  if (tiers.get("TIER_3")?.minimumApplicableSteps !== 13) issues.push("TIER_3 must cover at least one record for every mandatory stage.");
  const migration = decisions.migrationSequence;
  if (!same(migration.map((record) => record.order), Array.from({ length: 16 }, (_, index) => index + 1))) issues.push("migrationSequence orders are not contiguous from 1 through 16.");
  if (decisions.themePolicy.worldIdentity !== "MATHEMATICAL_CONSERVATORY_AND_WORKSHOP" || decisions.themePolicy.scope !== "ALL_USER_FACING_ROUTES") issues.push("Conservatory identity must govern every user-facing route.");
}

function validateTokenSemantics(decisions, tokens, decisionBytes, issues) {
  if (tokens.decisionRegisterBinding.sha256 !== sha256(decisionBytes)) issues.push("design tokens decision-register binding is stale.");
  const decisionById = new Map(decisions.sourceDecisions.map((record) => [record.id, record]));
  for (const id of tokens.sourceDecisionIds) {
    const decision = decisionById.get(id);
    if (!decision) issues.push(`design tokens reference unknown source decision ${id}.`);
    else if (!PROJECTABLE_DISPOSITIONS.has(decision.disposition)) issues.push(`design tokens project nonprojectable source decision ${id}.`);
    else if (decision.runtimeProjection !== "ACTIVE_RULE") issues.push(`design tokens source decision ${id} is not an active governance rule.`);
  }
  ensureSorted(issues, tokens.sourceDecisionIds, (value) => value, "design token sourceDecisionIds");
  ensureSorted(issues, tokens.colours, (record) => record.id, "design token colours");
  ensureSorted(issues, tokens.approvedTextPairings, (record) => record.id, "approvedTextPairings");
  ensureSorted(issues, tokens.dimensions, (record) => record.id, "design token dimensions");
  ensureSorted(issues, tokens.motion, (record) => record.id, "design token motion");
  ensureSorted(issues, tokens.viewPalettes, (record) => record.id, "viewPalettes");
  for (const duplicate of duplicates(tokens.colours.map((record) => record.id))) issues.push(`design tokens repeat colour ${duplicate}.`);
  for (const duplicate of duplicates(tokens.approvedTextPairings.map((record) => record.id))) issues.push(`design tokens repeat pairing ${duplicate}.`);
  const colours = new Map(tokens.colours.map((record) => [record.id, record]));
  for (const pairing of tokens.approvedTextPairings) {
    const foreground = colours.get(pairing.foregroundId);
    const background = colours.get(pairing.backgroundId);
    if (!foreground) issues.push(`${pairing.id} references unknown foreground ${pairing.foregroundId}.`);
    if (!background) issues.push(`${pairing.id} references unknown background ${pairing.backgroundId}.`);
    if (!foreground || !background) continue;
    if (!new Set(["TEXT_OR_STROKE", "STATE_WITH_NON_COLOUR_CUE"]).has(foreground.usageClass)) issues.push(`${pairing.id} foreground is not approved for text.`);
    if (background.usageClass !== "SURFACE") issues.push(`${pairing.id} background is not a governed surface.`);
    const actual = contrastRatio(foreground.value, background.value);
    if (Math.abs(actual - pairing.measuredRatio) > tokens.contrastPolicy.ratioTolerance) issues.push(`${pairing.id} measuredRatio is stale; recorded ${pairing.measuredRatio}, actual ${actual.toFixed(3)}.`);
    const minimum = pairing.minimumClass === "NORMAL_TEXT" ? tokens.contrastPolicy.normalTextMinimumRatio : tokens.contrastPolicy.largeTextMinimumRatio;
    if (actual + tokens.contrastPolicy.ratioTolerance < minimum) issues.push(`${pairing.id} contrast ${actual.toFixed(3)} is below ${minimum}.`);
  }
  for (const palette of tokens.viewPalettes) {
    for (const id of palette.tokenIds) {
      const token = colours.get(id);
      if (!token) issues.push(`${palette.id} references unknown token ${id}.`);
      else if (token.usageClass !== "ATMOSPHERE_ONLY") issues.push(`${palette.id} token ${id} is not atmosphere-only.`);
    }
  }
}

function assetEvidenceReferences(record) {
  const references = [];
  for (const entry of record?.evidence?.constructionEvidence || []) {
    for (const [evidenceClass, values] of Object.entries(entry.evidenceRefs || {})) {
      if (!Array.isArray(values)) continue;
      for (const reference of values) {
        if (!reference || typeof reference.path !== "string") continue;
        references.push({
          claim: `construction ${entry.stepId} ${evidenceClass}`,
          path: normalizePath(reference.path),
          sha256: reference.sha256,
        });
      }
    }
  }
  for (const entry of record?.evidence?.proofEvidence || []) {
    if (!Array.isArray(entry.evidenceRefs)) continue;
    for (const reference of entry.evidenceRefs) {
      if (!reference || typeof reference.path !== "string") continue;
      references.push({
        claim: `proof ${entry.proofId}`,
        path: normalizePath(reference.path),
        sha256: reference.sha256,
      });
    }
  }
  return references;
}

function validateAssetSemantics(decisions, assets, decisionBytes, tokens, issues, options) {
  const validationMode = options.validationMode || "DEVELOPMENT";
  if (!new Set(["DEVELOPMENT", "RELEASE"]).has(validationMode)) issues.push(`unknown art-design validation mode ${validationMode}.`);
  if (assets.decisionRegisterBinding.sha256 !== sha256(decisionBytes)) issues.push("art asset register decision-register binding is stale.");
  ensureSorted(issues, assets.records, (record) => record.id, "art asset records");
  const decisionsById = new Map(decisions.sourceDecisions.map((record) => [record.id, record]));
  const rulesById = new Map(decisions.designRules.map((record) => [record.id, record]));
  const workflowStepsById = new Map(decisions.constructionWorkflow.steps.map((record) => [record.id, record]));
  const componentBindings = new Map(Object.entries(options.componentBindings || {}));
  const evidenceBindings = new Map(Object.entries(options.evidenceBindings || {}));
  const fileHashes = new Map(Object.entries(options.fileHashes || {}).map(([file, hash]) => [normalizePath(file), hash]));
  const releasePaths = new Set((options.releasePaths || []).map(normalizePath));
  const featureIds = new Set(options.featureIds || []);
  const tutorialRefs = new Set(options.tutorialRefs || []);
  const tracked = (options.trackedPaths || []).map(normalizePath);
  const trackedSet = new Set(tracked);
  const paths = new Set();
  for (const record of assets.records) {
    if (paths.has(record.path)) issues.push(`art asset path ${record.path} is registered more than once.`);
    paths.add(record.path);
    if (validationMode === "RELEASE" && record.acceptanceState !== "RELEASE_CERTIFIED") issues.push(`${record.id} is not release-certified for release validation.`);
    for (const field of ["decisionIds", "designRuleIds", "featureIds", "tutorialRefs", "permittedUses", "requiredProofs"]) ensureSorted(issues, record[field], (value) => value, `${record.id} ${field}`);
    for (const id of record.decisionIds) {
      const decision = decisionsById.get(id);
      if (!decision) issues.push(`${record.id} references unknown decision ${id}.`);
      else if (!PROJECTABLE_DISPOSITIONS.has(decision.disposition)) issues.push(`${record.id} projects nonprojectable decision ${id}.`);
      else if (record.acceptanceState !== "CANDIDATE" && decision.runtimeProjection !== "ACTIVE_RULE") issues.push(`${record.id} runtime use projects non-active decision ${id}.`);
    }
    for (const id of record.designRuleIds) {
      const rule = rulesById.get(id);
      if (!rule) issues.push(`${record.id} references unknown design rule ${id}.`);
      else {
        if (!rule.sourceDecisionIds.some((decisionId) => record.decisionIds.includes(decisionId))) issues.push(`${record.id} design rule ${id} is not sourced by a bound decision.`);
        if (record.acceptanceState !== "CANDIDATE" && rule.activation !== "GOVERNANCE_ACTIVE") issues.push(`${record.id} runtime use projects non-active design rule ${id}.`);
      }
    }

    const constructionEvidence = record.evidence.constructionEvidence;
    const expectedStepIds = decisions.constructionWorkflow.steps.map((step) => step.id);
    if (!same(constructionEvidence.map((entry) => entry.stepId), expectedStepIds)) issues.push(`${record.id} construction evidence must cover all 53 workflow steps in order.`);
    const applicableEntries = constructionEvidence.filter((entry) => entry.status !== "NOT_APPLICABLE_JUSTIFIED");
    const applicableSteps = applicableEntries.map((entry) => workflowStepsById.get(entry.stepId)).filter(Boolean);
    const coveredStages = new Set(applicableSteps.map((step) => step.stage));
    if (record.workflowTier === "TIER_1" && applicableEntries.length !== 53) issues.push(`${record.id} TIER_1 must apply all 53 construction steps.`);
    if (record.workflowTier === "TIER_2" && (applicableEntries.length < 25 || applicableEntries.length > 35)) issues.push(`${record.id} TIER_2 must apply 25 through 35 construction steps.`);
    if (record.workflowTier === "TIER_3" && (applicableEntries.length < 13 || applicableEntries.length > 24)) issues.push(`${record.id} TIER_3 must apply 13 through 24 construction steps.`);
    if (EXPECTED_STAGE_ORDER.some((stage) => !coveredStages.has(stage))) issues.push(`${record.id} ${record.workflowTier} must apply at least one construction step from every mandatory stage.`);

    ensureSorted(issues, record.evidence.proofEvidence, (entry) => entry.proofId, `${record.id} proofEvidence`);
    if (!same(record.evidence.proofEvidence.map((entry) => entry.proofId), record.requiredProofs)) issues.push(`${record.id} proof evidence must exactly cover requiredProofs.`);
    if (record.evidence.proofEvidence.some((entry) => entry.status === "FAILED")) issues.push(`${record.id} contains failed proof evidence and cannot remain an accepted candidate.`);
    for (const reference of assetEvidenceReferences(record)) {
      if (!trackedSet.has(reference.path)) issues.push(`${record.id} ${reference.claim} evidence ${reference.path} is not a tracked repository file.`);
      if (!fileHashes.has(reference.path) || fileHashes.get(reference.path) === null) issues.push(`${record.id} ${reference.claim} evidence ${reference.path} bytes are unavailable for exact hash verification.`);
      else if (fileHashes.get(reference.path) !== reference.sha256) issues.push(`${record.id} ${reference.claim} evidence ${reference.path} SHA-256 does not match the actual evidence bytes.`);
    }

    const componentBinding = componentBindings.get(record.componentId);
    if (!componentBinding) issues.push(`${record.id} references unknown or ineligible file-bearing image component ${record.componentId}.`);
    else {
      if (componentBinding.kind !== "image") issues.push(`${record.id} rights component ${record.componentId} is not an image component.`);
      if (!componentBinding.paths.includes(record.path)) issues.push(`${record.id} path does not match rights component ${record.componentId}.`);
      if (componentBinding.sha256 !== record.sha256) issues.push(`${record.id} SHA-256 does not match rights component ${record.componentId}.`);
      if (record.evidence.rightsEvidencePath !== componentBinding.attributionRecord) issues.push(`${record.id} rightsEvidencePath does not equal the component attribution record.`);
      for (const evidencePath of [componentBinding.attributionRecord, componentBinding.licenceEvidence]) {
        const evidence = evidenceBindings.get(evidencePath);
        if (!evidence) issues.push(`${record.id} component evidence ${evidencePath} is absent from the evidence-path registry.`);
        else if (!evidence.actualSha256 || evidence.actualSha256 !== evidence.sha256) issues.push(`${record.id} component evidence ${evidencePath} does not match its actual bytes.`);
      }
    }
    const assetPath = normalizePath(record.path);
    if (!trackedSet.has(assetPath)) issues.push(`${record.id} asset ${record.path} is not a tracked repository file.`);
    if (!fileHashes.has(assetPath) || fileHashes.get(assetPath) === null) issues.push(`${record.id} asset bytes are unavailable for exact hash verification.`);
    else if (fileHashes.get(assetPath) !== record.sha256) issues.push(`${record.id} SHA-256 does not match the actual asset bytes.`);
    if (featureIds.size) for (const id of record.featureIds) if (!featureIds.has(id)) issues.push(`${record.id} references unknown feature ${id}.`);
    if (tutorialRefs.size) for (const id of record.tutorialRefs) if (!tutorialRefs.has(id)) issues.push(`${record.id} references unknown tutorial identity ${id}.`);
    if (record.semanticClass === "MATHEMATICAL_REPRESENTATION") {
      if (record.mathFactMode !== "DETERMINISTIC_RENDERER_OWNS_FACTS") issues.push(`${record.id} mathematical representation does not bind facts to a deterministic renderer.`);
      if (!record.requiredProofs.includes("MATHEMATICAL_NON_INTERFERENCE") || !record.requiredProofs.includes("PLAIN_BASELINE")) issues.push(`${record.id} mathematical representation lacks non-interference or plain-baseline proof.`);
      if (!record.evidence.plainBaselineSelector || !record.evidence.mathematicalOracleId) issues.push(`${record.id} mathematical representation lacks baseline or oracle evidence.`);
    }
    if (record.semanticClass === "FUNCTIONAL_UI" && !record.requiredProofs.includes("ACCESSIBILITY")) issues.push(`${record.id} functional UI asset lacks accessibility proof.`);
    if (!record.requiredProofs.includes("RIGHTS") || !record.requiredProofs.includes("CONSTRUCTION")) issues.push(`${record.id} lacks mandatory rights or construction proof.`);
    if (record.acceptanceState === "CANDIDATE") {
      if (record.runtimeSelectors.length !== 0) issues.push(`${record.id} candidate may not declare runtime selectors.`);
      if (!same(record.permittedUses, ["EVALUATION_ONLY"])) issues.push(`${record.id} candidate permittedUses must equal EVALUATION_ONLY.`);
      if (releasePaths.has(record.path)) issues.push(`${record.id} candidate may not appear in the release shell.`);
    } else {
      if (record.runtimeSelectors.length === 0) issues.push(`${record.id} runtime acceptance state requires at least one exact runtime selector.`);
      if (record.permittedUses.includes("EVALUATION_ONLY")) issues.push(`${record.id} runtime acceptance state may not use EVALUATION_ONLY.`);
      if (!releasePaths.has(record.path)) issues.push(`${record.id} runtime acceptance state is absent from the release shell.`);
      if (!record.evidence.reviewedRevision || record.evidence.reviewedAssetSha256 !== record.sha256 || !record.evidence.rightsEvidencePath) issues.push(`${record.id} runtime acceptance state lacks exact revision, hash, or rights evidence.`);
      if (constructionEvidence.some((entry) => entry.status === "APPLICABLE_PENDING")) issues.push(`${record.id} runtime acceptance state has pending construction evidence.`);
      if (record.evidence.proofEvidence.some((entry) => entry.status !== "PROVED")) issues.push(`${record.id} runtime acceptance state has unproved required evidence.`);
    }
  }
  const designPath = new RegExp(assets.scope.governedPathPattern, "u");
  const excluded = new Set(assets.scope.excludedNonAssetPaths);
  for (const file of tracked.filter((file) => designPath.test(file) && !excluded.has(file))) if (!paths.has(file)) issues.push(`${file}: governed art asset is absent from the art asset register.`);
  const sourceName = decisions.sourceBundle.fileName;
  for (const file of tracked) if (file.includes(sourceName) || file.includes(decisions.sourceBundle.internalRoot)) issues.push(`${file}: source bundle material may not be projected directly into the repository.`);
}

export async function validateArtDesignGovernance(decisions, assets, tokens, options = {}) {
  const issues = [
    ...(await validateArtDesignDecisionSchema(decisions)),
    ...(await validateArtAssetSchema(assets)),
    ...(await validateDesignTokensSchema(tokens)),
  ];
  if (issues.length) return Object.freeze(issues);
  const decisionBytes = options.decisionBytes || Buffer.from(`${JSON.stringify(decisions, null, 2)}\n`);
  validateDecisionSemantics(decisions, issues);
  validateTokenSemantics(decisions, tokens, decisionBytes, issues);
  validateAssetSemantics(decisions, assets, decisionBytes, tokens, issues, options);
  return Object.freeze(issues);
}

export async function loadArtDesignGovernance(options = {}) {
  const [decisionBytes, assetBytes, tokenBytes] = await Promise.all([
    readFile(options.decisionPath || ART_DESIGN_DECISION_REGISTER_PATH),
    readFile(options.assetPath || ART_ASSET_REGISTER_PATH),
    readFile(options.tokenPath || DESIGN_TOKENS_PATH),
  ]);
  const decisions = JSON.parse(decisionBytes);
  const assets = JSON.parse(assetBytes);
  const tokens = JSON.parse(tokenBytes);
  let componentBindings = options.componentBindings;
  let evidenceBindings = options.evidenceBindings;
  let fileHashes = options.fileHashes;
  let featureIds = options.featureIds;
  let releasePaths = options.releasePaths;
  let tutorialRefs = options.tutorialRefs;
  const repositoryRoot = options.root || root;
  if (!componentBindings || !evidenceBindings || !fileHashes || !featureIds || !releasePaths || !tutorialRefs) {
    const [components, evidencePaths, featureMap, releaseShell, tutorialManifest] = await Promise.all([
      readFile(path.join(repositoryRoot, "licenses", "component-register-v1.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "licenses", "evidence-paths-v1.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "curriculum", "math-quest-feature-map-v1.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "release-shell-v1.json"), "utf8").then(JSON.parse),
      readFile(path.join(repositoryRoot, "curriculum", "math-quest-tutorial-manifest-v1.json"), "utf8").then(JSON.parse),
    ]);
    componentBindings ||= Object.fromEntries((components.bundledComponents || [])
      .filter((record) => record.kind === "image" && Array.isArray(record.paths) && typeof record.sha256 === "string")
      .map((record) => [record.id, {
        attributionRecord: record.attributionRecord,
        kind: record.kind,
        licenceEvidence: record.licenceEvidence,
        paths: record.paths.map(normalizePath),
        sha256: record.sha256,
      }]));
    if (!evidenceBindings) {
      evidenceBindings = Object.fromEntries(await Promise.all(evidencePaths.records.map(async (record) => {
        let actualSha256 = null;
        try {
          actualSha256 = sha256(await readFile(path.join(repositoryRoot, normalizePath(record.path))));
        } catch {}
        return [record.path, { actualSha256, sha256: record.sha256 }];
      })));
    }
    if (!fileHashes) {
      const governedFiles = new Set(assets.records.flatMap((record) => [
        normalizePath(record.path),
        ...assetEvidenceReferences(record).map((reference) => reference.path),
      ]));
      fileHashes = Object.fromEntries(await Promise.all([...governedFiles].map(async (file) => {
        let actualSha256 = null;
        try {
          actualSha256 = sha256(await readFile(path.join(repositoryRoot, file)));
        } catch {}
        return [file, actualSha256];
      })));
    }
    featureIds ||= featureMap.features.map((record) => record.id);
    releasePaths ||= releaseShell.entries.map((record) => normalizePath(record.path));
    tutorialRefs ||= [
      ...tutorialManifest.visualAnchorCatalog.map((record) => `ANCHOR:${record.anchorRoleId}`),
      ...tutorialManifest.visualCueCatalog.map((record) => `CUE:${record.cueId}`),
      ...tutorialManifest.tutorialFamilies.map((record) => `FAMILY:${record.familyId}`),
    ];
  }
  let trackedPaths = options.trackedPaths;
  if (!trackedPaths) {
    const { trackedRepositoryPaths } = await import("./repository-code-map.mjs");
    trackedPaths = trackedRepositoryPaths(repositoryRoot);
  }
  const issues = await validateArtDesignGovernance(decisions, assets, tokens, {
    ...options,
    componentBindings,
    decisionBytes,
    evidenceBindings,
    featureIds,
    fileHashes,
    releasePaths,
    trackedPaths,
    tutorialRefs,
  });
  if (issues.length) throw new Error(`Invalid art-design governance:\n- ${issues.join("\n- ")}`);
  return Object.freeze({ decisions: Object.freeze(decisions), assets: Object.freeze(assets), tokens: Object.freeze(tokens), decisionSha256: sha256(decisionBytes) });
}
