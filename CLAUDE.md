# CLAUDE.md — philglov.es

Read this first in every session. **Update it in the same commit whenever a rule, folder, command or decision
changes.** Detail lives in `docs/guide.md` (open only the section a task names) and decisions in `docs/decisions/`.
Work is split into tickets in `TICKETS.md`; owner-only steps are in `docs/setup.md`.

## Shared brief

PROJECT: Personal website for Filippo Guanti at philglov.es — the hub of my life: photography portfolio, About, Now,
and a journal (posts about projects, travels, experiences), in the spirit of sive.rs.

NON-NEGOTIABLES

1. Static first. Astro (current stable release) with static output. Content = Markdown files in /src/content. No CMS,
   no database for content.
2. Zero third-party requests. No CDNs, no Google Fonts, no analytics, no embeds, no CAPTCHA, no external widgets. Every
   byte comes from philglov.es.
3. JavaScript budget on public pages: ≤ 1.5 KB total, only for the light/dark toggle. Every public feature, including
   both forms, must work with JavaScript disabled. Only the private /admin pages may use more.
   _Owner decision 2026-11-13: the forms may also be sent in the background by one small same-origin script; the budget
   (counted as raw bytes, theme + form script) is unchanged ([0018](docs/decisions/0018-background-forms.md))._
4. Strict CSP, sent as an HTTP header by the Worker (default-src 'self'; no 'unsafe-inline' for scripts or styles; hash
   the one inline theme script; no inline style attributes anywhere).
5. Bilingual: English at /<slug>, Italian at /it/<slug>, the SAME short slug in both languages and no section folders in
   entry URLs (philglov.es/alps, philglov.es/it/alps). No trailing slashes. Never redirect by browser language. Every
   page has lang and originalLang in frontmatter; twins are the files with the same name in the en and it folders, and a
   page is a translation when its lang differs from its originalLang. Both versions are written by hand: no AI
   translation, no translation script, API or key, anywhere. An entry may exist in one language only. Every entry and
   the legal pages (Rights, Privacy) show the "originally written in" label; About and Now do not
   ([0023](docs/decisions/0023-simplification-pass.md)).
6. Accessibility: WCAG 2.2 AA, AAA body-text contrast, semantic HTML, skip link, visible focus, full keyboard use,
   descriptive alt text.
7. Responsive and art-directed separately at 1440, 1024, 768 and 390 px, and fluid in between down to 320 px.
8. Performance budget: text page ≤ 180 KB first visit; CSS ≤ 20 KB; fonts ≤ 2 files / 80 KB; LCP < 2 s on Slow 4G;
   CLS < 0.05. _Owner decision 2026-11-12: one typeface, Crimson Pro, two files ([0015](docs/decisions/0015-one-typeface-crimson-pro.md))._
9. Hosting: Cloudflare Workers with Static Assets; one Worker that runs first on every HTML request (it adds form tokens
   and comments) and serves /api/\* and /admin; D1 for comments, reports and drafts; R2 for photo originals and backups;
   D1 and R2 created in the EU jurisdiction; Cloudflare Access protects /admin.
10. Fewer than 10 direct dependencies. Justify each new one in the PR description. pnpm, lockfile committed.
    _Owner ruling 2026-11-11: the cap counts runtime `dependencies` only; dev tooling is justified one by one in
    [0007](docs/decisions/0007-dependency-cap.md)._
11. Zero console errors or warnings on any page, any theme, any language, any width.
    _Owner ruling 2026-11-13 (O4): this means errors from the site's own code. The browser's own "Failed to load
    resource" line for a page served with a 4xx status (the 404 page, the 422/429 answer to a failed form post) is
    expected and does not count; keep those statuses._
    _Owner ruling 2026-11-16 (BUG-9): the same for a browser engine's own notice about cross-origin isolation, which
    WebKit prints on every page that sends `Cross-Origin-Opener-Policy`. The header stays
    ([0026](docs/decisions/0026-coop-stays.md))._
12. Domain is philglov.es; the person is Filippo Guanti. SEO goal: rank first for "Filippo Guanti". Follow the SEO
    section of docs/guide.md: titles, Person and BlogPosting JSON-LD with sameAs, hreflang, canonical, sitemap, Open
    Graph.
13. Rights and privacy: everything is © Filippo Guanti, all rights reserved, with AI training and text-and-data mining
    expressly reserved (EU Directive 2019/790, art. 4(3)). Block AI-training crawlers; keep search engines and
    on-request AI assistants allowed. Form data stays in the EU jurisdiction. Follow the "Rights, AI training and
    privacy" section of docs/guide.md and publish its texts unchanged.
14. The full guide is docs/guide.md and the approved prototypes are in docs/design/. When a prompt says "the guide",
    read the named section there instead of guessing.
