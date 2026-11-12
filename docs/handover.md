# Handover — Lead → next session

Written 2026-11-11 by the Lead session, at the end of `docs/setup.md` Part 1. Read this after `CLAUDE.md`; it says
what exists, what is decided, what is still open, and what tripped us up. Agents add their own section at the end
when they finish, newest last.

## Where things stand

| Area          | State                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Code          | Astro 7.4.8 scaffold, placeholder home at `/` and `/it`, bilingual 404, Worker with shared security headers                 |
| Content model | `src/content.config.ts`: journal, pages, photo series. No `translation` field (decision 0012)                               |
| CI            | `Test` (lint → typecheck → build → html-validate → unit → e2e → Lighthouse), then deploys                                   |
| Previews      | every pull request → `pr-<n>-philglov-preview.philglov-es.workers.dev` (own D1, staging R2)                                 |
| Staging       | every merge to `main` → `philglov-staging.philglov-es.workers.dev`                                                          |
| Access        | Zero Trust Free, team `gentle-hall-eae9`; both Workers, all traffic, policy "Cloudflare account members"                    |
| Data          | D1 `philglov-staging`, `philglov-preview`; R2 `philglov-originals-staging`, `philglov-backups-staging`; all EU, all private |
| `main`        | ruleset "Protect main": pull request required, `Test` required, no force push, no deletion, no bypass                       |
| Production    | nothing exists yet (Part 2 of `docs/setup.md`, at launch)                                                                   |

Merged: #1 scaffold, #2 D1 IDs, #3 setup state, #4 this note, #5 Lighthouse evidence, #6 Lighthouse median of three.
Decisions 0001–0013 are in `docs/decisions/`.

## How to work now

- **Everything goes through a pull request.** `main` can't be pushed to, by anyone. Branch, commit small, open a PR,
  wait for `Test`, open the preview link (it asks for the Access one-time code), then merge with a merge commit.
- **Stacked PRs:** don't delete the base branch of a PR that another PR targets. GitHub closes the dependent PR
  instead of retargeting it. Retarget it to `main` first, then delete.
- **Repository variables are fixed when a run starts.** A run created before `PREVIEW_DEPLOY` or `STAGING_DEPLOY`
  changes still sees the old value; push again or open a new PR.
- **Install with `pnpm install --frozen-lockfile`.** pnpm 12 refuses versions younger than a day
  (`minimumReleaseAge: 1440`); pin an older release rather than adding an exclusion.
- **Run what CI runs before pushing:** `pnpm lint && pnpm typecheck && pnpm build && pnpm validate:html && pnpm test:unit && pnpm test:e2e`.
- Never deploy by hand without `--env`; CI is the normal path now.
- **A green deploy job is not proof of a deploy.** Until PR #4 the workflow ran without `pipefail`, and a preview upload
  that failed for lack of a token reported success. The workflow now defaults to `shell: bash` (`-eo pipefail`). Check
  the log for "Uploaded philglov-…" and the version ID, or `wrangler deployments list`.

## Owner decisions taken during the Lead session

- The dependency cap (< 10) counts runtime `dependencies` only; dev tools are justified one by one (0007).
- No AI translation anywhere; both languages are written by hand; an entry may exist in one language (0012).
- Fonts: up to 4 files, 120 KB (Archivo upright, Source Serif 4 upright + italic, JetBrains Mono), per the new guide.
- Repository is public; previews share the staging R2 buckets but have their own D1 (0008).
- Access policy is "Cloudflare account" (members of the account). Never "Email domain": with gmail.com it would admit
  every Gmail user.

## Open items

**For the owner**

1. **At launch, give the deploy token zone access for philglov.es** (`docs/setup.md`, end of step 12). The Actions
   secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were briefly missing on 2026-11-11 and were added back
   with a new token that deliberately has no zone access until launch.
2. Confirm passkeys (or hardware keys) on GitHub and Cloudflare, with no SMS fallback. Nobody else can check this.
3. Placeholders for the rights and privacy pages and About (TICKETS.md, O1): contact email, city, launch date,
   profiles for `sameAs`, bio, About photo.
