import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ART_ASSET_REGISTER_PATH,
  ART_DESIGN_DECISION_REGISTER_PATH,
  DESIGN_TOKENS_PATH,
  contrastRatio,
  loadArtDesignGovernance,
  validateArtDesignDecisionSchema,
  validateArtDesignGovernance,
} from "../lib/art-design-governance.mjs";
import { trackedRepositoryPaths } from "../lib/repository-code-map.mjs";

const decisionBytes = await readFile(ART_DESIGN_DECISION_REGISTER_PATH);
const decisions = JSON.parse(decisionBytes);
const assets = JSON.parse(await readFile(ART_ASSET_REGISTER_PATH, "utf8"));
const tokens = JSON.parse(await readFile(DESIGN_TOKENS_PATH, "utf8"));

const clone = (value) => structuredClone(value);
const actualOptions = () => ({ decisionBytes, trackedPaths: trackedRepositoryPaths() });
const TEST_PATH = "assets/design/test-atmosphere.svg";
const TEST_SHA = "2".repeat(64);
const ATTRIBUTION_PATH = "licenses/test-art.md";
const ATTRIBUTION_SHA = "3".repeat(64);
const LICENCE_PATH = "LICENSE";
const LICENCE_SHA = "4".repeat(64);
const EVIDENCE_SHA = "5".repeat(64);
const CONSTRUCTION_EVIDENCE_SUFFIXES = Object.freeze(["input", "output", "constraints", "review", "authorization"]);
const evidenceRef = (evidencePath) => ({ path: evidencePath, sha256: EVIDENCE_SHA });
const EVIDENCE_PATHS = Object.freeze([
  ...decisions.constructionWorkflow.steps.flatMap((step) => CONSTRUCTION_EVIDENCE_SUFFIXES
    .map((suffix) => `audit/art-evidence/${step.id}-${suffix}.json`)),
  "audit/art-evidence/proof-construction.json",
  "audit/art-evidence/proof-rights.json",
]);

function selectedStepIds(count) {
  const selected = new Set(decisions.constructionWorkflow.stages.map((stage) =>
    decisions.constructionWorkflow.steps.find((step) => step.stage === stage.id).id));
  for (const step of decisions.constructionWorkflow.steps) {
    if (selected.size >= count) break;
    selected.add(step.id);
  }
  return selected;
}

function constructionRefs(stepId, completed = false) {
  const empty = {
    INPUT: [],
    OUTPUT: [],
    CONSTRAINTS_RESOLVED: [],
    UNRESOLVED_ISSUES: [],
    CORRECTIONS: [],
    REVIEW_DISPOSITION: [],
    NEXT_STAGE_AUTHORIZATION: [],
  };
  if (!completed) return empty;
  return {
    ...empty,
    INPUT: [evidenceRef(`audit/art-evidence/${stepId}-input.json`)],
    OUTPUT: [evidenceRef(`audit/art-evidence/${stepId}-output.json`)],
    CONSTRAINTS_RESOLVED: [evidenceRef(`audit/art-evidence/${stepId}-constraints.json`)],
    REVIEW_DISPOSITION: [evidenceRef(`audit/art-evidence/${stepId}-review.json`)],
    NEXT_STAGE_AUTHORIZATION: [evidenceRef(`audit/art-evidence/${stepId}-authorization.json`)],
  };
}

function constructionEvidence(tier, completed = false) {
  const count = tier === "TIER_1" ? 53 : tier === "TIER_2" ? 25 : 13;
  const selected = selectedStepIds(count);
  return decisions.constructionWorkflow.steps.map((step) => selected.has(step.id)
    ? {
      stepId: step.id,
      status: completed ? "APPLIED_PROVED" : "APPLICABLE_PENDING",
      evidenceRefs: constructionRefs(step.id, completed),
      notApplicableReason: null,
    }
    : {
      stepId: step.id,
      status: "NOT_APPLICABLE_JUSTIFIED",
      evidenceRefs: constructionRefs(step.id),
      notApplicableReason: `The ${tier} asset does not require this construction operation.`,
    });
}

function proofEvidence(completed = false) {
  return ["CONSTRUCTION", "RIGHTS"].map((proofId) => ({
    proofId,
    status: completed ? "PROVED" : "PENDING",
    evidenceRefs: completed ? [evidenceRef(`audit/art-evidence/proof-${proofId.toLowerCase()}.json`)] : [],
  }));
}

