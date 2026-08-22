import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const AUDIT_LANE_IDS = Object.freeze([
  "coverage",
  "browser",
  "playwright",
  "mutation",
  "generator",
]);

const ENVELOPE_KEYS = Object.freeze([
  "candidateId",
  "durationMs",
  "error",
  "executionStatus",
  "laneId",
  "result",
  "resultType",
  "runId",
  "schemaVersion",
]);

const exactKeys = (value, expected) => value
  && typeof value === "object"
  && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());

const roundMs = (value) => Math.max(0, Math.round(Number(value) || 0));

export function failedAuditLaneResult(laneId, message, executionStatus = "ERROR") {
  const reason = `${executionStatus}: ${message}`;
  const resultStatus = executionStatus === "NOT_RUN" ? "NOT_RUN" : "FAIL";
  if (laneId === "coverage") {
    return {
      status: resultStatus,
      calibrated: false,
      calibration: { reasons: [reason], fullBranchPct: null, partialBranchPct: null, aggregateBranchPct: null },
      exactBytes: false,
      branchPct: null,
      engineSha256: null,
      structuredAuditValid: false,
      structuredAudit: null,
    };
  }
  if (laneId === "mutation") return { status: resultStatus, engineSha256: null, families: [], error: reason };
  if (laneId === "generator") return { status: resultStatus, engineSha256: null, issues: [reason], processStatus: null, error: reason };
  if (laneId === "browser") {
    return {
      status: resultStatus,
      results: [],
      reason,
      process: { status: null, signal: executionStatus === "TIMEOUT" ? "TIMEOUT" : null, error: reason, timedOut: executionStatus === "TIMEOUT" },
    };
  }
  return {
    status: resultStatus,
    findings: [reason],
    summary: { expected: 0, actual: 0, passed: 0, failed: 0, skipped: 0, unknown: 0, duplicates: 0 },
    results: [],
    process: { status: "FAIL", stdout: "", stderr: reason },
  };
}

export function createAuditLaneEnvelope({
  candidateId,
  durationMs,
  error = null,
  executionStatus = "COMPLETED",
  laneId,
  result,
  runId,
}) {
  return {
    schemaVersion: 1,
    resultType: "MATH_QUEST_AUDIT_LANE",
    laneId,
    runId,
    candidateId,
    executionStatus,
    durationMs: roundMs(durationMs),
    result,
    error,
  };
}

export function auditLaneEnvelopeIssues(envelopes, { candidateId, runId, laneIds = AUDIT_LANE_IDS } = {}) {
  const issues = [];
  const expected = new Set(laneIds);
  const seen = new Set();
  if (!Array.isArray(envelopes)) return ["lane envelopes are not an array"];
  for (const envelope of envelopes) {
    if (!exactKeys(envelope, ENVELOPE_KEYS)) issues.push("lane envelope root is not closed");
    if (envelope?.schemaVersion !== 1 || envelope?.resultType !== "MATH_QUEST_AUDIT_LANE") issues.push("lane envelope identity is invalid");
    if (!expected.has(envelope?.laneId)) issues.push(`unknown lane ${String(envelope?.laneId)}`);
    else if (seen.has(envelope.laneId)) issues.push(`duplicate lane ${envelope.laneId}`);
    else seen.add(envelope.laneId);
    if (envelope?.runId !== runId) issues.push(`${String(envelope?.laneId)} carries a foreign run id`);
    if (envelope?.candidateId !== candidateId) issues.push(`${String(envelope?.laneId)} carries a foreign candidate id`);
    if (!Number.isSafeInteger(envelope?.durationMs) || envelope.durationMs < 0) issues.push(`${String(envelope?.laneId)} duration is invalid`);
    if (!new Set(["COMPLETED", "ERROR", "NOT_RUN", "TIMEOUT"]).has(envelope?.executionStatus)) issues.push(`${String(envelope?.laneId)} execution status is invalid`);
    if (!envelope?.result || typeof envelope.result !== "object" || Array.isArray(envelope.result)) issues.push(`${String(envelope?.laneId)} result is absent`);
  }
  for (const laneId of laneIds) if (!seen.has(laneId)) issues.push(`missing lane ${laneId}`);
  return [...new Set(issues)];
}

