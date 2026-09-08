import { createHash } from "node:crypto";
import { canonicalBrowserRequestSignatures } from "./browser-smoke.mjs";
import { roundMs } from "./audit-lane-contract.mjs";

const removeKeys = (record, keys) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  for (const key of keys) delete record[key];
};

const VOLATILE_BROWSER_DETAIL_KEYS = new Set([
  "checkedAt",
  "completedRouteElapsedMs",
  "reloadElapsedMs",
  "reloadedRouteElapsedMs",
  "volumeElapsedMs",
]);

function timingFreeLoopbackScope(value) {
  if (typeof value !== "string") return value;
  try {
    const parsed = new URL(value);
    if (parsed.hostname !== "127.0.0.1") return value;
  } catch { return value; }
  const match = value.match(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/127\.0\.0\.1):([0-9]{1,5})(.*)$/u);
  return match ? `${match[1]}:0${match[3]}` : value;
}

function timingFreeCoverageVirtualUrl(value) {
  if (typeof value !== "string") return value;
  try {
    if (new URL(value).protocol !== "file:") return value;
  } catch { return value; }
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const boundaries = [queryIndex, hashIndex].filter((index) => index >= 0);
  const pathBoundary = boundaries.length ? Math.min(...boundaries) : value.length;
  const pathPart = value.slice(0, pathBoundary);
  const matches = [...pathPart.matchAll(/\/\.tmp-engine-coverage-[^/?#]+(?=\/)/gu)];
  if (matches.length !== 1) return value;
  const match = matches[0];
  return `${value.slice(0, match.index)}/.tmp-engine-coverage-VOLATILE${value.slice(match.index + match[0].length)}`;
}

function timingFreeBrowserDetailValue(value, key = "") {
  if (VOLATILE_BROWSER_DETAIL_KEYS.has(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => timingFreeBrowserDetailValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
      const normalized = timingFreeBrowserDetailValue(item, name);
      return normalized === undefined ? [] : [[name, normalized]];
    }));
  }
  if (key === "registrationScope") return timingFreeLoopbackScope(value);
  return value;
}

function timingFreeBrowserDetails(details) {
  if (typeof details !== "string" || !details.trim()) return details;
  try { return JSON.stringify(timingFreeBrowserDetailValue(JSON.parse(details))); }
  catch { return details; }
}

function timingFreeCoverage(coverage) {
  removeKeys(coverage, ["structuredAuditSha256", "testOutput"]);
  if (coverage && Object.hasOwn(coverage, "rawVirtualUrl")) {
    coverage.rawVirtualUrl = timingFreeCoverageVirtualUrl(coverage.rawVirtualUrl);
  }
  removeKeys(coverage?.calibration, ["output"]);
  for (const result of coverage?.structuredAudit?.engine?.results ?? []) removeKeys(result, ["durationMs"]);
}

function timingFreeMutation(mutation) {
  for (const family of mutation?.families ?? []) {
    removeKeys(family.target, ["durationMs"]);
    for (const item of family.cases ?? []) removeKeys(item.target, ["durationMs"]);
  }
}

function timingFreeBrowser(browser) {
  removeKeys(browser, ["dumpTail"]);
  removeKeys(browser?.process, ["browserPath", "debugPort", "durationMs", "stderr", "stdout"]);
  for (const result of browser?.results ?? []) result.details = timingFreeBrowserDetails(result.details);
  if (Array.isArray(browser?.requests)) {
    browser.requests = canonicalBrowserRequestSignatures(browser.requests, { includeShard: true });
  }
  if (Array.isArray(browser?.unexpectedRequests)) {
    browser.unexpectedRequests = canonicalBrowserRequestSignatures(browser.unexpectedRequests, { includeShard: true });
  }
}

function timingFreeShard(evidence, browser) {
  removeKeys(evidence, ["canonicalEvidenceSha256"]);
  const shard = evidence?.projection?.shard ?? null;
  const payload = evidence?.projection?.payload;
  removeKeys(payload, ["requestCount", "unexpectedRequestCount"]);
  if (payload) {
    payload.requestSignatures = canonicalBrowserRequestSignatures(
      (browser.requests ?? []).filter((request) => request.shard === shard),
    );
    payload.unexpectedRequestSignatures = canonicalBrowserRequestSignatures(
      (browser.unexpectedRequests ?? []).filter((request) => request.shard === shard),
    );
  }
}

function timingFreePlaywright(playwright) {
  removeKeys(playwright?.process, ["durationMs", "stderr", "stdout"]);
  removeKeys(playwright, ["generatedAt"]);
  for (const result of playwright?.results ?? []) removeKeys(result, ["durationMs"]);
}

function timingFreeProjection(report) {
  const projected = structuredClone(report);
  removeKeys(projected, ["auditOrchestration", "generatedAt"]);
  removeKeys(projected.outcomeSummary, ["runId"]);
  timingFreeCoverage(projected.coverage);
  for (const result of projected.engine?.results ?? []) removeKeys(result, ["durationMs"]);
  timingFreeMutation(projected.mutation);
  removeKeys(projected.generator, ["stderr"]);
  timingFreeBrowser(projected.browser);
  for (const evidence of projected.browser?.shardEvidence ?? []) timingFreeShard(evidence, projected.browser);
  timingFreePlaywright(projected.playwright);
  removeKeys(projected.publicCandidate?.before, ["stderr"]);
  removeKeys(projected.publicCandidate?.after, ["stderr"]);
  return projected;
}

export function canonicalAuditEvidenceBytes(report) {
  return Buffer.from(`${JSON.stringify(timingFreeProjection(report))}\n`, "utf8");
}

function canonicalAuditEvidenceSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparisonModeIssues(serialOrchestration, parallelOrchestration, issues) {
  if (serialOrchestration?.executionMode !== "SERIAL_REFERENCE") issues.push("serial report execution mode is not SERIAL_REFERENCE");
  if (parallelOrchestration?.executionMode !== "BOUNDED_PARALLEL") issues.push("parallel report execution mode is not BOUNDED_PARALLEL");
  if (serialOrchestration?.status !== "PASS") issues.push("serial orchestration did not pass");
  if (parallelOrchestration?.status !== "PASS") issues.push("parallel orchestration did not pass");
}

function comparisonCandidateIssues(serialOrchestration, parallelOrchestration, issues) {
  if (!serialOrchestration?.candidateId || serialOrchestration.candidateId !== parallelOrchestration?.candidateId) issues.push("reports do not bind the same public candidate");
}

function comparisonTiming(serialOrchestration, parallelOrchestration, minimumReductionPercent, issues) {
  const serialWallDurationMs = roundMs(serialOrchestration?.wallDurationMs);
  const parallelWallDurationMs = roundMs(parallelOrchestration?.wallDurationMs);
  const measuredWallTimeReductionPercent = serialWallDurationMs > 0
    ? Math.round((1 - (parallelWallDurationMs / serialWallDurationMs)) * 10_000) / 100
    : 0;
  if (measuredWallTimeReductionPercent < minimumReductionPercent) {
    issues.push(`measured wall-time reduction ${measuredWallTimeReductionPercent}% is below ${minimumReductionPercent}%`);
  }
  return { serialWallDurationMs, parallelWallDurationMs, measuredWallTimeReductionPercent };
}

export function compareAuditExecutionReports(serialReport, parallelReport, { minimumReductionPercent = 20 } = {}) {
  const serialOrchestration = serialReport?.auditOrchestration;
  const parallelOrchestration = parallelReport?.auditOrchestration;
  const issues = [];
  comparisonModeIssues(serialOrchestration, parallelOrchestration, issues);
  comparisonCandidateIssues(serialOrchestration, parallelOrchestration, issues);
  const serialBytes = canonicalAuditEvidenceBytes(serialReport);
  const parallelBytes = canonicalAuditEvidenceBytes(parallelReport);
  const evidenceEquivalent = serialBytes.equals(parallelBytes);
  if (!evidenceEquivalent) issues.push("timing-free canonical gate evidence differs");
  const timing = comparisonTiming(serialOrchestration, parallelOrchestration, minimumReductionPercent, issues);
  return {
    schemaVersion: 1,
    resultType: "MATH_QUEST_AUDIT_EXECUTION_COMPARISON",
    status: issues.length ? "FAIL" : "PASS",
    candidateId: serialOrchestration?.candidateId || null,
    serialCanonicalEvidenceSha256: canonicalAuditEvidenceSha256(serialBytes),
    parallelCanonicalEvidenceSha256: canonicalAuditEvidenceSha256(parallelBytes),
    evidenceEquivalent,
    ...timing,
    minimumReductionPercent,
    issues,
  };
}
