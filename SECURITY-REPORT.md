# Security report — philglov.es

Security audit (docs/guide.md, prompt 8; TICKETS.md S1–S11 and the additions a–i of the brief), 2026-11-17, branch
`security/audit` from `main` at `10b6a3b`. Decision record: [0030](docs/decisions/0030-security-audit.md).

**How it was tested.** Only against this checkout: the local build (`pnpm build`), the real Worker inside the Workers
runtime (`pnpm test:worker`, Miniflare with the repository's stand-ins for Access and GitHub) and through
`pnpm preview` on 127.0.0.1 (Playwright, Chromium with JavaScript on and off), the CI workflow's own scripts run against
throwaway Git repositories, and read-only GitHub API calls about this repository's settings (rulesets, environments,
Actions permissions, cache list, secret and variable **names**). Nothing was sent to staging, Cloudflare or any third
party, and no secret value was read or printed.

## Summary

| Severity | Found | Fixed in this pull request | Waits for the owner                   |
| -------- | ----- | -------------------------- | ------------------------------------- |
| High     | 1     | H-1                        | re-check the caches after merge       |
| Medium   | 3     | M-1, M-2                   | M-2 residual and M-3 (settings)       |
| Low      | 10    | L-1 to L-9                 | L-10 (git email), live backup restore |
| Info     | 8     | I-3 (superseded)           | I-5, I-6 optional                     |

No way around Cloudflare Access to `/admin` was found, no injection reached a page or `/admin` as markup, and no secret
is in the repository or its history. The two most important problems were in CI and in what an entry's Markdown may
contain, not in the Worker.

## Findings

Severity: **High** — exposes private data or lets someone change the site without the owner, with a low bar. **Medium**
— the same with a real precondition (a stolen session or key). **Low** — limited impact or hard to use. **Info** —
by design, accepted, or hardening only.

### H-1 — Photo originals with GPS positions were in Actions caches any fork pull request can read

- **Where:** `.github/workflows/ci.yml`, the three "Restore photo caches" steps (`src/.originals` with
  `node_modules/.astro`, key `photos-…`, `restore-keys: photos-`).
- **Problem:** in a public repository, a workflow run for a pull request, a fork's included, can restore caches created
  on the base branch, and code in that run can also call the cache service directly, so restoring only on trusted runs
  would not help. The originals are full size and, for 4 of the 5 files that were cached, carry GPS positions
  (`exiftool` on `src/.originals`; the values were not read). Decisions 0005 and 0019 promise originals live only in the
  private bucket and no location data is ever published.
- **Reproduction:** `gh cache list` showed `photos-74425691…` (4.65 MiB) and three more on `refs/heads/main`, made after
  the phone test photos of 13 Nov. A fork pull request whose test step ran
  `actions/cache/restore` with `path: src/.originals` and `key: photos-` would get them, once its run is approved
  (the repository requires approval for every outside contributor, which is the only thing that stood in the way).
  Not attempted, by the audit's rules.
- **Fix:** originals are never cached; every trusted run downloads them from R2 (`fetch-originals`); only
  `node_modules/.astro` (resized outputs, no metadata: `exiftool` finds no GPS in its 158 files) is cached, under the key
  prefix `astro-`. All 11 `photos-*` caches (main and pull request refs) were deleted on 2026-11-17 with the owner's
  approval.
- **Re-test:** `tests/unit/ci-workflow.test.ts` "photo originals never go into the Actions cache" failed before the
  change and passes after; `gh cache list` shows no `photos-` key.

### M-1 — An entry's Markdown could redirect visitors, show fake forms and carry `javascript:` links to the live site

- **Where:** Astro passes raw HTML in Markdown through untouched; since 0021 a publisher pull request merges and deploys
  by itself.
