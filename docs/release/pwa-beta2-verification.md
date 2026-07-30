# Public Beta 2 PWA verification record

- Release: `1.0.0-beta.2`
- Build identity: `math-quest-pwa-v1.0.0-beta.2`
- Logical cache identity: `math-quest-static-v1.0.0-beta.2`
- Physical cache storage:
  `math-quest-static-v1.0.0-beta.2-<release-manifest-sha256>`
- Canonical shell manifest: `release-shell-v1.json`
- Status: local implementation present; physical-device and release evidence
  pending

## Integrity design

`release-shell-v1.json` is canonical JSON with a final LF. Each required
cacheable entry records its relative path, SHA-256, byte length, MIME type, and
required HTTP status. `sw.js` embeds the exact manifest SHA-256. The manifest
excludes itself and the worker to avoid a hash cycle; the worker, manifest, and
page share one release/build/cache identity and the final artifact audit hashes
all shipped bytes externally.
The worker also includes that manifest SHA-256 in its internal physical cache
and staging-cache names. A changed manifest therefore gets disjoint storage
even if a defective candidate accidentally reuses the same reported logical
identity; it cannot overwrite or delete the active worker's exact cache.
The browser certification enumerates cache names only after the worker reports
the exact logical identity, requires exactly one name formed from that identity
plus a 64-hex suffix, hashes the detached manifest inside that cache, and
requires the suffix to equal the computed digest. It does not fetch the live
worker again or open the logical identity as a cache name, so the audit cannot
create an obsolete empty cache or accidentally certify bytes outside the
content-addressed candidate. Its activation/readiness messages are not raced
against renderer virtual-time timers. The no-timeout probe starts when the
primary shipped frame becomes available and normally settles while the
remaining browser groups run; `BR-24` later awaits that same promise. No reply
still leaves the browser audit incomplete and the browser runner's independent
wall-clock limit fails closed.
The browser runner allocates 12 virtual minutes to the complete exhaustive
matrix and a separate 15-minute wall limit. The 25-minute GitHub-hosted job
therefore retains at least five minutes for runner setup, deterministic
pre-browser checks, report export, and evidence upload. A permanent
effect-sensitive regression constructs the actual browser arguments, rejects
the former 300-second ceiling, and binds these limits to the hosted workflow.
Each disposable scenario iframe also dispatches `pagehide` before removal so
the game's exclusive progress-writer lease is released synchronously before
the next scenario. Anonymous first-use verification awaits the settled Home
view across a possible service-worker safe-boundary reload. Both lifecycle
effects have executable regressions after hosted run `30513379330` exposed
their former scheduling dependence.
Scenario frames are made minimally paintable before bootstrap readiness is
awaited, and the synthetic Chromium launch disables background timer,
occluded-window, and renderer throttling. These harness-only controls prevent
hidden-iframe scheduling from starving the cross-process progress-lock
callback; executable argument, style, and call-order checks protect the
failure observed in hosted run `30514438006`.

Immediately before the Pages upload action, the release workflow constructs a
new `_site` solely from regular, non-executable Git blobs at the already
verified annotated-tag commit; it never copies a mutable worktree file. Every
release-shell entry must match its declared byte length, SHA-256, status, and
approved MIME. Every remaining tracked artifact is byte-compared with its
tagged blob, while the sole generated file is the empty `.nojekyll` marker.
The workflow computes a canonical path/length/hash/MIME snapshot SHA-256,
records it as a build output and job summary, removes write permission from the
complete tree, and immediately uploads only that sealed directory. The deploy
job rejects a missing or malformed snapshot identity.

The exact shell includes `PRIVACY.md`, `THIRD_PARTY_NOTICES.md`, and `LICENSE`.
The generator, worker, page validator, and browser audit each carry the same
explicit ordered oracle of 13 entry paths; readiness adds the detached
manifest for 14 required cached URLs. No oracle derives its expected set from
the manifest under test.
Their existing links remain usable while offline through a separate
same-origin navigation allowlist containing only those three paths. Other
same-origin documents and every cross-origin request remain outside worker
interception.

The browser-smoke server is effect-tested to return the Markdown documents as
`text/markdown`; this proves the local release harness, not the deployed host.
The final GitHub Pages deployment probe must record the live status,
redirect URL, and normalized `Content-Type` for both Markdown paths. Live
Pages MIME compatibility and resulting installed-app readiness remain
physical/deployment evidence and cannot be inferred from the local mock.

