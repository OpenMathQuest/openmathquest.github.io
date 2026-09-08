import assert from "node:assert/strict";
import { assertRightsInputBindings } from "./rights-state-fixture.mjs";
import { validEvidence } from "./canary-evidence-fixture.mjs";
import { execFile as execFileCallback } from "node:child_process";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  activateCanaryHomeUpdate,
  beta1GradedSelectionAnswer,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  LOOPBACK_LISTENER_QUERY_SCRIPT,
  RETAINED_BETA1_FRESH_START_NOTICE,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT,
  canaryBrowserArguments,
  canaryBackendRequestViolation,
  canaryRequestHeaderFlags,
  canaryWaitingCacheReady,
  exactCandidateCacheObservation,
  canaryChildExitSucceeded,
  canaryWorkspaceRemovalAllowed,
  canonicalCertificateThumbprint,
  canonicalCanaryEvidence,
  loopbackListenerProbeInvocation,
  observeCanaryRetainedFreshStartNotice,
  openCanaryInstallHelp,
  parseTrustedHttpsCanaryEvidence,
  profileProcessSetSha256,
  reloadCanaryCandidateFromBeta1,
  runCanaryTeardown,
  snapshotSha256,
  trustedTlsInspectionScript,
  validateCanaryBrowserArguments,
  validateCanaryBrowserTlsSecurity,
  validateCanaryRootScopeProof,
  waitForCanaryHomeUpdate,
  waitForExactLoopbackListener,
} from "../lib/trusted-https-canary.mjs";
import {
  buildTrustedHttpsCanarySupplyChainInput,
  trustedHttpsCanaryRunnerText,
  TRUSTED_HTTPS_CANARY_SUPPLY_CHAIN_INPUT_PATHS,
  trustedHttpsCanarySupplyChainFindings,
  trustedHttpsCanarySupplyChainMutationFailures,
} from "../lib/trusted-https-canary-supply-chain.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const sha = (character) => character.repeat(64);
const candidateSha = "1".repeat(40);
const execFile = promisify(execFileCallback);

async function trustedHttpsCanarySupplyChainTestInput() {
  const pairs = await Promise.all(
    TRUSTED_HTTPS_CANARY_SUPPLY_CHAIN_INPUT_PATHS.map(async ([, relativePath]) => [relativePath, await read(relativePath)]),
  );
  const texts = new Map(pairs);
  return buildTrustedHttpsCanarySupplyChainInput((relativePath) => texts.get(relativePath));
}

test("canonical trusted-HTTPS evidence accepts only the exact reconciled candidate", () => {
  const evidence = validEvidence();
  assert.equal(TRUSTED_HTTPS_CANARY_CHECK_IDS.some((id) => id.includes("BETA4")), false,
    "current candidate evidence must not carry a stale Beta 4 check identity");
  const parsed = parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence), {
    candidateSha,
    runnerImageOS: "win25",
    runnerImageVersion: "20260801.1",
    requireReconciled: true,
  });
  assert.equal(parsed.valid, true, parsed.issues.join("; "));

  const mutations = [
    ["candidate binding", (value) => { value.candidateSha = "2".repeat(40); }],
    ["Beta 1 identity", (value) => { value.beta1Identity.commitSha = "2".repeat(40); }],
    ["Caddy pin", (value) => { value.toolchain.caddyArchiveSha256 = sha("0"); }],
    ["Playwright pin", (value) => { value.toolchain.playwrightCoreSri = "sha512-forged"; }],
    ["trusted browser", (value) => { value.browser.productName = "Chromium"; }],
    ["request isolation", (value) => { value.privacy.externalRequestCount = 1; }],
    ["response headers", (value) => { value.networkProof.responseHeaderSetSha256 = null; }],
    ["exact cache set", (value) => { value.cacheProof.offlineSetSha256 = sha("0"); }],
    ["cold service-worker response", (value) => { value.offlineProof.responseFromServiceWorker = false; }],
    ["instrumented navigation", (value) => { value.navigationProof.observedReloadCount = 0; }],
    ["fresh-state byte identity", (value) => { value.progress.expectedFreshSha256 = sha("0"); }],
    ["fresh-state projection separation", (value) => { value.progress.freshProjectionSha256 = value.progress.retiredProjectionSha256; }],
    ["retained marker", (value) => { value.progress.retainedMarkerSha256 = sha("0"); }],
    ["retained fresh-start notice", (value) => { value.progress.retainedNoticeSha256 = sha("0"); }],
    ["certificate absence", (value) => { value.teardown.remainingMatchingCertificateCount = 1; }],
    ["lingering profile process", (value) => { value.teardown.remainingProfileProcessCount = 1; }],
    ["forged empty process set", (value) => { value.teardown.remainingProfileProcessSetSha256 = sha("0"); }],
    ["retired progress witness", (value) => { value.progress.sourcePracticeCount = 2; }],
    ["fresh progress witness", (value) => { value.progress.protectedEarnedLevel = 2; }],
    ["check order", (value) => { [value.checks[0], value.checks[1]] = [value.checks[1], value.checks[0]]; }],
    ["green check", (value) => { value.checks[5].status = "FAIL"; }],
    ["complete teardown", (value) => { value.teardown.profileRemoved = false; }],
    ["closed schema", (value) => { value.unreviewed = true; }],
  ];
  for (const [label, mutate] of mutations) {
    const mutant = structuredClone(evidence);
    mutate(mutant);
    const result = parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(mutant), { candidateSha, requireReconciled: true });
    assert.equal(result.valid, false, label);
  }
  assert.equal(parseTrustedHttpsCanaryEvidence(`${canonicalCanaryEvidence(evidence)}\n`).valid, false, "extra newline");
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence).replaceAll("\n", "\r\n")).valid, false, "CRLF");
  assert.equal(parseTrustedHttpsCanaryEvidence(`${JSON.stringify(evidence, null, 2)}\n`).valid, false, "pretty JSON");
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence), { workflowRunId: "999" }).valid, false, "stale workflow run");
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence), { workflowRunAttempt: "2" }).valid, false, "stale workflow attempt");
});

