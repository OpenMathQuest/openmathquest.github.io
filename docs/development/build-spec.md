# Math Quest — Public Beta Build Contract

- **Contract version:** `3.0`
- **Date:** `2026-07-27`
- **Digest record:** `research/build-axioms.md`
- **Status:** active for the independently authored public beta

## Objective

Build a child-playable, grown-up-supported mathematics game from pre-K through
Grade 5. The game must work offline after it is loaded, keep progress on the
device, and be usable with touch, mouse, keyboard, or switch-style controls.

The public beta is driven by the independently authored
`curriculum/math-quest-manifest-v1.json`: 126 neutral skills arranged into 21
ordered levels spanning seven stage bands. Preserve suitable
deterministic-engine, mastery, accessibility, visual-model, Parent Test,
backup, and responsive-layout work, but do not preserve an external
curriculum's taxonomy, wording, identifiers, grouping, or sequence.

## Independent curriculum contract

The repository must contain one canonical, versioned curriculum manifest.
That manifest is the source of truth for:

- the ordered journey and its level boundaries;
- neutral public skill identifiers;
- stage and strand labels;
- independently written titles and learning objectives;
- gateway and supporting classifications;
- prerequisites;
- Concrete, Pictorial, and Abstract requirements;
- generator and representation families; and
- any mastery witness requirements that vary by skill.

Every skill declares one or more semantic task types. Every generated question
names exactly one declared task type, and a skill cannot become solid until
each required task type has a clean evidentiary witness. Generator audits must
verify the mathematics and model semantics for every declared task type; a
self-grading correct answer is not enough.

The 126-skill, 21-level contract is versioned with the manifest. Runtime skill
counts, level counts, stage boundaries, and progress denominators must be
derived from the manifest rather than duplicated as hand-maintained constants.

The manifest may synthesize mathematical ideas from multiple lawful,
authoritative references. Use references to understand facts, not to copy a
source's expressive wording, proprietary taxonomy, chapter structure, or
ordered compilation. Record enough provenance to repeat the research and
distinguish original writing from quoted or licensed material.

Before release, canonicalize the exact manifest, compute its SHA-256 digest,
embed the expected digest in the release records, and prove that the shipped
runtime skill table matches the canonical manifest.

## Runtime and architecture

Ship the child game in `index.html`. Keep exactly one deterministic,
side-effect-free engine between the unique `ENGINE-START` and `ENGINE-END`
markers. The engine receives state, play day, time values, seed, and random
state as data; it returns new data and effects. Browser storage, speech,
rendering, clocks, timers, and other ambient operations stay outside the
engine.

Expose stable APIs for state creation and loading, deterministic question
generation, exact grading, answer submission, queue construction, attempt
application, session completion, and transactional import/export.

Use state schema version 2 and a version-2 storage namespace. Do not translate
pre-beta mastery or evidence into the new curriculum: the meaning and order of
skills changed. Leave earlier browser data untouched, begin the independent
journey with clean evidence, and explain this boundary to grown-ups.

Keep the game playable without runtime network access. Package every required
font, icon, sound, and visual asset locally or inline. The hosted build uses a
same-origin service worker to cache the reviewed app shell after the first
successful load; the desktop build remains loopback-only. Do not add accounts,
analytics, advertising, remote speech, or cloud synchronization.

## Teaching and mastery

Every skill declares how it moves from Concrete experience to Pictorial
representation to Abstract notation. A physical-object prompt counts as
Concrete; an on-screen manipulative counts as Pictorial. Scaffolding and
re-teaching never count as mastery evidence.

Preserve these general learning safeguards:

- deterministic spaced review using the locked interval schedule;
- same-session second exposures for early learners;
- at most one mastery success for a skill on one play day;
- distinct day and sample requirements;
- hard, model, construction, and applied witnesses where applicable;
- prerequisite gating while the full journey remains visible;
- gateway pull-back, demotion recovery, and level re-teaching;
- promotion only when all current gateways and the locked solid-skill ratio
  are satisfied; and
