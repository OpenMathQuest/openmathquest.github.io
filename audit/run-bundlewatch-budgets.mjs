import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadQualityGatePolicy } from "./lib/quality-gate-policy.mjs";
import { repositoryPaths, shippedByteArtifacts } from "./lib/quality-budget-measurements.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const bundleWatchFileDetails = require("bundlewatch/lib/app/getLocalFileDetails").default;
const bundleWatchAnalyze = require("bundlewatch/lib/app/analyze").default;
const bundleDefinitions = Object.freeze([
  Object.freeze({ metric: "stylesheetBytes", budget: "stylesheetMaximumBytes", filename: "styles.bundle" }),
  Object.freeze({ metric: "javascriptBytes", budget: "javascriptMaximumBytes", filename: "javascript.bundle" }),
  Object.freeze({ metric: "compiledAssetBytes", budget: "compiledAssetMaximumBytes", filename: "compiled-assets.bundle" }),
  Object.freeze({ metric: "productionPayloadBytes", budget: "productionPayloadMaximumBytes", filename: "production-payload.bundle" }),
]);

export function bundleWatchSpecification(policy, artifacts, reducedMetric = null) {
  return Object.freeze(bundleDefinitions.map((definition) => {
    const maximumBytes = policy.performanceBudgets[definition.budget] - (definition.metric === reducedMetric ? 1 : 0);
    return Object.freeze({
      ...definition,
      actualBytes: artifacts[definition.metric].length,
      maximumBytes,
    });
  }));
}

async function writeBundleWatchInputs(temporaryRoot, artifacts, specifications) {
  for (const specification of specifications) {
    await writeFile(path.join(temporaryRoot, specification.filename), artifacts[specification.metric]);
  }
}

function bundleWatchFiles(temporaryRoot, specifications) {
  return specifications.map((specification) => ({
    path: path.join(temporaryRoot, specification.filename).replaceAll("\\", "/"),
    maxSize: specification.maximumBytes + "B",
    compression: "none",
  }));
}

function runBundleWatchEngine(temporaryRoot, specifications) {
  const currentBranchFileDetails = bundleWatchFileDetails({
    files: bundleWatchFiles(temporaryRoot, specifications),
    defaultCompression: "none",
    normalizeFilenames: null,
  });
  const analysis = bundleWatchAnalyze({ currentBranchFileDetails, baseBranchFileDetails: {}, baseBranchName: null });
  return Object.freeze({ status: analysis.status === "fail" ? 1 : 0, analysis });
}

async function bundleWatchVersion() {
  const text = await readFile(path.join(root, "node_modules", "bundlewatch", "package.json"), "utf8");
  return String(JSON.parse(text).version);
}

function bundleWatchFindings(passResult, mutantResult) {
  const findings = [];
  if (passResult.status !== 0) findings.push("BundleWatch rejected the exact raw-byte baseline budgets.");
  if (mutantResult.status === 0 || mutantResult.status == null) findings.push("BundleWatch negative control did not reject a one-byte budget reduction.");
  return findings;
}

function toolDiagnostics(result) {
  return result.analysis.fullResults.map((item) => {
    const filename = path.basename(item.filePath);
    if (item.error) return `FAIL ${filename}: unreadable input`;
    return `${item.status.toUpperCase()} ${filename}: ${item.size}B / ${item.maxSize}B`;
  });
}

function bundleWatchReport(specifications, passResult, mutantResult, version) {
  const findings = bundleWatchFindings(passResult, mutantResult);
  return Object.freeze({
    schemaVersion: 1,
    status: findings.length ? "FAIL" : "PASS",
    tool: Object.freeze({ name: "BundleWatch", version, compression: "none", interface: "local-analysis-engine" }),
    bundles: specifications.map((specification) => Object.freeze({
      metric: specification.metric,
      actualBytes: specification.actualBytes,
      maximumBytes: specification.maximumBytes,
    })),
    execution: Object.freeze({ status: passResult.status, diagnostics: Object.freeze(toolDiagnostics(passResult)) }),
    negativeControl: Object.freeze({ id: "NC-BUNDLEWATCH-ONE-BYTE-OVER-FAILS", passed: mutantResult.status !== 0 && mutantResult.status != null }),
    findings: Object.freeze(findings),
  });
}

export async function runBundleWatchBudgets() {
  const policy = await loadQualityGatePolicy();
  const paths = repositoryPaths(root);
  const artifacts = shippedByteArtifacts(root, paths);
  const specifications = bundleWatchSpecification(policy, artifacts);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mq-bundlewatch-"));
  try {
    await writeBundleWatchInputs(temporaryRoot, artifacts, specifications);
    const passResult = runBundleWatchEngine(temporaryRoot, specifications);
    const mutantSpecifications = bundleWatchSpecification(policy, artifacts, "javascriptBytes");
    const mutantResult = runBundleWatchEngine(temporaryRoot, mutantSpecifications);
    return bundleWatchReport(specifications, passResult, mutantResult, await bundleWatchVersion());
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runBundleWatchBudgets();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
