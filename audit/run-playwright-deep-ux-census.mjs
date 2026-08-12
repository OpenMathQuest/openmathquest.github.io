import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadShippedEngine } from "./lib/engine-loader.mjs";
import {
  DEEP_UX_BETA_CADENCE,
  DEEP_UX_CENSUS_REPORT_ID,
  DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION,
  DEEP_UX_CENSUS_STATES,
  DEEP_UX_CENSUS_VIEWPORTS,
  buildDeepUxCensusPlan,
  canonicalDeepUxJson,
  deepUxCensusReportFindings,
  deepUxCensusRequiredForVersion,
  sha256,
  validateDeepUxCensusPlan,
} from "./lib/playwright-deep-ux-census.mjs";
import {
  playwrightChildProcessRunning,
  playwrightFocusedExpectedServerIdentity,
  playwrightFocusedServerIdentityMatches,
  reviewedEdgeExecutable,
} from "./lib/playwright-focused-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const tempRoot = path.join(root, "audit", ".tmp-playwright-deep-ux");
const planPath = path.join(tempRoot, "plan.json");
const shardDirectory = path.join(tempRoot, "shards");
const artifactDirectory = path.join(root, "audit", ".tmp-playwright-deep-ux-artifacts");
const outputPath = path.join(root, "audit", ".tmp-playwright-deep-ux-report.json");
const serverScript = path.join(root, "Serve-MathQuest.ps1");
const healthUrl = "http://127.0.0.1:8771/__math_quest_health__";
const systemCandidatePaths = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function parseMode(argv) {
  if (argv.length === 1 && argv[0] === "--full") return { executionMode: "FULL", requestedCellLimit: null };
  if (argv.length === 1 && argv[0] === "--benchmark=100") return { executionMode: "BENCHMARK", requestedCellLimit: 100 };
  throw new Error("Use exactly --full or --benchmark=100.");
}

const mode = parseMode(process.argv.slice(2));
const requestedExecutable = process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE || null;
if (requestedExecutable && !reviewedEdgeExecutable(requestedExecutable)) throw new Error("MQ_PLAYWRIGHT_EDGE_EXECUTABLE must identify the reviewed system Microsoft Edge path.");
const executablePath = (requestedExecutable ? [requestedExecutable] : systemCandidatePaths).find((candidate) => existsSync(candidate));
const installedManifestPath = path.join(root, "node_modules", "@playwright", "test", "package.json");
if (!existsSync(cli) || !existsSync(installedManifestPath)) throw new Error("@playwright/test is not installed. Run the reviewed npm ci command first.");
if (!executablePath) throw new Error("A reviewed installed Microsoft Edge executable was not found.");
const installedManifest = JSON.parse(await readFile(installedManifestPath, "utf8"));
if (installedManifest.name !== "@playwright/test" || installedManifest.version !== "1.62.1") throw new Error("The installed Playwright Test package does not match the reviewed 1.62.1 identity.");
const executableSha256 = createHash("sha256").update(await readFile(executablePath)).digest("hex");
const expectedHealth = Object.freeze(await playwrightFocusedExpectedServerIdentity(root));
const { engine, sha256: engineSha256 } = await loadShippedEngine(path.join(root, "index.html"));
const requiredForRelease = deepUxCensusRequiredForVersion(engine.CONSTANTS.PRODUCT_VERSION);
if (mode.executionMode === "FULL") {
  if (!requiredForRelease) throw new Error("The complete census is allowed only for a release selected by the alternating-beta cadence.");
  if (process.env.GITHUB_ACTIONS !== "true"
      || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
      || process.env.GITHUB_REPOSITORY !== "OpenMathQuest/openmathquest.github.io"
      || process.env.GITHUB_REF !== "refs/heads/main"
      || !/^[a-f0-9]{40}$/u.test(String(process.env.GITHUB_SHA || ""))
      || process.env.MQ_DEEP_UX_CANDIDATE_SHA !== process.env.GITHUB_SHA) {
    throw new Error("The complete census requires the exact frozen protected-main candidate on a GitHub-hosted runner.");
  }
}
const plan = buildDeepUxCensusPlan(engine, { engineSha256, ...mode });
const planValidation = validateDeepUxCensusPlan(plan);
if (!planValidation.valid) throw new Error(`Deep UX plan rejected: ${planValidation.issues.join("; ")}`);
await rm(tempRoot, { recursive: true, force: true });
await rm(artifactDirectory, { recursive: true, force: true });
await rm(outputPath, { force: true });
await mkdir(shardDirectory, { recursive: true });
await writeFile(planPath, canonicalDeepUxJson(plan), "utf8");

