import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { roundMs } from "./audit-lane-contract.mjs";

const wait = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function processTreeCleanupVerified({ treeTerminationSucceeded, parentAlive } = {}) {
  return treeTerminationSucceeded === true && parentAlive === false;
}

function terminateWindowsTree(pid) {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const killed = spawnSync(path.join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 5_000,
  });
  const treeTerminationSucceeded = killed.status === 0 && !killed.signal && !killed.error;
  const taskkillDetail = `${killed.stdout || ""} ${killed.stderr || ""}`.trim().replace(/\s+/gu, " ").slice(-1_000);
  const detail = `taskkill status=${String(killed.status)} signal=${String(killed.signal || "none")}${taskkillDetail ? ` output=${taskkillDetail}` : ""}`;
  return { treeTerminationSucceeded, detail };
}

function terminatePosixTree(child) {
  try {
    process.kill(-child.pid, "SIGKILL");
    return { treeTerminationSucceeded: true, detail: "SIGKILL sent to process group" };
  } catch {
    try { child.kill("SIGKILL"); } catch {}
    return { treeTerminationSucceeded: false, detail: "SIGKILL sent to direct process" };
  }
}

async function terminateProcessTree(child, closePromise, graceMs = 2_000) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    return { attempted: false, cleanupVerified: true, detail: "process did not start" };
  }
  const { treeTerminationSucceeded, detail } = process.platform === "win32"
    ? terminateWindowsTree(child.pid) : terminatePosixTree(child);
  if (processExists(child.pid)) await Promise.race([closePromise, wait(graceMs)]);
  if (processExists(child.pid)) {
    try { child.kill("SIGKILL"); } catch {}
    await Promise.race([closePromise, wait(1_000)]);
  }
  const parentAlive = processExists(child.pid);
  return {
    attempted: true,
    cleanupVerified: processTreeCleanupVerified({ treeTerminationSucceeded, parentAlive }),
    detail,
    treeTerminationSucceeded,
  };
}

function observeChildOutput(child, maximumOutputBytes) {
  const output = { stdout: "", stderr: "", spawnError: null };
  let outputBytes = 0;
  let terminationRequested = false;
  let requestTermination;
  const terminationPromise = new Promise((resolve) => { requestTermination = resolve; });
  const triggerTermination = (record) => {
    if (terminationRequested) return;
    terminationRequested = true;
    requestTermination(record);
  };
  const append = (current, chunk) => {
    const text = String(chunk);
    outputBytes += Buffer.byteLength(text, "utf8");
    if (outputBytes > maximumOutputBytes) {
      triggerTermination({ kind: "OUTPUT_LIMIT", message: `process output exceeded ${maximumOutputBytes} bytes` });
    }
    return `${current}${text}`.slice(-maximumOutputBytes);
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => { output.stdout = append(output.stdout, chunk); });
  child.stderr?.on("data", (chunk) => { output.stderr = append(output.stderr, chunk); });
  child.once("error", (error) => { output.spawnError = error; });
  return { output, triggerTermination, terminationPromise };
}

async function settleChild(child, closePromise, first, output) {
  let cleanup = { attempted: false, cleanupVerified: null, detail: "not required" };
  let closed = first.closed ?? null;
  if (first.kind !== "CLOSED") {
    cleanup = await terminateProcessTree(child, closePromise);
    closed ??= await Promise.race([closePromise, wait(100).then(() => ({ exitCode: null, signal: null }))]);
  } else if (output.spawnError || first.closed.exitCode !== 0 || first.closed.signal) {
    cleanup = await terminateProcessTree(child, closePromise);
  }
  return { cleanup, closed };
}

function supervisedProcessResult(output, first, closed, cleanup, startedAt) {
  return {
    stdout: output.stdout,
    stderr: output.stderr,
    exitCode: closed?.exitCode ?? null,
    signal: closed?.signal ?? null,
    spawnError: output.spawnError ? String(output.spawnError.stack || output.spawnError) : null,
    timedOut: first.kind === "TIMEOUT",
    outputOverflow: first.kind === "OUTPUT_LIMIT",
    cleanupVerified: cleanup.cleanupVerified,
    cleanupDetail: cleanup.detail,
    durationMs: roundMs(performance.now() - startedAt),
  };
}

export async function runTreeSupervisedProcess({
  args = [], command, cwd, env = process.env,
  maximumOutputBytes = 32 * 1024 * 1024, timeoutMs,
} = {}) {
  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { output, triggerTermination, terminationPromise } = observeChildOutput(child, maximumOutputBytes);
  const closePromise = new Promise((resolve) => {
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const timer = setTimeout(() => triggerTermination({ kind: "TIMEOUT", message: `process exceeded ${timeoutMs} ms` }), timeoutMs);
  const first = await Promise.race([
    closePromise.then((closed) => ({ kind: "CLOSED", closed })),
    terminationPromise,
  ]);
  clearTimeout(timer);
  const { cleanup, closed } = await settleChild(child, closePromise, first, output);
  return supervisedProcessResult(output, first, closed, cleanup, startedAt);
}
