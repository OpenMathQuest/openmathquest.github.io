import { publicPayloadSha256, publicPayloadTreeOid } from "./lib/public-payload.mjs";
import { REVIEWED_TOOLCHAIN_RECORDS } from "./lib/public-toolchain-records.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { BROWSER_RUNNER_EVIDENCE_PATH, parseReviewedBrowserRunnerEvidence } from "./lib/browser-runner-evidence.mjs";
import { CURRICULUM_PATH, validateManifest } from "./lib/curriculum-manifest.mjs";
import { parsePublicationClearance, PUBLICATION_CLEARANCE_PATH } from "./lib/publication-clearance.mjs";
import * as candidatePolicy from "./lib/public-candidate-refactor-policies.mjs";
import {
  buildTrustedHttpsCanarySupplyChainInput,
  trustedHttpsCanarySupplyChainFindings,
  trustedHttpsCanarySupplyChainMutationFailures,
} from "./lib/trusted-https-canary-supply-chain.mjs";

const {
  APPROVED_LICENCES, COMPONENT_REGISTER_PATH, DENIED_ARCHIVE_OR_DOCUMENT_EXTENSION, DENIED_TRACKED_PATHS,
  EVIDENCE_DECLARATION_PATH, EVIDENCE_KINDS, EVIDENCE_LICENCE_EXPRESSIONS, EVIDENCE_ORIGINS,
  extendedToolchainFindings, FIRST_PARTY_DECLARATION_PATH, FIRST_PARTY_HEADER, KIND_LICENCES,
  legacyToolchainRegister, PRIVATE_PATH, PUBLIC_FILE_MANIFEST_PATH, REQUIRED_PUBLIC_RUNTIME_PATHS,
  REQUIRED_RIGHTS_PATHS, reviewedContentFindings, reviewedRegistryMetadataMutationFindings,
} = candidatePolicy;

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_CANDIDATE_NEGATIVE_CONTROL_PASS_EVIDENCE = "STDOUT:NEGATIVE_CONTROL=NC-PUBLIC-CANDIDATE-CALIBRATED-FORBIDDEN-MATERIAL:PASS";
export const PUBLIC_CANDIDATE_NEGATIVE_CONTROL_ID = PUBLIC_CANDIDATE_NEGATIVE_CONTROL_PASS_EVIDENCE
  .slice("STDOUT:NEGATIVE_CONTROL=".length, -":PASS".length);

const REVIEWED_INTER = Object.freeze({
  id: "inter-variable-font",
  shippedSha256: "4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf",
  sourceUrl: "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip",
  sourceCommit: "e3a3d4c57d5ecc01453a575621882a384c1995a3",
  sourceArtifactSha256: "9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e",
  sourceInnerPath: "InterVariable.ttf",
  licenceEvidenceSha256: "262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a",
});
const REGISTERED_ASSET_PATH = /^assets\//u;
const REGISTERED_BINARY_EXTENSION = /\.(?:gif|ico|jpe?g|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)$/iu;
const PLATFORM_PICTOGRAPH = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const RESTRICTIVE_LICENCE = /(?:^|[-\s])(?:NC|ND)(?:$|[-\s])|non[-\s]?commercial|no[-\s]?derivatives|personal[-\s]?use|educational[-\s]?use|permission[-\s]?only|royalty[-\s]?free|all[-\s]?rights[-\s]?reserved|remarc/iu;
const PROHIBITED_ACTIVE_SOURCE = /sound-effects\.bbcrewind\.co\.uk|bbc sound effects|remarc/iu;
const LEGACY_SKILL_ID = /\b(?:PK|K|G[1-5])-\d{2}[a-z]?\b/u;
const PUBLISHER_MARKERS = Object.freeze([
  new RegExp(["Dimen", "sions", " Math"].join(""), "iu"),
  new RegExp(["Singapore", " Math"].join(""), "iu"),
  new RegExp(["singapore", "-", "math", String.raw`(?:\.com|\.s3\.)`].join(""), "iu"),
]);
const HIGH_CONFIDENCE_PERSONAL_OR_LOCAL_MARKERS = Object.freeze([
  /[A-Za-z]:[\\/]+Users[\\/]+/iu,
  /[A-Za-z]:[\\/]+Documents and Settings[\\/]+/iu,
  /\/Users\/[^/\s]+/iu,
  /\/home\/[^/\s]+(?:\/|$)/iu,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
]);
const TEXT_CONTACT_MARKERS = Object.freeze([
  /\b(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s])\d{3}[-.\s]\d{4}\b/u,
  /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ][ -]?\d[ABCEGHJ-NPRSTVWXYZ]\d\b/iu,
  /\b\d{1,6}\s+[A-Z][A-Z.' -]{1,60}\s(?:STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|LANE|LN|COURT|CT|BOULEVARD|BLVD)\b/iu,
]);
const PERSONAL_OR_LOCAL_MARKERS = Object.freeze([
  ...HIGH_CONFIDENCE_PERSONAL_OR_LOCAL_MARKERS,
  ...TEXT_CONTACT_MARKERS,
]);
const ENCODED_PERSONAL_MARKERS = Object.freeze([
  new RegExp(["433a", "5c55", "7365", "7273", "5c"].join(""), "iu"),
  new RegExp(["2f55", "7365", "7273", "2f"].join(""), "iu"),
  new RegExp(["Qzpc", "VXNl", "cnNc"].join(""), "u"),
  new RegExp(["L1Vz", "ZXJz", "Lw=="].join(""), "u"),
  new RegExp([String.raw`\\u0043`, String.raw`\\u003a`, String.raw`\\u005c`, String.raw`\\u0055`, String.raw`\\u0073`, String.raw`\\u0065`, String.raw`\\u0072`, String.raw`\\u0073`, String.raw`\\u005c`].join(""), "iu"),
  new RegExp(["%43", "%3A", "%5C", "%55", "%73", "%65", "%72", "%73", "%5C"].join(""), "iu"),
]);
const CREDENTIAL_MARKERS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}\b/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/u,
  /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/iu,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}/iu,
]);

function normalized(relativePath) {
  return relativePath.replaceAll("\\", "/");
}

async function trackedEntries() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--stage", "-z"], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const entries = stdout.toString("utf8").split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error(`Cannot parse staged Git record: ${record}`);
    const [mode, hash, stage] = record.slice(0, tab).split(" ");
    return Object.freeze({ mode, hash, stage, path: normalized(record.slice(tab + 1)) });
  });
  if (!entries.length) throw new Error("git ls-files returned no tracked files; refusing to approve an unknown public candidate.");
  return entries;
}

async function stagedBlob(hash) {
  const { stdout } = await execFileAsync("git", ["cat-file", "blob", hash], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}



function publicPayloadEntries(entries) {
  return entries.filter((entry) => entry.path !== PUBLICATION_CLEARANCE_PATH);
}

async function untrackedPaths() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.toString("utf8").split("\0").filter(Boolean).map(normalized);
}



