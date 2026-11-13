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