export function auditCandidateStabilityIssues({ before, after, revisionBefore, revisionAfter } = {}) {
  const issues = [];
  if (before?.status !== "PASS" || after?.status !== "PASS") issues.push("public-candidate guard did not pass twice");
  if (!/^[a-f0-9]{40}$/u.test(String(revisionBefore || ""))) issues.push("starting repository revision is invalid");
  if (revisionBefore !== revisionAfter) issues.push("repository revision changed during audit");
  if (!before?.payloadSha256 || before.payloadSha256 !== after?.payloadSha256) issues.push("public payload changed during audit");
  if (!before?.payloadTreeOid || before.payloadTreeOid !== after?.payloadTreeOid) issues.push("public payload tree changed during audit");
  return issues;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

async function terminateProcessTree(child, closePromise, graceMs = 2_000) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) {
    return { attempted: false, cleanupVerified: true, detail: "process did not start" };
  }
  let detail;
  let treeTerminationSucceeded = false;
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    const killed = spawnSync(path.join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5_000,
    });
    treeTerminationSucceeded = killed.status === 0 && !killed.signal && !killed.error;
    const taskkillDetail = `${killed.stdout || ""} ${killed.stderr || ""}`.trim().replace(/\s+/gu, " ").slice(-1_000);
    detail = `taskkill status=${String(killed.status)} signal=${String(killed.signal || "none")}${taskkillDetail ? ` output=${taskkillDetail}` : ""}`;
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
      treeTerminationSucceeded = true;
      detail = "SIGKILL sent to process group";
    } catch {
      try { child.kill("SIGKILL"); } catch {}
      detail = "SIGKILL sent to direct process";
    }
  }
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
  let stdout = "";
  let stderr = "";
  let outputBytes = 0;
  let spawnError = null;
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
  child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
  child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
  child.once("error", (error) => { spawnError = error; });
  const closePromise = new Promise((resolve) => {
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const timer = setTimeout(() => triggerTermination({ kind: "TIMEOUT", message: `process exceeded ${timeoutMs} ms` }), timeoutMs);
  const first = await Promise.race([
    closePromise.then((closed) => ({ kind: "CLOSED", closed })),
    terminationPromise,
  ]);
  clearTimeout(timer);
  let cleanup = { attempted: false, cleanupVerified: null, detail: "not required" };
  let closed = first.closed ?? null;
  if (first.kind !== "CLOSED") {
    cleanup = await terminateProcessTree(child, closePromise);
    closed ??= await Promise.race([closePromise, wait(100).then(() => ({ exitCode: null, signal: null }))]);
  } else if (spawnError || first.closed.exitCode !== 0 || first.closed.signal) {
    cleanup = await terminateProcessTree(child, closePromise);
  }
  return {
    stdout,
    stderr,
    exitCode: closed?.exitCode ?? null,
    signal: closed?.signal ?? null,
    spawnError: spawnError ? String(spawnError.stack || spawnError) : null,
    timedOut: first.kind === "TIMEOUT",
    outputOverflow: first.kind === "OUTPUT_LIMIT",
    cleanupVerified: cleanup.cleanupVerified,
    cleanupDetail: cleanup.detail,
    durationMs: roundMs(performance.now() - startedAt),
  };
}

export function interpretJsonChildCompletion({ stdout = "", stderr = "", exitCode = 0, signal = null, timedOut = false } = {}) {
  let parsed = null;
  try { parsed = JSON.parse(String(stdout || "")); } catch {}
  if (timedOut) {
    const error = new Error(`JSON child timed out${parsed ? " after emitting diagnostic JSON" : ""}: ${String(stderr || "").slice(-4_000)}`);
    error.executionStatus = "TIMEOUT";
    throw error;
  }
  if (exitCode !== 0 || signal) {
    const error = new Error(`JSON child ended with code ${String(exitCode)} and signal ${String(signal || "none")}${parsed ? " after emitting diagnostic JSON" : ""}: ${String(stderr || "").slice(-4_000)}`);
    error.executionStatus = "ERROR";
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("JSON child emitted no valid object report.");
    error.executionStatus = "ERROR";
    throw error;
  }
  return parsed;
}

async function executeLaneProcess({
  browserPath, candidateId, indexPath, laneId, nestedProcessTimeoutMs = null,
  nodePath, root, runId, timeoutMs,
}) {
  const args = [
    path.join(root, "audit", "run-audit-lane.mjs"),
    `--lane=${laneId}`,
    `--run-id=${runId}`,
    `--candidate-id=${candidateId}`,
    `--index-path=${indexPath}`,
  ];
  if (nestedProcessTimeoutMs !== null) args.push(`--nested-process-timeout-ms=${nestedProcessTimeoutMs}`);
  if (browserPath) args.push(`--browser=${browserPath}`);
  const processResult = await runTreeSupervisedProcess({ command: nodePath, args, cwd: root, env: process.env, timeoutMs });
  const fail = (executionStatus, message) => createAuditLaneEnvelope({
    candidateId,
    durationMs: processResult.durationMs,
    error: message,
    executionStatus,
    laneId,
    result: failedAuditLaneResult(laneId, message, executionStatus),
    runId,
  });
  if (processResult.timedOut) {
    const cleanup = processResult.cleanupVerified ? "descendant cleanup verified" : `descendant cleanup unverified (${processResult.cleanupDetail})`;
    return fail("TIMEOUT", `lane exceeded ${timeoutMs} ms; ${cleanup}`);
  }
  if (processResult.outputOverflow) return fail("ERROR", `lane output exceeded 32 MiB; cleanup verified=${String(processResult.cleanupVerified)}`);
  if (processResult.spawnError) return fail("ERROR", `${processResult.spawnError}; descendant cleanup verified=${String(processResult.cleanupVerified)}`);
  if (processResult.exitCode !== 0 || processResult.signal) {
    return fail("ERROR", `lane process ended with code ${processResult.exitCode ?? "null"} and signal ${processResult.signal ?? "null"}; descendant cleanup verified=${String(processResult.cleanupVerified)}: ${processResult.stderr.slice(-4_000)}`);
  }
  try {
    return JSON.parse(processResult.stdout);
  } catch (error) {
    return fail("ERROR", `lane emitted invalid JSON: ${String(error)}; stderr: ${processResult.stderr.slice(-4_000)}`);
  }
}

export function nestedProcessTimeoutForLane(policy, laneId) {
  const reserve = policy?.nestedProcessFinalizationReserveMs?.[laneId];
  if (reserve === undefined) return null;
  const timeout = policy?.laneTimeoutMs?.[laneId];
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new RangeError(`${laneId} lane timeout is invalid`);
  if (!Number.isSafeInteger(reserve) || reserve <= 0 || reserve >= timeout) throw new RangeError(`${laneId} nested-process finalization reserve is invalid`);
  return timeout - reserve;
}

function executionConfiguration(policy, environment) {
  const requested = String(environment.MQ_AUDIT_EXECUTION_MODE || "");
  const hosted = environment.GITHUB_ACTIONS === "true";
  const hostedDefault = policy.githubHosted.adoptionStatus === "QUALIFIED"
    ? policy.githubHosted.mode
    : policy.githubHosted.defaultBeforeQualification;
  const selected = requested || (hosted ? hostedDefault : policy.local.mode);
  const allowed = new Set([policy.local.mode, policy.githubHosted.mode]);
  if (!allowed.has(selected)) throw new TypeError(`Unknown audit execution mode ${selected}.`);
  if (selected === policy.githubHosted.mode && !hosted && requested) {
    throw new TypeError("Bounded parallel audit execution is restricted to the measured GitHub-hosted environment.");
  }
  return {
    mode: selected,
    maximumConcurrentLanes: selected === policy.githubHosted.mode
      ? policy.githubHosted.maximumConcurrentLanes
      : policy.local.maximumConcurrentLanes,
  };
}

function crossLaneIdentityIssues(results) {
  const expected = results.coverage?.engineSha256;
  const issues = [];
  if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) issues.push("coverage did not bind an engine SHA-256");
  for (const laneId of ["mutation", "generator"]) {
    if (results[laneId]?.engineSha256 !== expected) issues.push(`${laneId} engine SHA-256 does not match coverage`);
  }
  return issues;
}