test("[NC-CANARY-CONTINUE_ERROR_CANNOT_GREEN] FAILED canary evidence cannot disguise an all-green result", () => {
  const evidence = validEvidence();
  evidence.reconciliationState = "FAILED";
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence)).valid, false);
  evidence.checks[8].status = "FAIL";
  evidence.checks[8].detail = "Injected activation failure.";
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence)).valid, true);
});

test("early FAILED evidence records unknown observations as null instead of invented pass-like defaults", () => {
  const evidence = validEvidence();
  evidence.reconciliationState = "FAILED";
  for (const key of Object.keys(evidence.runtimeIdentity)) evidence.runtimeIdentity[key] = null;
  evidence.origin.port = null;
  evidence.origin.scope = null;
  evidence.toolchain.caddyExecutableSha256 = null;
  evidence.browser = { productName: null, fullVersion: null, executableSha256: null };
  evidence.certificate = { rootSha256: null, leafSha256: null, subjectName: null, issuer: null, validFromUnix: null, validToUnix: null };
  evidence.tlsProtocol = null;
  for (const key of Object.keys(evidence.networkProof)) evidence.networkProof[key] = null;
  for (const key of Object.keys(evidence.cacheProof)) evidence.cacheProof[key] = null;
  for (const key of Object.keys(evidence.offlineProof)) evidence.offlineProof[key] = null;
  for (const key of Object.keys(evidence.navigationProof)) evidence.navigationProof[key] = null;
  for (const key of Object.keys(evidence.privacy).slice(4)) evidence.privacy[key] = null;
  for (const key of Object.keys(evidence.progress).slice(2)) evidence.progress[key] = null;
  evidence.checks = TRUSTED_HTTPS_CANARY_CHECK_IDS.map((id) => ({ id, status: "NOT_RUN", detail: `No observation for ${id}.` }));
  evidence.checks.at(-1).status = "FAIL";
  evidence.teardown = {
    status: "FAIL",
    browserClosed: false,
    caddyStopped: false,
    backendStopped: false,
    certificateRemoved: false,
    profileRemoved: false,
    temporaryFilesRemoved: false,
    portClosed: false,
    certificateThumbprint: null,
    remainingMatchingCertificateCount: null,
    observedProfileProcessCount: null,
    observedProfileProcessSetSha256: null,
    remainingProfileProcessCount: null,
    remainingProfileProcessSetSha256: null,
  };
  const parsed = parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence));
  assert.equal(parsed.valid, true, parsed.issues.join("; "));

  evidence.teardown.status = "PASS";
  evidence.checks.at(-1).status = "PASS";
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence)).valid, false, "a claimed PASS cannot replace cleanup facts");

  evidence.teardown = {
    ...evidence.teardown,
    status: "PASS",
    browserClosed: true,
    caddyStopped: true,
    backendStopped: true,
    certificateRemoved: true,
    profileRemoved: true,
    temporaryFilesRemoved: true,
    portClosed: true,
    certificateThumbprint: "1".repeat(40),
    remainingMatchingCertificateCount: 0,
    remainingProfileProcessCount: 0,
    remainingProfileProcessSetSha256: EMPTY_PROFILE_PROCESS_SET_SHA256,
  };
  evidence.checks.at(-1).status = "PASS";
  assert.equal(parseTrustedHttpsCanaryEvidence(canonicalCanaryEvidence(evidence)).valid, true, "successful early cleanup remains truthful without inventing a browser observation");
});

