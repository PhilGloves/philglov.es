# QA bug reports

Format per the QA brief: page URL, language, theme, width, browser, steps, expected, actual, screenshot, owning agent,
severity. Severity: **high** blocks the launch, **medium** should be fixed before it, **low** can wait.

Each open bug that a test can see has a test named `BUG-n` marked `test.fail()`: CI stays green while it is open and
goes red ("expected to fail, but passed") the moment it is fixed, which is the cue to delete the marker and close the bug.
One bug is open (BUG-7); the `/404` half of BUG-8 is closed as accepted (owner, 2026-11-16); BUG-9 is closed (owner ruling), BUG-4 is fixed (fix round 1, [0027](../decisions/0027-fix-round-1-backend.md)) and BUG-1, -2, -3, -5, -6 and the favicon half of BUG-8 are fixed (fix round 2, [0028](../decisions/0028-fix-round-2-frontend.md)). Found on the build of `main` at the merge of #24 (decisions 0023 to 0025), 2026-11-15, local Worker (`pnpm preview`).

| #     | Title                                                                   | Owner             | Severity | Test                                                                                 |
| ----- | ----------------------------------------------------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------ |
| BUG-1 | The language switch's accessible name does not contain its visible text | Frontend          | medium   | **Fixed 2026-11-16** (0028): `qa/a11y.spec.ts` "BUG-1", an ordinary test now         |
| BUG-2 | No visible keyboard focus ring on the photos of a series grid           | Design            | high     | **Fixed 2026-11-16** (0028): `qa/a11y.spec.ts` keyboard, now also `/photos`          |
| BUG-3 | Sign-off and footnote text are under AAA contrast (6.58:1)              | Design            | low      | **Fixed 2026-11-16** (0028): `qa/a11y.spec.ts` "BUG-3 and SO-08", all widths         |
| BUG-4 | "Save draft" is blocked until the description is filled in              | Backend           | medium   | **Fixed 2026-11-16**: `qa/phone.spec.ts` "BUG-4", an ordinary test now (0027)        |
| BUG-5 | A long URL or name in a comment widens the page at every phone width    | Design / Frontend | high     | **Fixed 2026-11-16** (0028): `qa/comments-layout.spec.ts`, `qa/long-content.spec.ts` |
| BUG-6 | The build fails when an entry's photo is not in `src/.originals`        | Photo             | medium   | **Fixed 2026-11-16** (0028): `unit/standins.test.ts`; opt-in in `docs/setup.md`      |
| BUG-7 | Three titles repeat across the two languages                            | Content           | low      | annotation on `qa/seo.spec.ts` (first test)                                          |
| BUG-8 | `/404` answers 200, and `/favicon.ico` answers 404                      | Frontend          | low      | favicon **fixed 2026-11-16** (0028); `/404` 200 **accepted** 2026-11-16 (0022)       |
| BUG-9 | Every page logs a console warning in Safari/WebKit (COOP header)        | Backend / owner   | medium   | **Closed 2026-11-16**: owner ruling, [0026](../decisions/0026-coop-stays.md)         |

Found by the independent second opinion (2026-11-16, SO-01 to SO-10, kept outside the repository) and **fixed in fix
round 1** ([0027](../decisions/0027-fix-round-1-backend.md)), each with a test that failed before the fix:

| #     | Title                                                                                         | Test                                                                       |
| ----- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| SO-01 | Valid front matter rejected by the content check, or silently changed by /admin/write         | `unit/frontmatter.test.ts`; `worker/write.test.ts` "front matter survives" |
| SO-02 | With JavaScript on, a form refused for an expired token could never be sent again             | `qa/forms.spec.ts` "after an expired token"; `worker/forms.test.ts`        |
| SO-03 | After a saved draft was published, "Write another entry" restored its old copy                | `qa/phone.spec.ts` "save draft, edit, publish, write another"              |
| SO-09 | A report sent from a missing address said `/404`                                              | `worker/forms.test.ts` "a report sent from a missing address"              |
| TO-01 | Publishing while a photo was still uploading left the photo out without a word (third review) | `qa/phone.spec.ts` "TO-01"                                                 |
| —     | Staging `/_assets/` responses: noindex now in their own rule (rule 15)                        | `unit/headers.test.ts`, `unit/build-output.test.ts`, `qa/rights.spec.ts`   |

