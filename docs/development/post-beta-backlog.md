# Post-beta research backlog

This backlog contains work that must not change or delay the current Beta 2
release candidate. Start an item only after the beta has been frozen, audited,
and published.

## Agent refactor: code, tests, and quality gates

**Status:** Owner-authorized on 2026-08-27. The clean pre-refactor baseline is
commit `2078625b407d5189f579e94e716c86dce86ae90f`; its broad development suite,
driftless chain, tutorial synchronization, direct Edge journeys, and public-
candidate guard passed before implementation began. Work remains implemented
only when the focused checks below pass and formally incomplete until a future
exact frozen candidate passes the release certification required by
`AGENTS.md`.

### Verified handoff for a fresh Astra session — 2026-09-04

This section is the current takeover entry. Earlier entries below preserve the
history of individual candidates, failures, approvals, and corrections; their
old pending states do not supersede the verified checkpoint recorded here.
The owner requested this handoff and will create the new session. Stop work in
the old session after delivering it; use one implementation owner for the repo.

**Repository and evidence.** The working repository is
`D:/OpenMathGame/NateGameMath` (not its parent directory). The branch is
`codex/agent-refactor-quality-gates`. HEAD and the immutable R0 comparison base
remain `2078625b407d5189f579e94e716c86dce86ae90f`. The entire accumulated refactor
is staged but uncommitted. Preserve those staged changes; do not reset, restore,
rebuild from HEAD, discard them, or start from a clean worktree that omits them.
Before this documentation handoff, the index and working source matched tree
`d72432c595acead484585927f331c9fbd16344b3`, with zero unstaged tracked changes
and zero nonignored untracked files. This handoff intentionally remains the
only unstaged tracked change, preserving that exact verified index. Stage it
with the next completed batch; its new bytes are not covered by the old seal.
No release, commit, push, tag, or deployment was performed in these sessions.

The retained full report `audit/.tmp-ai-change-loop-d72432c5.json` has SHA-256
`5b4a8ba113c44ceeeab45a6825023aa2ea0855b53c24dc6c4dde7861029040e7`.
It reports all nine stages PASS, no findings, and identical initial/final
candidate bindings. Its gate-policy, quality-policy, package-lock, and reviewed
Node hashes were checked again against the files at handoff. Evidence includes
667 native tests with zero failures/cancellations/skips, 36 direct Edge
journeys with zero failures/skips/unknowns/duplicates, 90.42 percent native
engine branch coverage, and zero dependency vulnerabilities in all six counts.
Ownership/drift, negative controls, independent review, and corrected npm
startup all passed. This is a development checkpoint, not refactor completion,
full release certification, or proof of physical-device qualification.

**Verified remaining work.** Fresh ESLint inventory at handoff reports zero
errors and 397 warnings: cyclomatic complexity 155, nesting 52, function length
111, parameter count 3, and statement count 76. Unused-variable, useless-escape,
Promise-executor-return, and unsafe-finally warnings are zero. The inventory is
`audit/.tmp-eslint-handoff-d72432c5.json`, SHA-256
`0153f7065b28b55425ad295c8606bac310d9f8169a8578c2ff0c5220adc413d9`.
These are maintainability findings, not 397 observed game bugs. The owner has
reported no observed gameplay defect. Highest remaining concentrations are
`audit/approved-visual-regression.js` (55), `audit/tests/node-engine.test.mjs`
(47), `audit/tests/manifest-semantic-suite.mjs` (25),
`audit/public-candidate-guard.mjs` (22), and three files at 20 each:
`audit/playwright/critical-journeys.spec.mjs`, `audit/tests/pwa-release.test.mjs`,
and `audit/tests/engine-suite.mjs`. Inventory other files before planning the
next batch. R3/R4 and the systematic duplicate-block classification/consolidation
remain open. Previously reported 575 JavaScript and 132 CSS/PowerShell matches
are overlapping review candidates, not independent defects; recompute as needed.

**Requirements retained.** Read all of `AGENTS.md`, this refactor section, and
the current quality/architecture/security/gate-integrity policies before editing.
The original requirements attachment was read in full at handoff; its filename
is `agent_refactor_requirements_code_tests_gates.txt`, SHA-256
`a3900e49c2659ffacc33c404c5778c0be236e890923cb9433eb84bce849fc3e4`.
Its ten areas remain binding: complexity and size, executable architectural and
domain invariants, meaningful test refactoring, lint/static analysis, dead code
and dependencies, security, tracked work markers, anti-circumvention, downward
legacy ratchets, and complete verification. The owner's later restoration of
original requirements is additive to V2 differential, property/fuzz, mutation,
and performance techniques. Preserve the whole-codebase baseline covering
cyclomatic/ABC/cognitive complexity, function/file LOC, nesting, lint warnings
and suppressions, coverage, governed work markers, unused code/dependencies, CSS/JS/
bundle sizes, vulnerabilities, secrets, and static security. Use immutable R0
and its hash-bound inline-script correction; do not recreate easier baselines.

New/materially changed functions must satisfy cyclomatic <=10, ABC <=30,
cognitive <=15, function LOC <=80, nesting <=4, and stronger applicable rules.
Retain ESLint zero live warnings as the R4 finish line; no unexplained disables;
coverage at least 80 percent and the stronger current non-regression floor of
90.42 percent; appropriate characterization/TDD; BundleWatch/size budgets;
Knip; TruffleHog; vulnerability scanning; Semgrep; Stylelint; markdownlint; and
work-marker controls. Preserve every meaningful assertion and independent
mathematical oracle. Never minify, mechanically fragment, hide/exclude findings,
relax a rule, or change expected behavior merely to pass. Follow the existing
Owners → Code Map → Feature Map → Tutorial Manifest → Art Design → Blast Radius
→ Gates chain at structural checkpoints and final handoff. Do not add a parallel
status/ownership authority or extra tools without demonstrated need.

**Latest owner direction: reuse and efficiency.** Prefer, in order, a suitable
existing repository implementation or utility; standard/platform facilities and
approved library utilities; a suitable long-established MIT-licensed external
project; then the smallest new task-specific code. Reuse must match semantics,
ownership, offline behavior, tests, and privacy requirements. Preserve approved
existing tools under their recorded licences; the MIT preference applies to
new external choices. Before adding one, establish exact licence/provenance,
maintenance history, security, reproducibility, and dependency/bundle costs and
follow the existing owner-approval policy. A familiar name or age is insufficient.

Maximize practical efficiency through measured simplification, elimination of
unnecessary work, meaningful shared functions, clear module boundaries, and
runtime/bundle non-regression. Record before/after measurements for claimed
performance gains. Do not promise a global mathematical optimum or continue
speculative micro-optimization indefinitely. Use larger coherent batches,
focused verification while editing, bounded review where required, then freeze
one reviewed batch for the full nine-stage loop. Do not run complete release
certification per edit. Preserve the exact loop order and fail-closed evidence;
retain first failures, diagnose them, and avoid unchanged reruns for green.

**Carry forward approvals and resolved findings.** Package metadata auditing
may send dependency names/versions only to `registry.npmjs.org`; no game code,
child data, saves, or telemetry. Preserve exactly three historical Git-ignored
review scripts and their 53 findings outside live lint under the hash-bound
owner exclusion; they remain historical non-passes. The owner approved the
ART-DEC-013 font/contrast treatment and its exact tutorial metadata transition;
do not request the same approval again or extend it to new pixels. Retain axe-core
as a CI-only check. New embroidery/mosaic public-domain art research is deferred
until after this refactor. The generator/helper architecture error was corrected
by moving the helper into `audit/lib/` and injecting the original independent
strategy oracle. The measured npm startup timeout was corrected, with owner
approval, to 120 seconds for version only; configuration remains 30 seconds and
network audit 180 seconds. Both findings were subsequently verified and are
resolved in the all-PASS checkpoint. Do not restart their reviews. New risky
scope gets its required bounded review, not another cohort for unchanged work.

**Local execution.** Use reviewed Node 24.14.0 at
`D:/CodexTemp/math-quest-node-v24.14.0/node-v24.14.0-win-x64/node.exe` and its
sibling npm CLI (11.9.0). Node SHA-256:
`63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088`.
For Git, use command-scoped
`-c safe.directory=D:/OpenMathGame/NateGameMath`; do not change global Git
configuration. Full-loop environment uses:

```text
MQ_SECURITY_TOOL_CACHE=D:/CodexTemp/math-quest-security-tools
MQ_NPM_AUDIT_TEMP=D:/CodexTemp
npm_config_cache=D:/OpenMathGame/NateGameMath/audit/.tmp-npm-isolated-diagnostic-cache
npm_config_fetch_retries=0
npm_config_fetch_timeout=15000
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=D:/OpenMathGame/NateGameMath
```

Use `audit/run-ai-change-loop.mjs --progress` after the complete reviewed slice
is staged and frozen; retain its structured report under a distinct ignored
path. Browser/security checks may require the existing owner-context execution
permission. Limit all code/security/process investigations to Math Quest and
its explicitly used tool paths. Never inspect other D-drive projects. Local
execution delays were intermittent; direct file probes were fast, so no general
D-drive failure was established. Do not copy/reinstall runtimes or rerun full
baselines without evidence. Reports under `.tmp` are ignored local evidence:
preserve them, and never claim their presence in Git or a fresh checkout.

**Completion and final report.** Finish the original refactor acceptance criteria,
zero live lint warnings, warranted duplication consolidation, all required
quality/coverage/security/performance checks, drift-free ownership, and the
required reviewed verification. Report product defects separately from test or
harness corrections. Compare against R0, separating production code, audit/test
code, generated data, moved lines, deleted lines, new dependencies, and added
tests; include complexity/duplication and measured performance changes, retained
duplication rationale, and a normal post-refactor audit. Net LOC increases must
be explicit. Put optional polish in the existing backlog. Distinguish development
completion, release readiness/certification, and actual publication; preserve the
existing release authority and exact-candidate release gates rather than assuming
that a development PASS authorizes a new version or bypasses release evidence.

### Successor audit-test batch — 2026-09-04 (development checkpoint)

The successor verified the recorded branch, HEAD, staged tree, report hashes,
policy/lock bindings, and reviewed Node executable before editing. All of
`AGENTS.md`, this refactor section, the four governing policies, and the original
requirements were read. The original attachment is retained below
`$CODEX_HOME/codex-remote-attachments/`, under task directory
`01a03963-1dee-7522-9d4f-018e7e10d611`, attachment directory
`689AD6F5-CB36-45CB-BC3E-AC2E726A9363`, filename
`1-agent_refactor_requirements_code_tests_gates.txt`; its SHA-256 matches the
handoff above.

This open batch extends the existing ESLint-backed source extractor to HTML,
reusing the governed executable-inline-script selector and preserving separate
script/module scopes. PWA and child-UX tests now use it instead of maintaining
two more delimiter scanners. Three new tests protect exact bytes, non-execution,
external/data-script exclusion, ambiguous declarations, malformed JavaScript,
and unique script selection. Repeated PWA extraction reuses parsed source within
that test module. Independent mathematical oracles and shell-path literals remain.

The child-UX CSS fixture shares its repeated selector-tag extraction and compares
cascade specificity once. A retained 1,332-observation predecessor comparison
passed in `audit/.tmp-html-css-fixture-comparison.json`; it is synthetic fixture
evidence, not rendered-browser or product-performance evidence. QA-007 is grouped
into eight behavior-specific tests, with all 71 original assertion sites retained
and every changed function within the strict limits. QA-037 now separately tests
layout rules, canonical browser fixtures, and actual pair-link driver actions.
All eleven focused QA-007/QA-037 tests pass. The earlier HTML extraction/PWA run
passed 72 tests, and the child-UX/architecture/ownership run passed 29 tests before
the later test regrouping. The combined final-source run then passed all 128
tests with zero failures, cancellations, or skips; its retained output is
`audit/.tmp-test-structure-focused.txt`.

The interim 388-warning checkpoint was followed by a larger audit-test batch.
Live lint now reports zero errors and 365 warnings in
`audit/.tmp-eslint-audit-test-batch.json`: complexity 150, nesting 50, function
length 98, parameters 3, and statements 64. The child-UX suite has zero live lint
warnings. Its 357 assertion sites are unchanged in a full source comparison;
`audit/.tmp-child-metric-refactor/equivalence.json` also records 1,620 matching
CSS-fixture observations. The fixture has its own bounded module and retains its
original selector subset. QA-019 traverses the same 216 requests through a named
generator; QA-021/022 share the same independent physical-unit expectations and
separate rendering, grading, teaching, and difficulty assertions.

The PWA entry now imports four coherent browser test modules covering session
fixtures/layout, runner lifecycle, frame lifecycle, and readiness. Existing
prepared-release and dirty-worktree snapshot tests use named preparation and
assertion helpers; duplicated server lifecycle and fresh-candidate error checks
share their implementations. The PWA assertion inventory goes from 442 to 433
sites: three repeated script-count assertions and seven repeated error assertions
are consolidated into helpers still invoked on every original path; a callback
accessor changes one expression; and one new configured-error assertion is added.
The parser guard now executes for six adapter loads rather than four, and the
seven error assertions still execute for both candidate failure paths.

A confirmed test-harness defect was corrected: the candidate-update mock omitted
its configured network error from the isolated context and threw ReferenceError
instead. The new identity assertion failed before adding that binding and passes
afterward. Its retained first failure is
`audit/.tmp-pwa-fixture-refactor/hostile-error-before.txt`. This corrects test
validity, not an observed game defect or the production error-sanitization policy.

The combined focused run executed 160 tests: 157 passed and three failed on one
missing version-reference projection for the moved readiness test. That mapping
is corrected; all 35 subsequent runner-lifecycle and drift checks pass. Both
results remain in `audit/.tmp-audit-test-batch-focused.txt` and
`audit/.tmp-audit-test-batch-correction.txt`. All 33 child-UX checks pass. The
function-quality gate passes in
`audit/.tmp-function-audit-test-batch-tightened.json`, with JavaScript legacy
ceilings reduced to 150 cyclomatic, 218 ABC, 96 cognitive, 102 function-length,
and 10 nesting violations. New and materially changed functions meet the strict
limits. Remaining PWA lint findings are confined to the unchanged worker
integration test and its network fixture. No rule or exclusion was weakened.

The child-UX source ceiling is now 1,608 lines and the PWA entry is 1,993. Including
the five new modules and source-extraction changes, this batch adds 265 net lines
of test/fixture code relative to tree `d72432c595acead484585927f331c9fbd16344b3`;
moved code is not claimed as deleted code. This is a maintainability improvement,
not a net LOC saving or a measured product-performance gain. Ownership,
first-party records, the public inventory, and generated projections include the
new modules. The original staged work and handoff are preserved in the expanded
staged candidate; no reset, commit, push, tag, release, or deployment occurred.

Independent review found no actionable findings on exact tree
`44aba738605fbd2f823c5886b76281d3cb6e1fe8` against the qualified `d72432c5` base.
It inspected all 17 changed paths and independently passed 144 focused tests.
The corrected public-candidate guard passes. Its first failure, caused by the
local-user path in this documentation, remains retained; the portable
`$CODEX_HOME` reference above corrects that disclosure. Fresh ESLint confirms
365 warnings and zero errors; Knip and markdownlint report zero findings.

The frozen nine-stage loop remains required before this batch advances. Wider
zero-lint, duplicate classification, and final refactor comparison requirements
remain open. The prior 90.42-percent coverage report is retained evidence, not
a new measurement of this draft. Runtime and dependency bytes are unchanged by
this batch.

The complete loop on frozen tree `04117ea934c5f24f9db4320d675c4ad7b52b4130`
passed compiler/contracts, architecture, tests/coverage, differential equivalence,
property/fuzz, and mutation. It stopped at security because the inherited handoff
listed literal marker tokens in prose without a tracking reference. The wording
above now refers to governed work markers; their exact definitions and mandatory
enforcement remain in `audit/security-gate-policy-v1.json#markers`. No action item,
rule, scan scope, or requirement is removed. The failed full report is retained at
`audit/.tmp-ai-change-loop-04117ea9.json`, SHA-256
`704d44b3b57f07557e36398ca5f535b445f98c0497d3b4cce3165142dc02c0dc`.
It records 90.42-percent branch coverage, zero dependency vulnerabilities, clean
static/secret scans, and unchanged candidate bindings. The final quality and
performance stages did not run; that candidate remains a non-pass. The corrected
documentation requires focused marker verification and a new complete loop.

The documentation correction passed the live 233-file marker scan, its rejection
control, and same-reviewer verification. The new complete loop passed all nine
stages on exact tree `d217326f493d3bf021f4bd18d724aedb00559fe1`, with no findings
and identical initial/final candidate bindings. Its retained report is
`audit/.tmp-ai-change-loop-d217326f.json`, SHA-256
`1698019f86c8501b8482d1f0c2c5fa41af3427ea6194ac56b9be67fd0e524c44`.
It records 667 native passes, zero failures/cancellations/skips, 90.42-percent
engine branch coverage, clean security/dependency results, and passing quality
and performance stages. The unchanged production payload is 2,701,857 bytes;
5,040 engine scenario operations took 4,076 ms, below the existing 12-second
budget. This qualifies the audit-test batch as a development checkpoint, not
completion of the remaining refactor or release certification/publication.

The next planned batch prioritizes runtime-engine bloat and redundancy, following
the owner's engine question. Fresh measurement against immutable R0 shows engine
bytes at 599,229 before and 593,968 now; 181,879 bytes are governed embedded
curriculum/tutorial data. The remaining placement/skill validators, session queue,
playground grading, and response-method selection warrant semantic reuse review.
No performance or byte reduction is assumed before measurement. Existing numeric
and key-shape helpers take priority over new utilities; independent mathematical
oracles and generated projections remain protected.

For the eventual whole-refactor comparison, the existing duplication algorithm
was applied to immutable R0 without changing any acceptance baseline. Its report
`audit/.tmp-r0-duplication/census.json` contains 585 overlapping candidates across
104 JavaScript/inline-script units; the current source census at
`audit/.tmp-duplication-census-44aba738.json` contains 406 across 174 units. Both
parse without errors. These are review candidates, not independent defect counts.
All 13 input hashes in the retained CSS/PowerShell census still match. Complete
classification and warranted consolidation remain open alongside 365 live lint
warnings. This checkpoint note is outside the preceding seal and joins the next
completed batch; the accumulated staged implementation remains preserved.

### Runtime engine reuse batch — 2026-09-04 (development checkpoint)

This batch starts from qualified tree
`d217326f493d3bf021f4bd18d724aedb00559fe1`. Its acceptance boundary is unchanged
public behavior and API keys, original validation/error/property-read order,
fresh question results, and immutable curriculum-only reuse. Placement ranking
now keeps one protected order per valid level and avoids its redundant array
copy. Four public placement paths share the existing validation-then-replay
implementation; run validation and question generation still occur on each call.

The private string-list validator's five callers all required bounded, unique,
nonempty strings. Removing its unused options preserves that exact contract and
avoids constructing an options object on every call. An unused tutorial-phase
index and unused local bindings are removed. The two discarded generator values
still execute their original random draws and coercions in their original order.
Neither generated manifest content nor an independent mathematical oracle changes.

Six permanent tests cover every qualified level order, rejection of invalid
levels, reuse work and mutation isolation, fresh questions, per-call validation,
complete placement journeys, string-list boundaries, and guarded reads. They are
discovered through the existing adapter-syntax entry. The repeated-ranking test
failed before the change. A separate comparison preserves 780 property/prototype
events and outcomes across 20 valid and malformed placement API cases. The
existing fixture helper moved from the test directory into the audit library so
both test and differential consumers can reuse it without a forbidden import.
The Code Map, retirement record, first-party declaration, and generated inventory
track that move.

The existing R0 differential comparison now includes three complete placement
journeys and a placement-recommendation mutation. The final-source comparison
and all controls pass with 9,300 observations, retaining the previous corpus and
witness fingerprints. The final focused suite passes all 117 tests. The initial focused
launch after raising the coverage floor stopped before comparison because the
closed schema still named the preceding floor; the schema and policy are now
synchronized at 90.50 percent. No floor was lowered or check bypassed.

Focused native coverage reached 90.50 percent on the draft before the final unused
binding cleanup. The complete frozen loop independently confirms 90.50 percent
with calibrated coverage of the final exact engine bytes. Engine bytes fall from
593,968 to 593,580, a 388-byte reduction.
JavaScript and production-payload ceilings tighten to 1,044,928 and 2,701,469 bytes.
The function-quality gate passes, engine-only unused-binding analysis is clean,
and live repository lint remains at 365 warnings with zero errors.

Paired local benchmarks retain identical output digests. Two seven-trial samples
favored the changed implementation, but their timings varied substantially,
including a cold-run outlier. Raw results remain in
`audit/.tmp-engine-validation-batch/paired-performance.json` and
`audit/.tmp-engine-validation-batch/paired-performance-final.json`; they do not
establish a universal percentage improvement. The owner notes that the D drive is
slow and shared by many agents; further drive-performance investigation is outside
this batch. The deterministic reduction in repeated ranking and allocations is
the primary efficiency evidence. Required budgets and verification remain intact.

Independent review found no actionable findings across all 19 changed paths on
tree `83b0cd1b4bf72016a3f8c3e719665e7533f549e0` against the qualified predecessor.
The reviewer independently passed 17 focused tests, all 21 predecessor placement
orders, three complete journeys containing 48 questions, and 20 valid/malformed
API cases. No correction round was needed.

