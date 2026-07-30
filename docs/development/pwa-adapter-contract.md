# PWA adapter contract

The deterministic engine does not register a service worker, inspect install
state, read Cache Storage, or perform network effects. The browser adapter
outside the engine owns the Public Beta 2 PWA lifecycle.

## Frozen identities

- Release: `1.0.0-beta.2`
- Build: `math-quest-pwa-v1.0.0-beta.2`
- Reported logical cache identity: `math-quest-static-v1.0.0-beta.2`
- Physical cache storage:
  `math-quest-static-v1.0.0-beta.2-<release-manifest-sha256>`
- Readiness request/reply: `MATH_QUEST_GET_READINESS_V1` /
  `MATH_QUEST_READINESS_V1`
- Waiting-readiness request/reply:
  `MATH_QUEST_GET_WAITING_READINESS_V1` /
  `MATH_QUEST_WAITING_READINESS_V1`
- Repair request: `MATH_QUEST_REPAIR_SHELL_V1`
- Waiting-worker activation request: `MATH_QUEST_SKIP_WAITING_V1`
- Activation challenge field: `activationChallenge`, exactly 64 lowercase
  hexadecimal characters (256 random bits)

Adapter PWA state is in-memory diagnostics only. It contains an active-shell
readiness phase, a separate candidate-update phase/error, current
standalone-context advisory, update availability, registration, validated
readiness detail, and bounded local timing records. A failed update check or
redundant candidate must not downgrade a ready active shell to **Online only**.
The diagnostics must never contain or persist a nickname, question, answer,
progress, session, or backup.

Caregiver-visible PWA errors are fixed, operation-specific sentences. Browser
exceptions are untrusted diagnostics: `name`, `message`, service-worker script
URL, scope tuple, quoting, and punctuation must not be copied into page state
or rendered in the installation dialog. An optional diagnostic identifier may
be shown only when it comes from a closed allowlist such as
`PWA_REGISTRATION_FAILED`; it is not derived from exception text.

## Registration and readiness

Register `./sw.js` at scope `./` with `updateViaCache: "none"`. Registration,
update, controller, message, cache, or validation failures must become a
visible **Online only / Retry** or **Recovery needed** state; they may not be
silently caught.

Use a `MessageChannel` with a bounded timeout to query the controlling worker.
Accept readiness only when:

- type, release, build, and cache identities exactly match;
- the unique path results equal `./release-shell-v1.json` plus the exact
  thirteen entries in that file, including the three public legal documents;
- every result is a boolean and every required result is ready;
- worker state and local timestamp have the expected safe shape; and
- top-level `ready` equals the conjunction of the path results.

No controller means **Not controlled** and asks the grown-up to remain online
and reload. It does not mean that a separate Home Screen app is absent.
An active and waiting worker can legitimately expose the same `scriptURL`.
The page must therefore send the active protocol to the current controller and
the waiting protocol to the exact `registration.waiting` object, never infer a
role from script-URL comparison. The worker's `workerState` reply is a protocol
label and cache proof; it does not independently prove the registration slot
that delivered the message.

A fresh worker process first opens and hash-verifies the cached detached
manifest. Only when no valid cached copy exists may it request the manifest
from the network. Thus readiness and navigation from an already populated
exact cache cannot wait on a slow or never-settling network request.
The physical cache name includes the worker's embedded exact manifest hash.
Two worker scripts that accidentally reuse the same logical Beta 2 identity
therefore cannot read, overwrite, stage into, or delete each other's live shell
storage. The logical identity remains the closed readiness-protocol value.

Standalone detection is advisory:

```text
matchMedia("(display-mode: standalone)").matches ||
navigator.standalone === true
```

It may say only **This window opened as an app**.

## Update safety

At online home or grown-up safe boundaries, call `registration.update()`.
`updatefound` may show candidate **Caching** without changing the active-shell
readiness phase. A fully installed waiting worker sets a grown-up-only
**Update ready** state and never interrupts an active question. Candidate
installation, redundancy, and update-check errors remain separate diagnostics;
the current ready offline shell remains reported ready. Copy may promise that
an offline version remains available only when
`hasVerifiedActivePwaShell()` proves a current controller, active phase
`READY`, and validated `details.ready === true`. On a fresh, uncontrolled, or
unready page, **Checking**, **Caching**, and **Error** copy instead asks the
grown-up to stay online or retry; it must not imply that any offline shell
already exists.
The first-use nickname gate is also a safe update-check boundary. Ordinary
boundary checks use a 60-second debounce; the grown-up's explicit **Retry**
action bypasses that debounce while retaining the safe-boundary rule.

