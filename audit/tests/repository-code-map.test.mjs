import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aiReaderAuthoritySha256,
  AI_READER_CONTRACT_REF,
  exactOwnerLiteralProjectionIssues,
  REPOSITORY_CODE_MAP_PATH,
  REPOSITORY_CODE_MAP_SCHEMA_PATH,
  repositoryCodeMapMarkdown,
  trackedRepositoryPaths,
  validateRepositoryCodeMap,
  validateRepositoryCodeMapSchema,
} from "../lib/repository-code-map.mjs";

const map = JSON.parse(await readFile(REPOSITORY_CODE_MAP_PATH, "utf8"));

function clone(value) {
  return structuredClone(value);
}

test("repository code map is closed, schema-valid, and covers every tracked file exactly once", async () => {
  assert.deepEqual(await validateRepositoryCodeMapSchema(map, REPOSITORY_CODE_MAP_SCHEMA_PATH), []);
  assert.deepEqual(await validateRepositoryCodeMap(map), []);
  assert.ok(trackedRepositoryPaths().length >= 150, "the map must cover the complete tracked repository, not a hand-picked subset");
});

test("tracked-file discovery is hermetic and does not rely on ambient Git configuration", async () => {
  const previous = process.env.GIT_CONFIG_COUNT;
  process.env.GIT_CONFIG_COUNT = "1";
  process.env.GIT_CONFIG_KEY_0 = "safe.directory";
  process.env.GIT_CONFIG_VALUE_0 = "C:/definitely-not-this-repository";
  try {
    assert.ok(trackedRepositoryPaths().includes("index.html"));
  } finally {
    if (previous === undefined) delete process.env.GIT_CONFIG_COUNT;
    else process.env.GIT_CONFIG_COUNT = previous;
    delete process.env.GIT_CONFIG_KEY_0;
    delete process.env.GIT_CONFIG_VALUE_0;
  }
});

test("owners are unique by fact id and every governed data artifact is owned or projected", async () => {
  const duplicate = clone(map);
  const repositoryStructure = duplicate.factFamilies.find((family) => family.id === "repository.structure");
  duplicate.factFamilies.push(clone(repositoryStructure));
  assert.match((await validateRepositoryCodeMap(duplicate)).join("\n"), /factFamilies repeats repository\.structure/u);

  const duplicateFact = clone(map);
  const browserOwner = duplicateFact.factFamilies.find((family) => family.id === "browser.reviewed-identity");
  duplicateFact.factFamilies.find((family) => family.id === "certification.cadence").owns = [browserOwner.owns[0]];
  assert.match((await validateRepositoryCodeMap(duplicateFact)).join("\n"), /owned fact browser\.identity\.executable-sha256 has multiple sole owners/u);

  const orphan = clone(map);
  orphan.factFamilies = orphan.factFamilies.filter((family) => family.id !== "browser.reviewed-identity");
  assert.match((await validateRepositoryCodeMap(orphan)).join("\n"), /browser-runner-evidence-v1\.json: governed data artifact is orphaned/u);
});

test("undeclared files, overlapping classifications, missing validators, and revived tombstones fail closed", async () => {
  const tracked = trackedRepositoryPaths();

  const undeclared = clone(map);
  assert.match((await validateRepositoryCodeMap(undeclared, { trackedPaths: [...tracked, "unmapped/new-authority.md"] })).join("\n"), /has no code-map coverage rule/u);

  const overlapping = clone(map);
  overlapping.coverageRules.push({ id: "duplicate-tools", pattern: "^tools/", role: "tool", releaseImpact: "CERTIFICATION" });
  assert.match((await validateRepositoryCodeMap(overlapping)).join("\n"), /matches multiple code-map coverage rules/u);

  const missing = clone(map);
  missing.factFamilies[0].validators = ["audit/tests/not-present.test.mjs"];
  assert.match((await validateRepositoryCodeMap(missing)).join("\n"), /untracked or missing path audit\/tests\/not-present/u);

  const revived = clone(map);
  assert.match((await validateRepositoryCodeMap(revived, { trackedPaths: [...tracked, revived.tombstones[0].path] })).join("\n"), /tombstoned path must not exist or be tracked/u);
});