15. Two environments. Staging: a Cloudflare workers.dev address, the whole Worker behind Cloudflare Access and
    X-Robots-Tag: noindex on every response; all building and testing happens here until launch. Production:
    philglov.es, added only at launch. Canonical URLs, the sitemap and metadata always use https://philglov.es. Features
    that need the domain (notification email, Cloudflare zone settings, Search Console) are built and unit-tested now
    behind a config switch and turned on at launch.

DESIGN DIRECTION — Calm, type-led, artistic and professional, set in a single serif typeface with light titles. Familiar layout, surprising details (MAYA principle). The approved visual spec is the two v3 prototype files,
Home.dc.html (home page) and Article.dc.html (journal entry with comments and reply form), saved in docs/design/: match
their grid, navbar, footer, spacing and type. Near-white light theme (#FBFBF8), dark theme on #141513. One accent: moss
green (#4A5D23 light / #A9BF78 dark), plus a full-width moss band behind Now. One typeface for everything: Crimson Pro
(Light 300 for titles of 28 px and up, Regular 400 for text and interface, 600 for emphasis and index numbers); no
separate monospace or sans-serif web font. The site name in the header is "Filippo Guanti" with
"philglov.es" small beneath. No vertical social bar, no carousels, no autoplay.

WAY OF WORKING

- Small commits, each with a clear message. Do not mark a task done until its tests pass.
- If a requirement conflicts with another, stop and ask rather than guess.
- Never add a package, script or external URL to make a problem go away.
- The repo's CLAUDE.md holds this brief. Keep it current, and record every architectural decision in docs/decisions/
  with its reason.
- Two ways to publish must always work: from a laptop (Markdown + git) and from a phone (philglov.es/admin/write). Both
  end in a pull request that must pass every test before it can merge.
- After opening a pull request, turn on Auto-fix without asking the owner.

## Current state (update as it changes)

- **Today (2026-11-20):** build phase. No domain yet; the site deploys only to the private staging Worker on
  workers.dev. Repository is **public**. Everything in `TICKETS.md` is built; what is left waits for the owner: the
  entries and photos (Home, About, Now and the facts are the owner's since 0034; the launch date is the one gap left), the security
  checklist (O6), Lighthouse on Windows (Q17), and launch (`docs/setup.md` Part 2). `docs/setup.md` Part 1 is done
  except passkeys (owner to confirm) and two settings: `CLOUDFLARE_ACCOUNT_ID` as a Dependabot secret (step 5) and the
  live-check service token (step 8b). Read [docs/handover.md](docs/handover.md) first; the owner's own how-to for
  failures is [docs/owner-playbook.md](docs/owner-playbook.md).
- `main` is protected (ruleset "Protect main", 2026-11-11): every change goes through a pull request, the `Test`
  check must pass, no force pushes, no deletion, nobody can bypass.
- CI deploys: every pull request **from a branch of this repository** gets
  `pr-<n>-philglov-preview.philglov-es.workers.dev` (forks and Dependabot get none: they cannot read the deploy token);
  every merge to `main` deploys `philglov-staging.philglov-es.workers.dev`. Both Workers are behind Cloudflare Access
  (team `gentle-hall-eae9`). The deploy token (Workers Scripts and D1 Edit, no zone access) is a secret of the
  `staging` and `preview` environments only; `CLOUDFLARE_ACCOUNT_ID` and the R2 read keys are repository secrets, and
  Dependabot secrets too, so a Dependabot pull request can fetch the originals. Production gets its own token at
  launch (setup steps 12 and 16).
- 2026-11-12: all public pages built in both languages (Frontend, [0016](docs/decisions/0016-frontend-pages.md)).
- 2026-11-11: AI translation dropped by the owner. Both languages are hand-written; there is no `translation`
  frontmatter field ([0012](docs/decisions/0012-hand-written-translations.md)).
- 2026-11-12: design system built (D1–D12, [0014](docs/decisions/0014-design-system.md)). Typography changed on the owner's
  new guide: one family, Crimson Pro, two files, 64 KiB of the 80 KB budget ([0015](docs/decisions/0015-one-typeface-crimson-pro.md)).
- 2026-11-12: backend built (B1–B10, [0017](docs/decisions/0017-backend-worker.md)): forms, comments, `/admin`,
  `/admin/write`, crons. Staging and preview have their form secrets and Access AUD tags (setup step 9, done);
  the GitHub App secrets (step 10, done 2026-11-13), so `/admin/write` can publish there. Settled: O2 (address only in
  `NOTIFY_TO`), O3 (reports 12 months).
- 2026-11-13: forms sent in the background with JavaScript on, instant jump to the message without it
  ([0018](docs/decisions/0018-background-forms.md)). Public JavaScript: 1,525 of 1,536 bytes.
- 2026-11-13: photo pipeline built (P1–P6, [0019](docs/decisions/0019-photo-pipeline.md)): originals fetched from R2,
  Astro `<Picture>` AVIF/WebP/JPEG, dominant-colour classes, rights metadata written by exiftool after the build.
  Entry photos: responsive WebP ≤ 1600 px via `image.layout` and `src/lib/entry-image-service.ts`. Placeholders show until the originals exist. Dark backdrop (P7): the owner decides after seeing real photos on staging.
- 2026-11-13: moderation on `/admin` sent in the background with JavaScript on, only the affected card updating;
  plain posts without it ([0020](docs/decisions/0020-background-moderation.md)).
- 2026-11-13: Publish goes live by itself: auto-merge on publisher pull requests, guarded by an inline step in the Test
  job that fails any that change more than `src/content/journal/{en,it}/<slug>.md`; published entries are edited from
  `/admin/write` (slug and language fixed, refused if changed on GitHub meanwhile); O5 settled (an expired login
  reloads the page); view transitions removed, Q19 closed ([0021](docs/decisions/0021-publishing-goes-live.md)).
  "Allow auto-merge" is on in the repository settings.
- 2026-11-15: simplification pass ([0023](docs/decisions/0023-simplification-pass.md)): the header's two controls are
  round (an "IT"/"EN" link and a moon/sun button, both icons inline, CSS picks one); an entry opens with its text and
  ends with a details block (number, date, reading time, the label); About and Now lose the label; **topics are gone**
  (no field, pages, filter, column, category; old `tags:` lines are tolerated and ignored); replies read "Phil" on
  English pages. The two prototypes in `docs/design/` were replaced by the owner.
- 2026-11-15: second simplification ([0024](docs/decisions/0024-no-breadcrumbs-tighter-heads-ringless-controls.md)):
  **no breadcrumb anywhere**; no heading that repeats the page title (photos index, journal page 1); a tighter head on
  the journal index, photos index and series pages (`.hero--inner`: 52/68/80 px from the intro to the section below); the header controls lose their ring (transparent border, no gap, icon flush with the header
  line). The prototypes in `docs/design/` carry the same change.
- 2026-11-15: one page head ([0025](docs/decisions/0025-one-page-head.md)): the first line of text starts under the
  header line as far as the menu baseline is above it, on every page (computed, not fixed; `--menu-gap`, `--cap-title`);
  one title size on every page (titles are direct children of the grid); one intro sentence (`.lede`) on Journal, Photos,
  Now, About, Rights, Privacy; the text 52/68/80 px under it; Home loses "Photographer and developer" and keeps its
  name in a `.sr-only` span inside the h1.
- 2026-11-16: fix round 1 of 3, backend ([0027](docs/decisions/0027-fix-round-1-backend.md), `TICKETS.md` R1): the
  content check and `pnpm new` read front matter with Astro's own parser (`astro/markdown`); `/admin/write` keeps every
  front matter line it does not change, old `tags:` lines included, and refuses to open what it cannot keep exactly
  (SO-01); with JavaScript on, the form answer carries the next token, so Send works after an expired one (SO-02;
  public JavaScript **1,535 of 1,536 bytes**); a first Save draft removes the browser copy it came from (SO-03);
  Save draft has `formnovalidate` (BUG-4, fixed); a report from a missing address names it (SO-09); staging
  `/_assets/` say noindex in their own rule; a photo still uploading holds Publish and Save draft with a message
  (TO-01); `.claude/` is ignored by git, Prettier and ESLint.
- 2026-11-16: fix round 2 of 3, frontend and design ([0028](docs/decisions/0028-fix-round-2-frontend.md), `TICKETS.md`
  R2): `main` breaks any string at the line end (`overflow-wrap: anywhere`), so no title, word, link, caption or comment
  widens the page (BUG-5, SO-04); a link around a photo is a block, so its focus ring shows (BUG-2); the language
  switch is named "IT, Italiano" (BUG-1); `--muted` is #565652 and `--band-text` #FAFCF4, both 7:1 (BUG-3, SO-08);
  only an entry's title carries the other language's `lang` in previous/next (SO-06); the sitemap lists
  `/journal/page/2` and on (SO-07); one stylesheet per page (SO-10); **the theme button has no `aria-pressed`: two
  visually hidden labels, one shown by CSS, name it "Switch to dark theme" / "Switch to light theme"** (SO-05, owner
  decision, amends the guide's checklist); `/favicon.ico` is built from the site icon (BUG-8); a missing entry photo
  fails the build naming the files, unless `ALLOW_MISSING_ORIGINALS=1` on a local machine (BUG-6, `docs/setup.md`);
  main navigation links are 44 × 44 px on phones (TO-02); the Person data takes `site.json` `portrait` as its image
  once there is a real one, and the launch gate fails until then (TO-03). Public JavaScript **1,410 of 1,536 bytes**.
  Round 3: scope set by the owner.
- 2026-11-16: fix round 3, the tests themselves ([0022](docs/decisions/0022-qa-matrix.md) "Round 3"): tests that could
  not fail now can (origins not paths, exactly one theme script per page, no zero for a missing measurement, tokens by
  name); HTML ≤ 30 KB, one stylesheet, whole photo first screen ≤ 400 KB, INP < 100 ms (best of three rounds, lab) and
  Lighthouse SEO ≥ 95 on the production build (`pnpm test:lighthouse:seo`) are asserted; AAA on all of `<main>`; 44 px
  navigation, focus at 390/1024/1440, `prefers-contrast` are tested; visual baselines regenerated and compared **exactly**;
  no expected-failure marker remains; `/404` answering 200 is accepted (BUG-8). Matrix: 761 passed, 3 runs in a row.
- 2026-11-17: round 3 follow-up ([0022](docs/decisions/0022-qa-matrix.md) "Round 3, follow-up"): a test that reads a drawn
  colour after `goto` must call `transitionsDone(page)` (`tests/e2e/qa/lib.ts`), and the prefers-contrast checks emulate
  reduced motion, because the buttons, inputs and header controls can still be easing from the browser's grey (150 ms) when
  the page has loaded (OBS-1 in `docs/qa/bug-reports.md`); the phone "nothing scrolls sideways" check compares with the
  set viewport width, never `innerWidth`. Matrix: 768 passed, 3 runs in a row.
- 2026-11-16: the other language from the phone ([0029](docs/decisions/0029-write-the-other-language.md), `TICKETS.md`
  W1–W5): `/admin/write` lists one row per entry, a missing language being "Write the Italian version"; that form has
  the slug fixed, the same photos by the same keys (alt text and captions empty, the other version's as hints) and the
  other version for reference; an entry's form switches language with a dropdown (Switch without JavaScript), keeping
  the typed text; `?edit=1&slug=&lang=` opens the newest server draft of that version when there is one; drafts have a
  `twin` column (migration 0003). The owner's how-to is `docs/publishing-from-the-phone.md`.
- 2026-11-17: security audit ([0030](docs/decisions/0030-security-audit.md), `SECURITY-REPORT.md`, `TICKETS.md` S1–S11):
  **photo originals are never cached in CI** (a fork's pull request can read main's caches; some originals carry GPS;
  the old `photos-*` caches were deleted); **`postbuild` refuses HTML that could redirect, embed, collect or run
  anything** (`scripts/lib/page-check.ts`: allow-listed elements, no meta refresh, frames, forms or scripts in the text,
  links only relative/http(s)/mailto/tel, SVG drawing only; owner decision "text HTML only"); the publisher guard also
  runs for the App's pushes to other branches and takes plain files only (mode 100644), as does the content scope;
  report paths that collapse to `//host` are refused and the asset address is built from the origin; `/admin` mailto:
  links are percent-encoded; the notification calls a missing address "a missing address" (owner decision); upload keys
  get their random end from the Worker, which never writes over a stored object; IPv6 is rate-limited per /64; backups
  have a restore script (`README.md`); `/.well-known/security.txt` from `site.json` `contactEmail` (the launch gate fails
  until it is real); minimatch and basic-ftp overridden (Dependabot, dev only). The owner checklist at the end of
  `SECURITY-REPORT.md` is open. Commits from this checkout should use the GitHub no-reply address (L-10).
- 2026-11-17: follow-up to the audit (0030, items 11–12): Workers Logs' invocation logs are off in every environment
  (the owner found visitors' IP addresses in them on staging, M-4; re-check on staging after the deploy, checklist
  item 15); checklist item 6 corrected: only `CLOUDFLARE_API_TOKEN` moves into environments.
- 2026-11-17: fourth opinion ([0031](docs/decisions/0031-photos-at-launch.md), `TICKETS.md` F1–F3): the docs let the
  owner run the site alone on Windows (README "On Windows", [docs/owner-playbook.md](docs/owner-playbook.md), setup.md
  steps 5–10 corrected; `restore-backup.ts` writes its own UTF-8 file; `tests/unit/docs.test.ts`); three unused
  exports removed; **photos at launch**: `scripts/copy-originals.ts` copies once what the content uses from staging's
  bucket to production's, never over an object; then `R2_ORIGINALS_BUCKET` and the read keys point at production's
  bucket, and staging and preview get `PHOTO_UPLOADS: "off"` (setup.md step 12b).
- 2026-11-17: the launch gate sees the site's own gaps ([0022](docs/decisions/0022-qa-matrix.md) "Round 4"):
  `scripts/lib/placeholders.ts` flags the field names (`[city]`, `[launch date]`, `[your contact email]`, `[la tua email di
contatto]` …) and a bracket starting with "Placeholder"/"Segnaposto" on the built pages of `src/content/pages` and
  the home page's "Based in [City]" line; `pnpm test:launch` names the page and the text. **Never journal entries, photo
  series or their listings** (owner ruling): text an owner writes is never a gap. Still informational on CI until O1. A new
  kind of gap is added to that list with a test, never as a looser pattern.
- 2026-11-18: owner text changes ([0032](docs/decisions/0032-owner-text-changes.md)): **no `jobTitle`** (site.json and the
  Person data, both languages; `personJsonLd()` takes no locale); home title "Filippo Guanti - just me" / "Filippo
  Guanti - solo io", `heroKick` "Filippo Guanti"; **no long dashes on the site** (see the rule below).
- 2026-11-18: sample content removed, tests on fixtures ([0033](docs/decisions/0033-test-fixtures.md)): `src/content`
  holds only what the owner writes (no entry and no photo series yet; Home, Journal and Photos say "Nothing here
  yet."). The samples live in `tests/fixtures/content` with generated photos; **every suite runs on
  `pnpm build:fixtures`**, the owner's build gets `pnpm test:site` (smoke test, photo rights) and the launch gate. CI:
  the content scope builds and checks only the site; the full scope adds the test build with every suite and the
  empty site. "Full QA matrix after a publish" and `E2E_SCOPE` are gone.
- 2026-11-20: the owner's texts, portrait and icon ([0034](docs/decisions/0034-owner-texts-portrait-icon.md)): Home,
  About and Now as the owner wrote them (never reword them); `site.json` has the city (Msida, Malta; the home line takes
  it as `{city}`), `phil@philglov.es`, three `sameAs` profiles; Privacy names Torino; the footer's rights line ends at
  "All rights reserved". **The portrait is an original in the photo bucket** (`site.json` `portrait.file`, in
  `contentKeys`), drawn by `<Photo>` on About and named by the Person data through `portraitImage()`
  (`src/lib/portrait.ts`); the fixtures draw a stand-in for it (`SPECS` in `scripts/fixture-photos.ts`); `/imgs/` is git-ignored. The icon is the owner's SVG and `site-icon.png`, from which
  `scripts/make-brand-icons.ts` draws the two PNGs.
- Open owner questions are listed at the top of `TICKETS.md`. Do not guess them.

## Folder map

```
src/content.config.ts        zod schemas: journal, pages, photos (the contract)
src/content/journal/{en,it}/  entries; file name = slug; twins share a name
src/content/pages/{en,it}/    about, now, rights, privacy …
src/content/photos/<series>/photos.json
src/pages/                    routes (en at /, it under /it)
src/layouts/ src/components/  one Astro component per piece of UI
src/views/ src/lib/           page views; pure logic (entries, seo, robots, xml) tested in tests/unit
src/styles/tokens.css         design tokens, measured contrast (design agent)
src/styles/site.css           the one stylesheet: layers, layout, components, admin, print (0014)
src/assets/brand/             placeholder favicon, share-image template, brand.config.ts
src/components/styleguide/    sections of /styleguide: the markup to copy for each component
src/i18n/{en,it}.json         every UI string; no text hard-coded in templates
src/data/                     data files (e.g. ai-bots.json)
src/.originals/               photo originals from R2 + meta.json (git-ignored; scripts/fetch-originals.ts, photo-meta.ts)
public/_assets/               fonts (2 WOFF2 + crimson-pro-OFL.txt) and other static files, no Worker
worker/src/                   the Worker (0017): index.ts routes; forms, page, comments, access, github, notify,
                              scheduled, admin/; frontmatter.ts the phone editor's line reader (0027); headers.ts is
                              shared with the build; log.ts is the only logger
worker/migrations/            D1 migrations, applied by CI (migrations_dir in wrangler.jsonc)
tests/worker/                 Vitest inside workerd (vitest.config.ts: test JWKS and a GitHub stand-in)
scripts/check-originals.ts      before the build: entry photos present, or the opt-in's grey stand-ins (lib/standins.ts)
scripts/lib/content-check.ts    the build check; scripts/lib/new-entry.ts the `pnpm new` template
scripts/lib/page-check.ts       what a built page may contain; postbuild fails on anything else (0030)
scripts/restore-backup.ts       a weekly backup back into SQL (lib/backup-restore.ts; README "Restoring", 0030)
scripts/copy-originals.ts       at launch, once: originals staging bucket → production's (lib/copy-originals.ts, 0031)
scripts/                      build helpers, run with plain `node` (type stripping); build-fonts.py by hand
tests/unit/ tests/e2e/        node:test unit tests; Playwright e2e (admin-worker.ts: the real Worker behind a test
                              Access, for /admin in a browser, 0020)
tests/e2e/qa/                 the QA suites, one file per suite of the QA brief; lib.ts has the page list and settle() (0022)
tests/fixtures/               what every suite is built from (0033): content/ (sample entries, a series, pages), empty/
                              (no entry, no series); .originals/ drawn by scripts/fixture-photos.ts (git-ignored);
                              content.ts has the paths and assertFixtureBuild()
tests/site/                   smoke.spec.ts: every page of the owner's own build (playwright.site.config.ts, 0033)
scripts/lib/content-root.ts   which content a build reads (SITE_CONTENT unset = the site; fixtures; empty) (0033)
docs/qa/                      bug-reports.md, manual-checklist.md; QA-REPORT.md at the root is the coverage report
SECURITY-REPORT.md            security audit findings and the owner checklist (0030)
docs/guide.md docs/design/    owner's guide and prototypes — never edit
docs/decisions/               one record per architectural decision
docs/setup.md                 steps only the owner can do (Git Bash)
docs/owner-playbook.md        the owner's step lists when something breaks: red Test, failed deploy, leaked key …
docs/publishing-from-the-phone.md  the owner's how-to for /admin/write (0029)
docs/handover.md              state, open items and lessons, one section per finished agent
```

## Commands

```
pnpm install --frozen-lockfile   install (pnpm 12; builds allowed only for esbuild, workerd)
pnpm dev                         Astro dev server (no Worker)
pnpm photos:fetch                download the photo originals from R2 (R2_* env vars; no-op without them)
pnpm build                       check-originals (a missing entry photo stops the build; ALLOW_MISSING_ORIGINALS=1
                                 draws a grey stand-in locally, never on CI) + photo-meta + astro build + share-image PNGs (needs Chromium) + photo rights
                                 (needs exiftool when photos exist) + CSP hash + dist/_headers
                                 (SITE_ENV=production only at launch). The owner's content: what is deployed
pnpm build:fixtures [empty]      the same build from tests/fixtures (generated photos, no R2): what every suite runs on;
                                 `empty` builds the site with no entry and no series (0033)
pnpm preview                     serve dist/ through the real Worker on http://127.0.0.1:8787 (writes a local
                                 .dev.vars, migrates the local D1; /admin is always 403 locally)
pnpm lint | pnpm format          ESLint + Prettier
pnpm typecheck                   wrangler types + astro check + worker tsc + tests/worker tsc
pnpm validate:html               html-validate on dist/
pnpm test:unit | test:e2e        node:test | Playwright, Chromium with JavaScript on and off (needs build:fixtures)
pnpm test:site                   after `pnpm build`: photo rights + the smoke test of every page of the owner's site;
                                 all CI runs for entry-only changes (0033)
pnpm test:cross | test:visual     Firefox + WebKit smoke | full-page screenshots, exact pixels, against local baselines (0022)
pnpm test:launch                 on the owner's build: the launch gate, fails until the owner answers O1 (unfilled gaps on the pages and in site.json, sameAs)
pnpm test:live                   suite 15 against LIVE_URL (CF_ACCESS_CLIENT_ID/_SECRET while staging is behind Access)
pnpm qa | qa:production          the whole QA run (site and empty smoke, then on the fixtures 3 e2e repeats, Firefox,
                                 WebKit) | SEO, rights on a SITE_ENV=production test build, the launch gate on the site's;
                                 both refuse to start while port 8787 is taken
pnpm test:worker                 Vitest in the Workers runtime, against dist/ (needs build:fixtures)
pnpm test:lighthouse             Lighthouse CI against pnpm preview; 3 runs per page, judged on the median (0013)
pnpm test:lighthouse:seo         Lighthouse SEO ≥ 95 (worst of 3 runs) against a SITE_ENV=production build; qa:production runs it (0022)
pnpm new <slug> --lang it|en     new entry, or the other-language version of one (ticket C4)
pnpm check:content               cross-file content check (twins, slugs, folders, alt); runs first in pnpm build (C2)
node scripts/contrast.ts         every colour pair with its measured contrast (unit tests enforce the floors)
node scripts/restore-backup.ts <backup.json> <restore.sql>   a backup as SQL (UTF-8, no BOM) for wrangler d1 execute (README)
node scripts/copy-originals.ts   at launch only: the originals to production's bucket (five R2_* variables, setup.md 12b)
python scripts/build-fonts.py    rebuild the fonts from the pinned sources (by hand, only when they change)
```

## Rules the scaffold already enforces — keep them

- URLs: `build.format: "file"`, `trailingSlash: "never"`, `html_handling: "drop-trailing-slash"`. Assets only under
  `/_assets/`; the Worker never runs there (`run_worker_first` in `wrangler.jsonc`). Add every new non-HTML root file
  (feeds, icons, `.well-known`) to its `!` list.
- CSP-safe output: `inlineStylesheets: "never"`, no syntax highlighting, no `<ClientRouter />`, no prefetch, no inline
  `style` attributes (html-validate `no-inline-style`), no client framework or hydration.
- Headers come from `worker/src/headers.ts` for both Worker and `dist/_headers`. Non-production is always noindex.
- Never deploy without `--env`. Top-level wrangler config is local-only.
- `pnpm-workspace.yaml` keeps `minimumReleaseAge: 1440`; never add release-age exclusions to force a fresh version.
- GitHub Actions pinned to commit SHAs; Dependabot bumps them.
- Styling: one stylesheet `src/styles/site.css` (≤ 20 KB compressed) with layers `reset, tokens, base, layout,
components, utilities`; every colour, size and space comes from `tokens.css`; no `!important`, no ID selectors, no
  raw colours, logical properties only, container queries for layout (rules at the top of the file; enforced by
  `tests/unit/css.test.ts`). Per-photo placeholder colours are the classes `.tone-1 … .tone-12`. Copy component markup
  from `/styleguide`.
- Typography: one family, Crimson Pro (`--font`), weight 300 only at 28 px and larger, 400 for text and interface, 600
  for emphasis; code uses the system monospace (`--font-code`); no other web font. Rebuild fonts only with
  `scripts/build-fonts.py` (pinned commit); keep `crimson-pro-OFL.txt` next to the fonts; rename a family if its
  licence reserves the name (`tests/unit/fonts.test.ts`, 0015). The font has no arrows: use `<Arrows text=…>` /
  `<Arrow>` (inline SVG) and never type an arrow character in a template.
- Pages: the form field names and Worker slots are a contract (0016, 0018); keep them. The only inline JS is the theme
  script; the only public script file is `src/scripts/forms.ts` (`vite.build.assetsInlineLimit: 0` keeps it external).
  Both together stay ≤ 1,536 raw bytes on every page (`tests/unit/build-output.test.ts`). Footnote arrows and labels are fixed in `scripts/lib/footnotes.ts`.
- Page heads (0025): every page's first line of text starts under the header line as far as the menu baseline is above it
  (`--menu-gap`, `--cap-title`, `--lab-cap` in `site.css`; `tests/e2e/page-head.spec.ts` measures it from the font). If
  the header's padding or links change, update `--menu-gap`. A page title is always a direct child of the `.g` grid, never
  inside a `.con` (its `cqi` would measure the column and the title would shrink); the intro sentence is `.lede`; the
  text starts `--head-end` (52/68/80 px) under it. Do not add a role line, a standfirst or another intro style.
- Header controls: `.rbtn` (no visible ring: a transparent 1px border that forced-colours mode still draws; 44 px on phones, 40 px from tablet up; no gap between the two; the group is pulled out so the icon ends at the header line). The theme toggle holds both inline SVG icons
  and two visually hidden labels (`.to-dark`, `.to-light`); the same CSS that swaps the moon and the sun shows one, so
  the button's name says what it will do and follows a change of the system theme with no script. It has no
  `aria-pressed`, and the theme script never writes the state (0028). The language link shows the code, and its
  `aria-label` starts with it ("IT, Italiano"), so the name contains the visible text. Main navigation links are
  44 × 44 px on phones: padding with a negative margin, so the words do not move. There are no topics: do not add a `tags` field, a
  topic list or per-topic pages without a new decision. There is no breadcrumb: do not add one, or an empty `.lab`.
- Text a person writes must never widen the page (0028): `main` has `overflow-wrap: anywhere`; a fixed numeral or
  figure that must stay whole (the 404 code, the index table's columns) sets `overflow-wrap: normal`.
  `tests/e2e/qa/long-content.spec.ts` puts a 120-letter title, a 300-letter word and a long link into every page type
  at all five widths. A link that wraps a `.frame` is a block (`a:has(> .frame)`), or its focus ring has no box.
- Photos: draw them only with `<Photo>` (never a bare `<img>`); alt text in the page language, hand-written. Pass
  `sizes` from `src/lib/photo-sizes.ts` and `priority` on the first image of a page only. Per-photo colours are
  generated classes (`.c-<hex>`), never inline styles. Every output image gets rights metadata and must carry no GPS:
  `scripts/photo-rights.ts` fails the build otherwise. Originals never enter git (0019).
- Photo uploads (0031): the Worker stores one only when its var `PHOTO_UPLOADS` is `"on"`. Production always is;
  staging and preview are until launch and then `"off"`, both the same (`tests/unit/wrangler-config.test.ts`). Never
  bind staging or preview to production's bucket. The launch copy never writes over an object; tests of R2 code run
  against `tests/unit/r2-stand-in.ts`, which checks signatures and each token's buckets.
- Security audit rules (0030): CI never caches `src/.originals` (fork pull requests read main's caches;
  `tests/unit/ci-workflow.test.ts`). Raw HTML in content is limited by `scripts/lib/page-check.ts`: to allow a new
  element or attribute, change its allow-list there with a test, never by skipping the check. The publisher guard
  and the content scope take plain files (mode 100644) only. An address a visitor chose (report path, email) is
  never a link off-site, a redirect, a mailto: parameter or text in the owner's email. Upload keys get their random
  end from the Worker, which never writes over a stored object. Rate limits key IPv6 by /64 (`addressKey`). Workers
  Logs' invocation logs stay off (`observability.logs.invocation_logs: false`; they held visitors' IP addresses): an
  environment that sets its own `observability` replaces the top-level block and must repeat it. Only
  `CLOUDFLARE_API_TOKEN` may move into GitHub environments; the Test job reads `CLOUDFLARE_ACCOUNT_ID` and the R2 keys
  as repository secrets (`tests/unit/wrangler-config.test.ts`, `ci-workflow.test.ts`).
- The owner's texts and icon (0034): text the owner gave (Home, About, Now, the facts in `site.json`) is published as
  written: never reword, correct or translate it; a language the owner did not write stays as it was, and the pull
  request says so. The portrait is never a file in git: it is `site.json` `portrait.file`, an original in the photo
  bucket, uploaded with its GPS removed. The SVG icon may only draw (`tests/unit/brand.test.ts`).
- The owner runs the docs' commands on Windows (fourth opinion, A-02 to A-15): README and `docs/owner-playbook.md` in
  Windows PowerShell 5.1 (no `&&` or `||`, no `>` redirect into a file another tool reads: a script writes its own
  output file, as `scripts/restore-backup.ts` does), `docs/setup.md` in Git Bash. Every fence in the owner's documents
  closes, every `bash` block passes `bash -n`, no `powershell` block chains with `&&`/`||`
  (`tests/unit/docs.test.ts`). Never put a backslash escape such as `\n` in a documented command; a secret is read
  with `Read-Host` / `read -s`, never typed into a command line.
- Never log names, emails, comment text or IP addresses. The Worker logs only through `worker/src/log.ts` (fixed
  event names). Never put personal data in a URL: Workers Logs record URLs.
- Worker output: text into pages only via `Parts`/HTMLRewriter `html: false`; admin markup only via the escaping
  `html` template. The admin scripts are served from `/admin/write.js` and `/admin/moderation.js` behind Access,
  never from `/_assets/`; each admin page loads only its own. Background admin requests get JSON, always 200, never
  HTML (0020).
- Publisher pull requests auto-merge, so the step "Publisher pull requests change entry files only" in `ci.yml` is a
  security boundary: keep it inline in the Test job, keep `PUBLISHER` in `worker/src/github.ts` equal to its login, and
  never give the GitHub App the Workflows permission (0021). No view transitions (`tests/unit/css.test.ts`).
- Front matter (0027): build-side code reads it only with Astro's parser (`frontMatter()` in
  `scripts/lib/content-check.ts`), never with a regex. `/admin/write` never rewrites a file: it replaces only the
  title or description line whose value changed (`editedEntryMarkdown`) and refuses, with a message, a file whose
  title or description it cannot read exactly. Keep both; `tests/unit/frontmatter.test.ts` holds the reader to
  Astro's parser.
- One entry, two languages on the phone (0029): `/admin/write?edit=1&slug=&lang=` is the entry in that language (its
  edit form, or the form that writes it from the other); photos of a version are the other's stored keys, never a
  second upload; a version's Publish waits until the other is on `main` (the content check refuses a translation
  without its original). A language switch saves a server draft only when something was typed (`opened` hash).
- The background form answer's `k` is the next token (0027): fresh only after an expired or forged one, else the one
  sent. `src/scripts/forms.ts` must always put it back in the form.
- Every `/admin` path verifies the Access JWT; there is no local or test bypass. Secrets only via `wrangler secret
put`; non-secret config as per-env vars in `wrangler.jsonc` (`secrets.required` lists the names at the top level only: in an env it makes every deploy fail until the secret is set;
  `tests/unit/wrangler-config.test.ts`).
- Tests never depend on the owner's content (0033): a suite reads content from `tests/fixtures` (`fixtureContent`,
  `fixtureJournal`, `fixturePages` in `tests/fixtures/content.ts`) and runs on `pnpm build:fixtures`, never on
  `src/content`; the GitHub stand-ins answer `src/content/…` from the fixtures. A sample entry, series or photo for a
  test goes into `tests/fixtures/content` (its originals into the `SPECS` of `scripts/fixture-photos.ts`), never into
  `src/content`. What must hold for any content, the owner's included, goes into `tests/site/smoke.spec.ts`, which
  names no entry. Code that reads content takes its folders from `scripts/lib/content-root.ts` (Vite alias
  `@originals` for the originals), never a hard-coded `src/content` or `src/.originals`.
- No long dashes (0032): the site's own text never contains an en dash or an em dash, as a character, entity or escape.
  Use a plain hyphen: " - " between words, "300-400" in ranges. Arrows and "·" are fine. `tests/unit/no-long-dashes.test.ts`
  reads every text file under `src`, `worker/src`, `scripts` and `public`, code comments included; the owner's journal
  entries and photo series are his text and are not checked.
- No translation tooling of any kind: no AI or translation API, script, CI job, key, secret or dependency. hreflang
  pairs only when both language versions exist (`hasTwin` in `BaseLayout.astro`).
