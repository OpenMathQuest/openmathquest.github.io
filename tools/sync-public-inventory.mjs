import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registerPath = path.join(root, "licenses", "component-register-v1.json");
const manifestPath = path.join(root, "docs", "release", "public-file-manifest.txt");
const firstPartyDeclarationPath = path.join(root, "licenses", "first-party-paths-v1.txt");
const evidenceDeclarationPath = path.join(root, "licenses", "evidence-paths-v1.json");
const FIRST_PARTY_HEADER = Object.freeze([
  "# Reviewed first-party Math Quest paths.",
  "# Adding a path asserts original MIT authorship and requires human review.",
  "",
]);

function normalized(value) {
  return String(value).replaceAll("\\", "/");
}

const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "-z"], {
  cwd: root,
  encoding: "buffer",
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
});

const stagedPaths = stdout.toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map(normalized)
  .sort();

if (!stagedPaths.length) throw new Error("The staged public candidate is empty.");
for (const required of [
  "licenses/component-register-v1.json",
  "licenses/evidence-paths-v1.json",
  "licenses/first-party-paths-v1.txt",
  "docs/release/public-file-manifest.txt",
  "tools/sync-public-inventory.mjs",
]) {
  if (!stagedPaths.includes(required)) throw new Error(`Stage ${required} before synchronizing the public inventory.`);
}

const register = JSON.parse(await readFile(registerPath, "utf8"));
const evidenceDeclaration = JSON.parse(await readFile(evidenceDeclarationPath, "utf8"));
if (
  evidenceDeclaration.schemaVersion !== 1
  || !Array.isArray(evidenceDeclaration.records)
  || !evidenceDeclaration.records.length
) {
  throw new Error("licenses/evidence-paths-v1.json must contain a nonempty schemaVersion 1 records array.");
}
const declaredEvidencePaths = evidenceDeclaration.records.map((record) => normalized(record.path));
if (new Set(declaredEvidencePaths).size !== declaredEvidencePaths.length) {
  throw new Error("licenses/evidence-paths-v1.json contains duplicate paths.");
}
if (declaredEvidencePaths.some((value, index) => value !== [...declaredEvidencePaths].sort()[index])) {
  throw new Error("licenses/evidence-paths-v1.json records must be sorted by path.");
}
for (const evidencePath of declaredEvidencePaths) {
  if (!stagedPaths.includes(evidencePath)) {
    throw new Error(`Declared evidence path is not staged: ${evidencePath}`);
  }
}
const declarationText = await readFile(firstPartyDeclarationPath, "utf8");
if (declarationText.includes("\r")) throw new Error("licenses/first-party-paths-v1.txt must use LF line endings.");
const declarationLines = declarationText.split("\n");
if (FIRST_PARTY_HEADER.some((line, index) => declarationLines[index] !== line)) {
  throw new Error("licenses/first-party-paths-v1.txt has an invalid header.");
}
const declaredFirstPartyPaths = declarationLines.slice(FIRST_PARTY_HEADER.length).filter(Boolean);
if (new Set(declaredFirstPartyPaths).size !== declaredFirstPartyPaths.length) {
  throw new Error("licenses/first-party-paths-v1.txt contains duplicate paths.");
}
if (declaredFirstPartyPaths.some((value, index) => value !== [...declaredFirstPartyPaths].sort()[index])) {
  throw new Error("licenses/first-party-paths-v1.txt must be sorted.");
}
const bundledPaths = new Set(
  (register.bundledComponents || []).flatMap((component) => component.paths || []).map(normalized),
);
const evidencePaths = new Set(declaredEvidencePaths);

const stagedFirstPartyPaths = stagedPaths.filter(
  (relativePath) => !bundledPaths.has(relativePath) && !evidencePaths.has(relativePath),
);
const declaredSet = new Set(declaredFirstPartyPaths);
const stagedSet = new Set(stagedFirstPartyPaths);
const unreviewed = stagedFirstPartyPaths.filter((relativePath) => !declaredSet.has(relativePath));
const stale = declaredFirstPartyPaths.filter((relativePath) => !stagedSet.has(relativePath));
if (unreviewed.length || stale.length) {
  const details = [
    ...unreviewed.map((relativePath) => `unreviewed staged path: ${relativePath}`),
    ...stale.map((relativePath) => `declared path is not staged first-party material: ${relativePath}`),
  ];
  throw new Error(`First-party declaration mismatch.\n${details.join("\n")}`);
}
register.firstPartyPaths = declaredFirstPartyPaths;

await writeFile(registerPath, `${JSON.stringify(register, null, 2)}\n`, "utf8");
await writeFile(
  manifestPath,
  [
    "# Generated from the staged Git index by tools/sync-public-inventory.mjs.",
    "# Do not edit by hand.",
    "",
    ...stagedPaths,
    "",
  ].join("\n"),
  "utf8",
);

process.stdout.write(`Synchronized ${stagedPaths.length} staged public paths.\n`);