All nine development stages pass on that exact frozen tree, with matching initial
and final bindings and no findings. The local report is
`audit/.tmp-ai-change-loop-83b0cd1b.json`, SHA-256
`21bdde3f2927f4a56c96836642f8daa7f32ae3d0d3595b62452dd2fad4f2fb38`.
It confirms 9,300 differential observations and final engine SHA-256
`d6226be2ac4a5702266253949a00857efef0a3ea4692fd66eb538f4d245ac9d1`.
The browser report records all 36 expected journeys passing without missing,
duplicate, or skipped cases. The 5,040-operation performance workload takes
2,530 ms within its unchanged 12,000 ms limit; this is one local budget result,
not a universal speedup estimate. This checkpoint prose follows the verified
freeze and does not change its source or policy bytes.

The same duplication scanner finds 407 overlapping candidates across 175 units
with no parse errors. Compared with the preceding 406-candidate census, the
repeated placement-validation block is removed; two small overlapping journey
setup candidates appear in the separate differential and golden-result checks.
These counts are review suggestions, not unique duplication findings or saved
lines. The local report is `audit/.tmp-duplication-census-83b0cd1b.json`.

The broader zero-warning and duplication finish line is unchanged: 365 live lint
warnings remain. The next coherent target is structured-response test fixtures
and behavior-specific contracts, preserving the independent mathematical oracles.
This is not release certification or publication.

### Response and session fixture batch — 2026-09-04 (development checkpoint)

This batch starts from staged checkpoint
`6ddcaa5069c3c58853aa78eb22aeccf32880e3dc`, whose source and policy bytes match
the qualified engine tree `83b0cd1b4bf72016a3f8c3e719665e7533f549e0`.
The owner explicitly resumed work after the safe usage pause. The runtime engine,
approved presentation, offline shell, mathematical oracles, and dependencies are
unchanged in this batch.

Canonical active-slot and saved-UI setup now belongs to
`audit/tests/session-fixtures.mjs`. A focused comparison against the preceding
implementation preserves all 369 saved-state cases. Structured-response discovery
belongs to `audit/tests/response-fixtures.mjs`: the first consumer retains the
exact 1,873-request search and all 26 qualified witnesses; later consumers replay
26 remembered generation requests and receive fresh questions and parameters.
Only requests are cached, separately for each engine. Incomplete discovery never
caches a partial result. The exact witness SHA-256 remains
`8afdd1139434b70470ebb33880fa5ee8312ac29ef68b4fdb7a9a13d005d044d5`.
Permanent tests reject a repeated-discovery mutant even when its questions remain
correct. The measured reduction concerns request counts, not drive timing.

The native test entry executes separate action, persistence, completion,
defensive-predicate, session-prefix, and placement-boundary contracts. Cases are
owned by their behavior or response method; state mutations that depend on one
another remain together. The existing placement fixture utility also replaces
the local completed-run loop while preserving its low-placement policy and
question-presence assertions. All 1,268 observed assertion outcomes, expected
values, and messages match the predecessor across the affected groups. The local
comparison is `audit/.tmp-response-refactor/assertion-equivalence-expanded.json`,
with matching assertion SHA-256
`4854971e3963674f2193b459613127650df5812f4f814186a479a92c3175fcf9`.
The earlier response-only comparison also retains its 1,081-assertion evidence.

The existing function gate required the session-prefix and placement-boundary
groups to satisfy strict limits after their relocation; those groups are included
in this batch. All 291 functions in the nine added source files satisfy the
existing limits. Live lint falls from 365 to 346 warnings with zero errors, and
the main engine test file falls from 4,712 to 3,127 physical lines. The lint,
legacy-complexity, and file-size ratchets tighten to the observed improvements;
the immutable baselines and gate matching rules are unchanged. Code Map 1.35.0,
test discovery, effect documentation, and first-party/public inventories track
the new owners and consumers.

Across the eleven changed test and fixture files, the diff adds 1,838 lines and
removes 1,603, a net increase of 235 lines for explicit ownership and regression
proofs. The smaller entry file is not a claim of equivalent total-code deletion.
Final-scope calibrated coverage passes at 90.50 percent on the unchanged exact
engine bytes, with a clean test process and no structured-audit issues. All 39
focused fixture, syntax, architecture, policy, ownership, and drift tests pass.

Independent review found no actionable findings on exact tree
`0783327553dd19f0fe4442fd4ebc9ea0c7a8d248` against the starting checkpoint. The
reviewer independently passed all 29 affected tests without failures,
cancellations, or skips and inspected the retained characterization, assertion
comparison, failure-detection control, ownership, and stricter limits. No
correction round was needed.

All nine development stages pass on that same frozen tree, with matching initial
and final bindings and no findings. The local report is
`audit/.tmp-ai-change-loop-07833275.json`, SHA-256
`f7981bf1ffe8146f90ae600c5fabf432fc8147d1f027fe22648867b5fa8196b2`.
The final exact-byte calibrated coverage remains 90.50 percent, the differential
comparison retains all 9,300 observations, and the 5,040-operation engine workload
takes 2,478 ms within the unchanged 12,000 ms limit. Runtime payload and compiled
asset sizes remain unchanged. The same duplication scanner reports 396 overlapping
candidates across 184 units with no parse errors, down from 407; those counts are
review suggestions, not unique findings or deleted lines. This checkpoint prose
follows the verified freeze.

The broader zero-warning finish line and final R0 comparison remain open. The
next batch addresses saved-state schemas, migrations, and related boundary tests.
Draft preparation during verification did not alter the frozen candidate. This
is development work, not release certification.

### Native engine contract batch — 2026-09-05 (development checkpoint)

This batch starts from staged checkpoint
`7672e409007e21deac6b2ef595f91675f43eb271`, whose source and policy bytes match
qualified tree `0783327553dd19f0fe4442fd4ebc9ea0c7a8d248`. It completes lint cleanup
in the native engine test entry while preserving the runtime engine, browser
presentation, offline shell, independent mathematical expectations, and dependency
set. Live lint falls from 346 to 318 warnings with zero errors; the native entry
has no lint warnings and falls from 3,127 to 747 physical lines.

Seven domain modules own generator contracts, answering APIs, progression APIs,
saved-state setup and phases, root schemas and migration, saved UI/question
schemas, and persistence boundaries. Ordered step lists retain private fixture
contexts and exact test sequencing. Repeated retired-session assertions share
postconditions while retaining each source snapshot's independent expected
progress and history. Eight capstone/re-teach question constructors share one
bounded request builder in the existing session fixture owner. The generator
matrix uses one independent structured-method lookup instead of allocating the
same list for every generated response; its complete case matrix is retained.

The seven-module layout consolidates eighteen provisional files without changing
any of their 550 function bodies; every new file is below the strict 600-line
limit. Those provisional paths were never part of a qualified checkpoint. The
ten final test/fixture paths add 2,886 lines and remove 2,418, a net increase of
468 lines. The smaller entry file and reduced repeated work are not a claim of
equivalent total-code deletion.

The ordered predecessor comparison passes after consolidation: 421,765 captured
assertion outcomes, expected values and messages; 92,388 public question-generation
requests; and 420 child-test dispatches match without sampling. It includes the
entire representation/world matrix across all nine refactored parent tests. The
local report is `audit/.tmp-save-contract-draft/native-contract-equivalence-final.json`.
Its matching ordered assertion SHA-256 is
`9ca75cc83647d84c679ce28144cfad7ce9ad58974d3c8cca3639d8f8f4b514c1`,
request SHA-256 is
`94a137ae1c120ed5b4a580e721be6f8b18b2130b38570cc15de5c7af5361f5d4`,
and child-test SHA-256 is
`58e911f6a44b274713714c5bdd8679bdeae3e90fae6fa9f44e1e885533a07802`.
Independent review identified that this original interceptor covered seven
assertion methods but omitted `doesNotMatch`. Its one executed observation remains
in both implementations. The original report is retained with that limitation
explicitly annotated; it is not an all-method assertion count. A bounded replay
of the eight non-matrix parent groups includes every statically used assertion
method and preserves all 1,519 assertion records, 16,266 generation requests, and
420 child dispatches. The reviewer independently performed the same additional
check. Its report is
`audit/.tmp-save-contract-draft/native-contract-equivalence-nonmatrix-complete.json`,
with matching assertion SHA-256
`d9a9ce59983bbf05548babc5f6977dfb49930917e00dc121c12ecbdfe1285118`.
The separately retained complete matrix uses only already-intercepted methods
and was not repeated for this evidence correction. Combined coverage of assertion
observations is 421,766; no single all-method whole-suite hash is claimed.
The earlier response/session-prefix comparison also retains all 1,268 assertion
outcomes after checkpoint-constructor reuse. Final-layout calibrated coverage
passes at 90.50 percent on exact engine bytes, with all 667 native tests passing
and no timeout, skip, or structured-audit issue. All 39 focused structural checks
pass. The same duplication scanner reports 396 overlapping candidates across 191
units with no parse errors; this batch leaves that candidate count unchanged.

Code Map 1.36.0, direct and context-mediated consumer relationships, effect
documentation, and first-party/public inventories describe the seven final owners.
Lint, function-quality, and source-size ratchets tighten to the observed reductions;
no immutable baseline, rule, or acceptance scope changes. Independent review found
no actionable code findings on tree `236d054cfd2a91b24df7d38e2944b4a08f4f1ec2`
against the starting checkpoint. The same reviewer verified the evidence-only
correction on exact tree `055e902b485439c79b72d614341ce7448a86d5dd`, with no further
findings or test reruns. That bounded review cycle is complete.

All nine development stages pass on that corrected frozen tree, with matching
initial and final bindings and no findings. The local report is
`audit/.tmp-ai-change-loop-055e902b.json`, SHA-256
`394d8dcacb1547febc00188a00aad0d578d08e93b63741b5b6cd0308f39ef7f7`.
It retains final exact-byte calibrated engine coverage of 90.50 percent and all
9,300 differential observations. This checkpoint prose follows the verified
freeze. The next coherent target is the browser-audit helper's remaining
complexity and redundant setup, with its existing mathematical and rendered
geometry checks preserved.
The overall zero-warning finish line and final R0 audit remain open.

### Visual-audit refactor checkpoint: full development loop passed

The browser audit now uses real ES-module scope and five small mathematical
modules for value parsing, arithmetic, geometry, money, and descriptor dispatch.
The existing seven-key frozen browser API is preserved. Named workflow stages
own frame setup, placement, lab controls, responsive layouts, feedback, and
practice-token journeys; one explicit session object owns the live frame,
document, window, write counter, and storage instrumentation. Shared font,
control, focus, viewport, and row checks retain their original thresholds.

The owner clarified on 2026-09-05 that preserved functionality does not require
retaining unsuitable structures or open-source choices. Architecture and
implementation choices remain open to improvement within the behavioral and
quality contracts. This batch adds no dependency and leaves the exact game
engine bytes unchanged at
`d6226be2ac4a5702266253949a00857efef0a3ea4692fd66eb538f4d245ac9d1`.

All 55 live warnings in `audit/approved-visual-regression.js` are resolved;
the project inventory drops from 318 to 263, with zero lint errors. The full
function-quality check passes, including every new or changed helper. Four
Promise executors receive meaningful names because extraction changed their
anonymous ordinal identities; comparison with their actual predecessors shows
unchanged metrics. No gate matcher or immutable baseline is weakened.

The audit server now consumes the existing Playwright runtime-route inventory.
This removes a duplicate list and fixes its omission of the already-shipped
progress-source and PWA-status scripts. Native checks independently require the
scripts referenced by the entry pages to be served and verify JavaScript MIME
types for both `.js` and `.mjs` files. Historical art-migration request and
binding inventories remain immutable.

Focused verification passes 90 native tests. The original 806-question plan,
130 semantic witnesses, and 4,758 malformed-model cases preserve all 13,699
comparisons. Separate comparisons retain every placement journey and catalogue
witness, all 30 pre-DOM result records and their engine-call sequence, 12
lifecycle failure cases, 70 rendered snapshot cases, and 14 complete or defective
viewport-report cases. The local ignored evidence is under
`audit/.tmp-visual-refactor/`. These are bounded development observations.

The complete visual shard passes all 36 results with unchanged source bindings,
no unexpected requests, and normal browser cleanup. Its local report is
`audit/.tmp-visual-refactor/visual-shard-final-source.json`, SHA-256
`f6ca70c6301d088f90f5aad4ed6b0870bd311e65bd01a1f6e064d6c3cf106813`.
The earlier run had the same passing functional results but remains a failure
because the focused invocation omitted required executable identity metadata;
the successful rerun supplies the independently observed Edge product, version,
and executable hash. Local evidence is not publication certification.

This is a structural and assurance improvement, not an aggregate source-size
reduction. Browser-audit source grows from 11,546 to 12,338 physical lines and
610,459 to 641,248 bytes across the page and modules. The audit server shrinks
by nine lines and 96 bytes; affected native contracts grow by 70 lines and
3,745 bytes. Existing production-budget measurements remain unchanged except
for the audit page's 42-byte reduction to a 2,701,427-byte payload. Lint,
function-quality, file-size, and payload ratchets tighten accordingly.

Code Map 1.37.0 and the first-party/public inventories describe the new owners
and dependency edges. The focused quality gate and architecture gate pass;
seven ownership-map tests pass, with zero unused files, dependencies, exports,
duplicate-export groups, Markdown findings, or CSS findings. The focused quality
run uses the previous exact-engine 90.50 percent coverage observation; the full
loop will recalculate it.

Independent review of staged tree
`2439f3aca4a93686b942caa74239ada00554170d` found no actionable findings. The
reviewer independently passed 57 native tests and matched 74,264 bounded
observations, including 35,520 nested-field model mutations across 130 semantic
witnesses. These compare decisions, details, and exception classes; they do not
claim an exception-message comparison or universal equivalence. The reviewer
verified the existing final visual report and its source bindings without
rerunning the browser suite. No correction round was needed. This documentation
successor recorded that completed review before qualification.

The complete nine-stage development loop passes for frozen staged tree
`7b6a362e829daafaa2ae3e929f35818e65200391`. Its ignored local report is
`audit/.tmp-ai-change-loop-7b6a362e.json`, SHA-256
`c9838862672fddd39a737c4dd91614f41d69dbfe7b57724f1069ea89a2b3ac8d`.
Initial and final source, policy, dependency-lock, and reviewed-runtime bindings
match exactly, with no unstaged or nonignored untracked candidate files. Engine
coverage is recalculated and calibrated at 90.50 percent. The performance stage
passes all 5,040 scenario operations and the 2,701,427-byte payload ceiling;
elapsed time remains contextual on the shared drive. This post-pass record is a
documentation successor, not a claim that a different tree was qualified.

The visual-audit batch is complete. The next bounded scope is repeated release
payload hashing and public-candidate validation, with independent exact-error
comparisons prepared outside the qualified candidate. The overall zero-warning
finish line and final R0 comparison remain open.

### Release-checker refactor checkpoint: full development loop passed

The next batch starts from documentation successor
`b0cd900e5929e1eeda63f638f470d0b6662f2a37`. The public-candidate guard and
committed-evidence observer now share canonical SHA-256 and Git tree hashing
through `audit/lib/public-payload.mjs`. Each caller retains its existing
clearance exclusion, merged-stage checks, ordering, and error messages. The
guard's independent known Git tree calibration and path/mode/blob controls
remain active. Existing Git-observer tests still operate on real repositories.

Public-register validation now has named stages for reviewed evidence,
first-party paths, bundled components, source references, workflow actions,
tool identities, prohibited sources, and complete path classifications. Shared
component-ID and local-evidence checks preserve their original order. Font and
PNG metadata validation separates bounded parsing from privacy findings. The
exact twelve non-Node tool records are compiled once in
`audit/lib/public-toolchain-records.mjs`; every inspection still compares every
field. All seventeen original licence mutation controls remain active.

The three sorted-inventory checks now sort once per list. On the same current
326-path inputs, complete validation falls from 714 sort calls to 103, saving
611 operations with identical empty findings. This is an operation-count
observation; no wall-time improvement is claimed on the shared drive.

Focused checks pass 24 publication/policy tests and 40 ownership/orchestration
tests. The actual staged public-candidate guard passes, including its existing
negative controls. The quality gate reports zero errors and 240 live warnings,
down from 263: all 22 guard warnings and one duplicated-hashing warning are
resolved. Knip, Markdown, and CSS findings remain zero. All new or materially
changed functions meet the strict limits; native legacy ceilings tighten to
120/176/77/68/7 for cyclomatic/ABC/cognitive/length/nesting violations. Immutable
baselines and check thresholds remain unchanged.

Local ignored comparisons under `audit/.tmp-release-refactor/` retain 1,332
payload observations, 5,765 ordered register outcomes across 818 mutated paths,
and 10,203 binary/privacy outcomes. Register and payload comparisons include
exact exception names and messages. Final-source lineage verifies that the
characterized validator bodies differ only in the final module locations and
standard case-table dispatch; a separate comparison executes all seventeen
actual mutation labels and expected patterns in their original order. The
dispatch correction also preserves the original runner's cyclomatic complexity
of one.

The guard shrinks from 1,309 to 1,250 lines and the successor observer from 333
to 289. Including the two shared modules, affected source grows from 1,642 to
1,819 lines and 94,597 to 97,790 bytes. This removes duplicated algorithms and
repeated construction/sorting, but is not an aggregate source-size reduction.
Game, asset, and existing shipped-payload measurements remain unchanged. Code
Map 1.38.0 and the 326-path public inventory describe the new ownership.

Independent review of frozen staged tree
`119e96fa595edf04fc3123d6740248e07038f8bd` found no actionable findings. The
reviewer independently passed 24 native tests and preserved 5,779 ordered
outcomes across 820 mutated paths using the final source and current inventory.
It also independently reconstructed both callers' Git payload identities and
verified the characterized binary-validator source by its exact hash lineage.
The earlier focused guard report preceded the documentation freeze; it remains
retained with its original payload identity. The exact reviewed-candidate guard
run passes in `audit/.tmp-release-refactor/public-guard-119e96.txt`, SHA-256
`2303ddaba8a8e69ace76a192c1df0e79a70dda556a059acc38f9f950c66493a7`.
Its payload SHA-256
`bf39235d25233a379ada8b4f97e205042e2d2060e006148c6364089afe03ea6c`
and Git tree `fe33ac9f63737b92c1054c67d57feb28c98ba157` match the reviewer's
independent calculation. No code correction round was needed. This documentation
successor recorded the completed bounded review before qualification.

All nine development stages pass for frozen staged tree
`3d0b2a979dbd3a2ae9ac5e2150fbe87d0573a976`. The ignored local report is
`audit/.tmp-ai-change-loop-3d0b2a97-resumed.json`, SHA-256
`2a2b88f6695dd1c661ce792874984dc6a88d1e5394168eda81021b2477f07fa0`.
Initial and final candidate bindings match; calibrated engine coverage remains
90.50 percent, all 9,300 differential observations pass, and the performance
stage passes 5,040 operations with the unchanged 2,701,427-byte payload.

The first attempt was interrupted during its test stage and left an empty
report. It remains incomplete, not a pass. After the owner's explicit
continuation, process inspection confirmed that no audit process remained and
the candidate was unchanged; the successful resumed attempt ran every stage
from the beginning. The interruption record and empty report remain retained
under `audit/.tmp-release-refactor/` and the original loop-report path.

This post-pass record is a documentation successor, not qualification of a
different tree. The release-checker batch is complete. The next bounded scope
is duplicated structured-response input fixtures, preserving caller-specific
fraction, clock, strategy, and route behavior and the separate semantic
mathematical checks. Zero live warnings and the final R0 comparison remain
open.

### Shared response-fixture checkpoint: full development loop passed

This batch starts from documentation successor
`4aa9db7a2cd7fbf243be18888c1ed0f8bf07a4df`. The native core and semantic suites
now share 22 identical response-state construction branches through
`audit/lib/shared-response-fixtures.mjs`. State creation and serialization still
belong to each caller. Fraction, clock, strategy, and route behavior remains
caller-specific, including their distinct failure messages and the core route
trace versus semantic coordinate parsing. No mutable question or response is
cached. Sorting input construction and incorrect-submission transforms share
the existing exhaustive fixture implementation in
`audit/lib/sort-response-fixtures.mjs`. The semantic model validator retains its
separate normalization, property, and classification oracle.

The core's complete 43-check body and the independent semantic math, model, and
facet checks remain byte-identical. Local ignored comparisons under
`audit/.tmp-math-suite-refactor/` preserve 7,945 sorting outcomes and 2,494
response outcomes across all 26 structured methods, including exact exceptions,
ordered outgoing engine arguments, and unchanged input questions. The response
comparison generates 2,520 questions and includes malformed fraction, clock,
route, and unsupported-method cases.

Moving the helpers exposed a long semantic sampler whose legacy match depended
on its old line position: its unchanged 43-line body had ABC 61.3. The sampler
is now separated into question validation, collection, task/strategy coverage,
and aggregation helpers. All satisfy the strict function limits; no matcher or
immutable baseline changes. Full before/after comparisons retain all 130 checks,
6,048 questions, and 124,533 ordered assertion outcomes/messages in the normal
run. Three controlled failure comparisons preserve the same failed check,
first-line message, continued later checks, and partial question counts. Stack
frames are excluded because source locations changed.

