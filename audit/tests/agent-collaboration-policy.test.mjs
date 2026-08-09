import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("agent collaboration policy is closed and bounded", async () => {
  const policy = JSON.parse(await read("audit/agent-collaboration-policy-v1.json"));
  assert.deepEqual(Object.keys(policy), [
    "schemaVersion",
    "policyId",
    "humanAuthority",
    "defaultLimits",
    "taskPacketRequiredFields",
    "peerCommunication",
    "independentEditing",
    "reviewerIndependence",
    "riskTriggeredReview",
    "durableCommunication",
    "reviewFindingRequiredFields",
    "takeoverRequiredFields",
    "optionalSixReviewerException",
    "workflow",
  ]);
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.policyId, "math-quest-agent-collaboration-v1");
  assert.deepEqual(policy.humanAuthority, {
    path: "AGENTS.md",
    heading: "Agent collaboration and bounded review",
  });
  assert.deepEqual(policy.defaultLimits, {
    maximumActiveAgentsIncludingLead: 3,
    recursiveSubagentsPermitted: false,
    independentReviewRounds: 1,
    correctionVerificationRounds: 1,
    freshFinalCohortForUnchangedWork: false,
    singleWriterPerOverlappingPath: true,
    reviewerAccess: "READ_ONLY_BY_DEFAULT",
    reviewerContext: "CONCISE_SEALED_TASK_PACKET",
  });
  assert.deepEqual(policy.riskTriggeredReview, [
    "MATHEMATICS_OR_GRADING",
    "CHILD_PRIVACY_OR_SECURITY",
    "PERSISTENCE_OR_MIGRATION",
    "RELEASE_OR_UPDATE_INFRASTRUCTURE",
    "BROAD_CHILD_UX_OR_ACCESSIBILITY",
    "OWNER_REQUESTED",
  ]);
  assert.deepEqual(policy.taskPacketRequiredFields, [
    "REQUIREMENTS",
    "RELEVANT_TASK_RECORDS_AND_REPORTS",
    "EXACT_REVISION_OR_COMMIT",
    "OWNED_FILES_AND_PATHS",
    "RELEVANT_DIFFS_AND_TEST_RESULTS",
    "UNRESOLVED_QUESTIONS",
  ]);
  assert.deepEqual(policy.peerCommunication, {
    directMessageTypes: ["QUESTIONS", "FINDINGS", "REQUESTS"],
    leadRetainsScopeAndIntegration: true,
  });
  assert.deepEqual(policy.independentEditing, {
    peerInspection: "READ_ONLY_BY_DEFAULT",
    overlappingEditsInSharedWorkspace: false,
    separateBranchOrWorktreeRequiredForIndependentEdits: true,
  });
  assert.deepEqual(policy.reviewerIndependence, {
    participatedInImplementation: false,
    conclusionPrimingPermitted: false,
    codeRequirementsAndObjectiveEvidenceProvided: true,
  });
  assert.deepEqual(policy.durableCommunication, {
    ordinaryCoordinationCreatesRepositoryRecord: false,
    materialFacts: [
      "SCOPE_OR_ACCEPTANCE_CHANGE",
      "BLOCKING_FINDING_DISPOSITION",
      "TASK_TAKEOVER",
      "UNRESOLVED_RELEASE_RISK",
    ],
    destination: "EXISTING_AUTHORITATIVE_RECORD",
  });
  assert.deepEqual(policy.reviewFindingRequiredFields, [
    "EXACT_REVISION_REVIEWED",
    "SPECIFIC_PROBLEM",
    "SUPPORTING_EVIDENCE_OR_REPRODUCTION",
    "AFFECTED_FILES_OR_OBSERVABLE_EFFECTS",
  ]);
  assert.deepEqual(policy.takeoverRequiredFields, [
    "EXACT_REVISION",
    "COMPLETED_WORK",
    "FOCUSED_RESULTS",
    "OWNER_DECISIONS",
    "FILE_OWNERSHIP",
    "UNRESOLVED_PROBLEMS",
  ]);
  assert.deepEqual(policy.optionalSixReviewerException, {
    ownerOptInRequired: true,
    reviewerCount: 6,
    releaseScopeAndInitialCandidateLineageRequired: true,
    cycles: 1,
    reviewerSubagentsPermitted: false,
    overlappingEditsPermitted: false,
    sameReviewersVerifyCorrections: true,
    correctionVerificationBindsExactSuccessorRevision: true,
    newFinalCohortPermitted: false,
  });
  assert.deepEqual(policy.workflow, [
    "IMPLEMENT",
    "FOCUSED_VERIFY",
    "INDEPENDENT_REVIEW_WHEN_WARRANTED",
    "CORRECT",
    "SAME_REVIEWER_VERIFY",
    "INTEGRATE",
  ]);
});

