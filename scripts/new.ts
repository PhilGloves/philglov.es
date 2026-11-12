/**
 * pnpm new <slug> --lang it|en [--tags travel,photography]
 * Creates src/content/journal/<lang>/<slug>.md. If the other language already
 * has the slug, this is its other-language version and originalLang is copied
 * from the existing file. Nothing is translated for you.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { newEntry, type Lang } from "./lib/new-entry.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { lang: { type: "string" }, tags: { type: "string" } },
});
const slug = positionals[0];
const lang = values.lang;
if (!slug || (lang !== "it" && lang !== "en")) {
  console.error("Usage: pnpm new <slug> --lang it|en [--tags travel,photography]");
  process.exit(1);
}
const journal = new URL("../src/content/journal/", import.meta.url);
const target = new URL(`${lang}/${slug}.md`, journal);
const twin = new URL(`${lang === "it" ? "en" : "it"}/${slug}.md`, journal);
if (existsSync(target)) {
  console.error(`${lang}/${slug}.md already exists.`);
  process.exit(1);
}
const pageSlugs = readdirSync(new URL("../src/content/pages/en/", import.meta.url)).map((f) => f.replace(/\.md$/, ""));
try {
  const hasTwin = existsSync(twin);
  writeFileSync(
    target,
    newEntry({
      slug,
      lang: lang as Lang,
      today: new Date().toISOString().slice(0, 10),
      pageSlugs,
      ...(values.tags ? { tags: values.tags.split(",").map((t) => t.trim()) } : {}),
      ...(hasTwin ? { twinText: readFileSync(twin, "utf8") } : {}),
    }),
  );
  console.log(`Created src/content/journal/${lang}/${slug}.md${hasTwin ? " (other-language version)" : ""}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
