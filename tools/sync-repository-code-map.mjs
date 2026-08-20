import { readFile, writeFile } from "node:fs/promises";
import { loadRepositoryCodeMap, repositoryCodeMapMarkdown } from "../audit/lib/repository-code-map.mjs";

const documentPath = new URL("../docs/repository-structure.md", import.meta.url);
const start = "<!-- REPOSITORY-CODE-MAP-START -->";
const end = "<!-- REPOSITORY-CODE-MAP-END -->";
const check = process.argv.includes("--check");

const map = await loadRepositoryCodeMap();
const generated = repositoryCodeMapMarkdown(map).trimEnd();
const existing = await readFile(documentPath, "utf8");
const startIndex = existing.indexOf(start);
const endIndex = existing.indexOf(end);
const next = startIndex >= 0 && endIndex > startIndex
  ? `${existing.slice(0, startIndex)}${generated}${existing.slice(endIndex + end.length)}`
  : `${existing.trimEnd()}\n\n${generated}\n`;

if (check) {
  if (next !== existing) throw new Error("docs/repository-structure.md is stale relative to the canonical repository code map.");
} else {
  await writeFile(documentPath, next, "utf8");
}
