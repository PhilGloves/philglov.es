# 0025 — One page head: mirror spacing under the header, one title size, one intro sentence

Status: Accepted · 2026-11-15 · Owner decision · Amends [0016](0016-frontend-pages.md) (page templates),
[0023](0023-simplification-pass.md) (Home) and [0024](0024-no-breadcrumbs-tighter-heads-ringless-controls.md) (the fixed
space above the title)

Goal: every page starts the same way. The same space under the header line, the same title size, the same intro
sentence, the same space before the content.

## Owner decisions (2026-11-15)

1. **Home.** "Photographer and developer" (`heroRole`) is gone in both languages. "Based in [City]. Writing in English
   and Italian." stays. `heroKick` ("Filippo Guanti — journal, photographs, notes") is no longer visible but stays inside
   the `h1` as `<span class="sr-only">`, so the home heading still contains the name for search engines and screen
   readers. No new strings; the `.kick` styles are deleted.
2. **Mirror spacing under the header line**, on every public page: the distance from the header line down to the top of
   the capitals of the first line of text equals the distance from the baseline of the menu words up to the header line.
   Tolerance 2 px, checked at 390, 768, 1024 and 1440 px, in both languages, on Home, Journal, Photos, series pages,
   single photos, Now, About, Rights, Privacy, entries and the 404. The header itself is unchanged.
3. **On desktop** whatever stands in the left column of a head (the "Based in" line on Home, the portrait on About, the
   date on a single photo, the big "404") starts level with the top of the capitals of the title, within 2 px.
4. **One title size.** The `h1` of Now, About, Rights, Privacy, entries and single photos is the same size as the `h1`
   of Journal and Photos at every width: 40 px at 390 and 768, 47.1 px at 1024, 64 px at 1440. Weight, line height and
   letter spacing are unchanged.
5. **One intro sentence.** The sentence under the title on Now, About, Rights and Privacy is the `.lede` of Journal and
   Photos: 20 px on phones, 22 px from tablet up, line height 1.45, 28 px under the title, the same maximum width (six of
   the twelve columns on desktop). Rights and Privacy keep their "originally written in" label between the title and
   the intro. The text starts 52 / 68 / 80 px (phone / tablet / desktop) under the intro, as the list does on Journal and
   Photos. On About on phones and tablets the portrait stays between the intro and the text: 28 px under the intro, the
   text 52 / 68 px under the portrait block. Entries have no intro: the text keeps its distance under the title
   (24 / 32 / 40 px).

## How it is built

- **The rule in CSS** (`site.css`, "page heads"). `--menu-gap` is how far the menu words' baseline is above the header
  line: 41 px on phones, 33 px on tablets, 42 px on desktop (measured: the header's own padding and the links' tap
  boxes). `--cap-title` is what the title's line box puts above its capitals: `(line-height / 2 − --cap-k) × font size`.
  A page whose title comes first gets `padding-block-start: --menu-gap − --cap-title`, so the capitals land exactly
  `--menu-gap` under the line at every width, not only at the four checked ones (the title grows between 1040 and
  1440 px, and so does the space its line box puts above its capitals). `--cap-k` (0.245) is where Crimson Pro puts its
  capitals, measured with a canvas in Chromium; `--cap-k-err` (0.235) is the same for the 192 px "404".
- **A small line first** (Home's "Based in", the 404's "404") on phones and tablets: the same rule with that line's own
  `--lab-cap`, which is 7.7 px for the 16 px line (`.small`, line height 1.45) and, for the 404, whose line height is
  now 0.75 so that the digits sit inside their line box at every width.
- **Left column on desktop**: `margin-block-start: --cap-title − --lab-cap` on `.hero > .lab` and `.top > .lab`. The
  portrait has `--lab-cap: 0`, so its top edge is level with the capitals.
- **Titles are direct children of the grid.** `--fs-display` uses a container-width unit (`cqi`), which measures the
  nearest container: inside a `.con` that is the 9-column content area, hence the 42 px titles on desktop. A registered
  property (`@property`) was tried and does not help: Chrome keeps the unit unresolved until the use site. So the
  title, the label and the intro of Now, About, Rights, Privacy, and the title of entries and single photos are now
  direct children of `.g` (as the title of Journal and Photos already was), placed in columns 4–12 on desktop.
- **Now, About, Rights, Privacy** use one grid (`.top.top--intro`) for the head and the text, so that on About the
  portrait (`grid-row: 1 / span 3`) stands beside both on desktop: the text starts 80 px under the intro there too, not
  under the portrait. On phones and tablets the portrait sits between them (28 px under the intro, `--head-end` above the
  text). `--head-end` is 52 / 68 / 80 px, the same sum as `.hero--inner` plus the section after it.
- **Single photo**: the title, the photograph block and the date are siblings in one grid; on phones the date still
  comes last, on desktop it stands beside the title.
- **Entries**: the title is the only thing in the head, so `.top` keeps its bottom padding (24 / 32 / 40 px).

## Decided here, not written in the brief

- **Home keeps its bottom spacing** (32 / 44 / 56 px from the intro to the photograph): the brief's "same space before
  the content" lists Now, About, Rights, Privacy, Journal and Photos only. The 404 likewise.
- **Menu-gap values** are 41 / 33 / 42 px (measured here with a canvas; the owner's figures were 40 / 33 / 41, one pixel
  less, which the 2 px tolerance covers either way). The padding is therefore computed, not the fixed 28 / 20 / 24 px
  of the brief, because the title is 40 to 64 px between 390 and 1440 and a fixed padding drifts by up to 5 px.
- **404**: its "404" is the first line of text. To keep the rule at 768 px (where it is 169 px tall) its line height is 0.75
  instead of 1; the layout below it shifts up by the difference.
- **`jobTitle` in the Person JSON-LD** ("Photographer and developer", `src/data/site.json`) stays: it is for search
  engines, not a visible line, and the SEO section of the guide asks for it.
- **About on desktop**: the text beside the portrait (see above), so the 80 px holds there.
- **Decision numbers**: 0022 (the QA matrix) is still on its own branch.

## Tests

`tests/e2e/page-head.spec.ts` (measuring with `tests/e2e/head-metrics.ts`, which reads the baseline and the capitals'
top from the font itself, not from the box): the mirror rule on 20 pages in both languages and the 404, at four widths;
the left column level with the capitals at 1440, 1280 and 1100 px; one title size, weight, line height and letter
spacing on seven kinds of page at four widths; one intro style on Journal, Photos, Now, About, Privacy and `/it/now`,
28 px under the title; the text 52 / 68 / 80 px under the intro (About with its portrait); the entry's 24 / 32 / 40 px;
Home without "Photographer and developer" and with the name in a `.sr-only` span inside the `h1`, in both languages.
`tests/e2e/breadcrumbs-spacing.spec.ts` lost its fixed 32 / 44 / 56 px and the Home 88 px; the 52 / 68 / 80 px stay.
