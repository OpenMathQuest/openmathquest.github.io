import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function assertPublicationRunnerWiring(root) {
  const runner = (await Promise.all([
    "run-audit.mjs",
    "lib/audit-publication-report.mjs",
    "lib/audit-markdown-report.mjs",
  ].map((file) => readFile(path.join(root, "audit", file), "utf8")))).join("\n");
  const workflow = await readFile(path.join(root, ".github", "workflows", "audit.yml"), "utf8");
  assert.match(runner, /import \{ publicationClearance \} from "\.\/lib\/audit-publication-report\.mjs"/u);
  assert.match(runner, /import \{ auditMarkdown \} from "\.\/lib\/audit-markdown-report\.mjs"/u);
  assert.match(runner, /publicationBrowserEvidenceState\(liveBrowserEvidence, reviewedBrowserEvidence\)/u);
  assert.match(runner, /browserProductName:\s*reviewedBrowserTuple\.browserProductName/u);
  assert.match(runner, /reviewed qualification record is invalid or pending/u);
  assert.match(runner, /final hosted tuple is invalid or unavailable/u);
  assert.doesNotMatch(runner, /browserRunnerTuplesMatch\(liveBrowserEvidence, reviewedBrowserEvidence\)/u);
  assert.match(workflow, /clearance or its independently required hosted evidence is invalid/u);
  assert.doesNotMatch(workflow, /clearance does not match this exact browser\/runner audit tuple/u);
}