async function observedHealth() {
  try {
    const response = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return { reachable: true, valid: false, reason: `HTTP ${response.status}` };
    const value = await response.json();
    const valid = playwrightFocusedServerIdentityMatches(value, expectedHealth);
    return { reachable: true, valid, reason: valid ? null : "identity mismatch" };
  } catch {
    return { reachable: false, valid: false, reason: "unreachable" };
  }
}

async function waitForHealth(server, deadlineMs = 20_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const health = await observedHealth();
    if (health.valid) return;
    if (health.reachable) throw new Error(`Port 8771 answered with an unexpected server (${health.reason}).`);
    if (server && !playwrightChildProcessRunning(server)) throw new Error(`Math Quest test server exited with status ${server.exitCode ?? server.signalCode}.`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Math Quest test server did not become healthy within 20 seconds.");
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (!playwrightChildProcessRunning(child)) return;
  let timer;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  await Promise.race([exited, timeout]);
  clearTimeout(timer);
}

let ownedServer = null;
let playwrightExitCode = 1;
const initialHealth = await observedHealth();
if (initialHealth.reachable && !initialHealth.valid) throw new Error(`Port 8771 is occupied by an unexpected server (${initialHealth.reason}).`);
const startedAt = Date.now();
try {
  if (!initialHealth.valid) {
    ownedServer = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", serverScript, "-NoBrowser"], { cwd: root, stdio: "ignore", windowsHide: true });
    await waitForHealth(ownedServer);
  }
  const child = spawn(process.execPath, [cli, "test", "--config=playwright.deep-ux.config.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      MQ_PLAYWRIGHT_EDGE_EXECUTABLE: executablePath,
      MQ_PLAYWRIGHT_EDGE_SHA256: executableSha256,
      MQ_PLAYWRIGHT_RUNNER_VERSION: installedManifest.version,
      MQ_PLAYWRIGHT_ROOT_ID: expectedHealth.rootId,
      MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256: expectedHealth.servedPayloadSha256,
      MQ_DEEP_UX_PLAN_PATH: planPath,
      MQ_DEEP_UX_SHARD_DIRECTORY: shardDirectory,
      MQ_DEEP_UX_ARTIFACT_DIRECTORY: artifactDirectory,
      MQ_DEEP_UX_HOSTED: mode.executionMode === "FULL" ? "1" : "0",
    },
    stdio: "inherit",
    windowsHide: true,
  });
  playwrightExitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => signal ? reject(new Error(`Playwright Test ended with signal ${signal}.`)) : resolve(code ?? 1));
  });
} finally {
  if (playwrightChildProcessRunning(ownedServer)) ownedServer.kill();
  await waitForExit(ownedServer);
  if (playwrightChildProcessRunning(ownedServer)) throw new Error("The Deep UX Census could not stop its disposable Math Quest server.");
}

const expectedIds = [...plan.cells.map((cell) => cell.cellId)].sort();
const expectedIdSet = new Set(expectedIds);
const shards = [];
for (const viewport of DEEP_UX_CENSUS_VIEWPORTS) {
  const filename = path.join(shardDirectory, `${viewport.id}.json`);
  if (existsSync(filename)) shards.push(JSON.parse(await readFile(filename, "utf8")));
}
const executedRows = shards.flatMap((shard) => Array.isArray(shard.executed) ? shard.executed : []);
const executedIds = executedRows.map((row) => row.cellId);
const anomalies = shards.flatMap((shard) => Array.isArray(shard.anomalies) ? shard.anomalies : []);
const seen = new Set();
let duplicates = 0;
for (const id of executedIds) { if (seen.has(id)) duplicates += 1; seen.add(id); }
const unknown = executedIds.filter((id) => !expectedIdSet.has(id)).length;
const products = [...new Set(shards.map((shard) => shard.browserProduct).filter(Boolean))];
const versions = [...new Set(shards.map((shard) => shard.browserVersion).filter(Boolean))];
const projectCounts = DEEP_UX_CENSUS_VIEWPORTS.map((viewport) => {
  const expected = plan.cells.filter((cell) => cell.viewportId === viewport.id).length;
  const rows = executedRows.filter((row) => String(row.cellId).endsWith(`@${viewport.id}`));
  return { projectId: viewport.id, expected, actual: rows.length, passed: rows.filter((row) => row.passed === true).length, failed: rows.filter((row) => row.passed !== true).length };
});
const clean = playwrightExitCode === 0
  && shards.length === DEEP_UX_CENSUS_VIEWPORTS.length
  && executedIds.length === expectedIds.length
  && executedRows.every((row) => row.passed === true)
  && unknown === 0
  && duplicates === 0
  && sha256([...executedIds].sort()) === sha256(expectedIds)
  && anomalies.length === 0;
