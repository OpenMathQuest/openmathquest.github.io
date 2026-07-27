# Release review: cross-device play

- **Updated:** 2026-07-27
- **Release:** Math Quest `1.0.0-beta.1`
- **Curriculum contract:** canonical versioned Math Quest manifest
- **Status:** **LOCAL BROWSER REVIEW PASS; HOSTED AND REAL-IOS REVIEW PENDING**

The final local candidate was exercised in a disposable Microsoft Edge
`150.0.4078.99` profile. The 56-check browser suite passed with no failures,
skips, unexpected requests, cleanup errors, or timeouts. This report does not
treat desktop viewport emulation as evidence from a real iPhone or iPad.

## Delivery environments

| Environment | Delivery | Offline behaviour | Release status |
|---|---|---|---|
| Windows Edge or Chrome | `Math Quest.bat` starts the dependency-free loopback server at `127.0.0.1:8771` | Fully local after the folder is downloaded | Verified in Edge 150, including reload and offline reopen |
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

- Gameplay state uses schema version 2 under `math-quest:v2`.
- The optional first name or nickname remains in
  `math-quest:child-name:v1`, a separate browser-local record. Choosing
  anonymous play stores only a non-identifying onboarding preference.
- Private pre-beta progress under the old key is not translated, merged, or
  overwritten.
- The adult test lab must leave gameplay bytes, evidence, logs, daily counts,
  and active-session state unchanged.
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
| Speech | Device-provided speech synthesis only; no recognition or upload |
| Failure mode | Play remains usable when audio or voices are unavailable |

## Measured final-candidate evidence

- Engine SHA-256:
  `07ec69208431d24698ba5f3e07b17e6428075d888b9f2127bee7035d1ab3392a`.
- Manifest SHA-256:
  `49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048`.
- Child-string SHA-256:
  `2a3ec6a773fe52959005a096554ee6864cf22643ae18fe28abecb66446685b6a`
  across 263 approved records.
- Edge 150 completed all 56 browser assertions.
- All 21 manifest levels passed the 390×844 mobile layout check.
- All 26 generator profiles passed 52 desktop/tablet layout inspections.
- Nine child question, Help, and re-teach cases passed at desktop, tablet, and
  phone widths.
- Both tenths/hundredths models, all four remainder interpretations, all eight
  declared volume facet combinations, and both timetable formats rendered and
  passed their effect-sensitive browser checks.
- The service worker cached all 16 shell entries, including the install icons
  and their shipped provenance record, and an offline navigation
  reopened the exact manifest-bound engine after the audit server stopped.
- Parent Test, preview, reset, backup/restore, name storage, and private
  pre-beta storage boundaries passed without progress contamination.

## External evidence still required

1. Use an actual iPhone and iPad, or record those items explicitly as release
   limitations; desktop emulation alone is not real-device evidence.
2. Confirm `OpenMathQuest/openmathquest.github.io` is configured with GitHub
   Actions as its Pages source, an empty base path, no CNAME, and HTTPS.
3. Deploy only the exact cleared `v1.0.0-beta.1` tag, then confirm the live
   root URL requests only allowlisted same-origin runtime assets, proves an
   offline reopen after disconnect, and sends no gameplay, nickname, or
   progress data.
4. Confirm the `OpenMathQuest` organization has no unrelated Pages deployment
   sharing this origin.

## Current verdict

**LOCAL BROWSER REVIEW PASS; HOSTED AND REAL-IOS REVIEW PENDING.** The exact
manifest-bound candidate has a verified dependency-free offline Windows path
and responsive, touch-first phone/tablet layouts. Public cross-device support
must remain qualified until the exact tagged build is verified at
`https://openmathquest.github.io/` and physical iPhone and iPad devices
complete the remaining checks.
