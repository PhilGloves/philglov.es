import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const root = new URL("../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
const site = read("src/styles/site.css");
const tokens = read("src/styles/tokens.css");
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");
const siteCode = stripComments(site);

test("one stylesheet, ≤ 20 KB compressed (source, unminified, tokens included: an upper bound)", () => {
  const all = site.replace('@import "./tokens.css";', tokens);
  const gz = gzipSync(all, { level: 9 }).length;
  assert.ok(gz <= 20 * 1024, `${gz} bytes gzip`);
});

test("layers are declared in the required order", () => {
  assert.match(site, /@layer reset, tokens, base, layout, components, utilities;/);
});

test("no !important, no ID selectors, no framework", () => {
  assert.doesNotMatch(siteCode + stripComments(tokens), /!important/);
  const selectors = siteCode.replace(/\{[^{}]*\}/g, "{}").replace(/url\([^)]*\)/g, "");
  assert.doesNotMatch(selectors, /(^|[\s,>+~(])#[a-z_-]/i, "an ID selector");
  assert.doesNotMatch(site, /tailwind|bootstrap/i);
});

test("every colour comes from tokens.css: no hex or rgb() in site.css", () => {
  assert.doesNotMatch(siteCode, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(siteCode, /\brgba?\(/);
});

test("logical properties only: no physical margin, padding, border, inset, width or height", () => {
  const physical =
    /^\s*(margin|padding)-(left|right|top|bottom)\s*:|^\s*(width|height|min-width|max-width|min-height|max-height|top|left|right|bottom)\s*:|^\s*border-(left|right|top|bottom)(-[a-z]+)?\s*:|^\s*text-align:\s*(left|right)/gm;
  assert.deepEqual(siteCode.match(physical) ?? [], []);
});

test("viewport media queries are only for user preferences, scripting and print", () => {
  const queries = [...siteCode.matchAll(/@media\s*([^{]+)\{/g)].map((m) => (m[1] ?? "").trim());
  for (const q of queries) {
    assert.match(q, /prefers-|forced-colors|scripting|print/, `@media ${q}`);
  }
});

test("components respond to containers", () => {
  assert.match(siteCode, /@container page \(width > 65rem\)/);
  assert.match(siteCode, /@container content \(width/);
  assert.match(siteCode, /container: page \/ inline-size/);
});

test("no view transitions: page changes are plain navigations (Q19, decision 0021)", () => {
  assert.doesNotMatch(siteCode, /@view-transition|view-transition-name|::view-transition/);
});

test("no inline style attributes or third-party URLs in templates and styles", () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(astro|css|ts)$/.test(name)) files.push(full);
    }
  };
  walk(new URL("src/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\sstyle=["'{]/, `${file}: inline style attribute`);
    if (file.endsWith(".css")) assert.doesNotMatch(stripComments(text), /https?:\/\//, `${file}: external URL`);
  }
});

test("one typeface: every font-family is the --font token, the code stack or inherited", () => {
  const uses = [...siteCode.matchAll(/font-family:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim());
  const allowed = new Set(["var(--font)", "var(--font-code)", "archivo"]);
  for (const u of uses) {
    if (u.startsWith('"Crimson Pro')) continue; // the @font-face declarations
    assert.ok(allowed.has(u) && u !== "archivo", `font-family: ${u}`);
  }
});

test("on phones the grid gap is 16 px and from tablet up 32 px", () => {
  assert.match(tokens, /--col-gap: var\(--sp-32\)/);
  assert.match(siteCode, /\.page \{\s*--col-gap: var\(--sp-16\)/);
  assert.match(
    siteCode,
    /@container page \(width > 40rem\) \{\s*\.page \{\s*--gutter: var\(--sp-48\);\s*--col-gap: var\(--sp-32\)/,
  );
});

test("no arrow characters in templates: the SVG component draws them (strings in src/i18n are rendered through <Arrows>)", () => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.astro$/.test(name)) files.push(full);
    }
  };
  walk(new URL("src/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  for (const file of files) {
    if (/Arrows?\.astro$/.test(file)) continue;
    const bare = readFileSync(file, "utf8")
      .replace(/<Arrows[^>]*\/>/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^---[\s\S]*?^---/m, (fm) => fm.replace(/(?:text|link|marker|mark|label): "[^"]*"/g, ""));
    assert.doesNotMatch(bare, /[→←↑↓↩]/, `${file}: an arrow character outside <Arrows>`);
  }
});
