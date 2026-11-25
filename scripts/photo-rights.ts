/**
 * Runs after `astro build`, before postbuild. Writes the rights metadata
 * (scripts/lib/photo-rights.ts) into every optimised photograph in
 * dist/_assets/ and then proves it: no output image may carry GPS data, and
 * every one must carry the copyright notice. Fails the build otherwise, so a
 * photo can never go live without its rights fields or with a location.
 *
 * The large versions a click opens (decision 0043) are JPEGs in dist/_assets/ like the others, so they get the same
 * fields and the same proof; each one a page links to must also exist and be no longer than LARGE_EDGE.
 *
 * The copyright year is the year the photo was taken: the series file's
 * `takenAt`, else the year in the file's EXIF, else the year of the build.
 * Astro names outputs "<original name>.<hash>.<ext>", which is how an output
 * is matched to its source; two sources with the same name get the earlier year.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LARGE_EDGE } from "../src/lib/watermark.ts";
import { filesUnder } from "./lib/files.ts";
import { collectionDir, originalsDir } from "./lib/content-root.ts";
import type { PhotoRecord } from "./lib/photo-meta.ts";
import { applyRights, copyrightNotice, hasExiftool, largeLinks } from "./lib/photo-rights.ts";

const dist = new URL("../dist/_assets/", import.meta.url);

const images = existsSync(dist) ? readdirSync(dist).filter((f) => /\.(avif|webp|jpe?g)$/i.test(f)) : [];
if (images.length === 0) {
  console.log("photo-rights: no photographs in dist/_assets (placeholders only)");
  process.exit(0);
}
if (!hasExiftool()) {
  console.error("photo-rights: exiftool is not installed, and the build has photographs. Install it (CI does).");
  process.exit(1);
}

const years = new Map<string, number>();
const remember = (name: string, year: number | undefined) => {
  if (year && year > 1900) years.set(name, Math.min(years.get(name) ?? year, year));
};
const metaFile = new URL("meta.json", originalsDir);
const meta: Record<string, PhotoRecord> = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
const base = (key: string) => (key.split("/").pop() ?? key).replace(/\.[^.]+$/, "");
for (const [key, rec] of Object.entries(meta)) remember(base(key), rec.exif.year);
const seriesDir = collectionDir("photos");
for (const s of readdirSync(seriesDir, { withFileTypes: true })) {
  const file = new URL(`${s.name}/photos.json`, seriesDir);
  if (!s.isDirectory() || !existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, "utf8")) as { photos: { file: string; takenAt: string }[] };
  // takenAt beats the EXIF year when both exist: it is the owner's own date.
  for (const p of data.photos) years.set(base(p.file), new Date(p.takenAt).getUTCFullYear());
}

const nowYear = new Date().getUTCFullYear();
const items = images.map((name) => {
  const stem = name.split(".")[0] ?? name;
  return { file: fileURLToPath(new URL(name, dist)), year: years.get(stem) ?? nowYear };
});
applyRights(items);

// Verify: every output carries the notice and none carries a position.
const out = JSON.parse(
  execFileSync("exiftool", ["-json", "-a", "-G1", "-Copyright", "-Rights", "-GPS*", ...items.map((i) => i.file)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
) as Record<string, unknown>[];
const bad: string[] = [];
// Every page but the style guide, whose specimen links nowhere real (like postbuild's `specimens`).
const large = new Set(
  filesUnder(new URL("../dist/", import.meta.url), /\.html$/)
    .filter((f) => !f.pathname.endsWith("/styleguide.html"))
    .flatMap((f) => largeLinks(readFileSync(f, "utf8"))),
);
for (const href of large) {
  const name = href.startsWith("/_assets/") ? href.slice("/_assets/".length) : "";
  if (!images.includes(name)) {
    bad.push(`${href}: a page links to this large version, which is not a photograph in dist/_assets`);
    continue;
  }
  const { width = 0, height = 0 } = await sharp(fileURLToPath(new URL(name, dist))).metadata();
  if (Math.max(width, height) > LARGE_EDGE) bad.push(`${href}: large version is ${width} x ${height}`);
}
for (const row of out) {
  const keys = Object.keys(row);
  if (keys.some((k) => /GPS/i.test(k))) bad.push(`${String(row["SourceFile"])}: carries GPS data`);
  if (!keys.some((k) => /Rights|Copyright/i.test(k))) bad.push(`${String(row["SourceFile"])}: no copyright notice`);
}
if (bad.length) {
  console.error(`photo-rights: ${bad.length} problems\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `photo-rights: rights written to ${items.length} images (${large.size} large versions); none carries GPS ` +
    `(e.g. ${copyrightNotice(nowYear)})`,
);
