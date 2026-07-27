export const PUBLICATION_CLEARANCE_PATH = "PUBLICATION_CLEARANCE.md";

const FIELD_ORDER = Object.freeze([
  "Status",
  "Review date",
  "Review result",
  "Required failures",
  "Required skips",
  "Residual risks",
  "Reviewed engine SHA-256",
  "Reviewed curriculum manifest version",
  "Reviewed curriculum manifest SHA-256",
  "Reviewed rights-state SHA-256",
  "Reviewed public payload SHA-256",
  "Reviewed public payload tree OID",
]);

function result(valid, fields, issues) {
  return Object.freeze({
    valid,
    status: fields.Status || "INVALID",
    reviewDate: fields["Review date"] || null,
    reviewResult: fields["Review result"] || null,
    requiredFailures: fields["Required failures"] || null,
    requiredSkips: fields["Required skips"] || null,
    residualRisks: fields["Residual risks"] || null,
    reviewedEngineSha256: fields["Reviewed engine SHA-256"] || null,
    reviewedManifestVersion: fields["Reviewed curriculum manifest version"] || null,
    reviewedManifestSha256: fields["Reviewed curriculum manifest SHA-256"] || null,
    reviewedRightsSha256: fields["Reviewed rights-state SHA-256"] || null,
    reviewedPayloadSha256: fields["Reviewed public payload SHA-256"] || null,
    reviewedPayloadTreeOid: fields["Reviewed public payload tree OID"] || null,
    issues: Object.freeze([...issues]),
  });
}

export function parsePublicationClearance(text) {
  const issues = [];
  const source = String(text);
  if (source.includes("\r")) issues.push("clearance must use LF line endings");
  const lines = source.split("\n");
  if (lines.at(-1) !== "") issues.push("clearance must end with one LF");
  if (lines[0] !== "# Math Quest publication clearance") issues.push("clearance heading is invalid");
  if (lines.length !== FIELD_ORDER.length + 2) issues.push("clearance must contain only the exact ordered schema");
  const fields = {};
  for (const [index, key] of FIELD_ORDER.entries()) {
    const prefix = `${key}: `;
    const line = lines[index + 1] || "";
    if (!line.startsWith(prefix) || line.length === prefix.length) {
      issues.push(`${key} is missing, empty, or out of order`);
    } else {
      fields[key] = line.slice(prefix.length);
    }
  }
  if (!["PENDING", "APPROVED"].includes(fields.Status)) issues.push("Status must be PENDING or APPROVED");
  if (fields.Status === "PENDING") {
    for (const key of FIELD_ORDER.slice(1)) {
      if (fields[key] !== "PENDING") issues.push(`${key} must be PENDING while Status is PENDING`);
    }
  }
  if (fields.Status === "APPROVED") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(fields["Review date"] || "")) issues.push("Review date must use YYYY-MM-DD");
    if (fields["Review result"] !== "PASS") issues.push("Review result must be PASS");
    if (fields["Required failures"] !== "0") issues.push("Required failures must be 0");
    if (fields["Required skips"] !== "0") issues.push("Required skips must be 0");
    if (!fields["Residual risks"] || fields["Residual risks"] === "PENDING" || fields["Residual risks"].length > 500) {
      issues.push("Residual risks must be an explicit one-line statement of at most 500 characters");
    }
    for (const key of [
      "Reviewed engine SHA-256",
      "Reviewed curriculum manifest SHA-256",
      "Reviewed rights-state SHA-256",
      "Reviewed public payload SHA-256",
    ]) {
      if (!/^[a-f0-9]{64}$/u.test(fields[key] || "")) issues.push(`${key} must be 64 lowercase hexadecimal characters`);
    }
    if (!/^1\.\d+\.\d+$/u.test(fields["Reviewed curriculum manifest version"] || "")) {
      issues.push("Reviewed curriculum manifest version must be a 1.x.x semantic version");
    }
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(fields["Reviewed public payload tree OID"] || "")) {
      issues.push("Reviewed public payload tree OID must be 40 or 64 lowercase hexadecimal characters");
    }
  }
  return result(issues.length === 0, fields, issues);
}

export function clearanceMatches(parsed, expected) {
  return Boolean(
    parsed?.valid
    && parsed.status === "APPROVED"
    && parsed.reviewedEngineSha256 === expected.engineSha256
    && parsed.reviewedManifestVersion === expected.manifestVersion
    && parsed.reviewedManifestSha256 === expected.manifestSha256
    && parsed.reviewedRightsSha256 === expected.rightsSha256
    && parsed.reviewedPayloadSha256 === expected.payloadSha256
    && parsed.reviewedPayloadTreeOid === expected.payloadTreeOid
  );
}
