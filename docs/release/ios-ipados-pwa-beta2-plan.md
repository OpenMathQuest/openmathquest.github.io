# Math Quest Public Beta 2: iOS and iPadOS PWA qualification plan

- **Plan date:** 2026-07-28
- **Target release:** `v1.0.0-beta.2`
- **Delivery model:** Safari-installed Progressive Web App (PWA)
- **Plan status:** Decisions complete; implementation in progress
- **Privacy posture:** Fail closed
- **Security intake:** GitHub private vulnerability reporting enabled and
  verified
- **Release posture:** No changed build may reach a protected/public release
  ref before its matching authorization; only an explicitly authorized,
  no-announcement canary may precede final approval

This document defines what it means for Math Quest to function well on current
and recent iPhones and iPads, how a grown-up will install it, how offline play
will be proven, and how independent critics will challenge the final candidate.
It is an implementation and verification plan, not release clearance.

## 1. Approved decisions

| ID | Approved decision |
|---|---|
| 1A | Public Beta 2 will be an installable Safari PWA. A native App Store option remains a planned decision near the end of the beta series. |
| 2A | Physical iPhone and iPad testing is available. |
| 3B | The support target spans at least three major iOS/iPadOS generations. |
| 4A | A real-device cloud service may be used only if its privacy terms and technical controls pass the fail-closed qualification in this plan. Otherwise testing automatically falls back to owned or borrowed physical devices. |
| 5A | Six context-independent specialist critics and one independent adjudicator must review the frozen final candidate before it is pushed. |
| 6B | No Mac is available. Xcode, an iOS Simulator, and Mac-based Safari Web Inspector are therefore not part of the Beta 2 critical path. |
| 7A | Coverage is layered: every declared skill and procedural variant is automated; every input, model, accessibility, and platform family is tested on real Apple devices; the complete child journey runs on the primary iPad; and deterministic risk-based samples run on the remaining device/OS combinations. |
| 8A | Beta 2 adds a grown-up-facing **Install on iPad** flow with Safari instructions, advisory installation-state detection, cache-readiness confirmation, and standalone/offline launch instructions. |
| 9A | Critical and high findings block release. A medium finding requires a fix or the project owner's explicit documented acceptance. Low findings remain visible and may enter the backlog. Nothing may be silently dismissed. |

### 1.1 Beta 4 owner-directed gate revision

On 2026-07-30, the project owner superseded decisions 2A, 3B, 5A, and the
release-blocking portions of 7A for Beta 4 and later candidates:

- the six-lane physical-device matrix and primary-iPad journey remain
  available as an offered optional qualification cycle;
- the six context-independent critic packets remain available as an offered
  optional review cycle;
- declining either cycle requires the exact closed-schema
  `OPTIONAL_NOT_RUN` state and makes no device-support or independent-review
  pass claim;
- selecting either cycle activates every requirement in this document for
  that cycle, including complete lanes/reports, exact digests, and
  fail-closed partial-evidence handling; and
- host qualification follows the later prerelease/stable boundary in section
  1.2; independent adjudication, finding disposition, hosted-Windows evidence,
  and owner authorization remain mandatory. The 2026-08-09 owner decision
  skips the Beta 4 canary only, visibly and without a pass claim.

On 2026-08-02, the owner selected the declined state for both optional cycles
for `v1.0.0-beta.4`. The six physical-device lanes and six independent-reviewer
packets will not be undertaken for this release. `PUBLICATION_CLEARANCE.md`
therefore records exact `OPTIONAL_NOT_RUN`/`NONE`/zero fields for both cycles,
and Beta 4 makes no corresponding physical-device or independent-review claim.
This selection is release-scoped; the two cycles must be offered again for a
later candidate unless a later owner directive changes their standing policy.

All later unconditional “must” language about the six device lanes or six
critic packets is therefore conditional on selecting that optional cycle.
Historical Beta 2 decisions remain recorded above rather than silently
rewritten.

### 1.2 Prerelease host-qualification revision

On 2026-08-02, the project owner directed that external child-facing host
privacy/legal qualification wait until Math Quest leaves prerelease. Beginning
with `v1.0.0-beta.4`, an eligible semantic-version prerelease records
`EXT-HOST` as exact `DEFERRED_PRERELEASE`, reported as `DEFERRED`, never PASS,
approved, waived, or privacy-cleared. Before the first stable tag, the selected
host must be affirmatively approved or the runnable game must move to one that
is; stable publication fails closed otherwise.

This changes no application privacy requirement. Automatic child-name,
progress, answer, and gameplay-telemetry transmission remains prohibited, as
do analytics, advertising, accounts, cloud synchronization, remote speech,
and unapproved runtime dependencies. A hosted-beta notice must disclose that
the provider may receive ordinary HTTPS request metadata. Except for the exact
Beta 4 owner skip recorded on 2026-08-09, the exact-candidate trusted-HTTPS
canary remains mandatory, uses synthetic data, and proves only
candidate/PWA/offline behavior—not host privacy qualification. Beta 4 records
`OWNER_SKIPPED_BETA4`/`NONE`; no canary effect is claimed.

## 2. Release objective

Beta 2 qualifies only if a grown-up can:

1. open the official HTTPS site in Safari;
2. understand how to add Math Quest to the Home Screen;
3. confirm that the exact Beta 2 app shell is locally cached;
4. launch it as a standalone web app;
5. complete a representative session without a network connection;
6. retain, export, restore, and deliberately delete local progress; and
7. use every essential child and grown-up interaction with touch.

A child must be able to complete the full primary-iPad journey without a
keyboard, mouse, account, network connection during play, or audio.

“Functions well” means all required tests pass, there are no unresolved
critical or high findings, every unresolved medium finding has the project
owner's explicit recorded acceptance, and the shipped bytes exactly match the
reviewed bytes.

## 3. Scope and non-goals

### In scope for Beta 2

- Safari browser play on iPhone and iPad.
- Installation from Safari to the Home Screen as a standalone web app.
- Online first load and offline relaunch.
- Safe update from Public Beta 1 to Public Beta 2.
- Touch, optional hardware keyboard, VoiceOver, Switch Control, larger text,
  reduced motion, portrait, landscape, and supported iPad multitasking sizes.
- Local progress, optional nickname, settings, backup/restore, Parent Test
  isolation, and reset.
- Local device speech synthesis and bundled optional sound effects.
- Privacy-safe, reproducible evidence from real Apple devices.

### Explicitly out of scope

- App Store distribution, native Swift/SwiftUI packaging, TestFlight, and an
  Apple Developer Program account. These remain a separate late-beta workstream.
- Cloud accounts, analytics, advertising, telemetry, remote progress sync,
  speech recognition, or application-level upload.
- Claiming that a desktop responsive viewport, Playwright WebKit, or an iOS
  simulator is real-iPhone or real-iPad evidence.
- Supporting beta operating systems as a release requirement. They may be
  exploratory only and may not replace stable-version evidence.
- Downgrading a family device or weakening its security configuration to reach
  an older operating system.

Any library, runner, font, icon, sound, or other shipped component added during
this work must satisfy `OPEN_SOURCE_POLICY.md`, enter the component register,
and pass the existing rights audit. The preferred implementation uses no new
runtime dependency or third-party asset.

## 4. Apple platform facts that constrain the design

1. Safari does not expose the Chromium `beforeinstallprompt` event and does not
   allow the page to initiate Home Screen installation. **Install on iPad**
   must open instructions; it cannot truthfully be a one-tap installer.
2. Apple's current iPad instructions use Safari's **Share**, **More**,
   **Add to Home Screen**, and **Add** controls; current releases may also show
   **Open as Web App**, while older supported releases may not.
3. A manifest with `display: standalone` creates a separate Home Screen web-app
   experience. Math Quest already declares standalone display and supplies an
   Apple touch icon.
4. `navigator.standalone === true` and
   `matchMedia("(display-mode: standalone)")` can help identify an installed
   launch, but neither result is sufficient proof by itself. Detection is
   advisory and must never hide recovery instructions.
