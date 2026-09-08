import { qualityToolRegisterRecords } from "./ci-dependency-policy.mjs";
import { CURRICULUM_PATH } from "./curriculum-manifest.mjs";
import { securityToolRegisterRecords } from "./security-gate-policy.mjs";

export const DENIED_TRACKED_PATHS = new Set([
  "research/DMPK5_Scope.pdf",
  "research/curriculum-scope-sequence.md",
  "research/refined-level-ladder.md",
]);
export const PRIVATE_PATH = /^\.private-prebeta(?:\/|$)/u;
export const DENIED_ARCHIVE_OR_DOCUMENT_EXTENSION = /\.(?:7z|bz2|docm?|docx|gz|od[stp]|pdf|pptm?|pptx|rar|tar|tgz|xlsm?|xlsx|xz|zip)$/iu;
export const REQUIRED_PUBLIC_RUNTIME_PATHS = Object.freeze([
  "index.html",
  "manifest.webmanifest",
  "release-shell-v1.json",
  "sw.js",
  CURRICULUM_PATH,
  "curriculum/math-quest-tutorial-manifest-v1.json",
]);
export const COMPONENT_REGISTER_PATH = "licenses/component-register-v1.json";
export const EVIDENCE_DECLARATION_PATH = "licenses/evidence-paths-v1.json";
export const FIRST_PARTY_DECLARATION_PATH = "licenses/first-party-paths-v1.txt";
export const PUBLIC_FILE_MANIFEST_PATH = "docs/release/public-file-manifest.txt";
export const FIRST_PARTY_HEADER = Object.freeze([
  "# Reviewed first-party Math Quest paths.",
  "# Adding a path asserts original MIT authorship and requires human review.",
  "",
]);
export const REQUIRED_RIGHTS_PATHS = Object.freeze([
  "LICENSE",
  "OPEN_SOURCE_POLICY.md",
  "THIRD_PARTY_NOTICES.md",
  COMPONENT_REGISTER_PATH,
  EVIDENCE_DECLARATION_PATH,
  FIRST_PARTY_DECLARATION_PATH,
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
  "licenses/ci-toolchain.md",
  "licenses/design-tokens.md",
  "licenses/sound-effects.md",
]);
export const KIND_LICENCES = Object.freeze({
  "design-token-contract": new Set(["MIT"]),
  "runtime-source": new Set(["MIT"]),
  font: new Set(["OFL-1.1", "MIT", "CC0-1.0", "LicenseRef-Public-Domain"]),
  image: new Set(["MIT", "CC-BY-4.0", "CC0-1.0", "LicenseRef-Public-Domain"]),
  audio: new Set(["MIT", "CC-BY-4.0", "CC0-1.0", "LicenseRef-Public-Domain"]),
  "source-tool": new Set(["MIT"]),
});
export const EVIDENCE_KINDS = new Set(["licence-text", "policy", "attribution", "provenance"]);
export const EVIDENCE_ORIGINS = new Set(["standard-open-text", "original-project", "mixed-open", "third-party-open"]);
const LEGACY_TOOLCHAIN_RECORDS = 13;
const EXTENDED_TOOLCHAIN_RECORDS = 23;
const REVIEWED_REGISTRY_CONTACT = ["i", "@", "izs.me"].join("");
const REVIEWED_REGISTRY_METADATA_LINES = new Map([
  ["package-lock.json", new Set([
    `"deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting ${REVIEWED_REGISTRY_CONTACT}",`,
  ])],
]);

