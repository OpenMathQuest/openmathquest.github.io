import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rightsStateSha256 } from "../lib/rights-state.mjs";

async function populateRightsFixture(fixtureRoot) {
  const source = await readFile(new URL("../lib/rights-state.mjs", import.meta.url), "utf8");
  const declaredPaths = [...source.matchAll(/^  "([^"\n]+)",$/gmu)].map((match) => match[1]);
  assert.ok(declaredPaths.length > 0);
  for (const relativePath of declaredPaths) {
    const destination = path.join(fixtureRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "original fixture bytes");
  }
}

async function assertHelperRightsBinding(fixtureRoot, relativePath, baseline) {
  const helperPath = path.join(fixtureRoot, relativePath);
  await writeFile(helperPath, "changed helper bytes");
  assert.notEqual(await rightsStateSha256(fixtureRoot), baseline, `${relativePath} must affect rights evidence`);
  await writeFile(helperPath, "original fixture bytes");
  assert.equal(await rightsStateSha256(fixtureRoot), baseline);
}

export async function assertRightsInputBindings(relativePaths) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "math-quest-rights-inputs-"));
  try {
    await populateRightsFixture(fixtureRoot);
    const baseline = await rightsStateSha256(fixtureRoot);
    for (const relativePath of relativePaths) await assertHelperRightsBinding(fixtureRoot, relativePath, baseline);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}
