import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  EMPTY_PROFILE_PROCESS_SET_SHA256,
  LOOPBACK_LISTENER_QUERY_SCRIPT,
  PLAYWRIGHT_CORE_SRI,
  PLAYWRIGHT_CORE_VERSION,
  TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
  TRUSTED_HTTPS_CANARY_BETA1_TAG,
  TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
  TRUSTED_HTTPS_CANARY_CHECK_IDS,
  TRUSTED_HTTPS_CANARY_KIND,
  TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
  TRUSTED_HTTPS_CANARY_STATUS,
  TRUSTED_HTTPS_CANARY_TAG,
  TRUSTED_HTTPS_CANARY_WORKFLOW,
  canaryBrowserArguments,
  canaryChildExitSucceeded,
  canaryWorkspaceRemovalAllowed,
  canonicalCertificateThumbprint,
  captureCanaryObservation,
  canonicalCanaryEvidence,
  loopbackListenerProbeInvocation,
  observePromiseSettlement,
  parseTrustedHttpsCanaryEvidence,
  profileProcessSetSha256,
  recoverAndDrainOperation,
  runCanaryTeardown,
  snapshotSha256,
  validateCanaryBrowserArguments,
  waitForExactLoopbackListener,
} from "../lib/trusted-https-canary.mjs";
import {
  trustedHttpsCanarySupplyChainFindings,
  trustedHttpsCanarySupplyChainMutationFailures,
} from "../lib/trusted-https-canary-supply-chain.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const sha = (character) => character.repeat(64);
const candidateSha = "1".repeat(40);
const execFile = promisify(execFileCallback);