function assetRecord({ acceptanceState = "CANDIDATE", completed = false, tier = "TIER_3" } = {}) {
  return {
    id: "ART-ASSET-TEST-ATMOSPHERE",
    path: TEST_PATH,
    sha256: TEST_SHA,
    componentId: "test-atmosphere-component",
    semanticClass: "DECORATIVE_ATMOSPHERE",
    acceptanceState,
    workflowTier: tier,
    decisionIds: ["ART-SRC-001"],
    designRuleIds: ["ART-R-001"],
    featureIds: ["child.mechanic.action-scene"],
    tutorialRefs: ["ANCHOR:CHOOSE_NOTICE"],
    runtimeSelectors: acceptanceState === "CANDIDATE" ? [] : ["#test-atmosphere"],
    modes: ["DEFAULT"],
    permittedUses: acceptanceState === "CANDIDATE" ? ["EVALUATION_ONLY"] : ["ATMOSPHERE_ONLY"],
    requiredProofs: ["CONSTRUCTION", "RIGHTS"],
    mathFactMode: "NONE",
    answerDisclosureBoundary: "NOT_APPLICABLE",
    evidence: {
      constructionEvidence: constructionEvidence(tier, completed),
      proofEvidence: proofEvidence(completed),
      plainBaselineSelector: null,
      renderedEvidenceSelectors: completed ? ["#test-atmosphere"] : [],
      mathematicalOracleId: null,
      rightsEvidencePath: ATTRIBUTION_PATH,
      reviewedRevision: completed ? "a".repeat(40) : null,
      reviewedAssetSha256: completed ? TEST_SHA : null,
    },
  };
}

function fixtureOptions({ release = false } = {}) {
  return {
    componentBindings: {
      "test-atmosphere-component": {
        attributionRecord: ATTRIBUTION_PATH,
        kind: "image",
        licenceEvidence: LICENCE_PATH,
        paths: [TEST_PATH],
        sha256: TEST_SHA,
      },
    },
    decisionBytes,
    evidenceBindings: {
      [ATTRIBUTION_PATH]: { actualSha256: ATTRIBUTION_SHA, sha256: ATTRIBUTION_SHA },
      [LICENCE_PATH]: { actualSha256: LICENCE_SHA, sha256: LICENCE_SHA },
    },
    featureIds: ["child.mechanic.action-scene"],
    fileHashes: {
      [TEST_PATH]: TEST_SHA,
      ...Object.fromEntries(EVIDENCE_PATHS.map((evidencePath) => [evidencePath, EVIDENCE_SHA])),
    },
    releasePaths: release ? [TEST_PATH] : [],
    trackedPaths: [...trackedRepositoryPaths(), TEST_PATH, ...EVIDENCE_PATHS],
    tutorialRefs: ["ANCHOR:CHOOSE_NOTICE"],
  };
}

async function validateRecord(record, options = fixtureOptions()) {
  const register = clone(assets);
  register.records.push(record);
  return validateArtDesignGovernance(decisions, register, tokens, options);
}

test("art-design governance is schema-closed, cross-bound, ordered, and source-subordinate", async () => {
  const result = await loadArtDesignGovernance({ validationMode: process.env.MQ_ART_GOVERNANCE_MODE || "DEVELOPMENT" });
  assert.equal(result.decisions.sourceDecisions.length, 49);
  assert.equal(result.decisions.constructionWorkflow.steps.length, 53);
  assert.equal(result.decisions.themePolicy.worldIdentity, "MATHEMATICAL_CONSERVATORY_AND_WORKSHOP");
  assert.equal(result.decisions.themePolicy.scope, "ALL_USER_FACING_ROUTES");
  assert.equal(result.decisions.sourceBundle.authorityClass, "SOURCE_SUGGESTION_ONLY");
  assert.equal(result.decisions.sourceBundle.repositoryProjectionPolicy, "DIRECT_SOURCE_PROJECTION_FORBIDDEN");
  assert.equal(result.decisions.implementationDecisionLog.appendPolicy, "APPEND_ONLY_ORDER_ASCENDING");
  assert.equal(result.decisions.implementationDecisionLog.entries.at(-1).migrationId, "ART-MIG-05");
  assert.equal(result.tokens.status, "RUNTIME_QUESTION_ZONES_ACTIVE");
  assert.equal(result.tokens.projection.state, "ACTIVATED_EXACT_CONSUMERS");
  assert.equal(result.assets.version, "1.3.0");
  assert.equal(result.assets.records.length, 0);
});

