# Repository structure

Math Quest keeps public runtime files, maintenance tools, evidence, and legal
records in distinct locations.

| Path | Purpose |
|---|---|
| `/` | Persistent agent governance, runtime entry points, Windows launchers, install manifest, service worker, exact release-shell manifest, standard project files, and a private CI-only Node dependency manifest/lockfile excluded from the child payload |
| `.github/` | Issue, pull-request, dependency, audit, and deployment automation |
| `assets/` | Bundled app icons, fonts, sounds, their first-party generation source, and canonical machine-readable Conservatory design tokens; design-token targets do not affect runtime until a separately validated projection is activated |
| `audit/` | Machine-readable collaboration, certification-cadence, finished-work, Conservatory art-decision, and governed-art-asset records; their closed schemas and fail-closed validators; executable focused-development and complete-release checks; direct-user Playwright journeys; the alternating-beta Deep UX Census planner, runner, evidence validator, and anomaly-only renderer; the reviewed browser/runner tuple and exact direct-evidence-successor validator; and the disposable trusted-HTTPS canary runner, validator, and regressions |
| `curriculum/` | Canonical versioned curriculum, feature, and fail-closed tutorial-linkage manifests, including hash-bound references to the art-design authority, plus provenance |
| `docs/development/` | Stable development contract |
| `docs/release/` | Release gates, checklists, reviews, and public-tree inventory |
| `docs/testing/` | Human-readable test coverage and effect maps |
| `licenses/` | Reviewed first-party/evidence declarations, component register, and licence texts |
| `research/` | Public-safe design rationale and clean-room research records |
| `tools/` | Active maintenance, normalization, and exact PWA-shell generation utilities |

Generated reports, screenshots, temporary coverage data, gameplay backups,
private research, archives, editor state, and dependency caches are ignored
and must not be committed. Scratch or one-time migration scripts should be
removed once their reviewed output is canonical.

The root `package.json` and `package-lock.json` install the exact Playwright
1.62.1 and Ajv 8.20.0 development toolchain. Ajv validates the tutorial JSON
Schema during development and is not loaded by the game. Playwright Test drives a small, direct-user
browser-journey suite in installed Microsoft Edge; Playwright Core also drives
the private GitHub-hosted trusted-HTTPS canary. The reviewed installer disables
lifecycle scripts, optional dependencies, audit submission, funding requests,
and Playwright browser downloads. Caddy is downloaded only by the canary's
reviewed wrapper with both reviewed hashes enforced. None of these tools,
dependency metadata, browser artifacts, traces, or `licenses/ci-toolchain.md`
is included in `release-shell-v1.json`, the service-worker cache, or the Pages
runtime payload.

The canonical Conservatory governance chain is
`art-design-decision-register → feature/tutorial manifests → art-asset register → design tokens → blast radius → gates`.
The external art-design Bible is source suggestion material only and is not a
runtime or repository authority. All human- or AI-created game art follows the
tiered 53-step construction workflow in the decision register. Mathematical
facts remain owned by deterministic code and independently checked oracles;
theme art may add atmosphere but may not change, obscure, or answer a task.

`playwright.deep-ux.config.mjs` is a separate release diagnostic rather than
an expansion of the 24-result focused journey lane. Its complete mode is
cadence-gated to Beta 4, 6, 8, and later even-numbered betas and runs only on
the exact frozen GitHub-hosted Windows candidate. Its local 100-cell mode is a
non-certifying benchmark. Passing cells produce no screenshots or traces;
synthetic WebP, ARIA, and geometry evidence is created only for anomalies.