**Fix round 2** ([0028](../decisions/0028-fix-round-2-frontend.md)), each with a test that failed before the fix; the expected-failure
markers of BUG-1, -2, -3 and -5 are gone:

| #     | Title                                                                   | Test                                                                                                        |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| SO-04 | Long valid entry titles and body words broke the page width             | `qa/long-content.spec.ts` (every page type, five widths)                                                    |
| SO-05 | The theme button announced the old state after the system theme changed | `qa/theme.spec.ts` "with no choice made…", `header-entry.spec.ts`; no `aria-pressed` left                   |
| SO-06 | Localised previous/next text inherited the other language               | `i18n.spec.ts` "previous/next links…"                                                                       |
| SO-07 | Paginated journal indexes disappeared from the sitemap at 51 entries    | `unit/sitemap-urls.test.ts`                                                                                 |
| SO-08 | The phone-sized light Now paragraph missed 7:1                          | `qa/a11y.spec.ts` "BUG-3 and SO-08"; `unit/tokens.test.ts`                                                  |
| SO-10 | Two stylesheets against the one-file budget                             | `unit/build-output.test.ts` "every public page links exactly one stylesheet"                                |
| TO-02 | Phone navigation links narrower than 44 px (third review)               | `header-entry.spec.ts` "TO-02" at 320 and 390 px, both languages                                            |
| TO-03 | Person data had no image (third review)                                 | `unit/seo.test.ts`, `qa/seo.spec.ts`; the launch gate (`qa/launch.spec.ts`) fails until the portrait exists |

Still open from the reviews, outside this round: the W-findings (test quality) and the security notes.

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
- **Fixed 2026-11-16** (fix round 1, [0027](../decisions/0027-fix-round-1-backend.md)): "Save draft" has
  `formnovalidate`; Publish keeps the browser's checks and the server's. The test is an ordinary one now and also checks
  that Publish is still stopped without a description.

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

## BUG-8 · `/404` answers 200, and `/favicon.ico` answers 404 — favicon fixed, `/404` ACCEPTED (owner, 2026-11-16)

- **Closed.** `GET /404` answering 200 is accepted: the page is noindex in its markup and its header, nothing links to it and the sitemap omits it. `qa/requirements.spec.ts` pins those conditions (a link to `/404`, or a lost noindex, fails it). Decision [0022](../decisions/0022-qa-matrix.md), round 3.

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

## OBS-1 · At load, form controls and header controls may ease in from the browser's grey — OBSERVATION, not changed (round 3 follow-up)

- **Seen:** while finding why the prefers-contrast check on the Send button failed once (decision 0022, "Round 3,
  follow-up"). On some loads, mostly under load, the page gets a style update before the stylesheet is applied, and when it
  is, `transitionrun` fires at about 60 ms (document still `interactive`) for the `.btn` background (from `rgb(240, 240, 240)`),
  the inputs' and textareas' borders, the header controls' colour and the body. They ease over 150 and 250 ms.
- **Measured:** 9 of 144 loads of `/lisbona` (12 browsers at once, 1440 px after a 390 px page, both themes).
- **Not known:** whether a person would see it. Chromium holds the first paint until the stylesheet is in, so the first
  frame may already be a frame of the ease. Not checked by eye; the tests only read colours.
- **Why it is not a bug here:** the brief for this round is tests only. If the owner wants it gone, one option is to let these
  transitions apply only after load (a class added once the page has loaded) or only on `:hover` and `:focus-visible`;
  either is a site change.
- **Test side:** fixed (reduced motion in the contrast checks, and `transitionsDone`).
