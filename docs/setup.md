# Setup — the steps only the owner can do

Agents write the code; every account, resource, secret and dashboard switch is created by you. Do the steps in order.
The commands below run in **Git Bash** (Start menu → Git Bash; it comes with Git for Windows, README "On Windows"),
inside the repository folder, after `pnpm install`. Everyday work in PowerShell is in the README; what to do when
something breaks is in [owner-playbook.md](owner-playbook.md). Cloudflare renames dashboard menus now and then; if a
path below has moved, search the dashboard for the setting's name.

Resource names used everywhere (see `wrangler.jsonc` and `docs/decisions/0008-environments.md`):

| Thing        | Staging (now)                | Previews (now)     | Production (at launch) |
| ------------ | ---------------------------- | ------------------ | ---------------------- |
| Worker       | `philglov-staging`           | `philglov-preview` | `philglov`             |
| D1           | `philglov-staging`           | `philglov-preview` | `philglov`             |
| R2 originals | `philglov-originals-staging` | (shares staging)   | `philglov-originals`   |
| R2 backups   | `philglov-backups-staging`   | (shares staging)   | `philglov-backups`     |

The builds (CI) read one originals bucket, `R2_ORIGINALS_BUCKET`: staging's until launch, production's from step 12b
on. Photos are uploaded on staging until then and on production after; staging and preview never reach production's
bucket (decision 0031).

---

## Part 1 — Now: staging, no domain needed

### 1. Accounts

1. GitHub and Cloudflare accounts protected with **passkeys** (or a hardware key). No SMS fallback.
2. In GitHub → Settings → Code security for this repository: turn on **Dependabot alerts**, **Dependabot security
   updates**, **Secret scanning** and **Push protection** (all free on public repositories), and **Private
   vulnerability reporting**.
3. GitHub → Settings → Actions → General → "Fork pull request workflows from outside collaborators": **Require approval
   for all outside collaborators**. The repository is public, so anyone can open a pull request; this stops their
   workflows from running until you look.

### 2. Log in wrangler

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

Note the **Account ID** that `whoami` prints, and your workers.dev subdomain (Workers & Pages → Overview, right-hand
side; choose one if asked).

### 3. D1 databases in the EU jurisdiction

The jurisdiction can only be chosen at creation.

```bash
pnpm exec wrangler d1 create philglov-staging --jurisdiction=eu
```

```bash
pnpm exec wrangler d1 create philglov-preview --jurisdiction=eu
```

Each command prints a `database_id`. Paste them into `wrangler.jsonc` in place of `REPLACE_WITH_STAGING_D1_ID` and
`REPLACE_WITH_PREVIEW_D1_ID`, and commit that change in a pull request (the IDs are not secret).

### 4. R2 buckets in the EU jurisdiction

1. Dashboard → **R2 Object Storage** → activate R2 (Cloudflare asks for a payment method even on the free tier).
2. Create the two staging buckets:

```bash
pnpm exec wrangler r2 bucket create philglov-originals-staging --jurisdiction eu
```

```bash
pnpm exec wrangler r2 bucket create philglov-backups-staging --jurisdiction eu
```

3. Leave both **private**: no public access, no r2.dev URL, no custom domain. The bindings in `wrangler.jsonc` already
   say `"jurisdiction": "eu"`.

### 5. Read-only R2 credentials for the build

The build downloads photo originals from R2.

1. R2 → **Manage API tokens** → Create **Account API token** → permission **Object Read only** → apply to the bucket
   `philglov-originals-staging` only. Copy the Access Key ID and Secret Access Key.
2. GitHub → Settings → Secrets and variables → **Actions** → **New repository secret**:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
3. Secrets and variables → **Dependabot** → **New repository secret**, three times: the same two, and
   `CLOUDFLARE_ACCOUNT_ID` (the Account ID from step 2). A Dependabot pull request can read only Dependabot secrets,
   and its build needs all three to reach the bucket; without them it stops at Build with `check-originals: … not in
src/.originals`.
   _Checked 2026-11-17: the two R2 keys are there, `CLOUDFLARE_ACCOUNT_ID` is not. Until that day the originals
   cache hid the gap; the cache is gone (decision 0030), so add it before the next Dependabot pull request._
4. Actions → **Variables** → `R2_ORIGINALS_BUCKET` = `philglov-originals-staging`.

