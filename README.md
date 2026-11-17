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
2. Write it in whichever language feels right. `pnpm new <slug> --lang it` (or `--lang en`) creates the file ready to
   fill in _(ticket C4)_; by hand, a journal entry goes in `src/content/journal/<lang>/<slug>.md`, and About, Now and
   other pages go in `src/content/pages/<lang>/<slug>.md`.
3. Frontmatter (the build fails if anything is missing, misspelled or extra):

   ```yaml
   title: "Tre settimane a Lisbona"
   description: "One sentence for search results and link previews"
   date: 2026-10-29
   lang: it # language of THIS file
   originalLang: it # language you actually wrote it in (same as lang for an original)
   comments: true
   ```

4. Create a branch, commit, push, open a pull request. CI builds, runs every test and posts a preview link. Merge when
   the preview reads right.

From the phone: open `/admin/write`, write, add photos with alt text, tap Publish — it opens the same kind of pull
request _(ticket B8)_. Step by step: [docs/publishing-from-the-phone.md](docs/publishing-from-the-phone.md).

## Add the other-language version

Everything is written by hand; nothing on this site is machine-translated, and there is no translation tool.

- Write the other version whenever you like, with the **same slug**, in the other language folder:
  `pnpm new lisbona --lang en` creates `src/content/journal/en/lisbona.md` with `lang: en` and `originalLang` taken
  from the Italian file _(ticket C4)_. On the phone, open `/admin/write` and tap "Write the English version" on the
  entry's row: the slug and the photos come with it, and the Italian text is shown for reference
  ([docs/publishing-from-the-phone.md](docs/publishing-from-the-phone.md), decision 0029).
- A page is your translation when `lang` differs from `originalLang`. Its label, in the details block at the end of
  the entry, reads "Originally written in Italian · Read the original →".
- Until the other version exists, the entry says "Not yet available in Italian" (or "Non ancora disponibile in
  inglese"), is listed in the other language's journal index as `IT only` / `solo EN`, and has no `hreflang`
  pair. Write photo alt text and captions in the other language at the same time.

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
release so a rolled-back Worker still runs. Comments and reports come back from the weekly backup (next section).

## Restoring comments and reports

Every Monday the Worker writes `backups/YYYY-MM-DD.json` to the backups bucket and keeps the newest 12. To put one
back (decision 0030), use the staging names now and the production ones after launch.

1. Pick the date (newest first) and download that file. The bucket is in the EU jurisdiction.

```bash
pnpm exec wrangler r2 object get philglov-backups-staging/backups/2026-11-16.json --jurisdiction eu --remote --file backup.json
```

2. Turn it into SQL. The script refuses a file that is not a backup of this database's schema.

```bash
node scripts/restore-backup.ts backup.json > restore.sql
```

3. Run it. Rows still in the database are left as they are; only missing ones come back.

```bash
pnpm exec wrangler d1 execute DB --env staging --remote --file restore.sql
```

4. Delete `backup.json` and `restore.sql`: they hold visitors' names and email addresses.

A backup cannot know what was deleted after it was taken: a comment deleted on request since that Monday comes back.
Delete it again in `/admin` (search by its email address). The daily clean-up removes anything a restore brings back
that is past its retention time. `tests/worker/ops.test.ts` restores a real backup into an empty database in every
full CI run.
