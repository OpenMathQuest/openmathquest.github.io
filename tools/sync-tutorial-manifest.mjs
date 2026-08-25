import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../audit/lib/curriculum-manifest.mjs";
import { loadShippedEngine } from "../audit/lib/engine-loader.mjs";
import { loadTutorialManifest, tutorialFeatureInventory, TUTORIAL_PATH } from "../audit/lib/tutorial-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
const curriculumPath = path.join(root, "curriculum", "math-quest-manifest-v1.json");
const tutorialPath = path.join(root, ...TUTORIAL_PATH.split("/"));
const artDesignPath = path.join(root, "audit", "art-design-decision-register-v1.json");
const startMarker = "  /* ===TUTORIAL-MANIFEST-START=== */";
const endMarker = "  /* ===TUTORIAL-MANIFEST-END=== */";

function replacement(canonical, sha256) {
  return [
    startMarker,
    `  const TUTORIAL_MANIFEST=(()=>{const value=${canonical},freeze=input=>{if(input&&typeof input==="object"&&!Object.isFrozen(input)){Object.values(input).forEach(freeze);Object.freeze(input);}return input;};return freeze(value);})();`,
    `  const TUTORIAL_MANIFEST_SHA256="${sha256}";`,
    endMarker,
  ].join("\n");
}

const curriculumArtifact = await loadManifest(curriculumPath);
const artDesign = JSON.parse(await readFile(artDesignPath, "utf8"));
const { engine } = await loadShippedEngine(indexPath, { timeoutMs: 2_000 });
const tutorialArtifact = await loadTutorialManifest(tutorialPath, {
  curriculumArtifact,
  artDesign,
  questionGeneratorContractVersion: engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION,
  inputMethods: Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD),
  featureInventory: tutorialFeatureInventory(engine),
});
const page = await readFile(indexPath, "utf8");
const start = page.indexOf(startMarker);
const end = page.indexOf(endMarker);
if (start === -1 || end === -1 || page.indexOf(startMarker, start + 1) !== -1 || page.indexOf(endMarker, end + 1) !== -1 || end <= start) {
  throw new Error("index.html must contain exactly one ordered tutorial-manifest marker pair.");
}
const endExclusive = end + endMarker.length;
const expected = `${page.slice(0, start)}${replacement(tutorialArtifact.canonical, tutorialArtifact.sha256)}${page.slice(endExclusive)}`;
if (process.argv.includes("--check")) {
  if (expected !== page) {
    console.error("index.html does not contain the canonical tutorial manifest bytes.");
    process.exitCode = 1;
  } else {
    console.log(`PASS tutorial manifest sync ${tutorialArtifact.sha256}`);
  }
} else {
  await writeFile(indexPath, expected, "utf8");
  console.log(`Updated index.html with tutorial manifest ${tutorialArtifact.sha256}.`);
}
