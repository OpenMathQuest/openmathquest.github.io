# Release review: cross-device play

- **Updated:** 2026-07-29
- **Release:** Math Quest `1.0.0-beta.2`
- **Curriculum contract:** canonical versioned Math Quest manifest
- **Status:** **BETA 2 RECERTIFICATION, HOSTED REVIEW, AND REAL-IOS REVIEW
  PENDING**

The prior local baseline was exercised in a disposable Microsoft Edge
`150.0.4078.99` profile. The 56-check browser suite passed with no failures,
skips, unexpected requests, cleanup errors, or timeouts. This report does not
treat that earlier result as evidence for the changed Beta 2 candidate, and it
does not treat desktop viewport emulation as evidence from a real iPhone or
iPad.

## Delivery environments

| Environment | Delivery | Offline behaviour | Release status |
|---|---|---|---|
| Windows Edge or Chrome | `Math Quest.bat` starts the dependency-free loopback server at `127.0.0.1:8771` | Fully local after the folder is downloaded | Prior Edge 150 baseline only; exact Beta 2 rerun pending |
| Windows Edge, Chrome, or Firefox | `https://openmathquest.github.io/` | First successful load installs a same-origin offline app shell | Compatible target; hosted-origin smoke pending |
| iPhone Safari | `https://openmathquest.github.io/` | First successful load is designed to install the same-origin offline app shell | Phone-width touch layout passed in Edge emulation; real-device smoke pending |
| iPad Safari | `https://openmathquest.github.io/` | First successful load is designed to install the same-origin offline app shell | Tablet-width touch layout passed in Edge emulation; real-device smoke pending |
| Direct `file://` open | None | Browser-dependent | Not a supported launch path |

The Windows launcher intentionally binds only to loopback. An iPhone or iPad
cannot and should not connect to the computer's `127.0.0.1`; mobile devices use
the public static HTTPS build. Expanding the desktop server to a LAN listener is
not part of this beta and would require a separate security review.

## Interaction contract

All child-side play must be possible with visible click or tap controls. A
hardware keyboard and local speech synthesis are optional enhancements.

| Flow | Required visible control | Minimum target |
|---|---|---|
| First run | Nickname field, **Continue**, and **Continue without a name** | 44×44 CSS px |
| World choice | Three world-card buttons | Entire card |
| Session start or resume | Primary action button | 44×44 CSS px |
| Selection answer | Choice buttons and **Confirm** | 44×44 CSS px |
| Numeric or fractional construction | On-screen keypad and **Confirm** | 44×44 CSS px |
| Model construction | Method-specific manipulatives | 44×44 CSS px |
| Help, replay, next, and stop | Visible session buttons | 44×44 CSS px |
| Grown-ups area | Tabs, settings, backup, and reset | 44×44 CSS px |
| Adult test lab | Manifest level, skill, tier, and sample controls | 44×44 CSS px |

The release review must also confirm that no essential action depends on hover,
that focus indicators remain visible, and that keyboard operation does not
remove or weaken the touch path.

## Responsive and visual matrix

| Viewport | Primary purpose | Required checks |
|---|---|---|
| 1366×768 | Windows desktop baseline | Prompt, model, answers, and Confirm fit when the selected capability permits; no horizontal overflow |
| 390×844 | Phone portrait | Question precedes auxiliary controls; Confirm has an accessible first-screen or sticky path; no undersized text or targets |
| 820×1180 | Tablet portrait | World cards, models, keypads, and grown-up controls reflow without overlap |

Global visible text must remain at least 16 px. Child helper and body text must
remain at least 18 px, and essential narrow-screen controls must remain at
least 44×44 CSS px. Representative questions are selected from manifest
capabilities, not from hard-coded curriculum identifiers.

## Persistence and privacy boundaries

- Gameplay state uses schema version 3 under `math-quest:progress:v2`. The key
  identifies the Public Beta 2 namespace and intentionally does not mirror the
  internal schema number.
- Exact schema-2 Public Beta saves and backups migrate in temporary data by
  adding only the neutral empty placement record, then validate completely
  before replacement. Schema-3 backups cannot be opened by older schema-2
  builds; the exclusive writer lock serializes tabs but does not make mixed
  versions compatible.
- If that key is empty, valid Public Beta 1 state from `math-quest:v2` is
  copied under the new exclusive writer lease. The source record remains
  unchanged, so a stale Beta 1 tab cannot replace Beta 2 progress. The
  constant non-PII
  `math-quest:progress:v2:beta1-migration-guard:v1` marker exists only during
  incomplete cutover; while present, launch ignores unproven protected bytes
  and retries from the newest Beta 1 source.
