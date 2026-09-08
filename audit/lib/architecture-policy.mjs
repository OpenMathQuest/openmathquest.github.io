import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { repositoryPaths } from "./quality-budget-measurements.mjs";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const policyUrl = new URL("../architecture-policy-v1.json", import.meta.url);
const initialLegacyEdges = new Set([
  "audit/exhaustive-generator-audit.mjs\0audit/tests/strategy-build-oracle.mjs",
  "audit/mutation-runner.mjs\0audit/tests/engine-suite.mjs",
]);
const sourceExtension = /\.(?:js|mjs)$/u;
const staticImport = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gu;

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function sortedUnique(records, key) {
  const values = records.map((record) => record[key]);
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1] < value);
}

function edgeKey(source, target) {
  return source + "\0" + target;
}

function classify(policy, relativePath) {
  return policy.zones.find((zone) => new RegExp(zone.pattern, "u").test(relativePath))?.id || null;
}

function localImports(sourcePath, text) {
  const imports = [];
  for (const match of text.matchAll(staticImport)) {
    const specifier = match[1] || match[2];
    if (!specifier.startsWith(".")) continue;
    imports.push(path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier)));
  }
  return imports;
}

// Preserve eager policy parsing at module load without an unused exported value.
freezeDeep(JSON.parse(readFileSync(policyUrl, "utf8")));

export async function validateArchitecturePolicySchema(policy, schemaUrl = new URL("../schemas/architecture-policy-v1.schema.json", import.meta.url)) {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  return Object.freeze(validate(policy) ? [] : (validate.errors || []).map((error) => (error.instancePath || "/") + " " + (error.message || "is invalid")));
}

export async function validateArchitecturePolicy(policy) {
  const findings = [...await validateArchitecturePolicySchema(policy)];
  if (findings.length) return Object.freeze(findings);
  if (!sortedUnique(policy.zones, "id")) findings.push("architecture zones must be unique and lexicographically ordered");
  if (!sortedUnique(policy.sourceContracts, "id")) findings.push("source contracts must be unique and lexicographically ordered");
  const edges = policy.legacyImportEdgeRatchets.map((edge) => edgeKey(edge.source, edge.target));
  if (new Set(edges).size !== edges.length || !edges.every((edge) => initialLegacyEdges.has(edge))) {
    findings.push("legacy import edges must be a unique subset of the two pre-refactor exceptions");
  }
  return Object.freeze(findings);
}

export async function loadArchitecturePolicy(pathOrUrl = policyUrl) {
  const policy = JSON.parse(await readFile(pathOrUrl, "utf8"));
  const findings = await validateArchitecturePolicy(policy);
  if (findings.length) throw new Error("Invalid architecture policy:\n- " + findings.join("\n- "));
  return freezeDeep(policy);
}

function importFindings(policy, relativePath, text, legacyEdges) {
  const findings = [];
  const sourceZone = classify(policy, relativePath);
  if (!sourceZone) return [relativePath + " is an unclassified JavaScript source file"];
  const allowed = new Set(policy.zones.find((zone) => zone.id === sourceZone).mayImport);
  for (const target of localImports(relativePath, text)) {
    const targetZone = classify(policy, target);
    if (!targetZone) findings.push(relativePath + " imports unclassified local source " + target);
    else if (!allowed.has(targetZone) && !legacyEdges.has(edgeKey(relativePath, target))) {
      findings.push(relativePath + " in " + sourceZone + " may not import " + target + " in " + targetZone);
    }
  }
  return findings;
}

function contractFindings(policy, texts) {
  const findings = [];
  for (const contract of policy.sourceContracts) {
    const text = texts.get(contract.path);
    if (text === undefined) {
      findings.push(contract.id + " source is missing: " + contract.path);
      continue;
    }
    const count = [...text.matchAll(new RegExp(contract.pattern, "gu"))].length;
    if (count !== contract.expectedCount) findings.push(contract.id + " expected " + contract.expectedCount + " matches but observed " + count);
  }
  return findings;
}

export function architectureFindings(policy, { repositoryRoot = root, paths = repositoryPaths(repositoryRoot), overrides = new Map() } = {}) {
  const findings = [];
  const legacyEdges = new Set(policy.legacyImportEdgeRatchets.map((edge) => edgeKey(edge.source, edge.target)));
  const sourcePaths = paths.filter((relativePath) => sourceExtension.test(relativePath));
  const requiredPaths = new Set(policy.sourceContracts.map((contract) => contract.path));
  const texts = new Map();
  for (const relativePath of new Set([...sourcePaths, ...requiredPaths])) {
    const text = overrides.has(relativePath)
      ? overrides.get(relativePath)
      : readFileSync(path.join(repositoryRoot, ...relativePath.split("/")), "utf8");
    texts.set(relativePath, text);
    if (sourceExtension.test(relativePath)) findings.push(...importFindings(policy, relativePath, text, legacyEdges));
  }
  findings.push(...contractFindings(policy, texts));
  return Object.freeze(findings);
}

