/** Feeds, sitemap and the share-image manifest, built from the collections. */
import { getPages, getSeries, getSlots } from "./collections.ts";
import { isoDate, journalPath, pathFor, slugOf, type Locale } from "./entries.ts";
import { topicName, t } from "../i18n";
import { absolute } from "./seo.ts";
import { TOPICS } from "./topics.ts";
import { rssFeed, sitemapXml, type SitemapUrl } from "./xml.ts";

/** One feed per language; an entry appears only in the feed of each language it exists in. */
export async function feedFor(locale: Locale): Promise<string> {
  const slots = await getSlots();
  const items = slots
    .flatMap((slot) => {
      const v = slot.versions[locale];
      return v ? [{ slot, v }] : [];
    })
    .sort((a, b) => b.slot.date.getTime() - a.slot.date.getTime())
    .map(({ slot, v }) => ({
      title: v.entry.data.title,
      link: absolute(pathFor(locale, `/${slot.slug}`)),
      description: v.entry.data.description,
      date: slot.date,
      categories: v.entry.data.tags.map((tag) => topicName(locale, tag)),
    }));
  return rssFeed({
    title: t(locale, "feedTitle"),
    description: t(locale, "feedDescription"),
    link: absolute(pathFor(locale, "/")),
    self: absolute(locale === "en" ? "/feed.xml" : "/it/feed.xml"),
    lang: locale,
    items,
  });
}

/** Every public page; hreflang alternates only where both language versions exist. */
export async function sitemapFor(): Promise<string> {
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
  for (const rest of ["/journal", "/photos"]) urls.push(...both(rest));
  for (const tag of TOPICS) urls.push(...pair(journalPath("en", tag), journalPath("it", tag)));

  const slots = await getSlots();
  for (const slot of slots) {
    const en = slot.versions.en;
    const it = slot.versions.it;
    const lastmod = isoDate(slot.date);
    if (en && it) urls.push(...both(`/${slot.slug}`, lastmod));
    else if (en) urls.push({ loc: absolute(pathFor("en", `/${slot.slug}`)), lastmod });
    else if (it) urls.push({ loc: absolute(pathFor("it", `/${slot.slug}`)), lastmod });
  }

  const pages = await getPages();
  const bySlug = new Map<string, Set<Locale>>();
  for (const p of pages) bySlug.set(slugOf(p.id), (bySlug.get(slugOf(p.id)) ?? new Set()).add(p.data.lang));
  for (const [slug, langs] of bySlug) {
    if (langs.has("en") && langs.has("it")) urls.push(...both(`/${slug}`));
    else for (const lang of langs) urls.push({ loc: absolute(pathFor(lang, `/${slug}`)) });
  }

  for (const s of await getSeries()) {
    urls.push(...both(`/photos/${s.slug}`));
    for (const p of s.photos) urls.push(...both(`/photos/${s.slug}/${p.id}`));
  }
  return sitemapXml(urls);
}

export interface ShareItem {
  file: string;
  title: string;
}

/** Share images to draw: one default, one per entry version. File names are `<lang>-<slug>.png`. */
export async function shareManifest(): Promise<ShareItem[]> {
  const items: ShareItem[] = [{ file: "default.png", title: "Filippo Guanti" }];
  for (const slot of await getSlots()) {
    for (const lang of ["en", "it"] as const) {
      const v = slot.versions[lang];
      if (v) items.push({ file: `${lang}-${slot.slug}.png`, title: v.entry.data.title });
    }
  }
  return items;
}