function validEvidence() {
  return {
    schemaVersion: TRUSTED_HTTPS_CANARY_SCHEMA_VERSION,
    artifactKind: TRUSTED_HTTPS_CANARY_KIND,
    certificationStatus: TRUSTED_HTTPS_CANARY_STATUS,
    reconciliationState: "RECONCILED",
    repository: "OpenMathQuest/openmathquest.github.io",
    ref: "refs/heads/main",
    candidateSha,
    intendedReleaseTag: TRUSTED_HTTPS_CANARY_TAG,
    workflowFile: TRUSTED_HTTPS_CANARY_WORKFLOW,
    workflowRunId: "123",
    workflowRunAttempt: "1",
    observedAtUtc: "2026-08-03T12:34:56.000Z",
    hostQualificationState: "DEFERRED_PRERELEASE",
    beta1Identity: {
      tag: TRUSTED_HTTPS_CANARY_BETA1_TAG,
      tagObjectSha: TRUSTED_HTTPS_CANARY_BETA1_TAG_OBJECT,
      commitSha: TRUSTED_HTTPS_CANARY_BETA1_COMMIT,
    },
    runtimeIdentity: {
      beta1SnapshotSha256: sha("a"),
      candidateSnapshotSha256: sha("b"),
      candidateReleaseManifestSha256: sha("c"),
      candidateServiceWorkerSha256: sha("d"),
      candidateIndexSha256: sha("e"),
    },
    origin: {
      scheme: "https",
      hostname: "localhost",
      port: 43123,
      scope: "https://localhost:43123/",
      exposure: "LOOPBACK_ONLY",
    },
    toolchain: {
      caddyVersion: CADDY_VERSION,
      caddyArchiveSha256: CADDY_ARCHIVE_SHA256,
      caddyArchiveSha512: CADDY_ARCHIVE_SHA512,
      caddyExecutableSha256: sha("f"),
      playwrightCoreVersion: PLAYWRIGHT_CORE_VERSION,
      playwrightCoreSri: PLAYWRIGHT_CORE_SRI,
    },
    browser: { productName: "Microsoft Edge", fullVersion: "140.0.1.2", executableSha256: sha("1") },
    runner: { requestedLabel: "windows-latest", environment: "github-hosted", imageOS: "win25", imageVersion: "20260801.1" },
    certificate: {
      rootSha256: sha("2"),
      leafSha256: sha("3"),
      subjectName: "localhost",
      issuer: "Caddy Local Authority - ECC Intermediate",
      validFromUnix: 1_786_000_000,
      validToUnix: 1_786_086_400,
    },
    tlsProtocol: "TLS 1.3",
    networkProof: {
      expectedResponseCount: 16,
      verifiedResponseCount: 16,
      responseSetSha256: sha("6"),
      responseHeaderSetSha256: sha("7"),
      caddyAccessLogSha256: sha("8"),
    },
    cacheProof: {
      physicalCacheName: `math-quest-static-v1.0.0-beta.5-${sha("c")}`,
      expectedEntryCount: 14,
      waitingEntryCount: 14,
      activeEntryCount: 14,
      offlineEntryCount: 14,
      repairedEntryCount: 14,
      waitingSetSha256: sha("9"),
      activeSetSha256: sha("9"),
      offlineSetSha256: sha("9"),
      repairedSetSha256: sha("9"),
      unexpectedCacheCount: 0,
      stagingCacheCount: 0,
    },
    offlineProof: {
      responseFromServiceWorker: true,
      originPortClosed: true,
      backendPortClosed: true,
      controllerScriptUrlSha256: sha("a"),
      readinessRelease: "1.0.0-beta.5",
      readinessBuildId: "math-quest-pwa-v1.0.0-beta.5",
      readinessCacheIdentity: "math-quest-static-v1.0.0-beta.5",
    },
    navigationProof: {
      expectedReloadCount: 1,
      observedReloadCount: 1,
      unexpectedNavigationCount: 0,
      initialUrlSha256: sha("b"),
      navigationSetSha256: sha("c"),
    },
    privacy: {
      profileMode: "anonymous",
      syntheticOnly: true,
      childIdentityStored: false,
      automaticUpload: false,
      requestMetadataSha256: sha("d"),
      unexpectedRequestCount: 0,
      externalRequestCount: 0,
      queryStringCount: 0,
      allowedRecoveryQueryCount: 0,
      unexpectedQueryStringCount: 0,
      requestBodyCount: 0,
      cookieHeaderCount: 0,
      authorizationHeaderCount: 0,
      sensitiveHeaderCount: 0,
      webSocketCount: 0,
      eventSourceCount: 0,
      otherActiveChannelCount: 0,
    },
    progress: {
      sourceKey: "math-quest:v2",
      protectedKey: "math-quest:progress:v2",
      sourceSha256: sha("4"),
      protectedSha256: sha("5"),
      sourceSchemaVersion: 2,
      targetSchemaVersion: 3,
      earnedLevel: 2,
      practiceCount: 3,
      approvedProjectionSha256: sha("e"),
      protectedProjectionSha256: sha("e"),
      approvedProjectionFieldCount: 57,
      protectedProjectionFieldCount: 57,
    },
    checks: TRUSTED_HTTPS_CANARY_CHECK_IDS.map((id) => ({ id, status: "PASS", detail: `Effect-sensitive proof for ${id}.` })),
    teardown: {
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
      observedProfileProcessCount: 1,
      observedProfileProcessSetSha256: sha("f"),
      remainingProfileProcessCount: 0,
      remainingProfileProcessSetSha256: EMPTY_PROFILE_PROCESS_SET_SHA256,
    },
  };
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
    ["migration projection", (value) => { value.progress.protectedProjectionSha256 = sha("0"); }],
    ["certificate absence", (value) => { value.teardown.remainingMatchingCertificateCount = 1; }],
    ["lingering profile process", (value) => { value.teardown.remainingProfileProcessCount = 1; }],
    ["forged empty process set", (value) => { value.teardown.remainingProfileProcessSetSha256 = sha("0"); }],
    ["progress preservation", (value) => { value.progress.practiceCount = 2; }],
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

test("FAILED canary evidence cannot disguise an all-green result", () => {
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

  const [runnerText, wrapperText] = await Promise.all([
    read("audit/run-trusted-https-canary.mjs"),
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

test("canary checks emit progress markers and bind open-ended waits", async () => {
  assert.deepEqual(await observePromiseSettlement(Promise.resolve("done"), 100), { settled: true, value: "done", error: null });
  const delayed = new Promise((resolve) => setTimeout(() => resolve("later"), 30));
  assert.deepEqual(await observePromiseSettlement(delayed, 5), { settled: false, value: undefined, error: null });
  assert.deepEqual(await observePromiseSettlement(delayed, 100), { settled: true, value: "later", error: null });
  let resourceOpen = true;
  let mutatedAfterTimeout = false;
  let operationSettled = false;
  const recoverable = new Promise((resolve) => setTimeout(() => {
    if (resourceOpen) mutatedAfterTimeout = true;
    operationSettled = true;
    resolve("drained");
  }, 30));
  await assert.rejects(recoverAndDrainOperation(recoverable, {
    timeoutMs: 5,
    drainTimeoutMs: 100,
    label: "delayed browser operation",
    recover: async () => { resourceOpen = false; },
  }), /settled only after recovery/u);
  assert.equal(operationSettled, true);
  assert.equal(mutatedAfterTimeout, false);
  const observationFailures = [];
  const failedHeaders = await captureCanaryObservation(Promise.reject(new Error("header observation failed")), observationFailures, "request headers");
  assert.deepEqual(failedHeaders, { ok: false, value: null });
  assert.deepEqual(observationFailures, [{ label: "request headers", error: "header observation failed" }]);
  const [runnerText, wrapperText] = await Promise.all([
    read("audit/run-trusted-https-canary.mjs"),
    read("audit/run-trusted-https-canary.ps1"),
  ]);
  assert.match(runnerText, /\[canary\] START \$\{id\}/u);
  assert.match(runnerText, /\[canary\] PASS \$\{id\}/u);
  assert.match(runnerText, /\[canary\] FAIL \$\{id\}/u);
  assert.match(runnerText, /Beta 1 service-worker readiness timed out/u);
  assert.match(runnerText, /START ONLINE_TO_OFFLINE_SHUTDOWN/u);
  assert.match(runnerText, /closePersistentContext\(context, profilePath\)/u);
  assert.match(runnerText, /boundedPageEvaluate/u);
  assert.match(runnerText, /boundedBrowserOperation/u);
  assert.match(runnerText, /closeAuxiliaryContext/u);
  assert.match(runnerText, /closeAllConnections/u);
  assert.doesNotMatch(runnerText, /await\s+[A-Za-z_$][\w$]*\.evaluate\s*\(/u);
  assert.doesNotMatch(runnerText, /networkBrowser/u);
  assert.doesNotMatch(runnerText, /await\s+networkContext\.close\s*\(/u);
  assert.doesNotMatch(runnerText, /await\s+context\.newPage\s*\(/u);
  assert.doesNotMatch(runnerText, /await\s+context\.setOffline\s*\(/u);
  assert.doesNotMatch(runnerText, /allHeaders\(\)\s*\)\.catch/u);
  assert.match(runnerText, /assert\.deepEqual\(requestTrackers\.flatMap\(\(tracker\) => tracker\.observationFailures\), \[\]\)/u);
  assert.match(runnerText, /X509Store\]::new\('Root',\[Security\.Cryptography\.X509Certificates\.StoreLocation\]::LocalMachine\)/u);
  assert.match(runnerText, /WindowsBuiltInRole\]::Administrator/u);
  assert.match(runnerText, /\$store\.Add\(\$certificate\)/u);
  assert.match(runnerText, /\$store\.Remove\(\$certificate\)/u);
  assert.match(runnerText, /canonicalCertificateThumbprint\(certificateThumbprint\)/u);
  assert.match(runnerText, /persistCleanupIdentifiers\(workRoot, \{ processIds: \[caddy\.child\.pid\], certificateThumbprint, originPort \}\);\s*assert\.equal\(Number\(await run\("powershell\.exe"/u);
  assert.match(wrapperText, /certificateCleanup\.WaitForExit\(30000\)/u);
  assert.match(wrapperText, /certificateCleanup\.Kill\(\)/u);
  assert.match(wrapperText, /Fallback certificate removal did not remove the exact canary root/u);
  assert.match(wrapperText, /X509Store\]::new\('Root', \[Security\.Cryptography\.X509Certificates\.StoreLocation\]::LocalMachine\)/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /StoreLocation\]::CurrentUser/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /Import-Certificate/u);
  assert.doesNotMatch(`${runnerText}\n${wrapperText}`, /certutil\.exe/u);
  assert.doesNotMatch(runnerText, /\$args\[0\]/u);
});

test("CI-only toolchain is closed, pinned, manual, private, fresh, and absent from the release shell", async () => {
  const [packageJsonText, packageLockText, dependencyInstallerText, wrapperText, workflowText, runnerText, validatorText, builderText, releaseShellText, serviceWorkerText] = await Promise.all([
    read("package.json"),
    read("package-lock.json"),
    read("audit/install-reviewed-ci-dependencies.ps1"),
    read("audit/run-trusted-https-canary.ps1"),
    read(".github/workflows/trusted-https-canary.yml"),
    read("audit/run-trusted-https-canary.mjs"),
    read("audit/validate-trusted-https-canary.mjs"),
    read("tools/build-pwa-release-manifest.mjs"),
    read("release-shell-v1.json"),
    read("sw.js"),
  ]);
  const input = { packageJsonText, packageLockText, dependencyInstallerText, wrapperText, workflowText, runnerText, validatorText, builderText, releaseShellText, serviceWorkerText };
  assert.deepEqual(trustedHttpsCanarySupplyChainFindings(input), []);
  assert.deepEqual(trustedHttpsCanarySupplyChainMutationFailures(input), []);
  for (const id of TRUSTED_HTTPS_CANARY_CHECK_IDS) assert.match(runnerText, new RegExp(`"${id}"`, "u"), id);
  assert.doesNotMatch(runnerText, /BETA4_(?:WAITING|REAL|ACTIVE|OFFLINE)|RESPONSIVE_BETA4/u);
});
