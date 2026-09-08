import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createHtmlSourceExtractor } from "./source-extraction.mjs";
import {
  AUDIT_COMPLETION_EXPRESSION, AUDIT_SERVED_RELATIVE_PATHS, BROWSER_AUDIT_SHARDS, BROWSER_AUDIT_TIMING,
  EXPECTED_BROWSER_RESULT_IDS, browserLaunchArgs, requestBrowserClose,
  serveWorkspace, validateBrowserAuditPayload, waitForBrowserCleanup, waitForAuditPageCompletion,
} from "../lib/browser-smoke.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const htmlFunction = (source, name) => createHtmlSourceExtractor(source).functionDeclaration(name);

const validPayload = () => ({
  completed: true,
  generatedAt: "2026-07-30T12:00:00.000Z",
  shard: "all",
  results: EXPECTED_BROWSER_RESULT_IDS.map((id) => ({
    id,
    title: `Result ${id}`,
    status: "PASS",
    details: "",
  })),
  fail: 0,
  skipped: 0,
});

function watchdogFrame(watchdogEffects) {
  const activeApp = {
    getAttribute(name) {
      return name === "aria-busy" ? "true" : null;
    },
    childElementCount: 7,
  };
  return {
    title: "active scenario",
    isConnected: true,
    getAttribute(name) {
      return name === "src" ? "index.html?browser-audit=active" : null;
    },
    contentDocument: {
      readyState: "complete",
      getElementById(id) {
        return id === "app" ? activeApp : null;
      },
    },
    remove() {
      watchdogEffects.push("remove");
    },
  };
}

function createWatchdogFixture(browserAudit) {
  const watchdogEffects = [];
  let watchdogCallback = null;
  const activeFrame = watchdogFrame(watchdogEffects);
  const primaryFrame = { src: "index.html" };
  const armBrowserAuditWatchdog = vm.runInNewContext(
    `(${htmlFunction(browserAudit, "armBrowserAuditWatchdog")})`,
    {
      AUDIT_WATCHDOG_MS: BROWSER_AUDIT_TIMING.inPageWatchdogMs,
      auditFinalized: false,
      auditProgressMarker: "scenario:mq121-horizontal-containment-help:ready",
      results: [{ id: "BR-01" }],
      document: {
        querySelectorAll(selector) {
          assert.equal(selector, "iframe");
          return [activeFrame];
        },
      },
      add(id, title, pass, details) {
        watchdogEffects.push({
          id,
          title,
          pass,
          details: JSON.parse(JSON.stringify(details)),
        });
      },
      iframe: primaryFrame,
      restoreOriginalStorage() {
        watchdogEffects.push("restore");
      },
      renderResults() {
        watchdogEffects.push("render");
      },
      setTimeout(callback, delay) {
        watchdogCallback = callback;
        assert.equal(delay, BROWSER_AUDIT_TIMING.inPageWatchdogMs);
        return 91;
      },
    },
  );
  return { watchdogEffects, activeFrame, primaryFrame, armBrowserAuditWatchdog, callback: () => watchdogCallback };
}

test("hosted browser audit uses bounded real-time CDP completion and preserves workflow headroom", async () => {
  const workflow = await readFile(path.join(root, ".github", "workflows", "audit.yml"), "utf8");
  const releaseJob = workflow.split(/^  full-audit:\s*$/mu)[1] || "";
  const workflowTimeout = Number(releaseJob.match(/^\s*timeout-minutes:\s*(\d+)\s*$/mu)?.[1]);
  assert.equal(
    workflowTimeout,
    BROWSER_AUDIT_TIMING.workflowTimeoutMinutes,
    "the code policy and hosted workflow must share one reviewed job ceiling",
  );
  assert.equal(
    BROWSER_AUDIT_TIMING.inPageWatchdogMs,
    2_280_000,
    "the page must retain the owner-approved doubled 38-minute real-time watchdog",
  );
  assert.equal(
    BROWSER_AUDIT_TIMING.wallTimeoutMs,
    2_400_000,
    "the installed-browser controller must retain the doubled 40-minute fail-closed wall ceiling",
  );
  assert.ok(
    BROWSER_AUDIT_TIMING.wallTimeoutMs
      - BROWSER_AUDIT_TIMING.inPageWatchdogMs >= 120_000,
    "the fail-closed in-page watchdog must retain at least two real minutes for CDP serialization and shutdown",
  );
  assert.ok(
    BROWSER_AUDIT_TIMING.wallTimeoutMs
      + BROWSER_AUDIT_TIMING.requiredWorkflowHeadroomMs
      <= workflowTimeout * 60_000,
    "the browser wall limit must preserve reviewed setup, reporting, and artifact-upload headroom",
  );

});

