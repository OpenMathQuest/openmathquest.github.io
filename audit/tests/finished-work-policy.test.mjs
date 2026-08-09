import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath, encoding = "utf8") => readFile(path.join(root, relativePath), encoding);
const clone = (value) => JSON.parse(JSON.stringify(value));
const exactKeys = (value, keys) => Boolean(
  value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length
  && keys.every((key, index) => Object.keys(value)[index] === key),
);

const EXPECTED_SCOPE = {
  changes: "EVERY_CHANGE",
  actors: ["PERSON", "SINGLE_AGENT", "PARALLEL_AGENTS"],
  relationshipToExistingRequirements: "SUPPLEMENT_WITHOUT_SILENT_REPLACEMENT_OR_RELAXATION",
  conflictDisposition: "STOP_RECORD_IN_EXISTING_OWNER_AND_OBTAIN_OWNER_DECISION",
  inferPermissionToWeakenGate: false,
};

const EXPECTED_STATES = {
  implemented: {
    realProductionPathExists: true,
    realUserCanOperateAsIntended: true,
    genuineExpectedValuesChecked: true,
    applicableFocusedEvidencePasses: true,
    alonePermitsFormalCompletion: false,
  },
  "release-certified": {
    implementedBehaviorRequired: true,
    exactFrozenCandidateRequired: true,
    completeCertificationGatePassRequired: true,
    requiredFindingsReviewed: true,
    missingEvidencePermitsState: false,
  },
  shipped: {
    releaseCertifiedExactBytesRequired: true,
    actualPublicationRequired: true,
  },
  blocked: {
    delivered: false,
    specificReasonRequired: true,
    unfinishedWorkRequired: true,
    unblockConditionRequired: true,
    mayClaimImplementedCertifiedShippedOrComplete: false,
  },
  declined: {
    delivered: false,
    specificReasonRequired: true,
    unfinishedWorkRequired: true,
    unsafeOrProhibitedBasis: true,
    mayClaimImplementedCertifiedShippedOrComplete: false,
  },
};

