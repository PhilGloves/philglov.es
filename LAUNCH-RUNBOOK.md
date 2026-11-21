# Launch runbook - philglov.es

One list, in order, from the days before launch to the day after. Written by the final review (track 4) from the
code as it is on `main` at b385e0d. It follows `docs/setup.md` Part 2 (steps 11 to 18 and 12b); where it differs,
the step says "(differs from setup.md step N: see FINAL-REVIEW.md)" and the reason is a finding there.

How to read a step: **Do** is what you click or type. **You should see** is what success looks like. **If you
don't** is what to do then. **Check** is something to tick before you go on.

Labels: Cloudflare and GitHub rename menus. A label marked "[label not verified]" could not be checked against the
live dashboard; if it has moved, search the page for the setting's name. A label marked "[label from Cloudflare docs,
month year]" was read in Cloudflare's public documentation of that date.

Shells: a `bash` block is for **Git Bash**, a `powershell` block is for **Windows PowerShell**. Both are run inside
the repository folder. Each block is one command: run it, read the answer, then run the next.

## Before you start

**Accounts you need, each with a passkey or security key:** GitHub, Cloudflare, and the registrar where you buy the
domain. Keep the recovery codes of all three on paper.

**Have at hand:**

- This computer, set up as in README "On Windows" (Node, pnpm, Git for Windows, Chromium for Playwright).
- A password manager, to hold three values for a few minutes each: the production deploy token and two R2 key pairs.
- The identity document the `.es` registry asks for (see step 2).
- A personal email address that is **not** on philglov.es: for the registrar's renewal emails, and as the place
  where mail to `phil@philglov.es` and the site's notifications arrive.
- The launch date, written out the way you want it on the privacy page, in English and in Italian.

**How long it takes:**

- Steps 1 to 6 (the domain): half an hour of work, then **up to 24 hours of waiting** for the nameservers. Do them
  days before. Email (step 7), Access (step 11) and the first production deploy (step 20) need the domain to show
  **Active**; the database, buckets and secrets (steps 8 and 9) do not.
- Steps 7 to 17 (the day before): 2 to 3 hours, of which about 1 hour is waiting for Test.
- Steps 18 to 27 (launch day): 2 to 3 hours, of which 1 to 1.5 hours is waiting for Test and the deploy.

**What can be undone, and what cannot:**

- **Cannot be undone: buying the domain** (step 2). Everything after it can.
- Hard to undo: indexing. Once the site is public (step 20), search engines may read it within hours.
- Can be undone: every Cloudflare resource (delete it), every setting, every pull request (revert it), the
  production deploy (see "Rolling back").
- Until step 19 nothing is public. You can stop for the night after any step before it.
- One window to know about: from the moment the pull request of step 13 is merged until production is live (step
  20), **no photo can be uploaded anywhere**. Entries without photos can still be published from staging.

**Three rules for the whole day** (from `docs/owner-playbook.md`):

- Never merge a pull request whose **Test** is red.
- A secret goes only where a step says, typed or pasted by you. Never into a chat, an issue, a pull request, a
  commit, a file in the repository or a command line.
- Do not change the settings of the `philglov` Worker in the dashboard. They come from `wrangler.jsonc`, and the
  next deploy puts them back.

---

## Days before: the domain

### 1. Close what is still open from Part 1

- **Do:** In GitHub, open this repository > Settings > Secrets and variables > **Dependabot** [label not verified].
  If `CLOUDFLARE_ACCOUNT_ID` is not in the list, add it (New repository secret; the value is your Cloudflare Account
  ID, which the command below prints). Then confirm passkeys on GitHub and Cloudflare, with no SMS fallback.

```bash
pnpm exec wrangler whoami
```

- **You should see:** your account name and an **Account ID**. In the Dependabot list: `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_ACCOUNT_ID`.
- **If you don't:** if wrangler says you are not logged in, run the command below, approve in the browser, and run
  `whoami` again.

```bash
pnpm exec wrangler login
```

- **Check:** [ ] three Dependabot secrets. [ ] passkeys on GitHub and Cloudflare. [ ] `whoami` prints the Account ID.

### 2. Buy philglov.es (this cannot be undone)

(differs from setup.md step 11: see FINAL-REVIEW.md)