test("profile-process identity and workspace removal fail closed while any exact-profile process remains", () => {
  const edge = {
    processId: 4123,
    executableSha256: sha("a"),
    commandLineSha256: sha("b"),
  };
  assert.equal(profileProcessSetSha256([]), EMPTY_PROFILE_PROCESS_SET_SHA256);
  assert.notEqual(profileProcessSetSha256([edge]), EMPTY_PROFILE_PROCESS_SET_SHA256);
  assert.equal(profileProcessSetSha256([edge]), profileProcessSetSha256([{ ...edge }]));
  assert.equal(canaryWorkspaceRemovalAllowed(0), true);
  for (const remaining of [1, 2, null, undefined, -1]) assert.equal(canaryWorkspaceRemovalAllowed(remaining), false, String(remaining));
  assert.throws(() => profileProcessSetSha256([{ ...edge, processId: 0 }]));
  assert.throws(() => profileProcessSetSha256([edge, edge]));
});

test("hosted Windows listener observation tolerates only transient no-match results", async () => {
  let attempts = 0;
  const observed = await waitForExactLoopbackListener({
    expectedPid: 4123,
    timeoutMs: 100,
    intervalMs: 0,
    probe: async () => {
      attempts += 1;
      return attempts < 3 ? [] : [{ LocalAddress: "127.0.0.1", OwningProcess: 4123 }];
    },
  });
  assert.equal(attempts, 3);
  assert.deepEqual(observed, [{ localAddress: "127.0.0.1", owningProcess: 4123 }]);

  for (const row of [
    { LocalAddress: "0.0.0.0", OwningProcess: 4123 },
    { LocalAddress: "127.0.0.1", OwningProcess: 9999 },
  ]) {
    await assert.rejects(
      waitForExactLoopbackListener({ expectedPid: 4123, timeoutMs: 100, intervalMs: 0, probe: async () => [row] }),
      /not owned exclusively by Caddy/u,
    );
  }

  const [runnerText] = await Promise.all([
    readCanaryRunnerSources(),
    read("audit/run-trusted-https-canary.ps1"),
  ]);
  assert.match(LOOPBACK_LISTENER_QUERY_SCRIPT, /CmdletizationQuery_NotFound/u);
  assert.match(runnerText, /waitForExactLoopbackListener/u);

  const parserScript = [
    "$tokens=$null",
    "$errors=$null",
    "[Management.Automation.Language.Parser]::ParseInput($env:MQ_LISTENER_QUERY_SCRIPT,[ref]$tokens,[ref]$errors) | Out-Null",
    "if ($errors.Count -ne 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
  ].join("\n");
  await execFile("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    parserScript,
  ], {
    windowsHide: true,
    env: { ...process.env, MQ_LISTENER_QUERY_SCRIPT: LOOPBACK_LISTENER_QUERY_SCRIPT },
  });

  const invocation = loopbackListenerProbeInvocation(52_409, process.env);
  assert.equal(invocation.command, "powershell.exe");
  assert.deepEqual(invocation.args, ["-NoProfile", "-NonInteractive", "-Command", LOOPBACK_LISTENER_QUERY_SCRIPT]);
  assert.equal(invocation.options.env.MQ_CANARY_LISTENER_PORT, "52409");
  const stub = [
    "function Get-NetTCPConnection {",
    "  param($State,$LocalPort,$ErrorAction)",
    "  [pscustomobject]@{ LocalAddress='127.0.0.1'; OwningProcess=[int]$LocalPort }",
    "}",
  ].join("\n");
  const { stdout } = await execFile(invocation.command, [
    ...invocation.args.slice(0, -1),
    `${stub}\n${invocation.args.at(-1)}`,
  ], { windowsHide: true, env: invocation.options.env });
  assert.deepEqual(JSON.parse(stdout), [{ LocalAddress: "127.0.0.1", OwningProcess: 52_409 }]);
});