const EXPECTED_CLAUSES = [
  ["FWP-1", [
    "APPLIES_TO_EVERY_CHANGE_AND_ALL_ACTOR_MODES",
    "SUPPLEMENTS_EXISTING_REQUIREMENTS_WITHOUT_RELAXATION",
    "CONFLICTS_STOP_FOR_OWNER_DECISION_IN_EXISTING_RECORD",
    "GATE_WEAKENING_PERMISSION_IS_NEVER_INFERRED",
    "PRODUCT_IS_WORKING_ACCESSIBLE_LEGALLY_DISTRIBUTABLE_CHILD_USABLE_GAME_WITH_MATH_PRIVACY_AND_OFFLINE_CONTRACTS",
  ]],
  ["FWP-2", [
    "IMPLEMENTATION_DELIVERS_A_GENUINE_PRODUCT_OR_SAFEGUARD_EFFECT",
    "FACTS_BELONG_IN_EXISTING_AUTHORITATIVE_RECORDS_WITHOUT_DUPLICATE_PAPERWORK",
    "NEW_ARTIFACTS_REQUIRE_AN_ESTABLISHED_GATE_OR_NO_SUITABLE_AUTHORITY",
    "DOCUMENTATION_DOES_NOT_SUBSTITUTE_FOR_REQUESTED_IMPLEMENTATION",
    "DEVELOPMENT_USES_FOCUSED_EFFECT_SENSITIVE_CHECKS",
    "COMPLETE_GAUNTLET_IS_RESERVED_FOR_FROZEN_CANDIDATE_AND_REQUIRED_GATES_ARE_NOT_WEAKENED_SKIPPED_SHRUNK_OR_IMPROPERLY_DEFERRED",
  ]],
  ["FWP-3", [
    "PRODUCT_TEST_FIXTURE_THRESHOLD_AND_REPORT_MAY_NOT_BE_CHANGED_TO_FAKE_A_PASS",
    "BYPASSES_WEAKENED_ASSERTIONS_REMOVED_COVERAGE_SKIPS_AND_FAVOURABLE_SELECTION_ARE_FORBIDDEN",
    "MOCKS_STUBS_SAMPLES_AND_HAND_PICKED_CASES_PROVE_ONLY_THEIR_NARROW_SCOPE",
    "EXPECTED_ANSWERS_INDEPENDENT_ORACLES_GOLDENS_AND_DEFECT_CASES_ARE_LEGITIMATE_WHEN_CONTRACT_DERIVED_AND_EFFECT_SENSITIVE",
    "OBSOLETE_TEST_CHANGES_REQUIRE_CLASSIFICATION_DOCUMENTATION_NEEDED_APPROVAL_AND_EQUAL_OR_STRONGER_COVERAGE",
    "COMPLETION_TERMS_AND_CORRECTIONS_MUST_BE_TRUTHFUL_AND_USE_EXISTING_OWNING_RECORDS",
  ]],
  ["FWP-4", [
    "DIFFICULTY_DOES_NOT_REDEFINE_OR_CLOSE_IMPLEMENTATION_AND_SAFE_IN_SCOPE_ALTERNATIVES_ARE_EXHAUSTED",
    "BLOCKED_OR_DECLINED_WORK_STATES_REASON_UNFINISHED_WORK_AND_PROGRESS_CONDITION",
    "BLOCKED_DECLINED_OR_SUBSTITUTED_WORK_IS_NOT_RECORDED_AS_DELIVERED",
    "NON_IMPLEMENTATION_ARTIFACT_COMPLETES_ONLY_ITS_EXPLICIT_SCOPE",
    "REDUCED_OR_PROTOTYPE_SCOPE_REQUIRES_OWNER_APPROVAL_AND_RECORDED_ACCEPTANCE_CRITERIA",
    "FORMAL_COMPLETION_REQUIRES_EXACT_FROZEN_CANDIDATE_COMPLETE_GATE_PASS",
  ]],
  ["FWP-5", [
    "DETERMINISTIC_CLAIMS_ARE_AUTOMATED_WITHOUT_OVERSTATING_PROOF",
    "PERCEPTION_COMPREHENSION_PLATFORM_AND_REAL_ENVIRONMENT_CLAIMS_KEEP_HUMAN_BROWSER_OR_DEVICE_EVIDENCE",
    "DEVELOPMENT_USES_AFFECTED_FOCUSED_AUTOMATION_AND_TARGETED_HUMAN_REVIEW",
    "RELEASE_VERDICTS_BIND_TO_EXACT_FROZEN_CANDIDATE_AND_MISSING_EVIDENCE_REMAINS_PENDING",
    "EVIDENCE_USES_EXISTING_ARTIFACTS_EXCLUDES_UNNECESSARY_PERSONAL_DATA_AND_IDENTIFIES_OBSERVATION_CANDIDATE_PLATFORM_AND_CONFIGURATION",
  ]],
  ["FWP-6", [
    "FINISH_LINE_IS_DEFINED_BEFORE_IMPLEMENTATION_IN_AN_EXISTING_OWNING_OR_WORKING_RECORD",
    "BROAD_RISKY_EDUCATIONAL_PRIVACY_OR_RELEASE_WORK_REQUIRES_DURABLE_ACCEPTANCE_CRITERIA",
    "CRITERIA_IDENTIFY_PRODUCT_EFFECT_USER_EXPERIENCE_CONTRACTS_FOCUSED_PROOF_LIMITS_AND_FINAL_RELEASE_EVIDENCE",
    "CONFIRMED_DEFECTS_GET_EFFECT_SENSITIVE_REGRESSIONS_AND_PARALLEL_SUBTASKS_DO_NOT_COMPLETE_PARENT_WORK",
    "MATERIAL_SCOPE_CHANGE_REQUIRES_PRIOR_OWNER_APPROVAL_AND_DIFFICULTY_NEVER_NARROWS_THE_FINISH_LINE",
  ]],
].map(([id, requiredAssertions]) => ({ id, requiredAssertions }));

const EXPECTED_AUTHORITY = {
  path: "AGENTS.md",
  startMarker: "<!-- FINISHED-WORK-POLICY-START -->",
  endMarker: "<!-- FINISHED-WORK-POLICY-END -->",
  normative: true,
  machineMirrorPath: "audit/finished-work-policy-v1.json",
  machineMirrorRole: "CLOSED_MACHINE_READABLE_MIRROR",
  hashAlgorithm: "SHA-256",
  hashByteRange: "AFTER_START_MARKER_BEFORE_END_MARKER",
};

function markerCount(bytes, marker) {
  const needle = Buffer.from(marker, "utf8");
  let count = 0;
  for (let offset = 0; (offset = bytes.indexOf(needle, offset)) !== -1; offset += needle.length) count += 1;
  return count;
}

