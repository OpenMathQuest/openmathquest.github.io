import axe from "axe-core";

export const AXE_CORE_VERSION = "4.13.0";
export const AXE_NEGATIVE_CONTROL_ID = "NC-AXE-UNNAMED-BUTTON-DETECTED";
const negativeControlEvidence = "STDOUT:NEGATIVE_CONTROL=NC-AXE-UNNAMED-BUTTON-DETECTED:PASS";
export const AXE_RUN_TAGS = Object.freeze([
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
]);

const negativeControls = new WeakMap();

const axeSource = () => {
  if (axe.version !== AXE_CORE_VERSION) throw new Error("axe-core installed version differs from the reviewed pin");
  return axe.source;
};

const nonemptyText = (value) => typeof value === "string" && value.trim().length > 0;
const validImpact = (value) => [null, "minor", "moderate", "serious", "critical"].includes(value);
const validTarget = (value) => Array.isArray(value) && value.length > 0 && value.every((part) => nonemptyText(part) || validTarget(part));

function compactNode(node) {
  if (!validTarget(node?.target) || !nonemptyText(node?.failureSummary)) throw new Error("axe-core finding has no actionable target or reason");
  return Object.freeze({
    target: structuredClone(node.target),
    failureSummary: node.failureSummary,
  });
}

function compactRule(rule) {
  const valid = [nonemptyText(rule?.id), validImpact(rule?.impact), nonemptyText(rule?.help), nonemptyText(rule?.helpUrl), Array.isArray(rule?.nodes)];
  if (!valid.every(Boolean)) throw new Error("axe-core finding is malformed");
  if (rule.nodes.length === 0) throw new Error("axe-core finding has no affected nodes");
  return Object.freeze({
    id: rule.id,
    impact: rule.impact,
    help: rule.help,
    helpUrl: rule.helpUrl,
    nodes: Object.freeze(rule.nodes.map(compactNode)),
  });
}

export function compactAxeResults(results) {
  if (results?.testEngine?.version !== AXE_CORE_VERSION) throw new Error("axe-core result version is missing or unreviewed");
  if (!Array.isArray(results.violations) || !Array.isArray(results.incomplete)) throw new Error("axe-core result channels are missing or malformed");
  return Object.freeze({
    engineVersion: results.testEngine.version,
    violations: Object.freeze(results.violations.map(compactRule)),
    incomplete: Object.freeze(results.incomplete.map(compactRule)),
  });
}

export function axeViolationFindings(results) {
  return results.violations.map((rule) => {
    const nodes = rule.nodes.map((node) => `${node.target.join(" ")}: ${node.failureSummary}`).join(" | ");
    return `${rule.id} (${rule.impact || "unknown"}): ${rule.help}; ${rule.nodes.length} node(s); ${nodes}`;
  });
}

export function axeManualReviewSummaries(results) {
  return Object.freeze(results.incomplete.map((rule) => Object.freeze({
    ruleId: rule.id,
    impact: rule.impact || "unknown",
    nodeCount: rule.nodes.length,
    help: rule.help,
    helpUrl: rule.helpUrl,
    nodes: rule.nodes,
  })));
}

export function axeViolationIssues(results) {
  return results.violations.map((rule) => ({
    code: `AXE_${rule.id.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}`,
    message: axeViolationFindings({ violations: [rule] })[0],
  }));
}

export function recordAxeManualReview(records, results, cellId, state) {
  for (const rule of axeManualReviewSummaries(results)) {
    const key = JSON.stringify([cellId, state, rule.ruleId]);
    if (records.has(key)) throw new Error("axe-core duplicate cell/state/rule review record");
    records.set(key, Object.freeze({ cellId, state, ...rule }));
  }
}

