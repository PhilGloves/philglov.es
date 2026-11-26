# 0044 - Second audit: a stale phone copy, nested SVGs, one email per burst, backups by age

Status: Accepted · 2026-11-26 · Owner request ("fix 1 to 6 and 10") · Amends [0017](0017-backend-worker.md)
(notifications, backups), [0029](0029-write-the-other-language.md) (the browser copy) and
[0030](0030-security-audit.md) (the page check)

**Context.** A second whole-repository audit (2026-11-26) found these. Each is one commit with its test.

## Decisions

1. **A browser copy is restored only over the version it was typed against** (`worker/src/admin/client.ts`). The copy
   records the form's `base_sha`; when the published file has changed since, the copy is shown under the form to copy
   from, never put back, because Save changes would then publish it as current and undo the other edit.
2. **The page check follows nested SVGs** (`svgProblems` in `scripts/lib/page-check.ts`): it walks the tags in order,
   past quoted values, comments and CDATA, and counts `<svg>` inside `<svg>`. An inner `</svg>` let a meta refresh
   through.
3. **One email per burst** (`firstWaiting` in `worker/src/forms.ts`): no notification while another comment (or
   report) stored in the hour before still waits in /admin. Only earlier items count, so of two at once one sends.
4. **A photo store that breaks off answers 503** (`worker/src/admin/upload.ts`), the status the page retries.
5. **"index" is a reserved slug** (`RESERVED_SLUGS`): `/index` is built to `index.html`, the home page's file.
6. **Backups are deleted at 12 weeks old**, by the date in the name (`BACKUP_WEEKS`), not the newest 12 kept: weeks
   without a backup no longer keep an older one, as the privacy notice promises.
7. **The image QA test reads every folder of `dist/_assets/`**, the large versions included.

Not changed: pending comments are never deleted; that waits for the owner's time limit.