Focused verification passes seven affected core checks, all 130 semantic checks,
17 native exhaustive-fixture checks, and seven ownership checks. The full
function-quality and focused quality gates pass. Live warnings fall from 240
to 233, with zero errors and zero Knip, CSS, or Markdown findings. Native
function ceilings tighten to 117/173/75/66/7; inline and PowerShell ceilings
remain unchanged. The focused coverage input is the previous exact-engine
90.50 percent observation and will be recalculated by the complete loop.

Across the five affected source files, physical source falls from 4,198 to
4,067 lines and from 260,570 to 253,908 bytes: 131 lines and 6,662 bytes removed.
Game, asset, and shipped-payload bytes remain unchanged. Code Map 1.39.0 and the
328-path public inventory describe the shared owners and preserved independent
checks.

Independent review of staged tree
`f417f384c6b3caafcbf3907cece1b6a8696d34e5` found no actionable findings. The
reviewer verified ten byte-identical oracle functions, passed all 130 semantic
checks and seven native fixture tests, and checked 52 caller/method combinations
for equal repeated responses, fresh object ownership, and unchanged input
questions across all 26 methods. No correction round was needed. This
documentation successor recorded the completed review before qualification.

All nine development stages pass for frozen tree
`395e07b8994110c7fee3f294a9812070a8e3fdc9`; initial and final bindings match.
Report: `audit/.tmp-ai-change-loop-395e07b8.json`, SHA-256
`b95799791b7014ec22a94a833a3be52d74779242795c3c5e2d5d8a2f4240f074`.
Coverage remains 90.50 percent; all 9,300 differential observations and 5,040
performance operations pass. This post-pass documentation successor does not
qualify a different tree. The batch is complete; 233 live warnings and the final
R0 comparison remain open.

The owner adopted a more efficient workflow: larger coherent batches, existing
tests as primary evidence, additional comparisons only for meaningful coverage
gaps, focused reads and concise reports, and one completed checkpoint per batch.
Required gates, coverage, independent review, and behavioral safeguards remain
unchanged. The next consolidated scope is release-evidence validation.

### Release-evidence validation checkpoint: full development loop passed

Starting from `3bf9fc3cb9958b288153ce30be3a763e2af7233f`, this consolidated
batch separates the clearance contract, ordered record parser, and successor
policy into explicitly owned modules. One verified 50-field mapping supplies
record order and public projection. Shared optional-cycle rules retain their
exact messages and reject an internal emergency selector outside emergency
approval. Smaller evaluation steps retain identity, expiry, historical waiver,
optional-cycle, and release-readiness distinctions. Binding-field selection
replaces repeated full field maps; bundle validity is computed once.

Bundle and successor validation reuse the same beta-policy selection. Shared
successor identity, pending-authority, and Git-revision checks preserve the
existing public interfaces. Separating the policy dependencies allows a static
record-parser import in place of the former dynamic import. A regression closes the
malformed-canary gap: JSON `null` now returns invalid evidence rather than
throwing during field access. No malformed record becomes release-ready.

All 30 publication/bundle regression tests pass, along with seven ownership
tests, the architecture check, full function-quality check, and focused quality
gate. Live warnings decrease from 233 to 215; lint errors, Knip, CSS, and
Markdown findings remain zero. Native violation ceilings tighten to
104/164/69/63/7. The six affected native modules all fit the 600-line cap and
their functions meet the strict limits. Their combined source grows from
1,317 to 1,539 lines and 70,225 to 79,687 bytes; this is a structural/reuse and
robustness improvement, not an aggregate source-size reduction.

Code Map 1.40.0 and the 331-path inventory record the new owners. Game and asset
bytes are unchanged. Focused reports are under
`audit/.tmp-release-validation/`; their coverage input is the previous exact-
engine 90.50 percent observation. Independent review of frozen tree
`e084bc20414033298c7c4806241eb71a8abd8eec` found no actionable findings. The
reviewer passed 30 focused tests and 52 targeted field/default comparisons,
verified unchanged publication export names, and inspected the release
safeguards and intentional null-record fix. No correction round was needed.
This documentation successor recorded review clearance before qualification.

All nine stages pass for frozen tree
`752ff33278506801058e6863dc07cb3b78bb68a3`; candidate bindings stayed unchanged.
Report: `audit/.tmp-ai-change-loop-752ff332.json`, SHA-256
`0dff6137241c6292f3f76ed6afc384e7c3e50292c881742b200a8a04b1225503`.
Calibrated coverage remains 90.50 percent; 9,300 differential observations and
5,040 performance operations pass. This post-pass record does not qualify a
different tree. The batch is complete; 215 live warnings and the final R0
comparison remain open. The next substantial scope is semantic validation,
preserving overlapping curriculum checks and independent mathematical oracles.

### Semantic-validation checkpoint: full development loop passed

Starting from `00b1844c50427e25c679cdb8b5daa5a24f6915e4`, the semantic suite
now delegates independent model truth, mathematical rules, supplemental input
facets, curriculum facets, mastery scenarios, and persistence scenarios to six
explicitly owned modules. Supplemental and curriculum checks still both run for
overlapping skills. Mathematical expressions, answer-disclosure checks, ordered
mastery evidence, hostile import rejection, and partial-failure reporting remain
protected by the original assertions. Code Map 1.41.0 and the 337-path inventory
record these owners and relationships.

All 130 semantic checks pass over 126 skills, 166 task types, and 6,048 questions.
The 465 affected functions meet every strict function limit; all seven source
files lint clean. The 17 focused driftless tests, 12 blast-radius controls, and
architecture gate pass. Live warnings decrease from 215 to 193. Downward native
function ceilings become 94/157/66/57/7, and the runner's source ceiling tightens
from 1,609 to 510 lines. The seven files together grow from 1,609 to 1,992 lines
and 117,892 to 129,747 bytes; this is a structural clarity improvement, not an
aggregate source-size reduction. Game engine bytes remain unchanged.

Independent review of `3619754ddc7c5b0784421cb0beaae1e2b321a620` found no
actionable findings. It reran the semantic suite and strict census, inspected
the independent oracles and persistence/mastery safeguards, and preserved
return/error behavior and ordered assertions in 34 targeted predecessor
comparisons covering unknown/prototype identifiers, aliases, malformed models,
and overlapping facets. These review probes are bounded evidence, not new
checked-in regression coverage. No correction round was required.

Focused reports are under `audit/.tmp-semantic-validation/`. The initial quality
and function reports correctly failed on stale downward ratchets. The quality
policy successor passes against the unchanged source measurements; its 90.50
percent coverage input remains the preceding exact-engine observation. The full
nine-stage development loop subsequently passed for frozen tree
`adfe3a3bfbbe06bb28d40bdc9967c85f19cdcbcb`, with unchanged initial/final
candidate bindings and recalculated calibrated coverage of 90.50 percent.
Report: `audit/.tmp-ai-change-loop-adfe3a3b.json`, SHA-256
`38b5ae11e2c334cf4cd3ee7fd3fb7897a9ddb2352f61dfaf1f9c3221fee006d5`.
This post-pass documentation successor does not qualify a different tree.
The batch is complete; 193 live warnings and the final R0 comparison remain
open. The next consolidated scope is native engine tests, independent strategy
oracles, engine loading, and coverage validation.

### Native engine audit checkpoint: full development loop passed

Starting from `4952335cf3c066a4b8aeb4ed4e84b2d7093cb864`, this batch preserves
the 43 engine result identities through ordered core, learning, and boundary
registries. Dedicated modules retain input, transactional import, Free Play,
placement recovery/migration, and exhaustive placement-route assertions. The
runner retains setup failures, filtering, and reporting. Independent strategy
oracles, ambient-reference scanning, coverage calibration, exact-byte binding,
structured-report rejection, range aggregation, and process outcomes are
decomposed without changing their acceptance criteria.

All 28 targeted lint warnings are removed; 165 live warnings remain. The
runner shrinks from 2,018 to 407 lines. The 14 affected native files together
grow from 2,839 to 3,463 lines and 156,239 to 177,763 bytes; this is a structural
clarity improvement rather than aggregate source-size reduction. Native
function violation ceilings tighten to 82/138/57/50/6. Quality, full function,
architecture, 17 focused drift tests, and 12 blast-radius controls pass. Code
Map 1.42.0 and the 346-path inventory register the owners; the Feature Map's
BEH-07 proof selector points to its new core-check owner.

All 43 engine checks pass together. Instrumented coverage passes at 90.50
percent with exact engine bytes and valid structured evidence. An earlier
coverage attempt timed out at the unchanged 225,000 ms limit and reported
unverified cleanup after Windows denied task termination. Its failed report is
retained; elevated process inspection found no matching test left running.
The later run followed substantive completed source changes in the execution
context that permits cleanup. No timeout, threshold, or failure was weakened.
Focused reports are under `audit/.tmp-semantic-validation/next-*`.

Independent review of `217ec6f8cebacd133e52da0de5c2610ab2dfb06a` found no
actionable findings across all 22 changed files. All 43 registry IDs, titles,
effects, options, and ordering match the predecessor. Five filter/setup probes,
36 focused native tests, 169 scanner comparisons, and 20 malformed-report
comparisons pass. These comparisons are bounded; diagnostic comparisons exclude
stack locations and timing. No correction round was required.

All nine development stages pass for frozen tree
`5f1dbc0a1992d46cf613fabe5bc44625e1572889`, with unchanged initial/final
candidate bindings. Calibrated coverage remains 90.50 percent; 9,300
differential observations and 5,040 performance operations pass.
Report: `audit/.tmp-ai-change-loop-5f1dbc0a.json`, SHA-256
`e64a69bf18dfdbfb7bfb383bc6bc676bdbf3719d3efa9dac9cf06570062d0423`.
This post-pass documentation successor does not qualify a different tree.
The batch is complete; 165 live warnings and the final R0 assessment remain
open. The next consolidated scope is audit orchestration: process supervision,
lane/result validation, and report generation.

### Audit orchestration checkpoint: full development loop passed; owner paused

Starting from `2d7ca4d9a8924fd59245c460eb8b855cf70a1ad1`, this batch separates
closed lane contracts, process supervision, canonical evidence comparison,
publication reporting, and Markdown presentation into explicit modules. The
top-level audit retains phase order, fail-closed report assembly, and its
existing output destinations. Serial and bounded scheduling retain exclusive
barriers, concurrency limits, result order, and withholding after unverified
coverage cleanup. Process timeout/output precedence and cleanup verification,
canonical evidence exclusions, publication decisions, and non-pass meanings
remain unchanged. A shared count-row renderer removes repeated formatting.

All 22 targeted lint warnings are removed; 143 live warnings remain. Native
function violation ceilings tighten to 67/129/50/46/6. Quality, full function,
architecture, 17 drift tests, and 12 blast-radius controls pass. The initial
function gate caught an enlarged source-inspection test; a focused helper
retains its seven checks and adds two report-import wiring assertions. Code Map
1.43.0 and the 352-path inventory record the six new owners. The 11 affected
native/test files grow from 2,905 to 3,339 lines and 155,463 to 172,980 bytes;
this is a structural improvement, not an aggregate source-size reduction.
Game, service-worker, and asset bytes are unchanged.

The combined 71-test regression suite passes, as do 39 focused correction and
ownership checks. Twelve synthetic formatter comparisons preserve exact
Markdown bytes for both report titles and mixed outcomes. Focused reports are
under `audit/.tmp-orchestration/`; the quality report uses the preceding
qualified identical-engine 90.50 percent coverage observation, pending fresh
measurement by the full loop.

Independent review of `14d2c4623596cc1b82fa304ad90a712f3d1dc957` found no
actionable findings across all 18 changed files. It reran 71 focused tests,
preserved phase order, failure propagation, report values, and JSON/Markdown
bytes in six controlled top-level probes, and verified the lane library's
existing exports (13) and shared bindings. These probes are bounded assurance;
report writes stayed in memory, and existing reports were untouched.

The first frozen development run, `7c5114bb5f107de2b1bd9031750126e9e5c9dd9a`,
passed compiler and architecture checks but failed at tests: the release-bundle
consumer test still searched the old runner for the unchanged `releaseReady`
safeguard. The failed report is retained at
`audit/.tmp-ai-change-loop-7c5114bb.json`, SHA-256
`08cf86e1fb4aa30ffe92f11dd7f9118874cefe017a85c27de550576698967aad`.
The test now reads `audit/lib/audit-publication-report.mjs`, with all three
assertions unchanged, and the Code Map registers it as that owner's validator.
The same reviewer verified correction candidate
`2e8828f8d775d8dbf918ee8daf0fad4642b33131`: 16 focused tests and nine wiring
assertions pass; no gate was weakened. All 17 drift checks also pass.

The next attempt, `0141762fd9368f114d8f7ed4638c64ecaf158da0`, stopped at the
public-candidate guard because an export-count sentence resembled an address.
The sentence was clarified without changing its facts or the privacy rule.
That failed report remains at `audit/.tmp-ai-change-loop-0141762f.json`, SHA-256
`36db2ef75dc97923e0c934af9a6c54ed2a30d8dc58a6dc7e1eb4e0a1fdd8afc7`.
The corrected public-candidate guard and its negative control passed.

All nine development stages subsequently passed for frozen tree
`e1b21aa3ee3de3ed1344d07b77cf9652872fcb45`, with unchanged initial/final
candidate bindings and calibrated coverage of 90.50 percent. Report:
`audit/.tmp-ai-change-loop-e1b21aa3.json`, SHA-256
`caef75a1342c3b01c467b940e30d400890ab1b972ec19bf1a1e02e281dc5a360`.
This post-pass documentation successor does not qualify a different tree.

The owner requested a safe pause after this checkpoint because usage limits
were approaching. Validation has finished; no audit process remains active.
All changes remain uncommitted. Resume only when the owner requests it.
The remaining target is unchanged: 143 live warnings, remaining justified
redundancy work, and the final R0 completion assessment. Browser journey and
related audit warning clusters remain available for the next coherent batch.

### Resumed browser journey refactor — 2026-09-07

The owner explicitly resumed work. The focused browser suite now delegates
DOM observations, tutorial observations, assisted learning, parent-lab flow,
design-token observations, and functional-art flow to six owned modules.
All 18 case identities and both browser profiles remain. Shared viewports,
early-learning saved-state setup, confirmation behavior, and snapshot defaults
replace repeated setup while retaining the independent expected answers and
geometry assertions. Four temporary DOM negative controls and six helper-byte
digest controls protect the extracted boundaries; the native-action source
guard now reads every extracted module.

The diagnostic old/new browser snapshot comparison found no mismatches, but
its first run failed on desktop shell-test context teardown after all seven
shell comparisons completed: 35 cases passed and one failed. The failed report
is retained at `D:/CodexTemp/browser-refactor-equivalence-first.json`.
The subsequent clean candidate passed all 36 journeys, recorded at
`D:/CodexTemp/browser-refactor-clean-focused.json`. Saved-state projections
matched in 84 diagnostic cases, seeded state matched in two cases, and pattern
plan results or errors matched in 100 cases. The pattern reader subsequently
received an explicit browser execution boundary and retained atomic storage
and grading; its final 100-case comparison passed. Final candidate validation
and independent review remain required before this slice advances.

The global lint census has zero errors and 121 live warnings, down from 143.
Measured JavaScript legacy function ceilings tightened from
67/129/50/46/6 to 58/113/45/36/6 for cyclomatic complexity, ABC magnitude,
cognitive complexity, function lines, and nesting respectively. The focused
ownership, blast-radius, feature-map, and browser-contract checks passed
37 tests. This progress record does not claim completion or a new full-loop
pass; the full refactor finish line and final R0 assessment remain outstanding.

Independent read-only review of staged tree
`cce550b09860ccb0716482ec87d1b2612b459083` found no actionable issues in this
batch. The final browser run passed all 36 cases; its report is retained at
`D:/CodexTemp/browser-refactor-final-focused.json`. Coverage passed at
90.50 percent. The quality run required tightening the main browser spec's
line ceiling from 1530 to its measured 426 lines; no other quality finding
remained. This bookkeeping correction and review record form a successor
candidate, which still requires the complete nine-stage loop.

The loop for `d51bddf10f3f0cdf20cbdd96d1e9364379e88752` passed its first six
stages, then failed at security because Semgrep could not open the Windows
certificate store during startup. The last two stages did not run. The failed
report remains at `audit/.tmp-ai-change-loop-d51bddf1.json`, SHA-256
`df31069ae3e4c31dd5da8f379c1130bf0b78ebc9378c2c97b0294f47d5bde0c9`.
A bounded diagnostic reproduced the same certificate-store failure. With
host access, the unchanged reviewed Semgrep executable scanned all 765 planned
targets with zero findings and zero scan errors; the result is retained at
`D:/CodexTemp/browser-refactor-semgrep-host-summary.json`. No scanner rule,
TLS verification, or acceptance criterion changed. This environment correction
requires a new complete loop; the failed attempt is not treated as a pass.

All nine stages passed for frozen tree
`8b32e7440a810640a6e624e524f5c8d8fa5944cf`, with no findings, calibrated
coverage of 90.50 percent, and identical initial/final candidate bindings.
Report: `audit/.tmp-ai-change-loop-8b32e744.json`, SHA-256
`2b1430274e723b1862889f21b2c9d26ebb832932053ea4264261fcaadf1ac2e4`.
The browser-journey slice may advance. This documentation successor joins the
next coherent art-validation batch; the overall zero-warning and redundancy
finish line remains open.

### Art-validation refactor — 2026-09-08

Art governance now validates decision links, token contrast, construction
evidence, exact file hashes, rights, and acceptance states in ordered domain
functions. Shared decision indexes and evidence collection remove repeated
work. Historical source reconstruction moves to the sole-owned
`audit/lib/art-migration-source.mjs`; baseline validation retains its public
exports and immutable evidence. Code Map 1.45.0, development-suite routing,
rights declarations, and generated inventory accompany that boundary.

The six original target files have zero lint findings. The repository census
falls from 121 to 96 live warnings, with zero errors; its warning ceilings and
JavaScript function ceilings tighten to the observed values. The latter move
from 58/113/45/36/6 to 42/99/32/31/6 for cyclomatic complexity, ABC magnitude,
cognitive complexity, function lines, and nesting respectively.
All 65 focused art, ownership, dependency, feature, and routing checks pass.
Original-versus-candidate comparisons preserve 37 governance issue arrays,
21 token-projection issue arrays, 88 question-shell oracle results, and the
tested historical baseline observations and validation results. Historical
observations are compared as exact serialized values because separate engine
VMs also give repeated original runs distinct array prototypes.
Independent review and the complete frozen-tree loop remain required before
this batch advances. The overall refactor acceptance criteria remain open.

The independent review found no actionable findings on staged tree
`d735063f55c359a2dfb58a52a886566bf94aab4a`. All nine AI-change stages then passed
with no findings and identical initial/final candidate bindings. Report:
`audit/.tmp-ai-change-loop-d735063f.json`, SHA-256
`3ad05666535fbb3decc549fff00c0e8cea31aaff1462e66762e5b4424cb16f97`.

### Drift-validator refactor — 2026-09-08

Child-string, curriculum, feature, tutorial, and repository-map validation now
use ordered helpers for their governed records. Three identical duplicate
detectors share one collection utility. Blast-radius dependency membership
uses sets, and its scan, graph traversal, and report construction have separate
functions. Code Map 1.46.0 records the new ownership and dependency edges;
focused routing, rights bindings, and generated inventories follow them.

All 50 focused tests, 18 curriculum boundary controls plus their parent test,
and 12 blast self-controls pass. Exact predecessor comparisons cover 543
curriculum mutations, 49 child-string cases, 265 feature cases, 281 tutorial
cases, 269 code-map cases, five complete blast results, and 1,152 ordered
tutorial generator calls. Five new child-string tests cover previously
untested invalid metadata and ordered-pool boundaries. Existing map assertions
are grouped by their protected contract without removing any assertion.

The repository has zero lint errors and 76 live warnings, down from 96.
Warning ceilings tighten to 36 complexity, 6 depth, 23 function-line, and 11
statement warnings. Native JavaScript function ceilings tighten to
36/92/26/26/4 for cyclomatic complexity, ABC magnitude, cognitive complexity,
function lines, and nesting. Independent review and the complete frozen-tree
loop remain required before this batch advances. The overall zero-warning
and redundancy acceptance criteria remain open.

The independent review found no actionable findings on staged tree
`77605169f5304bdc9f4e10264d218878af7b22bd`. All nine AI-change stages passed
with no findings and identical initial/final candidate bindings. Report:
`audit/.tmp-ai-change-loop-77605169.json`, SHA-256
`4d324f005599ad3094b143b05dcb37808444df5f2403196cfbba2ac9593dc061`.

### Browser diagnostics refactor — 2026-09-08

Deep UX risk sampling and atomic DOM observations have distinct modules.
The census traverses its existing rendered states through named steps, and
interaction-fuzz validation separates action, replay, shard, and report
contracts. Code Map 1.47.0 records sole owners and typed dependencies for both
new modules. Routing, rights bindings, and the 363-path public inventory follow
them. Native browser actions and independent mathematical assertions remain.

