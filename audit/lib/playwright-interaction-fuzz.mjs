import { createHash } from "node:crypto";

export const PLAYWRIGHT_INTERACTION_FUZZ_CONTRACT_ID = "math-quest:playwright-interaction-fuzz:v1";
export const PLAYWRIGHT_INTERACTION_FUZZ_SCHEMA_VERSION = 1;
export const PLAYWRIGHT_INTERACTION_FUZZ_CERTIFICATION_CLAIM = "none:diagnostic-only";
export const PLAYWRIGHT_INTERACTION_FUZZ_RUNS = 12;
export const PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS = 16;
export const PLAYWRIGHT_INTERACTION_FUZZ_WORKERS = 1;
export const PLAYWRIGHT_INTERACTION_FUZZ_RETRIES = 0;
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
  if (before.effectDigest === after.effectDigest) findings.push("native activation produced no observable state effect");
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
    return family.id === "answer" ? [] : [`data-response-action escaped answer family: ${responseAction}`];
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

function exactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

export function playwrightInteractionFuzzShardFindings(shard) {
  const findings = [];
  const requiredKeys = [
    "schemaVersion", "contractId", "certificationClaim", "status", "project", "toolchain",
    "seed", "path", "replayPath", "configuredRuns", "maxCommandsPerRun", "workers", "retries",
    "numRuns", "numSkips", "numShrinks", "browserActionExecutions", "failure",
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
  if (shard.configuredRuns !== PLAYWRIGHT_INTERACTION_FUZZ_RUNS) findings.push("configured run count changed");
  if (shard.maxCommandsPerRun !== PLAYWRIGHT_INTERACTION_FUZZ_MAX_COMMANDS) findings.push("maximum command count changed");
  if (shard.workers !== PLAYWRIGHT_INTERACTION_FUZZ_WORKERS) findings.push("worker count changed");
  if (shard.retries !== PLAYWRIGHT_INTERACTION_FUZZ_RETRIES) findings.push("retry count changed");
  for (const field of ["numRuns", "numSkips", "numShrinks", "browserActionExecutions"]) {
    if (!Number.isInteger(shard[field]) || shard[field] < 0) findings.push(`${field} must be a non-negative integer`);
  }
  if (shard.status === "passed") {
    if (shard.failure !== null || shard.path !== null || shard.replayPath !== null) findings.push("passing shard contains failure-only data");
    if (shard.numRuns !== shard.configuredRuns) findings.push("passing shard did not execute every configured run");
    if (shard.numSkips !== 0) findings.push("passing shard contains skipped generated runs");
    if (shard.browserActionExecutions < 1) findings.push("passing shard exercised no randomized browser action");
    if (shard.browserActionExecutions > shard.configuredRuns * shard.maxCommandsPerRun) findings.push("passing shard exceeded its browser-action budget");
  } else {
    if (!isPlainObject(shard.failure)) findings.push("failed shard is missing failure evidence");
    if (typeof shard.path !== "string" || !shard.path) findings.push("failed shard is missing fast-check counterexample path");
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