function extractAuthority(bytes, authority) {
  if (markerCount(bytes, authority.startMarker) !== 1 || markerCount(bytes, authority.endMarker) !== 1) return null;
  const start = bytes.indexOf(Buffer.from(authority.startMarker, "utf8"));
  const end = bytes.indexOf(Buffer.from(authority.endMarker, "utf8"));
  if (end <= start) return null;
  return bytes.subarray(start + Buffer.byteLength(authority.startMarker, "utf8"), end);
}

function validPolicy(policy, sectionSha256) {
  if (!exactKeys(policy, ["schemaVersion", "policyId", "approvedOn", "scope", "completionStates", "clauses", "humanAuthority"])) return false;
  if (policy.schemaVersion !== 1 || policy.policyId !== "finished-work-policy-v1" || policy.approvedOn !== "2026-08-02") return false;
  if (!assertSafeDeepEqual(policy.scope, EXPECTED_SCOPE)) return false;
  if (!assertSafeDeepEqual(policy.completionStates, EXPECTED_STATES)) return false;
  if (!assertSafeDeepEqual(policy.clauses, EXPECTED_CLAUSES)) return false;
  if (!exactKeys(policy.humanAuthority, [...Object.keys(EXPECTED_AUTHORITY), "sectionSha256"])) return false;
  if (!assertSafeDeepEqual(
    Object.fromEntries(Object.keys(EXPECTED_AUTHORITY).map((key) => [key, policy.humanAuthority[key]])),
    EXPECTED_AUTHORITY,
  )) return false;
  return /^[a-f0-9]{64}$/u.test(policy.humanAuthority.sectionSha256)
    && policy.humanAuthority.sectionSha256 === sectionSha256;
}

function assertSafeDeepEqual(actual, expected) {
  try { assert.deepEqual(actual, expected); return true; } catch { return false; }
}

