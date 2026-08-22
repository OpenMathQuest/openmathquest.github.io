import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BROWSER_AUDIT_SHARDS,
  aggregateBrowserShardReports,
  browserShardEvidenceProjection,
} from "../lib/browser-smoke.mjs";
import { runNativeCoverage } from "../lib/native-coverage.mjs";
import { PLAYWRIGHT_FOCUSED_WORKERS } from "../lib/playwright-focused-contract.mjs";
import { coverageProcessCompletedCleanly, coverageProcessTimeoutMs, DEFAULT_COVERAGE_PROCESS_TIMEOUT_MS, validateStructuredAudit } from "../run-coverage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const identity = Object.freeze({
  browserProductName: "Microsoft Edge", browserFullVersion: "151.0.4129.72",
  browserExecutableSha256: "a".repeat(64), requestedRunnerLabel: "windows-latest",
  runnerKind: "GITHUB_HOSTED", runnerImageOS: "win25", runnerImageVersion: "20260808.1.0",
  browserIdentityValid: true, validForPublication: true, status: "OBSERVED_GITHUB_HOSTED", issues: [],
});
const shardReport = (shard) => ({
  shard, status: "PASS", complete: true, evidence: { ...identity },
  process: { status: 0, signal: null, error: null, timedOut: false, forcedTermination: false, close: { requested: true, error: null }, stderr: "" },
  results: BROWSER_AUDIT_SHARDS[shard].map((id) => ({ id, title: id, status: "PASS", details: "" })),
  payloadValidation: { valid: true, errors: [] }, cleanupError: null,
  requests: [], unexpectedRequests: [], parseError: null, dumpTail: "",
});

test("coverage reserves finalization time inside its policy-owned lane timeout", () => {
  assert.equal(coverageProcessTimeoutMs(240_000, 15_000), 225_000);
  assert.equal(DEFAULT_COVERAGE_PROCESS_TIMEOUT_MS, 225_000);
  assert.throws(() => coverageProcessTimeoutMs(240_000, 240_000), /reserve/u);
});

test("native coverage removes its timed-out process tree or reports cleanup unverified and fails closed", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mq-native-coverage-cleanup-"));
  const fixture = path.join(tempRoot, "descendant-cleanup.test.mjs");
  const pidFile = path.join(tempRoot, "descendant.pid");
  const inheritedTestContext = process.env.NODE_TEST_CONTEXT;
  let descendantPid = null;
  try {
    await writeFile(fixture, `
      import { spawn } from "node:child_process";
      import { writeFile } from "node:fs/promises";
      import test from "node:test";
      test("long-lived descendant", async () => {
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
        await writeFile(process.env.MQ_DESCENDANT_PID_FILE, String(child.pid));
        await new Promise(() => {});
      });
    `);
    delete process.env.NODE_TEST_CONTEXT;
    const result = await runNativeCoverage(process.execPath, fixture, {
      cwd: tempRoot,
      env: { MQ_DESCENDANT_PID_FILE: pidFile },
      timeoutMs: 2_500,
    });
    assert.equal(result.timedOut, true, `${result.error || "no process error"}\n${result.stderr}\n${result.stdout}`);
    descendantPid = Number(await readFile(pidFile, "utf8"));
    assert.match(result.error || "", /ETIMEDOUT/u);
    assert.equal(coverageProcessCompletedCleanly(result), false);
    let descendantAlive = true;
    try { process.kill(descendantPid, 0); } catch { descendantAlive = false; }
    if (result.cleanupVerified) {
      assert.equal(descendantAlive, false);
    } else {
      assert.match(result.error || "", /cleanup was not verified/u);
    }
  } finally {
    if (inheritedTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = inheritedTestContext;
    if (Number.isSafeInteger(descendantPid) && descendantPid > 0) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
    await rm(tempRoot, { force: true, maxRetries: 10, recursive: true, retryDelay: 100 });
  }
});

test("the current build contract digest is bound before complete certification", async () => {
  const [contractBytes, register, auditRunner] = await Promise.all([
    readFile(path.join(root, "docs/development/build-spec.md")),
    read("research/build-axioms.md"),
    read("audit/run-audit.mjs"),
  ]);
  const recorded = register.match(/Contract SHA-256:\*\*\s*`([a-f0-9]{64})`/u)?.[1];
  const actual = createHash("sha256").update(contractBytes).digest("hex");
  assert.equal(recorded, actual);
  assert.match(auditRunner, /promptDigestMatchesRegister/u);
  assert.match(auditRunner, /meta\.promptDigestMatchesRegister/u);
});