export async function runBoundedAuditLanes({
  browserPath = null,
  candidateId,
  environment = process.env,
  execute = executeLaneProcess,
  indexPath,
  nodePath = process.execPath,
  policy,
  root,
  runId,
} = {}) {
  const laneIds = policy.laneOrder;
  if (JSON.stringify(laneIds) !== JSON.stringify(AUDIT_LANE_IDS)) throw new TypeError("Gate policy lane order does not match the closed executable lane set.");
  if (new Set(policy.boundedExecutionStartOrder).size !== laneIds.length
    || policy.boundedExecutionStartOrder.some((laneId) => !AUDIT_LANE_IDS.includes(laneId))) {
    throw new TypeError("Gate policy bounded execution start order is not an exact lane permutation.");
  }
  if (!exactKeys(policy.laneSchedulingClass, AUDIT_LANE_IDS)) throw new TypeError("Gate policy lane scheduling classes do not match the closed executable lane set.");
  for (const laneId of laneIds) {
    if (!new Set(["BOUNDED", "EXCLUSIVE"]).has(policy.laneSchedulingClass[laneId])) throw new TypeError(`Unknown scheduling class for ${laneId}.`);
  }
  const configuration = executionConfiguration(policy, environment);
  const envelopes = new Array(laneIds.length);
  let active = 0;
  let maximumObservedConcurrency = 0;
  const startedAt = performance.now();
  const runIndexes = async (indexes, maximumConcurrent) => {
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const localIndex = cursor;
        cursor += 1;
        if (localIndex >= indexes.length) return;
        const index = indexes[localIndex];
        const laneId = laneIds[index];
        active += 1;
        maximumObservedConcurrency = Math.max(maximumObservedConcurrency, active);
        try {
          envelopes[index] = await execute({
            browserPath,
            candidateId,
            indexPath,
            laneId,
            nodePath,
            root,
            runId,
            timeoutMs: policy.laneTimeoutMs[laneId],
            nestedProcessTimeoutMs: nestedProcessTimeoutForLane(policy, laneId),
          });
        } catch (error) {
          envelopes[index] = createAuditLaneEnvelope({
            candidateId,
            durationMs: 0,
            error: String(error),
            executionStatus: "ERROR",
            laneId,
            result: failedAuditLaneResult(laneId, String(error), "ERROR"),
            runId,
          });
        } finally {
          active -= 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(maximumConcurrent, indexes.length) }, worker));
  };
  const allIndexes = laneIds.map((_, index) => index);
  const cleanupBlockerFor = (index) => {
    const result = envelopes[index]?.result;
    if (result?.testProcessCleanupVerified === false) return "coverage test process-tree cleanup was not verified";
    if (result?.calibration?.processCleanupVerified === false) return "coverage calibration process-tree cleanup was not verified";
    return null;
  };
  const withholdUnstartedLanes = (reason) => {
    for (const index of allIndexes) {
      if (envelopes[index]) continue;
      const laneId = laneIds[index];
      envelopes[index] = createAuditLaneEnvelope({
        candidateId,
        durationMs: 0,
        error: reason,
        executionStatus: "NOT_RUN",
        laneId,
        result: failedAuditLaneResult(laneId, reason, "NOT_RUN"),
        runId,
      });
    }
  };
  if (configuration.mode === policy.local.mode) {
    for (const index of allIndexes) {
      await runIndexes([index], 1);
      const cleanupBlocker = cleanupBlockerFor(index);
      if (cleanupBlocker) {
        withholdUnstartedLanes(`${cleanupBlocker}; subsequent lanes were not started`);
        break;
      }
    }
  } else {
    const boundedIndexes = policy.boundedExecutionStartOrder.map((laneId) => laneIds.indexOf(laneId));
    let boundedSegment = [];
    let cleanupBlocked = false;
    for (const index of boundedIndexes) {
      const laneId = laneIds[index];
      if (policy.laneSchedulingClass[laneId] === "EXCLUSIVE") {
        await runIndexes(boundedSegment, configuration.maximumConcurrentLanes);
        boundedSegment = [];
        await runIndexes([index], 1);
        const cleanupBlocker = cleanupBlockerFor(index);
        if (cleanupBlocker) {
          withholdUnstartedLanes(`${cleanupBlocker}; subsequent lanes were not started`);
          cleanupBlocked = true;
          break;
        }
      } else {
        boundedSegment.push(index);
      }
    }
    if (!cleanupBlocked) await runIndexes(boundedSegment, configuration.maximumConcurrentLanes);
  }
  const wallDurationMs = roundMs(performance.now() - startedAt);
  const envelopeIssues = auditLaneEnvelopeIssues(envelopes, { candidateId, runId, laneIds });
  if (envelopeIssues.length) throw new Error(`Audit lane envelope integrity failed: ${envelopeIssues.join("; ")}`);
  const ordered = laneIds.map((laneId) => envelopes.find((envelope) => envelope.laneId === laneId));
  const results = Object.fromEntries(ordered.map((envelope) => [envelope.laneId, envelope.result]));
  const identityIssues = crossLaneIdentityIssues(results);
  const executionIssues = ordered
    .filter((envelope) => envelope.executionStatus !== "COMPLETED")
    .map((envelope) => `${envelope.laneId} execution ended ${envelope.executionStatus}: ${envelope.error || "no detail"}`);
  const serialEquivalentDurationMs = ordered.reduce((sum, envelope) => sum + envelope.durationMs, 0);
  const observedOverlapReductionPercent = serialEquivalentDurationMs > 0
    ? Math.round((1 - (wallDurationMs / serialEquivalentDurationMs)) * 10_000) / 100
    : 0;
  const issues = [...identityIssues, ...executionIssues];
  return {
    report: {
      schemaVersion: 1,
      resultType: "MATH_QUEST_AUDIT_ORCHESTRATION",
      status: issues.length ? "FAIL" : "PASS",
      runId,
      candidateId,
      executionMode: configuration.mode,
      maximumConcurrentLanes: configuration.maximumConcurrentLanes,
      maximumObservedConcurrency,
      laneOrder: [...laneIds],
      boundedExecutionStartOrder: [...policy.boundedExecutionStartOrder],
      laneSchedulingClass: Object.fromEntries(laneIds.map((laneId) => [laneId, policy.laneSchedulingClass[laneId]])),
      wallDurationMs,
      serialEquivalentDurationMs,
      observedOverlapReductionPercent,
      minimumAdoptionReductionPercent: policy.minimumMeasuredWallTimeReductionPercent,
      automaticRetries: 0,
      laneExecutions: ordered.map(({ laneId, executionStatus, durationMs, error, result }) => ({
        laneId,
        executionStatus,
        durationMs,
        resultStatus: result.status ?? "UNKNOWN",
        error,
      })),
      issues,
    },
    results,
  };
}

