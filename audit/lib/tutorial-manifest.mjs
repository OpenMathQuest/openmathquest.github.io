import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalizeJson, manifestArtifact } from "./curriculum-manifest.mjs";
import { AI_READER_CONTRACT_REF } from "./repository-code-map.mjs";

export const TUTORIAL_PATH = "curriculum/math-quest-tutorial-manifest-v1.json";
export const TUTORIAL_SCHEMA_PATH = "audit/schemas/tutorial-manifest-v1.schema.json";
export const TUTORIAL_PROJECTION_VERSION = "tutorial-curriculum-projection-v1";
export const TUTORIAL_FEATURE_INVENTORY_VERSION = "tutorial-feature-inventory-v1";
export const TUTORIAL_FEATURE_SEED = 1297175628;
export const TUTORIAL_FEATURE_ORDINALS = 32;

function canonicalSha256(value) {
  return createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
}

export function tutorialFeatureIdForInputMethod(inputMethod) {
  return `child.mechanic.${String(inputMethod || "").toLowerCase().replace(/_/gu, "-")}`;
}

export function tutorialFeatureInventory(engine) {
  if (!engine || !Array.isArray(engine.SKILLS) || typeof engine.makeQuestion !== "function") {
    throw new TypeError("The shipped engine is required for tutorial feature inventory.");
  }
  const rows = new Map();
  for (const skill of engine.SKILLS) {
    for (const tier of ["EASY", "HARD/TARGET"]) {
      for (const representation of ["CONCRETE", "PICTORIAL", "ABSTRACT"]) {
        for (const theme of ["ocean", "forest", "space"]) {
          for (let ordinal = 0; ordinal < TUTORIAL_FEATURE_ORDINALS; ordinal += 1) {
            const question = engine.makeQuestion({
              skillId: skill.skillId,
              tier,
              representation,
              theme,
              seed: TUTORIAL_FEATURE_SEED,
              ordinal,
              eligibleQuestionOrdinal: ordinal,
              scheduledReview: false,
              coldTest: false,
              preview: true,
              scaffolded: true,
            });
            const row = {
              generatorProfile: skill.generatorProfile,
              inputMethod: question.inputMethod,
              semanticPromptStringId: question.semanticPromptStringId,
            };
            rows.set(`${row.generatorProfile}|${row.inputMethod}|${row.semanticPromptStringId}`, Object.freeze(row));
          }
        }
      }
    }
  }
  return Object.freeze([...rows.values()].sort((left, right) => canonicalizeJson(left).localeCompare(canonicalizeJson(right), "en")));
}

export function tutorialCurriculumProjection(curriculum) {
  if (!curriculum || !Array.isArray(curriculum.skills)) throw new TypeError("A validated curriculum manifest is required.");
  return Object.freeze(curriculum.skills.map((skill) => Object.freeze({
    skillId: skill.id,
    level: skill.level,
    generatorProfile: skill.generatorProfile,
    taskTypes: Object.freeze([...(skill.assessment?.requiredTaskTypes ?? [])]),
  })));
}

