import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadSecurityGatePolicy,
  markerFindings,
  securityToolRegisterRecords,
  vulnerabilityFindings,
} from "../lib/security-gate-policy.mjs";
import {
  archiveExtractionArguments,
  buildSemgrepTargetPlan,
  createTruffleHogWorktreeSnapshot,
  elideValidatedEmbeddedManifestData,
  parseSemgrepReport,
  runTruffleHogHistoryScan,
  runTruffleHogWorktreeScan,
  sanitizedTruffleHogFindings,
  segmentMarkedEngineForSemgrep,
  truffleHogIncludePatterns,
} from "../lib/security-scans.mjs";
import {
  npmAuditEnvironment,
  npmAuditReportRejectionControl,
  parseNpmAuditReport,
  runNpmAudit,
  securityCommandResult,
} from "../lib/security-command-runtime.mjs";

test("reviewed archives extract only their declared executable member", () => {
  assert.deepEqual(
    archiveExtractionArguments("reviewed-tool.whl", "prepared", {
      packaging: "ZIP_WHEEL", executableRelativePath: "package/bin/tool.exe",
    }),
    ["-xf", "reviewed-tool.whl", "-C", "prepared", "package/bin/*"],
  );
  assert.deepEqual(
    archiveExtractionArguments("reviewed-tool.tar.gz", "prepared", {
      packaging: "TAR_GZIP", executableRelativePath: "tool.exe",
    }),
    ["-xf", "reviewed-tool.tar.gz", "-C", "prepared", "tool.exe"],
  );
  for (const unsafeMember of ["../tool.exe", "/tool.exe", "package\\tool.exe", "package//tool.exe", "package/./tool.exe"]) {
    assert.throws(() => archiveExtractionArguments("reviewed-tool.whl", "prepared", {
      packaging: "ZIP_WHEEL", executableRelativePath: unsafeMember,
    }));
  }
  assert.throws(() => archiveExtractionArguments("reviewed-tool.whl", "prepared", {
    packaging: "UNKNOWN", executableRelativePath: "package/bin/tool.exe",
  }));
});

test("the security policy is closed and binds the reviewed scanners and rules", async () => {
  const policy = await loadSecurityGatePolicy();
  assert.deepEqual(policy.tools.map((tool) => tool.name), ["Semgrep", "TruffleHog"]);
  assert.equal(policy.semgrep.requiredRuleIds.length, 8);
  assert.equal(policy.negativeControls.length, 5);
  assert.equal(policy.dependencyAudit.temporaryDirectoryEnvironmentVariable, "MQ_NPM_AUDIT_TEMP");
  assert.equal(policy.dependencyAudit.maximumVulnerabilities.total, 0);
});

