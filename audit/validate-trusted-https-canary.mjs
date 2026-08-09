import { readFile } from "node:fs/promises";
import { parseTrustedHttpsCanaryEvidence } from "./lib/trusted-https-canary.mjs";

const [artifactPath, candidateSha, mode = "require-reconciled"] = process.argv.slice(2);
if (!artifactPath || !candidateSha || !["require-reconciled", "allow-failed"].includes(mode)) {
  throw new Error("Usage: node audit/validate-trusted-https-canary.mjs <artifact-path> <candidate-sha> [require-reconciled|allow-failed]");
}

const parsed = parseTrustedHttpsCanaryEvidence(await readFile(artifactPath, "utf8"), {
  candidateSha,
  runnerImageOS: process.env.ImageOS,
  runnerImageVersion: process.env.ImageVersion,
  workflowRunId: process.env.GITHUB_RUN_ID,
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT,
  requireReconciled: mode === "require-reconciled",
});
if (!parsed.valid) {
  throw new Error(`Trusted-HTTPS canary evidence is invalid:\n- ${parsed.issues.join("\n- ")}`);
}
process.stdout.write(mode === "require-reconciled"
  ? "Trusted-HTTPS canary evidence is canonical and RECONCILED.\n"
  : "Trusted-HTTPS canary evidence is canonical; a failed diagnostic record was permitted.\n");