test("Windows PowerShell computes the observed leaf certificate SHA-256 without newer runtime-only APIs", async () => {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$cert=[pscustomobject]@{RawData=[Text.Encoding]::UTF8.GetBytes('abc')}",
    ...WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT,
    "$sha",
  ].join(";");
  const { stdout } = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15_000 });
  assert.equal(stdout.trim(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.doesNotMatch(WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT.join("\n"), /HashData|ToHexString/u);
  assert.deepEqual(WINDOWS_POWERSHELL_CERTIFICATE_SHA256_SCRIPT.every((statement) => trustedTlsInspectionScript().includes(statement)), true, "the production TLS inspector uses every effect-tested hash statement");
  assert.doesNotMatch(trustedTlsInspectionScript(), /HashData|ToHexString/u);
});

test("SAN-only Caddy certificates retain independent localhost proof when Playwright has no informational common name", () => {
  const trustedTls = { subjectName: "localhost", issuer: "CN=Caddy Local Authority - ECC Intermediate", sha256: sha("a"), protocol: "Tls13" };
  const browserTls = { subjectName: "", issuer: "Caddy Local Authority", protocol: "TLS 1.3" };
  assert.equal(validateCanaryBrowserTlsSecurity(browserTls, trustedTls).valid, true);
  assert.equal(validateCanaryBrowserTlsSecurity({ ...browserTls, subjectName: "localhost", protocol: "TLS 1.2" }, { ...trustedTls, protocol: "Tls12" }).valid, true);
  const rejectedMutants = [
    [{ ...browserTls, subjectName: "example.invalid" }, trustedTls, "wrong browser common name"],
    [{ ...browserTls, issuer: "Example Authority" }, trustedTls, "wrong browser issuer"],
    [{ ...browserTls, issuer: "" }, trustedTls, "missing browser issuer"],
    [{ ...browserTls, protocol: "TLS 1.1" }, trustedTls, "wrong browser protocol"],
    [{ ...browserTls, protocol: undefined }, trustedTls, "missing browser protocol"],
    [browserTls, { ...trustedTls, subjectName: "" }, "missing independent localhost identity"],
    [browserTls, { ...trustedTls, issuer: "Example Authority" }, "wrong independent issuer"],
    [browserTls, { ...trustedTls, issuer: "" }, "missing independent issuer"],
    [browserTls, { ...trustedTls, sha256: "not-a-sha" }, "wrong independent leaf hash"],
    [browserTls, { ...trustedTls, sha256: "" }, "missing independent leaf hash"],
    [browserTls, { ...trustedTls, protocol: "Tls11" }, "wrong independent protocol"],
    [browserTls, { ...trustedTls, protocol: undefined }, "missing independent protocol"],
  ];
  for (const [browser, os, label] of rejectedMutants) {
    assert.equal(validateCanaryBrowserTlsSecurity(browser, os).valid, false, label);
  }
  assert.equal(validateCanaryBrowserTlsSecurity(null, trustedTls).valid, false);
});

test("root scope uses exact Git manifest bytes and rendered registration state without a CSP-blocked page fetch", () => {
  const proof = {
    manifest: { id: "./", start_url: "./", scope: "./" },
    manifestHref: "https://localhost:49152/manifest.webmanifest",
    workerScope: "https://localhost:49152/",
    origin: "https://localhost:49152/",
  };
  assert.equal(validateCanaryRootScopeProof(proof).valid, true);
  for (const mutant of [
    { manifest: { ...proof.manifest, id: "/other" } },
    { manifest: { ...proof.manifest, start_url: "/other" } },
    { manifest: { ...proof.manifest, scope: "/other" } },
    { manifestHref: "https://localhost:49152/other.webmanifest" },
    { workerScope: "https://localhost:49152/sub/" },
    { origin: "http://localhost:49152/", manifestHref: "http://localhost:49152/manifest.webmanifest", workerScope: "http://localhost:49152/" },
    { origin: "https://example.invalid:49152/", manifestHref: "https://example.invalid:49152/manifest.webmanifest", workerScope: "https://example.invalid:49152/" },
    { origin: "https://localhost:49152/sub/", manifestHref: "https://localhost:49152/sub/manifest.webmanifest", workerScope: "https://localhost:49152/sub/" },
    { origin: "https://localhost:49152/?query=1", manifestHref: "https://localhost:49152/manifest.webmanifest", workerScope: "https://localhost:49152/?query=1" },
    { origin: "https://localhost:49152/#fragment", manifestHref: "https://localhost:49152/manifest.webmanifest", workerScope: "https://localhost:49152/#fragment" },
    { origin: "not a URL", manifestHref: "", workerScope: "" },
  ]) assert.equal(validateCanaryRootScopeProof({ ...proof, ...mutant }).valid, false);
});

