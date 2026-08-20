#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { AI_READER_CONTRACT_REF, loadRepositoryCodeMap, trackedRepositoryPaths } from "../audit/lib/repository-code-map.mjs";
import { planDevelopmentSuites } from "../audit/lib/development-suite-plan.mjs";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const punctuation = new Map([["’", "'"], ["‘", "'"], ["“", "\""], ["”", "\""], ["–", "-"], ["—", "-"]]);
export const BLAST_RADIUS_RESULT_SCHEMA_PATH = "audit/schemas/blast-radius-result-v2.schema.json";
export const DEFAULT_BLAST_RADIUS_DEPTH = 2;
export const MAXIMUM_BLAST_RADIUS_DEPTH = 8;

let resultValidatorPromise;

async function resultValidator() {
  resultValidatorPromise ||= readFile(path.join(root, ...BLAST_RADIUS_RESULT_SCHEMA_PATH.split("/")), "utf8").then((text) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    return ajv.compile(JSON.parse(text));
  });
  return resultValidatorPromise;
}

export async function validateBlastRadiusResultSchema(result) {
  const validate = await resultValidator();
  return Object.freeze(validate(result) ? [] : (validate.errors || []).map((error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`));
}

export function normalizeMaximumDepth(value = DEFAULT_BLAST_RADIUS_DEPTH) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > MAXIMUM_BLAST_RADIUS_DEPTH) {
    throw new RangeError(`maximumDepth must be an integer from 0 through ${MAXIMUM_BLAST_RADIUS_DEPTH}.`);
  }
  return value;
}

function parseMaximumDepthArgument(value) {
  if (!/^(?:0|[1-8])$/u.test(String(value))) {
    throw new RangeError(`maximumDepth must be an integer from 0 through ${MAXIMUM_BLAST_RADIUS_DEPTH}.`);
  }
  return normalizeMaximumDepth(Number(value));
}

export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[’‘“”–—]/gu, (character) => punctuation.get(character))
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function symbolParts(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

export function symbolVariants(value) {
  const parts = symbolParts(value);
  if (!parts.length) return Object.freeze([]);
  const title = (part) => `${part[0].toUpperCase()}${part.slice(1)}`;
  return Object.freeze([...new Set([
    parts.join("_"),
    parts.join("_").toUpperCase(),
    `${parts[0]}${parts.slice(1).map(title).join("")}`,
    parts.map(title).join(""),
    parts.join("-"),
  ])]);
}

function numericValue(value) {
  const cleaned = String(value).replace(/[,_\s]/gu, "").replace(/^\+?/u, "");
  return /^\d+$/u.test(cleaned) ? BigInt(cleaned) : null;
}

export function contentMatches(kind, query, text) {
  const source = String(text || "");
  if (kind === "exact") return normalizeSearchText(source).includes(normalizeSearchText(query));
  if (kind === "word") return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(query)}(?![\\p{L}\\p{N}_])`, "u").test(source);
  if (kind === "symbol") return symbolVariants(query).some((variant) => new RegExp(`(?<![A-Za-z0-9_$])${escapeRegExp(variant)}(?![A-Za-z0-9_$])`, "u").test(source));
  if (kind === "count") {
    const expected = numericValue(query);
    if (expected === null) return false;
    const candidates = source.match(/(?<![\p{L}\p{N}])\+?\d(?:[\d,_\s]*\d)?(?![\p{L}\p{N}])/gu) || [];
    return candidates.some((candidate) => numericValue(candidate) === expected);
  }
  throw new TypeError(`Unknown blast-radius match kind ${kind}.`);
}

export function matchingLineNumbers(kind, query, text) {
  const lines = String(text || "").split(/\r?\n/u);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (contentMatches(kind, query, lines[index])) matches.push(index + 1);
    if (index + 1 < lines.length && kind === "exact" && contentMatches(kind, query, `${lines[index]} ${lines[index + 1]}`)) matches.push(index + 1);
  }
  return Object.freeze([...new Set(matches)].sort((left, right) => left - right));
}

function isProbablyBinary(bytes) {
  return bytes.includes(0);
}

function classificationFor(map, file) {
  const rule = map.coverageRules.find((candidate) => new RegExp(candidate.pattern, "u").test(file));
  return rule ? Object.freeze({ role: rule.role, releaseImpact: rule.releaseImpact }) : Object.freeze({ role: "unclassified", releaseImpact: "UNKNOWN" });
}

function graphNeighbours(map) {
  const graph = new Map();
  const add = ({ source, target, relationId, relationClass, declaredKind }) => {
    if (!graph.has(source)) graph.set(source, []);
    if (!graph.has(target)) graph.set(target, []);
    graph.get(source).push(Object.freeze({
      file: target,
      relationId,
      relationClass,
      declaredKind,
      traversalDirection: "FORWARD_SOURCE_TO_TARGET",
      dependencyRole: "DEPENDENT",
    }));
    graph.get(target).push(Object.freeze({
      file: source,
      relationId,
      relationClass,
      declaredKind,
      traversalDirection: "REVERSE_TARGET_TO_SOURCE",
      dependencyRole: "DEPENDENCY",
    }));
  };
  for (const relation of map.artifactRelations) {
    add({
      source: relation.source,
      target: relation.target,
      relationId: relation.id,
      relationClass: "ARTIFACT_RELATION",
      declaredKind: relation.kind,
    });
  }
  for (const family of map.factFamilies) {
    for (const projection of family.projections) {
      add({
        source: family.owner,
        target: projection.path,
        relationId: `fact-projection.${family.id}.${projection.path}`,
        relationClass: "FACT_PROJECTION",
        declaredKind: projection.relationship,
      });
    }
    for (const validator of family.validators) {
      add({
        source: family.owner,
        target: validator,
        relationId: `fact-validator.${family.id}.${validator}`,
        relationClass: "FACT_VALIDATOR",
        declaredKind: "VALIDATOR",
      });
    }
  }
  for (const edges of graph.values()) {
    edges.sort((left, right) => left.file.localeCompare(right.file, "en") || left.relationId.localeCompare(right.relationId, "en"));
  }
  return graph;
}

function chaseGraph(graph, starts, maximumDepth = DEFAULT_BLAST_RADIUS_DEPTH) {
  const discovered = new Map(starts.map((file) => [file, Object.freeze({ depth: 0, edge: null, predecessor: null })]));
  const queue = [...starts].sort((left, right) => left.localeCompare(right, "en"));
  while (queue.length) {
    const current = queue.shift();
    const depth = discovered.get(current).depth;
    if (depth >= maximumDepth) continue;
    for (const edge of graph.get(current) || []) {
      if (discovered.has(edge.file)) continue;
      discovered.set(edge.file, Object.freeze({ depth: depth + 1, edge, predecessor: current }));
      queue.push(edge.file);
    }
  }
  return discovered;
}

export function conditionalCountPrediction(kind, query, matchedRows) {
  if (kind !== "count") return null;
  const value = numericValue(query);
  const listEntryCase = matchedRows.some((row) => row.lines.some((line) => /^\s*(?:[-*+] |\d+[.)] |["'][^"']+["']\s*[:,]?)/u.test(line.text)));
  return Object.freeze({
    current: value === null ? null : value.toString(),
    ifListEntryAdded: value === null ? null : (value + 1n).toString(),
    ifListEntryRemoved: value === null || value === 0n ? null : (value - 1n).toString(),
    listEntryCase,
    warning: "Prediction is conditional. Verify the owning collection rather than editing a copied count.",
  });
}

