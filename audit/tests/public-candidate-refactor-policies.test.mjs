import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pagesValidationDependencyProjection } from "../lib/ci-dependency-policy.mjs";
import {
  extendedToolchainFindings,
  legacyToolchainRegister,
  reviewedContentFindings,
  reviewedRegistryMetadataMutationFindings,
} from "../lib/public-candidate-refactor-policies.mjs";

const atSign = String.fromCodePoint(64);
const reviewedRegistryContact = `i${atSign}izs.me`;
const unreviewedRegistryContact = `dev${atSign}example.test`;
const reviewedRegistryLine = `"deprecated": "Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting ${reviewedRegistryContact}",`;

function personalIdentityFindings(relativePath, text) {
  return String(text).split(/\r?\n/u).flatMap((line, index) => (
    line.includes(atSign) ? [`${relativePath}:${index + 1}: personal identity`] : []
  ));
}

test("only the exact reviewed package-lock registry line bypasses personal-metadata detection", () => {
  const packageLockText = `before\n${reviewedRegistryLine}\nafter`;
  assert.deepEqual(reviewedContentFindings(personalIdentityFindings, "package-lock.json", packageLockText), []);
  assert.equal(reviewedContentFindings(personalIdentityFindings, "package.json", reviewedRegistryLine).length, 1);
  assert.equal(
    reviewedContentFindings(personalIdentityFindings, "package-lock.json", reviewedRegistryLine.replace(reviewedRegistryContact, unreviewedRegistryContact)).length,
    1,
  );
  assert.deepEqual(reviewedRegistryMetadataMutationFindings(personalIdentityFindings), []);
});

test("extended quality and security tool records validate beside the unchanged legacy projection", async () => {
  const [register, qualityPolicy, securityPolicy] = await Promise.all([
    readFile(new URL("../../licenses/component-register-v1.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../quality-gate-policy-v1.json", import.meta.url)),
    readFile(new URL("../security-gate-policy-v1.json", import.meta.url)),
  ]);
  const blobs = new Map([
    ["audit/quality-gate-policy-v1.json", qualityPolicy],
    ["audit/security-gate-policy-v1.json", securityPolicy],
  ]);
  assert.equal(legacyToolchainRegister(register).toolchain.length, 13);
  assert.deepEqual(extendedToolchainFindings(register, blobs), []);
  const mutant = structuredClone(register);
  mutant.toolchain[13].version = "0.0.0-mutant";
  assert.match(extendedToolchainFindings(mutant, blobs).join("\n"), /toolchain\[13\]/u);
  assert.match(extendedToolchainFindings({ ...register, toolchain: register.toolchain.slice(0, 22) }, blobs).join("\n"), /twenty-three/u);
});

async function pagesDependencyInputs() {
  const [packageJsonText, packageLockText, qualityPolicyText] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
    readFile(new URL("../../audit/quality-gate-policy-v1.json", import.meta.url), "utf8"),
  ]);
  return { packageJsonText, packageLockText, qualityPolicyText };
}

test("Pages validation projects only the approved locked schema-validator closure", async () => {
  const input = await pagesDependencyInputs();
  const original = JSON.parse(input.packageLockText);
  const { packageJson, packageLock } = pagesValidationDependencyProjection(input);
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts, undefined);
  assert.deepEqual(packageJson.devDependencies, { ajv: original.packages["node_modules/ajv"].version });
  assert.deepEqual(Object.keys(packageLock.packages), ["", "node_modules/ajv", "node_modules/fast-deep-equal",
    "node_modules/fast-uri", "node_modules/json-schema-traverse", "node_modules/require-from-string"]);
  for (const [key, record] of Object.entries(packageLock.packages).slice(1)) {
    assert.deepEqual(record, original.packages[key], key);
  }
});

test("[NC-PAGES-VALIDATOR-BOOTSTRAP] unreviewed dependencies and missing installation fail closed", async () => {
  const input = await pagesDependencyInputs();
  assert.throws(() => pagesValidationDependencyProjection({ ...input, packageLockText: input.packageLockText + " " }), /SHA-256/u);
  const manifest = JSON.parse(input.packageJsonText);
  manifest.devDependencies.ajv = "8.19.0";
  assert.throws(() => pagesValidationDependencyProjection({ ...input, packageJsonText: JSON.stringify(manifest) }), /direct dev dependencies/u);
  const workflow = await readFile(new URL("../../.github/workflows/pages.yml", import.meta.url), "utf8");
  assertPagesValidationBootstrap(workflow);
  const withoutInstall = workflow.replace(/      - name: Install reviewed Pages validation dependencies[\s\S]*?(?=      - name: Reject private, legacy, or unregistered material)/u, "");
  assert.notEqual(withoutInstall, workflow);
  assert.throws(() => assertPagesValidationBootstrap(withoutInstall), { name: "AssertionError" });
  assert.throws(() => assertPagesValidationBootstrap(workflow.replace("ci --ignore-scripts", "ci")), { name: "AssertionError" });
  assert.throws(() => assertPagesValidationBootstrap(workflow.replace("pagesValidationDependencyProjection({", "missingProjection({")), { name: "AssertionError" });
});

function assertPagesValidationBootstrap(workflow) {
  const setup = workflow.indexOf("- name: Set up Node.js 24");
  const install = workflow.indexOf("- name: Install reviewed Pages validation dependencies");
  const guard = workflow.indexOf("- name: Reject private, legacy, or unregistered material");
  assert.ok(setup >= 0 && install > setup && guard > install);
  const step = workflow.slice(install, guard);
  assert.match(step, /pagesValidationDependencyProjection\(\{ packageJsonText, packageLockText, qualityPolicyText \}\)/u);
  assert.match(step, /ci --ignore-scripts --omit=optional --no-audit --no-fund/u);
  assert.match(step, /test ! -e node_modules/u);
  assert.match(step, /mv "\$MQ_PAGES_VALIDATION_PROJECT\/node_modules" node_modules/u);
  assert.match(step, /git diff --exit-code -- package\.json package-lock\.json audit\/quality-gate-policy-v1\.json/u);
}