test("human authority preserves caps, ownership, handoff, and termination", async () => {
  const agents = await read("AGENTS.md");
  const section = agents.split(/^## Agent collaboration and bounded review\s*$/mu)[1]
    ?.split(/^<!-- FINISHED-WORK-POLICY-START -->\s*$/mu)[0] || "";
  for (const assertion of [
    /no more than three agents may be active[\s\S]*including the lead/iu,
    /subagents may not create further agents/iu,
    /Only one agent may edit a file or overlapping path at a\s+time/iu,
    /read-only by default/iu,
    /one independent review and one[\s\S]*correction-verification round/iu,
    /same reviewer verifies corrections/iu,
    /Do not create a second fresh or "final" cohort/iu,
    /existing authoritative issue, plan, decision, or[\s\S]*release record/iu,
    /When one agent takes over another's task[\s\S]*unresolved[\s\S]*problems/iu,
    /Implement[\s\S]*focused verification[\s\S]*independent review when warranted[\s\S]*integrate/iu,
    /optional six-reviewer release cycle[\s\S]*release scope and initial[\s\S]*candidate lineage[\s\S]*runs once/iu,
    /Every report and verification binds the exact revision/iu,
    /Every review finding must name the exact revision reviewed[\s\S]*specific[\s\S]*supporting evidence[\s\S]*affected files or[\s\S]*observable effects/iu,
    /requirements, relevant task records and reports, exact[\s\S]*revision or commit[\s\S]*owned files and paths[\s\S]*diffs and test results[\s\S]*unresolved questions/iu,
    /questions, findings, and requests directly/iu,
    /separate branch or worktree when independent editing/iu,
    /reviewer must not have participated in implementation or be primed with its[\s\S]*conclusions/iu,
  ]) assert.match(section, assertion);
});

test("release review plan cannot create preliminary and final critic cohorts", async () => {
  const plan = await read("docs/release/ios-ipados-pwa-beta2-plan.md");
  assert.doesNotMatch(plan, /run six new final critics/iu);
  assert.doesNotMatch(plan, /repeat[\s\S]{0,200}six-critic cycle/iu);
  assert.doesNotMatch(plan, /critical automated gates three clean times|every required automated gate[\s\S]{0,80}three clean times/iu);
  assert.doesNotMatch(plan, /rerun the complete automated and adjudication cycles/iu);
  assert.match(plan, /optional six-reviewer cycle[\s\S]*explicit[\s\S]*owner/iu);
  assert.match(plan, /same reviewers[\s\S]{0,120}verif(?:y|ication)/iu);
  assert.match(plan, /one final complete automated certification and adjudication/iu);
});

test("collaboration authority and regression are registered and executed", async () => {
  const [componentText, firstParty, publicManifest, runner] = await Promise.all([
    read("licenses/component-register-v1.json"),
    read("licenses/first-party-paths-v1.txt"),
    read("docs/release/public-file-manifest.txt"),
    read("audit/run-audit.ps1"),
  ]);
  const component = JSON.parse(componentText);
  for (const governedPath of [
    "audit/agent-collaboration-policy-v1.json",
    "audit/tests/agent-collaboration-policy.test.mjs",
  ]) {
    assert.equal(component.firstPartyPaths.includes(governedPath), true, governedPath);
    const expression = new RegExp(`^${governedPath.replaceAll("/", "\\/")}$`, "mu");
    assert.match(firstParty, expression);
    assert.match(publicManifest, expression);
  }
  assert.match(runner, /agent-collaboration-policy\.test\.mjs/iu);
  const developmentReturn = runner.lastIndexOf("if ($DevelopmentOnly)");
  assert.ok(developmentReturn > 0, "development-only return must remain explicit");
  assert.ok(
    runner.indexOf("agent-collaboration-policy.test.mjs") < developmentReturn,
    "collaboration policy must run before the development-only return",
  );
});
