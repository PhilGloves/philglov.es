/** Fails the build when the Markdown content breaks a cross-file rule (scripts/lib/content-check.ts). */
import { readdirSync, readFileSync } from "node:fs";
import { checkContent, type ContentFile } from "./lib/content-check.ts";

const root = new URL("../src/content/", import.meta.url);
const files: ContentFile[] = [];
for (const collection of ["journal", "pages"]) {
  for (const folder of readdirSync(new URL(`${collection}/`, root))) {
    for (const name of readdirSync(new URL(`${collection}/${folder}/`, root))) {
      if (!name.endsWith(".md")) continue;
      const path = `${collection}/${folder}/${name}`;
      files.push({ path, text: readFileSync(new URL(path, root), "utf8") });
    }
  }
}
const problems = checkContent(files);
if (problems.length) {
  console.error(`Content check failed:\n${problems.map((p) => `  - src/content/${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Content check passed (${files.length} files).`);
