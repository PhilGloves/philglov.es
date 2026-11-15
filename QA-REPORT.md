# QA report

Written 2026-11-15 by the QA agent, on the build of `main` at the merge of pull request 24 (decisions 0023 to 0025),
run against the local Worker (`pnpm preview`) on Windows 11. How the suites are built and run: decision
[0022](docs/decisions/0022-qa-matrix.md). The bugs, in the brief's format: [docs/qa/bug-reports.md](docs/qa/bug-reports.md).

## Verdict

**Not ready to launch, ready to keep building.** The matrix passes three times in a row with no flaky test, and nothing
in it fails on the staging build. It does so with nine open findings. Those a browser can see (BUG-1 to BUG-5 and
BUG-9) are each pinned by a test that is expected to fail until the bug is fixed, so CI stays green while one is open
and turns red the day it is fixed; BUG-6 to BUG-8 were found by hand or are listed as annotations:

| #     | Finding                                                                      | Owner             | Severity |
| ----- | ---------------------------------------------------------------------------- | ----------------- | -------- |
| BUG-2 | No visible keyboard focus ring on the photos of a series grid                | Design            | high     |
| BUG-5 | A long URL or name in a comment widens the page at every phone width         | Design / Frontend | high     |
| BUG-1 | The language switch's accessible name does not contain its visible text      | Frontend          | medium   |
| BUG-4 | "Save draft" is blocked until the description is filled in                   | Backend           | medium   |
| BUG-6 | The build fails when an entry's photo is not in `src/.originals`             | Photo             | medium   |
| BUG-9 | Every page logs a console warning in Safari/WebKit (COOP header, rule 11)    | Backend / owner   | medium   |
| BUG-3 | Sign-off and footnote text are at 6.58:1, under the 7:1 AAA body-text target | Design            | low      |
| BUG-7 | Three titles repeat across the two languages                                 | Content           | low      |
| BUG-8 | `/404` answers 200; `/favicon.ico` answers 404                               | Frontend          | low      |

**BUG-9 needs the owner**, because two rules meet: rule 11 says no console warnings, and the headers module (and the QA
brief, suite 9) require `Cross-Origin-Opener-Policy`. WebKit logs "This document is not cross-origin isolated because
the Cross-Origin-Embedder-Policy header is missing" on every page for **any** COOP value (measured: `same-origin`,
`same-origin-allow-popups`, `unsafe-none` all warn; no header, no warning). Options: drop COOP, or rule, as O4 did for the
404 line, that an engine's own isolation notice does not count.

**The launch gate fails, by design, until the owner answers O1** (`pnpm test:launch`, run against a production build):
18 pages still show `[Placeholder]`/`[Segnaposto]` text and the Person JSON-LD has no `sameAs` list. `/rights` and
`/privacy` have no placeholder in either language.

## What ran, and what it found

| Run                                                                   | Result                                                                                                                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix, Chromium JavaScript on and off, 3 runs in a row (final)       | **3 runs in a row: 565 passed, 0 failed, 0 flaky, 79 skipped each (6.4, 6.3 and 6.6 minutes).** The run before them had one timeout (see "Findings that are not bugs"). |
| Unit tests (`pnpm test:unit`)                                         | 93 passed (includes the image checks with exiftool)                                                                                                                     |
| Worker tests (`pnpm test:worker`, in the Workers runtime)             | 167 passed                                                                                                                                                              |
| html-validate on `dist/` (`pnpm validate:html`)                       | no errors                                                                                                                                                               |
| Lighthouse CI, 6 pages × 3 runs, mobile, simulated Slow 4G, CPU×4     | performance, accessibility, best practices 100 on every page (see below)                                                                                                |
| Lighthouse SEO on a `SITE_ENV=production` build                       | 100 on every page (66–69 on a staging build, which says noindex by design)                                                                                              |
| SEO and rights suites on a production build                           | 40 passed: no indexable page says noindex, sitemap, hreflang, JSON-LD, robots                                                                                           |
| Launch gate on a production build                                     | 1 of 3 passed; fails on placeholders and `sameAs` (O1)                                                                                                                  |
| WebKit smoke subset (7 tests incl. the BUG-9 marker)                  | 7 passed                                                                                                                                                                |
| Firefox smoke subset                                                  | **not run here**: the operating system refuses to start `firefox.exe` ("Permission denied", also run by hand). The tests exist and run in CI on Linux.                  |
| Visual regression (`pnpm test:visual`, 8 pages × 2 themes × 4 widths) | 16 passed against the baselines in this pull request (Windows-made)                                                                                                     |
| Live-site check (`pnpm test:live`)                                    | 16 passed against the local Worker (proves the suite); **not run against staging**: needs the owner's Access token, see below                                           |

