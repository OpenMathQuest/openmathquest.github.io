import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";
import { compareWithBaseline, differentialMutationFailures } from "./lib/differential-equivalence.mjs";

export async function runDifferentialEquivalence() {
  const policy = await loadQualityGatePolicy();
  const comparison = await compareWithBaseline(policy.baselineCommit);
  const findings = [...comparison.findings, ...await differentialMutationFailures(policy.baselineCommit)];
  return Object.freeze({
    schemaVersion: 1,
    baselineCommit: policy.baselineCommit,
    status: findings.length ? "FAIL" : "PASS",
    observations: comparison.candidateCount,
    discoveryRequests: comparison.discoveryRequestCount,
    generatedPromptTypes: comparison.generatedPromptCount,
    generatedPromptRegistrySha256: comparison.generatedPromptSha256,
    generatedQuestionCorpusSha256: comparison.generatedCorpusSha256,
    semanticWitnesses: comparison.semanticWitnessCount,
    semanticWitnessRegistrySha256: comparison.semanticWitnessRegistrySha256,
    explicitSemanticSupportCases: comparison.semanticSupportCaseIds,
    approvedMetadataTransition: comparison.approvedMetadataTransition,
    findings,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runDifferentialEquivalence();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