5. A service worker and Cache Storage enable offline play, but browser storage
   can still be removed by the user, storage pressure, browser policy, or
   device management. “Offline ready” is a current-state result, not a
   permanent guarantee.
6. Safari and an installed Home Screen web app receive the same kind of origin
   quota policy, but use separate data containers. Since iOS/iPadOS 17.2,
   cookies may be copied at installation; `localStorage`, Cache Storage, and
   other website data are not copied or subsequently shared. Math Quest
   progress, nickname, and offline cache therefore do not automatically move
   from a Safari tab into the installed app.
7. Mac-based Safari inspection normally requires a connected Mac. Because the
   project has no Mac, the build needs a local, non-transmitting diagnostics
   view and evidence that can be read directly on the test device.

## 5. Supported-device contract

Exact patch versions and device models must be frozen in the private evidence
ledger on the day testing starts. Only Apple-supported security branches may
qualify; an obsolete unpatched device is not acceptable merely to obtain an
older version number. As of the plan date, the release-blocking rows are:

| Required row | Stable branch as of 2026-07-28 | Minimum real-device evidence |
|---|---|---|
| Current iPad | iPadOS 26.6 | Full journey, installation, update, and offline lifecycle |
| Legacy iPad 18 | iPadOS 18.7.9 | Full PWA lifecycle |
| Legacy iPad 17 | iPadOS 17.7.11 | Full PWA lifecycle |
| Current iPhone | iOS 26.6 | Core child journey and full PWA lifecycle |
| Legacy iPhone 18 | iOS 18.7.9 | Core PWA lifecycle |
| Legacy iPhone 16 | iOS 16.7.16 | Core PWA lifecycle |

The exact matrix must cover:

- one iPhone narrow portrait viewport;
- at least two iPad form factors, including portrait and landscape;
- Safari browser and installed standalone modes;
- online first load, offline warm launch, and offline cold relaunch;
- one current iPad multitasking or reduced-width window where the device
  supports it; and
- background/resume, orientation change, low-power mode, language/region, and
  an interrupted session.

The primary iPad is the full-journey device. Other lanes may use another owned
device, a borrowed physical device cleared of Math Quest data afterward, or a
privacy-qualified remote physical device. If a stable generation cannot be
tested, the release must be held or its public support claim narrowed before
release; this mandatory-evidence gap is not a waivable medium finding.
Emulation may not fill it. Shared iPad and managed/MDM configurations are
excluded from the Beta 2 support claim unless separately qualified, because
policy can disable Safari or Home Screen web apps. Safari Lockdown Mode is
also excluded because WebKit disables Web Locks there; the game must pause
before child play and recommend another qualified configuration without
asking a family to weaken a security setting.

## 6. Grown-up installation experience

### 6.1 Entry point

Add a visible **Install on iPad** control to the initial grown-up gate, before a
nickname or progress is created, and retain it in the Grown-ups corner. It must
be at least 44 by 44 CSS pixels, operable by tap and keyboard, and have a clear
accessible name. It opens an in-game instruction sheet and never navigates to
an external tutorial.

The sheet must remain available after installation so a grown-up can reinstall
or recover from removed site data. It must not rely solely on user-agent
sniffing or hide information when platform detection is uncertain. Safari 26
does not reliably expose the true OS generation in its traditional user-agent
token; feature and state detection is used only for the current context.

### 6.2 Required instructions

The concise iPad path is:

1. Open the official Math Quest address in **Safari**.
2. Tap **Share**.
3. If necessary, tap **More**.
4. Tap **Add to Home Screen**.
5. If **Open as Web App** appears, leave it turned on.
6. Tap **Add**.
7. Open **Math Quest** from the Home Screen once while online.
8. Complete the offline check described below.

The sheet must explain that the icon is installed only on that device and that
progress is browser-local unless a grown-up deliberately exports and imports a
backup. It must include recovery for an in-app browser, a missing Share/Add
action, Screen Time or management restrictions, a duplicate icon, and removing
then re-adding an install made with **Open as Web App** turned off.

The sheet itself must be accessible: semantic heading/dialog structure,
ordered steps, focus containment and return, one clear close action, accurate
VoiceOver announcements, reduced motion, and 44-pixel controls.

### 6.3 Local readiness states

The UI must distinguish these states instead of using one ambiguous “installed”
badge:

| State | Meaning | Required message/action |
|---|---|---|
| Not controlled | No active Math Quest service worker controls the page | Stay online and reload; do not claim offline readiness |
| Caching | The active Beta 2 shell is being installed, verified, or repaired | Show active-shell progress without blocking ordinary online play |
| App shell ready | The active worker reports the exact Beta 2 cache name and every required path is present | Say **Ready for an offline check**, not permanently guaranteed |
| Candidate update | A separate check, cache, ready, activation, or error lifecycle exists for a possible replacement worker | Report it separately; a failed or redundant candidate must not relabel a ready active shell. Promise that an offline version remains available only while a current controller plus validated active readiness proves it; fresh or unready setup must say to stay online or retry |
| Standalone context detected | Standards detection or the Apple fallback indicates this window is a Home Screen launch | Say **This window opened as an app** while retaining reinstall help |
| Recovery needed | A required cache entry, worker, or storage record is absent or mismatched | Offer a same-origin repair/reload path and preserve valid progress |

The readiness response must contain only release version, cache identity,
required-path results, worker state, and a local timestamp. It must never
contain the child's name, answers, progress, session history, or backup data.
Caregiver-visible errors must also use fixed operation-specific copy. Raw
browser exception names/messages, service-worker script URLs, scope tuples,
quotes, and punctuation must not enter rendered state; any diagnostic
identifier comes from a closed allowlist.
Math Quest makes no application-level transmission of it. On a remote lab,
screen pixels and tester input still traverse the vendor and section 14
applies.

The page build identity, active-worker identity, cache identity, and required
file manifest must agree. A mixed Beta 1/Beta 2 state is **Recovery needed**,
not **App shell ready**.

A Safari tab may say only that the **current window** is not standalone. It may
not claim that Math Quest is “not installed,” because a separate Home Screen
copy may exist and the website has no supported API to discover it.

### 6.4 Honest offline confirmation

Code can confirm that the exact shell is cached, but it cannot prove that the
device's radios are disabled. The final instruction therefore asks the grown-up
to:

1. finish the installed app's own online cache-readiness check;
2. enable Airplane Mode and ensure Wi-Fi is off;
3. remove Math Quest from the app switcher;
4. cold-launch Math Quest from the Home Screen;
5. reach the home screen, open one disposable Parent Test question, use its
   model and bundled sound, and close it without changing child progress;
6. repeat after a device reboot for the primary iPad; and
7. reconnect.

The app may display a locally computed status, but it may not transmit or
silently persist this manual check.

On the primary iPad, continue offline through one normal child session that
includes a correct answer, an incorrect answer, Help/re-teach, local save,
force quit, cold reopen, and exact progress verification. A disposable Parent
Test question alone is not sufficient offline evidence.

## 7. Service-worker and update design

Public Beta 1's tag and release remain immutable. Beta 2 uses a new explicit
logical cache identity and an exact allowlist of required shell files. Generate
a detached canonical release manifest mapping each listed cacheable path to its
SHA-256, byte length, expected MIME type, and expected successful status.
Document non-self-referential exclusions, bind the page, worker, and manifest
with one build ID, and externally hash every shipped byte. Derive the internal
physical live/staging cache names from the logical identity plus the exact
embedded manifest hash so two different byte generations cannot collide even
if a defective candidate reuses the logical identity. Cache readiness must
independently hash each listed stored response; a cache name, path list, or
service worker's unsupported assertion is not proof of identity.

Implementation requirements:

- installation succeeds only after every required Beta 2 shell file is cached;
- a fresh worker hash-verifies a cached detached manifest before attempting a
  network manifest fetch, so an already complete cache cannot hang behind a
  never-settling network;
- installation and repair fully populate and revalidate a disposable staging
  cache before inspecting the live candidate cache; simultaneous requests
  share one population transaction;
