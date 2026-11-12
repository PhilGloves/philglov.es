# 0017 — Backend: the Worker, D1, Access, phone publishing

Status: Accepted · 2026-11-12 · Backend agent · Source: docs/guide.md (prompt 5, "Publishing from your phone",
"Operations", "What the build must do so the notice stays true"), TICKETS.md B1–B10, the form contract in
[0016](0016-frontend-pages.md)

**Shape.** No framework. `worker/src/index.ts` routes; one small module per job (`forms`, `page`, `comments`,
`validate`, `tokens`, `ratelimit`, `access`, `github`, `notify`, `scheduled`, `admin/*`). The only runtime dependency
added is `jose` (Access JWT verification, GitHub App JWT signing). HMAC, SHA-256 and random IDs use WebCrypto.

**Data (B1).** `worker/migrations/0001_init.sql`, applied by CI (`migrations_dir` set on every D1 binding). Times are
Unix milliseconds. Additions to the brief's columns, each needed by a rule: `reports.done_at` (retention counts from
it) and `drafts.description` / `drafts.photos` (the schema requires a description; photos must survive a draft).

**Forms (B2).** Checks in this order: urlencoded and ≤ 64 KB, same `Origin` (or none), honeypot, signed token (3 s –
24 h), rate limit (5 per 10 min per `SHA-256(salt:IP)`, shared by both forms, one upsert), then the fields. Bots stop
before any database write. Spam and rate-limit failures re-render the page like a validation error (422, 429 for the
limit) with a plain message, and the page that comes back has a fresh token, so a person can press Send again. Text
is normalised (NFC, no control or bidi-override characters) and stored as typed; it is only ever inserted with
HTMLRewriter's `html: false`, or escaped by the admin `html` template. The redirect is `?sent=comment#comment-status`
(and `?sent=report#report-status`): the query matches the brief, the anchor is the status slot of 0016, which exists
on the page (`#report` does not). The HTML `maxlength` of the comment and report fields was raised from 4,000 / 2,000
to the brief's 5,000 / 3,000 so the form never refuses what the server accepts.

**Pages (B3, B3b).** Every HTML response is buffered and rewritten: a fresh token in each form, approved comments on
entry pages, the thank-you after `?sent=`, the errors after a failed POST. Buffering is what makes fail-open
possible: if D1 or the rewriter throws, the built page goes out untouched. Conditional request headers are removed
before the asset fetch and `ETag` / `Last-Modified` from the response, so no browser revalidates back to an old token.
`redirect: "manual"` on the asset fetch keeps the trailing-slash redirects. Only the approved-comment list is cached
(Cache API, 60 s per slug, never purged); pages never are. Note: the Cache API does nothing on `*.workers.dev`, so on
staging every page view reads D1; that is fine at staging traffic. `/_assets/entries.json` comes from an Astro
endpoint (`src/pages/entries.json.ts`) moved by `scripts/postbuild.ts`, which adds the stylesheet path for the admin
pages; it also lists the slugs a new entry may not take.

**Admin (B4, B7).** Every `/admin` path (any case, percent-encoded, doubled slash) needs a `Cf-Access-Jwt-Assertion`
that jose verifies against `https://<team>/cdn-cgi/access/certs` with issuer and audience from per-environment vars;
a placeholder or empty config means 403 for everyone. Every change is a POST (or the upload PUT) with a CSRF token
bound to the Access `sub`, valid 12 h, plus a same-origin check. Delete needs a ticked confirmation. Search by email
is a POST so the address never appears in a URL, and so never in Workers Logs. Admin pages have their own CSP
(`default-src 'none'`, `script-src 'self'`, `img-src 'self' blob:`), `X-Robots-Tag: noindex, nofollow` and
`Cache-Control: no-store`, and are English only (the owner's own tool; visitor messages live in `src/i18n`).

**Phone publishing (B8).** `/admin/write` works without JavaScript for text. Its one script, served from
`/admin/write.js` behind Access (never in `/_assets`, so the public JS budget is untouched), adds the slug
suggestion, the other-language lookup, browser autosave and photo uploads. Uploads are one `PUT` per photo with the
raw file; the Worker reads only the first bytes for the JPEG/PNG signature, then pipes the rest through a
`FixedLengthStream` of the declared length into R2 (≤ 25 MB, never buffered). Keys are `<slug>/<safe name>-<4
random>.jpg|png`, random so that iPhones' repeated "image.jpg" never overwrite each other. Publish reads both
language files from `main` through the App: the other-language file gives `originalLang`; an existing same-language
file is replaced only if the form was opened from it (its blob sha), otherwise 409. One branch
`publish/<lang>-<slug>-<UTC stamp>`, one commit, one pull request; the installation token is limited to this
repository and to Contents and Pull requests. Photos are written as
`![alt](../../../.originals/<slug>/<file> "caption")`: the path where the photo pipeline (P1) puts
`philglov-originals/<slug>/<file>`, relative to the entry file. Until P1 exists such an entry fails its build, which
is the intended safety net. The App ID and installation ID are secrets, not vars, so the owner sets them without a
pull request.

**Notifications (B5).** `NOTIFY` var, "off" everywhere until launch, and an optional `send_email` binding `EMAIL`
plus `NOTIFY_TO`; anything missing logs `notification skipped`. The message is hand-built MIME (no library): subject
and body hold the page title and `https://philglov.es/admin`, nothing about the visitor.

**Retention, backups, logs (B6, B9, B10).** Cron `0 3 * * *`: IP hashes nulled after 30 days, rejected comments
deleted after 30 days, done reports deleted 12 months after `done_at`, finished rate-limit windows swept. Cron
`0 4 * * 1`: `backups/YYYY-MM-DD.json` with all comments and reports (no IP hashes), newest 12 kept. `log.ts` is the
only logger and accepts fixed event names only; an error is reduced to its class name.

**Tests.** `tests/worker/` runs in the Workers runtime (`vitest` + `@cloudflare/vitest-plugin`, which replaced the
deprecated `@cloudflare/vitest-pool-workers`; 1.6.1 is the release built on our wrangler 4.159.0). Miniflare's
`outboundService` answers every outbound fetch in the test run: a JWKS generated per run (so Access tokens are
verified for real), and a stand-in GitHub API that reads this checkout and records the calls. CI runs it after the
build, before e2e.

**Rejected.** A router or framework (Hono, itty): the routes fit one `if` chain. Streaming the rewritten page
(cheaper, but then a rewriter failure cannot fall back to the static page). Caching rewritten pages (they carry
tokens). Purging the comment cache on approve (clears one data centre only). Multipart photo uploads (the Worker
would have to buffer to parse them). Owner email allow-list in the Worker (it would put the address in the public
repository; the Access policy already decides who gets a token). A local Access bypass for `wrangler dev` (one bug
away from an open admin).

**Open for the owner.** The AUD tags and secrets (`docs/setup.md` steps 9 and 10); where the notification address
lives (step 14, TICKETS.md O2); the retention wording for error reports (TICKETS.md O3).
