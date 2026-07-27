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

export function validateManifest(manifest) {
  const issues = [];
  const add = (message) => issues.push(message);

  if (!plainObject(manifest)) return Object.freeze(["Manifest root must be an object."]);
  closedObject(manifest, CLOSED_KEYS.root, CLOSED_KEYS.root, "Manifest root", issues);
  if (manifest.manifestId !== "math-quest-curriculum") add("manifestId must be math-quest-curriculum.");
  if (!/^1\.\d+\.\d+$/u.test(String(manifest.version ?? ""))) add("version must be a 1.x semantic version.");
  if (manifest.schemaVersion !== 1) add("schemaVersion must be 1.");
  if (manifest.locale !== "en-CA") add("locale must be en-CA.");
  closedObject(manifest.localization, CLOSED_KEYS.localization, CLOSED_KEYS.localization, "localization", issues);
  if (plainObject(manifest.localization)) {
    for (const key of CLOSED_KEYS.localization) {
      if (!nonEmptyString(manifest.localization[key])) add(`localization.${key} must be a non-empty string.`);
    }
  }
  closedObject(manifest.licence, CLOSED_KEYS.licence, CLOSED_KEYS.licence, "licence", issues);
  if (plainObject(manifest.licence)) {
    if (!nonEmptyString(manifest.licence.spdx)) add("licence.spdx is required.");
    if (!nonEmptyString(manifest.licence.scope)) add("licence.scope is required.");
    if (!nonEmptyString(manifest.licence.originalManifest)) add("licence.originalManifest is required.");
    if (!Array.isArray(manifest.licence.benchmarkAdaptationNotices) || manifest.licence.benchmarkAdaptationNotices.some((item) => !nonEmptyString(item))) {
      add("licence.benchmarkAdaptationNotices must be a string array.");
    }
    if (typeof manifest.licence.thirdPartyMarksExcluded !== "boolean") add("licence.thirdPartyMarksExcluded must be boolean.");
  }
  closedObject(manifest.authorshipMethod, CLOSED_KEYS.authorshipMethod, CLOSED_KEYS.authorshipMethod, "authorshipMethod", issues);
  if (plainObject(manifest.authorshipMethod)) {
    for (const key of CLOSED_KEYS.authorshipMethod.filter((key) => key !== "excludedInputs")) {
      if (!nonEmptyString(manifest.authorshipMethod[key])) add(`authorshipMethod.${key} must be a non-empty string.`);
    }
    if (!Array.isArray(manifest.authorshipMethod.excludedInputs) || !manifest.authorshipMethod.excludedInputs.length || manifest.authorshipMethod.excludedInputs.some((item) => !nonEmptyString(item))) {
      add("authorshipMethod.excludedInputs must be a non-empty string array.");
    }
  }
  closedObject(manifest.localizationReview, CLOSED_KEYS.localizationReview, CLOSED_KEYS.localizationReview, "localizationReview", issues);
  if (plainObject(manifest.localizationReview)) {
    if (!nonEmptyString(manifest.localizationReview.status) || typeof manifest.localizationReview.normativeBenchmark !== "boolean" || !nonEmptyString(manifest.localizationReview.rule)) {
      add("localizationReview status, normativeBenchmark, and rule are invalid.");
    }
    if (!plainObject(manifest.localizationReview.bandSources)) add("localizationReview.bandSources must be an object.");
    if (!Array.isArray(manifest.localizationReview.contextSources) || manifest.localizationReview.contextSources.some((item) => !nonEmptyString(item))) {
      add("localizationReview.contextSources must be a string array.");
    }
  }
  closedObject(manifest.phaseLegend, CLOSED_KEYS.phaseLegend, CLOSED_KEYS.phaseLegend, "phaseLegend", issues);
  if (plainObject(manifest.phaseLegend) && CLOSED_KEYS.phaseLegend.some((key) => !nonEmptyString(manifest.phaseLegend[key]))) {
    add("phaseLegend values must be non-empty strings.");
  }
  closedObject(manifest.constraintConventions, CLOSED_KEYS.constraintConventions, CLOSED_KEYS.constraintConventions, "constraintConventions", issues);
  if (plainObject(manifest.constraintConventions)) {
    if (!nonEmptyString(manifest.constraintConventions.rule)) add("constraintConventions.rule must be a non-empty string.");
    for (const key of CLOSED_KEYS.constraintConventions.filter((item) => item !== "rule")) {
      const policy = manifest.constraintConventions[key];
      closedObject(policy, CLOSED_KEYS.constraintConvention, CLOSED_KEYS.constraintConvention, `constraintConventions.${key}`, issues);
      if (plainObject(policy) && (
        !Array.isArray(policy.keys)
        || !policy.keys.length
        || policy.keys.some((item) => !nonEmptyString(item))
        || !Array.isArray(policy.valueTypes)
        || !policy.valueTypes.length
        || policy.valueTypes.some((item) => !nonEmptyString(item))
      )) add(`constraintConventions.${key} must declare non-empty keys and valueTypes string arrays.`);
    }
  }
  if (!Array.isArray(manifest.bands) || !manifest.bands.length) add("bands must be a non-empty array.");
  if (!Array.isArray(manifest.levels) || !manifest.levels.length) add("levels must be a non-empty array.");
  if (!Array.isArray(manifest.skills) || !manifest.skills.length) add("skills must be a non-empty array.");
  if (!Array.isArray(manifest.sources) || !manifest.sources.length) add("sources must be a non-empty array.");
  if (!Array.isArray(manifest.designRationales) || !manifest.designRationales.length) add("designRationales must be a non-empty array.");
  if (!Array.isArray(manifest.benchmarkIndex) || !manifest.benchmarkIndex.length) add("benchmarkIndex must be a non-empty array.");
  if (issues.length) return Object.freeze(issues);

  closedObject(manifest.counts, CLOSED_KEYS.counts, CLOSED_KEYS.counts, "counts", issues);
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (manifest.counts?.[key] !== expected) add(`counts.${key} must be ${expected}.`);
  }
  if (manifest.bands.length !== EXPECTED_COUNTS.bands) add(`Manifest must contain exactly ${EXPECTED_COUNTS.bands} bands.`);
  if (manifest.levels.length !== EXPECTED_COUNTS.levels) add(`Manifest must contain exactly ${EXPECTED_COUNTS.levels} levels.`);
  if (manifest.skills.length !== EXPECTED_COUNTS.skills) add(`Manifest must contain exactly ${EXPECTED_COUNTS.skills} skills.`);

  const allowedStrands = stringEnum(manifest.strandEnum, "strandEnum", issues);
  const allowedProfiles = stringEnum(manifest.generatorProfileEnum, "generatorProfileEnum", issues);
  const allowedRepresentations = stringEnum(manifest.representationEnum, "representationEnum", issues);
  const allowedFamilies = stringEnum(manifest.familyEnum, "familyEnum", issues);
  if (allowedStrands.size !== 6) add("strandEnum must contain exactly six strands.");
  const rationaleIds = new Set(manifest.designRationales.map((item) => item?.id));
  if (!Array.isArray(manifest.designRationales) || !manifest.designRationales.length || rationaleIds.has(undefined)) {
    add("designRationales must contain identified rationale records.");
  }
  if (rationaleIds.size !== (manifest.designRationales ?? []).length) add("designRationales must not repeat ids.");
  closedObject(manifest.taskTypePolicy, CLOSED_KEYS.taskTypePolicy, CLOSED_KEYS.taskTypePolicy, "taskTypePolicy", issues);
  if (!plainObject(manifest.taskTypePolicy) || manifest.taskTypePolicy.version !== 1 || typeof manifest.taskTypePolicy.rule !== "string" || !manifest.taskTypePolicy.rule.trim()) {
    add("taskTypePolicy must be a documented version-1 policy.");
  }

  const constraintKeyTypes = manifest.constraintSchema?.keyTypes;
  closedObject(manifest.constraintSchema, CLOSED_KEYS.constraintSchema, CLOSED_KEYS.constraintSchema, "constraintSchema", issues);
  if (!plainObject(manifest.constraintSchema) || manifest.constraintSchema.version !== 1 || manifest.constraintSchema.closed !== true || !plainObject(constraintKeyTypes)) {
    add("constraintSchema must be a closed version-1 keyTypes registry.");
  }
  const registeredConstraintKeys = new Set(Object.keys(constraintKeyTypes ?? {}));
  for (const [key, types] of Object.entries(constraintKeyTypes ?? {})) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(key)) add(`constraintSchema contains invalid key ${key}.`);
    if (!Array.isArray(types) || !types.length || types.some((type) => typeof type !== "string" || !type)) add(`constraintSchema.${key} must list allowed value types.`);
  }

  const bandIds = new Set();
  for (const [index, band] of manifest.bands.entries()) {
    closedObject(band, CLOSED_KEYS.band, CLOSED_KEYS.band, `Band ${index + 1}`, issues);
    if (!plainObject(band) || !/^[A-Z][A-Z0-9_]*$/u.test(String(band.id ?? ""))) add(`Band ${index + 1} has an invalid id.`);
    else if (bandIds.has(band.id)) add(`Duplicate band id ${band.id}.`);
    else bandIds.add(band.id);
    if (typeof band.title !== "string" || !band.title.trim()) add(`Band ${band.id ?? index + 1} needs a title.`);
    if (typeof band.purpose !== "string" || !band.purpose.trim()) add(`Band ${band.id ?? index + 1} needs a purpose.`);
  }
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
        add(`localizationReview.bandSources.${bandId} must be a string array.`);
      }
    }
  }

  const levelNumbers = new Set();
  for (const [index, level] of manifest.levels.entries()) {
    const expected = index + 1;
    closedObject(level, CLOSED_KEYS.level, CLOSED_KEYS.level, `Level ${expected}`, issues);
    if (!plainObject(level) || level.number !== expected) add(`Level at index ${index} must have number ${expected}.`);
    else levelNumbers.add(level.number);
    if (level?.id !== `L${String(expected).padStart(2, "0")}`) add(`Level ${expected} must use id L${String(expected).padStart(2, "0")}.`);
    if (!bandIds.has(level?.band)) add(`Level ${expected} references unknown band ${level?.band}.`);
    if (typeof level?.title !== "string" || !level.title.trim()) add(`Level ${expected} needs a title.`);
    if (typeof level?.purpose !== "string" || !level.purpose.trim()) add(`Level ${expected} needs a purpose.`);
    const expectedFirst = `MQ-${String(index * EXPECTED_COUNTS.skillsPerLevel + 1).padStart(3, "0")}`;
    const expectedLast = `MQ-${String((index + 1) * EXPECTED_COUNTS.skillsPerLevel).padStart(3, "0")}`;
    if (!Array.isArray(level?.skillRange) || level.skillRange.length !== 2 || level.skillRange[0] !== expectedFirst || level.skillRange[1] !== expectedLast) {
      add(`Level ${expected} skillRange must be ${expectedFirst} through ${expectedLast}.`);
    }
  }

  const skillsById = new Map();
  const levelGateways = new Map(manifest.levels.map((level) => [level.number, 0]));
  const skillsPerLevel = new Map(manifest.levels.map((level) => [level.number, []]));
  const usedConstraintKeys = new Set();
  for (const [index, skill] of manifest.skills.entries()) {
    const expectedId = `MQ-${String(index + 1).padStart(3, "0")}`;
    if (!plainObject(skill)) {
      add(`Skill at index ${index} must be an object.`);
      continue;
    }
    closedObject(skill, CLOSED_KEYS.skill, CLOSED_KEYS.skill, skill.id || `Skill ${index + 1}`, issues);
    if (skill.id !== expectedId) add(`Skill at index ${index} must use sequential id ${expectedId}.`);
    if (skillsById.has(skill.id)) add(`Duplicate skill id ${skill.id}.`);
    else skillsById.set(skill.id, { skill, index });
    if (!levelNumbers.has(skill.level)) add(`${skill.id} references unknown level ${skill.level}.`);
    if (!bandIds.has(skill.band)) add(`${skill.id} references unknown band ${skill.band}.`);
    const owningLevel = manifest.levels[Number(skill.level) - 1];
    if (owningLevel && owningLevel.band !== skill.band) add(`${skill.id} band does not match its level.`);
    if (!allowedStrands.has(skill.strand)) add(`${skill.id} has an invalid strand.`);
    if (typeof skill.title !== "string" || !skill.title.trim()) add(`${skill.id} needs a title.`);
    if (typeof skill.objective !== "string" || !skill.objective.trim()) add(`${skill.id} needs an objective.`);
    if (!ALLOWED_ROLES.includes(skill.masteryRole)) add(`${skill.id} has invalid masteryRole ${skill.masteryRole}.`);
    else if (skill.masteryRole === "GATEWAY") levelGateways.set(skill.level, (levelGateways.get(skill.level) ?? 0) + 1);
    if (!Array.isArray(skill.prerequisites)) add(`${skill.id} prerequisites must be an array.`);
    if (!Array.isArray(skill.phases) || !skill.phases.length || skill.phases.some((phase) => !ALLOWED_PHASES.includes(phase))) {
      add(`${skill.id} has invalid phases.`);
    } else {
      const phaseIndexes = skill.phases.map((phase) => ALLOWED_PHASES.indexOf(phase));
      if (new Set(skill.phases).size !== skill.phases.length || phaseIndexes.some((phaseIndex, phasePosition) => phasePosition > 0 && phaseIndex <= phaseIndexes[phasePosition - 1])) {
        add(`${skill.id} phases must be unique and ordered C, P, A.`);
      }
    }
    if (!allowedRepresentations.has(skill.representation)) add(`${skill.id} has an invalid representation.`);
    if (!allowedFamilies.has(skill.family)) add(`${skill.id} has invalid family ${skill.family}.`);
    if (!allowedProfiles.has(skill.generatorProfile)) add(`${skill.id} has invalid generatorProfile.`);
    if (!plainObject(skill.constraints)) add(`${skill.id} constraints must be an object.`);
    else {
      for (const [key, value] of Object.entries(skill.constraints)) {
        usedConstraintKeys.add(key);
        if (!registeredConstraintKeys.has(key)) {
          add(`${skill.id} uses unregistered constraint ${key}.`);
          continue;
        }
        const actualType = constraintType(value);
        if (!constraintKeyTypes[key].includes(actualType)) add(`${skill.id} constraint ${key} has type ${actualType}, expected ${constraintKeyTypes[key].join(" or ")}.`);
      }
    }
    if (!rationaleIds.has(skill.rationaleId)) add(`${skill.id} references unknown rationale ${skill.rationaleId}.`);
    if (!Array.isArray(skill.benchmarkIds) || !skill.benchmarkIds.length) add(`${skill.id} needs benchmarkIds.`);
    const taskTypes = skill.constraints?.taskTypes;
    if (!Array.isArray(taskTypes) || !taskTypes.length || taskTypes.some((taskType) => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(String(taskType)))) {
      add(`${skill.id} must declare one or more valid constraints.taskTypes.`);
    } else if (new Set(taskTypes).size !== taskTypes.length) {
      add(`${skill.id} repeats a constraints.taskTypes value.`);
    }
    const requiredTaskTypes = skill.assessment?.requiredTaskTypes;
    closedObject(skill.assessment, CLOSED_KEYS.assessment, CLOSED_KEYS.assessment, `${skill.id}.assessment`, issues);
    if (!plainObject(skill.assessment) || skill.assessment.version !== 1 || skill.assessment.masteryPolicy !== "one-clean-evidentiary-witness-per-task-type") {
      add(`${skill.id} needs the version-1 task-type mastery policy.`);
    } else if (!Array.isArray(requiredTaskTypes) || canonicalizeJson(requiredTaskTypes) !== canonicalizeJson(taskTypes)) {
      add(`${skill.id} assessment.requiredTaskTypes must exactly match constraints.taskTypes.`);
    }
    skillsPerLevel.get(skill.level)?.push(skill);
  }

  for (const [id, record] of skillsById) {
    const prerequisites = record.skill.prerequisites;
    if (!Array.isArray(prerequisites)) continue;
    if (new Set(prerequisites).size !== prerequisites.length) add(`${id} repeats a prerequisite.`);
    for (const prerequisiteId of prerequisites) {
      const prerequisite = skillsById.get(prerequisiteId);
      if (!prerequisite) add(`${id} references unknown prerequisite ${prerequisiteId}.`);
      else if (prerequisite.index >= record.index) add(`${id} prerequisite ${prerequisiteId} must appear earlier in the manifest.`);
    }
  }

  for (const [level, count] of levelGateways) {
    if (count < 1) add(`Level ${level} has no gateway skill.`);
  }
  for (const [level, rows] of skillsPerLevel) {
    if (rows.length !== EXPECTED_COUNTS.skillsPerLevel) add(`Level ${level} must contain exactly ${EXPECTED_COUNTS.skillsPerLevel} skills.`);
  }
  for (const key of registeredConstraintKeys) {
    if (!usedConstraintKeys.has(key)) add(`constraintSchema registers unused key ${key}.`);
  }

  for (const [index, rationale] of manifest.designRationales.entries()) {
    closedObject(rationale, CLOSED_KEYS.rationale, CLOSED_KEYS.rationale, `designRationales[${index}]`, issues);
    if (!plainObject(rationale) || !nonEmptyString(rationale.id) || !nonEmptyString(rationale.claim)) {
      add(`designRationales[${index}] must contain non-empty id and claim strings.`);
    }
  }

  const sourceIds = new Set();
  for (const [index, source] of manifest.sources.entries()) {
    closedObject(
      source,
      CLOSED_KEYS.source,
      CLOSED_KEYS.source.filter((key) => key !== "sha256"),
      `sources[${index}]`,
      issues,
    );
    if (!plainObject(source)) continue;
    for (const key of CLOSED_KEYS.source.filter((item) => item !== "sha256")) {
      if (!nonEmptyString(source[key])) add(`sources[${index}].${key} must be a non-empty string.`);
    }
    if (source.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(source.sha256)) {
      add(`sources[${index}].sha256 must be a lowercase SHA-256 digest.`);
    }
    if (sourceIds.has(source.id)) add(`Duplicate source id ${source.id}.`);
    sourceIds.add(source.id);
  }
  for (const [bandId, referenced] of Object.entries(manifest.localizationReview.bandSources)) {
    for (const sourceId of referenced) {
      if (!sourceIds.has(sourceId)) add(`localizationReview.bandSources.${bandId} references unknown source ${sourceId}.`);
    }
  }
  for (const sourceId of manifest.localizationReview.contextSources) {
    if (!sourceIds.has(sourceId)) add(`localizationReview.contextSources references unknown source ${sourceId}.`);
  }
  const benchmarkIds = new Set();
  for (const [index, benchmark] of manifest.benchmarkIndex.entries()) {
    closedObject(benchmark, CLOSED_KEYS.benchmark, CLOSED_KEYS.benchmark, `benchmarkIndex[${index}]`, issues);
    if (!plainObject(benchmark) || typeof benchmark.id !== "string" || !benchmark.id) {
      add("benchmarkIndex contains an invalid entry.");
      continue;
    }
    if (benchmarkIds.has(benchmark.id)) add(`Duplicate benchmark id ${benchmark.id}.`);
    benchmarkIds.add(benchmark.id);
    if (!sourceIds.has(benchmark.sourceId)) add(`Benchmark ${benchmark.id} references unknown source ${benchmark.sourceId}.`);
  }
  for (const skill of manifest.skills) {
    if (!plainObject(skill)) continue;
    for (const benchmarkId of skill.benchmarkIds ?? []) {
      if (!benchmarkIds.has(benchmarkId)) add(`${skill.id} references unknown benchmark ${benchmarkId}.`);
    }
  }

  return Object.freeze(issues);
}

export async function loadManifest(pathOrUrl) {
  const text = await readFile(pathOrUrl, "utf8");
  const manifest = JSON.parse(text);
  const issues = validateManifest(manifest);
  if (issues.length) throw new Error(`Invalid curriculum manifest:\n- ${issues.join("\n- ")}`);
  return Object.freeze({ manifest, ...manifestArtifact(manifest) });
}