Under the
[`AGENTS.md` finished-work policy](../AGENTS.md#what-counts-as-finished-work),
[`AGENTS.md` bounded collaboration policy](../AGENTS.md#agent-collaboration-and-bounded-review),
acceptance criteria, blockers, corrected conclusions, and owner-approved scope
reductions belong in the existing owning issue, plan, governing record, or
active working plan. Do not create ad hoc status or completion files; add a
repository document only when the product, development, or certification
contract actually requires that durable artifact.

Every staged path must appear in `docs/release/public-file-manifest.txt` and be
classified by `licenses/component-register-v1.json`. Run
`tools/sync-public-inventory.mjs` after intentionally changing the staged file
set. New original files must first be reviewed and added manually to
`licenses/first-party-paths-v1.txt`; the synchronizer refuses to certify
authorship. Evidence must be explicitly registered and hash-pinned in
`licenses/evidence-paths-v1.json`; component records cannot invent evidence
paths. Then inspect and stage both declarations and both generated inventory
files before running the release audit.

`release-shell-v1.json` is generated by
`tools/build-pwa-release-manifest.mjs`. While runtime bytes are changing, use
`--prepare-directory <empty-directory>` for a non-mutating review copy. After
all listed bytes are final but before the immutable candidate commit is frozen,
use `--write`, then run the same tool with `--check`; the write operation also
updates the non-circular manifest hash binding in `sw.js`. Freeze the resulting
commit and payload before starting the single complete pre-publication gate.

<!-- REPOSITORY-CODE-MAP-START -->
## Generated repository ownership map

This non-authoritative section is generated from `audit/repository-code-map-v1.json`. Edit the canonical JSON, not this projection; no fact in this Markdown may override the closed machine record.

| Fact family | Sole owner | Declared projections | Validators |
|---|---|---|---|
| `architecture.gates` | `audit/architecture-policy-v1.json` | `audit/lib/architecture-policy.mjs`<br>`audit/run-architecture-gate.mjs` | `audit/tests/architecture-policy.test.mjs` |
| `art-design.asset-acceptance` | `audit/art-asset-register-v1.json` | — | `audit/tests/art-design-governance.test.mjs` |
| `art-design.migration-baseline` | `audit/art-migration-baseline-v1.json` | — | `audit/tests/art-migration-baseline.test.mjs`<br>`audit/validate-art-migration-baseline.mjs` |
| `art-design.migration-browser-evidence` | `audit/art-migration-browser-evidence-v1.json` | — | `audit/tests/art-migration-baseline.test.mjs`<br>`audit/validate-art-migration-baseline.mjs` |
| `art-design.runtime-tokens` | `assets/design/math-quest-design-tokens-v1.json` | `assets/design/math-quest-design-tokens-v1.css`<br>`audit.html`<br>`index.html`<br>`release-shell-v1.json` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/art-design-governance.test.mjs`<br>`audit/tests/design-token-projection.test.mjs` |
| `art-design.source-decisions` | `audit/art-design-decision-register-v1.json` | `AGENTS.md`<br>`assets/design/math-quest-design-tokens-v1.json`<br>`audit/art-asset-register-v1.json`<br>`audit/lib/tutorial-metadata-transition.mjs`<br>`audit/quality-gate-policy-v1.json`<br>`curriculum/math-quest-feature-map-v1.json`<br>`curriculum/math-quest-tutorial-manifest-v1.json`<br>`index.html` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/art-design-governance.test.mjs`<br>`audit/tests/art-question-shell.test.mjs` |
| `browser.reviewed-identity` | `audit/browser-runner-evidence-v1.json` | `PUBLICATION_CLEARANCE.md` | `audit/tests/publication-clearance.test.mjs` |
| `certification.audit-evidence-comparison` | `audit/lib/audit-evidence-comparison.mjs` | `audit/lib/bounded-audit-lanes.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/audit-lane-orchestration.test.mjs` |
| `certification.audit-lane-contract` | `audit/lib/audit-lane-contract.mjs` | `audit/lib/audit-evidence-comparison.mjs`<br>`audit/lib/audit-process-supervisor.mjs`<br>`audit/lib/bounded-audit-lanes.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/audit-lane-orchestration.test.mjs` |
| `certification.audit-markdown-report` | `audit/lib/audit-markdown-report.mjs` | `audit/run-audit.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/audit-orchestration.test.mjs`<br>`audit/tests/publication-clearance.test.mjs` |
| `certification.audit-process-supervisor` | `audit/lib/audit-process-supervisor.mjs` | `audit/lib/bounded-audit-lanes.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/audit-lane-orchestration.test.mjs`<br>`audit/tests/audit-orchestration.test.mjs` |
| `certification.audit-publication-report` | `audit/lib/audit-publication-report.mjs` | `audit/run-audit.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `certification.cadence` | `audit/certification-cadence-v1.json` | `AGENTS.md` | `audit/tests/certification-cadence.test.mjs` |
| `certification.gates` | `audit/run-audit.mjs` | `audit/lib/audit-markdown-report.mjs` | `audit/tests/audit-lane-orchestration.test.mjs`<br>`audit/tests/audit-orchestration.test.mjs` |
| `curriculum.contract` | `curriculum/math-quest-manifest-v1.json` | `index.html` | `audit/tests/manifest-semantic-suite.mjs`<br>`audit/tests/node-engine.test.mjs` |
| `feature.user-operable-mechanics` | `curriculum/math-quest-feature-map-v1.json` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/feature-map.test.mjs`<br>`audit/tests/holistic-child-ux-regressions.test.mjs` |
| `policy.agent-collaboration` | `AGENTS.md` | `audit/agent-collaboration-policy-v1.json` | `audit/tests/agent-collaboration-policy.test.mjs` |
| `policy.ai-first-drift-control` | `AGENTS.md` | `audit/repository-code-map-v1.json` | `audit/tests/repository-code-map.test.mjs` |
| `policy.finished-work` | `AGENTS.md` | `audit/finished-work-policy-v1.json` | `audit/tests/finished-work-policy.test.mjs` |
| `policy.gate-integrity` | `audit/gate-integrity-policy-v1.json` | `.github/workflows/audit.yml`<br>`AGENTS.md`<br>`audit/lib/audit-evidence-comparison.mjs`<br>`audit/lib/audit-lane-contract.mjs`<br>`audit/run-ai-change-loop.mjs`<br>`audit/run-audit.mjs`<br>`audit/verify-github-gate-enforcement.mjs` | `audit/tests/ai-change-loop.test.mjs`<br>`audit/tests/audit-lane-orchestration.test.mjs`<br>`audit/tests/gate-integrity-policy.test.mjs` |
| `product.version` | `VERSION` | `.github/workflows/pages.yml`<br>`.github/workflows/trusted-https-canary.yml`<br>`AGENTS.md`<br>`audit.html`<br>`audit/certification-cadence-v1.json`<br>`audit/lib/playwright-focused-contract.mjs`<br>`audit/lib/publication-clearance-contract.mjs`<br>`audit/lib/trusted-https-canary-contract.mjs`<br>`audit/lib/trusted-https-canary-evidence.mjs`<br>`audit/lib/trusted-https-canary-runner-platform.mjs`<br>`audit/lib/trusted-https-canary-supply-chain.mjs`<br>`audit/playwright/fixtures.mjs`<br>`audit/release-evidence-bundle-v1.json`<br>`audit/run-audit.ps1`<br>`audit/run-trusted-https-canary.mjs`<br>`audit/test-launcher-identity.ps1`<br>`audit/tests/browser-readiness-contract.test.mjs`<br>`audit/tests/canary-evidence-fixture.mjs`<br>`audit/tests/certification-cadence.test.mjs`<br>`audit/tests/page-adapter-effects.test.mjs`<br>`audit/tests/playwright-deep-ux-census.test.mjs`<br>`audit/tests/publication-clearance.test.mjs`<br>`audit/tests/pwa-release.test.mjs`<br>`audit/tests/pwa-status.test.mjs`<br>`audit/tests/qa-tour.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs`<br>`audit/tests/release-version-comparison.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs`<br>`audit/trusted-https-canary-v1.json`<br>`CHANGELOG.md`<br>`docs/development/pwa-adapter-contract.md`<br>`docs/release/checklist.md`<br>`docs/release/privacy-review.md`<br>`docs/release/publication-gates.md`<br>`docs/release/readiness.md`<br>`docs/testing/test-to-branch-effect-map.md`<br>`index.html`<br>`PUBLICATION_CLEARANCE.md`<br>`README.md`<br>`release-shell-v1.json`<br>`research/build-axioms.md`<br>`Serve-MathQuest.ps1`<br>`sw.js`<br>`tools/build-pwa-release-manifest.mjs` | `audit/tests/engine-suite.mjs`<br>`audit/tests/pwa-release.test.mjs`<br>`audit/tests/release-version-comparison.test.mjs` |
| `quality.function-baseline` | `audit/function-quality-baseline-v1.json` | `audit/capture-function-quality-baseline.mjs`<br>`audit/lib/function-quality-metrics.mjs` | `audit/tests/function-quality-metrics.test.mjs` |
| `quality.function-baseline-correction` | `audit/inline-function-quality-baseline-correction-v1.json` | `audit/capture-inline-function-quality-correction.mjs`<br>`audit/function-quality-baseline-v1.json`<br>`audit/lib/function-quality-metrics.mjs`<br>`audit/lib/inline-function-quality-baseline.mjs`<br>`audit/quality-gate-policy-v1.json`<br>`audit/run-compiler-contracts.mjs`<br>`audit/run-function-quality-gate.mjs` | `audit/tests/function-quality-gate.test.mjs`<br>`audit/tests/function-quality-metrics.test.mjs`<br>`audit/tests/inline-function-quality-baseline.test.mjs` |
| `quality.gates` | `audit/quality-gate-policy-v1.json` | `.markdownlint-cli2.jsonc`<br>`audit/ai-change-loop-operations.mjs`<br>`audit/lib/axe-accessibility.mjs`<br>`audit/lib/ci-dependency-policy.mjs`<br>`audit/lib/differential-equivalence.mjs`<br>`audit/lib/powershell-function-quality.mjs`<br>`audit/lib/public-candidate-refactor-policies.mjs`<br>`audit/lib/quality-budget-measurements.mjs`<br>`audit/lib/quality-gate-policy.mjs`<br>`audit/lib/tutorial-metadata-transition.mjs`<br>`audit/run-ai-change-loop.mjs`<br>`audit/run-bundlewatch-budgets.mjs`<br>`audit/run-compiler-contracts.mjs`<br>`audit/run-differential-equivalence.mjs`<br>`audit/run-function-quality-gate.mjs`<br>`audit/run-performance-budgets.mjs`<br>`audit/run-property-fuzz-stage.mjs`<br>`audit/run-quality-gates.mjs`<br>`eslint.config.mjs`<br>`knip.json`<br>`package-lock.json`<br>`package.json`<br>`stylelint.config.mjs` | `audit/tests/ai-change-loop.test.mjs`<br>`audit/tests/axe-accessibility.test.mjs`<br>`audit/tests/bundlewatch-budgets.test.mjs`<br>`audit/tests/compiler-contracts.test.mjs`<br>`audit/tests/differential-equivalence.test.mjs`<br>`audit/tests/function-quality-gate.test.mjs`<br>`audit/tests/property-fuzz-stage.test.mjs`<br>`audit/tests/public-candidate-refactor-policies.test.mjs`<br>`audit/tests/quality-gate-policy.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs`<br>`audit/tests/tutorial-metadata-transition.test.mjs` |
| `quality.refactor-baseline` | `audit/refactor-baseline-v2.json` | `audit/capture-refactor-baseline.mjs`<br>`audit/function-quality-baseline-v1.json`<br>`audit/lib/powershell-function-quality.mjs`<br>`audit/lib/refactor-baseline.mjs`<br>`audit/measure-powershell-function-quality.ps1` | `audit/tests/refactor-baseline.test.mjs` |
| `release.clearance-contract` | `audit/lib/publication-clearance-contract.mjs` | `audit/lib/publication-clearance-record.mjs`<br>`audit/lib/publication-clearance.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `release.clearance-record` | `audit/lib/publication-clearance-record.mjs` | `audit/lib/publication-clearance.mjs`<br>`audit/lib/release-evidence-successor.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `release.evidence-bindings` | `audit/release-evidence-bundle-v1.json` | `audit/lib/audit-publication-report.mjs`<br>`audit/run-audit.mjs`<br>`audit/trusted-https-canary-beta7-v1.json`<br>`audit/trusted-https-canary-v1.json`<br>`PUBLICATION_CLEARANCE.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `release.pages-validation-dependencies` | `audit/lib/ci-dependency-policy.mjs` | `.github/workflows/pages.yml` | `audit/tests/public-candidate-refactor-policies.test.mjs` |
| `release.public-payload` | `audit/lib/public-payload.mjs` | `audit/lib/release-evidence-successor.mjs`<br>`audit/public-candidate-guard.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/public-candidate-guard.mjs`<br>`audit/tests/publication-clearance.test.mjs` |
| `release.public-shell` | `release-shell-v1.json` | `sw.js` | `audit/tests/pwa-release.test.mjs` |
| `release.successor-policy` | `audit/lib/release-evidence-policy.mjs` | `audit/lib/publication-clearance-contract.mjs`<br>`audit/lib/release-evidence-bundle.mjs`<br>`audit/lib/release-evidence-successor.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `repository.change-impact` | `tools/blast-radius-lookup.mjs` | — | `audit/tests/blast-radius-lookup.test.mjs` |
| `repository.structure` | `audit/repository-code-map-v1.json` | `docs/repository-structure.md` | `audit/tests/repository-code-map.test.mjs` |
| `rights.components` | `licenses/component-register-v1.json` | `audit/lib/public-candidate-refactor-policies.mjs`<br>`audit/lib/public-toolchain-records.mjs`<br>`licenses/first-party-paths-v1.txt` | `audit/public-candidate-guard.mjs`<br>`audit/tests/public-candidate-refactor-policies.test.mjs` |
| `rights.evidence-paths` | `licenses/evidence-paths-v1.json` | — | `audit/public-candidate-guard.mjs` |
| `runtime.engine-invariants` | `index.html` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/placement-engine-reuse.test.mjs` |
| `runtime.progress-source-policy` | `assets/js/math-quest-progress-source.js` | `.github/workflows/pages.yml`<br>`audit.html`<br>`audit/lib/playwright-focused-contract.mjs`<br>`audit/playwright/fixtures.mjs`<br>`audit/run-audit.ps1`<br>`audit/test-launcher-identity.ps1`<br>`index.html`<br>`release-shell-v1.json`<br>`Serve-MathQuest.ps1`<br>`sw.js`<br>`tools/build-pwa-release-manifest.mjs` | `audit/test-launcher-identity.ps1`<br>`audit/tests/architecture-policy.test.mjs`<br>`audit/tests/page-adapter-effects.test.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs`<br>`audit/tests/progress-source.test.mjs`<br>`audit/tests/pwa-release.test.mjs` |
| `runtime.pwa-status-policy` | `assets/js/math-quest-pwa-status.js` | `.github/workflows/pages.yml`<br>`audit.html`<br>`audit/lib/playwright-focused-contract.mjs`<br>`audit/playwright/fixtures.mjs`<br>`audit/run-audit.ps1`<br>`audit/test-launcher-identity.ps1`<br>`index.html`<br>`release-shell-v1.json`<br>`Serve-MathQuest.ps1`<br>`sw.js`<br>`tools/build-pwa-release-manifest.mjs` | `audit/test-launcher-identity.ps1`<br>`audit/tests/architecture-policy.test.mjs`<br>`audit/tests/page-adapter-effects.test.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs`<br>`audit/tests/pwa-release.test.mjs`<br>`audit/tests/pwa-status.test.mjs` |
| `security.gates` | `audit/security-gate-policy-v1.json` | `audit/install-reviewed-security-tools.ps1`<br>`audit/lib/public-candidate-refactor-policies.mjs`<br>`audit/lib/security-command-runtime.mjs`<br>`audit/lib/security-gate-policy.mjs`<br>`audit/lib/security-scans.mjs`<br>`audit/run-security-dependency-gate.mjs`<br>`audit/security/semgrep-high-confidence-v1.json` | `audit/tests/public-candidate-refactor-policies.test.mjs`<br>`audit/tests/security-dependency-gate.test.mjs` |
| `testing.art-dom-observations` | `audit/playwright/art-dom-observations.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.art-migration-source` | `audit/lib/art-migration-source.mjs` | `audit/lib/art-migration-baseline.mjs` | `audit/tests/art-migration-baseline.test.mjs` |
| `testing.assisted-learning-journey` | `audit/playwright/assisted-learning-journey.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.axe-accessibility` | `audit/lib/axe-accessibility.mjs` | `audit/gate-integrity-policy-v1.json`<br>`audit/lib/playwright-deep-ux-census.mjs`<br>`audit/lib/playwright-focused-contract.mjs`<br>`audit/playwright/compact-reporter.mjs`<br>`audit/playwright/deep-ux-census.spec.mjs`<br>`audit/playwright/fixtures.mjs`<br>`audit/run-audit.ps1`<br>`audit/run-playwright-deep-ux-census.mjs`<br>`docs/testing/test-to-branch-effect-map.md`<br>`licenses/ci-toolchain.md` | `audit/tests/axe-accessibility.test.mjs`<br>`audit/tests/playwright-deep-ux-census.test.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.browser-cdp` | `audit/lib/browser-cdp.mjs` | `audit/lib/browser-smoke.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/pwa-release.test.mjs` |
| `testing.browser-lifecycle-contract` | `audit/tests/browser-lifecycle-contract.mjs` | `audit/tests/holistic-child-ux-regressions.test.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/holistic-child-ux-regressions.test.mjs` |
| `testing.canary-evidence-contract` | `audit/lib/trusted-https-canary-contract.mjs` | — | `audit/tests/trusted-https-canary.test.mjs` |
| `testing.canary-evidence-fixture` | `audit/tests/canary-evidence-fixture.mjs` | — | `audit/tests/trusted-https-canary.test.mjs` |
| `testing.canary-evidence-validation` | `audit/lib/trusted-https-canary-evidence.mjs` | — | `audit/tests/trusted-https-canary.test.mjs` |
| `testing.canary-runner-browser` | `audit/lib/trusted-https-canary-runner-browser.mjs` | — | `audit/tests/canary-runner-effects.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs` |
| `testing.canary-runner-platform` | `audit/lib/trusted-https-canary-runner-platform.mjs` | — | `audit/tests/canary-runner-effects.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs` |
| `testing.canary-runner-report` | `audit/lib/trusted-https-canary-runner-report.mjs` | — | `audit/tests/canary-runner-effects.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs` |
| `testing.child-string-validation` | `audit/lib/child-strings.mjs` | — | `audit/tests/child-string-validation.test.mjs`<br>`audit/tests/node-engine.test.mjs` |
| `testing.css-fixtures` | `audit/tests/css-fixtures.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/holistic-child-ux-regressions.test.mjs` |
| `testing.deep-ux-dom-observations` | `audit/playwright/deep-ux-dom-observations.mjs` | — | `audit/tests/playwright-deep-ux-census.test.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.deep-ux-sampling` | `audit/lib/playwright-deep-ux-sampling.mjs` | — | `audit/tests/playwright-deep-ux-census.test.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.design-token-observations` | `audit/playwright/design-token-observations.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.engine-ambient-scan` | `audit/lib/engine-loader.mjs` | `audit/tests/engine-ambient-scan.test.mjs`<br>`audit/tests/engine-core-checks.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-ambient-scan.test.mjs`<br>`audit/tests/engine-suite.mjs` |
| `testing.engine-audit` | `audit/tests/engine-suite.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.engine-boundary-checks` | `audit/tests/engine-boundary-checks.mjs` | `audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-core-checks` | `audit/tests/engine-core-checks.mjs` | `audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-free-play-behavior` | `audit/tests/engine-free-play-behavior.mjs` | `audit/tests/engine-learning-checks.mjs`<br>`audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-import-behavior` | `audit/tests/engine-import-behavior.mjs` | `audit/tests/engine-learning-checks.mjs`<br>`audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-input-behavior` | `audit/tests/engine-input-behavior.mjs` | `audit/tests/engine-core-checks.mjs`<br>`audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-learning-checks` | `audit/tests/engine-learning-checks.mjs` | `audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-placement-behavior` | `audit/tests/engine-placement-behavior.mjs` | `audit/tests/engine-learning-checks.mjs`<br>`audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.engine-placement-boundaries` | `audit/tests/engine-placement-boundaries.mjs` | `audit/tests/engine-boundary-checks.mjs`<br>`audit/tests/engine-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs` |
| `testing.exhaustive-generator` | `audit/exhaustive-generator-audit.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/exhaustive-generator-contract.test.mjs` |
| `testing.exhaustive-response-fixtures` | `audit/lib/exhaustive-response-fixtures.mjs` | `audit/exhaustive-generator-audit.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/exhaustive-response-fixtures.test.mjs` |
| `testing.functional-art-journey` | `audit/playwright/functional-art-journey.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.generator-contract` | `audit/tests/generator-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.manifest-collections` | `audit/lib/manifest-collection-checks.mjs` | — | `audit/tests/feature-map.test.mjs`<br>`audit/tests/repository-code-map.test.mjs`<br>`audit/tests/tutorial-manifest.test.mjs` |
| `testing.operation-cleanup` | `audit/lib/operation-cleanup.mjs` | `audit/lib/browser-smoke.mjs`<br>`audit/run-playwright-deep-ux-census.mjs`<br>`audit/run-playwright-focused.mjs`<br>`audit/run-playwright-interaction-fuzz.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/operation-cleanup.test.mjs` |
| `testing.page-adapter-fixture` | `audit/tests/page-adapter-fixture.mjs` | — | `audit/tests/page-adapter-effects.test.mjs` |
| `testing.parent-lab-journey` | `audit/playwright/parent-lab-journey.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.placement-adapter-fixture` | `audit/tests/placement-adapter-fixture.mjs` | — | `audit/tests/placement-adapter-effects.test.mjs` |
| `testing.placement-api-boundary-contract` | `audit/tests/placement-api-boundary-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.placement-fixtures` | `audit/lib/placement-fixtures.mjs` | `audit/lib/differential-equivalence.mjs`<br>`audit/tests/engine-placement-behavior.mjs`<br>`audit/tests/engine-placement-boundaries.mjs`<br>`audit/tests/engine-suite.mjs`<br>`audit/tests/placement-api-boundary-contract.mjs`<br>`audit/tests/placement-engine-reuse.test.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/placement-fixtures.test.mjs` |
| `testing.playwright-interaction-fuzz` | `audit/lib/playwright-interaction-fuzz.mjs` | `audit/playwright/interaction-fuzz.spec.mjs`<br>`audit/run-playwright-interaction-fuzz.mjs`<br>`docs/testing/test-to-branch-effect-map.md`<br>`playwright.interaction-fuzz.config.mjs` | `audit/tests/playwright-interaction-fuzz.test.mjs` |
| `testing.playwright-server-lifecycle` | `audit/lib/playwright-server-lifecycle.mjs` | `audit/run-playwright-deep-ux-census.mjs`<br>`audit/run-playwright-focused.mjs`<br>`audit/run-playwright-interaction-fuzz.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/playwright-server-lifecycle.test.mjs` |
| `testing.public-api-contract` | `audit/tests/public-api-contract.mjs` | `audit/tests/public-api-progression-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.public-api-progression-contract` | `audit/tests/public-api-progression-contract.mjs` | `audit/tests/public-api-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.publication-runner-contract` | `audit/tests/publication-runner-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/publication-clearance.test.mjs` |
| `testing.qa-browser-fixture` | `audit/tests/qa-browser-fixture.mjs` | — | `audit/tests/qa-tour.test.mjs` |
| `testing.release-version-comparison` | `audit/lib/release-version-comparison.mjs` | `audit/lib/differential-equivalence.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/release-version-comparison.test.mjs` |
| `testing.response-action-contract` | `audit/tests/response-action-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.response-completion-contract` | `audit/tests/response-completion-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.response-fixtures` | `audit/tests/response-fixtures.mjs` | `audit/tests/node-engine.test.mjs`<br>`audit/tests/response-action-contract.mjs`<br>`audit/tests/response-completion-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/response-fixtures.test.mjs` |
| `testing.response-persistence-contract` | `audit/tests/response-persistence-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.response-predicate-contract` | `audit/tests/response-predicate-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.rights-state-fixture` | `audit/tests/rights-state-fixture.mjs` | — | `audit/tests/playwright-focused-contract.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs` |
| `testing.saved-state-boundary-contract` | `audit/tests/saved-state-boundary-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.saved-state-contract` | `audit/tests/saved-state-contract.mjs` | `audit/tests/saved-state-question-contract.mjs`<br>`audit/tests/saved-state-root-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.saved-state-question-contract` | `audit/tests/saved-state-question-contract.mjs` | `audit/tests/saved-state-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.saved-state-root-contract` | `audit/tests/saved-state-root-contract.mjs` | `audit/tests/saved-state-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.semantic-curriculum-facets` | `audit/tests/semantic-curriculum-facets.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.semantic-input-facets` | `audit/tests/semantic-input-facets.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.semantic-mastery-validation` | `audit/tests/semantic-mastery-validation.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.semantic-math-validation` | `audit/tests/semantic-math-validation.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.semantic-model-validation` | `audit/tests/semantic-model-validation.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.semantic-persistence-validation` | `audit/tests/semantic-persistence-validation.mjs` | `audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/manifest-semantic-suite.mjs` |
| `testing.service-worker-fixture` | `audit/tests/service-worker-fixture.mjs` | — | `audit/tests/pwa-release.test.mjs` |
| `testing.session-fixtures` | `audit/tests/session-fixtures.mjs` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/placement-api-boundary-contract.mjs`<br>`audit/tests/public-api-contract.mjs`<br>`audit/tests/response-action-contract.mjs`<br>`audit/tests/response-fixtures.mjs`<br>`audit/tests/response-persistence-contract.mjs`<br>`audit/tests/saved-state-boundary-contract.mjs`<br>`audit/tests/saved-state-contract.mjs`<br>`audit/tests/saved-state-question-contract.mjs`<br>`audit/tests/session-prefix-contract.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.session-prefix-contract` | `audit/tests/session-prefix-contract.mjs` | `docs/testing/test-to-branch-effect-map.md` | `audit/tests/node-engine.test.mjs` |
| `testing.shared-response-fixtures` | `audit/lib/shared-response-fixtures.mjs` | `audit/tests/engine-suite.mjs`<br>`audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs`<br>`audit/tests/manifest-semantic-suite.mjs` |
| `testing.sort-response-fixtures` | `audit/lib/sort-response-fixtures.mjs` | `audit/lib/exhaustive-response-fixtures.mjs`<br>`audit/lib/shared-response-fixtures.mjs`<br>`audit/tests/engine-input-behavior.mjs`<br>`audit/tests/engine-suite.mjs`<br>`audit/tests/manifest-semantic-suite.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/engine-suite.mjs`<br>`audit/tests/exhaustive-response-fixtures.test.mjs`<br>`audit/tests/manifest-semantic-suite.mjs` |
| `testing.source-extraction` | `audit/tests/source-extraction.mjs` | `audit/tests/browser-fixture-contract.test.mjs`<br>`audit/tests/browser-frame-contract.test.mjs`<br>`audit/tests/browser-readiness-contract.test.mjs`<br>`audit/tests/browser-runner-lifecycle.test.mjs`<br>`audit/tests/exhaustive-generator-contract.test.mjs`<br>`audit/tests/holistic-child-ux-regressions.test.mjs`<br>`audit/tests/holistic-functional-regressions.test.mjs`<br>`audit/tests/page-adapter-effects.test.mjs`<br>`audit/tests/placement-adapter-effects.test.mjs`<br>`audit/tests/placement-engine-reuse.test.mjs`<br>`audit/tests/pwa-release.test.mjs`<br>`audit/tests/qa-tour.test.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/tests/source-extraction.test.mjs` |
| `testing.tutorial-observations` | `audit/playwright/tutorial-observations.mjs` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/playwright-focused-contract.test.mjs` |
| `testing.visual-model-oracle` | `audit/visual-model-oracle.mjs` | `audit/approved-visual-regression.js`<br>`audit/tests/holistic-child-ux-regressions.test.mjs`<br>`docs/testing/test-to-branch-effect-map.md` | `audit/approved-visual-regression.js`<br>`audit/tests/holistic-child-ux-regressions.test.mjs` |
| `testing.visual-stimulus-fixture` | `audit/tests/visual-stimulus-fixture.mjs` | — | `audit/tests/holistic-functional-regressions.test.mjs` |
| `toolchain.dependencies` | `package.json` | `licenses/ci-toolchain.md`<br>`licenses/component-register-v1.json`<br>`package-lock.json` | `audit/tests/trusted-https-canary.test.mjs` |
| `tutorial.linkage` | `curriculum/math-quest-tutorial-manifest-v1.json` | `curriculum/math-quest-feature-map-v1.json`<br>`docs/development/build-spec.md`<br>`index.html`<br>`release-shell-v1.json` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/playwright/deep-ux-census.spec.mjs`<br>`audit/tests/tutorial-manifest.test.mjs` |

<!-- REPOSITORY-CODE-MAP-END -->