Exact predecessor comparisons preserve four complete deterministic plans,
116 plan-validation outcomes including thrown error types and messages,
40 fuzz-validator control outcomes, 100 action descriptors, and browser
observations across 16 fixtures and three viewports: 48 geometry results,
336 candidate arrays, 48 effect snapshots, and 45 tutorial effects.
The live 100-cell benchmark passed all six viewport shards before the final
named-capture extraction; the browser comparisons also passed after that
extraction. The final interaction-fuzz diagnostic passed both profiles with
184 seeded native actions. Both browser diagnostics are non-certifying.

All 47 final focused census, lifecycle, rights, and routing tests pass, along
with the ten interaction-fuzz controls and the ownership-map checks. The
rights negative control now independently mutates all eight extracted browser
helper paths. Existing census native-action, geometry, tutorial, and forbidden-
artifact checks scan both the spec and its imported observation module.

There are zero lint errors and 50 live warnings, down from 76. Warning ceilings
tighten to 18 complexity, 4 depth, 19 function-line, and 9 statement warnings.
Native JavaScript function ceilings tighten to 18/82/17/22/3 for cyclomatic
complexity, ABC magnitude, cognitive complexity, function lines, and nesting.
Independent review and the complete frozen-tree loop remain required before
this batch advances. The overall zero-warning and redundancy acceptance
criteria remain open.

The browser-diagnostics batch passed all nine AI-change stages on staged tree
`85239da0f23de76c8bd66ff4b2b893c6c2814c77`, with no findings and identical
initial/final source bindings. Report: `audit/.tmp-ai-change-loop-85239da0.json`,
SHA-256 `433eca622cd22a73807ffcc27c819608c2c5022d3b9f7ab8d50cbf6aa78c7cdd`.

### Release-evidence validator refactor — 2026-09-08

Canary field contracts, evidence validation, and runtime observations have
separate owners. The original public exports, ordered findings, serialized
evidence, and sequential cache observations remain equivalent. Browser-runner,
hosted-Windows, gate-integrity, and GitHub-enforcement validation now use
bounded domain helpers. The test evidence fixture remains independent of the
production builder; rights-input mutation fixtures are shared by two suites.
Code Map 1.48.0, routing, rights inputs, and the 367-path public inventory bind
all four new modules.

Predecessor comparisons passed 1,122 validator cases, 4,886 canary parser
outcomes including exception types/messages, all 51 public exports and their
constant values, 108 TLS cases, 96 root-scope cases, 632 backend privacy cases,
and 14 sequential cache traces. All 111 integrated focused tests passed.
The canary rights negative control independently mutates both new production
modules and requires each mutation to affect the rights digest.

The first focused quality report failed: 5,040 engine scenarios took 14,796 ms
against the unchanged 12,000 ms limit while compiler, function-quality, and
governance checks ran concurrently. The report remains a failure, SHA-256
`3389f1de487263858594c5d704c5843906ba627e51cfed92d56a2481d17d3afe`.
Engine source, loader, and measurement code are byte-identical to the passed
predecessor. One isolated diagnostic measured the same 5,040 scenarios at
2,305 ms; it is diagnostic evidence only. Correct the invocation scheduling:
run timing-sensitive quality validation alone, retain the first failure, and
require post-correction validation with the original threshold before advancing.
The exclusive post-correction quality run passed with no findings and measured
the same 5,040 scenarios at 2,609 ms. Report SHA-256:
`5dbc4f2e20cf37a83ce456e0d88832ea6e7867b28e38eebb88f344acb0f2061c`.
The independent reviewer found no actionable source findings in the 22-path
delta ending at staged tree `a19dd4caf0af80a2006f9a7a6d7dfebac79fa8ac`.
The scheduling correction changes the invocation, with no source or budget
change; the first failed result remains retained above.
The frozen run on `8ffd08eb4e88a66f15c256b22bbb6a630f01a0e2` passed its first
six stages, then failed security scanner startup; the last two stages did not
run. Its report SHA-256 is
`d1aee32691878ac438404cf20c1625a9891769f7c420fe2db4100e5b08295bc7`.
A retained diagnostic confirmed `CertOpenSystemStore returned NULL` before any
scan completed. The invocation had omitted the previously required host
certificate-store access. Correcting that boundary allowed the identical
Semgrep 1.164.0 rules to scan all 774 planned targets with zero findings and
zero errors. No TLS bypass, scanner-rule, target, or budget change was made.
The required post-correction frozen loop must use host access and the existing
approved security-tool and metadata-audit environment settings.

Live lint warnings fall from 50 to 33: 7 complexity, 3 depth, 16 function-line,
and 7 statement warnings. Native function ceilings tighten to 7/74/9/19/2
for cyclomatic complexity, ABC magnitude, cognitive complexity, function lines,
and nesting. No thresholds or independent assertions were weakened.
Independent review and the frozen nine-stage loop remain required before this
batch advances. The overall zero-warning and redundancy work remains open.

The release-evidence validator batch passed all nine AI-change stages on frozen
tree `e7cceedb9f4bf22d88fd4807d2f8e497350b7b35`, with identical initial/final
source bindings and no findings. Report: `audit/.tmp-ai-change-loop-e7cceedb.json`,
SHA-256 `fdd78c9f3ab411fae2b9e9eef8c4e79ff3742b08606eece09fedab636f1913d7`.

### Final live-warning refactor — 2026-09-08

The remaining test fixtures now own their browser, page, placement, visual,
and service-worker setup independently of the tested implementations. Scenario
helpers retain their original assertion order and independent expected values.
Comparison retained all 1,332 explicit assertions, nine exact VM preludes, and
8,640 ordered visual-question option records. The prepared suites passed 177
tests. Existing independent service-worker lifecycle assertions also passed
against the revised worker before integration.

The worker reuses its existing hexadecimal encoder and validates each manifest
entry against the closed ordered shell inventory. It rejects sparse arrays by
iterating the owned dense path list. Its runtime is 23 bytes smaller; no shipped
payload allowance increased. Shape comparison covered 2,166 cases and 65
encoder vectors. Mutation execution retains its protecting baseline, seeded
mutant, independent oracle, failure report, and cleanup sequence. Both runners
killed all 11 representative families with the same outcomes and negative
controls; comparison excludes measured durations and changed outer runner
stack frames while retaining assertion messages and protecting engine frames.

The trusted-HTTPS runner separates platform operations, an ordered sequence of
browser checks, and teardown/report assembly. Per-run observations preserve
partial-failure evidence. Comparison matched 458 report outcomes, 960 backend
request outcomes, all 127 original assertions, 18 ordered checked actions, and
six ordered cleanup callbacks. A draft controller-variable shadowing defect
was caught before integration and now has focused effect coverage. The source
guards scan the imported runner modules and reject missing modules or insecure
flags. Review caught bounded-call patterns that missed the new per-run state;
eight direct-call negative controls now cover both local and per-run references.
The bounded review and its one correction verification closed without remaining
findings. The canary remains a hosted release check; no live canary or deployment
was performed for this development refactor.

The first integrated focused run passed 299 of 300 tests and exposed a missing
hexadecimal helper in the nonce-test VM setup. Supplying the actual dependency
preserved the original independent nonce assertions. The corrected affected
suites passed all 123 tests. Function checks exposed anonymous callback identity
collisions after extraction; explicit cleanup/challenge names retain their
behavior and make those identities unambiguous. The ordered phase executor
also preserves the original main-function nesting limit. No gate was weakened.

Live ESLint errors and warnings are zero, down from 33 warnings in the previous
batch. Native JavaScript ceilings tighten from 7/74/9/19/2 to 0/59/4/3/0 for
cyclomatic complexity, ABC magnitude, cognitive complexity, function lines,
and nesting. Remaining native exceptions are pre-existing unchanged functions;
new and modified functions meet the strict limits. Code Map 1.49.0, eight new
sole-owner families, explicit import/test relationships, focused routing,
canary execution registration, rights inputs, and 376 public-inventory paths
track the nine new modules. No child mechanic, tutorial, visual treatment,
mathematical oracle, or acceptance floor changed.

The final frozen nine-stage check remains required before completion is claimed.

### Final R0 comparison and retained duplication — 2026-09-08

This assessment compares the immutable R0 census with code-complete staged tree
`57301296ee4b8c06acb849c72a5dccc5db40caac`, before this report addition.
Historical measurements were read without recapture or modification. Counts
include physical text lines, including blanks and comments; they are not a
claim about executable statements or unique semantic work.

| Category | R0 lines | Final lines | Net change |
| --- | ---: | ---: | ---: |
| Game and launcher source | 5,991 | 5,718 | -273 |
| Audit and tooling source | 32,382 | 42,521 | +10,139 |
| Tests and fixture code | 25,318 | 30,870 | +5,552 |
| Generated projections | 2,629 | 2,643 | +14 |
| Other data and configuration | 19,292 | 30,865 | +11,573 |
| Documentation and other text | 10,600 | 14,092 | +3,492 |
| Added measurement baseline JSON | 0 | 156,774 | +156,774 |
| Total | 96,212 | 283,483 | +187,271 |

The census classifies baseline records first, declared generated non-HTML
projections next, then data/configuration, tests/fixtures, game/launcher,
audit/tooling, and remaining documentation/text. Git reports 213,308 added and
26,037 deleted lines across 269 paths, matching that net increase. Excluding
three added measurement records, growth is 30,497 lines. Git's whitespace-
insensitive moved-line heuristic marks 24,190 added and 18,720 deleted source
lines as moved; copies and repeated lines prevent treating these as unique
moved LOC or subtracting them from the totals.

Growth buys native function and inline-script checks, effect-sensitive browser,
PWA and release-evidence coverage, explicit owners and dependency relations,
and maintained security/quality tooling. Thirty-two test files were added;
that is a file count, not a test-case count. The result is smaller shipped
source and clearer bounded functions, not a smaller overall repository.

Direct development dependencies increase from four at immutable R0 to twelve.
The eight additions are ESLint, Stylelint, markdownlint-cli2, Knip, Bundlewatch,
axe-core and the two explicitly pinned Windows Oxc parser/resolver bindings.
The existing dependency register owns their versions, licences and approvals.
No dependency ships with the game; offline runtime behavior remains covered.

The saved lint baseline contains 608 warnings; live ESLint now has zero errors
and zero warnings. Native JavaScript threshold-exceeding counts move from
185/260/117/126/11 to 0/59/4/3/0 for cyclomatic complexity, ABC magnitude,
cognitive complexity, function lines and nesting. Remaining grandfathered
functions retain the strict no-regression checks; modified functions meet the
strict limits. Historical measurement evidence is not relabeled as live code.
The last passing complete run measured 90.5% engine branch coverage, above the
89.33% preserved floor; final acceptance obtains fresh coverage.

CSS bytes fall from 235,645 to 234,769, measured JavaScript bytes from 1,057,930
to 1,044,905, and offline payload from 2,707,876 to 2,701,404. Compiled curriculum
bytes remain 932,443. Engine timing is machine-dependent telemetry; local
samples are not evidence of a statistically established speed improvement.
The first final quality check failed the 600-line new-module limit. Splitting
browser operations from platform operations corrected it without raising that
limit; the corrected quality report passes with no findings. The failed
report remains `D:/CodexTemp/final-warning-quality-exclusive.json`, SHA-256
`e7a3225a99f638d4c6681ffba904e014909bfce188cc816928a03b72e1f7b95a`.

Exact-token duplication inventory covers JavaScript and all executable inline
scripts, preserving identifiers/literals, using whole statement lists and
3–12-statement windows of at least 60 tokens and five physical lines. Contained
matches are suppressed. R0 has 205 raw/43 maximal groups; final has 56 raw/16
maximal groups across 250 units, with no parse failures. This detects literal
repetition, not all semantic duplication. The retained maximal groups are:

- Publication-clearance success assertions and placement restoration assertions:
  explicit scenario outcomes keep independent negative/positive cases legible.
- Publication-clearance/release-bundle pending fixtures and temporary Git
  successor setup: separate evidence scenarios retain local state and lifecycle.
- Sort fixture transforms versus exhaustive/semantic validators: these protect
  independent expected mathematical outcomes and must not share their oracle.
- Function baseline and inline-correction record projections: distinct historical
  capture formats remain reproducible and are not rewritten to tidy old evidence.
- Browser audit and Node child-string serialization: separate execution surfaces
  retain deterministic serialization without introducing browser module loading.
- Focused/fuzz runner Edge selection, tutorial command path setup and strict Ajv
  validation: short entry-point setup retains explicit local resource ownership.
- Curriculum normalizer versus manifest type classification: independent producer
  and validator agreement remains directly checked.
- Finished-work policy authority/hash setup: two separate mutations retain their
  own original authority inputs.

PowerShell inventory covers ten files with no parse failures and two exact
matches: HTTP header parsing in the launcher versus its independent audit,
and file hashing with disposal in the audit versus launcher-identity tests.
These preserve independent verification and visible resource lifetimes.
Detailed reproducible census and match locations are saved in
`D:/CodexTemp/refactor-final-comparison.json`,
`D:/CodexTemp/refactor-executable-duplication-final.json` and
`D:/CodexTemp/refactor-powershell-duplication-final.json`.

The final nine-stage AI-change run includes the normal development audit in its
tests stage. Its frozen report supplies completion evidence; release
qualification, external canary evidence and publication remain separate.

### Refactor acceptance and Beta 9 handoff — 2026-09-08

The refactor passed all nine development acceptance stages on staged tree
`4ba8fbdc3dd37f0a4252b76b584632036ed92ced`, subsequently committed as
`04c34d7fc0709010b1d2527ca23f72c38fd620bc`. Initial and final source bindings
match, no findings remain, and fresh engine branch coverage is 90.5 percent.
Report SHA-256:
`de0281b3b42a4203549aa49156d29195401f9a17f395da06bb4bf35fcce7f3ec`.
Live lint warnings/errors are zero. Native inline-script legacy exceptions
remain 175/92/84/13/3 and PowerShell 6/3/4/0/0 for cyclomatic/ABC/cognitive/
function-line/nesting counts, under unchanged no-regression protections.

The owner has now requested a new beta. PB-055 records the Beta 9 release
scope and preserved evidence requirements. Release preparation advances
version identifiers, preserves historical Beta 8 evidence, and resets current
qualification authorities to pending. The differential comparator validates
both versions against their own VERSION authorities and compares only the
declared product-version fields using the baseline value; all other constants,
state fields and serialized bytes remain under exact comparison. This release
metadata projection does not rewrite R0 or substitute an engine implementation.

### Objective and preserved contracts

Refactor production code, tests, and automated quality gates into smaller,
clearer modules while preserving all externally observable child and grown-up
behaviour. The refactor must not change mathematics or grading, curriculum or
tutorial meaning, child-visible copy, privacy, accessibility, persistence,
offline and update behaviour, platform support, licensing, or release-policy
semantics unless the owner separately approves that product-contract change.

### Machine-enforced finish line

1. Project-appropriate, fail-closed ratchets cover cyclomatic complexity, a
   second function-size measure, function length, source-file length, nesting,
   CSS and shipped asset sizes, and the complete production payload. New code
   satisfies current limits; no baseline can worsen; every improved baseline
   becomes the new maximum.
2. Executable architecture checks enforce declared module direction, browser-
   versus engine boundaries, validation-before-persistence, protected writer
   ownership, and the existing no-child-data-transmission contract.
3. Production and test refactors preserve effect-sensitive coverage. The full
   development test suite passes, exact engine branch coverage remains at or
   above both 80 percent and its pre-refactor 89.33 percent baseline, and no
   assertion, expected behaviour, or negative control is weakened to obtain a
   pass.
4. JavaScript and CSS linting report zero errors and no new warnings. Any
   retained legacy finding is closed, justified, path-bound, and may only
   decrease. Dead files, unused exports, unused dependencies, anonymous task
   markers, committed secrets, high-confidence static security findings, and
   known vulnerable dependencies fail automatically.
5. The required development check runs the new quality families and names an
   effect-sensitive negative control for each. Thresholds, ignores, baselines,
   and exceptions are governed data; changing them cannot silently make a
   failing implementation pass.
6. Owners → Code Map → Feature Map → Tutorial Manifest → Art Design → Blast
   Radius → Gates remains schema-valid, exact, complete, and drift-free after
   every structural slice and at final handoff.
7. Systematically inventory repeated executable code blocks across tracked
   repository source, including inline game/audit scripts. Consolidate matching
   implementations into appropriately owned shared functions where their
   semantics, dependencies, and responsibilities genuinely agree. Preserve
   independent mathematical/test oracles and governed generated projections;
   record why any detected duplication is intentionally retained. Verify every
   affected caller, update the ownership/dependency chain, and include the
   consolidation results and retained cases in the final refactor summary.

### Required AI-change loop

Every code change authored by an AI agent must pass the following stages in
this exact order before the change, or a bounded refactor slice containing it,
may advance: compiler and declared-contract validation; static architecture
rules; unit, integration, and effect-sensitive tests; differential equivalence
against the pre-refactor behaviour; bounded deterministic property and fuzz
testing; curated mutation testing; secret, static-security, dependency,
licence, integrity, and vulnerability checks; complexity, duplication,
dead-code, function, and file-size ratchets; and shipped-byte plus measured
runtime performance budgets. Every stage is PASS-only: skipped, missing,
waived, deferred, stale, or out-of-order evidence is not a pass. The canonical
order and stage claims live in `audit/quality-gate-policy-v1.json`.

### Refactor-slice execution contract

Each bounded slice follows one closed lifecycle: focused development; complete
staging of production, test, documentation, ownership, and derived changes;
the independent review required by `AGENTS.md`; focused correction and
verification; exact staged-tree freeze; one complete nine-stage loop; then
advancement. The complete loop starts only after the applicable review is
clear. Any later candidate change invalidates that seal and requires a new tree
and complete loop. This prevents an expensive loop from being invalidated by a
review that should have occurred first without omitting any final stage.
Review clearance is an `AGENTS.md` and caller obligation, not an automated PASS
invented by the runner; the runner independently enforces the exact freeze and
all nine stages.

`tools/blast-radius-lookup.mjs` and the Code Map select draft checks. Unknown
effects fail safe to the broad development suite. Draft selection never
substitutes for the complete loop on the final slice. Every complete report
must bind the staged tree, R0 commit, quality and gate-policy bytes, package
lock, and reviewed Node executable, and must prove that tracked and nonignored
untracked candidate state remained unchanged from start to finish. Automatic
gate retries remain prohibited.

Application byte and engine-runtime budgets hard-fail in every environment.
The aggregate quality-run wall time hard-fails only when the runner explicitly
declares the policy's calibrated environment; otherwise it remains measured,
labelled uncalibrated harness telemetry and cannot be represented as product-
performance evidence. No new tool, baseline, schema, gate, or evidence family
may be added unless a demonstrated escaping defect is not covered by an
existing effect-sensitive control. Legacy ESLint warnings remain downward-only
during R2 and R3 and must reach zero at R4.

### Checkpoints

- **R0 — baseline:** preserve the clean commit, metric inventory, coverage
  floor, broad development result, and driftless result before edits.
- **R0 additive correction:** the first function artifact remains immutable,
  but its ESLint virtual filename caused executable scripts in `audit.html` and
  `index.html` to be ignored without a parse error. The hash-bound
  `audit/inline-function-quality-baseline-correction-v1.json` records the 1,971
  functions recovered from the unchanged R0 commit as a separate scope,
  including 204 cyclomatic violations. Its ceilings may only decrease; this
  correction does not raise or rewrite the original JavaScript ratchets.
- **R1 — gate foundation:** add the closed ratchet authority, validators,
  negative controls, dependency provenance, CI routing, and fail-closed
  ownership/code-map bindings before relying on any new metric.
- **R2 — production structure:** after each engine, browser-adapter, style, or
  asset extraction, run the affected behavioural suites, exact generated-file
  synchronization checks, blast-radius self-test, and driftless gate.

Recorded checkpoint evidence:

- **R1 completed on 2026-08-28:** the canonical nine-stage AI-change loop
  passed in its required order, including repository-scoped Semgrep,
  TruffleHog current/history, and dependency scans. Thirty-seven focused
  ownership, drift, and negative-control tests also passed.
- **R2 slice 1 candidate:** extract the pure PWA status-copy policy into
  `assets/js/math-quest-pwa-status.js` while retaining the page adapter as the
  only browser-state reader. Four focused status tests, including the
  `NC-PWA-STATUS-MAPPING-DRIFT` mutation, all 59 PWA release tests, and all 36
  direct desktop/phone Edge journeys pass.
  The inline cyclomatic-violation ratchet improves from 204 to 203, `index.html`
  falls from 4,908 to 4,897 lines, and the new component is 1,586 bytes. The
  exact production payload is 2,707,776 bytes and its ceiling is tightened to
  that value. Code-map v1.20.0 owns the policy and its offline, launcher,
  workflow, release-manifest, test, and attribution projections. This recorded
  candidate may advance only after exact inventory synchronization and a fresh
  complete AI-change loop pass.
