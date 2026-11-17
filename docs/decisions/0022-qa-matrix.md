# 0022 — How the QA matrix is built and run

Status: Accepted · 2026-11-13 · QA agent

**Context.** The QA brief asks for every page × language × theme × five widths × JavaScript on/off, a smoke subset in
Firefox and WebKit, fifteen suites, a live-site check, and a run that passes repeatedly without flaky tests.

**Decision.**

- The suites live in `tests/e2e/qa/`, one file per brief suite (`matrix`, `a11y`, `theme`, `i18n`, `seo`, `links`,
  `security`, `forms`, `print-cookies`, `rights`, `budgets`, `phone`, `cross-browser`, `launch`, `live`) plus
  `tests/unit/qa-images.test.ts` (GPS and rights metadata read with exiftool, independent of the code that wrote it).
- The page list is the build itself (`dist/*.html`), not the sitemap, so a page the sitemap forgot is still tested.
- One test per page, so a failure names the page. `settle()` in `qa/lib.ts` is the fix for Q18 and Q20: every wait
  uses the requests the test has seen in flight, never `requestAnimationFrame` or a timer inside the page (neither
  runs with JavaScript off), and no test is retried.
- Projects: `chromium` and `chromium-no-js` are `pnpm test:e2e` (what CI runs); `firefox` and `webkit` are
  `pnpm test:cross`; `visual` (baselines per operating system), `launch` (the gate that fails until O1 is answered)
  and the live check (`playwright.live.config.ts`) are run by hand or after a deploy.
- `QA_PROD=1` serves the Worker with `SITE_ENV=production`; `pnpm qa:production` builds that way, runs the SEO,
  rights and launch suites and rebuilds the normal build.
- Known product bugs are kept as `test.fail()` tests named `BUG-n` so CI stays green while the bug is open and turns
  red ("unexpectedly passed") the moment it is fixed, which is the cue to delete the marker.
- `pnpm qa` refuses to start if something already answers on port 8787: Playwright would reuse a stale server.
- Dependency: `axe-core` (dev), see 0007. Not `@axe-core/playwright`: the rules are injected over the DevTools
  protocol, which the site's CSP does not govern, so the wrapper adds nothing.

**Rejected.** Retries (they hide the flakiness the brief forbids). Visual baselines in CI (fonts render differently per
operating system, so baselines are made and checked on the same one). Reading the CSP-blocked request as a failure
(Chromium reports `csp` and nothing leaves the machine; the test asserts exactly that).

## CI: one required check, two scopes

The ruleset "Protect main" requires one status check, `Test` (checked with the GitHub API, 2026-11-15; "strict" is
off). Publishing from the phone waits for it, so it must stay fast, and the QA matrix is about 20 minutes. Splitting into two jobs would mean changing the ruleset to require the second one as well, which is the owner's switch, so the split is **inside** `Test`, in a step that reads the diff:

- **Fast scope:** the change touches only `src/content/journal/{en,it}/<slug>.md` (what the publisher writes; the same
  pattern as the publisher guard). Runs: lint, the build with its content check, html-validate, the unit tests, and the
  Chromium core suite (`E2E_SCOPE=core`: everything in `tests/e2e` except `tests/e2e/qa`, JavaScript on and off). Measured: the core
  suite is 66 s on this laptop. The unit tests are in it on purpose (owner request, 2026-11-16): a phone publish is when
  new photographs arrive, and `tests/unit/qa-images.test.ts` reads every output image with exiftool (no GPS, rights
  fields) before the entry can go live, not after. They took 2 s on the runner (run 43778652244, no photographs in R2
  yet) and 40 s on a Windows laptop with 56 photo outputs, where starting exiftool is slow.
- **Full scope:** any other change, and any trigger that is not a pull request or a push. Everything in the fast scope
  plus typecheck, Worker tests, the QA matrix, Firefox and WebKit, Lighthouse, and the checks on a
  `SITE_ENV=production` build (SEO, rights; the launch gate informs without blocking until owner question O1 is
  answered). The production build runs after the `dist` artifact is saved, so no deploy ever gets it.
