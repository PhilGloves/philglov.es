# 0042 - Redline pass: spacing on the 4 px grid, fewer sizes, an upright statement

Owner decision, 2026-11-25. The owner approved a redline pass of the live home page, which was first shown as a private
story page with three steps. Everything else in the design stays as it was: the grid, the moss band, the No. / language
marks and the owner's texts.

- **Spacing.** The home page's gaps are now multiples of 4 px: latest entry meta 14 → 16 (gap 18 → 16), excerpt 14 → 16,
  "Full index" 22 → 24, Now band text 14 → 16, footer text 10 → 12, footer links 2 × 18 → 4 × 16 and 14 → 16 below. From
  40rem up, the Now band uses 72 px top and bottom, the same as a section (64 before). The footer uses 56 px top and bottom
  (48 / 56 before). The odd spacing tokens stay in `tokens.css` because other pages still use them.
- **Type.** The latest entry's title is weight 300, following the site's own rule (300 from 28 px up). The excerpt and the
  footer links use 19 px, the interface size (20 and 18 before). "philglov.es" under the name and the header's IT/EN use
  16 px, the small size (15 before). `.lab` headings use 22 px, the site name's size (23 before).
- **Emphasis.** The home statement's `<em>` is upright and moss. The colour already marks the phrase. The rule under the
  latest entry uses `--rule`, like every other hairline.
- **Fonts.** Home no longer draws italic text, so nothing preloads the italic file and `BaseLayout` loses
  `preloadItalic`. This amends the second half of 0025. The italic face stays `font-display: optional` for entries and
  pages that use `_emphasis_`. Home's first visit is about 29 KB lighter.

`docs/guide.md` says so now, on the owner's word: the home statement is upright (Typography, "Titles"), and the italic
is preloaded nowhere (fonts line and budget table).

Tests: `tests/unit/fonts.test.ts` (no italic preload; `--latest-title` counted for the weight-300 rule),
`tests/e2e/typography.spec.ts` (Home loads only the upright file; its `<em>` is upright), `tests/e2e/pages.spec.ts` (the
italic 404 check uses the sample entry, which has italics). The visual baselines are regenerated.
