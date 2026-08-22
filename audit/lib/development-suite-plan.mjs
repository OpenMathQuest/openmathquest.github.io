import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEVELOPMENT_SUITE_IDS = Object.freeze([
  "governance",
  "metadata",
  "launcher",
  "product",
  "pwa",
  "canary",
  "engine",
  "tutorial",
  "driftless",
  "playwright",
  "guard",
]);

const normalize = (value) => String(value || "")
  .replace(/\\/gu, "/")
  .replace(/^\.\//u, "")
  .trim();

const matches = (file, expressions) => expressions.some((expression) => expression.test(file));

const ROUTES = Object.freeze({
  launcher: [/^(?:VERSION|Serve-MathQuest\.ps1|Math Quest\.bat|audit\.bat)$/u, /^audit\/(?:test-launcher-identity\.ps1)$/u],
  product: [/^(?:VERSION|index\.html)$/u, /^audit\.html$/u, /^audit\/approved-visual-regression\.js$/u, /^assets\//u, /^audit\/tests\/(?:adapter-syntax|page-adapter-effects|placement-adapter-effects|qa-tour|holistic-child-ux-regressions|holistic-functional-regressions)\.test\.mjs$/u],
  pwa: [/^(?:VERSION|index\.html|sw\.js|manifest\.webmanifest|release-shell-v1\.json)$/u, /^curriculum\/math-quest-tutorial-manifest-v1\.json$/u, /^assets\//u, /^tools\/build-pwa-release-manifest\.mjs$/u, /^audit\/(?:lib\/browser-smoke|run-browser-smoke)\.mjs$/u, /^audit\/tests\/pwa-release\.test\.mjs$/u, /^\.github\/workflows\/(?:pages|audit)\.yml$/u],
  canary: [/^VERSION$/u, /^audit\/(?:run-trusted-https-canary\.(?:mjs|ps1)|validate-trusted-https-canary\.mjs)$/u, /^audit\/lib\/trusted-https-canary(?:-supply-chain)?\.mjs$/u, /^audit\/tests\/trusted-https-canary\.test\.mjs$/u, /^\.github\/workflows\/trusted-https-canary\.yml$/u, /^(?:package|package-lock)\.json$/u, /^licenses\/ci-toolchain\.md$/u],
  engine: [/^(?:VERSION|index\.html)$/u, /^curriculum\//u, /^audit\/(?:extract-child-strings|mutation-runner|exhaustive-generator-audit|run-coverage)\.mjs$/u, /^audit\/fixtures\//u, /^audit\/lib\/(?:child-strings|engine-loader|curriculum-manifest|native-coverage|test-harness)\.mjs$/u, /^audit\/tests\/(?:engine-suite|manifest-semantic-suite|node-engine|strategy-build-oracle)(?:\.test)?\.mjs$/u, /^tools\/sync-curriculum-manifest\.mjs$/u, /^research\/(?:build-axioms|pedagogy-notes)\.md$/u],
  tutorial: [/^index\.html$/u, /^curriculum\/(?:math-quest-manifest-v1|math-quest-tutorial-manifest-v1)\.json$/u, /^audit\/schemas\/tutorial-manifest-v1\.schema\.json$/u, /^audit\/lib\/tutorial-manifest\.mjs$/u, /^audit\/tests\/tutorial-manifest\.test\.mjs$/u, /^tools\/(?:build|sync)-tutorial-manifest\.mjs$/u, /^tools\/sync-curriculum-manifest\.mjs$/u],
  driftless: [/^(?:AGENTS\.md|VERSION|index\.html)$/u, /^audit\/(?:gate-integrity-policy-v1|release-evidence-bundle-v1|repository-code-map-v1|trusted-https-canary-beta7-v1)\.json$/u, /^audit\/(?:compare-audit-execution-modes|run-audit(?:-lane)?|verify-github-gate-enforcement)\.(?:mjs|ps1)$/u, /^curriculum\/(?:math-quest-manifest-v1|math-quest-tutorial-manifest-v1|math-quest-feature-map-v1)\.json$/u, /^audit\/schemas\/(?:blast-radius-result-v2|gate-integrity-policy-v1|release-evidence-bundle-v1|repository-code-map-v1|tutorial-manifest-v1|feature-map-v1)\.schema\.json$/u, /^audit\/lib\/(?:bounded-audit-lanes|gate-integrity-policy|release-evidence-bundle|repository-code-map|tutorial-manifest|feature-map|development-suite-plan)\.mjs$/u, /^audit\/tests\/(?:gate-integrity-policy|release-evidence-bundle|repository-code-map|tutorial-manifest|feature-map|blast-radius-lookup|development-suite-plan|audit-lane-orchestration|audit-orchestration)\.test\.mjs$/u, /^tools\/(?:blast-radius-lookup|sync-repository-code-map|build-tutorial-manifest|sync-tutorial-manifest)\.mjs$/u],
  playwright: [/^(?:VERSION|index\.html|Serve-MathQuest\.ps1|playwright(?:\.(?:deep-ux|interaction-fuzz))?\.config\.mjs|package\.json|package-lock\.json)$/u, /^assets\//u, /^audit\/playwright\//u, /^audit\/run-playwright-(?:focused|deep-ux-census|interaction-fuzz)\.mjs$/u, /^audit\/lib\/playwright-(?:focused-contract|deep-ux-census|interaction-fuzz)\.mjs$/u, /^audit\/tests\/playwright-(?:focused-contract|deep-ux-census|interaction-fuzz)\.test\.mjs$/u],
  governance: [/^(?:AGENTS|CHANGELOG|CONTRIBUTING|OPEN_SOURCE_POLICY|PRIVACY|PUBLICATION_CLEARANCE|README|SECURITY|THIRD_PARTY_NOTICES)\.md$/u, /^(?:LICENSE|VERSION)$/u, /^audit\/(?:agent-collaboration-policy-v1|certification-cadence-v1|finished-work-policy-v1|browser-runner-evidence-v1|gate-integrity-policy-v1|release-evidence-bundle-v1|trusted-https-canary-beta7-v1)\.json$/u, /^audit\/schemas\/(?:gate-integrity-policy-v1|release-evidence-bundle-v1)\.schema\.json$/u, /^audit\/tests\/(?:agent-collaboration-policy|audit-lane-orchestration|audit-orchestration|certification-cadence|development-suite-plan|finished-work-policy|gate-integrity-policy|publication-clearance|release-evidence-bundle)\.test\.mjs$/u, /^audit\/lib\/(?:bounded-audit-lanes|browser-runner-evidence|development-suite-plan|gate-integrity-policy|publication-clearance|release-evidence-bundle|release-evidence-successor|rights-state|hosted-windows-observation)\.mjs$/u, /^audit\/(?:compare-audit-execution-modes|public-candidate-guard|run-audit-lane|validate-publication-clearance|validate-hosted-windows-observation|verify-github-gate-enforcement)\.mjs$/u, /^audit\/(?:observe-hosted-windows|run-audit|on-change-audit)\.ps1$/u, /^audit\/run-audit\.mjs$/u, /^\.github\/workflows\//u, /^docs\//u, /^research\//u, /^licenses\//u, /^VERSION$/u],
});

const EXPLICIT_NO_IMPACT = [/^\.git(?:attributes|ignore)$/u];

export function planDevelopmentSuites(changedPaths = []) {
  const paths = [...new Set(changedPaths.map(normalize).filter(Boolean))].sort();
  const broad = paths.length === 0;
  const routeExpressions = Object.values(ROUTES).flat();
  const unknown = broad ? [] : paths.filter((file) => !matches(file, [...routeExpressions, ...EXPLICIT_NO_IMPACT]));
  const selected = new Set(["governance", "metadata", "guard"]);
  if (broad || unknown.length) {
    for (const id of DEVELOPMENT_SUITE_IDS) selected.add(id);
  } else {
    for (const [id, expressions] of Object.entries(ROUTES)) {
      if (paths.some((file) => matches(file, expressions))) selected.add(id);
    }
  }
  return {
    schemaVersion: 1,
    mode: broad ? "BROAD_NO_PATHS" : unknown.length ? "BROAD_UNKNOWN_PATH" : "FOCUSED_CHANGED_PATHS",
    changedPaths: paths,
    unknownPaths: unknown,
    suites: DEVELOPMENT_SUITE_IDS.filter((id) => selected.has(id)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2).map((item) => item.startsWith("--path=") ? item.slice(7) : item);
  process.stdout.write(`${JSON.stringify(planDevelopmentSuites(paths))}\n`);
}
