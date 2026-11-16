/** Feeds, sitemap and the share-image manifest, built from the collections. */
import { getPages, getSeries, getSlots } from "./collections.ts";
import { pathFor, type Locale } from "./entries.ts";
import { t } from "../i18n";
import { absolute } from "./seo.ts";
import { sitemapUrls } from "./sitemap-urls.ts";
import { rssFeed, sitemapXml } from "./xml.ts";

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

/** Every public page; hreflang alternates only where both language versions exist (sitemap-urls.ts). */
export async function sitemapFor(): Promise<string> {
  return sitemapXml(sitemapUrls({ slots: await getSlots(), pages: await getPages(), series: await getSeries() }));
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
