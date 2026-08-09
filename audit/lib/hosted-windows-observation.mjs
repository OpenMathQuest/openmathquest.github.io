export const HOSTED_WINDOWS_OBSERVATION_SCHEMA_VERSION = 1;
export const HOSTED_WINDOWS_OBSERVATION_KIND = "HOSTED_WINDOWS_BROWSER_IDENTITY_OBSERVATION_V1";
export const HOSTED_WINDOWS_OBSERVATION_STATUS = "OBSERVATION_ONLY_NOT_CERTIFICATION";

const OBSERVATION_KEYS = Object.freeze([
  "schemaVersion",
  "artifactKind",
  "certificationStatus",
  "repository",
  "ref",
  "candidateSha",
  "workflowFile",
  "workflowRunId",
  "workflowRunAttempt",
  "observedAtUtc",
  "browserProductName",
  "browserFullVersion",
  "browserExecutableSha256",
  "requestedRunnerLabel",
  "runnerEnvironment",
  "runnerImageOS",
  "runnerImageVersion",
]);

const BROWSER_PRODUCTS = new Set(["Microsoft Edge", "Google Chrome"]);
const SHA_40 = /^[a-f0-9]{40}$/u;
const SHA_64 = /^[a-f0-9]{64}$/u;
const VERSION_4 = /^\d+\.\d+\.\d+\.\d+$/u;
const RUN_NUMBER = /^[1-9]\d*$/u;
const RUNNER_IDENTITY = /^[A-Za-z0-9._-]{1,100}$/u;
const UTC_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function exactOrderedKeys(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === OBSERVATION_KEYS.length
    && Object.keys(value).every((key, index) => key === OBSERVATION_KEYS[index])
  );
}

export function parseHostedWindowsObservation(text, expected = {}) {
  const source = String(text);
  const issues = [];
  if (source.includes("\r")) issues.push("observation must use LF line endings");
  if (!source.endsWith("\n") || source.endsWith("\n\n")) {
    issues.push("observation must end with exactly one LF");
  }
  let value = {};
  try {
    value = JSON.parse(source);
  } catch {
    issues.push("observation is not valid JSON");
  }
  if (!exactOrderedKeys(value)) issues.push("observation must contain only the exact ordered schema");
  if (Object.keys(value).length && `${JSON.stringify(value)}\n` !== source) {
    issues.push("observation must use canonical compact JSON");
  }
  if (value.schemaVersion !== HOSTED_WINDOWS_OBSERVATION_SCHEMA_VERSION) issues.push("schemaVersion must be 1");
  if (value.artifactKind !== HOSTED_WINDOWS_OBSERVATION_KIND) issues.push("artifactKind must identify the hosted identity observation schema");
  if (value.certificationStatus !== HOSTED_WINDOWS_OBSERVATION_STATUS) issues.push("certificationStatus must state that this is not certification");
  if (value.repository !== "OpenMathQuest/openmathquest.github.io") issues.push("repository must be the public Math Quest repository");
  if (value.ref !== "refs/heads/main") issues.push("ref must be protected main");
  if (!SHA_40.test(String(value.candidateSha || ""))) issues.push("candidateSha must be 40 lowercase hexadecimal characters");
  if (value.workflowFile !== ".github/workflows/hosted-windows-observation.yml") issues.push("workflowFile must identify the observation-only workflow");
  if (!RUN_NUMBER.test(String(value.workflowRunId || ""))) issues.push("workflowRunId must be a positive integer string");
  if (!RUN_NUMBER.test(String(value.workflowRunAttempt || ""))) issues.push("workflowRunAttempt must be a positive integer string");
  if (!UTC_MILLISECONDS.test(String(value.observedAtUtc || "")) || Number.isNaN(Date.parse(value.observedAtUtc))) issues.push("observedAtUtc must be a valid UTC millisecond timestamp");
  if (!BROWSER_PRODUCTS.has(value.browserProductName)) issues.push("browserProductName must be Microsoft Edge or Google Chrome");
  if (!VERSION_4.test(String(value.browserFullVersion || ""))) issues.push("browserFullVersion must contain the full four-part version");
  if (!SHA_64.test(String(value.browserExecutableSha256 || ""))) issues.push("browserExecutableSha256 must be 64 lowercase hexadecimal characters");
  if (value.requestedRunnerLabel !== "windows-latest") issues.push("requestedRunnerLabel must be windows-latest");
  if (value.runnerEnvironment !== "github-hosted") issues.push("runnerEnvironment must be github-hosted");
  if (value.runnerImageOS === "PENDING" || !RUNNER_IDENTITY.test(String(value.runnerImageOS || ""))) issues.push("runnerImageOS must be a nonempty GitHub-hosted image identifier");
  if (value.runnerImageVersion === "PENDING" || !RUNNER_IDENTITY.test(String(value.runnerImageVersion || ""))) issues.push("runnerImageVersion must be a nonempty GitHub-hosted image version");
  if (expected.candidateSha !== undefined && value.candidateSha !== expected.candidateSha) issues.push("candidateSha does not match the requested candidate");
  if (expected.runnerImageOS !== undefined && value.runnerImageOS !== expected.runnerImageOS) issues.push("runnerImageOS does not match the live runner");
  if (expected.runnerImageVersion !== undefined && value.runnerImageVersion !== expected.runnerImageVersion) issues.push("runnerImageVersion does not match the live runner");
  return Object.freeze({ valid: issues.length === 0, value: Object.freeze({ ...value }), issues: Object.freeze(issues) });
}
