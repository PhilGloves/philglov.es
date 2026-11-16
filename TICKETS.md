# Tickets

Work for the agents after the Lead, in the order of `docs/guide.md` ("Agent prompts"). Each agent reads `CLAUDE.md`
and its own prompt in the guide; the prompt is the full spec, the tickets below are the checklist. **Acceptance
criteria always include the brief's non-negotiables** (numbers refer to `CLAUDE.md`). A ticket is done only when its
tests pass in CI. Agents 3, 4 and 5 can run in parallel: they own different folders (see "Ownership").

**No translation tooling, ever** (brief rule 5, decision 0012): both language versions are written by hand. Do not add
a translation script, CI job, `translate`/`review` command, AI or translation API, key, secret or dependency.

## Open owner questions — do not guess these

| #   | Question                                                                                                                                                                                            | Blocks      | Default until answered                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| O1  | **Placeholders:** contact email (guide suggests `phil@philglov.es`), city, launch date, partita IVA (only if any), the list of profiles for `sameAs`, a real photo for About, the 2–3 sentence bio. | F6a, F1, C5 | visible `[placeholder]` text; QA fails it before launch |

Settled by the owner on 2026-11-13 (publishing): O5, the admin CSP stays as it is; when a background request on
`/admin` finds the Access login expired, the page reloads so Access can sign in again. Publish goes live by itself
(auto-merge, guarded in CI), published entries are edited from the phone, and the view transitions are removed (Q19)
(decision 0021).

Settled by the owner on 2026-11-13: O4, rule 11 means no errors from the site's own code. The browser's own "Failed
to load resource" line for a page served with a 4xx status (404, and the 422/429 answer to a failed plain form post) is
expected and does not count; the 422 stays (CLAUDE.md rule 11, decision 0018).

Settled by the owner on 2026-11-16 (QA, BUG-9): `Cross-Origin-Opener-Policy` stays, and a browser engine's own notice
about cross-origin isolation (WebKit prints one on every page) does not count as a console warning under rule 11, as O4
ruled for the 404 line ([0026](docs/decisions/0026-coop-stays.md)).

Settled by the owner on 2026-11-12 (backend): O2, the notification address is only ever the `NOTIFY_TO` Worker secret,
never in `wrangler.jsonc`; O3, every error report is deleted 12 months after it arrived, open or done, as the privacy
notice says (decision 0017).

Settled by the owner on 2026-11-12 (new guide and prototypes): one typeface, Crimson Pro, two files (upright 300–600,
italic 300–400), font budget 80 KB (rule 8); shipped 64 KiB. Archivo, Source Serif 4 and JetBrains Mono are gone
(decision 0015, which supersedes the typography of 0014).

Settled by the owner on 2026-11-11 (new guide): there is no AI translation, so the questions about the translation job, branch protection
and the translation provider no longer exist.

Defaults from the guide in use until the owner says otherwise: comment email required and never shown; every comment
pre-moderated; camera data shown in small muted text; AI assistants may open a page on request; no newsletter at launch.

## Ownership

