# Release review: privacy and de-identification

- **Updated:** 2026-08-12
- **Public product:** Math Quest
- **Release target:** `1.0.0-beta.8`
- **Review scope:** prospective public release artifact and reachable Git history
- **Status:** **APPLICATION PRIVACY CONTRACT PRESERVED; HISTORICAL BETA 4
  REACHABLE-HISTORY DISPOSITION RETAINED; EXACT-CANDIDATE SCAN PENDING**

The public beta is designed as a neutral product. The exact staged candidate
is enumerated by the release guard and
`docs/release/public-file-manifest.txt`. Private pre-beta working material
remains outside that tracked set and must never be copied into a public branch,
archive, site artifact, or release attachment.

## De-identification changes

- Replaced the personalized curriculum with an independently authored,
  versioned Math Quest manifest and neutral skill identifiers.
- Removed historical publisher taxonomy, sequencing, identifiers, and
  curriculum-specific wording from the public runtime and release checks.
- Replaced personalized product and launcher wording with **Math Quest**.
- Removed absolute workstation paths and person-specific instructions from
  public documentation and audit descriptions.
- Made the initial grown-up gate request only a first name or nickname, with a
  24-character limit, browser autofill disabled, and a visible anonymous-play
  option.
- Kept the nickname in a separate browser-local record so gameplay state,
  exports, and curriculum records do not require it.
- Bound schema-3 progress to the exact curriculum manifest identity, version,
  and SHA-256 while keeping the established `math-quest:progress:v2`
  Public Beta 2 namespace.
- Added strict validate-before-commit migration for exact schema-2 Public Beta
  saves and backups. The additive placement record is the only schema shape
  change; unsupported, foreign, or downgrade-incompatible state leaves live
  bytes unchanged.
- Isolated unfinished starting-point work under
  `math-quest:placement-draft:v1`, outside ordinary progress and exports.
- Kept private pre-beta progress untouched instead of translating evidence
  between materially different curricula.
- Restricted the Windows server to loopback and blocked internal workspace
  directories, including the private pre-beta quarantine, from file serving.

## Runtime data behaviour

- No account, advertising, analytics, cloud-sync, telemetry, or
  application-level upload is required for play.
- Gameplay state is stored in the current browser under the protected
  `math-quest:progress:v2` key using state schema 3. The `v2` suffix names the
  Public Beta 2 namespace and is intentionally independent of the internal
  schema number. A valid Beta 1 `math-quest:v2` record may be copied into that
  key under the new exclusive writer lease, but the source record is never
  changed or removed. During an incomplete cutover only, the adapter stores
  either constant `beta1-to-protected-v1` or `empty-to-protected-v1` under
  `math-quest:progress:v2:beta1-migration-guard:v1`. Neither value contains
  child or device data. The marker forces a later launch to ignore or recheck
  an unproven protected copy, retry from the newest Beta 1 bytes when one
  appeared during the first write, and clear the marker only after source and
  guard stability across the protected write is proven.
- Exact schema-2 progress is migrated in temporary data and fully validated
  before replacement. Schema-3 exports are not promised to older schema-2
  builds; the lock prevents simultaneous writers but does not make
  mixed-version or downgrade use compatible.
- A placement draft may contain only bounded contract/generator identity, a
  local progress-baseline consistency fingerprint, the exact persisted
  nonnegative draft generation, seed, Halifax play day, theme, question
  identifiers, correctness booleans, and partial answer controls. It contains
  no nickname, age, timing, mastery evidence, session or feedback logs,
  analytics, or other identifying data and is absent from exports. Discard
  removes it. Reset, successful import, and successful apply commit a strictly
  later main-state generation before attempting removal; that generation is
  greater than the current, imported, and safely parsed surviving-draft floors,
  including during unreadable-main-save recovery. A removal failure is visible
  but the surviving prior-generation draft cannot resume after reload.
  Invalid or stale drafts fail closed without changing progress.
- The minimized draft is still classified as private local learning data
  because its correctness booleans describe unfinished child work; separation
  from the nickname does not make it public or non-sensitive.
- The optional nickname is stored separately under
  `math-quest:child-name:v1`; anonymous play stores only a non-identifying
  onboarding preference there.
- Exported backups contain learning history and should be treated as private.
- Reset is a separate confirmed action.
- The adult test lab is non-evidentiary and must not modify stored progress.
- Device speech synthesis is local browser functionality; the game does not
  include speech recognition.
- A static public host still receives ordinary request metadata even though
  the application does not send nickname, answers, or progress.
- The same-origin service worker caches only the explicit static app shell. It
  does not cache or transmit a name, progress record, backup, or personalized
  response.
- The selected prerelease origin is `https://openmathquest.github.io`, served
  from `OpenMathQuest/openmathquest.github.io` with no CNAME or custom domain.
  Its external host privacy/legal qualification is deferred until stable; it
  is not an approved or privacy-cleared host.
- The `OpenMathQuest` organization must remain exclusively reserved for Math
  Quest Pages. Browser storage is origin-wide, and the root service worker
  controls `/`; an unrelated Pages deployment in that organization would
  violate the intended isolation boundary.

