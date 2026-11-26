/**
 * Downloads the photo originals the site needs, and the CV site.json names, from the private R2 bucket the
 * builds read (R2_BUCKET: philglov-originals-staging until launch, then
 * philglov-originals, decision 0031) into the git-ignored src/.originals/, so Astro can
 * optimise them as local files. Files already there are skipped (a laptop
 * keeps them). CI never caches them, so every run downloads them all: in a
 * public repository a fork's pull request can read main's Actions caches, and
 * originals are full size and may carry GPS (decision 0030).
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Without credentials (a laptop, a fork) it does nothing and exits 0: the
 * pages then draw the tone placeholders. With credentials, a photo it cannot
 * fetch stops the build (scripts/lib/fetch-originals.ts, final review T1B-01).
 * `--force` downloads everything again.
 * RAW files never leave the owner's drives; the bucket holds JPEG/PNG only.
 */
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contentKeys } from "./lib/photo-keys.ts";
import { isStandIn } from "./lib/standins.ts";
import { fetchOriginals, fetchSummary } from "./lib/fetch-originals.ts";
import type { R2Config } from "./lib/r2.ts";

const root = new URL("../src/", import.meta.url);

const env = process.env;
const [accountId, accessKeyId, secretAccessKey, bucket] = [
  env["R2_ACCOUNT_ID"],
  env["R2_ACCESS_KEY_ID"],
  env["R2_SECRET_ACCESS_KEY"],
  env["R2_BUCKET"],
];
const force = process.argv.includes("--force");
const keys = contentKeys(new URL("content/", root));
const local = (key: string) => new URL(`.originals/${key}`, root);
// A grey stand-in from a build with ALLOW_MISSING_ORIGINALS=1 is not an original: it is replaced like a missing file.
const have = (key: string) => existsSync(local(key)) && !isStandIn(fileURLToPath(new URL(".originals/", root)), key);

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  const missing = keys.filter((k) => !have(k));
  console.log(
    `fetch-originals: no R2 credentials; ${keys.length - missing.length}/${keys.length} originals already local` +
      (missing.length ? " (the rest show as placeholders)" : ""),
  );
  process.exit(0);
}

const cfg: R2Config = { accountId, accessKeyId, secretAccessKey, bucket };
const report = await fetchOriginals(
  cfg,
  keys,
  have,
  (key, bytes, modified) => {
    mkdirSync(dirname(fileURLToPath(local(key))), { recursive: true });
    writeFileSync(local(key), bytes);
    // The file keeps R2's date: /cv shows it as "Last updated" (decision 0046).
    if (modified) utimesSync(local(key), modified, modified);
  },
  force,
);
const { lines, code } = fetchSummary(report, bucket);
for (const line of lines) (code ? console.error : console.log)(line);
process.exit(code);