- **R2 slice 2 candidate:** extract protected-progress source selection into
  `assets/js/math-quest-progress-source.js`, preserving the exact 448-case
  legacy decision matrix at SHA-256
  `2bb99f91e26397a6127a65a12a1eb6b57962a7f4c39e63e79659979aa62a0125`.
  Three focused policy tests, all 30 page-adapter effect tests, all 59 PWA
  release tests, 89 combined release/ownership checks, and the launcher's 15
  effect-sensitive assertions pass. The former cyclomatic-39 selector and
  cyclomatic-46 storage callback are replaced by functions at or below 10;
  inline cyclomatic, ABC, and cognitive violation ratchets improve from
  203/116/111 to 201/114/109. `index.html` falls from 4,897 to 4,886 lines.
  The new component is 3,413 bytes, while shared cutover and storage-event
  policy removes enough duplication to reduce the exact production payload
  from 2,707,776 to 2,707,471 bytes and JavaScript from 1,056,705 to 1,052,646
  bytes; both ceilings are tightened to those values. Architecture policy
  v1.3.0 enforces 17 source contracts, and code-map v1.21.0 owns every runtime,
  offline, launcher, workflow, test, release-manifest, audit, and attribution
  projection. The staged 278-path public candidate passes its calibrated guard.
  This candidate may advance only after a fresh complete AI-change loop pass.
- **R2 slice 3 candidate:** move the cyclomatic-40 PWA readiness validator into
  the existing pure `math-quest-pwa-status.js` policy while preserving exact
  Beta 8 release, build, cache, path, worker-state, ten-minute freshness, and
  one-time activation-challenge checks. Eight focused policy tests cover valid
  active and waiting replies, 25 malformed contract axes, clock sampling, two
  calibrated mutations, page delegation, and runtime inventory; all 30 page-
  adapter effect tests and all 59 PWA release tests pass. Every new or modified
  production function is at or below cyclomatic 10, ABC 30, cognitive 15, 80
  lines, and nesting 4. Inline cyclomatic, ABC, and cognitive violation
  ratchets improve from 201/114/109 to 200/113/108, and `index.html` falls from
  4,886 to 4,876 lines. The expanded policy is 3,391 bytes at SHA-256
  `1f9f18d24d7c79bd819a394d0cd71a43acce5a6a85fa8f467d06da6e5a4062f2`;
  JavaScript falls from 1,052,646 to 1,050,811 bytes and the exact production
  payload from 2,707,471 to 2,707,441 bytes. Architecture policy v1.4.0
  enforces 19 exact source contracts, code-map v1.22.0 owns the new validation
  and test edges, and release manifest
  `0cd88ba09b04ab79631f00e16427320d9ee1f7997aae47c75041505da6ba9e73`
  binds the runtime bytes. The staged public candidate passes its calibrated
  guard. This candidate may advance only after a fresh complete AI-change loop
  pass.
- **R2 slice 4 candidate:** replace the cyclomatic-39 fraction-form parser with
  a closed, data-driven `Fraction` policy while preserving the public
  `parseFraction` and `fractionsEquivalent` API. The immutable-R0 differential
  oracle now records 377 fraction observations across 29 inputs and 13 target
  forms, including internal-name-shaped unknown targets, and its independent
  fraction-result mutant must be detected. All 658 engine tests and all 59 PWA
  release tests pass. Every new or modified policy method is at or below
  cyclomatic 10, ABC 30, cognitive 15, 80 lines, and nesting 4; inline
  cyclomatic, ABC, and cognitive violation ratchets improve from 200/113/108
  to 199/112/106. `index.html` falls from 4,876 to 4,875 lines. JavaScript and
  the exact production payload each fall by 83 bytes, to 1,050,728 and
  2,707,358 bytes respectively, and both ceilings are tightened to those
  values. The unchanged architecture v1.4.0 and code-map v1.22.0 ownership
  boundaries pass their 48 focused drift checks; release manifest
  `5726ccbdfb3cff7f5c59681cf607d85acfe45fd6ec9055edc023b3aaf0aa6c8a`
  binds the runtime bytes. This candidate may advance only after a fresh
  complete AI-change loop pass.
- **R2 slice 5 candidate:** replace the cyclomatic-38 grid-route specification
  builder and cyclomatic-11 route tracer with shared, bounded point, step,
  start, and size policies while preserving the public
  `gridRouteSpecification` and `traceGridRoute` API. The immutable-R0
  differential oracle now records 3,470 observations, including 33 grid-route
  specification and trace observations across missing, malformed, fallback,
  bounded, and off-board cases, and its independent grid-result mutant must be
  detected. All 658 engine tests, the dedicated ambiguous/unsafe/off-board
  geometry contract, and all 59 PWA release tests pass. Every new or modified
  production function is at or below cyclomatic 10, ABC 30, cognitive 15, 80
  lines, and nesting 4; inline cyclomatic, ABC, and cognitive violation
  ratchets improve from 199/112/106 to 197/111/105. `index.html` remains 4,875
  lines. JavaScript and the exact production payload each fall by 2 bytes, to
  1,050,726 and 2,707,356 bytes respectively, and both ceilings are tightened
  to those values. The unchanged architecture v1.4.0 and code-map v1.22.0
  ownership boundaries pass their 48 focused drift checks; release manifest
  `cbecb0731fc22fa1de5fb3b88291c6ba8d050398166ff0c54e8a090d02365234`
  binds the runtime bytes. This candidate may advance only after a fresh
  complete AI-change loop pass.
- **R2 slice 6 candidate:** replace the cyclomatic-18 strategy-result router,
  cyclomatic-21 governed-method router, and cyclomatic-37 strategy-work builder
  with shared arithmetic, expression, choice, step, specification, and bounded
  per-strategy policies while preserving their public engine APIs. Before the
  production edit, the immutable-R0 differential oracle was expanded to 3,546
  observations, including 76 complete strategy result, method, and work-object
  observations across counting, make-ten, known-bond, multiplication, mental,
  written carry/regroup, parity, missing-part, invalid-method, and unknown-skill
  cases; independent governed-method and work-object mutants must be detected.
  All 658 engine tests, the focused strategy boundary contract, and all 59 PWA
  release tests pass. Every new or modified function is at or below cyclomatic
  10, ABC 30, cognitive 15, 80 lines, and nesting 4; inline cyclomatic, ABC,
  cognitive, and nesting violation ratchets improve from 197/111/105/6 to
  194/109/102/5. `index.html` falls from 4,875 to 4,859 lines. JavaScript and
  the exact production payload each fall by 241 bytes, to 1,050,485 and
  2,707,115 bytes respectively, and all affected ceilings are tightened.
  Branch coverage improves from 89.44 to 89.49 percent; lint remains at zero
  errors with the exact 593-warning legacy census. The unchanged architecture
  v1.4.0 and code-map v1.22.0 ownership boundaries pass their 48 focused drift
  checks; release manifest
  `54b2d108502046e1fa18badc4a3f90bb0014ebbbb5b6082705371db49424b19e`
  binds the runtime bytes. This candidate may advance only after a fresh
  complete AI-change loop pass.
- **R2 slice 7 candidate:** replace the cyclomatic-50 initial-response builder,
  cyclomatic-145 completion dispatcher, and cyclomatic-28 serializer with
  closed response factories, bounded per-method completion policies, and a
  serializer dispatch table while preserving their public engine APIs. Before
  production edits, the immutable-R0 differential oracle was expanded from
  3,546 to 4,557 observations by recording initial state, default
  serialization, and default completeness for every generated question plus
  null boundaries; independent creation, serialization, and completion
  mutants must be detected. Defensive missing-parameter, invalid-grid, null,
  and missing-grid-state branches are protected by the readable 40-line
  `response-boundary-contract.mjs` helper without growing the legacy engine
  test file. All 658 engine tests, the focused response and holistic contracts,
  and all 59 PWA release tests pass. Every new or modified function is at or
  below cyclomatic 10, ABC 30, cognitive 15, 80 lines, and nesting 4; inline
  cyclomatic, ABC, and cognitive violation ratchets improve from 194/109/102
  to 191/106/99. `index.html` falls from 4,859 to 4,808 lines. JavaScript and
  the exact production payload each fall by 653 bytes, to 1,049,832 and
  2,706,462 bytes respectively, and all affected ceilings are tightened.
  Branch coverage improves from 89.49 to 89.65 percent; lint remains at zero
  errors with the exact 593-warning legacy census. The unchanged architecture
  v1.4.0 and code-map v1.22.0 boundaries remain exact; release manifest
  `521c143128872a21af3c69274fb4e6ec1a1f22701feb2626074d66f6045b4de2`
  binds the runtime bytes. This candidate may advance only after a fresh
  complete AI-change loop pass.
- **R2 slice 8 candidate:** replace the cyclomatic-188 persisted-response
  validator with a closed per-method policy table and shared finite-number,
  token-partition, token-history, pairing, sorting, fraction, and grid
  boundaries. Grading, serialization, and persistence now share the same
  finite-number and token-history contracts instead of maintaining parallel
  predicates. The immutable-R0 differential oracle remains at 4,557
  observations. The existing seven-part response persistence contract and a
  new four-test valid-progress/hostile-boundary contract protect strategy,
  pair, sort, deal, group, fraction, slot, and route state, including canonical
  comparison and equivalent-fraction fixtures. The new coverage contract lives
  in the 188-line `response-boundary-contract.mjs` module; the legacy engine
  test remains exactly 4,713 lines. Every new or modified function is at or
  below cyclomatic 10, ABC 30, cognitive 15, 80 lines, and nesting 4; inline
  cyclomatic, ABC, and cognitive violation ratchets improve from 191/106/99
  to 190/105/98. `index.html` remains 4,808 lines. JavaScript and the exact
  production payload each fall by 1,598 bytes, to 1,048,234 and 2,704,864
  bytes respectively, and both ceilings are tightened. Branch coverage
  improves from 89.65 to 89.66 percent and its hard minimum is tightened;
  lint remains at zero errors with the exact 593-warning legacy census. Knip
  remains at zero unused files and dependencies while its unused-export
  ratchet improves from 83 to 81. The unchanged architecture v1.4.0 and code
  map v1.22.0 remain exact, the 279-path public inventory is idempotent, and
  release manifest
  `b0dd574fbebd19c2635e6982ba34cd2d5ef1aa26330d74018260bfec431cdbcd`
  binds the runtime bytes. This candidate may advance only after a fresh
  complete AI-change loop pass.
- **R2 slice 9 candidate:** replace the cyclomatic-152 semantic-model
  descriptor with a closed 26-policy registry, initialized once behind its
  public dispatcher, plus focused fraction and route-model helpers. The
  immutable-R0 differential oracle expands from 4,557 to 9,171 observations.
  An exact 48,384-request baseline census across every skill, tier, declared
  representation, ordinal 0 through 31, capstone state, and theme world closes
  over 103 generated semantic prompt types, then fixes 2,304 baseline-owned
  task/prompt/model/facet witnesses for complete question and teaching-support
  comparison. The canonically sorted full witness-request registry is bound to
  SHA-256 `f30730884cb0ea5a9b125c95534d6f1bbc238489180d89d70e0bad522993af4b`
  and a later-ordinal representative mutant is rejected. Direct support
  fixtures protect all six semantic branches named
  by independent review, including the two public support-only prompt ids, and
  independent question-ID and later hidden-part semantic-model mutants are
  rejected. Every new or modified function is at or below
  cyclomatic 10, ABC 30, cognitive 15, 80 lines, and nesting 4; inline
  cyclomatic, ABC, cognitive, and function-length violation ratchets improve
  from 190/105/98/16 to 189/104/97/15. `index.html` falls from 4,808 to
  4,756 lines. JavaScript and the exact production payload each fall by 511
  bytes, to 1,047,723 and 2,704,353 bytes respectively, and both ceilings are
  tightened. Branch coverage improves from 89.66 to 89.73 percent and its hard
  minimum is tightened; lint remains at zero errors with the exact 593-warning
  legacy census. Knip remains at zero unused files and dependencies with the
  81-unused-export and two-duplicate-group ratchets unchanged. Architecture
  v1.4.0 remains exact. Quality policy v1.1.0 and code map v1.23.0 add the
  review-first slice lifecycle, exact staged-tree candidate binding,
  calibrated harness-time evidence boundary, and gate-admission contract; all
  focused policy, candidate-drift, ownership, and integrity checks pass.
  Release manifest
  `02094ed37de70c07dea3679e788a621f9c422f142bcb8295e25eee31f219a219`
  binds the runtime bytes. The first exact-bound loop correctly stopped at the
  test stage because the independent CI-toolchain validator still required the
  pre-v1.1.0 quality-policy shape. Synchronizing that closed expectation to the
  approved v1.1.0 fields, and registering its ownership edge, preserved every
  dependency and supply-chain assertion; the focused canary, Code Map, and
  gate-integrity set then passed all 36 checks. The corrected candidate may
  advance only after a fresh complete AI-change loop pass. A following exact-
  bound attempt passed Stages 1 through 6, then the reviewed Semgrep executable
  exited before scanning because the restricted task sandbox denied its
  OpenTelemetry dependency access to the Windows certificate store. The same
  complete repository-only security stage passed in the certificate-store-
  capable execution environment: 409 of 409 Semgrep targets, zero static
  findings or errors, zero current/history secret findings, zero dependency
  vulnerabilities, zero anonymous work markers, and all five calibrated
  security mutants. This is an environment/harness failure, not accepted scan
  evidence; the complete loop must restart in that capable environment.

