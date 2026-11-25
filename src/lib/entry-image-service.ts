/**
 * Image service for the photos inside journal entries (Markdown images).
 *
 * Astro's global `image.layout: "constrained"` makes Markdown images responsive
 * (srcset, sizes, width and height, lazy loading, data attributes instead of
 * inline styles) but sizes them from the original: a 4000 px photo would get a
 * 4000 px `width`, srcsets up to 8000 and `sizes` of the whole viewport. This
 * wraps the sharp service and, for those images only (the ones carrying
 * data-astro-image), caps every file at MAX_WIDTH and sets `sizes` to the text
 * column (.prose is 36rem). `<Photo>` passes layout="none", so portfolio
 * photographs are untouched. Output stays WebP, Astro's default.
 *
 * It also makes the large version a click on a photograph opens (decision 0043): `getImage({ watermark: true, ... })`
 * resizes as usual, without loss, and then burns the mark and encodes the JPEG once (src/lib/watermark.ts).
 * `watermark` is one of the properties hashed into the file name, so the large file never takes the name of the
 * unmarked one of the same size.
 */
import sharp from "astro/assets/services/sharp";
import { baseService } from "astro/assets";
import type { LocalImageService } from "astro";
import { burnWatermark, JPEG_QUALITY, LARGE_EDGE } from "./watermark.ts";

/** No file for an entry photo is ever wider than this (tests/unit/photos.test.ts). */
export const MAX_WIDTH = 1600;
export const ENTRY_WIDTHS = [480, 800, 1200, 1600];
/** The text column: 36rem wide from 38rem up, the viewport less a 1rem gutter each side below. */
export const ENTRY_SIZES = "(min-width: 38rem) 36rem, calc(100vw - 2rem)";

type Options = Record<string, unknown> & { width?: number; height?: number; widths?: number[]; sizes?: string };

export function capEntryImage<T extends Options>(options: T): T {
  if (!options["data-astro-image"]) return options;
  // A tall photo 1600 px wide would be longer than LARGE_EDGE, the longest any published file may be (0043).
  const max =
    options.width && options.height
      ? Math.min(MAX_WIDTH, Math.floor((LARGE_EDGE * options.width) / Math.max(options.width, options.height)))
      : MAX_WIDTH;
  const widths = ENTRY_WIDTHS.filter((w) => w < max);
  const out: Options = { ...options, widths: [...widths, max], sizes: ENTRY_SIZES };
  delete out["densities"];
  if (out.width && out.width > max) {
    if (out.height) out.height = Math.round((out.height * max) / out.width);
    out.width = max;
  }
  return out as T;
}

const base = sharp as LocalImageService;

const service: LocalImageService = {
  ...base,
  async validateOptions(options, imageConfig, logger) {
    const capped = capEntryImage(options as Options) as typeof options;
    const validated = base.validateOptions ? await base.validateOptions(capped, imageConfig, logger) : capped;
    return capEntryImage(validated as Options) as typeof validated;
  },
  propertiesToHash: [...(baseService.propertiesToHash ?? []), "watermark"],
  async transform(input, transform, config, logger) {
    if (!transform["watermark"]) return base.transform(input, transform, config, logger);
    const { data } = await base.transform(input, { ...transform, format: "png", quality: undefined }, config, logger);
    return { data: await burnWatermark(data, Number(transform.quality ?? JPEG_QUALITY)), format: "jpeg" };
  },
};

export default service;