- **Do:** Register `philglov.es` at a registrar that sells `.es` domains, under your own name. **Cloudflare Registrar
  does not sell `.es`**: it is not on Cloudflare's list of supported endings (cloudflare.com/tld-policies, read
  November 2026), so the domain is bought elsewhere and only its nameservers point to Cloudflare. The `.es` registry
  asks private persons for an identity number (the guide says a passport or other foreign ID number is accepted;
  the registrar's order form says what it wants). Turn on: two-factor login with a passkey or security key,
  auto-renew, the registrar lock if the registrar offers one for `.es`, and renewal emails to the address that is
  not on philglov.es. If the registrar offers its own email, parking page or DNSSEC, leave them **off**.
- **You should see:** the registrar's confirmation email, and `philglov.es` in your list of domains there.
- **If you don't:** if the name is taken or the registrar refuses the order, stop here. Nothing has changed; ask an
  agent before choosing another name, because the name is written all over the site.
- **Check:** [ ] the domain is yours. [ ] auto-renew on. [ ] renewal emails go to the other address.

### 3. Add the domain to Cloudflare and switch the nameservers

(differs from setup.md step 11: see FINAL-REVIEW.md)

- **Do:** Cloudflare dashboard > **Domains** > **Onboard a domain** [label from Cloudflare docs, November 2026].
  Enter `philglov.es`, let Cloudflare scan the DNS records, choose the **Free** plan. On the list of records it
  found, **delete** every record the registrar's parking put there: `A`, `AAAA` or `CNAME` records for `philglov.es`
  and `www`, and every `MX` record (a foreign `MX` record makes step 7 fail). Cloudflare then shows **two
  nameservers**. At the registrar, replace the domain's nameservers with exactly those two. If DNSSEC is on at the
  registrar, turn it off there **before** you change the nameservers.
- **You should see:** in Cloudflare, the domain with the status **Pending Nameserver Update**, later **Active**, and
  an email from Cloudflare when it turns Active. Cloudflare's documentation says to wait up to 24 hours.
- **If you don't:** after 24 hours still pending: at the registrar, check that only Cloudflare's two nameservers are
  listed, spelled exactly. Some registrars apply a change only after you confirm an email.
- **Check:** [ ] status **Active**. Do not go on to step 4 before that.

### 4. Turn on DNSSEC

- **Do:** Cloudflare > `philglov.es` > DNS > **Settings** > **DNSSEC** > **Enable DNSSEC** [label from Cloudflare
  docs, June 2026]. The dialog shows the values of a **DS record**. At the registrar, add a DS record with those
  values (if it does not list "Algorithm 13", look for "ECDSA Curve P-256 with SHA-256").
- **You should see:** the DNSSEC card in Cloudflare change from pending to active, within a day.
- **If you don't:** if the registrar has no place for a DS record for `.es`, leave DNSSEC pending and go on: the
  site works without it. Write it down as an open item.

### 5. Zone settings: turn off everything that adds scripts or cookies

- **Do:** Cloudflare > `philglov.es`. Set each of these [labels not verified; search the dashboard for the name]:
  - Security > Settings > Bot traffic: **AI training crawlers: disallowed (blocked)**, **Bot Preference Sync: on**.
  - **Bot Fight Mode: off**.
  - Scrape Shield > **Email Address Obfuscation: off** (it is on by default and adds a script).
  - **Web Analytics automatic setup (RUM): off**.
  - Speed > **Speed Brain: off**, **Rocket Loader: off**.
  - **Zaraz: off** (no tool set up). **Cloudflare Fonts: off**.
  - SSL/TLS > Edge Certificates > **Always Use HTTPS: on**. SSL/TLS mode **Full (strict)**.
  - Leave off, if you see them: **AI Labyrinth**, **Always Online**, client-side security (**Page Shield**)
    monitoring. They are not in setup.md; each one changes pages or lets a third party read them.
- **You should see:** each switch in the state above after you reload the page.
- **If you don't:** a setting you cannot find may not exist on the Free plan or may have been renamed. Go on; the
  live check in step 22 fails if Cloudflare adds a script or a cookie, and names the page.
- **Check:** [ ] every line above. This is item 16 of the owner checklist in `SECURITY-REPORT.md`.

### 6. Optional: www and the extra domains

(not in setup.md: see FINAL-REVIEW.md)

- **Do:** Decide whether `www.philglov.es` should lead to the site. The Worker answers only `philglov.es`; without
  this step `www.philglov.es` does not exist. To redirect it: Cloudflare > `philglov.es` > DNS > Records > add a
  record of type `AAAA`, name `www`, content `100::`, **Proxied** [values from Cloudflare docs, November 2026]. Then
  Rules > Redirect Rules > create a rule [label not verified] with a wildcard pattern: request URL
  `https://www.*`, target URL `https://${1}`, status code **301**, preserve query string **on** [values from
  Cloudflare docs, May 2026]. For `filippoguanti.com` (and `philgloves.com`), setup.md step 11.3: add each domain
  to Cloudflare, give it the same kind of proxied placeholder record, and a Redirect Rule to `https://philglov.es`
  with status 301 that keeps the path.
- **You should see:** nothing yet for `www` (the main site is not live). After step 20, `https://www.philglov.es/about`
  lands on `https://philglov.es/about`.
- **If you don't:** a redirect that does nothing usually means the DNS record is missing or not proxied.

---

## The day before: production's resources, secrets and settings

### 7. Email: mail to phil@philglov.es reaches you

- **Do:** Cloudflare > **Compute** > **Email Service** > **Email Routing** > **Onboard Domain** > `philglov.es` >
  **Done** [label from Cloudflare docs, November 2026; older dashboards: the domain > Email > Email Routing]. Add
  your personal address as a **destination address** and click the link in the email Cloudflare sends to it. Add a
  routing rule: `phil@philglov.es` > send to that destination address [label not verified].
- **You should see:** the destination address marked **Verified**; `MX` and `TXT` records added to the DNS by
  Cloudflare; a test email sent from another account to `phil@philglov.es` arriving in your inbox.
- **If you don't:** onboarding stops with error 2008 ("Non-Cloudflare MX records exist"): delete the old `MX`
  records (step 3) and try again. No test email: wait ten minutes, look in spam, check the rule is enabled.
- **Check:** [ ] the test email arrived. The address is on About, Privacy, Rights and `security.txt`, so it must work
  before the site is public.

### 8. Create production's database and buckets

(differs from setup.md step 12: see FINAL-REVIEW.md)

- **Do:** In Git Bash, run the three commands, one at a time. Each may ask **"Would you like Wrangler to add it on
  your behalf?"**: answer **n** every time (a yes would write production's database into the local part of
  `wrangler.jsonc`). Copy the `database_id` the first command prints: it is not a secret, step 13 needs it.