test("owner-reviewed unsafe source proposals are modified or rejected rather than projected literally", () => {
  const byNumber = new Map(decisions.sourceDecisions.map((record) => [record.sourceNumber, record]));
  for (const number of [10, 13, 16, 18, 19, 20, 21, 22, 23, 24, 27, 30, 32, 34, 44, 45, 48, 49]) {
    assert.equal(byNumber.get(number).disposition, "REVIEWED_MODIFIED", `source decision ${number}`);
  }
  assert.equal(byNumber.get(35).disposition, "REVIEWED_REJECTED");
  assert.deepEqual(byNumber.get(35).designRuleIds, []);
  assert.match(byNumber.get(35).rejectedPortions.join(" "), /MOCKUPS_AS_PRODUCTION_FIXTURES/u);
});

test("construction workflow is complete, tiered, ordered, and applies to human or AI art", () => {
  const workflow = decisions.constructionWorkflow;
  assert.equal(workflow.appliesTo, "ALL_NEW_OR_MATERIALLY_REVISED_GAME_ART_HUMAN_OR_AI_CREATED");
  assert.deepEqual(workflow.steps.map((record) => record.order), Array.from({ length: 53 }, (_, index) => index + 1));
  assert.equal(workflow.tiers.find((record) => record.id === "TIER_1").minimumApplicableSteps, 53);
  assert.deepEqual(decisions.migrationSequence.map((record) => record.order), Array.from({ length: 16 }, (_, index) => index + 1));
});

test("art implementation decisions are durable, ordered, cross-linked, and superseded explicitly", async () => {
  const entry = decisions.implementationDecisionLog.entries[0];
  const correction = decisions.implementationDecisionLog.entries[1];
  const approval = decisions.implementationDecisionLog.entries[2];
  const zones = decisions.implementationDecisionLog.entries[3];
  const zoneApproval = decisions.implementationDecisionLog.entries[4];
  assert.equal(entry.id, "ART-DEC-001");
  assert.equal(entry.baseRevision, "f3a0c39b939d860c7531355489bddc1a0b4f3db9");
  assert.deepEqual(entry.affectedDesignRuleIds, ["ART-R-008", "ART-R-021"]);
  assert.equal(correction.id, "ART-DEC-002");
  assert.equal(correction.decisionId, "PRESERVE_LABELS_AND_BROWSER_INSPECTABLE_TOKEN_BINDINGS");
  assert.deepEqual(correction.affectedDesignRuleIds, ["ART-R-021"]);
  assert.equal(approval.decisionId, "OWNER_ACCEPTED_EXACT_ART_MIG_04_RENDERED_HANDOFF");
  assert.equal(approval.baseRevision, "0836f6f68abe648675fa02b091155801bceec2e6");
  assert.equal(zones.migrationId, "ART-MIG-05");
  assert.deepEqual(zones.affectedDesignRuleIds, ["ART-R-010", "ART-R-048"]);
  assert.equal(zoneApproval.id, "ART-DEC-005");
  assert.equal(zoneApproval.decisionId, "OWNER_ACCEPTED_EXACT_ART_MIG_05_RENDERED_HANDOFF");
  assert.equal(zoneApproval.baseRevision, "0836f6f68abe648675fa02b091155801bceec2e6");
  assert.ok(zoneApproval.adopted.includes("COMPARISON_SET_SHA256_CA16B30B5BA5F75E331391C7B7DB8A3F638C20CB5F19C64BA9E945A31ACDBAD2"));
  assert.ok(zoneApproval.adopted.includes("AFTER_RETEACH_PHONE_SHA256_0A254D29620EC1BBBC51391E26890DD417CC71D7BCC99EB367616BD636E49743"));
  assert.ok(zoneApproval.constraints.includes("ART_MIG_06_REQUIRES_NEW_HANDOFF"));

  const unknownRule = clone(decisions);
  unknownRule.implementationDecisionLog.entries[0].affectedDesignRuleIds = ["ART-R-999"];
  assert.match((await validateArtDesignGovernance(unknownRule, assets, tokens, actualOptions())).join("\n"), /references unknown design rule ART-R-999/u);

  const falseSupersession = clone(decisions);
  falseSupersession.implementationDecisionLog.entries[0].status = "SUPERSEDED";
  assert.match((await validateArtDesignGovernance(falseSupersession, assets, tokens, actualOptions())).join("\n"), /status does not match the declared supersession graph/u);

  const missingHistory = clone(decisions);
  missingHistory.implementationDecisionLog.entries = [];
  assert.match((await validateArtDesignDecisionSchema(missingHistory)).join("\n"), /must NOT have fewer than 1 items/u);
});

