/**
 * Dates: the one place that decides how a date looks. No imports, so the build, node:test and the Worker all use it.
 *
 * `isoDate` is the machine-readable form (datetime attributes, sitemap, feeds, structured data, search data).
 * `displayDate` is the visible text (decision 0039): English "2026-11-20", Italian "20/11/2026" (day/month/year).
 * Everything is read in UTC, so no time zone moves a date.
 */
type DateLocale = "en" | "it";

/** "2026-11-20": for attributes and files, never for a reader of Italian. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The date a visitor sees. Italian is always "20/11/2026". English is "2026-11-20", or "20 November 2026" with
 * `words` (the details block of an entry); `words` changes nothing in Italian.
 */
export function displayDate(locale: DateLocale, date: Date, words = false): string {
  if (locale === "it") {
    const [year, month, day] = isoDate(date).split("-");
    return `${day}/${month}/${year}`;
  }
  if (!words) return isoDate(date);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