The EU bucket endpoint the photo script uses is `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`. To fetch the
originals onto your laptop you need a token of your own, set for one terminal window only: README, "Photo originals on
your laptop".

**Building on a laptop without these credentials.** A photograph inside a journal entry has to be in `src/.originals/`
(`pnpm photos:fetch` puts it there from R2). If one is missing, `pnpm build` stops and names the files; on GitHub this
is what must happen, and it keeps happening: the originals are fetched there, so a missing one is a mistake to see.
To look at the site on your own machine without the originals, opt in for that one build:

```bash
ALLOW_MISSING_ORIGINALS=1 pnpm build
```

(PowerShell: `$env:ALLOW_MISSING_ORIGINALS = "1"; pnpm build; Remove-Item Env:ALLOW_MISSING_ORIGINALS`, so the
next build in that window is a normal one again.) The build then draws a plain grey picture where an entry
photograph is missing and prints `WARNING: ALLOW_MISSING_ORIGINALS=1: … missing` with the file names. The grey pictures
are removed when the build ends, are never mistaken for originals (`pnpm photos:fetch` replaces them) and the opt-in is
refused when `CI` or `GITHUB_ACTIONS` is set. Never put it in a workflow, a `.env` file or a script. Portfolio photos
(`src/content/photos`) need no opt-in: without their original they show the tone placeholder, as before.

### 6. Cloudflare API token for CI deploys

_Done; the token was narrowed and moved into the environments on 2026-11-17 (owner checklist item 6)._

1. Cloudflare → My Profile → **API Tokens** → Create Token → **Create Custom Token**, with two permissions and nothing
   else: **Account → Workers Scripts → Edit** and **Account → D1 → Edit**, for your account only. It never gets zone
   access: production has a token of its own (step 12).
2. GitHub → Settings → **Environments**. `staging`: Deployment branches **Selected branches** → `main`. `preview`: no
   branch rule (pull request branches deploy there). In each, **Add environment secret** `CLOUDFLARE_API_TOKEN`. It is
   never a repository secret and never a Dependabot secret: only the three deploy jobs read it, each from its own
   environment (`tests/unit/ci-workflow.test.ts` fails if another job starts reading it). The `production`
   environment and its token come at launch (steps 12 and 16).
3. `CLOUDFLARE_ACCOUNT_ID` stays a **repository** secret (Actions → New repository secret), and is a Dependabot secret
   too (step 5): the Test job reads it, as `R2_ACCOUNT_ID`, to fetch the originals.

### 7. First deploy, then Cloudflare Access on the whole Worker

_Done 2026-11-11 for staging and preview. Needed again only on a new Cloudflare account._

The Worker must exist before Access can protect it, so the first deploy is open to anyone who finds its workers.dev
address for the few minutes until Access is on. It is the whole site as the build makes it from `main`: every page in
both languages, with the texts as they are then (placeholders today), `noindex` on every response, and `/admin`
answering 403 (no AUD tag yet). Deploy from a fresh clone, without real photo originals in `src/.originals`: the
build then draws grey stand-ins and nothing private is on the address. CI's next deploy replaces it. Then protect it
straight away.

```bash
ALLOW_MISSING_ORIGINALS=1 pnpm build && pnpm exec wrangler deploy --env staging
```

```bash
pnpm exec wrangler deploy --env preview
```

Then turn on Access (as the dashboard looked on 2026-11-11):

1. **Once per account:** Access needs a Zero Trust organization. Workers & Pages → `philglov-staging` → **Access** tab
   → **Set up Zero Trust** opens the checkout for **Zero Trust Free** ($0/month, up to 50 users). Tick the Terms box
   and the overage-authorization box yourself and click **Activate Zero Trust Free**. Cloudflare picks a team name
   (`<team>.cloudflareaccess.com`); you can rename it later under Zero Trust → Settings.
2. For **each** of `philglov-staging` and `philglov-preview`: the Worker → **Access** tab → **Protect this Worker behind
   Access** → Scope **All traffic** (not "Previews only") → Authentication policy **Cloudflare account** (only members
   of this Cloudflare account, i.e. you) → session 24 hours → **Apply Access**. The second Worker can reuse the
   policy, listed as "Cloudflare account members". Never choose **Email domain**: with a gmail.com address it would let
   in anyone with a Gmail account. "All traffic" covers the workers.dev address and preview URLs.

