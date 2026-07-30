# Math Quest Public Beta 3 release checklist

Target tag: `v1.0.0-beta.3`

Checked items describe current, reviewed evidence only. Beta 1 evidence and
focused development runs do not satisfy an unchecked Beta 3 release item. The
exact-candidate items below remain unchecked until the working tree is frozen,
synchronized, and rerun through the complete gate.

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
- [ ] Verify the exact detached Beta 3 shell manifest, byte hashes, MIME
  bindings, waiting-worker update, repair, and readiness protocol.
- [ ] Verify Safari and installed-app storage-container wording, installation
  recovery, and offline cold launch on the required physical Apple matrix.

## Complete release review

- [ ] Record the exact canonical manifest SHA-256 and exact engine SHA-256.
- [x] Reproduce the approved 276-record `child-strings-v1` table and exact
  SHA-256 `c760fa2c04939547fd24ab61aa13dacc46ab1d91506720fbc22ef63eee03ebfd`.
- [ ] Run the complete deterministic engine and grading suite.
- [ ] Exercise all 126 skills through generator, grader, model, and Parent Test
  paths.
- [ ] Run all mastery, spacing, demotion, re-teaching, promotion, fatigue,
  stopping, capstone, and isolation boundaries.
- [ ] Calibrate native branch coverage and meet the required threshold.
- [ ] Kill every required disposable mutation family.
- [ ] Run browser smoke tests against the newly frozen shipped page with zero
  unexplained failures.
- [ ] Download the machine-readable Windows audit artifact and review the
  exact browser product, full version, executable SHA-256, hosted `ImageOS`,
  and hosted `ImageVersion`.
- [ ] Promote `audit/browser-runner-evidence-v1.json` from `PENDING` to
  `REVIEWED`, copy the same five-field tuple into publication clearance, and
  prove that a fresh audit of the same commit matches it exactly.
- [x] Record `windows-latest` as a Medium floating-runner residual; do not
  accept the label itself as reproducible evidence.
- [ ] Re-run desktop, phone, and tablet visual/accessibility reviews after the
  current remediation and bind their evidence to the frozen candidate.
- [ ] Reconcile predicted and actual counts and document all failures, skips,
  and residual risks.
- [x] Before the final independent review, add
  `PUBLICATION_CLEARANCE.md` with `Status: PENDING`, then synchronize and
  inspect the component register and public-file manifest.
- [ ] Promote that pending record to `Status: APPROVED` only after successful
  independent review, bound to the exact manifest, engine, open-component
  rights state, public-payload digest, payload-tree OID, browser executable,
  and GitHub-hosted runner image tuple.
- [ ] Populate all eight closed-schema external evidence records in that same
  clearance: host/privacy approval, reconciled canary, all six device lanes
  plus primary-iPad journey, six sealed reviewer reports, approved
  adjudication, complete finding dispositions, exact hosted-Windows evidence
  digest, and owner `PR_PUSH_AUTHORIZED` authorization for
  `v1.0.0-beta.3` on `refs/heads/main`.
- [ ] Confirm the external evidence review window is current, every evidence
  digest and review-bundle digest is exact, Critical/High/open-unaccepted
  Medium/unrecorded Low counts are zero, and the audit reports all eight
  external gates PASS rather than merely matching the expected count.
- [ ] Re-run the fail-closed audit with that exact clearance record.

Emergency Beta 3 exception: the owner authorized `EMERGENCY_APPROVED` for this
tag only. Six external gates must remain visibly `WAIVED` with zero/unknown
counts; they must not be checked off or represented as completed. Reviewed
hosted-Windows evidence, exact owner authorization, and every automated,
privacy, licensing, immutable-tag, and deployment check remain required.

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
- [ ] Protect `v1.0.0-beta.3` from deletion or movement after it is created.
- [ ] Configure GitHub Pages to deploy through GitHub Actions.
- [x] Confirm no CNAME or custom domain is configured.
- [x] Enforce HTTPS for `https://openmathquest.github.io/`.
- [ ] Require the deployment workflow to run only in
  `OpenMathQuest/openmathquest.github.io`, dispatched from protected `main`
  while it points to the exact annotated tag supplied as `release_tag`,
  `v1.0.0-beta.3`, with `VERSION` equal to `1.0.0-beta.3`.
- [ ] Confirm the Pages action and API report the root origin
  `https://openmathquest.github.io`, an empty base path, an empty CNAME, and
  the GitHub Actions publishing source.
- [ ] Obtain any privacy or legal review appropriate to intended child-facing
  jurisdictions.

## Release

- [ ] Push the exact cleared commit and annotated `v1.0.0-beta.3` tag without
  altering the reviewed tree.
- [ ] Run the manual **Deploy Math Quest to Pages** workflow from protected
  `main`, leaving the exact `release_tag` input as `v1.0.0-beta.3`; the
  workflow must check out and deploy that tag and reject any commit mismatch.
- [ ] Verify the deployed artifact contains only the explicit runtime
  allowlist.
- [ ] Verify `https://openmathquest.github.io/` serves the tagged artifact over
  HTTPS with no unexpected redirect, base path, CNAME, or third-party request.
- [ ] Test Windows desktop, iPhone, and iPad.
- [ ] Verify nickname entry/removal, touch controls, local sound and speech,
  reload persistence, backup, restore, reset, and Parent Test isolation.
- [ ] Verify storage is absent from unrelated origins and confirm the
  `OpenMathQuest` organization has no unrelated Pages deployment sharing this
  origin.
- [ ] Change the hosted URL in `README.md` from an approved target to a
  verified live deployment only after the hosted checks pass.
- [ ] Publish beta-labelled GitHub release notes from the verified
  `v1.0.0-beta.3` tag.
