export const BROWSER_RUNNER_EVIDENCE_PATH = "audit/browser-runner-evidence-v1.json";
export const BROWSER_RUNNER_EVIDENCE_SCHEMA_VERSION = 1;

const EVIDENCE_KEYS = Object.freeze([
  "schemaVersion",
  "status",
  "browserProductName",
  "browserFullVersion",
  "browserExecutableSha256",
  "runnerImageOS",
  "runnerImageVersion",
]);

const TUPLE_KEYS = Object.freeze(EVIDENCE_KEYS.slice(2));
const ALLOWED_BROWSER_PRODUCTS = Object.freeze(new Set(["Microsoft Edge", "Google Chrome"]));

function exactKeys(value, expected) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key, index) => key === expected[index])
  );
}

export function browserRunnerTupleIssues(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["browser/runner tuple must be an object"];
  }
  if (!ALLOWED_BROWSER_PRODUCTS.has(value.browserProductName)) {
    issues.push("browserProductName must be Microsoft Edge or Google Chrome");
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(String(value.browserFullVersion || ""))) {
    issues.push("browserFullVersion must contain the full four-part product version");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(value.browserExecutableSha256 || ""))) {
    issues.push("browserExecutableSha256 must be 64 lowercase hexadecimal characters");
  }
  if (value.runnerImageOS === "PENDING"
    || !/^[A-Za-z0-9._-]{1,100}$/u.test(String(value.runnerImageOS || ""))) {
    issues.push("runnerImageOS must be a nonempty GitHub-hosted image identifier");
  }
  if (value.runnerImageVersion === "PENDING"
    || !/^[A-Za-z0-9._-]{1,100}$/u.test(String(value.runnerImageVersion || ""))) {
    issues.push("runnerImageVersion must be a nonempty GitHub-hosted image version");
  }
  return issues;
}

export function browserRunnerTuplesMatch(left, right) {
  return Boolean(
    browserRunnerTupleIssues(left).length === 0
    && browserRunnerTupleIssues(right).length === 0
    && TUPLE_KEYS.every((key) => left[key] === right[key])
  );
}

export function parseReviewedBrowserRunnerEvidence(text) {
  const issues = [];
  const source = String(text);
  if (source.includes("\r")) issues.push("browser/runner evidence must use LF line endings");
  if (!source.endsWith("\n") || source.endsWith("\n\n")) {
    issues.push("browser/runner evidence must end with exactly one LF");
  }
  let fields = {};
  try {
    fields = JSON.parse(source);
  } catch {
    issues.push("browser/runner evidence is not valid JSON");
  }
  if (!exactKeys(fields, EVIDENCE_KEYS)) {
    issues.push("browser/runner evidence must contain only the exact ordered schema");
  }
  if (fields.schemaVersion !== BROWSER_RUNNER_EVIDENCE_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${BROWSER_RUNNER_EVIDENCE_SCHEMA_VERSION}`);
  }
  if (!["PENDING", "REVIEWED"].includes(fields.status)) {
    issues.push("status must be PENDING or REVIEWED");
  }
  if (fields.status === "PENDING") {
    for (const key of TUPLE_KEYS) {
      if (fields[key] !== "PENDING") issues.push(`${key} must be PENDING while status is PENDING`);
    }
  }
  if (fields.status === "REVIEWED") issues.push(...browserRunnerTupleIssues(fields));
  if (Object.keys(fields).length && `${JSON.stringify(fields, null, 2)}\n` !== source) {
    issues.push("browser/runner evidence must use the canonical two-space JSON form");
  }
  return Object.freeze({
    valid: issues.length === 0,
    status: fields.status || "INVALID",
    browserProductName: fields.browserProductName || null,
    browserFullVersion: fields.browserFullVersion || null,
    browserExecutableSha256: fields.browserExecutableSha256 || null,
    runnerImageOS: fields.runnerImageOS || null,
    runnerImageVersion: fields.runnerImageVersion || null,
    issues: Object.freeze([...issues]),
  });
}