```bash
pnpm exec wrangler d1 create philglov --jurisdiction=eu
```

```bash
pnpm exec wrangler r2 bucket create philglov-originals --jurisdiction eu
```

```bash
pnpm exec wrangler r2 bucket create philglov-backups --jurisdiction eu
```

- **You should see:** `Successfully created DB 'philglov'` with a `database_id`, then twice `Created bucket`.
- **If you don't:** "already exists": it was created on an earlier try; go on. If you answered yes to the
  question by mistake, undo the change to the file with the command below, then go on.

```bash
git restore wrangler.jsonc
```

- **Check:** [ ] the `database_id` is noted. [ ] Cloudflare > R2 shows both buckets, jurisdiction **EU**, public
  access **disabled** (no r2.dev address, no custom domain). [ ] D1 shows `philglov`, jurisdiction **EU**.

### 9. Give production its six secrets

(differs from setup.md step 12: see FINAL-REVIEW.md)

- **Do:** In Git Bash, one window for the whole step. The first command creates an empty Worker named `philglov` to
  hold the secrets (it says `Creating new Worker "philglov"`); that is expected. If a command asks "There doesn't
  seem to be a Worker called "philglov". Do you want to create a new Worker with that name and add secrets to it?",
  answer **y**. First the two random keys, fresh for production:

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put FORM_HMAC_KEY --env production
```

```bash
openssl rand -base64 32 | pnpm exec wrangler secret put IP_SALT --env production
```

Then a GitHub App key of production's own. GitHub > Settings > Developer settings > GitHub Apps >
`philglov-publisher` > Edit > General > Private keys > **Generate a private key** [label not verified]. The browser
saves a `.private-key.pem` file in Downloads. Leave it there. Find it, check the name, convert it, store it, delete
both files:

```bash
key="$(ls -t ~/Downloads/*.private-key.pem | head -n 1)"
```

```bash
echo "$key"
```

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in "$key" -out ~/Downloads/app.pkcs8.pem
```

```bash
pnpm exec wrangler secret put GITHUB_APP_PRIVATE_KEY --env production < ~/Downloads/app.pkcs8.pem
```

```bash
rm "$key" ~/Downloads/app.pkcs8.pem
```

Then the App's two numbers, the same as on staging: the **App ID** is on the App's General page, the
**Installation ID** is the number at the end of the address of the App's installation settings page. Each command
asks `Enter a secret value:`; type or paste the number there and press Enter.

```bash
pnpm exec wrangler secret put GITHUB_APP_ID --env production
```

```bash
pnpm exec wrangler secret put GITHUB_APP_INSTALLATION_ID --env production
```

Last, the address the notifications go to. It must be exactly the destination address you verified in step 7:

```bash
pnpm exec wrangler secret put NOTIFY_TO --env production
```