export function architectureMutationFailures(policy) {
  const failures = [];
  const run = (label, pathName, mutate, expected) => {
    const original = readFileSync(path.join(root, ...pathName.split("/")), "utf8");
    const findings = architectureFindings(policy, { overrides: new Map([[pathName, mutate(original)]]) });
    if (!findings.some((finding) => expected.test(finding))) failures.push("architecture mutation did not reject " + label);
  };
  const append = (suffix) => (text) => text + suffix;
  run("a library-to-test dependency", "audit/lib/quality-gate-policy.mjs", append('\nimport "' + '../tests/node-engine.test.mjs";\n'), /may not import/u);
  run("a child-data network API", "index.html", append("\nfetch('/telemetry');\n"), /child-data-no-network/u);
  run("a second persistence writer", "index.html", append("\nlocalStorage.setItem('extra','1');\n"), /progress-write-single-owner/u);
  run("missing progress-source audit inclusion", "audit/run-audit.ps1", (text) => text.replace("progress-source.test.mjs", "missing-policy.test.mjs"), /progress-source-audit-inclusion/u);
  run("missing progress-source policy delegation", "index.html", (text) => text.replace("MathQuestProgressSource.selectProgressSource({", "MathQuestProgressSource.missing({"), /progress-source-delegation/u);
  run("missing progress-source launcher fixture route", "audit/test-launcher-identity.ps1", (text) => text.replace("@('/assets/js/math-quest-progress-source.js', 'assets/js/math-quest-progress-source.js')", ""), /progress-source-launcher-fixture-route/u);
  run("missing progress-source launcher route", "Serve-MathQuest.ps1", (text) => text.replace("@('/assets/js/math-quest-progress-source.js', 'assets/js/math-quest-progress-source.js')", ""), /progress-source-launcher-route/u);
  run("browser state in the progress-source policy", "assets/js/math-quest-progress-source.js", append("\ndocument.title = 'coupled';\n"), /progress-source-no-browser-state/u);
  run("missing progress-source Playwright identity route", "audit/lib/playwright-focused-contract.mjs", (text) => text.replace('["/assets/js/math-quest-progress-source.js", "assets/js/math-quest-progress-source.js"]', ""), /progress-source-playwright-identity-route/u);
  run("browser state in the PWA status policy", "assets/js/math-quest-pwa-status.js", append("\ndocument.title = 'coupled';\n"), /pwa-status-no-browser-state/u);
  run("missing PWA readiness policy delegation", "index.html", (text) => text.replace("MathQuestPwaStatus.readinessStatusText(pwa.phase)", "MathQuestPwaStatus.missing(pwa.phase)"), /pwa-readiness-status-delegation/u);
  run("missing PWA readiness validation delegation", "index.html", (text) => text.replace("MathQuestPwaStatus.validateReadiness(payload,{", "MathQuestPwaStatus.missing(payload,{"), /pwa-readiness-validation-delegation/u);
  run("missing PWA status audit inclusion", "audit/run-audit.ps1", (text) => text.replace("pwa-status.test.mjs", "missing-policy.test.mjs"), /pwa-status-audit-inclusion/u);
  run("missing PWA status launcher route", "Serve-MathQuest.ps1", (text) => text.replace("@('/assets/js/math-quest-pwa-status.js', 'assets/js/math-quest-pwa-status.js')", ""), /pwa-status-launcher-route/u);
  run("missing PWA status launcher fixture route", "audit/test-launcher-identity.ps1", (text) => text.replace("@('/assets/js/math-quest-pwa-status.js', 'assets/js/math-quest-pwa-status.js')", ""), /pwa-status-launcher-fixture-route/u);
  run("missing PWA status Playwright identity route", "audit/lib/playwright-focused-contract.mjs", (text) => text.replace('["/assets/js/math-quest-pwa-status.js", "assets/js/math-quest-pwa-status.js"]', ""), /pwa-status-playwright-identity-route/u);
  run("duplicated PWA status Playwright request inventory", "audit/playwright/fixtures.mjs", (text) => text.replace("PLAYWRIGHT_FOCUSED_SERVER_ROUTES.map(([route]) => route)", "[]"), /pwa-status-playwright-request-inventory/u);
  run("missing PWA update policy delegation", "index.html", (text) => text.replace("MathQuestPwaStatus.updateStatusText({", "MathQuestPwaStatus.missing({"), /pwa-update-status-delegation/u);
  run("validation bypass", "index.html", (text) => text.replace("function save(){const bytes=prepareProgressBytes();return bytes!==null&&persistProgressBytes(bytes);}", "function save(){return persistProgressBytes('unchecked');}"), /validation-before-persistence/u);
  return Object.freeze(failures);
}
