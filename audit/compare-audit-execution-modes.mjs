import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareAuditExecutionReports } from "./lib/bounded-audit-lanes.mjs";
import { GATE_INTEGRITY_POLICY } from "./lib/gate-integrity-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
};
const readReport = async (value) => JSON.parse(await readFile(path.resolve(root, value), "utf8"));

const serialPath = arg("serial");
const parallelPath = arg("parallel");
if (!serialPath || !parallelPath) throw new TypeError("--serial and --parallel report paths are required.");
const [serialReport, parallelReport] = await Promise.all([readReport(serialPath), readReport(parallelPath)]);
const comparison = compareAuditExecutionReports(serialReport, parallelReport, {
  minimumReductionPercent: GATE_INTEGRITY_POLICY.executionPolicy.minimumMeasuredWallTimeReductionPercent,
});
process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
process.exitCode = comparison.status === "PASS" ? 0 : 1;
