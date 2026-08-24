import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENGINE_BRANCH_COVERAGE_MINIMUM_PERCENT,
  evaluateGithubEnforcementSnapshot,
  GATE_INTEGRITY_POLICY,
  loadGateIntegrityPolicy,
  REPRESENTATIVE_MUTATION_FAMILY_COUNT,
  requiredOutcomeStatuses,
  summarizeGateOutcomes,
  validateGateIntegrityPolicy,
  validateGateIntegrityPolicySchema,
} from "../lib/gate-integrity-policy.mjs";
import { normalizeGithubEnforcementSnapshot } from "../verify-github-gate-enforcement.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));

test("the gate-integrity policy is closed, ordered, and complete", async () => {
  const policy = await loadGateIntegrityPolicy();
  assert.equal(policy.gateFamilies.length, 18);
  assert.equal(new Set(policy.gateFamilies.map((record) => record.negativeControl.id)).size, 18);
  assert.equal(policy.enforcement.requiredPullRequestCheck, "development-checks");
  assert.deepEqual(policy.enforcement.prohibitedRequiredPullRequestChecks, ["full-audit"]);
  assert.equal(policy.retryPolicy.automaticRetries, 0);
  assert.equal(policy.executionPolicy.local.maximumConcurrentLanes, 1);
  assert.equal(policy.executionPolicy.githubHosted.maximumConcurrentLanes, 2);
  assert.equal(policy.executionPolicy.githubHosted.adoptionStatus, "DISQUALIFIED_MEASURED_QUALIFICATION");
  assert.equal(policy.executionPolicy.githubHosted.defaultBeforeQualification, "SERIAL_REFERENCE");
  assert.equal(policy.executionPolicy.githubHosted.qualificationEvidenceLocation, "RUNNER_TEMP_OUTSIDE_REPOSITORY_CHECKOUT");
  assert.deepEqual(policy.executionPolicy.githubHosted.qualificationResult, {
    workflowRunId: 32557129231,
    candidateId: "1259a58b55a8954addda13151e0e1df3b2067452:803f72f99a3084f0187e39794a0997e6d38fd84ee3fdd47e2efe76456823d6fc",
    evidenceArtifactId: 9471938142,
    serialWallDurationMs: 410960,
    boundedWallDurationMs: 331017,
    measuredWallTimeReductionPercent: 19.45,
    minimumRequiredWallTimeReductionPercent: 20,
    evidenceEquivalent: false,
    outcome: "FAIL",
    issues: [
      "TIMING_FREE_CANONICAL_GATE_EVIDENCE_DIFFERED",
      "MEASURED_REDUCTION_BELOW_MINIMUM",
    ],
  });
  assert.deepEqual(policy.executionPolicy.boundedExecutionStartOrder, ["coverage", "generator", "browser", "playwright", "mutation"]);
  assert.equal(policy.executionPolicy.laneSchedulingClass.coverage, "EXCLUSIVE");
  assert.equal(policy.executionPolicy.nestedProcessFinalizationReserveMs.coverage, 15_000);
  assert.equal(policy.executionPolicy.nestedProcessTimeoutCleanup.coverage, "FULL_TREE_TERMINATION_VERIFIED_BEFORE_SUBSEQUENT_LANES");
  assert.equal(policy.executionPolicy.nestedConcurrency.playwrightWorkers, 1);
  assert.equal(ENGINE_BRANCH_COVERAGE_MINIMUM_PERCENT, policy.metricFloors.engineBranchCoverage.minimumPercent);
  assert.equal(REPRESENTATIVE_MUTATION_FAMILY_COUNT, policy.metricFloors.representativeMutationFamilies.denominator);
  assert.equal(GATE_INTEGRITY_POLICY.version, policy.version);
  assert.deepEqual(await validateGateIntegrityPolicySchema(policy), []);
});

test("policy mutations cannot weaken status, metric, retry, or family controls", async () => {
  const baseline = await readJson("audit/gate-integrity-policy-v1.json");
  for (const mutate of [
    (value) => { value.statusSemantics.SKIPPED = "PASS"; },
    (value) => { value.metricFloors.engineBranchCoverage.minimumPercent = 0; },
    (value) => { value.metricFloors.representativeMutationFamilies.minimumKilled = 0; },
    (value) => { value.retryPolicy.automaticRetries = 1; },
    (value) => { value.executionPolicy.githubHosted.maximumConcurrentLanes = 5; },
    (value) => { value.executionPolicy.githubHosted.adoptionStatus = "QUALIFIED"; },
    (value) => { value.executionPolicy.githubHosted.qualificationResult.measuredWallTimeReductionPercent = 20; },
    (value) => { value.executionPolicy.githubHosted.qualificationEvidenceLocation = "REPOSITORY_CHECKOUT"; },
    (value) => { value.executionPolicy.boundedExecutionStartOrder.reverse(); },
    (value) => { value.executionPolicy.laneSchedulingClass.coverage = "BOUNDED"; },
    (value) => { value.executionPolicy.nestedProcessFinalizationReserveMs.coverage = 0; },
    (value) => { value.executionPolicy.nestedProcessTimeoutCleanup.coverage = "DIRECT_PARENT_ONLY"; },
    (value) => { value.executionPolicy.automaticRetries = 1; },
    (value) => { value.executionPolicy.laneOrder.reverse(); },
    (value) => { value.gateFamilies[0].negativeControl.id = value.gateFamilies[1].negativeControl.id; },
    (value) => { value.gateFamilies.forEach((family, index) => { family.negativeControl.id = `NC-NONEXISTENT-${String(index + 1).padStart(2, "0")}`; }); },
    (value) => {
      const browser = value.gateFamilies.find((family) => family.id === "gate.browser");
      const coverage = value.gateFamilies.find((family) => family.id === "gate.coverage");
      [browser.negativeControl.id, coverage.negativeControl.id] = [coverage.negativeControl.id, browser.negativeControl.id];
    },
    (value) => {
      value.gateFamilies.find((family) => family.negativeControl.executionMode === "SELF_TEST").negativeControl.passEvidence = "REPORT_FIELD:negativeControls.NC-WRONG-CONTROL.status=PASS";
    },
  ]) {
    const mutant = structuredClone(baseline);
    mutate(mutant);
    const issues = [
      ...await validateGateIntegrityPolicySchema(mutant),
      ...await validateGateIntegrityPolicy(mutant, { trackedPaths: [] }),
    ];
    assert.ok(issues.length > 0);
  }
});