test("browser launch uses isolated loopback CDP without virtual-time shortcuts", () => {
  const profile = "C:\\audit\\isolated-profile";
  const url = "http://127.0.0.1:8771/audit.html?autorun=1";
  const args = browserLaunchArgs({ profile, url });
  assert.equal(args.some((argument) => argument.startsWith("--virtual-time-budget=")), false);
  assert.equal(args.includes("--dump-dom"), false);
  assert.equal(args.includes("--remote-debugging-address=127.0.0.1"), true);
  assert.equal(args.includes("--remote-debugging-port=0"), true);
  assert.equal(args.includes(`--user-data-dir=${profile}`), true);
  assert.equal(
    args.includes("--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1"),
    true,
  );
  for (const argument of [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ]) {
    assert.equal(args.includes(argument), true, argument);
  }
  assert.equal(args.at(-1), url);

});

test("CDP completion tolerates an absent root and requires the exact terminal marker", () => {
  assert.equal(
    vm.runInNewContext(AUDIT_COMPLETION_EXPRESSION, { document: { documentElement: null } }),
    false,
    "the CDP completion probe must treat a transient document without a root as incomplete instead of throwing",
  );
  assert.equal(
    vm.runInNewContext(AUDIT_COMPLETION_EXPRESSION, {
      document: { documentElement: { dataset: { auditComplete: "true" } } },
    }),
    true,
    "the same completion probe must still recognize the exact terminal marker",
  );

});

test("browser cleanup preserves its reviewed grace period", async () => {
  const cleanupWaits = [];
  await waitForBrowserCleanup(new Promise(() => {}), {
    remainingMs: () => BROWSER_AUDIT_TIMING.wallTimeoutMs,
    wait: async (delay) => { cleanupWaits.push(delay); },
  });
  assert.deepEqual(
    cleanupWaits,
    [BROWSER_AUDIT_TIMING.browserCloseGraceMs],
    "a CDP/control failure must bound browser-tree cleanup to the reviewed grace period rather than the remaining wall deadline",
  );

});

test("browser completion polling preserves order and its wall deadline", async () => {
  let completionClock = 0;
  const completionEffects = [];
  const completion = await waitForAuditPageCompletion({
    timeoutMs: 1_000,
    pollIntervalMs: 250,
    now: () => completionClock,
    evaluate: async () => {
      completionEffects.push(`evaluate:${completionClock}`);
      return completionClock === 500;
    },
    wait: async (delay) => {
      completionEffects.push(`wait:${delay}`);
      completionClock += delay;
    },
  });
  assert.deepEqual(completion, { polls: 3, elapsedMs: 500 });
  assert.deepEqual(completionEffects, [
    "evaluate:0",
    "wait:250",
    "evaluate:250",
    "wait:250",
    "evaluate:500",
  ]);
  let timeoutClock = 0;
  await assert.rejects(
    waitForAuditPageCompletion({
      timeoutMs: 1_000,
      pollIntervalMs: 250,
      now: () => timeoutClock,
      evaluate: async () => false,
      wait: async (delay) => { timeoutClock += delay; },
    }),
    /did not report completion within 1000 ms/u,
  );
  assert.equal(timeoutClock, 1_000);

});

test("the in-page watchdog reports failure and restores the original page", async () => {
  const browserAudit = await readFile(path.join(root, "audit.html"), "utf8");
  const watchdogLiteral = browserAudit.match(/const AUDIT_WATCHDOG_MS = ([\d_]+);/u)?.[1];
  assert.equal(
    Number(String(watchdogLiteral).replaceAll("_", "")),
    BROWSER_AUDIT_TIMING.inPageWatchdogMs,
    "the browser page and installed-browser runner must share one watchdog policy",
  );
  const { watchdogEffects, activeFrame, primaryFrame, armBrowserAuditWatchdog, callback } = createWatchdogFixture(browserAudit);
  assert.equal(armBrowserAuditWatchdog([activeFrame]), 91);
  assert.equal(typeof callback(), "function");
  callback()();
  assert.equal(primaryFrame.src, "about:blank");
  assert.deepEqual(
    watchdogEffects,
    [
      {
        id: "BR-00",
        title: "Browser harness completes",
        pass: false,
        details: {
          reason: "The whole-run real-time watchdog expired before the audit completed.",
          watchdogMs: BROWSER_AUDIT_TIMING.inPageWatchdogMs,
          completedResults: 1,
          progressMarker: "scenario:mq121-horizontal-containment-help:ready",
          activeFrames: [{
            title: "active scenario",
            src: "index.html?browser-audit=active",
            connected: true,
            documentReadyState: "complete",
            appBusy: "true",
            appChildren: 7,
          }],
        },
      },
      "remove",
      "restore",
      "render",
    ],
  );
});

test("browser close and result reconciliation fail closed under hangs and malformed payloads", async () => {
  let closeCalls = 0;
  const startedAt = Date.now();
  const close = await requestBrowserClose("ws://127.0.0.1:1/devtools/browser/test", {
    timeoutMs: 25,
    connect: async () => ({
      send: async () => new Promise(() => {}),
      close() { closeCalls += 1; },
    }),
  });
  assert.equal(close.requested, true);
  assert.match(close.error, /Browser\.close exceeded 25 ms/u);
  assert.equal(closeCalls, 1, "the timed-out CDP client is closed exactly once");
  assert.ok(Date.now() - startedAt < 1_000, "a nonresponsive Browser.close cannot hang the runner");

});

