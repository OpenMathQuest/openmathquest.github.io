import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  BROWSER_RUNNER_EVIDENCE_PATH,
  parseReviewedBrowserRunnerEvidence,
} from "./lib/browser-runner-evidence.mjs";
import { CURRICULUM_PATH, validateManifest } from "./lib/curriculum-manifest.mjs";
import { parsePublicationClearance, PUBLICATION_CLEARANCE_PATH } from "./lib/publication-clearance.mjs";
import {
  trustedHttpsCanarySupplyChainFindings,
  trustedHttpsCanarySupplyChainMutationFailures,
} from "./lib/trusted-https-canary-supply-chain.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DENIED_TRACKED_PATHS = new Set([
  "research/DMPK5_Scope.pdf",
  "research/curriculum-scope-sequence.md",
  "research/refined-level-ladder.md",
]);

const PRIVATE_PATH = /^\.private-prebeta(?:\/|$)/u;
const DENIED_ARCHIVE_OR_DOCUMENT_EXTENSION = /\.(?:7z|bz2|docm?|docx|gz|od[stp]|pdf|pptm?|pptx|rar|tar|tgz|xlsm?|xlsx|xz|zip)$/iu;
const REQUIRED_PUBLIC_RUNTIME_PATHS = Object.freeze([
  "index.html",
  "manifest.webmanifest",
  "release-shell-v1.json",
  "sw.js",
  CURRICULUM_PATH,
]);
const COMPONENT_REGISTER_PATH = "licenses/component-register-v1.json";
const EVIDENCE_DECLARATION_PATH = "licenses/evidence-paths-v1.json";
const FIRST_PARTY_DECLARATION_PATH = "licenses/first-party-paths-v1.txt";
const PUBLIC_FILE_MANIFEST_PATH = "docs/release/public-file-manifest.txt";
const FIRST_PARTY_HEADER = Object.freeze([
  "# Reviewed first-party Math Quest paths.",
  "# Adding a path asserts original MIT authorship and requires human review.",
  "",
]);
const REQUIRED_RIGHTS_PATHS = Object.freeze([
  "LICENSE",
  "OPEN_SOURCE_POLICY.md",
  "THIRD_PARTY_NOTICES.md",
  COMPONENT_REGISTER_PATH,
  EVIDENCE_DECLARATION_PATH,
  FIRST_PARTY_DECLARATION_PATH,
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
  "licenses/ci-toolchain.md",
  "licenses/sound-effects.md",
]);
const APPROVED_LICENCES = new Set(["Apache-2.0", "MIT", "OFL-1.1", "OGL-UK-3.0", "CC-BY-4.0", "CC0-1.0", "LicenseRef-Public-Domain"]);
const KIND_LICENCES = Object.freeze({
  font: new Set(["OFL-1.1", "MIT", "CC0-1.0", "LicenseRef-Public-Domain"]),
  image: new Set(["MIT", "CC-BY-4.0", "CC0-1.0", "LicenseRef-Public-Domain"]),
  audio: new Set(["MIT", "CC-BY-4.0", "CC0-1.0", "LicenseRef-Public-Domain"]),
  "source-tool": new Set(["MIT"]),
});
const EVIDENCE_KINDS = new Set(["licence-text", "policy", "attribution", "provenance"]);
const EVIDENCE_ORIGINS = new Set(["standard-open-text", "original-project", "mixed-open", "third-party-open"]);
const EVIDENCE_LICENCE_EXPRESSIONS = new Set([
  "MIT",
  "OFL-1.1",
  "MIT AND OGL-UK-3.0 AND CC-BY-4.0",
  "MIT AND OFL-1.1 AND OGL-UK-3.0 AND CC-BY-4.0",
]);
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

function publicPayloadSha256(entries) {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path, "en"))
    .map((entry) => `${entry.mode}\0${entry.hash}\0${entry.stage}\0${entry.path}\0`)
    .join("");
  return sha256(Buffer.from(canonical, "utf8"));
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

