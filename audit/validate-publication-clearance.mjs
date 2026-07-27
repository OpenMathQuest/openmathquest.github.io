import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadShippedEngine } from "./lib/engine-loader.mjs";
import { CURRICULUM_PATH, loadManifest } from "./lib/curriculum-manifest.mjs";
import {
  clearanceMatches,
  parsePublicationClearance,
  PUBLICATION_CLEARANCE_PATH,
} from "./lib/publication-clearance.mjs";
import { rightsStateSha256 } from "./lib/rights-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payloadSha256 = String(process.env.MQ_PUBLIC_PAYLOAD_SHA256 || "");
const payloadTreeOid = String(process.env.MQ_PUBLIC_PAYLOAD_TREE_OID || "");

try {
  if (!/^[a-f0-9]{64}$/u.test(payloadSha256) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(payloadTreeOid)) {
    throw new Error("Validated public-payload environment values are missing or malformed.");
  }
  const [text, engine, manifest, rightsSha256] = await Promise.all([
    readFile(path.join(root, PUBLICATION_CLEARANCE_PATH), "utf8"),
    loadShippedEngine(path.join(root, "index.html")),
    loadManifest(path.join(root, CURRICULUM_PATH)),
    rightsStateSha256(root),
  ]);
  const parsed = parsePublicationClearance(text);
  if (!parsed.valid) throw new Error(`Publication clearance schema failed: ${parsed.issues.join("; ")}`);
  const expected = {
    engineSha256: engine.sha256,
    manifestVersion: manifest.manifest.version,
    manifestSha256: manifest.sha256,
    rightsSha256,
    payloadSha256,
    payloadTreeOid,
  };
  if (!clearanceMatches(parsed, expected)) throw new Error("Publication clearance does not match the exact reviewed artifacts.");
  process.stdout.write(`${JSON.stringify({ status: "APPROVED", reviewDate: parsed.reviewDate, payloadSha256, payloadTreeOid })}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
