/**
 * First job of the pull-request workflow. Finds original-language Markdown
 * files changed on this branch whose twin is missing or older, and asks
 * scripts/translate.ts to write the twin. Never overwrites a twin marked
 * `reviewed`; flags it in the pull request instead.
 *
 * Usage: node scripts/translate-pr.ts <base-ref>   (e.g. origin/main)
 * Prints the paths it wrote, one per line, for the workflow to commit.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { NotImplemented, translateFile } from "./translate.ts";

const CONTENT = /^src\/content\/(journal|pages)\/(en|it)\/[a-z0-9-]+\.md$/;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** Value of a top-level `key: value` line in the YAML frontmatter. */
export function frontmatterValue(markdown: string, key: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? "";
  const line = new RegExp(String.raw`^${key}:\s*["']?([^"'#\r\n]*?)["']?\s*(#.*)?$`, "m").exec(fm);
  return line?.[1];
}

export function twinOf(path: string): string {
  return path.replace(/\/(en|it)\//, (_m, lang: string) => (lang === "en" ? "/it/" : "/en/"));
}

function lastCommitTime(path: string): number {
  const out = git("log", "-1", "--format=%ct", "--", path);
  return out ? Number(out) : 0;
}

async function main(base: string): Promise<void> {
  const changed = git("diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`)
    .split("\n")
    .filter((p) => CONTENT.test(p));

  const written: string[] = [];
  for (const path of changed) {
    const source = readFileSync(path, "utf8");
    if (frontmatterValue(source, "translation") !== "original") continue;

    const twin = twinOf(path);
    if (existsSync(twin)) {
      const twinText = readFileSync(twin, "utf8");
      if (lastCommitTime(twin) >= lastCommitTime(path)) continue;
      if (frontmatterValue(twinText, "translation") === "reviewed") {
        console.error(`::warning file=${twin}::${path} changed but its twin is marked reviewed; update it by hand.`);
        continue;
      }
    }

    try {
      await translateFile(path);
      written.push(twin);
    } catch (err) {
      if (!(err instanceof NotImplemented)) throw err;
      console.error(`::warning file=${path}::No machine translation yet: ${err.message}`);
    }
  }
  for (const path of written) console.log(path);
}

if (import.meta.main) {
  const base = process.argv[2];
  if (!base) {
    console.error("usage: node scripts/translate-pr.ts <base-ref>");
    process.exit(2);
  }
  await main(base);
}