- an existing exact candidate cache receives no write effects, and a failed
  staging operation leaves it and the previous working service worker usable;
- a failed copy into an already-invalid candidate cache removes the partial
  candidate and reports readiness false;
- the fully populated new worker waits instead of unconditionally taking over;
- `updatefound` creates a separate grown-up-only candidate **Caching** state;
  only a fully installed waiting worker becomes **Update ready**, and neither
  state changes active-shell readiness or interrupts an active question;
- accepting an update first obtains an exact challenged readiness proof from
  the current `registration.waiting` object, saves state, then messages that
  same worker to call `skipWaiting()`;
- one lifetime `controllerchange` listener distinguishes initial
  `clients.claim()` control acquisition from later replacement: first control
  refreshes readiness and defers its exact-cache reload without losing
  first-use input; initial acquisition and later replacement both reload
  exactly once only at Home or the Grown-ups corner;
- activation repeats full exact-cache validation, successfully claims clients,
  and only then removes known obsolete Math Quest static caches; a
  post-handshake mutation or claim failure preserves the prior cache, while
  failure to finish later cleanup is non-fatal;
- cache cleanup never touches progress in `localStorage`;
- navigation fallback serves only the approved Math Quest entry point;
- non-GET and cross-origin requests are not intercepted;
- a cached or network response must be same-origin, successful, non-redirected
  where required, and match the expected MIME type and immutable byte hash;
- the worker exposes a versioned, read-only readiness message;
- active registration, cache, and validation failures produce visible
  **Online only / Retry** or **Recovery needed** status instead of being
  silently swallowed; candidate update failures use a separate update error
  while retaining the active-shell state, and offline-preservation wording is
  conditional on verified active readiness;
- browser exceptions map to fixed caregiver copy and an optional allowlisted
  diagnostic identifier rather than exposing raw scope/script tuples;
- a corrupt or partial cache produces a repair message, not a blank screen.

Rollback is a new forward deployment with a newer build/cache identity. It
must never attempt to mutate the protected Beta 1 tag or reinstall an older
worker as though it were newer.

Define update discovery, not only activation:

- record the deployed `sw.js` MIME and cache headers and reject an immutable or
  unboundedly stale policy;
- use a documented versioned registration/update policy (for example,
  supported `updateViaCache` plus explicit `registration.update()`) that does
  not depend on a child refreshing repeatedly;
- check online at home/grown-up safe boundaries without interrupting a
  question or blocking offline play; and
- on every required OS row, surface **Update ready** within 60 seconds of an
  explicit online update check when a newer valid worker is deployed.

Record discovery start/end marks, response/build identity, failure, and retry;
never replace a missed convergence budget with an unrecorded later pass.

Required update scenarios:

1. clean Beta 2 first install;
2. online Beta 1 to Beta 2 update;
3. update discovered during an active question;
4. connection lost during worker installation;
5. one required asset returns an error;
6. old worker controls the first Beta 2 page load;
7. new worker waits while an older app window remains open;
8. all app windows close and the new worker activates;
9. cache entry removed after activation;
10. service worker removed while progress remains;
11. progress removed while cache remains;
12. all site data removed and the app is reinstalled; and
13. rollback exercise using a disposable newer candidate identity;
14. wrong bytes stored under the correct cache name and path;
15. HTML returned for a font, sound, manifest, or missing path;
16. redirect, captive-portal, and service-worker-scope mismatch;
17. old and new tabs/windows open concurrently;
18. app force-kill or device reboot during installation/activation; and
19. a spoofed or stale readiness message;
20. simultaneous repair requests against the same staging cache;
21. a live-cache write failure after staging succeeds;
22. a cache mutation after waiting readiness but before activation;
23. fresh uncontrolled setup and verified-active update failures using hostile
    browser exception text; and
24. two different manifest hashes using a deliberately duplicated logical
    identity, proving their physical live and staging caches cannot collide.

No test may edit or retag Public Beta 1.

Freeze and audit these compatibility-critical manifest values: `id`,
`start_url`, `scope`, `display`, name, short name, and every icon identity.
Changing `id: "./"` can create a second app instead of updating the first and
therefore requires an explicit migration decision. Inspect the actual Home
Screen icon on every iPadOS generation because iOS/iPadOS prefers the
`apple-touch-icon` over manifest icons.

## 8. Persistence and privacy behaviour

- Progress uses state schema 3 under the protected
  `math-quest:progress:v2` key; the `v2` suffix identifies the established
  Public Beta 2 namespace rather than the state schema. The optional nickname
  remains under `math-quest:child-name:v1`.
- An exact schema-2 Public Beta save or backup may add only the neutral empty
  placement record and a zero-valued placement-draft generation and must
  validate completely before schema-3 bytes replace destination progress.
  Invalid or unsupported migration leaves the original container bytes
  unchanged.
- New schema-3 backups are not downgrade-compatible with older schema-2
  builds. The exclusive writer lease prevents simultaneous mutation, but old
  and new tabs/windows still require an explicit current-version reload and
  are not treated as semantically interoperable.
- When protected storage is empty, a valid Beta 1 `math-quest:v2` record is
  copied only while the new-key writer lease is held. The Beta 1 record stays
  unchanged and subsequent Beta 1 writes are isolated from Beta 2 progress.
  An incomplete cutover stores only the constant non-PII
  `math-quest:progress:v2:beta1-migration-guard:v1` marker. A present marker
  makes launch ignore unproven protected bytes, retry from the newest Beta 1
  source behind the lease, and clear the marker only after exact source
  stability across the protected write.
- Installing the PWA creates a separate web-app container. Math Quest must not
  imply that Safari progress or nickname moved into it.
- For a new user, installation is offered before nickname/progress creation.
- For existing Safari progress, the documented transfer is: export in Safari,
  install, launch the installed app online, then import transactionally there.
  The nickname is deliberately absent from the backup and must be re-entered
  if desired.
- Backup/import never merges evidence; it atomically replaces the destination
  container only after full validation.
- Safari and standalone containers must be compared on every supported
  generation. Reset, name removal, site-data removal, and uninstall
  instructions must say exactly which current container they affect.
- Duplicate-install, install-with-standalone-disabled, uninstall/reinstall,
  and Safari-data-present/installed-data-absent cases are required.
- Parent Test must leave progress, evidence, daily counts, logs, active
  session, settings, and optional nickname byte-for-byte unchanged.
- A paused starting-point check uses
  `math-quest:placement-draft:v1`, separate from progress and backups. It may
  contain only bounded contract/generator identity, a local progress-baseline
  consistency fingerprint, the exact persisted nonnegative draft generation,
  seed, Halifax play day, theme, question IDs, correctness booleans, and
  partial controls. It must exclude nickname, age, response timing, mastery
  evidence, session or feedback logs, analytics, and other identifying data.
  Discard removes it; reset, successful import, and successful apply commit a
  generation later than current, imported, and safely parsed surviving-draft
  floors before attempting removal, including from unreadable-main recovery.
  Stale, corrupt, oversized,
  conflicting, progress-mismatched, or prior-generation drafts must fail
  closed.
- The minimized draft remains private local learning data because its
  correctness booleans describe unfinished work; no diagnostic or support
  path may expose it.
- A Beta 1 backup must restore transactionally into Beta 2 only if the existing
  schema and curriculum bindings remain valid.
- Invalid, truncated, oversized, foreign-curriculum, and unknown-field backups
  must fail without changing live state.
- The schema and draft changes add no account, upload, analytics identifier,
  or new category of personal information.
- The diagnostics and install views must exclude personal information.
- The public app must make no analytics, advertising, telemetry, tracking,
  account, or third-party runtime request.
- `PRIVACY.md` must explain that iOS can evict browser data and recommend an
  intentional backup for valued progress.

Backups are plaintext, chronologically linkable learning records. They must be
labelled private, must never enter a cloud-device session, and must not include
the nickname. Before Beta 2 clearance, perform a field-by-field data-purpose
and retention review of exact question witnesses, correctness, hint/change
flags, timing, idle/guessing classifications, play days, session history, and
active partial answers. Prune or aggregate any field whose pedagogical purpose
does not require indefinite retention.

