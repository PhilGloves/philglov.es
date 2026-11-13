/**
 * Downloads the photo originals the site needs from the private R2 bucket
 * (philglov-originals) into the git-ignored src/.originals/, so Astro can
 * optimise them as local files. Files already there are skipped, so the CI
 * cache means build time grows with new photos, not with the archive.
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Without credentials (a laptop, a fork) it does nothing and exits 0: the
 * pages then draw the tone placeholders. `--force` downloads everything again.
 * RAW files never leave the owner's drives; the bucket holds JPEG/PNG only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { entryKeys, seriesKeys } from "./lib/photo-keys.ts";
import { getObject, type R2Config } from "./lib/r2.ts";

const root = new URL("../src/", import.meta.url);

function neededKeys(): string[] {
  const series: Record<string, string> = {};
  const dir = new URL("content/photos/", root);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = new URL(`${e.name}/photos.json`, dir);
    if (e.isDirectory() && existsSync(file)) series[e.name] = readFileSync(file, "utf8");
  }
  const keys = seriesKeys(series);
  const journal = new URL("content/journal/", root);
  for (const lang of readdirSync(journal)) {
    for (const f of readdirSync(new URL(`${lang}/`, journal))) {
      if (f.endsWith(".md")) keys.push(...entryKeys(readFileSync(new URL(`${lang}/${f}`, journal), "utf8")));
    }
  }
  return [...new Set(keys)].sort();
}

const env = process.env;
const [accountId, accessKeyId, secretAccessKey, bucket] = [
  env["R2_ACCOUNT_ID"],
  env["R2_ACCESS_KEY_ID"],
  env["R2_SECRET_ACCESS_KEY"],
  env["R2_BUCKET"],
];
const force = process.argv.includes("--force");
const keys = neededKeys();
const local = (key: string) => new URL(`.originals/${key}`, root);

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  const missing = keys.filter((k) => !existsSync(local(k)));
  console.log(
    `fetch-originals: no R2 credentials; ${keys.length - missing.length}/${keys.length} originals already local` +
      (missing.length ? " (the rest show as placeholders)" : ""),
  );
  process.exit(0);
}

const cfg: R2Config = { accountId, accessKeyId, secretAccessKey, bucket };
let downloaded = 0;
const failed: string[] = [];
for (const key of keys) {
  if (!force && existsSync(local(key))) continue;
  try {
    const bytes = await getObject(cfg, key);
    mkdirSync(dirname(fileURLToPath(local(key))), { recursive: true });
    writeFileSync(local(key), bytes);
    downloaded++;
  } catch (err) {
    failed.push(`${key}: ${(err as Error).message}`);
  }
}
console.log(
  `fetch-originals: ${keys.length} needed, ${downloaded} downloaded, ${keys.length - downloaded - failed.length} cached`,
);
if (failed.length) {
  // A missing original is not fatal (the pages fall back to the placeholder), but say which.
  console.warn(`fetch-originals: could not fetch ${failed.length}:\n  ${failed.join("\n  ")}`);
}
