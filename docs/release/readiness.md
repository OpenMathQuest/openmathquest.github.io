# Public Beta 2 release readiness

This document describes the release boundary; it is not publication approval.

## Local candidate requirements

A candidate is technically ready only when the generated
`audit/final-build-report.md` records:

- matching predicted and actual audit counts;
- zero required deterministic, semantic, browser, accessibility, or launcher
  failures;
- a reviewed classification for every failure or materially affected check
  distinguishing product, obsolete-test, environment/harness, and pending
  evidence/approval causes, with equal-or-stronger effect coverage recorded
  for every replaced assertion;
- calibrated branch coverage of at least 88 percent for the exact shipped
  engine;
- all representative mutation families killed;
- exhaustive generator and exact-grading checks passed;
- exact schema-2 progress and backup fixtures migrated transactionally to
  schema 3 under the unchanged `math-quest:progress:v2` key, with evidence
  preservation, canonical schema-3 export, downgrade rejection, and
  mixed-version-tab fail-closed effects demonstrated; first-write and Beta 1
  cutovers now use two durable constant non-PII guard values whose surviving
  state forces reload to recheck an interrupted blank or reconcile from the
  newest Beta 1 source rather than unproven protected bytes; exact virgin-state
  detection also prevents a lost marker plus storage-access failure from
  letting untouched blank state hide valid Beta 1 progress;
- the separate `math-quest:placement-draft:v1` record proved bounded,
  privacy-minimized, excluded from backups, and removed on discard, reset,
  successful import, and successful application, with stale/corrupt/conflict
  paths leaving progress unchanged; reset/import/apply commit a later persisted
  generation beyond current, imported, and safely parsed draft floors before
  removal—even during unreadable-main recovery—and a throwing `removeItem` cannot revive the
  surviving old draft after reload, and a failed main write preserves the
  prior generation and recoverable draft;
- all 28 starting-point input methods rendered in the real child placement
  wrapper under the deterministic 10/9/9 desktop/tablet/phone matrix, with 18 px essential
  child text, 44 px targets, first-screen portrait actions, exact Replay
  prompts, positional narration of every visible selection option, neutral
  **Not sure** feedback, separate response counts and limited-abstention
  confidence, an explicit grown-up-only application boundary, no
  route-grid/arrow or pattern-slot/token/Undo collisions, and a real
  `PICTURE_CHOICE` notice occupying its own row before all child task content;
- a fresh transactionally committed non-PII placement nonce/seed for every
  start and retry, deterministic resume, and no repeated child-visible
  semantic task within a run after bounded resampling/fallback;
- project-owner approval of the exact frozen child-facing string table,
  canonicalized as `child-strings-v1`, with its exact non-empty SHA-256 shipped
  and reproduced by the browser gate;
- the staged privacy, metadata, secret, provenance, and open-component guard
  passed; and
- identical public-payload and payload-tree identities before and after the
  audit;
- a current `release-shell-v1.json` whose listed bytes and embedded worker
  binding pass `tools/build-pwa-release-manifest.mjs --check`; and
- zero failures in `audit/tests/pwa-release.test.mjs`.
- a successful GitHub-hosted Windows audit artifact recording the exact
  browser product, full product version, executable SHA-256, `ImageOS`, and
  `ImageVersion`; and
- a `REVIEWED` `audit/browser-runner-evidence-v1.json` tuple that matches both
  that live audit and the exact fields in `PUBLICATION_CLEARANCE.md`.
- exactly eight reported external release-evidence gates: host/privacy
  qualification, canary reconciliation, the six-lane physical-device matrix,
  six sealed independent-reviewer reports, independent adjudication, complete
  finding disposition, reviewed hosted-Windows evidence, and exact
  project-owner `PR_PUSH_AUTHORIZED` authorization; and
- a current (already reviewed and not expired) external-evidence window, exact
  evidence digest for every gate, zero open Critical/High findings, zero
  unaccepted Medium findings, zero unrecorded Low findings, the Beta 2 tag and
  protected-main binding, and the canonical review-bundle digest.

The generated report is intentionally ignored because it contains a run
timestamp and is regenerated from the exact staged tree. Its host paths are
sanitized before writing.

## Publication boundary

Preparing and auditing the repository does not publish it. Deployment remains
fail-closed while `PUBLICATION_CLEARANCE.md` is absent or does not match the
exact engine, curriculum manifest, rights state, payload digest, and payload
tree.

The payload identity covers every staged entry except the bytes of
`PUBLICATION_CLEARANCE.md`. The clearance path still has to be classified in
the component register, listed in the exact public-file manifest, inspected by
the guard, and match the working tree. Excluding only its approval bytes avoids
a cryptographic self-reference while leaving the reviewed release payload
stable.

The remaining host/privacy, adversarial-review, and physical-device
requirements are listed in `docs/release/ios-ipados-pwa-beta2-plan.md` and
`docs/release/publication-gates.md`. The manual Pages workflow must not be run
until those gates are independently completed.

These requirements are now machine-enforced through the closed ordered
`PUBLICATION_CLEARANCE.md` schema. The ordinary audit predicts and observes
eight external gates (262 total counted results). Any missing, additional,
reordered, malformed, pending, unknown, stale, future-dated, artifact-
mismatched, browser-evidence-mismatched, open-finding, incomplete-lane,
incomplete-reviewer, tag/ref-mismatched, or unauthorized state is classified
as `PENDING_EVIDENCE_APPROVAL_GATE`. It must appear under pending checks and
unverified claims, and it forces `External release evidence: BLOCKED` and
`Shippable: NO`. An exit-zero technical-only evidence run is not release
approval and does not alter those fields.

The `windows-latest` audit selector remains a documented Medium residual
because GitHub may move it to a newer hosted image. Publication is nevertheless
fail-closed: the floating label is never treated as the reviewed identity, and
any change to the observed image or browser bytes invalidates approval.
