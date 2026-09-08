import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
