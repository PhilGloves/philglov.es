/**
 * The list of public pages for the sitemap, as a pure function of the content, so a unit test can give it any
 * collection (feeds.ts reads the real one). hreflang alternates only where both language versions exist.
 */
import { isoDate } from "./dates.ts";
import { journalPath, paginate, pathFor, rowsFor, slugOf, type Locale, type Slot } from "./entries.ts";
import type { EntryLike } from "./entries.ts";
import { absolute } from "./seo.ts";
import type { SitemapUrl } from "./xml.ts";

export interface SitemapContent<E extends EntryLike> {
  slots: readonly Slot<E>[];
  pages: readonly { id: string; data: { lang: Locale } }[];
  series: readonly { slug: string; photos: readonly { id: string }[] }[];
}

export function sitemapUrls<E extends EntryLike>({ slots, pages, series }: SitemapContent<E>): SitemapUrl[] {
  const urls: SitemapUrl[] = [];
  const pair = (enPath: string, itPath: string, lastmod?: string): SitemapUrl[] => [
    {
      loc: absolute(enPath),
      lastmod,
      alternates: { en: absolute(enPath), it: absolute(itPath), "x-default": absolute(enPath) },
    },
    {
      loc: absolute(itPath),
      lastmod,
      alternates: { en: absolute(enPath), it: absolute(itPath), "x-default": absolute(enPath) },
    },
  ];
  const both = (rest: string, lastmod?: string) => pair(pathFor("en", rest), pathFor("it", rest), lastmod);

  urls.push(...pair("/", "/it"));
  urls.push(...both("/journal"));
  // /journal/page/2 and on, once an index holds more than 50 entries (SO-07). Both languages list every entry (the
  // ones in the other language only are marked), so both have the same number of pages.
  const journalPages = Math.max(...(["en", "it"] as const).map((l) => paginate(rowsFor(slots, l), 1).pages));
  for (let page = 2; page <= journalPages; page++) urls.push(...pair(journalPath("en", page), journalPath("it", page)));
  urls.push(...both("/photos"));

  for (const slot of slots) {
    const en = slot.versions.en;
    const it = slot.versions.it;
    const lastmod = isoDate(slot.date);
    if (en && it) urls.push(...both(`/${slot.slug}`, lastmod));
    else if (en) urls.push({ loc: absolute(pathFor("en", `/${slot.slug}`)), lastmod });
    else if (it) urls.push({ loc: absolute(pathFor("it", `/${slot.slug}`)), lastmod });
  }

  const bySlug = new Map<string, Set<Locale>>();
  for (const p of pages) bySlug.set(slugOf(p.id), (bySlug.get(slugOf(p.id)) ?? new Set()).add(p.data.lang));
  for (const [slug, langs] of bySlug) {
    if (langs.has("en") && langs.has("it")) urls.push(...both(`/${slug}`));
    else for (const lang of langs) urls.push({ loc: absolute(pathFor(lang, `/${slug}`)) });
  }

  for (const s of series) {
    urls.push(...both(`/photos/${s.slug}`));
    for (const p of s.photos) urls.push(...both(`/photos/${s.slug}/${p.id}`));
  }
  return urls;
}
