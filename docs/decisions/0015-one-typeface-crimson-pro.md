# 0015 — One typeface, Crimson Pro, two files, 80 KB

Status: Accepted · 2026-11-12 · Owner decision (new guide and prototypes) · Supersedes the typography parts of
[0014](0014-design-system.md): the three families, Archivo's width axis, the 135 KB budget and the "PG Serif" rename ·
Source: docs/guide.md ("Typography", "Performance budget", prompt 2), prototypes in docs/design/

0014 stays as the record of how the first typography was built and why. Everything else in 0014 (one stylesheet,
layers, tokens, container queries, brand, print, admin, view transitions) still stands.

**Decision.**

- **One family: Crimson Pro** (SIL OFL 1.1), self-hosted as two variable WOFF2 files, Latin subset (English and
  Italian: à è é ì ò ù, curly quotes, dashes, `·`, `€`, plus Latin Extended-A):
  `crimson-pro.woff2` (upright, weight 300–600) and `crimson-pro-italic.woff2` (italic, weight 300–400).
  **65,780 bytes (64.2 KiB) against the 80 KB cap**; the guide predicted about 66 KB.
- **Font budget: ≤ 2 files and ≤ 80 KB** (CLAUDE.md rule 8, `tests/unit/fonts.test.ts`). The 120 KB budget of the
  first typography and the 135 KB owner ruling of 2026-11-12 (0014) no longer apply.
- **Roles.** Light 300 only at 28 px and larger (home statement, entry titles, reply heading, pull quotes in italic,
  article subheadings from 28 px, the 404 numeral, admin titles); Regular 400 for text and interface; 600 for emphasis,
  index numbers and buttons. Small labels are the same face, 16 px, muted, with tabular figures; column headings are
  13.5 px, 600, uppercase, tracked 0.1em (there are no small caps). `tests/unit/fonts.test.ts` fails if a weight-300
  rule is below 28 px. Sizes: interface 19 px (18 px on phones), reading text 22 px (20 px on phones) at line height
  1.5, measure 36rem (about 66 characters), titles `clamp(2.5rem, 4.6cqi, 4rem)`, latest-entry title 42 px
  (32 px on phones). `font-synthesis: none`, so a missing weight is never faked.
- **No monospace or sans-serif web font.** Code (`pre`, `code`, `kbd`, print link addresses) uses the system
  monospace stack `--font-code`. The `.mono` class is gone; metadata uses `.fine`.
- **Preload only the upright file.** The italic is fetched when italic text is on the page (`tests/e2e/typography.spec.ts`
  checks that the home page requests the upright file only).
- **Fallback.** The guide's stack (Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif) with two
  size-adjusted fallback faces: Palatino (size-adjust 89.7 %, ascent 99.9 %, descent 23.9 %) and Georgia (90.7 %,
  98.8 %, 23.7 %), measured from letter-frequency-weighted advance widths by `scripts/build-fonts.py`. Iowan Old Style
  (Apple) could not be measured on this machine and shares the Palatino numbers; re-measure on a Mac if a shift shows.
- **Source, pinned and rebuildable.** `google/fonts` commit `c30b221beb0c1da59d563feb91ec8656a1fa972a` (the same
  commit as 0014), SHA-256 of both TTFs and of the licence recorded in `scripts/build-fonts.py`, which holds the exact
  steps (fontTools 4.68.0: instance the weight axis to 300–600 / 300–400, subset to the Unicode ranges above with the
  features `kern liga ccmp locl tnum` and no hinting, save as WOFF2). `crimson-pro-OFL.txt` sits next to the fonts and
  each file keeps its copyright (name 0), trademark (7) and licence (13, 14) strings; the unit test reads them out of
  the WOFF2.
- **No rename.** Crimson Pro declares no Reserved Font Name: not in `OFL.txt`, and not in the font's own copyright
  string (the check that caught Source Serif 4, whose name table reserved "Source" although its `OFL.txt` on
  google/fonts did not). The family keeps its name. The test fails if a reserved name ever appears in a font here,
  which would mean renaming the subset as 0014 did.
- **Arrows are one inline SVG.** Crimson Pro has no arrow glyphs (checked: no U+2190–2193, no U+21A9). `Arrow.astro`
  draws a right arrow (left with `arr--left`); `Arrows.astro` renders a string containing `→` or `←` with the SVG, so
  strings in `src/i18n` can keep their arrows as data. It is used after links, in the IT→EN marker and in previous/next.
  `css.test.ts` fails if an arrow character appears in a template outside `<Arrows>`; the e2e test checks that none is
  drawn on `/styleguide`. Footnote back-links come from remark (`↩`): configure `remarkRehype.footnoteBackContent` when
  the entry template is built (ticket F2), or the browser will draw that one glyph from a system font.
- **Grid gap.** At 640 px and below the 12-column grid uses a 16 px gap, 32 px above (`--col-gap`), as the prototypes
  now do to fix a phone-width overflow. In this stylesheet the grid is a single column on phones, so the gap matters
  for the header and any future multi-column grid; no page scrolls sideways from 1440 down to 320 px.
- **Phone label separator.** On phones the "·" between the language label and its link is hidden, as in the
  prototype.
- **Share image and print.** The share-image template is set in Crimson Pro Light (92 px) with the name in 600; the
  print stylesheet sets entries in Crimson Pro at 12 pt with link addresses in the system monospace.

**Reason.** The owner chose one calm serif with light titles over three families: less to download (64 KiB instead of
128), one voice for text, interface and metadata, and no width axis to pay for.

**Rejected.** Keeping Archivo for interface and headings (the owner's new design has no sans-serif); static instances
instead of variable files (two files are smaller and cover every weight); inlining the arrow as a glyph from a
fallback font (it would differ on every platform).

**Still open.** Turning the share-image SVG into the PNG that social networks need is a build step still to choose
(0014). A real iOS 15 and a Mac check of the Iowan Old Style fallback belong to QA.