export const APPROVED_LICENCES = new Set([
  "(MIT OR CC0-1.0)", "0BSD", "AGPL-3.0-only", "Apache-2.0", "BSD-2-Clause",
  "BSD-3-Clause", "BlueOak-1.0.0", "CC-BY-3.0", "CC-BY-4.0", "CC0-1.0",
  "ISC", "LGPL-2.1-or-later", "LicenseRef-Public-Domain", "MIT", "MIT-0",
  "MPL-2.0", "OFL-1.1", "OGL-UK-3.0", "Python-2.0",
]);
export const EVIDENCE_LICENCE_EXPRESSIONS = new Set([
  "AGPL-3.0-only AND Apache-2.0 AND BSD-3-Clause AND ISC AND LGPL-2.1-or-later AND MIT AND MPL-2.0",
  "0BSD AND Apache-2.0 AND BSD-2-Clause AND BSD-3-Clause AND BlueOak-1.0.0 AND CC0-1.0 AND ISC AND MIT AND MIT-0 AND MPL-2.0 AND Python-2.0",
  "MIT",
  "OFL-1.1",
  "MIT AND OGL-UK-3.0 AND CC-BY-4.0",
  "MIT AND OFL-1.1 AND OGL-UK-3.0 AND CC-BY-4.0",
]);

function reviewedRegistryText(relativePath, text) {
  const reviewedLines = REVIEWED_REGISTRY_METADATA_LINES.get(relativePath);
  if (!reviewedLines) return String(text);
  return String(text).split(/\r?\n/u)
    .map((line) => (reviewedLines.has(line.trim()) ? "" : line))
    .join("\n");
}

export function reviewedContentFindings(contentFindings, relativePath, text) {
  return contentFindings(relativePath, reviewedRegistryText(relativePath, text));
}

export function reviewedRegistryMetadataMutationFindings(contentFindings) {
  const reviewedLine = [...REVIEWED_REGISTRY_METADATA_LINES.get("package-lock.json")][0];
  const unreviewedLine = reviewedLine.replace(REVIEWED_REGISTRY_CONTACT, ["dev", "@", "example.test"].join(""));
  const failures = [];
  if (reviewedContentFindings(contentFindings, "package-lock.json", reviewedLine).length) {
    failures.push("privacy guard self-test rejected reviewed public registry metadata");
  }
  if (!reviewedContentFindings(contentFindings, "package.json", reviewedLine).length) {
    failures.push("privacy guard self-test allowed reviewed registry metadata outside its exact path");
  }
  if (!reviewedContentFindings(contentFindings, "package-lock.json", unreviewedLine).length) {
    failures.push("privacy guard self-test allowed unreviewed package-lock contact metadata");
  }
  return failures;
}

export function legacyToolchainRegister(register) {
  const toolchain = Array.isArray(register?.toolchain)
    ? register.toolchain.slice(0, LEGACY_TOOLCHAIN_RECORDS)
    : register?.toolchain;
  return { ...register, toolchain };
}

function policyText(blobs, relativePath) {
  return blobs.get(relativePath)?.toString("utf8") || "";
}

function exactRecord(record, expected) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(record);
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && record[key] === expected[key]);
}

function projectedToolRecords(blobs) {
  const quality = qualityToolRegisterRecords(policyText(blobs, "audit/quality-gate-policy-v1.json"));
  const security = securityToolRegisterRecords(policyText(blobs, "audit/security-gate-policy-v1.json"));
  return {
    records: [...quality.records, ...security.records],
    findings: [...quality.findings, ...security.findings],
  };
}

export function extendedToolchainFindings(register, blobs) {
  if (!Array.isArray(register?.toolchain) || register.toolchain.length !== EXTENDED_TOOLCHAIN_RECORDS) {
    return [`${COMPONENT_REGISTER_PATH}: toolchain must contain exactly the twenty-three reviewed runtime, browser, validator, quality, security, accessibility, and native-binding records`];
  }
  const projection = projectedToolRecords(blobs);
  const findings = [...projection.findings];
  for (const [offset, expected] of projection.records.entries()) {
    const index = LEGACY_TOOLCHAIN_RECORDS + offset;
    if (!exactRecord(register.toolchain[index], expected)) {
      findings.push(`${COMPONENT_REGISTER_PATH} toolchain[${index}]: CI-only tool identity, licence, source, integrity, attribution, and scope must remain exact`);
    }
  }
  return findings;
}
