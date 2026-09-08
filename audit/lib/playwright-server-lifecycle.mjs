import { playwrightChildProcessRunning, playwrightFocusedServerIdentityMatches } from "./playwright-focused-contract.mjs";

const healthUrl = "http://127.0.0.1:8771/__math_quest_health__";

export async function observePlaywrightServer(expectedHealth, fetchResponse = fetch) {
  try {
    const response = await fetchResponse(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return { reachable: true, valid: false, reason: `HTTP ${response.status}` };
    const value = await response.json();
    const valid = playwrightFocusedServerIdentityMatches(value, expectedHealth);
    return { reachable: true, valid, reason: valid ? null : "identity mismatch" };
  } catch {
    return { reachable: false, valid: false, reason: "unreachable" };
  }
}

export async function waitForPlaywrightServer(server, observeHealth, deadlineMs = 20_000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const health = await observeHealth();
    if (health.valid) return;
    if (health.reachable) throw new Error(`Port 8771 answered with an unexpected server (${health.reason}).`);
    if (server && !playwrightChildProcessRunning(server)) throw new Error(`Math Quest test server exited with status ${server.exitCode ?? server.signalCode}.`);
    await new Promise((resolve) => { setTimeout(resolve, 200); });
  }
  throw new Error("Math Quest test server did not become healthy within 20 seconds.");
}

export async function waitForPlaywrightServerExit(child, timeoutMs = 5_000) {
  if (!playwrightChildProcessRunning(child)) return;
  let timer;
  const exited = new Promise((resolve) => { child.once("exit", resolve); });
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  await Promise.race([exited, timeout]);
  clearTimeout(timer);
}

export function waitForPlaywrightResult(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => signal ? reject(new Error(`Playwright Test ended with signal ${signal}.`)) : resolve(code ?? 1));
  });
}
