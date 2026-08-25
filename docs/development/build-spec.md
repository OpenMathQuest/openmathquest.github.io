# Math Quest — Public Beta Build Contract

- **Contract version:** `3.7`
- **Date:** `2026-08-24`
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

Use state schema version 3 under the protected Public Beta 2 progress key
`math-quest:progress:v2`. The `v2` suffix identifies the independent Public
Beta 2 progress namespace; it is not the state-object schema number. Keep that
key stable for this additive schema revision so one Beta 2 journey does not
split across two local records.

Loading or importing an exact schema-2 Public Beta state may add only the
schema-3 placement record with its neutral empty defaults, add the persisted
nonnegative placement-draft generation at zero, update the schema number, and
then validate the complete candidate. Parsing, migration, and validation
happen before live state is replaced; a failed or unsupported candidate leaves
the original progress bytes unchanged. Schema-2 backups that still satisfy the
exact curriculum and legacy-state contracts therefore remain importable, while
new exports use schema 3.

Schema 3 is not downgrade-compatible. A schema-2 build must reject a schema-3
record and must not overwrite it. The origin-wide exclusive writer lease
prevents simultaneous progress writers, but it does not make old and new code
semantically compatible; mixed-version tabs must reload onto the current
release rather than exchange mutable state.

The adapter protects both the first protected write and a Beta 1-to-Beta 2
copy with constant, non-identifying values under
`math-quest:progress:v2:beta1-migration-guard:v1`. It writes
`empty-to-protected-v1` around an initially empty protected write and
`beta1-to-protected-v1` around a Beta 1 copy, only while holding the
protected-key writer lease.
When the protected key and Beta 1 input were both absent during initial
selection, the adapter must re-read both the Beta 1 key and the migration
guard under that acquired lease before it creates protected progress. If
either appeared while the lease was pending, it must write no blank protected
record, stop child play, and require a reload so the new migration input is
selected normally. The empty-cutover marker must remain around the full first
write: a source or guard change at write entry or after that write rolls back
the byte-matching blank while retaining the marker. If rollback fails, reload
must still prefer a newly appeared Beta 1 source over the guarded blank. After
marker removal, a closing source-and-guard read must detect a change injected
during removal, re-establish the empty marker when possible, roll back the
byte-matching blank, and fail closed.

The external marker is not the sole evidence boundary. On every boot, the
adapter must classify a protected record as virgin only after full engine
validation and only when its canonical export exactly equals a newly created
initial state for the record's own `maxSeenPlayDay`. It must inspect the Beta 1
source whenever protected progress is absent, an accepted guard is present,
or the protected record is demonstrably virgin. A valid Beta 1 source outranks
virgin protected bytes even if guard removal completed and subsequent
local-storage reads and rollback failed. Any settings change, nonzero
placement-draft generation, session, placement, evidence, log, or other state
change makes the protected record non-virgin and authoritative.
It clears the marker only after the exact Beta 1 source is unchanged both
before and after the protected write. A changed source, failed protected
rollback, failed guard cleanup, guard storage event, or interrupted launch
leaves the marker in place and fails closed. A later launch with the marker
must ignore any unproven protected bytes and retry from the newest valid Beta
1 source behind the same lease.

The immutable Public Beta 1 release used a different curriculum digest, so
its mastery and evidence must not be translated into the current curriculum.
The adapter recognizes only the exact closed Beta 1 envelope (schema, product,
manifest identity, curriculum digest, and top-level key set) after the existing
engine validator accepts its complete state values under the current identity.
It leaves those
source bytes untouched, writes `beta1-retained-to-protected-v1` around an exact
fresh protected-state write, and replaces that pending marker with
`beta1-retained-current-curriculum-v1` only after the source, protected bytes,
and marker all re-verify. The terminal marker prevents a virgin current save
from rediscovering and replacing itself from the retained source on later
boots. A missing protected save behind that marker, any source or guard race,
or any unrecognized invalid legacy envelope fails closed. The grown-up notice
must say plainly that the old save remains stored separately and that Beta 7
starts fresh because the curriculum changed.

Do not translate pre-beta mastery or evidence into the new curriculum: the
meaning and order of skills changed. Leave earlier browser data untouched,
begin the independent journey with clean evidence, and explain this boundary
to grown-ups.