test("Beta 1 selection evidence submits the exact uniquely graded optionId", () => {
  const question = {
    inputClass: "SELECTION",
    options: [
      { optionId: "o0", label: "one", value: "1" },
      { optionId: "o1", label: "two", value: "2" },
      { optionId: "o2", label: "three", value: "3" },
    ],
  };
  const observed = [];
  const answer = beta1GradedSelectionAnswer(question, (gradedQuestion, response) => {
    observed.push({ gradedQuestion, response });
    return { correct: response.optionId === "o1" };
  });
  assert.deepEqual(answer, { optionId: "o1" });
  assert.equal(Object.isFrozen(answer), true);
  assert.deepEqual(observed.map((row) => row.response), [{ optionId: "o0" }, { optionId: "o1" }, { optionId: "o2" }]);
  assert.equal(observed.every((row) => row.gradedQuestion === question), true);
  assert.throws(() => beta1GradedSelectionAnswer(question, () => ({ correct: false })), /expected one independently graded correct option, found 0/u);
  assert.throws(() => beta1GradedSelectionAnswer(question, () => ({ correct: true })), /expected one independently graded correct option, found 3/u);
  assert.throws(() => beta1GradedSelectionAnswer({ ...question, options: [{ id: "o1", label: "legacy wrong field", value: "2" }] }, () => ({ correct: true })), /found 0/u);
});

test("browser launch arguments block external resolution and forbid TLS bypass", () => {
  const args = canaryBrowserArguments("C:\\runner-temp\\mq-profile");
  assert.equal(validateCanaryBrowserArguments(args).valid, true);
  for (const flag of [
    "--ignore-certificate-errors",
    "--allow-insecure-localhost",
    "--unsafely-treat-insecure-origin-as-secure=https://localhost:43123",
    "--no-sandbox",
  ]) {
    assert.equal(validateCanaryBrowserArguments([...args, flag]).valid, false, flag);
  }
  assert.equal(validateCanaryBrowserArguments(args.filter((item) => !item.startsWith("--host-resolver-rules="))).valid, false);
});

test("request privacy flags use synchronous observed and server header objects", () => {
  assert.deepEqual(canaryRequestHeaderFlags({ accept: "text/html" }), {
    cookieHeader: false,
    authorizationHeader: false,
    sensitiveHeader: false,
  });
  assert.deepEqual(canaryRequestHeaderFlags({ Cookie: "synthetic", "X-API-Key": "synthetic" }), {
    cookieHeader: true,
    authorizationHeader: false,
    sensitiveHeader: true,
  });
  assert.deepEqual(canaryRequestHeaderFlags({ Authorization: "synthetic" }), {
    cookieHeader: false,
    authorizationHeader: true,
    sensitiveHeader: true,
  });
  assert.throws(() => canaryRequestHeaderFlags(null), /headers must be an object/u);
});

test("backend request failures report only closed sanitized predicates", () => {
  const allowed = new Set(["/", "/index.html"]);
  const clean = {
    method: "GET", pathname: "/index.html", search: "", hasCredentials: false,
    contentLength: 0, cookieHeader: false, authorizationHeader: false,
    sensitiveHeader: false, transferEncoding: false,
  };
  assert.equal(canaryBackendRequestViolation(clean, allowed), null);
  const unsafe = {
    ...clean,
    method: "POST-WITH-PRIVATE-TEXT",
    pathname: "/private-child-name",
    search: "?progress=private-answer",
    hasCredentials: true,
    contentLength: 19,
    cookieHeader: true,
    authorizationHeader: true,
    sensitiveHeader: true,
    transferEncoding: true,
  };
  const finding = canaryBackendRequestViolation(unsafe, allowed);
  assert.equal(finding.violationMask, 511, "bits 1..256 bind method, path, query, credentials, body, cookie, authorization, sensitive-header, and transfer-encoding failures");
  assert.equal(finding.methodClass, "OTHER");
  assert.equal(finding.allowedPath, null);
  assert.match(finding.pathnameSha256, /^[a-f0-9]{64}$/u);
  const serialized = JSON.stringify(finding);
  assert.doesNotMatch(serialized, /PRIVATE|private|progress|answer|child-name/u);
  assert.equal(finding.contentLengthClass, "NONZERO");
  const allowedQuery = canaryBackendRequestViolation({ ...clean, search: "?sensitive=hidden" }, allowed);
  assert.equal(allowedQuery.allowedPath, "/index.html");
  assert.equal(allowedQuery.pathnameSha256, null);
  assert.equal(allowedQuery.violationMask, 4);
  assert.doesNotMatch(JSON.stringify(allowedQuery), /sensitive=hidden/u);
  const logged = `Backend request violation count=1 first=${JSON.stringify({ requestIndex: 0, ...finding })}`;
  assert.ok(logged.length <= 240, "the complete sanitized first finding must survive the canonical check-detail bound");
  const longestAllowedPath = "/assets/icons/apple-touch-icon.png";
  const allowedPathFinding = canaryBackendRequestViolation({ ...clean, pathname: longestAllowedPath, search: "?private=hidden" }, new Set([longestAllowedPath]));
  const allowedPathLog = `Backend request violation count=1 first=${JSON.stringify({ requestIndex: 999_999, ...allowedPathFinding })}`;
  assert.equal(allowedPathFinding.allowedPath, longestAllowedPath);
  assert.equal(allowedPathFinding.pathnameSha256, null);
  assert.ok(allowedPathLog.length <= 240, "the longest governed allowed path must also fit the canonical check-detail bound");
  assert.doesNotMatch(allowedPathLog, /private=hidden/u);
  assert.equal(canaryBackendRequestViolation({ ...clean, pathname: "/favicon.ico" }, new Set(["/favicon.ico"])), null,
    "the browser's exact harmless favicon probe is allowed while every other unlisted path remains rejected");
  assert.equal(canaryBackendRequestViolation({ ...clean, pathname: "/favicon.ico-extra" }, new Set(["/favicon.ico"]))?.violationMask, 2);
  assert.throws(() => canaryBackendRequestViolation(null, allowed), /record must be an object/u);
});