export async function blastRadiusLookup({ kind, query, maximumDepth = DEFAULT_BLAST_RADIUS_DEPTH } = {}) {
  if (!new Set(["exact", "word", "symbol", "count"]).has(kind)) throw new TypeError("kind must be exact, word, symbol, or count.");
  if (!String(query || "").trim()) throw new TypeError("query must not be blank.");
  maximumDepth = normalizeMaximumDepth(maximumDepth);
  const map = await loadRepositoryCodeMap();
  const tracked = trackedRepositoryPaths(root);
  const direct = [];
  const binarySkipped = [];

  for (const file of tracked) {
    const pathHit = contentMatches(kind, query, file);
    const bytes = await readFile(path.join(root, ...file.split("/")));
    if (isProbablyBinary(bytes)) {
      if (pathHit) direct.push(Object.freeze({ file, pathHit: true, lines: [], ...classificationFor(map, file) }));
      binarySkipped.push(file);
      continue;
    }
    const text = bytes.toString("utf8");
    const lineNumbers = matchingLineNumbers(kind, query, text);
    if (!pathHit && !lineNumbers.length) continue;
    const sourceLines = text.split(/\r?\n/u);
    direct.push(Object.freeze({
      file,
      pathHit,
      lines: Object.freeze(lineNumbers.map((line) => Object.freeze({ line, text: sourceLines[line - 1].trim().slice(0, 240) }))),
      ...classificationFor(map, file),
    }));
  }

  const graph = graphNeighbours(map);
  const chased = chaseGraph(graph, direct.map((row) => row.file), maximumDepth);
  const dependencies = [...chased.entries()]
    .filter(([file, observation]) => observation.depth > 0 && !direct.some((row) => row.file === file))
    .map(([file, observation]) => Object.freeze({
      file,
      depth: observation.depth,
      ...classificationFor(map, file),
      predecessor: observation.predecessor,
      relationId: observation.edge.relationId,
      relationClass: observation.edge.relationClass,
      declaredKind: observation.edge.declaredKind,
      traversalDirection: observation.edge.traversalDirection,
      dependencyRole: observation.edge.dependencyRole,
    }))
    .sort((left, right) => left.depth - right.depth || left.file.localeCompare(right.file, "en"));
  const touched = [...new Set([...direct.map((row) => row.file), ...dependencies.map((row) => row.file)])].sort();
  const factFamilies = map.factFamilies
    .filter((family) => [family.owner, ...family.projections.map((item) => item.path), ...family.validators].some((file) => touched.includes(file)))
    .map((family) => Object.freeze({ id: family.id, owner: family.owner, owns: family.owns }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));

  const result = Object.freeze({
    schemaVersion: 2,
    resultType: "BLAST_RADIUS_LOOKUP",
    aiReaderContractRef: AI_READER_CONTRACT_REF,
    orderingContract: Object.freeze({
      direct: "LEXICOGRAPHIC_BY_FILE",
      dependencies: "ASCENDING_DEPTH_THEN_LEXICOGRAPHIC_BY_FILE",
      factFamilies: "LEXICOGRAPHIC_BY_ID",
      binarySkipped: "LEXICOGRAPHIC_BY_PATH",
    }),
    kind,
    query: String(query),
    maximumDepth,
    symbolVariants: kind === "symbol" ? symbolVariants(query) : null,
    direct: Object.freeze(direct.sort((left, right) => left.file.localeCompare(right.file, "en"))),
    dependencies: Object.freeze(dependencies),
    factFamilies: Object.freeze(factFamilies),
    developmentPlan: planDevelopmentSuites(touched),
    countPrediction: conditionalCountPrediction(kind, query, direct),
    binarySkipped: Object.freeze(binarySkipped.sort()),
    coverage: Object.freeze({
      trackedFiles: tracked.length,
      readFiles: tracked.length,
      binaryFiles: binarySkipped.length,
      unreadableFiles: 0,
    }),
    limitations: Object.freeze([
      Object.freeze({ id: "COINCIDENCE", effect: "OVER_REPORTS", description: "Text search cannot decide whether a match is a true dependency." }),
      Object.freeze({ id: "COMPUTED_UNMAPPED", effect: "UNDER_REPORTS", description: "Computed facts not connected through the code map may be missed." }),
      Object.freeze({ id: "HUMAN_JUDGMENT", effect: "OUT_OF_SCOPE", description: "Human-legibility and product-correctness decisions remain outside this lookup." }),
    ]),
  });
  const schemaIssues = await validateBlastRadiusResultSchema(result);
  if (schemaIssues.length) throw new Error(`Blast-radius result violates its closed schema:\n- ${schemaIssues.join("\n- ")}`);
  return result;
}

