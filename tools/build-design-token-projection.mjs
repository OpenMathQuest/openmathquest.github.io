#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESIGN_TOKEN_PROJECTION_CSS_PATH,
  DESIGN_TOKEN_SOURCE_PATH,
  designTokenProjectionSourceIssues,
  expectedDesignTokenProjection,
  renderDesignTokenProjectionCss,
} from "../audit/lib/design-token-projection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const unknown = process.argv.slice(2).filter((argument) => argument !== "--write" && argument !== "--check");
if (unknown.length) throw new Error(`Unknown argument ${unknown[0]}.`);
if (write === check) throw new Error("Choose exactly one of --write or --check.");

const tokenPath = path.join(root, DESIGN_TOKEN_SOURCE_PATH);
const cssPath = path.join(root, DESIGN_TOKEN_PROJECTION_CSS_PATH);
const tokens = JSON.parse(await readFile(tokenPath, "utf8"));
const sourceIssues = designTokenProjectionSourceIssues(tokens);
if (sourceIssues.length) throw new Error(`Design-token source cannot be projected:\n- ${sourceIssues.join("\n- ")}`);
const css = renderDesignTokenProjectionCss(tokens);
const synchronizedTokens = { ...tokens, projection: expectedDesignTokenProjection(tokens) };
const synchronizedTokenText = `${JSON.stringify(synchronizedTokens, null, 2)}\n`;

if (write) {
  await writeFile(cssPath, css, "utf8");
  await writeFile(tokenPath, synchronizedTokenText, "utf8");
} else {
  const [actualCss, actualTokenText] = await Promise.all([
    readFile(cssPath, "utf8"),
    readFile(tokenPath, "utf8"),
  ]);
  if (actualCss !== css) throw new Error(`${DESIGN_TOKEN_PROJECTION_CSS_PATH} is stale.`);
  if (actualTokenText !== synchronizedTokenText) throw new Error(`${DESIGN_TOKEN_SOURCE_PATH} projection metadata is stale.`);
}

process.stdout.write(`${JSON.stringify({
  resultType: "DESIGN_TOKEN_PROJECTION_BUILD",
  state: write ? "WRITTEN" : "VERIFIED",
  sourcePath: DESIGN_TOKEN_SOURCE_PATH,
  outputPath: DESIGN_TOKEN_PROJECTION_CSS_PATH,
  projection: synchronizedTokens.projection,
})}\n`);
