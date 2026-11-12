/** Hand-written RSS and sitemap (no dependency). Pure strings, tested in tests/unit. */
const escape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  date: Date;
  categories: readonly string[];
}

export interface Feed {
  title: string;
  description: string;
  link: string;
  self: string;
  lang: string;
  items: readonly FeedItem[];
}

export function rssFeed(feed: Feed): string {
  const newest = feed.items.reduce<Date | undefined>((a, i) => (!a || i.date > a ? i.date : a), undefined);
  const items = feed.items
    .map((i) =>
      [
        "    <item>",
        `      <title>${escape(i.title)}</title>`,
        `      <link>${escape(i.link)}</link>`,
        `      <guid isPermaLink="true">${escape(i.link)}</guid>`,
        `      <pubDate>${i.date.toUTCString()}</pubDate>`,
        `      <description>${escape(i.description)}</description>`,
        ...i.categories.map((c) => `      <category>${escape(c)}</category>`),
        "    </item>",
      ].join("\n"),
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escape(feed.title)}</title>`,
    `    <link>${escape(feed.link)}</link>`,
    `    <description>${escape(feed.description)}</description>`,
    `    <language>${feed.lang}</language>`,
    "    <copyright>© Filippo Guanti. All rights reserved.</copyright>",
    `    <atom:link href="${escape(feed.self)}" rel="self" type="application/rss+xml" />`,
    ...(newest ? [`    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>`] : []),
    ...(items ? [items] : []),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string | undefined;
  /** hreflang → href, only when both language versions exist. */
  alternates?: Record<string, string> | undefined;
}

export function sitemapXml(urls: readonly SitemapUrl[]): string {
  const body = urls
    .map((u) =>
      [
        "  <url>",
        `    <loc>${escape(u.loc)}</loc>`,
        ...(u.lastmod ? [`    <lastmod>${u.lastmod}</lastmod>`] : []),
        ...Object.entries(u.alternates ?? {}).map(
          ([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escape(href)}" />`,
        ),
        "  </url>",
      ].join("\n"),
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    body,
    "</urlset>",
    "",
  ].join("\n");
}