Installation fetches and verifies the complete manifest and every shell entry
in a disposable staging cache before the Beta 2 cache can succeed. A failed
install or repair never mutates an existing exact cache, so that cache and its
prior worker remain usable. An already-invalid candidate cache may be replaced
only after the staging cache passes a second full manifest/MIME/length/hash
check; a failed copy deletes the partial candidate and readiness remains false.
Simultaneous install/repair requests share one in-flight population transaction
and cannot race through the staging cache.
The reported build/cache identity is immutable for this public candidate and
must change for a subsequently approved public build. The content-addressed
physical name is an additional safety boundary, not permission to reuse public
build identity. Installation does not call `skipWaiting()`. A valid update
therefore waits while an older app window is using the prior worker.
A fresh worker process checks and hash-verifies the cached detached manifest
before making any network request. A populated exact cache therefore answers
readiness and navigation even if the network request path would never settle.
The grown-up-facing update action sends a fresh 256-bit
`activationChallenge` in `MATH_QUEST_GET_WAITING_READINESS_V1` to the exact
`registration.waiting` object and validates the
`MATH_QUEST_WAITING_READINESS_V1` echo and full readiness before changing
progress. It then commits state under the origin-wide progress Web Lock,
confirms that the same waiting object remains, and sends the same challenge in
`MATH_QUEST_SKIP_WAITING_V1`. A missing, late, malformed, mismatched, or
non-ready proof causes no progress write and no activation request. The worker
consumes an accepted challenge, reruns every exact cache check, and only then
activates. Active and waiting workers may have identical script URLs; the
page targets the current controller or exact `registration.waiting` object,
not URL identity. The returned `workerState` is a protocol label, not an
independent observation of the registration slot.

The page installs one lifetime `controllerchange` listener before
registration. First control acquisition after `clients.claim()` refreshes
readiness in place and marks a reload pending; it does not reload or discard
an unfinished nickname before the grown-up finishes or skips that gate.
Initial acquisition and later controller replacement both preserve any active
input and perform the save-before-reload interlock exactly once after the page
reaches Home or the Grown-ups corner. Candidate discovery, caching,
redundancy, and update-check errors are tracked separately from active-shell
readiness, so a failed candidate cannot relabel a verified active cache
**Online only**.
Caregiver copy promises that the current offline version remains usable only
when the page still has a controller plus validated active-shell readiness.
Fresh or unready setup copy instead asks the grown-up to stay online and retry.
Raw browser exception names/messages, worker script URLs, and scope tuples are
never stored or rendered; operation failures map to fixed copy and, at most, a
closed diagnostic identifier.

Activation cleanup is limited to the explicitly known Beta 1 cache and the
legacy non-content-addressed Beta 2 cache name, and begins only after one more
full exact-cache proof at the activation event. A mutation after the
waiting-worker handshake therefore rejects activation, preserves the prior
cache, and prevents `clients.claim()`. After an exact proof, activation must
successfully claim clients before it deletes any known fallback cache; a claim
rejection likewise preserves the old worker's offline bytes. Cleanup failure
after ownership commits is nonfatal and does not touch `localStorage`.
Requests are handled only when they are GET, same-origin, and in the exact
shell/navigation allowlist. Cached bytes are independently rehashed; a missing
or corrupt entry is repaired only from an exact same-origin, successful,
nonredirected response with the registered MIME and hash. Failed navigation
displays a recovery page instead of a blank screen.

Readiness message `MATH_QUEST_GET_READINESS_V1` returns only release/build/cache
identity, required-path results, worker state, readiness, and a local
timestamp. `MATH_QUEST_REPAIR_SHELL_V1` refills the exact cache.
`MATH_QUEST_GET_WAITING_READINESS_V1` /
`MATH_QUEST_WAITING_READINESS_V1` establish one exact, one-time activation
challenge. `MATH_QUEST_SKIP_WAITING_V1` cannot activate without that same
unconsumed challenge and a second full exact-readiness pass.

Run:

```text
node tools/build-pwa-release-manifest.mjs --check
node --test audit/tests/pwa-release.test.mjs
```

The Windows complete local entry point, `audit.bat`, invokes both commands with
its validated staged Node 24 runtime before it snapshots the public candidate.
A stale binding or failed PWA effect therefore stops the ordinary local gate;
focused commands remain development feedback only.

While shell bytes are still changing, prepare review metadata outside the
repository without changing the frozen manifest or worker:

```text
node tools/build-pwa-release-manifest.mjs --prepare-directory <empty-directory>
```

Preparation refuses to overwrite either generated review file. The effect
suite verifies that the prepared manifest binds every current entry byte, its
worker copy binds that manifest hash, and the repository's existing
`release-shell-v1.json` and `sw.js` remain unchanged.

The page-adapter suite executes the shipped update, backup, activation, and
controller-boundary functions with effect counters and fake timers. It
specifically proves forced Retry bypasses the 60-second automatic-update
debounce, Web Share success/cancellation/fallback behavior, delayed object-URL
revocation, a second update attempt after activation timeout, preservation on
first control acquisition, deferred replacement reload, and that candidate
failures do not change active-shell readiness. It also exercises fresh versus
verified-active update copy and hostile registration/update exceptions, proving
that raw browser tuples cannot reach caregiver state. The worker suite injects
staging and live-cache failures, proves an exact live cache receives no writes,
proves a partial candidate is removed, proves simultaneous repair messages
share one network/cache transaction, proves activation revalidates before
claiming clients and deleting the fallback cache, injects same-length one-byte
manifest and shell corruption plus MIME/redirect/status failures, and starts a
fresh VM over the populated cache with a never-settling network that must
report ready with zero fetch calls.