function publicPayloadTreeOid(entries) {
  if (!entries.length) throw new Error("The public payload cannot be empty.");
  const oidLength = entries[0].hash.length;
  const algorithm = oidLength === 40 ? "sha1" : oidLength === 64 ? "sha256" : null;
  if (!algorithm || entries.some((entry) => entry.hash.length !== oidLength)) {
    throw new Error("The staged entries use an unsupported or inconsistent Git object format.");
  }
  const rootNode = { children: new Map() };
  for (const entry of entries) {
    if (entry.stage !== "0") throw new Error(`${entry.path}: an unmerged stage cannot form the public payload tree`);
    if (!/^(?:100644|100755|120000)$/u.test(entry.mode)) throw new Error(`${entry.path}: unsupported Git mode ${entry.mode}`);
    const segments = entry.path.split("/");
    let node = rootNode;
    for (const segment of segments.slice(0, -1)) {
      const existing = node.children.get(segment);
      if (existing?.entry) throw new Error(`${entry.path}: a file conflicts with a directory in the staged tree`);
      if (!existing) node.children.set(segment, { children: new Map() });
      node = node.children.get(segment);
    }
    const name = segments.at(-1);
    if (!name || node.children.has(name)) throw new Error(`${entry.path}: duplicate or invalid staged path`);
    node.children.set(name, { entry });
  }
  const objectHash = (type, body) => createHash(algorithm)
    .update(Buffer.from(`${type} ${body.byteLength}\0`, "utf8"))
    .update(body)
    .digest();
  const treeHash = (node) => {
    const rows = [...node.children.entries()].map(([name, child]) => ({
      name,
      child,
      sortKey: Buffer.from(child.entry ? name : `${name}/`, "utf8"),
    })).sort((left, right) => Buffer.compare(left.sortKey, right.sortKey));
    const body = Buffer.concat(rows.map(({ name, child }) => {
      const mode = child.entry ? child.entry.mode : "40000";
      const oid = child.entry ? Buffer.from(child.entry.hash, "hex") : treeHash(child);
      return Buffer.concat([Buffer.from(`${mode} ${name}\0`, "utf8"), oid]);
    }));
    return objectHash("tree", body);
  };
  return treeHash(rootNode).toString("hex");
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
    if (relativePath === "index.html" && PLATFORM_PICTOGRAPH.test(line)) {
      findings.push(`${relativePath}:${index + 1}: platform emoji or pictograph artwork is not allowed; use original HTML/CSS/SVG art`);
    }
    if (relativePath === "index.html" && /data\s*:\s*(?:image|audio|video|font)\//iu.test(line)) {
      findings.push(`${relativePath}:${index + 1}: inline data-URI media is not allowed; extract, hash, and register the asset`);
    }
    if (relativePath === "index.html" && /(?:\bsrc\b|\bhref\b|\bsrcset\b|\bposter\b)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:|@import\s+(?:url\()?["']?\s*https?:/iu.test(line)) {
      findings.push(`${relativePath}:${index + 1}: remote runtime asset reference is not allowed`);
    }
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

function fontMetadataFindings(relativePath, bytes) {
  const findings = [];
  try {
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
    const count = bytes.readUInt16BE(nameOffset + 2);
    const stringsOffset = bytes.readUInt16BE(nameOffset + 4);
    const metadataStrings = [];
    for (let index = 0; index < count; index += 1) {
      const recordOffset = nameOffset + 6 + index * 12;
      if (recordOffset + 12 > nameOffset + nameLength) throw new Error("truncated font name record");
      const platformId = bytes.readUInt16BE(recordOffset);
      const length = bytes.readUInt16BE(recordOffset + 8);
      const relativeOffset = bytes.readUInt16BE(recordOffset + 10);
      const start = nameOffset + stringsOffset + relativeOffset;
      const end = start + length;
      if (start < nameOffset || end > nameOffset + nameLength) throw new Error("font name string is out of bounds");
      const value = bytes.subarray(start, end);
      metadataStrings.push(platformId === 0 || platformId === 3 ? decodeUtf16Be(value) : value.toString("latin1"));
    }
    const metadata = metadataStrings.join("\n");
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

function pngMetadataFindings(relativePath, bytes) {
  const findings = [];
  try {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bytes.length < 33 || !bytes.subarray(0, signature.length).equals(signature)) {
      throw new Error("invalid PNG signature");
    }
    const chunks = [];
    let offset = signature.length;
    let width = null;
    let height = null;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const chunkEnd = dataEnd + 4;
      if (!/^[A-Za-z]{4}$/u.test(type) || chunkEnd > bytes.length) {
        throw new Error("truncated or invalid PNG chunk");
      }
      chunks.push(type);
      if (chunks.length === 1) {
        if (type !== "IHDR" || length !== 13) throw new Error("PNG must begin with one standard IHDR chunk");
        width = bytes.readUInt32BE(dataStart);
        height = bytes.readUInt32BE(dataStart + 4);
        const bitDepth = bytes[dataStart + 8];
        const colourType = bytes[dataStart + 9];
        const compression = bytes[dataStart + 10];
        const filter = bytes[dataStart + 11];
        const interlace = bytes[dataStart + 12];
        if (
          !width || !height || width > 4096 || height > 4096
          || bitDepth !== 8 || ![2, 6].includes(colourType)
          || compression !== 0 || filter !== 0 || interlace !== 0
        ) {
          throw new Error("PNG dimensions or encoding contract is invalid");
        }
      }
      if (type === "pHYs" && length !== 9) throw new Error("PNG physical-density chunk is invalid");
      if (type === "IEND" && length !== 0) throw new Error("PNG end chunk is invalid");
      offset = chunkEnd;
      if (type === "IEND") break;
    }
    if (offset !== bytes.length || chunks.at(-1) !== "IEND" || chunks.filter((type) => type === "IHDR").length !== 1 || !chunks.includes("IDAT")) {
      throw new Error("PNG chunk stream is incomplete or has trailing bytes");
    }
    const unexpected = chunks.filter((type) => !["IHDR", "pHYs", "IDAT", "IEND"].includes(type));
    if (unexpected.length) findings.push(`${relativePath}: PNG contains unexpected metadata chunks ${[...new Set(unexpected)].join(", ")}`);
    if (chunks.filter((type) => type === "pHYs").length > 1) findings.push(`${relativePath}: PNG contains duplicate physical-density metadata`);
  } catch (error) {
    findings.push(`${relativePath}: PNG metadata could not be validated (${error.message})`);
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
  const text = (relativePath) => blobs.get(relativePath)?.toString("utf8") || "";
  return {
    packageJsonText: text("package.json"),
    packageLockText: text("package-lock.json"),
    wrapperText: text("audit/run-trusted-https-canary.ps1"),
    workflowText: text(".github/workflows/trusted-https-canary.yml"),
    runnerText: text("audit/run-trusted-https-canary.mjs"),
    validatorText: text("audit/validate-trusted-https-canary.mjs"),
    builderText: text("tools/build-pwa-release-manifest.mjs"),
    releaseShellText: text("release-shell-v1.json"),
    serviceWorkerText: text("sw.js"),
  };
}

function registerFindings(register, entries, blobs, manifest) {
  const findings = [];
  const tracked = new Set(entries.map((entry) => entry.path));
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
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
  if (!exactKeys(register, requiredTopLevel, COMPONENT_REGISTER_PATH, findings)) return findings;
  if (register.schemaVersion !== 1) findings.push(`${COMPONENT_REGISTER_PATH}: schemaVersion must be 1`);

  const policyPath = normalized(path.posix.normalize(path.posix.join("licenses", String(register.policy || ""))));
  if (policyPath !== "OPEN_SOURCE_POLICY.md" || !tracked.has(policyPath)) {
    findings.push(`${COMPONENT_REGISTER_PATH}: policy must resolve to tracked OPEN_SOURCE_POLICY.md`);
  }

  const registeredLicences = Array.isArray(register.approvedLicences) ? register.approvedLicences : [];
  const expectedLicences = [...APPROVED_LICENCES].sort();
  const actualLicences = [...registeredLicences].sort();
  if (actualLicences.length !== expectedLicences.length || actualLicences.some((value, index) => value !== expectedLicences[index])) {
    findings.push(`${COMPONENT_REGISTER_PATH}: approvedLicences must exactly match the guard's reviewed allowlist`);
  }

  const evidencePaths = new Set();
  const usedEvidencePaths = new Set();
  const evidenceDeclarationBytes = blobs.get(EVIDENCE_DECLARATION_PATH);
  if (!evidenceDeclarationBytes) {
    findings.push(`${EVIDENCE_DECLARATION_PATH}: reviewed evidence declaration is missing`);
  } else {
    try {
      const declaration = JSON.parse(evidenceDeclarationBytes.toString("utf8"));
      if (exactKeys(declaration, ["schemaVersion", "records"], EVIDENCE_DECLARATION_PATH, findings)) {
        if (declaration.schemaVersion !== 1) findings.push(`${EVIDENCE_DECLARATION_PATH}: schemaVersion must be 1`);
        if (!Array.isArray(declaration.records) || !declaration.records.length) {
          findings.push(`${EVIDENCE_DECLARATION_PATH}: records must be a nonempty array`);
        } else {
          const declaredPaths = [];
          for (const [index, record] of declaration.records.entries()) {
            const label = `${EVIDENCE_DECLARATION_PATH} records[${index}]`;
            if (!exactKeys(record, ["path", "kind", "origin", "licenceExpression", "purpose", "sha256"], label, findings)) continue;
            const evidencePath = normalized(record.path);
            declaredPaths.push(evidencePath);
            if (!nonempty(evidencePath) || evidencePath.startsWith("../") || path.posix.isAbsolute(evidencePath)) findings.push(`${label}: path must be a safe repository-relative path`);
            if (!EVIDENCE_KINDS.has(record.kind)) findings.push(`${label}: kind is not approved`);
            if (!EVIDENCE_ORIGINS.has(record.origin)) findings.push(`${label}: origin is not approved`);
            if (!EVIDENCE_LICENCE_EXPRESSIONS.has(record.licenceExpression) || RESTRICTIVE_LICENCE.test(String(record.licenceExpression))) findings.push(`${label}: licenceExpression is not approved`);
            if (!nonempty(record.purpose)) findings.push(`${label}: purpose is required`);
            if (!/^[a-f0-9]{64}$/u.test(String(record.sha256))) findings.push(`${label}: sha256 must be 64 lowercase hexadecimal characters`);
            if (!tracked.has(evidencePath)) findings.push(`${label}: reviewed evidence path is not staged: ${evidencePath}`);
            const stagedEvidence = blobs.get(evidencePath);
            if (stagedEvidence && sha256(stagedEvidence) !== record.sha256) findings.push(`${label}: staged evidence hash differs for ${evidencePath}`);
            evidencePaths.add(evidencePath);
          }
          if (new Set(declaredPaths).size !== declaredPaths.length) findings.push(`${EVIDENCE_DECLARATION_PATH}: records contain duplicate paths`);
          if (declaredPaths.some((value, index) => value !== [...declaredPaths].sort()[index])) findings.push(`${EVIDENCE_DECLARATION_PATH}: records must be sorted by path`);
        }
      }
    } catch (error) {
      findings.push(`${EVIDENCE_DECLARATION_PATH}: invalid JSON (${error.message})`);
    }
  }
  for (const requiredEvidence of [policyPath, "THIRD_PARTY_NOTICES.md"]) {
    if (evidencePaths.has(requiredEvidence)) usedEvidencePaths.add(requiredEvidence);
  }
  const registeredPaths = new Set();
  const componentIds = new Set();
  const firstPartyPaths = Array.isArray(register.firstPartyPaths) ? register.firstPartyPaths.map(normalized) : [];
  const firstPartySet = new Set(firstPartyPaths);
  if (!Array.isArray(register.firstPartyPaths) || !firstPartyPaths.length) {
    findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths must be a nonempty exact public-tree inventory`);
  } else {
    if (firstPartySet.size !== firstPartyPaths.length) findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths contains duplicates`);
    if (firstPartyPaths.some((value, index) => value !== [...firstPartyPaths].sort()[index])) findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths must be sorted`);
    for (const firstPartyPath of firstPartyPaths) {
      if (!nonempty(firstPartyPath) || firstPartyPath.startsWith("../") || path.posix.isAbsolute(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: invalid first-party path ${firstPartyPath}`);
      if (!tracked.has(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: first-party path is not staged: ${firstPartyPath}`);
      if (REGISTERED_ASSET_PATH.test(firstPartyPath) || REGISTERED_BINARY_EXTENSION.test(firstPartyPath)) findings.push(`${COMPONENT_REGISTER_PATH}: assets and binary files require component records, not first-party path classification: ${firstPartyPath}`);
    }
  }
  const declarationBytes = blobs.get(FIRST_PARTY_DECLARATION_PATH);
  if (!declarationBytes) {
    findings.push(`${FIRST_PARTY_DECLARATION_PATH}: reviewed first-party declaration is missing`);
  } else {
    const declarationText = declarationBytes.toString("utf8");
    const declarationLines = declarationText.split("\n");
    if (declarationText.includes("\r")) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration must use canonical LF line endings`);
    if (FIRST_PARTY_HEADER.some((line, index) => declarationLines[index] !== line)) {
      findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration header is invalid`);
    }
    const declaredPaths = declarationLines.slice(FIRST_PARTY_HEADER.length).filter(Boolean);
    if (new Set(declaredPaths).size !== declaredPaths.length) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration contains duplicate paths`);
    if (declaredPaths.some((value, index) => value !== [...declaredPaths].sort()[index])) findings.push(`${FIRST_PARTY_DECLARATION_PATH}: declaration must be sorted`);
    if (declaredPaths.length !== firstPartyPaths.length || declaredPaths.some((value, index) => value !== firstPartyPaths[index])) {
      findings.push(`${COMPONENT_REGISTER_PATH}: firstPartyPaths differs from the reviewed first-party declaration`);
    }
  }
  const bundled = Array.isArray(register.bundledComponents) ? register.bundledComponents : [];
  if (!Array.isArray(register.bundledComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: bundledComponents must be an array`);
  const bundledKeys = ["id", "kind", "origin", "paths", "sha256", "licence", "version", "creator", "copyright", "sourceUrl", "licenceEvidence", "attributionRecord", "modified"];
  for (const [index, component] of bundled.entries()) {
    const label = `${COMPONENT_REGISTER_PATH} bundledComponents[${index}]`;
    const expectedKeys = [
      ...bundledKeys,
      ...(component?.origin === "third-party-open" ? ["sourceCommit", "sourceArtifactSha256", "sourceInnerPath"] : []),
      ...(component?.origin === "public-domain" ? ["publicDomainBasis", "jurisdiction", "determinationDate", "evidenceUrl", "evidenceSha256"] : []),
      ...(component?.modified === true ? ["modificationDescription"] : []),
    ];
    if (!exactKeys(component, expectedKeys, label, findings)) continue;
    if (!nonempty(component.id) || componentIds.has(component.id)) findings.push(`${label}: id must be unique and nonempty`);
    else componentIds.add(component.id);
    if (!["original-project", "third-party-open", "public-domain"].includes(component.origin)) findings.push(`${label}: invalid origin`);
    if (!APPROVED_LICENCES.has(component.licence) || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: unapproved or restrictive licence ${component.licence}`);
    if (!KIND_LICENCES[component.kind] || !KIND_LICENCES[component.kind].has(component.licence)) findings.push(`${label}: licence ${component.licence} is not approved for component kind ${component.kind}`);
    if (component.origin === "original-project" && component.licence !== "MIT") findings.push(`${label}: original project material must use MIT`);
    if (component.origin === "public-domain" && !["CC0-1.0", "LicenseRef-Public-Domain"].includes(component.licence)) findings.push(`${label}: public-domain material must use CC0-1.0 or an evidence-backed public-domain record`);
    if (component.origin === "public-domain") {
      if (![component.publicDomainBasis, component.jurisdiction, component.determinationDate, component.evidenceUrl, component.evidenceSha256].every(nonempty)) findings.push(`${label}: public-domain records require basis, jurisdiction, determination date, evidence URL, and evidence SHA-256`);
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(component.determinationDate))) findings.push(`${label}: public-domain determinationDate must use YYYY-MM-DD`);
      if (!/^https:\/\//iu.test(String(component.evidenceUrl)) || !/^[a-f0-9]{64}$/u.test(String(component.evidenceSha256))) findings.push(`${label}: public-domain evidence URL and SHA-256 are invalid`);
      if (normalized(String(component.licenceEvidence)) === "LICENSE") findings.push(`${label}: the repository MIT licence cannot serve as public-domain evidence`);
    }
    if (component.modified === true && !nonempty(component.modificationDescription)) findings.push(`${label}: modified components require a modificationDescription`);
    if (!Array.isArray(component.paths) || component.paths.length !== 1 || !nonempty(component.paths[0])) {
      findings.push(`${label}: paths must contain exactly one staged path so its hash is unambiguous`);
      continue;
    }
    const componentPath = normalized(component.paths[0]);
    if (registeredPaths.has(componentPath)) findings.push(`${label}: duplicate registered path ${componentPath}`);
    registeredPaths.add(componentPath);
    if (!tracked.has(componentPath)) findings.push(`${label}: registered path is not staged: ${componentPath}`);
    if (!/^[a-f0-9]{64}$/u.test(String(component.sha256))) findings.push(`${label}: sha256 must be 64 lowercase hexadecimal characters`);
    const bytes = blobs.get(componentPath);
    if (bytes && sha256(bytes) !== component.sha256) findings.push(`${label}: staged blob hash differs for ${componentPath}`);
    if (!nonempty(component.version) || !nonempty(component.creator) || !nonempty(component.copyright) || !nonempty(component.sourceUrl)) findings.push(`${label}: version, creator, copyright, and sourceUrl are required`);
    if (PROHIBITED_ACTIVE_SOURCE.test(String(component.sourceUrl))) findings.push(`${label}: prohibited BBC RemArc or other non-open source cannot supply a bundled component`);
    if (component.modified !== true && component.modified !== false) findings.push(`${label}: modified must be boolean`);
    if (component.origin === "third-party-open") {
      if (!/^[a-f0-9]{40}$/u.test(String(component.sourceCommit))) findings.push(`${label}: third-party sourceCommit must be an immutable 40-character Git SHA`);
      if (!/^[a-f0-9]{64}$/u.test(String(component.sourceArtifactSha256))) findings.push(`${label}: third-party sourceArtifactSha256 must be a SHA-256 digest`);
      if (!nonempty(component.sourceInnerPath) || path.posix.isAbsolute(component.sourceInnerPath) || normalized(component.sourceInnerPath).startsWith("../")) findings.push(`${label}: third-party sourceInnerPath must be a safe archive-relative path`);
    }
    for (const field of ["licenceEvidence", "attributionRecord"]) {
      const evidence = component[field];
      if (!localEvidencePath(evidence) || !tracked.has(normalized(evidence))) findings.push(`${label}: ${field} must be a tracked local file`);
      else if (!evidencePaths.has(normalized(evidence))) findings.push(`${label}: ${field} must be a reviewed evidence path`);
      else usedEvidencePaths.add(normalized(evidence));
    }
    const licenceBytes = blobs.get(normalized(component.licenceEvidence));
    const attributionBytes = blobs.get(normalized(component.attributionRecord));
    if (component.licence === "OFL-1.1" && (!licenceBytes || sha256(licenceBytes) !== REVIEWED_INTER.licenceEvidenceSha256 || !/SIL OPEN FONT LICENSE Version 1\.1/u.test(licenceBytes.toString("utf8")))) {
      findings.push(`${label}: OFL licence evidence is not the exact reviewed upstream text`);
    }
    if (component.licence === "MIT" && (!licenceBytes || !/^MIT License\r?$/mu.test(licenceBytes.toString("utf8")) || !/Permission is hereby granted, free of charge/u.test(licenceBytes.toString("utf8")))) {
      findings.push(`${label}: MIT licence evidence is missing the reviewed grant`);
    }
    if (attributionBytes) {
      const attribution = attributionBytes.toString("utf8");
      const componentName = path.posix.basename(componentPath);
      if (!attribution.includes(componentName) || !attribution.toLowerCase().includes(String(component.sha256).toLowerCase())) findings.push(`${label}: attribution record must identify the shipped file and exact SHA-256`);
    }
    if (component.id === REVIEWED_INTER.id) {
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
  }

  for (const entry of entries) {
    if ((REGISTERED_ASSET_PATH.test(entry.path) || REGISTERED_BINARY_EXTENSION.test(entry.path)) && !registeredPaths.has(entry.path)) {
      findings.push(`${entry.path}: asset or binary is absent from ${COMPONENT_REGISTER_PATH}`);
    }
  }

  const sources = new Map(Array.isArray(manifest.sources) ? manifest.sources.map((source) => [source.id, source]) : []);
  const registeredSourceIds = new Set();
  const referenceKeys = ["id", "kind", "sourceIds", "licence", "sourceUrl", "attributionRecord", "reuseBoundary"];
  const references = Array.isArray(register.referenceComponents) ? register.referenceComponents : [];
  if (!Array.isArray(register.referenceComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: referenceComponents must be an array`);
  for (const [index, component] of references.entries()) {
    const label = `${COMPONENT_REGISTER_PATH} referenceComponents[${index}]`;
    if (!exactKeys(component, referenceKeys, label, findings)) continue;
    if (!nonempty(component.id) || componentIds.has(component.id)) findings.push(`${label}: id must be unique and nonempty`);
    else componentIds.add(component.id);
    if (!["open-reference", "factual-citation"].includes(component.kind)) findings.push(`${label}: invalid reference kind`);
    if (!Array.isArray(component.sourceIds) || !component.sourceIds.length) findings.push(`${label}: sourceIds must be a nonempty array`);
    for (const sourceId of component.sourceIds || []) {
      if (!nonempty(sourceId) || registeredSourceIds.has(sourceId)) findings.push(`${label}: source id must be unique and nonempty: ${sourceId}`);
      registeredSourceIds.add(sourceId);
      const source = sources.get(sourceId);
      if (!source) {
        findings.push(`${label}: manifest source does not exist: ${sourceId}`);
        continue;
      }
      if (component.kind === "factual-citation") {
        if (component.licence !== null) findings.push(`${label}: factual-citation licence must be null`);
        if (!/(?:no wording is copied|no imagery or wording is reused)/iu.test(String(source.use))) {
          findings.push(`${label}: ${sourceId} does not state the no-copied-expression boundary`);
        }
      } else {
        if (!APPROVED_LICENCES.has(component.licence) || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: unapproved or restrictive open-reference licence`);
        if (component.licence === "OGL-UK-3.0") {
          const rightsControl = sourceId === "SRC-UK-OGL"
            && source.url === "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
          if (!rightsControl && !/Open Government Licence v3\.0/iu.test(String(source.licence))) {
            findings.push(`${label}: ${sourceId} manifest licence conflicts with OGL-UK-3.0`);
          }
        }
        if (component.licence === "CC-BY-4.0") {
          const rightsControl = sourceId === "SRC-AUS-TERMS"
            && source.url === "https://www.australiancurriculum.edu.au/copyright-and-terms-of-use/"
            && /CC BY 4\.0/iu.test(String(source.licence));
          if (!rightsControl && !/Creative Commons Attribution 4\.0/iu.test(String(source.licence))) {
            findings.push(`${label}: ${sourceId} manifest licence conflicts with CC-BY-4.0`);
          }
        }
      }
    }
    if (!nonempty(component.sourceUrl) || !nonempty(component.reuseBoundary)) findings.push(`${label}: sourceUrl and reuseBoundary are required`);
    if (!localEvidencePath(component.attributionRecord) || !tracked.has(normalized(component.attributionRecord))) findings.push(`${label}: attributionRecord must be a tracked local file`);
    else if (!evidencePaths.has(normalized(component.attributionRecord))) findings.push(`${label}: attributionRecord must be a reviewed evidence path`);
    else usedEvidencePaths.add(normalized(component.attributionRecord));
  }
  for (const sourceId of sources.keys()) {
    if (!registeredSourceIds.has(sourceId)) findings.push(`${COMPONENT_REGISTER_PATH}: manifest source is not registered: ${sourceId}`);
  }
  if (manifest?.licence?.spdx !== "MIT" || manifest?.licence?.originalManifest !== "MIT") {
    findings.push(`${CURRICULUM_PATH}: original manifest expression must be explicitly MIT`);
  }

  const workflowKeys = ["id", "kind", "uses", "commit", "version", "licence", "sourceUrl", "licenceEvidence"];
  const workflow = Array.isArray(register.workflowComponents) ? register.workflowComponents : [];
  if (!Array.isArray(register.workflowComponents)) findings.push(`${COMPONENT_REGISTER_PATH}: workflowComponents must be an array`);
  const registeredActions = new Map();
  for (const [index, component] of workflow.entries()) {
    const label = `${COMPONENT_REGISTER_PATH} workflowComponents[${index}]`;
    if (!exactKeys(component, workflowKeys, label, findings)) continue;
    if (!nonempty(component.id) || componentIds.has(component.id)) findings.push(`${label}: id must be unique and nonempty`);
    else componentIds.add(component.id);
    if (component.kind !== "workflow-action" || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(String(component.uses))) findings.push(`${label}: invalid workflow action`);
    if (!/^[a-f0-9]{40}$/u.test(String(component.commit))) findings.push(`${label}: commit must be an immutable 40-character lowercase Git SHA`);
    if (component.licence !== "MIT" || RESTRICTIVE_LICENCE.test(String(component.licence))) findings.push(`${label}: workflow action must be reviewed MIT material`);
    if (!nonempty(component.version) || !String(component.sourceUrl).startsWith(`https://github.com/${component.uses}/`) || !String(component.licenceEvidence).startsWith(`https://github.com/${component.uses}/`)) findings.push(`${label}: version and exact GitHub source/licence evidence are required`);
    if (registeredActions.has(component.uses)) findings.push(`${label}: duplicate workflow action ${component.uses}`);
    registeredActions.set(component.uses, component.commit);
  }
  const observedActions = new Map();
  for (const [relativePath, bytes] of blobs.entries()) {
    if (!/^\.github\/workflows\/.+\.ya?ml$/iu.test(relativePath)) continue;
    const workflowText = bytes.toString("utf8");
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
      const quotedMappingKey = /^\s*(?:-\s*)?["'][^"'\r\n]+["']\s*:/u.test(line)
        || /[{,]\s*["'][^"'\r\n]+["']\s*:/u.test(line);
      if (quotedMappingKey || /\\(?:x[0-9a-f]{2}|u[0-9a-f]{4}|U[0-9a-f]{8})/iu.test(line)) {
        findings.push(`${relativePath}:${lineIndex + 1}: quoted or escaped workflow mapping keys are not allowed`);
        continue;
      }
      const containsUses = /(?:^|[-{,\s])uses\s*:/iu.test(line);
      const match = line.match(/^\s+uses\s*:\s*([^'"\s#},]+)(?:\s*#.*)?$/iu);
      if (containsUses && !match) {
        findings.push(`${relativePath}:${lineIndex + 1}: workflow uses value could not be parsed safely`);
        continue;
      }
      if (!match) continue;
      const value = match[1];
      if (value.startsWith("./")) {
        findings.push(`${relativePath}:${lineIndex + 1}: local actions require a separately registered and recursively inspected action manifest`);
        continue;
      }
      if (value.startsWith("docker://")) {
        findings.push(`${relativePath}:${lineIndex + 1}: Docker actions are not approved`);
        continue;
      }
      const separator = value.lastIndexOf("@");
      if (separator <= 0) {
        findings.push(`${relativePath}:${lineIndex + 1}: workflow action must name an immutable registered revision`);
        continue;
      }
      const action = value.slice(0, separator);
      const reference = value.slice(separator + 1);
      if (!/^[a-f0-9]{40}$/u.test(reference)) findings.push(`${relativePath}: workflow action ${action} must be pinned to an immutable 40-character lowercase Git SHA`);
      if (registeredActions.get(action) !== reference) findings.push(`${relativePath}: workflow action ${action}@${reference} is absent from or differs from the component register`);
      observedActions.set(action, reference);
    }
    if (/^\s*(?:container|services)\s*:/gmu.test(workflowText)) findings.push(`${relativePath}: job containers and services are not approved workflow dependencies`);
    if (/(?:^|\s)(?:curl|wget|Invoke-WebRequest|iwr|npm\s+(?:install|ci)|npx|pip\d*\s+install|choco\s+install|winget\s+install|apt-get\s+install|git\s+clone)(?:\s|$)/imu.test(workflowText)) {
      findings.push(`${relativePath}: network installers or ad-hoc downloaded executables are not allowed in workflows`);
    }
    for (const match of workflowText.matchAll(/node-version\s*:\s*["']?([^\s#'"]+)/gmu)) {
      if (match[1] !== "24.14.0") findings.push(`${relativePath}: Node toolchain must be pinned to reviewed version 24.14.0`);
    }
  }
  for (const [action, commit] of registeredActions.entries()) {
    if (observedActions.get(action) !== commit) findings.push(`${COMPONENT_REGISTER_PATH}: registered workflow action is not used at its reviewed commit: ${action}`);
  }

  const nodeToolKeys = ["id", "kind", "version", "licence", "sourceUrl", "licenceEvidence", "bundled"];
  const caddyToolKeys = ["id", "kind", "version", "licence", "sourceUrl", "sourceCommit", "signedTagObject", "licenceEvidence", "archiveUrl", "archiveSha256", "archiveSha512", "attributionRecord", "bundled", "scope"];
  const playwrightToolKeys = ["id", "kind", "version", "licence", "sourceUrl", "sourceCommit", "licenceEvidence", "packageName", "packageUrl", "packageSri", "attributionRecord", "bundled", "scope"];
  if (!Array.isArray(register.toolchain) || register.toolchain.length !== 3) {
    findings.push(`${COMPONENT_REGISTER_PATH}: toolchain must contain exactly the reviewed Node.js, Caddy, and Playwright Core records`);
  } else {
    const [nodeTool, caddyTool, playwrightTool] = register.toolchain;
    if (exactKeys(nodeTool, nodeToolKeys, `${COMPONENT_REGISTER_PATH} toolchain[0]`, findings)) {
      if (nodeTool.id !== "nodejs-24" || nodeTool.version !== "24.14.0" || nodeTool.licence !== "MIT" || nodeTool.bundled !== false) findings.push(`${COMPONENT_REGISTER_PATH}: Node.js toolchain record is not the reviewed open-source version`);
      if (nodeTool.kind !== "build-and-audit-tool" || nodeTool.sourceUrl !== "https://github.com/nodejs/node/tree/v24.14.0" || nodeTool.licenceEvidence !== "https://github.com/nodejs/node/blob/v24.14.0/LICENSE") findings.push(`${COMPONENT_REGISTER_PATH}: Node.js source or licence evidence is not the reviewed upstream record`);
    }
    const exactCaddy = {
      id: "caddy-2.11.4",
      kind: "ci-only-trusted-https-server",
      version: "2.11.4",
      licence: "Apache-2.0",
      sourceUrl: "https://github.com/caddyserver/caddy/tree/e2eee6a7fce366321294c9c2a79f3146891dcbdf",
      sourceCommit: "e2eee6a7fce366321294c9c2a79f3146891dcbdf",
      signedTagObject: "8ec11a4b7e39a5fd00da2fc5cb9b543e31fd7926",
      licenceEvidence: "https://github.com/caddyserver/caddy/blob/e2eee6a7fce366321294c9c2a79f3146891dcbdf/LICENSE",
      archiveUrl: "https://github.com/caddyserver/caddy/releases/download/v2.11.4/caddy_2.11.4_windows_amd64.zip",
      archiveSha256: "1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf",
      archiveSha512: "cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35",
      attributionRecord: "licenses/ci-toolchain.md",
      bundled: false,
      scope: "disposable GitHub-hosted Windows canary only",
    };
    const exactPlaywright = {
      id: "playwright-core-1.62.1",
      kind: "ci-only-browser-driver",
      version: "1.62.1",
      licence: "Apache-2.0",
      sourceUrl: "https://github.com/microsoft/playwright/tree/26a9e470a7b3c7822084b09fb7f13902c5f37b51",
      sourceCommit: "26a9e470a7b3c7822084b09fb7f13902c5f37b51",
      licenceEvidence: "https://github.com/microsoft/playwright/blob/26a9e470a7b3c7822084b09fb7f13902c5f37b51/LICENSE",
      packageName: "playwright-core",
      packageUrl: "https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz",
      packageSri: "sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==",
      attributionRecord: "licenses/ci-toolchain.md",
      bundled: false,
      scope: "disposable GitHub-hosted Windows canary only",
    };
    for (const [tool, keys, expected, index] of [[caddyTool, caddyToolKeys, exactCaddy, 1], [playwrightTool, playwrightToolKeys, exactPlaywright, 2]]) {
      const label = `${COMPONENT_REGISTER_PATH} toolchain[${index}]`;
      if (exactKeys(tool, keys, label, findings)
          && Object.entries(expected).some(([key, value]) => tool[key] !== value)) {
        findings.push(`${label}: CI-only tool identity, licence, source, integrity, attribution, and scope must remain exact`);
      }
      if (tool?.attributionRecord === "licenses/ci-toolchain.md" && evidencePaths.has(tool.attributionRecord)) usedEvidencePaths.add(tool.attributionRecord);
    }
  }
  findings.push(...trustedHttpsCanarySupplyChainFindings(canarySupplyChainInput(blobs)));

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

  for (const requiredPath of REQUIRED_RIGHTS_PATHS) {
    if (!entryByPath.has(requiredPath)) findings.push(`${requiredPath}: required open-source rights record is not staged`);
  }
  return findings;
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

  run("an unregistered asset", ({ entries: rows, blobs: candidateBlobs }) => {
    rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "assets/unregistered.wav" });
    candidateBlobs.set("assets/unregistered.wav", Buffer.from("unregistered"));
  }, /absent from .*component-register/u);
  run("changed registered bytes", ({ blobs: candidateBlobs }) => {
    candidateBlobs.set("assets/fonts/Inter-Variable.ttf", Buffer.from("changed-font"));
  }, /staged blob hash differs/u);
  run("missing local licence evidence", ({ entries: rows, blobs: candidateBlobs }) => {
    const index = rows.findIndex((entry) => entry.path === "licenses/Inter-OFL.txt");
    if (index >= 0) rows.splice(index, 1);
    candidateBlobs.delete("licenses/Inter-OFL.txt");
  }, /licenceEvidence must be a tracked local file/u);
  run("a non-commercial licence", ({ register: candidateRegister }) => {
    candidateRegister.bundledComponents[0].licence = "CC-BY-NC-4.0";
  }, /unapproved or restrictive licence/u);
  run("a non-MIT original component", ({ register: candidateRegister }) => {
    const original = candidateRegister.bundledComponents.find((component) => component.origin === "original-project");
    original.licence = "OFL-1.1";
  }, /original project material must use MIT/u);
  run("a floating workflow action", ({ blobs: candidateBlobs }) => {
    const workflowPath = ".github/workflows/audit.yml";
    const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/actions\/checkout@[a-f0-9]{40}/u, "actions/checkout@v6");
    candidateBlobs.set(workflowPath, Buffer.from(text));
  }, /must be pinned to an immutable/u);
  run("an unregistered manifest source", ({ manifest: candidateManifest }) => {
    candidateManifest.sources.push({ id: "SRC-UNREGISTERED" });
  }, /manifest source is not registered/u);
  run("a BBC RemArc bundled source", ({ register: candidateRegister }) => {
    candidateRegister.bundledComponents[0].sourceUrl = "https://sound-effects.bbcrewind.co.uk/example";
  }, /prohibited BBC RemArc/u);
  run("a synchronizer-auto-certified copied source file", ({ register: candidateRegister, entries: rows, blobs: candidateBlobs }) => {
    rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "vendor/copied.js" });
    candidateBlobs.set("vendor/copied.js", Buffer.from("export default 'unreviewed';"));
    candidateRegister.firstPartyPaths.push("vendor/copied.js");
    candidateRegister.firstPartyPaths.sort();
  }, /differs from the reviewed first-party declaration/u);
  run("an undeclared copied file used as attribution evidence", ({ register: candidateRegister, entries: rows, blobs: candidateBlobs }) => {
    rows.push({ mode: "100644", hash: "0".repeat(40), stage: "0", path: "vendor/copied.js" });
    candidateBlobs.set("vendor/copied.js", Buffer.from("unreviewed attribution"));
    candidateRegister.referenceComponents[0].attributionRecord = "vendor/copied.js";
  }, /attributionRecord must be a reviewed evidence path/u);
  run("a licence incompatible with its component kind", ({ register: candidateRegister }) => {
    candidateRegister.bundledComponents[0].kind = "audio";
  }, /is not approved for component kind/u);
  run("an empty attribution record", ({ blobs: candidateBlobs }) => {
    candidateBlobs.set("THIRD_PARTY_NOTICES.md", Buffer.from(""));
  }, /attribution record must identify/u);
  run("a generic MIT file used as public-domain evidence", ({ register: candidateRegister, blobs: candidateBlobs }) => {
    const sound = candidateRegister.bundledComponents.find((component) => component.kind === "audio");
    sound.origin = "public-domain";
    sound.licence = "LicenseRef-Public-Domain";
    sound.publicDomainBasis = "Unsubstantiated assertion";
    sound.jurisdiction = "Unknown";
    sound.determinationDate = "2026-07-27";
    sound.evidenceUrl = "https://example.invalid/evidence";
    sound.evidenceSha256 = sha256(candidateBlobs.get("LICENSE"));
    sound.licenceEvidence = "LICENSE";
  }, /MIT licence cannot serve as public-domain evidence/u);
  run("a quoted and spaced floating workflow action", ({ blobs: candidateBlobs }) => {
    const workflowPath = ".github/workflows/audit.yml";
    const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}/u, '"uses" : "actions/checkout@v6"');
    candidateBlobs.set(workflowPath, Buffer.from(text));
  }, /quoted or escaped workflow mapping keys are not allowed/u);
  run("a dash-prefixed floating workflow action", ({ blobs: candidateBlobs }) => {
    const workflowPath = ".github/workflows/audit.yml";
    const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}/u, "- uses: actions/checkout@v6");
    candidateBlobs.set(workflowPath, Buffer.from(text));
  }, /workflow uses value could not be parsed safely/u);
  run("an unsafe flow-mapping workflow action", ({ blobs: candidateBlobs }) => {
    const workflowPath = ".github/workflows/audit.yml";
    const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}[^\r\n]*/u, "- { uses: actions/checkout@v6 }");
    candidateBlobs.set(workflowPath, Buffer.from(text));
  }, /workflow uses value could not be parsed safely/u);
  run("an escaped workflow uses key", ({ blobs: candidateBlobs }) => {
    const workflowPath = ".github/workflows/audit.yml";
    const text = candidateBlobs.get(workflowPath).toString("utf8").replace(/uses:\s*actions\/checkout@[a-f0-9]{40}[^\r\n]*/u, '"u\\u0073es": "actions/checkout@v6"');
    candidateBlobs.set(workflowPath, Buffer.from(text));
  }, /quoted or escaped workflow mapping keys are not allowed/u);
  failures.push(...trustedHttpsCanarySupplyChainMutationFailures(canarySupplyChainInput(blobs)));
  return failures;
}