- The optional first name or nickname remains in
  `math-quest:child-name:v1`, a separate browser-local record. Choosing
  anonymous play stores only a non-identifying onboarding preference.
- Private pre-beta progress under the old key is not translated, merged, or
  overwritten.
- The adult test lab must leave gameplay bytes, evidence, logs, daily counts,
  and active-session state unchanged.
- A paused starting-point check uses the separate
  `math-quest:placement-draft:v1` key. It is bounded to contract/generator
  identity, a local progress-baseline consistency fingerprint, the exact
  persisted nonnegative draft generation, seed, play day, theme, question
  identifiers, correctness booleans, and partial controls, and excludes
  nickname, age, timing, mastery evidence, logs, analytics, and backups.
  Discard removes it. Reset, successful import, and successful apply commit a
  generation later than current, imported, and safely parsed surviving-draft
  floors before attempting removal—even during unreadable-main recovery—so a
  surviving old draft cannot resume after reload;
  invalid or stale drafts do not change progress.
- Storage is origin-specific. A loopback save and a hosted save are separate;
  backup and restore are the deliberate transfer mechanism.
- The approved hosted origin is the organization root
  `https://openmathquest.github.io`, with no CNAME or custom domain. The
  `OpenMathQuest` organization must not host unrelated Pages sites because
  every Pages path under that organization shares origin-wide storage and the
  root Math Quest service worker controls `/`.

## Sound and speech

| Item | Contract |
|---|---|
| Sound effects | Optional and off by default |
| Volume and mute | Grown-up controlled |
| Effect files | Local files under `assets/sounds/` with recorded licence status |
| Automatic prompt speech | Optional, grown-up controlled, and off by default |
| Replay | Deliberate on-demand reading remains available while automatic speech is off |
| Speech source | Device-provided synthesis only; no recognition or upload |
| Failure mode | Play remains usable when audio or voices are unavailable |

## Prior baseline evidence (not Beta 2 clearance)

- Engine SHA-256:
  `07ec69208431d24698ba5f3e07b17e6428075d888b9f2127bee7035d1ab3392a`.
- Manifest SHA-256:
  `49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048`.
- Child-string SHA-256:
  `2a3ec6a773fe52959005a096554ee6864cf22643ae18fe28abecb66446685b6a`
  across 263 approved Beta 1 records. The current 276-record Beta 2 table is
  different and remains pending exact project-owner approval.
- Edge 150 completed all 56 browser assertions.
- The final GitHub-hosted Beta 2 run must additionally record the exact Edge
  or Chrome product name, full product version, executable SHA-256, `ImageOS`,
  and `ImageVersion` in its downloadable JSON audit artifact. Those values
  remain `PENDING` until independent review; the existing Edge-major note is
  not sufficient publication evidence.
- All 21 manifest levels passed the 390×844 mobile layout check.
- All 26 generator profiles passed 52 desktop/tablet layout inspections.
- Nine child question, Help, and re-teach cases passed at desktop, tablet, and
  phone widths.
- Both tenths/hundredths models, all four remainder interpretations, all eight
  declared volume facet combinations, and both timetable formats rendered and
  passed their effect-sensitive browser checks.
- The service worker cached all 14 required URLs: the detached release
  manifest plus 13 exact shell entries, including the install icons and three
  public legal documents. An offline navigation reopened the exact
  manifest-bound engine after the audit server stopped.
- Parent Test, preview, reset, backup/restore, name storage, and private
  pre-beta storage boundaries passed without progress contamination.

## External evidence still required

1. Use an actual iPhone and iPad, or record those items explicitly as release
   limitations; desktop emulation alone is not real-device evidence.
2. Confirm `OpenMathQuest/openmathquest.github.io` is configured with GitHub
   Actions as its Pages source, an empty base path, no CNAME, and HTTPS.
3. Deploy only the exact cleared `v1.0.0-beta.2` tag, then confirm the live
   root URL requests only allowlisted same-origin runtime assets, proves an
   offline reopen after disconnect, and sends no gameplay, nickname, or
   progress data.
4. Confirm the `OpenMathQuest` organization has no unrelated Pages deployment
   sharing this origin.

## Current verdict

**BETA 2 RECERTIFICATION, HOSTED REVIEW, AND REAL-IOS REVIEW PENDING.** The
prior baseline supports the test design but does not certify the changed
candidate. Public cross-device support must remain qualified until the exact
frozen Beta 2 build passes the complete local gate, is verified at
`https://openmathquest.github.io/`, and physical iPhone and iPad devices
complete the remaining checks.
