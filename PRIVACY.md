# Privacy

Effective date: 2026-08-02

Math Quest keeps gameplay information in the browser. It has no user accounts,
analytics, advertising, fingerprinting, application-level uploads, or cloud
synchronization.

## Information stored by the game

The game may store:

- an optional child first name or nickname entered by a grown-up;
- skill evidence, level progress, review dates, practice counts, and session
  summaries;
- accessibility, speech, sound, time-limit, and practice-limit settings; and
- an active-session snapshot so interrupted play can resume.

The display name is stored separately from the learning record. Parent Test
uses disposable diagnostic state and must not change the real progress record.

## Storage keys and compatibility

Public Beta 2 uses:

- `math-quest:progress:v2` for state-schema-version-3 progress, settings, and
  sessions;
- `math-quest:progress:v2:beta1-migration-guard:v1` for one of two constant,
  non-identifying cutover markers while either the first protected save or a
  Beta 1-to-Beta 2 copy is incomplete;
- `math-quest:placement-draft:v1` for a bounded, unfinished starting-point
  check; and
- `math-quest:child-name:v1` for the optional local display name, or a
  non-identifying marker that the grown-up chose to continue without one.

The `v2` in the progress key identifies the Public Beta 2 progress namespace;
it is not the state schema number. Keeping it stable prevents one Beta 2
journey from being split between two local records.

If protected Beta 2 storage is empty, a valid Beta 1 record under
`math-quest:v2` is copied only after the Beta 2 exclusive writer lock is held.
The Beta 1 record is read-only migration input: it is neither changed nor
deleted, and a still-open Beta 1 page cannot overwrite the new Beta 2 key.
Before copying, Math Quest writes the constant migration marker. A first
protected save made while no Beta 1 record exists is enclosed by a separate
constant empty-cutover marker under the same key. The game checks both the
Beta 1 source and exact marker before and after the protected write and removes
the marker only after that cutover is stable. If writing, copying, rollback,
or marker removal is interrupted, the marker contains no child data and makes
the next launch ignore or recheck the unproven protected copy. A Beta 1 record
that appeared during an empty cutover is therefore selected on retry even when
its storage event was delayed or never delivered. If browser storage becomes
unreadable after removing that marker, the next readable launch still checks
Beta 1 whenever protected state validates as the exact untouched initial
state. Any setting, placement, session, or learning-state change prevents that
limited fallback, so established Beta 2 progress remains authoritative.

The exact curriculum manifest identity, version, and SHA-256 are bound into a
schema-3 save. An exact schema-2 Public Beta save or backup is migrated in
temporary data by adding the neutral empty placement record, then the entire
result is validated before live progress is replaced. A backup for another
curriculum or an unsupported schema is rejected without changing live data.
New schema-3 backups are not compatible with older schema-2 builds. The
exclusive writer lock prevents simultaneous writers, but families should not
keep mixed Beta 2 versions open and should not downgrade after schema-3
progress has been saved.

The placement draft contains only the placement/generator contract identity, a
local progress-baseline consistency fingerprint, seed, Halifax play day,
theme, generated question identifiers, correctness booleans, and bounded
partial answer-control state needed to resume. It does not contain the
nickname, age, response timing, mastery evidence, session or feedback logs,
analytics, or other new identifying fields, and it is not included in a
gameplay backup. It is removed on discard, reset, successful import, or
successful application. Stale, corrupt, oversized, conflicting, or
progress-mismatched drafts are ignored or removed without changing progress.
Because its correctness booleans describe unfinished learning work, the draft
is still private local learning data even though it is minimized and contains
no nickname.

Moving from schema 2 to schema 3 does not add an account, upload, analytics
identifier, or new category of personal information.

Earlier private pre-beta progress is left untouched under its separate storage
key. Math Quest does not map that evidence into the independently authored
public curriculum.

Browser `localStorage` is specific to a browser profile and web origin. Data is
not synchronized between browsers or devices. On iPhone and iPad, a Safari tab
and an installed Home Screen web app can use separate data containers.
Installing Math Quest therefore does not promise to copy a nickname, progress,
or offline cache from Safari into the installed app.

## Network and hosted copies

The local Windows launcher serves only on the same computer's loopback
interface. Required assets are local or inline.

A web host, including GitHub Pages, can receive ordinary request metadata such
as IP address, browser type, requested path, and time while serving files.
That hosting data is governed by the host's policies, not by Math Quest.

Public betas are served from `https://openmathquest.github.io` and the
organization root repository `OpenMathQuest/openmathquest.github.io`. The
host's child-facing privacy/legal qualification is explicitly deferred for
semantic-version prereleases beginning with Beta 4. That deferral is not host
approval and does not alter GitHub's collection or terms. Before the first
stable Math Quest release, the selected origin must be affirmatively qualified
or the runnable child-facing build must move to a suitable host; the public
source can remain on GitHub. The current organization is reserved exclusively
for Math Quest Pages and uses no CNAME or custom domain.

Browser storage is origin-wide, not path-specific. Any future Pages site under
the `OpenMathQuest` organization would share this origin and could access the
same browser storage. For that reason, unrelated Pages sites must not be
published from the organization. The root service worker also controls this
origin's `/` scope.

The initial hosted page load uses the network; gameplay does not require
third-party requests, remote assets, telemetry, or cloud services. The
same-origin service worker caches only the public app-shell files bound by
`release-shell-v1.json`; it does not cache a display name, progress record,
backup, analytics event, or personalized response. Its local readiness reply
contains only release/cache identity, required-path results, worker state, and
a local timestamp.

iOS and iPadOS can remove browser-managed data because of user action, device
management, or storage pressure. Offline readiness describes the current
verified cache, not a permanent storage guarantee. A grown-up should export an
intentional backup when progress is valued. The backup is plaintext and
should be handled as a private learning record.

Automatic speech and sound effects are off by default. A grown-up can enable
automatic reading locally, or deliberately use Replay without enabling it.
Speech synthesis uses only voices that the browser reports as locally
installed. Math Quest does not include speech recognition, microphone access,
or child audio recording.

## Backups

An exported backup contains learning history and session records. Treat it as
private:

- store it with appropriate family records;
- do not attach it to a public issue;
- do not send it to an unknown person; and
- inspect it before sharing it with a trusted support person.

The separately stored display name is not included in the gameplay backup.
The separately stored placement draft is also not included.
For an intentional Safari-to-installed-app transfer, export in Safari, install
and launch Math Quest from the Home Screen while online, then import
transactionally in that installed app. Delete the plaintext export when it is
no longer needed.

## Delete local data

Use **Grown-ups corner → Child name → Remove name** to delete only the display
name and continue anonymously. A non-identifying anonymous preference remains
so the first-use question is not shown on every launch. Use **Grown-ups corner
→ Reset** to reset learning progress.

To remove every record for the current Math Quest container, use the browser's
site-specific data control, or remove the Home Screen app and its website data
as directed by the device. Safari and an installed app can require separate
cleanup. This removes local progress, any unfinished placement draft, the
optional name, and the offline app-shell cache for that container. Clearing all
browser data can also remove unrelated sites' records.

## Public issue reports

Do not post:

- a backup file;
- a child's full name;
- an address, school, email address, or account name; or
- an uncropped screenshot showing identifying tabs, apps, notifications, or
  desktop content.

Use a nickname only when desired. Crop screenshots to the game area and inspect
them again before uploading.

## Privacy contact

Use the public repository's private vulnerability-reporting feature after it
is enabled. Send a minimal reproduction with invented data and do not include
real child information.