- **R2 slice 10 candidate:** begin the cyclomatic-571 question-generator
  decomposition by moving the operation-model, operation-equation,
  chance-experiment, and area-model profiles behind a lazily initialized closed
  policy registry. Shared result and evidence-class helpers remove duplicate
  grading-object construction and the duplicated named-selection evidence
  rule without changing public shapes. `makeQuestion` improves to cyclomatic
  545, ABC 1,473.08, cognitive 1,091, and 186 lines; every new or modified
  helper remains within 10 / 30 / 15 / 80 / 4. Before production edits, the
  immutable-R0 oracle was strengthened to hash every complete question from
  all 48,384 discovery requests at SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`
  and compare 126 per-skill corpus digests, increasing the differential set to
  9,297 observations; its ordinal-31 space/capstone mutant is rejected. All
  72,576 exhaustive questions, 40,824 choice searches, and 663 focused engine,
  grading, response, strategy, and tutorial checks pass. `index.html` falls to
  4,755 lines; JavaScript and the production payload each fall 17 bytes to
  1,047,706 and 2,704,336; the inline cognitive-violation ratchet improves from
  97 to 96; and native branch coverage improves from 89.73 to 89.81 percent.
  Release manifest
  `290283e2ca35afba8e7009593629b49337d2c779ff1c4aa44d4cd6f657136cba`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 11 candidate:** move 14 low-coupling structured-response graders
  for order, coins, expressions, patterns, landmarks, slots, fact families,
  angles, clocks, metric scales, action scenes, informal measurement, area,
  and volume into a lazily initialized closed dispatch table. The prior
  post-handler scalar fallback for four always-returning structured methods was
  unreachable and is removed. `gradeAnswer` improves from cyclomatic 343, ABC
  680.90, cognitive 308, and 122 lines to 235 / 448.62 / 209 / 64; every new
  handler is at or below cyclomatic 10, ABC 25.71, cognitive 6, one line, and
  nesting 0. All 660 focused engine, grading, hostile-response, persistence,
  strategy, and tutorial checks pass, as do all 72,576 exhaustive self-graded
  questions, 40,824 choice searches, and the 9,297-observation immutable-R0
  comparison. Independent review found that a normal-object policy table could
  dispatch inherited `toString`, `constructor`, or `__proto__` members for a
  hostile unknown method. The frozen registry now has a null prototype, and a
  permanent public-API regression proves all three names retain the predecessor
  frozen scalar fallback. `index.html` falls from 4,755 to 4,713 lines,
  JavaScript and the production payload each fall 248 bytes to 1,047,458 and
  2,704,088, the
  inline overlong-function ratchet improves from 15 to 14, and native branch
  coverage improves from 89.81 to 89.82 percent. Release manifest
  `2eb3aa7273adc43a5ae8ea47b96deda24516d667238b1246021c35fbdf74f533`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 12 candidate:** finish the structured-response decomposition by
  moving the remaining count, place-value, strategy, symmetry, pairing,
  sorting, sharing, grouping, number-bond, graph, fraction, and grid-route
  graders behind an explicit closed method-to-handler registry. `gradeAnswer`
  improves from cyclomatic 235, ABC 448.62, cognitive 209, and 64 lines to
  9 / 14.21 / 8 / 7; every new or materially modified function remains at or
  below cyclomatic 10, ABC 25.16, cognitive 11, 28 lines, and nesting 2. A
  focused pre-seal run exposed that an intermediate byte-saving handler array
  was coupled to the insertion order of the response-state policy object and
  shifted the slot-through-angle graders by one position. The candidate now
  uses explicit frozen object keys guarded by `Object.hasOwn`, and the same
  focused suite clears all 660 engine, semantic, persistence, hostile-response,
  grading, strategy, and tutorial checks. Independent review then found three
  malformed-input differences in empty fraction payloads, malformed pair-link
  canonicalization, and numeric text metadata for place-value responses. The
  corrected registry preserves each sealed result or throw exactly, with
  permanent boundary assertions. All 72,576 exhaustive questions and 40,824
  choice searches pass; the 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,713 to 4,691 lines, JavaScript and the production
  payload fall another 51 bytes to 1,047,407 and 2,704,037, inline cyclomatic,
  ABC, and cognitive violation ratchets improve to 188 / 103 / 95, and native
  branch coverage improves from 89.82 to 89.99 percent. Release manifest
  `c80b41a72d5446ff70e47b83c6081185184e3f723b3eb465b795374e6435e5cb`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 13 candidate:** move decimal-model generation behind the closed
  generator registry and separate percent conversion from ordinary decimal
  construction. `makeQuestion` improves from cyclomatic 545, ABC 1,495.77,
  cognitive 1,091, and 185 lines to 535 / 1,467.01 / 1,067 / 182, repaying the
  temporary Slice 12 ABC increase and improving beyond Slice 10's 1,473.08
  result. The new percent and decimal helpers remain within cyclomatic 9, ABC
  22.91, cognitive 9, one line, and nesting 1. All 660 focused checks and all
  72,576 exhaustive questions and 40,824 choice searches pass; the
  9,297-observation immutable-R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,691 to 4,690 lines, JavaScript and the production
  payload fall another 12 bytes to 1,047,395 and 2,704,025, and native branch
  coverage improves from 89.99 to 90.01 percent. Release manifest
  `6908ff29031420dce88c5e313e834f8685e9f32f38c68fe9e14fe3cf110ef4a2`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 14 candidate:** move fraction-model generation behind the closed
  generator registry and isolate comparison construction from ordinary,
  equivalent, and halves models. `makeQuestion` improves from cyclomatic 535,
  ABC 1,467.01, cognitive 1,067, and 182 lines to 528 / 1,435.45 / 1,050 / 176.
  The new fraction helpers remain within cyclomatic 4, ABC 20.32, cognitive 5,
  one line, and nesting 1. All 660 focused checks and all 72,576 exhaustive
  questions and 40,824 choice searches pass; the 9,297-observation immutable-R0
  comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,690 to 4,686 lines, JavaScript and the production
  payload fall another 122 bytes to 1,047,273 and 2,703,903, native branch
  coverage remains 90.01 percent, and function coverage improves from 97.33 to
  97.34 percent. Release manifest
  `2e329de3c6890dcb1185743b8d59231151e0b290d3146c6b7f646925d03c4e10`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 15 candidate:** move rounding and plausibility-estimate generation
  behind the closed generator registry. `makeQuestion` improves from
  cyclomatic 528, ABC 1,435.45, cognitive 1,050, and 176 lines to
  517 / 1,405.29 / 1,019 / 166. The new estimate and rounding helpers remain
  within cyclomatic 7, ABC 20.83, cognitive 13, one line, and nesting 1. All
  660 focused checks and all 72,576 exhaustive questions and 40,824 choice
  searches pass; the 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,686 to 4,678 lines, JavaScript and the production
  payload fall another 13 bytes to 1,047,260 and 2,703,890, native branch
  coverage remains 90.01 percent, and function coverage improves from 97.34 to
  97.35 percent. Release manifest
  `b29ddcbfe6a615f5439969a61b147833770a4cef13f71b157a0b70575435709f`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 16 candidate:** move expression, missing-part, and pattern-rule
  generation behind the closed generator registry while preserving preliminary
  random draws and MQ-101 strategy metadata. `makeQuestion` improves from
  cyclomatic 517, ABC 1,405.29, cognitive 1,019, and 166 lines to
  508 / 1,358.09 / 1,004 / 163. The new equation helpers remain within
  cyclomatic 5, ABC 28.44, cognitive 5, one line, and nesting 1. All 660
  focused checks and all 72,576 exhaustive questions and 40,824 choice searches
  pass; the 9,297-observation immutable-R0 comparison preserves generator
  corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` remains at 4,678 lines, JavaScript and the production payload
  fall another 6 bytes to 1,047,254 and 2,703,884, native branch coverage
  remains 90.01 percent, and function coverage improves from 97.35 to 97.36
  percent. Release manifest
  `6f2b3746946a3647e3a8aa199b06ab9031523466448e6c81f55bc31b7b8df75d`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 17 candidate:** move distribution, scaled-survey, and survey-list
  generation behind the closed generator registry, sharing one deterministic
  response-list builder with the existing one-to-one display task.
  `makeQuestion` improves from cyclomatic 508, ABC 1,358.09, cognitive 1,004,
  and 163 lines to 495 / 1,300.59 / 978 / 159. The new data helpers remain
  within cyclomatic 5, ABC 18.06, cognitive 6, one line, and nesting 2. All 660
  focused checks and all 72,576 exhaustive questions and 40,824 choice searches
  pass; the 9,297-observation immutable-R0 comparison preserves generator
  corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` remains at 4,678 lines, JavaScript and the production payload
  fall another 118 bytes to 1,047,136 and 2,703,766, native branch coverage
  improves from 90.01 to 90.02 percent, and function coverage improves from
  97.36 to 97.37 percent. Release manifest
  `5d83f2240b55af668cfe5840891aca50ac205d5e1f8ee58e857f10a004b66e5c`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 18 candidate:** move the complete operation-fluency profile behind
  the closed generator registry, separating fraction, decimal, multiplication,
  division, place-value, bond, strategy, bridge-ten, and ordinary add-subtract
  construction. `makeQuestion` improves from cyclomatic 495, ABC 1,300.59,
  cognitive 978, and 159 lines to 414 / 1,095.29 / 791 / 125. The new operation
  helpers remain within cyclomatic 10, ABC 26.65, cognitive 12, one line, and
  nesting 2. A focused pre-seal performance run rejected the first compacted
  candidate because two helper names collided with existing engine declarations
  and left MQ-040 without a prompt. The helpers now have unique names, and both
  the performance scenario and immutable-R0 comparison prove the correction.
  All 660 focused checks and all 72,576 exhaustive questions and 40,824 choice
  searches pass; the 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,678 to 4,661 lines, JavaScript and the production
  payload fall another 171 bytes to 1,046,965 and 2,703,595, native branch
  coverage improves from 90.02 to 90.04 percent, and function coverage improves
  from 97.37 to 97.42 percent; the affected line, coverage, and byte ceilings
  are tightened to retain those gains. Release manifest
  `04a8edf2436589db5d00a97bda5d36cac39b4bf9052f1cea32d00c1c78cf2256`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 19 candidate:** move quantity identification, ordering, and
  comparison behind the closed generator registry, sharing one contextual-
  integer policy and one distinct-order builder instead of duplicating them.
  `makeQuestion` improves from cyclomatic 414, ABC 1,095.29, cognitive 791,
  125 lines, and nesting 5 to 341 / 879.32 / 626 / 107 / 4. The new quantity
  helpers remain within cyclomatic 8, ABC 23.49, cognitive 10, one line, and
  nesting 3. All 660 focused checks and all 72,576 exhaustive questions and
  40,824 choice searches pass; the 9,297-observation immutable-R0 comparison
  preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` remains at 4,661 lines, JavaScript and the production payload
  fall another 33 bytes to 1,046,932 and 2,703,562, native branch coverage
  improves from 90.04 to 90.10 percent, and function coverage improves from
  97.42 to 97.47 percent. The affected nesting, coverage, and byte ceilings are
  tightened to retain those gains. Release manifest
  `00cba79c129044b7ec15c1c296c399633d4978656b04d69176fed3aba62037f5`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 20 candidate:** move place-value composition and symbolic or
  numeric pattern generation behind the closed generator registry. The
  place-value helpers preserve unordered partition equivalence without the
  duplicated sort keys, while numeric multiplication and additive sequences
  have separate bounded builders. `makeQuestion` improves from cyclomatic 341,
  ABC 879.32, cognitive 626, 107 lines, and nesting 4 to
  287 / 748.42 / 512 / 95 / 3. The new helpers remain within cyclomatic 10,
  ABC 22.74, cognitive 9, one line, and nesting 1. Independent hostile review
  rejected an intermediate numeric form-index map because inherited
  `constructor`, `toString`, and `__proto__` keys no longer matched the
  predecessor; the successor restores the ordinary string-valued object map.
  All 660 focused checks and all 72,576 exhaustive questions and 40,824 choice
  searches pass; the
  9,297-observation immutable-R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,661 to 4,659 lines, JavaScript and the production
  payload fall another 22 bytes to 1,046,910 and 2,703,540, native branch
  coverage remains 90.10 percent, and function coverage improves from 97.47 to
  97.49 percent. The affected line and byte ceilings are tightened to retain
  those gains. Release manifest
  `313e6165130017ec3623f12d998a8bbcc222062512d0caec8ed3b783b93f0349`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 21 candidate:** move equal-group, related-fact, remainder, and
  Canadian-money generation behind the closed generator registry. Grouping
  preserves left-to-right fallback evaluation and shares one remainder draw and
  answer builder; money preserves its ordinary task lookup and preliminary coin
  selection while separating multi-step, equivalent-coin, and priced tasks.
  `makeQuestion` improves from cyclomatic 287, ABC 748.42, cognitive 512,
  95 lines, and nesting 3 to 242 / 612.37 / 442 / 80 / 3, removing its function-
  length violation. The new helpers remain within cyclomatic 9, ABC 24.23,
  cognitive 8, one line, and nesting 1. All 660 focused checks and all 72,576
  exhaustive questions and 40,824 choice searches pass; the 9,297-observation
  immutable-R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,659 to 4,655 lines, JavaScript and the production
  payload fall another 104 bytes to 1,046,806 and 2,703,436, native branch
  coverage improves from 90.10 to 90.14 percent, and function coverage improves
  from 97.49 to 97.53 percent. The affected function-length, line, coverage, and
  byte ceilings are tightened to retain those gains. Release manifest
  `3007b4a03266c23075a72e41d49922a7b68a2e6bde89cb62a0cdc61ec758ac67`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 22 candidate:** move timetable, duration, clock-reading, direct-
  comparison, angle, perimeter, metric-conversion, metric-unit, and informal-
  measure generation behind the closed generator registry. Preliminary clock
  draws and the seed-derived unit cycle remain exact. A focused function census
  exposed a duplicate `clockText` declaration before staging; the unique
  `timeLabel` successor prevents function-hoisting misrouting. `makeQuestion`
  improves from cyclomatic 242, ABC 612.37, cognitive 442, 80 lines, and nesting
  3 to 183 / 459.16 / 308 / 60 / 3. The new helpers remain within cyclomatic 9,
  ABC 23.79, cognitive 12, one line, and nesting 2. All 660 focused checks and
  all 72,576 exhaustive questions and 40,824 choice searches pass; the
  9,297-observation immutable-R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,655 to 4,648 lines, JavaScript and the production
  payload fall another 37 bytes to 1,046,769 and 2,703,399, native branch
  coverage improves from 90.14 to 90.15 percent, and function coverage improves
  from 97.53 to 97.56 percent. The affected line, coverage, and byte ceilings
  are tightened to retain those gains. Release manifest
  `a9b342fe4d68a8997839e3cd8cb6ec1087fd3c0484aecb7ff8b810b862824d47`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 23 candidate:** move geometry classification and transformation,
  data-display construction, factor and parity classification, and volume
  generation behind the closed generator registry. The first immutable-R0
  replay rejected a helper consolidation that treated `classify-solid` as a
  flat-shape task; the corrected solid-task discriminator then matched all
  7,296 focused cases across the 19 affected skills. Independent hostile-input
  review then rejected an over-broad suffix discriminator; branch-specific
  equality restores undeclared-task behaviour exactly. `makeQuestion` improves
  from cyclomatic 183, ABC 459.16, cognitive 308, 60 lines, and nesting 3 to
  85 / 180.67 / 104 / 33 / 2. The new helpers remain within cyclomatic 10,
  ABC 29.60, cognitive 13, one line, and nesting 1. All 72,576 exhaustive
  questions and 40,824 choice searches pass; the 9,297-observation immutable-
  R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,648 to 4,640 lines, JavaScript and the production
  payload fall another 216 bytes to 1,046,553 and 2,703,183, native branch
  coverage improves from 90.15 to 90.17 percent, and function coverage improves
  from 97.56 to 97.61 percent. The affected line, coverage, and byte ceilings
  are tightened to retain those gains. Release manifest
  `abc42d2781381977fcaaa5100ca50e74cd53916f165eaa42dfeae1c20e9c4713`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 24 candidate:** decompose `makeQuestion` request/default
  normalization, validation, seeded-number state, generator invocation, prompt
  and input selection, governed option ordering, semantic model assembly, and
  final contract enforcement into bounded helpers. All 48,384 direct valid
  requests, 17 invalid/default cases, native error text, and the exact
  13-property getter access sequence match immutable R0. `makeQuestion`
  improves from cyclomatic 85, ABC 180.67, cognitive 104, 33 lines, and nesting
  2 to 2 / 14.56 / 0 / 3 / 0. The extracted helpers remain within cyclomatic
  10, ABC 16.43, cognitive 11, one line, and nesting 2. The inline legacy-
  violation ceilings fall from 188 / 103 / 95 to 186 / 102 / 93 for
  cyclomatic / ABC / cognitive. All 72,576 exhaustive questions and 40,824
  choice searches pass; the 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,640 to 4,639 lines, JavaScript and the production
  payload fall another 6 bytes to 1,046,547 and 2,703,177, native branch
  coverage improves from 90.17 to 90.20 percent, and function coverage improves
  from 97.61 to 97.67 percent. The affected complexity, line, coverage, and
  byte ceilings are tightened to retain those gains. Release manifest
  `48cb15f8cb9494e24254450a988bdcfc168af53ac21dd87455d9a97846b6cfae`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 25 candidate:** decompose `questionContractErrors` into ordered
  answer, task, domain, method, prompt, option, grammar, pairing, route,
  categorical-sort, and sample-identity validators while retaining its two
  fail-fast shape results. All 7,563 mutated ordered error arrays match
  immutable R0, sealed-tree Proxy traces remain exact, and all 660 focused
  engine tests pass. `questionContractErrors` improves from cyclomatic 86,
  ABC 173.65, cognitive 66, 29 lines, and nesting 2 to
  5 / 16.67 / 4 / 1 / 1. The extracted helpers remain within cyclomatic 10,
  ABC 17.49, cognitive 13, one line, and nesting 2. The inline legacy-
  violation ceilings fall from 186 / 102 / 93 to 185 / 101 / 92 for
  cyclomatic / ABC / cognitive. All 72,576 exhaustive questions and 40,824
  choice searches pass; the 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,639 to 4,626 lines, JavaScript and the production
  payload fall another 19 bytes to 1,046,528 and 2,703,158, native branch
  coverage remains 90.20 percent, and function coverage improves from 97.67 to
  97.71 percent. The affected complexity, line, coverage, and byte ceilings are
  tightened to retain those gains. Release manifest
  `381e68476dcc5c060f1496c69420368ae5e4431212523223d1eed45d7216397b`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 26 candidate:** decompose `validActiveUi` into ordered, short-
  circuiting validators for UI shape, question and choice identity, entries,
  structured response state, feedback, timing, booleans, tutorial and pick
  phases, practice-token guidance, screen/question binding, feedback binding,
  reteaching, and selected options. Seven valid phase fixtures, 189 mutations,
  and recursive Proxy traces match sealed Slice 25 exactly; all 386 focused
  persisted-state checks pass. A new effect-sensitive scalar-construction
  feedback test covers saved-entry acceptance and tamper rejection without
  lowering the coverage floor. `validActiveUi` improves from cyclomatic 77,
  ABC 141.44, cognitive 54, 23 lines, and nesting 1 to
  1 / 1 / 0 / 1 / 0. The extracted helpers remain within cyclomatic 9,
  ABC 15.03, cognitive 6, one line, and nesting 0. The inline legacy-
  violation ceilings fall from 185 / 101 / 92 to 184 / 100 / 91 for
  cyclomatic / ABC / cognitive. The 9,297-observation immutable-R0 comparison
  preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,626 to 4,618 lines, JavaScript and the production
  payload fall another 53 bytes to 1,046,475 and 2,703,105, native branch
  coverage improves from 90.20 to 90.21 percent, and function coverage improves
  from 97.71 to 97.74 percent. The affected complexity, line, coverage, and
  byte ceilings are tightened to retain those gains. Release manifest
  `95914a0fb7859226732e372fec73d157612a5714465b603d1d61ca7402d5019c`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 27 candidate:** decompose `stimulusModelDescriptor` into bounded
  answer-removal policies for ten frames, number lines, fraction pairs, place
  value, proportional bars, area grids, clocks, attribute sets, arrays, and
  ordered visual-prompt scrubbers. All 48,384 generated questions and 29
  synthetic model/visual cases match the sealed authority exactly, including
  input immutability, serialized key order, and inherited-key array modes.
  `stimulusModelDescriptor` improves from cyclomatic 66, ABC 90.14, cognitive
  97, 46 lines, and nesting 3 to 4 / 7.35 / 2 / 1 / 1. The extracted helpers
  remain within cyclomatic 8, ABC 9.11, cognitive 8, one line, and nesting 2.
  The inline legacy-violation ceilings fall from 184 / 100 / 91 to
  183 / 99 / 90 for cyclomatic / ABC / cognitive. All 72,576 exhaustive
  questions and 40,824 choice searches pass; the 9,297-observation immutable-
  R0 comparison preserves generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,618 to 4,590 lines, JavaScript and the production
  payload fall another byte to 1,046,474 and 2,703,104, native branch coverage
  remains 90.21 percent, and function coverage improves from 97.74 to 97.78
  percent. The affected complexity, line, coverage, and byte ceilings are
  tightened to retain those gains. Release manifest
  `588fb5aac6638696ce98616d5a23fe56ebee4cdea5757839b9dbda6401c889b1`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 28 candidate:** decompose `applyAttempt` into ordered transition
  policies for guarded intake, evidence recording, incorrect review and
  demotion, spacing, repeated-miss reteaching, restoration and mastery,
  level-reteach start and clearing, promotion, fatigue, and retained-detail
  pruning. States and ordered effects match sealed Slice 27 across 156 direct
  transition scenarios covering every skill plus invalid, preview,
  non-evidence, repeated-miss, cold-test, fatigue, and placed-gateway paths;
  the focused progression/state API suite also passes. The first complete loop
  rejected a stale generic demotion mutation after the branch split; the
  mutation family now targets `solidReviewFailure` explicitly, and BEH-08 kills
  it while retaining the generic fallback. `applyAttempt` improves
  from cyclomatic 65, ABC 140.15, cognitive 85, 24 lines, and nesting 5 to
  3 / 13.30 / 2 / 1 / 1. The extracted helpers remain within cyclomatic 9,
  ABC 20.98, cognitive 8, one line, and nesting 2. The inline legacy-violation
  ceilings fall from 183 / 99 / 90 / nesting 4 to 182 / 98 / 89 / nesting 3.
  The 9,297-observation immutable-R0 comparison preserves generator corpus
  SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,590 to 4,582 lines, JavaScript and the production
  payload fall another 86 bytes to 1,046,388 and 2,703,018, native branch
  coverage improves from 90.21 to 90.24 percent, and function coverage improves
  from 97.78 to 97.81 percent. The affected complexity, nesting, line,
  coverage, and byte ceilings are tightened to retain those gains. Release
  manifest `2d5f71ffe0df8b48a1ec315584f5bbdf3e58c7b6f61cb5619a41cff06006146b`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 29 candidate:** decompose `validateState` into a lazy ordered
  first-error pipeline around the exact skill-record loop, retaining bounded
  row validators for feedback, reteach, cold-window, and latency records. All
  68 direct root mutations preserve exact first-error strings, and a recursively
  proxied valid save preserves all 12,835 get, own-key, descriptor, and
  prototype operations against sealed Slice 28. All 386 persisted-state
  discriminator tests pass. A new effect-sensitive active-session test accepts
  a canonical `SAME_SESSION_SECOND` slot and rejects its forged non-null
  `baseOrdinal`, restoring coverage without lowering the floor. `validateState`
  improves from cyclomatic 60, ABC 110.51, cognitive 44, 27 lines, and nesting
  2 to 9 / 10.30 / 9 / 16 / 2. The row helpers remain within cyclomatic 8,
  ABC 10.82, cognitive 4, one line, and nesting 0. The inline legacy-violation
  ceilings fall from 182 / 98 / 89 to 180 / 97 / 88 for cyclomatic / ABC /
  cognitive. The 9,297-observation immutable-R0 comparison preserves generator
  corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,582 to 4,579 lines while JavaScript and production
  payload remain at their exact 1,046,388 and 2,703,018-byte ceilings. Native
  branch coverage improves from 90.24 to 90.26 percent, line coverage improves
  to 99.61 percent, and function coverage improves from 97.81 to 97.97 percent.
  The affected complexity, line, and coverage ceilings are tightened to retain
  those gains. Release manifest
  `9d85736bb7664a2f213e033cf9dacc15d695832228d3131834fdbcd8e10ac647`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 30 candidate:** decompose `validActiveQuestionBinding` into
  bounded identity, level, capstone, re-teach, pick, and resolved-slot
  predicates while retaining the original short-circuit and exception
  boundaries. The 386 persisted-state discriminator checks and 24 additional
  focused binding checks pass. A new effect-sensitive capstone-feedback test
  accepts the real submitted checkpoint and rejects the same save when its
  `capstoneSubmitted` flag is forged false. `validActiveQuestionBinding`
  improves from cyclomatic 57, ABC 102.16, cognitive 56, 46 lines, and nesting
  4 to 8 / 14.90 / 7 / 7 / 1. Its extracted helpers remain within cyclomatic
  9, ABC 14.18, cognitive 7, 10 lines, and nesting 2. The inline legacy-
  violation ceilings fall from 180 / 97 / 88 to 179 / 96 / 87 for cyclomatic /
  ABC / cognitive. The 9,297-observation immutable-R0 comparison preserves
  generator corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,579 to 4,574 lines, and JavaScript and production
  payload fall another 20 bytes to 1,046,368 and 2,702,998. Native branch
  coverage improves from 90.26 to 90.31 percent, function coverage improves
  from 97.97 to 97.99 percent, and line coverage remains 99.61 percent. The
  affected complexity, line, coverage, and byte ceilings are tightened to
  retain those gains. Release manifest
  `4eb3d45b2a05668ceeb337eded16a1dcd1932a95f3c17147598b04d52c57ff93`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 31 candidate:** decompose `validQuestionSnapshot` into an ordered
  ten-check pipeline for identity, task, presentation, prompt, answer, options,
  input invariants, model, metadata, and final deterministic binding. The 387
  focused persistence and exact-regeneration checks pass. The closed manifest
  requires every frozen skill to declare `constraints.taskTypes`, so the
  unreachable generator-profile fallback is removed rather than retained as
  dead code. The first coverage measurement correctly rejected 90.29 percent;
  removing that uncovered impossible branch restores the existing 90.31
  percent floor without lowering it. `validQuestionSnapshot` improves from
  cyclomatic 55, ABC 111.43, cognitive 26, 14 lines, and nesting 1 to
  1 / 1 / 0 / 1 / 0. Its helpers remain within cyclomatic 8, ABC 15,
  cognitive 5, one line, and nesting 0. The inline legacy-violation ceilings
  fall from 179 / 96 / 87 to 178 / 95 / 86 for cyclomatic / ABC / cognitive.
  The 9,297-observation immutable-R0 comparison preserves generator corpus
  SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,574 to 4,571 lines, while JavaScript and production
  payload fall another 388 bytes to 1,045,980 and 2,702,610. Branch and line
  coverage remain 90.31 and 99.61 percent, while function coverage improves
  from 97.99 to 98.02 percent. An early standalone security check failed
  closed when the TruffleHog disposable negative control exceeded its
  60-second timeout during the measured D: I/O slowdown. The single
  policy-allowed diagnostic rerun passed all 663 targets and negative controls;
  the first timeout remains a non-pass and cannot qualify this candidate. The
  later changed candidate must pass security normally inside its fresh full
  loop. Release manifest
  `60fcd84fcf1df92684d260bca837ecaf752566a73cbc91ae7f37f00b87452232`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 32 candidate:** decompose `validActiveSession` into ordered
  validators for core queue shape, level and counts, canonical planning,
  timing and presentation, served-prefix integrity, resumable UI progress, and
  final question/feedback bindings. All 413 focused persisted-session,
  served-prefix, and cross-phase checks pass. `validActiveSession` improves
  from cyclomatic 55, ABC 106.03, cognitive 53, 25 lines, and nesting 3 to
  8 / 12.57 / 4 / 5 / 1. Its helpers remain within cyclomatic 10, ABC 18.03,
  cognitive 12, seven lines, and nesting 1. The inline legacy-violation
  ceilings fall from 178 / 95 / 86 to 177 / 94 / 85 for cyclomatic / ABC /
  cognitive. The 9,297-observation immutable-R0 comparison preserves generator
  corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,571 to 4,564 lines, while JavaScript and production
  payload fall another 345 bytes to 1,045,635 and 2,702,265. Branch and line
  coverage remain 90.31 and 99.61 percent, while function coverage improves
  from 98.02 to 98.03 percent.

  The first coverage attempt and its single policy-allowed diagnostic rerun
  failed closed before producing metrics when the fixed 225-second native-test
  budget expired; Windows also denied process-tree cleanup verification. A
  first changed-tree attempt failed the same way while measured host load was
  96–100 percent CPU and the D: queue peaked at 29. No timeout or threshold was
  raised. The hot path was then changed materially to remove per-validation
  arrays and closures and halve helper calls, host load was allowed to drain,
  and the resulting changed tree passed coverage normally with a valid
  structured audit and no uncovered active-session helper. The earlier
  timeouts remain non-passes and do not qualify this candidate. The later fresh
  full loop must pass coverage and security normally. Release manifest
  `823be883a594583d74bd502db5f72d64f02940e65feeb5f48e9726a01e0c86f8`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R2 slice 33 candidate:** jointly decompose `validAttemptFields` and
  `validFullAttemptForQuestion` into ordered attempt-core, task, optional-field,
  question-binding, session, feedback, evidence, and guessing predicates. The
  closed manifest requires every frozen skill to declare nonempty
  `constraints.taskTypes`, so the second unreachable generator-profile
  fallback is removed rather than retained as dead code. All 394 focused
  persisted-attempt and feedback-binding checks pass. A new effect-sensitive
  fixture accepts a correct hint-assisted selection with invalid telemetry only
  as `CORRECT_WITH_STRUGGLE`, `NON_EVIDENCE`, guessing-like feedback with zero
  elapsed time, then rejects a forged nonzero elapsed value.

  `validAttemptFields` improves from cyclomatic 36, ABC 63.56, cognitive 27,
  nine lines, and nesting 1 to 8 / 11.36 / 2 / 1 / 1.
  `validFullAttemptForQuestion` improves from 37 / 69.30 / 14 / 8 / 1 to
  8 / 18.47 / 4 / 1 / 1. Extracted helpers remain within cyclomatic 9,
  ABC 17, cognitive 5, one line, and nesting 0. The inline legacy-violation
  ceilings fall from 177 / 94 / 85 to 175 / 92 / 84 for cyclomatic / ABC /
  cognitive. The 9,297-observation immutable-R0 comparison preserves generator
  corpus SHA-256
  `8aaea3a5dab0d50afd6dc16b912a135cfd4f8563d5e050cfbbc416190ddcc703`.
  `index.html` falls from 4,564 to 4,563 lines, while JavaScript and production
  payload fall another 85 bytes to 1,045,550 and 2,702,180. Native branch
  coverage improves from 90.31 to 90.42 percent, line coverage remains 99.61
  percent, and function coverage improves from 98.03 to 98.06 percent. The
  affected complexity, coverage, line, and byte ceilings are tightened to
  retain those gains. Release manifest
  `2829685886b3d78b454511b889ec6a2f0e5ed6247bf0deaf649cd4628e1ee083`
  binds the exact runtime. This candidate may advance only after the required
  independent review and a fresh complete AI-change loop pass.

