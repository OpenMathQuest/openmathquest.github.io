# Math Quest open-source and public-domain policy

## Rule

Math Quest fails closed on provenance. Every repository file, bundled asset,
vendored component, and executable dependency selected or fetched by the
repository's workflows must be one of the following:

1. original Math Quest work distributed under the repository's MIT License;
2. verifiably in the public domain or dedicated through CC0; or
3. covered by a reviewed, compatible open licence that permits commercial use,
   redistribution, and modification.

Material with an unknown licence or a restriction such as non-commercial,
no-derivatives, personal use, educational use only, permission only, or
royalty-free use is not eligible. An available paid licence is not a substitute
for an open licence under this policy.

The initial approved licence identifiers are:

- `Apache-2.0`
- `BSD-3-Clause`
- `MIT`
- `OFL-1.1`
- `OGL-UK-3.0`
- `CC-BY-4.0`
- `CC0-1.0`
- `LicenseRef-Public-Domain` with specific provenance evidence

A new identifier may not be added merely because it is described as free.
Compatibility, attribution, source availability, redistribution, modification,
trademark, patent, and share-alike obligations must be reviewed first.

## Required record

`licenses/component-register-v1.json` is the machine-readable release record.
Its exact `firstPartyPaths` inventory classifies repository-authored files and
must match the separately reviewed declaration at
`licenses/first-party-paths-v1.txt`. Adding a path to that declaration is an
explicit assertion of original MIT authorship and requires human review; the
inventory synchronizer must never make that assertion automatically. Every
other public path must resolve to a registered bundled component or
licence-evidence record.

Licence, attribution, policy, and provenance evidence paths are separately
declared in `licenses/evidence-paths-v1.json` with their exact SHA-256,
purpose, origin, and compatible licence expression. Component-register fields
may reference only those reviewed evidence paths. Changing or adding evidence
requires an explicit declaration update; a mutable component record cannot
turn an arbitrary new file into trusted evidence.
Before a component can ship or execute in a release workflow, the register must
identify its creator or provider, exact path or immutable commit, source URL,
licence identifier, licence evidence, attribution requirements, modification
status, and SHA-256 where bytes are bundled.

The public-candidate guard rejects:

- an unregistered file under `assets/` or any other unregistered binary;
- a registered byte hash that differs from the staged Git blob;
- a first-party register/declaration mismatch or an unreviewed new path;
- an evidence path, purpose, licence expression, or hash not present in the
  reviewed evidence declaration;
- a missing or orphaned licence-evidence file;
- an unapproved, restrictive, or ambiguous licence;
- an original project component not covered by MIT;
- a workflow action that is not pinned to its reviewed 40-character commit;
- a manifest source that conflicts with the registered reuse boundary; and
- platform emoji or similar third-party glyph artwork used as game art.

The guard examines the staged Git blobs, because those—not an unstaged working
copy—form the proposed public release.

Publication clearance must also match the deterministic rights-state digest
covering this policy, the component register, licence and attribution evidence,
release workflows, and every bundled font and sound byte. Changing any of
those inputs invalidates the earlier clearance.

## Facts and citations

Mathematical facts, coin denominations, measurements, laws, and other facts are
not imported expression. A factual citation to a non-bundled page is permitted
only when no source wording, image, recording, taxonomy, data compilation, or
other copyrightable material is copied or adapted. The component register and
provenance record must label this boundary explicitly.

If expressive material is quoted or adapted, it must independently meet the
open-licence or public-domain rule.

## Platform boundary

Windows, iOS, iPadOS, browsers, app stores, operating-system speech voices,
GitHub-hosted runner images, and user-installed shells or development tools are
compatibility targets, user-supplied platforms, or external execution
environments. They are not distributed as Math Quest components and may not
supply content to the release. Their presence does not permit proprietary
artwork, fonts, recordings, libraries, or other assets to be copied into the
game. Repository-selected Actions and downloaded executable dependencies are
still subject to the register and immutable-version rules.

In particular, operating-system emoji artwork is not used as Math Quest game
art. Visual cues are original HTML/CSS/SVG work covered by MIT.

## BBC Sound Effects

The BBC Sound Effects Archive is legitimate, but its ordinary RemArc terms are
limited to non-commercial personal, educational, or research use, with
separate commercial licensing. Those terms do not satisfy this policy.
Therefore no BBC Sound Effects recording or derivative may be bundled in Math
Quest unless the specific recording is later released under a separately
verified licence that satisfies this policy. A general archive or paid-use
licence is insufficient.

## Change control

Completion status follows the
[normative finished-work policy](AGENTS.md#what-counts-as-finished-work): a
rights change may be **implemented** with its applicable focused checks
passing, becomes **release-certified** only through the exact frozen-candidate
gauntlet, and is **shipped** only when those certified bytes are published.

Any new or changed dependency, font, sound, image, icon, animation, dataset,
quotation, curriculum excerpt, or executable workflow component must update the
component register and notices before it enters the staged public tree. The
applicable focused rights and regression checks must run during development.
The complete release audit runs once after the resulting release candidate is
frozen and immediately before publication; any change after that run requires
a new freeze and complete rerun. Absence from the register means the material
may not ship.
