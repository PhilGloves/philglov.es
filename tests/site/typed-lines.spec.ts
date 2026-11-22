/**
 * On the site's own build (`pnpm test:site`, decision 0033): every line the owner typed in a journal entry is a line
 * on its page (decision 0037). One press of Enter on the phone is a new line; an empty line is a new paragraph.
 *
 * It names no entry. It reads the entries this build was made from, takes the paragraphs that are certainly plain
 * text typed one Enter per line (typed-lines.ts, which leaves out anything it cannot be sure of), and looks for each
 * on the entry's page: one paragraph, with the same lines. A build with no entry (the empty site) has nothing to
 * check.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { frontMatter } from "../../scripts/lib/content-check.ts";
import { collectionDir } from "../../scripts/lib/content-root.ts";
import { readBuilt } from "../e2e/qa/lib.ts";
import { asLines, typedParagraphs } from "./typed-lines.ts";

const dist = new URL("../../dist/", import.meta.url);
const journal = collectionDir("journal");

interface Typed {
  path: string;
  file: string;
  paragraphs: string[][];
}

const entries: Typed[] = (["en", "it"] as const).flatMap((lang) => {
  const dir = new URL(`${lang}/`, journal);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const slug = name.replace(/\.md$/, "");
      return {
        path: lang === "en" ? `/${slug}` : `/it/${slug}`,
        file: lang === "en" ? `${slug}.html` : `it/${slug}.html`,
        paragraphs: typedParagraphs(frontMatter(readFileSync(new URL(name, dir), "utf8")).body),
      };
    });
});

test("every line typed in an entry is a line on its page", async ({ page }) => {
  const inFeeds = ["feed.xml", "it/feed.xml"].reduce(
    (n, feed) => n + (readBuilt(feed).match(/<item>/g) ?? []).length,
    0,
  );
  test.skip(inFeeds === 0, "this build has no entry");
  const problems: string[] = [];
  for (const entry of entries) {
    if (!existsSync(new URL(entry.file, dist))) {
      problems.push(`${entry.path} is not in dist/: this check runs on the site's own build, after \`pnpm build\``);
      continue;
    }
    if (entry.paragraphs.length === 0) continue;
    await page.goto(entry.path);
    // Each paragraph of the text as its lines: a <br> ends a line.
    const onPage = await page.locator(".prose p").evaluateAll((paragraphs) =>
      paragraphs.map((p) => {
        const lines = [""];
        const read = (node: Node): void => {
          for (const child of node.childNodes) {
            if (child.nodeName === "BR") lines.push("");
            else if (child.nodeType === 3) lines[lines.length - 1] += child.nodeValue ?? "";
            else read(child);
          }
        };
        read(p);
        return lines;
      }),
    );
    const shown = new Set(onPage.map(asLines));
    for (const typed of entry.paragraphs)
      if (!shown.has(asLines(typed)))
        problems.push(
          `${entry.path}: ${typed.length} lines were typed one under the other, and the page does not show them as ` +
            `${typed.length} lines of one paragraph: "${(typed[0] ?? "").slice(0, 60)}" / "${(typed[1] ?? "").slice(0, 60)}"`,
        );
  }
  expect(problems).toEqual([]);
});