Lighthouse medians (three runs each; budgets in `lighthouserc.json`: ≥ 95, LCP < 2 s, CLS < 0.05, 180 KB):

| Page                     | Perf | A11y | BP  | LCP     | CLS | Transfer |
| ------------------------ | ---- | ---- | --- | ------- | --- | -------- |
| `/`                      | 100  | 100  | 100 | 1621 ms | 0   | 111 KB   |
| `/it`                    | 100  | 100  | 100 | 1620 ms | 0   | 111 KB   |
| `/journal`               | 100  | 100  | 100 | 938 ms  | 0   | 52 KB    |
| `/lisbona`               | 100  | 100  | 100 | 935 ms  | 0   | 82 KB    |
| `/photos/lisbon`         | 100  | 100  | 100 | 1465 ms | 0   | 80 KB    |
| `/photos/lisbon/tram-28` | 100  | 100  | 100 | 1543 ms | 0   | 61 KB    |

The photo grid, which the brief names, was missing from `lighthouserc.json`; it is added. Q17 happened again: of
four local attempts, one died with Lighthouse's `NO_NAVSTART` (a trace error, nothing to do with the site) and was run
again; it is still open and CI is unaffected.

## Coverage of the brief

| #   | Suite                      | Where                                                             | What it holds                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Console and network        | `qa/matrix.spec.ts`                                               | Every built page (30, the 404 page and `/styleguide` among them) × light/dark × 1440, 1024, 768, 390, 320 × JavaScript on/off: console errors **and** warnings, page errors, failed requests, responses ≥ 400, any host but the site's own. One test per page.                                                                                                                                              |
| 2   | Accessibility and keyboard | `qa/a11y.spec.ts`                                                 | axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice) on every page in both themes at 1440 and 390; AAA contrast on body text; Tab through 8 pages in both themes: skip link first, every stop's focus ring proved by a screenshot with and without focus, no trap; toggle, language switch and disclosure by keyboard; every control labelled.                                                               |
| 3   | Visual, overflow, zoom     | `qa/visual.spec.ts`, `qa/matrix.spec.ts`                          | Full-page screenshots, 8 pages × 2 themes × 4 widths (16 tests); no horizontal scroll at 1440 to 320 px, at 200 % zoom (640 px) and 400 % (320 px).                                                                                                                                                                                                                                                         |
| 4   | Theme                      | `qa/theme.spec.ts`                                                | Persists across navigation (both languages) and reload; no flash of the wrong theme (first frame measured, screenshot attached); system preference followed, and followed live; stored value beats system; junk value ignored; AAA contrast in both themes.                                                                                                                                                 |
| 5   | i18n                       | `qa/i18n.spec.ts`                                                 | Every page: lang, switch to the twin (or the other home with the "not available" note), hreflang pairs only where both exist, canonical, `og:locale`, the "originally written in" label for original, translation and one-language entries; symmetry; no redirect by browser language.                                                                                                                      |
| 6   | Forms                      | `qa/forms.spec.ts`, `qa/cross-browser.spec.ts`                    | Comment and report forms, both languages, JavaScript on and off: empty name/email/comment, bad email, too long, three links, honeypot, under 3 s, 25-hour and forged token, the sixth post in 10 minutes: each refused with its message, the typed text kept. Good posts accepted. XSS payloads inert on the admin page and on the published page. `/admin` without Access answers 403.                     |
| 7   | HTML and links             | `pnpm validate:html`, `qa/links.spec.ts`                          | html-validate on all pages; a crawl of every link, image, script, stylesheet, srcset, feed and sitemap URL and every `#anchor`: zero 404s, no slash, no redirect, nothing public links to `/admin`.                                                                                                                                                                                                         |
| 8   | Performance                | `lighthouserc.json`, `qa/budgets.spec.ts`                         | Lighthouse as above; and from the network log on a Slow 4G phone: text page ≤ 180 KB, CSS ≤ 20 KB, fonts ≤ 2 files / 80 KB, public JavaScript ≤ 1.5 KB raw, LCP < 2 s, CLS < 0.05, own origin only.                                                                                                                                                                                                         |
| 9   | Headers and CSP            | `qa/security.spec.ts`                                             | CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP on pages, the 404, a redirect, every API status, feeds, sitemap, fonts, images; the one inline script is the hashed one; no `<style>`, style attribute, handler, `javascript:` URL; the browser blocks an injected inline script, third-party script and image, and a cross-origin fetch.                                                     |
| 10  | Images                     | `tests/unit/qa-images.test.ts`, `qa/matrix.spec.ts`               | exiftool on every output image: no GPS in any group; copyright, creator, web statement, Data Mining reservation on every photograph. Every `<img>`: width, height, alt (empty alt needs a role).                                                                                                                                                                                                            |
| 11  | SEO                        | `qa/seo.spec.ts`, `qa/launch.spec.ts`                             | Unique title with the name (per language), description, canonical, Open Graph and Twitter tags, share image 1200×630; JSON-LD valid and the right type on the right page; sitemap lists every indexable page once with the page's own hreflang; feeds; noindex on staging, none on production.                                                                                                              |
| 12  | Phone publishing           | `qa/phone.spec.ts`, `qa/phone-throttled.spec.ts`                  | 403 without Access; 390 px touch, every control ≥ 24 px, no sideways scroll, reachable by keyboard; a draft survives a reload and a dropped connection; an upload that drops is retried; a GIF renamed `.jpg` refused; Publish opens a pull request on its own branch and never writes to main; the other-language version of an entry becomes its twin with the right `originalLang`.                      |
| 13  | Print and cookies          | `qa/print-cookies.spec.ts`                                        | An entry prints without nav, forms and footer (and a PDF is made); no page or API answer sets a cookie; every entry has icons and its own 1200×630 share image.                                                                                                                                                                                                                                             |
| 14  | Rights and privacy         | `qa/rights.spec.ts`, `tests/unit/qa-images.test.ts`, worker tests | robots.txt refuses every bot in `ai-bots.json` and admits Googlebot and Bingbot (parsed with the longest-match rule); tdmrep.json valid; tdm-reservation on pages and images; `noai, noimageai` on images only; `/rights` and `/privacy` in both languages. The notification e-mail and the retention job are tested in `tests/worker/ops.test.ts` (they hold no personal data; 30 days and 12 months).     |
| 15  | Live site                  | `qa/live.spec.ts`, `playwright.live.config.ts`, CI job            | Console, network, cookies, headers, injected scripts against the deployed site. Wired into CI after each staging deploy; skips with a clear message until the Access token exists ([docs/setup.md](docs/setup.md), step 8b).                                                                                                                                                                                |
| —   | Manual checks, automated   | `qa/css-off.spec.ts`, `qa/phone-throttled.spec.ts`                | **An entry read with CSS off** (every stylesheet answered empty): document order, heading levels, alt text, names, the honeypot's own "leave empty" label, the comment form by keyboard. **Phone publish on a throttled connection** (390 px, touch, Slow 4G, CPU ×4): a real 1.2 MB photo uploads with progress, the connection drops for 4 s and it carries on, the entry is published as a pull request. |
| —   | Comments from strangers    | `qa/comments-layout.spec.ts`                                      | A long URL and an 80-letter name must not widen the page (BUG-5).                                                                                                                                                                                                                                                                                                                                           |

