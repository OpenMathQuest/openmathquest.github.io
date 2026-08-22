import { createHash } from "node:crypto";

export const PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID = "math-quest:playwright-interaction-fuzz:v1";
export const PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION = 1;
export const PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM = "none:diagnostic-only";
export const PLAYWRIGHT_INTERACTION_FUZZ_RUNS = 12;
export const PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS = 16;
export const PLAYWRIGHT_INTERACTION_FUZZ_WORKERS = 1;
export const PLAYWRIGHT_INTERACTION_FUZZ_RETRIES = 0;
export const PLAYWRIGHT_INTERACTION_FUZZ_MIN_ACTIONS_PER_PROJECT = PLAYWRIGHT_INTERACTION_FUZZ_RUNS;
export const PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN = Object.freeze({
  playwrightTest: "1.62.1",
  fastCheck: "4.9.0",
  pureRand: "8.4.2",
});

export const PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS = Object.freeze([
  Object.freeze({
    id: "edge-desktop",
    seed: 12071987,
    inputMethod: "click",
    viewport: Object.freeze({ width: 1366, height: 768 }),
    hasTouch: false,
  }),
  Object.freeze({
    id: "edge-phone",
    seed: 29111991,
    inputMethod: "tap",
    viewport: Object.freeze({ width: 390, height: 844 }),
    hasTouch: true,
  }),
]);

export const PLAYWRIGHT_INTERACTION_FUZZ_ACTION_FAMILIES = Object.freeze([
  Object.freeze({
    id: "world",
    selector: 'button[data-action="world"]',
    allowedDataActions: Object.freeze(["world"]),
  }),
  Object.freeze({
    id: "start",
    selector: 'button[data-action="start"]',
    allowedDataActions: Object.freeze(["start"]),
  }),
  Object.freeze({
    id: "advance",
    selector: [
      'button[data-action="choose-question"]',
      'button[data-action="physical-done"]',
      'button[data-action="next"]',
      'button[data-action="one-more"]',
      'button[data-action="done-now"]',
      'button[data-action="finish"]',
    ].join(","),
    allowedDataActions: Object.freeze([
      "choose-question",
      "physical-done",
      "next",
      "one-more",
      "done-now",
      "finish",
    ]),
  }),
  Object.freeze({
    id: "answer",
    selector: [
      '.question-response button[data-action="select"]',
      '.question-response button[data-action="response"]',
      '.question-response button[data-action="model-cell"]',
      '.question-response button[data-action="line-mark"]',
      '.question-response button[data-action="key"]',
      ".question-response button[data-response-action]",
    ].join(","),
    allowedDataActions: Object.freeze(["select", "response", "model-cell", "line-mark", "key"]),
  }),
  Object.freeze({
    id: "confirm",
    selector: 'button[data-action="confirm"]',
    allowedDataActions: Object.freeze(["confirm"]),
  }),
  Object.freeze({
    id: "tutorial",
    selector: [
      'button[data-action="tutorial"]',
      'button[data-action="tutorial-next"]',
      'button[data-action="tutorial-previous"]',
      'button[data-action="tutorial-back"]',
    ].join(","),
    allowedDataActions: Object.freeze([
      "tutorial",
      "tutorial-next",
      "tutorial-previous",
      "tutorial-back",
    ]),
  }),
  Object.freeze({
    id: "home",
    selector: 'button[data-action="home"]',
    allowedDataActions: Object.freeze(["home"]),
  }),
]);

export const PLAYWRIGHT_INTERACTION_FUZZ_FORBIDDEN_DATA_ACTIONS = Object.freeze([
  "backup-export",
  "backup-import",
  "grown",
  "import",
  "name-edit",
  "name-remove",
  "parents",
  "placement-start",
  "preview",
  "reset",
]);

