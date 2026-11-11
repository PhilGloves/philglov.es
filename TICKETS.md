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

Settled by the owner on 2026-11-11 (new guide): the font budget is 4 files (Archivo upright only, Source Serif 4 upright
and italic, JetBrains Mono); there is no AI translation, so the questions about the translation job, branch protection
and the translation provider no longer exist.

Defaults from the guide in use until the owner says otherwise: comment email required and never shown; every comment
pre-moderated; camera data shown in monospace; AI assistants may open a page on request; no newsletter at launch.

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

## 2 · Design system (D) — Sonnet, high

Prototypes win over the prompt where they differ, except where the brief sets a budget (then ask the owner).

- [ ] D1 `src/styles/tokens.css`: light/dark colour tokens via `[data-theme]` with `prefers-color-scheme` default;
      measured contrast ratios in a comment. _Done when: body text ≥ 7:1 and every other pair ≥ 4.5:1 in both themes
      (rule 6)._
- [ ] D2 Self-hosted WOFF2 fonts in `public/_assets/fonts/`, Latin + Latin Extended-A, `font-display: swap`: Archivo
      upright (width axis; no italic, which the prototypes never use), Source Serif 4 upright and italic, JetBrains Mono.
      Preload Archivo and Source Serif upright, not the italic. Size-adjusted fallbacks. If the variable files exceed the
      budget, pin unused axes, narrow axis ranges to what the design uses, or use static instances, and report the real
      sizes before asking to raise it. _Done when: ≤ 4 files and ≤ 120 KB (rule 8)._
- [ ] D3 Spacing (4 px base), radius (pill buttons, 5 px inputs, 0 photos), motion tokens (150/250 ms ease-out) off
      under `prefers-reduced-motion`.
- [ ] D4 12-column grid (labels left 3, content right 9), labels above content below ~1040 px, one column on phones.
      _Done when: art-directed at 1440, 1024, 768, 390 and fluid to 320 with no horizontal scroll (rule 7)._
- [ ] D5 Components (header/nav, theme toggle, language switch, language label with its marker — IT, EN, IT→EN, EN→IT,
      `IT only`, `solo EN` — journal table with stacked phone layout, latest entry, Now band, article body, photo grid,
      single photo, numbered comments with author replies, comment form, footer with `<details>` report form, focus and
      error states). _Done when: they match Home.dc.html and Article.dc.html side by side._
- [ ] D6 Cross-document view transitions, CSS only.
- [ ] D7 `/styleguide` (not in nav, noindex) with every component in both themes.
- [ ] D8 One stylesheet with `@layer reset, tokens, base, layout, components, utilities`; container queries; logical
      properties; no `!important`, no IDs, no framework. _Done when: ≤ 20 KB compressed (rule 8)._