Check with a request that carries no cookies (a private window, or `curl -I`) that every address answers with a 302
to `https://<team>.cloudflareaccess.com/cdn-cgi/access/login/…`. The Worker's Access tab shows its **AUD tag** and the
team's **JWKS** URL, which step 9 needs.

### 8. Turn on CI deploys

GitHub → Settings → Secrets and variables → Actions → **Variables**:

- `STAGING_DEPLOY` = `on` — every green push to `main` deploys to staging.
- `PREVIEW_DEPLOY` = `on` — every green pull request **from a branch of this repository** gets a preview URL (shown in
  the run summary): yours, and the phone's. Pull requests from a fork and from Dependabot get none; they cannot read
  the deploy token (`deploy-preview` in `.github/workflows/ci.yml`).

Leave `PRODUCTION_DEPLOY` unset until launch.

### 8b. Live-site check on staging: an Access service token

_Needed for the check that runs after every staging deploy (`live-check-staging` in `.github/workflows/ci.yml`, QA
suite 15). Until the two secrets below exist, that job prints a warning, says "Live-site check skipped" in the run
summary and does nothing else; it never fails for that._ Staging is behind Cloudflare Access, which turns a robot away
as it does a stranger, so the check needs a **service token**: a Client ID and a Client Secret that Access accepts in
two request headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) instead of a login. **Never paste the token in a
chat, an issue or a pull request**; it goes only into the two places below, typed or pasted by you.

1. **Create the token.** Cloudflare dashboard → **Zero Trust** → **Access** → **Service credentials** (older dashboards:
   **Access → Service Auth**) → **Service Tokens** → **Create Service Token**.
   - Name: `github-ci-live-check`.
   - Service Token Duration: **1 year** (not "Non-expiring"; put the renewal date in your calendar).
   - **Generate token.** The page now shows the **Client ID** (ends in `.access`) and the **Client Secret**. The
     secret is shown **once**: keep the page open until step 3 is done. If you lose it, delete the token and make a new one.
