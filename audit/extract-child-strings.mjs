import path from "node:path";
import { fileURLToPath } from "node:url";
import { childStringArtifact, validateChildStringRecords } from "./lib/child-strings.mjs";
import { loadShippedEngine } from "./lib/engine-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loaded = await loadShippedEngine(process.env.MQ_INDEX_PATH || path.join(root, "index.html"));
const artifact = childStringArtifact(loaded.engine.CHILD_STRINGS ?? loaded.engine.CHILD_STRING_TABLE);
const errors = validateChildStringRecords(artifact.records);
process.stdout.write(`${JSON.stringify({
  canonicalizationVersion: artifact.version,
  sha256: artifact.sha256,
  engineSha256: loaded.sha256,
  recordCount: artifact.records.length,
  validationErrors: errors,
  canonicalJson: artifact.canonicalJson,
}, null, 2)}\n`);
process.exitCode = errors.length ? 1 : 0;
