# 0043 - A click on a photograph opens a watermarked 2400 px JPEG; the originals stay private

Owner decision, 2026-11-25. Builds on [0005](0005-r2-photo-originals.md), [0019](0019-photo-pipeline.md) and
[0028](0028-fix-round-2-frontend.md).

**Decision.** A visitor can click a photograph to see it large: the photo on a series photo page (`PhotosView`, the
single-photo page) and each photo inside a journal entry (`EntryView`). The About portrait and the thumbnails of the
home page and the series pages are not linked: they already lead to a photo page.

- **What the click opens.** A "large version" of that photo, never the original: a JPEG, 2400 px on its long edge
  (smaller when the original is smaller; never enlarged), quality 78 like every other JPEG. Only this file carries a
  small watermark, "© Filippo Guanti", in the bottom right corner, two text heights in from each edge: white at 75 %
  opacity over a thin dark edge, so it reads on light and dark photos, with capitals 1.2 % of the long edge high (29 px
  at 2400). The images in the pages stay unmarked.
- **How it is made.** At build time, by the site's image service (`src/lib/entry-image-service.ts`): `getImage` with
  `watermark: true` (`src/lib/large-photo.ts`) resizes as usual without loss, then `src/lib/watermark.ts` burns the
  mark with sharp and encodes the JPEG once. `watermark` is hashed into the file name, so Astro caches the file with
  the other outputs and it never takes the name of an unmarked file. The text is drawn from the outlines of Crimson
  Pro Regular (`src/lib/watermark-glyphs.ts`, made by hand with `scripts/build-watermark.py` from the site's own font
  file), never a system font, so every machine burns the same pixels. No script, no canvas, nothing in the browser.
- **Where it lives.** `scripts/postbuild.ts` moves the large files to `/_assets/large/` and points the links there,
  because Cloudflare's `_headers` cannot match by file name and caps the number of rules: one rule,
  `/_assets/large/*`, gives them `X-Robots-Tag: noindex, noai, noimageai` in every environment, production included.
  They are files, not pages, so the sitemap never lists them.
- **Rights.** The large files are JPEGs in `dist/_assets/` when `scripts/photo-rights.ts` runs, so they get the same
  copyright fields and the same proof (notice present, no GPS) as every other published photo. The step also reads
  every large version a page links to and fails the build when one is missing or longer than 2400 px.
- **The original stays private.** No file in `dist` is longer than 2400 px on either side
  (`tests/unit/photos.test.ts`). That test found that a tall photo's largest page image was 2400 × 3600; `<Photo>` and
  the entry photos now cap the long edge too. The large version never reads the original's own `src`: Astro would
  then copy the original into `dist`.
- **In the page.** A plain link around the photo, opening in the same tab; no lightbox and no JavaScript (0005), so
  the 1,536-byte budget and the CSP are unchanged. Its name is the alt text, then the link text in a visually hidden
  span: "Open the large version" / "Apri la foto" (the owner's words). The link is a block, so its focus ring has a
  box (0028), with a zoom-in cursor. In an entry, `src/components/EntryPhotoLinks.astro` finds each photo's `<img>` by
  the name Astro gives every output of an original and wraps it. A placeholder or a grey stand-in (BUG-6) has no
  record in `meta.json` and gets no link.

**Why.** A large view is what a visitor of a photography site expects, and it must work without script. The watermark
deters casual reuse (a screenshot posted without credit carries the name) but does not prevent copying: anyone can
crop it out or take the page images. What protects the work is the rights metadata, the published terms and keeping
the originals private, which this does not change. A 2400 px JPEG is enough to look at on any screen and not enough
to print large.

**Rejected.** A lightbox (JavaScript, 0005). Watermarking in the browser with a canvas (script, and the unmarked file
would still be served). Linking the original (print quality and full metadata, 0005). A system font for the mark (each
machine would draw different pixels). One `_headers` rule per large file (Cloudflare caps the number of rules).

**Cost.** Adding `watermark` to the hashed properties renamed every generated image once, so the first build after
this change regenerates the image cache.

Tests: `tests/unit/photos.test.ts` (size rule, the mark's place, height and readability on light and dark, same bytes
every time, no file in `dist` over 2400 px, every large link and its file, the mark in the large file only, nothing
in the sitemap; tall entry photos), `tests/unit/headers.test.ts` and `tests/unit/build-output.test.ts` (noindex for
`/_assets/large/*`), `tests/e2e/large-photo.spec.ts` (with JavaScript on and off: name, block, cursor, focus ring,
Enter opens the JPEG in the same tab with noindex; no link on Home, a series page or About).
