# 0028 — Fix round 2 (frontend and design): text that wraps, focus, names, contrast, sitemap, one stylesheet, the theme button, favicon, originals

Status: Accepted · 2026-11-16 · Owner request (fix round 2 of 3) · Amends 0014, 0019, 0023 and the guide's accessibility checklist

**Context.** Round 2 takes the frontend and design findings of `QA-REPORT.md`, `docs/qa/bug-reports.md`, the independent
second opinion (SO-04 to SO-08, SO-10) and the third review (TO-02, TO-03). Each fix has a test that failed before it;
the expected-failure markers of BUG-1, -2, -3 and -5 are removed.

## Decisions

**1. Text a person writes never widens the page (BUG-5, SO-04).** `main { overflow-wrap: anywhere }` in the base layer.
The cause was not only that long strings did not break: grid items, flex items and table cells take their minimum width
from the longest unbreakable string (`min-content`), and `anywhere`, unlike `break-word`, lowers that minimum too, so
the comment grid, the title, the index table and the previous/next links all give way. Two exceptions say
`overflow-wrap: normal`: the index table's number, date, language and minutes columns and its headings, and the 404
code (`.err-code`), which is a fixed numeral that otherwise wrapped to "40 / 4" (the visual test caught it).
_Rejected:_ a list of selectors (one more kind of text, one more overflow); `word-break: break-all` (breaks ordinary
words); `hyphens` (the language of a comment is not known to the CSS).

**2. Focus on photographs (BUG-2).** The link around a photograph was an inline box with a block (the `.frame`) inside;
an outline needs a box of the link's own and had none. `a:has(> .frame) { display: block }` covers the home page, the
series grid, a series card and the photo pages. The keyboard test now also covers `/photos` and `/it/photos/lisbon`.

**3. The language switch's name (BUG-1).** `aria-label="IT, Italiano"` / `"EN, English"`: it starts with the visible
text (WCAG 2.5.3) and still names the language in full. The note for a page with no twin follows it.

**4. AAA contrast (BUG-3, SO-08).** The smallest change that reaches 7:1, in the light theme only (dark already passes):
`--muted` #5B5B57 → **#565652** (6.58 → 7.11:1 on the page colour) and `--band-text` #F4F6EE → **#FAFCF4** (6.69 →
7.04:1 on the moss band; the band colour #4A5D23 is the brand's accent and does not move). `muted` is changed itself, not
split into a second grey, because the footnotes, sign-off and facts are the same muted text as the captions, and the
change is three units of one channel. `scripts/contrast.ts` now holds "muted on bg" and "band-text on band" to 7
(`tests/unit/tokens.test.ts` proves it). Both prototypes in `docs/design/` carry the new values (owner instruction).
`docs/guide.md` still lists the old hex values in its colour table; it is the owner's and was not edited. The share
image template's small "philglov.es" line keeps #5b5b57 (a drawn picture, not page text).

**5. Previous/next language (SO-06).** The `lang` attribute moves from the whole link to the `.v` span that holds the
entry's title, only when that entry is in the other language. "Previous · No. 001" is in the page's language.

**6. The sitemap lists the paginated journal (SO-07).** The list of URLs is now a pure function, `sitemapUrls`
(`src/lib/sitemap-urls.ts`), of the content; `feeds.ts` reads the collections and calls it. `/journal/page/N` for
N ≥ 2 is listed in both languages as a pair with hreflang, as many pages as `paginate` makes. Tested with a synthetic
collection of 50, 51 and 101 entries (`tests/unit/sitemap-urls.test.ts`).

**7. One stylesheet per page (SO-10).** `vite.build.cssCodeSplit: false` bundles the generated photo colours
(`src/styles/photo-colours.generated.css`) into the main file. A unit test counts stylesheet links on every page and
files in `dist/_assets`.