test("runtime snapshot identity binds path, bytes, and hash without traversal", () => {
  const records = [
    { path: "index.html", sha256: sha("a"), bytes: 10 },
    { path: "sw.js", sha256: sha("b"), bytes: 20 },
  ];
  const baseline = snapshotSha256(records);
  assert.equal(baseline, snapshotSha256([...records].reverse()));
  assert.notEqual(baseline, snapshotSha256(records.map((item, index) => index ? item : { ...item, bytes: 11 })));
  assert.notEqual(baseline, snapshotSha256(records.map((item, index) => index ? item : { ...item, sha256: sha("c") })));
  assert.notEqual(baseline, snapshotSha256(records.map((item, index) => index ? item : { ...item, path: "home.html" })));
  assert.throws(() => snapshotSha256([{ path: "../index.html", sha256: sha("a"), bytes: 10 }]));
});

test("teardown executes every cleanup in reverse order and preserves failures", async () => {
  const calls = [];
  const result = await runCanaryTeardown([
    { id: "first", run: async () => { calls.push("first"); return true; } },
    { id: "middle", run: async () => { calls.push("middle"); throw new Error("injected cleanup failure"); } },
    { id: "last", run: async () => { calls.push("last"); return true; } },
  ]);
  assert.deepEqual(calls, ["last", "middle", "first"]);
  assert.deepEqual(result.map(({ id, ok }) => ({ id, ok })), [
    { id: "last", ok: true },
    { id: "middle", ok: false },
    { id: "first", ok: true },
  ]);
  assert.match(result[1].error, /injected cleanup failure/u);
  assert.equal(canaryChildExitSucceeded({ settled: true, value: true, error: null }), true);
  assert.equal(canaryChildExitSucceeded({ settled: true, value: false, error: null }), false);
  assert.equal(canaryChildExitSucceeded({ settled: false, value: true, error: null }), false);
  assert.equal(canonicalCertificateThumbprint("ABCDEF0123456789ABCDEF0123456789ABCDEF01"), "abcdef0123456789abcdef0123456789abcdef01");
  assert.throws(() => canonicalCertificateThumbprint("not-a-thumbprint"));

});

