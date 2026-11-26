# philglov.es

Personal site of Filippo Guanti: photographs, a journal, About and Now, in English and Italian. Static Astro site
served by one Cloudflare Worker. The rules are in [CLAUDE.md](CLAUDE.md), the full plan in
[docs/guide.md](docs/guide.md), the work in [TICKETS.md](TICKETS.md), the owner's setup steps in
[docs/setup.md](docs/setup.md), what to do when something breaks in [docs/owner-playbook.md](docs/owner-playbook.md),
and the reasons in [docs/decisions/](docs/decisions/).

> Build phase: the site deploys only to a private staging address behind Cloudflare Access.

## Getting started

Once per computer you need:

- **Node 26** and **pnpm 12** (`npm install -g pnpm@12.18.0`).
- **Git**, with **bash** on PATH: the unit tests and every command in `docs/setup.md` use it. On Windows that is Git for
  Windows (below).
- **Chromium for Playwright**: the build draws the share images with it, and the browser tests run in it.
- **ExifTool**: the build writes the rights fields into every photograph and refuses one with GPS data.
- **The photo originals**, or the stand-in option: an entry photograph missing from `src/.originals/` stops the build.

On Windows, "On Windows" below has each of these as steps. Then:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm exec playwright install chromium
```

```bash
pnpm build
```

```bash
pnpm preview
```

`pnpm preview` serves `dist/` through the real Worker at http://127.0.0.1:8787 (Ctrl+C stops it). `pnpm dev` is faster
for templates but skips the Worker (no headers, no forms).

## Run what CI runs

There are two builds (decision 0033). `pnpm build` builds **your site**: your entries, pages and photo series in
`src/content`. That is the only build that is ever deployed. `pnpm build:fixtures` builds **the test site** from
`tests/fixtures/content` (sample entries, a sample series, small generated photos, no R2), and every test suite runs on
that one, so nothing you write, edit or delete can make a test fail. The suites refuse to run on your own build and say
which command to run instead.

CI has one required check, **Test**, and it picks one of two scopes (step "How much to test" in
`.github/workflows/ci.yml`):

- **Content scope**: the pull request only adds or changes journal entries, `src/content/journal/en|it/<slug>.md`, as
  plain files. That is what the phone publishes. Test runs lint, then builds your site (with the content check) and
  checks it: html-validate, the photo rights, and the smoke test of every page (`pnpm test:site`: status, console,
  requests, accessibility, links, sitemap, feeds).
- **Full scope**: everything else. It builds the test site and runs typecheck, the unit and Worker tests, the whole
  browser suite with the QA matrix, Firefox and WebKit, Lighthouse, and a `SITE_ENV=production` test build with the
  SEO, rights and Lighthouse SEO checks; then the smoke test on an empty site (no entry, no series); then your site
  exactly as in the content scope. The launch gate runs on your site too, but does not block until owner question O1
  is answered.

Before pushing, stop `pnpm preview` (the tests start their own server and would reuse a stale one), then run the
steps one after another, stopping at the first that fails. For an entry only:

```powershell
foreach ($step in "lint", "build", "validate:html", "test:site") { pnpm $step; if ($LASTEXITCODE -ne 0) { "Stopped at: $step"; break } }
```

For anything else (it takes a while: the QA matrix alone is about 20 minutes on a fast laptop):

```powershell
foreach ($step in "lint", "typecheck", "build:fixtures", "validate:html", "test:unit", "test:worker", "test:e2e", "test:cross", "test:lighthouse") { pnpm $step; if ($LASTEXITCODE -ne 0) { "Stopped at: $step"; break } }
```

```powershell
foreach ($step in "build", "validate:html", "test:site") { pnpm $step; if ($LASTEXITCODE -ne 0) { "Stopped at: $step"; break } }
```

```powershell
pnpm qa:production
```

`pnpm qa:production` includes the launch gate, which fails until O1 is answered, as on CI. On Windows,
`test:lighthouse` sometimes stops with Lighthouse's `NO_NAVSTART` error before judging anything (`TICKETS.md`, Q17);
CI's run on Linux is the one that counts.

`test:cross` needs Firefox and WebKit once: `pnpm exec playwright install firefox webkit`. In Git Bash, the same
steps as one line: `for step in lint build validate:html test:unit; do pnpm "$step" || break; done`. `pnpm qa` is the
QA agent's run: build, html-validate, unit, Worker, the e2e matrix three times (`pnpm qa 1` for once), Firefox and
WebKit.

## On Windows

These steps are for Windows 11 and its own **Windows PowerShell 5.1**. Two things differ from other shells:

- It cannot chain commands with `&&` or `||`. Run commands one at a time, as in the blocks here, or with the
  `foreach` lines above, which stop at the first failure.
- `$env:NAME = "value"` sets a variable until the window closes or `Remove-Item Env:NAME` removes it.

### Once per computer

1. **Node 26** from nodejs.org. `node --version` prints `v26.…`.
2. **pnpm**: `npm install -g pnpm@12.18.0`, then `pnpm --version` prints `12.18.0`. If PowerShell says that running
   scripts is disabled on this system, type `npm.cmd` and `pnpm.cmd` instead of `npm` and `pnpm`, here and in every
   command after: they are the same tools, started without the PowerShell script that the policy blocks.
3. **Git for Windows** from git-scm.com, with the installer's defaults. It brings Git Bash (used by `docs/setup.md`)
   and the `bash` the unit tests start, but puts only `git` on PATH. Check:

   ```powershell
   (Get-Command bash -ErrorAction SilentlyContinue).Source
   ```

   It must print `C:\Program Files\Git\bin\bash.exe`. If it prints nothing: Start → "Edit environment variables for
   your account" → **Path** → **Edit** → **New** → `C:\Program Files\Git\bin` → OK, and open a new PowerShell window.
   If it prints `C:\Windows\System32\bash.exe`, that is the Linux subsystem's bash, not Git's: run the tests from Git
   Bash instead.

4. **ExifTool**: follow [ExifTool's Windows instructions](https://exiftool.org/install.html) (the "Windows
   Executable" zip: rename `exiftool(-k).exe` to `exiftool.exe` and keep the `exiftool_files` folder next to it), in a
   folder of your own such as `C:\Users\<you>\AppData\Local\Programs\ExifTool`. Add that folder to **Path** as in
   step 3, open a new window, and check: `exiftool -ver` prints a version number.
5. In the repository folder: `pnpm install --frozen-lockfile`, then `pnpm exec playwright install chromium`.

### A first build without the photographs

The originals are private and never in git. To look at the site without them, opt in to grey stand-ins for this one
build:

```powershell
$env:ALLOW_MISSING_ORIGINALS = "1"; pnpm build; Remove-Item Env:ALLOW_MISSING_ORIGINALS
```

The build prints `WARNING: ALLOW_MISSING_ORIGINALS=1: … missing` with the file names, and removes the stand-ins when
it ends. CI refuses the option. `docs/setup.md` step 5 says more.

### Photo originals on your laptop

`pnpm photos:fetch` downloads the originals the content uses into `src/.originals/` (git-ignored). It needs a
read-only R2 token of your own; CI's cannot be read back from GitHub. Create one: Cloudflare → **R2 Object Storage** →
**Manage API tokens** → Create **Account API token** → **Object Read only** → apply to the bucket
`philglov-originals-staging` (after launch: `philglov-originals`). Keep its Access Key ID and Secret Access Key in
your password manager, never in a file.

In one PowerShell window, set the four values for this window only. `Read-Host` asks for each, so nothing you type
goes into PowerShell's command history, which is saved to a file:

```powershell
$env:R2_ACCOUNT_ID = Read-Host "Account ID"
$env:R2_ACCESS_KEY_ID = Read-Host "Access Key ID"
$env:R2_SECRET_ACCESS_KEY = [Net.NetworkCredential]::new("", (Read-Host "Secret Access Key" -AsSecureString)).Password
$env:R2_BUCKET = "philglov-originals-staging"
```

```powershell
pnpm photos:fetch
```

It prints `fetch-originals: 5 needed, 5 downloaded, 0 cached` or similar. `no R2 credentials` means one of the four is
empty; it then fetches nothing and still ends without an error. Clear them (closing the window does it too):

```powershell
Remove-Item Env:R2_ACCOUNT_ID, Env:R2_ACCESS_KEY_ID, Env:R2_SECRET_ACCESS_KEY, Env:R2_BUCKET
```

The Account ID is on the right of Workers & Pages → Overview, and `pnpm exec wrangler whoami` prints it.

## Add a page

1. Pick a short slug: lowercase ASCII letters, digits and hyphens, not a reserved one (`it`, `journal`, `photos`,
   `now`, `about`, `rights`, `privacy`, `admin`, `api`, `_assets`, `feed.xml`, `styleguide`, `404`).
2. Write it in whichever language feels right. `pnpm new <slug> --lang it` (or `--lang en`) creates the file ready to
   fill in; by hand, a journal entry goes in `src/content/journal/<lang>/<slug>.md`, and About, Now and other pages go
   in `src/content/pages/<lang>/<slug>.md`.
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

From the phone: open `/admin/write`, write, add photos with alt text, tap Publish. It opens the same kind of pull
request, which merges by itself once Test is green. Step by step:
[docs/publishing-from-the-phone.md](docs/publishing-from-the-phone.md).

## Add the other-language version

Everything is written by hand; nothing on this site is machine-translated, and there is no translation tool.

- Write the other version whenever you like, with the **same slug**, in the other language folder:
  `pnpm new lisbona --lang en` creates `src/content/journal/en/lisbona.md` with `lang: en` and `originalLang` taken
  from the Italian file. On the phone, open `/admin/write` and tap "Write the English version" on the entry's row: the
  slug and the photos come with it, and the Italian text is shown for reference
  ([docs/publishing-from-the-phone.md](docs/publishing-from-the-phone.md), decision 0029).
- A page is your translation when `lang` differs from `originalLang`. Its label, in the details block at the end of
  the entry, reads "Originally written in Italian · Read the original →".
- Until the other version exists, the entry says "Not yet available in Italian" (or "Non ancora disponibile in
  inglese"), is listed in the other language's journal index as `IT only` / `solo EN`, and has no `hreflang`
  pair. Write photo alt text and captions in the other language at the same time.

## Moderate comments

New comments and error reports arrive by email (page title and a link only, never the comment). Open `/admin` (Access
one-time code), then approve, reject, reply or delete. Approved comments appear on the entry within a minute, with no
rebuild. Delete removes the comment with its name and email for good, for deletion requests.

## Deploy

Everything deploys from CI; nothing deploys from a laptop except the one-off first deploy in `docs/setup.md`.

- Pull request from a branch of this repository → green Test → preview URL
  `pr-<n>-philglov-preview.<subdomain>.workers.dev` (behind Access), shown in the run summary. Pull requests from a
  fork and from Dependabot get no preview: they cannot read the deploy token.
- Merge to `main` → green Test → staging `philglov-staging.<subdomain>.workers.dev` (behind Access).
- From launch: merge to `main` → green Test → https://philglov.es (switched on in `docs/setup.md`, Part 2).

Deploys are switched on with the repository variables `PREVIEW_DEPLOY`, `STAGING_DEPLOY` and `PRODUCTION_DEPLOY`. The
deploy token, `CLOUDFLARE_API_TOKEN`, is a secret of the `staging` and `preview` environments only (and of
`production` from launch); `CLOUDFLARE_ACCOUNT_ID` and the R2 keys are repository secrets (`docs/setup.md`, steps
5 and 6).

## Roll back

Fastest: put the previous Worker version back (code and static files together). It needs `pnpm exec wrangler login`
once on this computer (`docs/setup.md`, step 2).

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

Every Monday at 04:00 UTC the Worker writes `backups/YYYY-MM-DD.json` to its backups bucket and deletes each one once it is 12 weeks old. To
put one back (decision 0030), use the names of the site you restore:

| Site                     | Backups bucket             | Database flag      |
| ------------------------ | -------------------------- | ------------------ |
| Staging (before launch)  | `philglov-backups-staging` | `--env staging`    |
| Production (from launch) | `philglov-backups`         | `--env production` |

The commands below are for staging; for production, change both names. They need `pnpm exec wrangler login` once on
this computer, and run in PowerShell or Git Bash from the repository folder. `backup.json` and `restore.sql` are
git-ignored there.

1. **See which backups exist.** Cloudflare dashboard → **R2 Object Storage** → the backups bucket → the `backups/`
   folder (labels not checked by the agent; the bucket is in the EU jurisdiction, so if the list does not show it,
   look for a jurisdiction choice above the list). Each file is named after the Monday it was written; pick the newest
   from before the loss. Wrangler has no command that lists them.
2. **Download it**, with its name in place of the date:

```bash
pnpm exec wrangler r2 object get philglov-backups-staging/backups/2026-11-16.json --jurisdiction eu --remote --file backup.json
```

3. **Turn it into SQL.** The script writes `restore.sql` itself, as UTF-8 (a `>` redirect in Windows PowerShell 5.1
   would write a file D1 refuses), and refuses a file that is not a backup of this database's schema.

```bash
node scripts/restore-backup.ts backup.json restore.sql
```

4. **Run it.** Rows still in the database are left as they are; only missing ones come back.

```bash
pnpm exec wrangler d1 execute DB --env staging --remote --file restore.sql
```

5. **Delete `backup.json` and `restore.sql`**: they hold visitors' names and email addresses.

A backup cannot know what was deleted after it was taken: a comment deleted on request since that Monday comes back.
Delete it again in `/admin` (search by its email address). The daily clean-up removes anything a restore brings back
that is past its retention time. `tests/worker/ops.test.ts` restores a real backup into an empty database in every
full CI run, and `tests/unit/restore-backup.test.ts` checks the file the script writes.
