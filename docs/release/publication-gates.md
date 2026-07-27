# Publication gates

Math Quest is being prepared as a public-beta candidate. This file records
release gates; it is not publication clearance.

## Curriculum independence

The public candidate replaces the private pre-beta curriculum arrangement with
an independently authored, neutral manifest:

- canonical file: `curriculum/math-quest-manifest-v1.json`;
- scope: 126 skills across 21 ordered levels;
- identifiers: neutral `MQ-###` records;
- runtime state: schema version 2 under `math-quest:v2`; and
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

Before the first public push or deployment:

1. Freeze and canonicalize the exact manifest.
2. Compute the exact manifest and engine SHA-256 values from shipped bytes.
3. Run the complete engine, generator, mastery, mutation, calibrated branch
   coverage, launcher, browser, accessibility, visual, privacy, metadata,
   secret, rights, and deployment-allowlist review.
4. Reconcile predicted and actual audit counts, failures, skips, and residual
   risks.
5. Inspect the exact Git file list and ensure no private, unrelated, generated,
   archived, or unlicensed material is staged.
6. Verify `licenses/component-register-v1.json` against the staged Git blobs:
   every bundled asset and executable workflow component must be registered,
   hash- or commit-pinned, attribution-complete, and covered by the approved
   open-licence/public-domain policy. Reject non-commercial, no-derivatives,
   personal/educational-only, permission-only, unknown, and BBC RemArc terms.
7. Verify the dedicated custom domain, Pages configuration, DNS, HTTPS, and
   deployed artifact.
8. Complete real-device spot checks on Windows, iPhone, and iPad.

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

The public-payload digest and payload-tree OID cover every staged entry except
the bytes of `PUBLICATION_CLEARANCE.md`. The clearance path remains listed in
the exact public-file manifest, classified in the component register, scanned
by the guard, and checked against the working tree. This narrow exclusion
prevents the approval record from having to contain its own hash.
The deployment validator rejects missing, reordered, duplicate, additional,
empty, pending, malformed, or mismatched fields.

The rights-state digest binds the policy, component register, licence and
attribution evidence, workflows, font, sound generator, and shipped sound
bytes. Any change to the manifest, engine, approved child-string table,
rights state, or public artifact after approval invalidates the matching
clearance and requires the affected review to run again. The Pages workflow
must fail while clearance is missing, malformed, stale, or hash-mismatched.