const removeKeys = (record, keys) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  for (const key of keys) delete record[key];
};

function timingFreeProjection(report) {
  const projected = structuredClone(report);
  removeKeys(projected, ["auditOrchestration", "generatedAt"]);
  removeKeys(projected.outcomeSummary, ["runId"]);
  removeKeys(projected.coverage, ["testOutput"]);
  removeKeys(projected.coverage?.calibration, ["output"]);
  for (const result of projected.engine?.results ?? []) removeKeys(result, ["durationMs"]);
  for (const family of projected.mutation?.families ?? []) {
    removeKeys(family.target, ["durationMs"]);
    for (const item of family.cases ?? []) removeKeys(item.target, ["durationMs"]);
  }
  removeKeys(projected.generator, ["stderr"]);
  removeKeys(projected.browser, ["dumpTail"]);
  removeKeys(projected.browser?.process, ["browserPath", "debugPort", "durationMs", "stderr", "stdout"]);
  removeKeys(projected.playwright?.process, ["durationMs", "stderr", "stdout"]);
  removeKeys(projected.playwright, ["generatedAt"]);
  for (const result of projected.playwright?.results ?? []) removeKeys(result, ["durationMs"]);
  for (const key of ["requests", "unexpectedRequests"]) {
    if (Array.isArray(projected.browser?.[key])) {
      projected.browser[key] = projected.browser[key].map((request) => ({
        method: request.method,
        pathname: request.pathname,
      }));
    }
  }
  removeKeys(projected.publicCandidate?.before, ["stderr"]);
  removeKeys(projected.publicCandidate?.after, ["stderr"]);
  return projected;
}

