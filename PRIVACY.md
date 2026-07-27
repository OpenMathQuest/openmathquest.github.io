# Privacy

Effective date: 2026-07-27

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

Public Beta 1 uses:

- `math-quest:v2` for state-schema-version-2 progress, settings, and sessions;
  and
- `math-quest:child-name:v1` for the optional local display name, or a
  non-identifying marker that the grown-up chose to continue without one.

The exact curriculum manifest identity, version, and SHA-256 are bound into a
version-2 save. A backup for another curriculum or schema must be rejected
without changing live data.

Earlier private pre-beta progress is left untouched under its separate storage
key. Math Quest does not map that evidence into the independently authored
public curriculum.

Browser `localStorage` is specific to a browser profile and web origin. Data is
not synchronized between browsers or devices.

## Network and hosted copies

The local Windows launcher serves only on the same computer's loopback
interface. Required assets are local or inline.

A web host, including GitHub Pages, can receive ordinary request metadata such
as IP address, browser type, requested path, and time while serving files.
That hosting data is governed by the host's policies, not by Math Quest.

The planned public beta uses a dedicated custom domain or subdomain so its
browser storage is isolated from unrelated projects. The initial hosted page
load uses the network; gameplay does not require third-party requests, remote
assets, telemetry, or cloud services. A same-origin service worker caches only
the public app-shell files listed in `sw.js`; it does not cache a display name,
progress record, backup, analytics event, or personalized response.

Speech synthesis uses only voices that the browser reports as locally
installed. Math Quest does not include speech recognition.

## Backups

An exported backup contains learning history and session records. Treat it as
private:

- store it with appropriate family records;
- do not attach it to a public issue;
- do not send it to an unknown person; and
- inspect it before sharing it with a trusted support person.

The separately stored display name is not included in the gameplay backup.

## Delete local data

Use **Grown-ups corner → Child name → Remove name** to delete only the display
name and continue anonymously. A non-identifying anonymous preference remains
so the first-use question is not shown on every launch. Use **Grown-ups corner
→ Reset** to reset learning progress.

To remove every record for one Math Quest origin, use the browser's
site-specific data control. This removes local progress, the optional name, and
the offline app-shell cache for that origin. Clearing all browser data can also
remove unrelated sites' records.

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
