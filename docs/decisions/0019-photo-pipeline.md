# 0019 — Photo pipeline: originals in R2, Astro `<Picture>`, rights written after the build

Status: Accepted · 2026-11-13 · Ticket group P (P1–P6) · Builds on [0005](0005-r2-photo-originals.md)

**Context.** Photos must look as good as the camera made them and still load on a bad connection, with no third-party
requests, no inline styles (CSP) and no location data in any published file. The originals live only in the private
R2 bucket; the repository holds `photos.json` per series.

**Decision.**

1. **Fetch.** `scripts/fetch-originals.ts` (also `pnpm photos:fetch`) reads `photos.json` and the entries, and
   downloads what is missing into the git-ignored `src/.originals/`: series photos from R2 `photos/<series>/<file>`,
   entry photos from `<slug>/<file>` (the key the phone page already writes; `photos` is a reserved slug, so they
   cannot collide). It signs requests with AWS Signature V4 over `node:crypto` against the EU endpoint, so no SDK
   dependency, and is checked against AWS's published test vector. No credentials (laptop, fork): it does nothing, and
   the pages draw the tone placeholders. CI caches `src/.originals` and `node_modules/.astro` (Astro keys its resized
   outputs by file hash), so build time grows with new photos only.
2. **Analyse.** `scripts/photo-meta.ts` (first step of `pnpm build`) records per original, keyed by SHA-256: displayed
   size, dominant colour (sharp `stats().dominant`) and camera data (exiftool, printed values). Output: git-ignored
   `src/.originals/meta.json` and `src/styles/photo-colours.generated.css`, one unlayered rule `.c-<hex>{background}`
   per colour. The image box gets that class: a placeholder without inline styles and without script. `photos.json`
   `exif` overrides what the file says.
3. **Render.** `Photo.astro` uses Astro's `<Picture>`: AVIF + WebP + JPEG, widths 480/800/1200/1600/2400, `sizes` from
   `src/lib/photo-sizes.ts` per layout, width and height always set, `loading="lazy"` except the one `priority` image
   per page (eager + `fetchpriority="high"`). Photos with `art` in `photos.json` get one `<source media>` per
   breakpoint (mobile ≤ 40rem, tablet ≤ 65rem, desktop), each either another original (`file`) or a ratio crop around
   a side or corner (`ratio`, `position`). Focal points other than sharp's gravity words are not supported.
4. **Rights.** `scripts/photo-rights.ts` runs after `astro build`: exiftool writes XMP and (JPEG) IPTC Creator,
   Copyright Notice (`© <year> Filippo Guanti. All rights reserved.`), Credit, Web Statement of Rights
   (`https://philglov.es/rights`) and `plus:DataMining` = `…DMI-PROHIBITED-EXCEPTSEARCHENGINEINDEXING` into every
   output image, clears GPS, then reads every file back and fails the build if one has GPS or no notice. The year is
   the series `takenAt`, else the EXIF year, else the build year. exiftool is installed in CI; the step fails (not
   skips) when images exist and exiftool is missing.
5. **Photo page.** `ratio="auto"`: the picture keeps its own proportions at the largest sensible size, with caption,
   alt text, camera data (`.exif`, small muted text) and previous/next links. No keyboard shortcuts (they need script).

**Not done, deliberately.**

- _Dark backdrop for photo pages (P7):_ needs the designer's approval first.
- _Entry photos get Astro's own Markdown image output_ (one resized WebP `<img>`, width/height, lazy), not the
  AVIF/WebP/JPEG `<picture>`: Astro offers no hook to swap Markdown images for `<picture>` without MDX or a custom
  renderer. Rights metadata is still written to them. Revisit with a rehype step if entry photos become common.
- _Frontmatter art direction for pages_ (the home hero uses the first series photo, so its crops live in `photos.json`).

**Rejected.** Responsive images via Astro's `layout` option (it emits an inline `<style>`, which the CSP blocks);
sharp's `withXmp` (no AVIF); an S3 SDK (dependency cap); blur-up placeholders (script); writing the colour as a style
attribute (CSP).

**Dependencies.** `sharp` (0.35.5, the version Astro already installs) moved to a direct dependency: the colour
analysis and the tests import it. Runtime dependencies: astro, jose, sharp.