test("approved text pairings are independently recalculated and unsafe raw pairings are absent", () => {
  const colourById = new Map(tokens.colours.map((record) => [record.id, record.value]));
  const pairIds = new Set(tokens.approvedTextPairings.map((record) => record.id));
  assert.ok(!pairIds.has("pair.ink-muted-on-mineral"));
  assert.ok(!pairIds.has("pair.audio-on-ivory"));
  for (const pairing of tokens.approvedTextPairings) {
    const ratio = contrastRatio(colourById.get(pairing.foregroundId), colourById.get(pairing.backgroundId));
    const minimum = pairing.minimumClass === "NORMAL_TEXT" ? 4.5 : 3;
    assert.ok(ratio + tokens.contrastPolicy.ratioTolerance >= minimum, `${pairing.id} ratio ${ratio}`);
    assert.ok(Math.abs(ratio - pairing.measuredRatio) <= tokens.contrastPolicy.ratioTolerance, pairing.id);
  }
});

test("[NC-ART-DESIGN-UNRESOLVED-PROJECTION] unresolved, rejected, unregistered, stale, and mathematically unproved art fails closed", async () => {
  const unresolved = clone(decisions);
  const source = unresolved.sourceDecisions.find((record) => record.id === "ART-SRC-013");
  source.disposition = "UNRESOLVED";
  source.runtimeProjection = "REFERENCE_ONLY";
  source.designRuleIds = [];
  assert.match((await validateArtDesignGovernance(unresolved, assets, tokens, actualOptions())).join("\n"), /projects nonprojectable source decision ART-SRC-013|design tokens project nonprojectable source decision ART-SRC-013/u);

  const rejected = assetRecord();
  rejected.decisionIds = ["ART-SRC-035"];
  const rejectedIssues = (await validateRecord(rejected)).join("\n");
  assert.match(rejectedIssues, /projects nonprojectable decision ART-SRC-035/u);
  assert.match(rejectedIssues, /design rule ART-R-001 is not sourced by a bound decision/u);

  const badContrast = clone(tokens);
  badContrast.colours.find((record) => record.id === "colour.action.primary").value = "#2FD5E8";
  assert.match((await validateArtDesignGovernance(decisions, assets, badContrast, actualOptions())).join("\n"), /measuredRatio is stale|contrast .* is below/u);

  const tracked = [...trackedRepositoryPaths(), "assets/design/unregistered-scene.png"];
  assert.match((await validateArtDesignGovernance(decisions, assets, tokens, { decisionBytes, trackedPaths: tracked })).join("\n"), /unregistered-scene\.png: governed art asset is absent/u);

  const sourceProjection = [...trackedRepositoryPaths(), `audit/${decisions.sourceBundle.fileName}`];
  assert.match((await validateArtDesignGovernance(decisions, assets, tokens, { decisionBytes, trackedPaths: sourceProjection })).join("\n"), /source bundle material may not be projected directly/u);
});

test("source provenance and projection must match the source bundle and linked rule activation", async () => {
  const stalePath = clone(decisions);
  stalePath.sourceDecisions[0].sourcePath = "other.md";
  assert.match((await validateArtDesignGovernance(stalePath, assets, tokens, actualOptions())).join("\n"), /sourcePath (?:does not match|must be equal to constant)/u);

  const staleHash = clone(decisions);
  staleHash.sourceDecisions[0].sourceFileSha256 = "0".repeat(64);
  assert.match((await validateArtDesignGovernance(staleHash, assets, tokens, actualOptions())).join("\n"), /sourceFileSha256 does not match/u);

  const forbiddenActive = clone(decisions);
  forbiddenActive.sourceDecisions.find((record) => record.id === "ART-SRC-013").runtimeProjection = "FORBIDDEN";
  const projectionIssues = (await validateArtDesignGovernance(forbiddenActive, assets, tokens, actualOptions())).join("\n");
  assert.match(projectionIssues, /runtimeProjection FORBIDDEN conflicts with GOVERNANCE_ACTIVE/u);
  assert.match(projectionIssues, /design tokens source decision ART-SRC-013 is not an active governance rule/u);
});

