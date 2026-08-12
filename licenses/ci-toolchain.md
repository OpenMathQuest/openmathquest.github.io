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