- **R3 accessibility-report slice candidate (2026-09-04):** resume the saved
  axe-core addition without treating its earlier focused-browser pass as a
  complete refactor or release verdict. Independent review found that manual
  findings lost their node/cell/state identities and that the detector proof
  was incorrectly bound to a synthetic formatting test. Both findings were
  corrected and verified by the same reviewer. Reports retain exact locations,
  selectors, reasons, and help links; absent scanner channels fail closed;
  the actual browser control emits its own detection proof. The ordinary
  development audit now includes the adapter regression tests.

  The focused and Deep UX report entry points fall from cyclomatic 56 and
  114 to 3 and 4 respectively, with bounded field-validation helpers. The
  JavaScript legacy ceilings fall from 181/252/113/123 to 176/248/111/121 for
  cyclomatic/ABC/cognitive/function-length violations after also grouping the
  oversized census contract test by responsibility without removing any of
  its 75 assertion sites. The function-quality gate, 46 focused syntax,
  report, ownership, policy, and budget tests, and all 36 focused Edge journeys
  pass. The 36 journeys were rerun after the source cleanup below. These are
  development observations, not frozen-candidate certification.

  The first 100-cell benchmark failed before cell execution because its
  immediate name-button count raced initial rendering. The retained phone
  failure snapshots show the name screen while the harness waited for Home.
  The corrected harness waits for either legitimate entry screen before
  choosing its native action; a regression proves delayed anonymous and
  already-restored Home paths. The changed benchmark passes 100/100 selected
  cells across all six viewports with zero definite axe violations in
  584,491 ms; its 112 location-bound incomplete records remain manual-review
  evidence, not automated passes. The non-certifying report SHA-256 is
  `71ba6abb6c74a073794b85a4547976b62cabbc0fe629c222374aa4e7cd484a6b`.
  It binds the served snapshot before the subsequent source-comment and
  dead-declaration cleanup; it is not evidence for an unrun full census.
  On 2026-09-04 the owner accepted the shown darker-text revision. The exact
  approval and comparison-image bindings are owned by `ART-DEC-013` in the
  art-design decision register. Typeface, size, layout, and wording do not
  change; the correction only reuses the existing darker primary ink.

  Re-reading the original requirements identified a draft-integrity
  issue: the earlier axe candidate removed the icon-provenance comment and
  relocated the Inter attribution outside the stylesheet solely to fit byte
  budgets. Those formatting-only gains are not acceptable refactor savings.
  The source explanations are restored. Three root-level CSS rules were
  genuinely duplicated later in the same stylesheet, and the private
  `SESSION_END_REASONS` table and `speakRitualOpen` wrapper had no runtime or
  test callers. Removing those dead declarations instead keeps CSS/JavaScript/
  payload at 234,769/1,045,316/2,701,857 bytes with no raised budget. The
  formatting-only draft gains do not count in the final reduction summary.
  The owner-approved slice has synchronized design, tutorial, Feature Map,
  attribution, and offline bindings. PWA manifest
  `88d029f9e4566715f3e3f07aa9de7fb743bc024ea3bd04d1d654a23925fe3750`
  binds the prepared runtime. Its sealed nine-stage loop must pass before
  advancement; the wider refactor's R3/R4 completion obligations remain.
  Nothing is published by this checkpoint.

- **R3 loop-evidence correction candidate (2026-09-04):** the seal of tree
  `0e3b982afcc4332458fa5b7192135cd089574079` passed compiler/contracts,
  architecture, and the broad development suite, then failed the combined
  test/coverage stage. Later stages correctly remained `NOT_RUN`, and the
  candidate binding remained unchanged. The retained failed report SHA-256 is
  `f5d65654ad01534129f89ade6ff77b8b78ab559147f7d33867756ee4c5c8f117`.
  Its V1 format discarded the underlying coverage report, so its exact cause
  cannot be recovered from that record. The single focused diagnostic confirms
  a 225,000 ms timeout before a complete coverage percentage or structured audit
  is emitted; cleanup is verified. Its complete report SHA-256 is
  `f9138f04a684581a26ff738eb1a405a4fa0a26a1bee8cc9373d8058b67b6ef9b`.
  This diagnostic does not qualify the failed seal, and no limit is raised.

  The V2 loop result retains each executed component report by value, including
  failure evidence and passing coverage measurements. Coverage failures must
  supply actionable findings. A contradictory PASS label cannot override
  reported findings or permit later stages to run. Regression tests and
  independent review cover this new defect scope. Review additionally exposed
  malformed string/object/null findings being normalized to an empty array;
  those now fail the live loop and retain their original evidence. The same
  reviewer verified the correction. A fresh complete loop is still required
  after the coverage runtime blocker is resolved; both failed runs remain
  non-passes.

  Profiling identified duplicate current-question lookups in the placement
  fixture. The fixture now reuses the question already observed for that
  prefix; other callers still perform their original lookup. No runtime code,
  corpus case, assertion, validation, timeout, or coverage floor is removed.
  Three new fixture regressions preserve question/answer ordering, all response
  kinds, early completion, overflow rejection, and duplicate Not sure rejection.
  Two failed before the correction and all three pass afterward. Independent
  review and its one correction-verification round cleared exact test-source
  SHA-256 `3576b6d838488bdfe7fc20d4f5253f7b7188167d8b7db4157758e4dabe2c2aaf`
  (engine suite) and
  `5352b5957f8212076cfff75ef018cb01bdc8b6e534d2718d24a10cf181f2bb4b`
  (Node tests). The correction avoids adding a default-argument cyclomatic
  branch; no metric exception was introduced. The real engine suite passed all
  43 checks before that signature-only correction, and the separate semantic
  audit passed all 130 checks over 6,048 questions. The placement-boundary check
  took 37,373 ms after reuse versus 70,263 ms in the earlier CPU-profiled run;
  these are uncalibrated harness observations, not a product-performance claim.
  The focused coverage successor passed all 667 tests with no skips in
  156,774 ms under the unchanged 225,000 ms limit, retaining 90.42 percent
  calibrated native branch coverage and the exact 43-engine/130-semantic
  structured evidence. Report SHA-256:
  `ba95f5ce9602f45a3b492eda3f66afd34a7367b507a0a7cffc4687db92043d4c`.
  This is focused evidence, not a replacement for the complete loop.

  A subsequent file-size check required the fixture and its three regressions
  to be extracted into `audit/tests/placement-fixtures.mjs` and
  `audit/tests/placement-fixtures.test.mjs`. The engine suite imports the
  helpers; the Node engine entry imports the tests so native coverage retains
  them. Removing the redundant local `cloneRun` forwarding alias preserves
  the Node entry's existing line ceiling. Code Map `testing.placement-fixtures`
  owns the shared contract and records its consumers and test-execution edge;
  first-party and generated inventory records include both original MIT files.
  All three extracted fixture checks, all 17 driftless checks, and the complete
  function-quality gate pass. Independent boundary review cleared the
  extraction, imports, retained test discovery, and ownership/rights records.
  The shared fixture SHA-256 is
  `ac9a79ba1a743ee88bc90c8b4ef66a99cb66ee83a03a43e18b1da98b7a992bad`;
  its three-test module SHA-256 is
  `e760adee60968af54267146211ae4c557491449fbaa5c7eba55ca30672084b64`.
  The engine suite's line ceiling is tightened from 2,257 to 2,222; the Node
  entry remains at its existing 4,713-line ceiling. The new candidate still
  requires the full loop; the earlier coverage report does not certify changed
  test-module bytes.

  The complete loop on exact tree
  `b84f3f86d848946e8740bc84edd3ad836c404cee` subsequently passed
  compiler/contracts (18,233 ms), architecture (2,494 ms), and the broad
  development-plus-coverage stage (746,747 ms). Native coverage retained
  667 passes, zero skips, and 90.42 percent in 183,047 ms; the focused browser
  report retained all 36 passes. The candidate identity remained unchanged.
  The V2 report, SHA-256
  `eed25a2327ae83e89b9fa127974e0ef5886818462eac36a1a5262d3f7f3977a5`,
  then failed differential equivalence after 427,591 ms; all five later stages
  correctly remained `NOT_RUN`. No release certification or publication ran.

  A bounded read-only diagnosis checked every affected tutorial: all 504 plans
  differ solely at `/manifestSha256`; the complete embedded tutorial manifest
  differs solely at `/artDesignBinding/sha256`, reflecting ART-DEC-013. The
  baseline tutorial hash is
  `42993421ce2020d0a2cba0405cf34462d55053f804a7e33620330f52d07b50e8`
  and the candidate hash is
  `9f24b5d99d984e58aff0a4dc97307bd8305aba2c63179631ed3681974a464874`.
  All 505 differential findings name that hash or those tutorial plans; the
  9,297-observation comparison retains the unchanged generated-question corpus
  hash. This identifies an approved metadata-change boundary, not an observed
  teaching-content difference. It remains a failing gate: the next required
  correction must validate the exact approved binding transition and continue
  detecting altered tutorial semantics or unapproved hashes. Do not delete the
  hash assertion, generally ignore tutorial metadata, or treat the diagnostic
  as a pass. The frozen run finished; no scanner or loop process remains active.

- **R3 — test structure:** after each test-module split, prove equal or stronger
  assertion identities, effect-map coverage, coverage, negative controls, and
  focused drift checks.

- **R3 approved tutorial metadata transition candidate:** the owner approved
  proceeding with the identified boundary correction on 2026-09-04. Quality
  policy `ART_DEC_013_TUTORIAL_METADATA_V1` binds the exact immutable R0 commit,
  ART-DEC-013, old/new tutorial fingerprints, old/new art-register bindings,
  and the only permitted manifest/plan pointers. The comparison verifies both
  canonical manifests and the exact approval record, then requires complete
  manifest equality after the single art-binding substitution. Only the
  corresponding exact plan fingerprint is translated in a comparison-only
  wrapper; runtime objects are untouched and altered teaching or unknown
  fingerprints remain failures. The full report retains the transition proof.
  Eight focused tests pass, including the live gate's six alteration controls
  and closed-policy mutation checks; the function-quality gate passes without
  any new exception. Independent review found a stale-baseline-plan-hash
  collision in the initial wrapper; a regression first reproduced that false
  pass. Every non-null candidate plan now requires the exact current hash
  before translation. The same reviewer verified the fix, null-plan behavior,
  and unchanged teaching-field sensitivity. Reviewed implementation SHA-256:
  `ccef30c14f39cc18ec8834b0f42bd5bcacb753297f92d4b85e07928c4e2eafca`;
  test SHA-256:
  `ed51eb208cba15dfcc6f849c829936d98d03de39b0ca8f4b2765276ea1ea5dfd`.
  The positive 9,297-observation comparison passed with unchanged discovery,
  witness, and question-corpus identities before that last defensive check;
  its report hash is
  `922c12a4400efbe22630b6c88d0aaf4677c6761c857fbee5dbf93ae43849507d`.
  All 17 focused driftless checks and quality measurements pass. Removing the
  unused `differentialFindings` export reduces the unused-export ceiling from
  81 to 80. Legacy lint warnings remain unchanged and mandatory for R4 cleanup.
  A new exact frozen complete loop, including all live differential controls,
  is still required; focused evidence does not seal the successor.

  **Owner-directed shutdown pause, 2026-09-04:** the successor's complete loop
  ran on exact staged tree `c74e77e46f4803f00b561af311d44e486c794067`.
  Compiler/contracts, architecture, tests/coverage, differential equivalence,
  property/fuzz, and mutation stages passed. Coverage remained 90.42 percent
  with complete structured evidence. The security stage stopped at the
  unchanged 180,000 ms npm-audit timeout; complexity/size and performance stages
  remained `NOT_RUN`. The candidate binding stayed exact. Failed report:
  `audit/.tmp-ai-change-loop-c74e77e4.json`, SHA-256
  `f48aafc143e1611d6612aef4e65f3212aadc6a718d77b755f0ff2e25371ad7d2`.
  The dependency-bootstrap identity mirror was updated to the exact reviewed
  policy version 1.2.0 and its new required field; focused bootstrap checks
  and the staged public-candidate guard passed before this loop.

  The single policy-permitted diagnostic npm audit also timed out at the same
  limit and does not qualify the failed run. Its report is
  `audit/.tmp-npm-timeout-diagnostic-result-2026-09-04.json`, SHA-256
  `6802a95f49a0c1a861800df0c171b22260f4144e9f2ae0ef5b9f8ad6e0ef0ffb`.
  Logs are retained solely in
  `audit/.tmp-npm-timeout-diagnostic-2026-09-04/`. npm initialized in 28 ms,
  prepared the dependency request, and then awaited its security-audit response.
  Official npm status reported Security Audit operational; registry GET,
  npm's own ping, and an empty gzip audit-endpoint POST returned successfully.
  These connectivity checks do not establish dependency safety or a definitive
  cause for the full-request timeout. No separate audit registry was configured.
  Investigate that request on resume; do not raise the timeout or silently
  retry the unchanged gate for green. All commands and the reviewer completed
  before this pause; no check or scanner from this run is left running.

  R4 preparation is read-only so far: the valid inventory is
  `audit/.tmp-r4-knip-reviewed-browser.json` (80 unused exports, two duplicate
  export groups). The earlier `audit/.tmp-r4-knip-inventory.json` came from an
  invocation missing the required browser configuration and is not qualifying
  inventory. `audit/.tmp-r4-eslint-inventory.json` records 584 warnings; 53 are
  in three Git-ignored historical review scripts. The owner has been asked
  whether those historical evidence scripts should remain unchanged outside
  live-code lint enforcement; no answer or exclusion is yet recorded. The other
  531 warnings remain required cleanup. Do not modify historical evidence or
  change lint scope without resolving that owner question. Nothing was pushed
  or published. All implementation remains staged; this pause note is the only
  unstaged change. Resume work only when the owner requests it.

- **R4 — final development handoff:** require build or syntax checks, all
  development tests, coverage and its non-regression floor, lint and metrics,
  architecture, dead-code and dependency checks, asset budgets, secret and
  security scans, public-candidate guard, the full driftless chain, and the
  repository-required independent review plus correction verification.

- **R4 reassessed browser-infrastructure batch:** the owner directed a larger
  coherent cleanup toward zero remaining warnings. Relative to tree
  `709234f7e6f9a277b3361ee1c67c7cb970d8b74c`, this batch corrects the measured
  npm version startup allowance and removes 61 live lint warnings, from 458
  to 397. Unused-variable, useless-escape, Promise-executor-return, and unsafe-
  finally counts reach zero. Remaining ceilings are cyclomatic 155, nesting 52,
  long functions 111, parameters 3, and statements 76. Function-quality legacy
  ceilings tighten to 155 cyclomatic, 233 ABC, 98 cognitive, and 115 function
  LOC violations. No lint rule or baseline source is weakened or excluded.

  Browser payload parsing, identity checks, process observation, and shard
  aggregation now have separate bounded helpers. The CDP client has one library
  owner. Shared operation cleanup preserves exact successful results and single
  thrown values, and retains both errors through AggregateError on simultaneous
  operation/cleanup failure. All four runner cleanup paths still own their
  resources. Mechanical edits retain effectful file reads and expected answers.
  The three new artifacts and dependency/test-entry edges are registered.
  Source changes total 616 added and 518 removed lines (net +98 including new
  modules and regression tests); the purpose is maintainability and preserved
  failure evidence, not a claimed line-count saving.

  The focused run passed 218 tests, followed by 17 drift tests and 12 blast-radius
  controls; architecture passed. All functions in the changed browser modules
  meet new-function CC/ABC/cognitive/LOC/nesting limits. A 549-case comparison of
  browser payload, aggregation, projection, and request outputs against the
  predecessor passed, with only native TypeError field-expression spelling
  normalized after sharing the same request traversal. Custom diagnostics and
  returned reports were compared exactly. Retained comparison report SHA-256:
  `9fd2c998134a304a01490b8b1d92e7a2c85c617bceb15dd519482eca0a12176e`.
  Independent review found no actionable findings on browser source SHA-256
  `e3ddd67e80f4858fe6a377c4b437d4a970d300812562140fc4d0490235f43be2` and
  security runtime `3d8cc43a2ad050393e6134aa03a38180267fdae72f7b75c12b2ca8e5464f1f56`.
  The corrected real npm sequence passed (version 5,419 ms, configuration
  2,159 ms, vulnerability audit 26,373 ms), with explicit zero vulnerabilities
  in all six severity counts. Final tightened function-quality and local quality
  validation pass, with zero Knip findings. A new complete frozen nine-stage
  loop remains pending for the combined checkpoint.