const structuredAudit = () => ({
  schemaVersion: 1,
  artifactKind: "MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1",
  complete: true,
  engine: {
    sha256: "c".repeat(64),
    summary: { PASS: 43, FAIL: 0, SKIP: 0, total: 43, requiredFailures: 0 },
    results: Array.from({ length: 43 }, (_, index) => ({ id: `ENGINE-${index}`, status: "PASS" })),
    effectMap: {},
    childStringCandidateSha256: "d".repeat(64),
    childStringConstants: { pendingApproval: false, approvalSha256: "d".repeat(64) },
  },
  semantic: {
    assertions: Array.from({ length: 130 }, (_, index) => ({ id: `SEM-${index}`, status: "PASS" })),
    summary: { total: 130, passed: 130, failed: 0, skills: 126, taskTypes: 166, questions: 6_048 },
    failures: [],
    contractPass: true,
  },
});

test("browser shard aggregation accepts exactly one complete identity-bound partition", () => {
  const aggregate = aggregateBrowserShardReports([shardReport("core"), shardReport("visual")], { browserPath: "msedge.exe" });
  assert.equal(aggregate.status, "PASS");
  assert.equal(aggregate.results.length, 72);
  assert.equal(aggregate.shardEvidence.length, 2);
  assert.equal(aggregate.shardEvidence.every((item) => /^[a-f0-9]{64}$/u.test(item.canonicalEvidenceSha256)), true);
  for (const item of aggregate.shardEvidence) {
    assert.equal(
      createHash("sha256").update(JSON.stringify(item.projection)).digest("hex"),
      item.canonicalEvidenceSha256,
    );
  }
  assert.equal(Object.hasOwn(aggregate, "shardReports"), false);
});

test("browser shard evidence ignores request order and duplicate multiplicity but preserves request identity", () => {
  const baseline = shardReport("core");
  baseline.requests = [
    { method: "GET", pathname: "/index.html", host: "127.0.0.1:51001" },
    { method: "GET", pathname: "/sw.js", host: "127.0.0.1:51001" },
    { method: "GET", pathname: "/index.html", host: "127.0.0.1:51001" },
  ];
  const reordered = shardReport("core");
  reordered.requests = [
    { method: "GET", pathname: "/sw.js", host: "127.0.0.1:62002" },
    { method: "GET", pathname: "/index.html", host: "127.0.0.1:62002" },
  ];
  assert.deepEqual(browserShardEvidenceProjection(reordered), browserShardEvidenceProjection(baseline));
  reordered.requests[0].pathname = "/manifest.webmanifest";
  assert.notDeepEqual(browserShardEvidenceProjection(reordered), browserShardEvidenceProjection(baseline));
});

test("browser geometry evidence waits fail-closed for fonts and consecutive stable rendered frames", async () => {
  const [auditPage, visualRegression] = await Promise.all([
    read("audit.html"),
    read("audit/approved-visual-regression.js"),
  ]);
  const contractIssues = (pageSource, visualSource) => [
    [/scenario\.doc\.fonts\.ready\.then\(\(\) => "READY"\)/u, pageSource, "font readiness is not awaited"],
    [/scenario\.doc\.fonts\.status !== "loaded"/u, pageSource, "font readiness does not fail closed"],
    [/identicalTransitions >= 2/u, pageSource, "consecutive geometry equality is not required"],
    [/requireStableRenderedGeometry\(scenario, frame\.title\)/u, pageSource, "new scenario frames are sampled before settlement"],
    [/requireStableRenderedGeometry\(installScenario, "Grown-up install dialog"\)/u, pageSource, "the install dialog is sampled before settlement"],
    [/settle: requireStableRenderedGeometry/u, pageSource, "the visual regression helper lacks the settlement oracle"],
    [/await settleLabRender\(`Manifest visual-regression viewport \$\{width\}x\$\{height\}`\)/u, visualSource, "resized visual fixtures are sampled before settlement"],
    [/await settleLabRender\(`\$\{name\} manifest visual-regression fixture`\)/u, visualSource, "reloaded visual fixtures are sampled before settlement"],
  ].flatMap(([pattern, source, issue]) => pattern.test(source) ? [] : [issue]);
  assert.deepEqual(contractIssues(auditPage, visualRegression), []);
  assert.ok(contractIssues(
    auditPage.replace("scenario.doc.fonts.ready.then(() => \"READY\")", "Promise.resolve(\"READY\")"),
    visualRegression,
  ).includes("font readiness is not awaited"));
  assert.ok(contractIssues(
    auditPage,
    visualRegression.replace("await settleLabRender(`${name} manifest visual-regression fixture`);", "await pause();"),
  ).includes("reloaded visual fixtures are sampled before settlement"));
});