test("missing required ownership structure fails schema validation and human projection is generated from the same map", async () => {
  const missingFacts = clone(map);
  delete missingFacts.factFamilies;
  assert.match((await validateRepositoryCodeMapSchema(missingFacts, REPOSITORY_CODE_MAP_SCHEMA_PATH)).join("\n"), /must have required property 'factFamilies'/u);

  const markdown = repositoryCodeMapMarkdown(map);
  assert.match(markdown, /Generated repository ownership map/u);
  assert.match(markdown, /`tutorial\.linkage` \| `curriculum\/math-quest-tutorial-manifest-v1\.json`/u);
  assert.match(markdown, /Edit the canonical JSON, not this projection/u);

  const agentPolicy = await readFile("AGENTS.md", "utf8");
  assert.match(agentPolicy, /Owners → Code Map → Feature Map → Tutorial Manifest →[\s\S]*Art Design → Blast Radius → Gates/u);
  assert.match(agentPolicy, /tools\/blast-radius-lookup\.mjs --self-test/u);
  assert.match(agentPolicy, /Unknown paths and[\s\S]*fail safe to the broad development suite/u);
});

test("ART-MIG-01 has one exact owner, a closed fact set, and complete typed validator edges", async () => {
  const family = map.factFamilies.find((record) => record.id === "art-design.migration-baseline");
  assert.equal(family.owner, "audit/art-migration-baseline-v1.json");
  assert.deepEqual(family.owns, [
    "art-design.migration-baseline.browser-evidence-binding",
    "art-design.migration-baseline.claim-boundary",
    "art-design.migration-baseline.fixture-contract",
    "art-design.migration-baseline.source-bindings",
    "art-design.migration-baseline.source-revision",
    "art-design.migration-baseline.viewport-state-matrix",
  ]);
  assert.deepEqual(family.validators, [
    "audit/tests/art-migration-baseline.test.mjs",
    "audit/validate-art-migration-baseline.mjs",
  ]);
  const browserFamily = map.factFamilies.find((record) => record.id === "art-design.migration-browser-evidence");
  assert.equal(browserFamily.owner, "audit/art-migration-browser-evidence-v1.json");
  assert.deepEqual(browserFamily.owns, [
    "art-design.migration-browser-evidence.capture-contract",
    "art-design.migration-browser-evidence.exact-browser-identity",
    "art-design.migration-browser-evidence.exact-served-source",
    "art-design.migration-browser-evidence.harness-adapter",
    "art-design.migration-browser-evidence.passing-artifact-policy",
    "art-design.migration-browser-evidence.request-integrity",
    "art-design.migration-browser-evidence.visual-result-details",
    "art-design.migration-browser-evidence.visual-result-set",
  ]);
  assert.deepEqual(browserFamily.validators, family.validators);

  const missingFact = clone(map);
  missingFact.factFamilies.find((record) => record.id === "art-design.migration-baseline").owns.pop();
  assert.match((await validateRepositoryCodeMap(missingFact)).join("\n"), /complete closed ART-MIG-01 fact set/u);

  const missingRelation = clone(map);
  missingRelation.artifactRelations = missingRelation.artifactRelations.filter((relation) => relation.id !== "art-migration.browser-evidence-schema");
  assert.match((await validateRepositoryCodeMap(missingRelation)).join("\n"), /requires artifact relation art-migration\.browser-evidence-schema/u);

  const foreignOwner = clone(map);
  foreignOwner.factFamilies.find((record) => record.id === "art-design.migration-baseline").owner = "audit/art-asset-register-v1.json";
  assert.match((await validateRepositoryCodeMap(foreignOwner)).join("\n"), /sole canonical ART-MIG-01 owner/u);

  const foreignEvidenceOwner = clone(map);
  foreignEvidenceOwner.factFamilies.find((record) => record.id === "art-design.migration-browser-evidence").owner = "audit/art-migration-baseline-v1.json";
  assert.match((await validateRepositoryCodeMap(foreignEvidenceOwner)).join("\n"), /sole canonical retained-browser-evidence owner/u);
});

