# Setup — the steps only the owner can do

Agents write the code; every account, resource, secret and dashboard switch is created by you. Do the steps in order.
Commands run from the repository root in Git Bash (Windows) or any POSIX shell, after `pnpm install`. Cloudflare
renames dashboard menus now and then; if a path below has moved, search the dashboard for the setting's name.

Resource names used everywhere (see `wrangler.jsonc` and `docs/decisions/0008-environments.md`):

| Thing        | Staging (now)                | Previews (now)     | Production (at launch) |
| ------------ | ---------------------------- | ------------------ | ---------------------- |
| Worker       | `philglov-staging`           | `philglov-preview` | `philglov`             |
| D1           | `philglov-staging`           | `philglov-preview` | `philglov`             |
| R2 originals | `philglov-originals-staging` | (shares staging)   | `philglov-originals`   |
| R2 backups   | `philglov-backups-staging`   | (shares staging)   | `philglov-backups`     |

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
2. GitHub → Settings → Secrets and variables → **Actions** → New repository secret, and the same again under
   **Dependabot** (Dependabot pull requests can only read Dependabot secrets):
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
3. Actions → **Variables** → `R2_ORIGINALS_BUCKET` = `philglov-originals-staging`.

The EU bucket endpoint the photo script uses is `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`.

### 6. Cloudflare API token for CI deploys

1. Cloudflare → My Profile → **API Tokens** → Create Token → template **Edit Cloudflare Workers**. Add **Account → D1 →
   Edit**. Restrict it to your account; no zone access is needed before launch (it is added at launch, step 12).
2. GitHub Actions secrets (also as Dependabot secrets if you want previews for Dependabot pull requests later):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

### 7. First deploy, then Cloudflare Access on the whole Worker

The Worker must exist before Access can protect it. The first deploy is the placeholder page only, with `noindex`;
protect it straight after.

```bash
pnpm build && pnpm exec wrangler deploy --env staging
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
- `PREVIEW_DEPLOY` = `on` — every green pull request gets a preview URL (shown in the run summary).

Leave `PRODUCTION_DEPLOY` unset until launch.

### 9. Worker secrets and config

_Done 2026-11-12 for staging and preview (backend agent, values piped from `openssl` straight into wrangler, never
printed or stored); AUD tags set in `wrangler.jsonc`. Production repeats this at launch (step 12)._

Generate fresh random values per environment; never reuse them between environments.

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

### 10. GitHub App for phone publishing (when the backend agent asks)

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**. Name it, e.g. `philglov-publisher`.
   Homepage: the repository URL. Webhook: **off**.
2. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**, Metadata: Read (automatic).
   Nothing else. "Where can this app be installed": **Only on this account**.
3. Install it on **this repository only**. Note the **App ID** and the **Installation ID** (the number at the end of
   the installation's settings URL).
4. Generate a private key, convert it to PKCS#8 for `jose`, store it, and delete both files:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in app.private-key.pem -out app.pkcs8.pem
```

```bash
pnpm exec wrangler secret put GITHUB_APP_PRIVATE_KEY --env staging < app.pkcs8.pem
```

```bash
rm app.private-key.pem app.pkcs8.pem
```

`GITHUB_APP_ID` and `GITHUB_APP_INSTALLATION_ID` go in as secrets too (not secret values, but this keeps them out of
the public repository and lets you set them without a pull request):

```bash
pnpm exec wrangler secret put GITHUB_APP_ID --env staging
```

```bash
pnpm exec wrangler secret put GITHUB_APP_INSTALLATION_ID --env staging
```

Repeat the three for preview with `versions secret put` instead of `secret put` (same App, same key; see step 9). Until they are set, `/admin/write`
saves drafts but says "Publishing is not set up". Photos go to `philglov-originals-staging/<slug>/`.

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

Paste the D1 ID over `REPLACE_WITH_PRODUCTION_D1_ID`. Create a new read-only R2 token for `philglov-originals` (step 5),
replace the two R2 secrets, and set `R2_ORIGINALS_BUCKET` = `philglov-originals`. Add the production Worker secrets
(step 9 with `--env production`, fresh values) and the GitHub App key (step 10).

**Give the CI deploy token zone access for philglov.es.** `CLOUDFLARE_API_TOKEN` was created during staging with no
zone access. Before the first production deploy, edit it (or replace it and update the secret) to add zone permissions
limited to the **philglov.es** zone only: the zone part of the "Edit Cloudflare Workers" template (**Zone → Workers
Routes → Edit**, plus **Zone → Zone → Read**). Without them the production deploy cannot attach the custom domain
`philglov.es`. If that first deploy still reports an authorization error for the custom domain, the error names the
missing zone permission; add only that one.

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

1. Check that the deploy token has zone access for philglov.es (end of step 12). Then GitHub Variables:
   `PRODUCTION_DEPLOY` = `on`; `STAGING_DEPLOY` = `off` if staging should stop following `main`.
2. Merge a pull request to `main` **after** setting the variable: a run keeps the variables it started with, so a run
   created earlier, or a re-run of it, may skip production. The production job rebuilds with `SITE_ENV=production`, so
   pages lose `X-Robots-Tag: noindex`; the Worker gets the custom domain `philglov.es` and no workers.dev route.
3. QA's live-site check runs against `https://philglov.es`.

### 17. Search engines

Verify philglov.es in **Google Search Console** and **Bing Webmaster Tools** with DNS TXT records (no script on the
page), submit `https://philglov.es/sitemap.xml`, and request indexing of `/` and `/about`. Link every profile you own
back to philglov.es (docs/guide.md, "Off-site checklist").

### 18. Uptime and alerts

A free external checker (UptimeRobot or similar) loads `/` and one entry every 5 minutes. Workers Logs are on
(`observability` in `wrangler.jsonc`) and hold only fixed event names from `worker/src/log.ts`, never form data.

Error alert (B10): dashboard → **Notifications** → Add, and pick the alert type for Worker errors that your plan lists,
for the `philglov` Worker. The backend agent could not check from the repository which types the Free plan offers;
if none is Worker-specific, use **Origin Error Rate** on the philglov.es zone (it counts 5xx answers). The scheduled
jobs log `retention done` / `backup done` daily and weekly; Workers Logs → filter on `failed` shows any miss.
