import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const DESIGN_TOKEN_SOURCE_PATH = "assets/design/math-quest-design-tokens-v1.json";
export const DESIGN_TOKEN_PROJECTION_CSS_PATH = "assets/design/math-quest-design-tokens-v1.css";
export const DESIGN_TOKEN_PROJECTION_GENERATOR_PATH = "tools/build-design-token-projection.mjs";
export const DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX = "--mq-conservatory-";
export const DESIGN_TOKEN_RUNTIME_LINK_SELECTOR = "link[data-mq-design-token-projection=\"v1\"]";
export const DESIGN_TOKEN_RUNTIME_CONSUMER_PATHS = Object.freeze(["index.html"]);
export const DESIGN_TOKEN_PROJECTED_VALUE_CLASSES = Object.freeze([
  "COLOURS",
  "DIMENSIONS",
  "MOTION",
  "VIEW_PALETTES",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const normalizePath = (value) => String(value || "").replaceAll("\\", "/").replace(/^\.\//u, "");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((key) => [key, canonicalValue(value[key])]));
}

export function designTokenSemanticProjectionInput(tokens) {
  return canonicalValue({
    approvedTextPairings: tokens.approvedTextPairings,
    colours: tokens.colours,
    contrastPolicy: tokens.contrastPolicy,
    designSystemId: tokens.designSystemId,
    dimensions: tokens.dimensions,
    motion: tokens.motion,
    sourceDecisionIds: tokens.sourceDecisionIds,
    version: tokens.version,
    viewPalettes: tokens.viewPalettes,
  });
}

export function designTokenSemanticProjectionSha256(tokens) {
  return sha256(Buffer.from(JSON.stringify(designTokenSemanticProjectionInput(tokens)), "utf8"));
}

function propertyName(id) {
  return `${DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX}${id.replaceAll(".", "-")}`;
}

export function designTokenProjectionProperties(tokens) {
  const colours = new Map(tokens.colours.map((record) => [record.id, record.value]));
  const properties = [
    ...tokens.colours.map((record) => ({ name: propertyName(record.id), value: record.value })),
    ...tokens.dimensions.map((record) => ({ name: propertyName(record.id), value: `${record.value}px` })),
    ...tokens.motion.flatMap((record) => [
      { name: propertyName(record.id), value: `${record.durationMs}ms` },
      { name: `${propertyName(record.id)}-reduced`, value: `${record.reducedMotionValueMs}ms` },
    ]),
    ...tokens.viewPalettes.flatMap((palette) => palette.tokenIds.map((tokenId, index) => ({
      name: `${DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX}view-${palette.id.toLowerCase()}-${index + 1}`,
      value: colours.get(tokenId),
    }))),
  ].sort((left, right) => left.name.localeCompare(right.name, "en"));
  return Object.freeze(properties.map(Object.freeze));
}

export function designTokenProjectionSourceIssues(tokens) {
  const issues = [];
  const ids = [
    ...(tokens.colours || []).map((record) => record.id),
    ...(tokens.dimensions || []).map((record) => record.id),
    ...(tokens.motion || []).map((record) => record.id),
  ];
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  for (const id of duplicateIds) issues.push(`design-token source repeats scalar id ${id}.`);
  const colours = new Set((tokens.colours || []).map((record) => record.id));
  for (const palette of tokens.viewPalettes || []) {
    for (const tokenId of palette.tokenIds || []) if (!colours.has(tokenId)) issues.push(`${palette.id} references unknown colour ${tokenId}.`);
  }
  let properties = [];
  try { properties = designTokenProjectionProperties(tokens); }
  catch (error) { issues.push(`design-token source cannot be projected: ${error.message}`); }
  const names = properties.map((record) => record.name);
  for (const name of [...new Set(names.filter((value, index) => names.indexOf(value) !== index))].sort()) issues.push(`design-token projection repeats custom property ${name}.`);
  for (const record of properties) {
    if (!/^--mq-conservatory-[a-z0-9-]+$/u.test(record.name)) issues.push(`design-token property ${record.name} escapes the closed namespace grammar.`);
    if (typeof record.value !== "string" || record.value.length === 0 || record.value === "undefined") issues.push(`design-token property ${record.name} has no scalar CSS value.`);
  }
  return Object.freeze(issues);
}

export function renderDesignTokenProjectionCss(tokens) {
  const semanticSha256 = designTokenSemanticProjectionSha256(tokens);
  const declarations = designTokenProjectionProperties(tokens)
    .map(({ name, value }) => `  ${name}: ${value};`)
    .join("\n");
  return `/* GENERATED_FILE source=${DESIGN_TOKEN_SOURCE_PATH} generator=${DESIGN_TOKEN_PROJECTION_GENERATOR_PATH} semantic_input_sha256=${semanticSha256} projection_contract=ART_MIG_02_V1 */\n:root {\n${declarations}\n}\n`;
}

export function expectedDesignTokenProjection(tokens) {
  const cssBytes = Buffer.from(renderDesignTokenProjectionCss(tokens), "utf8");
  return Object.freeze({
    state: "ACTIVATED_NO_CONSUMERS",
    runtimeCssPath: DESIGN_TOKEN_PROJECTION_CSS_PATH,
    generatorPath: DESIGN_TOKEN_PROJECTION_GENERATOR_PATH,
    customPropertyPrefix: DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX,
    runtimeLinkSelector: DESIGN_TOKEN_RUNTIME_LINK_SELECTOR,
    runtimeConsumerPaths: DESIGN_TOKEN_RUNTIME_CONSUMER_PATHS,
    projectedValueClasses: DESIGN_TOKEN_PROJECTED_VALUE_CLASSES,
    consumerPolicy: "NO_RUNTIME_CUSTOM_PROPERTY_CONSUMERS_UNTIL_ART_MIG_03",
    renderedChangePolicy: "ZERO_RENDERED_CHANGE_ART_MIG_02",
    activationGate: "TOKEN_PROJECTION_BYTE_VERIFIED",
    semanticInputSha256: designTokenSemanticProjectionSha256(tokens),
    cssSha256: sha256(cssBytes),
    cssBytes: cssBytes.length,
  });
}

function linkTagAttributes(tag) {
  const attributes = new Map();
  const body = tag.replace(/^<link\b/iu, "").replace(/\/?>$/u, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of body.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function runtimeProjectionLinkIsClosed(pageText) {
  const records = [...String(pageText).matchAll(/<link\b[^>]*>/giu)].map((match) => {
    const attributes = linkTagAttributes(match[0]);
    let url = null;
    try { url = new URL(attributes.get("href"), "https://math-quest.invalid/"); }
    catch { /* Invalid hrefs cannot satisfy the closed projection link. */ }
    return { attributes, url };
  });
  const expectedPathname = `/${DESIGN_TOKEN_PROJECTION_CSS_PATH}`;
  const projectionLinks = records.filter(({ url }) => url?.pathname === expectedPathname);
  const markerLinks = records.filter(({ attributes }) => attributes.has("data-mq-design-token-projection"));
  if (projectionLinks.length !== 1 || markerLinks.length !== 1 || projectionLinks[0] !== markerLinks[0]) return false;
  const [{ attributes, url }] = projectionLinks;
  const relTokens = String(attributes.get("rel") || "").toLowerCase().split(/\s+/u).filter(Boolean);
  return relTokens.length === 1
    && relTokens[0] === "stylesheet"
    && attributes.get("href") === DESIGN_TOKEN_PROJECTION_CSS_PATH
    && attributes.get("data-mq-design-token-projection") === "v1"
    && url.search === ""
    && url.hash === "";
}

function decodedCodePoint(hex) {
  const value = Number.parseInt(hex, 16);
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "\ufffd";
}

function canonicalRuntimeSourceText(source) {
  return String(source)
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (_match, hex) => decodedCodePoint(hex))
    .replace(/\\u([0-9a-f]{4})/giu, (_match, hex) => decodedCodePoint(hex))
    .replace(/\\x([0-9a-f]{2})/giu, (_match, hex) => decodedCodePoint(hex))
    .replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/giu, (_match, hex) => decodedCodePoint(hex))
    .replace(/&#x([0-9a-f]{1,6});/giu, (_match, hex) => decodedCodePoint(hex))
    .replace(/&#([0-9]{1,7});/gu, (_match, decimal) => decodedCodePoint(Number.parseInt(decimal, 10).toString(16)))
    .toLowerCase();
}

function runtimeSourceUsesProjectionNamespace(source) {
  const canonical = canonicalRuntimeSourceText(source);
  if (canonical.includes(DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX)) return true;
  return canonical.replace(/[^a-z0-9]+/gu, "").includes("mqconservatory");
}

function runtimeSourceCanDynamicallyReadOrAuthorCss(source) {
  const canonical = canonicalRuntimeSourceText(source);
  const compact = canonical.replace(/[^a-z0-9]+/gu, "");
  const dynamicApiIdentifiers = [
    "getcomputedstyle",
    "getpropertyvalue",
    "setproperty",
    "removeproperty",
    "insertrule",
    "replacesync",
    "cssstylesheet",
  ];
  return dynamicApiIdentifiers.some((identifier) => compact.includes(identifier)) || [
    /\bgetcomputedstyle\s*\(/u,
    /\.\s*(?:getpropertyvalue|setproperty|removeproperty|insertrule|replacesync)\s*\(/u,
    /\bcssstylesheet\b/u,
    /\.\s*style\s*(?:\.|=)/u,
    /\bcreateelement\s*\(\s*["']style["']/u,
    /\bsetattribute\s*\(\s*["']style["']/u,
  ].some((pattern) => pattern.test(canonical));
}

export function validateDesignTokenProjection(tokens, cssBytes, {
  releaseShell = null,
  runtimeSources = {},
} = {}) {
  const issues = [];
  issues.push(...designTokenProjectionSourceIssues(tokens));
  const expectedCss = Buffer.from(renderDesignTokenProjectionCss(tokens), "utf8");
  const actualCss = Buffer.from(cssBytes || "");
  const expectedProjection = expectedDesignTokenProjection(tokens);
  if (!same(tokens.projection, expectedProjection)) issues.push("design-token projection metadata is stale or not closed to the generated bytes.");
  if (!actualCss.equals(expectedCss)) issues.push("design-token projection CSS is not the exact deterministic generator output.");
  const names = designTokenProjectionProperties(tokens).map((record) => record.name);
  if (new Set(names).size !== names.length) issues.push("design-token projection contains a duplicate custom-property name.");
  if (names.some((name) => !name.startsWith(DESIGN_TOKEN_CUSTOM_PROPERTY_PREFIX))) issues.push("design-token projection escaped its collision-safe custom-property namespace.");

  const expectedRuntimePaths = new Set(DESIGN_TOKEN_RUNTIME_CONSUMER_PATHS);
  const observedRuntimePaths = new Set(Object.keys(runtimeSources).map(normalizePath));
  if (!same([...observedRuntimePaths].sort(), [...expectedRuntimePaths].sort())) issues.push("design-token runtime consumer scan did not cover the exact declared path set.");
  for (const [runtimePath, text] of Object.entries(runtimeSources)) {
    const normalized = normalizePath(runtimePath);
    if (runtimeSourceUsesProjectionNamespace(text)) issues.push(`${normalized} consumes or declares the reserved Conservatory custom-property namespace before ART-MIG-03.`);
    if (runtimeSourceCanDynamicallyReadOrAuthorCss(text)) issues.push(`${normalized} can dynamically read or author CSS before the ART-MIG-03 consumer migration.`);
  }
  const pageText = runtimeSources["index.html"];
  if (typeof pageText !== "string" || !runtimeProjectionLinkIsClosed(pageText)) issues.push("index.html must contain exactly one closed design-token projection stylesheet link.");

  const shellEntry = releaseShell?.entries?.find((entry) => normalizePath(entry.path) === DESIGN_TOKEN_PROJECTION_CSS_PATH);
  if (!shellEntry
      || shellEntry.mime !== "text/css"
      || shellEntry.status !== 200
      || shellEntry.sha256 !== expectedProjection.cssSha256
      || shellEntry.bytes !== expectedProjection.cssBytes) {
    issues.push("release shell does not bind the exact design-token projection CSS bytes.");
  }
  return Object.freeze(issues);
}

export async function loadDesignTokenProjection({ root = repositoryRoot } = {}) {
  const [tokenText, cssBytes, releaseShellText, ...runtimeTexts] = await Promise.all([
    readFile(path.join(root, DESIGN_TOKEN_SOURCE_PATH), "utf8"),
    readFile(path.join(root, DESIGN_TOKEN_PROJECTION_CSS_PATH)),
    readFile(path.join(root, "release-shell-v1.json"), "utf8"),
    ...DESIGN_TOKEN_RUNTIME_CONSUMER_PATHS.map((runtimePath) => readFile(path.join(root, runtimePath), "utf8")),
  ]);
  const tokens = JSON.parse(tokenText);
  const runtimeSources = Object.fromEntries(DESIGN_TOKEN_RUNTIME_CONSUMER_PATHS.map((runtimePath, index) => [runtimePath, runtimeTexts[index]]));
  const releaseShell = JSON.parse(releaseShellText);
  const issues = validateDesignTokenProjection(tokens, cssBytes, { releaseShell, runtimeSources });
  if (issues.length) throw new Error(`Invalid design-token projection:\n- ${issues.join("\n- ")}`);
  return Object.freeze({ tokens: Object.freeze(tokens), projection: Object.freeze(tokens.projection) });
}
