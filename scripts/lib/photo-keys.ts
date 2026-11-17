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

/**
 * Every original the content under `src` uses (the series files, and the journal entries in both languages), sorted,
 * each once: what the build fetches (scripts/fetch-originals.ts) and what the launch copy moves to production
 * (scripts/copy-originals.ts, decision 0031).
 */
export function contentKeys(src: URL): string[] {
  const series: Record<string, string> = {};
  const dir = new URL("content/photos/", src);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = new URL(`${e.name}/photos.json`, dir);
    if (e.isDirectory() && existsSync(file)) series[e.name] = readFileSync(file, "utf8");
  }
  const keys = seriesKeys(series);
  const journal = new URL("content/journal/", src);
  for (const lang of readdirSync(journal)) {
    for (const f of readdirSync(new URL(`${lang}/`, journal))) {
      if (f.endsWith(".md")) keys.push(...entryKeys(readFileSync(new URL(`${lang}/${f}`, journal), "utf8")));
    }
  }
  return [...new Set(keys)].sort();
}