test("the approved human authority is unique, exact, and hash-bound", async () => {
  const [agentsBytes, policyText] = await Promise.all([
    read("AGENTS.md", null),
    read("audit/finished-work-policy-v1.json"),
  ]);
  const policy = JSON.parse(policyText);
  const sectionBytes = extractAuthority(agentsBytes, policy.humanAuthority);
  assert.ok(sectionBytes, "the exact policy markers must occur once in order");
  const section = sectionBytes.toString("utf8");
  assert.equal(section.includes("\ufffd"), false, "the authority must be valid UTF-8 without replacement text");
  assert.match(section, /^\r?\n## What counts as finished work\r?\n/mu);
  assert.match(section, /The product is the working, accessible, legally distributable game/u);
  assert.match(section, /must never automatically transmit child[\s\S]*deliberate[\s\S]*grown-up-controlled export or share/iu);
  assert.match(section, /implemented[\s\S]*release-certified[\s\S]*shipped/iu);
  assert.match(section, /Missing evidence remains\s+pending; a script cannot convert it into a pass/u);
  assert.match(section, /Never narrow the finish line afterward\s+merely because the original work proved difficult/u);
  const sha256 = createHash("sha256").update(sectionBytes).digest("hex");
  assert.equal(sha256, policy.humanAuthority.sectionSha256);
});

test("the machine-readable mirror is closed over all six approved clauses and five work states", async () => {
  const [agentsBytes, policyText] = await Promise.all([
    read("AGENTS.md", null),
    read("audit/finished-work-policy-v1.json"),
  ]);
  const policy = JSON.parse(policyText);
  const sectionBytes = extractAuthority(agentsBytes, policy.humanAuthority);
  const sha256 = createHash("sha256").update(sectionBytes).digest("hex");
  assert.equal(validPolicy(policy, sha256), true);
  assert.equal(new Set(policy.clauses.flatMap((clause) => clause.requiredAssertions)).size, 33);
});

test("essential policy mutations fail instead of manufacturing completion", async () => {
  const [agentsBytes, policyText] = await Promise.all([
    read("AGENTS.md", null),
    read("audit/finished-work-policy-v1.json"),
  ]);
  const policy = JSON.parse(policyText);
  const sectionBytes = extractAuthority(agentsBytes, policy.humanAuthority);
  const sha256 = createHash("sha256").update(sectionBytes).digest("hex");
  const mutations = [
    (value) => { value.unreviewed = true; },
    (value) => { value.scope.inferPermissionToWeakenGate = true; },
    (value) => { value.completionStates.implemented.alonePermitsFormalCompletion = true; },
    (value) => { value.completionStates["release-certified"].missingEvidencePermitsState = true; },
    (value) => { value.completionStates.shipped.actualPublicationRequired = false; },
    (value) => { value.completionStates.blocked.delivered = true; },
    (value) => { value.completionStates.declined.mayClaimImplementedCertifiedShippedOrComplete = true; },
    ...EXPECTED_CLAUSES.map((_, index) => (value) => { value.clauses[index].requiredAssertions.pop(); }),
    (value) => { value.humanAuthority.normative = false; },
    (value) => { value.humanAuthority.sectionSha256 = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    const candidate = clone(policy);
    mutate(candidate);
    assert.equal(validPolicy(candidate, sha256), false);
  }
});

test("finished-work states preserve the frozen-candidate certification cadence", async () => {
  const [policy, cadence] = await Promise.all([
    read("audit/finished-work-policy-v1.json").then(JSON.parse),
    read("audit/certification-cadence-v1.json").then(JSON.parse),
  ]);
  const compatible = (candidate) => (
    candidate.development.formalCompletionPermitted === false
    && candidate.release.freezeRequired === true
    && candidate.release.candidateIdentity === "EXACT_COMMIT_AND_PUBLIC_PAYLOAD"
    && candidate.release.scope === "COMPLETE_CERTIFICATION_SYSTEM"
    && candidate.release.postCertificationChange === "INVALIDATE_REFREEZE_RERUN_FULL"
    && policy.completionStates.implemented.alonePermitsFormalCompletion === false
    && policy.completionStates["release-certified"].exactFrozenCandidateRequired === true
    && policy.completionStates["release-certified"].completeCertificationGatePassRequired === true
  );
  assert.equal(compatible(cadence), true);
  for (const mutate of [
    (value) => { value.development.formalCompletionPermitted = true; },
    (value) => { value.release.freezeRequired = false; },
    (value) => { value.release.postCertificationChange = "RERUN_AFFECTED_ONLY"; },
  ]) {
    const candidate = clone(cadence);
    mutate(candidate);
    assert.equal(compatible(candidate), false);
  }
});

test("the policy and its regression are registered and run by both focused and release entry points", async () => {
  const [register, firstParty, publicManifest, runner] = await Promise.all([
    read("licenses/component-register-v1.json").then(JSON.parse),
    read("licenses/first-party-paths-v1.txt"),
    read("docs/release/public-file-manifest.txt"),
    read("audit/run-audit.ps1"),
  ]);
  for (const governedPath of [
    "audit/finished-work-policy-v1.json",
    "audit/tests/finished-work-policy.test.mjs",
  ]) {
    assert.equal(register.firstPartyPaths.includes(governedPath), true, governedPath);
    assert.equal(firstParty.split(/\r?\n/u).includes(governedPath), true, governedPath);
    assert.equal(publicManifest.split(/\r?\n/u).includes(governedPath), true, governedPath);
  }
  assert.match(runner, /tests\\finished-work-policy\.test\.mjs/u);
  const developmentReturn = runner.lastIndexOf("if ($DevelopmentOnly)");
  assert.ok(developmentReturn > 0, "development-only return must remain explicit");
  assert.ok(runner.indexOf("finished-work-policy.test.mjs") < developmentReturn);
});

test("governing guidance links to the one authority and uses truthful completion language", async () => {
  const paths = [
    "CONTRIBUTING.md",
    "README.md",
    "OPEN_SOURCE_POLICY.md",
    "docs/development/build-spec.md",
    "docs/release/checklist.md",
    "docs/release/publication-gates.md",
    "docs/release/readiness.md",
    "docs/repository-structure.md",
  ];
  const records = await Promise.all(paths.map(async (relativePath) => [relativePath, await read(relativePath)]));
  for (const [relativePath, content] of records) {
    assert.match(content, /AGENTS\.md#what-counts-as-finished-work/u, relativePath);
  }
  const combined = records.map(([, content]) => content).join("\n");
  assert.match(combined, /\*\*implemented\*\*[\s\S]*\*\*release-certified\*\*[\s\S]*\*\*shipped\*\*/u);
  assert.match(combined, /equal-or-stronger effect-sensitive protection/u);
  assert.match(combined, /ad hoc status/u);
  assert.match(combined, /never automatically transmits child data|Never transmit child data automatically/u);
});