- **After a publish:** the push to `main` of an entry-only merge takes the fast scope too, so the entry goes live
  without waiting; the job `full-qa-after-publish` then runs the full matrix on `main` in parallel. It gates nothing
  and is not a required check; a red cross on `main` is its signal.

## The stand-ins: no test can open a real pull request

Every test that publishes talks to a GitHub stand-in: `tests/e2e/admin-worker.ts` (browser tests: `admin-write`,
`qa/phone`, `qa/phone-throttled`) and `outboundService` in `vitest.config.ts` (Worker tests). Both answer
`api.github.com` themselves and refuse every other host (the browser tests' server records the refusal and its
`close()` fails the test that caused it; `qa/phone.spec.ts` proves it). The App credentials in a test are a key pair
made for that run. CI's `Test` job has no GitHub App secret, and the local `.dev.vars` has empty GitHub values, so
`pnpm preview` answers "Publishing is not set up".

## Round 3 (2026-11-16): the tests themselves

An independent review (SECOND-OPINION.md, THIRD-OPINION.md) listed tests that could not fail, budgets with no assertion and
requirements with no test. Round 3 changes tests only, never the site. Each fix below was proved by breaking the thing on
purpose and seeing the test fail (the break-and-restore scripts are listed in `QA-REPORT.md`).

- **Tests that could not fail.** W-01: the budget suite's "own origin only" compares origins, not paths (a stylesheet from
  another host has a path that starts with `/` too); a control test serves one from `third-party.test` and expects it to be
  found. W-02: every built page has exactly one inline script, the theme script, with the hash the Worker's CSP names (it was
  "at most one", and compared only the set of hashes); the share images are the set the content folders require, not whatever
  files exist. W-03: a missing LCP, a browser without the observers, a response body that cannot be read, or a status of 400
  or more is a problem, never a zero (`measurementProblems`, with control tests). W-07: the two themes are compared by token
  name (and the two dark blocks by value), not by the length of an array of row numbers.
