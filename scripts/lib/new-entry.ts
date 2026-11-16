/** `pnpm new <slug> --lang it|en` (ticket C4): the text of a new entry file. Pure, tested. */
import { frontMatter, RESERVED_SLUGS } from "./content-check.ts";

export type Lang = "en" | "it";

export interface NewEntryInput {
  slug: string;
  lang: Lang;
  today: string; // YYYY-MM-DD
  /** Text of the existing file in the other language, if there is one. */
  twinText?: string;
  /** Slugs of standalone pages, which share the /<slug> space. */
  pageSlugs?: readonly string[];
}

/** A front matter value as the build reads it (Astro's parser), so `originalLang: it # note` is "it" (SO-01). */
function field(text: string, key: string): unknown {
  try {
    return frontMatter(text.startsWith("---") ? text : `---\n${text}\n---\n`).data[key];
  } catch {
    return undefined;
  }
}

export function newEntry(input: NewEntryInput): string {
  const { slug, lang, today, twinText } = input;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`"${slug}" must be lowercase ASCII with hyphens`);
  if (RESERVED_SLUGS.includes(slug) || input.pageSlugs?.includes(slug))
    throw new Error(`"${slug}" is a reserved or taken slug`);

  let originalLang: Lang = lang;
  if (twinText) {
    const orig = field(twinText, "originalLang");
    if (orig !== "en" && orig !== "it") throw new Error("the existing version has no valid originalLang");
    originalLang = orig;
  }
  const it = lang === "it";
  const title = it ? "Titolo" : "Title";
  const desc = it
    ? "Una frase per i risultati di ricerca e le anteprime dei link."
    : "One sentence for search results and link previews.";
  const note =
    lang !== originalLang
      ? it
        ? "<!-- Traduzione scritta a mano dell’originale. -->\n"
        : "<!-- Hand-written translation of the original. -->\n"
      : "";
  return [
    "---",
    `title: "${title}"`,
    `date: ${today}`,
    `lang: ${lang}`,
    `originalLang: ${originalLang}`,
    `description: "${desc}"`,
    "comments: true",
    "---",
    "",
    note,
  ].join("\n");
}
