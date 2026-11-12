/**
 * Pure helpers for journal entries: twins, numbers, reading time, the language
 * label and marker, pagination. No Astro imports, so node:test can run them.
 * `src/lib/collections.ts` feeds them from the content collections.
 *
 * Twins are files with the same name in the en/ and it/ folders. A page is the
 * original when `lang` equals `originalLang` and the owner's translation
 * otherwise (decision 0012). An entry may exist in one language only.
 */
export type Locale = "en" | "it";
export const LOCALES: readonly Locale[] = ["en", "it"];

export const otherLocale = (locale: Locale): Locale => (locale === "en" ? "it" : "en");
export const localePrefix = (locale: Locale): string => (locale === "en" ? "" : "/it");

/** "/alps" or "/it/alps"; the home page is "/" and "/it". */
export const pathFor = (locale: Locale, rest: string): string => {
  const tail = rest === "/" || rest === "" ? "" : rest.startsWith("/") ? rest : `/${rest}`;
  return `${localePrefix(locale)}${tail}` || "/";
};

export interface EntryLike {
  /** Content-collection id: "<lang>/<slug>". */
  id: string;
  body?: string | undefined;
  data: {
    title: string;
    description: string;
    date: Date;
    lang: Locale;
    originalLang: Locale;
    tags: readonly string[];
    comments: boolean;
  };
}

export interface Version<E extends EntryLike> {
  entry: E;
  slug: string;
  lang: Locale;
  originalLang: Locale;
  minutes: number;
  isOriginal: boolean;
}

export interface Slot<E extends EntryLike> {
  slug: string;
  /** 1-based, by publication date of the original, oldest first. */
  number: number;
  /** Date of the original (or the earliest version), the entry's publication date. */
  date: Date;
  versions: Partial<Record<Locale, Version<E>>>;
}

export interface Row<E extends EntryLike> {
  slot: Slot<E>;
  /** The version to link to: this language's if it exists, else the other's. */
  version: Version<E>;
  /** True when only the other language exists. */
  only: boolean;
  number: string;
  href: string;
  marker: string;
}

const WORDS_PER_MINUTE = 200;

/** Reading time from the word count of the Markdown body; never below 1. */
export function readingMinutes(body: string | undefined): number {
  const words = (body ?? "")
    .replace(/[#*_`>[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export const slugOf = (id: string): string => id.slice(id.indexOf("/") + 1);

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Groups files into entries (twins share a slug) and numbers them by publication order. */
export function buildSlots<E extends EntryLike>(entries: readonly E[]): Slot<E>[] {
  const bySlug = new Map<string, Partial<Record<Locale, Version<E>>>>();
  for (const entry of entries) {
    const slug = slugOf(entry.id);
    const versions = bySlug.get(slug) ?? {};
    versions[entry.data.lang] = {
      entry,
      slug,
      lang: entry.data.lang,
      originalLang: entry.data.originalLang,
      minutes: readingMinutes(entry.body),
      isOriginal: entry.data.lang === entry.data.originalLang,
    };
    bySlug.set(slug, versions);
  }
  const slots: Slot<E>[] = [];
  for (const [slug, versions] of bySlug) {
    const all = Object.values(versions);
    const original = all.find((v) => v.isOriginal) ?? all[0];
    if (!original) continue;
    const earliest = Math.min(...all.map((v) => v.entry.data.date.getTime()));
    slots.push({
      slug,
      number: 0,
      date: new Date(original.isOriginal ? original.entry.data.date : earliest),
      versions,
    });
  }
  slots.sort((a, b) => a.date.getTime() - b.date.getTime() || a.slug.localeCompare(b.slug));
  slots.forEach((slot, i) => {
    slot.number = i + 1;
  });
  return slots;
}

/**
 * The scan-marker before a language label: IT, EN, IT→EN, EN→IT, "IT only", "solo EN".
 * `viewing` is the language of the page that shows the marker.
 */
export function markerFor(version: { lang: Locale; originalLang: Locale }, viewing: Locale): string {
  if (version.lang !== viewing) return version.lang === "it" ? "IT only" : "solo EN";
  if (version.lang !== version.originalLang)
    return `${version.originalLang.toUpperCase()}→${version.lang.toUpperCase()}`;
  return version.lang.toUpperCase();
}

export type LabelState = "original-twin" | "translation" | "original-only";

/** Which row of the guide's "originally written in" table applies to a page. */
export function labelState(version: { lang: Locale; originalLang: Locale }, hasTwin: boolean): LabelState {
  if (version.lang !== version.originalLang) return "translation";
  return hasTwin ? "original-twin" : "original-only";
}

export const padNumber = (n: number): string => String(n).padStart(3, "0");

/** The rows of the journal index in one language, newest first. Entries that exist only in the other language are included. */
export function rowsFor<E extends EntryLike>(slots: readonly Slot<E>[], locale: Locale): Row<E>[] {
  const rows: Row<E>[] = [];
  for (const slot of slots) {
    const own = slot.versions[locale];
    const version = own ?? slot.versions[otherLocale(locale)];
    if (!version) continue;
    rows.push({
      slot,
      version,
      only: !own,
      number: padNumber(slot.number),
      href: pathFor(version.lang, `/${slot.slug}`),
      marker: markerFor(version, locale),
    });
  }
  return rows.reverse();
}

export const PAGE_SIZE = 50;

export interface Paged<T> {
  items: T[];
  page: number;
  pages: number;
}

/** Page `page` (1-based) of `items`, 50 to a page. There is always at least one page. */
export function paginate<T>(items: readonly T[], page: number, size = PAGE_SIZE): Paged<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  return { items: items.slice((page - 1) * size, page * size), page, pages };
}

/** "/journal", "/journal/page/2", "/journal/travel", "/journal/travel/page/2" in one language. */
export function journalPath(locale: Locale, tag?: string, page = 1): string {
  const base = `/journal${tag ? `/${tag}` : ""}${page > 1 ? `/page/${page}` : ""}`;
  return pathFor(locale, base);
}

/** Fills {name} placeholders in an interface string. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