const report = {
  schemaVersion: DEEP_UX_CENSUS_REPORT_SCHEMA_VERSION,
  contractId: DEEP_UX_CENSUS_REPORT_ID,
  generatedAt: new Date().toISOString(),
  status: mode.executionMode === "FULL" ? (clean ? "PASS" : "FAIL") : (clean ? "NON_CERTIFYING_PASS" : "NON_CERTIFYING_FAIL"),
  mode: mode.executionMode,
  candidate: {
    release: engine.CONSTANTS.PRODUCT_VERSION,
    commitSha: mode.executionMode === "FULL" ? process.env.GITHUB_SHA : null,
    engineSha256,
    curriculumSha256: engine.CURRICULUM_MANIFEST_SHA256,
    serverRootId: expectedHealth.rootId,
    servedPayloadSha256: expectedHealth.servedPayloadSha256,
  },
  cadence: {
    firstRequiredBetaOrdinal: DEEP_UX_BETA_CADENCE.firstRequiredBetaOrdinal,
    interval: DEEP_UX_BETA_CADENCE.modulus,
    requiredForRelease,
    satisfied: mode.executionMode === "FULL" && clean,
  },
  plan: {
    plannerVersion: plan.plannerVersion,
    planSha256: plan.planSha256,
    seed: plan.seed,
    sourceQuestionCount: plan.sourceQuestionCount,
    riskSignatureCount: plan.riskSignatureCount,
    scenarioCount: plan.scenarioCount,
    viewportCount: plan.viewportCount,
    fullCellCount: plan.fullCellCount,
    selectedCellCount: plan.cells.length,
    states: DEEP_UX_CENSUS_STATES,
  },
  toolchain: {
    runnerPackage: "@playwright/test",
    runnerVersion: installedManifest.version,
    browserProduct: products.length === 1 && /^Edg\//u.test(products[0]) ? "Microsoft Edge" : "",
    browserVersion: versions.length === 1 ? versions[0] : "",
    browserExecutableSha256: executableSha256,
  },
  privacy: {
    usesSyntheticStateOnly: true,
    includesChildName: false,
    includesChildProgress: false,
    includesPassScreenshots: false,
    includesPassTraces: false,
    failureArtifactsSyntheticOnly: true,
    failureArtifactsUploadedOnFailure: true,
  },
  execution: {
    expectedCells: expectedIds.length,
    actualCells: executedIds.length,
    passedCells: executedRows.filter((row) => row.passed === true).length,
    failedCells: executedRows.filter((row) => row.passed !== true).length,
    skippedCells: 0,
    unknownCells: unknown,
    duplicateCells: duplicates,
    expectedCellSetSha256: sha256(expectedIds),
    executedCellSetSha256: sha256([...executedIds].sort()),
    durationMs: Date.now() - startedAt,
    projectCounts,
  },
  anomalies,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const findings = deepUxCensusReportFindings(report, { expectedPlan: plan, expectedExecutableSha256: executableSha256, expectedRootId: expectedHealth.rootId, expectedServedPayloadSha256: expectedHealth.servedPayloadSha256 });
if (playwrightExitCode !== 0 && clean) findings.unshift(`Playwright Test exited with status ${playwrightExitCode}`);
await rm(tempRoot, { recursive: true, force: true });
await rm(path.join(root, "audit", ".tmp-playwright-deep-ux-results"), { recursive: true, force: true });
if (findings.length) throw new Error(`Deep UX Census report rejected: ${findings.join("; ")}`);
if (!clean) throw new Error(`Deep UX Census found ${anomalies.length} anomaly record(s); see ${path.relative(root, outputPath)}.`);
process.stdout.write(`${mode.executionMode === "FULL" ? "Deep UX Census" : "Non-certifying Deep UX benchmark"} passed ${report.execution.passedCells}/${report.execution.expectedCells} rendered cells from ${report.plan.sourceQuestionCount.toLocaleString("en-CA")} deterministic questions.\n`);
