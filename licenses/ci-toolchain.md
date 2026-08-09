# CI-only canary toolchain

Math Quest uses the following open-source tools only in the disposable hosted
Windows trusted-HTTPS canary. They are development dependencies and are not
included in the child-facing Pages payload, service-worker shell, desktop
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

## Playwright Core 1.62.1

- Provider: Microsoft Corporation and Playwright contributors
- Licence: Apache License 2.0
- Source: <https://github.com/microsoft/playwright/tree/26a9e470a7b3c7822084b09fb7f13902c5f37b51>
- Licence: <https://github.com/microsoft/playwright/blob/26a9e470a7b3c7822084b09fb7f13902c5f37b51/LICENSE>
- Registry artifact: <https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz>
- Registry SRI: `sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==`

The lockfile installs Playwright Core with lifecycle scripts, optional
dependencies, browser downloads, audit submission, and funding requests
disabled. The canary drives the Microsoft Edge binary already present on the
GitHub-hosted Windows image.
