import { spawn } from "node:child_process";
import { runWithCleanup } from "./lib/operation-cleanup.mjs";
import { observePlaywrightServer, waitForPlaywrightServer, waitForPlaywrightServerExit as waitForExit, waitForPlaywrightResult } from "./lib/playwright-server-lifecycle.mjs";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwrightChildProcessRunning, playwrightFocusedExpectedServerIdentity, playwrightFocusedReportFindings, reviewedEdgeExecutable } from "./lib/playwright-focused-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const outputPath = path.join(root, "audit", ".tmp-playwright-focused-report.json");
const systemCandidatePaths = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const requestedExecutable = process.env.MQ_PLAYWRIGHT_EDGE_EXECUTABLE || null;
if (requestedExecutable && !reviewedEdgeExecutable(requestedExecutable)) {
  throw new Error("MQ_PLAYWRIGHT_EDGE_EXECUTABLE must identify the reviewed system Microsoft Edge path.");
}
const executablePath = (requestedExecutable ? [requestedExecutable] : systemCandidatePaths).find((candidate) => existsSync(candidate));
const serverScript = path.join(root, "Serve-MathQuest.ps1");
const expectedHealth = Object.freeze(await playwrightFocusedExpectedServerIdentity(root));

const installedManifestPath = path.join(root, "node_modules", "@playwright", "test", "package.json");
if (!existsSync(cli) || !existsSync(installedManifestPath)) throw new Error("@playwright/test is not installed. Run the reviewed npm ci command before this focused browser lane.");
if (!executablePath) throw new Error("A reviewed installed Microsoft Edge executable was not found.");
const installedManifest = JSON.parse(await readFile(installedManifestPath, "utf8"));
if (installedManifest.name !== "@playwright/test" || installedManifest.version !== "1.62.1") {
  throw new Error("The installed Playwright Test package does not match the reviewed 1.62.1 identity.");
}

const executableBytes = await readFile(executablePath);
const executableSha256 = createHash("sha256").update(executableBytes).digest("hex");
await rm(outputPath, { force: true });

const observedHealth = () => observePlaywrightServer(expectedHealth);

let ownedServer = null;
const initialHealth = await observedHealth();
if (initialHealth.reachable && !initialHealth.valid) {
  throw new Error(`Port 8771 is occupied by an unexpected server (${initialHealth.reason}).`);
}
let exitCode = 1;
await runWithCleanup(async () => {
  if (!initialHealth.valid) {
    ownedServer = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      serverScript,
      "-NoBrowser",
    ], { cwd: root, stdio: "ignore", windowsHide: true });
    await waitForPlaywrightServer(ownedServer, observedHealth);
  }
  const child = spawn(process.execPath, [
    cli,
    "test",
    "--config=playwright.config.mjs",
  ], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      MQ_PLAYWRIGHT_EDGE_EXECUTABLE: executablePath,
      MQ_PLAYWRIGHT_EDGE_SHA256: executableSha256,
      MQ_PLAYWRIGHT_RUNNER_VERSION: installedManifest.version,
      MQ_PLAYWRIGHT_REPORT_PATH: outputPath,
      MQ_PLAYWRIGHT_ROOT_ID: expectedHealth.rootId,
      MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256: expectedHealth.servedPayloadSha256,
    },
    stdio: "inherit",
    windowsHide: true,
  });
  exitCode = await waitForPlaywrightResult(child);
}, async () => {
  if (playwrightChildProcessRunning(ownedServer)) ownedServer.kill();
  await waitForExit(ownedServer);
  if (playwrightChildProcessRunning(ownedServer)) throw new Error("The focused Playwright lane could not stop its disposable Math Quest server.");
});

if (!existsSync(outputPath)) throw new Error("The focused Playwright reporter did not produce its closed report.");
const report = JSON.parse(await readFile(outputPath, "utf8"));
const findings = playwrightFocusedReportFindings(report, {
  expectedExecutableSha256: executableSha256,
  expectedRootId: expectedHealth.rootId,
  expectedServedPayloadSha256: expectedHealth.servedPayloadSha256,
});
if (exitCode !== 0) findings.unshift(`Playwright Test exited with status ${exitCode}`);
if (findings.length) throw new Error(`Focused Playwright lane failed: ${[...new Set(findings)].join("; ")}`);

process.stdout.write(`Focused Playwright lane passed ${report.summary.passed}/${report.summary.expected} direct Edge journeys.\n`);
