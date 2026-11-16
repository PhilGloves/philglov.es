# QA bug reports

Format per the QA brief: page URL, language, theme, width, browser, steps, expected, actual, screenshot, owning agent,
severity. Severity: **high** blocks the launch, **medium** should be fixed before it, **low** can wait.

Each open bug that a test can see has a test named `BUG-n` marked `test.fail()`: CI stays green while it is open and
goes red ("expected to fail, but passed") the moment it is fixed, which is the cue to delete the marker and close the bug.
Eight bugs are open and one (BUG-9) is closed. Found on the build of `main` at the merge of #24 (decisions 0023 to 0025), 2026-11-15, local Worker (`pnpm preview`).

| #     | Title                                                                   | Owner             | Severity | Test                                                                         |
| ----- | ----------------------------------------------------------------------- | ----------------- | -------- | ---------------------------------------------------------------------------- |
| BUG-1 | The language switch's accessible name does not contain its visible text | Frontend          | medium   | `qa/a11y.spec.ts` "BUG-1"                                                    |
| BUG-2 | No visible keyboard focus ring on the photos of a series grid           | Design            | high     | `qa/a11y.spec.ts` keyboard `/photos/lisbon` (`test.fail`)                    |
| BUG-3 | Sign-off and footnote text are under AAA contrast (6.58:1)              | Design            | low      | `qa/a11y.spec.ts` "BUG-3"                                                    |
| BUG-4 | "Save draft" is blocked until the description is filled in              | Backend           | medium   | `qa/phone.spec.ts` "BUG-4"                                                   |
| BUG-5 | A long URL or name in a comment widens the page at every phone width    | Design / Frontend | high     | `qa/comments-layout.spec.ts` "BUG-5"                                         |
| BUG-6 | The build fails when an entry's photo is not in `src/.originals`        | Photo             | medium   | found by hand (below); not a browser test                                    |
| BUG-7 | Three titles repeat across the two languages                            | Content           | low      | annotation on `qa/seo.spec.ts` (first test)                                  |
| BUG-8 | `/404` answers 200, and `/favicon.ico` answers 404                      | Frontend          | low      | found by hand (below)                                                        |
| BUG-9 | Every page logs a console warning in Safari/WebKit (COOP header)        | Backend / owner   | medium   | **Closed 2026-11-16**: owner ruling, [0026](../decisions/0026-coop-stays.md) |

Not bugs, but open and listed so nothing is lost: the **launch gate** (`pnpm test:launch`, `qa/launch.spec.ts`) fails
until the owner answers O1 (visible `[placeholder]` text on the pages, `sameAs` empty); Lighthouse on Windows is Q17.

---

## BUG-1 · The language switch's accessible name does not contain its visible text

- **Owner:** Frontend (`src/components/SiteHeader.astro`, decision 0023) · **Severity:** medium · **WCAG:** 2.5.3 Label in Name (A)
- **Where:** every page. `/`, `/it`, `/lisbona`, `/it/lisbona`, `/about`, the 404 page: all the same. Both themes, 1440 and
  390 px, Chromium (axe rule `label-content-name-mismatch`, 96 hits in one run).
- **Steps:** open any page; read the language link: `<a class="rbtn lang-switch" aria-label="Italiano">IT</a>`.
- **Expected:** the accessible name contains the visible text, so that a person who says "click IT" to speech-input
  software (or a screen-reader user who sees "IT") reaches the link.
- **Actual:** visible text "IT" / "EN"; name "Italiano" / "English". The words do not contain "IT".
- **Fix suggestion:** `aria-label="IT, Italiano"` (and `EN, English`), or keep the note for the no-twin case after it.
- **Evidence:** axe-core 4.14, `tests/e2e/qa/a11y.spec.ts` (BUG-1 test; the main axe test has the rule switched off so the
  rest of the page is still held to zero).

## BUG-2 · No visible keyboard focus ring on the photos of a series grid