- **R4 generator-audit cleanup candidate:** the source-extraction checkpoint
  passed all nine stages with unchanged exact candidate binding on tree
  `d982263222c7990fb558fc0a121e163230293170`; report SHA-256
  `d65beb83bf374cb576bcda7378ea9d23e67b23bdc87a91ce94132b6a1e585876`.
  This remains a development checkpoint, not R4 or release completion.

  The generator audit now separates response building, contract checks,
  reachability, sample traversal, option validation, and choice search. Its
  two repeated choice-search bodies share one implementation while preserving
  the ordinary first-choice versus boundary base-question reference. The
  26 response handlers share identical recipient-history construction, retain
  the independent strategy oracle, and do not replace any other mathematical
  oracle. The existing source-extraction helper gains explicit module mode for
  testing the real audit functions without executing the complete audit.

  Before extraction, 1,464 generated states across all 26 methods were captured
  with SHA-256 `f866a895590f7893150ced09e872f1f92767ae384a7e5a0c4aedb419f4313571`.
  Seven fixture tests preserve those states, state identity, remainder/history
  ordering, and unreachable fraction/route/partition failures. Eight control-flow
  tests additionally protect counters, missing results, exception reporting,
  reference selection, the 32-offset search, stimulus diagnostics, and mutation
  failures. Two controls initially exposed a null-return skip introduced during
  extraction; separating successful returned values from caught exceptions
  corrected it without suppressing either test. All 25 focused tests, including
  ten shared-parser tests, now pass. All 188 measured functions in the audit,
  fixture module, and their two test files satisfy the new-function limits.

  The complete pre-change generator audit passed 72,576 questions, 40,824 choice
  searches, 36,819 pairs, and 4,005 suppressions across 126 skills with no issues;
  retained report SHA-256
  `2ed6620b8ab2f8773fdeae3a0b3ba8b3112888c610cf9b593932db0418a5ed20`.
  The first complete post-change report is byte-identical to that baseline.
  All 148 combined focused and drift tests passed. Independent review found no
  actionable issues in that revision. A subsequent inspection found requested-
  versus-generated skill labels had changed in outer-loop diagnostics; a failing
  regression reproduced it, requested-id propagation restored the prior messages,
  and all 26 post-correction focused tests pass. The same reviewer verified the
  correction on main-source SHA-256
  `dbaa9c7bbd846e73abb9dd8516904708f59e0be1e3b1177ee13683f548dc229b` and
  contract-test SHA-256
  `b9c39ac32cb6828be467477e1aeb3b5e229faf9176ec1a876566962a481290ba`.
  The complete final-source component rerun also passed and is byte-identical
  to the baseline report, including all counts, ordered inventories, and issues.

  Whole-repository live lint falls from 520 to 458: complexity warnings 172 to
  166, nesting 106 to 52, long functions 117 to 116, and statement-count warnings
  79 to 78. Function-quality legacy counts tighten to 166 cyclomatic, 240 ABC,
  103 cognitive, and 120 function-LOC violations. Knip remains zero in all four
  categories. Final ratchet/function-quality validation, generated-map check,
  and all 12 blast-radius controls pass. The exact-candidate nine-stage loop
  remains required; no passing checkpoint is claimed for this new slice yet.
  The main file falls from 782 to 630 lines, but its new fixture module adds
  276: combined infrastructure is 124 lines larger before new tests. This
  slice improves separation and complexity; it is not a net LOC reduction.
  No game/runtime bytes, selected corpus bounds, historical evidence, or
  independent expected-answer implementations were changed.

  The first frozen loop on tree `96472ac5634f643393721f041fddc624bdd9f4d2`
  passed compiler/types but failed architecture: the orchestrator imported the
  new helper from the audit-test zone. Later stages correctly remained
  `NOT_RUN`; failed-loop report SHA-256
  `7496a1968d795f849a7fba96a44feefdf00d9d0190445223a7e647ba7b6705cd`.
  The helper is corrected to `audit/lib/exhaustive-response-fixtures.mjs`;
  the original strategy-oracle import remains in the orchestrator and is
  explicitly injected into the library. No architecture rule or legacy edge
  exception was added or relaxed. Architecture and all 27 focused tests pass,
  including the real orchestrator-to-library oracle-wiring regression.
  Library SHA-256:
  `5ae73cc8d6e5ecf4a05923de388322617cd73842a521f18474e7b983c456a033`;
  main-source SHA-256:
  `3f0e114613f5ccd763f10b04917505e41038f39f8ab1467a399f57ad32a8c201`.
  Because the ordinary review and one correction-verification round were
  already completed, the owner explicitly approved one additional narrow
  verification of this relocation and dependency wiring by the same reviewer.
  That verification found no actionable findings and passed all 17 relevant
  contract/fixture tests. All 17 final drift tests and 12 blast-radius controls
  also pass. A new exact-candidate nine-stage loop remains pending; neither
  the failed loop nor the preceding component report clears this successor.

  A second frozen loop on tree `709234f7e6f9a277b3361ee1c67c7cb970d8b74c`
  passed compiler/types, architecture, tests and coverage (including all 36
  browser journeys and 90.42 percent engine branch coverage), differential
  equivalence, property/fuzz, and mutation checks. The security stage failed
  closed before an npm vulnerability result because the local reviewed npm
  version command exceeded its 30,000 ms limit; final quality and performance
  stages remained `NOT_RUN`. Retained failed-loop report SHA-256:
  `fe0b497ee3845cf364dabc1612ac145b8d68031253e9864107e02f743ce4eada`.
  A policy-permitted diagnostic retained that first result and measured the
  exact no-network npm version command at 44,862 ms with exit status zero and
  reviewed version 11.9.0. The immediately following local configuration
  command completed in 3,851 ms, parsed successfully, and found one approved
  registry setting with zero conflicts. No vulnerability audit request was
  made by either diagnostic. The evidence supports changing only the npm
  version cold-start timeout to 120,000 ms; the 30,000 ms configuration limit,
  180,000 ms network-audit limit, fail-closed process termination, zero-retry
  policy, exact version requirement, registry rejection, and zero-vulnerability
  ceilings remain unchanged. The owner authorized this correction and its
  independent review by directing continuation after the explicit proposal.
  A failing deadline regression demonstrated the former startup allowance;
  the correction gives version startup 120,000 ms and separates configuration
  at its original 30,000 ms. A second control requires startup failure to stop
  later commands without retry. No unchanged green retry is permitted.

  The owner's subsequent direction is to reassess and clear all remaining lint
  warnings. Continue with larger coherent batches: low-risk mechanical issues,
  shared audit infrastructure, independent test-suite helpers, and remaining
  complexity hotspots. Preserve independent mathematical oracles and function
  metric limits. Run focused effect-sensitive checks during implementation;
  each complete reviewed batch still requires the nine-stage loop. Report
  maintainability-warning counts separately from gameplay findings and include
  net lines, moved code, and added tests honestly in the final refactor audit.

- **R4 shared source-extraction candidate:** the browser-server checkpoint
  passed all nine stages with unchanged exact candidate binding on tree
  `5ebcb07bd5c9508ba51c236f72c657431bdb4efa`. Its retained report SHA-256 is
  `99c6138a6d7b61a32be867112f2ee1ae5883af15a8a76d62d98f2d8db5d480ac`;
  667 native tests, all 36 direct browser journeys, 90.42 percent engine branch
  coverage, and zero dependency vulnerabilities passed. This is not R4 completion.

  Four audit-test suites now share declaration, delimiter, and listener
  extraction using the already-approved ESLint parser. Source is never executed
  by extraction. Parsing replaces hand-written quote/comment scanners and
  rejects malformed source or missing/ambiguous declarations. Dedicated cases
  protect exact returned bytes, nested templates, regular expressions, comments,
  optional missing declarations, and isolated source state. The first test run
  failed for the absent implementation; all eight initial focused tests and 91
  combined consumer tests passed after integration. An additional commented-call
  regression and the permanent test entry are included for final verification.
  Product assertions, independent expected answers, fixtures, and runtime bytes
  remain unchanged. The two mixed HTML/JavaScript extraction suites retain their
  existing implementations pending a separately tested input-boundary migration.
  The four consumer files plus the shared helper shrink from 5,013 to 4,814
  physical lines (199 removed); added regression-test lines are separate.
  Cyclomatic, ABC, and cognitive legacy-violation counts each fall by four,
  and live lint falls from 524 to 520. Their ceilings and the four file-size
  ceilings are tightened, never raised or suppressed. Ownership and first-party
  records are updated. All 103 focused consumer/helper/ownership tests and six
  Feature Map tests pass, as do the 12 blast-radius controls, generated-map
  check, function-quality gate, and local quality gate (zero Knip findings).
  Independent review found no actionable findings and separately passed all
  92 consumer/helper tests. Reviewed helper SHA-256:
  `28d3c8c7d530388f705200009d818e8666a0b129361c5304625ad076939c566c`;
  helper-test SHA-256:
  `06431d330c5ef128d9c66004710ff56f5176b6cc2c5f4928c68daa6f76c29c96`.
  A new exact-candidate nine-stage loop remains pending for this slice.

- **R4 shared browser-server helper candidate:** the preceding combined
  checkpoint passed all nine development stages on exact staged tree
  `f3fa847c05792713a6f625af71be6595b5d6b8a7`, with 667 native tests, 90.42 percent
  branch coverage, zero dependency vulnerabilities, and unchanged candidate
  bindings. The retained full report SHA-256 is
  `a086248d3978074dc370a9b10ee91af88c8489e03d43ad87c3ee708a35776e4f`.
  This was a checkpoint pass, not completion of the remaining refactor.

  The next bounded consolidation moves repeated health observation, readiness
  polling, exit waiting, and runner-result handling from three Playwright runners into one audit
  library. Existing exact server-identity validation is reused. Startup and
  process-killing ownership remain in each runner; no helper can stop a
  process. Existing timeouts, polling delay, classification/error semantics,
  execution order, and mathematical oracles are preserved. Thirteen new focused
  tests protect behavior and wiring; the wiring test failed before integration
  and all thirteen pass after. Shared Promise executors no longer return ignored
  timer/emitter values, eliminating six lint warnings without suppressions.
  The sole owner and test-entry/dependency edges are registered. All 56 focused
  behavior, runner-contract, and drift tests pass, as do function-quality and
  local quality checks. Independent review found no actionable findings in the
  exact helper and runner changes. The three runners plus shared implementation
  contain 65 fewer operational lines than the preceding checkpoint; added
  regression tests are reported separately, not hidden in that reduction.
  Live lint warnings fall from 530 to 524 and the affected ratchet tightens
  from 26 to 20; no lint rule or suppression is weakened. Native-browser
  verification and a fresh full nine-stage development loop remain pending.

- **Owner approvals and security correction, 2026-09-04:** the owner explicitly
  approved sending dependency names/versions to `registry.npmjs.org` for the
  vulnerability audit, without game source, saves, or child data. The owner
  also approved preserving the three historical Git-ignored review scripts
  unchanged outside live-code lint enforcement. Quality policy 1.3.0 records
  their exact paths, byte hashes, 53 historical warnings, and explicit
  `OWNER_EXCLUDED_HISTORICAL_EVIDENCE` state. The ESLint configuration validates
  that closed policy and checks available historical bytes before excluding
  only those paths; modified or unreadable files fail closed. Absence on CI is
  permitted and never labelled a pass. The records and original findings remain
  retained. Live-code ratchets are reduced by precisely the historical counts;
  the remaining 530 warnings still require cleanup.

  The owner-approved isolated npm diagnostic completed in 29,551 ms rather
  than timing out, using a project-local cache, zero request retries, and a
  15-second request deadline within the unchanged overall limit. This does not
  prove which environment factor caused the earlier timeouts or qualify the
  failed full run. It reported one high-severity dependency finding covering
  four fast-uri advisories. Upstream identifies 3.1.6 as the patched 3.x
  version. The candidate changes only `node_modules/fast-uri` in the lockfile
  from 3.1.5 to 3.1.6, retaining all 375 entries and the BSD-3-Clause licence.
  Artifact integrity, source commit, licence/provenance records, guard mirror,
  and lockfile binding are updated together. A new Ajv-facing URI-resolution
  regression reproduced the old version's scheme-relative IDN failure before
  installation. The hardened install completed with lifecycle scripts and
  browser downloads disabled. The URI regression then passed, and the focused
  security gate reported explicit zeros in all six vulnerability counts;
  report SHA-256:
  `30c554d5a59826a8283416fe8e853d48ba22181da99cbd85e06402b3dc6ce10d`.
  That focused result does not seal the full refactor candidate.

  Follow-up inspection exposed a report-adapter false-pass route: missing
  vulnerability fields were defaulted to zero, and npm version/unsuccessful
  clean-report contradictions were not rejected. Two regressions reproduced
  those defects. The shared count validator now requires all six own integer
  fields, nonnegative values, and a consistent total. The parser requires
  report version 2 and an agreeing vulnerability dictionary; the command
  adapter enforces npm 11.9.0, accepted exit statuses, and failed-clean-report
  rejection. The live npm negative control now includes missing/partial
  reports. All 17 security-adapter tests pass, as do the patched URI and
  historical-scope tests, function-quality checks, and 17 driftless checks.
  The corrected incomplete unit fixtures now include every real npm count;
  their original low-severity rejection assertions remain. Independent review
  and exact post-correction qualification still remain required.

  Independent review additionally identified that ambient npm configuration
  could redirect the metadata audit away from the approved registry. A
  no-network regression reproduced that route. The successor pins the exact
  repository prefix, non-global mode, and `https://registry.npmjs.org/` in npm
  arguments, checks effective configuration locally, and rejects conflicting
  global, audit, or scoped registry settings before an audit request. It does
  not retain configuration contents. Security policy 1.1.0 and its closed schema
  bind the approved registry. Eighteen focused security tests and the
  function-quality gate pass. The same reviewer verified the correction,
  including no audit call on conflicting configuration. Reviewed runtime
  SHA-256: `5e3f379e6c5a207f6132002b25582676e812d97a58652dd32e24fbf9c0ac3bf0`;
  security-test SHA-256:
  `54352061cad8b1171f493eb34df12c2a4f868b47cb5c1a5eab8042f3d5f2d610`.
  The real post-correction security gate passed with all six vulnerability
  counts explicitly zero and all negative controls passing; report SHA-256:
  `93cc4dd0a17846a46083766dfd3f397982c6e349ca693d5f79d7cb537f9abb88`.
  Local quality checks pass with 530 live-code warnings under downward-only
  interim ratchets, zero unused exports, and zero duplicate-export groups.
  The three historical hashes remain unchanged. A new complete frozen loop
  remains required before advancing this combined checkpoint; the larger R4
  lint and duplicate-block consolidation work is still unfinished.

- **R4 local cleanup candidate, resumed 2026-09-04:** 80 unused exports across
  27 audit-library files were made private after checking tracked source and
  documentation for consumers. Internally used implementations remain intact;
  three truly unused helpers and unused literal constants were removed. Eager
  architecture-policy parsing/freezing is deliberately preserved without its
  unused binding. The existing evidence-hash helper now accepts already-built
  canonical bytes and serves both comparison outputs, replacing duplicate hash
  expressions without repeating canonicalization. A golden fingerprint test
  passed before and after that change. Knip reports zero unused exports and
  zero duplicate export groups; their ceilings are tightened to zero. Removing
  the unused SHA128 constant lowers unused-variable warnings from 13 to 12
  and the affected file ceiling from 882 to 881 lines. Overall lint is zero
  errors and 583 warnings; 53 historical-review warnings remain subject to the
  unanswered owner question above. No ignore or suppression was added.

  Independent review cleared this local cleanup, preserving module-load
  effects, current consumers, and test/oracle coverage. The reviewed source
  binding is SHA-256
  `71e51a9234b600cedaf78fe951ecba7b863daffcc145da536fb5029696e3f431`
  over the sorted JSON array of `{path,sha256}` for the 30 changed library,
  policy, and audit-lane-test files relative to staged `c74e77e4`. All 77 focused
  architecture, art, ownership, release-evidence, and census tests and both
  selected audit-comparison tests pass. Function-quality checks also pass.
  This remains a local, unsealed candidate, not refactor completion.

  The owner's added systematic duplicate-block review is now explicit in the
  finish line. Its initial JavaScript/inline-script census parsed all 159
  tracked units without errors and found 575 overlapping review candidates;
  report SHA-256:
  `88021ecdb6b003adf51cded2c23510dfbf9aed939ce51be49a7a76305dfa61bd`.
  A supplemental literal-window pass covered 16 PowerShell/CSS/inline-style
  units and found 132 overlapping candidates; report SHA-256:
  `5f18f0705ca0d1b0fe1f40d866809c34f03ebca9bf42dee36f41349bd75f9c85`.
  These are candidates, not confirmed defects or independent duplicate counts.
  Matching thresholds, source hashes, locations, and limitations are retained
  in `audit/.tmp-r4-duplication-census.json` and
  `audit/.tmp-r4-style-powershell-duplicates.json`. Shared delimiter/extraction
  setup in two adapter-test files warrants further review; repeated Git-tree
  hashing and launcher validation need explicit oracle/ownership analysis
  before consolidation. Neither those candidates nor the remaining lint
  cleanup has been completed. Generated copies and independent oracles must
  not be merged simply to reduce counts.

  After the shutdown, the app's safety reviewer refused the isolated npm
  diagnostic because package names/versions would be sent to npm's external
  registry. That rejected command did not execute. Explicit owner approval
  for that metadata-only transfer has been requested and remains pending;
  no workaround, proxy, substitute external scanner, or further npm audit
  request is authorized by this checkpoint. Local work can continue, but the
  full security stage and complete-loop qualification remain blocked on that
  approval and the unresolved audit timeout. No commit, push, tag, release,
  deployment, or historical-review-file mutation was performed.

The complete release gauntlet and Deep UX Census are not routine development
checks and remain reserved for a future exact frozen release candidate.

### Optional follow-ups alongside art work

These are owner-requested backlog items, not substitutes for R3/R4 requirements
or permission to weaken a gate:

- Reduce repeated tutorial and feature-inventory generation cost using only
  exact hash-bound reuse with effect-tested invalidation.
- Improve navigation and grouping of axe manual-review reports while retaining
  every exact case/cell/state, selector, and reason.
- Make long-running development checks report clearer live progress without
  changing their deadlines, retries, coverage, or pass semantics.

## Original game-mechanics research: Tiny Polka Dot

**Status:** Research report prepared, owner direction and exact child strings
approved, implementation work finished, and focused educational, game/IP, and
child-UX/accessibility re-reviews cleared on 2026-07-30. Permanent
effect-sensitive coverage is present. The change remains formally incomplete
until a new frozen versioned candidate passes final certification; the first complete-gate attempt correctly
stopped because the already-published Beta 3 offline shell was stale for these
new bytes.

Decision report:
[`research/tiny-polka-dot-mechanics-review.md`](../../research/tiny-polka-dot-mechanics-review.md)

Source supplied for investigation:
`https://www.amazon.ca/Tiny-Polka-Dot/dp/B01N1UUHP4/`

### Objective

Conduct a deep, evidence-backed investigation of the product's underlying
learning and play mechanics. Recommend mechanics that Math Quest could adapt
into independently designed digital activities without copying the product's
named games, rules text, card designs, artwork, trade dress, wording, examples,
or other protected expression.

### Required method

1. Use primary or otherwise authoritative public sources wherever possible,
   recording links, access dates, and the factual claim supported by each
   source.
2. Separate abstract mechanics and pedagogical principles from each source's
   particular creative expression. Treat uncertain legal or rights questions
   as unresolved rather than assuming permission.
3. Compare candidate mechanics against Math Quest's existing curriculum,
   engine, child UX, accessibility, privacy, offline, and platform contracts.
4. For every recommendation, provide:
   - the abstract mechanic or learning principle;
   - why it could help children learn;
   - an original Math Quest implementation concept;
   - how the concept differs materially from the referenced product;
   - applicable age, skill, and accessibility considerations;
   - provenance, licence, and intellectual-property risk notes; and
   - proposed effect-sensitive tests and independent review gates.
5. Reject any proposal that depends on copying protected text, visual identity,
   exact activity presentation, proprietary assets, or inadequately verified
   rights.
6. Have at most two bounded context-independent reviewers collectively cover
   the educational, game-design, child-UX, accessibility, and
   intellectual-property-risk lenses before implementation. Perspective labels
   are not separate agent roles; review follows the ownership, round, and
   verification limits in `AGENTS.md`.

### Deliverable

Produce a decision report for the project owner. Present recommendations and
meaningful trade-offs for approval before changing the game. This research is
not legal advice; obtain qualified legal review if a material rights question
remains unresolved.

## Beta 8 AI-rule rationale contract

**Status:** Owner-approved for Beta 8 by PB-052. Do not expand the Beta 7
candidate to implement this schema refactor.

### Objective

Make consequential rules easier for an AI agent to apply correctly in novel
cases without weakening the machine contract or creating prose as a second
authority.

### Required record shape

- Keep `threshold`, exact predicates, and enumerations normative and singular.
- Add normative `knownFalsePassModes` entries with stable IDs whenever a known
  shortcut could produce a false pass.
- Add adjacent non-normative `rationale.intent` and
  `rationale.userImpact` fields. They explain why the rule exists and what a
  miss costs the child or grown-up; they must not repeat threshold numbers.
- Resolve every conflict in favour of the normative field. Mandatory behaviour
  must never exist only in rationale prose.
- Require rationale for behavioural rules, thresholds, exceptions,
  human-legibility checks, and checks with plausible false-pass
  implementations. Exempt exact trivial mappings and enums where explanation
  would be boilerplate.

### Implementation and verification

1. Inventory the Owners, Code Map, Feature Map, Tutorial Manifest, Blast
   Radius, and gate records for consequential rule objects.
2. Extend their owning schemas and validators with one consistent rationale
   contract rather than independent prose conventions.
3. Keep rationale local to its rule and enforce deterministic field and record
   ordering for AI consumption.
4. Add focused mutations for missing rationale, orphaned or duplicate
   false-pass IDs, false-pass requirements hidden only in prose, numeric
   threshold duplication, and weakened precedence.
5. Regenerate derived projections and update the Code Map and blast-radius
   relationships in the same Beta 8 change.

Exit criterion: every consequential governed rule has one unambiguous
normative implementation contract, locally useful intent and user-impact
context, and effect-sensitive protection against its declared false passes.

## Certification-cycle efficiency review

**Status:** Cadence decision approved on 2026-08-02 and encoded in `AGENTS.md`
and `audit/certification-cadence-v1.json`. Ordinary development now uses
focused effect-sensitive checks. The complete certification system runs once
after an immutable candidate freeze and immediately before publication; an
early complete run requires explicit owner approval. Detailed audit-stage
performance telemetry remains a future optimization task.

### Objective

Investigate why complete release certification consumes so much elapsed time
and model usage without weakening the permanent fail-closed release policy.
Determine whether full gates are being restarted before a candidate is
actually frozen, which evidence can be reused safely, and which focused checks
should run during development before exactly one complete final candidate
gate.

### Remaining performance questions

1. Which audit stages dominate wall-clock time, machine time, output volume,
   and model review?
2. Which product or evidence changes legitimately invalidate earlier results?
3. Are independent critic rounds, browser profiles, exhaustive generation,
   mutation, coverage, and external evidence being scheduled at the right
   point?
4. Can immutable hashes, cached artifacts, resumable evidence, and an explicit
   candidate-freeze step prevent unjustified repetition?
5. Can routine changes use a documented focused-test matrix while preserving
   one complete applicable certification gate before publication?
6. Which failures are product defects, obsolete assertions, harness defects,
   environmental failures, or approval/evidence gates?
7. How should timing and invalidation telemetry be added so future
   optimization is evidence-based?

The deliverable should be a proposed development/release test cadence, an
evidence invalidation matrix, audit-stage timing data, and a prioritized list
of safe efficiency improvements for owner approval.
