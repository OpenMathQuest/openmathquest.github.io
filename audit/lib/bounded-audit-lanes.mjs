export { canonicalAuditEvidenceBytes, compareAuditExecutionReports } from "./audit-evidence-comparison.mjs";
import { runTreeSupervisedProcess } from "./audit-process-supervisor.mjs";
export { processTreeCleanupVerified, runTreeSupervisedProcess } from "./audit-process-supervisor.mjs";
import { AUDIT_LANE_IDS, failedAuditLaneResult, createAuditLaneEnvelope, auditLaneEnvelopeIssues, nestedProcessTimeoutForLane, nestedConcurrencyMaximumForLane, exactKeys, roundMs } from "./audit-lane-contract.mjs";
export { AUDIT_LANE_IDS, failedAuditLaneResult, createAuditLaneEnvelope, auditLaneEnvelopeIssues, auditCandidateStabilityIssues, interpretJsonChildCompletion, nestedProcessTimeoutForLane, nestedConcurrencyMaximumForLane } from "./audit-lane-contract.mjs";
import path from "node:path";
import { performance } from "node:perf_hooks";

function timedOutLaneMessage(processResult, timeoutMs) {
  const cleanup = processResult.cleanupVerified ? "descendant cleanup verified" : `descendant cleanup unverified (${processResult.cleanupDetail})`;
  return `lane exceeded ${timeoutMs} ms; ${cleanup}`;
}

function failedLaneExitMessage(processResult) {
  return `lane process ended with code ${processResult.exitCode ?? "null"} and signal ${processResult.signal ?? "null"}; descendant cleanup verified=${String(processResult.cleanupVerified)}: ${processResult.stderr.slice(-4_000)}`;
}

function laneExecutionFailure(processResult, timeoutMs) {
  if (processResult.timedOut) return { status: "TIMEOUT", message: timedOutLaneMessage(processResult, timeoutMs) };
  if (processResult.outputOverflow) return { status: "ERROR", message: `lane output exceeded 32 MiB; cleanup verified=${String(processResult.cleanupVerified)}` };
  if (processResult.spawnError) return { status: "ERROR", message: `${processResult.spawnError}; descendant cleanup verified=${String(processResult.cleanupVerified)}` };
  if (processResult.exitCode !== 0 || processResult.signal) return { status: "ERROR", message: failedLaneExitMessage(processResult) };
  return null;
}

async function executeLaneProcess({
  browserPath, candidateId, indexPath, laneId, nestedProcessTimeoutMs = null,
  nestedConcurrencyMaximum = null, nodePath, processEnvironment = process.env,
  root, runId, timeoutMs,
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
  const childEnvironment = { ...processEnvironment };
  if (laneId === "browser" && nestedConcurrencyMaximum !== null) {
    childEnvironment.MQ_BROWSER_SHARD_MAXIMUM = String(nestedConcurrencyMaximum);
  }
  const processResult = await runTreeSupervisedProcess({ command: nodePath, args, cwd: root, env: childEnvironment, timeoutMs });
  const fail = (executionStatus, message) => createAuditLaneEnvelope({
    candidateId,
    durationMs: processResult.durationMs,
    error: message,
    executionStatus,
    laneId,
    result: failedAuditLaneResult(laneId, message, executionStatus),
    runId,
  });
  const failure = laneExecutionFailure(processResult, timeoutMs);
  if (failure) return fail(failure.status, failure.message);
  try {
    return JSON.parse(processResult.stdout);
  } catch (error) {
    return fail("ERROR", `lane emitted invalid JSON: ${String(error)}; stderr: ${processResult.stderr.slice(-4_000)}`);
  }
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

function validateLanePolicy(policy) {
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
  return laneIds;
}

function createLaneRunner({ envelopes, laneIds, configuration, execute, browserPath, candidateId, indexPath, policy, nodePath, environment, root, runId }, tracking) {
  const runIndexes = async (indexes, maximumConcurrent) => {
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const localIndex = cursor;
        cursor += 1;
        if (localIndex >= indexes.length) return;
        const index = indexes[localIndex];
        const laneId = laneIds[index];
        tracking.active += 1;
        tracking.maximumObservedConcurrency = Math.max(tracking.maximumObservedConcurrency, tracking.active);
        try {
          envelopes[index] = await execute({
            browserPath,
            candidateId,
            indexPath,
            laneId,
            nestedConcurrencyMaximum: nestedConcurrencyMaximumForLane(policy, laneId, configuration.mode),
            nodePath,
            processEnvironment: environment,
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
          tracking.active -= 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(maximumConcurrent, indexes.length) }, worker));
  };
  return runIndexes;
}

function createLaneCleanup({ envelopes, allIndexes, laneIds, candidateId, runId }) {
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
  return { cleanupBlockerFor, withholdUnstartedLanes };
}

async function runScheduledLanes(context) {
  const { configuration, policy, allIndexes, runIndexes, cleanupBlockerFor, withholdUnstartedLanes } = context;
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
    await runParallelLanes(context);
  }
}

function assembleLaneReport({ envelopes, candidateId, runId, laneIds, configuration, policy, wallDurationMs, maximumObservedConcurrency }) {
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
      nestedConcurrencyMaximum: Object.fromEntries(laneIds.map((laneId) => [
        laneId,
        nestedConcurrencyMaximumForLane(policy, laneId, configuration.mode),
      ])),
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
  const laneIds = validateLanePolicy(policy);
  const configuration = executionConfiguration(policy, environment);
  const envelopes = new Array(laneIds.length);
  const tracking = { active: 0, maximumObservedConcurrency: 0 };
  const startedAt = performance.now();
  const runIndexes = createLaneRunner({ envelopes, laneIds, configuration, execute, browserPath, candidateId, indexPath, policy, nodePath, environment, root, runId }, tracking);
  const allIndexes = laneIds.map((_, index) => index);
  const { cleanupBlockerFor, withholdUnstartedLanes } = createLaneCleanup({ envelopes, allIndexes, laneIds, candidateId, runId });
  await runScheduledLanes({ configuration, policy, allIndexes, laneIds, runIndexes, cleanupBlockerFor, withholdUnstartedLanes });
  const wallDurationMs = roundMs(performance.now() - startedAt);
  return assembleLaneReport({ envelopes, candidateId, runId, laneIds, configuration, policy, wallDurationMs, maximumObservedConcurrency: tracking.maximumObservedConcurrency });

}


async function runParallelLanes({ policy, laneIds, configuration, runIndexes, cleanupBlockerFor, withholdUnstartedLanes }) {
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
