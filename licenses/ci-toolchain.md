# CI-only browser-verification toolchain

Math Quest uses the following open-source tools only for focused direct-user
browser journeys, the alternating-beta Deep UX Census, and the disposable
hosted-Windows trusted-HTTPS canary. They
are development dependencies and are not included in the child-facing Pages
payload, service-worker shell, desktop launcher, or offline installation.

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

## Ajv 8.20.0 tutorial-manifest validator

- Provider: Ajv contributors
- Licence: MIT
- Source: <https://github.com/ajv-validator/ajv/tree/0fba0b8e649909613cfce0999b149cd08f4a4987>
- Licence: <https://github.com/ajv-validator/ajv/blob/0fba0b8e649909613cfce0999b149cd08f4a4987/LICENSE>
- Registry artifact: <https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz>
- Registry SRI: `sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==`

Ajv validates the closed tutorial-manifest schema during development and
release checks. It and its dependency closure are CI-only and never enter the
Pages or service-worker payload.

## Ajv 8.20.0 transitive dependency closure

- `fast-deep-equal` 3.1.3 — MIT — [source](https://github.com/epoberezkin/fast-deep-equal/tree/6d7b0967c6a3c7051ba51e236f2404db34e8b13c) — [licence](https://github.com/epoberezkin/fast-deep-equal/blob/6d7b0967c6a3c7051ba51e236f2404db34e8b13c/LICENSE) — [artifact](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) — SRI `sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==`
- `fast-uri` 3.1.5 — BSD-3-Clause — [source](https://github.com/fastify/fast-uri/tree/5e179cbb4636d5f773ed21126e5bd3068e87e94e) — [licence](https://github.com/fastify/fast-uri/blob/5e179cbb4636d5f773ed21126e5bd3068e87e94e/LICENSE) — [artifact](https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.5.tgz) — SRI `sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==`
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
