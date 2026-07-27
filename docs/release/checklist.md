# Math Quest Public Beta 1 release checklist

Target tag: `v1.0.0-beta.1`

## Public tree

- [x] Use the MIT License for original project code and documentation.
- [x] Require every bundled asset, adapted or quoted source, and executable
  workflow dependency to be original MIT work, verified public domain/CC0, or
  under a compatible reviewed open licence permitting commercial use,
  redistribution, and modification.
- [x] Record exact bundled hashes and immutable workflow commits in
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
- [x] Run text, filename, metadata, archive, and secret scans over the exact
  staged tree.
- [x] Run the open-component register, licence allowlist, attribution, and
  restrictive-licence guard over the exact staged tree.
- [x] Require the generated public-file manifest to match the staged Git index
  exactly.
- [ ] Use a neutral repository name and public-safe Git author identity.

## Runtime and state

- [x] Confirm runtime skill order, levels, stage labels, generators, and Parent
  Test choices exactly equal the canonical manifest.
- [x] Confirm state schema version 2 and progress key `math-quest:v2`.
- [x] Confirm older private pre-beta data remains untouched and is not mapped
  into new evidence.
- [x] Verify invalid or incompatible imports leave live data unchanged.
- [x] Verify required fonts, sounds, icons, and models are local or inline.
- [x] Verify no post-load gameplay request, analytics, tracker, remote speech,
  cloud sync, or third-party runtime dependency.

## Complete release review

- [x] Record the exact canonical manifest SHA-256 and exact engine SHA-256.
- [x] Reproduce the approved child-string table and its exact digest.
- [x] Run the complete deterministic engine and grading suite.
- [x] Exercise all 126 skills through generator, grader, model, and Parent Test
  paths.
- [x] Run all mastery, spacing, demotion, re-teaching, promotion, fatigue,
  stopping, capstone, and isolation boundaries.
- [x] Calibrate native branch coverage and meet the required threshold.
- [x] Kill every required disposable mutation family.
- [x] Run browser smoke tests against the shipped page.
- [x] Run desktop, phone, and tablet visual/accessibility reviews.
- [x] Reconcile predicted and actual counts and document all failures, skips,
  and residual risks.
- [x] Before the final independent review, add
  `PUBLICATION_CLEARANCE.md` with `Status: PENDING`, then synchronize and
  inspect the component register and public-file manifest.
- [x] Promote that pending record to `Status: APPROVED` only after successful
  independent review, bound to the exact manifest, engine, open-component
  rights state, public-payload digest, and payload-tree OID.
- [x] Re-run the fail-closed audit with that exact clearance record.

## Repository and Pages settings

- [ ] Confirm control of the dedicated `OpenMathQuest` GitHub organization.
- [ ] Reserve that organization exclusively for Math Quest Pages; do not
  publish an unrelated Pages site under its shared browser origin.
- [ ] Create or verify the public root repository
  `OpenMathQuest/openmathquest.github.io`.
- [ ] Enable private vulnerability reporting.
- [ ] Enable secret scanning and push protection where available.
- [ ] Protect the default branch and require release checks.
- [ ] Protect `v1.0.0-beta.1` from deletion or movement after it is created.
- [ ] Configure GitHub Pages to deploy through GitHub Actions.
- [ ] Confirm no CNAME or custom domain is configured.
- [ ] Enforce HTTPS for `https://openmathquest.github.io/`.
- [ ] Require the deployment workflow to run only in
  `OpenMathQuest/openmathquest.github.io`, dispatched from protected `main`
  while it points to the exact annotated tag supplied as `release_tag`,
  `v1.0.0-beta.1`, with `VERSION` equal to `1.0.0-beta.1`.
- [ ] Confirm the Pages action and API report the root origin
  `https://openmathquest.github.io`, an empty base path, an empty CNAME, and
  the GitHub Actions publishing source.
- [ ] Obtain any privacy or legal review appropriate to intended child-facing
  jurisdictions.

## Release

- [ ] Push the exact cleared commit and annotated `v1.0.0-beta.1` tag without
  altering the reviewed tree.
- [ ] Run the manual **Deploy Math Quest to Pages** workflow from protected
  `main`, leaving the exact `release_tag` input as `v1.0.0-beta.1`; the
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
  `v1.0.0-beta.1` tag.