test("browser shards exactly partition the closed result oracle", () => {
  assert.equal(EXPECTED_BROWSER_RESULT_IDS.length, 72);
  assert.equal(validateBrowserAuditPayload(validPayload()).valid, true);
  const shardIds = Object.values(BROWSER_AUDIT_SHARDS).flat();
  assert.equal(new Set(shardIds).size, 72, "browser shard ids must not overlap");
  assert.deepEqual(new Set(shardIds), new Set(EXPECTED_BROWSER_RESULT_IDS), "browser shards must exactly partition the closed oracle");
  for (const [shard, ids] of Object.entries(BROWSER_AUDIT_SHARDS)) {
    const payload = {
      ...validPayload(),
      shard,
      results: validPayload().results.filter((result) => ids.includes(result.id)),
    };
    assert.equal(validateBrowserAuditPayload(payload, { shard }).valid, true, shard);
    assert.equal(validateBrowserAuditPayload({ ...payload, shard: "all" }, { shard }).valid, false, `${shard} identity is bound`);
  }

});

test("browser payload reconciliation rejects malformed or contradictory results", async (t) => {
  const rejects = async (name, mutate, expected) => t.test(name, () => {
    const payload = validPayload();
    mutate(payload);
    const validation = validateBrowserAuditPayload(payload);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join("\n"), expected);
  });
  await rejects(
    "duplicate id",
    (payload) => { payload.results[1].id = payload.results[0].id; },
    /duplicated|missing/u,
  );
  await rejects(
    "missing result",
    (payload) => { payload.results.pop(); },
    /missing|count/u,
  );
  await rejects(
    "unknown id",
    (payload) => { payload.results[0].id = "BR-99"; },
    /unknown|missing/u,
  );
  await rejects(
    "malformed result field",
    (payload) => { payload.results[0].surprise = true; },
    /closed result schema/u,
  );
  await rejects(
    "unsupported status",
    (payload) => { payload.results[0].status = "SKIP"; },
    /invalid status/u,
  );
  await rejects(
    "fabricated aggregate",
    (payload) => {
      payload.results[0].status = "FAIL";
      payload.fail = 0;
    },
    /fail count/u,
  );
  await rejects(
    "unknown payload field",
    (payload) => { payload.surprise = true; },
    /closed result schema/u,
  );
});


function listenForBrowserTest(server) {
  return new Promise(function listening(resolve, reject) {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function closeBrowserTestServer(server) {
  return new Promise(function closed(resolve) { server.close(resolve); });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("the real browser-smoke server emits the verified legal-document MIME types", async () => {
  const requests = [];
  const server = serveWorkspace(root, requests);
  try {
    await listenForBrowserTest(server);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    for (const documentPath of ["/PRIVACY.md", "/THIRD_PARTY_NOTICES.md"]) {
      const response = await fetch(`${origin}${documentPath}`);
      assert.equal(response.status, 200, documentPath);
      assert.equal(
        String(response.headers.get("content-type")).split(";", 1)[0],
        "text/markdown",
        documentPath,
      );
      const expected = await readFile(path.join(root, documentPath.slice(1)));
      assert.equal(
        sha256(Buffer.from(await response.arrayBuffer())),
        sha256(expected),
        documentPath,
      );
    }
    assert.deepEqual(
      requests.map((request) => request.pathname),
      ["/PRIVACY.md", "/THIRD_PARTY_NOTICES.md"],
    );
  } finally {
    if (server.listening) {
      await closeBrowserTestServer(server);
    }
  }
});

test("every expected static browser-audit request is a real 200 response", async () => {
  const requests = [];
  const server = serveWorkspace(root, requests);
  try {
    await listenForBrowserTest(server);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    await assertEntryScriptsServed();
    for (const relative of AUDIT_SERVED_RELATIVE_PATHS) {
      await assertServedAuditPath(origin, relative);
    }
    const absentFavicon = await fetch(`${origin}/favicon.ico`);
    assert.equal(absentFavicon.status, 204);
  } finally {
    if (server.listening) await closeBrowserTestServer(server);
  }
});

async function assertEntryScriptsServed() {
  const allowed = new Set(AUDIT_SERVED_RELATIVE_PATHS);
  for (const entry of ["index.html", "audit.html"]) {
    const page = await readFile(path.join(root, entry), "utf8");
    for (const match of page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu)) {
      const url = new URL(match[1], `http://127.0.0.1/${entry}`);
      assert.equal(url.hostname, "127.0.0.1");
      assert.equal(allowed.has(url.pathname.slice(1)), true, `${entry} script ${match[1]} must be served by the audit`);
    }
  }
}

async function assertServedAuditPath(origin, relative) {
  const response = await fetch(`${origin}/${relative}`);
  assert.equal(response.status, 200, relative);
  const contentType = response.headers.get("content-type");
  assert.ok(contentType, relative);
  if (/\.m?js$/u.test(relative)) assert.match(contentType, /^text\/javascript(?:;|$)/u, relative);
}
