import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS,
  PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN,
  buildPlaywrightInteractionFuzzReport,
  playwrightInteractionFuzzReportFindings,
} from "./lib/playwright-interaction-fuzz.mjs";
import {
  playwrightChildProcessRunning,
  playwrightFocusedExpectedServerIdentity,
  playwrightFocusedServerIdentityMatches,
  reviewedEdgeExecutable,
} from "./lib/playwright-focused-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const outputDirectory = path.join(root, "audit", ".tmp-playwright-interaction-fuzz");
const reportPath = path.join(root, "audit", ".tmp-playwright-interaction-fuzz-report.json");
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
const healthUrl = "http://127.0.0.1:8771/__math_quest_health__";
const expectedHealth = Object.freeze(await playwrightFocusedExpectedServerIdentity(root));

const manifests = Object.freeze([
  Object.freeze({ name: "@playwright/test", path: path.join(root, "node_modules", "@playwright", "test", "package.json"), expected: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN.playwrightTest }),
  Object.freeze({ name: "fast-check", path: path.join(root, "node_modules", "fast-check", "package.json"), expected: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN.fastCheck }),
  Object.freeze({ name: "pure-rand", path: path.join(root, "node_modules", "pure-rand", "package.json"), expected: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN.pureRand }),
]);
if (!existsSync(cli)) throw new Error("The reviewed Playwright Test CLI is not installed. Run npm ci first.");
if (!executablePath) throw new Error("A reviewed installed Microsoft Edge executable was not found.");
for (const manifestRecord of manifests) {
  if (!existsSync(manifestRecord.path)) throw new Error(`${manifestRecord.name} is not installed. Run npm ci first.`);
  const installed = JSON.parse(await readFile(manifestRecord.path, "utf8"));
  if (installed.name !== manifestRecord.name || installed.version !== manifestRecord.expected) {
    throw new Error(`${manifestRecord.name} does not match the reviewed ${manifestRecord.expected} identity.`);
  }
}

const executableBytes = await readFile(executablePath);
const executableSha256 = createHash("sha256").update(executableBytes).digest("hex");
await rm(outputDirectory, { recursive: true, force: true });
await rm(reportPath, { force: true });
await mkdir(outputDirectory, { recursive: true });

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
    if (server && !playwrightChildProcessRunning(server)) {
      throw new Error(`Math Quest test server exited with status ${server.exitCode ?? server.signalCode}.`);
    }
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
const initialHealth = await observedHealth();
if (initialHealth.reachable && !initialHealth.valid) {
  throw new Error(`Port 8771 is occupied by an unexpected server (${initialHealth.reason}).`);
}
let exitCode = 1;
try {
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
    await waitForHealth(ownedServer);
  }
  const child = spawn(process.execPath, [
    cli,
    "test",
    "--config=playwright.interaction-fuzz.config.mjs",
  ], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      MQ_PLAYWRIGHT_EDGE_EXECUTABLE: executablePath,
      MQ_PLAYWRIGHT_EDGE_SHA256: executableSha256,
      MQ_PLAYWRIGHT_RUNNER_VERSION: PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN.playwrightTest,
      MQ_PLAYWRIGHT_REPORT_PATH: reportPath,
      MQ_PLAYWRIGHT_ROOT_ID: expectedHealth.rootId,
      MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256: expectedHealth.servedPayloadSha256,
      MQ_INTERACTION_FUZZ_OUTPUT_DIR: outputDirectory,
    },
    stdio: "inherit",
    windowsHide: true,
  });
  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => signal
      ? reject(new Error(`Playwright Test ended with signal ${signal}.`))
      : resolve(code ?? 1));
  });
} finally {
  if (playwrightChildProcessRunning(ownedServer)) ownedServer.kill();
  await waitForExit(ownedServer);
  if (playwrightChildProcessRunning(ownedServer)) {
    throw new Error("The interaction-fuzz lane could not stop its disposable Math Quest server.");
  }
}

const outputNames = new Set(await readdir(outputDirectory));
const missingProjects = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS
  .filter((project) => !outputNames.has(`${project.id}.json`))
  .map((project) => project.id);
if (missingProjects.length) {
  throw new Error(`Interaction-fuzz lane omitted project shards: ${missingProjects.join(", ")}.`);
}
const shards = [];
for (const project of PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS) {
  shards.push(JSON.parse(await readFile(path.join(outputDirectory, `${project.id}.json`), "utf8")));
}
const report = buildPlaywrightInteractionFuzzReport(shards);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
const findings = playwrightInteractionFuzzReportFindings(report);
if (exitCode !== 0) findings.unshift(`Playwright Test exited with status ${exitCode}`);
if (findings.length) {
  throw new Error(`Playwright interaction-fuzz lane failed: ${[...new Set(findings)].join("; ")}`);
}

await rm(outputDirectory, { recursive: true, force: true });
process.stdout.write(
  `Playwright interaction-fuzz lane passed ${report.summary.passedProjects}/${report.summary.expectedProjects} profiles with ${report.summary.browserActionExecutions} seeded native actions. Diagnostic only; no certification claim.\n`,
);
