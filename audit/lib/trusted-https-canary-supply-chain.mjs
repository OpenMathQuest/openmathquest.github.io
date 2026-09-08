import {
  CADDY_ARCHIVE_SHA256,
  CADDY_ARCHIVE_SHA512,
  CADDY_VERSION,
} from "./trusted-https-canary.mjs";
import {
  ciDependencyPolicyFindings,
  ciDependencyPolicyMutationFailures,
} from "./ci-dependency-policy.mjs";

const CADDY_ARCHIVE_URL = `https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_windows_amd64.zip`;
export const TRUSTED_HTTPS_CANARY_SUPPLY_CHAIN_INPUT_PATHS = Object.freeze([
  ["qualityPolicyText", "audit/quality-gate-policy-v1.json"],
  ["packageJsonText", "package.json"],
  ["packageLockText", "package-lock.json"],
  ["dependencyInstallerText", "audit/install-reviewed-ci-dependencies.ps1"],
  ["wrapperText", "audit/run-trusted-https-canary.ps1"],
  ["workflowText", ".github/workflows/trusted-https-canary.yml"],
  ["runnerText", "audit/run-trusted-https-canary.mjs"],
  ["runnerPlatformText", "audit/lib/trusted-https-canary-runner-platform.mjs"],
  ["runnerBrowserText", "audit/lib/trusted-https-canary-runner-browser.mjs"],
  ["runnerReportText", "audit/lib/trusted-https-canary-runner-report.mjs"],
  ["canaryLibraryText", "audit/lib/trusted-https-canary.mjs"],
  ["validatorText", "audit/validate-trusted-https-canary.mjs"],
  ["builderText", "tools/build-pwa-release-manifest.mjs"],
  ["releaseShellText", "release-shell-v1.json"],
  ["serviceWorkerText", "sw.js"],
].map(Object.freeze));

export function buildTrustedHttpsCanarySupplyChainInput(textForPath) {
  return Object.fromEntries(
    TRUSTED_HTTPS_CANARY_SUPPLY_CHAIN_INPUT_PATHS.map(([key, relativePath]) => [key, textForPath(relativePath)]),
  );
}

const FORBIDDEN_PUBLIC_NAMES = Object.freeze([
  "package.json",
  "package-lock.json",
  "licenses/ci-toolchain.md",
  "trusted-https-canary",
  "caddy.exe",
  "@playwright/test",
  "node_modules/playwright",
  "playwright-core",
  "fast-check",
  "pure-rand",
  "node_modules/ajv",
  "audit/lib/tutorial-manifest.mjs",
  "audit/schemas/tutorial-manifest-v1.schema.json",
  "tools/build-tutorial-manifest.mjs",
  "tools/sync-tutorial-manifest.mjs",
]);

function count(text, expression) {
  return [...String(text).matchAll(expression)].length;
}

