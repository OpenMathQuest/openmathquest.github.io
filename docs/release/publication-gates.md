# Publication gates

Math Quest is being prepared as a public-beta candidate. This file records
release gates; it is not publication clearance.

## Curriculum independence

The public candidate replaces the private pre-beta curriculum arrangement with
an independently authored, neutral manifest:

- canonical file: `curriculum/math-quest-manifest-v1.json`;
- scope: 126 skills across 21 ordered levels;
- identifiers: neutral `MQ-###` records;
- runtime state: schema version 3 under the stable
  `math-quest:progress:v2` Public Beta 2 namespace, with exact schema-2 state
  accepted only through validate-before-commit migration and
  `math-quest:v2` accepted only as read-only Beta 1 migration input, protected
  during incomplete cutover by the constant non-PII
  `math-quest:progress:v2:beta1-migration-guard:v1` marker;
- resumable placement state: a bounded `math-quest:placement-draft:v1` record
  that is isolated from progress and backups, contains no nickname, age,
  timing, mastery evidence, logs, or analytics, carries the exact persisted
  nonnegative draft generation plus a transactionally committed private
  non-PII run nonce/seed and exact response kinds, and fails closed when stale
  or corrupt; every retry is fresh while resume is deterministic; and
- provenance: documented without reproducing a publisher's skill wording,
  taxonomy, chapter grouping, or ordered compilation.

Publisher-derived research, prior skill tables, and historical visual evidence
belong in the ignored `.private-prebeta/` quarantine and must not appear in a
public commit or Pages artifact. The new manifest must be validated for unique
order, prerequisites, acyclicity, generator coverage, and exact runtime
equality.

This redesign resolves the architectural path selected for the rights concern,
but it does not by itself approve publication.

## Certification cadence and immutable candidate