function payloadIdentityMutationFindings() {
  const failures = [];
  const fixture = [
    { mode: "100644", hash: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391", stage: "0", path: "a.txt" },
    { mode: "100644", hash: "ce013625030ba8dba906f756967f9e9ca394464a", stage: "0", path: "sub/b.txt" },
  ];
  const expectedGitTree = "2814fde3292a80a49b8ea6de71eec9ec7c760af2";
  const baseSha256 = publicPayloadSha256(fixture);
  const baseTreeOid = publicPayloadTreeOid(fixture);
  if (baseTreeOid !== expectedGitTree) failures.push("public-payload tree calibration did not match Git's known tree OID");
  for (const [label, mutated] of [
    ["path", fixture.map((entry, index) => index ? entry : { ...entry, path: "changed.txt" })],
    ["mode", fixture.map((entry, index) => index ? entry : { ...entry, mode: "100755" })],
    ["blob", fixture.map((entry, index) => index ? entry : { ...entry, hash: "0".repeat(40) })],
  ]) {
    if (publicPayloadSha256(mutated) === baseSha256 || publicPayloadTreeOid(mutated) === baseTreeOid) {
      failures.push(`public-payload ${label} mutation did not change both identities`);
    }
  }
  const withPending = [...fixture, { mode: "100644", hash: "1".repeat(40), stage: "0", path: PUBLICATION_CLEARANCE_PATH }];
  const withApproved = [...fixture, { mode: "100644", hash: "2".repeat(40), stage: "0", path: PUBLICATION_CLEARANCE_PATH }];
  for (const rows of [withPending, withApproved]) {
    const payload = publicPayloadEntries(rows);
    if (publicPayloadSha256(payload) !== baseSha256 || publicPayloadTreeOid(payload) !== baseTreeOid) {
      failures.push("clearance-only byte mutation changed the public-payload identity");
    }
  }
  return failures;
}

function runtimeArtworkFindings(relativePath, line, index, findings) {
  if (PLATFORM_PICTOGRAPH.test(line)) {
    findings.push(`${relativePath}:${index + 1}: platform emoji or pictograph artwork is not allowed; use original HTML/CSS/SVG art`);
  }
  if (/data\s*:\s*(?:image|audio|video|font)\//iu.test(line)) {
    findings.push(`${relativePath}:${index + 1}: inline data-URI media is not allowed; extract, hash, and register the asset`);
  }
  if (/(?:\bsrc\b|\bhref\b|\bsrcset\b|\bposter\b)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:|@import\s+(?:url\()?["']?\s*https?:/iu.test(line)) {
    findings.push(`${relativePath}:${index + 1}: remote runtime asset reference is not allowed`);
  }
}

function contentFindings(relativePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (LEGACY_SKILL_ID.test(line)) {
      findings.push(`${relativePath}:${index + 1}: legacy curriculum identifier`);
    }
    if (PUBLISHER_MARKERS.some((pattern) => pattern.test(line))) {
      findings.push(`${relativePath}:${index + 1}: private publisher-derived marker`);
    }
    if (PERSONAL_OR_LOCAL_MARKERS.some((pattern) => pattern.test(line))) {
      findings.push(`${relativePath}:${index + 1}: personal identity, email, or local user path`);
    }
    if (ENCODED_PERSONAL_MARKERS.some((pattern) => pattern.test(line))) {
      findings.push(`${relativePath}:${index + 1}: encoded personal identity marker`);
    }
    if (CREDENTIAL_MARKERS.some((pattern) => pattern.test(line))) {
      findings.push(`${relativePath}:${index + 1}: possible embedded credential`);
    }
    if (relativePath === "index.html") runtimeArtworkFindings(relativePath, line, index, findings);
  }
  return findings;
}

function privacyMutationFindings() {
  const failures = [];
  const cases = [
    ["a Unix home path", ["/ho", "me/tester/project"].join(""), /personal identity/u],
    ["a North American phone number", ["902", "-555", "-0123"].join(""), /personal identity/u],
    ["a Canadian postal code", ["B3H", " 1Y2"].join(""), /personal identity/u],
    ["a street address", ["123", " Example", " Road"].join(""), /personal identity/u],
    ["a GitHub OAuth token", ["gh", "o_", "A".repeat(24)].join(""), /embedded credential/u],
    ["an AWS access key", ["AK", "IA", "A".repeat(16)].join(""), /embedded credential/u],
    ["a Slack token", ["xo", "xb-", "A".repeat(20)].join(""), /embedded credential/u],
    ["a bearer token", ["Authorization: Bearer ", "A".repeat(24)].join(""), /embedded credential/u],
    ["a hex-encoded Windows user path", ["433a", "5c55", "7365", "7273", "5c"].join(""), /encoded personal identity/u],
    ["a base64-encoded Unix user path", ["L1Vz", "ZXJz", "Lw=="].join(""), /encoded personal identity/u],
    ["a Unicode-escaped Windows user path", [String.raw`\u0043`, String.raw`\u003a`, String.raw`\u005c`, String.raw`\u0055`, String.raw`\u0073`, String.raw`\u0065`, String.raw`\u0072`, String.raw`\u0073`, String.raw`\u005c`].join(""), /encoded personal identity/u],
  ];
  for (const [label, text, expected] of cases) {
    if (!contentFindings("privacy-mutation.fixture", text).some((finding) => expected.test(finding))) {
      failures.push(`privacy guard mutation self-test did not reject ${label}`);
    }
  }
  return failures;
}

function binaryFindings(relativePath, bytes) {
  const findings = [];
  const ascii = bytes.toString("latin1");
  const utf16 = bytes.toString("utf16le");
  if ([ascii, utf16].some((text) => HIGH_CONFIDENCE_PERSONAL_OR_LOCAL_MARKERS.some((pattern) => pattern.test(text)))) {
    findings.push(`${relativePath}: binary metadata may contain a personal identity, email, or local user path`);
  }
  if ([ascii, utf16].some((text) => ENCODED_PERSONAL_MARKERS.some((pattern) => pattern.test(text)))) {
    findings.push(`${relativePath}: binary metadata may contain an encoded personal identity marker`);
  }
  if ([ascii, utf16].some((text) => CREDENTIAL_MARKERS.some((pattern) => pattern.test(text)))) {
    findings.push(`${relativePath}: binary metadata may contain an embedded credential`);
  }
  return findings;
}

function decodeUtf16Be(bytes) {
  let text = "";
  for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
    text += String.fromCharCode(bytes.readUInt16BE(offset));
  }
  return text;
}

function fontNameTable(bytes) {
  if (bytes.length < 12) throw new Error("truncated font header");
  const tableCount = bytes.readUInt16BE(4);
  let nameOffset = -1;
  let nameLength = 0;
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    if (recordOffset + 16 > bytes.length) throw new Error("truncated font table directory");
    if (bytes.toString("ascii", recordOffset, recordOffset + 4) === "name") {
      nameOffset = bytes.readUInt32BE(recordOffset + 8);
      nameLength = bytes.readUInt32BE(recordOffset + 12);
    }
  }
  if (nameOffset < 0 || nameOffset + nameLength > bytes.length || nameLength < 6) {
    throw new Error("missing or invalid font name table");
  }
  return { nameOffset, nameLength };
}

function fontNameString(bytes, table, recordOffset) {
  const { nameOffset, nameLength, stringsOffset } = table;
  if (recordOffset + 12 > nameOffset + nameLength) throw new Error("truncated font name record");
  const platformId = bytes.readUInt16BE(recordOffset);
  const length = bytes.readUInt16BE(recordOffset + 8);
  const relativeOffset = bytes.readUInt16BE(recordOffset + 10);
  const start = nameOffset + stringsOffset + relativeOffset;
  const end = start + length;
  if (start < nameOffset || end > nameOffset + nameLength) throw new Error("font name string is out of bounds");
  const value = bytes.subarray(start, end);
  return platformId === 0 || platformId === 3 ? decodeUtf16Be(value) : value.toString("latin1");
}

function fontNameMetadata(bytes) {
  const table = fontNameTable(bytes);
  const count = bytes.readUInt16BE(table.nameOffset + 2);
  table.stringsOffset = bytes.readUInt16BE(table.nameOffset + 4);
  const metadataStrings = [];
  for (let index = 0; index < count; index += 1) {
    metadataStrings.push(fontNameString(bytes, table, table.nameOffset + 6 + index * 12));
  }
  return metadataStrings.join("\n");
}

function fontMetadataFindings(relativePath, bytes) {
  const findings = [];
  try {
    const metadata = fontNameMetadata(bytes);
    if (PERSONAL_OR_LOCAL_MARKERS.some((pattern) => pattern.test(metadata))) {
      findings.push(`${relativePath}: font name metadata contains a personal identity, email, or local user path`);
    }
    if (CREDENTIAL_MARKERS.some((pattern) => pattern.test(metadata))) {
      findings.push(`${relativePath}: font name metadata contains a possible credential`);
    }
  } catch (error) {
    findings.push(`${relativePath}: font metadata could not be validated (${error.message})`);
  }
  return findings;
}

function pngChunkAt(bytes, offset) {
  const length = bytes.readUInt32BE(offset);
  const type = bytes.toString("ascii", offset + 4, offset + 8);
  const dataStart = offset + 8;
  const chunkEnd = dataStart + length + 4;
  if (!/^[A-Za-z]{4}$/u.test(type) || chunkEnd > bytes.length) {
    throw new Error("truncated or invalid PNG chunk");
  }
  return { length, type, dataStart, chunkEnd };
}

function pngEncodingValid(bytes, dataStart, width, height) {
  return width && height && width <= 4096 && height <= 4096
    && bytes[dataStart + 8] === 8 && [2, 6].includes(bytes[dataStart + 9])
    && bytes[dataStart + 10] === 0 && bytes[dataStart + 11] === 0 && bytes[dataStart + 12] === 0;
}

function validatePngHeader(bytes, chunk) {
  if (chunk.type !== "IHDR" || chunk.length !== 13) throw new Error("PNG must begin with one standard IHDR chunk");
  const width = bytes.readUInt32BE(chunk.dataStart);
  const height = bytes.readUInt32BE(chunk.dataStart + 4);
  if (!pngEncodingValid(bytes, chunk.dataStart, width, height)) {
    throw new Error("PNG dimensions or encoding contract is invalid");
  }
}

