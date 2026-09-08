import path from "node:path";
import { fileURLToPath } from "node:url";
import { architectureFindings, architectureMutationFailures, loadArchitecturePolicy } from "./lib/architecture-policy.mjs";

export async function runArchitectureGate() {
  const policy = await loadArchitecturePolicy();
  const findings = [...architectureFindings(policy), ...architectureMutationFailures(policy)];
  return Object.freeze({
    schemaVersion: 1,
    policyId: policy.policyId,
    status: findings.length ? "FAIL" : "PASS",
    legacyImportEdges: policy.legacyImportEdgeRatchets.length,
    findings,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runArchitectureGate();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
