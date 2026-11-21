# Owner playbook — when something breaks, and small changes

Short step lists for running the site alone. Commands are for PowerShell unless they say Git Bash; both run inside the
repository folder (README, "On Windows"). Labels marked _(not checked)_ are dashboard or GitHub labels the agent
could not see from the repository; the rest match the repository or `docs/setup.md`. If a label has moved, search the
page for the setting's name.

Three rules hold everywhere:

- Never merge a pull request whose **Test** is red. The ruleset "Protect main" does not let you anyway.
- A secret goes only into the place a step names, typed or pasted by you: never into a chat, an issue, a pull request,
  a commit or a file in the repository.
- While something is broken on the site, do not publish from the phone: a publish merges by itself and deploys
  `main` again.

## Test is red

1. Open the pull request. At the bottom, next to the red **Test**, click **Details**. The run page opens on the job.
2. Find the step with the red mark, open it, and read the first red line. Then, by step:
   - **Publisher pull requests change entry files only**: a pull request from the phone changed something other than
     an entry file. Do not merge it; close it and tell an agent, with its address.
   - **Lint**: Prettier or ESLint names the file and line. A formatting problem goes away with `pnpm format`; commit
     and push the result.
   - **Typecheck**: names the file and line; the code needs a fix.
   - **Fetch photo originals from R2**: `could not fetch N from <bucket>` lists photos the site uses (entry photos,
     the portrait, series photos) that are not in that bucket. Upload the missing ones to that bucket, or check that
     the R2 secrets and the `R2_ORIGINALS_BUCKET` variable name the bucket the builds should read (after launch:
     `philglov-originals`). Without the photo the page would show a grey frame, so the build stops instead.
   - **Build**: the first error line says which check stopped it.
     - `Content check failed:` lists entries with a problem (a front matter field missing or misspelled, a slug, the
       other version, alt text). Fix the file it names.
     - `check-originals: N photographs used by journal entries are not in src/.originals` lists photos that are not
       in the bucket the builds read. A phone pull request: open the entry on `/admin/write`, add the photo again and
       publish. A Dependabot pull request: its build could not reach the bucket at all; see "A Dependabot pull request",
       step 5.
     - `postbuild: these pages hold HTML the site does not allow` lists pages and the HTML in them: raw HTML in an
       entry that could redirect, embed, collect or run something (decision 0030). Take it out of the entry.
   - **Unit tests**, **Worker tests**, **End-to-end …**, **Smoke subset in Firefox and WebKit**: the test's name says
     what failed. At the bottom of the run page, **Artifacts** → `test-reports` has the browser report: download,
     unzip, open `playwright-report/index.html`; each failure has a screenshot.
   - **Lighthouse CI**: the step's last lines name the budget that failed; the run's summary lists every run's
     scores and timings.
3. If the failure names nothing the pull request changed (a timeout, `ECONNRESET`, a download that failed): top right
   of the run page, **Re-run jobs** → **Re-run failed jobs**, once. The same failure twice is real.
4. Fix it on the same branch and push; Test runs again by itself. A phone pull request: fix the text on
   `/admin/write` and publish again, or close the pull request.
5. Still stuck: copy the red lines (they hold no secrets: GitHub hides every secret as `***`) and ask an agent.

## A deploy failed

Deploys run after Test, as **Deploy staging** (every merge), **Deploy preview** (pull requests) and, from launch,
**Deploy production**. A failed deploy changes nothing: the site keeps the version it had.

1. GitHub → **Actions** → the run with the red mark → the red deploy job → the red step.
2. By step:
   - **Deploy**, **Upload preview version** or **Apply database migrations** says `Authentication error`, `10000`,
     `401` or `403`: the deploy token has expired, was deleted or lacks a permission. Make a new one as in "A key or
     secret leaked", list 1, then step 3 here.
   - **Apply database migrations** with an SQL error: a migration needs a fix in the code. Ask an agent; do not
     re-run it again and again.
   - **Build for production** (production only): read it as Test's **Build** step above.
   - Anything that looks like Cloudflare itself (`5xx`, `timeout`): check https://www.cloudflarestatus.com, wait, then
     step 3.