function validatePngCompletion(bytes, chunks, offset) {
  if (offset !== bytes.length || chunks.at(-1) !== "IEND" || chunks.filter((type) => type === "IHDR").length !== 1 || !chunks.includes("IDAT")) {
    throw new Error("PNG chunk stream is incomplete or has trailing bytes");
  }
}

function pngChunks(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 33 || !bytes.subarray(0, signature.length).equals(signature)) throw new Error("invalid PNG signature");
  const chunks = [];
  let offset = signature.length;
  while (offset + 12 <= bytes.length) {
    const chunk = pngChunkAt(bytes, offset);
    chunks.push(chunk.type);
    if (chunks.length === 1) validatePngHeader(bytes, chunk);
    if (chunk.type === "pHYs" && chunk.length !== 9) throw new Error("PNG physical-density chunk is invalid");
    if (chunk.type === "IEND" && chunk.length !== 0) throw new Error("PNG end chunk is invalid");
    offset = chunk.chunkEnd;
    if (chunk.type === "IEND") break;
  }
  validatePngCompletion(bytes, chunks, offset);
  return chunks;
}

function pngMetadataFindings(relativePath, bytes) {
  const findings = [];
  try {
    const chunks = pngChunks(bytes);
    const unexpected = chunks.filter((type) => !["IHDR", "pHYs", "IDAT", "IEND"].includes(type));
    if (unexpected.length) findings.push(`${relativePath}: PNG contains unexpected metadata chunks ${[...new Set(unexpected)].join(", ")}`);
    if (chunks.filter((type) => type === "pHYs").length > 1) findings.push(`${relativePath}: PNG contains duplicate physical-density metadata`);
  } catch (error) {
    findings.push(`${relativePath}: PNG metadata could not be validated (${error.message})`);
  }
  return findings;
}

function wavMetadataFindings(relativePath, bytes) {
  const findings = [];
  try {
    if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error("invalid RIFF/WAVE header");
    }
    const chunks = [];
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const id = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const end = offset + 8 + length;
      if (end > bytes.length) throw new Error(`truncated ${id} chunk`);
      chunks.push(id);
      offset = end + (length % 2);
    }
    if (!chunks.includes("fmt ") || !chunks.includes("data")) throw new Error("missing audio format or sample data");
    const unexpected = chunks.filter((id) => !["fmt ", "data"].includes(id));
    if (unexpected.length) findings.push(`${relativePath}: WAV contains unexpected metadata chunks ${[...new Set(unexpected)].join(", ")}`);
  } catch (error) {
    findings.push(`${relativePath}: WAV metadata could not be validated (${error.message})`);
  }
  return findings;
}



function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value, allowed, label, findings) {
  if (!plainObject(value)) {
    findings.push(`${label}: expected an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    findings.push(`${label}: fields must be exactly ${expected.join(", ")}`);
    return false;
  }
  return true;
}

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function localEvidencePath(value) {
  return nonempty(value) && !/^https?:\/\//iu.test(value);
}

function canarySupplyChainInput(blobs) {
  return buildTrustedHttpsCanarySupplyChainInput(
    (relativePath) => blobs.get(relativePath)?.toString("utf8") || "",
  );
}

function registerPolicyFindings(inspection) {
  const { register, tracked, findings } = inspection;
  const requiredTopLevel = [
    "schemaVersion",
    "policy",
    "approvedLicences",
    "firstPartyPaths",
    "bundledComponents",
    "referenceComponents",
    "workflowComponents",
    "toolchain",
    "prohibitedSources",
  ];
  if (!exactKeys(register, requiredTopLevel, COMPONENT_REGISTER_PATH, findings)) return false;
  if (register.schemaVersion !== 1) findings.push(`${COMPONENT_REGISTER_PATH}: schemaVersion must be 1`);

  const policyPath = inspection.policyPath = normalized(path.posix.normalize(path.posix.join("licenses", String(register.policy || ""))));
  if (policyPath !== "OPEN_SOURCE_POLICY.md" || !tracked.has(policyPath)) {
    findings.push(`${COMPONENT_REGISTER_PATH}: policy must resolve to tracked OPEN_SOURCE_POLICY.md`);
  }

  const registeredLicences = Array.isArray(register.approvedLicences) ? register.approvedLicences : [];
  const expectedLicences = [...APPROVED_LICENCES].sort();
  const actualLicences = [...registeredLicences].sort();
  if (actualLicences.length !== expectedLicences.length || actualLicences.some((value, index) => value !== expectedLicences[index])) {
    findings.push(`${COMPONENT_REGISTER_PATH}: approvedLicences must exactly match the guard's reviewed allowlist`);
  }
  return true;
}

function pathsAreSorted(values) {
  const sorted = [...values].sort();
  return values.every((value, index) => value === sorted[index]);
}

function evidenceRecordIdentityFindings(record, evidencePath, label, findings) {
  if (!nonempty(evidencePath) || evidencePath.startsWith("../") || path.posix.isAbsolute(evidencePath)) findings.push(`${label}: path must be a safe repository-relative path`);
  if (!EVIDENCE_KINDS.has(record.kind)) findings.push(`${label}: kind is not approved`);
  if (!EVIDENCE_ORIGINS.has(record.origin)) findings.push(`${label}: origin is not approved`);
  if (!EVIDENCE_LICENCE_EXPRESSIONS.has(record.licenceExpression) || RESTRICTIVE_LICENCE.test(String(record.licenceExpression))) findings.push(`${label}: licenceExpression is not approved`);
  if (!nonempty(record.purpose)) findings.push(`${label}: purpose is required`);
  if (!/^[a-f0-9]{64}$/u.test(String(record.sha256))) findings.push(`${label}: sha256 must be 64 lowercase hexadecimal characters`);
}

function inspectEvidenceRecord(inspection, record, index, declaredPaths) {
  const { tracked, blobs, findings, evidencePaths } = inspection;
  const label = `${EVIDENCE_DECLARATION_PATH} records[${index}]`;
  if (!exactKeys(record, ["path", "kind", "origin", "licenceExpression", "purpose", "sha256"], label, findings)) return;
  const evidencePath = normalized(record.path);
  declaredPaths.push(evidencePath);
  evidenceRecordIdentityFindings(record, evidencePath, label, findings);
  if (!tracked.has(evidencePath)) findings.push(`${label}: reviewed evidence path is not staged: ${evidencePath}`);
  const stagedEvidence = blobs.get(evidencePath);
  if (stagedEvidence && sha256(stagedEvidence) !== record.sha256) findings.push(`${label}: staged evidence hash differs for ${evidencePath}`);
  evidencePaths.add(evidencePath);
}

function inspectEvidenceDeclaration(inspection, declaration) {
  const { findings } = inspection;
  if (!exactKeys(declaration, ["schemaVersion", "records"], EVIDENCE_DECLARATION_PATH, findings)) return;
  if (declaration.schemaVersion !== 1) findings.push(`${EVIDENCE_DECLARATION_PATH}: schemaVersion must be 1`);
  if (!Array.isArray(declaration.records) || !declaration.records.length) {
    findings.push(`${EVIDENCE_DECLARATION_PATH}: records must be a nonempty array`);
    return;
  }
  const declaredPaths = [];
  for (const [index, record] of declaration.records.entries()) inspectEvidenceRecord(inspection, record, index, declaredPaths);
  if (new Set(declaredPaths).size !== declaredPaths.length) findings.push(`${EVIDENCE_DECLARATION_PATH}: records contain duplicate paths`);
  if (!pathsAreSorted(declaredPaths)) findings.push(`${EVIDENCE_DECLARATION_PATH}: records must be sorted by path`);
}

function registerEvidenceFindings(inspection) {
  const { blobs, findings, policyPath, evidencePaths, usedEvidencePaths } = inspection;
  const evidenceDeclarationBytes = blobs.get(EVIDENCE_DECLARATION_PATH);
  if (!evidenceDeclarationBytes) {
    findings.push(`${EVIDENCE_DECLARATION_PATH}: reviewed evidence declaration is missing`);
  } else {
    try {
      inspectEvidenceDeclaration(inspection, JSON.parse(evidenceDeclarationBytes.toString("utf8")));
    } catch (error) {
      findings.push(`${EVIDENCE_DECLARATION_PATH}: invalid JSON (${error.message})`);
    }
  }
  for (const requiredEvidence of [policyPath, "THIRD_PARTY_NOTICES.md"]) {
    if (evidencePaths.has(requiredEvidence)) usedEvidencePaths.add(requiredEvidence);
  }
}

function firstPartyPathFindings(firstPartyPath, tracked, findings) {
  if (!nonempty(firstPartyPath) || firstPartyPath.startsWith("../") || path.posix.isAbsolute(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: invalid first-party path ${firstPartyPath}`);
  if (!tracked.has(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: first-party path is not staged: ${firstPartyPath}`);
  if (REGISTERED_ASSET_PATH.test(firstPartyPath) || REGISTERED_BINARY_EXTENSION.test(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: assets and binary files require component records, not first-party path classification: ${firstPartyPath}`);
}

function firstPartyDeclarationFindings(declarationBytes, firstPartyPaths, findings) {
  const declarationText = declarationBytes.toString("utf8");
  const declarationLines = declarationText.split("\n");
  if (declarationText.includes("\r")) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration must use canonical LF line endings`);
  if (FIRST_PARTY_HEADER.some((line, index) => declarationLines[index] !== line)) {
    findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration header is invalid`);
  }
  const declaredPaths = declarationLines.slice(FIRST_PARTY_HEADER.length).filter(Boolean);
  if (new Set(declaredPaths).size !== declaredPaths.length) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration contains duplicate paths`);
  if (!pathsAreSorted(declaredPaths)) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration must be sorted`);
  if (declaredPaths.length !== firstPartyPaths.length || declaredPaths.some((value, index) => value !== firstPartyPaths[index])) {
    findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths differs from the reviewed first-party declaration`);
  }
}

function registerFirstPartyFindings(inspection) {
  const { register, blobs, tracked, findings, firstPartyPaths, firstPartySet } = inspection;
  if (!Array.isArray(register.firstPartyPaths) || !firstPartyPaths.length) {
    findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths must be a nonempty exact public-tree inventory`);
  } else {
    if (firstPartySet.size !== firstPartyPaths.length) findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths contains duplicates`);
    if (!pathsAreSorted(firstPartyPaths)) findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths must be sorted`);
    for (const firstPartyPath of firstPartyPaths) firstPartyPathFindings(firstPartyPath, tracked, findings);
  }
  const declarationBytes = blobs.get(FIRST_PARTY_DECLARATION_PATH);
  if (!declarationBytes) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: reviewed first-party declaration is missing`);
  else firstPartyDeclarationFindings(declarationBytes, firstPartyPaths, findings);
}



