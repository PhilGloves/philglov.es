/**
 * What scripts/photo-meta.ts learned about the originals (size, dominant
 * colour, camera data), read at build time. Absent until the originals have
 * been fetched; the pages then draw the tone placeholders instead.
 */
import type { PhotoRecord } from "../../scripts/lib/photo-meta.ts";

const found = import.meta.glob<Record<string, PhotoRecord>>("/src/.originals/meta.json", {
  eager: true,
  import: "default",
});

export const records: Record<string, PhotoRecord> = Object.values(found)[0] ?? {};

/** Loaders for the originals themselves: Astro optimises only imported local files. */
export const originals = import.meta.glob<{ default: ImageMetadata }>("/src/.originals/**/*.{jpg,jpeg,png}");

export const hasOriginal = (key: string): boolean => key in records && `/src/.originals/${key}` in originals;

// The colour classes (scripts/photo-meta.ts). Eager, so Vite adds the file to the page's stylesheet when it exists.
import.meta.glob("../styles/photo-colours.generated.css", { eager: true });
