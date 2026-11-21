/**
 * Final review, T2-01 (FINAL-REVIEW.md). Every pull request runs `pnpm lint`, the phone's included (ci.yml, "Lint",
 * in both scopes). An entry is the owner's text, written by the phone editor exactly as he typed it, and it must
 * never be reworded (0032, 0034); so Lint must accept any entry file the Worker writes. Prettier used to check
 * src/content/journal and refused straight quotes in a title, a list right under a sentence, *italics*, a space at a
 * line end: the publish went red, never merged, and nothing on the phone could fix it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { entryMarkdown, type EntryInput } from "../../worker/src/entry-file.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = (over: Partial<EntryInput>): EntryInput => ({
  title: "A walk",
  slug: "a-walk",
  lang: "en",
  description: "One sentence.",
  body: "First paragraph.",
  photos: [],
  ...over,
});

const CASES: [string, EntryInput][] = [
  ["plain", entry({})],
  ["straight quotes in the title", entry({ title: 'The "big" walk' })],
  ["straight quotes in the description", entry({ description: 'He said "hello".' })],
  ["a list right under a sentence", entry({ body: "Things I packed:\n- socks\n- a map" })],
  ["*italics* and __bold__", entry({ body: "This is *very* __important__." })],
  ["a space at the end of a line", entry({ body: "First line. \nSecond line." })],
  ["a caption with quotes", entry({ photos: [{ key: "a-walk/hill-ab12.jpg", alt: "A hill", caption: 'The "hill"' }] })],
];

for (const [name, input] of CASES)
  test(`Lint accepts an entry the phone writes: ${name}`, async () => {
    const path = `${root}src/content/journal/en/${input.slug}.md`;
    const info = await prettier.getFileInfo(path, { ignorePath: `${root}.prettierignore` });
    if (info.ignored) return;
    const options = (await prettier.resolveConfig(path)) ?? {};
    const text = entryMarkdown(input, "en", "2026-11-21");
    assert.ok(await prettier.check(text, { ...options, filepath: path }), `Prettier refuses:\n${text}`);
  });
