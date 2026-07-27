import { spawnSync } from "node:child_process";
import path from "node:path";

function parseNumber(cell) {
  const value = Number(String(cell).replace(/[^0-9.]/gu, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseNativeCoverage(output) {
  const rows = new Map();
  for (const line of String(output).split(/\r?\n/u)) {
    if (!line.includes("|")) continue;
    const cells = line
      .replace(/^[^\p{L}\p{N}./\\_-]*/u, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 4 || /^(file|all files)$/iu.test(cells[0])) continue;
    const linePct = parseNumber(cells[1]);
    const branchPct = parseNumber(cells[2]);
    const functionPct = parseNumber(cells[3]);
    if (linePct !== null && branchPct !== null && functionPct !== null) {
      rows.set(cells[0].replace(/\\/gu, "/"), { file: cells[0], linePct, branchPct, functionPct, raw: line });
    }
  }
  return rows;
}

function findRow(rows, suffix) {
  const normalized = suffix.replace(/\\/gu, "/").toLowerCase();
  return [...rows.values()].find((row) => row.file.replace(/\\/gu, "/").toLowerCase().endsWith(normalized));
}

export function runNativeCoverage(nodePath, testFile, { cwd, timeoutMs = 120_000, env } = {}) {
  const args = [
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-lines=0",
    "--test-coverage-functions=0",
    "--test-coverage-branches=0",
    path.resolve(testFile),
  ];
  const child = spawnSync(nodePath, args, { cwd, encoding: "utf8", timeout: timeoutMs, windowsHide: true, env: { ...process.env, ...env } });
  return {
    command: [nodePath, ...args],
    status: child.status,
    signal: child.signal,
    error: child.error ? String(child.error) : null,
    stdout: child.stdout || "",
    stderr: child.stderr || "",
    rows: parseNativeCoverage(`${child.stdout || ""}\n${child.stderr || ""}`),
  };
}

export function calibrateNativeCoverage(nodePath, root) {
  const fixture = path.join(root, "audit", "fixtures", "coverage-calibration.test.mjs");
  const run = runNativeCoverage(nodePath, fixture, { cwd: root });
  const full = findRow(run.rows, "mq-coverage-calibration-full.js");
  const partial = findRow(run.rows, "mq-coverage-calibration-partial.js");
  const aggregate = findRow(run.rows, "mq-coverage-calibration-aggregate.js");
  const reasons = [];
  if (run.status !== 0) reasons.push(`calibration process exited ${run.status ?? run.signal ?? "without status"}`);
  if (!full) reasons.push("native report omitted the full vm.Script filename");
  if (!partial) reasons.push("native report omitted the partial vm.Script filename");
  if (!aggregate) reasons.push("native report omitted the repeated-filename aggregation fixture");
  if (full && full.branchPct !== 100) reasons.push(`full fixture branch coverage was ${full.branchPct}, expected 100`);
  if (partial && !(partial.branchPct >= 0 && partial.branchPct < 100)) {
    reasons.push(`partial fixture branch coverage was ${partial.branchPct}, expected less than 100`);
  }
  if (aggregate && aggregate.branchPct !== 100) {
    reasons.push(`repeated-filename aggregation fixture branch coverage was ${aggregate.branchPct}, expected 100`);
  }
  return { ok: reasons.length === 0, reasons, full, partial, aggregate, run };
}

export function findCoverageRow(rows, suffix) { return findRow(rows, suffix); }