| Area                                                                           | Owner        |
| ------------------------------------------------------------------------------ | ------------ |
| `src/styles/`, `src/assets/brand/`, `/styleguide`                              | Design (D)   |
| `src/layouts/`, `src/components/`, `src/pages/`, `public/` (non-font)          | Frontend (F) |
| `src/content/`, `src/content.config.ts`, `src/i18n/`, `scripts/new.ts`         | Content (C)  |
| `worker/`                                                                      | Backend (B)  |
| `scripts/fetch-originals.ts`, image components, `src/content/photos/` pipeline | Photo (P)    |
| `tests/` (beyond the Lead's smoke tests), `QA-REPORT.md`                       | QA (Q)       |
| `SECURITY-REPORT.md`                                                           | Security (S) |

Shared files (`CLAUDE.md`, `wrangler.jsonc`, `package.json`, `.github/`): change them in your own commit with a clear
message; add a decision record for anything architectural.

## Lead (done in this pull request)

- [x] L1 Astro 7 scaffold, static output, TS strictest, pnpm, ESLint + Prettier, html-validate, `/worker`, wrangler
      with staging / preview / production environments. _Done: `pnpm build` produces `dist/` with the placeholder home in
      both languages._
- [x] L2 Folder layout, content schemas, i18n config, placeholder pages, shared security headers, `dist/_headers`.
- [x] L3 CI: lint → typecheck → build → html-validate → unit → e2e → Lighthouse → deploy (switched by variables). No
      translation step. Dependabot weekly for npm and Actions.
- [x] L4 README, CLAUDE.md, TICKETS.md, docs/setup.md, docs/decisions/0001–0012.
- [x] L6 Removed all translation tooling after the owner's change of plan (decision 0012): `scripts/translate.ts`,
      `scripts/translate-pr.ts`, their unit test, the `translate` and `translate:pr` scripts, the CI `Translate` job and
      its `TRANSLATE_API_KEY` reference, and the `translation` frontmatter field.
- [x] L5 CI green on GitHub (PRs #1–#3 merged after green `Test`); first preview and staging deploys from CI.
- [x] L7 `main` protected by the "Protect main" ruleset; handover note in `docs/handover.md`.

## 2 · Design system (D) — Sonnet, high — done 2026-11-12, see decision 0014 and handover

Prototypes win over the prompt where they differ, except where the brief sets a budget (then ask the owner).

- [x] D1 `src/styles/tokens.css`: light/dark colour tokens via `[data-theme]` with `prefers-color-scheme` default;
      measured contrast ratios in a comment. _Done when: body text ≥ 7:1 and every other pair ≥ 4.5:1 in both themes
      (rule 6)._
- [x] D2 Self-hosted WOFF2 fonts in `public/_assets/fonts/`: one family, Crimson Pro, upright variable 300–600 and
      italic variable 300–400, Latin subset, `font-display: swap`, only the upright preloaded, size-adjusted fallbacks
      (Iowan Old Style, Palatino Linotype, Palatino, Georgia). Light 300 only at 28 px and larger; no monospace or
      sans-serif web font (code uses the system monospace); one inline SVG arrow. _Done when: ≤ 2 files and ≤ 80 KB
      (rule 8)._ _Done 2026-11-12: 2 files, 64 KiB (decision 0015)._
- [x] D3 Spacing (4 px base), radius (pill buttons, 5 px inputs, 0 photos), motion tokens (150/250 ms ease-out) off
      under `prefers-reduced-motion`.
- [x] D4 12-column grid (labels left 3, content right 9), labels above content below ~1040 px, one column on phones.
      _Done when: art-directed at 1440, 1024, 768, 390 and fluid to 320 with no horizontal scroll (rule 7)._
- [x] D5 Components (header/nav, theme toggle, language switch, language label with its marker — IT, EN, IT→EN, EN→IT,
      `IT only`, `solo EN` — journal table with stacked phone layout, latest entry, Now band, article body, photo grid,
      single photo, numbered comments with author replies, comment form, footer with `<details>` report form, focus and
      error states). _Done when: they match Home.dc.html and Article.dc.html side by side._
- [x] D6 Cross-document view transitions, CSS only. _Removed 2026-11-13 by the owner (Q19, decision 0021)._
- [x] D7 `/styleguide` (not in nav, noindex) with every component in both themes.
- [x] D8 One stylesheet with `@layer reset, tokens, base, layout, components, utilities`; container queries; logical
      properties; no `!important`, no IDs, no framework. _Done when: ≤ 20 KB compressed (rule 8)._
- [x] D9 Placeholder brand in `src/assets/brand/` behind one config: moss rounded-square favicon (SVG, 32 px PNG,
      180 px apple-touch-icon; replaces the Lead's `public/favicon.svg`) and the 1200×630 share-image template. _Done 2026-11-12 except one step: the template and its fill function exist and are tested; rasterising the SVG to the PNG that social networks need is done by `scripts/share-images.ts` (0016)._
- [x] D10 Print stylesheet. D11 phone-first `/admin` styles. D12 no inline styles anywhere; per-item values via classes.

## 3 · Frontend (F) — Sonnet, medium

- [x] F1 Base layout: lang, meta description, canonical, hreflang en/it/x-default **only when the other-language version
      exists** (`hasTwin` in the Lead's `BaseLayout.astro`), Open Graph and Twitter tags, skip link, header, `main#main`,
      footer. Inline theme script ≤ 1 KB in `<head>` (localStorage in try/catch, system fallback); write its SHA-256 to a
      build file and feed it to `contentSecurityPolicy()` in `worker/src/headers.ts`. _Done when: public JS ≤ 1.5 KB
      (rule 3); CSP has the hash and no `unsafe-inline` (rule 4); no theme flash._
- [x] F2 Pages in both languages: Home, `/journal` and `/journal/<tag>` (paginated at 50: `/journal/page/2`), entry,
      Photos, series, single photo, Now ("Updated <date>"), About, Rights, Privacy, bilingual 404. Entry numbers from
      publication order, reading time from word count. Journal index and topic pages also list entries that exist only
      in the other language, marked `IT only` / `solo EN`, linking to the existing version with the right `lang`.
- [x] F3 Entry page: comments slot `<section id="comments" data-slug>`, comment form POST to `/api/comment` (name,
      email, comment, honeypot, empty token field, slug/lang), consent line linking `/privacy`, marked slots for the
      Worker's messages. _Done when: works with JS off (rule 3)._
- [x] F4 Footer on every page: bilingual error-report text and `<details>` POST form to `/api/report`; rights line
      linking `/rights`.
- [x] F5 Language switch to the twin; with no twin, link to the other home and say so. "Originally written in" label on
      every entry from the guide's table: original with a twin, own translation, original not yet translated
      (decisions 0003, 0012).
- [x] F6 Feeds per language (an entry appears only in the feed of each language it exists in), `sitemap.xml` with
      hreflang pairs only where both versions exist, `robots.txt` from the guide. Add each new root file to
      `run_worker_first`'s `!` list. F6a `/rights`, `/privacy` and Italian twins from the guide's texts, unchanged apart
      from placeholders (rule 13). F6b AI opt-out from `src/data/ai-bots.json`: robots.txt, `/.well-known/tdmrep.json`,
      `<meta name="tdm-reservation">` (already in the placeholder layout), `X-Robots-Tag: noai, noimageai` on image files
      via `scripts/postbuild.ts`. F6c ImageObject JSON-LD on photo pages. Person JSON-LD on home and About, BlogPosting on
      entries (rule 12).
- [x] F7 No client framework, no hydration. _Done when: every page passes html-validate, a keyboard-only walkthrough,
      works with JS off, and matches the design at all four widths._

## 4 · Content & i18n (C) — Sonnet, medium

Both versions are written by hand. The schema has no `translation` field: a page is the original when `lang` equals
`originalLang`, a translation otherwise (decision 0012).

- [x] C1 Helpers: find a page's twin; return the label text from the guide's table (original with a twin, translation,
      original without a twin × en / it) and the marker (IT, EN, IT→EN, EN→IT, `IT only`, `solo EN`).
- [x] C2 Build check failing on: reserved or duplicate slug; a translation (lang ≠ originalLang) with no original twin;
      a translation whose `originalLang` doesn't match its twin's `lang`; file folder not matching `lang`; missing alt
      text in the page's own language. Also silences the "No files found" loader warnings once seed content exists.
- [x] C3 One-language entries: listed in the other language's journal index and topic pages with the `IT only` /
      `solo EN` marker, linking to the existing version with the right `lang` attribute; no hreflang pair; only in their
      own language's feed. Other-language alt text and captions are hand-written; an entry photo may carry alt text in
      one language until its entry is translated.
- [x] C4 `pnpm new <slug> --lang it|en`: creates a correctly filled Markdown file for a new entry; when the slug already
      exists in the other language, creates that entry's other-language version with `originalLang` set from the
      existing file.
- [x] C5 Seed content: one entry written in Italian with a hand-written English version, one entry that exists in
      English only, one Now page, one About page.
- [x] C6 All UI strings in `src/i18n/{en,it}.json` (started by the Lead).
- _Done when: the sample entry shows the right label in both languages, the build check catches a deliberately broken
  twin, and the English-only entry is listed correctly in the Italian index._

## 5 · Backend (B) — Opus, high — built 2026-11-12, see decision 0017 and handover

Done in code and tests. Staging and preview have every secret and the AUD tags (`docs/setup.md` steps 9 and 10, done
2026-11-12/13). B10's alert is a dashboard step (step 18), not verified.

Only runtime dependency allowed: `jose`. No framework. Stay within 10 ms CPU per request. Never log personal data.

- [x] B1 D1 schema and migrations in `worker/migrations/` (comments, reports, rate_limits, drafts). CI already applies
      migrations when that folder has `.sql` files.
- [x] B2 `POST /api/comment` and `POST /api/report`, urlencoded, full server-side validation (lengths, ≤ 2 links,
      honeypot, HMAC timestamp 3 s–24 h, 5 per 10 min per salted IP hash); 303 with `?sent=…` on success; 422 with
      field errors and preserved, escaped input.
- [x] B3 Comments injected with HTMLRewriter (`html: false`), numbered, author replies set off; 60 s fragment cache;
      fail open; drop ETag on rewritten responses. Build writes `/_assets/entries.json`.
- [x] B3b Fresh signed token in every form on every HTML response; `Cache-Control: no-cache` on HTML (already set).
- [x] B4 `/admin` and `/admin/action`: Access JWT verified with jose (team domain and AUD per environment), CSRF token,
      approve / reject / reply / mark done / delete.
- [x] B5 Notifications behind a config switch, off on staging ("notification skipped"): page title and `/admin` link
      only.
- [x] B6 Scheduled retention job (IP hashes 30 d, rejected comments 30 d, every report 12 months after arrival, O3).
- [x] B7 Security headers on all responses (use `worker/src/headers.ts`); admin gets its own CSP and noindex.
- [x] B8 `/admin/write`: phone form, slug suggestion, R2 uploads (JPEG/PNG by signature, ≤ 25 MB, streamed, retry),
      drafts, Publish → PR through the GitHub App. When the slug already exists in the other language, the new text is
      that entry's other-language version: set `originalLang` from the existing file and show the existing text under
      the form for reference. No translation, no Mark reviewed.
- [x] B9 Weekly backup of comments and reports to the backups bucket, 12 weeks kept. B10 Workers Logs + error-rate alert.
- [x] B11 Moderation in the background (owner request 2026-11-13, decision 0020): with JavaScript on, approve, reject,
      reply, mark done and delete go through `/admin/moderation.js` and only that item's cards change (status, buttons,
      counts); without it, the plain posts as before. Same Access, CSRF and origin checks; fallback to the plain post.
      O5 settled: an expired login reloads the page (decision 0021).
- [x] B12 Publish goes live by itself (owner decision 2026-11-13, decision 0021): auto-merge on every publisher pull
      request; the Test job's inline step fails any publisher pull request that changes more than
      `src/content/journal/{en,it}/<slug>.md`; after Publish the page links to where the entry will be live; open
      publisher pull requests older than 15 minutes show as "needs attention". No new App permission.
- [x] B13 Editing a published entry from the phone (decision 0021): list newest first with a title search, the same
      form with slug and language fixed, photos with alt text and captions loaded back, one-file pull request with
      auto-merge, refused with a clear message when the entry changed on GitHub since it was opened.
- _Done when: forms work with JS off, spam is rejected with a clear message, an approved comment appears within a
  minute, `/admin` returns 403 without a valid Access token; unit tests for every validation rule, the rate limiter and
  an XSS payload rendering as text._

## 6 · Photo pipeline (P) — Sonnet, medium

- [x] P1 `scripts/fetch-originals.ts` (CI already calls it when it exists, with `R2_*` env vars): download originals not
      in the cache to `src/.originals/`; portfolio series and entry photos (`philglov-originals/<slug>/`).
- [x] P2 `<Picture>` AVIF/WebP/JPEG, widths 480–2400, correct `sizes`, width/height always, lazy except the first image.
- [x] P3 Post-build exiftool: creator, copyright, credit, web statement, `plus:DataMining` prohibited except search
      indexing; EXIF shown as mono text.
- [x] P4 Dominant-colour placeholders via build-generated classes. [x] P5 per-breakpoint crops. [x] P6 single-photo
      page. [-] P7 dark backdrop skipped: the owner decides after seeing real photos on staging. Entry photos are
      responsive WebP, ≤ 1600 px (0019). Not measured on real photos yet: the 400 KB first-screen test (`tests/e2e/photos.spec.ts`)
      and the exiftool tests run once CI has originals and exiftool (0019).
- _Done when: a 20-photo series first screen ≤ 400 KB at 390 px, every image has alt text in the page language, no
  output contains GPS (exiftool test)._

## 7 · QA (Q) — Sonnet, high — veto power

Extend `tests/e2e/` and `lighthouserc.json` (the Lead's smoke tests are the seed) to the full matrix in the guide:
every page × en/it × light/dark × 1440/1024/768/390/320 × JS on/off in Chromium; smoke subset in Firefox and WebKit.

- [x] Q1–Q15 written 2026-11-15, see [0022](docs/decisions/0022-qa-matrix.md), `tests/e2e/qa/` and `QA-REPORT.md`. Open
      findings are BUG-1 to BUG-8 in `docs/qa/bug-reports.md` (each with a `test.fail()` test where a browser can see
      it); the launch gate (`pnpm test:launch`) fails until O1 is answered. Not run yet: Q8's Lighthouse on this
      machine (Q17), Q15 against staging (needs an Access service token), the manual checks.
- [x] Q16 Lighthouse stability on CI: `/`, the first URL measured, failed performance in 2 of 18 CI attempts on
      2026-11-11 (0.81, then 0.87 with TBT 522 ms on a page with no JavaScript) and passed on re-run. Owner decision
      2026-11-12: three runs per URL, every budget judged on the median, budgets unchanged, every report kept
      ([0013](docs/decisions/0013-lighthouse-median-of-three.md)).
- [ ] Q17 Lighthouse on Windows: on the Lead's laptop `lhci autorun` sometimes dies with Lighthouse's `NO_NAVSTART`
      trace error (no assertion fails; about 2 in 9 runs with one run per URL, and 2 of 2 attempts with three). It has
      never happened on CI's Linux runner. Find the cause so the suite runs locally; do not paper over it with retries.
- [x] Q18 One-off e2e failure in `tests/e2e/pages.spec.ts` (first seen 2026-11-12 by the Frontend agent, then on CI
      on `main` after #10: `requestfailed: …/_assets/fonts/crimson-pro-italic.woff2`). _Cause:_ the upright Crimson Pro is
      preloaded and done before `load`, but the italic file is fetched only when italic text is first drawn, which can
      happen after `load` (a new viewport width in the matrix). The test then navigated to the next page while that
      request was in flight; Chromium aborted it (`net::ERR_ABORTED`) and the test counted it as a failed request. Not a
      site bug. Reproduced on purpose: italic drawn after `load` on a throttled connection, then an immediate
      navigation, gives exactly that error. _Fix (2026-11-12, no retries):_ `tests/e2e/fonts.ts` `fontsSettled()` waits
      for `document.fonts.ready` before each page is left and reports every font face whose load errored;
      `requestfailed` lines now carry Chromium's reason. A new test serves the italic file as 404 and checks it is still
      reported (HTTP 404 and `font failed`). The page matrix then passed 5 times in a row in both projects.
- [x] Q19 View transitions: in Chromium (Playwright, motion allowed), plain same-origin link clicks on public pages
      raised an uncaught InvalidStateError, "Transition was aborted because of invalid state. ViewTransition opt-in
      disabled", in about 5 of 8 clicks (found 2026-11-13 while testing B11). _Closed 2026-11-13 without
      investigation, by owner decision:_ the view-transition rules are removed from `site.css` (decision 0021).
      `tests/e2e/navigation.spec.ts` clicks through the site with motion allowed and expects an empty console (it fails
      with the old rule back); `tests/unit/css.test.ts` keeps the rules out; the admin tests no longer emulate reduced
      motion.
- [x] Q20 Flaky page matrix with real photos (found 2026-11-13, also on `main`): with photo originals in
      `src/.originals/`, `tests/e2e/pages.spec.ts` failed with `requestfailed: …/_assets/<photo>.avif (net::ERR_ABORTED)`
      (locally 5 of 6 runs with `--repeat-each 6`). CI has not shown it yet, likely because R2 has no photos so far.
      _Cause:_ not the next navigation, as first thought, but the test's own resizing. Tagging each abort with the step
      it happened in showed them all on the page itself, during or just after the change to a wider viewport, and
      always on the 1200w AVIF: the wider width makes the `<picture>` pick the 1600w candidate, and Chromium drops the
      1200w request still in flight. Users see no error from this; it happens because the test resizes faster than the
      photos load. Not a site bug. A wait before leaving the page alone did not help (still 1–5 failures per 6 runs).
      _Fix (2026-11-13, no retries):_ `tests/e2e/fonts.ts` `imagesSettled()` waits until no image with a current source
      is still loading (two checks in a row, 100 ms apart, polled from the test because the no-JS project runs no page
      callbacks; lazy images not yet started have no `currentSrc` and are skipped) and reports every image whose source
      failed (`image failed: <path>`). The page matrix calls it after every width, and `pageSettled()` (fonts and
      images) before leaving each page. A new test serves a lazy photo of the series as 404 and checks it is still
      reported (HTTP 404 and `image failed`); it skips without originals, like `photos.spec.ts`. The page spec then
      passed 5 runs in a row with `--repeat-each 6` in both projects, and the full `pnpm test:e2e` passed.
- _Done when: the full matrix passes twice in a row with no flaky tests; `QA-REPORT.md` written._

## 8 · Security audit (S) — Opus, xhigh — runs last

- [ ] S1–S11 as in the guide's prompt 8 (headers and CSP on every response type, form fuzzing, `/admin` path tricks,
      dependencies and install scripts, secrets and history — no AI or translation API key exists anywhere — accounts,
      privacy, phone publishing, backup restore, data jurisdiction, Cloudflare dashboard extras). Public repository:
      also check that no secret or personal data is in any commit, branch or pull request. _Done when:
      `SECURITY-REPORT.md` with ranked findings, each re-tested after its fix._

## 9 · Simplification pass (2026-11-15, owner decision, [0023](docs/decisions/0023-simplification-pass.md))

- [x] X1 Header controls: round theme toggle (moon in light, sun in dark; both inline SVG, CSS picks one; fixed name and
      `aria-pressed`; theme script unchanged, public JavaScript still 1,525 of 1,536 bytes) and round "IT"/"EN"
      language link (`lang`, `hreflang`, full name as the accessible name); 44 px on phones.
- [x] X2 Journal entries: text straight under the title; the details (number, date, reading time, label) in a block after
      the text; the description only in the head, feeds and share cards.
- [x] X3 No label on About and Now, in both languages.
- [x] X4 Topics removed everywhere (site, feeds, sitemap, `/admin/write`, `pnpm new`); old `tags:` lines tolerated.
- [x] X5 Replies signed "Phil" on English pages, "Filippo" on Italian pages.
- [x] X6 Tests, styleguide and docs updated; prototypes in `docs/design/` replaced by the owner.
- [x] X7 ([0024](docs/decisions/0024-no-breadcrumbs-tighter-heads-ringless-controls.md)) No breadcrumb anywhere; no heading
      that repeats the page title; tighter `.hero--inner` heads (journal index, photos index, series pages); header
      controls without a ring (transparent border kept for forced-colours mode), prototypes updated.
- [x] X8 ([0025](docs/decisions/0025-one-page-head.md)) One page head: mirror spacing under the header line (computed, 2 px,
      four widths), left column level with the title's capitals, one title size, one intro sentence, text 52/68/80 px
      under it; Home without the role line (name kept in a `.sr-only` span in the h1); prototypes and `/styleguide` updated.

## 10 · Fix rounds after QA (owner request 2026-11-16)

Three rounds, one pull request each, from `QA-REPORT.md`, `docs/qa/bug-reports.md` and the independent second opinion
(SO-01 to SO-10). Each fix comes with a test that fails before it; an expected-failure marker goes when its bug is fixed.

- [x] R1 Backend, round 1 ([0027](docs/decisions/0027-fix-round-1-backend.md)), done 2026-11-16:
  - [x] SO-01 Front matter survives both publishing paths: the content check and `pnpm new` read it with Astro's own
        parser; `/admin/write` keeps every line it does not change and refuses, with a message, what it cannot keep
        exactly (a folded or multi-line title or description, for example).
  - [x] SO-02 After an expired token, Send works again with JavaScript on (the answer carries the next token); public
        JavaScript 1,535 of 1,536 bytes.
  - [x] SO-03 After a saved draft is published, "Write another entry" opens an empty form.
  - [x] BUG-4 "Save draft" works with the description empty; Publish still requires it.
  - [x] SO-09 A report from a missing address names that address, in both languages.
  - [x] Staging `/_assets/` responses say noindex in their own rule (rule 15); production unchanged.
  - [x] TO-01 (third review) A photo still uploading holds Publish and Save draft with a message; they work again
        once it has finished or been removed.
  - [x] `.claude/` ignored by git, Prettier and ESLint, so `pnpm lint` is clean next to other sessions' worktrees.
- [x] R2 Frontend and design, round 2 ([0028](docs/decisions/0028-fix-round-2-frontend.md)), done 2026-11-16:
  - [x] BUG-5 and SO-04 Nothing a person can write widens the page, 320 to 1440 px (`overflow-wrap: anywhere` on `main`).
  - [x] BUG-2 The photos of a series grid (and every link around a photo) show the focus ring, both themes.
  - [x] BUG-1 The language switch is named "IT, Italiano" / "EN, English".
  - [x] BUG-3 and SO-08 AAA 7:1 for the sign-off, the footnotes, the facts and the Now paragraph: `--muted` #565652,
        `--band-text` #FAFCF4; prototypes and contrast floors updated.
  - [x] SO-06 Previous/next: only the entry title carries the other language's `lang`.
  - [x] SO-07 The sitemap lists `/journal/page/N` in both languages (pure `sitemapUrls`, tested with 51 entries).
  - [x] SO-10 One stylesheet per page (`cssCodeSplit: false`); a unit test counts them.
  - [x] SO-05 The theme button's name follows the system theme with no script (two hidden labels, no `aria-pressed`).
        Public JavaScript 1,410 of 1,536 bytes.
  - [x] BUG-8 (favicon) `/favicon.ico` is the site icon in an `.ico`, built by `postbuild`. (`/404` answering 200 is not
        part of this round.)
  - [x] BUG-6 A missing entry photo fails the build with the file names; `ALLOW_MISSING_ORIGINALS=1` (local only, refused
        on CI) builds with a grey stand-in and a warning (`docs/setup.md`).
  - [x] TO-02 Main navigation links are 44 × 44 px on phones, words unmoved.
  - [ ] TO-03 `site.json` `portrait` (owner: the real portrait); the Person data carries it as its image and the launch
        gate fails until it is set. Code done; waits for the photograph (with O1).
- [ ] R3 Round 3 (scope set by the owner).
