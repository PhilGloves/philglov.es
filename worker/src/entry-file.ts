/**
 * The Markdown file /admin/write publishes (B8), and the checks before it.
 * Pure, so it is unit-tested. The file follows src/content.config.ts; the
 * build checks it again, so a malformed phone entry fails its pull request
 * instead of reaching the site.
 */
import { TOPICS } from "../../src/lib/topics.ts";
import type { Lang } from "./manifest.ts";
import { clean, length } from "./validate.ts";

export interface PhotoRef {
  /** R2 key in the originals bucket: "<slug>/<file>.jpg|png". */
  key: string;
  alt: string;
  caption: string;
}

export interface EntryInput {
  title: string;
  slug: string;
  lang: Lang;
  description: string;
  tags: string[];
  body: string;
  photos: PhotoRef[];
}

export type EntryField = "title" | "slug" | "lang" | "description" | "tags" | "body" | "photos";
export type EntryErrors = Partial<Record<EntryField, string>>;

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PHOTO_FILE = /^[a-z0-9][a-z0-9-]{0,80}\.(jpg|png)$/;

/** A short slug from a title: lowercase ASCII, accents dropped, at most five words. */
export function slugFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 5)
    .join("-")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** A safe object name for an uploaded photo, from the phone's file name. */
export function photoName(fileName: string, ext: "jpg" | "png"): string {
  const base = slugFromTitle(fileName.replace(/\.[a-z0-9]{1,5}$/i, "")).slice(0, 60) || "photo";
  return `${base}.${ext}`;
}

export const isPhotoKey = (slug: string, key: string): boolean =>
  key.startsWith(`${slug}/`) && PHOTO_FILE.test(key.slice(slug.length + 1));

export function readEntry(form: URLSearchParams): EntryInput {
  const lang = form.get("lang") === "it" ? "it" : "en";
  const title = clean(form.get("title"), false);
  const slug = clean(form.get("slug"), false).toLowerCase() || slugFromTitle(title);
  const keys = form.getAll("photo_key");
  const alts = form.getAll("photo_alt");
  const captions = form.getAll("photo_caption");
  return {
    title,
    slug,
    lang,
    description: clean(form.get("description"), false),
    tags: form.getAll("tags").filter((t, i, all) => all.indexOf(t) === i),
    body: clean(form.get("body"), true),
    photos: keys.map((key, i) => ({
      key: clean(key, false),
      alt: clean(alts[i], false),
      caption: clean(captions[i], false),
    })),
  };
}

export function validateEntry(input: EntryInput, taken: readonly string[]): EntryErrors {
  const errors: EntryErrors = {};
  if (!input.title) errors.title = "Write a title.";
  else if (length(input.title) > 120) errors.title = "Use at most 120 characters.";
  if (!input.slug) errors.slug = "Write a slug, or a title to suggest one.";
  else if (!SLUG.test(input.slug) || input.slug.length > 60)
    errors.slug = "Lowercase letters, digits and single hyphens, at most 60 characters.";
  else if (taken.includes(input.slug)) errors.slug = `"${input.slug}" is reserved or used by a page.`;
  if (!input.description) errors.description = "Write one sentence for search results and link previews.";
  else if (length(input.description) > 200) errors.description = "Use at most 200 characters.";
  if (input.tags.length === 0) errors.tags = "Pick at least one topic.";
  else if (!input.tags.every((t) => (TOPICS as readonly string[]).includes(t))) errors.tags = "Unknown topic.";
  if (!input.body && input.photos.length === 0) errors.body = "Write the text.";
  else if (length(input.body) > 100_000) errors.body = "Use at most 100,000 characters.";
  for (const photo of input.photos) {
    if (!isPhotoKey(input.slug, photo.key)) errors.photos = "A photo belongs to another slug; upload it again.";
    else if (!photo.alt) errors.photos = "Every photo needs alt text: what is in it and why it matters.";
    else if (length(photo.alt) > 300 || length(photo.caption) > 300)
      errors.photos = "Keep alt text and captions under 300 characters.";
  }
  return errors;
}