test("interrupted replay exclusion uses a controlled clock and an exact effect oracle", async () => {
  const auditPage = await read("audit.html");
  const contractIssues = (source) => [
    [/scenarioFrameAtClock\(\s*engine,\s*"speech-replay-confirm-interruption",\s*interruptedReplayState,\s*playDay/um, "the replay interruption scenario uses wall-clock time"],
    [/__setMathQuestAuditNow\(playDay \+ 4_000\)/u, "the replay interval is not advanced deterministically"],
    [/attempt\?\.elapsed === 0\s*&& replayMs === 4_000/u, "the exclusion oracle does not require the exact controlled effect"],
  ].flatMap(([pattern, issue]) => pattern.test(source) ? [] : [issue]);
  assert.deepEqual(contractIssues(auditPage), []);
  assert.ok(contractIssues(
    auditPage.replace("attempt?.elapsed === 0", "attempt?.elapsed < replayMs"),
  ).includes("the exclusion oracle does not require the exact controlled effect"));
});

test("[NC-BROWSER-MISSING_OR_SKIPPED_RESULT] browser aggregation rejects missing, duplicate, mixed-identity, failed, and unexpected-request evidence", () => {
  assert.throws(() => aggregateBrowserShardReports([shardReport("core")]), /exactly one report/u);
  assert.throws(() => aggregateBrowserShardReports([shardReport("core"), shardReport("core")]), /missing, duplicated, or unknown/u);
  const mixed = shardReport("visual"); mixed.evidence.browserExecutableSha256 = "b".repeat(64);
  assert.equal(aggregateBrowserShardReports([shardReport("core"), mixed]).status, "FAIL");
  const failed = shardReport("visual"); failed.status = "FAIL"; failed.results[0].status = "FAIL";
  assert.equal(aggregateBrowserShardReports([shardReport("core"), failed]).status, "FAIL");
  const networked = shardReport("visual"); networked.unexpectedRequests.push({ pathname: "/outside" });
  assert.equal(aggregateBrowserShardReports([shardReport("core"), networked]).status, "FAIL");
  for (const mutate of [
    (report) => { report.process.status = 1; },
    (report) => { report.process.signal = "SIGTERM"; },
    (report) => { report.process.error = "launch failed"; },
    (report) => { report.process.timedOut = true; },
    (report) => { report.process.forcedTermination = true; },
    (report) => { report.process.close.error = "close failed"; },
    (report) => { report.payloadValidation.valid = false; },
    (report) => { report.parseError = "bad json"; },
    (report) => { report.cleanupError = "profile remained"; },
    (report) => { report.evidence.browserIdentityValid = false; },
    (report) => { report.evidence.validForPublication = false; },
    (report) => { report.evidence.status = "INVALID"; },
  ]) {
    const hostile = shardReport("visual");
    mutate(hostile);
    assert.equal(aggregateBrowserShardReports([shardReport("core"), hostile]).status, "FAIL");
  }
});

test("release orchestration eliminates exact duplicates and uses instrumented canonical evidence", async () => {
  const [workflow, wrapper, runner, coverage, nodeEngine, auditPage] = await Promise.all([
    read(".github/workflows/audit.yml"), read("audit/run-audit.ps1"), read("audit/run-audit.mjs"),
    read("audit/run-coverage.mjs"), read("audit/tests/node-engine.test.mjs"), read("audit.html"),
  ]);
  const fullJob = workflow.split(/^  full-audit:\s*$/mu)[1] || "";
  assert.doesNotMatch(fullJob, /run: node audit\/public-candidate-guard\.mjs/u);
  assert.doesNotMatch(fullJob, /node --test audit\/tests\/publication-clearance\.test\.mjs/u);
  assert.doesNotMatch(fullJob, /node --test audit\/tests\/pwa-release\.test\.mjs/u);
  assert.equal((wrapper.match(/Invoke-PublicCandidateGuard -ValidatedNode/gu) || []).length, 1);
  const runAuditBody = runner.split(/export async function runAudit/u)[1] || "";
  assert.doesNotMatch(runAuditBody, /runEngineSuite|runManifestSemanticAudit/u);
  assert.match(runAuditBody, /structuredAuditValid/iu);
  assert.match(runAuditBody, /runBoundedAuditLanes\(/u);
  assert.match(runAuditBody, /const playwright = laneExecution\.results\.playwright/u);
  assert.match(runAuditBody, /playwright\.status === "PASS"/u);
  assert.match(runner, /playwrightAssertions: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS\.length/u);
  assert.match(runner, /actual\.playwrightAssertions/u);
  assert.match(runner, /AI_READER_CONTRACT_REF/u);
  assert.match(runner, /schemaVersion: 2, reportType: "MATH_QUEST_CERTIFICATION", aiReaderContractRef: AI_READER_CONTRACT_REF/u);
  assert.match(runner, /aiReaderContractRef: report\.aiReaderContractRef/u);
  assert.match(coverage, /MQ_STRUCTURED_AUDIT_FILE/u);
  assert.match(coverage, /structuredAuditValid/u);
  assert.match(nodeEngine, /MATH_QUEST_INSTRUMENTED_ENGINE_SEMANTIC_V1/u);
  assert.match(auditPage, /AUDIT_SHARD !== "visual"/u);
  assert.match(auditPage, /AUDIT_SHARD !== "core"/u);
  assert.equal((workflow.match(/\.\\audit\\install-reviewed-ci-dependencies\.ps1/gu) || []).length, 4);
});

test("[NC-COVERAGE-PARTIAL-FIXTURE-BELOW-FULL] canonical coverage artifact rejects count-correct but internally failed evidence", () => {
  assert.equal(validateStructuredAudit(structuredAudit(), "c".repeat(64)).valid, true);
  for (const mutate of [
    (artifact) => { artifact.engine.summary.requiredFailures = 1; },
    (artifact) => { artifact.engine.results[0].status = "FAIL"; },
    (artifact) => { artifact.engine.results[1].id = artifact.engine.results[0].id; },
    (artifact) => { artifact.semantic.summary.failed = 1; },
    (artifact) => { artifact.semantic.assertions[0].status = "FAIL"; },
    (artifact) => { artifact.semantic.failures.push({ id: "SEM-0" }); },
    (artifact) => { artifact.semantic.assertions[1].id = artifact.semantic.assertions[0].id; },
  ]) {
    const hostile = structuredAudit();
    mutate(hostile);
    assert.equal(validateStructuredAudit(hostile, "c".repeat(64)).valid, false);
  }
});

test("hosted parallelism is bounded while local execution remains sequential", async () => {
  const browserRunner = await read("audit/lib/browser-smoke.mjs");
  const auditRunner = await read("audit/run-audit.mjs");
  const boundedRunner = await read("audit/lib/bounded-audit-lanes.mjs");
  const policy = JSON.parse(await read("audit/gate-integrity-policy-v1.json"));
  assert.match(browserRunner, /GITHUB_ACTIONS === "true"[\s\S]*Promise\.all/iu);
  assert.match(browserRunner, /SEQUENTIAL_LOCAL/u);
  assert.match(auditRunner, /policy: gateIntegrityPolicy\.executionPolicy/u);
  assert.match(boundedRunner, /policy\.laneSchedulingClass\[laneId\] === "EXCLUSIVE"/u);
  assert.match(boundedRunner, /runIndexes\(boundedSegment, configuration\.maximumConcurrentLanes\)/u);
  assert.equal(policy.executionPolicy.local.maximumConcurrentLanes, 1);
  assert.equal(policy.executionPolicy.githubHosted.maximumConcurrentLanes, 2);
  assert.deepEqual(policy.executionPolicy.boundedExecutionStartOrder, ["coverage", "generator", "browser", "playwright", "mutation"]);
  assert.equal(policy.executionPolicy.laneSchedulingClass.coverage, "EXCLUSIVE");
  assert.equal(policy.executionPolicy.nestedProcessFinalizationReserveMs.coverage, 15_000);
  assert.equal(policy.executionPolicy.nestedProcessTimeoutCleanup.coverage, "FULL_TREE_TERMINATION_VERIFIED_BEFORE_SUBSEQUENT_LANES");
  assert.equal(policy.executionPolicy.automaticRetries, 0);
  assert.equal(policy.executionPolicy.nestedConcurrency.browserShardMaximum, Object.keys(BROWSER_AUDIT_SHARDS).length);
  assert.equal(policy.executionPolicy.nestedConcurrency.playwrightWorkers, PLAYWRIGHT_FOCUSED_WORKERS);
});

test("watcher omits an empty changed-path parameter and preserves rename sources", async () => {
  const watcher = await read("audit/on-change-audit.ps1");
  assert.match(watcher, /if \(\$ChangedPaths\.Count -gt 0\)[\s\S]*\$arguments \+= '-ChangedPath'/u);
  assert.doesNotMatch(watcher, /-DevelopmentOnly -ChangedPath \$ChangedPaths/u);
  assert.match(watcher, /\$change\.OldName/u);
  assert.match(watcher, /__rename_unknown__/u);
  const workflow = await read(".github/workflows/audit.yml");
  assert.match(workflow, /--name-status --diff-filter=R/u);
  assert.match(workflow, /\$changedPaths \+= '__rename_unknown__'/u);
});