To accept an update:

1. finish or defer until a safe boundary;
2. generate a fresh 256-bit `activationChallenge`;
3. send `MATH_QUEST_GET_WAITING_READINESS_V1` with that challenge through a
   bounded `MessageChannel` to the exact `registration.waiting` object;
4. accept only `MATH_QUEST_WAITING_READINESS_V1` that echoes the exact
   challenge, reports `workerState: "waiting"`, and proves every manifest-bound
   cache entry ready;
5. commit current valid state under the progress Web Lock;
6. confirm the waiting object did not change while the state was committed;
7. rely on the one lifetime `controllerchange` listener installed before
   registration;
8. send `MATH_QUEST_SKIP_WAITING_V1` with the same challenge to that exact
   waiting object; and
9. reload exactly once at Home or the Grown-ups corner, guarded by in-memory
   pending/applying/reloaded flags.

A missing, late, malformed, mismatched, or non-ready proof stops before the
progress commit and before the activation request. Closing the dialog or an
unrelated controller change invalidates an in-flight proof.

The waiting worker records a challenge only after full exact-cache readiness.
Any skip request consumes the stored challenge before comparison, so mismatch
and replay cannot be retried. A matching request reruns full readiness and
calls `skipWaiting()` only if every bound byte and MIME remains exact.
The activation event repeats that exact proof, then awaits `clients.claim()`
before deleting any explicitly known fallback cache. Failed proof or failed
claim therefore preserves the prior worker's offline storage.

If activation is not confirmed within the bounded wait, clear the applying
state. Only a still-verified active shell permits copy that says the current
version remains usable; an uncontrolled or unready page instead says to stay
online and retry offline setup. The dialog must allow another explicit Apply
attempt with a fresh listener and timer.

The first `controllerchange` on an initially uncontrolled page is first
control acquisition from `clients.claim()`. It refreshes readiness in place,
marks an exact-cache reload pending, and must not rerender, reload, or lose an
unfinished first-use nickname. The reload occurs only after the grown-up
finishes or skips the nickname gate and reaches Home (or reaches the Grown-ups
corner). A later controller replacement, including one not initiated by the
currently loaded page, uses the same pending boundary. During a child activity
it leaves input intact; at the boundary it interlocks input, commits progress,
and reloads exactly once. If that commit fails, the old client is not reloaded
and the grown-up receives an explicit backup/retry warning.

## Local progress serialization

Schema-3 progress remains entirely local and offline in `localStorage` under
`math-quest:progress:v2`. The `v2` suffix is the established Public Beta 2
storage namespace, not the schema number, and must remain stable for this
additive revision.
Because `localStorage` has no compare-and-set operation, a playable page first
acquires the origin-wide exclusive Web Lock
`math-quest:progress:v2:exclusive-progress-write` with `ifAvailable: true`. The page
holds this single-writer lease for its lifetime. Before enabling any child
mutation it also compares the current stored bytes with the bytes it loaded.

While the lease is held, every validated save performs its compare and
`localStorage.setItem()` synchronously inside that already-exclusive critical
section. Ordinary actions therefore regain durable synchronous save semantics;
there is no promise queue that can be abandoned during page freeze or
termination. `visibilitychange` performs a synchronous final snapshot before
freeze. `pagehide` performs the same snapshot and then releases the lease.
A BFCache `pageshow` must reacquire the lease and repeat the byte comparison
before input is enabled.

If the protected key is absent, the adapter may read a valid Public Beta 1
record from `math-quest:v2` once as migration input. It acquires the new-key
writer lease before copying those bytes into `math-quest:progress:v2` and never
writes or removes the Beta 1 record. A stale Beta 1 client therefore has no
write path to the protected Beta 2 record.

If both protected progress and the Beta 1 source were absent at the initial
read, the acquired-lease path must synchronously re-read the Beta 1 source and
migration guard before creating protected progress. A source or guard that
appeared while the lease was pending makes that launch fail closed with zero
protected writes, even if the corresponding cross-document storage event is
delayed. Reload then performs ordinary source selection from the newly
observable input.

The full initially-empty write is also enclosed by the constant
`empty-to-protected-v1` value under
`math-quest:progress:v2:beta1-migration-guard:v1`. The adapter verifies both
the absent Beta 1 source and exact marker before and after writing the first
protected record. A source or guard change at save entry or across that write
rolls back only the byte-matching blank and retains the marker; reload selects
new Beta 1 bytes even if blank removal failed. With no new source, reload can
resume an interrupted empty cutover. These effects do not depend on delivery
of a storage event. A closing read after marker removal also catches a source
or guard change injected during removal; it re-establishes the empty marker
when possible and rolls back the byte-matching blank before stopping play.

