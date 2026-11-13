# Tickets

Work for the agents after the Lead, in the order of `docs/guide.md` ("Agent prompts"). Each agent reads `CLAUDE.md`
and its own prompt in the guide; the prompt is the full spec, the tickets below are the checklist. **Acceptance
criteria always include the brief's non-negotiables** (numbers refer to `CLAUDE.md`). A ticket is done only when its
tests pass in CI. Agents 3, 4 and 5 can run in parallel: they own different folders (see "Ownership").

**No translation tooling, ever** (brief rule 5, decision 0012): both language versions are written by hand. Do not add
a translation script, CI job, `translate`/`review` command, AI or translation API, key, secret or dependency.

## Open owner questions — do not guess these

| #   | Question                                                                                                                                                                                                                                                                                                                                     | Blocks      | Default until answered                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| O1  | **Placeholders:** contact email (guide suggests `phil@philglov.es`), city, launch date, partita IVA (only if any), the list of profiles for `sameAs`, a real photo for About, the 2–3 sentence bio.                                                                                                                                          | F6a, F1, C5 | visible `[placeholder]` text; QA fails it before launch |
| O5  | **Expired Access login on /admin:** Access redirects a post to its sign-in page on another origin, and the admin CSP (`form-action 'self'`) makes the browser block it, so nothing happens on screen (with or without JavaScript). Add the team domain to `form-action`, or have the script reload the page instead of posting in that case? | B11         | the plain post, blocked as today; reload to sign in     |

Settled by the owner on 2026-11-13: O4, rule 11 means no errors from the site's own code. The browser's own "Failed
to load resource" line for a page served with a 4xx status (404, and the 422/429 answer to a failed plain form post) is
expected and does not count; the 422 stays (CLAUDE.md rule 11, decision 0018).

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
- [x] D6 Cross-document view transitions, CSS only.
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
      Open: O5.
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

- [ ] Q1 console and network (no errors, warnings, failed requests, ≥ 400, or other hosts) — rule 2 and 11. Q2 axe +
      keyboard. Q3 visual regression, no horizontal scroll at 320 px and 200 % zoom. Q4 theme. Q5 i18n: twin or graceful
      fallback; the switch goes to the twin; lang, hreflang (pairs only when both exist) and the label are right for
      originals, translations and one-language entries. Q6 forms against a local Worker. Q7 html-validate + link crawl.
      Q8 Lighthouse (95 floor, LCP < 2 s, CLS < 0.05, budgets) and an SEO run against a `SITE_ENV=production` build.
      Q9 headers. Q10 images. Q11 SEO. Q12 phone publishing (writing the other-language version of an existing entry
      creates its twin with the right `originalLang`). Q13 print and cookies. Q14 rights and privacy. Q15 live-site check
      through an Access service token.
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
- [ ] Q19 View transitions: in Chromium (Playwright, motion allowed), plain same-origin link clicks on public pages
      raise an uncaught InvalidStateError, "Transition was aborted because of invalid state. ViewTransition opt-in
      disabled", in about 5 of 8 clicks (found 2026-11-13 while testing B11; `/` ↔ `/about` against `pnpm preview`).
      None with reduced motion, which turns `@view-transition` off in `site.css`. Existing tests never click links with
      motion allowed, so they miss it. Find the cause (headless only, or real), then fix it or settle it as browser
      noise with the owner; `tests/e2e/admin.spec.ts` runs with reduced motion until then.
- _Done when: the full matrix passes twice in a row with no flaky tests; `QA-REPORT.md` written._

## 8 · Security audit (S) — Opus, xhigh — runs last

- [ ] S1–S11 as in the guide's prompt 8 (headers and CSP on every response type, form fuzzing, `/admin` path tricks,
      dependencies and install scripts, secrets and history — no AI or translation API key exists anywhere — accounts,
      privacy, phone publishing, backup restore, data jurisdiction, Cloudflare dashboard extras). Public repository:
      also check that no secret or personal data is in any commit, branch or pull request. _Done when:
      `SECURITY-REPORT.md` with ranked findings, each re-tested after its fix._
