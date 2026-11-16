/**
 * The Markdown file /admin/write publishes (B8), and the checks before it.
 * Pure, so it is unit-tested. The file follows src/content.config.ts; the
 * build checks it again, so a malformed phone entry fails its pull request
 * instead of reaching the site.
 */
import { frontMatterText, readFrontMatter, setField, type FrontMatter } from "./frontmatter.ts";
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
  body: string;
  photos: PhotoRef[];
}

export type EntryField = "title" | "slug" | "lang" | "description" | "body" | "photos";
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

/** One photo paragraph: ![alt](../../../.originals/<key> "caption"). */
const photoMarkdown = (p: PhotoRef): string =>
  `![${altText(p.alt)}](${photoPath(p.key)}${p.caption ? ` "${titleText(p.caption)}"` : ""})`;

/**
 * A new entry file. The caption is the image title, which the photo pipeline turns into a figcaption. New entries
 * have comments on; an edit goes through editedEntryMarkdown instead, which keeps the file's own lines.
 */
export function entryMarkdown(input: EntryInput, originalLang: Lang, date: string, comments = true): string {
  const photos = input.photos.map(photoMarkdown);
  return [
    "---",
    `title: ${yamlString(input.title)}`,
    `date: ${date}`,
    `lang: ${input.lang}`,
    `originalLang: ${originalLang}`,
    `description: ${yamlString(input.description)}`,
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
  /** undefined when the file does not say (the schema then fails the build anyway). */
  comments: boolean | undefined;
  body: string;
}

/** The text after the closing fence, as the edit form shows it (line ends as \n; saving writes the file's own). */
const bodyOf = (fm: FrontMatter): string => fm.body.replace(/\r\n/g, "\n").replace(/^\n+/, "").trimEnd();

/** A line such as `comments: false # closed` as YAML's core schema reads it: true, false, or neither. */
function booleanOf(fm: FrontMatter, key: string): boolean | undefined {
  const raw = fm.fields.get(key)?.raw ?? "";
  if (/^(?:true|True|TRUE)$/.test(raw)) return true;
  if (/^(?:false|False|FALSE)$/.test(raw)) return false;
  return undefined;
}

/**
 * Reads back the frontmatter fields /admin/write needs, from a file written on the phone or the laptop. A value
 * that cannot be read exactly (worker/src/frontmatter.ts) comes back as "".
 */
export function parseEntry(text: string): ParsedEntry | null {
  const fm = readFrontMatter(text);
  if (!fm) return null;
  const value = (key: string): string => fm.fields.get(key)?.value ?? "";
  return {
    title: value("title"),
    description: value("description"),
    date: fm.fields.get("date")?.value ?? fm.fields.get("date")?.raw ?? "",
    lang: value("lang"),
    originalLang: value("originalLang"),
    comments: booleanOf(fm, "comments"),
    body: bodyOf(fm),
  };
}

export type Editable =
  { ok: true; fm: FrontMatter; title: string; description: string; body: string } | { ok: false; reason: string };

/**
 * Whether /admin/write can open this file for editing and save it back with every line it does not change exactly
 * as it was (SO-01). It shows the title and the description, so both must be values it reads exactly; everything
 * else in the front matter is kept as text, whatever it is.
 */
export function editable(text: string): Editable {
  const fm = readFrontMatter(text);
  if (!fm)
    return { ok: false, reason: "its front matter is missing, or written in YAML this page cannot keep exactly" };
  const title = fm.fields.get("title");
  if (!title?.value)
    return {
      ok: false,
      reason: title
        ? "its title is not one line this page can show exactly (over more than one line, for example)"
        : "it has no title",
    };
  const description = fm.fields.get("description");
  if (description && description.value === undefined)
    return {
      ok: false,
      reason: "its description is not one line this page can show exactly (over more than one line, for example)",
    };
  return { ok: true, fm, title: title.value, description: description?.value ?? "", body: bodyOf(fm) };
}

/**
 * The edited file: the title and description lines replaced only if their value changed, every other front matter
 * line byte for byte as it was (date, comments, languages, comments in the YAML, old tags lines), and the new text
 * with the photos after it, in the file's own line ends. null when the file cannot be edited (see editable).
 */
export function editedEntryMarkdown(text: string, input: EntryInput): string | null {
  const found = editable(text);
  if (!found.ok) return null;
  const { fm } = found;
  if (input.title !== clean(found.title, false)) setField(fm, "title", input.title);
  if (input.description !== clean(found.description, false)) setField(fm, "description", input.description);
  const lead = (/^(?:\r?\n)+/.exec(fm.body)?.[0] ?? "\n").replace(/\r/g, "");
  const content = [input.body, ...input.photos.map(photoMarkdown)].filter(Boolean).join("\n\n");
  return frontMatterText(fm) + `${lead}${content}\n`.replace(/\n/g, fm.eol);
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
