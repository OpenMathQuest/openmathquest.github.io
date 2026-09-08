import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { observePlaywrightServer, waitForPlaywrightServer, waitForPlaywrightServerExit, waitForPlaywrightResult } from "../lib/playwright-server-lifecycle.mjs";

const expected = Object.freeze({ schemaVersion: 1, identity: "math-quest-local-server:v2", release: "fixture",
  port: 8771, rootId: "a".repeat(64), servedPayloadSha256: "b".repeat(64) });
const healthy = Object.freeze({ reachable: true, valid: true, reason: null });
const unreachable = Object.freeze({ reachable: false, valid: false, reason: "unreachable" });

test("the health probe uses only the fixed loopback endpoint and exact server identity", async () => {
  let calls = 0;
  const result = await observePlaywrightServer(expected, async (url, options) => {
    calls += 1;
    assert.equal(url, "http://127.0.0.1:8771/__math_quest_health__");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ ...expected }) };
  });
  assert.deepEqual(result, healthy);
  assert.equal(calls, 1);
  for (const field of ["rootId", "servedPayloadSha256"]) {
    const changed = await observePlaywrightServer(expected, async () => ({ ok: true, json: async () => ({ ...expected, [field]: "wrong" }) }));
    assert.deepEqual(changed, { reachable: true, valid: false, reason: "identity mismatch" });
  }
});

test("HTTP, transport, and malformed JSON failures preserve the existing classifications", async () => {
  const http = await observePlaywrightServer(expected, async () => ({ ok: false, status: 503, json: () => assert.fail("not read on HTTP failure") }));
  assert.deepEqual(http, { reachable: true, valid: false, reason: "HTTP 503" });
  assert.deepEqual(await observePlaywrightServer(expected, async () => { throw new Error("connection failed"); }), unreachable);
  assert.deepEqual(await observePlaywrightServer(expected, async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } })), unreachable);
});

test("readiness accepts a matching server first and rejects reachable foreign servers", async () => {
  await waitForPlaywrightServer({ exitCode: 0, signalCode: null }, async () => healthy);
  await assert.rejects(waitForPlaywrightServer(null, async () => ({ reachable: true, valid: false, reason: "identity mismatch" })), /unexpected server.*identity mismatch/u);
});

test("readiness reports an exited owned process and preserves the deadline failure", async () => {
  for (const state of [{ exitCode: 7, signalCode: null }, { exitCode: null, signalCode: "SIGTERM" }]) {
    await assert.rejects(waitForPlaywrightServer(state, async () => unreachable), /exited with status (7|SIGTERM)/u);
  }
  await assert.rejects(waitForPlaywrightServer(null, async () => assert.fail("expired before probing"), 0), /within 20 seconds/u);
});

test("readiness polls again after an unreachable response", async () => {
  let calls = 0;
  await waitForPlaywrightServer(null, async () => ++calls === 1 ? unreachable : healthy);
  assert.equal(calls, 2);
});

function runningChild() {
  return Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill: () => assert.fail("waiting must not kill a process") });
}

test("exit waiting handles absent, exited, and newly exiting children without killing them", async () => {
  await waitForPlaywrightServerExit(null);
  await waitForPlaywrightServerExit({ exitCode: 0, signalCode: null, once: () => assert.fail("already exited") });
  const child = runningChild();
  const waiting = waitForPlaywrightServerExit(child);
  child.exitCode = 0;
  child.emit("exit", 0);
  await waiting;
  assert.equal(child.listenerCount("exit"), 0);
});

test("exit waiting times out without declaring a still-live child stopped", async () => {
  const child = runningChild();
  await waitForPlaywrightServerExit(child, 1);
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, null);
  child.removeAllListeners();
});

test("all three browser runners use the shared helpers and retain local server ownership", async () => {
  for (const name of ["focused", "deep-ux-census", "interaction-fuzz"]) {
    const source = await readFile(new URL(`../run-playwright-${name}.mjs`, import.meta.url), "utf8");
    assert.match(source, /from "\.\/lib\/playwright-server-lifecycle\.mjs"/u);
    assert.match(source, /waitForPlaywrightServer\(ownedServer, observedHealth\)/u);
    assert.match(source, /if \(playwrightChildProcessRunning\(ownedServer\)\) ownedServer\.kill\(\)/u);
    assert.doesNotMatch(source, /async function (?:observedHealth|waitForHealth|waitForExit)\(/u);
    assert.ok(source.includes("await waitForPlaywrightResult(child)"), `${name} must use shared process-result handling`);
  }
});

test("runner completion preserves exit codes and treats absent status as failure", async () => {
  for (const code of [0, 7, null, undefined]) {
    const child = runningChild();
    const result = waitForPlaywrightResult(child);
    child.emit("exit", code, null);
    assert.equal(await result, code ?? 1);
  }
});

test("runner completion rejects signals and preserves the original process error", async () => {
  const signalled = runningChild();
  const signalResult = waitForPlaywrightResult(signalled);
  signalled.emit("exit", null, "SIGTERM");
  await assert.rejects(signalResult, /Playwright Test ended with signal SIGTERM\./u);
  const failed = runningChild();
  const errorResult = waitForPlaywrightResult(failed);
  const error = new Error("cannot spawn runner");
  failed.emit("error", error);
  await assert.rejects(errorResult, (actual) => actual === error);
});

test("health requests retain the exact one-second abort deadline", async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  await observePlaywrightServer(expected, async () => ({ ok: true, json: async () => expected }));
  assert.deepEqual(deadlines, [1_000]);
});

test("readiness retains the exact twenty-second default boundary", async (t) => {
  let times = [0, 19_999];
  t.mock.method(Date, "now", () => times.shift());
  let probes = 0;
  await waitForPlaywrightServer(null, async () => { probes += 1; return healthy; });
  assert.equal(probes, 1);
  times = [0, 20_000];
  await assert.rejects(waitForPlaywrightServer(null, async () => assert.fail("expired before probing")), /within 20 seconds/u);
});

test("poll and exit timers retain their defaults and the exit timer is cleared", async (t) => {
  const delays = [];
  const cleared = [];
  t.mock.method(globalThis, "setTimeout", (callback, milliseconds) => {
    delays.push(milliseconds);
    queueMicrotask(callback);
    return delays.length;
  });
  t.mock.method(globalThis, "clearTimeout", (timer) => { cleared.push(timer); });
  let probes = 0;
  await waitForPlaywrightServer(null, async () => ++probes === 1 ? unreachable : healthy);
  const child = runningChild();
  await waitForPlaywrightServerExit(child);
  assert.deepEqual(delays, [200, 5_000]);
  assert.deepEqual(cleared, [2]);
  child.removeAllListeners();
});
