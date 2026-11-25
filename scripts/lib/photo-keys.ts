/**
 * Which originals the site needs, and where they live.
 *
 *   portfolio series   R2 "photos/<series>/<file>"  → src/.originals/photos/<series>/<file>
 *   journal entries    R2 "<slug>/<file>"           → src/.originals/<slug>/<file>
 *
 * Entries reference their photos as Markdown images that the phone writing
 * page writes as "../../../.originals/<slug>/<file>" (worker/src/entry-file.ts),
 * so the same key doubles as the path under src/.originals. "photos" is a
 * reserved slug, so an entry can never collide with the series prefix.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";

export const SERIES_PREFIX = "photos";

/** Keys of every photo the series files name. `series` maps the folder name to its photos.json text. */
export function seriesKeys(files: Record<string, string>): string[] {
  const keys: string[] = [];
  for (const [series, json] of Object.entries(files)) {
    const data = JSON.parse(json) as {
      photos?: { file: string; art?: Record<string, { file?: string } | undefined> }[];
    };
    for (const p of data.photos ?? []) {
      keys.push(`${SERIES_PREFIX}/${series}/${p.file}`);
      for (const crop of Object.values(p.art ?? {}))
        if (crop?.file) keys.push(`${SERIES_PREFIX}/${series}/${crop.file}`);
    }
  }
  return keys;
}

/** Keys of the photos a Markdown entry shows: every "…/.originals/<key>" image target. */
export function entryKeys(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(\s*(?:\.\.\/)+\.originals\/([^)\s"]+)/g)].map((m) => m[1] ?? "");
}

export function journalPhotoKeys(journal: URL): string[] {
  return readdirSync(journal).flatMap((lang) =>
    readdirSync(new URL(`${lang}/`, journal))
      .filter((file) => file.endsWith(".md"))
      .flatMap((file) => entryKeys(readFileSync(new URL(`${lang}/${file}`, journal), "utf8"))),
  );
}

/**
 * Every original a content folder uses (`content` holds photos/ and journal/: src/content, or the fixtures'; the series
 * files, the journal entries in both languages, and the portrait that src/data/site.json names, TO-03), sorted, each
 * once: what the build fetches (scripts/fetch-originals.ts), what the launch copy moves to production
 * (scripts/copy-originals.ts, decision 0031) and what the fixtures draw (scripts/fixture-photos.ts, decision 0033).
 */
export function contentKeys(content: URL): string[] {
  const series: Record<string, string> = {};
  const dir = new URL("photos/", content);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = new URL(`${e.name}/photos.json`, dir);
    if (e.isDirectory() && existsSync(file)) series[e.name] = readFileSync(file, "utf8");
  }
  const keys = [...seriesKeys(series), ...journalPhotoKeys(new URL("journal/", content))];
  // The site's facts are the same file for every content set, so the fixtures get a portrait to draw as well.
  const siteFile = new URL("../../src/data/site.json", import.meta.url);
  if (existsSync(siteFile)) {
    const portrait = (JSON.parse(readFileSync(siteFile, "utf8")) as { portrait?: { file?: string } | null }).portrait;
    if (portrait?.file) keys.push(portrait.file);
  }
  return [...new Set(keys)].sort();
}