export function canonicalAuditEvidenceBytes(report) {
  return Buffer.from(`${JSON.stringify(timingFreeProjection(report))}\n`, "utf8");
}

export function canonicalAuditEvidenceSha256(report) {
  return createHash("sha256").update(canonicalAuditEvidenceBytes(report)).digest("hex");
}

export function compareAuditExecutionReports(serialReport, parallelReport, { minimumReductionPercent = 20 } = {}) {
  const serialOrchestration = serialReport?.auditOrchestration;
  const parallelOrchestration = parallelReport?.auditOrchestration;
  const issues = [];
  if (serialOrchestration?.executionMode !== "SERIAL_REFERENCE") issues.push("serial report execution mode is not SERIAL_REFERENCE");
  if (parallelOrchestration?.executionMode !== "BOUNDED_PARALLEL") issues.push("parallel report execution mode is not BOUNDED_PARALLEL");
  if (serialOrchestration?.status !== "PASS") issues.push("serial orchestration did not pass");
  if (parallelOrchestration?.status !== "PASS") issues.push("parallel orchestration did not pass");
  if (!serialOrchestration?.candidateId || serialOrchestration.candidateId !== parallelOrchestration?.candidateId) issues.push("reports do not bind the same public candidate");
  const serialBytes = canonicalAuditEvidenceBytes(serialReport);
  const parallelBytes = canonicalAuditEvidenceBytes(parallelReport);
  const evidenceEquivalent = serialBytes.equals(parallelBytes);
  if (!evidenceEquivalent) issues.push("timing-free canonical gate evidence differs");
  const serialWallDurationMs = roundMs(serialOrchestration?.wallDurationMs);
  const parallelWallDurationMs = roundMs(parallelOrchestration?.wallDurationMs);
  const measuredWallTimeReductionPercent = serialWallDurationMs > 0
    ? Math.round((1 - (parallelWallDurationMs / serialWallDurationMs)) * 10_000) / 100
    : 0;
  if (measuredWallTimeReductionPercent < minimumReductionPercent) {
    issues.push(`measured wall-time reduction ${measuredWallTimeReductionPercent}% is below ${minimumReductionPercent}%`);
  }
  return {
    schemaVersion: 1,
    resultType: "MATH_QUEST_AUDIT_EXECUTION_COMPARISON",
    status: issues.length ? "FAIL" : "PASS",
    candidateId: serialOrchestration?.candidateId || null,
    serialCanonicalEvidenceSha256: createHash("sha256").update(serialBytes).digest("hex"),
    parallelCanonicalEvidenceSha256: createHash("sha256").update(parallelBytes).digest("hex"),
    evidenceEquivalent,
    serialWallDurationMs,
    parallelWallDurationMs,
    measuredWallTimeReductionPercent,
    minimumReductionPercent,
    issues,
  };
}
