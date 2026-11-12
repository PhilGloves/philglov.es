# 0014 — Design system: one stylesheet, tokens, container queries, pinned fonts

Status: Accepted · 2026-11-12 · Design agent (D1–D12) · Source: docs/guide.md ("Design system", "Accessibility
requirements", prompt 2), prototypes in docs/design/

**Decision.**

- **One CSS file**, `src/styles/site.css`, imports `src/styles/tokens.css` and is built into one `/_assets/*.css`
  (6.4 KB brotli, 7.1 KB gzip; budget 20 KB). Layers in this order: `reset, tokens, base, layout, components,
utilities`. Rules at the top of the file; `tests/unit/css.test.ts` enforces the mechanical ones (no `!important`, no
  ID selectors, no raw colours, logical properties only, no viewport `@media` except user preferences / scripting /
  print, size budget, no inline styles in templates).
- **Themes without light-dark().** Light is the default, `prefers-color-scheme` decides until the theme script writes
  `data-theme` on `<html>`. Dark tokens are written twice (media query + attribute). `light-dark()` would halve that
  but is unsupported before Safari 17.5 / iOS 15, which the guide asks us to test. The attribute works on any element,
  which is how `/styleguide` shows both themes side by side. Every pair is measured by `scripts/contrast.ts`
  (`node scripts/contrast.ts`); `tests/unit/tokens.test.ts` fails if one drops below its floor or if the table in the
  `tokens.css` comment drifts from the real numbers. Rendered check: 1,742 text nodes on `/styleguide`, both themes,
  1440 and 390 px, 0 below 4.5:1.
- **Container queries, mobile first.** `<body>` is the container `page` (header, hero, section grid, anything that
  depends on whether the label column sits beside or above its content; tiers at 40rem and 65rem = the prototypes'
  640 and 1040 px). `.con` / `.cq` are containers `content` (journal table, photo grid, forms, comments,
  previous/next, which depend on the room they have). Browsers without container queries get the phone layout at every
  width. Viewport `@media` is used only for the root font size (an element cannot query its own container; 17 px →
  16 px under 640 px), user preferences, `(scripting: none)` and print. Note: in the prototypes the "16 px on phones"
  rule targeted the container itself and never applied; it applies now.
- **Spacing and type tokens are named by pixels** (`--sp-14`, `--fs-19`), in rem. Mostly multiples of 4; 14, 18, 22 and
  28 are kept because the prototypes use them and the build should match them.
- **Theme toggle.** The script (ticket F1) only sets `data-theme` on `<html>` and `aria-pressed` on
  `.theme-toggle`. With scripting off the button is hidden (`@media (scripting: none)`).
- **Photos.** `.frame` holds a placeholder or a `<picture>`; a ratio class on the frame (not the image) prevents
  layout shift whatever crop the source has. Placeholder colour is one of twelve fixed `.tone-1 … .tone-12` classes
  (the photo pipeline picks the nearest), so no per-photo style attribute is ever needed.
- **View transitions** are CSS only (`@view-transition`), off under reduced motion. The header keeps its own name so
  only `main` fades. A photo hovered/focused/pressed in a grid gets `view-transition-name: photo-open`, which the big
  photo on the single-photo page always has, so one morphs into the other without per-photo names.
- **Print** (same file, `utilities` layer): no header, footer, forms, previous/next; black on white; Source Serif;
  `http(s)` and root-relative link addresses written after links.
- **Admin** (`.admin`, `.admin-bar`, `.card`, `.actions` …): same tokens, 18 px base, 56 px buttons, 2 px dark
  borders, no faded text. Demonstrated in `/styleguide`; the Worker's pages (B4, B8) only need the classes.
- **Brand** is behind `src/assets/brand/brand.config.ts`: moss rounded-square favicon (SVG, 32 px PNG), a full-bleed
  180 px apple-touch-icon, and a 1200×630 share-image SVG template with a pure fill function (`share-image.ts`, unit
  tested). Icons are imported, so they ship hashed under `/_assets/` and `public/favicon.svg` is gone.

**Fonts: pinned, rebuildable, renamed where the licence requires.**

- Sources: `google/fonts` at commit `c30b221beb0c1da59d563feb91ec8656a1fa972a` (2026-11-11), never `main`, each file
  checked against a SHA-256 in `scripts/build-fonts.py`, which also holds the exact instancing and subsetting steps
  (fontTools 4.68.0: narrow or pin axes, Latin + Latin Extended-A + the punctuation and arrows in use, only the layout
  features in use, no hinting, WOFF2). Re-run it by hand only when the fonts change; the output is committed.
- Each font's `OFL.txt` sits next to it in `public/_assets/fonts/`, and every file keeps its copyright (name 0),
  trademark (7) and licence (13, 14) strings; `tests/unit/fonts.test.ts` reads them out of the WOFF2 files.
- **Source Serif 4 declares the Reserved Font Name "Source"** in its own copyright string (the OFL.txt on google/fonts
  omits it, so the file has to be read, not just the licence text). The subsets are therefore named **"PG Serif"**
  inside the files and in the CSS; the copyright line is untouched. Archivo and JetBrains Mono declare none. The test
  fails if "Source" reappears in a family name or in the CSS.
- **Size and the width axis (owner ruling 2026-11-12: budget 135 KB, not the guide's 120 KB).** Shipped: Archivo
  about 60 KB, PG Serif 35 KB, PG Serif Italic 21 KB, JetBrains Mono 16 KB = **128 KiB** in 4 files. Source Serif's
  optical size is pinned at 20 (that axis alone cost about 50 KB); Archivo keeps weight 400–700 and width 100–110 %.
  Measured options for Archivo with the same other files:

  | Archivo                                     | Archivo size | Total of four |
  | ------------------------------------------- | ------------ | ------------- |
  | width pinned 100, weight 400–700            | 35 KB        | 106 KB        |
  | **width 100–110, weight 400–700 (shipped)** | about 60 KB  | about 131 KB  |
  | width 75–110, weight 400–700                | about 85 KB  | about 157 KB  |

  The prototypes use width 110 % (home statement, entry titles), 108 % (latest title, pull quote, headings) and 75 %
  (the numerals 001, 042). The first two now render as designed; the condensed numerals do not (the
  `font-stretch: 75%` declaration clamps to 100 %), because the 75 % end costs about 25 KB more. The budget figure
  in `CLAUDE.md` rule 8 and `tests/unit/fonts.test.ts` is 135 KB; `docs/guide.md` still says 120 KB (it is never
  edited), so the owner ruling in CLAUDE.md is the current figure.

- Fallback faces (`Archivo Fallback` with one face for width 100 and one for 110, `PG Serif Fallback`, `JetBrains Mono Fallback`)
  are size-adjusted from measured advance widths against Arial, Georgia and Consolas. The script prints the numbers; re-measure when fonts change.

**Rejected.** A CSS framework; `light-dark()` (iOS 15); viewport media queries for layout (the brief asks for
container queries); one stylesheet per page type (budget is far away and one file is cached once); per-photo
generated classes (a fixed tone palette is enough); a hamburger menu (the four links fit at 320 px).

**Open.** Turning the share-image SVG into the PNG that social networks need is a
build step still to choose: it needs an SVG rasteriser with Archivo available (a new dependency, or the Chromium that
Playwright already installs). Nothing in the repository depends on it yet.