function registerComponentId(component, label, inspection) {
  const { componentIds, findings } = inspection;
  if (!nonempty(component.id) || componentIds.has(component.id)) findings.push(`${label}: id must be unique and nonempty`);
  else componentIds.add(component.id);
}

function bundledComponentKeys(component) {
  return [
    "id", "kind", "origin", "paths", "sha256", "licence", "version", "creator", "copyright", "sourceUrl", "licenceEvidence", "attributionRecord", "modified",
    ...(component?.origin === "third-party-open" ? ["sourceCommit", "sourceArtifactSha256", "sourceInnerPath"] : []),
    ...(component?.origin === "public-domain" ? ["publicDomainBasis", "jurisdiction", "determinationDate", "evidenceUrl", "evidenceSha256"] : []),
    ...(component?.modified === true ? ["modificationDescription"] : []),
  ];
}

function bundledLicenceFindings(component, label, findings) {
  if (!["original-project", "third-party-open", "public-domain"].includes(component.origin)) findings.push(`${label}: invalid origin`);
  if (!APPROVED_LICENCES.has(component.licence) || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: unapproved or restrictive licence ${component.licence}`);
  if (!KIND_LICENCES[component.kind] || !KIND_LICENCES[component.kind].has(component.licence)) findings.push(`${label}: licence ${component.licence} is not approved for component kind ${component.kind}`);
  if (component.origin === "original-project" && component.licence !== "MIT") findings.push(`${label}: original project material must use MIT`);
  if (component.origin === "public-domain" && !["CC0-1.0", "LicenseRef-Public-Domain"].includes(component.licence)) findings.push(`${label}: public-domain material must use CC0-1.0 or an evidence-backed public-domain record`);
}

function publicDomainEvidenceFindings(component, label, findings) {
  if (![component.publicDomainBasis, component.jurisdiction, component.determinationDate, component.evidenceUrl, component.evidenceSha256].every(nonempty)) findings.push(`${label}: public-domain records require basis, jurisdiction, determination date, evidence URL, and evidence SHA-256`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(component.determinationDate))) findings.push(`${label}: public-domain determinationDate must use YYYY-MM-DD`);
  if (!/^https:\/\//iu.test(String(component.evidenceUrl)) || !/^[a-f0-9]{64}$/u.test(String(component.evidenceSha256))) findings.push(`${label}: public-domain evidence URL and SHA-256 are invalid`);
  if (normalized(String(component.licenceEvidence)) === "LICENSE") findings.push(`${label}: the repository MIT licence cannot serve as public-domain evidence`);
}

function bundledPathFindings(component, componentPath, label, inspection) {
  const { registeredPaths, tracked, blobs, findings } = inspection;
  if (registeredPaths.has(componentPath)) findings.push(`${label}: duplicate registered path ${componentPath}`);
  registeredPaths.add(componentPath);
  if (!tracked.has(componentPath)) findings.push(`${label}: registered path is not staged: ${componentPath}`);
  if (!/^[a-f0-9]{64}$/u.test(String(component.sha256))) findings.push(`${label}: sha256 must be 64 lowercase hexadecimal characters`);
  const bytes = blobs.get(componentPath);
  if (bytes && sha256(bytes) !== component.sha256) findings.push(`${label}: staged blob hash differs for ${componentPath}`);
}

function bundledSourceFindings(component, label, findings) {
  if (!nonempty(component.version) || !nonempty(component.creator) || !nonempty(component.copyright) || !nonempty(component.sourceUrl)) findings.push(`${label}: version, creator, copyright, and sourceUrl are required`);
  if (PROHIBITED_ACTIVE_SOURCE.test(String(component.sourceUrl))) findings.push(`${label}: prohibited BBC RemArc or other non-open source cannot supply a bundled component`);
  if (component.modified !== true && component.modified !== false) findings.push(`${label}: modified must be boolean`);
}

function thirdPartySourceFindings(component, label, findings) {
  if (!/^[a-f0-9]{40}$/u.test(String(component.sourceCommit))) findings.push(`${label}: third-party sourceCommit must be an immutable 40-character Git SHA`);
  if (!/^[a-f0-9]{64}$/u.test(String(component.sourceArtifactSha256))) findings.push(`${label}: third-party sourceArtifactSha256 must be a SHA-256 digest`);
  if (!nonempty(component.sourceInnerPath) || path.posix.isAbsolute(component.sourceInnerPath) || normalized(component.sourceInnerPath).startsWith("../")) findings.push(`${label}: third-party sourceInnerPath must be a safe archive-relative path`);
}

function registerLocalEvidence(evidence, field, label, inspection) {
  const { tracked, findings, evidencePaths, usedEvidencePaths } = inspection;
  if (!localEvidencePath(evidence) || !tracked.has(normalized(evidence))) findings.push(`${label}: ${field} must be a tracked local file`);
  else if (!evidencePaths.has(normalized(evidence))) findings.push(`${label}: ${field} must be a reviewed evidence path`);
  else usedEvidencePaths.add(normalized(evidence));
}

function bundledLicenceTextFindings(component, licenceBytes, label, findings) {
  if (component.licence === "OFL-1.1" && (!licenceBytes || sha256(licenceBytes) !== REVIEWED_INTER.licenceEvidenceSha256 || !/SIL OPEN FONT LICENSE Version 1\.1/u.test(licenceBytes.toString("utf8")))) {
    findings.push(`${label}: OFL licence evidence is not the exact reviewed upstream text`);
  }
  if (component.licence === "MIT" && (!licenceBytes || !/^MIT License\r?$/mu.test(licenceBytes.toString("utf8")) || !/Permission is hereby granted, free of charge/u.test(licenceBytes.toString("utf8")))) {
    findings.push(`${label}: MIT licence evidence is missing the reviewed grant`);
  }
}

function bundledAttributionFindings(component, componentPath, attributionBytes, label, findings) {
  const attribution = attributionBytes.toString("utf8");
  const componentName = path.posix.basename(componentPath);
  if (!attribution.includes(componentName) || !attribution.toLowerCase().includes(String(component.sha256).toLowerCase())) findings.push(`${label}: attribution record must identify the shipped file and exact SHA-256`);
}

function reviewedInterFindings(component, label, findings) {
  for (const [field, expected] of Object.entries({
    sha256: REVIEWED_INTER.shippedSha256,
    sourceUrl: REVIEWED_INTER.sourceUrl,
    sourceCommit: REVIEWED_INTER.sourceCommit,
    sourceArtifactSha256: REVIEWED_INTER.sourceArtifactSha256,
    sourceInnerPath: REVIEWED_INTER.sourceInnerPath,
  })) {
    if (component[field] !== expected) findings.push(`${label}: reviewed Inter ${field} does not match the approved upstream artifact`);
  }
  if (component.kind !== "font" || component.origin !== "third-party-open" || component.licence !== "OFL-1.1" || component.modified !== false) findings.push(`${label}: reviewed Inter classification is invalid`);
}

function bundledEvidenceFindings(component, componentPath, label, inspection) {
  const { blobs, findings } = inspection;
  for (const field of ["licenceEvidence", "attributionRecord"]) registerLocalEvidence(component[field], field, label, inspection);
  const licenceBytes = blobs.get(normalized(component.licenceEvidence));
  const attributionBytes = blobs.get(normalized(component.attributionRecord));
  bundledLicenceTextFindings(component, licenceBytes, label, findings);
  if (attributionBytes) bundledAttributionFindings(component, componentPath, attributionBytes, label, findings);
  if (component.id === REVIEWED_INTER.id) reviewedInterFindings(component, label, findings);
}

function inspectBundledComponent(inspection, component, index) {
  const { findings } = inspection;
  const label = `${COMPONENT_REGISTER_PATH} bundledComponents[${index}]`;
  if (!exactKeys(component, bundledComponentKeys(component), label, findings)) return;
  registerComponentId(component, label, inspection);
  bundledLicenceFindings(component, label, findings);
  if (component.origin === "public-domain") publicDomainEvidenceFindings(component, label, findings);
  if (component.modified === true && !nonempty(component.modificationDescription)) findings.push(`${label}: modified components require a modificationDescription`);
  if (!Array.isArray(component.paths) || component.paths.length !== 1 || !nonempty(component.paths[0])) {
    findings.push(`${label}: paths must contain exactly one staged path so its hash is unambiguous`);
    return;
  }
  const componentPath = normalized(component.paths[0]);
  bundledPathFindings(component, componentPath, label, inspection);
  bundledSourceFindings(component, label, findings);
  if (component.origin === "third-party-open") thirdPartySourceFindings(component, label, findings);
  bundledEvidenceFindings(component, componentPath, label, inspection);
}

function registerBundledFindings(inspection) {
  const { register, findings, entries, registeredPaths } = inspection;
  const bundled = Array.isArray(register.bundledComponents) ? register.bundledComponents : [];
  if (!Array.isArray(register.bundledComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: bundledComponents must be an array`);
  for (const [index, component] of bundled.entries()) inspectBundledComponent(inspection, component, index);
  for (const entry of entries) {
    if ((REGISTERED_ASSET_PATH.test(entry.path) || REGISTERED_BINARY_EXTENSION.test(entry.path)) && !registeredPaths.has(entry.path)) {
      findings.push(`${entry.path}: asset or binary is absent from ${COMPONENT_REGISTER_PATH}`);
    }
  }
}