The Beta 2 implementation must meet these maximums unless a shorter period is
chosen:

| Data | Maximum retention |
|---|---|
| Aggregate mastery/progress and grown-up settings | Until grown-up reset/site-data removal |
| Active partial session/answer | Seven days after last activity |
| All raw per-attempt evidence: question/sample/witness IDs, correctness, hints, changes, latency, idle/guessing flags, session ID, and play day | Most recent 12 attempts per skill and no more than 90 days; retain only the minimum mastery aggregate afterward |
| Day-indexed practice/activity counts | 30 days; retain only monotonic `maxSeenPlayDay`, current spacing/due-day aggregates, and undated mastery state afterward |
| Detailed session history | Most recent 50 sessions and no more than 12 months |
| Feedback-history detail | Most recent 100 entries and no more than 90 days |
| Imported backup bytes in application memory | Only through transactional validation/import; release immediately afterward |
| Exported plaintext backup | User-controlled file; Math Quest retains no extra copy |
| Raw test media | Avoid by default; delete immediately after approved extraction and always within 24 hours |
| Private qualification/deletion ledger | Twelve months after Beta 2 retirement, then delete |
| Public sanitized release evidence | For the lifetime of the corresponding public release record |

The release tests must verify expiry/pruning boundaries and that deleting old
detail does not change valid mastery state. No raw/detailed child record may be
retained indefinitely; a purpose statement alone cannot override the numeric
ceilings.

### 8.1 Child-facing host gate

GitHub Pages logs each visitor's IP address for security. GitHub's current
general privacy statement also says its services are not intended for people
under 13 and describes collection of device/request usage data. Because Math
Quest is deliberately child-facing, “the application sends no progress” is
not enough to clear the host.

Before any stable child-directed deployment, obtain a documented
privacy/legal review of the exact host use,
including applicable Canadian and other
intended-market child-privacy obligations, host terms, IP/request metadata,
retention, service-provider assurances, privacy notice, data minimization, and
parental role. If GitHub Pages cannot be affirmatively cleared for this use,
move the runnable child-facing build to a host with suitable child-privacy
terms while retaining the public source repository on GitHub. Unknown blocks
stable release. For eligible prereleases beginning Beta 4, section 1.2
supersedes only that timing: the unapproved state remains visible and the
provider-metadata risk remains explicit.

## 9. Test architecture

### 9.1 Layer A: exact static and release checks

During development, run focused effect-sensitive checks against changing
bytes. After all planned work and evidence records are finalized, freeze one
exact candidate commit and payload and run the complete existing release audit
once, immediately before public tagging and deployment:

- public-file allowlist and Git tree;
- de-identification, secrets, metadata, path, and licence scans;
- engine, curriculum, child-string, rights-state, and public-payload hashes;
- calibrated branch coverage and mutation tests;
- offline shell and same-origin network policy;
- storage-key separation;
- browser smoke, accessibility, responsive layout, and visual review; and
- predicted-versus-actual audit reconciliation.

The complete audit is a regression floor within the final certification
system, not sufficient Beta 2 evidence by itself. Count-only assertions,
one-seed generation, programmatic `.click()`,
headless Edge viewport emulation, and tests in which generator and grader share
the same answer oracle do not satisfy the new gates. Any changed shipped byte
invalidates the candidate and all matching clearance values. Correct with
focused tests, finalize and freeze a new candidate, and restart the complete
gauntlet from the beginning.

### 9.2 Layer B: deterministic procedural coverage

Build an independent test registry and mathematical oracle rather than asking
the runtime to declare its own expected universe or correctness. Derive and
reconcile exact ID/tuple sets. For the current manifest these include 126
skills, 166 skill-task obligations, 26 generator profiles, and 23 families;
the audit must fail if the canonical manifest changes without an independently
reviewed expected-set update.

The automated generator audit must cover every manifest skill. For each skill
it must exercise:

- every declared tier;
- every permitted CPA phase and representation;
- every declared task/model/input-method combination;
- each finite option-arity and answer-form branch;
- each exact fraction, decimal, money, unit, remainder, and comparison rule
  applicable to that generator;
- correct, incorrect, malformed, boundary, and equivalent-form answers;
- help, re-teach, preview, capstone, and Parent Test contexts where permitted;
  and
- deterministic seeds chosen to hit every registered finite variant.

Large or unbounded numeric domains use property and boundary partitions rather
than pretending to enumerate infinite values. The variant registry, seeds,
expected branch IDs, and observed branch IDs must be written to the audit
report. A declared branch with no witness is a failure.

The expected universe must include every prompt kind, answer kind, input
method, model descriptor, task type, tier, applicable CPA phase,
representation, theme, enum facet, meaningful facet combination, and manifest
constraint key. Reject blank/unknown enum values and any declared or coded
capability with zero witnesses. For numeric domains include minimum,
minimum+1, representative middle, maximum-1, maximum, and invalid partitions.
Use a constrained facet solver or registry maintained independently from the
runtime routing code.

For every generated case, the independent oracle must:

- compute the mathematical truth without reading `question.answer`;
- accept the independently correct value;
- reject near-wrong, blank, malformed, non-finite, overflow, and locale/Unicode
  edge values; and
- test allowed equivalences plus applicable inverse, commutative, scale, and
  order metamorphic properties.

Add invalid API inputs, clock/daylight-saving and play-day rollback, storage
quota/SecurityError cases, concurrent contexts, every resumable UI phase,
file-picker cancellation, and corrupt/truncated/oversized/foreign backups.

Coverage and mutation gates:

- 100% function coverage;
- 100% branch coverage in math, grading, progression, save/import, storage,
  service-worker, readiness, privacy, and artifact-identity critical regions;
- at least 95% overall branch coverage with every uncovered range reviewed;
- 100% killed non-equivalent mutants in critical regions; and
- at least 95% killed non-equivalent mutants overall, with every survivor
  explicitly risk-classified.

Within one deterministic gate invocation, exercise the reviewed fresh-state
and independent-order permutations that protect order sensitivity. Each gate
runs once in the single frozen-candidate certification. A retry or
first-run-only failure is a finding, not a replaceable pass.

### 9.3 Layer C: complete primary-iPad journey

On the primary physical iPad, use an anonymous disposable profile and complete:

1. first load and anonymous onboarding;
2. world selection;
3. a normal session containing clean success, correction, Help, re-teach,
   feedback, and capstone;
4. stop, resume, same-day reopen, background/resume, and orientation change;
5. every answer-input family and every model-rendering family;
6. practice and time caps;
7. Parent Test rendering and interaction for all 126 skills, plus every
   registered semantic model variant, with proof of progress isolation;
8. grown-up settings, local voice, sound off/on/mute, and reduced motion;
9. export, transactional restore, rejected import, and reset;
10. Safari installation, standalone launch, and offline relaunch;
11. Beta 1 to Beta 2 update behaviour; and
12. a 30-minute continuous-play soak.

The run must include correct and incorrect routes. It is not a happy-path demo.

### 9.4 Layer D: other real-device combinations

Each remaining OS/device/mode combination receives:

- all input-method families;
- all visual-model families;
- all accessibility families;
- all installation, storage, offline, update, and resume families; and
- a deterministic rotating constrained-set sample of at least 16 of the 126
  skills, plus every skill classified as high risk by the generator audit.

The 16-skill sample must cover input method, descriptor, prompt/text-length
bucket, target count, task type, numeric-width bucket, visual facet, and
interaction state. A documented hash of release tag, device lane, and skill ID
breaks ties and rotates samples between releases. Manual selection of
easy-looking examples is not permitted. Essential touch, VoiceOver, zoom,
install, update, and offline cases run on every supported OS row; only
nonessential secondary cases may rotate.

### 9.5 Layer E: desktop regression