test("canary activates updates directly on Home and opens installation help only through the grown-up path", async () => {
  const state = { screen: "home", dialog: false, requestedVersion: null, actions: [] };
  const visible = (selector) => selector === '[data-action="pwa-check"], [data-action="home"]'
    ? ["home", "session"].includes(state.screen)
    : selector === '[data-action="pwa-check"]'
    ? state.screen === "home"
    : selector === '[data-action="home"]'
      ? state.screen === "session"
    : selector === '[data-action="pwa-apply"]'
      ? state.screen === "home"
    : selector === '[data-action="grown"]'
      ? state.screen === "home"
      : selector === '[data-action="install-help"]'
        ? state.screen === "grown"
        : selector === "[data-pwa-dialog-backdrop]"
          ? state.dialog
          : false;
  const page = {
    async waitForFunction(_predicate, version) { state.requestedVersion = version; },
    locator(selector) {
      return {
        first() { return this; },
        async isVisible() { return visible(selector); },
        async waitFor() {
          if (!visible(selector)) throw new Error(`fixture control is not visible: ${selector}`);
        },
        async click() {
          if (!visible(selector)) throw new Error(`fixture control cannot be activated: ${selector}`);
          state.actions.push(selector);
          if (selector === '[data-action="home"]') state.screen = "home";
          if (selector === '[data-action="grown"]') state.screen = "grown";
          if (selector === '[data-action="install-help"]') state.dialog = true;
        },
      };
    },
  };

  await waitForCanaryHomeUpdate(page, "1.0.0-beta.8", 25);
  assert.equal(state.requestedVersion, "1.0.0-beta.8");
  assert.deepEqual(state.actions, []);
  state.screen = "session";
  await waitForCanaryHomeUpdate(page, "1.0.0-beta.8", 25);
  assert.deepEqual(state.actions, ['[data-action="home"]']);
  state.actions.length = 0;
  state.dialog = true;
  await assert.rejects(activateCanaryHomeUpdate(page, 25), /directly on Home/u);
  assert.deepEqual(state.actions, []);
  state.dialog = false;
  await activateCanaryHomeUpdate(page, 25);
  assert.deepEqual(state.actions, ['[data-action="pwa-apply"]']);
  state.actions.length = 0;
  await openCanaryInstallHelp(page, 25);
  assert.deepEqual(state.actions, ['[data-action="grown"]', '[data-action="install-help"]']);
  assert.equal(state.dialog, true);
});

test("canary deliberately reloads the existing Beta 1 page into the Home candidate", async () => {
  const observations = [];
  const page = {
    async reload(options) { observations.push(["reload", options.waitUntil, options.timeout]); },
    async waitForFunction(_predicate, version, options) { observations.push(["version", version, options.timeout]); },
    locator(selector) {
      return {
        first() { return this; },
        async isVisible() { return selector === '[data-action="pwa-check"]'; },
        async waitFor(options) { observations.push(["control", selector, options.state, options.timeout]); },
      };
    },
  };
  const candidate = await reloadCanaryCandidateFromBeta1(page, "1.0.0-beta.8", 75);
  assert.equal(candidate, page);
  assert.deepEqual(observations, [
    ["reload", "domcontentloaded", 75],
    ["version", "1.0.0-beta.8", 75],
    ["control", '[data-action="pwa-check"], [data-action="home"]', "visible", 75],
    ["control", '[data-action="pwa-check"]', "visible", 75],
  ]);
});

test("canary observes the exact visible retained-save fresh-start notice", async () => {
  const state = { visible: true, text: RETAINED_BETA1_FRESH_START_NOTICE, observations: [] };
  const page = {
    locator(selector) {
      assert.equal(selector, '.runtime-warning[role="alert"]');
      return {
        first() { return this; },
        async waitFor(options) {
          state.observations.push(["wait", options.state, options.timeout]);
          if (!state.visible) throw new Error("notice is not visible");
        },
        async innerText() { return state.text; },
      };
    },
  };
  assert.equal(await observeCanaryRetainedFreshStartNotice(page, 75), RETAINED_BETA1_FRESH_START_NOTICE);
  assert.deepEqual(state.observations, [["wait", "visible", 75]]);
  state.text = `${RETAINED_BETA1_FRESH_START_NOTICE} Extra`;
  await assert.rejects(observeCanaryRetainedFreshStartNotice(page, 75), /exact approved grown-up message/u);
  state.visible = false;
  await assert.rejects(observeCanaryRetainedFreshStartNotice(page, 75), /not visible/u);
});