Browser group `BR-20` uses two same-origin game frames and the real browser
Lock Manager. The first frame holds the lifetime
`math-quest:progress:v2:exclusive-progress-write` lease and saves synchronously. The
second receives no `ifAvailable` lease, renders the grown-up protection screen,
and cannot overwrite. The test immediately dispatches pagehide, proves the
terminal bytes were already durable, then reopens a frame that acquires the
released lease. A BFCache-style reacquisition with a throwing lock
implementation proves the unsupported path leaves stored bytes unchanged while
displaying Reload and backup guidance.

Browser group `BR-04` additionally seeds the immutable Beta 1
`math-quest:v2` key, proves the state is copied to
`math-quest:progress:v2` only after the new lease is available, proves the
source bytes remain untouched, and simulates a later stale Beta 1 write that
cannot change the protected record.
The initially-empty case must also delay lease acquisition, introduce first a
valid Beta 1 source and then, in an independent run, the migration guard, and
withhold each storage event until after the acquired-lease preflight. Both
runs must stop with zero protected writes and remain write-free after the
delayed event is delivered.
The same initially-empty fixture must then inject Beta 1 bytes and, separately,
a changed guard at blank-save entry and immediately after the protected blank
write without delivering any storage event. The enclosing
`empty-to-protected-v1` marker must make all four runs fail closed, remove only
a byte-matching partial blank, and survive a forced blank-removal failure.
Reload must select late Beta 1 bytes over the guarded partial blank and finish
migration; a migration marker without its source must remain fail-closed.
Independent source and guard injections during empty-marker removal must also
be caught by the closing read, leave no accepted blank, and produce the same
reload selection or fail-closed result.
The storage-failure witness must remove the empty marker, inject valid Beta 1
bytes, then make every closing `localStorage` read and rollback attempt throw.
It must leave the current launch blocked with physical virgin protected bytes,
Beta 1 bytes, and no marker. A new readable launch must prove that the exact
validated virgin predicate—not an external marker—causes Beta 1 selection and
successful migration. Independent negative witnesses must show that changed
settings, a nonzero placement-draft generation, session state, malformed
bytes, and every other non-virgin state cannot activate this fallback.
The exact-candidate review must also observe the constant non-PII
`math-quest:progress:v2:beta1-migration-guard:v1` marker: it is written before
copy, retained after a source race or failed protected rollback, makes reload
ignore unproven protected bytes and retry the newest Beta 1 source, and is
removed only after source stability across the protected write. Source and
guard storage events must both fail closed.

The frozen-candidate persistence review must also seed an exact schema-2
Public Beta record and backup. It must prove that loading/importing adds only
the neutral placement record and zero-valued placement-draft generation in
temporary data, validates the complete schema-3 candidate before commit, keeps
the `math-quest:progress:v2` key, preserves prior evidence, and exports
canonical schema 3. Rejected migration, foreign or
unsupported state, an older schema-2 client reopening schema-3 bytes, and
mixed-version tab sequencing must all leave the schema-3 record unchanged.
The writer lease is evidence of serialization, not semantic downgrade
compatibility.

The same review must inspect `math-quest:placement-draft:v1` after a pause,
reload, each supported partial-control family, discard, reset, successful
import, and successful apply. Only bounded contract/generator identity, a local
progress-baseline consistency fingerprint, the exact persisted nonnegative
draft generation, seed, day, theme, question IDs, correctness booleans, and
partial controls may be present. Nickname, age, timing, mastery evidence, logs,
analytics, and backup output are forbidden. Corrupt, oversized,
stale-generation, stale-baseline, and conflicting drafts must fail closed
without a progress write. Reset, import replacement, and successful apply must
commit a generation later than current, imported, and safely parsed surviving
draft floors before draft removal, including from unreadable-main recovery;
inject a throwing
`removeItem`, reload, and prove the surviving prior-generation draft cannot
render. Maximum-safe-integer exhaustion must mutate no reset, import, or apply
input. Failed replacement commits must preserve the old generation and draft.

Only after every listed shell byte is frozen, write the canonical manifest and
worker binding:

```text
node tools/build-pwa-release-manifest.mjs --write
```

The write path updates the worker first so an interrupted freeze fails closed,
round-trips both files, and restores their prior bytes if either write or
verification fails. When the manifest hash changes, it also records the prior
content-addressed physical live and staging caches as exact post-claim cleanup
targets and ensures neither current cache is ever in that list. Any product
or evidence change after this step invalidates the binding and requires
another freeze plus full applicable certification.

## Evidence still required

No desktop emulation is real Apple-device evidence. Before release, complete
the exact physical-device matrix, install/standalone/offline/update/recovery
scenarios, accessibility families, 24-hour/72-hour/seven-day reopens, host
privacy/legal clearance, six fresh antagonist reviews, independent
adjudication, pending-to-approved publication clearance, annotated Beta 2 tag,
and exact live-artifact reconciliation defined by
`ios-ipados-pwa-beta2-plan.md`.
