# Math Quest Curriculum Manifest v1 — Provenance

## Outcome

The neutral Math Quest manifest contains 21 levels and 126 skills: three
six-skill trails in each of seven learner bands from pre-K foundations through
Grade 5. The count and rhythm are original design decisions. They do not mirror
the partitions, identifiers, order, or prerequisite graph of another product.

The canonical artifact is
[`math-quest-manifest-v1.json`](math-quest-manifest-v1.json). Its public
traceability projection is
[`../research/curriculum-benchmark-crosswalk.md`](../research/curriculum-benchmark-crosswalk.md).
Running `node tools/normalize-curriculum-manifest.mjs` regenerates that
crosswalk from each skill's `benchmarkIds`.

## Clean-room authorship

Skill titles, objectives, level purposes, neutral strand names, constraints,
sequence, task types, and prerequisite links are original Math Quest
expression. The sequence was authored before the concept-level benchmark
crosswalk. Proprietary curricula, commercial textbook sequences, and
pre-existing pre-beta curriculum artifacts were excluded from the authoring
inputs.

Before the beta manifest was frozen, an independent claim-to-interaction
review exercised every generated skill and refined original wording or task
types where the visible question did not witness the full stated claim.

Benchmark IDs are traceability locators, not copied objectives:

- `ENG-*` locators identify a named year/domain heading in an official England
  publication, or a named mathematics/early-learning-goal heading in the EYFS
  framework.
- `AC9*` locators are stable Australian Curriculum Version 9 content-description
  codes. The manifest does not reproduce the descriptor sentences.

The crosswalk is a concept comparison. It is not a claim of exact grade
equivalence, official alignment, approval, or endorsement. A later-year anchor
is used where it is the closest supportable concept comparator.

The complete authoring and reproduction record is in
[`../research/clean-room-curriculum-log.md`](../research/clean-room-curriculum-log.md).

## Official benchmark sources

### England

- Department for Education,
  [National curriculum in England: mathematics programmes of study](https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study).
  Published 11 September 2013; HTML updated 28 September 2021; key stages 1
  and 2 PDF reference `DFE-00180-2013`. Accessed 2026-07-27.
- Department for Education,
  [Early years foundation stage statutory framework for group and school-based providers](https://assets.publishing.service.gov.uk/media/68c024cb8c6d992f23edd79c/Early_years_foundation_stage_statutory_framework_-_for_group_and_school-based_providers.pdf.pdf).
  Dated 14 July 2025, effective 1 September 2025. Accessed 2026-07-27.

Crown material was used under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/),
except where otherwise stated. The required fallback acknowledgement is:

> Contains public sector information licensed under the Open Government
> Licence v3.0.

No logo, crest, Royal Arms, third-party right, personal data, or other excluded
material was used. The Department for Education and the Keeper of Public
Records do not endorse Math Quest.

### Australia

- Australian Curriculum, Assessment and Reporting Authority,
  [Machine-readable Australian Curriculum](https://www.australiancurriculum.edu.au/machine-readable-australian-curriculum),
  Mathematics dataset `MRAC/2024/04/LA/MAT`, files updated 7 June 2024.
- Exact JSON-LD artifact:
  [MRAC/2024/04/LA/MAT](https://vocabulary.curriculum.edu.au/MRAC/2024/04/LA/MAT/export/MRAC/2024/04/LA/MAT.jsonld),
  accessed 2026-07-27, SHA-256
  `4d6b7a01d10517dc97ad709055c62c171b9b90ea33e0d0fc395e9bd2f96e48b1`.
- ACARA,
  [Australian Curriculum Version 9.0: Mathematics](https://www.australiancurriculum.edu.au/curriculum-information/understand-this-learning-area/mathematics),
  Version 9.0 endorsed 10 May 2022. Accessed 2026-07-27.
- ACARA,
  [Copyright and terms of use](https://www.australiancurriculum.edu.au/copyright-and-terms-of-use/),
  last updated April 2021. Accessed 2026-07-27.

© Australian Curriculum, Assessment and Reporting Authority (ACARA) 2010 to
present, unless otherwise indicated. This material was downloaded from the
Australian Curriculum website on 2026-07-27 and was modified. The material is
licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Version updates are tracked in ACARA's curriculum version history.

ACARA does not endorse Math Quest or make representations about its quality.
Math Quest is not affiliated with, sponsored by, or approved by ACARA.

Only the curriculum structure and content-description codes were used. ACARA
logos, other trademarks, website design, photographs, videos, third-party
material, implementation resources, work samples, and Indigenous Cultural and
Intellectual Property material were excluded.

## Canadian and Nova Scotia localization

Nova Scotia course pages are reference-only localization checks. They are not
normative benchmark sources and their wording is not copied. The manifest's
`localizationReview.bandSources` maps Kindergarten through Grade 5 only to the
matching Mathematics Primary through Mathematics 5 page. Pre-K has no asserted
Nova Scotia grade mapping. No `SRC-NS-*` identifier is permitted in a skill's
`benchmarkIds`.

Canadian circulation denominations were fact-checked against the
[Royal Canadian Mint](https://www.mint.ca/en/discover/canadian-circulation).
SI/metric usage was fact-checked against
[Measurement Canada](https://ised-isde.canada.ca/site/measurement-canada/en/laws-and-requirements/gen-50-use-trade-units-measurement-defined-weights-and-measures-act).
These are facts-only references; no imagery or source wording is reused.

## Licence boundary

The repository's MIT licence covers Math Quest code and the original expression
in the manifest: its taxonomy, titles, objectives, constraints, sequence, and
metadata. Mathematical facts, concepts, relationships, and procedures are not
claimed as proprietary Math Quest expression.

The MIT licence does not relicense Crown or ACARA expression, third-party marks,
or excluded materials. Any upstream expression that is used remains governed
by its upstream licence and attribution conditions. Required notices are also
retained in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Remaining educator-review boundary

Concept-level traceability does not establish complete compliance with any
jurisdiction's curriculum, prove instructional efficacy, or replace local
educator review. Before marketing a release as aligned to a particular
jurisdiction, a qualified local educator should review the full generated task
range, language, grade placement, accessibility, cultural suitability, and
assessment policy against the then-current official curriculum.