export const PLAYWRIGHT_INTERACTION_FUZZ_ALLOWED_RESPONSE_ACTIONS = Object.freeze([
  "action-value",
  "area-cut",
  "bond-deal",
  "clear",
  "coin-add",
  "count-number",
  "count-touch",
  "deal",
  "direct-action",
  "expression-rule",
  "fact-equation",
  "fraction-denominator",
  "fraction-region",
  "fraction-template",
  "graph-change",
  "graph-interpret",
  "group-deal",
  "group-round",
  "landmark-place",
  "order-card",
  "pair-item",
  "pair-relation",
  "pattern-token",
  "place-value-action",
  "place-value-value",
  "route-move",
  "scale-mark",
  "slot-token",
  "sort-bin",
  "sort-item",
  "strategy-select",
  "strategy-value",
  "strategy-work",
  "symmetry-line",
  "undo",
  "volume-layer",
  "volume-method",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
}

export function interactionFuzzSha256(value) {
  const bytes = typeof value === "string" ? value : JSON.stringify(stableJsonValue(value));
  return createHash("sha256").update(bytes).digest("hex");
}

export function interactionFuzzEffectFindings(before, after) {
  const findings = [];
  if (!isPlainObject(before) || !isPlainObject(after)) return ["effect snapshots must be objects"];
  if (before.domDigest === after.domDigest) findings.push("native activation produced no visible DOM effect");
  if (after.rootVisible !== true) findings.push("#app is not visibly rendered after activation");
  if (after.locationPath !== "/" && after.locationPath !== "/index.html") {
    findings.push(`activation escaped the allowed app path: ${String(after.locationPath)}`);
  }
  if (after.saveValidationError !== null) {
    findings.push(`saved progress failed MathQuestEngine.validateState: ${String(after.saveValidationError)}`);
  }
  if (after.childIdentityMode !== "anonymous") {
    findings.push(`synthetic run left anonymous identity mode: ${String(after.childIdentityMode)}`);
  }
  return findings;
}

export function interactionFuzzAllowedActionFindings(action) {
  if (!isPlainObject(action)) return ["action descriptor must be an object"];
  const family = PLAYWRIGHT_INTERACTION_FUZZ_ACTION_FAMILIES.find((candidate) => candidate.id === action.familyId);
  if (!family) return [`unknown action family: ${String(action.familyId)}`];
  const dataAction = action.dataAction === null ? null : String(action.dataAction || "");
  const responseAction = action.responseAction === null ? null : String(action.responseAction || "");
  if (PLAYWRIGHT_INTERACTION_FUZZ_FORBIDDEN_DATA_ACTIONS.includes(dataAction)) {
    return [`forbidden data-action selected: ${dataAction}`];
  }
  if (responseAction) {
    if (family.id !== "answer") return [`data-response-action escaped answer family: ${responseAction}`];
    if (dataAction !== "response") return [`data-response-action ${responseAction} lacks the closed response data-action`];
    if (!PLAYWRIGHT_INTERACTION_FUZZ_ALLOWED_RESPONSE_ACTIONS.includes(responseAction)) {
      return [`unknown or forbidden data-response-action selected: ${responseAction}`];
    }
    return [];
  }
  if (!family.allowedDataActions.includes(dataAction)) {
    return [`data-action ${String(dataAction)} is not allowed for family ${family.id}`];
  }
  return [];
}

export function interactionFuzzReplayPath(counterexampleText) {
  const match = String(counterexampleText || "").match(/replayPath=["']([^"']+)["']/u);
  return match ? match[1] : null;
}

export function interactionFuzzSafeError(error) {
  const message = error instanceof Error ? error.message : String(error || "unknown failure");
  return message.replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^:\r\n]*/gu, "<local-path>").slice(0, 2_000);
}