export function tutorialCurriculumProjectionArtifact(curriculum) {
  const projection = tutorialCurriculumProjection(curriculum);
  const canonical = canonicalizeJson(projection);
  return Object.freeze({
    projection,
    canonical,
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
    skillCount: projection.length,
    taskObligationCount: projection.reduce((sum, skill) => sum + skill.taskTypes.length, 0),
  });
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

function exactSet(actual, expected) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function ajvIssue(error) {
  const location = error.instancePath || "/";
  return `${location} ${error.message ?? "is invalid"}`;
}

export async function validateTutorialManifestSchema(manifest, schemaPathOrUrl = new URL("../schemas/tutorial-manifest-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(manifest);
  return Object.freeze(valid ? [] : (validate.errors ?? []).map(ajvIssue));
}

export async function validateTutorialManifest(manifest, {
  curriculumArtifact,
  artDesign,
  questionGeneratorContractVersion,
  inputMethods,
  featureInventory = null,
  childStringIds = null,
  schemaPathOrUrl,
} = {}) {
  const issues = [...await validateTutorialManifestSchema(manifest, schemaPathOrUrl)];
  if (issues.length || !curriculumArtifact?.manifest || !artDesign) {
    return Object.freeze(issues.length ? issues : ["Validated curriculum and art-design decision manifests are required."]);
  }

  if (canonicalizeJson(manifest.aiReaderContractRef) !== canonicalizeJson(AI_READER_CONTRACT_REF)) issues.push("aiReaderContractRef does not match the repository AI-reader authority.");

  if (manifest.artDesignBinding.path !== "audit/art-design-decision-register-v1.json") issues.push("artDesignBinding.path is not canonical.");
  if (manifest.artDesignBinding.sha256 !== canonicalSha256(artDesign)) issues.push("artDesignBinding.sha256 does not match the canonical art-design decision bytes.");
  if (artDesign.themePolicy?.worldIdentity !== "MATHEMATICAL_CONSERVATORY_AND_WORKSHOP") issues.push("artDesignBinding does not resolve to the adopted Conservatory identity.");

  const projection = tutorialCurriculumProjectionArtifact(curriculumArtifact.manifest);
  const binding = manifest.curriculumBinding;
  if (binding.manifestId !== curriculumArtifact.manifest.manifestId) issues.push("curriculumBinding.manifestId does not match the curriculum.");
  if (binding.manifestVersion !== curriculumArtifact.manifest.version) issues.push("curriculumBinding.manifestVersion does not match the curriculum.");
  if (binding.manifestSha256 !== curriculumArtifact.sha256) issues.push("curriculumBinding.manifestSha256 does not match the curriculum bytes.");
  if (binding.projectionVersion !== TUTORIAL_PROJECTION_VERSION) issues.push("curriculumBinding.projectionVersion is not supported.");
  if (binding.projectionSha256 !== projection.sha256) issues.push("curriculumBinding.projectionSha256 does not match the live skill, level, profile, and task map.");
  if (binding.skillCount !== projection.skillCount) issues.push("curriculumBinding.skillCount does not match the live curriculum.");
  if (binding.taskObligationCount !== projection.taskObligationCount) issues.push("curriculumBinding.taskObligationCount does not match the live curriculum.");
  if (manifest.questionGeneratorContractVersion !== questionGeneratorContractVersion) issues.push("questionGeneratorContractVersion does not match the live engine.");

  const expectedPhaseIds = ["NOTICE", "PLAN", "CHECK"];
  const phaseIds = manifest.phaseCatalog.map((record) => record.phaseId);
  if (canonicalizeJson(phaseIds) !== canonicalizeJson(expectedPhaseIds)) issues.push("phaseCatalog must be the exact ordered NOTICE, PLAN, CHECK sequence.");
  if (manifest.phaseCatalog.some((record, index) => record.step !== index + 1)) issues.push("phaseCatalog steps must be exactly 1, 2, 3.");

  const anchorIds = manifest.visualAnchorCatalog.map((record) => record.anchorRoleId);
  for (const duplicate of duplicateValues(anchorIds)) issues.push(`visualAnchorCatalog repeats ${duplicate}.`);
  if (canonicalizeJson(anchorIds) !== canonicalizeJson([...anchorIds].sort())) issues.push("visualAnchorCatalog must be sorted by anchorRoleId.");
  const anchorSet = new Set(anchorIds);

  const cueIds = manifest.visualCueCatalog.map((record) => record.cueId);
  for (const duplicate of duplicateValues(cueIds)) issues.push(`visualCueCatalog repeats ${duplicate}.`);
  if (canonicalizeJson(cueIds) !== canonicalizeJson([...cueIds].sort())) issues.push("visualCueCatalog must be sorted by cueId.");
  const cueSet = new Set(cueIds);

  const familyIds = manifest.tutorialFamilies.map((record) => record.familyId);
  for (const duplicate of duplicateValues(familyIds)) issues.push(`tutorialFamilies repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(manifest.tutorialFamilies.map((record) => record.visualTeachingContractId))) issues.push(`tutorialFamilies repeats visualTeachingContractId ${duplicate}.`);
  const familySet = new Set(familyIds);
  if (canonicalizeJson(familyIds) !== canonicalizeJson([...familyIds].sort())) issues.push("tutorialFamilies must be sorted by familyId.");
  for (const family of manifest.tutorialFamilies) {
    const familyPhases = family.phaseBindings.map((record) => record.phaseId);
    if (canonicalizeJson(familyPhases) !== canonicalizeJson(expectedPhaseIds)) issues.push(`${family.familyId}.phaseBindings must be the exact ordered NOTICE, PLAN, CHECK sequence.`);
    for (const phase of family.phaseBindings) {
      for (const anchorRoleId of phase.anchorRoleIds) if (!anchorSet.has(anchorRoleId)) issues.push(`${family.familyId}.${phase.phaseId} references unknown anchor ${anchorRoleId}.`);
      for (const cueId of phase.visualCueIds) if (!cueSet.has(cueId)) issues.push(`${family.familyId}.${phase.phaseId} references unknown cue ${cueId}.`);
    }
  }

  const methodIds = manifest.methodBindings.map((record) => record.inputMethod);
  const methodFeatureIds = manifest.methodBindings.map((record) => record.featureId);
  for (const duplicate of duplicateValues(methodIds)) issues.push(`methodBindings repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(methodFeatureIds)) issues.push(`methodBindings repeats featureId ${duplicate}.`);
  if (canonicalizeJson(methodIds) !== canonicalizeJson([...methodIds].sort())) issues.push("methodBindings must be sorted by inputMethod.");
  if (Array.isArray(inputMethods) && !exactSet(methodIds, inputMethods)) issues.push("methodBindings must exactly cover the live input-method set.");
  for (const bindingRecord of manifest.methodBindings) {
    if (bindingRecord.featureId !== tutorialFeatureIdForInputMethod(bindingRecord.inputMethod)) issues.push(`${bindingRecord.inputMethod} has a stale featureId.`);
    if (bindingRecord.profileDriven && bindingRecord.familyId !== null) issues.push(`${bindingRecord.inputMethod} must use a null familyId when profileDriven is true.`);
    if (!bindingRecord.profileDriven && !familySet.has(bindingRecord.familyId)) issues.push(`${bindingRecord.inputMethod} references an unknown tutorial family.`);
  }

  const profileIds = manifest.profileBindings.map((record) => record.generatorProfile);
  for (const duplicate of duplicateValues(profileIds)) issues.push(`profileBindings repeats ${duplicate}.`);
  if (canonicalizeJson(profileIds) !== canonicalizeJson([...profileIds].sort())) issues.push("profileBindings must be sorted by generatorProfile.");
  if (!exactSet(profileIds, curriculumArtifact.manifest.generatorProfileEnum)) issues.push("profileBindings must exactly cover the live generator-profile set.");
  for (const profile of manifest.profileBindings) {
    if (!familySet.has(profile.familyId)) issues.push(`${profile.generatorProfile} references an unknown tutorial family.`);
  }

  const features = manifest.featureBindings;
  const featureKeys = features.map((record) => `${record.generatorProfile}|${record.inputMethod}|${record.semanticPromptStringId}`);
  for (const duplicate of duplicateValues(featureKeys)) issues.push(`featureBindings repeats ${duplicate}.`);
  if (canonicalizeJson(features) !== canonicalizeJson([...features].sort((left, right) => canonicalizeJson(left).localeCompare(canonicalizeJson(right), "en")))) issues.push("featureBindings must be sorted canonically.");
  if (Array.isArray(featureInventory) && canonicalizeJson(features) !== canonicalizeJson(featureInventory)) issues.push("featureBindings must exactly cover the generated profile, method, and semantic-prompt feature set.");
  const methods = new Set(methodIds), profilesSet = new Set(profileIds);
  for (const feature of features) {
    if (!methods.has(feature.inputMethod)) issues.push(`${feature.semanticPromptStringId} references unknown input method ${feature.inputMethod}.`);
    if (!profilesSet.has(feature.generatorProfile)) issues.push(`${feature.semanticPromptStringId} references unknown generator profile ${feature.generatorProfile}.`);
  }

  const liveObligations = projection.projection.flatMap((skill) => skill.taskTypes.map((taskType) => `${skill.skillId}|${taskType}`)).sort();
  const obligationKeys = manifest.obligationBindings.map((record) => `${record.skillId}|${record.taskType}`);
  for (const duplicate of duplicateValues(obligationKeys)) issues.push(`obligationBindings repeats ${duplicate}.`);
  if (canonicalizeJson(obligationKeys) !== canonicalizeJson([...obligationKeys].sort())) issues.push("obligationBindings must be sorted by skillId then taskType.");
  if (!exactSet(obligationKeys, liveObligations)) issues.push("obligationBindings must exactly cover the live 166 skill/task obligations.");
  const taskTypesBySkill = new Map(projection.projection.map((skill) => [skill.skillId, new Set(skill.taskTypes)]));
  for (const bindingRecord of manifest.obligationBindings) {
    const tasks = taskTypesBySkill.get(bindingRecord.skillId);
    if (!tasks?.has(bindingRecord.taskType)) issues.push(`${bindingRecord.skillId}/${bindingRecord.taskType} is not a live obligation.`);
    if (bindingRecord.resolutionMode === "SIBLING_TASK_DIFFERENT_ANSWER" && (!tasks?.has(bindingRecord.siblingTaskType) || bindingRecord.siblingTaskType === bindingRecord.taskType)) issues.push(`${bindingRecord.skillId}/${bindingRecord.taskType} has an invalid sibling task.`);
  }
  const resolutionCounts = Object.fromEntries(["SAME_TASK_DIFFERENT_ANSWER", "SIBLING_TASK_DIFFERENT_ANSWER", "PROCEDURE_ONLY"].map((mode) => [mode, manifest.obligationBindings.filter((record) => record.resolutionMode === mode).length]));
  if (canonicalizeJson(resolutionCounts) !== canonicalizeJson({ SAME_TASK_DIFFERENT_ANSWER: 149, SIBLING_TASK_DIFFERENT_ANSWER: 5, PROCEDURE_ONLY: 12 })) issues.push("obligationBindings must preserve the owner-approved 149 same-task / 5 sibling-task / 12 procedure-only resolution split.");
  const siblingBindings = manifest.obligationBindings.filter((record) => record.resolutionMode === "SIBLING_TASK_DIFFERENT_ANSWER");
  if (siblingBindings.some((record) => record.skillId !== "MQ-048" || record.compatibilityContractId !== "MQ048_TOKEN_VALUE_LOOKUP")) issues.push("Sibling-task resolution is approved only for the five MQ-048 token-value obligations.");

  if (childStringIds) {
    const available = new Set(childStringIds);
    for (const phase of manifest.phaseCatalog) if (!available.has(phase.labelStringId)) issues.push(`${phase.phaseId} references missing child string ${phase.labelStringId}.`);
    for (const family of manifest.tutorialFamilies) {
      for (const key of ["noticeStringId", "planStringId", "checkStringId"]) {
        if (!available.has(family[key])) issues.push(`${family.familyId}.${key} references missing child string ${family[key]}.`);
      }
    }
  }

  return Object.freeze(issues);
}

export async function loadTutorialManifest(pathOrUrl, options = {}) {
  const text = await readFile(pathOrUrl, "utf8");
  const manifest = JSON.parse(text);
  const issues = await validateTutorialManifest(manifest, options);
  if (issues.length) throw new Error(`Invalid tutorial manifest:\n- ${issues.join("\n- ")}`);
  return Object.freeze({ manifest, ...manifestArtifact(manifest) });
}
