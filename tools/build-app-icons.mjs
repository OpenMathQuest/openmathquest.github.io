import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || "sharp");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "icons", "math-quest-icon.svg");
const outputs = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

sharp.cache(false);

for (const [name, size] of outputs) {
  const target = join(root, "assets", "icons", name);
  await sharp(source, { density: 384 })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .flatten({ background: "#087f8c" })
    .toColourspace("srgb")
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
      progressive: false,
    })
    .toFile(target);
  const bytes = await readFile(target);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(`${name}\t${bytes.length}\t${sha256}\n`);
}