3. **Re-run jobs** → **Re-run failed jobs**. If it fails the same way after you replaced a secret, push a new commit
   (or merge the next pull request) to start a fresh run: a re-run keeps some of what its first run started with
   (`docs/setup.md`, step 16).

## Undo a bad deploy

1. Put the previous version back. In PowerShell, after `pnpm exec wrangler login` once on this computer:

   ```powershell
   pnpm exec wrangler deployments list --env staging
   ```

   ```powershell
   pnpm exec wrangler rollback --env staging
   ```

   Without a version ID it goes back one version; paste an ID from the list to go further. After launch use
   `--env production`. In the dashboard: Workers & Pages → the Worker → **Deployments** → the version before → roll
   back to it _(not checked)_.

2. Revert the pull request that caused it: its page on GitHub → **Revert** → a new pull request opens → wait for a
   green Test → merge. Until it is merged, merge nothing else and do not publish from the phone: each merge deploys
   `main` again, bad change included.
3. A rollback does not undo database migrations. Comments and reports that were lost come back from the weekly backup
   (README, "Restoring comments and reports").

## A key or secret leaked

Leaked means it was seen where it should not be: pasted in a chat, an issue or a pull request, committed, in a
screenshot, or on a lost laptop. A secret that reached GitHub in a commit is public for good, even after the commit is
removed. For each, in this order: **revoke** it where it was made, **create** a new one, **paste** it where it is
used, **check**.

1. **Deploy token, `CLOUDFLARE_API_TOKEN`.** It can change the Workers and databases.
   - Revoke: Cloudflare → My Profile → **API Tokens** → the token → **Delete** (or **Roll** for a new value at once)
     _(not checked)_.
   - Create: `docs/setup.md` step 6 (two permissions). Production's own token: step 12 (four).
   - Paste: GitHub → Settings → **Environments** → `staging` → Environment secrets → `CLOUDFLARE_API_TOKEN` → the
     pencil → paste; the same in `preview`. Production's token goes only into `production`.
   - Check: on the latest run of CI on `main`, **Re-run all jobs**; **Deploy staging** turns green.
2. **R2 read keys for CI, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.** They can read every photo original, at
   full size, some with GPS positions.
   - Revoke: Cloudflare → **R2 Object Storage** → **Manage API tokens** → the token → **Delete** _(not checked)_.
   - Create: `docs/setup.md` step 5 (**Object Read only**, the originals bucket the builds read).
   - Paste: GitHub → Settings → Secrets and variables → **Actions** → both repository secrets, then → **Dependabot**
     → both again.
   - Check: re-run Test on any pull request; **Fetch photo originals from R2** prints `… downloaded` with no warning.
3. **Your laptop's R2 token** (README, "Photo originals on your laptop"). Revoke it in the same list, and make a new
   one the next time you need it. Nothing else uses it.
4. **Access service token, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.** It opens staging to whoever has it.
   - Revoke: Zero Trust → Access → **Service credentials** → **Service Tokens** → the token → delete it.
   - Create: `docs/setup.md` step 8b, steps 1 and 2: a new token, and add it to the staging policy (a new token is
     not in the policy until you add it).
   - Paste: GitHub → Settings → Secrets and variables → **Actions** → both repository secrets (step 8b, step 3).
   - Check: step 8b, step 4 (the two numbers `200` and `302`).
5. **Form key and IP salt, `FORM_HMAC_KEY` and `IP_SALT`.** Worker secrets; no one has ever seen them, so a leak is
   only from a command's output pasted somewhere. Nothing to revoke: replacing them is enough. In Git Bash, the two
   `openssl rand … | pnpm exec wrangler secret put …` commands of `docs/setup.md` step 9 for that site (`versions
secret put` for preview). With a new form key, a form already open in someone's browser fails once and works on
   the next Send. A new salt only starts the rate-limit counts over.
