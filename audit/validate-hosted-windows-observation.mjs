import { readFile } from "node:fs/promises";
import { parseHostedWindowsObservation } from "./lib/hosted-windows-observation.mjs";

const [artifactPath, candidateSha] = process.argv.slice(2);
if (!artifactPath || !candidateSha) {
  throw new Error("Usage: node audit/validate-hosted-windows-observation.mjs <artifact-path> <candidate-sha>");
}
const parsed = parseHostedWindowsObservation(await readFile(artifactPath, "utf8"), {
  candidateSha,
  runnerImageOS: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion,
});
if (!parsed.valid) {
  throw new Error(`Hosted Windows identity observation is invalid:\n- ${parsed.issues.join("\n- ")}`);
}
process.stdout.write("Hosted Windows identity observation is canonical and explicitly non-certifying.\n");
