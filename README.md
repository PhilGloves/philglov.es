# philglov.es

Personal site of Filippo Guanti: photographs, a journal, About and Now, in English and Italian. Static Astro site
served by one Cloudflare Worker. The rules are in [CLAUDE.md](CLAUDE.md), the full plan in
[docs/guide.md](docs/guide.md), the work in [TICKETS.md](TICKETS.md), the owner's setup steps in
[docs/setup.md](docs/setup.md) and the reasons in [docs/decisions/](docs/decisions/).

> Build phase: the site deploys only to a private staging address behind Cloudflare Access. Items marked _(ticket X)_
> describe the intended workflow before that ticket has landed.

## Getting started

Needs Node 26 and pnpm 12 (`npm install -g pnpm@12.18.0`).

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build && pnpm preview
```

`pnpm preview` serves `dist/` through the real Worker at http://127.0.0.1:8787. `pnpm dev` is faster for templates but
skips the Worker (no headers, no forms). Before pushing, run what CI runs:

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm validate:html && pnpm test:unit && pnpm test:e2e
```

## Add a page

1. Pick a short slug: lowercase ASCII letters, digits and hyphens, not a reserved one (`it`, `journal`, `photos`,
   `now`, `about`, `rights`, `privacy`, `admin`, `api`, `_assets`, `feed.xml`, `styleguide`, `404`).
2. Write it in the language you think in. A journal entry goes in `src/content/journal/<lang>/<slug>.md`; About, Now
   and other pages go in `src/content/pages/<lang>/<slug>.md`.
3. Frontmatter (the build fails if anything is missing or inconsistent):

   ```yaml
   title: "Tre settimane a Lisbona"
   description: "One sentence for search results and link previews"
   date: 2026-10-29
   lang: it # language of THIS file
   originalLang: it # language you actually wrote it in
   translation: original # original | machine | reviewed
   tags: [travel, photography] # travel | photography | projects | thoughts
   comments: true
   ```

4. Create a branch, commit, push, open a pull request. CI adds the translation, builds, tests and posts a preview link.
   Merge when the preview reads right.

From the phone: open `/admin/write`, write, add photos with alt text, tap Publish — it opens the same kind of pull
request _(ticket B8)_.

## Translate

- Automatic: CI's first job writes the missing or outdated twin (`translation: machine`) into the same pull request. A
  twin you marked `reviewed` is never overwritten; CI flags it instead _(ticket C3)_.
- By hand on the laptop: `pnpm translate src/content/journal/it/lisbona.md`, with the API key in a git-ignored `.env`
  _(ticket C3)_.
- After reading a machine translation: `pnpm review <path>` on the laptop, or **Mark reviewed** in `/admin` on the
  phone, flips it to `reviewed` _(tickets C4, B8)_.

## Moderate comments

New comments and error reports arrive by email (page title and a link only, never the comment). Open `/admin` (Access
one-time code), then approve, reject, reply or delete. Approved comments appear on the entry within a minute, with no
rebuild _(tickets B3–B6)_. Delete removes the comment with its name and email for good, for deletion requests.

## Deploy

Everything deploys from CI; nothing deploys from a laptop except the one-off first deploy in `docs/setup.md`.

- Pull request → green CI → preview URL `pr-<n>-philglov-preview.<subdomain>.workers.dev` (behind Access).
- Merge to `main` → green CI → staging `philglov-staging.<subdomain>.workers.dev` (behind Access).
- From launch: merge to `main` → green CI → https://philglov.es (switched on in `docs/setup.md`, Part 2).

Deploys are switched on with the repository variables `PREVIEW_DEPLOY`, `STAGING_DEPLOY` and `PRODUCTION_DEPLOY`.

## Roll back

Fastest: put the previous Worker version back (code and static files together).

```bash
pnpm exec wrangler deployments list --env staging
```

```bash
pnpm exec wrangler rollback --env staging
```

`wrangler rollback` without an ID goes back one version; pass a version ID from the list to pick one. Use
`--env production` after launch. Then fix forward properly: revert the bad pull request on GitHub (**Revert** button),
let CI go green, and merge. A rollback does not undo D1 migrations; migrations must stay backward-compatible for one
release so a rolled-back Worker still runs. Comments and reports can be restored from the weekly R2 backup _(ticket
B9)_.
