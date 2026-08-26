# Public Beta 8 release readiness

This document describes the release boundary; it is not publication approval.

## Certification cadence

Status and evidence follow the
[`AGENTS.md` finished-work policy](../../AGENTS.md#what-counts-as-finished-work).

Ordinary development uses the focused development suite and every
change-specific effect-sensitive test. Pull requests and ordinary pushes do
not run the complete gauntlet. Their passing checks may establish that real
production behavior is **implemented**, but not **release-certified**.

When publication is the next intended action, create the qualification commit
on protected `main` with final game/runtime/PWA bytes and pending clearance
records. Run the trusted-HTTPS canary and hosted-Windows observation against
that commit, then create its exact four-authority evidence successor under
PB-054. Freeze that successor as the candidate. Run the complete certification
system and required Deep UX Census once against that immutable commit and
public payload. A clear owner publication instruction
authorizes the run. If it passes, tag and deploy the same bytes. If it fails or
anything changes, use focused checks for the correction, freeze a new
candidate, and rerun the complete system from the beginning. The Pages workflow
must verify successful certification of its exact tagged commit instead of
repeating coverage, mutation, exhaustive-generator, and other gauntlet stages.
The candidate is **shipped** only when those certified bytes are actually
published.

## Local candidate requirements

The local technical portion of the complete gauntlet passes only when the
generated
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
- all 29 starting-point input methods rendered in the real child placement
  wrapper at each of desktop, tablet portrait, 1180×820 iPad landscape,
  1024×768 iPad landscape, and phone dimensions (145 deterministic rows), with
  18 px essential child text, 44 px targets, first-screen actions, exact Replay
  prompts, positional narration of every visible selection option, neutral
  **Not sure** feedback, separate response counts and limited-abstention
  confidence, an explicit grown-up-only application boundary, no
  route-grid/arrow or pattern-slot/token/Undo collisions, and a real
  `PICTURE_CHOICE` notice occupying its own row before all child task content;
  the iPad-size rows are automated geometry/focus evidence only and do not
  replace any selected physical-iPad observation;
- a fresh transactionally committed non-PII placement nonce/seed for every
  start and retry, deterministic resume, and no repeated child-visible
  semantic task within a run after bounded resampling/fallback;
- project-owner approval of the exact frozen child-facing string table,
  canonicalized as `child-strings-v1`, with its exact non-empty SHA-256 shipped
  and reproduced by the browser gate;
- the staged privacy, metadata, secret, provenance, and open-component guard
  passed;
- browser evidence proves no automatic child-data transmission and confirms
  that local backup export requires a deliberate grown-up action;
- identical public-payload and payload-tree identities before and after the
  audit;
- a current `release-shell-v1.json` whose listed bytes and embedded worker
  binding pass `tools/build-pwa-release-manifest.mjs --check`; and
- zero failures in `audit/tests/pwa-release.test.mjs`.
- a successful GitHub-hosted Windows audit artifact recording the exact
  browser product, full product version, executable SHA-256, `ImageOS`, and
  `ImageVersion`; and
- a `REVIEWED` `audit/browser-runner-evidence-v1.json` tuple that matches the
  qualification artifact and the exact fields in `PUBLICATION_CLEARANCE.md`;
  the final audit independently validates and records its own hosted tuple.
- exactly eight reported external release-evidence records: for Beta 8, five
  mandatory PASS gates for reconciled trusted-HTTPS canary evidence,
  independent adjudication, complete finding disposition, reviewed
  hosted-Windows evidence, and exact project-owner `PR_PUSH_AUTHORIZED`
  authorization; one visible non-passing `EXT-HOST: DEFERRED` record bound to
  the owner-directed prerelease deferral; and visible `OPTIONAL_NOT_RUN`
  records for the offered six-lane physical-device matrix and offered
  six-reviewer cycle; and
- a current (already reviewed and not expired) external-evidence window, exact
  evidence digest for every mandatory gate and every completed optional
  cycle, zero open Critical/High findings, zero
  unaccepted Medium findings, zero unrecorded Low findings, the Beta 8 tag and
  protected-main binding, and the canonical review-bundle digest.

The generated report is intentionally ignored because it contains a run
timestamp and is regenerated from the exact staged tree. Its host paths are
sanitized before writing.

## Publication boundary

Preparing and auditing the repository does not publish it. Deployment remains
fail-closed while `PUBLICATION_CLEARANCE.md` is absent or does not match the
exact engine, curriculum manifest, rights state, payload digest, and payload
tree.

The final payload identity covers every staged entry except the bytes of
`PUBLICATION_CLEARANCE.md`. The clearance path still has to be classified in
the component register, listed in the exact public-file manifest, inspected by
the guard, and match the working tree. Excluding its approval bytes avoids a
cryptographic self-reference. The qualification and successor public-payload
digests are not equal because the successor contains the reviewed browser
evidence; only the game/runtime/PWA bytes are exactly unchanged. The canary
binds the qualification commit and its runtime snapshot, while the successor
validator proves that exact runtime equivalence. The single final certification
run binds the successor's exact commit and final payload.

The mandatory Beta 8 canary reconciliation, adjudication, finding,
hosted-Windows, and owner-authorization requirements; the visible prerelease
host deferral; and the separately offered optional physical-device and
six-reviewer cycles are listed in
`docs/release/ios-ipados-pwa-beta2-plan.md` and
`docs/release/publication-gates.md`. The manual Pages workflow must not be run
until all mandatory gates are independently completed.

Beta 8 is even-numbered, so its complete Playwright Deep UX Census is mandatory
under `ALTERNATING_BETA_V1`. The local 100-cell mode remains a non-certifying
development benchmark and cannot satisfy or strengthen the release claim.
Neither mode makes a physical-device,
Safari, screen-reader, pronunciation, child-comprehension, or visual-taste
claim.

For `v1.0.0-beta.8`, the owner's 2026-08-25 release authorization did not
select either optional cycle.
The clearance consequently retains exact `OPTIONAL_NOT_RUN` fields for the
six-device and six-reviewer records, and this release will make neither a
physical-device qualification claim nor an independent-review claim.

These requirements are now machine-enforced through the closed ordered
`PUBLICATION_CLEARANCE.md` schema. The ordinary audit predicts and observes
eight external records (304 total counted results, including 36 direct
Playwright browser journeys). For Beta 8, five are mandatory PASS gates,
including `EXT-CANARY` backed by exact `RECONCILED` evidence; `EXT-HOST` is a
separately visible `DEFERRED_PRERELEASE`/`DEFERRED` record, and two records are
optional. A stable release requires affirmative host approval and all six
ordinarily mandatory gates to PASS. Any missing, additional,
reordered, malformed, pending, unknown, stale, future-dated, artifact-
mismatched, browser-evidence-mismatched, open-finding, incomplete selected
optional cycle, tag/ref-mismatched, or unauthorized state is classified
as `PENDING_EVIDENCE_APPROVAL_GATE`. It must appear under pending checks and
unverified claims, and it forces `External release evidence: BLOCKED` and
`Shippable: NO`. A declined optional cycle instead records the exact
`OPTIONAL_NOT_RUN`/`NONE`/zero state and is reported as `OPTIONAL`, never
`PASS`. An exit-zero technical-only evidence run is not release approval and
does not alter those fields.

Historical Beta 4 evidence remains governed by its one-release
`OWNER_SKIPPED_BETA4` canary state and `DIRECT_EVIDENCE_SUCCESSOR_V1`. Neither
may be copied into Beta 8: the skip expired, and PB-054 instead requires
`RECONCILED` canary evidence plus `RELEASE_EVIDENCE_SUCCESSOR_V2` under PB-054.

The prerelease host deferral is never reported as a pass, waiver, or privacy
clearance. It remains nonblocking only for a semantic-version prerelease and
must carry an exact evidence digest plus a residual-risk statement disclosing
ordinary hosting-provider request metadata and the unresolved under-13 host
terms. Every application-level privacy, no-child-data, runtime-request,
offline, metadata, secret, and provenance gate remains mandatory. Before the
first stable release, the selected host must be affirmatively approved or the
runnable game must move to an approved host.

For `v1.0.0-beta.3` only, the project owner authorized the emergency exception
recorded in `AGENTS.md` and `publication-gates.md`. A conforming report must
say `EMERGENCY_APPROVED`, preserve six external gates as visibly `WAIVED`,
retain exact zero/unknown evidence counts, and still pass the hosted-Windows
and exact owner-authorization gates. This is not reusable release clearance.

The `windows-latest` audit selector remains a documented Medium residual
because GitHub may move it to a newer hosted image. Publication is nevertheless
fail-closed: the floating label is never treated as identity. The qualification
artifact and final certification each bind and validate their own exact hosted
browser/image tuple. The two tuples may differ; clearance remains bound to the
reviewed qualification record and the final report retains its live identity.
