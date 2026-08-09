# Beta 4 host and child-privacy qualification

- **Reviewed:** 2026-07-30
- **Owner prerelease decision:** 2026-08-02
- **Candidate host:** `https://openmathquest.github.io/`
- **Host:** GitHub Pages
- **Repository:** `OpenMathQuest/openmathquest.github.io`
- **Decision:** `NOT_APPROVED`
- **Prerelease gate effect:** `EXT-HOST` is `DEFERRED_PRERELEASE`, never PASS
- **Stable gate effect:** `EXT-HOST` remains blocked until approved

## Scope

This review applies to the proposed child-facing Math Quest Beta 4 website on
the organization-root GitHub Pages origin. It evaluates the host separately
from the application. Math Quest's own runtime is offline-first, stores game
state locally, contains no analytics, and blocks non-loopback runtime requests.
Those protections do not prevent the hosting provider from receiving ordinary
HTTPS request metadata when a family first opens or updates the site.

## Current host facts

The following official GitHub policies were retrieved on 2026-07-30:

- The [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
  are effective 2026-04-27. They define a User as a person or organization that
  has visited or is using the Website or Service, state that a User must be at
  least 13, and state that GitHub does not target the Service to children under
  13.
- The [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
  is effective 2026-04-27. It says the Services are not intended for
  individuals under 13. It also describes automatic collection including IP
  address, device and session details, request times, operating-system and
  application information, referring site, pages viewed, links clicked, and
  regional geolocation.
- GitHub's [Pages HTTPS documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
  confirms that `github.io` Pages sites support HTTPS and that Pages sites are
  publicly available on the internet.

HTTPS protects the traffic in transit, but it does not prevent GitHub from
receiving the request metadata described in its privacy statement.

## Product-policy conclusion

Math Quest is intentionally designed for children beginning below age 13. The
current GitHub policies do not provide an affirmative basis for treating
GitHub Pages as an approved direct child-facing host under this project's
privacy-first, fail-closed host gate. The minimum-age and minors language also
creates a material terms-of-service ambiguity for an under-13 visitor, even
when a grown-up initiates the visit and the child has no GitHub account.

Accordingly:

1. GitHub Pages is **not approved** as a child-facing runtime host.
2. No GitHub Pages canary may be represented as privacy-cleared.
3. The public source repository may remain on GitHub; this conclusion concerns
   the runnable child-facing hosting origin.
4. This is a conservative project release decision, not legal advice or a
   determination that GitHub has violated any law.

## Owner-directed prerelease disposition

On 2026-08-02, the project owner directed that external host privacy/legal
qualification wait until Math Quest leaves prerelease. Beginning with
`v1.0.0-beta.4`, this exact factual review is therefore bound into publication
clearance as `Host qualification state: DEFERRED_PRERELEASE`. The audit must
report `EXT-HOST: DEFERRED`, never `PASS`, `APPROVED`, `WAIVED`, or
privacy-cleared. The state is nonblocking only for a semantic-version
prerelease and does not change the facts or conclusion above.

The hosted-beta notice must disclose that GitHub may receive ordinary HTTPS
request metadata, including IP address, browser or device information,
requested path, and request time. The current under-13 host terms and metadata
handling remain an explicitly accepted prerelease residual risk. Math Quest's
application-level prohibition on automatic child-name, progress, answer, and
gameplay-telemetry transmission remains mandatory.

A trusted-HTTPS canary may run on the selected prerelease host using only
synthetic data. Its evidence can prove exact bytes, headers, service-worker
identity, caching, update, recovery, and offline behavior; it cannot prove or
imply host privacy/legal qualification.

## Stable-release clearance paths

Before the first stable release, `EXT-HOST` can move to `APPROVED` only after
one of these paths is completed:

1. qualified privacy/legal review provides a written, candidate-specific basis
   for child-facing use of GitHub Pages, including the current terms, privacy
   statement, request metadata, parental co-play model, and applicable
   jurisdictions; or
2. the runnable game moves to a separately reviewed host whose terms and data
   practices affirmatively support this child-facing, no-account,
   privacy-first use.

Until then, no stable release may be declared release-certified or deployed.
Eligible prereleases may be certified and deployed only with the exact visible
deferral, explicit residual-risk disclosure, a reconciled canary, and every
remaining mandatory release gate satisfied.
