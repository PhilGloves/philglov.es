# 0040 - Audit fixes: Malta dates, comments of a removed entry, bounded form bodies, repeats stored once

Status: Accepted · 2026-11-23 · Owner request ("fix everything you found") · Amends [0017](0017-backend-worker.md)
(forms, retention) and [0021](0021-publishing-goes-live.md) (Publish)

**Context.** A whole-repository audit found four behaviours that did not match what the site promises, and four
smaller clean-ups.

## Decisions

1. **A new entry is dated by the day in Malta** (`localDay()` in `src/lib/dates.ts`, `Europe/Malta`, where the owner
   lives), from `/admin/write` and from `pnpm new`. UTC dated an entry written at 00:40 in Msida the day before.
   Visible dates (comments included) are still read in UTC, as 0039 says; only the new entry's `date:` changes.
2. **The comments of an entry no longer on the site are deleted** by the daily job (`orphanComments()` in
   `worker/src/scheduled.ts`), so the privacy notice's "until ... I delete the entry" is true. The entries are the
   deployed site's manifest; an empty list (unread, or no entry yet) deletes nothing. A comment removed by mistake
   comes back from the weekly backup (12 kept).
3. **A form body is counted as it arrives** (`readForm()` in `worker/src/forms.ts`, 64 KB public, 512 KB for
   `/admin`): a request without Content-Length used to be read whole first, up to Cloudflare's 100 MB, in the Worker
   that serves every page. One reader for both; `readAdminForm` is gone.
4. **The drafts list on `/admin/write` shows every draft.** It stopped at 20, and an older draft of a new entry could
   then be neither opened nor deleted.
5. **A Publish that opens no pull request deletes the branch it made** (`openPullRequest()` in `worker/src/github.ts`),
   so a refused write leaves nothing on GitHub.
6. **CI downloads the photo originals six at a time** (`scripts/lib/fetch-originals.ts`); they are never cached
   (0030), and one at a time grew with the portfolio.
7. Clean-ups: `fingerprint()` uses `sha256Hex`; `lookup()` uses `SLUG`; a duplicated doc comment removed.
8. **A second tap on Send stores nothing new.** The same text from the same address (its hash) on the same entry, or
   the same report about the same page, within 10 minutes is answered as sent, stored once, with one email. One
   `INSERT ... WHERE NOT EXISTS` statement in `worker/src/forms.ts`, so it costs the public script nothing and works
   without JavaScript.
9. **A retried photo upload reuses the photo it already stored.** The write page sends one `upload` id per picked
   photo, the same on every retry; the Worker derives the key's random end from it with its secret key (so the end is
   still the Worker's, 0030) and stores the id with the photo. A retry after a lost answer finds that photo and gets
   its key, instead of leaving an unused copy. Any other object at that key falls back to a random end, and nothing
   is ever written over.
10. **The RSS feeds list the newest 50 entries** (`src/lib/feeds.ts`); the sitemap and the journal pages keep the
    whole archive.

## Consequences

- Tests: `tests/unit/dates.test.ts` (Malta day, winter and summer), `tests/worker/ops.test.ts` (orphan comments, and
  the empty list), `tests/worker/forms.test.ts` (a body without its length), `tests/worker/write.test.ts` (the branch
  deleted on a conflict), `tests/unit/fetch-originals.test.ts` (many originals, each once). The Worker tests' GitHub
  stand-in answers a branch deletion.
- Also `tests/worker/forms.test.ts` (the same comment twice, stored once; the rate-limit test now sends five different
  texts) and `tests/worker/write.test.ts` (a retried upload, one object).
- Not changed: pending comments still have no end date (the notice promises none).