async function inspectPublicCandidate() {
  const findings = [];
  findings.push(...privacyMutationFindings());
  findings.push(...payloadIdentityMutationFindings());
  const entries = await trackedEntries();
  const payloadEntries = publicPayloadEntries(entries);
  const payloadSha256 = publicPayloadSha256(payloadEntries);
  const payloadTreeOid = publicPayloadTreeOid(payloadEntries);
  const paths = entries.map((entry) => entry.path);
  const tracked = new Set(paths);
  const blobs = new Map();
  for (const entry of entries) {
    if (entry.stage !== "0") findings.push(`${entry.path}: unmerged Git stage ${entry.stage} cannot form a public candidate`);
    if (entry.mode === "120000") {
      findings.push(`${entry.path}: tracked symbolic links are not allowed in the public candidate`);
      continue;
    }
    try {
      blobs.set(entry.path, await stagedBlob(entry.hash));
    } catch (error) {
      findings.push(`${entry.path}: staged Git blob cannot be read (${error.code || error})`);
    }
    try {
      const workingBytes = await readFile(path.join(root, entry.path));
      if (sha256(workingBytes) !== sha256(blobs.get(entry.path) || Buffer.alloc(0))) findings.push(`${entry.path}: working-tree bytes differ from the staged public candidate`);
    } catch (error) {
      findings.push(`${entry.path}: working-tree file cannot be matched to the staged public candidate (${error.code || error})`);
    }
  }
  for (const untrackedPath of await untrackedPaths()) findings.push(`${untrackedPath}: untracked public-working-tree file makes the audited candidate ambiguous`);
  const clearanceBytes = blobs.get(PUBLICATION_CLEARANCE_PATH);
  if (clearanceBytes) {
    const parsedClearance = parsePublicationClearance(clearanceBytes.toString("utf8"));
    for (const issue of parsedClearance.issues) findings.push(`${PUBLICATION_CLEARANCE_PATH}: ${issue}`);
  }
  const browserEvidenceBytes = blobs.get(BROWSER_RUNNER_EVIDENCE_PATH);
  if (!browserEvidenceBytes) {
    findings.push(`${BROWSER_RUNNER_EVIDENCE_PATH}: reviewed browser/runner evidence record is required`);
  } else {
    const parsedBrowserEvidence = parseReviewedBrowserRunnerEvidence(browserEvidenceBytes.toString("utf8"));
    for (const issue of parsedBrowserEvidence.issues) {
      findings.push(`${BROWSER_RUNNER_EVIDENCE_PATH}: ${issue}`);
    }
  }
  for (const requiredPath of REQUIRED_PUBLIC_RUNTIME_PATHS) {
    if (!tracked.has(requiredPath)) findings.push(`${requiredPath}: required public runtime file is not tracked`);
  }

  // The shared loader performs the complete closed-schema validation and
  // canonical hashing used by the runtime and release audit. Any parse,
  // schema, reference, task-type, or canonicalization failure aborts this
  // public-candidate check instead of being downgraded to a warning.
  let manifest;
  try {
    manifest = JSON.parse(blobs.get(CURRICULUM_PATH)?.toString("utf8") || "");
    const issues = validateManifest(manifest);
    if (issues.length) throw new Error(`Invalid curriculum manifest:\n- ${issues.join("\n- ")}`);
  } catch (error) {
    findings.push(`${CURRICULUM_PATH}: staged manifest is invalid (${error.message})`);
  }
  try {
    const register = JSON.parse(blobs.get(COMPONENT_REGISTER_PATH)?.toString("utf8") || "");
    if (manifest) {
      findings.push(...registerFindings(register, entries, blobs, manifest));
      findings.push(...licenceGuardMutationFindings(register, entries, blobs, manifest));
    }
  } catch (error) {
    findings.push(`${COMPONENT_REGISTER_PATH}: staged component register is invalid (${error.message})`);
  }
  findings.push(...publicFileManifestFindings(entries, blobs));
  const manifestMutation = new Map(blobs);
  manifestMutation.set(PUBLIC_FILE_MANIFEST_PATH, Buffer.from("# incomplete inventory\n", "utf8"));
  if (!publicFileManifestFindings(entries, manifestMutation).some((finding) => /listed paths do not exactly match/u.test(finding))) {
    findings.push("public-file manifest mutation self-test did not reject an incomplete inventory");
  }

  for (const entry of entries) {
    const relativePath = entry.path;
    if (PERSONAL_OR_LOCAL_MARKERS.some((pattern) => pattern.test(relativePath))) {
      findings.push(`${relativePath}: public path contains a personal identity or local user path`);
    }
    if (PRIVATE_PATH.test(relativePath)) {
      findings.push(`${relativePath}: private pre-beta material must never be tracked`);
      continue;
    }
    if (DENIED_ARCHIVE_OR_DOCUMENT_EXTENSION.test(relativePath)) {
      findings.push(`${relativePath}: archives and metadata-bearing office/reference documents are not allowed in the public candidate`);
      continue;
    }
    if (DENIED_TRACKED_PATHS.has(relativePath)) {
      findings.push(`${relativePath}: private publisher-derived source artifact must not be tracked`);
      continue;
    }

    const bytes = blobs.get(relativePath);
    if (!bytes) continue;
    if (bytes.includes(0)) {
      findings.push(...binaryFindings(relativePath, bytes));
      const extension = path.extname(relativePath).toLowerCase();
      if (extension === ".ttf" || extension === ".otf") findings.push(...fontMetadataFindings(relativePath, bytes));
      else if (extension === ".wav") findings.push(...wavMetadataFindings(relativePath, bytes));
      else if (extension === ".png") findings.push(...pngMetadataFindings(relativePath, bytes));
      else findings.push(`${relativePath}: unexpected binary file type in the public candidate`);
    } else {
      findings.push(...contentFindings(relativePath, bytes.toString("utf8")));
    }
  }
  return { findings, payloadSha256, payloadTreeOid };
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
    process.stdout.write(`PUBLIC_PAYLOAD_SHA256=${payloadSha256}\n`);
    process.stdout.write(`PUBLIC_PAYLOAD_TREE_OID=${payloadTreeOid}\n`);
  }
} catch (error) {
  process.stderr.write(`Public-candidate guard could not inspect the repository: ${error.stack || error}\n`);
  process.exitCode = 1;
}