export function axeManualReviewRecords(records) {
  return Object.freeze([...records.entries()].sort(([left], [right]) => left.localeCompare(right, "en")).map(([, record]) => record));
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function validReviewNode(node) {
  return exactKeys(node, ["target", "failureSummary"]) && validTarget(node.target) && nonemptyText(node.failureSummary);
}

function validReviewDetails(row) {
  if (!Array.isArray(row.nodes)) return false;
  return [
    /^[a-z0-9-]+$/u.test(row.ruleId),
    validImpact(row.impact === "unknown" ? null : row.impact),
    row.nodeCount > 0,
    row.nodeCount === row.nodes.length,
    nonemptyText(row.help),
    nonemptyText(row.helpUrl),
    row.nodes.every(validReviewNode),
  ].every(Boolean);
}

function validReviewItem(row, { locationKeys, validLocation }) {
  const keys = [...locationKeys, "ruleId", "impact", "nodeCount", "help", "helpUrl", "nodes"];
  return exactKeys(row, keys) && validReviewDetails(row) && validLocation(row);
}

function validNegativeControl(value) {
  return exactKeys(value, ["id", "status"]) && value.id === AXE_NEGATIVE_CONTROL_ID && value.status === "PASS";
}

export function axeReportFindings(report, options) {
  const keys = ["enginePackage", "engineVersion", "runTags", "negativeControl", "violationCount", "manualReviewItems"];
  if (!exactKeys(report, keys)) return ["axe-core report is missing or not closed"];
  const identity = [report.enginePackage === "axe-core", report.engineVersion === AXE_CORE_VERSION,
    JSON.stringify(report.runTags) === JSON.stringify(AXE_RUN_TAGS), validNegativeControl(report.negativeControl),
    report.violationCount === options.violationCount];
  if (!identity.every(Boolean)) return ["axe-core identity, detector proof or violation count is invalid"];
  if (!Array.isArray(report.manualReviewItems)) return ["axe-core manual-review inventory is missing"];
  if (!report.manualReviewItems.every((row) => validReviewItem(row, options))) return ["axe-core manual-review evidence is not actionable or correctly bound"];
  const identities = report.manualReviewItems.map((row) => JSON.stringify([...options.locationKeys.map((key) => row[key]), row.ruleId]));
  return new Set(identities).size === identities.length ? [] : ["axe-core duplicate manual-review records"];
}

export function validAxeShard(shard) {
  if (!exactKeys(shard, ["engineVersion", "runTags", "negativeControl", "manualReviewItems"])) return false;
  return shard.engineVersion === AXE_CORE_VERSION && JSON.stringify(shard.runTags) === JSON.stringify(AXE_RUN_TAGS)
    && validNegativeControl(shard.negativeControl) && Array.isArray(shard.manualReviewItems);
}

export async function scanAxeAccessibility(page, contextSelector = null) {
  await page.evaluate(await axeSource());
  const results = await page.evaluate(async ({ selector, tags }) => {
    if (!globalThis.axe || typeof globalThis.axe.run !== "function") throw new Error("axe-core did not initialize in the inspected page");
    const context = selector ? document.querySelector(selector) : document;
    if (!context) throw new Error(`axe-core context not found: ${selector}`);
    return globalThis.axe.run(context, {
      resultTypes: ["violations", "incomplete"],
      runOnly: { type: "tag", values: tags },
    });
  }, { selector: contextSelector, tags: AXE_RUN_TAGS });
  return compactAxeResults(results);
}

async function runAxeNegativeControl(browser) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await page.setContent("<!doctype html><html lang=\"en\"><title>Axe negative control</title><body><main><button></button></main></body></html>");
      const results = await scanAxeAccessibility(page);
      const buttonName = results.violations.find((rule) => rule.id === "button-name");
      if (!buttonName || buttonName.nodes.length !== 1) {
        throw new Error(`${AXE_NEGATIVE_CONTROL_ID} failed: axe-core did not detect the deliberately unnamed button`);
      }
      process.stdout.write(`${negativeControlEvidence.slice("STDOUT:".length)}\n`);
    } finally {
      await context.close();
    }
}

export function verifyAxeNegativeControl(browser) {
  if (!negativeControls.has(browser)) negativeControls.set(browser, runAxeNegativeControl(browser));
  return negativeControls.get(browser);
}