- **You should see:** after each command, `Success! Uploaded secret` and the name. The list command below prints six
  names and no values: `FORM_HMAC_KEY`, `IP_SALT`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`,
  `GITHUB_APP_PRIVATE_KEY`, `NOTIFY_TO`.

```bash
pnpm exec wrangler secret list --env production
```

- **If you don't:** a missing name: run its command again (a secret can be put twice). `echo "$key"` printed nothing:
  the key file is not in Downloads; generate it again. If a secret is still missing at launch, the site still opens:
  without the first two the forms answer "not available right now" and `/admin` answers Forbidden; without the three
  GitHub ones `/admin/write` says "Publishing is not set up".
- **Check:** [ ] six names. [ ] both key files deleted from Downloads. [ ] the App now has two private keys
  (staging's and production's); delete none.

### 10. A deploy token for production, stored in its own GitHub environment

- **Do:** Cloudflare > My Profile > **API Tokens** > **Create Token** > **Create Custom Token** [label not
  verified]. Name it `philglov production deploy`. Four permissions and nothing else: **Account > Workers Scripts >
  Edit**, **Account > D1 > Edit**, **Zone > Workers Routes > Edit**, **Zone > Zone > Read**. Account resources: your
  account only. Zone resources: **Specific zone > philglov.es** only. Create it and copy the token (shown once).
  Then GitHub > this repository > Settings > **Environments** > **New environment** > name `production` >
  Deployment branches: **Selected branches** > add `main` > **Add environment secret**: name
  `CLOUDFLARE_API_TOKEN`, value the token [label not verified]. (setup.md does this at step 16; doing it now means
  the token never waits in a clipboard. It has no effect until step 19.)
- **You should see:** the environment `production` with one secret, `CLOUDFLARE_API_TOKEN`, and the branch rule
  `main`. Under Settings > Secrets and variables > Actions, the token is **not** among the repository secrets.
- **If you don't:** you lost the token before pasting it: in Cloudflare, roll or delete it and create it again.
- **Check:** [ ] four permissions, one account, one zone. [ ] the token is a secret of `production` only.

### 11. Cloudflare Access for philglov.es/admin

- **Do:** Cloudflare > **Zero Trust** > **Access controls** > **Applications** > **Create new application** >
  **Self-hosted and private** > **Add public hostname** [label from Cloudflare docs, April 2026]. Domain
  `philglov.es`, path `admin` (no slash, no star: a path of `admin/*` would leave `/admin` itself uncovered).
  **Session Duration**: `24 hours` is what the security report recommends (owner question O6); setup.md step 13
  says 7 days. Choose one; a longer session means a stolen phone can publish for longer. Policy: action **Allow**,
  include **Emails** > your address only. Login method: **One-time PIN** (or a stronger identity provider if you
  have set one up). Create it. Then open the application again and copy its **Application Audience (AUD) Tag**, a
  long string of letters and digits [label not verified]. It is not a secret; step 13 needs it. Do **not** add the
  CI service token (`github-ci-live-check`) to this application.
- **You should see:** the application in the list, for `philglov.es/admin`, with one Allow policy.
- **If you don't:** `philglov.es` is not offered as a domain: the zone is not Active yet (step 3).
- **Check:** [ ] one policy, one email address, yours. [ ] the AUD tag is noted. [ ] the applications for
  `philglov-staging` and `philglov-preview` are unchanged. Do not rename the Zero Trust team today: its name
  (`gentle-hall-eae9`) is written in `wrangler.jsonc`, and a rename closes `/admin` everywhere.

### 12. Finish the drafts that have photos

- **Do:** On staging's `/admin/write`, publish every draft with photos that should be on the site at launch, and
  wait until each one's pull request has merged. Delete the drafts you do not want. Production's `/admin/write`
  will not have staging's drafts, and only photos used by an entry or series on `main` are copied in step 15.
- **You should see:** no draft with photos left that you still want; GitHub > Pull requests shows none open from
  `philglov-publisher`.
- **If you don't:** a publish whose Test is red: `docs/owner-playbook.md`, "Test is red".

### 13. Pull request A: production's settings, and no more photo uploads on staging

(differs from setup.md steps 12, 12b and 13, which make these changes one by one: see FINAL-REVIEW.md)

- **Do:** On GitHub, open `wrangler.jsonc` > the pencil (**Edit this file**). Make exactly four changes:
  1. Replace `REPLACE_WITH_PRODUCTION_D1_ID` with the `database_id` from step 8. Keep the quotes.
  2. Replace `REPLACE_WITH_PRODUCTION_ACCESS_AUD` with the AUD tag from step 11. Keep the quotes.
  3. Inside `"staging": {`, change `"PHOTO_UPLOADS": "on",` to `"PHOTO_UPLOADS": "off",`.
  4. Inside `"preview": {`, change `"PHOTO_UPLOADS": "on",` to `"PHOTO_UPLOADS": "off",`.

  The file has two more `"PHOTO_UPLOADS": "on",` lines, one near the top and one inside `"production": {`. **Leave
  those two as they are.** Then **Commit changes** > **Create a new branch for this commit and start a pull
  request** > **Propose changes** > **Create pull request** [label not verified]. Wait for **Test** (full scope: up
  to an hour). When it is green, merge.

- **You should see:** Test green. After the merge, the run on `main` goes green and **Deploy staging** with it.
  On staging's `/admin/write`, adding a photo now answers "This copy of the site no longer stores photos."
- **If you don't:** Test red at **Unit tests** with `PHOTO_UPLOADS` in the message: one of the four lines is wrong
  (the top one or production's was changed, or only one of staging and preview). Red at **Lint**: a quote or comma
  was lost. Fix the file on the same branch; Test runs again.
- **Check:** [ ] merged. [ ] staging refuses a photo upload. From now until step 20, no photo can be uploaded.

### 14. Two temporary R2 tokens for the copy

- **Do:** Cloudflare > **R2 object storage** > Overview > Account Details > **Manage** (next to API Tokens) >
  **Create Account API token** [label from Cloudflare docs, October 2026], twice:
  - name `copy-from-staging`, permission **Object Read only**, applied to the bucket `philglov-originals-staging`
    only;
  - name `copy-to-production`, permission **Object Read & Write**, applied to the bucket `philglov-originals` only.

  Each page shows an **Access Key ID** and a **Secret Access Key** once. Keep both pages open, or put the four
  values in your password manager, until step 15 is done.

- **You should see:** two tokens in the list, each on one bucket.
- **If you don't:** you closed a page too early: delete that token and create it again.

### 15. Copy the photos to production's bucket

- **Do:** In **PowerShell**, in the repository folder. First get up-to-date `main`:

```powershell
git switch main
```

```powershell
git pull
```

Then set the five values for this window only. Run the lines one at a time; each asks for one value (`Read-Host`
keeps it out of the command history). The Account ID is the one from step 1.

```powershell
$env:R2_ACCOUNT_ID = Read-Host "Account ID"
```

```powershell
$env:R2_FROM_ACCESS_KEY_ID = Read-Host "copy-from-staging, Access Key ID"
```

```powershell
$env:R2_FROM_SECRET_ACCESS_KEY = [Net.NetworkCredential]::new("", (Read-Host "copy-from-staging, Secret Access Key" -AsSecureString)).Password
```

```powershell
$env:R2_TO_ACCESS_KEY_ID = Read-Host "copy-to-production, Access Key ID"
```

```powershell
$env:R2_TO_SECRET_ACCESS_KEY = [Net.NetworkCredential]::new("", (Read-Host "copy-to-production, Secret Access Key" -AsSecureString)).Password
```

Run the copy:

```powershell
node scripts/copy-originals.ts
```

Then clear the values (closing the window does it too):

```powershell
Remove-Item Env:R2_ACCOUNT_ID, Env:R2_FROM_ACCESS_KEY_ID, Env:R2_FROM_SECRET_ACCESS_KEY, Env:R2_TO_ACCESS_KEY_ID, Env:R2_TO_SECRET_ACCESS_KEY
```

- **You should see:** a first line that starts `copy-originals: the content uses N originals`, then a line
  `copied …` for each photo, and a **last line** that reads
  `copy-originals: all N originals the content uses are in philglov-originals.`
  N counts the portrait on About too, so it is at least 1.
- **If you don't:** the script names each problem and ends with an error. **FAILED** on every photo: a token is on
  the wrong bucket or has the wrong permission, or a value was pasted wrong; the line says `R2 403 from <bucket>`,
  which names the bucket whose token was refused. Set the five values again. **MISSING**:
  an entry uses a photo that is in neither bucket; add it again on `philglov.es/admin/write` after launch.
  **DIFFERENT**: production already holds other bytes under that name; stop and ask an agent. `set R2_… first`: a
  value is empty. Run the script again after a fix: it never writes over a photo in production and skips what is
  copied. "Not copied" lists photos no entry uses (drafts, tests); that is normal.
- **Check:** [ ] the last line says "all N originals".

### 16. Point the builds at production's bucket

- **Do:** Create a third R2 token as in step 14: name `ci-read-production`, **Object Read only**, bucket
  `philglov-originals` only. Then GitHub > this repository > Settings > Secrets and variables > **Actions**
  [label not verified]:
  - Secrets: open `R2_ACCESS_KEY_ID` > update it with the new Access Key ID; the same for `R2_SECRET_ACCESS_KEY`.
  - Variables: set `R2_ORIGINALS_BUCKET` to `philglov-originals`.

  Then Secrets and variables > **Dependabot**: update the same two secrets with the same two values.

- **You should see:** both secrets "updated now" in both lists; the variable showing `philglov-originals`.
- **If you don't:** nothing to see goes wrong here; a wrong value shows up in step 18, which is why that step reads
  the numbers.
- **Check:** [ ] two secrets in Actions. [ ] the same two in Dependabot. [ ] the variable. Do not delete the old
  tokens yet (step 18 does it, after the proof).

### 17. Stop for the night

- **Do:** Nothing. Staging is as before, minus photo uploads. Nothing is public.
- **You should see:** GitHub > Actions: the last run on `main` is green.
- **If you don't:** fix it tomorrow before step 18 (`docs/owner-playbook.md`).

---

## Launch day

### 18. Pull request B: the launch date, which also proves the photos

(not a step in setup.md: see FINAL-REVIEW.md)

- **Do:** On GitHub, edit `src/content/pages/en/privacy.md`: on line 11, replace `[launch date]` (brackets
  included) with the date, in your words. Commit to a **new branch** and open a pull request. On that same branch,
  edit `src/content/pages/it/privacy.md`: on line 11, replace the bracketed placeholder with the date, written by
  you in Italian. Wait for **Test**. **Do not merge yet.** While it runs, and after:
  1. Open the run > job **Test** > step **Fetch photo originals from R2**.
  2. Open the run's **Summary** page and find the line that starts "Launch gate".
  3. Open the preview address from the summary (it asks for the Access login) and look at `/privacy`,
     `/it/privacy` and `/about`.
- **You should see:** (1) `fetch-originals: N needed, N downloaded, 0 cached`, the same N as in step 15, and **no**
  line `could not fetch` or `no R2 credentials`. (2) `Launch gate (not blocking yet, owner question O1): success`.
  (3) The date on both privacy pages, no bracket left, and your portrait on About.
- **If you don't:** (1) Test red at **Fetch photo originals from R2** with `could not fetch N from <bucket>`: the
  secrets or the variable of step 16 are wrong, or a photo is not in that bucket; correct them, then push any small
  change to the branch (a re-run keeps the old variable). `no R2 credentials`: the two secrets are empty. (2)
  `failure`: open the step **Launch gate**; each line names a page and the text still to replace. (3) No portrait:
  same cause as (1). (Before the final review's fix pull request, a missing photo left Test green; after it, the
  fetch step stops.)
- **Check:** [ ] N needed, N downloaded. [ ] launch gate: success. [ ] Test green. [ ] the pull request is still
  open. Then delete the three old R2 tokens (Cloudflare > R2 > API tokens): `copy-from-staging`,
  `copy-to-production`, and the read token CI used for staging's bucket.

### 19. Switch production on

- **Do:** GitHub > this repository > Settings > Secrets and variables > Actions > **Variables** > **New repository
  variable**: name `PRODUCTION_DEPLOY`, value `on` [label not verified]. Leave `STAGING_DEPLOY` as it is (`on`):
  staging keeps following `main`, and its live check keeps running after every merge.
- **You should see:** three variables set to `on`: `PREVIEW_DEPLOY`, `STAGING_DEPLOY`, `PRODUCTION_DEPLOY`.
- **If you don't:** nothing can go wrong yet; the variable does nothing until the next merge.
- **Check:** [ ] the variable is spelled exactly `PRODUCTION_DEPLOY` and its value is exactly `on`.

### 20. Merge pull request B: the first production deploy

- **Do:** Merge pull request B. Open GitHub > Actions > the new run on `main` and watch it: **Test** (up to an
  hour), then **Deploy staging** and **Deploy production** side by side. In **Deploy production**, open the steps as
  they finish.
- **You should see:** in **Fetch photo originals from R2**, again `N needed, N downloaded`. In **Build for
  production**, near the end, `postbuild: wrote dist/_headers and script-hashes.json (…) for SITE_ENV=production`.
  **Apply database migrations** green. **Deploy** green, naming `philglov.es` as a custom domain [wording not
  verified]. A warning that the Worker "was last updated via the script API" is expected the first time (step 9
  made it). The site answers at `https://philglov.es` a few minutes later, once Cloudflare has issued the
  certificate.
- **If you don't:**
  - **Deploy production** is grey ("skipped"): the variable was set after this run started, or is misspelled.
    Correct it and merge any other small pull request; a re-run of this run will skip again.
  - **Apply database migrations** red: the `database_id` of step 13 is wrong, or the token lacks **D1 > Edit**.
  - **Deploy** red with `Authentication error`, `10000` or `403`: the token of step 10 lacks a permission or the
    zone. In Cloudflare, edit the token (the value stays the same), then **Re-run failed jobs**.
  - **Build for production** red: read it as Test's Build step (`docs/owner-playbook.md`).
  - A failed deploy job leaves the site as it was: before this first deploy, that means not public.
  - The browser shows a certificate error on `https://philglov.es`: wait up to 15 minutes and reload.
- **Check:** [ ] all jobs green. [ ] `SITE_ENV=production` in the build line. [ ] the home page opens.

### 21. Look at the site as a visitor

- **Do:** In a private browser window, open `https://philglov.es`, `/it`, `/about`, `/now`, `/journal`, `/photos`,
  `/privacy`, `/rights`, and an address that does not exist, such as `/no-such-page`. Then, in Git Bash:

```bash
curl -sI https://philglov.es/
```

```bash
curl -sI https://philglov.es/sitemap.xml
```

```bash
curl -sI http://philglov.es/
```

```bash
curl -sI https://philglov.es/admin
```

```bash
curl -s https://philglov.es/.well-known/security.txt
```

```bash
curl -s https://philglov.es/robots.txt
```

- **You should see:** every page as on staging; the portrait on About; the 404 page for the address that does not
  exist. From the six commands, in order: (1) a first line with `200`, lines `content-security-policy` and
  `strict-transport-security`, and **no** `x-robots-tag` line containing `noindex`; (2) `200` and again no
  `noindex`; (3) a `301` to `https://philglov.es/`; (4) a `302` whose `location` starts with
  `https://gentle-hall-eae9.cloudflareaccess.com/`; (5) `Contact: mailto:phil@philglov.es` and an `Expires` date
  about a year ahead; (6) the site's rules, with the line `Sitemap: https://philglov.es/sitemap.xml` (Cloudflare
  may add lines of its own to this file: that is Bot Preference Sync from step 5).
- **If you don't:** `noindex` on (1): the production Worker is not the one answering; check the Deploy step.
  `noindex` on (2) only: the build was not a production build; check the build line of step 20 and ask an agent.
  (3) is not a redirect: **Always Use HTTPS** is off (step 5). (4) is `403` instead of `302`: the Access
  application of step 11 does not cover `philglov.es/admin`; the admin pages are still closed (the Worker refuses
  every request without Access's token), but you cannot log in until it does.
- **Check:** [ ] no `noindex` on (1) and (2). [ ] `/admin` sends a visitor to the login.

### 22. Run the live check against production

- **Do:** In Git Bash (no token needed; it takes a few minutes):

```bash
LIVE_URL=https://philglov.es pnpm test:live
```

- **You should see:** every line with a tick and a last line like `N passed`. It loads every page, and fails if any
  page has a console error, a request to another site, a cookie, or a script Cloudflare added.
- **If you don't:** the failing line names the page and what it found. A script from `/cdn-cgi/` or a cookie
  `__cf_bm`: a zone setting of step 5 is still on (Email Address Obfuscation, Bot Fight Mode, Web Analytics, Rocket
  Loader). Turn it off, wait a minute, run the check again. `browserType.launch: Executable doesn't exist`: run the
  command below once, then the check again.

```bash
pnpm exec playwright install chromium
```

- **Check:** [ ] all passed.

### 23. Log in to /admin and try the forms

- **Do:** Open `https://philglov.es/admin`. Enter your email address, then the code Cloudflare emails you. Then,
  in a private window, open `https://philglov.es/about`, scroll to the foot of the page, open **Report an error**,
  type a test message under "What's wrong?", wait a few seconds and press **Send**. Go back to `/admin`, reload,
  find the report under **Error reports**, and delete it. Then open `/admin/write` and look at the top of the page.
- **You should see:** after the code, the moderation page. After Send: "Thanks! Your report has reached me." On
  `/admin`: "Error reports (1)" with your message. On `/admin/write`: the writing form, with **no** alert that says
  "Publishing is not set up".
- **If you don't:** "Forbidden" after a correct code: the AUD tag in `wrangler.jsonc` is not this application's
  (step 13, change 2), or `FORM_HMAC_KEY` is missing (step 9). The form says "not available right now":
  `FORM_HMAC_KEY` or `IP_SALT` is missing. "Publishing is not set up": one of the three `GITHUB_APP_…` secrets is
  missing. Put the missing secret (step 9); it works at once, no deploy needed.
- **Check:** [ ] login works with your address only. [ ] the test report arrived and is deleted. [ ] publishing is
  set up. Do **not** publish a test entry: it would merge and go live by itself.

### 24. Notification emails

This needs the fix pull request of the final review merged first (FINAL-REVIEW.md, T4-01): before it, the tests
refused this change.

- **Do:** On GitHub, edit `wrangler.jsonc`. Inside `"production": {`, change `"NOTIFY": "off",` to
  `"NOTIFY": "on",`, and on a new line just above `"triggers"` add `"send_email": [{ "name": "EMAIL" }],` (no
  address in it: the Worker sends only to `NOTIFY_TO`). Commit to a new branch, open a pull request, wait for a green
  **Test**, merge. Then send one more test report as in step 23.
- **You should see:** an email "New error report: …" at the address of step 7 within a few minutes. In Cloudflare >
  Workers & Pages > `philglov` > Observability > Logs [label not verified], the line `notification sent`.
- **If you don't:** Test red at **Unit tests** with `NOTIFY` in the message: the change went into staging or preview,
  or the binding has an address or another name. `notification failed` in the logs: the sender or the destination
  was refused; check that `NOTIFY_TO` is exactly the verified destination address of step 7 (whether Email Routing
  alone is enough for a Worker to send could not be verified from here). `notification skipped`: the deploy has not
  happened yet, or `NOTIFY_TO` is missing (step 9). Until it works, new comments and reports wait on
  `https://philglov.es/admin`; look there once a day.
- **Check:** [ ] the test email arrived.

### 25. Check the Worker in the dashboard

- **Do:** Cloudflare > Workers & Pages > `philglov` > Settings > **Domains & Routes** [label from Cloudflare docs,
  November 2026]. Then Observability > Logs [label not verified]: open a few of today's entries.
- **You should see:** one custom domain, `philglov.es`; **workers.dev: disabled**; **Preview URLs: disabled**. In
  the logs: only the Worker's own short lines (`report stored`, `notification skipped`, `access denied`). No entry
  for each request with its headers, and no `cf-connecting-ip`, `x-real-ip` or user agent anywhere.
- **If you don't:** workers.dev or preview URLs enabled: do not switch them by hand; tell an agent (the deploy
  should have turned them off). Request headers in the logs: `SECURITY-REPORT.md`, M-4, "What remains open".
- **Check:** [ ] owner checklist items 15 and 16 (`SECURITY-REPORT.md`), now for production.

### 26. Search engines

- **Do:** Google Search Console > add a property of type **Domain** for `philglov.es` > it shows a `TXT` record >
  add that record in Cloudflare > DNS > Records > Verify [label not verified]. Submit the sitemap
  `https://philglov.es/sitemap.xml`. Use URL inspection to request indexing of `https://philglov.es/` and
  `https://philglov.es/about`. Then Bing Webmaster Tools: add the site (it can import it from Search Console, or
  asks for a DNS record of its own) [label not verified] and submit the same sitemap. Never choose a method that
  puts a tag or a file on the pages.
- **You should see:** "Ownership verified" in both; the sitemap listed as fetched, perhaps after some hours.
- **If you don't:** verification can take up to an hour after the DNS record is added; try again later.

### 27. Uptime and alerts

- **Do:** In a free external uptime checker (UptimeRobot or similar), add two HTTPS checks, every 5 minutes: `/`
  and `/about` (and one entry once there is one), with alert emails to the address that is not on philglov.es. In
  Cloudflare > **Notifications** > Add [label not verified], pick the alert for Worker errors that your plan lists
  for the `philglov` Worker; if none is Worker-specific, **Origin Error Rate** on the philglov.es zone.
- **You should see:** both checks green; the notification listed.
- **If you don't:** go on; this can wait until tomorrow.

---

## The day after

### 28. Read the night's results

- **Do:** Go through "Who and what to check the day after" at the end of this file.
- **You should see:** every box there ticked, or an open item written down for an agent.
- **If you don't:** "Rolling back", just below, if the site itself is wrong; otherwise `docs/owner-playbook.md`.

---

## Rolling back

What exists in the repository's documents: README "Roll back" and `docs/owner-playbook.md` "Undo a bad deploy". They
cover a bad deploy **after** a good one. What they do not cover is in the last two items here.

**A deploy made the site wrong (there was a good version before).** In PowerShell:

```powershell
pnpm exec wrangler deployments list --env production
```

```powershell
pnpm exec wrangler rollback --env production
```

Without a version ID it goes back one version; it asks for an optional message, then for confirmation. Pages and
Worker go back together. In the dashboard: Workers & Pages > `philglov` > **Deployments** > the three dots next to
the version before > **Rollback** [label from Cloudflare docs, November 2026]. Then revert the pull request that
caused it (its page on GitHub > **Revert** > wait for a green Test > merge). **Until the revert is merged, merge
nothing and do not publish from the phone:** every merge deploys `main` again, the bad change included.

**The deploy failed (a red job).** The site keeps the version it had. `docs/owner-playbook.md`, "A deploy failed".
One exception: in **Deploy production**, the database migrations run before the deploy, so a red **Deploy** step
after a green **Apply database migrations** leaves a newer database under the older Worker. With the three
migrations that exist today that is harmless; if it happens with a new one, ask an agent before retrying.

**A database migration went wrong.** A rollback of the Worker does not undo it. Comments and reports come back from
the weekly backup: README, "Restoring comments and reports", with production's names (`philglov-backups`,
`--env production`). The first backup is written on the first Monday after launch at 04:00 UTC; before that there is
nothing to restore from, and nothing to lose but a few days of comments. Cloudflare D1 also keeps its own history
("Time Travel"); it is not described in the repository, so ask an agent before using it.

**The first production deploy itself is wrong** (not in the repository's documents). There is no good version to
roll back to: the version before it is the empty Worker of step 9. Do this instead:

1. GitHub > Settings > Secrets and variables > Actions > Variables: set `PRODUCTION_DEPLOY` to `off`. No merge
   deploys production any more; staging goes on.
2. Make the site private again, as staging is. In Zero Trust, under Access controls > Applications, create a second
   self-hosted application: domain `philglov.es`, **no path**, with the same Allow policy as in step 11 [label not
   verified]. Visitors now get Cloudflare's login page; you still get in. Deleting that application makes the site
   public again.
3. Ask an agent. When the fix is merged, set `PRODUCTION_DEPLOY` to `on` **before** merging it.

**Taking the site offline altogether** (not in the repository's documents). In Workers & Pages, open `philglov`,
then Settings, then Domains & Routes, and remove the custom domain `philglov.es` [label not verified]. The address
then answers nothing. Set `PRODUCTION_DEPLOY` to `off` first, or the next merge attaches the domain again.

**Who to call.** Nobody is named in the repository. Cloudflare's status page is https://www.cloudflarestatus.com;
GitHub's is https://www.githubstatus.com. For everything else: an agent session in this repository, starting from
`CLAUDE.md` and `docs/handover.md`, with the red lines of the failed run pasted in (they hold no secrets).

## Who and what to check the day after

**The site**

- [ ] `https://philglov.es` opens; the uptime checker shows no failure overnight.
- [ ] Run the live check again (step 22).
- [ ] `/admin`: any comment or report waiting? (An email arrives for each once step 24 is done.)
- [ ] Mail to `phil@philglov.es` still arrives.

**The scheduled jobs** (Cloudflare > Workers & Pages > `philglov` > Observability > Logs [label not verified])

- [ ] A line `retention done` from 03:00 UTC. A line with `failed` means the daily clean-up did not run: ask an
      agent.
- [ ] On the first Monday after launch, after 04:00 UTC: a line `backup done`, and in R2 > `philglov-backups` >
      `backups/` a file named after that Monday. After the first Monday with real comments, do the restore test of
      owner checklist item 17 (`SECURITY-REPORT.md`).

**GitHub**

- [ ] Actions: the last run on `main` is green, with **Deploy production** and **Live-site check (staging)** in it.
- [ ] The next Dependabot pull request builds (its **Fetch photo originals from R2** step prints `N downloaded`).
      If it stops with `check-originals`, the Dependabot secrets of steps 1 and 16 are not right.
- [ ] Settings > Environments: `production` has the branch rule `main` and one secret.

**Cloudflare**

- [ ] R2 > API tokens: only `ci-read-production` and, if you made one, your laptop token. The copy tokens are gone.
- [ ] Zone settings of step 5 are still as you set them. DNSSEC is active.
- [ ] Search Console: the sitemap was read; no page reported as "noindex".

**In your calendar**

- [ ] The renewal date of the Access service token `github-ci-live-check` (one year from the day you made it).
- [ ] The domain's renewal date, even with auto-renew on.
- [ ] Once a year at least, something must be merged: `security.txt` gets its expiry date at each build, 360 days
      ahead.

**For an agent, in one pull request after launch** (none of it stops the site from working)

- [ ] Make the launch gate block: remove `continue-on-error` from the step "Launch gate" in
      `.github/workflows/ci.yml`, as its own comment says.
- [ ] Update "Current state" in `CLAUDE.md` (launched, production live, photos on production only), the "Build
      phase" line at the top of `README.md`, `docs/handover.md`, and the corrections listed in FINAL-REVIEW.md.
- [ ] The rest of the owner checklist in `SECURITY-REPORT.md` (items 3, 10, 12, 13, 16 are the launch ones).
