# Post-beta research backlog

This backlog contains work that must not change or delay the current Beta 2
release candidate. Start an item only after the beta has been frozen, audited,
and published.

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