- capstone and Parent Test activity as non-evidentiary.

Selection questions use select-then-confirm. A question may show two or more
answers when that is the clearest truthful interaction. Only formats that meet
the engine's evidence safeguards may contribute selection evidence. All
selection questions must have distinct options under the real grader and
exactly one correct option.

## Child experience

Design for a young pre-reader co-playing with a grown-up:

- use local speech with replay for prompts and feedback;
- keep early screens icon-first and independently completable without reading;
- use large, well-spaced controls and a visible focus state;
- keep essential child text at least 18 CSS pixels and all other visible text
  at least 16 CSS pixels;
- keep the prompt, answer controls, and Confirm action in the first desktop
  viewport whenever practical;
- do not place decorative art where it can be mistaken for question content;
- do not rely on colour, hover, drag-and-drop, or fine pointer precision;
- respect reduced-motion preferences; and
- use neutral process and observation feedback without scores, prizes,
  ability labels, or comparative praise.

World or theme choices may change decoration and examples, but never the
mathematics, mastery obligations, or evidence.

## Canadian context

Use metric measurement contexts and Canadian money. Ordinary coin work uses
5-cent, 10-cent, 25-cent, 1-dollar, and 2-dollar coins. Clearly label any
retained customary-unit activity as an extension.

## Grown-up tools

The Grown-ups corner must provide:

- an editable or removable local child display name;
- mastery and evidence detail;
- session logs and due-review information;
- non-evidentiary level preview;
- practice and time caps;
- local speech settings;
- transactional JSON backup and restore;
- reset; and
- feedback-voice controls.

Parent Test is a disposable diagnostic mode. It can select any manifest skill,
tier, representation, and sample, but cannot change progress, spacing, daily
counts, settings, logs, feedback history, or the active child session.

## Public-tree and privacy requirements

The public repository must contain no private names, machine-specific paths,
addresses, credentials, tokens, passwords, hidden personal metadata, or
unlicensed reference files. Keep private pre-beta material outside the
published file set. Keep the optional display name outside exported progress
backups, and still treat those backups as sensitive because they contain
learning history.

Use the dedicated organization-root origin
`https://openmathquest.github.io`, served from
`OpenMathQuest/openmathquest.github.io`, with no CNAME or custom domain.
Reserve the `OpenMathQuest` organization exclusively for Math Quest Pages
because browser storage is origin-wide and the root service worker controls
`/`. Do not claim a hosted release until the exact reviewed tag, repository
identity, empty Pages base path, GitHub Actions publishing source, HTTPS, and
deployed artifact have all been verified.

## Release audit

The complete release review must test the exact shipped bytes and fail closed.
At minimum, it must verify:

1. manifest schema, canonical digest, neutral identifiers, unique order,
   prerequisite acyclicity, and runtime equality;
2. coverage of every declared task-type witness by a semantically aligned
   generator, grader, representation, mastery path, and Parent Test path;
3. unique engine markers, exact engine digest, purity, determinism, restricted
   evaluation, branch calibration, branch coverage, and mutation checks;
4. mastery, spacing, demotion, re-teaching, promotion, fatigue, session-stop,
   capstone, and preview-isolation boundaries;
5. exact fraction and decimal grading plus unambiguous option generation;
6. state-schema validation, version-2 storage isolation, transactional
   import/export, and rejection of unsupported legacy evidence;
7. local-only speech and assets, runtime network blocking, privacy scans, and
   public-tree provenance;
8. keyboard, touch, mouse, and switch-style operation at desktop, phone, and
   tablet viewports;
9. semantic model rendering, early no-scroll behavior, text-size floors,
   reduced motion, and child-facing visual clarity; and
10. reproducibility of the approved child-string table and its digest.

Predict countable audit results before the final run, reconcile predictions
with actual results, and record failures, skips, and residual risks. Do not
declare the public beta ready while any technical, privacy, rights, visual, or
deployment gate is unresolved.
