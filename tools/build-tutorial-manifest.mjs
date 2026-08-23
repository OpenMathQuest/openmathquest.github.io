import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../audit/lib/curriculum-manifest.mjs";
import { loadShippedEngine } from "../audit/lib/engine-loader.mjs";
import {
  TUTORIAL_PATH,
  tutorialCurriculumProjectionArtifact,
  tutorialFeatureInventory,
  validateTutorialManifest,
} from "../audit/lib/tutorial-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(root, "index.html");
const curriculumPath = path.join(root, "curriculum", "math-quest-manifest-v1.json");
const tutorialPath = path.join(root, ...TUTORIAL_PATH.split("/"));
const artDesignPath = path.join(root, "audit", "art-design-decision-register-v1.json");

const curriculumArtifact = await loadManifest(curriculumPath);
const artDesign = JSON.parse(await readFile(artDesignPath, "utf8"));
const { engine } = await loadShippedEngine(indexPath, { timeoutMs: 2_000 });
const authored = JSON.parse(await readFile(tutorialPath, "utf8"));
if (authored.tutorialContractVersion !== "tutorial-contract-v2") throw new Error("The canonical tutorial manifest must author tutorial-contract-v2 before derived fields can be refreshed.");
if (authored.differentExample?.automaticInvariantAnswerFallback !== "FORBIDDEN") throw new Error("The canonical tutorial manifest must forbid automatic invariant-answer fallback.");

const projection = tutorialCurriculumProjectionArtifact(curriculumArtifact.manifest);
const featureBindings = tutorialFeatureInventory(engine);
const manifest = {
  ...authored,
  questionGeneratorContractVersion: engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION,
  curriculumBinding: {
    manifestId: curriculumArtifact.manifest.manifestId,
    manifestVersion: curriculumArtifact.manifest.version,
    manifestSha256: curriculumArtifact.sha256,
    projectionVersion: "tutorial-curriculum-projection-v1",
    projectionSha256: projection.sha256,
    skillCount: projection.skillCount,
    taskObligationCount: projection.taskObligationCount,
  },
  featureBindings,
};

const issues = await validateTutorialManifest(manifest, {
  curriculumArtifact,
  artDesign,
  questionGeneratorContractVersion: engine.CONSTANTS.QUESTION_GENERATOR_CONTRACT_VERSION,
  inputMethods: Object.keys(engine.CONSTANTS.INPUT_CLASS_BY_METHOD).sort(),
  featureInventory: featureBindings,
  childStringIds: engine.CHILD_STRINGS.map((record) => record.id),
});
if (issues.length) throw new Error(`The canonical tutorial manifest is invalid:\n- ${issues.join("\n- ")}`);

const expected = `${JSON.stringify(manifest, null, 2)}\n`;
const actual = await readFile(tutorialPath, "utf8");
if (process.argv.includes("--write")) {
  if (actual !== expected) await writeFile(tutorialPath, expected, "utf8");
  console.log(`Updated derived tutorial bindings for ${projection.skillCount} skills and ${projection.taskObligationCount} task obligations.`);
} else if (actual !== expected) {
  console.error(`${TUTORIAL_PATH} has stale derived fields. Run node tools/build-tutorial-manifest.mjs --write and review the exact diff.`);
  process.exitCode = 1;
} else {
  console.log(`PASS tutorial manifest build ${projection.sha256}`);
}
