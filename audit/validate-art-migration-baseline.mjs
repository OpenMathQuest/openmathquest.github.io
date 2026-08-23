import { loadArtMigrationBaseline } from "./lib/art-migration-baseline.mjs";

try {
  const { baseline, validation } = await loadArtMigrationBaseline();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    gateId: baseline.exitGateId,
    gateFamilyId: "gate.art-migration-baseline",
    status: validation.status,
    sourceRevision: baseline.sourceRevision,
    fixtureCount: baseline.fixtureContract.records.length,
    browserEvidence: baseline.browserEvidenceBinding,
    visualResultCount: baseline.visualEvidence.results.length,
    visualResultSetSha256: baseline.visualEvidence.resultSetSha256,
  })}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message || error)}\n`);
  process.exitCode = 1;
}
