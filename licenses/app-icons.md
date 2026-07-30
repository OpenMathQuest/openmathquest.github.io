# Math Quest app icons

The Math Quest rocket icon is original project artwork distributed under the
repository's MIT License. It was drawn as simple SVG geometry for this
repository and does not contain copied platform, product, stock, emoji, or
third-party artwork.

The committed PNG files were deterministically rasterized from
`assets/icons/math-quest-icon.svg` with Sharp 0.34.5 and libvips 8.17.3. Each
output was resized to its named square dimension, flattened onto the icon's
opaque teal background so maskable launchers never reveal transparent corners, and encoded as a
non-progressive, non-palette, 8-bit sRGB PNG with compression level 9,
adaptive filtering disabled, and no embedded colour profile.

| File | Purpose | SHA-256 |
|---|---|---|
| `math-quest-icon.svg` | Editable first-party source | `2e84ab4fc3b1760cfc4baa6a64cce3d08e66510f9a29cd1dcb0769c2543098e2` |
| `icon-192.png` | 192×192 web app icon | `1dc9eaac895733856860c6208fc300baddea2cb0f11aefea013643df7f39a0dd` |
| `icon-512.png` | 512×512 web app and maskable icon | `90c09c503ccbbc95aa2472780e0bd1eb0558dfcd0c759fb1c15d7d3f5127480d` |
| `apple-touch-icon.png` | 180×180 Apple touch icon | `7c6ea384848de14165e49cc8ed5a1d1562102250380f9ea6a9b1ba1ae4f8558f` |

All four files are release components recorded individually in
`licenses/component-register-v1.json`.
