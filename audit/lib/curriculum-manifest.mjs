import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const CURRICULUM_PATH = "curriculum/math-quest-manifest-v1.json";

const ALLOWED_PHASES = Object.freeze(["C", "P", "A"]);
const ALLOWED_ROLES = Object.freeze(["GATEWAY", "SUPPORTING"]);
const EXPECTED_COUNTS = Object.freeze({ bands: 7, levels: 21, skills: 126, skillsPerLevel: 6 });
const CLOSED_KEYS = Object.freeze({
  root: Object.freeze([
    "manifestId", "version", "schemaVersion", "locale", "localization", "licence",
    "authorshipMethod", "localizationReview", "counts", "strandEnum", "phaseLegend",
    "representationEnum", "familyEnum", "generatorProfileEnum", "constraintSchema",
    "constraintConventions", "taskTypePolicy", "bands", "levels", "designRationales",
    "sources", "benchmarkIndex", "skills",
  ]),
  localization: Object.freeze(["language", "region", "gradeSpan", "currency", "currencyMinorUnit", "measurementSystem"]),
  licence: Object.freeze(["spdx", "scope", "originalManifest", "benchmarkAdaptationNotices", "thirdPartyMarksExcluded"]),
  authorshipMethod: Object.freeze(["method", "summary", "levelChoice", "skillChoice", "wordingPolicy", "excludedInputs"]),
  localizationReview: Object.freeze(["status", "normativeBenchmark", "rule", "bandSources", "contextSources"]),
  counts: Object.freeze(["bands", "levels", "skills", "skillsPerLevel"]),
  phaseLegend: Object.freeze(["C", "P", "A"]),
  constraintSchema: Object.freeze(["version", "closed", "keyTypes"]),
  constraintConventions: Object.freeze([
    "numberPolicy", "operationPolicy", "unitPolicy", "currencyPolicy",
    "displayPolicy", "geometryPolicy", "rule",
  ]),
  constraintConvention: Object.freeze(["keys", "valueTypes"]),
  taskTypePolicy: Object.freeze(["version", "rule"]),
  band: Object.freeze(["id", "title", "purpose"]),
  level: Object.freeze(["number", "id", "band", "title", "purpose", "skillRange"]),
  rationale: Object.freeze(["id", "claim"]),
  source: Object.freeze(["id", "title", "publisher", "edition", "url", "accessed", "licence", "use", "sha256"]),
  benchmark: Object.freeze(["id", "sourceId", "section"]),
  skill: Object.freeze([
    "id", "level", "band", "strand", "title", "objective", "masteryRole",
    "prerequisites", "phases", "representation", "family", "generatorProfile",
    "constraints", "rationaleId", "benchmarkIds", "assessment",
  ]),
  assessment: Object.freeze(["version", "masteryPolicy", "requiredTaskTypes"]),
});

const REQUIRED_SOURCE_KEYS = Object.freeze(CLOSED_KEYS.source.filter((key) => key !== "sha256"));

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function closedObject(value, allowed, required, name, issues) {
  if (!plainObject(value)) {
    issues.push(`${name} must be an object.`);
    return false;
  }
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length) issues.push(`${name} contains unknown field(s): ${unknown.join(", ")}.`);
  if (missing.length) issues.push(`${name} is missing required field(s): ${missing.join(", ")}.`);
  return unknown.length === 0 && missing.length === 0;
}

function nonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function constraintType(value) {
  if (Array.isArray(value)) {
    const itemTypes = [...new Set(value.map((item) => {
      if (Array.isArray(item)) return "array";
      if (item === null) return "null";
      return typeof item;
    }))].sort();
    return `array:${itemTypes.join("|") || "empty"}`;
  }
  if (value === null) return "null";
  return typeof value;
}

function stringEnum(value, name, issues) {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !item)) {
    issues.push(`${name} must be a non-empty string array.`);
    return new Set();
  }
  const result = new Set(value);
  if (result.size !== value.length) issues.push(`${name} must not contain duplicates.`);
  return result;
}

