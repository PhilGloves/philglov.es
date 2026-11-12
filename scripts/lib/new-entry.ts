/** `pnpm new <slug> --lang it|en` (ticket C4): the text of a new entry file. Pure, tested. */
import { RESERVED_SLUGS } from "./content-check.ts";

export type Lang = "en" | "it";

export interface NewEntryInput {
  slug: string;
  lang: Lang;
  today: string; // YYYY-MM-DD
  tags?: string[];
  /** Text of the existing file in the other language, if there is one. */
  twinText?: string;
  /** Slugs of standalone pages, which share the /<slug> space. */
  pageSlugs?: readonly string[];
}

const field = (text: string, key: string): string | undefined =>
  new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m").exec(text)?.[1];

export function newEntry(input: NewEntryInput): string {
  const { slug, lang, today, twinText } = input;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`"${slug}" must be lowercase ASCII with hyphens`);
  if (RESERVED_SLUGS.includes(slug) || input.pageSlugs?.includes(slug))
    throw new Error(`"${slug}" is a reserved or taken slug`);

  let originalLang: Lang = lang;
  let tags = input.tags?.length ? input.tags : ["thoughts"];
  if (twinText) {
    const orig = field(twinText, "originalLang");
    if (orig !== "en" && orig !== "it") throw new Error("the existing version has no valid originalLang");
    originalLang = orig;
    const twinTags = /^tags:\s*\[(.*)\]\s*$/m.exec(twinText)?.[1];
    if (!input.tags?.length && twinTags) tags = twinTags.split(",").map((t) => t.trim());
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
    `tags: [${tags.join(", ")}]`,
    "comments: true",
    "---",
    "",
    note,
  ].join("\n");
}
