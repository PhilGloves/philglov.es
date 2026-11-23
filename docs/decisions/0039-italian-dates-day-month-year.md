# 0039 - Dates on Italian pages read day/month/year

Status: Accepted · 2026-11-22 · Owner request · Amends [0016](0016-frontend-pages.md) (pages) and
[0023](0023-simplification-pass.md) (the entry's details block)

**Context.** Visible dates were "2026-11-20" in both languages, and "21 ottobre 2026" in the details block of an
Italian entry. An Italian reader writes 20/11/2026.

## Decisions

1. **One helper**, `displayDate(locale, date, words?)` in `src/lib/dates.ts` (no imports, so the build, node:test and the
   Worker all use it). Italian is always "20/11/2026". English is unchanged: "2026-11-20", and "20 November 2026" in
   an entry's details block (`words`, ignored in Italian). Everything is read in UTC.
2. **Used everywhere a date is visible:** the journal table (home, journal index), the details block of an entry, the
   "Aggiornato il" line on Now, the date under a photo, and the date of a comment (the Worker, per page language).
   `longDate` is gone; the Italian "21 ottobre 2026" is now "21/10/2026".
3. **Machine-readable dates do not change.** `isoDate` (moved to the same file) still feeds the `datetime` attribute of
   `<time>`, the sitemap, feeds, structured data, the Worker's manifest and file names. No template writes a date
   without going through one of the two functions.
4. The Privacy page's "Last updated: [launch date]" / its Italian line is owner text with a placeholder, not a formatted
   date, and is not touched.

## Consequences

- `tests/unit/dates.test.ts` (both languages, padding, UTC), `tests/e2e/dates.spec.ts` (every page type, both languages,
  `datetime` ISO, sitemap, feed, JSON-LD) and `tests/worker/comments.test.ts` (comment dates).
- The `home-it` visual baselines (win32) were regenerated; the Italian dates in them were looked at.
