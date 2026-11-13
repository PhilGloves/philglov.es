/**
 * Runs before `astro build`. For every original in src/.originals/ it records,
 * once per file content (keyed by SHA-256, so a cache hit costs nothing):
 *   - width and height as displayed (EXIF orientation applied),
 *   - the dominant colour, used as the background of the image box,
 *   - camera, lens, focal length, aperture, shutter, ISO and capture year from
 *     the file's own EXIF (read with exiftool; absent fields are left out).
 * Output (both git-ignored, both read by the pages at build time):
 *   src/.originals/meta.json                 key → record
 *   src/styles/photo-colours.generated.css   one class per colour: .c-aabbcc { background: #aabbcc }
 * The colours go through a stylesheet class, never an inline style attribute
 * (the CSP blocks those). No blur script.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { colourCss, type PhotoRecord } from "./lib/photo-meta.ts";
import { hasExiftool, readExif } from "./lib/photo-rights.ts";

const originals = new URL("../src/.originals/", import.meta.url);
const metaFile = new URL("meta.json", originals);
const cssFile = new URL("../src/styles/photo-colours.generated.css", import.meta.url);

function walk(dir: URL): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(new URL(`${e.name}/`, dir))
      : /\.(jpe?g|png)$/i.test(e.name)
        ? [fileURLToPath(new URL(e.name, dir))]
        : [],
  );
}

const previous: Record<string, PhotoRecord> = existsSync(metaFile)
  ? (JSON.parse(readFileSync(metaFile, "utf8")) as Record<string, PhotoRecord>)
  : {};
const exiftool = hasExiftool();
const root = fileURLToPath(originals);
const next: Record<string, PhotoRecord> = {};
let fresh = 0;

for (const file of walk(originals).sort()) {
  const key = relative(root, file).split(sep).join("/");
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  const old = previous[key];
  if (old?.hash === hash) {
    next[key] = old;
    continue;
  }
  const image = sharp(file);
  const info = await image.metadata();
  const swap = (info.orientation ?? 1) >= 5;
  const { dominant } = await sharp(file).rotate().resize(96, 96, { fit: "inside" }).stats();
  const hex = [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const record: PhotoRecord = {
    hash,
    width: (swap ? info.height : info.width) ?? 0,
    height: (swap ? info.width : info.height) ?? 0,
    colour: hex,
    exif: exiftool ? readExif(file) : {},
  };
  next[key] = record;
  fresh++;
}

mkdirSync(originals, { recursive: true });
writeFileSync(metaFile, `${JSON.stringify(next, null, 1)}\n`);
writeFileSync(cssFile, colourCss(Object.values(next).map((r) => r.colour)));
const total = Object.keys(next).length;
console.log(
  `photo-meta: ${total} originals, ${fresh} analysed${exiftool || total === 0 ? "" : " (exiftool missing: no camera data)"}`,
);
