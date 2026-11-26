/**
 * Cross-file checks on the Markdown content (ticket C2). The zod schema in
 * src/content.config.ts checks one file at a time; this checks the files
 * against each other, because twins, slugs and folders only make sense together.
 *
 * Pure: takes file contents, returns problems. scripts/check-content.ts reads
 * the disk; tests/unit/content-check.test.ts feeds it deliberately broken sets.
 */
import { parseFrontmatter } from "astro/markdown";

export interface ContentFile {
  /** "journal/it/alps.md" or "pages/en/about.md", relative to src/content. */
  path: string;
  text: string;
}

/** Slugs that routes, the Worker or the guide already use (docs/guide.md, URL rules). */
export const RESERVED_SLUGS: readonly string[] = [
  "it",
  "journal",
  "photos",
  "now",
  "about",
  "rights",
  "privacy",
  "admin",
  "api",
  "_assets",
  "feed.xml",
  "feed",
  "robots.txt",
  "sitemap.xml",
  "styleguide",
  "404",
  // /index is built to index.html, the home page's own file (audit finding 5).
  "index",
  "cv",
];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface Parsed {
  path: string;
  collection: "journal" | "pages";
  folder: string;
  slug: string;
  lang?: string;
  originalLang?: string;
  body: string;
}

/**
 * The front matter as Astro reads it when it builds the site: its own parser (`astro/markdown`, the one the content
 * collections use), so a file passes here exactly when its YAML means the same thing to the build (SO-01). Throws
 * on YAML the build would refuse too.
 */
export function frontMatter(text: string): { data: Record<string, unknown>; body: string } {
  const { frontmatter, content } = parseFrontmatter(text);
  return { data: frontmatter, body: content };
}

/** The frontmatter keys this check needs, and the text. A YAML error is returned as `error`. */
export function parseFile(file: ContentFile): (Parsed & { error?: string }) | undefined {
  const parts = file.path.split("/");
  const [collection, folder, name] = parts;
  if ((collection !== "journal" && collection !== "pages") || !folder || !name || parts.length !== 3) return undefined;
  const parsed: Parsed & { error?: string } = {
    path: file.path,
    collection,
    folder,
    slug: name.replace(/\.md$/, ""),
    body: file.text,
  };
  let data: Record<string, unknown> = {};
  try {
    ({ data, body: parsed.body } = frontMatter(file.text));
  } catch (error) {
    parsed.error = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
  }
  const text = (key: string): string | undefined => {
    const value = data[key];
    return typeof value === "string" ? value : value === undefined || value === null ? undefined : String(value);
  };
  const lang = text("lang");
  const originalLang = text("originalLang");
  if (lang) parsed.lang = lang;
  if (originalLang) parsed.originalLang = originalLang;
  return parsed;
}

/** Images with no alt text: Markdown `![](x)` and HTML `<img>` without a non-empty alt. */
export function imagesWithoutAlt(body: string): string[] {
  const bad: string[] = [];
  for (const m of body.matchAll(/!\[([^\]]*)\]\(([^)\s]*)/g)) if (!m[1]?.trim()) bad.push(m[2] ?? "");
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[0]);
    if (!(alt?.[1] ?? alt?.[2])?.trim()) bad.push(/\bsrc\s*=\s*"([^"]*)"/i.exec(m[0])?.[1] ?? "<img>");
  }
  return bad;
}

export function checkContent(files: readonly ContentFile[]): string[] {
  const problems: string[] = [];
  const parsed = files.flatMap((f) => parseFile(f) ?? []);
  const byKey = new Map<string, Parsed>();

  for (const p of parsed) {
    const here = p.path;
    if (p.folder !== "en" && p.folder !== "it") {
      problems.push(`${here}: folder "${p.folder}" is not en or it`);
      continue;
    }
    if (p.error) problems.push(`${here}: the front matter is not valid YAML (${p.error})`);
    else if (!p.lang || !p.originalLang) problems.push(`${here}: lang and originalLang are both required`);
    if (p.lang && p.lang !== p.folder)
      problems.push(`${here}: lang "${p.lang}" does not match its folder "${p.folder}"`);
    if (!SLUG.test(p.slug)) problems.push(`${here}: slug "${p.slug}" must be lowercase ASCII with hyphens`);
    if (p.collection === "journal" && RESERVED_SLUGS.includes(p.slug))
      problems.push(`${here}: "${p.slug}" is a reserved slug`);
    byKey.set(`${p.collection}/${p.folder}/${p.slug}`, p);
    for (const src of imagesWithoutAlt(p.body))
      problems.push(`${here}: image ${src} has no alt text (write it in ${p.folder === "it" ? "Italian" : "English"})`);
  }

  // A journal slug may not collide with a standalone page's slug: both live at /<slug>.
  const pageSlugs = new Set(parsed.filter((p) => p.collection === "pages").map((p) => p.slug));
  for (const p of parsed)
    if (p.collection === "journal" && pageSlugs.has(p.slug))
      problems.push(`${p.path}: slug "${p.slug}" is already taken by a page`);

  // Twins: same collection, same name, other folder.
  for (const p of parsed) {
    if (p.folder !== "en" && p.folder !== "it") continue;
    if (!p.lang || !p.originalLang || p.lang !== p.folder) continue;
    const otherFolder = p.folder === "en" ? "it" : "en";
    const twin = byKey.get(`${p.collection}/${otherFolder}/${p.slug}`);
    if (p.lang !== p.originalLang) {
      if (!twin) {
        problems.push(
          `${p.path}: is a translation (originalLang ${p.originalLang}) but ${p.originalLang}/${p.slug}.md does not exist`,
        );
        continue;
      }
      if (twin.lang && twin.lang !== p.originalLang)
        problems.push(`${p.path}: originalLang "${p.originalLang}" does not match its twin's lang "${twin.lang}"`);
    }
    if (twin?.originalLang && twin.originalLang !== p.originalLang)
      problems.push(
        `${p.path}: originalLang "${p.originalLang}" differs from its twin's originalLang "${twin.originalLang}"`,
      );
    if (twin && p.lang === p.originalLang && twin.lang === twin.originalLang)
      problems.push(`${p.path}: both versions claim to be the original; one must have a different originalLang`);
  }
  return [...new Set(problems)].sort();
}