The skipped tests (79 per run) are by design: the axe suites and the phone suites need JavaScript and are skipped in the
no-JavaScript project, with the reason printed (axe runs on timers, which do not fire with JavaScript off; the markup
is the same in both projects), plus the tests that only make sense with JavaScript on or only with it off.

### Findings that are not bugs

- Staging says `noindex` everywhere, as it must; the SEO suite expects it and, on a production build, forbids it.
- WebKit upgrades every subresource of an `http` page to `https`, even on `127.0.0.1`, because of the CSP directive
  `upgrade-insecure-requests`. The local Worker speaks `http`, so a visitor opening `pnpm preview` in Safari sees no
  styles. Production is `https` and is not affected. The WebKit tests drop that one directive and nothing else.
- The Worker tests print "Called .text() on an HTTP body which does not appear to be text" for form posts (a workerd
  notice in the test runtime only; the local `wrangler dev` log has none).
- Two runs took far longer than the rest (18 minutes, and 9.9 minutes against the usual 6.5) and had timeouts in tests
  unrelated to each other: four tests timed out together after about 352 s each in the first, and one `page.setViewportSize`
  call timed out at 30 s in `page-head.spec.ts` (a test from `main`) in the second. Both look like the machine being
  starved or suspended (another session was working in a sibling checkout), not like a test fault: the same tests
  passed in every other run. I report them rather than retry them (the config has no retries); the three runs that count
  are the three consecutive clean ones.
- Three more races in my own tests were found by repeating the run and fixed, each deterministic now: the XSS test's
  payload sat on `/lisbona` for the 60 s the Worker caches comments and widened it for other tests (BUG-5 in miniature),
  so every word of it now wraps; the XSS name was 87 characters and the form rightly refused it, which the test took
  for success; and "sent under 3 s" counted on the test being fast, so it now sends a token made that instant.
- A race in my own XSS test (two projects sharing one database) was found by that run and fixed: each test now uses a
  comment of its own and deletes only that one.

