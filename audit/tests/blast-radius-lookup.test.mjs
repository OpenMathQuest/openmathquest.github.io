import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { AI_READER_CONTRACT_REF } from "../lib/repository-code-map.mjs";
import {
  BLAST_RADIUS_RESULT_SCHEMA_PATH,
  blastRadiusLookup,
  blastRadiusSelfTest,
  conditionalCountPrediction,
  contentMatches,
  matchingLineNumbers,
  normalizeMaximumDepth,
  symbolVariants,
  validateBlastRadiusResultSchema,
} from "../../tools/blast-radius-lookup.mjs";

test("blast-radius self-test protects every governed matcher effect", () => {
  assert.deepEqual(blastRadiusSelfTest(), {
    schemaVersion: 2,
    resultType: "BLAST_RADIUS_SELF_TEST",
    aiReaderContractRef: AI_READER_CONTRACT_REF,
    pass: true,
    controls: 12,
    failures: [],
  });
  assert.equal(contentMatches("count", "44", "00044"), true, "leading-zero normalization is required");
  assert.equal(contentMatches("count", "6048", "6_048"), true, "numeric separators are equivalent");
  assert.equal(contentMatches("count", "44", "fixtures/044/item.json"), true, "numeric path matching uses the same count oracle");
  assert.deepEqual(symbolVariants("promotion_ratio"), ["promotion_ratio", "PROMOTION_RATIO", "promotionRatio", "PromotionRatio", "promotion-ratio"]);
  assert.equal(contentMatches("symbol", "promotion_ratio", "pRoMoTiOnRaTiO"), false, "arbitrary case folding is forbidden");
  assert.deepEqual(matchingLineNumbers("exact", "alpha beta", "alpha\nbeta"), [1]);
  assert.equal(conditionalCountPrediction("count", "44", [{ lines: [{ text: "- governed item" }] }]).listEntryCase, true);
});

test("real lookup combines direct content/path hits with code-map owners and dependent gates", async () => {
  const result = await blastRadiusLookup({ kind: "symbol", query: "tutorial_manifest", maximumDepth: 2 });
  assert.ok(result.direct.some((row) => row.file === "audit/lib/tutorial-manifest.mjs"));
  assert.ok(result.factFamilies.some((family) => family.id === "tutorial.linkage"));
  assert.ok(result.developmentPlan.suites.includes("tutorial"));
  assert.ok([...result.direct, ...result.dependencies].some((row) => row.file === "curriculum/math-quest-tutorial-manifest-v1.json"));
  assert.equal(result.maximumDepth, 2);
  assert.deepEqual(await validateBlastRadiusResultSchema(result), []);
  assert.equal(BLAST_RADIUS_RESULT_SCHEMA_PATH, "audit/schemas/blast-radius-result-v2.schema.json");
  for (const row of result.dependencies) {
    assert.ok(row.predecessor);
    assert.ok(row.relationId);
    assert.ok(["ARTIFACT_RELATION", "FACT_PROJECTION", "FACT_VALIDATOR"].includes(row.relationClass));
    assert.ok(["FORWARD_SOURCE_TO_TARGET", "REVERSE_TARGET_TO_SOURCE"].includes(row.traversalDirection));
    assert.equal(row.dependencyRole, row.traversalDirection === "FORWARD_SOURCE_TO_TARGET" ? "DEPENDENT" : "DEPENDENCY");
  }
  assert.deepEqual(result.aiReaderContractRef, AI_READER_CONTRACT_REF);
  assert.equal(result.coverage.trackedFiles, result.coverage.readFiles);
  assert.equal(result.coverage.unreadableFiles, 0);
  assert.ok(result.limitations.some((item) => item.id === "HUMAN_JUDGMENT" && item.effect === "OUT_OF_SCOPE"));
});

test("count lookup reports conditional list-entry movement rather than asserting a copied count", async () => {
  const result = await blastRadiusLookup({ kind: "count", query: "126", maximumDepth: 1 });
  assert.equal(result.countPrediction.current, "126");
  assert.equal(result.countPrediction.ifListEntryAdded, "127");
  assert.equal(result.countPrediction.ifListEntryRemoved, "125");
  assert.equal(typeof result.countPrediction.listEntryCase, "boolean");
  assert.match(result.countPrediction.warning, /Verify the owning collection/u);
});

test("CLI output is closed JSON by default and human text requires an explicit opt-in", () => {
  const tool = path.resolve("tools/blast-radius-lookup.mjs");
  const machine = spawnSync(process.execPath, [tool, "--self-test"], { cwd: path.resolve("."), encoding: "utf8", timeout: 15_000 });
  assert.equal(machine.status, 0, machine.stderr);
  const parsed = JSON.parse(machine.stdout);
  assert.equal(parsed.resultType, "BLAST_RADIUS_SELF_TEST");
  assert.deepEqual(parsed.aiReaderContractRef, AI_READER_CONTRACT_REF);

  const human = spawnSync(process.execPath, [tool, "--self-test", "--human"], { cwd: path.resolve("."), encoding: "utf8", timeout: 15_000 });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^PASS CONTROLS=12/u);
  assert.throws(() => JSON.parse(human.stdout));

  for (const invalidDepth of ["-1", "1.5", "banana", "9", ""]) {
    const invalid = spawnSync(process.execPath, [tool, "--exact=VERSION", `--depth=${invalidDepth}`], { cwd: path.resolve("."), encoding: "utf8", timeout: 15_000 });
    assert.equal(invalid.status, 2, invalidDepth);
    assert.match(invalid.stderr, /maximumDepth must be an integer from 0 through 8/u, invalidDepth);
  }
  assert.equal(normalizeMaximumDepth(0), 0);
  assert.equal(normalizeMaximumDepth(8), 8);
  assert.throws(() => normalizeMaximumDepth(Number.NaN), /maximumDepth/u);
});
