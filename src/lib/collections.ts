/**
 * The content collections as the pages need them: numbered entries, pages by
 * language, photo series. The logic lives in entries.ts (pure, tested).
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { buildSlots, slugOf, type Locale, type Slot } from "./entries.ts";

export type JournalEntry = CollectionEntry<"journal">;
export type PageEntry = CollectionEntry<"pages">;
export type PhotoSeries = CollectionEntry<"photos">;

export const getSlots = async (): Promise<Slot<JournalEntry>[]> => buildSlots(await getCollection("journal"));

export async function getPage(locale: Locale, slug: string): Promise<PageEntry | undefined> {
  return (await getCollection("pages")).find((p) => p.data.lang === locale && slugOf(p.id) === slug);
}

export const getPages = async (): Promise<PageEntry[]> => getCollection("pages");

export interface Photo {
  series: string;
  id: string;
  file: string;
  alt: { en: string; it: string };
  caption: { en: string; it: string };
  takenAt: Date;
  exif: PhotoSeries["data"]["photos"][number]["exif"];
  tone: number;
}

export interface Series {
  slug: string;
  title: { en: string; it: string };
  description: { en: string; it: string } | undefined;
  photos: Photo[];
  year: number;
}

/** Series ids are "<series>/photos" (the glob loader keeps the path without its extension). */
const slugOfSeries = (id: string): string => id.split("/")[0] ?? id;

/** One placeholder colour class per photo until the photo pipeline (P4) picks the nearest tone. */
const toneFor = (index: number): number => (index % 12) + 1;

export async function getSeries(): Promise<Series[]> {
  const all = await getCollection("photos");
  let count = 0;
  const series = all.map((entry): Series => {
    const photos = entry.data.photos.map((p): Photo => ({
      series: slugOfSeries(entry.id),
      id: p.file.replace(/\.[^.]+$/, ""),
      file: p.file,
      alt: p.alt,
      caption: p.caption,
      takenAt: p.takenAt,
      exif: p.exif,
      tone: toneFor(count++),
    }));
    const year = Math.max(...photos.map((p) => p.takenAt.getUTCFullYear()));
    return { slug: slugOfSeries(entry.id), title: entry.data.title, description: entry.data.description, photos, year };
  });
  return series.sort((a, b) => b.year - a.year || a.slug.localeCompare(b.slug));
}