Keep an unfinished starting-point check outside ordinary progress under
`math-quest:placement-draft:v1`. Its bounded draft may contain only the
placement contract and generator identities, a local progress-baseline
consistency fingerprint, the exact persisted nonnegative draft generation,
the transactionally committed non-PII run nonce and derived seed, Halifax play
day, theme, generated question identifiers, the exact `correct`, `incorrect`,
or `not-sure` response kind, the bounded visible feedback kind needed to restore a neutral
**Not sure** outcome, and partial answer control state needed to resume. It must exclude
the optional nickname, age, response timing, mastery evidence, session or
feedback logs, analytics, and other identifying data. Discard removes it.
Reset, successful import, and successful placement application first advance
the generation inside the replacement progress candidate and commit that
candidate atomically, then attempt physical removal. A removal failure is
visible to the grown-up but cannot revive the prior draft after reload because
its generation no longer matches. The new generation must be greater than the
greatest valid generation in current progress, imported progress, and the
safely parsed bounded draft bytes. This floor applies even when unreadable
main progress has put the adapter into recovery with a generation-zero
fallback. Maximum-safe-integer exhaustion fails without mutating reset,
import, or placement-application inputs. A stale-generation, stale-baseline, corrupt,
oversized, conflicting, or progress-mismatched draft fails closed without
changing learning progress.

Starting a check must first increment and commit the private run nonce in the
main progress record, then derive a fresh non-PII seed and expose the separate
draft. A failed main-state commit exposes neither a run nor a draft. Resume
replays the committed nonce, seed, and answers deterministically; retry
consumes a new nonce and question set. Within one run, no two questions may
have the same child-visible semantic task signature. Generation uses bounded,
deterministic primary resampling and a bounded deterministic fallback, then
fails closed if it still cannot produce a distinct visible task.

The starting estimate uses a deterministic adaptive binary bracket across
Levels 1 through 20 and may recommend Level 1 through 21. Each sampled level
uses three distinct skills and moves the lower boundary upward after at least
two correct responses, so one isolated mistake cannot permanently force the
run down to the curriculum floor. After the bracket narrows, three different
skills verify the highest passed boundary; a strong Level-1 verification may
independently establish Level 1 even when its earlier checkpoint was
inconclusive. A failed verification falls back only to a lower boundary that
was actually passed. Every route remains within the approved 10-to-20-question
range.

Adult-confirmed placement is a distinct acquisition state, `PLACED`, not
synthetic mastery. It may be applied only to genuinely `UNSEEN` skills below
the chosen starting level that contain no retained evidence, misses, restore,
or recovery state. A placed skill may satisfy a prerequisite, but it must not
count as solid for promotion, mastery reporting, or capstone selection, and it
must not receive a fabricated mastery day, contract, witness, or attempt.
Schedule at most one deterministic, strand-balanced review per skipped level,
at most 20 in total, on staggered play days. Ordinary qualifying evidence may
replace `PLACED` with `SOLID`. A failed placed review removes placement status
without lowering the earned level; a failed placed gateway also schedules the
remaining placed skills in that level for recheck and activates the ordinary
gateway pull-back path.

Describe the result to grown-ups only as an **unvalidated broad heuristic
starting range**. Say
explicitly that earlier skills were not checked one by one and that scheduled
reviews will revisit representative skills. Do not label a placed skill or
level as covered, tested, completed, mastered, or otherwise directly
demonstrated. The first result-screen choice opens a `Grown-ups only`
confirmation dialog; only a delayed second explicit confirmation may commit
the recommendation. The global **Not sure** control is a distinct neutral
response kind, never an incorrect-answer state, sound, icon, or announcement.
Persist and report separate correct, incorrect, and Not sure counts. Any
abstention follows the conservative non-correct route, marks result confidence
as limited by abstention, and offers a fresh-question retry.
Placement selection questions must not also display an answer option labelled
`not sure`. Start, Next, and Replay use the same evidence-rich speech text,
including the visible selection labels in their displayed positions. Essential
placement text is at least 18 px and every control remains at least 44 px.
Automatic speech and sound remain off in a fresh game. The grown-up screen
requires co-play, explains how Replay reads each prompt and choice on demand,
and tells the grown-up to encourage **Not sure** instead of guessing; the
question screen exposes the same instructions to assistive technology.

Keep the game playable without runtime network access. Package every required
font, icon, sound, and visual asset locally or inline. The hosted build uses a
same-origin service worker to cache the reviewed app shell after the first
successful load; the desktop build remains loopback-only. Do not add accounts,
analytics, advertising, remote speech, or cloud synchronization.