- **Owner:** Design (`site.css`, the series grid / `.frame`) · **Severity:** high · **WCAG:** 2.4.7 Focus Visible (AA)
- **Where:** `/photos/lisbon` and `/it/photos/lisbon`, light and dark, 1024 px (not checked on the other series pages: the
  keyboard test runs on this one).
- **Steps:** open `/photos/lisbon`, press Tab until focus reaches the first photo.
- **Expected:** the 2 px moss ring the other links get.
- **Actual:** the browser reports `outline: solid 2px`, offset 3 px, and `:focus-visible` matches, but nothing is drawn
  around the photo (the ring is clipped, probably by a parent with `overflow: hidden` or `contain`). A keyboard user
  cannot tell which photo is focused. The test takes a screenshot of the link with and without focus: they are identical.
- **Screenshot:** `docs/qa/screenshots/bug-2-photo-focus-1024-light.png` (the photo is focused; compare the menu links).
- **Test:** `qa/a11y.spec.ts` keyboard test for `/photos/lisbon` is `test.fail()` until fixed.

## BUG-3 · The sign-off and the footnote text of an entry are under AAA contrast

- **Owner:** Design (`tokens.css` muted colour on `.sign`, `[data-footnotes] p`) · **Severity:** low
- **Where:** `/lisbona` (every entry), light theme, measured: 6.58:1 for `rgb(91, 91, 87)` on the page colour (axe flags it in
  the light theme only; the dark theme passes). The same muted style on the entry facts and the label, which are small print and not held to
  AAA by this test.
- **Expected:** body text 7:1 (brief, rule 6: "AAA body-text contrast"). **Actual:** 6.58:1 (passes AA 4.5:1).
- **Fix suggestion:** a text colour for these two lines that reaches 7:1, or move them out of "body text" in the brief.
- **Test:** `qa/a11y.spec.ts` "BUG-3".

## BUG-4 · "Save draft" is blocked until the description is filled in

- **Owner:** Backend (`worker/src/admin/write.ts`) · **Severity:** medium · **Where:** `/admin/write`, 390 px, Chromium
- **Steps:** type a title and a few words of text; tap "Save draft".
- **Expected:** a half-written entry is saved (that is what a draft is for; the guide says drafts survive).
- **Actual:** nothing happens: the Description input is `required`, "Save draft" has no `formnovalidate`, so the browser
  stops the submit and shows its own bubble. The same for a photo with no alt text (`required`). The text is kept in the
  browser's own autosave (localStorage), so nothing is lost on a reload, but it is not on the server and a second device
  does not see it.
- **Fix suggestion:** `formnovalidate` on the Save draft button (Publish keeps the checks).
- **Test:** `qa/phone.spec.ts` "BUG-4".

## BUG-5 · A long URL or name in a comment widens the page at every phone width

- **Owner:** Design / Frontend (`.c-who`, `.c-body` in `site.css`) · **Severity:** high · **Where:** every entry with
  comments (`/lisbona`, `/it/lisbona`, `/foto`, `/we`, `/one-roll`, `/it/provafoto`), both themes, **320 px (666 px too
  wide) and 390 px (596 px too wide)**, Chromium; JavaScript on or off.
