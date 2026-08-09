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
  "audit/run-trusted-https-canary.mjs",
  "audit/run-trusted-https-canary.ps1",
  "audit/validate-trusted-https-canary.mjs",
  "licenses/Inter-OFL.txt",
  "licenses/app-icons.md",
  "licenses/ci-toolchain.md",
  "licenses/component-register-v1.json",
  "licenses/evidence-paths-v1.json",
  "licenses/first-party-paths-v1.txt",
  "licenses/sound-effects.md",
  "package-lock.json",
  "package.json",
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
