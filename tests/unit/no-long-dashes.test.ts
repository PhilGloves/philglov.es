/**
 * The owner's rule (2026-11-18, decision 0032): no long dashes anywhere on the site. The site's own text uses a plain
 * hyphen: " - " between words, "300-400" in ranges. This reads every text file the site is built or served from (the
 * string files, the pages in src/content/pages, components, layouts, views, feeds, robots, share images, structured
 * data, the Worker's pages and emails, the build scripts) and fails on an en dash or an em dash, written as the
 * character or as an HTML or JavaScript escape. The owner's own writing is not checked: journal entries
 * (src/content/journal) and photo series (src/content/photos, captions and alt text).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const roots = ["src", "worker/src", "scripts", "public"];
const ownersText = ["src/content/journal", "src/content/photos", "src/.originals"];
const binary = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".ico", ".woff2", ".woff", ".ttf", ".pdf"]);

// U+2013 and U+2014 as characters, HTML entities (named, decimal, hex) and JavaScript/JSON/CSS escapes.
const dash = /[\u2013\u2014]|&[mn]dash;|&#821[12];|&#x201[34];|\\u201[34]|\\201[34]/i;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(join(root, dir))) {
    const path = `${dir}/${name}`;
    if (ownersText.includes(path)) continue;
    if (statSync(join(root, path)).isDirectory()) yield* files(path);
    else if (!binary.has(extname(name).toLowerCase())) yield path;
  }
}

test("the site's own text has no en dash or em dash (journal entries and photo captions excepted)", () => {
  const found: string[] = [];
  for (const dir of roots) {
    for (const path of files(dir)) {
      readFileSync(join(root, path), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (dash.test(line)) found.push(`${relative(root, join(root, path))}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  }
  assert.deepEqual(found, [], `use a plain hyphen "-" instead:\n${found.join("\n")}`);
});

test("the check catches a dash in every form it can be written", () => {
  for (const sample of ["a \u2014 b", "300\u2013400", "a &mdash; b", "a &ndash; b", "&#8212;", "&#x2013;", "\\u2014", "\\2013"]) {
    assert.match(sample, dash, sample);
  }
  for (const sample of ["a - b", "300-400", "a · b", "→"]) assert.doesNotMatch(sample, dash, sample);
});
