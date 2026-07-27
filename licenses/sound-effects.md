# Sound effects — source and open-licence record

- Reviewed: 2026-07-27
- Policy: [`../OPEN_SOURCE_POLICY.md`](../OPEN_SOURCE_POLICY.md)
- Machine-readable records:
  [`component-register-v1.json`](component-register-v1.json)

## Shipped assets (current build)

The four files under `assets/sounds/` are locally generated gentle sine-tone
effects produced by `assets/sounds/generate-sounds.ps1` for offline delivery.
The generator and resulting WAV files are original project material
distributed under the repository's MIT License. They are not recordings or
adaptations from a third-party sound library.

- Generator: `assets/sounds/generate-sounds.ps1`
- Generator SHA-256:
  `8dcb268a51d0e0d6e2a56f19014cfe7a5c79953b3de258f9943db1d22a624890`

| Shipped file | Source | Generated | SHA-256 | In-game use |
|---|---|---|---|---|
| `tap.wav` | Local script (`generate-sounds.ps1`, 880 Hz, 0.06 s) | 2026-07-24 | `376d43a4dab1e9e4d1ae192bcf6927568c3e2e00696e20282362fd94ba2b0eab` | Button and choice acknowledgment |
| `confirm.wav` | Local script (660 Hz, 0.12 s) | 2026-07-24 | `465a3589bb280d4b217ed64e6b8906df248de6d205565579edd75a0cc00cf2e8` | Correct confirm and “next” advance |
| `incorrect.wav` | Local script (440 Hz, 0.18 s) | 2026-07-24 | `655d1882fe4750e2b80163c2c3e825c7cd7028119630d947ff01876411569506` | Calm incorrect feedback (no buzzer/siren) |
| `close.wav` | Local script (523 Hz, 0.25 s) | 2026-07-24 | `cb059c9481fc88c3c97598e205f2c91d68e8ac459bb91e68d65d33a639d07a16` | Session close after capstone |

## Ineligible source: BBC Sound Effects

The BBC Sound Effects Archive is a legitimate archive, but its ordinary RemArc
terms permit free use only for non-commercial personal, educational, or
research purposes and direct commercial users to separate licensing. Those
restrictions do not satisfy Math Quest's open-source and public-domain policy.

No BBC archive recording, mix, edit, or derivative may replace these sounds
under the ordinary archive terms. A BBC item could be reconsidered only if that
specific recording were separately released under a verified licence that
permits commercial use, redistribution, and modification and is approved in
the component register. A paid-use or permission-only licence is not eligible.

Official licence evidence reviewed:
[BBC Sound Effects FAQ](https://sound-effects.bbcrewind.co.uk/faqs).

## Replacement requirements

Any future replacement must be original project work, verified public-domain
or CC0 material, or covered by another approved compatible open licence.
Before it is staged, record its creator, exact item URL and version, SPDX
identifier, licence evidence, required attribution, modification status, and
SHA-256 in `component-register-v1.json`.

## Implementation notes

- Sound is optional, default off, and controlled in Grown-ups corner.
- Volume 0% mutes effects.
- Sound effects remain available when speech has no local voice because the
  bundled audio is independent, first-party, and offline.
- No casino-like, startling, or shaming cues are used.
