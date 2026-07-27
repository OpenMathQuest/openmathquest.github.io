import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../audit/lib/curriculum-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
const manifestPath = path.join(root, "curriculum", "math-quest-manifest-v1.json");
const startMarker = "  /* ===CURRICULUM-MANIFEST-START=== */";
const endMarker = "  /* ===CURRICULUM-MANIFEST-END=== */";

function replacement(canonical, sha256) {
  return [
    startMarker,
    `  const CURRICULUM_MANIFEST=(()=>{const value=${canonical},freeze=input=>{if(input&&typeof input==="object"&&!Object.isFrozen(input)){Object.values(input).forEach(freeze);Object.freeze(input);}return input;};return freeze(value);})();`,
    `  const CURRICULUM_MANIFEST_SHA256="${sha256}";`,
    endMarker,
  ].join("\n");
}

const { canonical, sha256 } = await loadManifest(manifestPath);
const page = await readFile(indexPath, "utf8");
const start = page.indexOf(startMarker);
const end = page.indexOf(endMarker);
if (start === -1 || end === -1 || page.indexOf(startMarker, start + 1) !== -1 || page.indexOf(endMarker, end + 1) !== -1 || end <= start) {
  throw new Error("index.html must contain exactly one ordered curriculum-manifest marker pair.");
}
const endExclusive = end + endMarker.length;
const expected = `${page.slice(0, start)}${replacement(canonical, sha256)}${page.slice(endExclusive)}`;
if (process.argv.includes("--check")) {
  if (expected !== page) {
    console.error("index.html does not contain the canonical curriculum manifest bytes.");
    process.exitCode = 1;
  } else {
    console.log(`PASS manifest sync ${sha256}`);
  }
} else {
  await writeFile(indexPath, expected, "utf8");
  console.log(`Updated index.html with curriculum manifest ${sha256}.`);
}