test("waiting-cache observation requires the exact settled cache set", async () => {
  const clock = { now: 100 };
  const state = { waiting: true, names: ["math-quest-static-v1.0.0-beta.1", "expected-cache"] };
  const context = vm.createContext({
    navigator: { serviceWorker: { async getRegistration() { return { waiting: state.waiting ? {} : null }; } } },
    caches: { async keys() { return [...state.names]; } },
    performance: { now() { return clock.now; } },
    Number,
  });
  const predicate = new vm.Script(`(${canaryWaitingCacheReady.toString()})`).runInContext(context);
  const input = { expectedCacheName: "expected-cache", allowedCacheNames: ["math-quest-static-v1.0.0-beta.1", "expected-cache"], stableMs: 750 };
  assert.equal(await predicate(input), false, "the first exact observation begins the stability window");
  clock.now = 849;
  assert.equal(await predicate(input), false, "an exact set must remain stable for the full interval");
  clock.now = 850;
  assert.equal(await predicate(input), true);
  state.names.push("expected-cache-staging");
  assert.equal(await predicate(input), false, "a staging cache invalidates readiness");
  state.names = ["math-quest-static-v1.0.0-beta.1"];
  assert.equal(await predicate(input), false, "the missing physical cache invalidates readiness");
  state.names = ["math-quest-static-v1.0.0-beta.1", "expected-cache", "unknown-cache"];
  assert.equal(await predicate(input), false, "an unexpected cache invalidates readiness");
  state.names = ["math-quest-static-v1.0.0-beta.1", "expected-cache"];
  state.waiting = false;
  assert.equal(await predicate(input), false, "an exact cache without a waiting worker is not ready");
});

test("candidate cache observation retries a concurrent install and binds one atomic snapshot", async () => {
  const expectedCacheName = "math-quest-static-v1.0.0-beta.8-digest";
  const beta1CacheName = "math-quest-static-v1.0.0-beta.1";
  const exactNames = [beta1CacheName, expectedCacheName];
  let keysCall = 0;
  let clock = 0;
  const responseBytes = new TextEncoder().encode("candidate");
  const request = { url: "https://localhost/index.html" };
  const context = vm.createContext({
    URL,
    Uint8Array,
    crypto: webcrypto,
    decodeURIComponent,
    location: { origin: "https://localhost" },
    performance: { now: () => ++clock },
    setTimeout: (resolve) => resolve(),
    caches: {
      keys: async () => {
        keysCall += 1;
        return keysCall === 2 ? [...exactNames, `${expectedCacheName}-nonce-staging`] : [...exactNames];
      },
      open: async () => ({
        keys: async () => [request],
        match: async () => ({
          status: 200,
          headers: { get: (name) => name === "content-type" ? "text/html; charset=utf-8" : null },
          arrayBuffer: async () => responseBytes.buffer,
        }),
      }),
    },
  });
  const observe = new vm.Script(`(${exactCandidateCacheObservation.toString()})`).runInContext(context);
  const result = await observe({
    expectedCacheName,
    expectedRows: [{ path: "index.html" }],
    allowedCacheNames: exactNames,
    observationTimeoutMs: 20,
    pollMs: 0,
  });
  assert.equal(keysCall, 4, "a cache-set change after byte reading must force a fresh observation");
  assert.deepEqual([...result.names], exactNames);
  assert.equal(result.rows[0].path, "index.html");
  assert.equal(result.rows[0].bytes, responseBytes.byteLength);
  assert.match(result.rows[0].sha256, /^[a-f0-9]{64}$/u);
});

test("CI-only toolchain is closed, pinned, manual, private, fresh, and absent from the release shell", async () => {
  const input = await trustedHttpsCanarySupplyChainTestInput();
  assert.deepEqual(trustedHttpsCanarySupplyChainFindings(input), []);
  assert.deepEqual(trustedHttpsCanarySupplyChainMutationFailures(input), []);
  assertCurrentCanaryCheckIdentities(input);
});

test("[NC-CANARY-EVIDENCE-RIGHTS-BINDING] canary contracts and validators affect rights evidence", async () => {
  await assertRightsInputBindings([
    "audit/lib/trusted-https-canary-contract.mjs",
    "audit/lib/trusted-https-canary-evidence.mjs",
    "audit/lib/trusted-https-canary-runner-platform.mjs",
    "audit/lib/trusted-https-canary-runner-browser.mjs",
    "audit/lib/trusted-https-canary-runner-report.mjs",
  ]);
});

async function readCanaryRunnerSources() {
  return (await Promise.all([
    read("audit/run-trusted-https-canary.mjs"),
    read("audit/lib/trusted-https-canary-runner-platform.mjs"),
    read("audit/lib/trusted-https-canary-runner-browser.mjs"),
    read("audit/lib/trusted-https-canary-runner-report.mjs"),
  ])).join("\n");
}

function assertCurrentCanaryCheckIdentities(input) {
  const runnerText = trustedHttpsCanaryRunnerText(input);
  for (const id of TRUSTED_HTTPS_CANARY_CHECK_IDS) assert.match(runnerText, new RegExp(`"${id}"`, "u"), id);
  assert.doesNotMatch(runnerText, /BETA4_(?:WAITING|REAL|ACTIVE|OFFLINE)|RESPONSIVE_BETA4/u);
}