- **Problem:** the CSP blocks scripts, styles, frames, objects, base, other hosts, and `javascript:` navigation, and the
  build already failed on a second inline script and the Content check on a missing alt text. Nothing stopped
  `<meta http-equiv="refresh" content="0;url=https://…">` (an instant redirect from a philglov.es address to anywhere:
  the ClickFix delivery the guide's security model is about), a fake sign-in form styled by the site's own CSS (its
  submission is blocked by `form-action`, but the page still asks), `javascript:`/`data:`/`vbscript:` links (blocked
  at click time only), or `<SCRIPT>` in capitals (the inline-script count was case-sensitive; the CSP still blocked it).
  Anyone with the owner's `/admin` session (email one-time PIN, a 7-day session planned for production) could publish
  such an entry, live in minutes, without the owner.
- **Reproduction:** an entry with 19 payloads (meta refresh, inline and file scripts, `onerror`, the three link schemes,
  iframe, external form with a password field, `<style>`, `<link>`, `<base>`, object, embed, an SVG link, a `style`
  attribute, a remote image, a fake `#comments`) built without complaint except for the inline script; the built page
  held every one of them verbatim.
- **Fix (owner decision: text HTML only):** `scripts/lib/page-check.ts`, run by `postbuild` on every page, reads it with
  html-validate's parser and stops the build, naming page and problem, on anything outside what the site, Markdown and
  plain text HTML use (rules in 0030). It covers the whole page, so closing the text's container early gains nothing,
  and reads the inside of every `<svg>` as text, since the parser skips SVG and a browser lets `<meta>` break out of it.
  A page the parser cannot read fails too (`<meta/http-equiv=…>`, which browsers accept). `docs/publishing-from-the-phone.md`
  says what is allowed.
- **Re-test:** the same entry now fails `pnpm build` with 30 named problems; `tests/unit/page-check.test.ts` refuses 38
  payload classes (entity-spelled schemes, capitals, SVG breakouts, text that leaves its container) and passes every page
  of the real build.

### M-2 — The publisher guard skipped the App's pushes to other branches, and accepted a symbolic link as an entry

- **Where:** `.github/workflows/ci.yml`, step "Publisher pull requests change entry files only" and step "How much to
  test".
- **Problem:** the guard ran only when the pull request's **author** was the App. With Contents: write the App can push
  to any branch except `main`, including the branch of the owner's open pull request. That push would run the full
  Test without the guard, and the App's code would run in the R2 fetch step (R2 keys) and, after Test, in
  `deploy-preview` (`CLOUDFLARE_API_TOKEN`, which can deploy any Worker in the account). Separately, the guard read
  `git diff --name-status`, so a symbolic link (mode 120000) at `src/content/journal/en/x.md` passed, and the build would
  read the file it points to (`.git/config` holds the checkout's token). The fast content scope classified it as
  content too. Precondition: the App's private key (a Worker secret) is stolen.
- **Reproduction:** `tests/unit/publisher-guard.test.ts` runs the step from `ci.yml` against real merge commits: a link
  at an entry's path exited 0 (`ok: A src/content/journal/en/link.md`).
- **Fix:** the step also runs when `github.actor` or `github.triggering_actor` is the App, and requires every change to
  be mode 100644; the scope step takes only plain entry files.
- **Re-test:** the guard test (links, an existing entry turned into a link, an executable) and a new scope test fail
  before and pass after; the condition is pinned by the test.
- **Residual (owner):** once the owner pushes again to a branch the App pushed to, the guard no longer runs for it; the
  App can still create any branch, and every secret is a repository secret. Owner checklist items 5 and 6 close this.

### M-3 — A stolen `/admin` session publishes to the live site (owner settings)

- **Where:** Cloudflare Access (`docs/setup.md` step 13: production `/admin` with a **7-day** session and **email
  one-time PIN**), with auto-merge (0021).
- **Problem:** whoever holds the session can publish or edit any entry, which goes live in minutes, and can read every
  commenter's email address. The email inbox is the only key. M-1 now limits what such an entry can do to text and
  links; it does not stop a defacement.
- **Fix:** not code. Owner checklist item 10: a 24-hour session (as staging) and, if possible, a login method protected
  by a passkey rather than the email PIN.

### L-1 — A report could name `//another.host`, stored, linked in `/admin` and redirected to

- **Where:** `worker/src/validate.ts` `sitePath`.
- **Problem:** `/.//evil.example` (also `/..//`, `/a/..//`, `/%2e//`) passed the "starts with one slash" check, and the
  URL parser collapsed it to `//evil.example`. It was stored as the report's page, shown in `/admin` as
  `<a href="//evil.example">` (a link off-site in the owner's own tool), and the thank-you answered
  `303 Location: //evil.example?sent=report#report-status`. The redirect is not usable against a visitor from another
  site, because the form refuses a cross-site `Origin`.
- **Reproduction:** `POST /api/report` with `url=/.//evil.example` → 303 to `//evil.example…`.
- **Fix:** `sitePath` refuses a path that starts with two slashes after parsing; `/admin` links a report's page only
  when it is a path on this site (older rows are shown as text).
- **Re-test:** `tests/worker/validate.test.ts` (5 spellings), `forms.test.ts` (400, no `Location`, nothing stored),
  `admin.test.ts` (no off-site link) fail before, pass after.

### L-2 — A request for `//host` was answered with this site's home page

- **Where:** `worker/src/page.ts` `servePage`: `new URL(path + search, url)`.
- **Problem:** for the path `//evil.example`, `new URL` takes `evil.example` as the host, so the Worker asked the asset
  server for that host's `/` and served the home page with 200 at an address that is not it. No content from another
  host is ever fetched (the assets binding ignores the host), but it is a soft 200 for a missing page, and the 404 report
  form then carried a path the report endpoint refuses.
- **Fix:** the asset address is built from the origin as text. The asset server now answers repeated slashes with its
  own 307 to the single-slash path (`//evil.example` → `/evil.example`), which stays on this site; the 404 report form
  takes only an address a report accepts.
- **Re-test:** `forms.test.ts` "asking for one leads to this site's own path": 200 before; 307 to `/evil.example`, then
  404, after.

### L-3 — A commenter's address could add recipients and text to the owner's reply

- **Where:** `worker/src/admin/moderation.ts`, `<a href="mailto:${email}">`.
- **Problem:** the address check accepts `?`, `&`, `#` and `%` (they are legal in an address's local part, and the
  check was lax on the domain), so `x@b.co?cc=y%40evil.example&body=…` passed and the owner's mail client would open a
  reply with a hidden CC and text.
- **Fix:** the link percent-encodes `% ? & #`; the visible address is unchanged.
- **Re-test:** `admin.test.ts` "addresses a visitor typed become plain mailto: links".

### L-4 — The notification email quoted text a visitor chose

- **Where:** `worker/src/forms.ts`: a report about an address that does not exist used that path as the "page title".
- **Problem:** up to 300 characters of the visitor's choosing (`/Your-account-is-locked-call-…`) in the subject and
  body of an email to the owner, against the brief's "only the page title". Off until launch (`NOTIFY` is off).
- **Fix (owner decision):** "a missing address" in the email; the path is shown in `/admin`.
- **Re-test:** `forms.test.ts` "the notification's page title" (`reportTitle`).

### L-5 — An upload could replace a photo that a published entry shows, with no pull request

- **Where:** `worker/src/admin/upload.ts`.
- **Problem:** the key's random end came from the page's script; the Worker took the `name` parameter and wrote over
  any key. With the admin session, `PUT /admin/upload?slug=alps&name=published` replaced `alps/published.jpg`, and the
  site would change on its next build with nothing in Git.
- **Fix:** the Worker adds the random end itself and tries again until no stored object has that key; the script sends
  the name only. Keys look as before (`<name>-<4 random>.jpg`).
- **Re-test:** `write.test.ts` "an upload never replaces a stored photo".

### L-6 — Changing the last 64 bits of an IPv6 address reset the rate limit

- **Where:** `worker/src/crypto.ts` `ipHash`.
- **Problem:** the limit (5 per 10 minutes) was per full address; an IPv6 connection gets a whole /64, so a script could
  send without limit. Comments are pre-moderated, so the cost is a flooded queue and, after launch, a flood of
  notification emails.
- **Fix:** `addressKey` counts IPv6 by its /64 (IPv4 whole, IPv4-mapped as IPv4). The stored hash is of less than the
  address, so the privacy notice ("a salted hash of your IP address") stays true.
- **Re-test:** `forms.test.ts` "rate limit over IPv6" (six addresses in one /64: the sixth gets 429; another /64 does not).

### L-7 — The weekly backups could not be restored

- **Where:** `README.md` said comments and reports "can be restored from the weekly R2 backup"; no tool or steps
  existed, and no backup had ever been restored (guide check 9).
- **Fix:** `scripts/restore-backup.ts` (backup → SQL, rows checked against the schema, one statement per line, literals
  only, never overwrites) and the steps in `README.md`, "Restoring comments and reports". A restore brings back a
  comment deleted on request after that backup; the steps say to delete it again.
- **Re-test:** `ops.test.ts` exports a real backup, empties the database, restores it and compares every row (quotes,
  `\r\n`, an injection attempt, emoji); a second run overwrites nothing; a file of another shape is refused. The live
  restore of last week's export is owner checklist item 17.

### L-8 — `/.well-known/security.txt` did not exist

- **Where:** the guide's "Rules for the build"; both independent reviews noted it.
- **Fix:** `src/pages/.well-known/security.txt.ts` (RFC 9116): Contact from `site.json` `contactEmail` (the O1
  placeholder until answered), Expires 360 days after the build, `Preferred-Languages`, `Canonical`. Served as an asset
  with the site headers. The launch gate (`pnpm test:launch`) fails while the contact is a placeholder.
- **Re-test:** `tests/unit/security-txt.test.ts`; `tests/e2e/qa/launch.spec.ts` fails as intended; the QA header sweep
  includes it.

### L-9 — Open Dependabot alerts (minimatch, basic-ftp)

- **minimatch 10.2.6**, GHSA-g3hv-75wg-m249 (pattern amplification): through ESLint and typescript-eslint, which match
  patterns from this repository's own config. **Not reachable**: nobody outside can supply a pattern.
- **basic-ftp 5.3.1**, GHSA-5pm8-86m8-9m6r, GHSA-r4jh-29pc-gfqr, GHSA-c475-qrg2-pj4r: through Lighthouse CI's PAC proxy
  agent (`get-uri`), used only for `ftp://` addresses, which nothing here asks for. **Not reachable.**
- **Fix:** `pnpm-workspace.yaml` overrides to minimatch 11.0.5 and basic-ftp 6.2.6 (no new package; 6.0's one breaking
  change, no separate FTP transfer host, is a hardening that `get-uri`'s calls do not touch). The upstream fix,
  get-uri 8.0.2, was 14 hours old, inside `minimumReleaseAge`; remove the overrides once Dependabot brings it.
- **Re-test:** `pnpm audit`: no known vulnerabilities; `pnpm lint` passes; `get-uri`, `pac-proxy-agent` and `lhci` load.

### L-10 — The owner's personal email address is in 107 public commits

- **Where:** `git log` author and committer of 107 commits: the repository's local `user.email` (`.git/config`) is a
  personal address, not the GitHub no-reply one the web merges use. The repository is public; the address is also the
  likely Access login (one-time PIN).
- **Fix:** history cannot be rewritten (the ruleset forbids force pushes, rightly). The commits of this pull request use
  `131958650+PhilGloves@users.noreply.github.com`. Owner checklist item 4.

### Info

- **I-1 Form tokens can be sent again within 24 hours.** One token was accepted four times from four addresses. The
  tokens are stateless by design (0004); the per-address limit, pre-moderation and the honeypot bound the effect. A
  single-use table would need a write per token; not worth it now.
- **I-2 A form post with no `Origin` is accepted.** Browsers always send `Origin` on POST; only non-browser clients omit
  it, and they pass the same token, limit and moderation.
- **I-3 The inline-script count in `postbuild` was case-sensitive.** Superseded by the page check (M-1), and the CSP
  hash blocked any such script anyway. The count now reports with the page check instead of throwing first.
- **I-4 A refused form shows a typed `&quot;` as `"`.** The Worker's `setAttribute` escapes `"` but not `&`, so an entity
  the visitor typed is decoded in the field. Display only: a quote can never close the attribute (audit test: every
  quoted value removed, no element of the payload remains).
- **I-5 An uncaught Worker error answers with the platform's error page,** without the site's headers (for example if
  D1 fails while a comment is stored). No data is shown. A catch-all that answers a plain 500 with the site headers is
  a small later change.
- **I-6 CI artifacts are public for 7 days.** `dist` (the built staging site: resized photos with rights metadata, no
  GPS) and the test reports. Nothing beyond what staging serves; staging itself is behind Access, so pre-launch photos
  are visible to anyone with a GitHub account who looks.
- **I-7 Smaller supply-chain points.** `actions/checkout` keeps the job token in `.git/config` (read-only, public
  repository); pnpm is installed by version from npm without a hash; "allowed actions" is "all" (every action is pinned
  to a SHA, and a test now enforces it).
- **I-8 The App plus a ruleset with 0 approvals can merge any pull request whose Test passes.** Inherent to 0021; the
  guard limits what the App's own pull requests change, and owner checklist item 5 limits where it can push.

## The guide's eleven checks

| #   | Check                                                     | Result                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Headers and CSP on every response type; injection blocked | Pass. Pages, 404, redirects (now also the `//host` 307), API 303/400/403/405/422/429 and JSON, admin 403, feeds, sitemap, robots, tdmrep, security.txt, fonts, images (`tests/e2e/qa/security.spec.ts`, `ops.test.ts`). Chromium blocks an injected inline script, a third-party script, image and request, each with a `securitypolicyviolation` (same suite, run locally). |
| 2   | Forms: fuzz, rate limit, replay, CSRF on /admin/action    | Pass after L-6. 16 payload kinds in every field of both forms, no 5xx, stored text = cleaned input, no line break in an address (`audit.test.ts`); limit shared by both forms; replay I-1; CSRF bound to the Access user, form and CSRF tokens not interchangeable.                                                                                                          |
| 3   | /admin unreachable without a valid Access JWT             | Pass. 28 spellings (case, `%2f`, `%61`, dot segments, `//`, `\`, `.html`, `;`, `%00`) and every method end at 403 or a page with nothing of /admin; forged, wrong-audience and empty tokens 403. Local `pnpm preview` answers 403 too (no bypass).                                                                                                                           |
| 4   | Dependencies                                              | Pass after L-9. 3 runtime dependencies; install scripts only for `esbuild` and `workerd` (both allowed; other packages' `prepare` scripts do not run from the registry); 818 packages from the registry with integrity hashes; lockfile committed; every CI job uses `--frozen-lockfile`.                                                                                    |
| 5   | Secrets                                                   | Pass. None in the tree or in any commit of any branch (pattern scan of all 145 commits; the only hit is AWS's documented example key in the SigV4 test vector). `.env*` and `.dev.vars` ignored. HMAC key, salt and App key read from Worker secrets; R2 and Cloudflare keys only as GitHub secrets (names checked). No AI or translation key anywhere.                      |
| 6   | Accounts                                                  | Owner checklist 1–4, 21. `security.txt` present (L-8).                                                                                                                                                                                                                                                                                                                       |
| 7   | Privacy                                                   | Pass. No raw IP stored or logged (tests); retention job tested; the notice matches (IPv6 /64 stores less). Workers Logs' own fields: owner checklist 15.                                                                                                                                                                                                                     |
| 8   | Phone publishing                                          | Fixed M-1, M-2, L-5; uploads fuzzed (signature, size, slug, name, CSRF); the token request asks for this repository and Contents/Pull requests only. App settings, R2 privacy: owner checklist 9, 12.                                                                                                                                                                        |
| 9   | Backups restore                                           | Fixed L-7 (local restore of a real export, row for row). Live restore: owner checklist 17.                                                                                                                                                                                                                                                                                   |
| 10  | Data and rights                                           | Delete removes the comment with name and email (`admin.test.ts`); logs carry fixed events only; robots, tdmrep and headers refuse AI-training crawlers and allow search engines (QA rights suite, production mode in CI). EU jurisdiction: in config for R2 (staging, preview); D1 and the dashboard, owner checklist 12–13.                                                 |
| 11  | Cloudflare dashboard                                      | Owner checklist 16. In config: production `workers_dev: false`, `preview_urls: false`.                                                                                                                                                                                                                                                                                       |

## The additions to the brief

- **a. Auto-merge.** A stolen session publishes (M-3); what an entry can do is now text and links only (M-1). The guard
  and the content scope let no code, configuration or workflow change through: other paths, deletions, renames, links,
  executables and empty changes fail; the App's pushes to other branches are now guarded (M-2). The App cannot edit
  workflows (no Workflows permission), and a check named "Test" from anything but GitHub Actions does not count (the
  ruleset requires integration 15368).
- **b. GitHub Actions.** Triggers `pull_request` and `push` to `main` only; default token read-only; job-level writes
  none; fork runs need approval; a fork gets no secrets and no preview (head repository check), Dependabot no preview.
  Every action pinned to a SHA (now tested). Caches: H-1.
- **c. The write page.** Editing (sha-bound), drafts, the other-language form, carried-over photos (keys must be under
  the slug: `isPhotoKey`), upload (L-5), slugs (strict pattern before any file is read). No path trick reaches another
  entry's file or another slug's photos; text is escaped by the `html` template everywhere.
- **d. Background forms.** JSON answers are 200 with `ok`, same-origin, no CORS; the token after an expired one is fresh
  only when the old one can never pass; replay I-1.
- **e. The reported address.** Attacker text everywhere it appears: the 404 form (attribute, escaped, now only accepted
  paths), the 422 page (same), D1, `/admin` (escaped; linked only as a same-site path, L-1), the email (L-4), logs
  (never).
- **f. `ALLOW_MISSING_ORIGINALS`.** Refused whenever `CI` or `GITHUB_ACTIONS` is set (any value, `standins.test.ts`);
  no workflow sets it (`ci-workflow.test.ts`); CI never caches originals, so no stand-in can travel through a cache.
- **g. security.txt.** L-8.
- **h. The two reviews.** security.txt (L-8). Staging `/_assets/*` noindex: fixed in 0027, verified in `dist/_headers`
  (`! X-Robots-Tag`, then `noindex, noai, noimageai`).
- **i. Dependabot.** L-9.

## Owner checklist

Each item: where to look, and what must be there. Items marked _launch_ are for the go-live day.

1. **GitHub account** — github.com → Settings → Password and authentication: a passkey or security key registered;
   two-factor on; no SMS fallback.
2. **Cloudflare account** — dash.cloudflare.com → My Profile → Authentication: two-factor with a security key or passkey.
3. **Registrar** (_launch_) — two-factor on, registrar lock on, auto-renew on, renewal emails to an address not on
   philglov.es.
4. **Commit email (L-10)** — github.com → Settings → Emails: "Keep my email addresses private" **on**, "Block command
   line pushes that expose my email" **on**. In this repository:
   `git config user.email 131958650+PhilGloves@users.noreply.github.com`.
5. **Where the App can push (M-2)** — repository → Settings → Rules → Rulesets → New branch ruleset "Owner branches":
   enforcement Active; target **Include all branches**, **Exclude** the default branch, `publish/**` and
   `dependabot/**`; rules **Restrict creations**, **Restrict updates**, **Restrict deletions**; bypass list
   **Repository admin**. "Protect main" stays as verified today: required check `Test` from GitHub Actions, no bypass,
   no force push, no deletion, 0 approvals.
6. **Secrets scoped to where they deploy (M-2)** — Settings → Environments → `staging` (and `production` at launch):
   Deployment branches **Selected branches → `main`**. Move `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from
   repository secrets into the `staging` and `production` environments, and give `preview` its own copy. Today all four
   secrets are repository secrets and no environment has a rule.
7. **Actions settings** — Settings → Actions → General: fork pull request workflows "Require approval for all external
   contributors" (**on**, verified); Workflow permissions "Read repository contents" (verified); "Allow GitHub Actions to
   create and approve pull requests" **off** (verified). Recommended: Actions permissions "Allow PhilGloves, and select
   non-PhilGloves, actions" with only actions created by GitHub; **Require actions to be pinned to a full-length commit
   SHA** on.
8. **Code security** — Settings → Code security: Dependabot alerts and security updates on, secret scanning and push
   protection on (all verified). Optional: non-provider patterns on.
9. **The GitHub App** — github.com → Settings → Developer settings → GitHub Apps → philglov-publisher → Permissions:
   Repository **Contents: Read and write**, **Pull requests: Read and write**, Metadata: Read; nothing else (no
   Workflows, Actions, Administration, Checks, Secrets). "Where can this app be installed": **Only on this account**.
   Installations → philglov-publisher → Repository access: **Only select repositories → philglov.es**. Private keys:
   exactly one, the one in the Worker secret; delete any other.
10. **Access (M-3)** — Zero Trust → Access → Applications. Staging and preview: "All traffic" (covers the workers.dev
    address and every `*-philglov-preview` preview URL), policy Allow → Emails → only you, session **24 hours**.
    Production `/admin` (_launch_): path covers `philglov.es/admin` and `philglov.es/admin/*`, session **24 hours**
    (setup.md says 7 days: a session can publish), login method a passkey-protected identity provider rather than the
    email one-time PIN if you can; its AUD tag equals `ACCESS_AUD` in `wrangler.jsonc`. The CI service token is in the
    staging application only (setup.md 8b).
11. **Worker secrets** — `pnpm exec wrangler secret list --env staging` (and `--env preview`, `--env production` at
    launch): `FORM_HMAC_KEY`, `IP_SALT`, `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (and
    `NOTIFY_TO` at launch); `FORM_HMAC_KEY` and `IP_SALT` random, at least 32 bytes, different in every environment.
12. **R2** — R2 → each bucket (`philglov-originals-staging`, `philglov-backups-staging`; `philglov-originals`,
    `philglov-backups` at launch) → Settings: **Public access disabled** (no r2.dev URL, no custom domain), no CORS
    policy, jurisdiction **EU**. R2 → Manage API tokens → the CI token: **Object Read only**, applied to the originals
    bucket only (not backups).
13. **D1** — Workers & Pages → D1 → `philglov-staging`, `philglov-preview` (and `philglov` at launch): jurisdiction **EU**.
14. **CI deploy token** — My Profile → API Tokens → the CI token: Workers Scripts Edit and D1 Edit on this account only;
    no zone until launch (setup.md step 12). It can deploy any Worker in the account, which is why items 5 and 6 matter.
15. **Workers Logs** — Workers & Pages → philglov-staging → Observability → Logs: open one invocation. It must show no
    visitor IP address, no `Cf-Access-Jwt-Assertion` and no form text. If it shows the IP or request headers, set
    `"observability": { "enabled": true, "logs": { "invocation_logs": false } }` (a change in `wrangler.jsonc`).
16. **Cloudflare zone** (_launch_) — Scrape Shield: Email Address Obfuscation **off**; Security: Bot Fight Mode **off**,
    AI training crawlers **blocked**; Web Analytics automatic setup **off**; Speed: Speed Brain **off**, Rocket Loader
    **off**; Zaraz **off**; Cloudflare Fonts **off**; DNS: **DNSSEC on**, DS record at the registrar. Workers & Pages →
    philglov → Settings → Domains & Routes: **workers.dev disabled**, **Preview URLs disabled**.
17. **Restore test** (after the first Monday with real comments) — follow README.md "Restoring comments and reports"
    into a throwaway database (`pnpm exec wrangler d1 create philglov-restore-test --jurisdiction=eu`, migrations
    applied with a temporary binding), compare `SELECT COUNT(*)` of comments and reports with the backup, then delete the
    database and the two local files.
18. **security.txt** — answer O1 (`site.json` `contactEmail`); the launch gate then passes. Expires renews with every
    deploy.
19. **Caches after merge** — `gh cache list`: no key starting `photos-` (delete any with `gh cache delete <id>`).
20. **Auto-merge awareness (I-8)** — the App can merge any pull request whose Test passes; keep unfinished work in
    draft pull requests, and check the "On their way" list after publishing.
21. **Account recovery** — recovery codes for GitHub and Cloudflare stored offline; the Gmail account behind the Access
    PIN protected with a passkey (it is effectively the `/admin` key).

## What could not be tested from here

- Anything live: Access on staging and preview URLs, the App's real permissions and installation, R2 public access and
  jurisdiction, D1 jurisdiction, the Cloudflare dashboard toggles, Workers Logs' contents, the notification email (off).
- A real fork pull request reading the caches (H-1) and a real App push to another branch (M-2): reasoned from GitHub's
  documented cache scope and the workflow; the guard's script was run locally against real merge commits.
- The new guard condition and the content scope on a GitHub runner (same script, run locally in Git Bash).
- A live backup restore (owner checklist 17).
- Lighthouse and Firefox/WebKit locally (Q17); CI runs them on this pull request.