**8. The theme button without `aria-pressed` (SO-05; owner decision, amends the guide's checklist).** The pressed state
followed the system theme only if a script listened for changes, and round 1 left 1 byte of the 1,536. Instead of
spending bytes, the button holds two visually hidden labels, `Switch to dark theme` and `Switch to light theme`; the
same CSS that swaps the moon and the sun (stored choice first, then the system) shows one, so the name says what the
button will do, and it follows a change of the system theme with no script at all. `aria-pressed`, the fixed
`aria-label` and the two lines of `theme.js` that wrote the state are gone. The guide's checklist item "Theme toggle is
a `<button aria-pressed>` with a text label" now reads: a button whose accessible name says what it does and changes
with the theme. Public JavaScript is **1,410 of 1,536 bytes** (730 inline + 680 for the form script).
_New Italian strings (placeholders for the owner to rewrite by hand):_ `themeToDark` "Passa al tema scuro",
`themeToLight` "Passa al tema chiaro". The English ones: "Switch to dark theme", "Switch to light theme". The old
`themeToggle` strings ("Dark theme", "Tema scuro") are removed.

**9. `/favicon.ico` (BUG-8, first half).** `scripts/postbuild.ts` writes `dist/favicon.ico` from
`src/assets/brand/favicon-32.png` (a one-image `.ico` that holds the PNG unchanged, `scripts/lib/ico.ts`), so it follows
the icon when the owner replaces it. `/favicon.ico` was already on the Worker's `!` list. The other half, `/404`
answering 200, is not in this round and stays open.

**10. A missing entry photograph (BUG-6; amends 0019).** `scripts/check-originals.ts` runs before the build. By default
a photograph an entry shows that is not in `src/.originals` stops the build with the file names and the way out; on
GitHub that is what must happen (the originals are fetched there). `ALLOW_MISSING_ORIGINALS=1`, local only and refused
when `CI` or `GITHUB_ACTIONS` is set, builds with a plain grey 3:2 JPEG at each missing path and prints a warning naming
the files. The grey files are listed with their hash in `src/.originals/.standins.json`, are ignored by `photo-meta`,
replaced by `photos:fetch`, and removed at the end of the build (or at the start of the next); a real file put over one
is never removed. Documented in `docs/setup.md`.
_Rejected:_ placeholders by default (CI would ship a grey picture without a word); a Vite plugin that swaps the image
(Astro resolves the Markdown image before any plugin of ours can see it).

**11. Navigation tap area (TO-02, third review).** `.nav a` gets `padding-inline: 0.5rem` and `margin-inline: -0.5rem`:
the hit area is at least 44 px wide (the shortest word, "Now", is 36 px), height was already 44, and the words stay
where they were with the 22 px between them. Tested at 320 and 390 px, both languages.

**12. Person image (TO-03, third review).** `src/data/site.json` gains `"portrait": null`: the path of the real portrait
on this site once the owner has one. `personJsonLd` puts it in as an absolute `image`; with `null` it leaves `image`
out, and the placeholder frame on About is never used. The launch gate (`pnpm test:launch`) fails on the missing image
next to the placeholders and `sameAs`. Waits for the photograph (owner question O1).

## How it is tested

Each fix has tests that failed before it and pass after, checked by running them on the old code: `qa/long-content.spec.ts`
(41 cases, all failed) and `qa/comments-layout.spec.ts`; `qa/a11y.spec.ts` (BUG-1, BUG-3 and SO-08 over both themes, both
languages and five widths, and the keyboard rings, the markers removed); `header-entry.spec.ts` (TO-02, names);
`i18n.spec.ts` (SO-06); `qa/theme.spec.ts` (the name follows the system theme); `qa/print-cookies.spec.ts` and
`unit/brand.test.ts` (favicon); `unit/sitemap-urls.test.ts`; `unit/build-output.test.ts` (one stylesheet);
`unit/standins.test.ts` (originals, and the CI refusal); `unit/tokens.test.ts` (the 7:1 floors); `unit/seo.test.ts`,
`qa/seo.spec.ts` and `qa/launch.spec.ts` (Person image). TO-03 has no red-then-green test while there is no portrait: the
unit test proves the wiring with a data object that has one, and the launch gate is red by design.

Visual baselines: none were regenerated. The colour changes are under the 1 % tolerance, and the one page the layout
change did move (the 404 numeral wrapping) was fixed in the CSS instead.