// The manifest is limited to JSON-compatible data. Sorting object keys and
// using ECMAScript JSON number/string serialization produces RFC 8785 JCS
// bytes for this data domain.
export function canonicalizeJson(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(",")}}`;
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  throw new TypeError(`Manifest contains a non-JSON value of type ${typeof value}.`);
}

export function manifestArtifact(manifest) {
  const canonical = canonicalizeJson(manifest);
  return Object.freeze({
    canonical,
    bytes: Buffer.from(canonical, "utf8"),
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
  });
}

function validateManifestIdentity(manifest, issues) {
  closedObject(manifest, CLOSED_KEYS.root, CLOSED_KEYS.root, "Manifest root", issues);
  if (manifest.manifestId !== "math-quest-curriculum") issues.push("manifestId must be math-quest-curriculum.");
  if (!/^1\.\d+\.\d+$/u.test(String(manifest.version ?? ""))) issues.push("version must be a 1.x semantic version.");
  if (manifest.schemaVersion !== 1) issues.push("schemaVersion must be 1.");
  if (manifest.locale !== "en-CA") issues.push("locale must be en-CA.");
}

function validateManifestLocalization(manifest, issues) {
  closedObject(manifest.localization, CLOSED_KEYS.localization, CLOSED_KEYS.localization, "localization", issues);
  if (plainObject(manifest.localization)) {
    for (const key of CLOSED_KEYS.localization) {
      if (!nonEmptyString(manifest.localization[key])) issues.push(`localization.${key} must be a non-empty string.`);
    }
  }
}

function validateManifestLicence(manifest, issues) {
  closedObject(manifest.licence, CLOSED_KEYS.licence, CLOSED_KEYS.licence, "licence", issues);
  if (plainObject(manifest.licence)) {
    if (!nonEmptyString(manifest.licence.spdx)) issues.push("licence.spdx is required.");
    if (!nonEmptyString(manifest.licence.scope)) issues.push("licence.scope is required.");
    if (!nonEmptyString(manifest.licence.originalManifest)) issues.push("licence.originalManifest is required.");
    if (!Array.isArray(manifest.licence.benchmarkAdaptationNotices) || manifest.licence.benchmarkAdaptationNotices.some((item) => !nonEmptyString(item))) {
      issues.push("licence.benchmarkAdaptationNotices must be a string array.");
    }
    if (typeof manifest.licence.thirdPartyMarksExcluded !== "boolean") issues.push("licence.thirdPartyMarksExcluded must be boolean.");
  }
}

function validateManifestAuthorship(manifest, issues) {
  closedObject(manifest.authorshipMethod, CLOSED_KEYS.authorshipMethod, CLOSED_KEYS.authorshipMethod, "authorshipMethod", issues);
  if (plainObject(manifest.authorshipMethod)) {
    for (const key of CLOSED_KEYS.authorshipMethod.filter((key) => key !== "excludedInputs")) {
      if (!nonEmptyString(manifest.authorshipMethod[key])) issues.push(`authorshipMethod.${key} must be a non-empty string.`);
    }
    if (!Array.isArray(manifest.authorshipMethod.excludedInputs) || !manifest.authorshipMethod.excludedInputs.length || manifest.authorshipMethod.excludedInputs.some((item) => !nonEmptyString(item))) {
      issues.push("authorshipMethod.excludedInputs must be a non-empty string array.");
    }
  }
}

function validateManifestLocalizationReview(manifest, issues) {
  closedObject(manifest.localizationReview, CLOSED_KEYS.localizationReview, CLOSED_KEYS.localizationReview, "localizationReview", issues);
  if (plainObject(manifest.localizationReview)) {
    if (!nonEmptyString(manifest.localizationReview.status) || typeof manifest.localizationReview.normativeBenchmark !== "boolean" || !nonEmptyString(manifest.localizationReview.rule)) {
      issues.push("localizationReview status, normativeBenchmark, and rule are invalid.");
    }
    if (!plainObject(manifest.localizationReview.bandSources)) issues.push("localizationReview.bandSources must be an object.");
    if (!Array.isArray(manifest.localizationReview.contextSources) || manifest.localizationReview.contextSources.some((item) => !nonEmptyString(item))) {
      issues.push("localizationReview.contextSources must be a string array.");
    }
  }
}

function validateManifestPhaseLegend(manifest, issues) {
  closedObject(manifest.phaseLegend, CLOSED_KEYS.phaseLegend, CLOSED_KEYS.phaseLegend, "phaseLegend", issues);
  if (plainObject(manifest.phaseLegend) && CLOSED_KEYS.phaseLegend.some((key) => !nonEmptyString(manifest.phaseLegend[key]))) {
    issues.push("phaseLegend values must be non-empty strings.");
  }
}

function validateConstraintConvention(policy, key, issues) {
  closedObject(policy, CLOSED_KEYS.constraintConvention, CLOSED_KEYS.constraintConvention, `constraintConventions.${key}`, issues);
  if (plainObject(policy) && (
    !Array.isArray(policy.keys)
    || !policy.keys.length
    || policy.keys.some((item) => !nonEmptyString(item))
    || !Array.isArray(policy.valueTypes)
    || !policy.valueTypes.length
    || policy.valueTypes.some((item) => !nonEmptyString(item))
  )) issues.push(`constraintConventions.${key} must declare non-empty keys and valueTypes string arrays.`);
}

function validateManifestConstraintConventions(manifest, issues) {
  closedObject(manifest.constraintConventions, CLOSED_KEYS.constraintConventions, CLOSED_KEYS.constraintConventions, "constraintConventions", issues);
  if (plainObject(manifest.constraintConventions)) {
    if (!nonEmptyString(manifest.constraintConventions.rule)) issues.push("constraintConventions.rule must be a non-empty string.");
    for (const key of CLOSED_KEYS.constraintConventions.filter((item) => item !== "rule")) {
      validateConstraintConvention(manifest.constraintConventions[key], key, issues);
    }
  }
}

function validateManifestCollections(manifest, issues) {
  for (const key of ["bands", "levels", "skills", "sources", "designRationales", "benchmarkIndex"]) {
    if (!Array.isArray(manifest[key]) || !manifest[key].length) issues.push(`${key} must be a non-empty array.`);
  }
}

function validateManifestCounts(manifest, issues) {
  closedObject(manifest.counts, CLOSED_KEYS.counts, CLOSED_KEYS.counts, "counts", issues);
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (manifest.counts?.[key] !== expected) issues.push(`counts.${key} must be ${expected}.`);
  }
  if (manifest.bands.length !== EXPECTED_COUNTS.bands) issues.push(`Manifest must contain exactly ${EXPECTED_COUNTS.bands} bands.`);
  if (manifest.levels.length !== EXPECTED_COUNTS.levels) issues.push(`Manifest must contain exactly ${EXPECTED_COUNTS.levels} levels.`);
  if (manifest.skills.length !== EXPECTED_COUNTS.skills) issues.push(`Manifest must contain exactly ${EXPECTED_COUNTS.skills} skills.`);
}

function manifestEnumSets(manifest, issues) {
  const allowedStrands = stringEnum(manifest.strandEnum, "strandEnum", issues);
  const allowedProfiles = stringEnum(manifest.generatorProfileEnum, "generatorProfileEnum", issues);
  const allowedRepresentations = stringEnum(manifest.representationEnum, "representationEnum", issues);
  const allowedFamilies = stringEnum(manifest.familyEnum, "familyEnum", issues);
  if (allowedStrands.size !== 6) issues.push("strandEnum must contain exactly six strands.");
  return { allowedStrands, allowedProfiles, allowedRepresentations, allowedFamilies };
}

function validateRationaleIds(manifest, issues) {
  const rationaleIds = new Set(manifest.designRationales.map((item) => item?.id));
  if (!Array.isArray(manifest.designRationales) || !manifest.designRationales.length || rationaleIds.has(undefined)) {
    issues.push("designRationales must contain identified rationale records.");
  }
  if (rationaleIds.size !== (manifest.designRationales ?? []).length) issues.push("designRationales must not repeat ids.");
  return rationaleIds;
}

function validateTaskTypePolicy(manifest, issues) {
  closedObject(manifest.taskTypePolicy, CLOSED_KEYS.taskTypePolicy, CLOSED_KEYS.taskTypePolicy, "taskTypePolicy", issues);
  if (!plainObject(manifest.taskTypePolicy) || manifest.taskTypePolicy.version !== 1 || typeof manifest.taskTypePolicy.rule !== "string" || !manifest.taskTypePolicy.rule.trim()) {
    issues.push("taskTypePolicy must be a documented version-1 policy.");
  }
}

function validateConstraintSchemaDefinition(schema, constraintKeyTypes, issues) {
  closedObject(schema, CLOSED_KEYS.constraintSchema, CLOSED_KEYS.constraintSchema, "constraintSchema", issues);
  if (!plainObject(schema) || schema.version !== 1 || schema.closed !== true || !plainObject(constraintKeyTypes)) {
    issues.push("constraintSchema must be a closed version-1 keyTypes registry.");
  }
}

function validateConstraintTypeDeclaration(key, types, issues) {
  if (!/^[a-z][A-Za-z0-9]*$/u.test(key)) issues.push(`constraintSchema contains invalid key ${key}.`);
  if (!Array.isArray(types) || !types.length || types.some((type) => typeof type !== "string" || !type)) issues.push(`constraintSchema.${key} must list allowed value types.`);
}

function manifestConstraintRegistry(manifest, issues) {
  const constraintKeyTypes = manifest.constraintSchema?.keyTypes;
  validateConstraintSchemaDefinition(manifest.constraintSchema, constraintKeyTypes, issues);
  const registeredConstraintKeys = new Set(Object.keys(constraintKeyTypes ?? {}));
  for (const [key, types] of Object.entries(constraintKeyTypes ?? {})) validateConstraintTypeDeclaration(key, types, issues);
  return { constraintKeyTypes, registeredConstraintKeys };
}

function validateManifestBands(manifest, issues) {
  const bandIds = new Set();
  for (const [index, band] of manifest.bands.entries()) {
    closedObject(band, CLOSED_KEYS.band, CLOSED_KEYS.band, `Band ${index + 1}`, issues);
    if (!plainObject(band) || !/^[A-Z][A-Z0-9_]*$/u.test(String(band.id ?? ""))) issues.push(`Band ${index + 1} has an invalid id.`);
    else if (bandIds.has(band.id)) issues.push(`Duplicate band id ${band.id}.`);
    else bandIds.add(band.id);
    if (!nonEmptyString(band.title)) issues.push(`Band ${band.id ?? index + 1} needs a title.`);
    if (!nonEmptyString(band.purpose)) issues.push(`Band ${band.id ?? index + 1} needs a purpose.`);
  }
  return bandIds;
}

function validateBandSourceDeclarations(manifest, bandIds, issues) {
  if (plainObject(manifest.localizationReview?.bandSources)) {
    const declaredBandIds = [...bandIds];
    closedObject(
      manifest.localizationReview.bandSources,
      declaredBandIds,
      declaredBandIds,
      "localizationReview.bandSources",
      issues,
    );
    for (const [bandId, sourceIds] of Object.entries(manifest.localizationReview.bandSources)) {
      if (!Array.isArray(sourceIds) || sourceIds.some((item) => !nonEmptyString(item))) {
        issues.push(`localizationReview.bandSources.${bandId} must be a string array.`);
      }
    }
  }
}

function validateLevelIdentity(level, index, context, issues) {
  const { bandIds, levelNumbers } = context;
  const expected = index + 1;
  closedObject(level, CLOSED_KEYS.level, CLOSED_KEYS.level, `Level ${expected}`, issues);
  if (!plainObject(level) || level.number !== expected) issues.push(`Level at index ${index} must have number ${expected}.`);
  else levelNumbers.add(level.number);
  if (level?.id !== `L${String(expected).padStart(2, "0")}`) issues.push(`Level ${expected} must use id L${String(expected).padStart(2, "0")}.`);
  if (!bandIds.has(level?.band)) issues.push(`Level ${expected} references unknown band ${level?.band}.`);
}

function validateLevelDescription(level, index, issues) {
  const expected = index + 1;
  if (!nonEmptyString(level?.title)) issues.push(`Level ${expected} needs a title.`);
  if (!nonEmptyString(level?.purpose)) issues.push(`Level ${expected} needs a purpose.`);
}

function validateLevelSkillRange(level, index, issues) {
  const expected = index + 1;
  const expectedFirst = `MQ-${String(index * EXPECTED_COUNTS.skillsPerLevel + 1).padStart(3, "0")}`;
  const expectedLast = `MQ-${String((index + 1) * EXPECTED_COUNTS.skillsPerLevel).padStart(3, "0")}`;
  if (!Array.isArray(level?.skillRange) || level.skillRange.length !== 2 || level.skillRange[0] !== expectedFirst || level.skillRange[1] !== expectedLast) {
    issues.push(`Level ${expected} skillRange must be ${expectedFirst} through ${expectedLast}.`);
  }
}

function validateManifestLevels(manifest, bandIds, issues) {
  const levelNumbers = new Set();
  const context = { bandIds, levelNumbers };
  for (const [index, level] of manifest.levels.entries()) {
    validateLevelIdentity(level, index, context, issues);
    validateLevelDescription(level, index, issues);
    validateLevelSkillRange(level, index, issues);
  }
  return levelNumbers;
}

function validateSkillIdentity(skill, index, skillsById, issues) {
  const expectedId = `MQ-${String(index + 1).padStart(3, "0")}`;
  closedObject(skill, CLOSED_KEYS.skill, CLOSED_KEYS.skill, skill.id || `Skill ${index + 1}`, issues);
  if (skill.id !== expectedId) issues.push(`Skill at index ${index} must use sequential id ${expectedId}.`);
  if (skillsById.has(skill.id)) issues.push(`Duplicate skill id ${skill.id}.`);
  else skillsById.set(skill.id, { skill, index });
}

function validateSkillPlacement(skill, context, issues) {
  const { manifest, levelNumbers, bandIds, allowedStrands } = context;
  if (!levelNumbers.has(skill.level)) issues.push(`${skill.id} references unknown level ${skill.level}.`);
  if (!bandIds.has(skill.band)) issues.push(`${skill.id} references unknown band ${skill.band}.`);
  const owningLevel = manifest.levels[Number(skill.level) - 1];
  if (owningLevel && owningLevel.band !== skill.band) issues.push(`${skill.id} band does not match its level.`);
  if (!allowedStrands.has(skill.strand)) issues.push(`${skill.id} has an invalid strand.`);
  if (!nonEmptyString(skill.title)) issues.push(`${skill.id} needs a title.`);
  if (!nonEmptyString(skill.objective)) issues.push(`${skill.id} needs an objective.`);
}

function validateSkillPhases(skill, issues) {
  if (!Array.isArray(skill.phases) || !skill.phases.length || skill.phases.some((phase) => !ALLOWED_PHASES.includes(phase))) {
    issues.push(`${skill.id} has invalid phases.`);
  } else {
    const phaseIndexes = skill.phases.map((phase) => ALLOWED_PHASES.indexOf(phase));
    if (new Set(skill.phases).size !== skill.phases.length || phaseIndexes.some((phaseIndex, phasePosition) => phasePosition > 0 && phaseIndex <= phaseIndexes[phasePosition - 1])) {
      issues.push(`${skill.id} phases must be unique and ordered C, P, A.`);
    }
  }
}

function validateSkillLearningModes(skill, context, issues) {
  const { levelGateways, allowedRepresentations, allowedFamilies, allowedProfiles } = context;
  if (!ALLOWED_ROLES.includes(skill.masteryRole)) issues.push(`${skill.id} has invalid masteryRole ${skill.masteryRole}.`);
  else if (skill.masteryRole === "GATEWAY") levelGateways.set(skill.level, (levelGateways.get(skill.level) ?? 0) + 1);
  if (!Array.isArray(skill.prerequisites)) issues.push(`${skill.id} prerequisites must be an array.`);
  validateSkillPhases(skill, issues);
  if (!allowedRepresentations.has(skill.representation)) issues.push(`${skill.id} has an invalid representation.`);
  if (!allowedFamilies.has(skill.family)) issues.push(`${skill.id} has invalid family ${skill.family}.`);
  if (!allowedProfiles.has(skill.generatorProfile)) issues.push(`${skill.id} has invalid generatorProfile.`);
}

function validateSkillConstraints(skill, context, issues) {
  const { usedConstraintKeys, registeredConstraintKeys, constraintKeyTypes } = context;
  if (!plainObject(skill.constraints)) issues.push(`${skill.id} constraints must be an object.`);
  else {
    for (const [key, value] of Object.entries(skill.constraints)) {
      usedConstraintKeys.add(key);
      if (!registeredConstraintKeys.has(key)) {
        issues.push(`${skill.id} uses unregistered constraint ${key}.`);
        continue;
      }
      const actualType = constraintType(value);
      if (!constraintKeyTypes[key].includes(actualType)) issues.push(`${skill.id} constraint ${key} has type ${actualType}, expected ${constraintKeyTypes[key].join(" or ")}.`);
    }
  }
}

function validateSkillTaskTypes(skill, issues) {
  const taskTypes = skill.constraints?.taskTypes;
  if (!Array.isArray(taskTypes) || !taskTypes.length || taskTypes.some((taskType) => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(String(taskType)))) {
    issues.push(`${skill.id} must declare one or more valid constraints.taskTypes.`);
  } else if (new Set(taskTypes).size !== taskTypes.length) {
    issues.push(`${skill.id} repeats a constraints.taskTypes value.`);
  }
  return taskTypes;
}

function validateSkillAssessment(skill, taskTypes, issues) {
  const requiredTaskTypes = skill.assessment?.requiredTaskTypes;
  closedObject(skill.assessment, CLOSED_KEYS.assessment, CLOSED_KEYS.assessment, `${skill.id}.assessment`, issues);
  if (!plainObject(skill.assessment) || skill.assessment.version !== 1 || skill.assessment.masteryPolicy !== "one-clean-evidentiary-witness-per-task-type") {
    issues.push(`${skill.id} needs the version-1 task-type mastery policy.`);
  } else if (!Array.isArray(requiredTaskTypes) || canonicalizeJson(requiredTaskTypes) !== canonicalizeJson(taskTypes)) {
    issues.push(`${skill.id} assessment.requiredTaskTypes must exactly match constraints.taskTypes.`);
  }
}

function validateSkillEvidenceContract(skill, rationaleIds, issues) {
  if (!rationaleIds.has(skill.rationaleId)) issues.push(`${skill.id} references unknown rationale ${skill.rationaleId}.`);
  if (!Array.isArray(skill.benchmarkIds) || !skill.benchmarkIds.length) issues.push(`${skill.id} needs benchmarkIds.`);
  const taskTypes = validateSkillTaskTypes(skill, issues);
  validateSkillAssessment(skill, taskTypes, issues);
}

function validateManifestSkill(skill, index, context, issues) {
  if (!plainObject(skill)) {
    issues.push(`Skill at index ${index} must be an object.`);
    return;
  }
  validateSkillIdentity(skill, index, context.skillsById, issues);
  validateSkillPlacement(skill, context, issues);
  validateSkillLearningModes(skill, context, issues);
  validateSkillConstraints(skill, context, issues);
  validateSkillEvidenceContract(skill, context.rationaleIds, issues);
  context.skillsPerLevel.get(skill.level)?.push(skill);
}

function validateSkillPrerequisites(skillsById, issues) {
  for (const [id, record] of skillsById) {
    const prerequisites = record.skill.prerequisites;
    if (!Array.isArray(prerequisites)) continue;
    if (new Set(prerequisites).size !== prerequisites.length) issues.push(`${id} repeats a prerequisite.`);
    for (const prerequisiteId of prerequisites) {
      const prerequisite = skillsById.get(prerequisiteId);
      if (!prerequisite) issues.push(`${id} references unknown prerequisite ${prerequisiteId}.`);
      else if (prerequisite.index >= record.index) issues.push(`${id} prerequisite ${prerequisiteId} must appear earlier in the manifest.`);
    }
  }
}

function validateSkillCoverage(context, issues) {
  const { levelGateways, skillsPerLevel, registeredConstraintKeys, usedConstraintKeys } = context;
  for (const [level, count] of levelGateways) {
    if (count < 1) issues.push(`Level ${level} has no gateway skill.`);
  }
  for (const [level, rows] of skillsPerLevel) {
    if (rows.length !== EXPECTED_COUNTS.skillsPerLevel) issues.push(`Level ${level} must contain exactly ${EXPECTED_COUNTS.skillsPerLevel} skills.`);
  }
  for (const key of registeredConstraintKeys) {
    if (!usedConstraintKeys.has(key)) issues.push(`constraintSchema registers unused key ${key}.`);
  }
}

function validateRationaleRecords(manifest, issues) {
  for (const [index, rationale] of manifest.designRationales.entries()) {
    closedObject(rationale, CLOSED_KEYS.rationale, CLOSED_KEYS.rationale, `designRationales[${index}]`, issues);
    if (!plainObject(rationale) || !nonEmptyString(rationale.id) || !nonEmptyString(rationale.claim)) {
      issues.push(`designRationales[${index}] must contain non-empty id and claim strings.`);
    }
  }
}

function validateManifestSources(manifest, issues) {
  const sourceIds = new Set();
  for (const [index, source] of manifest.sources.entries()) {
    closedObject(
      source,
      CLOSED_KEYS.source,
      REQUIRED_SOURCE_KEYS,
      `sources[${index}]`,
      issues,
    );
    if (!plainObject(source)) continue;
    for (const key of REQUIRED_SOURCE_KEYS) {
      if (!nonEmptyString(source[key])) issues.push(`sources[${index}].${key} must be a non-empty string.`);
    }
    if (source.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(source.sha256)) {
      issues.push(`sources[${index}].sha256 must be a lowercase SHA-256 digest.`);
    }
    if (sourceIds.has(source.id)) issues.push(`Duplicate source id ${source.id}.`);
    sourceIds.add(source.id);
  }
  return sourceIds;
}

function validateLocalizationSourceReferences(manifest, sourceIds, issues) {
  for (const [bandId, referenced] of Object.entries(manifest.localizationReview.bandSources)) {
    for (const sourceId of referenced) {
      if (!sourceIds.has(sourceId)) issues.push(`localizationReview.bandSources.${bandId} references unknown source ${sourceId}.`);
    }
  }
  for (const sourceId of manifest.localizationReview.contextSources) {
    if (!sourceIds.has(sourceId)) issues.push(`localizationReview.contextSources references unknown source ${sourceId}.`);
  }
}

function validateManifestBenchmarks(manifest, sourceIds, issues) {
  const benchmarkIds = new Set();
  for (const [index, benchmark] of manifest.benchmarkIndex.entries()) {
    closedObject(benchmark, CLOSED_KEYS.benchmark, CLOSED_KEYS.benchmark, `benchmarkIndex[${index}]`, issues);
    if (!plainObject(benchmark) || typeof benchmark.id !== "string" || !benchmark.id) {
      issues.push("benchmarkIndex contains an invalid entry.");
      continue;
    }
    if (benchmarkIds.has(benchmark.id)) issues.push(`Duplicate benchmark id ${benchmark.id}.`);
    benchmarkIds.add(benchmark.id);
    if (!sourceIds.has(benchmark.sourceId)) issues.push(`Benchmark ${benchmark.id} references unknown source ${benchmark.sourceId}.`);
  }
  return benchmarkIds;
}

function validateSkillBenchmarkReferences(manifest, benchmarkIds, issues) {
  for (const skill of manifest.skills) {
    if (!plainObject(skill)) continue;
    for (const benchmarkId of skill.benchmarkIds ?? []) {
      if (!benchmarkIds.has(benchmarkId)) issues.push(`${skill.id} references unknown benchmark ${benchmarkId}.`);
    }
  }
}

function manifestValidationContext(manifest, issues) {
  validateManifestCounts(manifest, issues);
  const enums = manifestEnumSets(manifest, issues);
  const rationaleIds = validateRationaleIds(manifest, issues);
  validateTaskTypePolicy(manifest, issues);
  const constraints = manifestConstraintRegistry(manifest, issues);
  const bandIds = validateManifestBands(manifest, issues);
  validateBandSourceDeclarations(manifest, bandIds, issues);
  const levelNumbers = validateManifestLevels(manifest, bandIds, issues);
  return {
    manifest, ...enums, rationaleIds, ...constraints, bandIds, levelNumbers,
    skillsById: new Map(),
    levelGateways: new Map(manifest.levels.map((level) => [level.number, 0])),
    skillsPerLevel: new Map(manifest.levels.map((level) => [level.number, []])),
    usedConstraintKeys: new Set(),
  };
}

function validateManifestSemantics(manifest, issues) {
  const context = manifestValidationContext(manifest, issues);
  for (const [index, skill] of manifest.skills.entries()) validateManifestSkill(skill, index, context, issues);
  validateSkillPrerequisites(context.skillsById, issues);
  validateSkillCoverage(context, issues);
  validateRationaleRecords(manifest, issues);
  const sourceIds = validateManifestSources(manifest, issues);
  validateLocalizationSourceReferences(manifest, sourceIds, issues);
  const benchmarkIds = validateManifestBenchmarks(manifest, sourceIds, issues);
  validateSkillBenchmarkReferences(manifest, benchmarkIds, issues);
}

export function validateManifest(manifest) {
  const issues = [];
  if (!plainObject(manifest)) return Object.freeze(["Manifest root must be an object."]);
  validateManifestIdentity(manifest, issues);
  validateManifestLocalization(manifest, issues);
  validateManifestLicence(manifest, issues);
  validateManifestAuthorship(manifest, issues);
  validateManifestLocalizationReview(manifest, issues);
  validateManifestPhaseLegend(manifest, issues);
  validateManifestConstraintConventions(manifest, issues);
  validateManifestCollections(manifest, issues);
  if (issues.length) return Object.freeze(issues);
  validateManifestSemantics(manifest, issues);
  return Object.freeze(issues);
}

export async function loadManifest(pathOrUrl) {
  const text = await readFile(pathOrUrl, "utf8");
  const manifest = JSON.parse(text);
  const issues = validateManifest(manifest);
  if (issues.length) throw new Error(`Invalid curriculum manifest:\n- ${issues.join("\n- ")}`);
  return Object.freeze({ manifest, ...manifestArtifact(manifest) });
}
