# Math Quest — Privacy and Cross-Device Register

- **Revision:** `PCD-PUBLIC-1`
- **Date:** `2026-07-27`
- **Scope:** public beta

## Data boundary

| ID | Status | Decision |
|---|---|---|
| PCD-001 | CONFIRMED | The child display name is optional learning-interface data, not product branding. A grown-up can add, edit, or remove it. |
| PCD-002 | CONFIRMED | The display name, settings, progress, evidence, and session history remain in browser-local storage. Deliberate backup export includes the learning state but excludes the separately stored display name. |
| PCD-003 | CONFIRMED | The game has no user account, login, analytics, advertising, fingerprinting, remote speech, cloud synchronization, or gameplay upload. |
| PCD-004 | CONFIRMED | Exported backups are treated as sensitive because they contain learning history, even though the separately stored display name is excluded. |
| PCD-005 | CONFIRMED | Reset removes the current game's local save after an explicit grown-up confirmation. |
| PCD-006 | CONFIRMED | Public beta saves use state schema version `2`. Earlier evidence is not translated into the independently authored curriculum. |
| PCD-007 | CONFIRMED | Import validates a backup completely in temporary memory before replacing live data and rejects unknown schemas, malformed fields, impossible dates, and invalid evidence. |

## Runtime network policy

All required runtime assets are local or inline. The installed desktop build
may connect only to its loopback server. Hosted play may load the page from its
release origin, but play must not require later network requests.

The shipped page must not contain third-party scripts, trackers, remote fonts,
remote audio, pixels, social embeds, advertising, or telemetry endpoints.
Optional sound effects must be packaged locally and have a recorded licence
compatible with public redistribution.

## Storage origin

Browser-local storage is separated by origin. The approved public-beta origin
is `https://openmathquest.github.io`, served only from
`OpenMathQuest/openmathquest.github.io`. Reserve the `OpenMathQuest`
organization exclusively for Math Quest Pages: another Pages repository under
that organization would share the same origin-wide storage, and the root Math
Quest service worker controls `/`. Do not configure a CNAME or custom domain
for this release.

Verify the exact reviewed tag, organization and repository identity, empty
Pages base path, absent CNAME, GitHub Actions publishing source, HTTPS, and
deployed artifact before treating the release link as verified.

Changing domains or moving between a local desktop URL and the hosted origin
does not automatically transfer progress. A grown-up uses transactional
export/import when a deliberate transfer is needed.

Private or pre-beta reference material, historical evidence, personal
screenshots, machine paths, and prior saves are outside the public deployment
set.

## Device and input requirements

Essential play must work in current standards-based browsers on:

- Windows, macOS, and Linux desktop or laptop devices;
- iPhone- and Android-sized touch devices; and
- iPad- and Android-tablet-sized touch devices.

Every essential interaction is an explicit tappable and clickable control. A
child must not need a hardware keyboard, hover, right-click, precise mouse
movement, or a drag-only gesture. Keyboard and switch-style users can reach
and activate the same actions in a logical order.

Use responsive layout, safe-area-aware spacing, large controls, visible focus,
local speech replay, reduced-motion support, and text that remains readable
under zoom. Avoid browser-specific APIs unless there is a safe fallback.

## Verification record required for release

The release audit must record:

1. a public-tree text scan for names, addresses, machine paths, credentials,
   tokens, passwords, private filenames, and identifying metadata;
2. a runtime request log proving no third-party or post-load play requests;
3. storage isolation and schema-version checks;
4. transactional export/import and reset behavior;
5. keyboard, mouse, touch, and switch-style activation;
6. local persistence and same-day reopen;
7. desktop, phone-width, and tablet-width child and grown-up flows;
8. minimum text and target sizes, focus visibility, safe-area behavior, and
   reduced motion; and
9. deployment-file allowlisting so ignored private material cannot enter the
   published artifact.

The report must identify the browser versions, viewport sizes, operating
systems or emulation used, failures, skipped checks, and residual risks. A
simulated viewport is useful evidence but does not replace a final real-device
spot check.