export function blastRadiusSelfTest() {
  const controls = [
    ["typographic punctuation", contentMatches("exact", "child's path", "child’s\npath")],
    ["whole word", contentMatches("word", "count", "count + counter") && !contentMatches("word", "count", "counter")],
    ["governed snake symbol", contentMatches("symbol", "promotion_ratio", "promotion_ratio")],
    ["governed camel symbol", contentMatches("symbol", "promotion_ratio", "promotionRatio")],
    ["governed upper symbol", contentMatches("symbol", "promotion_ratio", "PROMOTION_RATIO")],
    ["mixed-case symbol rejected", !contentMatches("symbol", "promotion_ratio", "pRoMoTiOnRaTiO")],
    ["padded count", contentMatches("count", "44", "minimum 00044")],
    ["separated count", contentMatches("count", "6048", "6_048 and 6,048")],
    ["numeric pathname", contentMatches("count", "44", "fixtures/044/control.json")],
    ["wrapped exact starts on first line", matchingLineNumbers("exact", "alpha beta", "alpha\nbeta")[0] === 1],
    ["symbol variants are closed", JSON.stringify(symbolVariants("promotion_ratio")) === JSON.stringify(["promotion_ratio", "PROMOTION_RATIO", "promotionRatio", "PromotionRatio", "promotion-ratio"])],
    ["list-entry prediction", conditionalCountPrediction("count", "44", [{ lines: [{ text: "- governed item" }] }]).listEntryCase === true],
  ];
  const failures = controls.filter(([, pass]) => !pass).map(([name]) => name);
  return Object.freeze({
    schemaVersion: 2,
    resultType: "BLAST_RADIUS_SELF_TEST",
    aiReaderContractRef: AI_READER_CONTRACT_REF,
    pass: failures.length === 0,
    controls: controls.length,
    failures: Object.freeze(failures),
  });
}

