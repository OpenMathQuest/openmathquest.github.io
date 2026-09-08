import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GATE_INTEGRITY_POLICY } from "./gate-integrity-policy.mjs";
import { axeReportFindings } from "./axe-accessibility.mjs";

export const PLAYWRIGHT_FOCUSED_SCHEMA_VERSION = 2;
export const PLAYWRIGHT_FOCUSED_CONTRACT_ID = "math-quest-playwright-focused-v2";
export const PLAYWRIGHT_FOCUSED_WORKERS = GATE_INTEGRITY_POLICY.executionPolicy.nestedConcurrency.playwrightWorkers;
export const PLAYWRIGHT_FOCUSED_TEST_TIMEOUT_MS = GATE_INTEGRITY_POLICY.executionPolicy.focusedPlaywright.testTimeoutMs;
export const PLAYWRIGHT_FOCUSED_EXPECT_TIMEOUT_MS = GATE_INTEGRITY_POLICY.executionPolicy.focusedPlaywright.expectTimeoutMs;
export const PLAYWRIGHT_FOCUSED_AUTOMATIC_RETRIES = GATE_INTEGRITY_POLICY.executionPolicy.automaticRetries;
export const PLAYWRIGHT_TEST_VERSION = "1.62.1";
export const PLAYWRIGHT_FOCUSED_PROJECT_IDS = Object.freeze([
  "edge-desktop",
  "edge-phone",
]);
export const PLAYWRIGHT_FOCUSED_CASE_IDS = Object.freeze([
  "PW-F-01",
  "PW-F-02",
  "PW-F-03",
  "PW-F-04",
  "PW-F-05",
  "PW-F-06",
  "PW-F-07",
  "PW-F-08",
  "PW-F-09",
  "PW-F-10",
  "PW-F-11",
  "PW-F-12",
  "PW-F-13",
  "PW-F-14",
  "PW-F-15",
  "PW-F-16",
  "PW-F-17",
  "PW-F-18",
]);