- **Budgets with no assertion** (W-04). HTML ≤ 30 KB compressed on every built page (gzip level 9, the stricter reading of
  Cloudflare's Brotli); exactly one stylesheet per page, in the browser and in the build; the whole first screen of a photo
  page at 390 px, HTML, CSS, fonts, script and images together, ≤ 400 KB; Lighthouse SEO ≥ 95 on a production-mode build
  (`lighthouserc.seo.json`, `pnpm test:lighthouse:seo`, in CI and in `pnpm qa:production`), judged on the worst of three runs,
  because a median can hide one bad run and the staging build says noindex, which scores SEO down by design.
  **INP < 100 ms is measured**: Lighthouse measures a page load and cannot report it, so `qa/budgets.spec.ts` drives real input
  (clicks on the theme button and the report disclosure, typing in the comment form) on the 390 px, CPU ×4 phone and reads the
  browser's own Event Timing. Event Timing lists only events over 16 ms, and the test also checks the browser counted the
  interactions, so "nothing listed" cannot pass for "nothing measured". Today: 24 to 32 ms. This is a lab figure; INP of real
  visitors needs real traffic (Chrome UX Report) and cannot be measured before launch.
- **Narrow checks** (W-05). AAA contrast (7:1) is checked on all text in `<main>` (the Now paragraph included) on every page,
  both themes, at 1440 and 390 px; left out and held to AA: `.fine` (dates, sizes, the Now label) and `/styleguide`. The theme
  button's name is checked after a system theme change in both directions, with and without a stored choice.
- **Expected failures** (W-06): none remain; every `BUG-n` test is an ordinary test.
- **Tolerances** (W-08). The background form may move the view only as far as the focus needs (how far the message was off
  screen plus its own height), not 900 px. The visual comparison is exact (`threshold: 0`, `maxDiffPixels: 0`): the 1%
  allowance was a block 200 px square on a 1440 px page, and Playwright's colour `threshold` (0.2) ignored a colour that moved a
  few steps, which is what round 2's two colour changes were; they passed against the old baselines. Baselines were regenerated
  with `--update-snapshots=all`, every page looked at, and committed before the tolerance was tightened. **The aborted image
  request** (`net::ERR_ABORTED`, also on unchanged main) had two causes, both in the test: a full-page screenshot makes Chromium
  enlarge the viewport, and `<picture>` then picks another source mid-capture; and the italic face is `font-display: optional`,
  so a first visit drew upright "italics" or real ones depending on how busy the machine was. The test now makes the viewport as
  tall as the page first, loads and waits for every image, and takes its screenshots as a returning visitor (fonts loaded once
  before). `pnpm test:visual` needs no tolerance and passed 128 times in a row.
- **W-09**: a font face that is `optional` and in error state is not a failure by itself (Firefox says "error" for one it chose
  not to use, with a 200 and nothing logged). A face that really fails still fails the test, through the failed request, the
  answer of 400 or more, or the decode error in the console that `watch` records; a test deletes the file to prove it.
- **W-10**: front matter is read with LF, CRLF and a byte-order mark. Fixed waits replaced by waits on the thing awaited: the
  autosave (waits for the draft in storage), the offline save (waits for the failed request), the upload retry (waits for the
  page to say "retrying (2 of 5)"), the security probe (waits for the four violation events), navigation (the leftover
  transition wait is gone). **Kept, with the reason:** the 3.2 to 3.3 s pauses before a form is sent (the Worker refuses a
  form sent in under 3 s: the wait is the protocol); `settle()`'s 100 ms and `fonts.ts`' 100 ms polling (with JavaScript off
  nothing inside the page runs timers, so quiet is judged from outside); the 600 ms in the no-JavaScript form test (it asserts
  that the view does NOT move afterwards, which needs a quiet period).
- **W-11**: an ordinary outbound `<a href>` no longer fails the build-output test; what fails is anything the browser would
  fetch, connect to or post to on another host (`src`, `srcset`, `poster`, `data`, a form `action`, and a `<link>` that
  loads), with a test of both sides.
- **Requirements added:** main navigation and header controls at least 44 × 44 px at 390 and 320 px on every page; visible
  focus at 390, 1024 and 1440 px in both themes; `prefers-contrast: more` rendered (the tokens change, muted text takes the text
  colour, all text in `<main>` reaches 7:1 in both themes at both widths).
- **`/404` asked for directly answers 200: accepted** (BUG-8, owner, 2026-11-16). The page is noindex in its markup and its
  header, nothing links to it and the sitemap omits it; a test pins exactly those conditions.

## Round 3, follow-up (2026-11-16): two tests that could not be trusted

Tests only; the site is unchanged.

- **The prefers-contrast check failed once in a full run and passed alone.** The check was axe's AAA rule on the comment
  form's Send button on `/lisbona` at 1440 px (6.71:1, where the button is 7.0 or more). Cause, found by reproducing it (9 of
  144 loads of that page, many at a time): on some loads, mostly on a busy machine, a style update happens before the
  stylesheet is applied, so the Send button, the inputs and the header controls first have the browser's own style (the
  button's face is `rgb(240, 240, 240)`) and then ease to their real colours when the stylesheet arrives: `.btn` over 150 ms
  (`--dur-fast`), the body over 250 ms. `transitionrun` events fire at about 60 ms, while the document is still `interactive`.
  A test that reads a colour right after `goto` can therefore read a frame of that ease (#4d6027 and #576833, between grey and
  #4a5d23). It was never the contrast of the design, never the emulated preference arriving late (the tokens were right), and
  not hover (the mouse was nowhere near).
  **Fix, in two layers.** (1) The two prefers-contrast tests emulate `prefers-reduced-motion: reduce`, which sets both
  durations to 0 ms (`tokens.css`), so there is no ease to read; the settled colours are the same, and the tokens test and the
  "drawn" check say so. Measured on the same stress: 9 of 144 without it, 0 of 144 with it. (2) A new helper, `transitionsDone`
  (`qa/lib.ts`), waits until no CSS transition is running, polling from the test so it also works with JavaScript off; it is
  used in those two tests and in the other two that read a drawn colour straight after `goto` (the body text ratio in
  `theme.spec.ts`, the print background in `print-cookies.spec.ts`). The helper alone was not enough in my stress probe (0 to 5
  misses in 144, which I could not explain by a transition starting after the wait), so reduced motion is the part that makes
  the check deterministic, and the helper is a second guard that has its own control test (it waits for a transition started
  on purpose, and the colour after the wait is the final one).
  **Observation for the owner, not changed here:** the same thing means a visitor on a slow stylesheet may see the Send
  button and the form fields fade in from the browser's grey for 150 ms (not checked by eye: the test only sees the colours). See `docs/qa/bug-reports.md`, OBS-1.
- **The phone test "nothing scrolls sideways" on the write page could not fail.** It compared `scrollWidth` with `innerWidth`,
  and with phone emulation (`isMobile`) the layout viewport widens to fit the content, so `innerWidth` grows with the page. It
  now compares with the width the test set (390 px, `page.viewportSize()`), in both places that measure it. Proved: with a table
  900 px wide put into the admin page, the test fails (526 px too wide); the old measure stayed at 0 on the same page (it passed
  its sideways line; the test then timed out later, on a control the wide table had pushed off screen). A control test keeps
  this: it adds a 700 px element, expects the new measure to see it and the old one not to.

## Round 4 (2026-11-17): the launch gate sees every placeholder

Tests only; the site is unchanged, and no text of the owner's was touched.

- **The gap.** The launch gate's first test looked only for `[placeholder…]` and `[segnaposto…]` at the start of a
  bracket. The review of PR #35 found it let through `[launch date]`, `[city]` and `[your contact email]` on the privacy
  page, their Italian twins, `[your contact email]` on the rights pages, and site.json's `[contact email]` and `[city]` on
  About, while setup.md's launch blocker 3 relied on it. Scanning every bracket in the built pages (not only the sources)
  found more: the home page's "Based in [City]" / "Vivo a [città]" (`heroBased` in `src/i18n`), the About portrait's label
  (`[Portrait … placeholder until …]`: the word is in the middle), the Italian placeholders with the word in the middle
  (`[Testo segnaposto in italiano: …]`, `[Testo alternativo segnaposto: …]`, `[serie segnaposto]`), and the `[ photo ]`
  frame drawn where a photograph's original is missing.
- **The rule** (`scripts/lib/placeholders.ts`, `findPlaceholders`): a bracket counts when the word `placeholder` or
  `segnaposto` is anywhere inside it, or when its whole text is one of a fixed list of field names in both languages
  (`city`, `città`, `launch date`, `data di lancio`, `contact email`, `your contact email`, `la tua email di contatto`,
  `photo`; case and spacing ignored). `<script>`, `<style>`, `<code>` and `<pre>` are left out first (CSS selectors,
  JSON-LD arrays, a bracket shown on purpose). Everything else, such as `[photography]`, `[sic]` or `[city centre]`, is text.
  The rule reads the built HTML as a whole, so the visible text, `title`, `description`, `alt` and `aria-label` are all
  covered. A new kind of placeholder gets a name in the list and a test, never a looser pattern. `launch.spec.ts` uses it
  for every built page except `/styleguide` (each failure line is the page path and the bracketed text) and for
  `security.txt`.
- **The proof** (`tests/unit/placeholders.test.ts`): each placeholder of the review is found as written, in both
  languages; the legitimate brackets above are not; and over the current build every flagged text is either one the old
  pattern caught, one of the ten the review found, or an Italian mid-word one, so the new rule flags nothing it should
  not (a subset check, so the test keeps passing while the owner fills the gaps). The same scan found no bracket in a
  built page that is not flagged: every `[…]` in the build today is a placeholder.
- **On CI** the gate is still informational (`continue-on-error` in `ci.yml`) until owner question O1 is answered; that
  is unchanged. It now fails on today's content with 84 lines (e.g. `/privacy: [launch date]`, `/it/rights: [la tua email di
contatto]`, `/about: [city]`, `/: [City]`).
