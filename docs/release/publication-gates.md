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

## Remaining fail-closed review

Before the Public Beta 2 push or deployment:

1. Freeze and canonicalize the exact manifest.
2. Compute the exact manifest and engine SHA-256 values from shipped bytes.
3. Run the complete engine, generator, mastery, mutation, calibrated branch
   coverage, launcher, browser, accessibility, visual, privacy, metadata,
   secret, rights, and deployment-allowlist review.
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
8. Complete real-device spot checks on Windows, iPhone, and iPad.
9. Complete the Beta 2 host/privacy gate, three-generation physical Apple
   matrix, exact offline/update/recovery checks, six fresh antagonist reviews,
   and independent adjudication defined in
   `docs/release/ios-ipados-pwa-beta2-plan.md`.
10. Download the successful Windows audit artifact and review its
    machine-readable browser/runner tuple: exact product name, full four-part
    product version, executable SHA-256, and GitHub-hosted `ImageOS` and
    `ImageVersion`. Copy that tuple to
    `audit/browser-runner-evidence-v1.json` as `REVIEWED`. After the owner
    decision is recorded, rerun the exact resulting candidate commit. That
    rerun must match every field before publication can be approved.
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

Before the final independent review, create `PUBLICATION_CLEARANCE.md` with
`Status: PENDING`, then synchronize the public-file manifest and component
register. The pending record makes its path part of the candidate without
claiming approval. Every other field in the exact schema must also contain
`PENDING`. Review and audit that exact payload, then change only the clearance
record to the exact ordered schema below:

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
- `Reviewed browser product name: <Microsoft Edge or Google Chrome>`
- `Reviewed browser full version: <exact four-part product version>`
- `Reviewed browser executable SHA-256: <64 lowercase hexadecimal characters>`
- `Reviewed runner ImageOS: <exact GitHub-hosted ImageOS>`
- `Reviewed runner ImageVersion: <exact GitHub-hosted ImageVersion>`
- `External evidence reviewed at: <exact UTC timestamp with whole seconds>`
- `External evidence expires at: <later exact UTC timestamp with whole seconds>`
- `Host qualification state: APPROVED`
- `Host qualification evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Canary reconciliation state: RECONCILED`
- `Canary reconciliation evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Physical-device evidence state: COMPLETE`
- `Physical-device evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Required physical-device lanes: 6`
- `Passed physical-device lanes: 6`
- `Primary iPad journey result: PASS`
- `Independent-reviewer evidence state: COMPLETE`
- `Independent-reviewer evidence SHA-256: <64 lowercase hexadecimal characters>`
- `Required independent-reviewer reports: 6`
- `Sealed independent-reviewer reports: 6`
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
- `Authorized release tag: v1.0.0-beta.2`
- `Authorized protected ref: refs/heads/main`
- `Review-bundle SHA-256: <64 lowercase hexadecimal characters>`

The public-payload digest and payload-tree OID cover every staged entry except
the bytes of `PUBLICATION_CLEARANCE.md`. The clearance path remains listed in
the exact public-file manifest, classified in the component register, scanned
by the guard, and checked against the working tree. This narrow exclusion
prevents the approval record from having to contain its own hash.
The deployment validator rejects missing, reordered, duplicate, additional,
empty, pending, malformed, or mismatched fields.

The eight external records are counted release-audit inputs, not narrative
claims. Each is classified as a pending evidence/approval gate until its exact
positive state and digest are present. The common review window must have
started, must not have expired, and must remain bound to the exact candidate
and reviewed hosted-Windows tuple. Missing, unknown, pending, stale, future,
wrong-count, open-finding, digest-mismatched, tag-mismatched, or ref-mismatched
input forces `External release evidence: BLOCKED`, `Shippable: NO`, and a
nonzero ordinary release-audit result. `--technical-only` may still produce
candidate evidence, but it neither changes nor conceals the release decision.

The audit workflow intentionally retains `runs-on: windows-latest`.
**Residual risk (Medium):** that label is a floating GitHub-hosted image
selector. It is not accepted as evidence by itself. Each run records and
uploads the exact underlying `ImageOS`/`ImageVersion` and exact browser binary
identity. A browser update or hosted-image drift invalidates the reviewed
record and publication clearance, requiring a fresh independent review.

The rights-state digest binds the policy, component register, licence and
attribution evidence, workflows, font, sound generator, and shipped sound
bytes. Any change to the manifest, engine, approved child-string table,
rights state, or public artifact after approval invalidates the matching
clearance and requires the affected review to run again. The Pages workflow
must fail while clearance is missing, malformed, stale, or hash-mismatched.