Boot source selection must remain safe even if local-storage access disappears
after marker removal, preventing the closing read, rollback, and re-guard.
The adapter therefore validates every candidate protected record and calls it
virgin only when its canonical engine export exactly equals
`createInitialState` for that record's `maxSeenPlayDay`. It always inspects the
Beta 1 key when protected bytes are absent, a valid guard is present, or this
exact virgin predicate holds. Valid Beta 1 bytes outrank virgin protected
bytes without depending on a guard or storage event. A malformed record or
any settings, placement-generation, session, progress, evidence, or history
change is non-virgin and cannot activate this fallback.

Before copying Beta 1, the adapter writes the constant, non-identifying
`beta1-to-protected-v1` value under the same key while the new-key lease is
held. It rechecks the exact Beta 1 bytes before and after the protected write,
then removes the marker. A source race, failed protected
rollback, failed marker removal, interrupted cutover, or relevant storage
event leaves the marker and stops child play. On the next launch, a present
valid marker makes the adapter ignore any unproven protected bytes and
reconcile from the newest valid Beta 1 source behind the lease. An invalid or
unreadable marker also fails closed; neither marker value contains
child, progress, device, or timing data.

An exact schema-2 record under either accepted Public Beta source is parsed
into temporary data, receives only the neutral empty placement record and a
zero-valued placement-draft generation, and is fully validated as schema 3
before the adapter commits canonical bytes. Import uses the same
validate-before-replace boundary. Unsupported schemas and invalid or foreign
records leave the original bytes unchanged. A schema-2 client
cannot consume schema 3 and must fail closed rather than overwrite it. The
writer lease serializes tabs; it does not make mixed code versions or
downgrades compatible.

The resumable starting-point flow writes only to
`math-quest:placement-draft:v1` until a grown-up applies its result. That
bounded record contains contract/generator identity, a local progress-baseline
consistency fingerprint, the exact persisted nonnegative draft generation,
seed, play day, theme, question identifiers, correctness booleans, and partial
answer controls. It excludes nickname, age, response timing, mastery evidence,
logs, analytics, and the exported backup. Draft writes use the same writer
lease and exact-byte conflict check. Discard removes the draft. Reset,
successful import, and successful apply atomically commit a strictly later
generation in main progress before attempting removal, so even a surviving
record is rejected on reload. Invalid, stale-generation, stale-baseline,
oversized, or conflicting drafts do not change progress.
The replacement generation is greater than the greatest valid current,
imported, or safely parsed bounded draft generation. The draft floor is still
used during unreadable-main-save recovery, preventing a generation-zero
fallback from colliding with a surviving generation-one draft. Exhaustion at
`Number.MAX_SAFE_INTEGER` fails without mutating any input or committing
replacement bytes.

An initial `localStorage` read failure is not treated as an empty save. The
adapter stops before requesting the writer lease or writing initial state, then
shows the same grown-up protection screen. This prevents a transient or
policy-denied read from turning an unknown existing save into a blank game.

If a second tab opens, `ifAvailable` returns no lock. That copy renders only a
grown-up protection screen with Reload and backup-export paths; child play is
not enabled. After the first copy closes, Reload lets the second copy acquire
the lease and open the newest bytes. A `storage` event or reacquisition byte
mismatch similarly stops the stale copy before it can overwrite progress.

The adapter does not fall back to an unlocked read/compare/write when Web Locks
are missing or fail. It pauses child play and shows a grown-up-only explanation,
backup export for valid loaded state, and a supported-browser/reload path.
Safari Lockdown Mode and managed configurations that disable Web Locks are
outside the Beta 2 support claim; the explanation recommends another qualified
configuration and does not ask a family to weaken a security setting. Physical
Apple qualification still has to prove the supported release devices.

## Installation dialog

The visible install control is present before nickname/progress creation and
in the Grown-ups corner. It opens an in-game dialog and does not pretend Safari
supports programmatic installation. The dialog always retains the instructions
and recovery help; user-agent detection may not hide either.

The dialog follows `docs/release/install-ios-ipados.md`, traps and restores
focus, uses a semantic heading and ordered list, has one clear Close action,
supports VoiceOver and reduced motion, and keeps every control at least 44 CSS
pixels. Its error and update nodes render only the fixed caregiver copy and an
optional allowlisted diagnostic identifier; raw `DOMException` content is
forbidden. New child-facing wording remains subject to the exact child-string
approval gate.
