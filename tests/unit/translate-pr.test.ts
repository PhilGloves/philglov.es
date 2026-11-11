import { test } from "node:test";
import assert from "node:assert/strict";
import { frontmatterValue, twinOf } from "../../scripts/translate-pr.ts";

test("twins share a file name across the en and it folders", () => {
  assert.equal(twinOf("src/content/journal/it/lisbona.md"), "src/content/journal/en/lisbona.md");
  assert.equal(twinOf("src/content/pages/en/about.md"), "src/content/pages/it/about.md");
});

test("reads frontmatter values with or without quotes and comments", () => {
  const md = '---\ntitle: "Tre settimane"\nlang: it   # this file\ntranslation: original\n---\ntranslation: machine\n';
  assert.equal(frontmatterValue(md, "translation"), "original");
  assert.equal(frontmatterValue(md, "lang"), "it");
  assert.equal(frontmatterValue(md, "title"), "Tre settimane");
  assert.equal(frontmatterValue(md, "missing"), undefined);
});