6. **GitHub App key, `GITHUB_APP_PRIVATE_KEY`.** Urgent: whoever has it can push branches and open pull requests as
   the App, and an entry-only one merges by itself.
   - Create first, so publishing keeps working: `docs/setup.md` step 10, steps 4 and 5 (generate a new key, convert
     it, store it for staging and preview, and production after launch; delete the files).
   - Revoke: GitHub → Settings → Developer settings → **GitHub Apps** → `philglov-publisher` → **Edit** → **Private
     keys** → the old key (by its date) → **Delete**.
   - Check: the next time you publish, Publish opens its pull request as usual. "Publishing is not set up" or a
     GitHub error means the new key is not in place for that site. (Do not publish a test entry to check: it merges
     by itself.)
7. **A lost laptop.** It holds wrangler's login and perhaps photo originals. Change your Cloudflare password and sign
   out its other sessions (My Profile _(not checked)_), revoke the laptop's R2 token (list 3), and check GitHub →
   Settings → **Sessions**.

The two tokens made for the launch copy of the photos are deleted straight after it (`docs/setup.md`, step 12b,
step 7).

## A Dependabot pull request

Every week Dependabot opens pull requests that update a package (`Bump astro from 7.4.8 to 7.4.12`) or a GitHub
Action. They get no preview. The guide's rule: merge only when Test is green; a major version gets its own pull
request and a full QA run.

1. Read the title: `from A.B.C to X.Y.Z`. Only the last number changed, or the middle one: an ordinary update. The first
   number changed (`7.4.12 to 8.0.0`): a major one, step 6.
2. **Files changed** should show only `package.json` and `pnpm-lock.yaml` (or, for an Action, one line in
   `.github/workflows/ci.yml` with a new commit number). Anything else: do not merge; ask an agent.
3. Wait for **Test** (the full scope: about a quarter of an hour).
4. Green: **Merge pull request** → **Confirm merge**. Staging deploys by itself; open it and look at two or three
   pages.
5. Red at **Build** with `check-originals: … not in src/.originals`, before any other error: the run could not reach
   the photo bucket. Dependabot's runs read only Dependabot secrets; Settings → Secrets and variables → **Dependabot**
   must have `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_ACCOUNT_ID` (`docs/setup.md`, step 5). Add
   what is missing, then **Re-run failed jobs**. Red anywhere else: as "Test is red".
6. A major version: do not merge from GitHub. Ask an agent to make it a pull request of its own with the full QA run
   (`pnpm qa` and `pnpm qa:production`) and to read the upgrade notes.

**Worked example: PR #31, `Bump astro from 7.4.8 to 7.4.12`.** Opened 2026-11-16; Astro is the site's builder, so
this is a runtime package, and only the last number changed. Files changed: `package.json` and `pnpm-lock.yaml`, two
files and nothing else (step 2). Test ran the full scope and went green (step 3). It was merged on 2026-11-17 at
07:15 UTC (step 4); the merge ran **Deploy staging**, which went green, and staging served the site built with
7.4.12. Its branch is named `astro-7.4.11`: Dependabot opened it for 7.4.11 and rewrote it for 7.4.12, keeping the
name. It passed at Build only because the originals cache, deleted the same day (decision 0030), still held the
entry photos: its log says `no R2 credentials`, since Dependabot had no `CLOUDFLARE_ACCOUNT_ID`. The next one needs
step 5.

## Change an Italian interface string

The words of the interface (menus, buttons, form labels, footer) are in `src/i18n/it.json`, the English ones in
`src/i18n/en.json`, under the same names. Pages and entries are not there: they are Markdown files in
`src/content/` (the Italian privacy and rights pages: `src/content/pages/it/privacy.md` and `rights.md`).

1. On GitHub, open `src/i18n/it.json` and find the line with your browser's search (Ctrl+F), using a few words as the
   site shows them. Each line is `"name": "text",`.
2. Click the pencil (**Edit this file**). Change only the text between the second pair of quotes. Keep:
   - every `{n}`, `{year}` or other word in braces, exactly: the site puts a number or a name there;
   - a `→` where the line has one, and add none where it has none: the font has no arrows, and the site draws only
     the ones it knows about;
   - the comma at the end of the line. Inside the text, use typographic quotes (“ ” or « ») and the apostrophe `’`,
     never a plain `"`, which would end the text.
