import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalizeJson } from "./curriculum-manifest.mjs";
import { AI_READER_CONTRACT_REF } from "./repository-code-map.mjs";
import { tutorialFeatureIdForInputMethod } from "./tutorial-manifest.mjs";

export const FEATURE_MAP_PATH = "curriculum/math-quest-feature-map-v1.json";
export const FEATURE_MAP_SCHEMA_PATH = "audit/schemas/feature-map-v1.schema.json";
const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

export const featureIdForInputMethod = tutorialFeatureIdForInputMethod;

function sha256(value) {
  return createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function schemaIssue(error) {
  return `${error.instancePath || "/"} ${error.message || "is invalid"}`;
}

export async function validateFeatureMapSchema(map, schemaPathOrUrl = new URL("../schemas/feature-map-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(map);
  return Object.freeze(valid ? [] : (validate.errors || []).map(schemaIssue));
}

export async function validateFeatureMap(map, { curriculum, tutorial, artDesign, schemaPathOrUrl } = {}) {
  const issues = [...await validateFeatureMapSchema(map, schemaPathOrUrl)];
  if (issues.length) return Object.freeze(issues);
  if (!curriculum || !tutorial || !artDesign) return Object.freeze(["Validated curriculum, tutorial, and art-design decision manifests are required."]);

  if (canonicalizeJson(map.aiReaderContractRef) !== canonicalizeJson(AI_READER_CONTRACT_REF)) issues.push("aiReaderContractRef does not match the repository AI-reader authority.");

  if (map.curriculumBinding.path !== "curriculum/math-quest-manifest-v1.json") issues.push("curriculumBinding.path is not canonical.");
  if (map.curriculumBinding.sha256 !== sha256(curriculum)) issues.push("curriculumBinding.sha256 does not match the canonical curriculum bytes.");
  if (map.tutorialBinding.path !== "curriculum/math-quest-tutorial-manifest-v1.json") issues.push("tutorialBinding.path is not canonical.");
  if (map.tutorialBinding.sha256 !== sha256(tutorial)) issues.push("tutorialBinding.sha256 does not match the canonical tutorial bytes.");
  if (map.artDesignBinding.path !== "audit/art-design-decision-register-v1.json") issues.push("artDesignBinding.path is not canonical.");
  if (map.artDesignBinding.sha256 !== sha256(artDesign)) issues.push("artDesignBinding.sha256 does not match the canonical art-design decision bytes.");
  if (artDesign.themePolicy?.worldIdentity !== "MATHEMATICAL_CONSERVATORY_AND_WORKSHOP") issues.push("artDesignBinding does not resolve to the adopted Conservatory identity.");

  const invariantIds = map.invariants.map((record) => record.id);
  for (const duplicate of duplicateValues(invariantIds)) issues.push(`invariants repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(map.invariants.map((record) => record.predicate))) issues.push(`invariant predicate repeats ${duplicate}.`);
  const invariantSet = new Set(invariantIds);
  const proofKinds = map.proofKindCatalog.map((record) => record.kind);
  for (const duplicate of duplicateValues(proofKinds)) issues.push(`proofKindCatalog repeats ${duplicate}.`);
  if (canonicalizeJson(proofKinds) !== canonicalizeJson([...proofKinds].sort())) issues.push("proofKindCatalog must be sorted lexicographically by kind.");
  const proofKindSet = new Set(proofKinds);
  const tutorialPredicate = "TUTORIAL_V2_RESOLUTION_DISCLOSURE_PHASE_VISUAL_AND_RETURN_CONTRACT_HOLDS";
  if (map.proofKindCatalog.find((record) => record.kind === "tutorial")?.predicate !== tutorialPredicate) issues.push("tutorial proof kind must own the complete Tutorial V2 resolution, disclosure, phase-visual, and return contract.");
  if (map.invariants.find((record) => record.id === "LEG-08")?.predicate !== tutorialPredicate) issues.push("LEG-08 must own the complete Tutorial V2 resolution, disclosure, phase-visual, and return contract.");
  const proofGateIds = map.proofGateOwners.map((record) => record.gate);
  for (const duplicate of duplicateValues(proofGateIds)) issues.push(`proofGateOwners repeats ${duplicate}.`);
  if (canonicalizeJson(proofGateIds) !== canonicalizeJson([...proofGateIds].sort())) issues.push("proofGateOwners must be sorted lexicographically by gate.");
  if (canonicalizeJson(invariantIds) !== canonicalizeJson([...invariantIds].sort())) issues.push("invariants must be sorted lexicographically by id.");
  const proofGateSet = new Set(proofGateIds);
  const usedProofGates = new Set(map.features.flatMap((feature) => feature.proofs.map((proof) => proof.gate)));
  for (const gate of [...usedProofGates].sort()) if (!proofGateSet.has(gate)) issues.push(`proof gate ${gate} has no declared owner.`);
  for (const gate of [...proofGateSet].sort()) if (!usedProofGates.has(gate)) issues.push(`proof gate owner ${gate} is unused.`);
  for (const owner of map.proofGateOwners) {
    try {
      const ownerText = await readFile(path.join(root, ...owner.path.split("/")), "utf8");
      if (!ownerText.includes(owner.selector)) issues.push(`proof gate ${owner.gate} selector is absent from ${owner.path}.`);
    } catch {
      issues.push(`proof gate ${owner.gate} owner path is unreadable: ${owner.path}.`);
    }
  }
  const featureIds = map.features.map((record) => record.id);
  const methods = map.features.map((record) => record.inputMethod);
  for (const duplicate of duplicateValues(featureIds)) issues.push(`features repeats id ${duplicate}.`);
  for (const duplicate of duplicateValues(methods)) issues.push(`features repeats inputMethod ${duplicate}.`);

  const tutorialMethods = tutorial.methodBindings.map((record) => record.inputMethod);
  const tutorialFeatureIds = tutorial.methodBindings.map((record) => record.featureId);
  if (canonicalizeJson(methods) !== canonicalizeJson(tutorialMethods)) issues.push("features must exactly cover the tutorial input-method set in canonical order.");
  if (canonicalizeJson(featureIds) !== canonicalizeJson(tutorialFeatureIds)) issues.push("features must exactly cover the tutorial feature-id set in canonical order.");
  const tutorialByMethod = new Map(tutorial.methodBindings.map((record) => [record.inputMethod, record]));

  for (const feature of map.features) {
    const expectedId = featureIdForInputMethod(feature.inputMethod);
    if (feature.id !== expectedId) issues.push(`${feature.inputMethod} feature id must be ${expectedId}.`);
    const tutorialMethod = tutorialByMethod.get(feature.inputMethod);
    if (!tutorialMethod) continue;
    if (feature.tutorialFamilyId !== tutorialMethod.familyId) issues.push(`${feature.inputMethod} tutorialFamilyId does not match the tutorial manifest.`);
    if (feature.profileDrivenTutorial !== tutorialMethod.profileDriven) issues.push(`${feature.inputMethod} profileDrivenTutorial does not match the tutorial manifest.`);
    for (const invariant of feature.legibilityInvariants) if (!invariantSet.has(invariant)) issues.push(`${feature.inputMethod} references missing invariant ${invariant}.`);
    const featureProofKinds = feature.proofs.map((proof) => proof.kind);
    for (const duplicate of duplicateValues(featureProofKinds)) issues.push(`${feature.inputMethod} repeats proof kind ${duplicate}; proof keys must be unique.`);
    for (const proofKind of featureProofKinds) if (!proofKindSet.has(proofKind)) issues.push(`${feature.inputMethod} references unknown proof kind ${proofKind}.`);
    if (!feature.legibilityInvariants.includes("LEG-03")) issues.push(`${feature.inputMethod} must require reachable correct and incorrect responses through LEG-03.`);
    if (!feature.legibilityInvariants.includes("LEG-08")) issues.push(`${feature.inputMethod} must require tutorial linkage through LEG-08.`);
    if (!feature.proofs.some((proof) => proof.kind === "response_space")) issues.push(`${feature.inputMethod} requires an observable response_space proof.`);
    if (!feature.proofs.some((proof) => proof.kind === "human_legibility")) issues.push(`${feature.inputMethod} requires a human_legibility proof.`);
  }

  const special = new Map(map.features.map((record) => [record.inputMethod, new Set(record.legibilityInvariants)]));
  for (const invariant of ["LEG-01", "LEG-05", "LEG-09"]) if (!special.get("ACTION_SCENE")?.has(invariant)) issues.push(`ACTION_SCENE must require ${invariant}.`);
  if (!special.get("PATTERN_BUILD")?.has("LEG-02")) issues.push("PATTERN_BUILD must require LEG-02 representation alignment.");
  if (!special.get("SHARE_DEAL")?.has("LEG-06")) issues.push("SHARE_DEAL must require LEG-06 balanced sharing layout.");

  return Object.freeze(issues);
}

export async function loadFeatureMap(pathOrUrl, options = {}) {
  const map = JSON.parse(await readFile(pathOrUrl, "utf8"));
  const issues = await validateFeatureMap(map, options);
  if (issues.length) throw new Error(`Invalid feature map:\n- ${issues.join("\n- ")}`);
  return Object.freeze(map);
}