## Public artifact boundary

The publication gate must construct the release from an explicit allowlist.
At minimum, it excludes:

- `.private-prebeta/` and all historical curriculum or review material;
- local reports, temporary profiles, generated screenshots, and test output;
- source documents without confirmed redistribution rights;
- workspace-control directories and filesystem metadata; and
- unrelated archives or handoff material.

The public curriculum artifact may include only its neutral manifest,
provenance, licence notices, and benchmark attributions. It must not include a
historical-to-neutral crosswalk.

## Prior pre-freeze scan evidence

The earlier pre-freeze local review inspected the then-publishable tree:

1. all publishable paths and their current working-tree bytes passed personal
   name, account, workstation-path, contact, credential, encoded-identity, and
   filename scans;
2. no archive or metadata-bearing office/reference document is tracked;
3. the bundled Inter name table contains only upstream font metadata, every
   bundled WAV contains only required `fmt ` and `data` chunks, and every
   bundled PNG has the registered dimensions and only the approved structural
   chunks;
4. no tracked file has an alternate data stream, reparse-point attribute, or
   unexpected hidden attribute;
5. legacy curriculum identifiers, publisher markers, copied private taxonomy,
   and denied source artifacts were absent;
6. the tracked-file denylist, required runtime-file set, and Pages runtime
   allowlist checks passed; and
7. a generated ignored coverage cache containing an absolute local path was
   removed after its exact workspace-contained target was verified.

The schema-3 and placement-draft changes invalidate that byte-level scan as
Beta 2 clearance evidence. The final exact staged payload, engine, curriculum,
rights, and browser-runner identities remain pending until implementation
bytes are frozen and the same checks are rerun. Any later byte or path change
invalidates those identities and requires the same checks and
publication-clearance binding to be regenerated.

## Reachable-history finding — owner disposition

An adversarial scan found that the already-public Beta 1 history contains a
former deny-list fixture that reconstructs two real personal names. The
current candidate replaces those name-specific fixtures with generic encoded
user-path checks, but a new tip commit cannot erase an older reachable blob.
No credential, address, phone number, personal email, or personal Git author
identity was found.

Beta 2 and Beta 3 were published after this blocker was recorded, but no
release record or governing register explicitly selected, remediated, or
waived a history disposition. Publication did not resolve the finding. The
obsolete fixture is absent from current `main` and from every Pages runtime
artifact, but it remains obtainable through published Beta 1 ancestry, tags,
and source archives.

On 2026-08-03, the project owner explicitly chose to retain the existing public
Git history and accepted this narrow residual risk for Beta 4. This remains a
historical Beta 4 disposition rather than a new Beta 8 privacy finding. The decision
does not waive the exact-candidate privacy, metadata, archive, or secret scans,
and it does not support a claim that all reachable repository history is
de-identified. The obsolete audit-only fixture remains outside the current
tree and every Pages runtime artifact, while its published Beta 1 ancestry,
tags, source archives, existing clones, and caches remain unchanged.

## Residual privacy considerations

- A grown-up can enter identifying text despite the nickname guidance. That
  value remains local unless someone deliberately exports or copies browser
  data.
- Saves are origin-specific. A local desktop record is separate from a hosted
  mobile record unless a grown-up deliberately transfers a backup.
- The organization-root origin is isolated from Pages projects under other
  GitHub accounts, but not from future project Pages under `OpenMathQuest`.
  Organization governance, the empty CNAME, and the absence of unrelated Pages
  deployments remain external checks.
- Public repository discussions, issue attachments, and screenshots can reveal
  information outside the application; repository maintainers need a separate
  moderation practice.
- The schema-3 and placement-draft changes add no account, upload, analytics
  identifier, or new category of personal information.
- Two personal names remain discoverable only by examining the retained,
  obsolete Beta 1 audit-fixture history or associated source archives. They are
  not present in the current game or Pages runtime. This is the owner-accepted
  reachable-history residual risk recorded above.

## Current verdict

The documented schema-3 migration, storage separation, local-only nickname
handling, and placement-draft minimization preserve the intended local privacy
boundary and add no new PII category. This is a contract conclusion, not
exact-candidate or external host privacy approval. The public-history finding
has the explicit owner disposition recorded above; the final exact staged
scan, full implementation audit, deployment, and the
applicable release evidence listed in `docs/release/publication-gates.md`
remain required. The reachable-history acceptance above is retained as an
explicit Beta 4 record and is not silently rewritten as a new Beta 8
disposition. For prereleases beginning Beta 4, external host qualification
is visibly deferred with provider request metadata disclosed; affirmative
qualification or a host change remains mandatory before stable release.
For Beta 8, that exact digest-bound host state remains
`DEFERRED_PRERELEASE`/`DEFERRED`, while the separate trusted-HTTPS canary must
be `RECONCILED` with canonical evidence. Canary reconciliation proves only the
qualification commit's candidate/PWA/offline behavior; it neither qualifies
the host nor turns this contract review into exact-candidate privacy approval.
