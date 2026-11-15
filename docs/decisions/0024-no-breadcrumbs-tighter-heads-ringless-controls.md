# 0024 — No breadcrumbs, no repeated headings, tighter heads, header controls without a ring

Status: Accepted · 2026-11-15 · Owner decision · The fixed space above the title (32 / 44 / 56 px) is replaced by the
mirror rule of [0025](0025-one-page-head.md) · Amends [0016](0016-frontend-pages.md) (page templates) and
[0023](0023-simplification-pass.md) (header controls)

## Owner decisions (2026-11-15)

1. **No breadcrumb, anywhere.** The `.crumb` element is gone from the journal index, the photos index, series pages,
   single photos, About, Now, Rights and Privacy (both languages) and from the page template in `/styleguide`. A `.lab`
   block that held only the breadcrumb is not rendered at all (journal, photos index, series, Now, Rights, Privacy), so
   no empty margin remains; where it had more, the rest stays (the date on a single photo, the portrait and contact on
   About). Nothing replaces it. The `.crumb` rules and the `crumbHome` string are deleted. On a single photo the way back
   is the menu and the "Series" link under the photo.
2. **No heading that repeats the page title.** Photos index: the `h2` "Photos" goes, the count stays, and the series
   names are `h2` (they were `h3`; same look, `.series :is(h2, h3, h4)`). Journal page 1: the `h2` "Journal" goes, the
   note about the language marks stays; page 2 and later keep "Page 2 of 3". Series pages keep their "Photos" `h2`.
3. **Tighter heads** on the journal index, the photos index and the series pages only, through a modifier,
   `.hero--inner` (`.hero.hero--inner`, which beats the base `.hero` at every container width). Home keeps `.hero`
   and every other section keeps `--section-y`.
   - Head padding 32/20 px (phones), 44/28 (tablet, > 40rem), 56/32 (desktop, > 65rem).
   - Top padding of the section that follows (`.hero--inner + .sec`): 32, 40, 48 px.
   - Measured in Chromium, `/journal`, `/photos`, `/photos/lisbon` and `/it/journal` all give: header line to top of
     the h1 box 32 / 44 / 56 px, and bottom of the intro to the top of the section's first element 52 / 68 / 80 px at
     390 / 768 / 1440 px (before: 105 / 125 / 88 and 76 / 100 / 128). "Content of the section" is read as the section's
     first element: the label column on phones and tablets, the label and the content together on desktop.
4. **Header controls without a ring.** At rest only the letters (IT / EN) or the moon / sun show, in the text colour,
   no line and no background. The border is kept as `1px solid transparent` so that Windows high-contrast mode still
   draws an outline (the forced-colors rule gives `.rbtn` a `ButtonText` border). Tap area unchanged: 44 × 44 px on
   phones, 40 × 40 px from tablet up. No gap between the two boxes (`.tools` has none). The group is pulled out by half
   of what the box adds to the 18 px icon (`margin-inline-end: calc((var(--icon) - var(--box)) / 2)`, i.e. −13 px on
   phones, −11 px from tablet up), so the moon or sun ends where the header line ends; checked at 1440, 1024, 768 and
   390 px. Hover: the colour turns to the accent (the border no longer changes). Keyboard focus: the existing 2 px
   focus ring, unchanged. Markup, accessible names, `aria-pressed`, icons and JavaScript are unchanged (public
   JavaScript still 1,525 bytes); still hidden when scripting is off; print rule unchanged. The same change is made in
   `docs/design/Home.dc.html` and `Article.dc.html` (owner's instruction), so the prototypes and the site agree.

## Decided here, not written in the brief

- **Heading levels.** The series names on the photos index became `h2` as asked; the styleguide's own series cards stay
  `h3` because they sit under a styleguide section heading, and the CSS covers both.
- **Single photo.** Its `.lab` keeps only the date, so on tablet and desktop the date sits alone in the label column.
- **Page 2 of the journal** keeps its `h2` ("Page 2 of 3") and `.hero--inner`. There are fewer than 50 entries, so no
  page 2 is built yet; that path is covered by the code, not by an end-to-end test.
- **Specificity.** `.hero.hero--inner` instead of a single class, because the container-query rules for `.hero` come
  later in the same layer and would otherwise win at 65rem and up.
- **/styleguide** never described the controls as round, so only the page template changed there (no breadcrumb); the
  comment above `.rbtn` in `site.css` now says "no ring".
- **Decision numbers.** 0022 (the QA matrix) is still on its own branch.

## Tests

`tests/e2e/breadcrumbs-spacing.spec.ts`: no `.crumb` in the HTML of any page in the sitemap or of the two 404 pages; no
empty `.lab`; no repeated heading and no skipped level; the two distances on `/journal` and `/photos` at 390, 768 and
1440 px (1 px allowed); Home keeps `88px`; the border colour of both controls is transparent in both themes, the
background too, and each is at least 44 × 44 px at 390 px; the controls touch and the icon ends at the header line at
1440, 1024, 768 and 390 px with no overflow; hover and keyboard focus. The existing page matrix (five widths, both
themes, both languages, JavaScript on and off) stays green.