export async function interactionFuzzMinimizedFailureEvidence(details, counterexampleText, execute) {
  if (!details?.failed || !Array.isArray(details.counterexample) || details.counterexample.length !== 1) {
    throw new Error("fast-check did not supply one minimized failing counterexample.");
  }
  if (typeof execute !== "function") throw new Error("A minimized-counterexample executor is required.");
  const originalMessage = interactionFuzzSafeError(details.errorInstance);
  const replay = await execute(details.counterexample[0]);
  const replayMessage = replay?.error
    ? interactionFuzzSafeError(replay.error)
    : "minimized counterexample did not reproduce its failure";
  return {
    message: originalMessage,
    replayMessage,
    replayVerified: Boolean(replay?.error) && originalMessage === replayMessage,
    counterexample: interactionFuzzSafeError(counterexampleText),
    minimizedActionTrace: Array.isArray(replay?.trace) ? replay.trace : [],
  };
}

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function boundedString(value, min, max) {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function evidenceTextFindings(value, label, min = 1, max = 2_000) {
  const findings = [];
  if (!boundedString(value, min, max)) return [`${label} must be a string of ${min}-${max} characters`];
  if (/[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home)\//iu.test(value)) findings.push(`${label} contains an absolute local path`);
  if (/\b(?:GH_TOKEN|GITHUB_TOKEN|Authorization:\s*Bearer)\b/iu.test(value)) findings.push(`${label} contains a credential marker`);
  return findings;
}

function traceRecordFindings(record, index) {
  const findings = [];
  const keys = [
    "actionIndex", "familyId", "generatedOrdinal", "selectedOrdinal", "dataAction", "responseAction",
    "key", "value", "accessibleName", "beforeDomDigest", "afterDomDigest", "beforeSaveDigest",
    "afterSaveDigest", "locationPath", "outcome", "findings",
  ];
  if (!exactKeys(record, keys)) return [`failure trace ${index} has an unknown or missing field`];
  if (record.actionIndex !== index) findings.push(`failure trace ${index} has a non-sequential actionIndex`);
  if (!Number.isInteger(record.generatedOrdinal) || record.generatedOrdinal < 0 || record.generatedOrdinal > 127) {
    findings.push(`failure trace ${index} has an invalid generatedOrdinal`);
  }
  if (!Number.isInteger(record.selectedOrdinal) || record.selectedOrdinal < 0) {
    findings.push(`failure trace ${index} has an invalid selectedOrdinal`);
  }
  findings.push(...interactionFuzzAllowedActionFindings(record).map((finding) => `failure trace ${index}: ${finding}`));
  for (const field of ["key", "value"]) {
    if (record[field] !== null && !boundedString(record[field], 1, 500)) findings.push(`failure trace ${index} ${field} is malformed`);
  }
  findings.push(...evidenceTextFindings(record.accessibleName, `failure trace ${index} accessibleName`, 1, 500));
  for (const field of ["beforeDomDigest", "afterDomDigest", "beforeSaveDigest", "afterSaveDigest"]) {
    if (record[field] !== null && !/^[a-f0-9]{64}$/u.test(record[field])) findings.push(`failure trace ${index} ${field} is malformed`);
  }
  if (record.locationPath !== null && record.locationPath !== "/" && record.locationPath !== "/index.html") {
    findings.push(`failure trace ${index} escaped the allowed app path`);
  }
  if (record.outcome !== "passed" && record.outcome !== "failed") findings.push(`failure trace ${index} has an invalid outcome`);
  const findingsAreValid = Array.isArray(record.findings)
    && record.findings.every((finding) => boundedString(finding, 1, 2_000));
  if (!findingsAreValid) {
    findings.push(`failure trace ${index} findings are malformed`);
  }
  if (record.outcome === "passed") {
    if (findingsAreValid && record.findings.length !== 0) findings.push(`passing failure trace ${index} contains findings`);
    if ([record.beforeDomDigest, record.afterDomDigest, record.beforeSaveDigest, record.afterSaveDigest].includes(null)) {
      findings.push(`passing failure trace ${index} lacks complete digests`);
    }
    if (record.beforeDomDigest === record.afterDomDigest) findings.push(`passing failure trace ${index} records a visible no-op`);
  } else if (record.outcome === "failed" && findingsAreValid && record.findings.length === 0) {
    findings.push(`failed failure trace ${index} lacks a finding`);
  }
  return findings;
}

function failureEvidenceFindings(failure, project) {
  const findings = [];
  const keys = [
    "message", "replayMessage", "replayVerified", "counterexample", "minimizedActionTrace", "screenshotPath",
  ];
  if (!exactKeys(failure, keys)) return ["failed shard has an unknown or missing failure-evidence field"];
  findings.push(...evidenceTextFindings(failure.message, "failure message"));
  findings.push(...evidenceTextFindings(failure.replayMessage, "failure replayMessage"));
  findings.push(...evidenceTextFindings(failure.counterexample, "failure counterexample", 1, 10_000));
  if (failure.replayVerified !== true) findings.push("minimized counterexample replay is not verified");
  if (failure.message !== failure.replayMessage) findings.push("minimized counterexample replay did not reproduce the same failure");
  const expectedScreenshotPath = `audit/.tmp-playwright-interaction-fuzz/${project.id}-failure.png`;
  if (failure.screenshotPath !== expectedScreenshotPath) findings.push("failure screenshot path does not match the closed project path");
  if (!Array.isArray(failure.minimizedActionTrace)
      || failure.minimizedActionTrace.length < 1
      || failure.minimizedActionTrace.length > PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS) {
    findings.push("failed shard must contain a bounded nonempty minimized action trace");
  } else {
    failure.minimizedActionTrace.forEach((record, index) => findings.push(...traceRecordFindings(record, index)));
    if (failure.minimizedActionTrace.at(-1)?.outcome !== "failed") findings.push("minimized action trace does not end at the failure");
  }
  return findings;
}

export function playwrightInteractionFuzzShardFindings(shard) {
  const findings = [];
  const requiredKeys = [
    "schemaVersion", "contractId", "certificationClaim", "status", "project", "toolchain",
    "seed", "path", "replayPath", "configuredRuns", "maxCommandsPerRun", "workers", "retries",
    "numRuns", "numSkips", "numShrinks", "propertyEvaluations", "browserActionExecutions", "failure",
  ];
  if (!exactKeys(shard, requiredKeys)) return ["shard has an unknown or missing top-level field"];
  if (shard.schemaVersion !== PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION) findings.push("unexpected schemaVersion");
  if (shard.contractId !== PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID) findings.push("unexpected contractId");
  if (shard.certificationClaim !== PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM) findings.push("diagnostic lane claimed certification");
  if (shard.status !== "passed" && shard.status !== "failed") findings.push("status must be passed or failed");
  const expectedProject = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.find((candidate) => candidate.id === shard.project?.id);
  if (!expectedProject || !exactKeys(shard.project, ["id", "inputMethod", "viewport", "hasTouch"])) {
    findings.push("unknown or malformed project");
  } else if (JSON.stringify(shard.project) !== JSON.stringify({
    id: expectedProject.id,
    inputMethod: expectedProject.inputMethod,
    viewport: expectedProject.viewport,
    hasTouch: expectedProject.hasTouch,
  })) findings.push("project does not match the closed profile");
  if (JSON.stringify(shard.toolchain) !== JSON.stringify(PLAYWRIGHT_INTERACTION_FUZZ_TOOLCHAIN)) findings.push("toolchain identity mismatch");
  if (!Number.isInteger(shard.seed)) findings.push("seed must be an integer");
  else if (expectedProject && shard.seed !== expectedProject.seed) findings.push("seed does not match the closed project seed");
  if (shard.configuredRuns !== PLAYWRIGHT_INTERACTION_FUZZ_RUNS) findings.push("configured run count changed");
  if (shard.maxCommandsPerRun !== PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS) findings.push("maximum command count changed");
  if (shard.workers !== PLAYWRIGHT_INTERACTION_FUZZ_WORKERS) findings.push("worker count changed");
  if (shard.retries !== PLAYWRIGHT_INTERACTION_FUZZ_RETRIES) findings.push("retry count changed");
  for (const field of ["numRuns", "numSkips", "numShrinks", "propertyEvaluations", "browserActionExecutions"]) {
    if (!Number.isInteger(shard[field]) || shard[field] < 0) findings.push(`${field} must be a non-negative integer`);
  }
  if (shard.numSkips !== 0) findings.push("shard contains unexpected skipped property runs");
  if (shard.numRuns < 1 || shard.numRuns > shard.configuredRuns) findings.push("numRuns is outside the configured run budget");
  if (shard.propertyEvaluations < shard.numRuns + shard.numShrinks) findings.push("propertyEvaluations is inconsistent with runs and shrinks");
  const replayEvaluations = shard.status === "failed" ? 1 : 0;
  if (shard.browserActionExecutions > (shard.propertyEvaluations + replayEvaluations) * shard.maxCommandsPerRun) {
    findings.push("browserActionExecutions exceeds the measured evaluation budget");
  }
  if (shard.status === "passed") {
    if (shard.failure !== null || shard.path !== null || shard.replayPath !== null) findings.push("passing shard contains failure-only data");
    if (shard.numRuns !== shard.configuredRuns) findings.push("passing shard did not execute every configured run");
    if (shard.numShrinks !== 0) findings.push("passing shard reports shrink attempts");
    if (shard.propertyEvaluations !== shard.configuredRuns) findings.push("passing shard propertyEvaluations is not the literal run count");
    if (shard.browserActionExecutions < PLAYWRIGHT_INTERACTION_FUZZ_MIN_ACTIONS_PER_PROJECT) {
      findings.push("passing shard exercised too few randomized browser actions");
    }
  } else {
    if (!isPlainObject(shard.failure)) findings.push("failed shard is missing failure evidence");
    else if (expectedProject) {
      findings.push(...failureEvidenceFindings(shard.failure, expectedProject));
      if (interactionFuzzReplayPath(shard.failure.counterexample) !== shard.replayPath) {
        findings.push("fast-check command replay path contradicts the minimized counterexample");
      }
    }
    if (!boundedString(shard.path, 1, 500)
        || !/^(?:0|[1-9][0-9]*)(?::(?:0|[1-9][0-9]*))*$/u.test(shard.path)) {
      findings.push("failed shard has a missing or noncanonical fast-check counterexample path");
    }
    if (!boundedString(shard.replayPath, 1, 500)
        || !/^[A-Za-z0-9+/]+:[A-Za-z0-9+/]+$/u.test(shard.replayPath)) {
      findings.push("failed shard has a missing or noncanonical fast-check command replay path");
    }
    if (shard.browserActionExecutions < 1) findings.push("failed shard exercised no randomized browser action");
  }
  return findings;
}

export function playwrightInteractionFuzzArtifactFindings(shards, outputNames) {
  const findings = [];
  const names = outputNames instanceof Set ? outputNames : new Set(outputNames || []);
  for (const shard of Array.isArray(shards) ? shards : []) {
    const projectId = shard?.project?.id;
    if (!projectId) continue;
    const screenshotName = `${projectId}-failure.png`;
    if (shard.status === "failed" && !names.has(screenshotName)) findings.push(`${projectId}: failure screenshot is missing`);
    if (shard.status === "passed" && names.has(screenshotName)) findings.push(`${projectId}: passing shard retained a failure screenshot`);
  }
  return findings;
}

export function playwrightInteractionFuzzReportFindings(report) {
  const findings = [];
  if (!exactKeys(report, ["schemaVersion", "contractId", "certificationClaim", "summary", "shards"])) {
    return ["report has an unknown or missing top-level field"];
  }
  if (report.schemaVersion !== PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION) findings.push("unexpected report schemaVersion");
  if (report.contractId !== PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID) findings.push("unexpected report contractId");
  if (report.certificationClaim !== PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM) findings.push("report claimed certification");
  if (!Array.isArray(report.shards) || report.shards.length !== PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.length) {
    findings.push("report must contain exactly one shard per closed project");
  } else {
    const ids = report.shards.map((shard) => shard?.project?.id);
    if (new Set(ids).size !== ids.length) findings.push("report contains duplicate project shards");
    for (const project of PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS) {
      if (!ids.includes(project.id)) findings.push(`missing project shard: ${project.id}`);
    }
    for (const shard of report.shards) {
      findings.push(...playwrightInteractionFuzzShardFindings(shard).map((finding) => `${shard?.project?.id || "unknown"}: ${finding}`));
    }
  }
  if (!exactKeys(report.summary, ["expectedProjects", "passedProjects", "failedProjects", "browserActionExecutions"])) {
    findings.push("report summary has an unknown or missing field");
  } else if (Array.isArray(report.shards)) {
    const expected = PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.length;
    const passed = report.shards.filter((shard) => shard.status === "passed").length;
    const failed = report.shards.filter((shard) => shard.status === "failed").length;
    const actions = report.shards.reduce((total, shard) => total + Number(shard.browserActionExecutions || 0), 0);
    if (report.summary.expectedProjects !== expected) findings.push("summary expectedProjects is not literal inventory");
    if (report.summary.passedProjects !== passed) findings.push("summary passedProjects is not literal pass count");
    if (report.summary.failedProjects !== failed) findings.push("summary failedProjects is not literal failure count");
    if (report.summary.browserActionExecutions !== actions) findings.push("summary browserActionExecutions is not the shard sum");
  }
  return findings;
}

export function buildPlaywrightInteractionFuzzReport(shards) {
  return {
    schemaVersion: PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION,
    contractId: PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID,
    certificationClaim: PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM,
    summary: {
      expectedProjects: PLAYWRIGHT_INTERACTION_FUZZ_PROJECTS.length,
      passedProjects: shards.filter((shard) => shard.status === "passed").length,
      failedProjects: shards.filter((shard) => shard.status === "failed").length,
      browserActionExecutions: shards.reduce((total, shard) => total + Number(shard.browserActionExecutions || 0), 0),
    },
    shards,
  };
}