## Answers to two questions

**No test can open a real pull request or publish a real entry.** Every test that publishes talks to a GitHub stand-in:
`tests/e2e/admin-worker.ts` for the browser tests and `outboundService` in `vitest.config.ts` for the Worker tests. Both
answer `api.github.com` themselves. The browser tests' server used to forward any other host to the real network; it now
refuses every other host and its `close()` fails any test that tried (`qa/phone.spec.ts` proves it). The credentials in
a test are a key pair made for that run. CI's `Test` job has no GitHub App secret and the local `.dev.vars` has empty
GitHub values, so `pnpm preview` says "Publishing is not set up".

**Speed of the Test check.** One required check, `Test` (read from the ruleset), so the split is inside it, in a step that
reads the diff. Entry-only changes (what the phone publishes) run lint, the build with its content check, html-validate
and the Chromium core suite: **about 4 to 6 minutes** (the core suite is 66 s here). Any other change runs everything:
the QA matrix (6.3 to 6.6 minutes here, on 4 workers), Firefox and WebKit, Lighthouse, a production-mode build with
the SEO and rights suites, the launch gate (informational): **about 20 to 30 minutes on a runner**. These are estimates:
the matrix is mostly waiting (pauses a person takes, network quiet), so it should scale with workers, and CI uses four.
They will be replaced by the first real CI run. A publish merged to `main` is not held back by the matrix: a separate,
non-required job runs it afterwards. Details and the reasons: decision 0022.

## For the owner: what only a real device can show

Each takes about ten minutes. Use the staging address (log in with Access first). Write down the phone, the system
version and what you saw; a one-line "fine" is a result.

### VoiceOver, iPhone, Safari (Settings → Accessibility → VoiceOver, on)

1. **Home.** Swipe right through the page from the top. Listen for: "Skip to content" first; the name and "philglov.es"; the
   menu items as links; the **round "IT" button** (BUG-1: it is read as "Italiano", not "IT"; say what you hear); the
   theme button as a button whose name is "Dark theme" and whose state ("on"/"off", or "selected") changes when you
   double-tap it; the heading "Writing about photography…".
2. **An entry** (`/lisbona`). Use the rotor → Headings: there is one level-1 title, then the sub-headings in order. Swipe
   through the text; find the footnote link and follow it; listen to the block after the text (number, date, reading
   time, "Originally written in Italian", "Read the original"); no arrow glyphs are read out.
3. **The comment form.** Swipe to "Your thoughts? Please leave a reply". Each field is announced with its name; "Never
   shown, only so I can reply" is read with the e-mail field; the "Leave this field empty" field must **not** be reachable.
   Press Send with the fields empty: you should hear "Your comment was not sent" and the first problem, and the focus
   moves to that message. Fill it in properly and send (wait three seconds first): you should hear the thank-you.
4. **A photo series** (`/photos/lisbon`). Each photo should be read with its alt text; the focus ring follows (BUG-2 is
   about keyboard focus on desktop, check that you can tell which photo is focused with a keyboard connected).

### TalkBack, Android, Chrome (Settings → Accessibility → TalkBack, on)

Repeat the same four steps with swipes right/left and double-tap. Also: "Skip to content" is the first stop, the
language and theme buttons are announced with their names, and the form errors are read out when they appear.

### A real old phone on a throttled connection

Use a phone three or more years old. Turn Wi-Fi off, use mobile data, and in the phone's developer options or with a
data-saver on, or stand somewhere with one bar of signal. Open `/`, then an entry, then `/photos/lisbon`.

- The text is readable within about three seconds, before the photographs arrive.
- Nothing jumps while the page loads (the headline, the photograph frame and the menu stay where they are).
- Scrolling does not stutter; the photographs fade in or appear in place rather than pushing the text.
- Open the entry and tap into the comment field: the keyboard opens without covering the field you are typing in.
- Switch the theme with the button and reload: the theme stays, with no flash of the other one.

## What was not done, and why

- **Firefox, locally:** blocked by the operating system on this machine; CI runs it (Linux).
- **Live-site check on staging:** needs a Cloudflare Access service token that only the owner can make. Steps are in
  [docs/setup.md](docs/setup.md) step 8b; the CI job `live-check-staging` says "skipped" in the run summary until the
  secrets exist. The same suite was run here against the local Worker to prove it works (see the table).
- **Real devices:** the checklist above.
- **Visual baselines** were made on Windows and are checked on Windows only; after an intended design change, run
  `pnpm test:visual --update-snapshots`, look at the images, and commit them. They are not part of CI (fonts render
  differently per operating system).
- **A second language of the real content:** the pages are still placeholders (O1); the matrix covers their structure,
  not their words.