2. **Let the token into the staging application, and only that one.** Zero Trust → **Access → Applications** → the
   application for `philglov-staging` (the one step 7 made; if the list shows it as "Workers" application, open it from
   the Worker's own **Access** tab) → **Policies** → **Add a policy**:
   - Policy name: `CI live check (service token)`.
   - Action: **Service Auth** (not "Allow": Allow policies ask for a login, Service Auth takes the token).
   - Include → selector **Service Token** → `github-ci-live-check`.
   - Save. Do **not** add the token to the `philglov-preview` application, and never to the production `/admin`
     application (step 13): the token must not reach `/admin` there.
3. **Store it as GitHub Actions secrets.** GitHub → this repository → Settings → Secrets and variables → Actions →
   **Secrets** → **New repository secret**, twice:
   - Name `CF_ACCESS_CLIENT_ID`, value: the Client ID.
   - Name `CF_ACCESS_CLIENT_SECRET`, value: the Client Secret.

   Or from a terminal inside this repository (each command asks for the value and reads it from the keyboard, so it is
   not left in your shell history; paste the value and press Enter):

   ```bash
   gh secret set CF_ACCESS_CLIENT_ID
   ```

   ```bash
   gh secret set CF_ACCESS_CLIENT_SECRET
   ```

4. **Try it before trusting it.** In Git Bash, put the two values in variables without showing them (they stay in this
   one terminal window and are not saved in its history), then ask staging for its home page twice, with the token and
   without it. Paste the four lines as they are:

   ```bash
   read -r -p "Client ID: " CF_ID; read -r -s -p "Client Secret: " CF_SECRET; echo
   curl -s -o /dev/null -w '%{http_code}' -H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET" https://philglov-staging.philglov-es.workers.dev/; echo
   curl -s -o /dev/null -w '%{http_code}' https://philglov-staging.philglov-es.workers.dev/; echo
   unset CF_ID CF_SECRET
   ```

   The first number must be `200`, the second `302` (a visitor without the token is sent to the login). `403` first
   means the policy in step 2 is not on that application, or its action is not **Service Auth**.

5. **Run it once by hand** (optional): GitHub → Actions → the latest run of CI on `main` → **Re-run all jobs**; the job
   **Live-site check (staging)** now runs `pnpm test:live` instead of skipping. It checks the pages, the headers, that
   no script or cookie was added on Cloudflare's side, and that `/admin` still turns a visitor away. On staging it lets
   through one cookie, `CF_Authorization`, which Access itself sets; production has none and the check will then
   allow none.
6. **Renewing.** Before the year is up: Service Tokens → the token → **Refresh** (gives a new secret), repeat step 3.
   At launch, set the repository variable `STAGING_URL` only if the staging address changes; for the production check
   run `LIVE_URL=https://philglov.es pnpm test:live` in Git Bash after the first production deploy (no token needed
   there).

### 9. Worker secrets and config

_Done 2026-11-12 for staging and preview (backend agent, values piped from `openssl` straight into wrangler, never
printed or stored); AUD tags set in `wrangler.jsonc`. Production repeats this at launch (step 12)._

Generate fresh random values per environment; never reuse them between environments. In Git Bash (it has `openssl`):

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put FORM_HMAC_KEY --env staging
```

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put IP_SALT --env staging
```

Repeat both for preview. The preview Worker's latest version is a PR preview, not its deployed version, so wrangler
refuses `secret put` there; use `versions secret put` (a new version with the secret, nothing deployed; later
`versions upload` runs keep it):

```bash
openssl rand -base64 32 | pnpm exec wrangler versions secret put FORM_HMAC_KEY --env preview
```

```bash
openssl rand -base64 32 | pnpm exec wrangler versions secret put IP_SALT --env preview
```

Until both are set, the forms answer 503 and pages carry an empty token.

The Access **AUD tag** of each Worker (Workers & Pages → the Worker → Access tab, from step 7) is not secret: it goes
into `wrangler.jsonc` as `ACCESS_AUD`, one value per Worker (staging and preview are set). `ACCESS_TEAM_DOMAIN` is already `gentle-hall-eae9.cloudflareaccess.com`; change it if you rename
the team. While an AUD is a placeholder, `/admin` on that Worker answers 403 to everyone, you included.

`NOTIFY_TO` stays unset until launch (step 14).

### 10. GitHub App for phone publishing

_Done 2026-11-13: App `philglov-publisher`, installed on this repository only,
Contents and Pull requests write, Metadata read, no webhook events. Key converted to PKCS#8 and piped straight into the
staging and preview secrets with the two IDs; the downloaded key file is deleted. Production gets a key of its own
at launch (end of this step); if a key is ever exposed, owner-playbook.md says how to replace it._

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**. Name it, e.g. `philglov-publisher`.
   Homepage: the repository URL. Webhook: **off**.
2. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, Metadata: Read (automatic).
   Nothing else. "Where can this app be installed": **Only on this account**.
3. Install it on **this repository only**. Note the **App ID** and the **Installation ID** (the number at the end of
   the installation's settings URL).
4. **Generate the private key.** GitHub → Settings → Developer settings → GitHub Apps → the App → **Edit** → General,
   at the bottom: **Private keys** → **Generate a private key**. The browser downloads one file, named after the App
   and the day, such as `philglov-publisher.2026-11-13.private-key.pem`, into your Downloads folder. GitHub keeps
   only its public half: this file is the only copy. Leave it in Downloads, never in the repository folder.
5. **Convert it to PKCS#8** (the form `jose` reads), store it, and delete both files. In Git Bash, inside the
   repository folder; `~/Downloads` is your Downloads folder, and the first command takes the newest key file there:

```bash
key="$(ls -t ~/Downloads/*.private-key.pem | head -n 1)"; echo "Converting $key"
```

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in "$key" -out ~/Downloads/app.pkcs8.pem
```

```bash
pnpm exec wrangler secret put GITHUB_APP_PRIVATE_KEY --env staging < ~/Downloads/app.pkcs8.pem
```

The preview Worker takes it with `versions secret put` (see step 9), from the same file:

```bash
pnpm exec wrangler versions secret put GITHUB_APP_PRIVATE_KEY --env preview < ~/Downloads/app.pkcs8.pem
```

Then delete both files:

```bash
rm "$key" ~/Downloads/app.pkcs8.pem
```

`GITHUB_APP_ID` and `GITHUB_APP_INSTALLATION_ID` go in as secrets too (not secret values, but this keeps them out of
the public repository and lets you set them without a pull request):

```bash
pnpm exec wrangler secret put GITHUB_APP_ID --env staging
```

```bash
pnpm exec wrangler secret put GITHUB_APP_INSTALLATION_ID --env staging
```

Repeat these two for preview with `versions secret put` instead of `secret put` (same App; see step 9). Until all
three are set, `/admin/write` saves drafts but says "Publishing is not set up". Photos go to
`philglov-originals-staging/<slug>/`. At launch production gets a key of its own: generate a new one as in step 4
(an App can have several), store it with `--env production`, and delete its files.

**Never give the App the Workflows permission**, nor anything beyond the two above. Publisher pull requests merge by
themselves (step 10b), and what keeps them to entry files is a step in `.github/workflows/ci.yml` that the App cannot
change only because it lacks that permission (decision 0021).

### 10b. Auto-merge for phone publishing

_Done 2026-11-13 by the agent, on the owner's instruction: "Allow auto-merge" is on._ GitHub → the repository →
Settings → General → Pull Requests → tick **Allow auto-merge**. The App turns it on for each pull request it opens; the
ruleset "Protect main" decides when the merge happens (the `Test` check). Without the setting, Publish still opens the
pull request and says it has to be merged by hand.

---

## Part 2 — At launch: domain and production

### Launch blockers — production must not go live without these

1. **Branch protection on `main`.** _Done 2026-11-11: ruleset "Protect main"._ The repository is public, so this is
   available on GitHub Free; do it before any real phone publishing. GitHub → Settings → Rules → Rulesets → New branch
   ruleset → target the default branch → **Require a pull request before merging** (0 required approvals: the owner
   cannot approve their own pull request), **Require status checks to pass** (add `Test`, from GitHub Actions), **Block
   force pushes**, **Restrict deletions**, empty bypass list. Check it stays active before launch.
2. Passkeys on GitHub, Cloudflare and the domain registrar (step 1, plus the registrar).
3. The privacy and rights pages have no unfilled placeholder (contact email, city, launch date).
4. QA's full matrix and the security audit report zero open failures.
5. `/admin` returns 403 without an Access token on philglov.es (QA test, re-run against production).
6. The owner has read and rewritten every Italian interface string and the Italian privacy and rights pages.

### 11. Domains

1. Register **philglov.es** under your own name, auto-renew and registrar lock on, renewal emails to an address that is
   not on philglov.es. Also `filippoguanti.com` (and `philgloves.com` if free).
2. Add philglov.es to Cloudflare (free plan) and switch the nameservers. Turn on **DNSSEC** and add the DS record at the
   registrar.
3. For the extra domains: add them to Cloudflare and create a **Redirect Rule**: 301 to `https://philglov.es` keeping
   the path.

### 12. Production resources

```bash
pnpm exec wrangler d1 create philglov --jurisdiction=eu
```

```bash
pnpm exec wrangler r2 bucket create philglov-originals --jurisdiction eu
```

```bash
pnpm exec wrangler r2 bucket create philglov-backups --jurisdiction eu
```

Paste the D1 ID over `REPLACE_WITH_PRODUCTION_D1_ID`. Add the production Worker secrets (step 9 with
`--env production`, fresh values) and a GitHub App key of its own (step 10). The photos move to `philglov-originals`
in step 12b.

**A deploy token for production.** The staging and preview token (step 6) has no zone access and stays that way.
Production gets a token of its own, so only the `production` environment can touch the philglov.es zone: My Profile →
API Tokens → Create Token → **Create Custom Token**, with **Account → Workers Scripts → Edit**, **Account → D1 →
Edit**, **Zone → Workers Routes → Edit** and **Zone → Zone → Read**, account resources your account only, zone
resources **philglov.es** only. Without the zone permissions the production deploy cannot attach the custom domain
`philglov.es`; if that first deploy still reports an authorization error for the custom domain, the error names the
missing zone permission: add only that one. Copy the token; step 16 puts it in the `production` environment.

### 12b. The photos: one copy to production's bucket, then uploads only on production

Until launch every photo is uploaded on staging and lives in `philglov-originals-staging`, the bucket the builds read.
From launch the builds read `philglov-originals`, which starts empty, and photos are added only on
`philglov.es/admin/write`. Staging and preview keep their own bucket and never reach production's (decision 0031). Do
these in this order, after step 12 and before step 16; nothing here can be done from the phone.

1. **Finish the drafts that have photos.** On staging's `/admin/write`, publish every draft with photos that should
   go live, and wait until each is on the site (its pull request merged). Only photos an entry on `main` uses are
   copied, and production's `/admin/write` will not have staging's drafts. Delete the drafts you do not want.
2. **Stop photo uploads on staging and preview.** In a pull request, set `"PHOTO_UPLOADS": "off"` in the `staging`
   and the `preview` vars of `wrangler.jsonc` (both together; production stays `"on"`), and merge it. Once staging
   has deployed it, an upload there answers "This copy of the site no longer stores photos…". A preview made before
   that change still takes uploads, but nothing from it can go live: its photos would not be in the bucket the builds
   read after step 5, and the build would stop naming them. From here until production is live (step 16) no photo
   can be added anywhere; entries without photos can still be published from staging.
3. **Two R2 tokens for the copy**, made for it and deleted in step 7. Cloudflare → **R2 Object Storage** → **Manage
   API tokens** → Create **Account API token**, twice:
   - `copy-from-staging`: **Object Read only**, applied to `philglov-originals-staging` only;
   - `copy-to-production`: **Object Read & Write**, applied to `philglov-originals` only.

   Each page shows its Access Key ID and Secret Access Key once: keep both pages open until step 4 is done.

4. **Copy.** In PowerShell, in the repository folder, on up-to-date `main` (`git switch main`, then `git pull`). Set the
   five values for this window only; `Read-Host` keeps them out of the command history, which is saved to a file:

```powershell
$env:R2_ACCOUNT_ID = Read-Host "Account ID"
$env:R2_FROM_ACCESS_KEY_ID = Read-Host "copy-from-staging, Access Key ID"
$env:R2_FROM_SECRET_ACCESS_KEY = [Net.NetworkCredential]::new("", (Read-Host "copy-from-staging, Secret Access Key" -AsSecureString)).Password
$env:R2_TO_ACCESS_KEY_ID = Read-Host "copy-to-production, Access Key ID"
$env:R2_TO_SECRET_ACCESS_KEY = [Net.NetworkCredential]::new("", (Read-Host "copy-to-production, Secret Access Key" -AsSecureString)).Password
```

```powershell
node scripts/copy-originals.ts
```

It reads which originals the entries and photo series of this checkout use, copies each one production does not
have yet (same name, same bytes), checks every copy, and lists what it did. It never writes over an object in
production. Its last line must be `copy-originals: all N originals the content uses are in philglov-originals.`
Otherwise it names each problem and ends with an error: **MISSING** (used by an entry, in neither bucket: add the photo
again once production is live), **DIFFERENT** (production has other bytes under that name: ask an agent) or
**FAILED** (often a token on the wrong bucket or with the wrong permission). Run it again after a fix: what it copied
is skipped. "Not copied" lists photos in staging that no entry uses, such as drafts' and test uploads; they stay
there. Then clear the values (closing the window does it too):

```powershell
Remove-Item Env:R2_ACCOUNT_ID, Env:R2_FROM_ACCESS_KEY_ID, Env:R2_FROM_SECRET_ACCESS_KEY, Env:R2_TO_ACCESS_KEY_ID, Env:R2_TO_SECRET_ACCESS_KEY
```

5. **Point the builds at production's bucket.** A third R2 token, `ci-read-production`: **Object Read only**,
   applied to `philglov-originals` only. GitHub → Settings → Secrets and variables → **Actions**: replace the
   repository secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` with its values, and set the variable
   `R2_ORIGINALS_BUCKET` = `philglov-originals`. Then → **Dependabot**: replace the same two secrets.
6. **Check.** Push a new commit to a pull request, or open a small one (a re-run of an older run keeps the old
   bucket variable): its step "Fetch photo originals from R2" prints `N needed, N downloaded`, and Build passes. Staging keeps working: it deploys what Test builds, now with
   production's photos.
7. **Delete the old tokens.** R2 → Manage API tokens: delete `copy-from-staging`, `copy-to-production`, and the read
   token CI used for staging (step 5 of Part 1); nothing uses them any more. A laptop token for staging (README) can go
   too; make one for `philglov-originals` when you need the photos on the laptop.

From launch on, write entries with photos on `philglov.es/admin/write` only, and edit published entries there too:
staging's `/admin/write` cannot find photos uploaded after launch, so it refuses to publish an edit of an entry that
has them.

### 13. Cloudflare Access for /admin

Zero Trust → Access → Applications → Add → **Self-hosted**: domain `philglov.es`, path `admin` (covers `/admin/*`),
session duration **7 days**, policy Allow → Emails → your address, login method **One-time PIN**. Put its AUD tag in the
production `ACCESS_AUD` var (over `REPLACE_WITH_PRODUCTION_ACCESS_AUD`). The Worker also verifies the token itself: with
no valid `Cf-Access-Jwt-Assertion` for that AUD, every `/admin` URL answers 403.

### 14. Email

1. Email → **Email Routing** on philglov.es: route `phil@philglov.es` to your personal inbox; verify that destination
   address.
2. Notifications for new comments and reports (page title and a link to `/admin`, nothing else). Your address is
   **never written in the repository** (owner decision O2, 2026-11-12; the repository is public): it lives only in the
   `NOTIFY_TO` secret. Set it (wrangler asks for the value; type or paste it there):

   ```bash
   pnpm exec wrangler secret put NOTIFY_TO --env production
   ```

   Then, in a pull request, add to the production env of `wrangler.jsonc` the binding **without** a
   `destination_address`, `"send_email": [{ "name": "EMAIL" }]`, and set `"NOTIFY": "on"`. Without a
   `destination_address` the binding can send to any verified destination address of the account; the Worker sends
   only to `NOTIFY_TO`. The sender is `NOTIFY_FROM` (`notify@philglov.es`).

3. Add SPF, DKIM and DMARC records as Email Routing suggests; to send as `phil@philglov.es`, add the outgoing service
   in your mail client's "Send mail as".

### 15. Zone settings (philglov.es)

- Security → Settings → **Bot traffic**: AI training crawlers **disallowed/blocked**, **Bot Preference Sync** on.
- Scrape Shield → **Email Address Obfuscation: off** (on by default; it injects a script).
- **Bot Fight Mode: off**. **Web Analytics automatic setup: off**. Speed → **Speed Brain: off**, **Rocket Loader: off**.
  **Zaraz: off**. **Cloudflare Fonts: off**.
- SSL/TLS: Full (strict); Always Use HTTPS on.

### 16. Switch production on

1. GitHub → Settings → **Environments** → **New environment** `production`: Deployment branches **Selected branches**
   → `main`; **Add environment secret** `CLOUDFLARE_API_TOKEN` = the production token from step 12. Do this first: a
   deploy job that names an environment GitHub does not have creates it empty, and the deploy then fails for want of
   the token.
2. GitHub Variables: `PRODUCTION_DEPLOY` = `on`; `STAGING_DEPLOY` = `off` if staging should stop following `main`.
3. Merge a pull request to `main` **after** setting the variable: a run keeps the variables it started with, so a run
   created earlier, or a re-run of it, may skip production. The production job rebuilds with `SITE_ENV=production`, so
   pages lose `X-Robots-Tag: noindex`; the Worker gets the custom domain `philglov.es` and no workers.dev route.
4. Run the live-site check against production yourself (CI runs it only on staging), in Git Bash, no token needed:
   `LIVE_URL=https://philglov.es pnpm test:live`.

### 17. Search engines

Verify philglov.es in **Google Search Console** and **Bing Webmaster Tools** with DNS TXT records (no script on the
page), submit `https://philglov.es/sitemap.xml`, and request indexing of `/` and `/about`. Link every profile you own
back to philglov.es (docs/guide.md, "Off-site checklist").

### 18. Uptime and alerts

A free external checker (UptimeRobot or similar) loads `/` and one entry every 5 minutes. Workers Logs are on
(`observability` in `wrangler.jsonc`) for the Worker's own lines, fixed event names from `worker/src/log.ts`, never form
data. Their invocation logs (one per request, with the request's headers) are off in every environment: on staging they
held visitors' IP addresses (decision 0030, `SECURITY-REPORT.md` M-4). After the deploy, re-check as in the report's
owner checklist item 15.

Error alert (B10): dashboard → **Notifications** → Add, and pick the alert type for Worker errors that your plan lists,
for the `philglov` Worker. The backend agent could not check from the repository which types the Free plan offers;
if none is Worker-specific, use **Origin Error Rate** on the philglov.es zone (it counts 5xx answers). The scheduled
jobs log `retention done` / `backup done` daily and weekly; Workers Logs → filter on `failed` shows any miss.
