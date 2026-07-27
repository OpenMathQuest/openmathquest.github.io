# Release review: privacy and de-identification

- **Updated:** 2026-07-27
- **Public product:** Math Quest
- **Release target:** `1.0.0-beta.1`
- **Review scope:** prospective public release artifact
- **Status:** **LOCAL PRIVACY AND DE-IDENTIFICATION REVIEW PASS; EXTERNAL REVIEW PENDING**

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
- Bound schema-2 progress to the exact curriculum manifest identity, version,
  and SHA-256.
- Kept private pre-beta progress untouched instead of translating evidence
  between materially different curricula.
- Restricted the Windows server to loopback and blocked internal workspace
  directories, including the private pre-beta quarantine, from file serving.

## Runtime data behaviour

- No account, advertising, analytics, cloud-sync, telemetry, or
  application-level upload is required for play.
- Gameplay state is stored in the current browser under `math-quest:v2`.
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
- The approved hosted origin is `https://openmathquest.github.io`, served from
  `OpenMathQuest/openmathquest.github.io` with no CNAME or custom domain.
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

## Current staged-artifact scan evidence

The local release review regenerated its evidence from the staged public
candidate:

1. all tracked paths and their current working-tree bytes passed personal
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
7. the staged runtime reconciled to engine SHA-256
   `07ec69208431d24698ba5f3e07b17e6428075d888b9f2127bee7035d1ab3392a`
   and manifest SHA-256
   `49e5265eed2fe6d17d660d8136de1b55b05398e6b86b2b8761571480580e1048`.

The scan is fail-closed: any later byte or path change alters the staged
payload identity and requires the same checks and publication-clearance
binding to be regenerated before release.

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

## Current verdict

The neutral beta's storage separation, local-only nickname handling,
non-evidentiary test lab, loopback launcher, dedicated organization-root
design, explicit publication boundary, and staged-candidate de-identification
scan meet the local implementation-level privacy review. The external
repository, organization governance, deployment, legal/privacy, and
real-device reviews listed in `docs/release/publication-gates.md` remain
required.