The Windows launcher may reuse port 8771 only after an exact closed health
response matches `{schemaVersion, identity, release, port, rootId,
servedPayloadSha256}`. `rootId` is the lowercase SHA-256 of the UTF-8 bytes of
the resolved launcher root after full-path normalization, trailing-separator
removal, slash normalization to `/`, and invariant lowercase conversion.
`servedPayloadSha256` is the lowercase SHA-256 of an ordinally route-sorted,
UTF-8, LF-terminated record stream. Each record is
`request-route<TAB>relative-file<TAB>decimal-byte-length<TAB>lowercase-file-sha256`.
Both the launcher and the audit must calculate these values independently from
the current folder. The server must read this reviewed route set into one
in-memory byte snapshot before it begins listening, calculate the health
identity from those same bytes, and serve only that snapshot for its lifetime.
It must never reread a mutable runtime file while answering a request. Missing
or changed startup bytes, another resolved root, any extra or malformed health
field, or an unrelated listener fails closed; a second launcher also rejects a
running snapshot after its own folder bytes have changed.

## Teaching and mastery

Every skill declares how it moves from Concrete experience to Pictorial
representation to Abstract notation. In this screen-native game, Concrete
means acting directly on individually visible on-screen objects; Pictorial
means interpreting or building a representation; Abstract means working with
notation. Off-screen construction and grown-up acknowledgement are never
prerequisites for reaching an assessed question. Physical-object play may be
offered as optional grown-up-led enrichment, but it cannot block play or count
as evidence. Scaffolding and re-teaching never count as mastery evidence.

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

## Different-example tutorials

Every ordinary question in a real level offers **Show me how**. The tutorial
uses the exact obligation binding in the canonical tutorial manifest. It uses
one of three closed resolution modes: a same-task example with a different
terminal answer, an explicitly compatible sibling task with a different
terminal answer, or an approved procedure-only example that omits the terminal
answer. Automatic same-answer fallback is forbidden. Every example has a
different question ID, sample key, and parameters while retaining the governed
response method, representation, and structural teaching contract.

The child moves through three steps: Notice, Plan, and Check. Notice and Plan
remain answer-free. Check may show the completed teaching model only when the
binding requires a different terminal answer; procedure-only Check preserves
the mathematical procedure without rendering a terminal answer. Each phase
binds a declared visual cue to the actual prompt, stimulus, or worked model,
and each phase must produce a distinct visible mathematical transformation.
Returning restores the exact source question and response.
An incorrect answer may offer the same tutorial. Any answer submitted after
tutorial help keeps truthful feedback but is `NON_EVIDENCE` and cannot affect
mastery, spacing, practice counts, promotion, placement, or fatigue. Tutorial
state is resumable, save-failure rollback is transactional, and an incompatible
older active UI session is discarded without changing durable progress or
history.

Parent Test exposes the same three-step tutorial for every selected sample and
must leave every child-save byte unchanged. Placement remains tutorial-free so
the starting-point result is not coached.

`curriculum/math-quest-tutorial-manifest-v1.json` is the canonical linkage
record. Its JSON Schema and focused validator bind it to the exact curriculum
bytes; skill, level, profile, and required-task projection; question-generator
contract; all live input methods and generator profiles; the generated
profile/method/semantic-prompt feature inventory; the closed 149 same-task,
5 sibling-task, and 12 procedure-only obligation split; disclosure policies;
phase identities; visual teaching contracts, anchors, and cues; independent
answer separation; and the child-string table.
Changing any of those governed inputs requires regenerating the tutorial
manifest, synchronizing its embedded runtime bytes and PWA shell, and extending
the direct Playwright and Deep UX tutorial effects where needed.

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

## Math Quest Free Play

Home may expose optional Math Quest Free Play only after at least one activity's
exact prerequisite skill has been introduced through completed ordinary
evidentiary work. `UNSEEN`, `LEARNING`, `PLACED`, preview, Parent Test, and
Playground states do not satisfy that boundary. Activity tools, ranges,
representations, and operations must each be mapped to exact manifest skill
IDs rather than inferred from a level.

Playground state is transient, non-evidentiary, and independent of the
curriculum seed. Entering, playing, checking, undoing, replaying, stopping, or
leaving it must not change mastery, spacing, placement, practice counts,
sample history, response timing, session evidence, feedback history,
promotion, fatigue, or any other exported progress byte. Playground makes no
network request and stores no identifier, analytics, engagement record, or
hidden mastery proxy.

The initial pilot provides original construction activities under **Play
Solo** and **Family Play Together**. Family play must give both roles a
meaningful mathematical choice and use an explicit handoff so one activation
cannot act for two people. Play remains untimed and unscored, with Undo,
deliberate Check, replay, and a working Home path. Regular learning stays the
primary Home action.

