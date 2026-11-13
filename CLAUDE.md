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
   translation, no translation script, API or key, anywhere. An entry may exist in one language only. Every page shows
   the "originally written in" label.
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

- Build phase. No domain yet; deploy only to the private staging Worker on workers.dev. Repository is **public**.
- `main` is protected (ruleset "Protect main", 2026-11-11): every change goes through a pull request, the `Test`
  check must pass, no force pushes, no deletion, nobody can bypass. Read [docs/handover.md](docs/handover.md) first.
- 2026-11-12: all public pages built in both languages (Frontend, [0016](docs/decisions/0016-frontend-pages.md));
  content is placeholder (entries, Now, About, one photo series) until the owner writes the real texts. Backend,
  photo pipeline and the Content checks are still open in `TICKETS.md`.
- `docs/setup.md` Part 1 is done (2026-11-11) except passkeys (owner to confirm). The CI deploy token has no zone
  access until launch (setup.md step 12). Steps 9 and 10 wait for the backend agent.
- CI deploys: every pull request gets `pr-<n>-philglov-preview.philglov-es.workers.dev`; every merge to `main` deploys
  `philglov-staging.philglov-es.workers.dev`. Both Workers are behind Cloudflare Access (team `gentle-hall-eae9`).
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
                              scheduled, admin/; headers.ts is shared with the build; log.ts is the only logger
worker/migrations/            D1 migrations, applied by CI (migrations_dir in wrangler.jsonc)
tests/worker/                 Vitest inside workerd (vitest.config.ts: test JWKS and a GitHub stand-in)
scripts/lib/content-check.ts    the build check; scripts/lib/new-entry.ts the `pnpm new` template
scripts/                      build helpers, run with plain `node` (type stripping); build-fonts.py by hand
tests/unit/ tests/e2e/        node:test unit tests; Playwright e2e (admin-worker.ts: the real Worker behind a test
                              Access, for /admin in a browser, 0020)
docs/guide.md docs/design/    owner's guide and prototypes — never edit
docs/decisions/               one record per architectural decision
docs/setup.md                 steps only the owner can do
docs/handover.md              state, open items and lessons, one section per finished agent
```

## Commands

```
pnpm install --frozen-lockfile   install (pnpm 12; builds allowed only for esbuild, workerd)
pnpm dev                         Astro dev server (no Worker)
pnpm photos:fetch                download the photo originals from R2 (R2_* env vars; no-op without them)
pnpm build                       photo-meta + astro build + share-image PNGs (needs Chromium) + photo rights
                                 (needs exiftool when photos exist) + CSP hash + dist/_headers
                                 (SITE_ENV=production only at launch)
pnpm preview                     serve dist/ through the real Worker on http://127.0.0.1:8787 (writes a local
                                 .dev.vars, migrates the local D1; /admin is always 403 locally)
pnpm lint | pnpm format          ESLint + Prettier
pnpm typecheck                   wrangler types + astro check + worker tsc + tests/worker tsc
pnpm validate:html               html-validate on dist/
pnpm test:unit | test:e2e        node:test | Playwright (needs a build)
pnpm test:worker                 Vitest in the Workers runtime, against dist/ (needs a build)
pnpm test:lighthouse             Lighthouse CI against pnpm preview; 3 runs per page, judged on the median (0013)
pnpm new <slug> --lang it|en     new entry, or the other-language version of one (ticket C4)
pnpm check:content               cross-file content check (twins, slugs, folders, alt); runs first in pnpm build (C2)
node scripts/contrast.ts         every colour pair with its measured contrast (unit tests enforce the floors)
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
- Photos: draw them only with `<Photo>` (never a bare `<img>`); alt text in the page language, hand-written. Pass
  `sizes` from `src/lib/photo-sizes.ts` and `priority` on the first image of a page only. Per-photo colours are
  generated classes (`.c-<hex>`), never inline styles. Every output image gets rights metadata and must carry no GPS:
  `scripts/photo-rights.ts` fails the build otherwise. Originals never enter git (0019).
- Never log names, emails, comment text or IP addresses. The Worker logs only through `worker/src/log.ts` (fixed
  event names). Never put personal data in a URL: Workers Logs record URLs.
- Worker output: text into pages only via `Parts`/HTMLRewriter `html: false`; admin markup only via the escaping
  `html` template. The admin scripts are served from `/admin/write.js` and `/admin/moderation.js` behind Access,
  never from `/_assets/`; each admin page loads only its own. Background admin requests get JSON, always 200, never
  HTML (0020).
- Publisher pull requests auto-merge, so the step "Publisher pull requests change entry files only" in `ci.yml` is a
  security boundary: keep it inline in the Test job, keep `PUBLISHER` in `worker/src/github.ts` equal to its login, and
  never give the GitHub App the Workflows permission (0021). No view transitions (`tests/unit/css.test.ts`).
- Every `/admin` path verifies the Access JWT; there is no local or test bypass. Secrets only via `wrangler secret
put`; non-secret config as per-env vars in `wrangler.jsonc` (`secrets.required` lists the names at the top level only: in an env it makes every deploy fail until the secret is set;
  `tests/unit/wrangler-config.test.ts`).
- No translation tooling of any kind: no AI or translation API, script, CI job, key, secret or dependency. hreflang
  pairs only when both language versions exist (`hasTwin` in `BaseLayout.astro`).
