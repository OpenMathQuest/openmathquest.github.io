# Third-party notices

## Release policy

Every bundled or executable release component must be original MIT-licensed
Math Quest work, verified public-domain or CC0 material, or material under a
reviewed compatible open licence permitting commercial use, redistribution,
and modification. The controlling policy is
[`OPEN_SOURCE_POLICY.md`](OPEN_SOURCE_POLICY.md), and the exact component and
hash inventory is
[`licenses/component-register-v1.json`](licenses/component-register-v1.json).
Absence from that register means the material may not ship.

## Curriculum reference material

Math Quest's curriculum taxonomy, sequence, titles, objectives, constraints,
and prerequisite graph are original. Official public curriculum materials were
used for concept-level comparison. The exact section/code crosswalk and source
editions are documented in
[`curriculum/PROVENANCE.md`](curriculum/PROVENANCE.md).

### England Department for Education

Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

This includes concept-level reference to the Department for Education's
*National curriculum in England: mathematics programmes of study* and *Early
years foundation stage statutory framework for group and school-based
providers*. Crown material is used except where otherwise stated. No
departmental logo, crest, Royal Arms, third-party right, personal data, or
other material excluded from the OGL is included. The source and licensor do
not endorse Math Quest.

### Australian Curriculum, Assessment and Reporting Authority

Copyright Australian Curriculum, Assessment and Reporting Authority (ACARA)
2010 to
present, unless otherwise indicated. This material was downloaded from the
[Australian Curriculum website](https://www.australiancurriculum.edu.au/)
(accessed 2026-07-27) and was modified.

The material is licensed under
[CC BY 4.0 Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Version updates are tracked in the
[Curriculum version history](https://www.australiancurriculum.edu.au/help/f-10-curriculum-overview/version-history)
on the Australian Curriculum website.

ACARA does not endorse Math Quest or make representations as to its quality.
Math Quest must not be taken to be affiliated with ACARA or to have ACARA's
sponsorship or approval. Users should make their own assessment of the
product's version and degree of alignment with official content descriptions
and achievement standards.

Only the curriculum structure and stable Version 9 content-description codes
were used. ACARA and Australian Curriculum logos, other trademarks, website
design, photographs, videos, third-party material, implementation resources,
work samples, and Indigenous Cultural and Intellectual Property material are
not included.

### Localization reference pages

Public course-overview pages from the Nova Scotia Department of Education and
Early Childhood Development, the Royal Canadian Mint circulation index, and a
Measurement Canada SI/metric notice were consulted only to check local facts
and terminology. No reuse licence is relied on, and no source wording or
imagery is redistributed.

The repository's MIT licence applies only to original Math Quest expression
and code. It does not relicense third-party expression, marks, or excluded
material.

## Inter

Math Quest bundles the upright Inter variable font at
`assets/fonts/Inter-Variable.ttf`.

- Embedded copyright: Copyright 2016 The Inter Project Authors
- License: SIL Open Font License, Version 1.1
- Release version: `4.1`
- Embedded version: `4.001;git-9221beed3`
- Immutable tag commit: `e3a3d4c57d5ecc01453a575621882a384c1995a3`
- Exact upstream archive:
  <https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip>
- Upstream archive SHA-256:
  `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`
- Shipped SHA-256:
  `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf`

The complete license text is included at
[`licenses/Inter-OFL.txt`](licenses/Inter-OFL.txt). Inter remains under the SIL
Open Font License; the project's MIT License does not relicense it.

## Sound effects

The current files in `assets/sounds/` are gentle sine-tone placeholders
generated locally by `assets/sounds/generate-sounds.ps1`:

| File | SHA-256 |
|---|---|
| `tap.wav` | `376d43a4dab1e9e4d1ae192bcf6927568c3e2e00696e20282362fd94ba2b0eab` |
| `confirm.wav` | `465a3589bb280d4b217ed64e6b8906df248de6d205565579edd75a0cc00cf2e8` |
| `incorrect.wav` | `655d1882fe4750e2b80163c2c3e825c7cd7028119630d947ff01876411569506` |
| `close.wav` | `cb059c9481fc88c3c97598e205f2c91d68e8ac459bb91e68d65d33a639d07a16` |

These files are not recordings from the BBC Sound Effects Archive or another
third-party sound library. The generation script and generated WAV files are
original project material distributed under the repository's MIT License.

BBC RemArc recordings are explicitly ineligible: their ordinary
non-commercial personal, educational, and research limitations do not satisfy
the project policy. See
[`licenses/sound-effects.md`](licenses/sound-effects.md).

## Release workflow dependencies

The official GitHub Actions used by the audit and Pages workflows are MIT
licensed and pinned to immutable reviewed commits. Their exact repositories,
commit IDs, and licence evidence are recorded in
`licenses/component-register-v1.json`. Node.js 24 is an open-source audit and
build tool and is not bundled with the game.