The mandatory non-evidentiary session capstone remains unchanged. Any later
Playground capstone or postlude integration requires explicit contract
approval and equal-or-stronger coverage of stopping agency, fatigue, active
re-teaching, session completion, resume, and evidence isolation.

The detailed pilot mappings, interaction states, clean-room boundary, and
deferred tiers are normative in
`docs/development/math-quest-free-play-pilot.md`.

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

Do not transmit child data or learning history automatically. Backup export is
a local operation available only through a deliberate grown-up action; it is
not an application upload or cloud-sync path.

Use the dedicated organization-root origin
`https://openmathquest.github.io`, served from
`OpenMathQuest/openmathquest.github.io`, with no CNAME or custom domain.
Reserve the `OpenMathQuest` organization exclusively for Math Quest Pages
because browser storage is origin-wide and the root service worker controls
`/`. Do not claim a hosted release until the exact reviewed tag, repository
identity, empty Pages base path, GitHub Actions publishing source, HTTPS, and
deployed artifact have all been verified.

External host privacy/legal qualification is distinct from the application's
privacy boundary. Beginning with `v1.0.0-beta.4`, an eligible prerelease may
use the selected hosted origin only with exact `DEFERRED_PRERELEASE` evidence
reported as `EXT-HOST: DEFERRED`, never passed, approved, waived, or
privacy-cleared. Its public notice must disclose ordinary provider request
metadata. This deferral expires before the first stable release, which must
fail closed until the selected host is affirmatively qualified or replaced.
The deferral does not relax any prohibition on automatic transmission of child
identity, progress, answers, or gameplay telemetry, or any application privacy,
runtime-network, metadata, secret, offline, provenance, or PWA check.

## Release audit

The [`AGENTS.md` finished-work policy](../../AGENTS.md#what-counts-as-finished-work)
is normative. Keep acceptance criteria and any blocker, corrected conclusion,
or owner-approved scope reduction in the existing owning issue, plan,
governing record, or active working plan rather than creating an ad hoc status
document. A reduced deliverable does not satisfy the original scope. Maintain
an obsolete test only for a documented contract reason and preserve
equal-or-stronger effect-sensitive protection.

Ordinary development uses the fast focused suite plus effect-sensitive checks
selected from the affected behavior and permanent defect regressions. These
checks may establish that real production behavior is **implemented**, but do
not make it **release-certified**. Once all planned work and evidence records
are final, freeze the exact candidate commit and public payload. Run the
complete certification system once against that immutable candidate,
immediately before public tagging and deployment. A clear owner publication
instruction authorizes the run. Any later change invalidates the result and
requires focused correction, a new freeze, and a complete restart. An earlier
complete run requires explicit owner approval and remains diagnostic. The
candidate is **shipped** only when those certified bytes are actually
published.

The complete release review must test the exact shipped bytes and fail closed.
At minimum, it must verify:

1. manifest schema, canonical digest, neutral identifiers, unique order,
   prerequisite acyclicity, and runtime equality;
2. coverage of every declared task-type witness by a semantically aligned
   generator, grader, representation, mastery path, and Parent Test path;
3. unique engine markers, exact engine digest, purity, determinism, restricted
   evaluation, branch calibration, at least 88 percent calibrated native branch
   coverage of the exact shipped engine bytes, and mutation checks;
4. mastery, spacing, demotion, re-teaching, promotion, fatigue, session-stop,
   capstone, and preview-isolation boundaries;
5. exact fraction and decimal grading plus unambiguous option generation;
6. schema-3 validation, strict transactional schema-2 migration,
   `math-quest:progress:v2` namespace isolation, placement-draft isolation,
   transactional import/export, downgrade rejection, and rejection of
   unsupported legacy evidence;
7. local-only speech and assets, runtime network blocking, privacy scans, and
   public-tree provenance;
8. keyboard, touch, mouse, and switch-style operation at desktop, phone, and
   tablet viewports;
9. semantic model rendering, early no-scroll behavior, text-size floors,
   reduced motion, and child-facing visual clarity; and
10. reproducibility of the approved child-string table and its digest.

Predict countable audit results before the final run, reconcile predictions
with actual results, and record failures, skips, deferrals, and residual
risks. Do not declare a public beta ready while any required technical,
application-privacy, rights, visual, canary, or deployment gate is unresolved,
or while its host record is absent or disguised as passed rather than exact
`DEFERRED_PRERELEASE`. Do not declare a stable release ready while external
host privacy/legal qualification is unresolved.
