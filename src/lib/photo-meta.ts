/**
 * What scripts/photo-meta.ts learned about the originals (size, dominant
 * colour, camera data), read at build time. Absent until the originals have
 * been fetched; the pages then draw the tone placeholders instead.
 */
import type { PhotoRecord } from "../../scripts/lib/photo-meta.ts";

const found = import.meta.glob<Record<string, PhotoRecord>>("@originals/meta.json", {
  eager: true,
  import: "default",
});

export const records: Record<string, PhotoRecord> = Object.values(found)[0] ?? {};

/**
 * Loaders for the originals themselves, by key ("photos/<series>/<file>"): Astro optimises only imported local files.
 * `@originals` is src/.originals, or the fixtures' originals for the test build (scripts/lib/content-root.ts, 0033).
 */
const loaders = import.meta.glob<{ default: ImageMetadata }>("@originals/**/*.{jpg,jpeg,png}");
const MARK = ".originals/";
export const originals: Record<string, () => Promise<{ default: ImageMetadata }>> = Object.fromEntries(
  Object.entries(loaders).map(([path, load]) => [path.slice(path.lastIndexOf(MARK) + MARK.length), load]),
);

// The colour classes (scripts/photo-meta.ts). Eager, so Vite adds the file to the page's stylesheet when it exists.
import.meta.glob("../styles/photo-colours.generated.css", { eager: true });