test("npm audit can isolate its temporary files without mutating the gate environment", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-npm-audit-temp-"));
  const policy = {
    dependencyAudit: { temporaryDirectoryEnvironmentVariable: "MQ_NPM_AUDIT_TEMP" },
  };
  try {
    const inherited = {
      TEMP: "inherited-temp",
      TMP: "inherited-tmp",
      MQ_NPM_AUDIT_TEMP: temporaryRoot,
      PRESERVED_VALUE: "yes",
    };
    const childEnvironment = npmAuditEnvironment(policy, inherited);
    assert.equal(childEnvironment.TEMP, path.resolve(temporaryRoot));
    assert.equal(childEnvironment.TMP, path.resolve(temporaryRoot));
    assert.equal(childEnvironment.PRESERVED_VALUE, "yes");
    assert.equal(childEnvironment.npm_config_update_notifier, "false");
    assert.equal(inherited.TEMP, "inherited-temp");

    const unchanged = npmAuditEnvironment(policy, { TEMP: "existing-temp", TMP: "existing-tmp" });
    assert.equal(unchanged.TEMP, "existing-temp");
    assert.equal(unchanged.TMP, "existing-tmp");
    assert.throws(
      () => npmAuditEnvironment(policy, { MQ_NPM_AUDIT_TEMP: "relative-temp" }),
      /absolute existing directory/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("the security policy exactly projects its two component-register records", async () => {
  const policyText = await readFile(new URL("../security-gate-policy-v1.json", import.meta.url), "utf8");
  const register = JSON.parse(await readFile(new URL("../../licenses/component-register-v1.json", import.meta.url), "utf8"));
  const projection = securityToolRegisterRecords(policyText);
  assert.deepEqual(projection.findings, []);
  assert.deepEqual(register.toolchain.slice(-2), projection.records);
});

test("Semgrep target planning covers modules and executable inline HTML only", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-security-targets-"));
  const repositoryRoot = path.join(temporaryRoot, "repository");
  try {
    await mkdir(repositoryRoot);
    await writeFile(path.join(repositoryRoot, "module.mjs"), "export const value = 1;\n", "utf8");
    await writeFile(path.join(repositoryRoot, "page.html"), [
      "<script type=\"application/json\">{\"data\":true}</script>",
      "<script src=\"external.js\"></script>",
      "<script>window.ready = true;</script>",
    ].join("\n"), "utf8");
    const plan = await buildSemgrepTargetPlan(repositoryRoot, ["module.mjs", "page.html"], temporaryRoot);
    assert.equal(plan.units.length, 2);
    assert.deepEqual(plan.units.map((unit) => unit.logicalPath), ["module.mjs", "page.html"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Semgrep replaces only parse-validated embedded manifest data, not executable code", () => {
  const source = [
    "/* ===CURRICULUM-MANIFEST-START=== */",
    "const manifest=(()=>{const value={\"answer\":42},freeze=input=>input;return freeze(value);})();",
    "/* ===CURRICULUM-MANIFEST-END=== */",
    "run(manifest);",
  ].join("\n");
  const prepared = elideValidatedEmbeddedManifestData(source);
  assert.equal(prepared.records.length, 1);
  assert.equal(prepared.records[0].validation, "JSON_PARSE_PASS");
  assert.equal(prepared.source.includes("const value={}"), true);
  assert.equal(prepared.source.includes("run(manifest)"), true);
  assert.equal(prepared.source.split("\n").length, source.split("\n").length);
  assert.throws(() => elideValidatedEmbeddedManifestData(source.replace('{"answer":42}', "not-json")));
});

test("the marked engine is exhaustively segmented at parsed top-level statements", () => {
  const source = [
    "const MathQuestEngine =",
    "/* ===ENGINE-START=== */",
    "(() => {",
    "  \"use strict\";",
    "  const value = 42;",
    "  return Object.freeze({ value });",
    "})()",
    "/* ===ENGINE-END=== */",
    ";",
    "window.MathQuestEngine = MathQuestEngine;",
  ].join("\n");
  const segmented = segmentMarkedEngineForSemgrep(source);
  assert.equal(segmented.record.contract, "ESLINT_PARSED_ENGINE_TOP_LEVEL_STATEMENTS_V1");
  assert.equal(segmented.record.executableStatements, 4);
  assert.equal(segmented.record.generatedSegments, 4);
  assert.equal(segmented.record.parseErrors, 0);
  assert.equal(segmented.segments.every((segment) => segment.source.startsWith("function __mq_semgrep_segment__")), true);
});

test("scanner report adapters retain locations but discard secret-bearing fields", () => {
  const semgrep = parseSemgrepReport(JSON.stringify({
    version: "1.164.0",
    results: [{
      check_id: "math-quest.security.control",
      path: "sample.js",
      start: { line: 2 },
      end: { line: 2 },
      extra: { message: "control match" },
    }],
    errors: [{
      error_type: { Timeout: [] },
      message: "SOURCE_TEXT_SHOULD_NOT_ESCAPE",
      location: { path: "sample.js", start: { line: 2 } },
    }],
    paths: { scanned: ["sample.js"] },
  }));
  assert.equal(semgrep.findings[0].startLine, 2);
  assert.equal(semgrep.errors[0].type, "Timeout");
  assert.equal(JSON.stringify(semgrep.errors).includes("SOURCE_TEXT"), false);
  const truffle = sanitizedTruffleHogFindings(JSON.stringify({
    DetectorName: "ControlDetector",
    DecoderName: "PLAIN",
    Verified: false,
    Raw: "DO_NOT_RETAIN_THIS_CONTROL_INPUT",
    Redacted: "DO_NOT_RETAIN_THIS_CONTROL_INPUT",
    SourceMetadata: { Data: { Filesystem: { file: "sample.txt", line: 4 } } },
  }));
  assert.deepEqual(truffle[0], {
    detector: "ControlDetector", decoder: "PLAIN", verified: false,
    path: "sample.txt", line: 4, commit: "",
  });
  assert.equal(JSON.stringify(truffle).includes("DO_NOT_RETAIN"), false);
});

test("dependency and work-marker policy mutants are rejected", async () => {
  const policy = await loadSecurityGatePolicy();
  const auditMutant = { metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 } } };
  assert.equal(vulnerabilityFindings(policy, auditMutant).length, 2);
  const sourceMutant = [{
    path: "control.js",
    text: "// " + policy.markers.tokens[0] + ": deliberately missing a tracking reference",
  }];
  assert.equal(markerFindings(policy, sourceMutant).length, 1);
  assert.equal(parseNpmAuditReport(JSON.stringify(completeNpmReport())).metadata.vulnerabilities.total, 0);
});

test("TruffleHog path filters are exact and portable", () => {
  const patterns = truffleHogIncludePatterns(path.resolve("repository-root"), ["audit/example.mjs", "sw.js"]);
  assert.equal(patterns.length, 2);
  assert.equal(patterns.every((pattern) => pattern.startsWith("(?i)^")), true);
  assert.equal(patterns[0].endsWith("audit[\\\\/]example\\.mjs$"), true);
  assert.equal(patterns[1].endsWith("[\\\\/]sw\\.js$"), true);
});

async function createSnapshotFixture(temporaryRoot) {
  const repositoryRoot = path.join(temporaryRoot, "repository");
  const preparedRoot = path.join(temporaryRoot, "prepared");
  const paths = ["nested/module.js", "assets/blob.bin"];
  await mkdir(path.join(repositoryRoot, "nested"), { recursive: true });
  await mkdir(path.join(repositoryRoot, "assets"), { recursive: true });
  await mkdir(preparedRoot, { recursive: true });
  await writeFile(path.join(repositoryRoot, "nested", "module.js"), "export const answer = 42;\n", "utf8");
  await writeFile(path.join(repositoryRoot, "assets", "blob.bin"), Buffer.from([0, 1, 2, 255]));
  return { repositoryRoot, preparedRoot, paths };
}

function snapshotScannerResult(snapshot) {
  return {
    status: 0,
    stdout: JSON.stringify({
      DetectorName: "ControlDetector", DecoderName: "PLAIN", Verified: false,
      SourceMetadata: { Data: { Filesystem: { file: path.join(snapshot.root, "nested", "module.js"), line: 1 } } },
    }) + "\n",
    stderr: JSON.stringify({
      msg: "finished scanning", chunks: 2, bytes: 30,
      verified_secrets: 0, unverified_secrets: 1, trufflehog_version: "3.97.0",
    }) + "\n",
  };
}

function recordingSnapshotCommand(snapshot, calls) {
  return (command, argumentsList) => {
    calls.push({ command, argumentsList });
    return snapshotScannerResult(snapshot);
  };
}

async function assertSnapshotCopies(snapshot, paths) {
  assert.deepEqual(snapshot.paths, paths);
  assert.deepEqual(await readFile(path.join(snapshot.root, "nested", "module.js")), Buffer.from("export const answer = 42;\n"));
  assert.deepEqual(await readFile(path.join(snapshot.root, "assets", "blob.bin")), Buffer.from([0, 1, 2, 255]));
}

async function scanSnapshot(fixture, snapshot, calls) {
  return runTruffleHogWorktreeScan({
    snapshot, temporaryRoot: fixture.preparedRoot, executable: "reviewed-trufflehog",
    policy: { truffleHog: { filterEntropy: 3 } },
  }, recordingSnapshotCommand(snapshot, calls));
}

async function assertSnapshotObservation(observation, calls, snapshot, paths) {
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argumentsList.slice(0, 2), ["filesystem", snapshot.root]);
  const includeArgument = calls[0].argumentsList.find((value) => value.startsWith("--include-paths="));
  const includeText = await readFile(includeArgument.slice("--include-paths=".length), "utf8");
  assert.equal(includeText, truffleHogIncludePatterns(snapshot.root, paths).join("\n") + "\n");
  assert.equal(observation.findings[0].path, "nested/module.js");
  assert.deepEqual(observation.snapshot, { mode: "BYTE_FOR_BYTE_SYSTEM_TEMP_COPY", paths: 2 });
}

test("TruffleHog scans an exact system-drive snapshot and reports logical repository paths", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-security-snapshot-test-"));
  try {
    const fixture = await createSnapshotFixture(temporaryRoot);
    const snapshot = await createTruffleHogWorktreeSnapshot(fixture.repositoryRoot, fixture.paths, fixture.preparedRoot);
    await assertSnapshotCopies(snapshot, fixture.paths);
    const calls = [];
    const observation = await scanSnapshot(fixture, snapshot, calls);
    await assertSnapshotObservation(observation, calls, snapshot, fixture.paths);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("TruffleHog history records an empty baseline range without cloning the repository", () => {
  const startCommit = "a".repeat(40);
  const calls = [];
  const commandResult = (command, argumentsList) => {
    calls.push({ command, argumentsList });
    return { status: 0, stdout: "0\n", stderr: "" };
  };
  const observation = runTruffleHogHistoryScan({
    root: path.resolve("repository-root"),
    executable: "must-not-run-trufflehog",
    policy: { truffleHog: { historyStartCommit: startCommit } },
  }, commandResult);
  assert.deepEqual(observation.findings, []);
  assert.deepEqual(observation.historyScope, {
    startCommit, endRef: "HEAD", commitCount: 0, status: "NO_COMMITS_AFTER_BASELINE",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: "git", argumentsList: ["rev-list", "--count", startCommit + "..HEAD"],
  });
});

test("TruffleHog history invokes the reviewed scanner when the baseline range has commits", () => {
  const startCommit = "b".repeat(40);
  const calls = [];
  const commandResult = (command, argumentsList) => {
    calls.push({ command, argumentsList });
    if (command === "git") return { status: 0, stdout: "1\n", stderr: "" };
    return {
      status: 0,
      stdout: "",
      stderr: JSON.stringify({
        msg: "finished scanning", chunks: 1, bytes: 42,
        verified_secrets: 0, unverified_secrets: 0, trufflehog_version: "3.97.0",
      }) + "\n",
    };
  };
  const observation = runTruffleHogHistoryScan({
    root: path.resolve("repository-root"),
    executable: "reviewed-trufflehog",
    policy: { truffleHog: { historyStartCommit: startCommit, filterEntropy: 3 } },
  }, commandResult);
  assert.equal(observation.historyScope.status, "SCANNED");
  assert.equal(observation.historyScope.commitCount, 1);
  assert.equal(observation.scan.chunks, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].command, "reviewed-trufflehog");
  assert.equal(calls[1].argumentsList.includes("--since-commit=" + startCommit), true);
});

test("external security commands fail closed when their wall-clock timeout expires", () => {
  assert.throws(
    () => securityCommandResult(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { timeoutMs: 100 }),
    /fail-closed timeout/u,
  );
});

function completeNpmReport() {
  return { auditReportVersion: 2, vulnerabilities: {}, metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  } };
}

test("npm version startup has its measured allowance while later command deadlines stay bounded", async () => {
  const policy = await loadSecurityGatePolicy();
  const calls = [];
  const command = (_file, args, options) => {
    calls.push([args[1], options.timeoutMs]);
    if (args[1] === "--version") return { status: 0, stdout: "11.9.0", stderr: "" };
    if (args[1] === "config") return { status: 0, stdout: JSON.stringify({ registry: policy.dependencyAudit.registry }), stderr: "" };
    return { status: 0, stdout: JSON.stringify(completeNpmReport()), stderr: "" };
  };
  runNpmAudit("repository", policy, command);
  assert.deepEqual(calls, [["--version", 120000], ["config", 30000], ["audit", 180000]]);
});

test("npm startup failures stop configuration and audit without retry", async () => {
  const policy = await loadSecurityGatePolicy();
  let calls = 0;
  const failure = new Error("Security command exceeded its fail-closed timeout.");
  assert.throws(() => runNpmAudit("repository", policy, () => { calls += 1; throw failure; }), (error) => error === failure);
  assert.equal(calls, 1);
});

test("missing or contradictory npm vulnerability evidence cannot become a clean result", async () => {
  const policy = await loadSecurityGatePolicy();
  assert.throws(() => parseNpmAuditReport("{}"), /npm audit/iu);
  assert.throws(() => vulnerabilityFindings(policy, {}), /vulnerability counts/iu);
  const partial = completeNpmReport();
  delete partial.metadata.vulnerabilities.high;
  assert.throws(() => parseNpmAuditReport(JSON.stringify(partial)), /vulnerability counts/iu);
  const contradiction = completeNpmReport();
  contradiction.metadata.vulnerabilities.high = 1;
  assert.throws(() => parseNpmAuditReport(JSON.stringify(contradiction)), /vulnerability counts/iu);
  assert.deepEqual(parseNpmAuditReport(JSON.stringify(completeNpmReport())), completeNpmReport());
});

test("npm execution rejects an unreviewed version or an unsuccessful clean report", async () => {
  const policy = await loadSecurityGatePolicy();
  const command = (version, status) => (_file, args) => {
    if (args[1] === "--version") return { status: 0, stdout: version, stderr: "" };
    if (args[1] === "config") return { status: 0, stdout: JSON.stringify({ registry: policy.dependencyAudit.registry }), stderr: "" };
    assert.ok(args.includes(`--registry=${policy.dependencyAudit.registry}`));
    assert.ok(args.includes(`--prefix=${path.resolve("repository")}`));
    assert.ok(args.includes("--global=false"));
    return { status, stdout: JSON.stringify(completeNpmReport()), stderr: "" };
  };
  assert.throws(() => runNpmAudit("repository", policy, command("0.0.0", 0)), /reviewed npm version/iu);
  assert.throws(() => runNpmAudit("repository", policy, command("11.9.0", 2)), /npm audit/iu);
  assert.throws(() => runNpmAudit("repository", policy, command("11.9.0", 1)), /npm audit/iu);
  assert.equal(runNpmAudit("repository", policy, command("11.9.0", 0)).version, "11.9.0");
});

test("the live npm control rejects incomplete reports and every malformed count", () => {
  assert.deepEqual(npmAuditReportRejectionControl(), { passed: true, attempted: 2, rejected: 2 });
  for (const key of Object.keys(completeNpmReport().metadata.vulnerabilities)) {
    for (const value of [-1, "0", null]) {
      const changed = completeNpmReport();
      changed.metadata.vulnerabilities[key] = value;
      assert.throws(() => parseNpmAuditReport(JSON.stringify(changed)), /vulnerability counts/iu);
    }
  }
  const unexpected = completeNpmReport();
  unexpected.metadata.vulnerabilities.unknown = 0;
  assert.throws(() => parseNpmAuditReport(JSON.stringify(unexpected)), /vulnerability counts/iu);
  const hidden = completeNpmReport();
  hidden.vulnerabilities.hidden = { severity: "high" };
  assert.throws(() => parseNpmAuditReport(JSON.stringify(hidden)), /disagree/iu);
  for (const invalid of [1, true, [], null]) {
    const changed = completeNpmReport();
    changed.vulnerabilities = invalid;
    assert.throws(() => parseNpmAuditReport(JSON.stringify(changed)), /npm audit/iu);
  }
  assert.throws(() => parseNpmAuditReport(JSON.stringify({ ...completeNpmReport(), error: null })), /error report/iu);
});

test("npm metadata cannot be redirected through global, audit, or scoped registry settings", async () => {
  const policy = await loadSecurityGatePolicy();
  const approved = "https://registry.npmjs.org/";
  for (const key of ["registry", "audit-registry", "auditRegistry", "@fixture:registry"]) {
    let auditCalls = 0;
    const command = (_file, args) => {
      if (args[1] === "--version") return { status: 0, stdout: "11.9.0", stderr: "" };
      if (args[1] === "config") return { status: 0, stdout: JSON.stringify({ registry: approved, [key]: "https://unapproved.invalid/" }), stderr: "" };
      auditCalls += 1;
      return { status: 0, stdout: JSON.stringify(completeNpmReport()), stderr: "" };
    };
    assert.throws(() => runNpmAudit("repository", policy, command), /approved npm registry/iu);
    assert.equal(auditCalls, 0, key);
  }
});