const DEPENDENCY_INSTALLER_REQUIRED_TEXT = Object.freeze([
  "ci --ignore-scripts --omit=optional --no-audit --no-fund",
  "$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'",
  "quality-gate-policy-v1.json",
  "foreach ($dependency in $policy.supplyChain.directDependencies)",
  "$manifest.name -cne $dependency.name",
  "$manifest.version -cne $dependency.version",
  "$manifest.license -cne $dependency.licence",
]);
const WRAPPER_CADDY_PINS = Object.freeze([
  `$caddyVersion = '${CADDY_VERSION}'`,
  `$caddyUrl = '${CADDY_ARCHIVE_URL}'`,
  `$caddySha256 = '${CADDY_ARCHIVE_SHA256}'`,
  `$caddySha512 = '${CADDY_ARCHIVE_SHA512}'`,
]);
const WRAPPER_CLEANUP_CONTROLS = Object.freeze([
  "Canary evidence output must be a new file inside the exact repository checkout.",
  "cleanup-identifiers-v1.json",
  "Refusing to stop a process outside the disposable canary workspace.",
  "Fallback certificate removal did not remove the exact canary root.",
  "Fallback teardown left the canary HTTPS port listening.",
]);
const VALIDATOR_FRESHNESS_CONTROLS = Object.freeze([
  "workflowRunId: process.env.GITHUB_RUN_ID",
  "workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT",
]);
const RUNNER_PRODUCTION_CONTROLS = Object.freeze([
  "skip_install_trust",
  "strict_sni_host on",
  "bind 127.0.0.1",
  "server.listen(requestedPort, \"127.0.0.1\"",
  "activateCanaryHomeUpdate(state.candidatePage)",
  "reloadCanaryCandidateFromBeta1(state.beta1Page, \"1.0.0-beta.9\")",
  "Playwright same-tab Beta 1 to Beta 9 candidate transition",
  "[data-action=\"pwa-retry\"]",
  "[data-action=\"pwa-repair\"]",
  "v1.0.0-beta.1",
  "math-quest:v2",
  "math-quest:progress:v2",
  "responseHeaderSetSha256",
  "offlineCacheProof",
  "candidateMainFrameNavigations",
  "freshProtectedProjection",
  "RETIRED_BETA1_PRESERVED_FRESH_START",
  "RETAINED_BETA1_COMPLETE_VALUE",
  "observeCanaryRetainedFreshStartNotice(state.candidatePage)",
  "RETAINED_BETA1_FRESH_START_NOTICE_SHA256",
  "state.candidatePage.waitForFunction(canaryWaitingCacheReady",
  "remainingMatchingCertificateCount",
  "profileBoundEdgeProcesses(profilePath)",
  "Get-CimInstance Win32_Process -Filter \\\"Name = 'msedge.exe'\\\" -ErrorAction Stop",
  "canaryWorkspaceRemovalAllowed(state.remainingProfileProcessCount)",
  "remainingProfileProcessSetSha256 = EMPTY_PROFILE_PROCESS_SET_SHA256",
  "await state.beta1Page.reload",
]);
const CANARY_LIBRARY_PRODUCTION_CONTROLS = Object.freeze([
  "waitForCanaryHomeUpdate",
  "[data-action=\"pwa-check\"]",
  "[data-action=\"home\"]",
  "activateCanaryHomeUpdate",
  "[data-action=\"pwa-apply\"]",
  "Canary update activation must begin directly on Home",
  "openCanaryInstallHelp",
  "reloadCanaryCandidateFromBeta1",
  "page.reload({ waitUntil: \"domcontentloaded\"",
  "observeCanaryRetainedFreshStartNotice",
  ".runtime-warning[role=\"alert\"]",
  "Canary fresh-start notice did not match the exact approved grown-up message",
  "canaryWaitingCacheReady",
  "__mathQuestCanaryWaitingCacheStableSince",
  "Canary candidate transition requires the existing Beta 1 page",
  "[data-action=\"grown\"]",
  "[data-action=\"install-help\"]",
]);

function missingRequiredTextFindings(text, requiredText, label) {
  return requiredText
    .filter((required) => !text.includes(required))
    .map((required) => `${label}: ${required}`);
}

function dependencyInstallerFindings(text) {
  const findings = [];
  if (count(text, /\bnpm(?:\.cmd)?\s+ci\b/gu) !== 1
      || DEPENDENCY_INSTALLER_REQUIRED_TEXT.some((required) => !text.includes(required))) {
    findings.push("audit/install-reviewed-ci-dependencies.ps1: install must retain the exact lockfile, script, optional-dependency, browser-download, and installed-version controls");
  }
  if (/(?:\bnpx\b|\bnpm(?:\.cmd)?\s+install\b|\bchoco\s+install\b|\bwinget\s+install\b|\bpip\d*\s+install\b|\bgit\s+clone\b|\bcurl\b|\bwget\b|Invoke-WebRequest)/iu.test(text)) {
    findings.push("audit/install-reviewed-ci-dependencies.ps1: an unreviewed installer or downloader was introduced");
  }
  return findings;
}

function wrapperFindings(text) {
  const findings = [];
  if (WRAPPER_CADDY_PINS.some((required) => !text.includes(required))) {
    findings.push("audit/run-trusted-https-canary.ps1: Caddy version, archive URL, and both checksums must remain exact");
  }
  if (count(text, /Invoke-WebRequest\b/gu) !== 1
      || !text.includes("Invoke-WebRequest -UseBasicParsing -Uri $caddyUrl -OutFile $zipPath")) {
    findings.push("audit/run-trusted-https-canary.ps1: exactly one reviewed Caddy download is allowed");
  }
  if (count(text, /\bnpm\s+(?:ci|install)\b/gu) !== 2
      || count(text, /npm ci --ignore-scripts --omit=optional --no-audit --no-fund/gu) !== 1
      || !text.includes("$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'")) {
    findings.push("audit/run-trusted-https-canary.ps1: npm ci must retain every reviewed hardening flag and suppress browser downloads");
  }
  if (/(?:\bnpx\b|\bchoco\s+install\b|\bwinget\s+install\b|\bpip\d*\s+install\b|\bgit\s+clone\b|\bcurl\b|\bwget\b)/iu.test(text)) {
    findings.push("audit/run-trusted-https-canary.ps1: an unreviewed installer or downloader was introduced");
  }
  findings.push(...missingRequiredTextFindings(
    text,
    WRAPPER_CLEANUP_CONTROLS,
    "audit/run-trusted-https-canary.ps1: missing crash-safe cleanup control",
  ));
  return findings;
}

