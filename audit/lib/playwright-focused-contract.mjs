import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLAYWRIGHT_FOCUSED_SCHEMA_VERSION = 1;
export const PLAYWRIGHT_FOCUSED_CONTRACT_ID = "math-quest-playwright-focused-v1";
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
]);

export const PLAYWRIGHT_FOCUSED_SERVER_ROUTES = Object.freeze([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/release-shell-v1.json", "release-shell-v1.json"],
  ["/sw.js", "sw.js"],
  ["/assets/fonts/Inter-Variable.ttf", "assets/fonts/Inter-Variable.ttf"],
  ["/assets/icons/apple-touch-icon.png", "assets/icons/apple-touch-icon.png"],
  ["/assets/icons/icon-192.png", "assets/icons/icon-192.png"],
  ["/assets/icons/icon-512.png", "assets/icons/icon-512.png"],
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
    release: "1.0.0-beta.6",
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

export function playwrightFocusedReportFindings(report, { expectedExecutableSha256 = null, expectedRootId = null, expectedServedPayloadSha256 = null } = {}) {
  const findings = [];
  if (!exactKeys(report, ["schemaVersion", "contractId", "generatedAt", "toolchain", "privacy", "summary", "results"])) {
    findings.push("report must use the exact closed schema");
    return findings;
  }
  if (report.schemaVersion !== PLAYWRIGHT_FOCUSED_SCHEMA_VERSION
      || report.contractId !== PLAYWRIGHT_FOCUSED_CONTRACT_ID
      || !Number.isFinite(Date.parse(report.generatedAt))) {
    findings.push("report identity or timestamp is invalid");
  }
  if (!exactKeys(report.toolchain, ["runnerPackage", "runnerVersion", "browserProduct", "browserVersion", "browserExecutableSha256", "serverRootId", "servedPayloadSha256"])
      || report.toolchain.runnerPackage !== "@playwright/test"
      || report.toolchain.runnerVersion !== PLAYWRIGHT_TEST_VERSION
      || report.toolchain.browserProduct !== "Microsoft Edge"
      || !/^\d+\.\d+\.\d+\.\d+$/u.test(String(report.toolchain.browserVersion))
      || !isSha256(report.toolchain.browserExecutableSha256)
      || !isSha256(report.toolchain.serverRootId)
      || !isSha256(report.toolchain.servedPayloadSha256)) {
    findings.push("toolchain identity is invalid");
  }
  if (expectedExecutableSha256 !== null && report.toolchain?.browserExecutableSha256 !== expectedExecutableSha256) {
    findings.push("browser executable digest does not match the observed executable");
  }
  if (expectedRootId !== null && report.toolchain?.serverRootId !== expectedRootId) findings.push("server root digest does not match the reviewed checkout");
  if (expectedServedPayloadSha256 !== null && report.toolchain?.servedPayloadSha256 !== expectedServedPayloadSha256) findings.push("served payload digest does not match the reviewed checkout");
  if (!exactKeys(report.privacy, ["usesSyntheticStateOnly", "includesChildName", "includesChildProgress", "includesTraceOnPass", "includesScreenshotOnPass", "uploadsFailureArtifacts"])
      || report.privacy.usesSyntheticStateOnly !== true
      || Object.entries(report.privacy).some(([key, value]) => key !== "usesSyntheticStateOnly" && value !== false)) {
    findings.push("privacy declaration is invalid");
  }
  if (!exactKeys(report.summary, ["expected", "actual", "passed", "failed", "skipped", "unknown", "duplicates"])
      || report.summary.expected !== PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length
      || report.summary.actual !== report.results?.length
      || !Array.isArray(report.results)) {
    findings.push("summary counts are invalid");
    return findings;
  }
  const seen = new Set();
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let unknown = 0;
  let duplicates = 0;
  for (const row of report.results) {
    if (!exactKeys(row, ["key", "projectId", "caseId", "status", "durationMs", "attempts"])) {
      findings.push("a result row does not use the exact closed schema");
      continue;
    }
    const key = `${row.projectId}:${row.caseId}`;
    if (row.key !== key || !PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.includes(key)) unknown += 1;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
    if (row.status === "passed") passed += 1;
    else if (row.status === "skipped") skipped += 1;
    else failed += 1;
    if (!Number.isFinite(row.durationMs) || row.durationMs < 0 || row.attempts !== 1) {
      findings.push(`result timing or retry count is invalid: ${key}`);
    }
  }
  if (seen.size !== PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length
      || PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.some((key) => !seen.has(key))) {
    findings.push("result set is missing one or more required project/case pairs");
  }
  if (passed !== report.summary.passed
      || failed !== report.summary.failed
      || skipped !== report.summary.skipped
      || unknown !== report.summary.unknown
      || duplicates !== report.summary.duplicates) {
    findings.push("summary does not match the result rows");
  }
  if (failed !== 0 || skipped !== 0 || unknown !== 0 || duplicates !== 0 || passed !== PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length) {
    findings.push("focused Playwright result set is not a clean pass");
  }
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
