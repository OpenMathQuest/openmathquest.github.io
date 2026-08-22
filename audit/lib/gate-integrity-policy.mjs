import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const GATE_INTEGRITY_POLICY_PATH = "audit/gate-integrity-policy-v1.json";
export const GATE_INTEGRITY_POLICY_SCHEMA_PATH = "audit/schemas/gate-integrity-policy-v1.schema.json";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const canonicalPolicyUrl = new URL("../gate-integrity-policy-v1.json", import.meta.url);
const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
};

// Runtime gates consume these values from the canonical policy. There is no
// second executable copy of the metric floors or status classes.
export const GATE_INTEGRITY_POLICY = freezeDeep(JSON.parse(readFileSync(canonicalPolicyUrl, "utf8")));
export const ENGINE_BRANCH_COVERAGE_MINIMUM_PERCENT = GATE_INTEGRITY_POLICY.metricFloors.engineBranchCoverage.minimumPercent;
export const REPRESENTATIVE_MUTATION_FAMILY_COUNT = GATE_INTEGRITY_POLICY.metricFloors.representativeMutationFamilies.denominator;
const canonical = (values, key) => [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`;

export function releaseCertificationRunEligible(run, jobs, releaseCommit) {
  return run?.event === "workflow_dispatch"
    && run?.status === "completed"
    && run?.conclusion === "success"
    && run?.head_sha === releaseCommit
    && Array.isArray(jobs)
    && jobs.filter((job) => job?.name === "full-audit"
      && job?.status === "completed"
      && job?.conclusion === "success").length === 1;
}

export function evaluateGithubEnforcementSnapshot(snapshot, policy) {
  const requiredContexts = Array.isArray(snapshot?.requiredPullRequestChecks)
    ? snapshot.requiredPullRequestChecks
    : [];
  const tagRules = Array.isArray(snapshot?.tagRules) ? snapshot.tagRules : [];
  const issues = [];
  if (!requiredContexts.includes(policy.enforcement.requiredPullRequestCheck)) {
    issues.push(`main does not require ${policy.enforcement.requiredPullRequestCheck}`);
  }
  for (const prohibited of policy.enforcement.prohibitedRequiredPullRequestChecks) {
    if (requiredContexts.includes(prohibited)) issues.push(`main incorrectly requires ${prohibited}`);
  }
  const tagRule = tagRules.find((record) => record.pattern === policy.enforcement.requiredTagPattern);
  if (!tagRule) {
    issues.push(`missing tag rule ${policy.enforcement.requiredTagPattern}`);
  } else {
    for (const required of policy.enforcement.requiredTagRules) {
      if (!tagRule.rules?.includes(required)) issues.push(`tag rule lacks ${required}`);
    }
    if (tagRule.bypassActorsObserved !== true) issues.push("tag rule bypass actors were not observable");
    else if (tagRule.bypassActorCount !== 0) issues.push("tag rule must not have bypass actors");
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function summarizeGateOutcomes(statuses, { inventoryExpected, runId }) {
  const values = [...statuses];
  const classes = GATE_INTEGRITY_POLICY.outcomeReporting.statusClasses;
  const accepted = new Set(GATE_INTEGRITY_POLICY.outcomeReporting.acceptedNonPassStates);
  const failed = new Set(classes.failed);
  const missing = new Set(classes.missing);
  const notRun = new Set(classes.notRun);
  const skipped = new Set(classes.skipped);
  const passed = new Set(classes.passed);
  const known = new Set([...passed, ...accepted, ...failed, ...missing, ...notRun, ...skipped]);
  const unknown = values.filter((value) => !known.has(value));
  return Object.freeze({
    acceptedNonPassCount: values.filter((value) => accepted.has(value)).length,
    failedCount: values.filter((value) => failed.has(value)).length + unknown.length,
    inventoryActual: values.length,
    inventoryExpected,
    missingCount: values.filter((value) => missing.has(value)).length,
    notRunCount: values.filter((value) => notRun.has(value)).length,
    passedCount: values.filter((value) => passed.has(value)).length,
    runId,
    skippedCount: values.filter((value) => skipped.has(value)).length,
  });
}

export function requiredOutcomeStatuses(records, { containerStatus, expectedCount, normalizeStatus = (status) => status } = {}) {
  if (!Array.isArray(records)) throw new TypeError("required outcome records must be an array");
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) throw new RangeError("required outcome expected count must be a non-negative safe integer");
  const statuses = records.map((record) => normalizeStatus(record?.status));
  if (statuses.length >= expectedCount) return statuses;
  const normalizedContainerStatus = normalizeStatus(containerStatus);
  const fallbackStatus = normalizedContainerStatus === "PASS" ? "MISSING_ARTIFACT" : normalizedContainerStatus || "ERROR";
  return [...statuses, ...Array(expectedCount - statuses.length).fill(fallbackStatus)];
}

export async function validateGateIntegrityPolicySchema(policy, schemaPathOrUrl = new URL("../schemas/gate-integrity-policy-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFileAsync(schemaPathOrUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return Object.freeze(validate(policy) ? [] : (validate.errors || []).map(schemaIssue));
}

export async function validateGateIntegrityPolicy(policy, { root = repositoryRoot, trackedPaths = null } = {}) {
  const issues = [...await validateGateIntegrityPolicySchema(policy)];
  if (issues.length) return Object.freeze(issues);
  const tracked = new Set(trackedPaths || []);
  if (!tracked.size) {
    const { trackedRepositoryPaths } = await import("./repository-code-map.mjs");
    for (const entry of trackedRepositoryPaths(root)) tracked.add(entry);
  }
  const ruleIds = policy.rules.map((record) => record.id);
  const familyIds = policy.gateFamilies.map((record) => record.id);
  const negativeControlIds = policy.gateFamilies.map((record) => record.negativeControl.id);
  const acceptanceIds = policy.acceptanceCriteria.map((record) => record.id);
  if (new Set(ruleIds).size !== ruleIds.length) issues.push("rules contain duplicate ids");
  if (new Set(familyIds).size !== familyIds.length) issues.push("gateFamilies contain duplicate ids");
  if (new Set(negativeControlIds).size !== negativeControlIds.length) issues.push("gateFamilies contain duplicate negative-control ids");
  if (new Set(acceptanceIds).size !== acceptanceIds.length) issues.push("acceptanceCriteria contain duplicate ids");
  if (!same(policy.rules, canonical(policy.rules, (record) => record.id))) issues.push("rules must be sorted lexicographically by id");
  if (!same(policy.gateFamilies, canonical(policy.gateFamilies, (record) => record.id))) issues.push("gateFamilies must be sorted lexicographically by id");
  if (!same(policy.acceptanceCriteria, canonical(policy.acceptanceCriteria, (record) => record.id))) issues.push("acceptanceCriteria must be sorted lexicographically by id");
  for (const family of policy.gateFamilies) {
    if (!same(family.implementationPaths, [...family.implementationPaths].sort())) issues.push(`${family.id} implementationPaths must be sorted lexicographically`);
    if (!same(family.validatorPaths, [...family.validatorPaths].sort())) issues.push(`${family.id} validatorPaths must be sorted lexicographically`);
    for (const entry of [...family.implementationPaths, ...family.validatorPaths]) {
      if (!tracked.has(entry)) issues.push(`${family.id} references untracked path ${entry}`);
    }
    const control = family.negativeControl;
    if (![...family.implementationPaths, ...family.validatorPaths].includes(control.executionPath)) {
      issues.push(`${family.id} negative control executionPath is not a declared family path`);
      continue;
    }
    try {
      const source = await readFileAsync(path.join(root, ...control.executionPath.split("/")), "utf8");
      if (!source.includes(control.id)) issues.push(`${family.id} negative control id is not bound to executable source`);
      if (control.executionMode === "NODE_TEST") {
        if (!control.testName.startsWith(`[${control.id}] `)) {
          issues.push(`${family.id} negative control testName is bound to a different control id`);
        }
        if (!source.includes(`test("${control.testName}"`)) {
          issues.push(`${family.id} negative control testName is not present in its executable test`);
        }
      } else {
        const allowedBindings = new Set([
          `REPORT_FIELD:negativeControls.${control.id}.status=PASS`,
          `STDOUT:NEGATIVE_CONTROL=${control.id}:PASS`,
        ]);
        if (!allowedBindings.has(control.passEvidence)) {
          issues.push(`${family.id} negative control passEvidence is bound to a different control id or unknown evidence channel`);
        } else if (!source.includes(JSON.stringify(control.passEvidence))) {
          issues.push(`${family.id} negative control passEvidence is not declared by its executable source`);
        }
      }
    } catch (error) {
      issues.push(`${family.id} negative control executable is unreadable: ${error.message}`);
    }
  }
  const requiredFamilyIds = [
    "gate.audit-orchestration", "gate.browser", "gate.canary", "gate.coverage", "gate.deep-ux", "gate.engine", "gate.generator",
    "gate.github-pr", "gate.launcher", "gate.mutation", "gate.pages", "gate.playwright", "gate.public-candidate",
    "gate.publication-evidence", "gate.semantic",
  ];
  if (!same(familyIds, requiredFamilyIds)) issues.push("gateFamilies do not equal the closed required family set");
  if (policy.metricFloors.engineBranchCoverage.minimumPercent !== 88) issues.push("engine branch coverage floor drifted from 88 percent");
  if (policy.metricFloors.representativeMutationFamilies.minimumKilled !== 11) issues.push("representative mutation floor drifted from eleven families");
  if (policy.executionPolicy.automaticRetries !== 0) issues.push("audit lane retries drifted from zero");
  return Object.freeze(issues);
}

export async function loadGateIntegrityPolicy(pathOrUrl = canonicalPolicyUrl, options = {}) {
  const policy = JSON.parse(await readFileAsync(pathOrUrl, "utf8"));
  const issues = await validateGateIntegrityPolicy(policy, options);
  if (issues.length) throw new Error(`Invalid gate-integrity policy:\n- ${issues.join("\n- ")}`);
  return Object.freeze(policy);
}