test("the PR workflow runs the required check on pull requests and reserves full audit for dispatch", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "audit.yml"), "utf8");
  const development = workflow.match(/^  development-checks:\n([\s\S]*?)(?=^  [a-z][a-z0-9-]+:\n)/mu)?.[1] || "";
  const full = workflow.slice(workflow.indexOf("  full-audit:\n") + "  full-audit:\n".length)
    .split(/\n  (?=[a-z][a-z0-9-]+:\n)/u)[0];
  assert.match(development, /^    if: github\.event_name != 'workflow_dispatch'$/mu);
  assert.doesNotMatch(development, /pull_request[^\n]*==\s*false/u);
  assert.match(full, /^    if: github\.event_name == 'workflow_dispatch' && inputs\.execution_qualification != true$/mu);
});

test("[NC-GITHUB-CONDITIONALLY-SKIPPED-REQUIRED-CHECK] external GitHub enforcement oracle rejects the formerly vacuous configuration", async () => {
  const policy = await loadGateIntegrityPolicy();
  const good = normalizeGithubEnforcementSnapshot(
    { checks: [{ context: "development-checks", app_id: 15368 }], contexts: [] },
    [{
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/v*"], exclude: [] } },
      rules: [{ type: "update" }, { type: "deletion" }],
      bypass_actors: [],
    }],
  );
  assert.equal(evaluateGithubEnforcementSnapshot(good, policy).valid, true);
  const bypassEvidenceMissing = normalizeGithubEnforcementSnapshot(
    { checks: [{ context: "development-checks", app_id: 15368 }], contexts: [] },
    [{
      target: "tag",
      enforcement: "active",
      conditions: { ref_name: { include: ["refs/tags/v*"], exclude: [] } },
      rules: [{ type: "update" }, { type: "deletion" }],
    }],
  );
  assert.equal(bypassEvidenceMissing.tagRules[0].bypassActorsObserved, false);
  assert.equal(bypassEvidenceMissing.tagRules[0].bypassActorCount, null);
  const withheldResult = evaluateGithubEnforcementSnapshot(bypassEvidenceMissing, policy);
  assert.equal(withheldResult.valid, false);
  assert.ok(withheldResult.issues.some((issue) => issue.includes("bypass actors were not observable")));
  const former = {
    requiredPullRequestChecks: ["full-audit"],
    tagRules: [{ pattern: "refs/tags/v1.0.0-beta.5", rules: ["DELETION_PROHIBITED", "UPDATE_PROHIBITED"], bypassActorCount: 0 }],
  };
  const result = evaluateGithubEnforcementSnapshot(former, policy);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("development-checks")));
  assert.ok(result.issues.some((issue) => issue.includes("incorrectly requires full-audit")));
  assert.ok(result.issues.some((issue) => issue.includes("refs/tags/v*")));
});

test("outcome reporting separates inventory from literal passes", () => {
  const summary = summarizeGateOutcomes(
    ["PASS", "PASS", "DEFERRED", "OPTIONAL_NOT_RUN", "SKIPPED", "MISSING_ARTIFACT", "TIMEOUT", "NOT_RUN"],
    { inventoryExpected: 8, runId: "fixture-run" },
  );
  assert.deepEqual(summary, {
    acceptedNonPassCount: 2,
    failedCount: 1,
    inventoryActual: 8,
    inventoryExpected: 8,
    missingCount: 1,
    notRunCount: 1,
    passedCount: 2,
    runId: "fixture-run",
    skippedCount: 1,
  });
  assert.notEqual(summary.inventoryActual, summary.passedCount);
});

test("required outcome accounting preserves typed non-runs and fails missing PASS records closed", () => {
  assert.deepEqual(requiredOutcomeStatuses([], { containerStatus: "NOT_RUN", expectedCount: 3 }), ["NOT_RUN", "NOT_RUN", "NOT_RUN"]);
  assert.deepEqual(requiredOutcomeStatuses([{ status: "PASS" }], { containerStatus: "FAIL", expectedCount: 3 }), ["PASS", "FAIL", "FAIL"]);
  assert.deepEqual(requiredOutcomeStatuses([], { containerStatus: "PASS", expectedCount: 2 }), ["MISSING_ARTIFACT", "MISSING_ARTIFACT"]);
  assert.throws(() => requiredOutcomeStatuses([], { containerStatus: "NOT_RUN", expectedCount: -1 }), /expected count/u);
});

test("the canary may continue only to publish canonical failure evidence and the final step fail-closes", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "trusted-https-canary.yml"), "utf8");
  assert.match(workflow, /id:\s*canary[\s\S]*?continue-on-error:\s*true/u);
  assert.match(workflow, /if:\s*always\(\)[\s\S]*?steps\.canary\.outcome/u);
  assert.match(workflow, /CANARY_STEP_OUTCOME:\s*\$\{\{ steps\.canary\.outcome \}\}/u);
  assert.match(workflow, /CANARY_STEP_OUTCOME[^\n]*-cne 'success'/u);
});