function workflowFindings(text) {
  const findings = [];
  if (!/^on:\n  workflow_dispatch:\n/mu.test(text)
      || /\n\s{2}(?:push|pull_request|schedule):/u.test(text)
      || !text.includes("runs-on: windows-latest")) {
    findings.push(".github/workflows/trusted-https-canary.yml: canary must remain manual and GitHub-hosted Windows only");
  }
  if (!text.includes(".\\audit\\run-trusted-https-canary.ps1")
      || /(?:audit\.bat|run-audit\.(?:mjs|ps1))/iu.test(text)) {
    findings.push(".github/workflows/trusted-https-canary.yml: workflow must invoke only the narrow canary, never the full gauntlet");
  }
  if (!text.includes("path: audit-artifacts/trusted-https-canary-v1.json")
      || /(?:screenshot|trace|\.har\b|video)/iu.test(text)) {
    findings.push(".github/workflows/trusted-https-canary.yml: artifact upload must remain sanitized canonical JSON only");
  }
  return findings;
}

function runnerBoundaryFindings(text) {
  const findings = [];
  if (/(?:--ignore-certificate-errors|--allow-insecure-localhost|--unsafely-treat-insecure-origin-as-secure|--no-sandbox)/u.test(text)) {
    findings.push("audit/run-trusted-https-canary.mjs: insecure browser flags are forbidden");
  }
  if (/legacy-recovery=beta1|\.navigate\s*\(/u.test(text)) {
    findings.push("audit/run-trusted-https-canary.mjs: retained clients must update only through explicit reload, never a recovery query or forced navigation");
  }
  return findings;
}

function publicShellFindings(input) {
  const publicSources = [input.builderText, input.releaseShellText, input.serviceWorkerText].map(String).join("\n");
  return FORBIDDEN_PUBLIC_NAMES
    .filter((name) => publicSources.toLowerCase().includes(name.toLowerCase()))
    .map((name) => `child-facing release shell must exclude CI-only material: ${name}`);
}

export function trustedHttpsCanarySupplyChainFindings(input) {
  return [
    ...ciDependencyPolicyFindings(input),
    ...dependencyInstallerFindings(String(input.dependencyInstallerText)),
    ...wrapperFindings(String(input.wrapperText)),
    ...missingRequiredTextFindings(
      String(input.validatorText),
      VALIDATOR_FRESHNESS_CONTROLS,
      "audit/validate-trusted-https-canary.mjs: missing live workflow freshness binding",
    ),
    ...workflowFindings(String(input.workflowText)),
    ...runnerProductionFindings(input),
    ...publicShellFindings(input),
  ];
}

export function trustedHttpsCanarySupplyChainMutationFailures(input) {
  const failures = ciDependencyPolicyMutationFailures(input);
  const run = (label, field, change, expected) => {
    const mutant = { ...input, [field]: change(String(input[field])) };
    if (!trustedHttpsCanarySupplyChainFindings(mutant).some((finding) => expected.test(finding))) {
      failures.push(`trusted-HTTPS supply-chain mutation self-test did not reject ${label}`);
    }
  };
  run("relaxed focused dependency install", "dependencyInstallerText", (text) => text.replace("ci --ignore-scripts --omit=optional --no-audit --no-fund", "ci"), /install must retain/u);
  run("relaxed npm install flags", "wrapperText", (text) => text.replace("npm ci --ignore-scripts --omit=optional --no-audit --no-fund", "npm ci"), /retain every reviewed hardening flag/u);
  run("a changed Caddy URL", "wrapperText", (text) => text.replace(CADDY_ARCHIVE_URL, "https://example.invalid/caddy.zip"), /Caddy version, archive URL/u);
  run("a changed Caddy checksum", "wrapperText", (text) => text.replace(CADDY_ARCHIVE_SHA256, "0".repeat(64)), /Caddy version, archive URL/u);
  run("removed certificate absence proof", "wrapperText", (text) => text.replace("Fallback certificate removal did not remove the exact canary root.", "Certificate cleanup assumed."), /missing crash-safe cleanup control/u);
  run("removed workflow-run freshness binding", "validatorText", (text) => text.replace("workflowRunId: process.env.GITHUB_RUN_ID", "workflowRunId: undefined"), /missing live workflow freshness binding/u);
  canaryRuntimeBoundaryMutationControls(run);
  return failures;
}

export function trustedHttpsCanaryRunnerText(input) {
  return [input.runnerText, input.runnerPlatformText, input.runnerBrowserText, input.runnerReportText].map(String).join("\n");
}

function runnerModuleFindings(input) {
  return [
    ...missingRequiredTextFindings(String(input.runnerText), [
      'from "./lib/trusted-https-canary-runner-platform.mjs"',
      'from "./lib/trusted-https-canary-runner-report.mjs"',
      'from "./lib/trusted-https-canary-runner-browser.mjs"',
      "assert.equal(fresh.marker, RETAINED_BETA1_COMPLETE_VALUE)",
    ], "canary runner: missing required production-path canary control"),
    ...missingRequiredTextFindings(String(input.runnerPlatformText), [
      "async function startBackend(",
      "async function inspectTrustedTls(",
    ], "canary platform: missing required production-path canary control"),
    ...missingRequiredTextFindings(String(input.runnerBrowserText), [
      "async function boundedBrowserOperation(",
      "async function closePersistentContext(",
      "async function inspectExactCandidateCache(",
    ], "canary browser: missing required production-path canary control"),
    ...missingRequiredTextFindings(String(input.runnerReportText), [
      "async function finishCanaryRun(",
      "function buildCanaryRunEvidence(",
      "canonicalCanaryEvidence(evidence)",
    ], "canary report: missing required production-path canary control"),
  ];
}

function runnerProductionFindings(input) {
  const runner = trustedHttpsCanaryRunnerText(input);
  return [
    ...missingRequiredTextFindings(
      runner,
      RUNNER_PRODUCTION_CONTROLS,
      "audit/run-trusted-https-canary.mjs: missing required production-path canary control",
    ),
    ...missingRequiredTextFindings(
      String(input.canaryLibraryText),
      CANARY_LIBRARY_PRODUCTION_CONTROLS,
      "audit/lib/trusted-https-canary.mjs: missing required production-path canary control",
    ),
    ...runnerModuleFindings(input),
    ...runnerBoundaryFindings(runner),
  ];
}

function canaryRuntimeBoundaryMutationControls(run) {
  run("removed lingering-profile deletion interlock", "runnerText", (text) => text.replaceAll("canaryWorkspaceRemovalAllowed(state.remainingProfileProcessCount)", "true"), /missing required production-path canary control/u);
  run("removed direct Home update activation", "runnerText", (text) => text.replace("activateCanaryHomeUpdate(state.candidatePage)", "openCanaryInstallHelp(candidatePage)"), /missing required production-path canary control/u);
  run("replaced same-tab candidate transition", "runnerText", (text) => text.replace("reloadCanaryCandidateFromBeta1(state.beta1Page, \"1.0.0-beta.9\")", "context.newPage()"), /missing required production-path canary control/u);
  run("reintroduced retired-curriculum migration", "runnerText", (text) => text.replace("RETIRED_BETA1_PRESERVED_FRESH_START", "SCHEMA3_MIGRATION_PRESERVED"), /missing required production-path canary control/u);
  run("removed retained-source terminal proof", "runnerText", (text) => text.replaceAll("RETAINED_BETA1_COMPLETE_VALUE", "null"), /missing required production-path canary control/u);
  run("removed retained fresh-start notice observation", "runnerText", (text) => text.replace("observeCanaryRetainedFreshStartNotice(state.candidatePage)", "Promise.resolve(null)"), /missing required production-path canary control/u);
  run("removed exact waiting-cache predicate", "runnerText", (text) => text.replace("state.candidatePage.waitForFunction(canaryWaitingCacheReady", "candidatePage.waitForFunction(async () => true"), /missing required production-path canary control/u);
  run("weakened retained fresh-start notice selector", "canaryLibraryText", (text) => text.replace('.runtime-warning[role="alert"]', '.runtime-warning'), /missing required production-path canary control/u);
  run("removed Home update journey control", "canaryLibraryText", (text) => text.replaceAll('[data-action="pwa-check"]', '[data-action="obsolete-update"]'), /missing required production-path canary control/u);
  run("removed migrated-screen Home boundary", "canaryLibraryText", (text) => text.replaceAll('[data-action="home"]', '[data-action="obsolete-home"]'), /missing required production-path canary control/u);
  run("reintroduced forced legacy navigation", "runnerText", (text) => `${text}\nclient.navigate("./?legacy-recovery=beta1");`, /explicit reload, never a recovery query/u);
  for (const field of ["runnerPlatformText", "runnerBrowserText", "runnerReportText"]) {
    run("removed governed canary module", field, () => "", /missing required production-path canary control/u);
    run("insecure imported canary module", field, (text) => text + "\n--ignore-certificate-errors", /insecure browser flags/u);
  }
}
