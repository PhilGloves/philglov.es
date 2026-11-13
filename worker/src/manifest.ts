/**
 * /_assets/entries.json, written by the build (src/pages/entries.json.ts and
 * scripts/postbuild.ts). Read once per isolate: a deploy brings new isolates.
 */
export type Lang = "en" | "it";

export interface Entry {
  slug: string;
  lang: Lang;
  originalLang: Lang;
  path: string;
  title: string;
  /** The entry's date, YYYY-MM-DD. */
  date: string;
  comments: boolean;
}

export interface Manifest {
  entries: Entry[];
  /** Slugs a new entry may not use. */
  taken: string[];
  /** The site stylesheet(s), linked by the admin pages. */
  stylesheets: string[];
}

const EMPTY: Manifest = { entries: [], taken: [], stylesheets: [] };
let cached: Promise<Manifest> | undefined;

export function manifest(env: Env): Promise<Manifest> {
  cached ??= env.ASSETS.fetch(new Request("https://assets.local/_assets/entries.json"))
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : EMPTY))
    .catch(() => EMPTY)
    .then((m) => {
      // A failed read must not stick for the isolate's whole life.
      if (m === EMPTY) cached = undefined;
      return m;
    });
  return cached;
}

export const entryAt = (m: Manifest, path: string): Entry | undefined => m.entries.find((e) => e.path === path);

export const entryFor = (m: Manifest, slug: string, lang: Lang): Entry | undefined =>
  m.entries.find((e) => e.slug === slug && e.lang === lang);

export const pathFor = (slug: string, lang: Lang): string => (lang === "en" ? `/${slug}` : `/it/${slug}`);

/** The language of any path on the site: /it and /it/… are Italian. */
export const langOfPath = (path: string): Lang => (/^\/it(\/|$)/.test(path) ? "it" : "en");