The shipped Windows launcher and the hosted build must retain their existing
desktop checks. An Apple fix may not regress Windows touch, mouse, keyboard,
switch access, storage separation, offline play, or the exact engine API.

## 10. Required functional families

| Family | Required observations on real devices |
|---|---|
| Choice | Distinct choices, visible selection, deliberate Confirm, correct VoiceOver state |
| Keypad | Every key tappable, entry editable, no unwanted page zoom, Confirm remains reachable |
| Ten frame | Construction state and answer remain visible; no accidental scrolling or gesture conflict |
| Number bond | Operation and missing-part meaning remain visually correct |
| Number line | Labels, marks, jumps, panning, and answer controls do not collide |
| Fraction/mixed number | Numerator, denominator, whole part, equivalence, and exact grading remain usable |
| Bar, array, area, clock, geometry, money, and place value | Semantic model and accessible alternative agree; no clipped or undersized detail |
| Help/re-teach | Help never traps focus or permanently moves Confirm out of reach |
| Question choice | Early cards are visually distinguishable to a pre-reader |
| Parent Test | Full diagnostic choice is available without writing child evidence |
| Backup/import | File picker, download/share behaviour, validation, and cancellation are safe |

The variant ledger must enumerate semantic cases, not merely family names. It
must include all four remainder interpretations, all eight declared volume
facet combinations, both timetable formats, tenths and hundredths, each
fraction target form, and every registered geometry/shape/model descriptor.
Also test the iOS Files download path, immediate object-URL revoke timing,
visual-keyboard/visual-viewport overlap, safe-area top/right/bottom/left, audio
gesture lock, delayed/empty voice lists, and background audio interruption.

## 11. Accessibility and child-side usability gates

Run every essential item below on each required OS row. Nonessential secondary
combinations may rotate after the mandatory set is complete:

- VoiceOver swipe order follows the visual task order.
- Headings, landmarks, buttons, groups, selected state, errors, and dynamic
  feedback have accurate names and roles.
- Visual math models have concise equivalent text; decorative art is hidden.
- Selection is announced once and Confirm remains a separate deliberate action.
- No essential action depends on hover, double-tap timing, drag precision, or a
  hardware keyboard.
- Switch Control can reach and activate every essential control.
- Focus remains visible for an attached keyboard and survives re-rendering.
- At 200% Safari page zoom and with larger system text, no control or content
  required to answer is lost.
- Visible text remains at least 16 CSS pixels; child helper/body text remains at
  least 18 CSS pixels.
- Essential targets remain at least 44 by 44 CSS pixels with enough separation
  to avoid adjacent accidental taps.
- Reduced-motion preference removes nonessential motion.
- Portrait, landscape, split/reduced-width, safe-area, on-screen keyboard, and
  browser-toolbar changes do not cover Confirm.
- Early-level questions avoid scrolling wherever the content can fit while
  preserving text and model legibility.
- Colour is not the sole carrier of meaning, and selected/error states meet
  contrast requirements.

## 12. Audio and speech gates

- Play remains fully understandable with the device muted and sound disabled.
- Sound remains off by default and uses only bundled, rights-cleared files.
- Automatic prompt and feedback speech remains off by default for new and
  migrated profiles; only a grown-up setting can enable it.
- The first user gesture safely unlocks audio where the platform requires it.
- Repeated tap/confirm sounds do not overlap into distortion or loudness spikes.
- Deliberate Replay works while automatic speech is off. Any later automatic
  speech requires the grown-up's prior opt-in, and speech stops or recovers
  after backgrounding, interruption, or route change.
- No installed English voice, a delayed voice list, a changed voice, silent
  mode, and denied audio all degrade to visible text without blocking play.
- Speech and effects respect the grown-up's settings after close/relaunch and
  after a Beta 1 to Beta 2 update.
- No microphone, speech-recognition permission, remote synthesis request, or
  child audio recording is permitted.
- Math Quest may select only voices that the browser reports as local, but it
  cannot make claims about undocumented OS/browser internals. Verify speech
  while the owned device is offline and preserve the complete visible-text
  fallback.

## 13. Performance and resilience budgets

Measure locally with `performance.now()` and a bounded in-memory diagnostic
buffer that contains no child data. Math Quest makes no application-level
transmission of this buffer. A remote-device service would still transport
screen pixels and tester input and is governed by the stricter section below.

| Metric | Acceptance budget on the slowest supported real device |
|---|---|
| Cold online load to usable home screen | at most 5 seconds on controlled ordinary Wi-Fi |
| Warm or offline Home Screen launch to usable home screen | at most 2 seconds |
| Tap to visible selection state | median at most 100 ms; 95th percentile at most 200 ms |
| Confirm to next stable question/feedback state | 95th percentile at most 500 ms |
| Unresponsive interval | no unexplained interval of 2 seconds or longer |
| Soak | 30 minutes with no crash, forced reload, blank screen, duplicated submission, or progress loss |
| Lifecycle stress | 10 background/resume or orientation/window changes with no corruption or unreachable control |

Define **usable home screen** as the local performance mark after required
state loads and the first primary control is visible, enabled, and responds to
tap. Define selection/Confirm end marks after the resulting DOM and accessible
state are stable. Use at least five clean launch trials and at least 30
selection and 30 Confirm samples per required device row; a 95th percentile
from fewer than 20 samples is invalid.

Record coarse device lane, exact OS in the private ledger, mode, build identity,
network type plus measured latency/throughput, sample size, every raw duration,
median, 95th percentile, maximum, failures, battery/charging state, low-power
state, and thermal warnings. Do not discard an outlier unless an external
interruption is recorded; the original remains a finding and the retry is
additional evidence. A budget miss may not be hidden by averaging faster
devices.

Add installed-context reopen checks after 24 hours, 72 hours, and seven days.
These observe ordinary persistence; they do not prove immunity from later
storage eviction. Deterministic recovery from deliberately removed cache/site
data is release-blocking. Genuine OS storage-pressure eviction is exploratory
because iOS does not expose a reliable test control to force it.

## 14. Privacy-safe device-lab rule

No remote-device vendor is approved merely because it is popular or claims
general security compliance. Before any session, the project owner must have
written, product/tier/region-specific evidence that:

1. persistent video, screenshots, audio, DOM/input capture, console/HAR/network
   logs, test history, session replay, and AI capture are disabled **before**
   the session;
2. ephemeral screen transport is acknowledged and session/device state is
   cleared when the session ends;
3. accidental artifacts can be purged in the same run with a receipt, while
   contractual production and backup purge deadlines are numeric and explicit;
   customer-visible deletion alone is not proof of physical erasure;
4. URLs, metadata, staff access, support data, backups, and user identity have
   explicit purposes and maximum retention;
5. customer/test content is not used for advertising, model training, product
   improvement, benchmarking, or other secondary purposes;
6. subprocessors, data regions, encryption, deletion limits, incident notice,
   and breach handling are disclosed **and acceptable**: TLS 1.2 or newer in
   transit, modern encryption at rest for any permitted retained data,
   workforce least privilege plus access logging, incident notice within 72
   hours, and advance subprocessor-change notice with objection/exit rights;
7. devices are reliably cleaned between customers and failed cleanup
   quarantines the device;
8. a signed DPA/security exhibit and current independent assurance report
   cover the real-device product and session stream rather than only adult
   account details;
9. the organization-owned adult account enforces phishing-resistant MFA/SSO,
   least privilege, restricted invitations, audit logs, short-lived tokens,
   no public shares/integrations, and periodic access review; and
10. no real child's information, family backup, personal Apple Account,
    repository credential, private tunnel, or production cookie is required.

Unknown, “reasonable,” an unspecified “minimum,” a free/shared account, or an
unavoidable capture is a failure. Approval expires and is automatically
revoked when the vendor, owner, product, tier, region, terms, DPA,
subprocessors, recording defaults, AI features, or security posture changes;
after an incident; when a capture setting cannot be verified; or when previous
customer state appears.

Current public documentation does **not** establish this strict guarantee for
the evaluated shared real-device products:

