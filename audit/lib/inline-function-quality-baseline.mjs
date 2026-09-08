import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const primaryArtifactUrl = new URL("../function-quality-baseline-v1.json", import.meta.url);
const correctionArtifactUrl = new URL("../inline-function-quality-baseline-correction-v1.json", import.meta.url);
const primarySchemaUrl = new URL("../schemas/function-quality-baseline-v1.schema.json", import.meta.url);
const correctionSchemaUrl = new URL("../schemas/inline-function-quality-baseline-correction-v1.schema.json", import.meta.url);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function schemaIssue(error) {
  return `${error.instancePath || "/"} ${error.message || "is invalid"}`;
}

export async function validateInlineFunctionQualityCorrectionSchema(
  correction,
  primarySchemaPathOrUrl = primarySchemaUrl,
  correctionSchemaPathOrUrl = correctionSchemaUrl,
) {
  const [primarySchema, correctionSchema] = await Promise.all([
    readFile(primarySchemaPathOrUrl, "utf8").then(JSON.parse),
    readFile(correctionSchemaPathOrUrl, "utf8").then(JSON.parse),
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(primarySchema);
  const validate = ajv.compile(correctionSchema);
  return Object.freeze(validate(correction) ? [] : (validate.errors || []).map(schemaIssue));
}

function correctionRecordFindings(correction, primary, primaryBytes) {
  const findings = [];
  if (correction.correctsArtifact.sha256 !== sha256(primaryBytes)) {
    findings.push("inline-function correction does not bind the immutable primary baseline bytes");
  }
  if (correction.correctsArtifact.immutableUnits !== primary.immutableBaseline.units
      || correction.correctsArtifact.immutableFunctions !== primary.immutableBaseline.functions) {
    findings.push("inline-function correction primary baseline summary is stale");
  }
  if (primary.immutableBaseline.rows.some((row) => row.unit.includes("#inline-script-"))) {
    findings.push("inline-function correction is stale because the primary baseline already contains inline HTML rows");
  }
  const inline = correction.immutableInlineHtmlBaseline;
  if (inline.rows.length !== inline.functions) findings.push("inline-function correction row count does not match its function count");
  if (inline.rows.some((row) => !row.unit.includes("#inline-script-"))) {
    findings.push("inline-function correction contains a non-inline JavaScript row");
  }
  return findings;
}

export async function functionQualityBaselineArtifactFindings(
  policy,
  primary,
  correction,
  primaryBytes,
  correctionBytes,
) {
  const declared = policy.analysisRatchets.functionQuality.baselineArtifacts;
  const findings = [
    ...await validateInlineFunctionQualityCorrectionSchema(correction),
    ...correctionRecordFindings(correction, primary, primaryBytes),
  ];
  if (sha256(primaryBytes) !== declared.primary.sha256) findings.push("primary function baseline hash does not match policy");
  if (sha256(correctionBytes) !== declared.inlineHtmlCorrection.sha256) findings.push("inline-function correction hash does not match policy");
  return Object.freeze(findings);
}

export async function loadFunctionQualityBaselineArtifacts(policy) {
  const [primaryBytes, correctionBytes] = await Promise.all([
    readFile(primaryArtifactUrl),
    readFile(correctionArtifactUrl),
  ]);
  const primary = JSON.parse(primaryBytes.toString("utf8"));
  const correction = JSON.parse(correctionBytes.toString("utf8"));
  const findings = await functionQualityBaselineArtifactFindings(
    policy, primary, correction, primaryBytes, correctionBytes,
  );
  return Object.freeze({
    primary,
    correction,
    findings: Object.freeze(findings),
  });
}