- [ ] D9 Placeholder brand in `src/assets/brand/` behind one config: moss rounded-square favicon (SVG, 32 px PNG,
      180 px apple-touch-icon; replaces the Lead's `public/favicon.svg`) and the 1200×630 share-image template.
- [ ] D10 Print stylesheet. D11 phone-first `/admin` styles. D12 no inline styles anywhere; per-item values via classes.

## 3 · Frontend (F) — Sonnet, medium

- [ ] F1 Base layout: lang, meta description, canonical, hreflang en/it/x-default **only when the other-language version
      exists** (`hasTwin` in the Lead's `BaseLayout.astro`), Open Graph and Twitter tags, skip link, header, `main#main`,
      footer. Inline theme script ≤ 1 KB in `<head>` (localStorage in try/catch, system fallback); write its SHA-256 to a
      build file and feed it to `contentSecurityPolicy()` in `worker/src/headers.ts`. _Done when: public JS ≤ 1.5 KB
      (rule 3); CSP has the hash and no `unsafe-inline` (rule 4); no theme flash._
- [ ] F2 Pages in both languages: Home, `/journal` and `/journal/<tag>` (paginated at 50: `/journal/page/2`), entry,
      Photos, series, single photo, Now ("Updated <date>"), About, Rights, Privacy, bilingual 404. Entry numbers from
      publication order, reading time from word count. Journal index and topic pages also list entries that exist only
      in the other language, marked `IT only` / `solo EN`, linking to the existing version with the right `lang`.
- [ ] F3 Entry page: comments slot `<section id="comments" data-slug>`, comment form POST to `/api/comment` (name,
      email, comment, honeypot, empty token field, slug/lang), consent line linking `/privacy`, marked slots for the
      Worker's messages. _Done when: works with JS off (rule 3)._
- [ ] F4 Footer on every page: bilingual error-report text and `<details>` POST form to `/api/report`; rights line
      linking `/rights`.
- [ ] F5 Language switch to the twin; with no twin, link to the other home and say so. "Originally written in" label on
      every entry from the guide's table: original with a twin, own translation, original not yet translated
      (decisions 0003, 0012).
- [ ] F6 Feeds per language (an entry appears only in the feed of each language it exists in), `sitemap.xml` with
      hreflang pairs only where both versions exist, `robots.txt` from the guide. Add each new root file to
      `run_worker_first`'s `!` list. F6a `/rights`, `/privacy` and Italian twins from the guide's texts, unchanged apart
      from placeholders (rule 13). F6b AI opt-out from `src/data/ai-bots.json`: robots.txt, `/.well-known/tdmrep.json`,
      `<meta name="tdm-reservation">` (already in the placeholder layout), `X-Robots-Tag: noai, noimageai` on image files
      via `scripts/postbuild.ts`. F6c ImageObject JSON-LD on photo pages. Person JSON-LD on home and About, BlogPosting on
      entries (rule 12).
- [ ] F7 No client framework, no hydration. _Done when: every page passes html-validate, a keyboard-only walkthrough,
      works with JS off, and matches the design at all four widths._

## 4 · Content & i18n (C) — Sonnet, medium

Both versions are written by hand. The schema has no `translation` field: a page is the original when `lang` equals
`originalLang`, a translation otherwise (decision 0012).

- [ ] C1 Helpers: find a page's twin; return the label text from the guide's table (original with a twin, translation,
      original without a twin × en / it) and the marker (IT, EN, IT→EN, EN→IT, `IT only`, `solo EN`).
- [ ] C2 Build check failing on: reserved or duplicate slug; a translation (lang ≠ originalLang) with no original twin;
      a translation whose `originalLang` doesn't match its twin's `lang`; file folder not matching `lang`; missing alt
      text in the page's own language. Also silences the "No files found" loader warnings once seed content exists.
- [ ] C3 One-language entries: listed in the other language's journal index and topic pages with the `IT only` /
      `solo EN` marker, linking to the existing version with the right `lang` attribute; no hreflang pair; only in their
      own language's feed. Other-language alt text and captions are hand-written; an entry photo may carry alt text in
      one language until its entry is translated.
- [ ] C4 `pnpm new <slug> --lang it|en`: creates a correctly filled Markdown file for a new entry; when the slug already
      exists in the other language, creates that entry's other-language version with `originalLang` set from the
      existing file.
- [ ] C5 Seed content: one entry written in Italian with a hand-written English version, one entry that exists in
      English only, one Now page, one About page.
- [ ] C6 All UI strings in `src/i18n/{en,it}.json` (started by the Lead).
- _Done when: the sample entry shows the right label in both languages, the build check catches a deliberately broken
  twin, and the English-only entry is listed correctly in the Italian index._

## 5 · Backend (B) — Opus, high

Only runtime dependency allowed: `jose`. No framework. Stay within 10 ms CPU per request. Never log personal data.

- [ ] B1 D1 schema and migrations in `worker/migrations/` (comments, reports, rate_limits, drafts). CI already applies
      migrations when that folder has `.sql` files.
- [ ] B2 `POST /api/comment` and `POST /api/report`, urlencoded, full server-side validation (lengths, ≤ 2 links,
      honeypot, HMAC timestamp 3 s–24 h, 5 per 10 min per salted IP hash); 303 with `?sent=…` on success; 422 with
      field errors and preserved, escaped input.
- [ ] B3 Comments injected with HTMLRewriter (`html: false`), numbered, author replies set off; 60 s fragment cache;
      fail open; drop ETag on rewritten responses. Build writes `/_assets/entries.json`.
- [ ] B3b Fresh signed token in every form on every HTML response; `Cache-Control: no-cache` on HTML (already set).
- [ ] B4 `/admin` and `/admin/action`: Access JWT verified with jose (team domain and AUD per environment), CSRF token,
      approve / reject / reply / mark done / delete.
- [ ] B5 Notifications behind a config switch, off on staging ("notification skipped"): page title and `/admin` link
      only.
- [ ] B6 Scheduled retention job (IP hashes 30 d, rejected comments 30 d, done reports 12 months).
- [ ] B7 Security headers on all responses (use `worker/src/headers.ts`); admin gets its own CSP and noindex.
- [ ] B8 `/admin/write`: phone form, slug suggestion, R2 uploads (JPEG/PNG by signature, ≤ 25 MB, streamed, retry),
      drafts, Publish → PR through the GitHub App. When the slug already exists in the other language, the new text is
      that entry's other-language version: set `originalLang` from the existing file and show the existing text under
      the form for reference. No translation, no Mark reviewed.
- [ ] B9 Weekly backup of comments and reports to the backups bucket, 12 weeks kept. B10 Workers Logs + error-rate alert.
- _Done when: forms work with JS off, spam is rejected with a clear message, an approved comment appears within a
  minute, `/admin` returns 403 without a valid Access token; unit tests for every validation rule, the rate limiter and
  an XSS payload rendering as text._

## 6 · Photo pipeline (P) — Sonnet, medium

- [ ] P1 `scripts/fetch-originals.ts` (CI already calls it when it exists, with `R2_*` env vars): download originals not
      in the cache to `src/.originals/`; portfolio series and entry photos (`philglov-originals/<slug>/`).
- [ ] P2 `<Picture>` AVIF/WebP/JPEG, widths 480–2400, correct `sizes`, width/height always, lazy except the first image.
- [ ] P3 Post-build exiftool: creator, copyright, credit, web statement, `plus:DataMining` prohibited except search
      indexing; EXIF shown as mono text.
- [ ] P4 Dominant-colour placeholders via build-generated classes. P5 per-breakpoint crops. P6 single-photo page.
      P7 dark backdrop option if the designer approves.
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
- [ ] Q16 Lighthouse stability: on the Lead's Windows laptop about 2 in 9 `lhci autorun` runs died with Lighthouse's
      `NO_NAVSTART` trace error (no assertion failed). Confirm CI on Linux is stable, or fix the cause; do not paper
      over it with retries.
- _Done when: the full matrix passes twice in a row with no flaky tests; `QA-REPORT.md` written._

## 8 · Security audit (S) — Opus, xhigh — runs last

- [ ] S1–S11 as in the guide's prompt 8 (headers and CSP on every response type, form fuzzing, `/admin` path tricks,
      dependencies and install scripts, secrets and history — no AI or translation API key exists anywhere — accounts,
      privacy, phone publishing, backup restore, data jurisdiction, Cloudflare dashboard extras). Public repository:
      also check that no secret or personal data is in any commit, branch or pull request. _Done when:
      `SECURITY-REPORT.md` with ranked findings, each re-tested after its fix._