| Service/public offering | Publicly documented concern | Current verdict |
|---|---|---|
| BrowserStack Live | Session/URL history and other account/product controls require product-specific contractual review | Pending, not approved |
| BrowserStack Test Reporting | Separate video/log retention and broad reporting-content terms add unnecessary surfaces | Do not enable |
| Sauce Labs shared real devices | Real-device video/test assets have documented retention and every session does not receive a factory reset | Rejected by default |
| AWS Device Farm | Public guidance warns against personal/sensitive test data and documents long artifact retention | Rejected |
| Firebase Test Lab | Automatic video/screenshot/log artifacts add an unnecessary retained capture surface | Rejected by default |

Even after qualification, a cloud lane is limited to the exact public reviewed
URL with anonymous fixed synthetic data and basic touch, layout, orientation,
installation/reload, and offline smoke. Backup/files/clipboard, local
speech/voice, accessibility dictation, private tunnels, credentials, detailed
local state, or debugging that needs recording/HAR/console remains owned-device
only.

The automatic fallback is owned or borrowed physical hardware. On every device:

- use anonymous or obviously invented data;
- never import a real family backup;
- never sign a personal Apple Account into the game or a testing vendor;
- default to no screenshot/video; cropping after remote capture does not erase
  the vendor's original;
- obtain the adult device owner's consent, enable Do Not Disturb, close
  personal tabs, and keep children out of the test;
- disable sync, autofill, extensions, custom keyboards, and dictation where
  applicable to the test;
- keep evidence outside synced Photos/cloud folders and delete device
  originals, Files/downloads, clipboard contents, and Recently Deleted;
- clear site-specific Safari data **and** the installed-container data, then
  remove the Home Screen app when the lane is complete; and
- restore the adult owner's prior settings. Private Browsing is not a
  substitute for a normal installation test.

On a remote anomaly, stop input, end and clear the device, request purge with a
receipt, revoke qualification, rotate any exposed credential, assess the
incident, and fall back to physical hardware.

After every successful remote session, clear app/site data, service workers,
and caches; terminate the vendor session; delete history/assets immediately;
verify customer-visible absence or obtain a deletion receipt; revoke temporary
tokens; and retain only the minimal case ID, coarse lane, release hash,
pass/fail, and deletion record. If history/artifacts cannot be disabled or
deleted, qualification fails.

If any remote lab is used, create a private canonical vendor-qualification
record covering vendor/product/tier/region, organization-account controls,
signed terms/assurance references, approval/expiry, session IDs, and every
teardown/deletion receipt. Bind its digest into the private evidence chain,
without publishing the underlying identifiers or individual private-document
hashes. Revalidate qualification and expiry at device-evidence close,
`PR_PUSH_AUTHORIZED`, and `DEPLOY_AUTHORIZED`; revocation invalidates downstream
authorization until the affected lane is repeated safely.

## 15. Evidence package

Create a public machine-readable Beta 2 evidence manifest containing:

- release tag candidate, commit, Git tree, public-payload hash, engine hash,
  curriculum hash, rights hash, and service-worker/cache/build identities;
- test-suite version and exact test inventory;
- coarse device/OS lane and physical-versus-remote-real classification;
- expected and actual result for every case;
- sanitized error identifiers and local diagnostic values;
- failures, skips, retries, and reasons;
- reviewer/adjudicator report hashes; and
- the final disposition and any explicit project-owner acceptance.

Keep a separate restricted, nonsynced local ledger for exact model, OS build,
language/region, management state, test date, vendor session IDs,
qualification/expiry, access approvals, deletion receipts, private source
documents, and any raw-media references. `.gitignore` is not access control.
Do not publish private-media hashes because they can become correlation or
confirmation oracles. Delete raw media immediately after any separately
approved sanitized extraction; define a fixed retention period for the
qualification ledger.

The public report must clearly separate automation, emulation, physical-device
evidence, and inference. A screenshot is never a substitute for an assertion,
and a pass on one device is never silently generalized to another lane.
Public records must not contain an absolute workstation path, exact device
name, serial number, UDID, Apple Account, IP address, Wi-Fi name, location,
vendor session ID, or other person/device identifier.

Evidence and review files are release records, not runtime payload. They must
not be inserted into the already frozen Pages file set after qualification.
Prepare them outside the tagged runtime tree, bind them by digest in the
clearance process, and publish only the approved sanitized manifest/summaries
as release attachments after tag verification. The restricted ledger and raw
media are never release attachments.

## 16. Context-independent antagonistic review

All collaboration in this section follows the bounded authority in
`AGENTS.md`. The default release team is one lead plus at most two bounded
reviewers, with no recursive agent creation, no overlapping edits, one review
round, and verification by the same reviewer after correction. The optional
six-reviewer cycle is available only after explicit project-owner opt-in for
one named release scope and initial exact candidate lineage. It is a
single-cycle exception to the ordinary
three-agent cap, not a preliminary cohort followed by a new final cohort.

Freeze two non-self-referential identities **before** qualifying tests:

1. the exact executable/Pages payload digest; and
2. a normalized reviewed-tree digest in which the tracked clearance path is
   replaced by its exact canonical pending template.

Every preparatory automated result, canary/device result, review, and acceptance
must name both digests plus the pre-clearance commit for traceability. These are
qualification inputs, not final release certification. Finalize the approved
clearance record and every other candidate-contained evidence record before
freezing the release commit. The single final gauntlet must test that exact
commit and payload. Any later change creates a new candidate and invalidates
the certification.

When the project owner explicitly selects the optional six-reviewer cycle for
one named release scope and initial exact candidate lineage, use these six
critic roles:

1. **Independent mathematics/curriculum oracle critic**
2. **Determinism, state, progression, and procedural-QA critic**
3. **Child/pre-reader visual UX and accessibility critic**
4. **Physical iOS/iPadOS Safari/PWA lifecycle and performance critic**
5. **Privacy, security, storage, rights, and supply-chain critic**
6. **Offline/service-worker, harness, mutation, coverage, and artifact-integrity critic**

The one selected cycle uses six newly created agents with concise sealed,
no-conclusion-priming contexts,
read-only isolated candidate copies, separate output channels, no communication
or visibility into other reports, pinned tool/model identities, and packet
hashes/nonces. Packet-hash-derived seeds make procedural challenges
reproducible. Reviewers may not spawn agents or edit the candidate, and the
same reviewers verify focused corrections to their findings.

Review uses two sealed phases:

1. **Technical phase:** immutable implementation bytes plus neutral
   requirements and test vectors; conclusion-bearing clearance, readiness, and
   prior review documents are excluded.
2. **Claims phase:** reveal the exact support/release claims and evidence after
   the technical report is sealed. A reviewer may add findings but may not
   remove or downgrade a sealed technical finding.

When the optional cycle is selected, every report must contain candidate and packet hash, requirement/risk ID,
exact input, independent oracle, expected/actual result, reproduction,
affected universe, raw-artifact hashes where nonprivate, severity, confidence,
smallest safe correction, proposed regression test, and a scope-completion
matrix. For every failed or materially affected check, it must also classify
the result as a product defect, test defect, environment or harness defect,
pending evidence/approval gate, or a combination; compare the assertion with
the current approved product contract; and identify any obsolete assumption,
contradictory predicate, timing race, or unrelated mutable state included by
the test. A narrative “pass” without the required artifacts is incomplete and
blocks.

An obsolete assertion may be revised or replaced only when the report records
why it is obsolete and demonstrates equal or stronger effect-sensitive
coverage of both the current approved behaviour and the original safety or
usability purpose. A reviewer must never weaken, delete, skip, or reclassify a
test merely to obtain a passing result. Product defects require product fixes
and permanent regressions; test and harness defects require corrected
assertions that would still fail if the approved behaviour regressed.

When selected, reviewers return reports through separate task mailboxes. No
report is written into a shared path until all six finish. Whether or not the
optional reviewer cycle is selected, collect any proposed, hash-bound
project-owner medium acceptances and assign one context-independent reviewer
as adjudicator. This is one bounded review role, not an added critic cohort.
The adjudicator receives the complete candidate evidence, the
exact optional-cycle state, any sealed reports, and those proposals, and:

