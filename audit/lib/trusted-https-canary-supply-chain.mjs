import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
  PLAYWRIGHT_CORE_SRI,
  PLAYWRIGHT_CORE_VERSION,
} from "./trusted-https-canary.mjs";

export const CADDY_ARCHIVE_URL = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_windows_amd64.zip`;
export const PLAYWRIGHT_CORE_URL = `https://registry.npmjs.org/playwright-core/-/playwright-core-${PLAYWRIGHT_CORE_VERSION}.tgz`;
export const PLAYWRIGHT_TEST_VERSION = "1.62.1";
export const PLAYWRIGHT_TEST_URL = `https://registry.npmjs.org/@playwright/test/-/test-${PLAYWRIGHT_TEST_VERSION}.tgz`;
export const PLAYWRIGHT_TEST_SRI = "sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==";
export const PLAYWRIGHT_PACKAGE_URL = `https://registry.npmjs.org/playwright/-/playwright-${PLAYWRIGHT_TEST_VERSION}.tgz`;
export const PLAYWRIGHT_PACKAGE_SRI = "sha512-0M+L3LAD8/nm554LOla9Ayx0j0tmFZ0FBcoQ7F1VuVHpM/XpiC8RcDzBQB8W5+hA8L22THxELzeF+2WcUzvcLg==";
export const FSEVENTS_VERSION = "2.3.2";
export const FSEVENTS_URL = `https://registry.npmjs.org/fsevents/-/fsevents-${FSEVENTS_VERSION}.tgz`;
export const FSEVENTS_SRI = "sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==";

const FORBIDDEN_PUBLIC_NAMES = Object.freeze([
  "package.json",
  "package-lock.json",
  "licenses/ci-toolchain.md",
  "trusted-https-canary",
  "caddy.exe",
  "@playwright/test",
  "node_modules/playwright",
  "playwright-core",
]);

function exactKeys(value, expected) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && Object.keys(value).every((key, index) => key === expected[index]),
  );
}

function parseJson(text, label, findings) {
  try {
    return JSON.parse(String(text));
  } catch {
    findings.push(`${label}: invalid JSON`);
    return null;
  }
}

function count(text, expression) {
  return [...String(text).matchAll(expression)].length;
}

