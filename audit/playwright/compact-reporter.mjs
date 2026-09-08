import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PLAYWRIGHT_FOCUSED_CONTRACT_ID, PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS, PLAYWRIGHT_FOCUSED_SCHEMA_VERSION, playwrightFocusedReportFindings } from "../lib/playwright-focused-contract.mjs";
import { AXE_CORE_VERSION, AXE_NEGATIVE_CONTROL_ID, AXE_RUN_TAGS } from "../lib/axe-accessibility.mjs";

const CASE_ID = /^\[(PW-F-\d{2})\]\s/u;
const PRIVACY = Object.freeze({ usesSyntheticStateOnly: true, includesChildName: false, includesChildProgress: false, includesTraceOnPass: false, includesScreenshotOnPass: false, uploadsFailureArtifacts: false });

function annotation(test, type) {
  const matches = test.annotations.filter((entry) => entry.type === type);
  return matches.length === 1 ? matches[0].description : null;
}

function axeEvidence(test) {
  const negativeControl = annotation(test, "axe-negative-control");
  const count = annotation(test, "axe-violation-count");
  try {
    const manualReview = JSON.parse(annotation(test, "axe-manual-review"));
    if (!Array.isArray(manualReview) || !/^(0|[1-9]\d*)$/u.test(String(count))) throw new Error("missing axe scan evidence");
    return { negativeControl, violationCount: Number(count), manualReview };
  } catch {
    return { negativeControl: "MISSING_SCAN_EVIDENCE", violationCount: null, manualReview: [] };
  }
}

function resultRow(test, result) {
  const match = CASE_ID.exec(test.title);
  const projectId = test.parent?.project()?.name || "";
  const caseId = match?.[1] || "UNKNOWN";
  return {
    key: projectId + ":" + caseId, projectId, caseId, status: result.status,
    durationMs: Math.max(0, Number(result.duration) || 0), attempts: Number(result.retry) + 1,
  };
}

function environmentDigest(name) {
  return String(process.env[name] || "").toLowerCase();
}

function observedToolchain(rows) {
  const versions = [...new Set(rows.map((row) => row.browserVersion).filter(Boolean))];
  const products = [...new Set(rows.map((row) => row.browserProduct).filter(Boolean))];
  return {
    runnerPackage: "@playwright/test", runnerVersion: String(process.env.MQ_PLAYWRIGHT_RUNNER_VERSION || ""),
    browserProduct: products.length === 1 && /^Edg\//u.test(products[0]) ? "Microsoft Edge" : "",
    browserVersion: versions.length === 1 ? versions[0] : "",
    browserExecutableSha256: environmentDigest("MQ_PLAYWRIGHT_EDGE_SHA256"),
    serverRootId: environmentDigest("MQ_PLAYWRIGHT_ROOT_ID"),
    servedPayloadSha256: environmentDigest("MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256"),
  };
}

function resultSummary(results) {
  const keys = results.map((row) => row.key);
  const passed = results.filter((row) => row.status === "passed").length;
  const skipped = results.filter((row) => row.status === "skipped").length;
  return {
    expected: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length, actual: results.length,
    passed, failed: results.length - passed - skipped, skipped,
    unknown: keys.filter((key) => !PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.includes(key)).length,
    duplicates: keys.length - new Set(keys).size,
  };
}

function accessibilityReport(rows) {
  const detectorPassed = rows.length > 0 && rows.every((row) => row.axe.negativeControl === AXE_NEGATIVE_CONTROL_ID + ":PASS");
  const observed = rows.length > 0 && rows.every((row) => Number.isSafeInteger(row.axe.violationCount));
  const manualReviewItems = rows.flatMap((row) => row.axe.manualReview.map((item) => ({ key: row.result.key, ...item })))
    .sort((left, right) => (left.key + ":" + left.ruleId).localeCompare(right.key + ":" + right.ruleId, "en"));
  return {
    enginePackage: "axe-core", engineVersion: AXE_CORE_VERSION, runTags: AXE_RUN_TAGS,
    negativeControl: { id: AXE_NEGATIVE_CONTROL_ID, status: detectorPassed ? "PASS" : "FAIL" },
    violationCount: observed ? rows.reduce((total, row) => total + row.axe.violationCount, 0) : null,
    manualReviewItems,
  };
}

function focusedReport(rows) {
  const results = rows.map((row) => row.result).sort((left, right) => left.key.localeCompare(right.key));
  return {
    schemaVersion: PLAYWRIGHT_FOCUSED_SCHEMA_VERSION, contractId: PLAYWRIGHT_FOCUSED_CONTRACT_ID,
    generatedAt: new Date().toISOString(), toolchain: observedToolchain(rows), privacy: PRIVACY,
    accessibility: accessibilityReport(rows), summary: resultSummary(results), results,
  };
}

export default class CompactReporter {
  constructor() { this.rows = []; }

  onTestEnd(test, result) {
    this.rows.push({
      result: resultRow(test, result), browserVersion: annotation(test, "browser-version"),
      browserProduct: annotation(test, "browser-product"), axe: axeEvidence(test),
    });
  }

  async onEnd() {
    const report = focusedReport(this.rows);
    const outputPath = path.resolve(process.env.MQ_PLAYWRIGHT_REPORT_PATH || "audit/.tmp-playwright-focused-report.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    const findings = playwrightFocusedReportFindings(report, {
      expectedExecutableSha256: environmentDigest("MQ_PLAYWRIGHT_EDGE_SHA256"),
      expectedRootId: environmentDigest("MQ_PLAYWRIGHT_ROOT_ID"),
      expectedServedPayloadSha256: environmentDigest("MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256"),
    });
    if (findings.length) {
      process.stderr.write("Focused Playwright report rejected: " + findings.join("; ") + "\n");
      return { status: "failed" };
    }
    return { status: "passed" };
  }
}
