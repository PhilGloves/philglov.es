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
 */
import sharp from "astro/assets/services/sharp";
import type { LocalImageService } from "astro";

/** No file for an entry photo is ever wider than this (tests/unit/photos.test.ts). */
export const MAX_WIDTH = 1600;
export const ENTRY_WIDTHS = [480, 800, 1200, 1600];
/** The text column: 36rem wide from 38rem up, the viewport less a 1rem gutter each side below. */
export const ENTRY_SIZES = "(min-width: 38rem) 36rem, calc(100vw - 2rem)";

type Options = Record<string, unknown> & { width?: number; height?: number; widths?: number[]; sizes?: string };

export function capEntryImage<T extends Options>(options: T): T {
  if (!options["data-astro-image"]) return options;
  const out: Options = { ...options, widths: ENTRY_WIDTHS, sizes: ENTRY_SIZES };
  delete out["densities"];
  if (out.width && out.width > MAX_WIDTH) {
    if (out.height) out.height = Math.round((out.height * MAX_WIDTH) / out.width);
    out.width = MAX_WIDTH;
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
};

export default service;