3. **Commit changes…** → **Create a new branch for this commit and start a pull request** → **Propose changes** →
   **Create pull request** _(not checked)_. `main` is protected, so GitHub always offers a new branch.
4. Test runs the full scope. A broken line (a missing quote or comma, a lost name) stops it at **Typecheck** or
   **Build**. When it is green, the run's summary has the preview address: open the Italian page there, check the
   words, and merge.

## Change a field in site.json

`src/data/site.json` holds a few facts about you that several pages use. Edit it as in the section above (steps 1–4).
JSON's rules: text in double quotes, a comma between items and none after the last, `null` (no quotes) for "none".

| Field           | What it is, where it shows                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `name`          | "Filippo Guanti": header, titles, structured data, share images. Leave it.                               |
| `alternateName` | Other names people search for you by, as a list: `["Phil Guanti", "philglov"]`. Structured data only.    |
| `url`           | `https://philglov.es`. Never change it.                                                                  |
| `contactEmail`  | Your public address: About page and `/.well-known/security.txt` (`phil@philglov.es`).                    |
| `city`          | About page and the home line "Based in …" / "Vivo a …" (`"Msida, Malta"`).                               |
| `partitaIva`    | `null`, or your number as text (`"01234567890"`): then the footer shows "P.IVA …". Only if you have one. |
| `sameAs`        | Your profiles, full addresses in a list: `["https://github.com/…", "https://www.instagram.com/…"]`.      |
| `portrait`      | `file` (the original's key in the photo bucket) and `alt` (`"en"`, `"it"`); see "Change the portrait".   |

## Change the portrait

The portrait on About is an original like every photo: it lives in the private photo bucket, never in the
repository, and the build makes the served copies (which carry no location). `site.json` `portrait` names it: `file`
is its key in the bucket, `alt` its description in each language. The commands below are for the current one,
`imgs/portrait.jpg` uploaded as `portrait/finisterre.jpg`; for another photo, change those two names everywhere.

1. Make a copy with its location removed in `src/.originals/portrait/` (that folder is never committed). With
   exiftool, in PowerShell from the repository folder:

   ```powershell
   exiftool -gps:all= -xmp:all= -o src/.originals/portrait/finisterre.jpg imgs/portrait.jpg
   ```

2. Upload the copy to the photo bucket (log in first with `pnpm exec wrangler login` if Wrangler asks):

   ```powershell
   pnpm exec wrangler r2 object put philglov-originals-staging/portrait/finisterre.jpg --file src/.originals/portrait/finisterre.jpg --content-type image/jpeg --jurisdiction eu --remote
   ```

3. In `site.json`, `portrait` `file` is `portrait/finisterre.jpg`, with both `alt` texts. Commit in a pull request:
   its Test fetches the photo, and the preview shows it on About.

The launch gate (`pnpm test:launch`, and the informational step on CI) fails while `contactEmail` is not a real
address, `sameAs` is empty or `portrait` is `null`, **and while a page of the site still has a bracketed gap**. It reads
About, Now, Privacy and Rights (both languages) and the home page; each line of its failure names the page and the
bracketed text, so you can search for that text in the repository. The gaps it counts:

- `[launch date]`, `[city]`, `[your contact email]` and their Italian twins `[data di lancio]`, `[città]`, `[la tua email
di contatto]`, in `src/content/pages/en/privacy.md` and `it/privacy.md`; `[your contact email]` in `rights.md` (both
  languages);
- `[contact email]` and `[city]`, which come from `contactEmail` and `city` in `src/data/site.json` (the About page);
- `Based in [City]` / `Vivo a [città]` on the home page: the line `heroBased` in `src/i18n/en.json` and `it.json` (a second
  place for the city; replace it with the same word);
- a bracket that starts with "Placeholder" or "Segnaposto" on About or Now: the sample bio and Now texts, which you
  replace by writing the real ones.

It does **not** read journal entries or photo series: a bracket you write in an entry (`[sic]`) is never a gap, and the
sample entries and sample photo series are for you to replace or delete, not something the gate checks (decision 0022,
"Round 4").
