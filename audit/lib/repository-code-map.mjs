import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const REPOSITORY_CODE_MAP_PATH = "audit/repository-code-map-v1.json";
export const REPOSITORY_CODE_MAP_SCHEMA_PATH = "audit/schemas/repository-code-map-v1.schema.json";
export const AI_READER_CONTRACT_ID = "math-quest-ai-first-drift-control";
export const AI_READER_CONTRACT_VERSION = 1;
export const AI_READER_CONTRACT_REF = Object.freeze({ contractId: AI_READER_CONTRACT_ID, version: AI_READER_CONTRACT_VERSION });

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

const normalizePath = (value) => String(value || "").replace(/\\/gu, "/").replace(/^\.\//u, "").trim();

function scrubGitEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !/^GIT_/iu.test(key)));
}

export function trackedRepositoryPaths(root = repositoryRoot) {
  const output = execFileSync("git", ["-c", `safe.directory=${root.replace(/\\/gu, "/")}`, "ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    env: scrubGitEnvironment(),
    timeout: 15_000,
    windowsHide: true,
  });
  return Object.freeze(output.split("\0").map(normalizePath).filter(Boolean).sort());
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

export async function validateRepositoryCodeMapSchema(map, schemaPathOrUrl = new URL("../schemas/repository-code-map-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(map);
  return Object.freeze(valid ? [] : (validate.errors || []).map(schemaIssue));
}

function compilePatterns(records, field, label, issues) {
  return records.map((record) => {
    try {
      return { record, expression: new RegExp(record[field], "u") };
    } catch (error) {
      issues.push(`${label} ${record.id || record[field]} has invalid regular expression: ${error.message}`);
      return { record, expression: /$a/u };
    }
  });
}

function pathExists(root, relativePath) {
  return existsSync(path.join(root, ...normalizePath(relativePath).split("/")));
}

function canonicalOrder(values, key = (value) => value) {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function exactOwnerLiteralProjectionIssues(family, literal, trackedTextEntries) {
  const issues = [];
  const discovered = trackedTextEntries.filter((entry) => entry.text.includes(literal)).map((entry) => normalizePath(entry.path));
  const declared = family.projections.map((projection) => normalizePath(projection.path));
  const required = family.projections
    .filter((projection) => projection.relationship !== "STATE_DEPENDENT_DOCUMENTED_REFERENCE")
    .map((projection) => normalizePath(projection.path));
  for (const file of discovered.filter((file) => !declared.includes(file))) {
    issues.push(`fact family ${family.id} has undeclared exact owner-literal projection ${file}.`);
  }
  for (const file of required.filter((file) => !discovered.includes(file))) {
    issues.push(`fact family ${family.id} declares projection ${file} but it does not contain the exact owner literal.`);
  }
  return Object.freeze(issues);
}

export function aiReaderAuthoritySection(text, contract) {
  const { startMarker, endMarker } = contract.authority;
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("AI-first authority markers are missing or out of order.");
  return text.slice(start, end + endMarker.length);
}

export function aiReaderAuthoritySha256(text, contract) {
  return createHash("sha256").update(aiReaderAuthoritySection(text, contract), "utf8").digest("hex");
}

export async function validateRepositoryCodeMap(map, {
  root = repositoryRoot,
  trackedPaths = null,
  schemaPathOrUrl,
} = {}) {
  const issues = [...await validateRepositoryCodeMapSchema(map, schemaPathOrUrl)];
  if (issues.length) return Object.freeze(issues);

  const tracked = Object.freeze([...(trackedPaths || trackedRepositoryPaths(root))].map(normalizePath).filter(Boolean).sort());
  const trackedSet = new Set(tracked);
  const coverage = compilePatterns(map.coverageRules, "pattern", "coverage rule", issues);
  const dataPatterns = compilePatterns(map.dataArtifactPatterns.map((pattern, index) => ({ id: `data-${index}`, pattern })), "pattern", "data-artifact rule", issues);

  for (const duplicate of duplicateValues(map.coverageRules.map((record) => record.id))) issues.push(`coverageRules repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(map.factFamilies.map((record) => record.id))) issues.push(`factFamilies repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(map.factFamilies.flatMap((record) => record.owns))) issues.push(`owned fact ${duplicate} has multiple sole owners.`);
  for (const duplicate of duplicateValues(map.artifactRelations.map((record) => record.id))) issues.push(`artifactRelations repeats ${duplicate}.`);
  for (const duplicate of duplicateValues(map.tombstones.map((record) => record.path))) issues.push(`tombstones repeats ${duplicate}.`);

  if (!sameJson(map.factFamilies, canonicalOrder(map.factFamilies, (record) => record.id))) issues.push("factFamilies must be sorted lexicographically by id.");
  for (const family of map.factFamilies) {
    if (!sameJson(family.owns, canonicalOrder(family.owns))) issues.push(`fact family ${family.id} owns must be sorted lexicographically.`);
    if (!sameJson(family.projections, canonicalOrder(family.projections, (record) => record.path))) issues.push(`fact family ${family.id} projections must be sorted lexicographically by path.`);
    if (!sameJson(family.validators, canonicalOrder(family.validators))) issues.push(`fact family ${family.id} validators must be sorted lexicographically.`);
    for (const duplicate of duplicateValues(family.projections.map((record) => record.path))) issues.push(`fact family ${family.id} repeats projection ${duplicate}.`);
    if (family.copyPolicy === "SECTION_MIRROR" && family.projections.some((projection) => projection.relationship !== "EXACT_MIRROR")) {
      issues.push(`fact family ${family.id} SECTION_MIRROR projections must use EXACT_MIRROR.`);
    }
    if (family.copyPolicy !== "SECTION_MIRROR" && family.projections.some((projection) => projection.relationship === "EXACT_MIRROR")) {
      issues.push(`fact family ${family.id} may use EXACT_MIRROR only with SECTION_MIRROR.`);
    }
    if (family.copyDiscovery !== "NONE" && family.copyPolicy !== "DECLARED_PROJECTIONS_ONLY") {
      issues.push(`fact family ${family.id} copy discovery requires DECLARED_PROJECTIONS_ONLY.`);
    }
  }
  const tutorialFamily = map.factFamilies.find((family) => family.id === "tutorial.linkage");
  const requiredTutorialFacts = [
    "tutorial.linkage.answer-disclosure-policies",
    "tutorial.linkage.answer-separation",
    "tutorial.linkage.families",
    "tutorial.linkage.feature-coverage",
    "tutorial.linkage.generator-profiles",
    "tutorial.linkage.input-methods",
    "tutorial.linkage.obligation-resolution-modes",
    "tutorial.linkage.phase-identities",
    "tutorial.linkage.sibling-compatibility",
    "tutorial.linkage.visual-anchors",
    "tutorial.linkage.visual-cues",
    "tutorial.linkage.visual-teaching-contracts",
  ];
  const requiredTutorialValidators = [
    "audit/playwright/critical-journeys.spec.mjs",
    "audit/playwright/deep-ux-census.spec.mjs",
    "audit/tests/tutorial-manifest.test.mjs",
  ];
  if (!tutorialFamily || !sameJson(tutorialFamily.owns, requiredTutorialFacts)) issues.push("tutorial.linkage must own the complete Tutorial V2 fact set.");
  if (!tutorialFamily || !sameJson(tutorialFamily.validators, requiredTutorialValidators)) issues.push("tutorial.linkage must declare the complete focused and Deep UX validator set.");
  for (const requiredRelation of ["feature.tutorial", "tutorial.build-spec", "tutorial.deep-ux"]) {
    if (!map.artifactRelations.some((relation) => relation.id === requiredRelation)) issues.push(`tutorial.linkage requires artifact relation ${requiredRelation}.`);
  }
  const requiredArtFamilies = new Map([
    ["art-design.asset-acceptance", [
      "art-design.assets.acceptance-state",
      "art-design.assets.evidence-bindings",
      "art-design.assets.permitted-uses",
      "art-design.assets.semantic-class",
    ]],
    ["art-design.runtime-tokens", [
      "art-design.tokens.activation-state",
      "art-design.tokens.approved-text-pairings",
      "art-design.tokens.colour-values",
      "art-design.tokens.dimensions",
      "art-design.tokens.generated-projection-bytes",
      "art-design.tokens.motion",
      "art-design.tokens.runtime-consumer-contract",
      "art-design.tokens.view-palettes",
    ]],
    ["art-design.source-decisions", [
      "art-design.construction-workflow",
      "art-design.design-rules",
      "art-design.implementation-decisions",
      "art-design.migration-sequence",
      "art-design.question-shell-and-instrument-rail",
      "art-design.source-dispositions",
      "art-design.theme-policy",
    ]],
  ]);
  const requiredArtValidators = new Map([
    ["art-design.asset-acceptance", ["audit/tests/art-design-governance.test.mjs"]],
    ["art-design.runtime-tokens", ["audit/playwright/critical-journeys.spec.mjs", "audit/tests/art-design-governance.test.mjs", "audit/tests/design-token-projection.test.mjs"]],
    ["art-design.source-decisions", ["audit/playwright/critical-journeys.spec.mjs", "audit/tests/art-design-governance.test.mjs", "audit/tests/art-question-shell.test.mjs"]],
  ]);
  for (const [familyId, ownedFacts] of requiredArtFamilies) {
    const family = map.factFamilies.find((record) => record.id === familyId);
    if (!family || !sameJson(family.owns, ownedFacts)) issues.push(`${familyId} must own its complete closed art-design fact set.`);
    if (!family || !sameJson(family.validators, requiredArtValidators.get(familyId))) issues.push(`${familyId} must bind its complete focused art-design validator set.`);
  }
  for (const requiredRelation of ["art-assets.decision", "art-assets.feature", "art-assets.rights", "art-assets.schema", "art-assets.tutorial", "art-design.schema", "art-design.test", "art-question-shell.browser-test", "art-question-shell.runtime", "art-question-shell.test", "art-token-projection.audit-oracle", "art-token-projection.browser", "art-token-projection.generator", "art-token-projection.runtime", "art-token-projection.schema", "art-token-projection.shell", "art-token-projection.test", "art-token-projection.tokens", "art-tokens.decision", "art-tokens.schema", "feature.art-design", "tutorial.art-design"]) {
    if (!map.artifactRelations.some((relation) => relation.id === requiredRelation)) issues.push(`art-design governance requires artifact relation ${requiredRelation}.`);
  }
  const artMigrationFamily = map.factFamilies.find((record) => record.id === "art-design.migration-baseline");
  const requiredArtMigrationFacts = [
    "art-design.migration-baseline.browser-evidence-binding",
    "art-design.migration-baseline.claim-boundary",
    "art-design.migration-baseline.fixture-contract",
    "art-design.migration-baseline.source-bindings",
    "art-design.migration-baseline.source-revision",
    "art-design.migration-baseline.viewport-state-matrix",
  ];
  const artMigrationBrowserFamily = map.factFamilies.find((record) => record.id === "art-design.migration-browser-evidence");
  const requiredArtMigrationBrowserFacts = [
    "art-design.migration-browser-evidence.capture-contract",
    "art-design.migration-browser-evidence.exact-browser-identity",
    "art-design.migration-browser-evidence.exact-served-source",
    "art-design.migration-browser-evidence.harness-adapter",
    "art-design.migration-browser-evidence.passing-artifact-policy",
    "art-design.migration-browser-evidence.request-integrity",
    "art-design.migration-browser-evidence.visual-result-details",
    "art-design.migration-browser-evidence.visual-result-set",
  ];
  const requiredArtMigrationValidators = [
    "audit/tests/art-migration-baseline.test.mjs",
    "audit/validate-art-migration-baseline.mjs",
  ];
  if (!artMigrationFamily || artMigrationFamily.owner !== "audit/art-migration-baseline-v1.json") {
    issues.push("art-design.migration-baseline must have the sole canonical ART-MIG-01 owner.");
  }
  if (!artMigrationFamily || !sameJson(artMigrationFamily.owns, requiredArtMigrationFacts)) {
    issues.push("art-design.migration-baseline must own the complete closed ART-MIG-01 fact set.");
  }
  if (!artMigrationFamily || !sameJson(artMigrationFamily.validators, requiredArtMigrationValidators)) {
    issues.push("art-design.migration-baseline must bind the complete ART-MIG-01 validator set.");
  }
  if (!artMigrationBrowserFamily || artMigrationBrowserFamily.owner !== "audit/art-migration-browser-evidence-v1.json") {
    issues.push("art-design.migration-browser-evidence must have the sole canonical retained-browser-evidence owner.");
  }
  if (!artMigrationBrowserFamily || !sameJson(artMigrationBrowserFamily.owns, requiredArtMigrationBrowserFacts)) {
    issues.push("art-design.migration-browser-evidence must own the complete closed retained-browser-evidence fact set.");
  }
  if (!artMigrationBrowserFamily || !sameJson(artMigrationBrowserFamily.validators, requiredArtMigrationValidators)) {
    issues.push("art-design.migration-browser-evidence must bind the complete ART-MIG-01 validator set.");
  }
  for (const requiredRelation of [
    "art-migration.browser-contract",
    "art-migration.browser-evidence-record",
    "art-migration.browser-evidence-schema",
    "art-migration.engine-loader",
    "art-migration.record",
    "art-migration.schema",
    "art-migration.test",
    "art-migration.validator",
  ]) {
    if (!map.artifactRelations.some((relation) => relation.id === requiredRelation)) {
      issues.push(`art-design.migration-baseline requires artifact relation ${requiredRelation}.`);
    }
  }
  if (!sameJson(map.artifactRelations, canonicalOrder(map.artifactRelations, (record) => record.id))) issues.push("artifactRelations must be sorted lexicographically by id.");
  if (!sameJson(map.dataArtifactPatterns, canonicalOrder(map.dataArtifactPatterns))) issues.push("dataArtifactPatterns must be sorted lexicographically.");
  if (!sameJson(map.tombstones, canonicalOrder(map.tombstones, (record) => record.path))) issues.push("tombstones must be sorted lexicographically by path.");

  try {
    const authorityText = await readFile(path.join(root, map.aiReaderContract.authority.path), "utf8");
    if (aiReaderAuthoritySha256(authorityText, map.aiReaderContract) !== map.aiReaderContract.authority.sha256) {
      issues.push("aiReaderContract authority sha256 does not match the exact AGENTS.md authority section.");
    }
  } catch (error) {
    issues.push(`aiReaderContract authority is unreadable or malformed: ${error.message}`);
  }

  for (const file of tracked) {
    const matches = coverage.filter(({ expression }) => expression.test(file)).map(({ record }) => record.id);
    if (matches.length === 0) issues.push(`${file}: tracked file has no code-map coverage rule.`);
    if (matches.length > 1) issues.push(`${file}: tracked file matches multiple code-map coverage rules: ${matches.join(", ")}.`);
  }

  const governedPaths = new Set();
  const assertTrackedPath = (relativePath, context) => {
    const normalized = normalizePath(relativePath);
    if (!trackedSet.has(normalized)) issues.push(`${context} references untracked or missing path ${normalized}.`);
    if (!pathExists(root, normalized)) issues.push(`${context} references path absent on disk ${normalized}.`);
    return normalized;
  };

  for (const family of map.factFamilies) {
    governedPaths.add(assertTrackedPath(family.owner, `fact family ${family.id} owner`));
    for (const projection of family.projections) {
      const projectionPath = assertTrackedPath(projection.path, `fact family ${family.id} projection`);
      governedPaths.add(projectionPath);
      const role = coverage.find(({ expression }) => expression.test(projectionPath))?.record.role;
      const allowedRoles = {
        EXACT_MIRROR: null,
        RUNTIME_EMBED: new Set(["runtime"]),
        OPERATIONAL_CONFIG: new Set(["audit", "governance", "launcher", "tool", "toolchain"]),
        VALIDATION_EXPECTATION: new Set(["audit", "runtime", "test"]),
        GENERATED_METADATA: new Set(["runtime"]),
        STATE_DEPENDENT_DOCUMENTED_REFERENCE: new Set(["documentation", "governance", "research"]),
      }[projection.relationship];
      if (allowedRoles && !allowedRoles.has(role)) {
        issues.push(`fact family ${family.id} projection ${projectionPath} relationship ${projection.relationship} is incompatible with role ${role || "unclassified"}.`);
      }
    }
    for (const validator of family.validators) assertTrackedPath(validator, `fact family ${family.id} validator`);

    if (family.copyDiscovery === "OWNER_UTF8_TRIMMED_LITERAL_IN_TRACKED_TEXT") {
      try {
        const literal = (await readFile(path.join(root, ...normalizePath(family.owner).split("/")), "utf8")).trim();
        if (!literal) {
          issues.push(`fact family ${family.id} copy-discovery owner text must not be blank.`);
        } else {
          const trackedTextEntries = [];
          for (const file of tracked) {
            if (file === normalizePath(family.owner)) continue;
            const bytes = await readFile(path.join(root, ...file.split("/")));
            if (!bytes.includes(0)) trackedTextEntries.push({ path: file, text: bytes.toString("utf8") });
          }
          issues.push(...exactOwnerLiteralProjectionIssues(family, literal, trackedTextEntries));
        }
      } catch (error) {
        issues.push(`fact family ${family.id} copy discovery failed: ${error.message}`);
      }
    }
  }

  for (const relation of map.artifactRelations) {
    assertTrackedPath(relation.source, `artifact relation ${relation.id} source`);
    assertTrackedPath(relation.target, `artifact relation ${relation.id} target`);
  }

  for (const file of tracked) {
    if (dataPatterns.some(({ expression }) => expression.test(file)) && !governedPaths.has(file)) {
      issues.push(`${file}: governed data artifact is orphaned from every fact owner or declared projection.`);
    }
  }

  for (const tombstone of map.tombstones) {
    if (trackedSet.has(tombstone.path) || pathExists(root, tombstone.path)) issues.push(`${tombstone.path}: tombstoned path must not exist or be tracked.`);
    assertTrackedPath(tombstone.ownerRecord, `tombstone ${tombstone.path} ownerRecord`);
  }

  return Object.freeze(issues);
}

export async function loadRepositoryCodeMap(pathOrUrl = new URL("../repository-code-map-v1.json", import.meta.url), options = {}) {
  const map = JSON.parse(await readFile(pathOrUrl, "utf8"));
  const issues = await validateRepositoryCodeMap(map, options);
  if (issues.length) throw new Error(`Invalid repository code map:\n- ${issues.join("\n- ")}`);
  return Object.freeze(map);
}

export function repositoryCodeMapMarkdown(map) {
  const lines = [
    "<!-- REPOSITORY-CODE-MAP-START -->",
    "## Generated repository ownership map",
    "",
    "This non-authoritative section is generated from `audit/repository-code-map-v1.json`. Edit the canonical JSON, not this projection; no fact in this Markdown may override the closed machine record.",
    "",
    "| Fact family | Sole owner | Declared projections | Validators |",
    "|---|---|---|---|",
  ];
  for (const family of map.factFamilies) {
    const projections = family.projections.length ? family.projections.map((item) => `\`${item.path}\``).join("<br>") : "—";
    const validators = family.validators.map((item) => `\`${item}\``).join("<br>");
    lines.push(`| \`${family.id}\` | \`${family.owner}\` | ${projections} | ${validators} |`);
  }
  lines.push("", "<!-- REPOSITORY-CODE-MAP-END -->");
  return `${lines.join("\n")}\n`;
}
