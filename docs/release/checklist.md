# Math Quest Public Beta 5 release checklist

Target tag: `v1.0.0-beta.5`

Status terms follow the
[`AGENTS.md` finished-work policy](../../AGENTS.md#what-counts-as-finished-work).
The prepublication certification items govern **release-certified** status for
an exact frozen candidate; **implemented** work has only its real production
path and focused checks, and the Release section records when the certified
bytes are **shipped**.

Checked items describe current, reviewed evidence only. Beta 1 evidence and
focused development runs do not satisfy an unchecked Beta 5 release item. The
exact-candidate items below remain unchecked until the working tree is frozen,
synchronized, and rerun through the complete gate.

During development, run `audit/run-audit.ps1 -DevelopmentOnly` plus the focused
effect-sensitive checks required by each change. These runs may establish
**implemented** status, but do not establish **release-certified** status or
satisfy a release item. Once every planned game/runtime change is committed,
create the Beta 5 qualification commit with final game/runtime/PWA bytes and
pending clearance records. Run the trusted-HTTPS canary and hosted-Windows
observation against that exact protected-main commit, then create the exact
two-file runtime-equivalent evidence successor defined by PB-046. Freeze that
successor as the candidate. Run the complete certification system once against
it immediately before tagging and deployment. Any later change requires a new
qualification/successor sequence, freeze, and complete rerun.

## Public tree

- [x] Use the MIT License for original project code and documentation.
- [x] Require every bundled asset, adapted or quoted source, and executable
  workflow dependency to be original MIT work, verified public domain/CC0, or
  under a compatible reviewed open licence permitting commercial use,
  redistribution, and modification.
- [ ] Record exact bundled hashes and immutable workflow commits in
  `licenses/component-register-v1.json`.
- [x] Require registered first-party paths to match a separately reviewed
  declaration that the inventory synchronizer cannot expand automatically.
- [x] Require every licence, attribution, policy, and provenance evidence file
  to match a separately reviewed path, purpose, licence expression, and hash.
- [x] Reject unknown, non-commercial, no-derivatives, personal-use,
  educational-only, permission-only, and royalty-free-only terms.
- [x] Prohibit BBC RemArc recordings under their ordinary archive terms.
- [x] Replace platform emoji artwork with original code-drawn Math Quest icons.
- [x] Require the public-candidate guard to inspect staged Git blobs and fail on
  unregistered assets, hash changes, missing evidence, or floating Actions.
- [x] Define a neutral, independently authored 21-level/126-skill curriculum
  manifest contract.
- [x] Freeze and validate `curriculum/math-quest-manifest-v1.json`.
- [x] Confirm the public tree contains no publisher-derived taxonomy, wording,
  identifiers, grouping, sequence, or public old-to-new crosswalk.
- [x] Confirm no private save, working note, screenshot corpus, local report,
  curriculum reference PDF, unrelated handoff, or ZIP archive is staged.
- [ ] Run text, filename, metadata, archive, and secret scans over the exact
  staged tree.
- [x] Execute and verify the owner-authorized disposition for the obsolete
  personal-name fixture still reachable through Beta 1 ancestry and published
  tags. If history is rewritten, scan every surviving public head/tag and
  record that existing clones or caches cannot be recalled; if it is retained,
  bind the owner's explicit residual-risk acceptance and do not claim all
  reachable history is de-identified.
  Owner decision recorded 2026-08-03: retain the existing public history and
  accept the narrow obsolete-fixture residual risk. Current-tree and
  exact-candidate scans remain mandatory.
- [ ] Run the open-component register, licence allowlist, attribution, and
  restrictive-licence guard over the exact staged tree.
- [ ] Require the generated public-file manifest to match the staged Git index
  exactly.
- [x] Use a neutral repository name and public-safe Git author identity.

## Runtime and state

- [x] Confirm runtime skill order, levels, stage labels, generators, and Parent
  Test choices exactly equal the canonical manifest.
- [x] Confirm state schema version 3 and protected progress key
  `math-quest:progress:v2`; the key identifies the Public Beta 2 namespace,
  not the internal object schema.
- [x] Confirm a valid Beta 1 `math-quest:v2` record is read-only migration
  input, copied only under the new writer lease, and cannot overwrite the
  protected Beta 2 key afterward.
- [x] Confirm incomplete Beta 1 cutover writes only the constant non-PII
  `math-quest:progress:v2:beta1-migration-guard:v1` marker, reload ignores an
  unproven protected copy, source/guard events fail closed, and the marker
  clears only after exact source stability across the protected write.
- [ ] On the frozen candidate, prove exact schema-2 progress and backups add
  only the neutral placement record and zero-valued draft generation, validate
  completely before replacement, preserve all prior evidence, and export
  canonically as schema 3. Prove a
  rejected migration or schema-3-to-schema-2 downgrade leaves stored bytes
  unchanged.
- [ ] Prove the exclusive writer lease blocks concurrent tabs while an older
  Beta 2 build fails closed on schema 3; do not infer mixed-version
  compatibility from serialization alone.
- [x] Confirm older private pre-beta data remains untouched and is not mapped
  into new evidence.
- [x] Verify invalid or incompatible imports leave live data unchanged.
- [ ] Verify the optional 10-to-20-question starting-point check across every
  recommendation boundary, answer-control family, crash/reload point, and
  responsive profile; confirm its draft remains separate from ordinary
  progress and that applying a result is transactional, never lowers progress,
  and creates no ordinary mastery evidence. Confirm every fresh start/retry
  commits a new private non-PII nonce before exposing its derived-seed draft,
  resume is deterministic, and bounded resampling/fallback prevents repeated
  child-visible semantic tasks within a run.
- [ ] Verify `math-quest:placement-draft:v1` contains only bounded
  contract/generator identity, a local progress-baseline consistency
  fingerprint, the exact persisted nonnegative draft generation, nonce, seed,
  day, theme, question IDs, exact response kinds, and partial controls; excludes
  nickname, age, timing, mastery evidence, logs, analytics, and backups; is
  removed on discard and invalidated before removal on reset, successful
  import, and successful apply; and fails closed when stale, corrupt,
  oversized, or conflicting. Inject `removeItem` failure and prove reload
  rejects the surviving old generation; inject main-write failure and prove
  the old generation and draft remain recoverable.
- [ ] Verify the grown-up result remains an unvalidated broad heuristic,
  reports correct/incorrect/Not sure separately, marks abstention-limited
  confidence and offers a fresh retry, while fresh sound and automatic speech
  stay off and co-play/Replay/Not sure guidance remains accessible.
- [x] Effect-inject unreadable-main recovery beside a surviving generation-one
  draft and prove reset, import, and apply commit generation two before a
  failing removal; prove maximum-safe-integer exhaustion mutates no input.
- [x] Verify required fonts, sounds, icons, and models are local or inline.
- [x] Verify no post-load gameplay request, analytics, tracker, remote speech,
  cloud sync, or third-party runtime dependency.
- [ ] Verify the exact detached Beta 5 shell manifest, byte hashes, MIME
  bindings, waiting-worker update, repair, and readiness protocol.
- [x] For Beta 5, record the owner's 2026-08-12 decision not to run either
  optional cycle. Use exact `OPTIONAL_NOT_RUN`/`NONE`/zero/`NOT_RUN` fields for
  physical devices and exact `OPTIONAL_NOT_RUN`/`NONE`/zero fields for the six
  reviewers; make no physical-device, platform, or independent-review claim.

## Release preparation and single complete review

The automated, browser, visual, and evidence checks listed below are stages of
one final complete certification cycle after the approved records and exact
candidate commit are frozen. Focused development checks may exercise the same
effects earlier, but do not constitute another complete cycle.

- [ ] Record the exact canonical manifest SHA-256 and exact engine SHA-256.
- [x] Project owner approved the complete 397-record `child-strings-v1` table on
  2026-08-08. Bind and verify the exact approved candidate and its SHA-256
  `a79ec7cd26e2023073e352adad32c5c8ff854e36fe6ca2c0362fdedfbc8a7e9e`.
- [ ] Run the complete deterministic engine and grading suite.
- [ ] Exercise all 126 skills through generator, grader, model, and Parent Test
  paths.
- [ ] Run all mastery, spacing, demotion, re-teaching, promotion, fatigue,
  stopping, capstone, and isolation boundaries.
- [ ] Calibrate native branch coverage and meet the required threshold.
- [ ] Kill every required disposable mutation family.
- [ ] Run browser smoke tests against the newly frozen shipped page with zero
  unexplained failures.
- [ ] Run all 16 direct-user Playwright journeys in the exact installed-Edge
  desktop and touch-phone projects with zero failures, skips, retries,
  unexpected requests, page errors, or console errors.
- [x] Record Beta 5 as exact `NOT_REQUIRED_BY_CADENCE` under
  `ALTERNATING_BETA_V1`; do not dispatch the complete hosted Playwright Deep UX
  Census for this odd-numbered beta. The local 100-cell benchmark may run only
  as a non-certifying development benchmark and cannot satisfy a release item.
- [ ] Commit the qualification revision to protected `main` only after its
  game/runtime/PWA bytes are final and both clearance records are pending. Run
  the trusted-HTTPS canary and hosted-Windows identity observation against that
  exact commit. Require canary state `RECONCILED` with its canonical evidence
  digest, and download and review the machine-readable Windows artifact's exact
  browser product, full version, executable SHA-256, hosted `ImageOS`, and
  hosted `ImageVersion`; neither preparatory run certifies release readiness.
- [ ] Promote `audit/browser-runner-evidence-v1.json` from `PENDING` to
  `REVIEWED`, copy the same five-field tuple and the reconciled canary binding
  into publication clearance, and create the qualification commit's immediate
  non-merge sole child. Require its exact diff to contain only
  `PUBLICATION_CLEARANCE.md` and `audit/browser-runner-evidence-v1.json`; prove
  every game/runtime/PWA byte remains identical before the single final audit.
- [x] Record `windows-latest` as a Medium floating-runner residual; do not
  accept the label itself as reproducible evidence.
- [ ] Within the final cycle, run desktop, phone, and tablet
  visual/accessibility reviews after the current remediation and bind their
  evidence to the frozen candidate.
- [ ] Reconcile predicted and actual counts and document all failures, skips,
  and residual risks.
- [x] Before the final bounded independent review under `AGENTS.md`, add
  `PUBLICATION_CLEARANCE.md` with `Status: PENDING`, then synchronize and
  inspect the component register and public-file manifest.
- [ ] In the runtime-equivalent evidence successor, promote that pending record
  to `Status: APPROVED` only after successful independent review, bound to the
  exact manifest, engine, open-component rights state, successor public-payload
  digest, payload-tree OID, qualification runtime snapshot and canary evidence,
  browser executable, and GitHub-hosted runner image tuple.
- [ ] Populate all eight closed-schema external evidence records in that same
  clearance. For Beta 5, five mandatory PASS records are reconciled canary,
  approved adjudication, complete finding dispositions, exact hosted-Windows
  evidence, and owner `PR_PUSH_AUTHORIZED` authorization for
  `v1.0.0-beta.5` on `refs/heads/main`. Bind the current host review as exact
  `DEFERRED_PRERELEASE`, which must appear as DEFERRED rather than PASS. The
  owner declined both offered optional cycles for Beta 5, so record the
  six-device and six-reviewer records as exact `OPTIONAL_NOT_RUN` with
  `NONE` evidence and zero required/completed counts.
- [ ] Use one designated bounded adjudicator role. Do not infer a critic cohort
  from the mandatory adjudication or finding-disposition records.
- [ ] Confirm the external evidence review window is current, every evidence
  digest and review-bundle digest is exact, Critical/High/open-unaccepted
  Medium/unrecorded Low counts are zero, and the audit reports all five Beta 5
  mandatory external gates PASS, including `EXT-CANARY: PASS` backed by exact
  `RECONCILED` evidence, `EXT-HOST` visibly DEFERRED, and each optional
  record either PASS or visibly OPTIONAL rather than merely matching the
  expected count.
- [ ] After the canary and hosted evidence are reviewed, create only the
  `RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1` sole-child successor described
  above. Validate its exact two-path diff and exact runtime/PWA byte identity,
  then freeze that successor and run the single complete fail-closed
  certification system from the beginning.

Historical note: the Emergency Beta 3 exception applied to
`v1.0.0-beta.3` only. It cannot authorize Beta 4 or Beta 5. The distinct
2026-08-02 owner directive ordinarily applies to Beta 4 and later
semantic-version prereleases. For Beta 4, the later 2026-08-09 release-scoped
decision yielded four mandatory PASS records, one visible non-passing host
deferral, one visible non-passing owner-skipped canary, and two offered optional
records under `DIRECT_EVIDENCE_SUCCESSOR_V1`. That canary skip and successor
policy expired with Beta 4. Beta 5 returns to five mandatory PASS records and
uses `RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1`; stable releases return to six
mandatory PASS records unless a later owner directive explicitly changes them.

## Repository and Pages settings

- [x] Confirm control of the dedicated `OpenMathQuest` GitHub organization.
- [x] Reserve that organization exclusively for Math Quest Pages; do not
  publish an unrelated Pages site under its shared browser origin.
- [x] Create or verify the public root repository
  `OpenMathQuest/openmathquest.github.io`.
- [x] Enable private vulnerability reporting.
- [ ] Enable secret scanning and push protection where available.
- [ ] Protect the default branch and require release checks.
- [x] Preserve and protect the immutable `v1.0.0-beta.1` release tag.
- [x] Preserve and protect the immutable `v1.0.0-beta.3` release tag.
- [x] Preserve and protect the immutable `v1.0.0-beta.4` release tag.
- [ ] Protect `v1.0.0-beta.5` from deletion or movement after it is created.
- [ ] Configure GitHub Pages to deploy through GitHub Actions.
- [x] Confirm no CNAME or custom domain is configured.
- [x] Enforce HTTPS for `https://openmathquest.github.io/`.
- [ ] Require the deployment workflow to run only in
  `OpenMathQuest/openmathquest.github.io`, dispatched from protected `main`
  while it points to the exact annotated tag supplied as `release_tag`,
  `v1.0.0-beta.5`, with `VERSION` equal to `1.0.0-beta.5`.
- [ ] Confirm the Pages action and API report the root origin
  `https://openmathquest.github.io`, an empty base path, an empty CNAME, and
  the GitHub Actions publishing source.
- [x] Record the owner-directed `DEFERRED_PRERELEASE` host state and disclose
  ordinary provider request metadata without claiming host approval.
- [ ] Before the first stable release, obtain the privacy/legal review
  appropriate to intended child-facing jurisdictions or move the runnable game
  to a host that receives affirmative qualification.

## Release

- [ ] Freeze the exact cleared commit on protected `main`, then dispatch
  **Math Quest checks** with `candidate_sha` equal to that commit and
  `release_tag` equal to `v1.0.0-beta.5`. Require the complete, non-technical-
  only certification job to pass before creating the tag.
- [ ] Push the exact cleared commit and annotated `v1.0.0-beta.5` tag without
  altering the reviewed tree.
- [ ] Run the manual **Deploy Math Quest to Pages** workflow from protected
  `main`, leaving the exact `release_tag` input as `v1.0.0-beta.5`; the
  workflow must check out and deploy that tag, reject any commit mismatch, and
  require a successful release-certification run for the same commit without
  rerunning the complete gauntlet.
- [ ] Verify the deployed artifact contains only the explicit runtime
  allowlist.
- [ ] Verify `https://openmathquest.github.io/` serves the tagged artifact over
  HTTPS with no unexpected redirect, base path, CNAME, or third-party request.
- [ ] Run the live hosted smoke in desktop Edge plus automated phone and tablet
  viewports. Retain physical iPhone/iPad observation as `OPTIONAL_NOT_RUN` for
  Beta 5 and make no physical-device qualification claim.
- [ ] Verify nickname entry/removal, touch controls, local sound and speech,
  reload persistence, backup, restore, reset, and Parent Test isolation.
- [ ] Verify storage is absent from unrelated origins and confirm the
  `OpenMathQuest` organization has no unrelated Pages deployment sharing this
  origin.
- [ ] Change the hosted URL in `README.md` from an approved target to a
  verified live deployment only after the hosted checks pass.
- [ ] Publish beta-labelled GitHub release notes from the verified
  `v1.0.0-beta.5` tag.