- verifies packet/report hashes;
- reproduces all critical/high findings and a deterministic sample of pass
  evidence;
- audits each finding's product/test/environment/harness/pending-gate
  classification and rejects corrections that merely make an obsolete or
  contradictory assertion green without preserving its protected effect;
- reconciles exact coverage sets and missing/contradictory evidence;
- merges duplicates without erasing minority concerns or using majority vote;
- treats one substantiated critical/high finding as blocking;
- validates that each proposed acceptance is still Medium, has a safe
  workaround, and does not combine with other accepted risks into a High;
- maps every finding to fix, explicit acceptance, or low-severity backlog; and
- issues a release recommendation without editing the build.

A missing packet or packet timeout blocks only a selected optional reviewer
cycle. A required skip, unknown severity, contradictory evidence, or
unverifiable mandatory claim always blocks adjudication.

### Finding policy

| Severity | Disposition |
|---|---|
| Critical | Systemic wrong mathematics, child-data exfiltration, unrecoverable widespread data loss, or release/artifact compromise; blocked until fixed and fully reverified |
| High | Any required skill/facet is wrong or unreachable; mastery/save corruption; essential supported-device, accessibility, offline, update, privacy, rights, or candidate/evidence failure; blocked until fixed and fully reverified |
| Medium | Bounded nonessential degradation with a safe workaround and no math, child-data, privacy, rights, or save impact; fix or obtain exact documented owner acceptance |
| Low | Cosmetic or observability issue with no functional, educational, privacy, rights, or data effect; record and consider for backlog |

No finding may be omitted, silently downgraded, or marked accepted by an agent.
Only the project owner can accept an unresolved medium finding. Missing
mandatory evidence, unsupported public claims, and privacy/legal/rights gaps
are not medium and cannot be waived.

A medium acceptance proposal must bind finding ID, candidate hash,
pre-adjudication evidence digest, affected devices/skills, rationale, safe
workaround, owner/date, cumulative risk review, and an expiry no later than
Beta 2 retirement. Blanket acceptance is invalid.

Changing a proposed medium acceptance after adjudication invalidates the
adjudication and requires a new adjudicator pass. The six critics need not
rerun when the candidate, evidence, and their sealed reports are unchanged.

If a finding changes shipped bytes, the candidate is no longer final. Apply
only affected focused checks and have the same selected optional reviewers
verify only their affected findings against the corrected bytes. Do not rerun
the complete automated or adjudication cycles inside the correction loop, do
not create a new critic cohort, and do not restart unrelated reviews. After all
planned corrections are finished, freeze the corrected candidate and run the
one final complete automated certification and adjudication against those exact
bytes. The last reviewed candidate must be the candidate authorized for the
next remote/ref.

If the optional six-reviewer cycle is selected, its six reviewers must be
independent of implementation. Earlier planning specialists may not be counted
as reviewers, but their existence does not authorize additional review agents.

## 17. Release gates

Create a one-way hash chain:

1. a canonical **pre-adjudication evidence digest** over candidate identity,
   exact test inventory/results, public evidence manifest, the exact optional
   device/reviewer states plus any completed optional evidence, low backlog,
   and the private vendor-qualification digest when a remote lab was used;
2. each proposed medium acceptance binds that evidence digest;
3. the adjudication binds the same evidence digest plus every exact proposal
   hash; and
4. a canonical **review-bundle digest** covers the evidence digest, proposals,
   adjudication, and host/privacy decision.

Bind the final bundle digest into a new Beta 2 authorization/clearance record.
No earlier record contains a later digest, so the chain has no self-reference;
a one-line residual-risk field is not a substitute.

Before qualification, place the clearance record in its exact pending schema.
After qualification, make the narrowly defined pending-to-approved transition,
commit it, and only then freeze the immutable release candidate. The public
payload identity may continue to exclude those clearance bytes to avoid
self-reference, but final certification must still run against the exact final
commit containing the approved bytes and prove every other path and byte is
unchanged.

The process has distinct machine-readable states:

1. **LOCAL_CANDIDATE_FROZEN** - clean exact qualification payload fixed and
   focused deterministic local checks passed; this is not yet the immutable
   release commit or final certification.
2. **CANARY_PUSH_AUTHORIZED** - a first blind review authorizes only the exact
   candidate to a named, no-announcement trusted-HTTPS staging target whose
   host record is either affirmatively approved or, for an eligible
   prerelease, exact `DEFERRED_PRERELEASE`; any remote-device vendor used for
   it must still hold current product/tier/region qualification.
3. **OPTIONAL_EVIDENCE_RECORDED** - each offered device/reviewer cycle is
   either exact `OPTIONAL_NOT_RUN` or fully complete; any completed physical
   lane tested the same canary bytes and any remote session has a current
   qualification, session record, and teardown/deletion receipt.
4. **PR_PUSH_AUTHORIZED** - the independent adjudicator has reviewed the exact
   candidate, mandatory evidence, and exact optional-cycle states plus any
   completed optional evidence; this authorizes only the named protected
   branch/ref.
5. **MERGE_TAG_AUTHORIZED** - remote CI on the exact commit passes and the
   review-bundle/clearance binding still matches.
6. **DEPLOY_AUTHORIZED** - protected merge and annotated tag match the
   authorized commit/tree/payload.
7. **LIVE_RELEASE_VERIFIED** - live response bodies, headers, asset key set,
   service-worker identity, offline relaunch, tag, and release page reconcile;
   only now may the build be announced as Beta 2.

The canary contains only already-public/open-source application material and
synthetic data; it is not announced as a release. Its exact host and exposure
must be recorded. For an eligible prerelease, its host may use the exact
visible section 1.2 deferral without implying privacy approval. If no suitable
canary can be used, use a separately reviewed ephemeral local-network HTTPS harness
with a temporary trusted certificate and strict firewall/teardown controls.
Do not weaken secure-context requirements.

The canary must use a root-like scope matching production semantics. For the
update drill, first serve the exact Beta 1 bytes at that canary origin, install
and seed only synthetic state, then switch the same origin to the frozen Beta 2
candidate. A different origin cannot by itself prove the Beta 1-to-Beta 2
service-worker update. After production deployment but before announcement,
repeat a focused update/offline smoke on the actual production origin using
owned physical hardware only. A remote cloud-device session is prohibited in
this post-deployment window so no new vendor evidence can fall outside the
frozen review bundle.

`PR_PUSH_AUTHORIZED` requires:

1. implementation work is finished and focused checks pass; formal completion
   remains pending the final frozen-candidate certification;
2. exact expected coverage sets reconcile in focused preparation; the single
   complete frozen-candidate certification remains pending until the direct
   evidence successor is pushed, and then must pass once with its reviewed
   fresh-state and order permutations exercised internally and zero required
   failures/timeouts/flakes;
3. each offered device/reviewer cycle is either exact `OPTIONAL_NOT_RUN` or
   fully complete;
4. if the device cycle is selected, the primary-iPad journey and every lane
   pass;
5. mandatory automated install, standalone, offline, update, and deterministic
   removal/recovery tests pass; Beta 4 records the hosted trusted-HTTPS canary
   as exact owner-skipped evidence, not as a pass;
6. privacy review confirms no application-level child learning/content
   transmission or new third-party runtime request, and the child-facing host
   is either affirmatively cleared or, for an eligible prerelease only, bound
   to exact `DEFERRED_PRERELEASE` with its residual risk disclosed;
7. public files and evidence are de-identified;
8. component/licence registration is complete;
9. adjudication is complete on the exact final bytes, and the optional
   six-critic cycle is complete if selected;
10. no critical or high finding remains;
11. every medium finding is fixed or explicitly accepted by the project owner;
12. low findings are recorded;
13. the review-bundle digest and pre-push authorization match the candidate;
14. the clearance binding, direct evidence-successor proof, and all
    preparatory evidence are current; the complete audit is the next and only
    certification action after the successor reaches protected main; and