test("missing workflow stages and stale exact register bindings fail closed", async () => {
  const missingStep = clone(decisions);
  missingStep.constructionWorkflow.steps.pop();
  assert.match((await validateArtDesignGovernance(missingStep, assets, tokens, actualOptions())).join("\n"), /must NOT have fewer than 53 items|step orders are not contiguous/u);

  const staleAssets = clone(assets);
  staleAssets.decisionRegisterBinding.sha256 = "0".repeat(64);
  assert.match((await validateArtDesignGovernance(decisions, staleAssets, tokens, actualOptions())).join("\n"), /art asset register decision-register binding is stale/u);

  const staleTokens = clone(tokens);
  staleTokens.decisionRegisterBinding.sha256 = "0".repeat(64);
  assert.match((await validateArtDesignGovernance(decisions, assets, staleTokens, actualOptions())).join("\n"), /design tokens decision-register binding is stale/u);
});

test("candidate assets are exact registered evaluation bytes and cannot enter runtime or release", async () => {
  assert.deepEqual(await validateRecord(assetRecord()), []);

  const releaseMode = fixtureOptions();
  releaseMode.validationMode = "RELEASE";
  assert.match((await validateRecord(assetRecord(), releaseMode)).join("\n"), /is not release-certified for release validation/u);

  const runtimeCandidate = assetRecord();
  runtimeCandidate.runtimeSelectors = ["#test-atmosphere"];
  assert.match((await validateRecord(runtimeCandidate)).join("\n"), /candidate may not declare runtime selectors/u);

  const shippedCandidate = assetRecord();
  assert.match((await validateRecord(shippedCandidate, fixtureOptions({ release: true }))).join("\n"), /candidate may not appear in the release shell/u);

  const claimedUse = assetRecord();
  claimedUse.permittedUses = ["ATMOSPHERE_ONLY"];
  assert.match((await validateRecord(claimedUse)).join("\n"), /candidate permittedUses must equal EVALUATION_ONLY/u);

  const rejectedState = assetRecord();
  rejectedState.acceptanceState = "REJECTED";
  assert.match((await validateRecord(rejectedState)).join("\n"), /must be equal to one of the allowed values/u);
});

test("implemented and release-certified assets require complete exact runtime evidence", async () => {
  const implemented = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  assert.deepEqual(await validateRecord(implemented, fixtureOptions({ release: true })), []);

  const releaseCertified = assetRecord({ acceptanceState: "RELEASE_CERTIFIED", completed: true });
  assert.deepEqual(await validateRecord(releaseCertified, fixtureOptions({ release: true })), []);

  const pending = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  const pendingStep = pending.evidence.constructionEvidence.find((entry) => entry.status === "APPLIED_PROVED");
  pendingStep.status = "APPLICABLE_PENDING";
  pendingStep.evidenceRefs = constructionRefs(pendingStep.stepId);
  pending.evidence.proofEvidence[0] = { proofId: "CONSTRUCTION", status: "PENDING", evidenceRefs: [] };
  const pendingIssues = (await validateRecord(pending, fixtureOptions({ release: true }))).join("\n");
  assert.match(pendingIssues, /runtime acceptance state has pending construction evidence/u);
  assert.match(pendingIssues, /runtime acceptance state has unproved required evidence/u);

  const notShipped = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  assert.match((await validateRecord(notShipped)).join("\n"), /runtime acceptance state is absent from the release shell/u);
});

test("proved construction and proof evidence bind tracked files and their actual SHA-256 bytes", async () => {
  const untracked = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  untracked.evidence.constructionEvidence.find((entry) => entry.status === "APPLIED_PROVED")
    .evidenceRefs.INPUT[0].path = "audit/art-evidence/missing.json";
  const untrackedIssues = (await validateRecord(untracked, fixtureOptions({ release: true }))).join("\n");
  assert.match(untrackedIssues, /evidence audit\/art-evidence\/missing\.json is not a tracked repository file/u);
  assert.match(untrackedIssues, /bytes are unavailable for exact hash verification/u);

  const staleDigest = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  staleDigest.evidence.proofEvidence[0].evidenceRefs[0].sha256 = "0".repeat(64);
  assert.match(
    (await validateRecord(staleDigest, fixtureOptions({ release: true }))).join("\n"),
    /proof CONSTRUCTION evidence .* SHA-256 does not match the actual evidence bytes/u,
  );

  const unstructured = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  unstructured.evidence.proofEvidence[0].evidenceRefs[0] = "audit/art-evidence/proof-construction.json";
  assert.match((await validateRecord(unstructured, fixtureOptions({ release: true }))).join("\n"), /must be object/u);
});

