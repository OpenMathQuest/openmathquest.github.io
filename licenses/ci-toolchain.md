# CI-only verification toolchain

Math Quest uses the following open-source tools only for focused direct-user
browser journeys, closed JSON-contract validation, the alternating-beta Deep
UX Census, the AI-change quality loop, security scanning, and the disposable
hosted-Windows trusted-HTTPS canary. They are development dependencies and are
not included in the child-facing Pages payload, service-worker shell, desktop
launcher, or offline installation.

## Caddy 2.11.4

- Provider: Caddy contributors
- Licence: Apache License 2.0
- Signed tag object: `8ec11a4b7e39a5fd00da2fc5cb9b543e31fd7926`
- Source commit: <https://github.com/caddyserver/caddy/tree/e2eee6a7fce366321294c9c2a79f3146891dcbdf>
- Licence: <https://github.com/caddyserver/caddy/blob/e2eee6a7fce366321294c9c2a79f3146891dcbdf/LICENSE>
- Retrieved archive: `caddy_2.11.4_windows_amd64.zip`
- Archive SHA-256: `1708333f79e274c7697285afe6d592ab39314e0b131e9ec6bea08ad27df62ebf`
- Upstream checksum SHA-512: `cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35`

Caddy terminates loopback-only TLS using a disposable internal certificate
authority. The workflow explicitly disables automatic trust installation,
temporarily trusts only that run's root, and removes the certificate and all
private-key material during teardown.

## Playwright 1.62.1 toolchain

- Provider: Microsoft Corporation and Playwright contributors
- Licence: Apache License 2.0
- Source: <https://github.com/microsoft/playwright/tree/26a9e470a7b3c7822084b09fb7f13902c5f37b51>
- Licence: <https://github.com/microsoft/playwright/blob/26a9e470a7b3c7822084b09fb7f13902c5f37b51/LICENSE>
- Registry artifact: <https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz>
- Registry SRI: `sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==`
- Playwright Test artifact: <https://registry.npmjs.org/@playwright/test/-/test-1.62.1.tgz>
- Playwright Test SRI: `sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==`
- Playwright runner artifact: <https://registry.npmjs.org/playwright/-/playwright-1.62.1.tgz>
- Playwright runner SRI: `sha512-0M+L3LAD8/nm554LOla9Ayx0j0tmFZ0FBcoQ7F1VuVHpM/XpiC8RcDzBQB8W5+hA8L22THxELzeF+2WcUzvcLg==`

The lockfile installs the Playwright Test dependency closure with lifecycle
scripts, optional dependencies, browser downloads, audit submission, and
funding requests disabled. The focused browser suite, Deep UX Census, and canary drive the
Microsoft Edge binary already present on Windows; no Playwright-managed browser
is downloaded or shipped.

## axe-core 4.13.0 accessibility analyzer

- Provider: Deque Systems, Inc. and axe-core contributors
- Licence: Mozilla Public License 2.0
- Source: <https://github.com/dequelabs/axe-core/tree/1cc54b900413660610180d631feb73c9e74f4dc9>
- Licence: <https://github.com/dequelabs/axe-core/blob/1cc54b900413660610180d631feb73c9e74f4dc9/LICENSE>
- Registry artifact: <https://registry.npmjs.org/axe-core/-/axe-core-4.13.0.tgz>
- Registry SRI: `sha512-UzGt8zg7Ny8djbYMhxl2zuEevVa7r2gJjYY5Lwr1xM7+XU2nd6CkIWFTVcCIbAP63vSz71NaVyyuSk9lHKcy0A==`

axe-core is injected from the local reviewed package into Playwright's existing
same-origin synthetic test pages. It runs the WCAG 2.0, 2.1, and 2.2 A/AA tag
sets, makes no network request, and is not included in the child-facing game,
service-worker shell, or production payload. Definite violations fail the
browser gate. Incomplete results remain separately labelled for manual review
and cannot be presented as automated accessibility passes. The deliberate
unnamed-button negative control must be detected on every run.

## Ajv 8.20.0 closed JSON-contract validator

- Provider: Ajv contributors
- Licence: MIT
- Source: <https://github.com/ajv-validator/ajv/tree/0fba0b8e649909613cfce0999b149cd08f4a4987>
- Licence: <https://github.com/ajv-validator/ajv/blob/0fba0b8e649909613cfce0999b149cd08f4a4987/LICENSE>
- Registry artifact: <https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz>
- Registry SRI: `sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==`

Ajv validates closed repository contracts, including tutorial, art-design, and
art-migration baseline schemas, during development and release checks. It and
its dependency closure are CI-only and never enter the Pages or service-worker
payload.

