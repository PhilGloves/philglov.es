/**
 * The large version of a photograph (decision 0043): a JPEG of at most LARGE_EDGE px on its long edge, with
 * "© Filippo Guanti" burned into the bottom right corner. Only this file carries the mark; the images in the pages do
 * not. The text is drawn from the outlines of Crimson Pro (src/lib/watermark-glyphs.ts), never a system font, so every
 * machine burns the same pixels. White at reduced opacity over a thin dark edge, so it reads on light and dark photos.
 */
import sharp from "sharp";
import { WATERMARK_GLYPHS as G } from "./watermark-glyphs.ts";

/** No published file is larger than this on its long edge (tests/unit/photos.test.ts). */
export const LARGE_EDGE = 2400;
/** The quality of every JPEG the site publishes (src/components/Photo.astro). */
export const JPEG_QUALITY = 78;
/** The height of the capitals, as a share of the image's long edge. */
export const TEXT_SHARE = 0.012;

/** The size of the large version: the original scaled so its long edge is LARGE_EDGE, never enlarged. */
export function largeSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, LARGE_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** An SVG as large as the image, with the mark in the bottom right corner, two text heights in from each edge. */
export function watermarkSvg(width: number, height: number): string {
  const cap = Math.max(width, height) * TEXT_SHARE;
  const scale = cap / G.capHeight;
  const margin = 2 * cap;
  const x = width - margin - G.width * scale;
  const y = height - margin;
  const edge = (cap * 0.07) / scale;
  const n = (v: number) => Number(v.toFixed(3));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<g opacity="0.75"><path transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})" d="${G.d}" fill="#fff" ` +
    `stroke="#000" stroke-opacity="0.4" stroke-width="${n(edge)}" stroke-linejoin="round" paint-order="stroke"/></g>` +
    `</svg>`
  );
}

/** Burns the mark into an image (already at its final size) and encodes it as a JPEG with no metadata. */
export async function burnWatermark(image: Buffer | Uint8Array, quality: number = JPEG_QUALITY): Promise<Buffer> {
  const { width, height } = await sharp(image).metadata();
  return sharp(image)
    .composite([{ input: Buffer.from(watermarkSvg(width, height)), top: 0, left: 0 }])
    .jpeg({ quality })
    .toBuffer();
}
