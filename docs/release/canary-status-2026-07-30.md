# Beta 4 canary status

- **Reviewed:** 2026-07-30
- **Owner prerelease decision:** 2026-08-02
- **Owner canary decision:** 2026-08-09
- **Candidate:** Math Quest `v1.0.0-beta.4`
- **Required state:** exact-candidate trusted-HTTPS reconciliation
- **Observed state:** `OWNER_SKIPPED_BETA4`
- **Evidence value:** `NONE`
- **Release-gate effect:** `EXT-CANARY` is visibly `OWNER_SKIPPED`, not passed

## Decision

The proposed GitHub Pages origin did not pass host/privacy qualification, as
recorded in `docs/release/host-privacy-qualification-2026-07-30.md`. On
2026-08-02, the project owner deferred that external qualification until the
first stable release. A no-announcement Beta 4 canary may therefore use the
named GitHub Pages origin with synthetic data and the exact visible
`DEFERRED_PRERELEASE` host state. It must not be described as privacy-cleared.
No internet-accessible Beta 4 canary has been deployed. The selected technical
path is instead a disposable GitHub-hosted Windows runner using pinned Caddy
and Playwright Core, an ephemeral loopback-only trusted HTTPS origin, installed
Edge, synthetic non-child state, and exact cleanup verification. Its focused
schema, supply-chain, privacy-channel, cache, offline, migration, navigation,
and teardown checks pass locally, but the real hosted workflow has not yet run
against a protected-main candidate and therefore supplies no reconciliation
evidence.

On 2026-08-09, the project owner directed that the hosted trusted-HTTPS
canary not run for Beta 4. The prepared implementation and its focused tests
remain in the repository, but they are not external canary evidence. Beta 4
therefore makes no claim that trusted-HTTPS update, cache, repair,
cold-offline, migration, teardown, or canary privacy behavior was observed on
a GitHub-hosted runner. This exact owner skip is nonblocking only for
`v1.0.0-beta.4`; it expires after that tag and is not reusable by Beta 5 or a
stable release.

The selected implementation has not been substituted with plain HTTP, a
browser certificate-warning bypass, `--ignore-certificate-errors`, or an
untrusted self-signed origin. Those alternatives would not establish the
required secure-context behavior.

## Work that may proceed independently

- focused local technical candidate evidence (not certification);
- an exact-candidate GitHub-hosted Windows audit on a non-public test branch;
- independent adjudication and finding disposition;
- focused validation of the disposable GitHub-hosted trusted-HTTPS canary
  implementation, without treating that preparation as hosted evidence.

## What would be required for reconciliation

`EXT-CANARY` could be recorded as `RECONCILED` only after:

1. the selected canary origin is named and bound either to affirmative host
   approval or, for an eligible prerelease only, the exact owner-directed
   `DEFERRED_PRERELEASE` record;
2. the exact frozen candidate is served over trusted HTTPS;
3. response bytes, headers, manifest, service worker, cache behavior, offline
   behavior, update behavior, recovery behavior, and candidate identity are
   reconciled to the frozen evidence; and
4. the evidence record is hashed and bound into the release clearance.

`OWNER_SKIPPED_BETA4` is intentionally not reported as a pass, waiver, or
partial reconciliation. A future `RECONCILED` result proves technical candidate and
offline/PWA behavior only; it does not convert the host deferral into privacy
approval.