4. Optional: rename the Zero Trust team `gentle-hall-eae9` (Zero Trust → Settings) before the login page matters.

**For the agents**

- `docs/setup.md` steps 9 and 10 (Worker secrets, GitHub App) are deliberately not done; the backend agent asks for
  them when it needs them. Each Worker's AUD tag and the team JWKS URL are on its Access tab in the dashboard.
- Lighthouse runs 3 times per page and judges every budget on the median (decision 0013, TICKETS.md Q16): one slow
  CI run can no longer fail a page. If Lighthouse still fails, the page missed the budget in at least 2 of 3 runs, so
  treat it as real. Read every run's metrics in the job summary before changing any budget.
- On the Lead's Windows laptop `lhci autorun` sometimes dies with `NO_NAVSTART` (TICKETS.md, Q17); CI on Linux never
  has. Locally, trust the CI run.
- `.claude/launch.json` (local preview server for the app's browser pane) exists only on the Lead's laptop, not in the
  repository.

## Design system (agent 2) — 2026-11-12

Ticket D1–D12, decisions [0014](decisions/0014-design-system.md) (design system) and
[0015](decisions/0015-one-typeface-crimson-pro.md) (typography, supersedes the font parts of 0014). Branch
`design/d1-design-system`. The first typography (Archivo, Source Serif 4 as "PG Serif", JetBrains Mono) was replaced the
same day by the owner's new guide: one family, Crimson Pro.

**What exists.** `src/styles/tokens.css` (colour tokens, measured contrast, type/space/radius/motion scales),
`src/styles/site.css` (the one stylesheet, 6.4 KB brotli), two Crimson Pro files in `public/_assets/fonts/` with `crimson-pro-OFL.txt` (64 KiB of the 80 KB budget),
`Arrow.astro` / `Arrows.astro` (the one SVG arrow), `src/assets/brand/` (placeholder favicon, apple-touch-icon, share-image template, `brand.config.ts`), `SiteHeader` and
`SiteFooter` components wired into `BaseLayout`, and `/styleguide` (noindex, both themes, every component; the markup in
`src/components/styleguide/` is the markup to copy). `BaseLayout` now takes `current` (nav item) and `footer`
(`"rule"` default, `"flat"` for the home page, which already ends in a hairline).

**Verified.** Built home and entry markup compared with the two prototypes (rendered to static HTML) at 1440 and 390;
no horizontal scroll from 1440 down to 320; no console messages; 1,800 rendered text nodes, both themes, 0 below
4.5:1; `pnpm lint`, `typecheck`, `validate:html`, 35 unit tests, 14 e2e tests (against a local Worker) pass;
print hides header, footer and forms; a navigation gets a `ViewTransition`. Not done: Firefox/WebKit, real devices
(iOS 15), Lighthouse, a keyboard walkthrough of every control, a real screen-reader pass: that is QA's.

**Owner decisions taken.** One typeface, Crimson Pro; font budget 80 KB (rule 8); weight 300 only at 28 px and larger;
code in the system monospace; interface arrows as one inline SVG; 16 px grid gap at 640 px and below.

**Notes for the next agents.**

- _Frontend (F1):_ the inline theme script must only set `data-theme` on `<html>` ("light" | "dark") and
  `aria-pressed` on `.theme-toggle` (the header button carries `data-theme-toggle`). Its SHA-256 goes into
  `contentSecurityPolicy()`. `SiteHeader` has a `demo` mode (no landmarks) used by the styleguide.
  The footer's report form posts `message` and `email` to `/api/report`; F4/B2 add the honeypot and token fields.
- _Frontend:_ use real `<h1>`, `<table>` with `<caption>`/`<th scope>` and real lists. The stacked phone layout of the
  journal table changes `display` on table elements, which some screen readers answer by dropping the table
  semantics; consider `role="table|row|cell"` if QA's testing shows it. Lists with `list-style: none` have no
  `role="list"` (html-validate calls it redundant); Safari/VoiceOver then drops list semantics: also for QA to judge.
- _Frontend:_ a `<pre>` in an entry needs `tabindex="0"` to scroll by keyboard.
- _Photo (P):_ put the image in `.frame`; choose a ratio class (`frame--hero`, `--wide`, `--fig`, `--tall`, `--land`,
  or `--auto` for the single-photo page) and the nearest `.tone-N`. Do not set `aspect-ratio` on the `<img>`.
- _Backend (B4/B8):_ admin pages use `class="admin"` on `<body>` and the classes shown in the styleguide's Admin
  section (`admin-bar`, `admin-main`, `card`, `queue`, `actions`, `badge`, `alert`, `notice`, `upload`).
- _Content:_ `shareImageSvg(title)` fills the share template; it is pure and tested.
- Do not rebuild the fonts casually: `scripts/build-fonts.py` pins the source commit and checks hashes. Crimson Pro
  reserves no font name; if a font ever does, the subset must be renamed (the unit test checks).
- _Frontend:_ never type an arrow character in a template or an Italian/English string that is not rendered through
  `<Arrows text=…>`; Crimson Pro has no arrows. Footnote back-links (`↩` from remark) need
  `remarkRehype.footnoteBackContent` set when the entry template is built, or that glyph comes from a system font.
- _QA:_ the Iowan Old Style fallback shares Palatino's measured numbers (not measured on Windows); check the swap on a
  Mac, and on iOS 15.
- Local checking: `pnpm preview` is fixed to port 8787; if another Worker already holds it, run
  `pnpm exec wrangler dev --port 8788 --ip 127.0.0.1`. `pnpm build` empties `dist/`, which a running `wrangler dev`
  does not recover from: restart it after every build.

## Frontend (agent 3) — 2026-11-12

Tickets F1–F7 plus the Design agent's two open tickets (share-image PNG, footnote arrow); decision
[0016](decisions/0016-frontend-pages.md) has the details and the **form contract the Backend agent must follow**
(field names, slots, anchors).

**Verified.** `pnpm lint`, `typecheck`, `build`, `validate:html`, 59 unit tests, 53 e2e tests (every sitemap page × both
themes × 320/390/768/1024/1440 px, JS on and off: one h1, no overflow, no console noise, nothing third-party, no inline
styles). Page weight about 80 KB. Share PNG looked at by eye.
**One unexplained flake:** the page-matrix e2e failed once on its first run (problem list not captured) and passed in
the nine runs after; not reproduced.
**Not done / not verified:** Lighthouse (Windows `NO_NAVSTART`, Q17; I added `/journal`, `/lisbona`,
`/photos/lisbon/tram-28` to `lighthouserc.json`, unverified, trust CI); Firefox/WebKit; a screen-reader pass; the
visual comparison with the prototypes was by eye at 1440 only; photos are tone placeholders (P2); forms post to a
Worker route that does not exist yet (404).

**For the owner.** Everything marked `[placeholder]` is a stand-in: entries, Now, About, the photo series, contact email
and city (`src/data/site.json`, rights and privacy texts), `sameAs`. Italian UI strings I added (home, journal, photos,
forms) are drafts: please read them. Rights and privacy are the guide's texts with `originalLang: en`; change it if you
wrote them in Italian first.

**For other agents.** Content (C): `src/lib/entries.ts` already does C1's twin, label and marker helpers and
`lib/topics.ts` is the topic list; add the C2 check (a slug used by an entry and a page collides in `[slug].astro`) and
replace the seed. Photo (P): swap `Photo.astro` for `<picture>`; set `contentUrl` in the ImageObject. Design: I added
`.field-error:empty{display:none}` and let `.series` style `h3` as well as `h4`.

## Next step

Start the **Content** (agent 4), **Backend** (5) and **Photo** (6) agents, which can run in parallel, then **Frontend**
(3) for the pages; each reads `CLAUDE.md`, this file and its prompt in `docs/guide.md`. The typography is settled (0015).
