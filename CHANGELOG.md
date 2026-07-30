# Changelog

All notable public changes to Math Quest are recorded here.

## 1.0.0-beta.3 — Unreleased

- Removed the inert Home control from the Home screen while retaining working
  Home navigation from child-session, grown-up, and information screens.
- Made every child answer stop on a large, focused **Correct.** or **Not
  correct yet.** outcome before progression is offered.
- Rotated ordinary sessions across due learning obligations instead of
  repeating one skill, while preserving each skill's ordered Concrete,
  Pictorial, and Abstract progression.
- Required mastery evidence to cover every declared task type and CPA phase in
  order; obsolete Pictorial-only mastery records now migrate conservatively.
- Added task-specific visual operands, accessible descriptions, Replay text,
  and physical-task instructions for clocks, elapsed time, angles, measures,
  geometry, and other visually dependent questions.
- Corrected fractional division-estimate generation and ambiguous
  attribute-comparison wording.
- Strengthened early pattern options so every card has a visible glyph and
  spoken label.
- Hardened the browser audit with a closed 71-result oracle and a bounded
  browser-shutdown deadline.

## 1.0.0-beta.2 — 2026-07-30

- Added a Safari Home Screen installation and recovery flow for iPhone and
  iPad.
- Added byte-verified offline shell installation, local cache readiness,
  repair, and waiting-worker update controls.
- Added a detached canonical shell manifest that binds every required cached
  file by SHA-256, byte length, MIME type, and successful status.
- Hardened the Windows loopback launcher with an exact runtime allowlist,
  strict loopback Host validation, and restrictive response headers.
- Added Beta 2 PWA integrity tests and a fail-closed real-device qualification
  plan spanning three supported iOS/iPadOS generations.
- Reworked child question, Help, re-teach, and feedback layouts so answer
  controls remain in natural document order and early work avoids hidden
  nested scrolling.
- Added exact, persistent correct/not-correct feedback with distinct visual
  symbols and focus restoration after interactive construction controls.
- Replaced generic pairing and sorting fields with self-explanatory,
  touch-first pictorial controls and categorical bins.
- Made automatic read-aloud and sound effects opt-in and off by default while
  retaining deliberate local Replay, Test Voice, and Test Sound controls.
- Isolated Beta 2 progress under `math-quest:progress:v2`; a valid Beta 1
  record is copied under the new writer lock without changing its source, so
  an older open tab cannot overwrite Beta 2 progress.
- Advanced Public Beta 2 state to schema 3 without changing that protected
  key. Exact schema-2 saves and backups gain only the empty placement record
  and zero-valued draft generation through a validate-before-commit migration;
  downgrade and incompatible imports fail without replacing live bytes.
- Hardened local audio cancellation, unavailable-voice fallback, re-teach
  narration, and interrupted-Replay timing without adding recording or network
  speech paths.
- Added an optional grown-up-started 10-to-20-question starting-point check.
  Its crash-resumable draft is separate from ordinary progress, its answers
  create no mastery evidence, it never moves existing progress backward, and
  earlier skills remain distinguishable as an inferred starting range and
  scheduled for later review. The game states that those skills were not
  checked one by one.
- Added a delayed grown-up second confirmation before a starting point can
  change progress, neutral **Not sure** feedback, spoken option positions, and
  an 18 px placement text floor. Placement-only selection questions remove any
  generated `not sure` distractor so it cannot compete with the global action.
- Kept that draft under `math-quest:placement-draft:v1` with only bounded
  resume fields. It excludes nickname, age, timing, mastery evidence, logs,
  analytics, and exported backups. Each draft carries the persisted generation;
  reset, import, and successful application commit a later generation before
  attempting removal, so even a surviving old draft is rejected on reload.

## 1.0.0-beta.1 — 2026-07-28

- Added an independently authored, versioned curriculum manifest containing
  126 skills across 21 levels.
- Added deterministic practice, mastery, re-teaching, spacing, fatigue, and
  progress-isolated Parent Test behaviour.
- Added responsive child and grown-up interfaces for touch, mouse, keyboard,
  switch-style scanning, reduced motion, local speech, and offline play.
- Added an optional child nickname stored separately on the current device and
  excluded from gameplay backups.
- Added first-party sound effects, the open-licensed Inter font, complete
  component provenance, and a fail-closed open-source policy.
- Added original first-party web app and Apple touch icons with exact
  provenance and metadata checks.
- Added deterministic, semantic, mutation, coverage, browser, privacy,
  accessibility, metadata, and public-candidate release checks.
- Added a fail-closed organization-root GitHub Pages workflow for the exact
  annotated beta tag at `https://openmathquest.github.io/`.
