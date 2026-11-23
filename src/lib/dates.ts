/**
 * Dates: the one place that decides how a date looks. No imports, so the build, node:test and the Worker all use it.
 *
 * `isoDate` is the machine-readable form (datetime attributes, sitemap, feeds, structured data, search data).
 * `displayDate` is the visible text (decision 0039): numbers are "2026-11-20" in English and "20/11/2026" in Italian;
 * a date written out stays written out, in the page language.
 * Everything is read in UTC, so no time zone moves a date.
 */
type DateLocale = "en" | "it";

/** "2026-11-20": for attributes and files, never for a reader of Italian. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The calendar day in Malta, where the owner lives (site.json `city`), as "2026-11-23": the date a new entry gets.
 * UTC would date an entry written at 00:40 in Msida the day before (audit, decision 0040).
 */
export const localDay = (date: Date): string => date.toLocaleDateString("en-CA", { timeZone: "Europe/Malta" });

/**
 * The date a visitor sees. A date that is shown as numbers: English "2026-11-20", Italian "20/11/2026". With `words`
 * (a date that is written out, as the details block of an entry): English "20 November 2026", Italian "20 novembre
 * 2026". The rule (0039): a date that used to be numbers is now day/month/year in Italian; one already in words stays
 * in words.
 */
export function displayDate(locale: DateLocale, date: Date, words = false): string {
  if (words) {
    return date.toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (locale === "en") return isoDate(date);
  const [year, month, day] = isoDate(date).split("-");
  return `${day}/${month}/${year}`;
}