const yamlString = (text: string): string => JSON.stringify(text);
const altText = (text: string): string => text.replace(/[\\[\]]/g, "\\$&");
const titleText = (text: string): string => text.replace(/[\\"]/g, "\\$&");

/**
 * Where an entry photo is at build time: the photo pipeline (ticket P1)
 * downloads philglov-originals/<slug>/<file> to src/.originals/<slug>/<file>,
 * which is this path relative to src/content/journal/<lang>/<slug>.md.
 */
export const photoPath = (key: string): string => `../../../.originals/${key}`;

/**
 * The entry file. The caption is the image title, which the photo pipeline turns into a figcaption. `comments`
 * keeps an existing entry's choice when it is edited; new entries have comments on.
 */
export function entryMarkdown(input: EntryInput, originalLang: Lang, date: string, comments = true): string {
  const photos = input.photos.map(
    (p) => `![${altText(p.alt)}](${photoPath(p.key)}${p.caption ? ` "${titleText(p.caption)}"` : ""})`,
  );
  return [
    "---",
    `title: ${yamlString(input.title)}`,
    `date: ${date}`,
    `lang: ${input.lang}`,
    `originalLang: ${originalLang}`,
    `description: ${yamlString(input.description)}`,
    `tags: [${input.tags.join(", ")}]`,
    `comments: ${comments}`,
    "---",
    "",
    [input.body, ...photos].filter(Boolean).join("\n\n"),
    "",
  ].join("\n");
}

export interface ParsedEntry {
  title: string;
  description: string;
  date: string;
  lang: string;
  originalLang: string;
  tags: string[];
  /** undefined when the file does not say (the schema then fails the build anyway). */
  comments: boolean | undefined;
  body: string;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/** Reads back the frontmatter fields /admin/write needs (laptop files use the same simple form). */
export function parseEntry(text: string): ParsedEntry | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const fields = new Map<string, string>();
  /** Items of a block list ("tags:" then "  - travel" lines), the other way laptop files write a list. */
  const items = new Map<string, string[]>();
  let current = "";
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (m?.[1]) {
      current = m[1];
      fields.set(current, m[2] ?? "");
    } else if (item && current) items.set(current, [...(items.get(current) ?? []), item[1] ?? ""]);
  }
  const inline = /^\[(.*)\]$/.exec((fields.get("tags") ?? "").trim())?.[1];
  const tags = inline !== undefined ? inline.split(",") : (items.get("tags") ?? []);
  const comments = (fields.get("comments") ?? "").trim();
  return {
    title: unquote(fields.get("title") ?? ""),
    description: unquote(fields.get("description") ?? ""),
    date: (fields.get("date") ?? "").trim(),
    lang: (fields.get("lang") ?? "").trim(),
    originalLang: (fields.get("originalLang") ?? "").trim(),
    tags: tags.map((t) => unquote(t)).filter(Boolean),
    comments: comments === "true" ? true : comments === "false" ? false : undefined,
    body: (match[2] ?? "").replace(/^\n+/, "").trimEnd(),
  };
}

export const entryFilePath = (lang: Lang, slug: string): string => `src/content/journal/${lang}/${slug}.md`;

/** One photo paragraph as entryMarkdown writes it: ![alt](../../../.originals/<key> "caption"). */
const PHOTO_LINE = /^!\[((?:\\.|[^\]\\])*)\]\(\.\.\/\.\.\/\.\.\/\.originals\/([^\s)]+)(?: "((?:\\.|[^"\\])*)")?\)$/;
const unescape = (text: string): string => text.replace(/\\(.)/g, "$1");

/**
 * The photos at the end of an entry's text, as /admin/write wrote them (entryMarkdown), taken back out so the edit
 * form shows them as photos with their alt text and caption. Only whole paragraphs after the last text, and only
 * photos of this slug: anything else stays in the text, so saving changes nothing the form did not show.
 */
export function splitPhotos(body: string, slug: string): { body: string; photos: PhotoRef[] } {
  const blocks = body.split(/\n{2,}/);
  const photos: PhotoRef[] = [];
  while (blocks.length) {
    const m = PHOTO_LINE.exec((blocks[blocks.length - 1] ?? "").trim());
    if (!m?.[2] || !isPhotoKey(slug, m[2])) break;
    photos.unshift({ key: m[2], alt: unescape(m[1] ?? ""), caption: unescape(m[3] ?? "") });
    blocks.pop();
  }
  return { body: blocks.join("\n\n").trimEnd(), photos };
}