Status and evidence follow the
[`AGENTS.md` finished-work policy](../../AGENTS.md#what-counts-as-finished-work).

Ordinary development, pull requests, branch pushes, and pushes to `main` run
the focused development suite plus change-specific effect-sensitive checks.
They may establish that real production behavior is **implemented**, but they
do not run or satisfy the complete certification gauntlet and cannot establish
**release-certified** status.

After all planned release work is finished, first commit the exact Beta 8
qualification revision to protected `main` with final game/runtime/PWA bytes
and all four pending evidence authorities. Run the trusted-HTTPS canary and
hosted-Windows observation against that qualification commit, then create the
four-authority evidence successor defined below. That successor is the exact
final candidate commit and public payload. A clear owner instruction
to publish authorizes the final complete certification run. Dispatch the
**Math Quest checks** workflow from protected `main` with that exact
40-character `candidate_sha` and the intended `release_tag`. The complete run
occurs once at this boundary, after freeze and immediately before the public
tag, release, and deployment.

After the run passes, create the annotated tag at that same commit. The Pages
workflow must verify a successful release-certification workflow run for the
tagged commit and deploy the exact tagged payload without rerunning the
gauntlet. The candidate is **shipped** only when those certified bytes are
actually published. Any intervening product, content, configuration, evidence,
commit, or payload change invalidates certification and requires focused
correction, a new freeze, and a complete rerun from the beginning. An earlier
full run may occur only with explicit owner approval and is diagnostic rather
than release certification.

## Remaining fail-closed review

During preparation and the single final Public Beta 8 certification cycle:

1. Freeze and canonicalize the exact manifest.
2. Compute the exact manifest and engine SHA-256 values from shipped bytes.
3. Run the complete engine, generator, mastery, mutation, calibrated branch
   coverage, launcher, exhaustive browser, direct-user Playwright,
   accessibility, visual, privacy, metadata,
   secret, rights, and deployment-allowlist review. The privacy gate must prove
   there is no automatic child-data transmission and that local backup export
   occurs only after a deliberate grown-up action.
4. Reconcile predicted and actual audit counts, failures, skips, and residual
   risks. Classify every failure or materially affected check as a product,
   obsolete-test, environment/harness, or pending evidence/approval issue (or
   combination), and prove equal-or-stronger effect coverage for every
   replaced assertion.
5. Inspect the exact Git file list and ensure no private, unrelated, generated,
   archived, or unlicensed material is staged.
6. Verify `licenses/component-register-v1.json` against the staged Git blobs:
   every bundled asset and executable workflow component must be registered,
   hash- or commit-pinned, attribution-complete, and covered by the approved
   open-licence/public-domain policy. Reject non-commercial, no-derivatives,
   personal/educational-only, permission-only, unknown, and BBC RemArc terms.
7. Verify control of the dedicated `OpenMathQuest` organization and
   `OpenMathQuest/openmathquest.github.io` repository. Reserve the organization
   exclusively for Math Quest Pages, and verify the root
   `https://openmathquest.github.io/` origin, empty Pages base path, absent
   CNAME, GitHub Actions publishing source, HTTPS, exact tagged workflow, and
   deployed allowlisted artifact.
8. Offer the documented six-lane real-device cycle on Windows, iPhone, and
   iPad. If selected, complete every lane and its exact
   offline/update/recovery checks; otherwise record `OPTIONAL_NOT_RUN`.
9. For a semantic-version prerelease, bind the current host review and owner
   decision as exact `DEFERRED_PRERELEASE`; never report the host as approved
   or privacy-cleared. For Beta 8, require the canary as exact `RECONCILED`
   with its canonical evidence SHA-256 and report `EXT-CANARY: PASS`. Complete
   adjudication, finding-disposition, hosted-Windows, and owner-authorization
   gates defined in
   `docs/release/ios-ipados-pwa-beta2-plan.md`. Before a
   stable release, replace the deferral with affirmative host approval or move
   the runtime to an approved host. Offer the optional six-reviewer cycle
   separately under the bounded collaboration policy in `AGENTS.md`; it runs
   once only after explicit owner opt-in for the named release scope and
   initial exact candidate lineage,
   uses the same reviewers for correction verification, and never creates a
   preliminary and final pair of cohorts. If declined, retain the exact visible
   optional state.
10. Against the protected-main qualification commit, run the trusted-HTTPS
    canary and download the successful Windows audit artifact. Review its
    machine-readable browser/runner tuple: exact product name, full four-part
    product version, executable SHA-256, and GitHub-hosted `ImageOS` and
    `ImageVersion`. Copy that tuple to
    `audit/browser-runner-evidence-v1.json` as `REVIEWED`. Create the V2
    evidence successor: one non-merge commit whose sole parent is the
    qualification commit and whose exact changed-path set is
    `PUBLICATION_CLEARANCE.md`, `audit/browser-runner-evidence-v1.json`,
    `audit/release-evidence-bundle-v1.json`, and
    `audit/trusted-https-canary-v1.json`. The canary must bind the
    qualification commit and its exact runtime snapshot; the successor
    validator must prove all game/runtime/PWA bytes are exactly identical. The
    single final certification runs on that successor. It must independently
    record a complete exact live browser/image tuple; it need not equal the
    reviewed qualification tuple because `windows-latest` floats. Clearance
    must match every field of the reviewed qualification record, while the
    final report must validate and retain every field of its own live tuple.

For semantic-version betas selected by `ALTERNATING_BETA_V1`—beginning with
Beta 4 and recurring at Beta 6, Beta 8, and so on—the exact frozen candidate
must also pass the separate GitHub-hosted Windows Playwright Deep UX Census.
The census job may run in parallel with the one complete gauntlet, but the
workflow cannot succeed unless both required jobs succeed. It inventories all
72,576 deterministic questions, executes the closed risk-selected rendered
plan across six viewports and applicable states, and uploads only its compact
report plus synthetic anomaly evidence on failure. A local 100-cell benchmark,
an odd-numbered beta, or a clean direct-journey result cannot impersonate the
scheduled census. The census neither changes the 304-result gauntlet count nor
replaces browser, mathematical, human, accessibility, PWA, or device evidence.
Beta 8 is scheduled, so the complete census must pass. The local balanced
100-cell benchmark remains non-certifying and cannot satisfy, replace, or
strengthen the release gate.
11. Prove on the exact frozen candidate that an exact schema-2 save and backup
    migrate transactionally to schema 3 without changing the protected key or
    losing evidence; rejected migration, foreign backup, schema downgrade, and
    mixed-version-tab paths leave schema-3 bytes unchanged.
12. Prove the separate placement draft is bounded and privacy-minimized,
    survives only an intended pause, and is removed by discard, reset,
    successful import, and successful application. A malformed, oversized,
    stale-generation, stale-baseline, or conflicting draft must not change
    progress. Reset, import replacement, and application must commit a strictly
    later generation than current, imported, and safely parsed surviving-draft
    floors before removal; if `removeItem` fails, reload must reject the
    surviving prior-generation draft. Maximum-safe-integer exhaustion must
    mutate no reset/import/apply input. A failed main-state write must retain
    both the prior generation and its recoverable draft. Prove fresh non-PII
    nonce/seed commitment, deterministic resume, bounded semantic-task
    deduplication, separate correct/incorrect/Not sure counts, conservative
    limited-abstention confidence, and the explicit unvalidated broad
    heuristic/co-play/Replay wording before release.

The uploaded JSON is candidate evidence only. Producing or uploading it does
not change either pending record and does not authorize publication. A local
run records its browser identity as local, leaves hosted image fields
unavailable, and cannot satisfy publication clearance.

## Publication-clearance record

The closed machine authority for gate semantics is
`audit/gate-integrity-policy-v1.json`. The closed current evidence binding is
`audit/release-evidence-bundle-v1.json`. Clearance digests are accepted only
when the bundle validator proves their exact canonical artifact bytes or their
explicitly typed structured assertion. A 64-character hexadecimal value by
itself is not evidence. The canary binding is the exact sanitized
artifact named by the bundle. Beta 7 retains its historical
`audit/trusted-https-canary-beta7-v1.json`; Beta 8 uses the canonical
`audit/trusted-https-canary-v1.json`. Optional-not-run records remain absence
records and make no pass claim.

Before release mutation, run
`node audit/verify-github-gate-enforcement.mjs`. Its live GitHub snapshot must
show `development-checks` as the required `main` check, must not show the
dispatch-only `full-audit` job as required, and must show an active no-bypass
`refs/tags/v*` ruleset prohibiting update and deletion. Synthetic fixtures
test the evaluator but never substitute for this live preflight.

Before qualification and independent review, create `PUBLICATION_CLEARANCE.md`
with `Status: PENDING`, pending browser-runner evidence, and the pending
evidence authorities required by the selected successor policy; then
synchronize the public-file manifest and component register. A pending record
makes its path part of the candidate without claiming approval. Every other
clearance field in the exact schema must also contain `PENDING`, except that an
eligible prerelease may already carry the exact digest-bound
`DEFERRED_PRERELEASE` host pair. A `QUALIFICATION_PENDING` evidence bundle is
structurally valid but explicitly not release-ready. Preparatory canary and
hosted-Windows evidence acquisition against that commit is diagnostic, not the
final gauntlet. After both records are reconciled and reviewed, create exactly
one immediate non-merge evidence successor. It must have the qualification
commit as its only parent and change exactly the governed evidence paths for
the selected policy—neither a subset nor a superset. The validator must prove
exact game/runtime/PWA byte identity between the two commits. The successor is
then the immutable candidate on which the single final gauntlet runs:

- `# Math Quest publication clearance`
- `Status: APPROVED`
- `Review date: <YYYY-MM-DD>`
- `Review result: PASS`
- `Required failures: 0`
- `Required skips: 0`
- `Residual risks: <explicit one-line statement; use NONE when appropriate>`
- `Reviewed engine SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed curriculum manifest version: <exact version>`
- `Reviewed curriculum manifest SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed rights-state SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed public payload SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed public payload tree OID: <40 or 64 lowercase hexadecimal characters>`
- `Qualification commit SHA: <the exact 40-character sole-parent SHA>`
- `Evidence successor policy: <the exact release-selected policy>`
- `Reviewed browser product name: <Microsoft Edge or Google Chrome>`
- `Reviewed browser full version: <exact four-part product version>`
- `Reviewed browser executable SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed runner ImageOS: <exact GitHub-hosted ImageOS>`
- `Reviewed runner ImageVersion: <exact GitHub-hosted ImageVersion>`
- `External evidence reviewed at: <exact UTC timestamp with whole seconds>`
- `External evidence expires at: <later exact UTC timestamp with whole seconds>`
- `Host qualification state: DEFERRED_PRERELEASE` for an eligible prerelease,
  or `APPROVED` after affirmative qualification; stable releases require
  `APPROVED`.
- A deferred record's residual-risk line must begin
  `Host privacy deferred until stable:` and name ordinary provider request
  metadata plus the unresolved under-13 host terms.
- `Host qualification evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Canary reconciliation state: RECONCILED`
- `Canary reconciliation evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Physical-device evidence state: COMPLETE` with a 64-hex evidence digest,
  `Required physical-device lanes: 6`, `Passed physical-device lanes: 6`, and
  `Primary iPad journey result: PASS`; **or** `OPTIONAL_NOT_RUN`, `NONE`, `0`,
  `0`, and `NOT_RUN` respectively.
- `Independent-reviewer evidence state: COMPLETE` with a 64-hex evidence
  digest, `Required independent-reviewer reports: 6`, and
  `Sealed independent-reviewer reports: 6`; **or** `OPTIONAL_NOT_RUN`,
  `NONE`, `0`, and `0` respectively.
- `Adjudication state: APPROVED`
- `Adjudication evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Adjudication recommendation: RELEASE`
- `Finding-disposition state: COMPLETE`
- `Finding-disposition evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Open critical findings: 0`
- `Open high findings: 0`
- `Unaccepted medium findings: 0`
- `Unrecorded low findings: 0`
- `Hosted-Windows evidence state: REVIEWED`
- `Hosted-Windows evidence SHA-256: <SHA-256 of the exact canonical audit/browser-runner-evidence-v1.json bytes>`
- `Owner authorization state: PR_PUSH_AUTHORIZED`
- `Owner authorization evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Authorized release tag: v1.0.0-beta.8`
- `Authorized protected ref: refs/heads/main`
- `Review-bundle SHA-256: <64 lowercase hexadecimal characters>`

For `v1.0.0-beta.8`, the owner's 2026-08-25 release authorization did not
select either optional cycle. The physical-device fields are exact
`OPTIONAL_NOT_RUN`/`NONE`/`0`/`0`/`NOT_RUN`; the independent-reviewer fields are
exact `OPTIONAL_NOT_RUN`/`NONE`/`0`/`0`. No evidence, platform qualification,
or independent-review claim is inferred from their zero counts. The same
decision records exact `PR_PUSH_AUTHORIZED` for `v1.0.0-beta.8` on
`refs/heads/main`; it does not bypass any mandatory gate or authorize changed
bytes after certification.

For Beta 7, `RUNTIME_EQUIVALENT_EVIDENCE_SUCCESSOR_V1` has one closed meaning.
The qualification commit is a protected-main revision with final
game/runtime/PWA bytes and both evidence records pending. Run the canary and
hosted-Windows observation against that exact commit. The successor must be its
immediate non-merge sole child; merges, rebases, cherry-picks, cousins, skipped
ancestors, and later descendants do not qualify. `git diff --name-only
--no-renames <qualification> <successor>` must yield exactly
`PUBLICATION_CLEARANCE.md` and `audit/browser-runner-evidence-v1.json`, and the
runtime/PWA identity validator must prove every governed byte unchanged. The
canary evidence binds the qualification commit and runtime snapshot; the final
gauntlet, tag, and deployment bind the successor. The repository-wide public
payload digest changes because reviewed browser evidence is public, so it is
incorrect to claim whole-payload identity.

For that Beta 7 successor, the two `Reviewed public payload` fields bind the
qualification commit inspected by the canary and hosted-Windows observation.
The validator independently recomputes those identities from the named
qualification commit, proves the current candidate is its exact two-file
successor, and separately requires the current successor's public-candidate
guard to pass. Comparing those fields to the successor's necessarily changed
evidence payload would create a circular and impossible gate.

For Beta 8, `RELEASE_EVIDENCE_SUCCESSOR_V2` closes the lifecycle introduced by
the sole-authority evidence bundle. The qualification commit contains all four
pending authorities: `PUBLICATION_CLEARANCE.md`,
`audit/browser-runner-evidence-v1.json`,
`audit/release-evidence-bundle-v1.json`, and
`audit/trusted-https-canary-v1.json`. The bundle must be exact
`QUALIFICATION_PENDING`; it validates structure and the pending canary's release
tag but cannot produce release-ready bindings. After the hosted-Windows
observation and trusted-HTTPS canary bind that exact qualification SHA, the
immediate non-merge sole child changes exactly those four paths. The reviewed
bundle becomes exact `EVIDENCE_REVIEWED`, binds the canonical canary and browser
artifact bytes, and is the sole source of the clearance digests. Missing any
authority, changing an additional documentation/runtime path, mixing pending
and reviewed states, or naming a different qualification SHA fails closed.

### Historical Beta 4 canary and successor exception

On 2026-08-09, the owner also directed that the Beta 4 trusted-HTTPS canary be
skipped. `EXT-CANARY` is therefore `OWNER_SKIPPED`, not `PASS`, `RECONCILED`,
or `WAIVED`. No canary evidence exists, and the missing trusted-HTTPS update,
cache, repair, cold-offline, migration, teardown, and privacy observation must
remain in the residual-risk text. This exception expires after Beta 4.

“Direct evidence successor” has one closed meaning. The qualification commit
must contain pending clearance and pending browser evidence. The successor
must be its immediate and sole child; merges, rebases, cherry-picks, cousins,
skipped ancestors, and later descendants do not qualify. `git diff --name-only
--no-renames <qualification> <successor>` must yield exactly
`PUBLICATION_CLEARANCE.md` and `audit/browser-runner-evidence-v1.json`. Every
other repository byte is therefore identical. The repository-wide public
payload digest changes because reviewed browser evidence is part of that
payload; only the game/runtime bytes remain unchanged. The final gauntlet,
tag, and deployment bind the successor, never the qualification commit.

The public-payload digest and payload-tree OID cover every staged entry except
the bytes of `PUBLICATION_CLEARANCE.md`. The clearance path remains listed in
the exact public-file manifest, classified in the component register, scanned
by the guard, and checked against the working tree. This narrow exclusion
prevents the approval record from having to contain its own hash.
The deployment validator rejects missing, reordered, duplicate, additional,
empty, pending, malformed, or mismatched fields.

The eight external records are counted release-audit inputs, not narrative
claims. Inventory equality proves record completeness, not successful
verification. For Beta 8, five are mandatory PASS gates: `EXT-CANARY`,
`EXT-ADJUDICATION`, `EXT-FINDINGS`, `EXT-HOSTED-WINDOWS`, and `EXT-OWNER`.
`EXT-HOST` is visibly `DEFERRED_PRERELEASE`/`DEFERRED`, while `EXT-DEVICE` and
`EXT-REVIEWERS` retain their exact optional states. The host deferral is not a
pass or privacy-clearance claim. A stable release requires all six ordinarily
mandatory gates to PASS.
Each optional cycle either passes exact completed evidence or retains exact
`OPTIONAL_NOT_RUN`, reported as `OPTIONAL_NOT_RUN`, never `PASS`. Selecting an optional
cycle makes every declared lane/report and digest fail-closed. The common
review window must have started, must not have expired, and must remain bound
to the exact candidate and reviewed hosted-Windows tuple. Missing, unknown,
pending, stale, future, wrong-count, partial selected-cycle, open-finding,
digest-mismatched, tag-mismatched, ref-mismatched, or stable-host-deferred
input forces `External release evidence: BLOCKED`, `Shippable: NO`, and a
nonzero ordinary release-audit result. `--technical-only` may still produce
candidate evidence, but it neither changes nor conceals the release decision.

### Emergency Beta 3 owner waiver

On 2026-07-30, the project owner authorized a one-release emergency exception
for `v1.0.0-beta.3` so urgent Home-navigation and answer-feedback repairs could
replace the broken public build without waiting for the external review cycle.
The exception waives `EXT-HOST`, `EXT-CANARY`, `EXT-DEVICE`,
`EXT-REVIEWERS`, `EXT-ADJUDICATION`, and `EXT-FINDINGS` for this tag only.
Those gates must be reported as `WAIVED`, never `PASS`; real device/reviewer
counts remain zero and unevaluated findings remain `UNKNOWN`.

`EXT-HOSTED-WINDOWS` and `EXT-OWNER` are not waived. The exact candidate must
still pass the complete deterministic, educational, privacy, licensing,
mutation, coverage, browser, PWA, tag, immutable-snapshot, and deployment
checks; independently validate its live hosted tuple and its reviewed
GitHub-hosted browser/runner record; and carry exact
`EMERGENCY_BETA3_AUTHORIZED` owner evidence. The clearance status is
`EMERGENCY_APPROVED`, and every later release returns to the ordinary
fail-closed requirements.

### Prerelease host-qualification deferral

On 2026-08-02, the project owner directed that external host privacy/legal
qualification wait until Math Quest leaves prerelease. Beginning with
`v1.0.0-beta.4`, an eligible prerelease may therefore bind the current host
review as `DEFERRED_PRERELEASE`. The audit reports `EXT-HOST: DEFERRED`; it
must not report `PASS`, `APPROVED`, `WAIVED`, or privacy clearance. This does
not ordinarily relax the exact-candidate trusted-HTTPS canary or any
application privacy, no-child-data, runtime-request, offline, metadata,
secret, provenance, or PWA check. Beta 4 alone uses the later, explicit
2026-08-09 owner skip below; that skip is visible non-passing missing evidence,
not canary reconciliation.

For Beta 8, the Beta 4 canary exception is expired. `EXT-CANARY` must instead
be exact `RECONCILED` with canonical evidence and report `PASS`, while
`EXT-HOST` remains exact digest-bound `DEFERRED_PRERELEASE`/`DEFERRED`.

The residual risk must disclose that GitHub Pages can receive ordinary HTTPS
request metadata and that the current under-13 host terms remain unqualified.
The deferral expires before the first stable tag. Stable publication fails
closed until the selected host is affirmatively approved or the runtime moves
to a host that is.

The audit workflow intentionally retains `runs-on: windows-latest`.
**Residual risk (Medium):** that label is a floating GitHub-hosted image
selector. It is not accepted as evidence by itself. Each run records and
uploads the exact underlying `ImageOS`/`ImageVersion` and exact browser binary
identity. The reviewed qualification record must match its own artifact, and
the final certification must independently validate its live tuple. Drift
between those two valid records is retained explicitly and does not invalidate
clearance; a missing, malformed, local, or falsely labelled record still
blocks. Review remains a role within the `AGENTS.md` collaboration cap and
does not automatically authorize another agent or critic cohort.

The rights-state digest binds the policy, component register, licence and
attribution evidence, workflows, font, sound generator, and shipped sound
bytes. Any change to the manifest, engine, approved child-string table,
rights state, or public artifact after approval invalidates the matching
clearance. Correct it with focused checks, freeze a new candidate, and rerun
the complete certification system from the beginning. The Pages workflow must
fail while clearance is missing, malformed, stale, or hash-mismatched.