export const PLAYWRIGHT_FOCUSED_SERVER_ROUTES = Object.freeze([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/release-shell-v1.json", "release-shell-v1.json"],
  ["/sw.js", "sw.js"],
  ["/curriculum/math-quest-tutorial-manifest-v1.json", "curriculum/math-quest-tutorial-manifest-v1.json"],
  ["/assets/design/math-quest-design-tokens-v1.css", "assets/design/math-quest-design-tokens-v1.css"],
  ["/assets/fonts/Inter-Variable.ttf", "assets/fonts/Inter-Variable.ttf"],
  ["/assets/icons/apple-touch-icon.png", "assets/icons/apple-touch-icon.png"],
  ["/assets/icons/icon-192.png", "assets/icons/icon-192.png"],
  ["/assets/icons/icon-512.png", "assets/icons/icon-512.png"],
  ["/assets/js/math-quest-progress-source.js", "assets/js/math-quest-progress-source.js"],
  ["/assets/js/math-quest-pwa-status.js", "assets/js/math-quest-pwa-status.js"],
  ["/assets/sounds/close.wav", "assets/sounds/close.wav"],
  ["/assets/sounds/confirm.wav", "assets/sounds/confirm.wav"],
  ["/assets/sounds/incorrect.wav", "assets/sounds/incorrect.wav"],
  ["/assets/sounds/tap.wav", "assets/sounds/tap.wav"],
  ["/LICENSE", "LICENSE"],
  ["/PRIVACY.md", "PRIVACY.md"],
  ["/THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]);

const expectedResultKeys = () => PLAYWRIGHT_FOCUSED_PROJECT_IDS
  .flatMap((projectId) => PLAYWRIGHT_FOCUSED_CASE_IDS.map((caseId) => `${projectId}:${caseId}`))
  .sort();

export const PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS = Object.freeze(expectedResultKeys());

export function playwrightChildProcessRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

export function reviewedEdgeExecutable(pathname) {
  return /^[A-Za-z]:\\Program Files(?: \(x86\))?\\Microsoft\\Edge\\Application\\msedge\.exe$/iu.test(String(pathname));
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function playwrightFocusedExpectedServerIdentity(root) {
  const absoluteRoot = path.resolve(root);
  const normalizedRoot = absoluteRoot.replace(/[\\/]+$/u, "").replaceAll("\\", "/").toLowerCase();
  const records = [];
  for (const [route, relativePath] of [...PLAYWRIGHT_FOCUSED_SERVER_ROUTES].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const bytes = await readFile(path.join(absoluteRoot, relativePath));
    records.push(`${route}\t${relativePath}\t${bytes.byteLength}\t${sha256(bytes)}`);
  }
  return {
    schemaVersion: 1,
    identity: "math-quest-local-server:v2",
    release: "1.0.0-beta.8",
    port: 8771,
    rootId: sha256(Buffer.from(normalizedRoot, "utf8")),
    servedPayloadSha256: sha256(Buffer.from(`${records.join("\n")}\n`, "utf8")),
  };
}

export function playwrightFocusedServerIdentityMatches(observed, expected) {
  const keys = ["schemaVersion", "identity", "release", "port", "rootId", "servedPayloadSha256"];
  return exactKeys(observed, keys)
    && exactKeys(expected, keys)
    && keys.every((key) => observed[key] === expected[key]);
}

const exactKeys = (value, expected) => Boolean(
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).length === expected.length
  && Object.keys(value).every((key, index) => key === expected[index]),
);

const isSha256 = (value) => /^[a-f0-9]{64}$/u.test(String(value));

function focusedIdentityFindings(report) {
  const valid = report.schemaVersion === PLAYWRIGHT_FOCUSED_SCHEMA_VERSION
    && report.contractId === PLAYWRIGHT_FOCUSED_CONTRACT_ID && Number.isFinite(Date.parse(report.generatedAt));
  return valid ? [] : ["report identity or timestamp is invalid"];
}

function focusedToolchainFindings(value) {
  const keys = ["runnerPackage", "runnerVersion", "browserProduct", "browserVersion", "browserExecutableSha256", "serverRootId", "servedPayloadSha256"];
  if (!exactKeys(value, keys)) return ["toolchain identity is invalid"];
  const valid = value.runnerPackage === "@playwright/test" && value.runnerVersion === PLAYWRIGHT_TEST_VERSION
    && value.browserProduct === "Microsoft Edge" && /^\d+\.\d+\.\d+\.\d+$/u.test(String(value.browserVersion))
    && [value.browserExecutableSha256, value.serverRootId, value.servedPayloadSha256].every(isSha256);
  return valid ? [] : ["toolchain identity is invalid"];
}

function focusedBindingFindings(report, expected) {
  const bindings = [
    ["expectedExecutableSha256", "browserExecutableSha256", "browser executable digest does not match the observed executable"],
    ["expectedRootId", "serverRootId", "server root digest does not match the reviewed checkout"],
    ["expectedServedPayloadSha256", "servedPayloadSha256", "served payload digest does not match the reviewed checkout"],
  ];
  return bindings.filter(([key, observed]) => expected[key] != null && report.toolchain?.[observed] !== expected[key]).map(([, , message]) => message);
}

function focusedPrivacyFindings(value) {
  const keys = ["usesSyntheticStateOnly", "includesChildName", "includesChildProgress", "includesTraceOnPass", "includesScreenshotOnPass", "uploadsFailureArtifacts"];
  if (!exactKeys(value, keys)) return ["privacy declaration is invalid"];
  const valid = value.usesSyntheticStateOnly === true && keys.slice(1).every((key) => value[key] === false);
  return valid ? [] : ["privacy declaration is invalid"];
}

function validFocusedSummary(report) {
  return exactKeys(report.summary, ["expected", "actual", "passed", "failed", "skipped", "unknown", "duplicates"])
    && report.summary.expected === PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length
    && Array.isArray(report.results) && report.summary.actual === report.results.length;
}

function countFocusedRow(row, state) {
  const key = row.projectId + ":" + row.caseId;
  if (row.key !== key || !PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.includes(key)) state.counts.unknown += 1;
  if (state.seen.has(key)) state.counts.duplicates += 1;
  state.seen.add(key);
  const statusKey = row.status === "passed" ? "passed" : row.status === "skipped" ? "skipped" : "failed";
  state.counts[statusKey] += 1;
  if (!Number.isFinite(row.durationMs) || row.durationMs < 0 || row.attempts !== 1) {
    state.findings.push("result timing or retry count is invalid: " + key);
  }
}

function focusedResultState(results) {
  const state = { seen: new Set(), counts: { passed: 0, failed: 0, skipped: 0, unknown: 0, duplicates: 0 }, findings: [] };
  for (const row of results) {
    if (!exactKeys(row, ["key", "projectId", "caseId", "status", "durationMs", "attempts"])) {
      state.findings.push("a result row does not use the exact closed schema");
    } else countFocusedRow(row, state);
  }
  return state;
}

function focusedResultFindings(report) {
  if (!validFocusedSummary(report)) return ["summary counts are invalid"];
  const state = focusedResultState(report.results);
  const expected = PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS;
  if (state.seen.size !== expected.length || expected.some((key) => !state.seen.has(key))) {
    state.findings.push("result set is missing one or more required project/case pairs");
  }
  if (Object.entries(state.counts).some(([key, count]) => report.summary[key] !== count)) state.findings.push("summary does not match the result rows");
  const clean = state.counts.passed === expected.length && ["failed", "skipped", "unknown", "duplicates"].every((key) => state.counts[key] === 0);
  if (!clean) state.findings.push("focused Playwright result set is not a clean pass");
  return state.findings;
}

export function playwrightFocusedReportFindings(report, expected = {}) {
  if (!exactKeys(report, ["schemaVersion", "contractId", "generatedAt", "toolchain", "privacy", "accessibility", "summary", "results"])) {
    return ["report must use the exact closed schema"];
  }
  const findings = [
    ...focusedIdentityFindings(report), ...focusedToolchainFindings(report.toolchain),
    ...focusedBindingFindings(report, expected), ...focusedPrivacyFindings(report.privacy),
    ...axeReportFindings(report.accessibility, { violationCount: 0, locationKeys: ["key"], validLocation: (row) => PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.includes(row.key) }),
    ...focusedResultFindings(report),
  ];
  return [...new Set(findings)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
    contractId: PLAYWRIGHT_FOCUSED_CONTRACT_ID,
    projects: PLAYWRIGHT_FOCUSED_PROJECT_IDS,
    cases: PLAYWRIGHT_FOCUSED_CASE_IDS,
    expectedResults: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length,
  })}\n`);
}