function parseArguments(arguments_) {
  const result = { human: false, jsonRequested: false, humanRequested: false, selfTest: false, maximumDepth: DEFAULT_BLAST_RADIUS_DEPTH };
  for (const argument of arguments_) {
    if (argument === "--json") result.jsonRequested = true;
    else if (argument === "--human") result.humanRequested = true;
    else if (argument === "--self-test") result.selfTest = true;
    else if (argument.startsWith("--depth=")) result.maximumDepth = parseMaximumDepthArgument(argument.slice(8));
    else {
      const match = argument.match(/^--(exact|word|symbol|count)=(.*)$/u);
      if (match) [result.kind, result.query] = [match[1], match[2]];
      else throw new Error(`Unknown argument ${argument}.`);
    }
  }
  if (result.jsonRequested && result.humanRequested) throw new Error("--json and --human are mutually exclusive.");
  result.human = result.humanRequested;
  return result;
}

function renderHuman(result) {
  const lines = [
    `BLAST_RADIUS kind=${result.kind} query=${JSON.stringify(result.query)} maximumDepth=${result.maximumDepth}`,
    `DIRECT_FILES=${result.direct.length}`,
  ];
  for (const row of result.direct) lines.push(`FILE ${row.file} role=${row.role} impact=${row.releaseImpact} lines=${row.lines.map((item) => item.line).join(",") || "path"}`);
  lines.push(`DEPENDENCY_FILES=${result.dependencies.length}`);
  for (const row of result.dependencies) lines.push(`DEPENDENCY depth=${row.depth} role=${row.dependencyRole} direction=${row.traversalDirection} relation=${row.relationId} predecessor=${row.predecessor} file=${row.file}`);
  lines.push(`FACT_FAMILIES=${result.factFamilies.length}`);
  for (const family of result.factFamilies) lines.push(`OWNER ${family.id} -> ${family.owner}`);
  if (result.countPrediction) lines.push(`COUNT_PREDICTION ${JSON.stringify(result.countPrediction)}`);
  lines.push(`SUITES ${result.developmentPlan.suites.join(",")}`);
  lines.push("LIMITATIONS", ...result.limitations.map((item) => `- ${item.id} ${item.effect}: ${item.description}`));
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.selfTest) {
      const result = blastRadiusSelfTest();
      process.stdout.write(options.human
        ? `${result.pass ? "PASS" : "FAIL"} CONTROLS=${result.controls}${result.failures.length ? ` FAILURES=${result.failures.join(",")}` : ""}\n`
        : `${JSON.stringify(result, null, 2)}\n`);
      if (!result.pass) process.exitCode = 1;
    } else {
      const result = await blastRadiusLookup(options);
      process.stdout.write(options.human ? renderHuman(result) : `${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
