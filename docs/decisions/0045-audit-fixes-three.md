# 0045 - Second audit, part two: one original per slug, a confirmed Delete draft, the lock tested

Status: Accepted · 2026-11-26 · Owner request ("then 7, 8, 9, 12 and 14 in a second pull request") · Amends
[0029](0029-write-the-other-language.md), [0030](0030-security-audit.md) (the page check) and
[0036](0036-one-publish-per-entry.md)

**Context.** The rest of the 2026-11-26 audit that the owner chose (the first part is
[0044](0044-audit-fixes-two.md)). Each is one commit with its test.

## Decisions

1. **A new entry waits while the other language's is on its way** (`writeAction` in `worker/src/admin/write.ts`).
   On the blank form, the same slug in the other language with its pull request still open would be a second
   original: both pull requests pass alone and `main` then fails the content check. It answers 409 and asks for it
   to be published later as that entry's other-language version.
2. **Delete draft asks first**: a "Delete draft" disclosure with the required "This cannot be undone" box, as a
   comment or a report has; the Worker refuses it unticked, and the write page shows "Draft deleted." after it.
3. **The Publish lock's takeover and wait are tested**; `claim()` takes the wait as an argument (20 s by default).
4. **The page check reads a loaded address as a browser does**: tabs and line breaks dropped, `\` as `/`, and a
   path with `&` refused, so `/\host`, `/<tab>/host` and `/&#9;/host` count as another host.
5. A line in Save draft that could never change anything is gone.

Not changed: 11, 13 and 16 (left for later), and 15 (pending comments) waits for the owner's time limit.
