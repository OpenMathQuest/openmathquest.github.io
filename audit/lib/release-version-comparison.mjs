import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hermeticGit } from "./repository-code-map.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const betaVersion = /^\d+\.\d+\.\d+-beta\.(0|[1-9]\d*)$/u;

export async function loadReleaseVersionComparison(commit) {
  const before = hermeticGit(["show", `${commit}:VERSION`], { root }).trim();
  const after = (await readFile(new URL("../../VERSION", import.meta.url), "utf8")).trim();
  assert.match(before, betaVersion, "immutable baseline VERSION must name a beta");
  assert.match(after, betaVersion, "candidate VERSION must name a beta");
  return Object.freeze({
    baseline: Object.freeze({ observed: before, comparison: before }),
    candidate: Object.freeze({ observed: after, comparison: before }),
    evidence: Object.freeze({
      status: "VERIFIED_DECLARED_RELEASE_VERSION",
      owner: "VERSION",
      baselineVersion: before,
      candidateVersion: after,
      comparedFields: Object.freeze(["CONSTANTS.PRODUCT_VERSION", "state.productVersion", "exportedState.productVersion"]),
    }),
  });
}

export function comparableReleaseConstants(constants, version) {
  assert.equal(constants.PRODUCT_VERSION, version.observed, "engine product version differs from VERSION");
  return { ...constants, PRODUCT_VERSION: version.comparison };
}

export function comparableReleaseState(state, version) {
  assert.equal(state.productVersion, version.observed, "saved product version differs from VERSION");
  return { ...state, productVersion: version.comparison };
}

export function comparableReleaseExport(serialized, version) {
  assert.equal(JSON.parse(serialized).productVersion, version.observed, "exported product version differs from VERSION");
  const before = `"productVersion":${JSON.stringify(version.observed)}`;
  const after = `"productVersion":${JSON.stringify(version.comparison)}`;
  assert.equal(serialized.split(before).length, 2, "export must contain one exact product-version field");
  return serialized.replace(before, after);
}
