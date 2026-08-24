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
| `art-design.asset-acceptance` | `audit/art-asset-register-v1.json` | — | `audit/tests/art-design-governance.test.mjs` |
| `art-design.migration-baseline` | `audit/art-migration-baseline-v1.json` | — | `audit/tests/art-migration-baseline.test.mjs`<br>`audit/validate-art-migration-baseline.mjs` |
| `art-design.migration-browser-evidence` | `audit/art-migration-browser-evidence-v1.json` | — | `audit/tests/art-migration-baseline.test.mjs`<br>`audit/validate-art-migration-baseline.mjs` |
| `art-design.runtime-tokens` | `assets/design/math-quest-design-tokens-v1.json` | `assets/design/math-quest-design-tokens-v1.css`<br>`audit.html`<br>`index.html`<br>`release-shell-v1.json` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/art-design-governance.test.mjs`<br>`audit/tests/design-token-projection.test.mjs` |
| `art-design.source-decisions` | `audit/art-design-decision-register-v1.json` | `AGENTS.md`<br>`assets/design/math-quest-design-tokens-v1.json`<br>`audit/art-asset-register-v1.json`<br>`curriculum/math-quest-feature-map-v1.json`<br>`curriculum/math-quest-tutorial-manifest-v1.json` | `audit/tests/art-design-governance.test.mjs` |
| `browser.reviewed-identity` | `audit/browser-runner-evidence-v1.json` | `PUBLICATION_CLEARANCE.md` | `audit/tests/publication-clearance.test.mjs` |
| `certification.cadence` | `audit/certification-cadence-v1.json` | `AGENTS.md` | `audit/tests/certification-cadence.test.mjs` |
| `certification.gates` | `audit/run-audit.mjs` | — | `audit/tests/audit-lane-orchestration.test.mjs`<br>`audit/tests/audit-orchestration.test.mjs` |
| `curriculum.contract` | `curriculum/math-quest-manifest-v1.json` | `index.html` | `audit/tests/manifest-semantic-suite.mjs`<br>`audit/tests/node-engine.test.mjs` |
| `feature.user-operable-mechanics` | `curriculum/math-quest-feature-map-v1.json` | — | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/tests/feature-map.test.mjs`<br>`audit/tests/holistic-child-ux-regressions.test.mjs` |
| `policy.agent-collaboration` | `AGENTS.md` | `audit/agent-collaboration-policy-v1.json` | `audit/tests/agent-collaboration-policy.test.mjs` |
| `policy.ai-first-drift-control` | `AGENTS.md` | `audit/repository-code-map-v1.json` | `audit/tests/repository-code-map.test.mjs` |
| `policy.finished-work` | `AGENTS.md` | `audit/finished-work-policy-v1.json` | `audit/tests/finished-work-policy.test.mjs` |
| `policy.gate-integrity` | `audit/gate-integrity-policy-v1.json` | `.github/workflows/audit.yml`<br>`AGENTS.md`<br>`audit/run-audit.mjs`<br>`audit/verify-github-gate-enforcement.mjs` | `audit/tests/audit-lane-orchestration.test.mjs`<br>`audit/tests/gate-integrity-policy.test.mjs` |
| `product.version` | `VERSION` | `.github/workflows/pages.yml`<br>`.github/workflows/trusted-https-canary.yml`<br>`audit.html`<br>`audit/lib/playwright-focused-contract.mjs`<br>`audit/lib/publication-clearance.mjs`<br>`audit/lib/trusted-https-canary-supply-chain.mjs`<br>`audit/lib/trusted-https-canary.mjs`<br>`audit/playwright/fixtures.mjs`<br>`audit/release-evidence-bundle-v1.json`<br>`audit/run-audit.ps1`<br>`audit/run-trusted-https-canary.mjs`<br>`audit/test-launcher-identity.ps1`<br>`audit/tests/page-adapter-effects.test.mjs`<br>`audit/tests/playwright-deep-ux-census.test.mjs`<br>`audit/tests/publication-clearance.test.mjs`<br>`audit/tests/pwa-release.test.mjs`<br>`audit/tests/qa-tour.test.mjs`<br>`audit/tests/trusted-https-canary.test.mjs`<br>`audit/trusted-https-canary-beta7-v1.json`<br>`CHANGELOG.md`<br>`docs/development/pwa-adapter-contract.md`<br>`docs/release/checklist.md`<br>`docs/release/privacy-review.md`<br>`docs/release/publication-gates.md`<br>`docs/release/readiness.md`<br>`index.html`<br>`PUBLICATION_CLEARANCE.md`<br>`README.md`<br>`release-shell-v1.json`<br>`research/build-axioms.md`<br>`Serve-MathQuest.ps1`<br>`sw.js`<br>`tools/build-pwa-release-manifest.mjs` | `audit/tests/engine-suite.mjs`<br>`audit/tests/pwa-release.test.mjs` |
| `release.evidence-bindings` | `audit/release-evidence-bundle-v1.json` | `audit/run-audit.mjs`<br>`audit/trusted-https-canary-beta7-v1.json`<br>`PUBLICATION_CLEARANCE.md` | `audit/tests/publication-clearance.test.mjs`<br>`audit/tests/release-evidence-bundle.test.mjs` |
| `release.public-shell` | `release-shell-v1.json` | `sw.js` | `audit/tests/pwa-release.test.mjs` |
| `repository.change-impact` | `tools/blast-radius-lookup.mjs` | — | `audit/tests/blast-radius-lookup.test.mjs` |
| `repository.structure` | `audit/repository-code-map-v1.json` | `docs/repository-structure.md` | `audit/tests/repository-code-map.test.mjs` |
| `rights.components` | `licenses/component-register-v1.json` | `licenses/first-party-paths-v1.txt` | `audit/public-candidate-guard.mjs` |
| `rights.evidence-paths` | `licenses/evidence-paths-v1.json` | — | `audit/public-candidate-guard.mjs` |
| `testing.playwright-interaction-fuzz` | `audit/lib/playwright-interaction-fuzz.mjs` | `audit/playwright/interaction-fuzz.spec.mjs`<br>`audit/run-playwright-interaction-fuzz.mjs`<br>`docs/testing/test-to-branch-effect-map.md`<br>`playwright.interaction-fuzz.config.mjs` | `audit/tests/playwright-interaction-fuzz.test.mjs` |
| `toolchain.dependencies` | `package.json` | `licenses/ci-toolchain.md`<br>`licenses/component-register-v1.json`<br>`package-lock.json` | `audit/tests/trusted-https-canary.test.mjs` |
| `tutorial.linkage` | `curriculum/math-quest-tutorial-manifest-v1.json` | `curriculum/math-quest-feature-map-v1.json`<br>`docs/development/build-spec.md`<br>`index.html`<br>`release-shell-v1.json` | `audit/playwright/critical-journeys.spec.mjs`<br>`audit/playwright/deep-ux-census.spec.mjs`<br>`audit/tests/tutorial-manifest.test.mjs` |

<!-- REPOSITORY-CODE-MAP-END -->
