/** Fails the build when the Markdown content breaks a cross-file rule (scripts/lib/content-check.ts). */
import { readdirSync, readFileSync } from "node:fs";
import { checkContent, type ContentFile } from "./lib/content-check.ts";
import { collectionDir, folders } from "./lib/content-root.ts";

const files: ContentFile[] = [];
for (const collection of ["journal", "pages"] as const) {
  const root = collectionDir(collection);
  for (const folder of readdirSync(root)) {
    for (const name of readdirSync(new URL(`${folder}/`, root))) {
      if (!name.endsWith(".md")) continue;
      files.push({
        path: `${collection}/${folder}/${name}`,
        text: readFileSync(new URL(`${folder}/${name}`, root), "utf8"),
      });
    }
  }
}
const problems = checkContent(files);
if (problems.length) {
  console.error(
    `Content check failed:\n${problems.map((p) => `  - ${p.replace(/^(journal|pages)\//, (_, c: "journal" | "pages") => `${folders[c]}/`)}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(`Content check passed (${files.length} files).`);