## Ajv 8.20.0 transitive dependency closure

- `fast-deep-equal` 3.1.3 — MIT — [source](https://github.com/epoberezkin/fast-deep-equal/tree/6d7b0967c6a3c7051ba51e236f2404db34e8b13c) — [licence](https://github.com/epoberezkin/fast-deep-equal/blob/6d7b0967c6a3c7051ba51e236f2404db34e8b13c/LICENSE) — [artifact](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) — SRI `sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==`
- `fast-uri` 3.1.6 — BSD-3-Clause — [source](https://github.com/fastify/fast-uri/tree/6f970b2951fd896aa0f3a7ff28eeb6640c137d33) — [licence](https://github.com/fastify/fast-uri/blob/6f970b2951fd896aa0f3a7ff28eeb6640c137d33/LICENSE) — [artifact](https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.6.tgz) — SRI `sha512-7Ical1vFEMr0onbVzEDIreM22I4khW+fzyQPwvAFWBp1iwdshSZRsL4jjRvPG9JP1uiqMHRto+YU6R2/CzDz5Q==`
- `json-schema-traverse` 1.0.0 — MIT — [source](https://github.com/epoberezkin/json-schema-traverse/tree/a20697b59096545a52bc8050b0878135c16979d6) — [licence](https://github.com/epoberezkin/json-schema-traverse/blob/a20697b59096545a52bc8050b0878135c16979d6/LICENSE) — [artifact](https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz) — SRI `sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==`
- `require-from-string` 2.0.2 — MIT — [source](https://github.com/floatdrop/require-from-string/tree/bdd5c805a87c29b1a44ecf2d9ee9b22fdfca1f13) — [licence](https://github.com/floatdrop/require-from-string/blob/bdd5c805a87c29b1a44ecf2d9ee9b22fdfca1f13/LICENSE) — [artifact](https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz) — SRI `sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==`

## Optional fsevents 2.3.2 lockfile entry

- Provider: fsevents contributors
- Licence: MIT
- Source: <https://github.com/fsevents/fsevents/tree/a7f5d00939b74e141a73131468c4ce48ee0f2197>
- Licence: <https://github.com/fsevents/fsevents/blob/a7f5d00939b74e141a73131468c4ce48ee0f2197/LICENSE>
- Registry artifact: <https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz>
- Registry SRI: `sha512-xiqMQR4xAeHTuB9uWm+fFRcIOgKBMiOBP+eXiyT7jsgVCq1bkVygt00oASowB7EdtpOHaaPgKt812P9ab+DDKA==`

Playwright declares this macOS-only package as optional. Math Quest's reviewed
Windows install uses `--omit=optional`, so the package remains provenance-bound
in the lockfile but is not installed or executed by the Windows audit.

## fast-check 4.9.0 interaction-fuzz dependency

- Provider: fast-check contributors
- Licence: MIT
- Source: <https://github.com/dubzzz/fast-check/tree/0d3c2547dce556f72413607849377530d18ea283/packages/fast-check>
- Licence: <https://github.com/dubzzz/fast-check/blob/0d3c2547dce556f72413607849377530d18ea283/LICENSE>
- Registry artifact: <https://registry.npmjs.org/fast-check/-/fast-check-4.9.0.tgz>
- Registry SRI: `sha512-7ms6T7SybUev/PQITciI0yLM2pOSFy5zpG8Ty7tQofcVaQUvrMXp6CBwqF6fThLCLOrfBtuHAtwq6Yu4XPCllg==`

fast-check generates and shrinks bounded command sequences for the diagnostic
Playwright interaction-fuzz lane. It is development-only, cannot make a
release certification claim, and is not included in the child-facing payload.

## pure-rand 8.4.2 transitive dependency

- Provider: pure-rand contributors
- Licence: MIT
- Source: <https://github.com/dubzzz/pure-rand/tree/fd86674e8e4ca9c3099fe2621ba4e9db0959c5d6>
- Licence: <https://github.com/dubzzz/pure-rand/blob/fd86674e8e4ca9c3099fe2621ba4e9db0959c5d6/LICENSE>
- Registry artifact: <https://registry.npmjs.org/pure-rand/-/pure-rand-8.4.2.tgz>
- Registry SRI: `sha512-vvuOGgcuPJAirlHvuQw1TrOiw7ptaIXXmIbNuiNOY6lNGJJH49PQ1Kj4nd783nPdQhQdicgOjVI2yI/9BD6/Ng==`

pure-rand is fast-check's reviewed seeded pseudorandom-generator dependency.
It is installed and executed only with the diagnostic development toolchain.

## Refactor quality analyzers

The owner approved these exact CI-only tools on 2026-08-27. They run the
ordered AI-change quality loop and are excluded from every child-facing and
service-worker payload.

- BundleWatch 0.4.2 — MIT — [source](https://github.com/bundlewatch/bundlewatch/tree/95997ac3bdf7ff1e3ec75bf123a2b06051e39b7d) — [licence](https://github.com/bundlewatch/bundlewatch/blob/95997ac3bdf7ff1e3ec75bf123a2b06051e39b7d/LICENSE) — [artifact](https://registry.npmjs.org/bundlewatch/-/bundlewatch-0.4.2.tgz) — SRI `sha512-67hWKEbLZyokB07wF4TFJ8X1TL/bcZWipbTQBAf9wwcc4fHe31vFk8m2CMwByMZa5DcK4ZzeRIn6Ldt8Q9f9aw==`
- ESLint 10.9.0 — MIT — [source](https://github.com/eslint/eslint/tree/c27bc926e496985eb7911c09eb60914b2e4b5d0f) — [licence](https://github.com/eslint/eslint/blob/c27bc926e496985eb7911c09eb60914b2e4b5d0f/LICENSE) — [artifact](https://registry.npmjs.org/eslint/-/eslint-10.9.0.tgz) — SRI `sha512-5KeEOJZBfEVA47boFiBsf+6MmmJpffM7qEBg4pLla2e4nlKgdKlqCW0oSLOGsT8Wl5uCGJptLV1bkaiShj90Gw==`
- Stylelint 17.14.1 — MIT — [source](https://github.com/stylelint/stylelint/tree/cd66b035087270dd62d33542154463266cc5e81a) — [licence](https://github.com/stylelint/stylelint/blob/cd66b035087270dd62d33542154463266cc5e81a/LICENSE) — [artifact](https://registry.npmjs.org/stylelint/-/stylelint-17.14.1.tgz) — SRI `sha512-xVQwyiuxALUBNB2fBe0tmNemg9KqLtdj3T64mioFDar79B2cU8LIyz+3KL6LdiHs9NkeNfwxpKSaIVOY8f112g==`
- markdownlint-cli2 0.23.2 — MIT — [source](https://github.com/DavidAnson/markdownlint-cli2/tree/b82a6c8896e491b9cb377a99ff3412131920681b) — [licence](https://github.com/DavidAnson/markdownlint-cli2/blob/b82a6c8896e491b9cb377a99ff3412131920681b/LICENSE) — [artifact](https://registry.npmjs.org/markdownlint-cli2/-/markdownlint-cli2-0.23.2.tgz) — SRI `sha512-eUhcnkSpzURo/o4htSqc7LPDszgOOTknhU4eY/sPHvMCLxnTCYscv1gw1/js/idmaZPisv9ECVEIORcllqjTUw==`
- Knip 6.32.2 — ISC — [source](https://github.com/webpro-nl/knip/tree/7ba4ae692c1f55d5b20bcb0e06ad1f13ad338950/packages/knip) — [licence](https://github.com/webpro-nl/knip/blob/7ba4ae692c1f55d5b20bcb0e06ad1f13ad338950/LICENSE) — [artifact](https://registry.npmjs.org/knip/-/knip-6.32.2.tgz) — SRI `sha512-WXTXbmocrw7gqm1A1TQvFN0OgJ7hUSU6E1g6SPRIzzHFogUBhXByc7cYeOFVtJ2uODg7DP4VbESYBYnfbtBYsg==`

Knip dynamically loads two MIT-licensed native Windows bindings that npm would
normally select as optional platform packages. Because the reviewed audit
install deliberately uses `--omit=optional`, Math Quest pins them directly:

- `@oxc-parser/binding-win32-x64-msvc` 0.143.0 — [source](https://github.com/oxc-project/oxc/tree/45a17c25d188bf1b289638483e2bc61adbadd364/napi/parser) — [licence](https://github.com/oxc-project/oxc/blob/45a17c25d188bf1b289638483e2bc61adbadd364/LICENSE) — [artifact](https://registry.npmjs.org/@oxc-parser/binding-win32-x64-msvc/-/binding-win32-x64-msvc-0.143.0.tgz) — SRI `sha512-ORMh3JE1s6V7ySicdRK7vgaDQnn5o+UHg9ct989PlWHbel8O9ARrmWXM6kZjrBMtNucxNayQ8g69G0VfWzhANw==`
- `@oxc-resolver/binding-win32-x64-msvc` 11.24.2 — [source](https://github.com/oxc-project/oxc-resolver/tree/7ba4ae692c1f55d5b20bcb0e06ad1f13ad338950) — [licence](https://github.com/oxc-project/oxc-resolver/blob/7ba4ae692c1f55d5b20bcb0e06ad1f13ad338950/LICENSE) — [artifact](https://registry.npmjs.org/@oxc-resolver/binding-win32-x64-msvc/-/binding-win32-x64-msvc-11.24.2.tgz) — SRI `sha512-UqGPmo56KDfLlfXFAFIrNflHT8tFxWGEivWg3Zeyp4Uy2NlKN1FGPr6/BxcLGG3+kZ6Wp14g5Uj+n71boqZfiw==`

BundleWatch runs only its pinned local file-detail and analysis engine. Remote
status reporting and comparison storage are not invoked. BundleWatch 0.4.2
declares Axios `^0.31.1`; the lockfile overrides that range with MIT-licensed
Axios 1.20.0, artifact SRI
`sha512-r8aOh8j9cGKpgQAqpzrUHnSIc6a59Y3Xf/cv8sy1DrHCkZHzQGEuoq1tARk6qSyDdtQGSDgpb9kFlruzPvrgwg==`,
because the declared 0.x range is vulnerable. The override is integrity-bound,
mutation-tested, and retained only while the complete dependency audit remains
at zero vulnerabilities.

## Refactor security analyzers

The owner approved these exact unmodified, CI-only scanner artifacts on
2026-08-27. Neither scanner nor its cache is distributed with Math Quest.

- Semgrep 1.164.0 core — LGPL-2.1-or-later — [source](https://github.com/semgrep/semgrep/tree/887f1f48a6f35e692870e68651100db7496036cf) — [licence](https://github.com/semgrep/semgrep/blob/887f1f48a6f35e692870e68651100db7496036cf/LICENSE) — [artifact](https://files.pythonhosted.org/packages/f5/09/9fcb561fae64b7ba7dcb98139739e9208d7c6ad14b731669bd796fbc3ee3/semgrep-1.164.0-cp310.cp311.cp312.cp313.cp314.py310.py311.py312.py313.py314-none-win_amd64.whl) — 56,482,229 bytes — SHA-256 `f0fc972bd0e33893ef73e8144c2c2293f7acafa86c00cca4e22673bc1b6c35ca`
- TruffleHog 3.97.0 — AGPL-3.0-only — [source](https://github.com/trufflesecurity/trufflehog/tree/bcfcf73aaf4759d4dadc2783177c245a02792318) — [licence](https://github.com/trufflesecurity/trufflehog/blob/bcfcf73aaf4759d4dadc2783177c245a02792318/LICENSE) — [artifact](https://github.com/trufflesecurity/trufflehog/releases/download/v3.97.0/trufflehog_3.97.0_windows_amd64.tar.gz) — 71,055,813 bytes — SHA-256 `2a8208e6e5be8d6cd855322480eda4790a437f805dbd6538ad7495c27f40d4e5`

Semgrep runs a repository-owned, integrity-bound high-confidence rule set over
JavaScript and executable inline HTML. TruffleHog scans tracked and untracked
non-ignored worktree content plus repository history after the immutable
refactor baseline. Raw secret candidates are never written to reports.

## Complete npm closure review

`package-lock.json` SHA-256
`50c4769bf8b778e79a25b8d21f360bef9c81ae0d7ae3427653fefae75c897ed9`
contains 373 dependency entries plus the root record. Every dependency is
development-only, resolves from the HTTPS npm registry, and has SHA-512
integrity. The recorded licence counts are MIT 305, ISC 24, Apache-2.0 17,
BSD-2-Clause 8, BSD-3-Clause 6, MIT-0 3, `(MIT OR CC0-1.0)` 2, CC0-1.0 2,
and one each of 0BSD, BlueOak-1.0.0, CC-BY-3.0, and Python-2.0.

`jsonpack` 1.1.5 and `svg-tags` 1.0.0 are the two lockfile metadata
exceptions: each package manifest uses the legacy `licenses` field and its
bundled licence text is MIT. `fsevents` 2.3.2 is the sole lifecycle-script
entry; it is optional, macOS-only, and omitted by the reviewed Windows install.

BundleWatch's closure also emits upstream deprecation notices for `glob` 7.2.3
and `inflight` 1.0.6. They have no reported dependency vulnerability, are never
shipped, and are retained only because the owner explicitly required the real
BundleWatch tool. Their deprecation is recorded rather than hidden and remains
a replacement trigger if BundleWatch publishes a compatible maintained
release. These facts are fail-closed in
`audit/quality-gate-policy-v1.json` and its negative controls.
