# Math Quest

Math Quest is an offline-first, browser-based mathematics game for a child and
a grown-up to use together. Public Beta 1 is driven by an independently
authored, neutral curriculum manifest containing 126 skills across 21 ordered
levels, from pre-kindergarten through Grade 5.

Release target: **v1.0.0-beta.1**

> This is beta software. A grown-up should co-play, especially when a skill is
> new, and report any ambiguous question or grading error.

## Play

### Windows desktop

1. Download or clone the repository.
2. Double-click `Math Quest.bat`.
3. Keep the PowerShell window open while playing.
4. Close that window, or press Ctrl+C, when finished.

The launcher serves the game only to the same computer at
`http://127.0.0.1:8771/index.html`. It does not expose the game to another
device on the local network. All required runtime assets are included in the
repository.

### Hosted beta

The approved GitHub Pages release address is
[https://openmathquest.github.io/](https://openmathquest.github.io/). It will
remain a release target, rather than a claim of a live verified deployment,
until the exact tagged beta passes the remaining publication gates.

The `OpenMathQuest` organization and its root Pages repository,
`OpenMathQuest/openmathquest.github.io`, are reserved exclusively for Math
Quest Pages. No CNAME or custom domain is used. The initial page load requires
a network connection; after it loads, gameplay does not depend on remote
scripts, fonts, audio, speech, analytics, or APIs. A same-origin service worker
stores only the versioned first-party app shell, so the reviewed game can
reopen offline after one complete successful load. Clearing site data removes
that offline copy as well as local progress.

Progress belongs to the browser profile and origin where the game is played.
There is no account or cloud synchronization. Moving between the desktop
launcher and a hosted site requires a deliberate backup and restore.

The Pages workflow is dispatched from protected `main` only while that branch
and its exact `release_tag` input resolve to the same annotated
`v1.0.0-beta.1` commit. Its product version and publication-clearance hashes
must match the reviewed candidate. The hosted link is not considered verified
until the repository identity, root Pages configuration, absence of a CNAME,
HTTPS, and deployed artifact have passed review.

### Phones and tablets

Open the hosted beta in a current standards-based browser. Essential actions
use visible touch controls; a hardware keyboard is optional. Browser storage
remains specific to that browser, device, and origin.

## Curriculum

The canonical file is
`curriculum/math-quest-manifest-v1.json`. It defines the exact 21-level,
126-skill sequence, neutral skill IDs, prerequisites, learning roles, CPA
phases, generator profiles, representations, skill constraints, and required
semantic task-type witnesses. A multi-variant skill cannot become solid until
every declared task type has a clean evidentiary witness.

Counts, stage boundaries, progress denominators, and Parent Test choices are
derived from that manifest. The sequence is independently authored from
documented mathematical prerequisites and openly reusable or factual reference
material; it does not preserve a publisher's identifiers, wording, chapters,
grouping, or ordered compilation.

The journey includes Canadian money and metric contexts, along with:

- number sense, patterns, place value, and operations;
- multiplication and division;
- fractions and decimals;
- measurement, time, money, data, and geometry; and
- introductory algebraic reasoning appropriate through Grade 5.

Trigonometry is outside this pre-kindergarten-to-Grade-5 scope.

## Child and grown-up experience

- Short sessions with deterministic spaced review and prerequisite gating
- Ocean, Forest, and Space themes that do not change learning requirements
- Large select-and-confirm choices and construction-style inputs
- Ten-frames, number bonds, number lines, arrays, fractions, clocks, money,
  measurement, graphs, and bar models
- Optional operating-system speech synthesis and gentle local sound effects
- Touch, mouse, keyboard, switch-style scanning, and reduced-motion support
- A progress-isolated Parent Test lab for inspecting every manifest skill
- Local backup, transactional restore, reset, preview, limits, and evidence
  views in the Grown-ups corner

The first screen can collect an optional child first name or nickname for
local display, or continue anonymously. The product and repository contain no
built-in child's name.

## Privacy

The optional display name and learning record remain in browser
`localStorage`. Math Quest has no accounts, advertising, analytics,
application-level uploads, or cloud database.

- The display name is stored separately from progress.
- Removing the display name does not erase progress.
- Resetting progress is a separate grown-up action.
- Exported backups contain learning history and should be kept private.
- Never attach a backup or identifying screenshot to a public issue.
- A hosting provider can receive ordinary request metadata while serving the
  site.

See [PRIVACY.md](PRIVACY.md) for the exact storage boundary, deletion steps,
and public issue-reporting guidance.

## Development and verification

The deterministic engine is the single expression between
`/* ===ENGINE-START=== */` and `/* ===ENGINE-END=== */` in `index.html`.
Browser storage, rendering, speech, clocks, and other effects remain outside
that block.

The stable development contract is
[`docs/development/build-spec.md`](docs/development/build-spec.md). The
repository layout and generated-file boundary are documented in
[`docs/repository-structure.md`](docs/repository-structure.md).

On Windows:

```powershell
.\audit.bat
```

The release review checks the exact shipped engine and manifest bytes,
deterministic generation and grading, mastery behavior, native branch coverage,
mutation families, state-schema isolation, privacy, runtime requests,
accessibility, browser behavior, offline app-shell recovery, and visual layout.

Public Beta 1 uses state schema version 2 and the progress key
`math-quest:v2`. Earlier private pre-beta evidence is not translated into the
new curriculum and remains under its separate legacy key.

The Pages workflow publishes an explicit runtime allowlist. It must fail closed
unless a checked-in `PUBLICATION_CLEARANCE.md` binds approval to the exact
manifest version and SHA-256, exact engine SHA-256, exact open-component
rights-state SHA-256, public-payload digest, and clearance-excluded payload
tree. No clearance should be inferred from this README.

Release preparation and remaining external gates are tracked in the
[readiness record](docs/release/readiness.md),
[release checklist](docs/release/checklist.md), and
[publication gates](docs/release/publication-gates.md). The exact staged path
inventory is `docs/release/public-file-manifest.txt`.

## Reporting a bug

Use the issue template in `.github/ISSUE_TEMPLATE/`.

Include:

- the neutral skill ID, level, tier, and sample number, if visible;
- device, browser, and approximate viewport;
- what was selected and what happened; and
- a screenshot cropped to the game area only when it has no identifying
  information.

Never upload a game backup. Follow [SECURITY.md](SECURITY.md) for a security or
privacy concern instead of opening a public issue.

## Third-party material

Inter is bundled under the SIL Open Font License 1.1. The current sound effects
are locally generated placeholder tones, not BBC archive recordings. Details,
hashes, and license records are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.

Math Quest accepts only original MIT-licensed work, verified public-domain or
CC0 material, or reviewed compatible open-licensed components that permit
commercial use, redistribution, and modification. Restrictive or unknown
licences fail the release audit. See
[OPEN_SOURCE_POLICY.md](OPEN_SOURCE_POLICY.md) and the machine-readable
[component register](licenses/component-register-v1.json).

## License

Original Math Quest code and documentation are available under the
[MIT License](LICENSE). Third-party assets retain their stated licenses.
