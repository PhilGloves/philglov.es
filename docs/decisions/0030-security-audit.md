# 0030 — Security audit: originals out of the CI cache, a build that refuses active HTML, a stricter publisher guard

Status: Accepted · 2026-11-17 · Security audit (guide prompt 8, TICKETS.md S1–S11) · Amends [0005](0005-r2-photo-originals.md),
[0017](0017-backend-worker.md), [0019](0019-photo-pipeline.md), [0021](0021-publishing-goes-live.md) and
[0027](0027-fix-round-1-backend.md)

**Context.** The audit ran last, against the local build and Worker with the repository's stand-ins, plus read-only
looks at the repository's GitHub settings. Findings, reproductions and re-tests are in `SECURITY-REPORT.md`; this record
holds what changed and why. The owner decided four points on 2026-11-17 (marked _owner_).

## Decisions

1. **Photo originals are never cached in CI** (_owner_; amends 0005 and 0019). They were saved in the Actions cache
   (`photos-*`, with `node_modules/.astro`). In a public repository a fork's pull request can read main's caches, and
   four of the five cached originals carried GPS positions. Every trusted run now downloads the originals from R2; only
   `node_modules/.astro` (resized, no metadata) is cached, under a new key prefix `astro-`. The existing `photos-*`
   caches were deleted on 2026-11-17 (_owner_). Cost: CI downloads the whole archive per build (4.65 MiB today).
   _Rejected:_ caching them encrypted with a key from a secret (more CI code; reconsider if the archive grows large);
   restoring the cache only on trusted runs (a fork's job can read the cache API itself).
2. **The build refuses HTML that could redirect, embed, collect or run anything** (_owner_: "text HTML only"). Markdown
   passes raw HTML through, and since 0021 an entry from the phone goes live by itself. The CSP already blocked scripts,
   styles, frames, objects and other hosts, but not `<meta http-equiv="refresh">`, a fake sign-in form or a
   `javascript:`/`data:` link. `scripts/lib/page-check.ts`, run by `postbuild` on every built page, uses html-validate's
   parser (already a dev tool; no new package) and stops the build, naming each page and problem, on: an element outside
   an allow-list (the site's own markup, Markdown's, plain text HTML); form controls or scripts inside `.prose`;
   `<meta>`, `<link>`, `<title>` outside `<head>`; a body script other than the form script file; event handlers,
   `style`, `srcdoc`, `formaction`, `form`, `ping`, `http-equiv`; links other than relative, http(s), mailto, tel (an `&`
   before the first `/?#` is refused, since entities can spell a scheme); a loaded file from another host; a form other
   than the two, or one of them twice; inside an `<svg>`, anything but drawing elements (read as text: the parser does
   not look inside SVG, and a browser lets `<meta>` break out of it); a page the parser cannot read. The rules hold on
   the whole page, so closing `.prose` early gains nothing. `/styleguide` may repeat its form specimens. The inline-script
   count joined the same report, so a build lists every problem at once.
3. **The publisher guard covers every push the App makes, and plain files only** (amends 0021). The App has Contents:
   write, so it can push to any unprotected branch, including another author's pull request, which the guard skipped.
   The step now also runs when `github.actor` or `github.triggering_actor` is the App. It reads `git diff --raw` and
   requires mode 100644: a symbolic link at an entry's path passed, and the build would have read the file it points to.
   The fast "content" scope takes only plain entry files too. `tests/unit/ci-workflow.test.ts` pins the CI properties
   the audit relies on (no originals cached, pinned actions, read-only token, no fork-secret triggers, previews only for
   this repository's branches, no `ALLOW_MISSING_ORIGINALS`).
4. **Addresses a visitor chose** (amends 0017 and 0027). `sitePath` refuses a path whose dot segments collapse to
   `//host` (`/.//evil.example` was stored, linked in `/admin` and used in the thank-you `Location`). `servePage` builds
   the asset address from the origin as text: `new URL("//host", url)` made `host` the host and served this site's home
   page with 200; the asset server's own redirect to the single-slash path now applies. The 404 report form takes only
   an address a report accepts. `/admin` links a report's page only when it is a path on this site, and its `mailto:`
   links percent-encode `% ? & #` (the form accepts `x@b.co?cc=…&body=…`).
5. **The notification never quotes a missing address** (_owner_; amends 0027). A report about a page that does not
   exist names it "a missing address" in the email; the typed path is shown only in `/admin`. Real pages keep their
   title (an entry) or their address.
6. **Uploads never replace a stored photo** (amends 0017). The key's random end was added by the page's script, and the
   Worker wrote over any key, so a chosen name could replace a photo a published entry shows, changing the site on its
   next build with no pull request. The Worker now adds the random end (`<name>-<4 random>.jpg|png`, the same form as
   before) and tries another until no stored object has it; the script sends the name only.
7. **IPv6 is rate-limited per /64** (amends 0017). A connection gets a whole /64 and can change the rest at will. The
   rate-limit key and the stored hash use the address's first 64 bits (`addressKey`); IPv4 stays whole. This stores less
   than the privacy notice's "a salted hash of your IP address", so the notice stays true and is not edited.
8. **Backups can be restored.** There was no tool or procedure. `scripts/restore-backup.ts` turns a backup into SQL for
   `wrangler d1 execute` (rows checked against the schema first, one statement per line, every value a literal,
   `ON CONFLICT (id) DO NOTHING`); `README.md` has the steps, including that a comment deleted on request after the
   backup comes back and must be deleted again. _Amended 2026-11-17 (fourth opinion, A-02): the script writes the SQL
   file itself, `node scripts/restore-backup.ts <backup.json> <restore.sql>`, as UTF-8 without a byte-order mark; a
   `>` redirect in Windows PowerShell 5.1 wrote UTF-16, which D1 refused (`tests/unit/restore-backup.test.ts`)._ `tests/worker/ops.test.ts` restores a real backup into an empty database.
9. **`/.well-known/security.txt`** (the guide's rules). Built from `site.json` `contactEmail`, the O1 placeholder until
   the owner answers, so one answer fills the privacy page and this file; `Expires` is 360 days after the build. The
   launch gate fails while the contact is a placeholder or `Expires` is less than 30 days ahead.
10. **Dependabot alerts.** minimatch (GHSA-g3hv-75wg-m249) and basic-ftp (GHSA-5pm8-86m8-9m6r and two more) are in dev
    tooling and not reachable here; both are overridden in `pnpm-workspace.yaml` to fixed versions (no new package).
    Remove each override once the packages that bring them ask for a fixed version (get-uri 8.0.2 already does, but was
    younger than `minimumReleaseAge`).

## Follow-up after the owner's checks (2026-11-17)

11. **Invocation logs off** (owner request). On staging, Workers Logs' invocation logs held the visitor's IP address
    (`cf-connecting-ip`, `x-real-ip`), user agent and country, which the privacy notice rules out (M-4 in the report).
    `wrangler.jsonc` now has `"observability": { "enabled": true, "logs": { "invocation_logs": false } }` at the top
    level. `observability` is inheritable: an environment without its own takes the top-level block whole, and none has
    its own, so staging, preview and production all get it; an environment that ever sets its own must repeat the line.
    `tests/unit/wrangler-config.test.ts` resolves each environment with wrangler's reader. The Worker's own lines stay;
    some are written during a visitor's request (form outcomes, failures), and whether Cloudflare attaches request
    metadata to them is for the owner's re-check on staging. If it does, the next step is to log during requests no
    more (a code change, a new decision).
12. **Owner checklist item 6 corrected** (no code change). Only `CLOUDFLARE_API_TOKEN` moves into the `staging`,
    `preview` and `production` environments. `CLOUDFLARE_ACCOUNT_ID` stays a repository secret: the Test job and the full
    QA run read it as `R2_ACCOUNT_ID` and have no environment. `tests/unit/ci-workflow.test.ts` pins that only jobs naming
    an environment read the deploy token.

## Accepted as they are (reasons in SECURITY-REPORT.md)

A form token can be sent again within 24 hours (0004: stateless; the rate limit and pre-moderation bound it). A form
post with no `Origin` is accepted (browsers always send one on POST). The App with Contents and Pull requests: write,
and a ruleset with 0 approvals, can merge any pull request whose Test passes (inherent to 0021; the owner checklist
narrows the App to `publish/*` branches). Public CI artifacts hold the built site, as staging serves it.

## How it is tested

Every fix has a test that failed first: `tests/unit/publisher-guard.test.ts` (the App's pushes, links, executables, the
content scope), `tests/unit/ci-workflow.test.ts`, `tests/unit/page-check.test.ts` (38 payload classes, the real build),
`tests/unit/security-txt.test.ts`, `tests/worker/validate.test.ts`, `forms.test.ts` (`//host`, the email title, IPv6),
`admin.test.ts` (mailto, page links), `write.test.ts` (no overwrite), `ops.test.ts` (restore). `tests/worker/audit.test.ts`
probes `/admin` spellings, methods, body types, origins, token purposes, the shared rate limit and every field fuzzed.
