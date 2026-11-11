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
8. Performance budget: text page ≤ 180 KB first visit; CSS ≤ 20 KB; fonts ≤ 4 files / 120 KB; LCP < 2 s on Slow 4G;
   CLS < 0.05.
9. Hosting: Cloudflare Workers with Static Assets; one Worker that runs first on every HTML request (it adds form tokens
   and comments) and serves /api/\* and /admin; D1 for comments, reports and drafts; R2 for photo originals and backups;
   D1 and R2 created in the EU jurisdiction; Cloudflare Access protects /admin.
10. Fewer than 10 direct dependencies. Justify each new one in the PR description. pnpm, lockfile committed.
    _Owner ruling 2026-11-11: the cap counts runtime `dependencies` only; dev tooling is justified one by one in
    [0007](docs/decisions/0007-dependency-cap.md)._
11. Zero console errors or warnings on any page, any theme, any language, any width.
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

DESIGN DIRECTION — Calm, type-led, artistic and professional, with a quiet developer signature (monospace only for
metadata). Familiar layout, surprising details (MAYA principle). The approved visual spec is the two v3 prototype files,
Home.dc.html (home page) and Article.dc.html (journal entry with comments and reply form), saved in docs/design/: match
their grid, navbar, footer, spacing and type. Near-white light theme (#FBFBF8), dark theme on #141513. One accent: moss
green (#4A5D23 light / #A9BF78 dark), plus a full-width moss band behind Now. Archivo for interface and headings,
Source Serif 4 for reading, JetBrains Mono for metadata only. The site name in the header is "Filippo Guanti" with
"philglov.es" small beneath. No vertical social bar, no carousels, no autoplay.

WAY OF WORKING

- Small commits, each with a clear message. Do not mark a task done until its tests pass.
- If a requirement conflicts with another, stop and ask rather than guess.
- Never add a package, script or external URL to make a problem go away.
- The repo's CLAUDE.md holds this brief. Keep it current, and record every architectural decision in docs/decisions/
  with its reason.
- Two ways to publish must always work: from a laptop (Markdown + git) and from a phone (philglov.es/admin/write). Both
  end in a pull request that must pass every test before it can merge.

## Current state (update as it changes)

- Build phase. No domain yet; deploy only to the private staging Worker on workers.dev. Repository is **public**;
  branch protection is the first launch blocker (`docs/setup.md`).
- Placeholder home in both languages; everything else is in `TICKETS.md`.
- Owner setup (`docs/setup.md` Part 1), done 2026-11-11: D1 `philglov-staging` and `philglov-preview` (EU, IDs in
  `wrangler.jsonc`); R2 `philglov-originals-staging` and `philglov-backups-staging` (EU, private); first deploy of
  `philglov-staging` and `philglov-preview` on the `philglov-es` workers.dev subdomain; Zero Trust Free (team
  `gentle-hall-eae9`) with Access on all traffic of both Workers, verified (anonymous requests get a 302 to the
  login). Also done: security settings and fork-PR approval for all outside collaborators (step 1), the Actions
  secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (step 6) and the variables `R2_ORIGINALS_BUCKET`,
  `PREVIEW_DEPLOY` and `STAGING_DEPLOY` (steps 5, 8). Still open: passkeys (owner to confirm) and the read-only R2
  token secrets `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` for Actions and Dependabot (step 5, needed by the photo
  pipeline). Steps 9 and 10 wait for the backend agent. GitHub fixes repository variables when a run starts, so a run
  created before a variable changes does not see the change.
- 2026-11-11: AI translation dropped by the owner. Both languages are hand-written; there is no `translation`
  frontmatter field ([0012](docs/decisions/0012-hand-written-translations.md)).
- Open owner questions are listed at the top of `TICKETS.md`. Do not guess them.

## Folder map

```
src/content.config.ts        zod schemas: journal, pages, photos (the contract)
src/content/journal/{en,it}/  entries; file name = slug; twins share a name
src/content/pages/{en,it}/    about, now, rights, privacy …
src/content/photos/<series>/photos.json
src/pages/                    routes (en at /, it under /it)
src/layouts/ src/components/  one Astro component per piece of UI
src/styles/tokens.css         design tokens (design agent)
src/i18n/{en,it}.json         every UI string; no text hard-coded in templates
src/data/                     data files (e.g. ai-bots.json)
public/_assets/               fonts and other static files, served without the Worker
worker/src/                   the Worker; headers.ts is shared with the build
worker/migrations/            D1 migrations (backend agent)
scripts/                      build helpers, run with plain `node` (type stripping)
tests/unit/ tests/e2e/        node:test unit tests; Playwright e2e
docs/guide.md docs/design/    owner's guide and prototypes — never edit
docs/decisions/               one record per architectural decision
docs/setup.md                 steps only the owner can do
```

## Commands

```
pnpm install --frozen-lockfile   install (pnpm 12; builds allowed only for esbuild, workerd)
pnpm dev                         Astro dev server (no Worker)
pnpm build                       astro build + dist/_headers (SITE_ENV=production only at launch)
pnpm preview                     serve dist/ through the real Worker on http://127.0.0.1:8787
pnpm lint | pnpm format          ESLint + Prettier
pnpm typecheck                   wrangler types + astro check + worker tsc
pnpm validate:html               html-validate on dist/
pnpm test:unit | test:e2e        node:test | Playwright (needs a build)
pnpm test:lighthouse             Lighthouse CI against pnpm preview
pnpm new <slug> --lang it|en     new entry, or the other-language version of one (ticket C4)
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
- Never log names, emails, comment text or IP addresses.
- No translation tooling of any kind: no AI or translation API, script, CI job, key, secret or dependency. hreflang
  pairs only when both language versions exist (`hasTwin` in `BaseLayout.astro`).