test("every tier records all 53 dispositions and applies at least one step in every stage", async () => {
  const tier2 = assetRecord({ tier: "TIER_2" });
  assert.deepEqual(await validateRecord(tier2), []);

  const fakeTier2 = assetRecord({ tier: "TIER_2" });
  fakeTier2.evidence.constructionEvidence = decisions.constructionWorkflow.steps.map((step, index) => index < 25
    ? { stepId: step.id, status: "APPLICABLE_PENDING", evidenceRefs: constructionRefs(step.id), notApplicableReason: null }
    : { stepId: step.id, status: "NOT_APPLICABLE_JUSTIFIED", evidenceRefs: constructionRefs(step.id), notApplicableReason: "Claimed not applicable." });
  assert.match((await validateRecord(fakeTier2)).join("\n"), /TIER_2 must apply at least one construction step from every mandatory stage/u);

  const missingDisposition = assetRecord();
  missingDisposition.evidence.constructionEvidence.pop();
  assert.match((await validateRecord(missingDisposition)).join("\n"), /must NOT have fewer than 53 items|must cover all 53 workflow steps/u);

  const unjustified = assetRecord();
  unjustified.evidence.constructionEvidence.find((entry) => entry.status === "NOT_APPLICABLE_JUSTIFIED").notApplicableReason = "";
  assert.match((await validateRecord(unjustified)).join("\n"), /must NOT have fewer than 1 characters/u);

  const missingAppliedInput = assetRecord({ acceptanceState: "IMPLEMENTED", completed: true });
  missingAppliedInput.evidence.constructionEvidence.find((entry) => entry.status === "APPLIED_PROVED").evidenceRefs.INPUT = [];
  assert.match((await validateRecord(missingAppliedInput, fixtureOptions({ release: true }))).join("\n"), /INPUT must NOT have fewer than 1 items/u);
});

test("asset rights bind an eligible bundled image, actual asset bytes, and actual registered evidence", async () => {
  const record = assetRecord();

  const ineligible = fixtureOptions();
  ineligible.componentBindings[record.componentId].kind = "design-token-contract";
  assert.match((await validateRecord(record, ineligible)).join("\n"), /is not an image component/u);

  const arbitraryComponent = assetRecord();
  arbitraryComponent.componentId = "github-checkout";
  assert.match((await validateRecord(arbitraryComponent)).join("\n"), /unknown or ineligible file-bearing image component github-checkout/u);

  const fakeRights = fixtureOptions();
  fakeRights.evidenceBindings[ATTRIBUTION_PATH].actualSha256 = "0".repeat(64);
  assert.match((await validateRecord(record, fakeRights)).join("\n"), /component evidence licenses\/test-art\.md does not match its actual bytes/u);

  const fakeAsset = fixtureOptions();
  fakeAsset.fileHashes[TEST_PATH] = "0".repeat(64);
  assert.match((await validateRecord(record, fakeAsset)).join("\n"), /SHA-256 does not match the actual asset bytes/u);

  const wrongEvidence = assetRecord();
  wrongEvidence.evidence.rightsEvidencePath = LICENCE_PATH;
  assert.match((await validateRecord(wrongEvidence)).join("\n"), /rightsEvidencePath does not equal the component attribution record/u);
});

test("asset records bind live features, tutorial identities, and exact workflow evidence", async () => {
  const mutant = assetRecord();
  mutant.featureIds = ["child.mechanic.unknown"];
  mutant.tutorialRefs = ["ANCHOR:UNKNOWN"];
  const selectedInLastStage = mutant.evidence.constructionEvidence.find((entry) => entry.stepId === "ART-WF-46");
  selectedInLastStage.status = "NOT_APPLICABLE_JUSTIFIED";
  selectedInLastStage.notApplicableReason = "Deliberately removed to prove stage coverage.";
  const replacement = mutant.evidence.constructionEvidence.find((entry) => entry.status === "NOT_APPLICABLE_JUSTIFIED" && entry.stepId !== "ART-WF-46");
  replacement.status = "APPLICABLE_PENDING";
  replacement.notApplicableReason = null;
  const issues = (await validateRecord(mutant)).join("\n");
  assert.match(issues, /unknown feature/u);
  assert.match(issues, /unknown tutorial identity/u);
  assert.match(issues, /every mandatory stage/u);
});