function openReferenceLicenceFindings(component, source, sourceId, label, findings) {
  if (!APPROVED_LICENCES.has(component.licence) || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: unapproved or restrictive open-reference licence`);
  if (component.licence === "OGL-UK-3.0") {
    const rightsControl = sourceId === "SRC-UK-OGL"
      && source.url === "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
    if (!rightsControl && !/Open Government Licence v3\.0/iu.test(String(source.licence))) {
      findings.push(`${label}: ${sourceId} manifest licence conflicts with OGL-UK-3.0`);
    }
  }
  if (component.licence === "CC-BY-4.0") ccReferenceLicenceFindings(source, sourceId, label, findings);
}

function ccReferenceLicenceFindings(source, sourceId, label, findings) {
  const rightsControl = sourceId === "SRC-AUS-TERMS"
    && source.url === "https://www.australiancurriculum.edu.au/copyright-and-terms-of-use/"
    && /CC BY 4\.0/iu.test(String(source.licence));
  if (!rightsControl && !/Creative Commons Attribution 4\.0/iu.test(String(source.licence))) {
    findings.push(`${label}: ${sourceId} manifest licence conflicts with CC-BY-4.0`);
  }
}

function factualCitationFindings(component, source, sourceId, label, findings) {
  if (component.licence !== null) findings.push(`${label}: factual-citation licence must be null`);
  if (!/(?:no wording is copied|no imagery or wording is reused)/iu.test(String(source.use))) {
    findings.push(`${label}: ${sourceId} does not state the no-copied-expression boundary`);
  }
}

function referenceSourceFindings(component, sourceId, label, references) {
  const { findings, sources, registeredSourceIds } = references;
  if (!nonempty(sourceId) || registeredSourceIds.has(sourceId)) findings.push(`${label}: source id must be unique and nonempty: ${sourceId}`);
  registeredSourceIds.add(sourceId);
  const source = sources.get(sourceId);
  if (!source) {
    findings.push(`${label}: manifest source does not exist: ${sourceId}`);
    return;
  }
  if (component.kind === "factual-citation") factualCitationFindings(component, source, sourceId, label, findings);
  else openReferenceLicenceFindings(component, source, sourceId, label, findings);
}

function inspectReferenceComponent(inspection, component, index, references) {
  const { findings } = inspection;
  const label = `${COMPONENT_REGISTER_PATH} referenceComponents[${index}]`;
  if (!exactKeys(component, ["id", "kind", "sourceIds", "licence", "sourceUrl", "attributionRecord", "reuseBoundary"], label, findings)) return;
  registerComponentId(component, label, inspection);
  if (!["open-reference", "factual-citation"].includes(component.kind)) findings.push(`${label}: invalid reference kind`);
  if (!Array.isArray(component.sourceIds) || !component.sourceIds.length) findings.push(`${label}: sourceIds must be a nonempty array`);
  for (const sourceId of component.sourceIds || []) referenceSourceFindings(component, sourceId, label, references);
  if (!nonempty(component.sourceUrl) || !nonempty(component.reuseBoundary)) findings.push(`${label}: sourceUrl and reuseBoundary are required`);
  registerLocalEvidence(component.attributionRecord, "attributionRecord", label, inspection);
}

function manifestLicenceFindings(manifest, findings) {
  if (manifest?.licence?.spdx !== "MIT" || manifest?.licence?.originalManifest !== "MIT") {
    findings.push(`${CURRICULUM_PATH}: original manifest expression must be explicitly MIT`);
  }
}

function registerReferenceFindings(inspection) {
  const { register, manifest, findings } = inspection;
  const sources = new Map(Array.isArray(manifest.sources) ? manifest.sources.map((source) => [source.id, source]) : []);
  const registeredSourceIds = new Set();
  const referenceContext = { findings, sources, registeredSourceIds };
  const references = Array.isArray(register.referenceComponents) ? register.referenceComponents : [];
  if (!Array.isArray(register.referenceComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: referenceComponents must be an array`);
  for (const [index, component] of references.entries()) inspectReferenceComponent(inspection, component, index, referenceContext);
  for (const sourceId of sources.keys()) {
    if (!registeredSourceIds.has(sourceId)) findings.push(`${COMPONENT_REGISTER_PATH}: manifest source is not registered: ${sourceId}`);
  }
  manifestLicenceFindings(manifest, findings);
}

function inspectWorkflowComponent(component, label, inspection, registeredActions) {
  const { findings } = inspection;
  if (!exactKeys(component, ["id", "kind", "uses", "commit", "version", "licence", "sourceUrl", "licenceEvidence"], label, findings)) return;
  registerComponentId(component, label, inspection);
  workflowComponentIdentityFindings(component, label, findings);
  if (registeredActions.has(component.uses)) findings.push(`${label}: duplicate workflow action ${component.uses}`);
  registeredActions.set(component.uses, component.commit);
}

