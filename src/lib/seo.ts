/** JSON-LD for the pages (docs/guide.md, SEO). Pure, so the unit tests can read it. */
import site from "../data/site.json" with { type: "json" };
import type { Locale } from "./entries.ts";

export const SITE = "https://philglov.es";
export const absolute = (path: string): string => new URL(path, SITE).href;

const personId = `${SITE}/#person`;

export interface PersonData {
  name: string;
  alternateName: string[];
  sameAs: string[];
  /** Path of the real portrait on this site (e.g. "/_assets/portrait.jpg"), or null until the owner has one. */
  portrait: string | null;
}

/**
 * `sameAs` is left out while the owner has not listed any profile, and `image` while there is no real portrait
 * (TICKETS.md, O1; the launch gate fails on both). The placeholder frame on About is never used as the image (TO-03).
 */
export function personJsonLd(
  data: PersonData = site,
  image: string | undefined = data.portrait ?? undefined,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    name: data.name,
    alternateName: data.alternateName,
    url: SITE,
    ...(image ? { image: absolute(image) } : {}),
    knowsLanguage: ["en", "it"],
    ...(data.sameAs.length > 0 ? { sameAs: data.sameAs } : {}),
  };
}

export function blogPostingJsonLd(post: {
  title: string;
  description: string;
  url: string;
  datePublished: Date;
  lang: Locale;
  image: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: post.url,
    mainEntityOfPage: post.url,
    datePublished: post.datePublished.toISOString().slice(0, 10),
    inLanguage: post.lang,
    image: post.image,
    author: { "@type": "Person", "@id": personId, name: site.name, url: SITE },
    publisher: { "@id": personId },
    copyrightHolder: { "@id": personId },
  };
}

export function imageObjectJsonLd(photo: {
  /** The image file itself, once the photo pipeline publishes it (ticket P2). */
  contentUrl?: string;
  pageUrl: string;
  name: string;
  caption: string;
  description: string;
  dateCreated: Date;
  lang: Locale;
  rightsPath: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    ...(photo.contentUrl ? { contentUrl: photo.contentUrl } : {}),
    url: photo.pageUrl,
    name: photo.name,
    caption: photo.caption,
    description: photo.description,
    dateCreated: photo.dateCreated.toISOString().slice(0, 10),
    inLanguage: photo.lang,
    creator: { "@type": "Person", "@id": personId, name: site.name, url: SITE },
    creditText: site.name,
    copyrightNotice: `© ${photo.dateCreated.getUTCFullYear()} ${site.name}. All rights reserved.`,
    license: absolute(photo.rightsPath),
    acquireLicensePage: absolute(photo.rightsPath),
  };
}

/** Serialise for a <script type="application/ld+json">: "<" escaped so no text can close the tag. */
export const jsonLdText = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