export function trustedHttpsCanarySupplyChainFindings(input) {
  const findings = [];
  const packageJson = parseJson(input.packageJsonText, "package.json", findings);
  const packageLock = parseJson(input.packageLockText, "package-lock.json", findings);
  if (packageJson) {
    if (!exactKeys(packageJson, ["name", "version", "private", "license", "engines", "devDependencies"])) {
      findings.push("package.json: CI dependency manifest must use the exact closed schema");
    }
    if (packageJson.name !== "open-math-quest-ci-tools" || packageJson.version !== "0.0.0" || packageJson.private !== true || packageJson.license !== "MIT") {
      findings.push("package.json: CI dependency manifest identity must remain exact and private");
    }
    if (!exactKeys(packageJson.engines, ["node"]) || packageJson.engines?.node !== "24.14.0") {
      findings.push("package.json: Node must remain pinned to 24.14.0");
    }
    if (!exactKeys(packageJson.devDependencies, ["@playwright/test", "playwright-core"])
        || packageJson.devDependencies?.["@playwright/test"] !== PLAYWRIGHT_TEST_VERSION
        || packageJson.devDependencies?.["playwright-core"] !== PLAYWRIGHT_CORE_VERSION) {
      findings.push(`package.json: Playwright Test and Playwright Core must remain the exact reviewed dev dependencies at ${PLAYWRIGHT_TEST_VERSION}`);
    }
  }
  if (packageLock) {
    if (!exactKeys(packageLock, ["name", "version", "lockfileVersion", "requires", "packages"])) {
      findings.push("package-lock.json: lockfile must use the exact closed schema");
    }
    if (packageLock.name !== "open-math-quest-ci-tools" || packageLock.version !== "0.0.0" || packageLock.lockfileVersion !== 3 || packageLock.requires !== true) {
      findings.push("package-lock.json: lockfile identity must remain exact");
    }
    if (!exactKeys(packageLock.packages, ["", "node_modules/@playwright/test", "node_modules/fsevents", "node_modules/playwright", "node_modules/playwright-core"])) {
      findings.push("package-lock.json: lockfile must contain only the reviewed Playwright Test dependency closure");
    }
    const root = packageLock.packages?.[""];
    if (!exactKeys(root, ["name", "version", "license", "devDependencies", "engines"])
        || root?.name !== packageJson?.name
        || root?.version !== packageJson?.version
        || root?.license !== "MIT"
        || !exactKeys(root?.devDependencies, ["@playwright/test", "playwright-core"])
        || root?.devDependencies?.["@playwright/test"] !== PLAYWRIGHT_TEST_VERSION
        || root?.devDependencies?.["playwright-core"] !== PLAYWRIGHT_CORE_VERSION
        || !exactKeys(root?.engines, ["node"])
        || root?.engines?.node !== "24.14.0") {
      findings.push("package-lock.json: root package must exactly mirror the reviewed manifest");
    }
    const playwright = packageLock.packages?.["node_modules/playwright-core"];
    if (!exactKeys(playwright, ["version", "resolved", "integrity", "dev", "license", "bin", "engines"])
        || playwright?.version !== PLAYWRIGHT_CORE_VERSION
        || playwright?.resolved !== PLAYWRIGHT_CORE_URL
        || playwright?.integrity !== PLAYWRIGHT_CORE_SRI
        || playwright?.dev !== true
        || playwright?.license !== "Apache-2.0"
        || !exactKeys(playwright?.bin, ["playwright-core"])
        || playwright?.bin?.["playwright-core"] !== "cli.js"
        || !exactKeys(playwright?.engines, ["node"])
        || playwright?.engines?.node !== ">=18") {
      findings.push("package-lock.json: Playwright Core artifact, integrity, licence, and package metadata must remain exact");
    }
    const testRunner = packageLock.packages?.["node_modules/@playwright/test"];
    if (!exactKeys(testRunner, ["version", "resolved", "integrity", "dev", "license", "dependencies", "bin", "engines"])
        || testRunner?.version !== PLAYWRIGHT_TEST_VERSION
        || testRunner?.resolved !== PLAYWRIGHT_TEST_URL
        || testRunner?.integrity !== PLAYWRIGHT_TEST_SRI
        || testRunner?.dev !== true
        || testRunner?.license !== "Apache-2.0"
        || !exactKeys(testRunner?.dependencies, ["playwright"])
        || testRunner?.dependencies?.playwright !== PLAYWRIGHT_TEST_VERSION
        || !exactKeys(testRunner?.bin, ["playwright"])
        || testRunner?.bin?.playwright !== "cli.js"
        || !exactKeys(testRunner?.engines, ["node"])
        || testRunner?.engines?.node !== ">=20") {
      findings.push("package-lock.json: Playwright Test artifact, integrity, licence, and package metadata must remain exact");
    }
    const runnerPackage = packageLock.packages?.["node_modules/playwright"];
    if (!exactKeys(runnerPackage, ["version", "resolved", "integrity", "dev", "license", "dependencies", "bin", "engines", "optionalDependencies"])
        || runnerPackage?.version !== PLAYWRIGHT_TEST_VERSION
        || runnerPackage?.resolved !== PLAYWRIGHT_PACKAGE_URL
        || runnerPackage?.integrity !== PLAYWRIGHT_PACKAGE_SRI
        || runnerPackage?.dev !== true
        || runnerPackage?.license !== "Apache-2.0"
        || !exactKeys(runnerPackage?.dependencies, ["playwright-core"])
        || runnerPackage?.dependencies?.["playwright-core"] !== PLAYWRIGHT_CORE_VERSION
        || !exactKeys(runnerPackage?.bin, ["playwright"])
        || runnerPackage?.bin?.playwright !== "cli.js"
        || !exactKeys(runnerPackage?.engines, ["node"])
        || runnerPackage?.engines?.node !== ">=20"
        || !exactKeys(runnerPackage?.optionalDependencies, ["fsevents"])
        || runnerPackage?.optionalDependencies?.fsevents !== FSEVENTS_VERSION) {
      findings.push("package-lock.json: Playwright runner artifact, integrity, licence, and dependency metadata must remain exact");
    }
    const fsevents = packageLock.packages?.["node_modules/fsevents"];
    if (!exactKeys(fsevents, ["version", "resolved", "integrity", "dev", "hasInstallScript", "license", "optional", "os", "engines"])
        || fsevents?.version !== FSEVENTS_VERSION
        || fsevents?.resolved !== FSEVENTS_URL
        || fsevents?.integrity !== FSEVENTS_SRI
        || fsevents?.dev !== true
        || fsevents?.hasInstallScript !== true
        || fsevents?.license !== "MIT"
        || fsevents?.optional !== true
        || !Array.isArray(fsevents?.os)
        || fsevents.os.length !== 1
        || fsevents.os[0] !== "darwin"
        || !exactKeys(fsevents?.engines, ["node"])
        || fsevents?.engines?.node !== "^8.16.0 || ^10.6.0 || >=11.0.0") {
      findings.push("package-lock.json: optional fsevents artifact, integrity, licence, and macOS-only metadata must remain exact");
    }
  }

  const dependencyInstaller = String(input.dependencyInstallerText);
  if (count(dependencyInstaller, /\bnpm(?:\.cmd)?\s+ci\b/gu) !== 1
      || !dependencyInstaller.includes("ci --ignore-scripts --omit=optional --no-audit --no-fund")
      || !dependencyInstaller.includes("$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'")
      || !dependencyInstaller.includes("$manifest.name -cne '@playwright/test'")
      || !dependencyInstaller.includes("$manifest.version -cne '1.62.1'")) {
    findings.push("audit/install-reviewed-ci-dependencies.ps1: install must retain the exact lockfile, script, optional-dependency, browser-download, and installed-version controls");
  }
  if (/(?:\bnpx\b|\bnpm(?:\.cmd)?\s+install\b|\bchoco\s+install\b|\bwinget\s+install\b|\bpip\d*\s+install\b|\bgit\s+clone\b|\bcurl\b|\bwget\b|Invoke-WebRequest)/iu.test(dependencyInstaller)) {
    findings.push("audit/install-reviewed-ci-dependencies.ps1: an unreviewed installer or downloader was introduced");
  }

  const wrapper = String(input.wrapperText);
  if (!wrapper.includes(`$caddyVersion = '${CADDY_VERSION}'`)
      || !wrapper.includes(`$caddyUrl = '${CADDY_ARCHIVE_URL}'`)
      || !wrapper.includes(`$caddySha256 = '${CADDY_ARCHIVE_SHA256}'`)
      || !wrapper.includes(`$caddySha512 = '${CADDY_ARCHIVE_SHA512}'`)) {
    findings.push("audit/run-trusted-https-canary.ps1: Caddy version, archive URL, and both checksums must remain exact");
  }
  if (count(wrapper, /Invoke-WebRequest\b/gu) !== 1
      || !wrapper.includes("Invoke-WebRequest -UseBasicParsing -Uri $caddyUrl -OutFile $zipPath")) {
    findings.push("audit/run-trusted-https-canary.ps1: exactly one reviewed Caddy download is allowed");
  }
  if (count(wrapper, /\bnpm\s+(?:ci|install)\b/gu) !== 2
      || count(wrapper, /npm ci --ignore-scripts --omit=optional --no-audit --no-fund/gu) !== 1
      || !wrapper.includes("$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'")) {
    findings.push("audit/run-trusted-https-canary.ps1: npm ci must retain every reviewed hardening flag and suppress browser downloads");
  }
  if (/(?:\bnpx\b|\bchoco\s+install\b|\bwinget\s+install\b|\bpip\d*\s+install\b|\bgit\s+clone\b|\bcurl\b|\bwget\b)/iu.test(wrapper)) {
    findings.push("audit/run-trusted-https-canary.ps1: an unreviewed installer or downloader was introduced");
  }
  for (const required of [
    "Canary evidence output must be a new file inside the exact repository checkout.",
    "cleanup-identifiers-v1.json",
    "Refusing to stop a process outside the disposable canary workspace.",
    "Fallback certificate removal did not remove the exact canary root.",
    "Fallback teardown left the canary HTTPS port listening.",
  ]) {
    if (!wrapper.includes(required)) findings.push(`audit/run-trusted-https-canary.ps1: missing crash-safe cleanup control: ${required}`);
  }

  const validator = String(input.validatorText);
  for (const required of [
    "workflowRunId: process.env.GITHUB_RUN_ID",
    "workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT",
  ]) {
    if (!validator.includes(required)) findings.push(`audit/validate-trusted-https-canary.mjs: missing live workflow freshness binding: ${required}`);
  }

  const workflow = String(input.workflowText);
  if (!/^on:\n  workflow_dispatch:\n/mu.test(workflow)
      || /\n\s{2}(?:push|pull_request|schedule):/u.test(workflow)
      || !workflow.includes("runs-on: windows-latest")) {
    findings.push(".github/workflows/trusted-https-canary.yml: canary must remain manual and GitHub-hosted Windows only");
  }
  if (!workflow.includes(".\\audit\\run-trusted-https-canary.ps1")
      || /(?:audit\.bat|run-audit\.(?:mjs|ps1))/iu.test(workflow)) {
    findings.push(".github/workflows/trusted-https-canary.yml: workflow must invoke only the narrow canary, never the full gauntlet");
  }
  if (!workflow.includes("path: audit-artifacts/trusted-https-canary-v1.json")
      || /(?:screenshot|trace|\.har\b|video)/iu.test(workflow)) {
    findings.push(".github/workflows/trusted-https-canary.yml: artifact upload must remain sanitized canonical JSON only");
  }

  const runner = String(input.runnerText);
  for (const required of [
    "skip_install_trust",
    "strict_sni_host on",
    "bind 127.0.0.1",
    "server.listen(requestedPort, \"127.0.0.1\"",
    "[data-action=\"install-help\"]",
    "[data-action=\"pwa-apply\"]",
    "[data-action=\"pwa-retry\"]",
    "[data-action=\"pwa-repair\"]",
    "v1.0.0-beta.1",
    "math-quest:v2",
    "math-quest:progress:v2",
    "responseHeaderSetSha256",
    "offlineCacheProof",
    "candidateMainFrameNavigations",
    "protectedMigrationProjection",
    "remainingMatchingCertificateCount",
    "profileBoundEdgeProcesses(profilePath)",
    "Get-CimInstance Win32_Process -Filter \\\"Name = 'msedge.exe'\\\" -ErrorAction Stop",
    "canaryWorkspaceRemovalAllowed(remainingProfileProcessCount)",
    "remainingProfileProcessSetSha256 = EMPTY_PROFILE_PROCESS_SET_SHA256",
    "await beta1Page.reload",
  ]) {
    if (!runner.includes(required)) findings.push(`audit/run-trusted-https-canary.mjs: missing required production-path canary control: ${required}`);
  }
  if (/(?:--ignore-certificate-errors|--allow-insecure-localhost|--unsafely-treat-insecure-origin-as-secure|--no-sandbox)/u.test(runner)) {
    findings.push("audit/run-trusted-https-canary.mjs: insecure browser flags are forbidden");
  }
  if (/legacy-recovery=beta1|\.navigate\s*\(/u.test(runner)) {
    findings.push("audit/run-trusted-https-canary.mjs: retained clients must update only through explicit reload, never a recovery query or forced navigation");
  }

  const publicSources = [input.builderText, input.releaseShellText, input.serviceWorkerText].map(String).join("\n");
  for (const name of FORBIDDEN_PUBLIC_NAMES) {
    if (publicSources.toLowerCase().includes(name.toLowerCase())) {
      findings.push(`child-facing release shell must exclude CI-only material: ${name}`);
    }
  }
  return findings;
}

export function trustedHttpsCanarySupplyChainMutationFailures(input) {
  const failures = [];
  const run = (label, field, change, expected) => {
    const mutant = { ...input, [field]: change(String(input[field])) };
    if (!trustedHttpsCanarySupplyChainFindings(mutant).some((finding) => expected.test(finding))) {
      failures.push(`trusted-HTTPS supply-chain mutation self-test did not reject ${label}`);
    }
  };
  run("a changed Playwright version", "packageJsonText", (text) => text.replace(`\"@playwright\/test\": \"${PLAYWRIGHT_TEST_VERSION}\"`, '"@playwright/test": "1.62.0"'), /exact reviewed dev dependencies/u);
  run("a changed Playwright integrity", "packageLockText", (text) => text.replace(PLAYWRIGHT_CORE_SRI, "sha512-forged"), /artifact, integrity/u);
  run("a changed Playwright Test integrity", "packageLockText", (text) => text.replace(PLAYWRIGHT_TEST_SRI, "sha512-forged"), /Playwright Test artifact, integrity/u);
  run("a changed Playwright runner integrity", "packageLockText", (text) => text.replace(PLAYWRIGHT_PACKAGE_SRI, "sha512-forged"), /Playwright runner artifact, integrity/u);
  run("a changed optional dependency integrity", "packageLockText", (text) => text.replace(FSEVENTS_SRI, "sha512-forged"), /optional fsevents artifact, integrity/u);
  run("an added dependency", "packageJsonText", (text) => text.replace(`\"playwright-core\": \"${PLAYWRIGHT_CORE_VERSION}\"`, `\"playwright-core\": \"${PLAYWRIGHT_CORE_VERSION}\",\n    \"another-package\": \"1.0.0\"`), /exact reviewed dev dependencies/u);
  run("relaxed focused dependency install", "dependencyInstallerText", (text) => text.replace("ci --ignore-scripts --omit=optional --no-audit --no-fund", "ci"), /install must retain/u);
  run("relaxed npm install flags", "wrapperText", (text) => text.replace("npm ci --ignore-scripts --omit=optional --no-audit --no-fund", "npm ci"), /retain every reviewed hardening flag/u);
  run("a changed Caddy URL", "wrapperText", (text) => text.replace(CADDY_ARCHIVE_URL, "https://example.invalid/caddy.zip"), /Caddy version, archive URL/u);
  run("a changed Caddy checksum", "wrapperText", (text) => text.replace(CADDY_ARCHIVE_SHA256, "0".repeat(64)), /Caddy version, archive URL/u);
  run("removed certificate absence proof", "wrapperText", (text) => text.replace("Fallback certificate removal did not remove the exact canary root.", "Certificate cleanup assumed."), /missing crash-safe cleanup control/u);
  run("removed workflow-run freshness binding", "validatorText", (text) => text.replace("workflowRunId: process.env.GITHUB_RUN_ID", "workflowRunId: undefined"), /missing live workflow freshness binding/u);
  run("removed lingering-profile deletion interlock", "runnerText", (text) => text.replaceAll("canaryWorkspaceRemovalAllowed(remainingProfileProcessCount)", "true"), /missing required production-path canary control/u);
  run("reintroduced forced legacy navigation", "runnerText", (text) => `${text}\nclient.navigate("./?legacy-recovery=beta1");`, /explicit reload, never a recovery query/u);
  return failures;
}