function workflowComponentIdentityFindings(component, label, findings) {
  if (component.kind !== "workflow-action" || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(String(component.uses))) findings.push(`${label}: invalid workflow action`);
  if (!/^[a-f0-9]{40}$/u.test(String(component.commit))) findings.push(`${label}: commit must be an immutable 40-character lowercase Git SHA`);
  if (component.licence !== "MIT" || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: workflow action must be reviewed MIT material`);
  if (!nonempty(component.version) || !String(component.sourceUrl).startsWith(`https://github.com/${component.uses}/`) || !String(component.licenceEvidence).startsWith(`https://github.com/${component.uses}/`)) findings.push(`${label}: version and exact GitHub source/licence evidence are required`);
}

function inspectWorkflowAction(value, location, relativePath, actions) {
  const { findings, registeredActions, observedActions } = actions;
  if (value.startsWith("./")) {
    findings.push(`${location}: local actions require a separately registered and recursively inspected action manifest`);
    return;
  }
  if (value.startsWith("docker://")) {
    findings.push(`${location}: Docker actions are not approved`);
    return;
  }
  const separator = value.lastIndexOf("@");
  if (separator <= 0) {
    findings.push(`${location}: workflow action must name an immutable registered revision`);
    return;
  }
  const action = value.slice(0, separator);
  const reference = value.slice(separator + 1);
  if (!/^[a-f0-9]{40}$/u.test(reference)) findings.push(`${relativePath}: workflow action ${action} must be pinned to an immutable 40-character lowercase Git SHA`);
  if (registeredActions.get(action) !== reference) findings.push(`${relativePath}: workflow action ${action}@${reference} is absent from or differs from the component register`);
  observedActions.set(action, reference);
}

function inspectWorkflowMapping(line, lineIndex, relativePath, actions) {
  const { findings } = actions;
  const location = `${relativePath}:${lineIndex + 1}`;
  const quotedMappingKey = /^\s*(?:-\s*)?["'][^"'\r\n]+["']\s*:/u.test(line)
    || /[{,]\s*["'][^"'\r\n]+["']\s*:/u.test(line);
  if (quotedMappingKey || /\\(?:x[0-9a-f]{2}|u[0-9a-f]{4}|U[0-9a-f]{8})/iu.test(line)) {
    findings.push(`${location}: quoted or escaped workflow mapping keys are not allowed`);
    return;
  }
  const containsUses = /(?:^|[-{,\s])uses\s*:/iu.test(line);
  const match = line.match(/^\s+uses\s*:\s*([^'"\s#},]+)(?:\s*#.*)?$/iu);
  if (containsUses && !match) {
    findings.push(`${location}: workflow uses value could not be parsed safely`);
    return;
  }
  if (match) inspectWorkflowAction(match[1], location, relativePath, actions);
}

function inspectWorkflowLines(workflowText, relativePath, actions) {
  const workflowLines = workflowText.split(/\r?\n/u);
  let blockScalarIndent = null;
  for (const [lineIndex, line] of workflowLines.entries()) {
    const indentation = line.match(/^\s*/u)[0].length;
    if (blockScalarIndent !== null) {
      if (!line.trim() || indentation > blockScalarIndent) continue;
      blockScalarIndent = null;
    }
    if (/^\s*(?:-\s*)?run\s*:\s*[|>][-+0-9]*\s*(?:#.*)?$/iu.test(line)) {
      blockScalarIndent = indentation;
      continue;
    }
    inspectWorkflowMapping(line, lineIndex, relativePath, actions);
  }
}

function workflowRuntimeFindings(workflowText, relativePath, findings) {
  if (/^\s*(?:container|services)\s*:/gmu.test(workflowText)) findings.push(`${relativePath}: job containers and services are not approved workflow dependencies`);
  if (/(?:^|\s)(?:curl|wget|Invoke-WebRequest|iwr|npm\s+(?:install|ci)|npx|pip\d*\s+install|choco\s+install|winget\s+install|apt-get\s+install|git\s+clone)(?:\s|$)/imu.test(workflowText)) {
    findings.push(`${relativePath}: network installers or ad-hoc downloaded executables are not allowed in workflows`);
  }
  for (const match of workflowText.matchAll(/node-version\s*:\s*["']?([^\s#'"]+)/gmu)) {
    if (match[1] !== "24.14.0") findings.push(`${relativePath}: Node toolchain must be pinned to reviewed version 24.14.0`);
  }
}

function registerWorkflowFindings(inspection) {
  const { register, blobs, findings } = inspection;
  const workflow = Array.isArray(register.workflowComponents) ? register.workflowComponents : [];
  if (!Array.isArray(register.workflowComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: workflowComponents must be an array`);
  const registeredActions = new Map();
  for (const [index, component] of workflow.entries()) {
    inspectWorkflowComponent(component, `${COMPONENT_REGISTER_PATH} workflowComponents[${index}]`, inspection, registeredActions);
  }
  const observedActions = new Map();
  const actions = { findings, registeredActions, observedActions };
  for (const [relativePath, bytes] of blobs.entries()) {
    if (!/^\.github\/workflows\/.+\.ya?ml$/iu.test(relativePath)) continue;
    const workflowText = bytes.toString("utf8");
    inspectWorkflowLines(workflowText, relativePath, actions);
    workflowRuntimeFindings(workflowText, relativePath, findings);
  }
  for (const [action, commit] of registeredActions.entries()) {
    if (observedActions.get(action) !== commit) findings.push(`${COMPONENT_REGISTER_PATH}: registered workflow action is not used at its reviewed commit: ${action}`);
  }
}

function reviewedNodeToolFindings(nodeTool, findings) {
  const keys = ["id", "kind", "version", "licence", "sourceUrl", "licenceEvidence", "bundled"];
  if (!exactKeys(nodeTool, keys, `${COMPONENT_REGISTER_PATH} toolchain[0]`, findings)) return;
  if (nodeTool.id !== "nodejs-24" || nodeTool.version !== "24.14.0" || nodeTool.licence !== "MIT" || nodeTool.bundled !== false) findings.push(`${COMPONENT_REGISTER_PATH}: Node.js toolchain record is not the reviewed open-source version`);
  if (nodeTool.kind !== "build-and-audit-tool" || nodeTool.sourceUrl !== "https://github.com/nodejs/node/tree/v24.14.0" || nodeTool.licenceEvidence !== "https://github.com/nodejs/node/blob/v24.14.0/LICENSE") findings.push(`${COMPONENT_REGISTER_PATH}: Node.js source or licence evidence is not the reviewed upstream record`);
}

function registerToolchainFindings(inspection) {
  const { register, findings, evidencePaths, usedEvidencePaths } = inspection;
  if (!Array.isArray(register.toolchain) || register.toolchain.length !== 13) {
    findings.push(`${COMPONENT_REGISTER_PATH}: toolchain must contain exactly the thirteen reviewed Node.js, Caddy, Playwright, Ajv, fast-check, and pure-rand dependency records`);
    return;
  }
  reviewedNodeToolFindings(register.toolchain[0], findings);
  for (const { index, keys, expected } of REVIEWED_TOOLCHAIN_RECORDS) {
    const tool = register.toolchain[index];
    const label = `${COMPONENT_REGISTER_PATH} toolchain[${index}]`;
    if (exactKeys(tool, keys, label, findings)
        && Object.entries(expected).some(([key, value]) => tool[key] !== value)) {
      findings.push(`${label}: CI-only tool identity, licence, source, integrity, attribution, and scope must remain exact`);
    }
    if (tool?.attributionRecord === "licenses/ci-toolchain.md" && evidencePaths.has(tool.attributionRecord)) usedEvidencePaths.add(tool.attributionRecord);
  }
}

function registerCanaryFindings(inspection) {
  const { blobs, findings } = inspection;
  findings.push(...trustedHttpsCanarySupplyChainFindings(canarySupplyChainInput(blobs)));
}

function registerProhibitedFindings(inspection) {
  const { register, findings } = inspection;
  const prohibitedKeys = ["id", "reason", "url"];
  if (!Array.isArray(register.prohibitedSources) || !register.prohibitedSources.length) findings.push(`${COMPONENT_REGISTER_PATH}: prohibitedSources must record the BBC RemArc exclusion`);
  else {
    for (const [index, source] of register.prohibitedSources.entries()) {
      const label = `${COMPONENT_REGISTER_PATH} prohibitedSources[${index}]`;
      if (!exactKeys(source, prohibitedKeys, label, findings)) continue;
      if (!nonempty(source.id) || !nonempty(source.reason) || !nonempty(source.url)) findings.push(`${label}: id, reason, and url are required`);
    }
    if (!register.prohibitedSources.some((source) => source.id === "bbc-sound-effects-remarc" && /non-commercial/iu.test(source.reason))) findings.push(`${COMPONENT_REGISTER_PATH}: BBC RemArc non-commercial exclusion is missing`);
  }
}

function registerClassificationFindings(inspection) {
  const { tracked, findings, firstPartySet, registeredPaths, evidencePaths, usedEvidencePaths } = inspection;
  for (const relativePath of tracked) {
    if (relativePath.startsWith("licenses/") && relativePath !== COMPONENT_REGISTER_PATH && !evidencePaths.has(relativePath) && !firstPartySet.has(relativePath)) {
      findings.push(`${relativePath}: orphaned licence or attribution file is not referenced by the component register`);
    }
    const classifications = Number(firstPartySet.has(relativePath)) + Number(registeredPaths.has(relativePath)) + Number(evidencePaths.has(relativePath));
    if (classifications === 0) findings.push(`${relativePath}: public path is not classified as first-party, a registered component, or licence evidence`);
    if (classifications > 1) findings.push(`${relativePath}: public path has overlapping first-party, bundled-component, or licence-evidence classifications`);
  }
  for (const evidencePath of evidencePaths) {
    if (!usedEvidencePaths.has(evidencePath)) findings.push(`${EVIDENCE_DECLARATION_PATH}: declared evidence path is not used: ${evidencePath}`);
  }
}

function registerRequiredRightsFindings(inspection) {
  const { entryByPath, findings } = inspection;
  for (const requiredPath of REQUIRED_RIGHTS_PATHS) {
    if (!entryByPath.has(requiredPath)) findings.push(`${requiredPath}: required open-source rights record is not staged`);
  }
}

function registerFindings(register, entries, blobs, manifest) {
  const inspection = {
    register, entries, blobs, manifest, findings: [],
    tracked: new Set(entries.map((entry) => entry.path)),
    entryByPath: new Map(entries.map((entry) => [entry.path, entry])),
    evidencePaths: new Set(), usedEvidencePaths: new Set(),
    registeredPaths: new Set(), componentIds: new Set(),
  };
  if (!registerPolicyFindings(inspection)) return inspection.findings;
  registerEvidenceFindings(inspection);
  inspection.firstPartyPaths = Array.isArray(register.firstPartyPaths) ? register.firstPartyPaths.map(normalized) : [];
  inspection.firstPartySet = new Set(inspection.firstPartyPaths);
  registerFirstPartyFindings(inspection);
  registerBundledFindings(inspection);
  registerReferenceFindings(inspection);
  registerWorkflowFindings(inspection);
  registerToolchainFindings(inspection);
  registerCanaryFindings(inspection);
  registerProhibitedFindings(inspection);
  registerClassificationFindings(inspection);
  registerRequiredRightsFindings(inspection);
  return inspection.findings;
}

function publicFileManifestFindings(entries, blobs) {
  const findings = [];
  const bytes = blobs.get(PUBLIC_FILE_MANIFEST_PATH);
  if (!bytes) return [`${PUBLIC_FILE_MANIFEST_PATH}: staged public-file manifest is missing`];
  const text = bytes.toString("utf8");
  if (text.includes("\r")) findings.push(`${PUBLIC_FILE_MANIFEST_PATH}: manifest must use canonical LF line endings`);
  const lines = text.split("\n");
  const expectedHeader = [
    "# Generated from the staged Git index by tools/sync-public-inventory.mjs.",
    "# Do not edit by hand.",
    "",
  ];
  if (expectedHeader.some((line, index) => lines[index] !== line)) {
    findings.push(`${PUBLIC_FILE_MANIFEST_PATH}: header does not match the inventory generator`);
  }
  const listed = lines.slice(expectedHeader.length).filter(Boolean);
  const expected = entries.map((entry) => entry.path).sort();
  if (new Set(listed).size !== listed.length) findings.push(`${PUBLIC_FILE_MANIFEST_PATH}: duplicate path`);
  if (listed.length !== expected.length || listed.some((value, index) => value !== expected[index])) {
    findings.push(`${PUBLIC_FILE_MANIFEST_PATH}: listed paths do not exactly match the staged Git index`);
  }
  return findings;
}

const LICENCE_GUARD_MUTATIONS = Object.freeze([
  ["an unregistered asset", ({ entries: rows, blobs: candidateBlobs }) => {
  rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "assets/unregistered.wav" });
  candidateBlobs.set("assets/unregistered.wav", Buffer.from("unregistered"));
}, /absent from .*component-register/u],
  ["changed registered bytes", ({ blobs: candidateBlobs }) => {
  candidateBlobs.set("assets/fonts/Inter-Variable.ttf", Buffer.from("changed-font"));
}, /staged blob hash differs/u],
  ["missing local licence evidence", ({ entries: rows, blobs: candidateBlobs }) => {
  const index = rows.findIndex((entry) => entry.path === "licenses/Inter-OFL.txt");
  if (index >= 0) rows.splice(index, 1);
  candidateBlobs.delete("licenses/Inter-OFL.txt");
}, /licenceEvidence must be a tracked local file/u],
  ["a non-commercial licence", ({ register: candidateRegister }) => {
  candidateRegister.bundledComponents[0].licence = "CC-BY-NC-4.0";
}, /unapproved or restrictive licence/u],
  ["a non-MIT original component", ({ register: candidateRegister }) => {
  const original = candidateRegister.bundledComponents.find((component) => component.origin === "original-project");
  original.licence = "OFL-1.1";
}, /original project material must use MIT/u],
  ["a floating workflow action", ({ blobs: candidateBlobs }) => {
  const workflowPath = ".github/workflows/audit.yml";
  const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/actions\/checkout@[a-f0-9]{40}/u, "actions/checkout@v6");
  candidateBlobs.set(workflowPath, Buffer.from(text));
}, /must be pinned to an immutable/u],
  ["an unregistered manifest source", ({ manifest: candidateManifest }) => {
  candidateManifest.sources.push({ id: "SRC-UNREGISTERED" });
}, /manifest source is not registered/u],
  ["a BBC RemArc bundled source", ({ register: candidateRegister }) => {
  candidateRegister.bundledComponents[0].sourceUrl = "https://sound-effects.bbcrewind.co.uk/example";
}, /prohibited BBC RemArc/u],
  ["a synchronizer-auto-certified copied source file", ({ register: candidateRegister, entries: rows, blobs: candidateBlobs }) => {
  rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "vendor/copied.js" });
  candidateBlobs.set("vendor/copied.js", Buffer.from("export default 'unreviewed';"));
  candidateRegister.firstPartyPaths.push("vendor/copied.js");
  candidateRegister.firstPartyPaths.sort();
}, /differs from the reviewed first-party declaration/u],
  ["an undeclared copied file used as attribution evidence", ({ register: candidateRegister, entries: rows, blobs: candidateBlobs }) => {
  rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "vendor/copied.js" });
  candidateBlobs.set("vendor/copied.js", Buffer.from("unreviewed attribution"));
  candidateRegister.referenceComponents[0].attributionRecord = "vendor/copied.js";
}, /attributionRecord must be a reviewed evidence path/u],
  ["a licence incompatible with its component kind", ({ register: candidateRegister }) => {
  candidateRegister.bundledComponents.find((component) => component.kind === "font").kind = "audio";
}, /is not approved for component kind/u],
  ["an empty attribution record", ({ blobs: candidateBlobs }) => {
  candidateBlobs.set("THIRD_PARTY_NOTICES.md", Buffer.from(""));
}, /attribution record must identify/u],
  ["a generic MIT file used as public-domain evidence", ({ register: candidateRegister, blobs: candidateBlobs }) => {
  const sound = candidateRegister.bundledComponents.find((component) => component.kind === "audio");
  sound.origin = "public-domain";
  sound.licence = "LicenseRef-Public-Domain";
  sound.publicDomainBasis = "Unsubstantiated assertion";
  sound.jurisdiction = "Unknown";
  sound.determinationDate = "2026-07-27";
  sound.evidenceUrl = "https://example.invalid/evidence";
  sound.evidenceSha256 = sha256(candidateBlobs.get("LICENSE"));
  sound.licenceEvidence = "LICENSE";
}, /MIT licence cannot serve as public-domain evidence/u],
  ["a quoted and spaced floating workflow action", ({ blobs: candidateBlobs }) => {
  const workflowPath = ".github/workflows/audit.yml";
  const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}/u, '"uses" : "actions/checkout@v6"');
  candidateBlobs.set(workflowPath, Buffer.from(text));
}, /quoted or escaped workflow mapping keys are not allowed/u],
  ["a dash-prefixed floating workflow action", ({ blobs: candidateBlobs }) => {
  const workflowPath = ".github/workflows/audit.yml";
  const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}/u, "- uses: actions/checkout@v6");
  candidateBlobs.set(workflowPath, Buffer.from(text));
}, /workflow uses value could not be parsed safely/u],
  ["an unsafe flow-mapping workflow action", ({ blobs: candidateBlobs }) => {
  const workflowPath = ".github/workflows/audit.yml";
  const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}[^\r\n]*/u, "- { uses: actions/checkout@v6 }");
  candidateBlobs.set(workflowPath, Buffer.from(text));
}, /workflow uses value could not be parsed safely/u],
  ["an escaped workflow uses key", ({ blobs: candidateBlobs }) => {
  const workflowPath = ".github/workflows/audit.yml";
  const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}[^\r\n]*/u, '"u\\u0073es": "actions/checkout@v6"');
  candidateBlobs.set(workflowPath, Buffer.from(text));
}, /quoted or escaped workflow mapping keys are not allowed/u],
]);

function licenceGuardMutationFindings(register, entries, blobs, manifest) {
  const failures = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const run = (label, mutate, expected) => {
    const candidateRegister = clone(register);
    const candidateEntries = entries.map((entry) => ({ ...entry }));
    const candidateBlobs = new Map([...blobs.entries()].map(([key, value]) => [key, Buffer.from(value)]));
    const candidateManifest = clone(manifest);
    mutate({ register: candidateRegister, entries: candidateEntries, blobs: candidateBlobs, manifest: candidateManifest });
    const result = registerFindings(candidateRegister, candidateEntries, candidateBlobs, candidateManifest);
    if (!result.some((finding) => expected.test(finding))) failures.push(`open-licence guard mutation self-test did not reject ${label}`);
  };

  LICENCE_GUARD_MUTATIONS.forEach((mutation) => run(...mutation));
  failures.push(...trustedHttpsCanarySupplyChainMutationFailures(canarySupplyChainInput(blobs)));
  return failures;
}

function initialCandidateFindings() {
  return [
    ...privacyMutationFindings(),
    ...reviewedRegistryMetadataMutationFindings(contentFindings),
    ...payloadIdentityMutationFindings(),
  ];
}

function candidatePayloadIdentity(entries) {
  const payloadEntries = publicPayloadEntries(entries);
  return {
    payloadSha256: publicPayloadSha256(payloadEntries),
    payloadTreeOid: publicPayloadTreeOid(payloadEntries),
  };
}

async function candidateBlobs(entries, findings) {
  const blobs = new Map();
  for (const entry of entries) {
    if (entry.stage !== "0") findings.push(entry.path + ": unmerged Git stage " + entry.stage + " cannot form a public candidate");
    if (entry.mode === "120000") {
      findings.push(entry.path + ": tracked symbolic links are not allowed in the public candidate");
      continue;
    }
    try {
      blobs.set(entry.path, await stagedBlob(entry.hash));
    } catch (error) {
      findings.push(entry.path + ": staged Git blob cannot be read (" + (error.code || error) + ")");
    }
    try {
      const workingBytes = await readFile(path.join(root, entry.path));
      if (sha256(workingBytes) !== sha256(blobs.get(entry.path) || Buffer.alloc(0))) {
        findings.push(entry.path + ": working-tree bytes differ from the staged public candidate");
      }
    } catch (error) {
      findings.push(entry.path + ": working-tree file cannot be matched to the staged public candidate (" + (error.code || error) + ")");
    }
  }
  return blobs;
}

function untrackedCandidateFindings(paths) {
  return paths.map((relativePath) => relativePath + ": untracked public-working-tree file makes the audited candidate ambiguous");
}

function clearanceFindings(blobs) {
  const bytes = blobs.get(PUBLICATION_CLEARANCE_PATH);
  if (!bytes) return [];
  return parsePublicationClearance(bytes.toString("utf8")).issues
    .map((issue) => PUBLICATION_CLEARANCE_PATH + ": " + issue);
}

function browserEvidenceFindings(blobs) {
  const bytes = blobs.get(BROWSER_RUNNER_EVIDENCE_PATH);
  if (!bytes) return [BROWSER_RUNNER_EVIDENCE_PATH + ": reviewed browser/runner evidence record is required"];
  return parseReviewedBrowserRunnerEvidence(bytes.toString("utf8")).issues
    .map((issue) => BROWSER_RUNNER_EVIDENCE_PATH + ": " + issue);
}

function runtimePathFindings(tracked) {
  return REQUIRED_PUBLIC_RUNTIME_PATHS
    .filter((relativePath) => !tracked.has(relativePath))
    .map((relativePath) => relativePath + ": required public runtime file is not tracked");
}

function stagedCurriculumManifest(blobs, findings) {
  try {
    const manifest = JSON.parse(blobs.get(CURRICULUM_PATH)?.toString("utf8") || "");
    const issues = validateManifest(manifest);
    if (issues.length) throw new Error("Invalid curriculum manifest:\n- " + issues.join("\n- "));
    return manifest;
  } catch (error) {
    findings.push(CURRICULUM_PATH + ": staged manifest is invalid (" + error.message + ")");
    return null;
  }
}

function componentRegisterInspectionFindings(manifest, entries, blobs) {
  try {
    const register = JSON.parse(blobs.get(COMPONENT_REGISTER_PATH)?.toString("utf8") || "");
    if (!manifest) return [];
    return [
      ...registerFindings(legacyToolchainRegister(register), entries, blobs, manifest),
      ...extendedToolchainFindings(register, blobs),
      ...licenceGuardMutationFindings(register, entries, blobs, manifest),
    ];
  } catch (error) {
    return [COMPONENT_REGISTER_PATH + ": staged component register is invalid (" + error.message + ")"];
  }
}

function publicManifestInspectionFindings(entries, blobs) {
  const findings = publicFileManifestFindings(entries, blobs);
  const mutant = new Map(blobs);
  mutant.set(PUBLIC_FILE_MANIFEST_PATH, Buffer.from("# incomplete inventory\n", "utf8"));
  if (!publicFileManifestFindings(entries, mutant).some((finding) => /listed paths do not exactly match/u.test(finding))) {
    findings.push("public-file manifest mutation self-test did not reject an incomplete inventory");
  }
  return findings;
}

function blockedPublicPathFinding(relativePath) {
  if (PRIVATE_PATH.test(relativePath)) return relativePath + ": private pre-beta material must never be tracked";
  if (DENIED_ARCHIVE_OR_DOCUMENT_EXTENSION.test(relativePath)) {
    return relativePath + ": archives and metadata-bearing office/reference documents are not allowed in the public candidate";
  }
  if (DENIED_TRACKED_PATHS.has(relativePath)) {
    return relativePath + ": private publisher-derived source artifact must not be tracked";
  }
  return null;
}

function binaryAssetFindings(relativePath, bytes) {
  const findings = binaryFindings(relativePath, bytes);
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === ".ttf" || extension === ".otf") findings.push(...fontMetadataFindings(relativePath, bytes));
  else if (extension === ".wav") findings.push(...wavMetadataFindings(relativePath, bytes));
  else if (extension === ".png") findings.push(...pngMetadataFindings(relativePath, bytes));
  else findings.push(relativePath + ": unexpected binary file type in the public candidate");
  return findings;
}

function candidateEntryFindings(entry, blobs) {
  const relativePath = entry.path;
  const findings = PERSONAL_OR_LOCAL_MARKERS.some((pattern) => pattern.test(relativePath))
    ? [relativePath + ": public path contains a personal identity or local user path"]
    : [];
  const blocked = blockedPublicPathFinding(relativePath);
  if (blocked) return [...findings, blocked];
  const bytes = blobs.get(relativePath);
  if (!bytes) return findings;
  return bytes.includes(0)
    ? [...findings, ...binaryAssetFindings(relativePath, bytes)]
    : [...findings, ...reviewedContentFindings(contentFindings, relativePath, bytes.toString("utf8"))];
}

function candidateContentFindings(entries, blobs) {
  return entries.flatMap((entry) => candidateEntryFindings(entry, blobs));
}

async function inspectPublicCandidate() {
  const findings = initialCandidateFindings();
  const entries = await trackedEntries();
  const identity = candidatePayloadIdentity(entries);
  const tracked = new Set(entries.map((entry) => entry.path));
  const blobs = await candidateBlobs(entries, findings);
  findings.push(...untrackedCandidateFindings(await untrackedPaths()));
  findings.push(...clearanceFindings(blobs));
  findings.push(...browserEvidenceFindings(blobs));
  findings.push(...runtimePathFindings(tracked));
  const manifest = stagedCurriculumManifest(blobs, findings);
  findings.push(...componentRegisterInspectionFindings(manifest, entries, blobs));
  findings.push(...publicManifestInspectionFindings(entries, blobs));
  findings.push(...candidateContentFindings(entries, blobs));
  return { findings, ...identity };
}
try {
  const { findings, payloadSha256, payloadTreeOid } = await inspectPublicCandidate();
  if (findings.length) {
    process.stderr.write("Public-candidate guard failed:\n");
    for (const finding of findings.slice(0, 200)) process.stderr.write(`- ${finding}\n`);
    if (findings.length > 200) process.stderr.write(`- ...and ${findings.length - 200} more findings\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("Public-candidate guard passed: staged Git blobs satisfy the PWA/runtime, neutral-curriculum, privacy, open-component register, exact asset hash, immutable workflow, and approved-licence requirements. The public payload identity excludes only PUBLICATION_CLEARANCE.md bytes to avoid self-reference.\n");
    process.stdout.write(`${PUBLIC_CANDIDATE_NEGATIVE_CONTROL_PASS_EVIDENCE.slice("STDOUT:".length)}\n`);
    process.stdout.write(`PUBLIC_PAYLOAD_SHA256=${payloadSha256}\n`);
    process.stdout.write(`PUBLIC_PAYLOAD_TREE_OID=${payloadTreeOid}\n`);
  }
} catch (error) {
  process.stderr.write(`Public-candidate guard could not inspect the repository: ${error.stack || error}\n`);
  process.exitCode = 1;
}