- **Steps:** post (or approve) a comment whose name is 80 letters, or whose text holds a pasted URL of 120 characters
  (both are inside the form's limits); open the entry on a phone.
- **Expected:** the text wraps; no horizontal scroll (rule 7).
- **Actual:** the unbroken string keeps its width and the page scrolls sideways. One careless comment breaks the page for
  every visitor, and comments are public once approved.
- **Fix suggestion:** `overflow-wrap: anywhere` on the comment's name and text.
- **Screenshot:** `docs/qa/screenshots/bug-5-comment-overflow-320-light.png`.
- **Test:** `qa/comments-layout.spec.ts` (the same markup the Worker writes is put into the page; a normal comment passes
  as the control).

## BUG-6 · The build fails when an entry's photo is not in `src/.originals`

- **Owner:** Photo (`src/lib`, content image handling, decision 0019) · **Severity:** medium · **Where:** a laptop without
  `R2_*` variables (a fresh clone, or a contributor), on `main` after #20 (`it/provafoto`).
- **Steps:** `pnpm install`, `pnpm build` with no `src/.originals/provafoto/`.
- **Expected:** "Placeholders show until the originals exist" (CLAUDE.md, decision 0019).
- **Actual:** `[ImageNotFound] Could not find requested image ../../../.originals/provafoto/1000029179-oerb.jpg` and the
  build stops. The photos in the series have a placeholder path; an image written inline in an entry (as the phone
  writes them) has none. CI is fine because it fetches the originals; the "publish from a laptop" route is not.
- **Workaround used by QA:** a plain generated JPEG at that path (`src/.originals` is git-ignored).

## BUG-7 · Three titles repeat across the two languages

- **Owner:** Content · **Severity:** low · `/now` and `/it/now` ("Now · Filippo Guanti"), `/privacy` and `/it/privacy`
  ("Privacy · Filippo Guanti"), `/foto` (an English entry titled "Foto") and `/it/photos` ("Foto · Filippo Guanti").
- **Expected:** a unique title on every page (QA brief, suite 11). **Actual:** the same word is the title in both
  languages. Search engines tell them apart by `hreflang`, so the harm is small; the test fails only for a repeat inside
  one language and lists these as annotations.

## BUG-8 · `/404` answers 200, and `/favicon.ico` answers 404

- **Owner:** Frontend · **Severity:** low
- `GET /404` serves the not-found page with status **200** (it carries `<meta name="robots" content="noindex">` and a
  canonical of itself, so it should not be indexed, but a URL that serves the error page with 200 is a soft 404).
- `GET /favicon.ico` answers 404 with the HTML 404 page. Every page declares its icons, so browsers do not ask; crawlers
  and some feed readers do.

## BUG-9 · Every page logs a console warning in Safari/WebKit — CLOSED by owner ruling, 2026-11-16

- **Owner:** Backend (`worker/src/headers.ts`) and the owner, because two rules meet · **Severity:** medium · **Where:** every
  page and the 404, both languages, both themes, WebKit (Playwright WebKit 27.2; the message is Safari's).
- **Steps:** open any page in WebKit/Safari with the console open.
- **Expected:** no console error or warning (CLAUDE.md rule 11; QA brief suite 1).
- **Actual:** `warning: This document is not cross-origin isolated because the Cross-Origin-Embedder-Policy header is missing
(it must be 'require-corp'). window.crossOriginIsolated is false and SharedArrayBuffer is unavailable.`
- **Measured:** with `Cross-Origin-Opener-Policy: same-origin` WebKit warns (about the Embedder policy); with
  `same-origin-allow-popups` and `unsafe-none` it warns too (about the Opener policy); with **no** COOP header it does not.
  Chromium logs nothing for any value (not checked in Firefox here).
- **The conflict:** the header module sends COOP on every response and the QA brief (suite 9) says to assert it. Adding
  `Cross-Origin-Embedder-Policy: require-corp` would silence the first message but breaks nothing only if every
  subresource is the site's own, which it is; it was not tried, it is a security-header decision.
- **Closed:** the owner kept the header and ruled that a browser engine's own notice about cross-origin isolation does not
  count as a console warning under rule 11, as O4 ruled for the 404 line (decision
  [0026](../decisions/0026-coop-stays.md); CLAUDE.md rule 11; TICKETS.md).
- **Test:** `qa/cross-browser.spec.ts` now has a normal rule-11 test for Firefox and WebKit that allows exactly that one
  message, word for word and at level `warning`, and nothing else, and a second test proving that a different level,
  wording or message still fails. The WebKit smoke tests leave out only that message (`ignoreConsole` in `qa/lib.ts`).
- **Related, not a bug:** WebKit upgrades subresources of an `http` page to `https` even on `127.0.0.1` (CSP
  `upgrade-insecure-requests`), so `pnpm preview` shows no styles in Safari; production is `https`.
