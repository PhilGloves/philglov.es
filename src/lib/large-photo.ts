/**
 * The address of a photograph's large version (decision 0043): a watermarked JPEG, LARGE_EDGE px on its long edge at
 * most, made at build time by the image service (src/lib/entry-image-service.ts) and cached by Astro with the other
 * outputs. Only for an original with a record in meta.json: a grey stand-in has none (BUG-6), so it gets no link.
 */
import { getImage } from "astro:assets";
import { originals, records } from "./photo-meta.ts";
import { JPEG_QUALITY, largeSize } from "./watermark.ts";

/**
 * The address of the large file. Never read the original's own `src`: Astro then copies the original itself into
 * dist (tests/unit/photos.test.ts proves no file there is longer than LARGE_EDGE).
 */
export async function largePhoto(key: string | undefined): Promise<string | undefined> {
  const load = key && records[key] ? originals[key] : undefined;
  if (!load) return undefined;
  const image = (await load()).default;
  const img = await getImage({
    src: image,
    format: "jpeg",
    layout: "none",
    width: largeSize(image.width, image.height).width,
    quality: JPEG_QUALITY,
    watermark: true,
  });
  return img.src;
}
