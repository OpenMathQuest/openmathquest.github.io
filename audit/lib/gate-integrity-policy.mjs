import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

export const GATE_INTEGRITY_POLICY_PATH = "audit/gate-integrity-policy-v1.json";
export const GATE_INTEGRITY_POLICY_SCHEMA_PATH = "audit/schemas/gate-integrity-policy-v1.schema.json";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const canonical = (values, key) => [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const schemaIssue = (error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`;

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
    if (tagRule.bypassActorCount !== 0) issues.push("tag rule must not have bypass actors");
  }
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
}

export function summarizeGateOutcomes(statuses, { inventoryExpected, runId }) {
  const values = [...statuses];
  const accepted = new Set(["DEFERRED", "NOT_REQUIRED_BY_CADENCE", "OPTIONAL_NOT_RUN", "OWNER_SKIPPED", "WAIVED"]);
  const failed = new Set(["BLOCKED", "CANCELLED", "ERROR", "FAIL", "TIMEOUT"]);
  const missing = new Set(["MISSING_ARTIFACT"]);
  const notRun = new Set(["NOT_RUN"]);
  const skipped = new Set(["SKIP", "SKIPPED"]);
  const known = new Set(["PASS", ...accepted, ...failed, ...missing, ...notRun, ...skipped]);
  const unknown = values.filter((value) => !known.has(value));
  return Object.freeze({
    acceptedNonPassCount: values.filter((value) => accepted.has(value)).length,
    failedCount: values.filter((value) => failed.has(value)).length + unknown.length,
    inventoryActual: values.length,
    inventoryExpected,
    missingCount: values.filter((value) => missing.has(value)).length,
    notRunCount: values.filter((value) => notRun.has(value)).length,
    passedCount: values.filter((value) => value === "PASS").length,
    runId,
    skippedCount: values.filter((value) => skipped.has(value)).length,
  });
}

export async function validateGateIntegrityPolicySchema(policy, schemaPathOrUrl = new URL("../schemas/gate-integrity-policy-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaPathOrUrl, "utf8"));
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
  const negativeControlIds = policy.gateFamilies.map((record) => record.negativeControlId);
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
  }
  const requiredFamilyIds = [
    "gate.browser", "gate.canary", "gate.coverage", "gate.deep-ux", "gate.engine", "gate.generator",
    "gate.github-pr", "gate.mutation", "gate.pages", "gate.playwright", "gate.public-candidate",
    "gate.publication-evidence", "gate.semantic",
  ];
  if (!same(familyIds, requiredFamilyIds)) issues.push("gateFamilies do not equal the closed required family set");
  if (policy.metricFloors.engineBranchCoverage.minimumPercent !== 88) issues.push("engine branch coverage floor drifted from 88 percent");
  if (policy.metricFloors.representativeMutationFamilies.minimumKilled !== 11) issues.push("representative mutation floor drifted from eleven families");
  return Object.freeze(issues);
}

export async function loadGateIntegrityPolicy(pathOrUrl = new URL("../gate-integrity-policy-v1.json", import.meta.url), options = {}) {
  const policy = JSON.parse(await readFile(pathOrUrl, "utf8"));
  const issues = await validateGateIntegrityPolicy(policy, options);
  if (issues.length) throw new Error(`Invalid gate-integrity policy:\n- ${issues.join("\n- ")}`);
  return Object.freeze(policy);
}
