# Clean-room curriculum authoring log

## Record

- Artifact: `curriculum/math-quest-manifest-v1.json`
- Manifest ID: `math-quest-curriculum`
- Manifest version: `1.0.0`
- Schema version: `1`
- Locale: `en-CA`
- Scope frozen at authoring: 7 bands, 21 levels, 126 skills, 6 skills per
  level
- Provenance review date: 2026-07-27

## Input controls

Allowed authoring inputs were general mathematical knowledge and original
design judgment. Official public curriculum sources were used only after the
neutral taxonomy, sequence, objectives, task types, constraints, and
prerequisites had been authored, for concept-level comparison and localization
checks.

Excluded inputs:

- proprietary curricula
- commercial textbook sequences
- pre-existing pre-beta curriculum artifacts
- publisher-specific identifiers, scope-and-sequence tables, and wording

No upstream objective sentence is stored in the manifest or crosswalk.

## Authoring stages

1. Define six neutral mathematical strands and a seven-band learner
   progression.
2. Choose a regular three-level-per-band, six-skill-per-level rhythm.
3. Write original titles, objectives, constraints, task types, and
   prerequisites.
4. Assign skill IDs `MQ-001` through `MQ-126` under pre-release manifest
   version `1.0.0`.
5. Run an independent claim-to-interaction review across every generated skill
   and revise original objectives, constraints, and task types until each
   assessable claim has a visible, grader-aligned witness.
6. Compare each original concept to named England year/domain sections and
   stable Australian Curriculum Version 9 content-description codes.
7. Keep Nova Scotia pages outside `benchmarkIds`; use only the grade-matched
   public course page for local terminology and scope review.
8. Pin the exact Australian machine-readable dataset and regenerate the public
   crosswalk mechanically.

## Official source pins

| Source | Edition or revision | Accessed | Pin |
|---|---|---:|---|
| England mathematics programmes of study | Published 2013; HTML updated 2021-09-28; PDF ref `DFE-00180-2013` | 2026-07-27 | Official GOV.UK URL in manifest |
| England EYFS framework, group and school-based providers | Dated 2025-07-14; effective 2025-09-01 | 2026-07-27 | Content-addressed official PDF URL in manifest |
| Open Government Licence | Version 3.0 | 2026-07-27 | Official National Archives URL in manifest |
| Australian Curriculum V9 Mathematics MRAC | `MRAC/2024/04/LA/MAT`; files updated 2024-06-07 | 2026-07-27 | SHA-256 `4d6b7a01d10517dc97ad709055c62c171b9b90ea33e0d0fc395e9bd2f96e48b1` |
| Australian Curriculum version history | Version 9.0 endorsed 2022-05-10 | 2026-07-27 | Official ACARA URL in manifest |
| ACARA copyright and terms | Last updated April 2021 | 2026-07-27 | Official ACARA URL in manifest |
| Nova Scotia Mathematics Primary–5 course pages | Page updates dated July/August 2022 | 2026-07-27 | Six grade-matched official URLs in manifest |
| Royal Canadian Mint circulation index | Live page | 2026-07-27 | Official Mint URL in manifest |
| Measurement Canada GEN-50 | Published/effective 2026-01-28 | 2026-07-27 | Official ISED URL in manifest |

The ACARA JSON-LD digest was computed over the downloaded response bytes. It
allows a later reviewer to detect a silent change at the same URL.

## Reproduction

Run from the repository root with the project's Node runtime:

```text
node tools/normalize-curriculum-manifest.mjs
node --input-type=module --eval "import { loadManifest } from './audit/lib/curriculum-manifest.mjs'; const r = await loadManifest('./curriculum/math-quest-manifest-v1.json'); console.log(r.sha256);"
```

The first command:

- preserves authored skill fields and the 21-by-6 sequence
- applies the explicit concept-level map in
  `tools/normalize-curriculum-manifest.mjs`
- rebuilds `benchmarkIndex` from the identifiers actually used
- removes all Nova Scotia identifiers from skill benchmarks
- regenerates `research/curriculum-benchmark-crosswalk.md`

The second command validates structural, prerequisite, task-type, source, and
benchmark-reference integrity, then prints the RFC 8785-domain canonical
manifest hash used by the release system.

## Review limitations

The crosswalk records nearest concept comparators; it does not assert grade
equivalence. Several Math Quest skills intentionally point to a later England
or Australian year when that section is the closest exact concept comparator.
Some skills have a benchmark in only one jurisdiction because a more specific
second anchor was not supportable without overstating alignment.

The remaining release risk is pedagogical rather than provenance-mechanical:
a qualified Nova Scotia elementary educator should inspect the complete
generated question range before any jurisdiction-specific alignment claim is
made. The public beta should be described as a neutral practice game, not an
approved curriculum.