test("AI-first drift-control contract is exact, hash-bound, machine-default, and order-enforced", async () => {
  const authority = await readFile("AGENTS.md", "utf8");
  assert.deepEqual(
    { contractId: map.aiReaderContract.contractId, version: map.aiReaderContract.version },
    AI_READER_CONTRACT_REF,
  );
  assert.equal(map.aiReaderContract.primaryConsumer, "AI_AGENT");
  assert.equal(map.aiReaderContract.canonicalRecordFormat, "CLOSED_JSON");
  assert.equal(map.aiReaderContract.prosePolicy, "ANNOTATION_ONLY_NON_NORMATIVE");
  assert.equal(map.aiReaderContract.humanViewPolicy, "GENERATED_NON_AUTHORITATIVE_ONLY");
  assert.equal(map.aiReaderContract.commandOutputPolicy, "MACHINE_READABLE_BY_DEFAULT");
  assert.equal(map.aiReaderContract.ambiguityPolicy, "FAIL_CLOSED");
  assert.deepEqual(map.aiReaderContract.governedSystems, ["OWNERS", "CODE_MAP", "FEATURE_MAP", "TUTORIAL_MANIFEST", "ART_DESIGN", "BLAST_RADIUS", "GATES"]);
  assert.equal(map.factFamilies.find((family) => family.id === "art-design.source-decisions")?.owner, "audit/art-design-decision-register-v1.json");
  assert.equal(map.factFamilies.find((family) => family.id === "art-design.asset-acceptance")?.owner, "audit/art-asset-register-v1.json");
  assert.equal(map.factFamilies.find((family) => family.id === "art-design.runtime-tokens")?.owner, "assets/design/math-quest-design-tokens-v1.json");
  assert.equal(map.relationKindSemantics.CONSUMES, "TARGET_READS_SOURCE");
  assert.equal(map.relationKindSemantics.GENERATES, "SOURCE_WRITES_TARGET");
  assert.equal(map.relationKindSemantics.TESTS, "TARGET_TESTS_SOURCE");
  assert.equal(map.copyPolicySemantics.SECTION_MIRROR, "DECLARED_PROJECTION_MUST_EXACTLY_MIRROR_MARKED_OWNER_SECTION");
  assert.equal(map.projectionRelationshipSemantics.DOCUMENTED_REFERENCE, "PROJECTION_STORES_POINTER_OR_DIGEST_NOT_AUTHORITY");
  assert.equal(map.projectionRelationshipSemantics.STATE_DEPENDENT_DOCUMENTED_REFERENCE, "PROJECTION_STORES_OWNER_FACT_ONLY_WHEN_ITS_EVIDENCE_STATE_REQUIRES_THAT_FACT");
  assert.equal(aiReaderAuthoritySha256(authority, map.aiReaderContract), map.aiReaderContract.authority.sha256);

  const weakened = clone(map);
  weakened.aiReaderContract.prosePolicy = "HUMAN_PROSE_MAY_DEFINE_BEHAVIOR";
  assert.notDeepEqual(await validateRepositoryCodeMapSchema(weakened, REPOSITORY_CODE_MAP_SCHEMA_PATH), []);

  const staleAuthority = clone(map);
  staleAuthority.aiReaderContract.authority.sha256 = "0".repeat(64);
  assert.match((await validateRepositoryCodeMap(staleAuthority)).join("\n"), /authority sha256 does not match/u);

  const ambiguousDirection = clone(map);
  ambiguousDirection.relationKindSemantics.CONSUMES = "SOURCE_OR_TARGET_CONSUMES";
  assert.notDeepEqual(await validateRepositoryCodeMapSchema(ambiguousDirection, REPOSITORY_CODE_MAP_SCHEMA_PATH), []);

  const unordered = clone(map);
  unordered.factFamilies.reverse();
  assert.match((await validateRepositoryCodeMap(unordered)).join("\n"), /factFamilies must be sorted/u);

  const unorderedFacts = clone(map);
  unorderedFacts.factFamilies[0].owns.reverse();
  assert.match((await validateRepositoryCodeMap(unorderedFacts)).join("\n"), /owns must be sorted lexicographically/u);

  const falseMirror = clone(map);
  falseMirror.factFamilies.find((family) => family.id === "tutorial.linkage").projections[1].relationship = "EXACT_MIRROR";
  assert.match((await validateRepositoryCodeMap(falseMirror)).join("\n"), /may use EXACT_MIRROR only with SECTION_MIRROR/u);

  const missingVersionProjection = clone(map);
  const productVersion = missingVersionProjection.factFamilies.find((family) => family.id === "product.version");
  productVersion.projections = productVersion.projections.filter((projection) => projection.path !== "Serve-MathQuest.ps1");
  assert.match((await validateRepositoryCodeMap(missingVersionProjection)).join("\n"), /undeclared exact owner-literal projection Serve-MathQuest\.ps1/u);

  const clearanceProductVersion = clone(map.factFamilies.find((family) => family.id === "product.version"));
  clearanceProductVersion.projections = clearanceProductVersion.projections.filter((projection) => projection.path === "PUBLICATION_CLEARANCE.md");
  const versionLiteral = (await readFile("VERSION", "utf8")).trim();
  const pendingClearance = [{ path: "PUBLICATION_CLEARANCE.md", text: "Authorized release tag: PENDING\n" }];
  assert.deepEqual(exactOwnerLiteralProjectionIssues(clearanceProductVersion, versionLiteral, pendingClearance), []);
  const approvedClearance = [{ path: "PUBLICATION_CLEARANCE.md", text: `Authorized release tag: v${versionLiteral}\n` }];
  assert.deepEqual(exactOwnerLiteralProjectionIssues(clearanceProductVersion, versionLiteral, approvedClearance), []);
  clearanceProductVersion.projections = clearanceProductVersion.projections.filter((projection) => projection.path !== "PUBLICATION_CLEARANCE.md");
  assert.match(exactOwnerLiteralProjectionIssues(clearanceProductVersion, versionLiteral, approvedClearance).join("\n"), /undeclared exact owner-literal projection PUBLICATION_CLEARANCE\.md/u);

  const falseVersionProjection = clone(map);
  falseVersionProjection.factFamilies.find((family) => family.id === "product.version").projections.push({
    path: "manifest.webmanifest",
    relationship: "RUNTIME_EMBED",
  });
  falseVersionProjection.factFamilies.find((family) => family.id === "product.version").projections.sort((left, right) => left.path.localeCompare(right.path, "en"));
  assert.match((await validateRepositoryCodeMap(falseVersionProjection)).join("\n"), /manifest\.webmanifest but it does not contain the exact owner literal/u);

  const narrativeFact = clone(map);
  narrativeFact.factFamilies[0].owns = ["reviewed hosted browser identity"];
  assert.notDeepEqual(await validateRepositoryCodeMapSchema(narrativeFact, REPOSITORY_CODE_MAP_SCHEMA_PATH), []);

  const missingTutorialFact = clone(map);
  missingTutorialFact.factFamilies.find((family) => family.id === "tutorial.linkage").owns = missingTutorialFact.factFamilies.find((family) => family.id === "tutorial.linkage").owns.filter((fact) => fact !== "tutorial.linkage.answer-separation");
  assert.match((await validateRepositoryCodeMap(missingTutorialFact)).join("\n"), /complete Tutorial V2 fact set/u);

  const missingDeepUxValidator = clone(map);
  missingDeepUxValidator.factFamilies.find((family) => family.id === "tutorial.linkage").validators = missingDeepUxValidator.factFamilies.find((family) => family.id === "tutorial.linkage").validators.filter((file) => file !== "audit/playwright/deep-ux-census.spec.mjs");
  assert.match((await validateRepositoryCodeMap(missingDeepUxValidator)).join("\n"), /complete focused and Deep UX validator set/u);

  const missingTutorialRelation = clone(map);
  missingTutorialRelation.artifactRelations = missingTutorialRelation.artifactRelations.filter((relation) => relation.id !== "tutorial.build-spec");
  assert.match((await validateRepositoryCodeMap(missingTutorialRelation)).join("\n"), /requires artifact relation tutorial\.build-spec/u);
});
