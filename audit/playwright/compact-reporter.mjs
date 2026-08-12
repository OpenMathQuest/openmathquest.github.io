import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PLAYWRIGHT_FOCUSED_CONTRACT_ID,
  PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS,
  PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
  playwrightFocusedReportFindings,
} from "../lib/playwright-focused-contract.mjs";

const CASE_ID = /^\[(PW-F-\d{2})\]\s/u;

export default class CompactReporter {
  constructor() {
    this.rows = [];
    this.startedAt = new Date().toISOString();
  }

  onTestEnd(test, result) {
    const match = CASE_ID.exec(test.title);
    const projectId = test.parent?.project()?.name || "";
    const browserVersion = test.annotations.find((entry) => entry.type === "browser-version")?.description || "";
    const browserProduct = test.annotations.find((entry) => entry.type === "browser-product")?.description || "";
    this.rows.push({
      key: `${projectId}:${match?.[1] || "UNKNOWN"}`,
      projectId,
      caseId: match?.[1] || "UNKNOWN",
      status: result.status,
      durationMs: Math.max(0, Number(result.duration) || 0),
      attempts: Number(result.retry) + 1,
      browserVersion,
      browserProduct,
    });
  }

  async onEnd() {
    const versions = [...new Set(this.rows.map((row) => row.browserVersion).filter(Boolean))];
    const products = [...new Set(this.rows.map((row) => row.browserProduct).filter(Boolean))];
    const results = this.rows
      .map(({ browserVersion: _browserVersion, browserProduct: _browserProduct, ...row }) => row)
      .sort((left, right) => left.key.localeCompare(right.key));
    const keys = results.map((row) => row.key);
    const unique = new Set(keys);
    const passed = results.filter((row) => row.status === "passed").length;
    const skipped = results.filter((row) => row.status === "skipped").length;
    const failed = results.length - passed - skipped;
    const unknown = keys.filter((key) => !PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.includes(key)).length;
    const duplicates = keys.length - unique.size;
    const report = {
      schemaVersion: PLAYWRIGHT_FOCUSED_SCHEMA_VERSION,
      contractId: PLAYWRIGHT_FOCUSED_CONTRACT_ID,
      generatedAt: new Date().toISOString(),
      toolchain: {
        runnerPackage: "@playwright/test",
        runnerVersion: String(process.env.MQ_PLAYWRIGHT_RUNNER_VERSION || ""),
        browserProduct: products.length === 1 && /^Edg\//u.test(products[0]) ? "Microsoft Edge" : "",
        browserVersion: versions.length === 1 ? versions[0] : "",
        browserExecutableSha256: String(process.env.MQ_PLAYWRIGHT_EDGE_SHA256 || "").toLowerCase(),
        serverRootId: String(process.env.MQ_PLAYWRIGHT_ROOT_ID || "").toLowerCase(),
        servedPayloadSha256: String(process.env.MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256 || "").toLowerCase(),
      },
      privacy: {
        usesSyntheticStateOnly: true,
        includesChildName: false,
        includesChildProgress: false,
        includesTraceOnPass: false,
        includesScreenshotOnPass: false,
        uploadsFailureArtifacts: false,
      },
      summary: {
        expected: PLAYWRIGHT_FOCUSED_EXPECTED_RESULT_KEYS.length,
        actual: results.length,
        passed,
        failed,
        skipped,
        unknown,
        duplicates,
      },
      results,
    };
    const outputPath = path.resolve(process.env.MQ_PLAYWRIGHT_REPORT_PATH || "audit/.tmp-playwright-focused-report.json");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const findings = playwrightFocusedReportFindings(report, {
      expectedExecutableSha256: String(process.env.MQ_PLAYWRIGHT_EDGE_SHA256 || "").toLowerCase(),
      expectedRootId: String(process.env.MQ_PLAYWRIGHT_ROOT_ID || "").toLowerCase(),
      expectedServedPayloadSha256: String(process.env.MQ_PLAYWRIGHT_SERVED_PAYLOAD_SHA256 || "").toLowerCase(),
    });
    if (findings.length) {
      process.stderr.write(`Focused Playwright report rejected: ${findings.join("; ")}\n`);
      return { status: "failed" };
    }
    return { status: "passed" };
  }
}
