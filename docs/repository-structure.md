# Repository structure

Math Quest keeps public runtime files, maintenance tools, evidence, and legal
records in distinct locations.

| Path | Purpose |
|---|---|
| `/` | Runtime entry points, Windows launchers, and standard project files |
| `.github/` | Issue, pull-request, dependency, audit, and deployment automation |
| `assets/` | Bundled app icons, fonts, sounds, and their first-party generation source |
| `audit/` | Executable deterministic, semantic, coverage, mutation, and browser checks |
| `curriculum/` | Canonical versioned curriculum manifest and provenance |
| `docs/development/` | Stable development contract |
| `docs/release/` | Release gates, checklists, reviews, and public-tree inventory |
| `docs/testing/` | Human-readable test coverage and effect maps |
| `licenses/` | Reviewed first-party/evidence declarations, component register, and licence texts |
| `research/` | Public-safe design rationale and clean-room research records |
| `tools/` | Active maintenance and normalization utilities |

Generated reports, screenshots, temporary coverage data, gameplay backups,
private research, archives, editor state, and dependency caches are ignored
and must not be committed. Scratch or one-time migration scripts should be
removed once their reviewed output is canonical.

Every staged path must appear in `docs/release/public-file-manifest.txt` and be
classified by `licenses/component-register-v1.json`. Run
`tools/sync-public-inventory.mjs` after intentionally changing the staged file
set. New original files must first be reviewed and added manually to
`licenses/first-party-paths-v1.txt`; the synchronizer refuses to certify
authorship. Evidence must be explicitly registered and hash-pinned in
`licenses/evidence-paths-v1.json`; component records cannot invent evidence
paths. Then inspect and stage both declarations and both generated inventory
files before running the release audit.