15. any remote-vendor qualification remains current, unrevoked, and bound to
    the evidence bundle.

The audit runner must treat host qualification, physical-device rows,
canary/live artifact reconciliation, reviewer packets, and finding
dispositions as first-class visible records. Selected optional cycles and
every required record remain fail-closed. An eligible prerelease may be
shippable only with exact `EXT-HOST: DEFERRED`; a stable tag requires
`EXT-HOST: PASS`. No run may call the deferred host passed, approved, waived,
or privacy-cleared.

Public Beta 1 remains immutable. Changed bytes require the new annotated tag
`v1.0.0-beta.2`, a new protected tag rule, new release notes, and a new exact
deployment. The release must state the tested Apple generations and any narrow
residual limitation.

## 18. Future native/App Store workstream

Near the end of the beta series, revisit:

- whether the PWA experience is sufficient;
- Apple Developer Program membership and ongoing cost;
- access to a Mac/Xcode or a trusted build service;
- TestFlight and App Store review;
- native wrapper versus a genuinely native SwiftUI application;
- signing-key, provisioning-profile, and supply-chain ownership;
- children's-app privacy obligations and age-rating declarations; and
- whether proprietary Apple build tools are acceptable as tooling while all
  distributable game content remains under the project's open/public-domain
  policy.

That decision must not retroactively weaken the Beta 2 privacy boundary.

## 19. Implementation sequence

1. For an eligible prerelease, bind exact `DEFERRED_PRERELEASE`; before stable,
   complete child-facing host privacy/legal qualification or select another
   host.
2. Freeze exact physical-device lanes, models, and OS patches in the private
   ledger.
3. Create a local unpushed Beta 2 working branch; do not edit the Beta 1 tag.
4. Add install/help/readiness UI and local diagnostics.
5. Harden the service-worker update and repair protocol.
6. Extend deterministic, independent-oracle, browser, accessibility, mutation,
   privacy, and artifact audits.
7. Update privacy, support, installation, security, and release documentation.
8. Run the focused desktop and automated procedural checks applicable to the
   changed behavior.
9. Fix an exact qualification payload. Offer the optional six-critic cycle; if
   the owner explicitly selects it for this exact candidate and scope, run its
   one sealed cycle. Collect any proposed owner medium acceptances one at a
   time, then run the bounded adjudicator under section 16.
10. Correct defects with focused checks and repeat from step 8 until the exact
    qualification commit is ready.
11. For Beta 4, do not run the trusted-HTTPS canary. Record the exact owner
    decision as `OWNER_SKIPPED_BETA4`/`NONE` and `EXT-CANARY: OWNER_SKIPPED`;
    never convert it to pass or reconciliation evidence. Later releases return
    to the ordinary canary requirement unless the owner gives a new decision.
12. Push the qualification commit to protected main and run only the hosted-
    Windows identity observation. Offer the optional primary-iPad and
    remaining real-device matrix/long-reopen cycle; run it completely only if
    selected.
13. If shipped bytes change, invalidate the qualification payload, repeat the
    focused and automated work from step 8, and have the same selected
    reviewers verify only affected corrections.
14. Freeze the exact optional-cycle state and any completed optional evidence.
    Do not run a second fresh or final critic cohort.
15. Present proposed medium dispositions to the project owner one at a time;
    a fix returns to step 8, while a proposed acceptance is hash-bound for
    adjudication.
16. Compute the pre-adjudication evidence digest, run the bounded adjudicator on the
    sealed reports/evidence/proposed acceptances, then build the canonical
    review bundle.
17. Create the direct evidence successor under
    `DIRECT_EVIDENCE_SUCCESSOR_V1`: its sole parent is the qualification
    commit, and its exact diff changes only `PUBLICATION_CLEARANCE.md` and
    `audit/browser-runner-evidence-v1.json`. Record the final payload hashes
    and issue **PR_PUSH_AUTHORIZED** for that successor.
18. Push only that authorized direct successor to the named protected branch
    and wait for exact focused remote checks. Any other changed path, parent,
    merge, rebase, or skipped ancestor invalidates the exception.
19. Freeze that exact protected-main successor and run the complete
    certification system once. A failure or any change returns to focused
    correction and a new qualification/successor sequence. After a pass, issue
    **MERGE_TAG_AUTHORIZED**, create and protect `v1.0.0-beta.4`, and verify
    commit/tag identity.
20. Issue **DEPLOY_AUTHORIZED** and publish only the exact certified tagged
    artifact without rerunning the gauntlet.
21. Reconcile the live site, headers, offline relaunch, tag, release page, and
    deployed bytes; then issue **LIVE_RELEASE_VERIFIED** and announce Beta 4.

## 20. Source register

Sources were checked on 2026-07-28. Platform behaviour must be rechecked when
the implementation begins and again on release day.

- Apple Support, “Turn a website into an app in Safari on iPad”:
  <https://support.apple.com/en-au/guide/ipad/ipad8f1f7a29/ipados>
- WebKit, “Web Push for Web Apps on iOS and iPadOS”:
  <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
- WebKit, “WebKit Features in Safari 17.2” (Home Screen storage
  isolation/cookie-copy boundary):
  <https://webkit.org/blog/14787/webkit-features-in-safari-17-2/>
- Apple WWDC23, “What’s new in web apps”:
  <https://developer.apple.com/videos/play/wwdc2023/10120/>
- WebKit, “WebKit Features in Safari 26.0”:
  <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>
- W3C, Web Application Manifest:
  <https://www.w3.org/TR/appmanifest/>
- W3C, Service Workers:
  <https://www.w3.org/TR/service-workers/>
- Apple Safari Web Content Guide, “Configuring Web Applications”:
  <https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html>
- WebKit issue 193959, `beforeinstallprompt` unsupported/WONTFIX:
  <https://bugs.webkit.org/show_bug.cgi?id=193959>
- WebKit issue 250651, standalone display-mode edge case:
  <https://bugs.webkit.org/show_bug.cgi?id=250651>
- WebKit, “Updates to Storage Policy”:
  <https://webkit.org/blog/14403/updates-to-storage-policy/>
- WebKit, “Workers at Your Service”:
  <https://webkit.org/blog/8090/workers-at-your-service/>
- Apple, “Inspecting iOS and iPadOS”:
  <https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios>
- Apple Safari WebDriver:
  <https://developer.apple.com/documentation/safari-developer-tools/webdriver/>
- Apple Safari release notes:
  <https://developer.apple.com/documentation/safari-release-notes>
- Apple Safari 26 release notes:
  <https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes>
- Apple security releases:
  <https://support.apple.com/100100>
- BrowserStack Test Reporting and Analytics data retention:
  <https://www.browserstack.com/docs/test-reporting-and-analytics/references/data-retention>
- BrowserStack Live session history:
  <https://www.browserstack.com/docs/live/logging/session-history>
- BrowserStack security:
  <https://www.browserstack.com/security>
- BrowserStack Test Reporting and Analytics terms:
  <https://www.browserstack.com/docs/test-reporting-and-analytics/references/terms-and-conditions>
- Sauce Labs real-device cleaning:
  <https://docs.saucelabs.com/mobile-apps/real-device-cleaning/>
- Sauce Labs real-device video recording:
  <https://docs.saucelabs.com/mobile-apps/features/video-recording/>
- Sauce Labs test-asset retention:
  <https://docs.saucelabs.com/test-results/viewing-test-results/>
- Sauce Labs test configuration options:
  <https://docs.saucelabs.com/dev/test-configuration-options/>
- AWS Device Farm data protection:
  <https://docs.aws.amazon.com/devicefarm/latest/developerguide/data-protection.html>
- Firebase Test Lab for iOS:
  <https://firebase.google.com/docs/test-lab/ios/get-started>
- GitHub, “What is GitHub Pages?” (visitor IP logging):
  <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- GitHub General Privacy Statement:
  <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>
- United States eCFR, 16 CFR Part 312:
  <https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312>
- US Federal Trade Commission, COPPA compliance plan:
  <https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business>
