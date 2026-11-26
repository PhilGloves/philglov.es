/**
 * Draws the photo originals the test fixtures use (decision 0033), so the test build needs no R2: every key the
 * fixture entries and series name (contentKeys, the same list the real build fetches) becomes a small JPEG in
 * tests/fixtures/.originals/<key>. Each is a flat picture, a light disc and a darker block on a background colour, at the
 * size and dominant colour of the sample original it stands for, so the pages lay out as before. Same input, same
 * bytes: a file already there with the right content is left alone. The folder is git-ignored.
 */
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { contentKeys } from "./lib/photo-keys.ts";

const fixtures = new URL("../tests/fixtures/", import.meta.url);
const originals = new URL(".originals/", fixtures);

/** Width, height and background of each fixture photo; a key not listed is 3:2 and grey-green. */
const SPECS: Record<string, [number, number, string]> = {
  "photos/lisbon/tram-28.jpg": [4000, 2667, "#988858"],
  "photos/lisbon/graca.jpg": [4000, 2667, "#784848"],
  "photos/lisbon/alfama.jpg": [2667, 4000, "#b8c8a8"],
  "foto/1000029179-9gp7.jpg": [2667, 4000, "#b8c8a8"],
  "provafoto/1000029179-oerb.jpg": [1600, 1200, "#786858"],
  // The portrait site.json names (decision 0034): 3:4, like the phone photo it stands in for.
  "portrait/finisterre.jpg": [1512, 2016, "#c8ccd0"],
};
const FALLBACK: [number, number, string] = [2400, 1600, "#8c9878"];

function fixtureSvg([w, h, bg]: [number, number, string]): string {
  const r = Math.round(Math.min(w, h) * 0.28);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<circle cx="${Math.round(w * 0.32)}" cy="${Math.round(h * 0.55)}" r="${r}" fill="#ffffff" fill-opacity="0.35"/>` +
    `<rect x="${Math.round(w * 0.55)}" y="${Math.round(h * 0.45)}" width="${Math.round(w * 0.25)}" ` +
    `height="${Math.round(h * 0.55)}" fill="#000000" fill-opacity="0.12"/></svg>`
  );
}

/** The placeholder for the CV (decision 0046): one empty page. Its date is fixed, so the tests can name it. */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const PDF_DATE = new Date("2026-11-01T12:00:00Z");

const keys = contentKeys(new URL("content/", fixtures));
let drawn = 0;
for (const key of keys) {
  const file = new URL(key, originals);
  const pdf = key.endsWith(".pdf");
  const bytes = pdf
    ? PDF
    : await sharp(Buffer.from(fixtureSvg(SPECS[key] ?? FALLBACK)))
        .jpeg({ quality: 70 })
        .toBuffer();
  if (!existsSync(file) || !readFileSync(file).equals(bytes)) {
    mkdirSync(dirname(fileURLToPath(file)), { recursive: true });
    writeFileSync(file, bytes);
    drawn++;
  }
  if (pdf) utimesSync(file, PDF_DATE, PDF_DATE);
}
console.log(`fixture-photos: ${keys.length} fixture originals in tests/fixtures/.originals (${drawn} drawn)`);
