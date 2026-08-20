import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const RIGHTS_STATE_PATHS = Object.freeze([
  ".github/workflows/audit.yml",
  ".github/workflows/hosted-windows-observation.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/trusted-https-canary.yml",
  "LICENSE",
  "OPEN_SOURCE_POLICY.md",
  "THIRD_PARTY_NOTICES.md",
  "assets/fonts/Inter-Variable.ttf",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/math-quest-icon.svg",
  "assets/sounds/close.wav",
  "assets/sounds/confirm.wav",
  "assets/sounds/generate-sounds.ps1",
  "assets/sounds/incorrect.wav",
  "assets/sounds/tap.wav",
  "audit/lib/trusted-https-canary-supply-chain.mjs",
  "audit/lib/trusted-https-canary.mjs",
  "audit/lib/playwright-focused-contract.mjs",
  "audit/lib/playwright-deep-ux-census.mjs",
  "audit/lib/tutorial-manifest.mjs",
  "audit/install-reviewed-ci-dependencies.ps1",
  "audit/playwright/compact-reporter.mjs",
  "audit/playwright/critical-journeys.spec.mjs",
  "audit/playwright/fixtures.mjs",
  "audit/playwright/deep-ux-census.spec.mjs",
  "audit/run-playwright-deep-ux-census.mjs",
  "audit/run-playwright-focused.mjs",
  "audit/run-trusted-https-canary.mjs",
  "audit/run-trusted-https-canary.ps1",
  "audit/schemas/tutorial-manifest-v1.schema.json",
  "audit/tests/playwright-focused-contract.test.mjs",
  "audit/tests/playwright-deep-ux-census.test.mjs",
  "audit/tests/tutorial-manifest.test.mjs",
  "audit/validate-trusted-https-canary.mjs",
  "curriculum/math-quest-tutorial-manifest-v1.json",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
  "licenses/ci-toolchain.md",
  "licenses/component-register-v1.json",
  "licenses/evidence-paths-v1.json",
  "licenses/first-party-paths-v1.txt",
  "licenses/sound-effects.md",
  "package-lock.json",
  "package.json",
  "playwright.config.mjs",
  "playwright.deep-ux.config.mjs",
  "tools/build-tutorial-manifest.mjs",
  "tools/sync-tutorial-manifest.mjs",
]);

export async function rightsStateSha256(root) {
  const hash = createHash("sha256");
  for (const relativePath of RIGHTS_STATE_PATHS) {
    const bytes = await readFile(path.join(root, relativePath));
    hash.update(`${relativePath}\0${bytes.byteLength}\0`, "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}
