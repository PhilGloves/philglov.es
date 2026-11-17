/**
 * node scripts/copy-originals.ts
 *
 * Once, at launch (docs/setup.md step 12b, decision 0031): copies every photo original the content of this checkout
 * uses from philglov-originals-staging to philglov-originals, and checks that production then has them all. Run it on
 * up-to-date main. It never writes over an object in production and can run again; the logic is
 * scripts/lib/copy-originals.ts, tested against a local R2 stand-in (tests/unit/copy-originals.test.ts).
 *
 * Least access: two R2 tokens made for this and deleted after it, one **Object Read only** on the staging bucket, one
 * **Object Read & Write** on the production bucket only. Their values come from the environment, set for one
 * PowerShell window with Read-Host (setup.md), never from a file, and are never printed:
 *
 *   R2_ACCOUNT_ID
 *   R2_FROM_ACCESS_KEY_ID, R2_FROM_SECRET_ACCESS_KEY   the staging token (read)
 *   R2_TO_ACCESS_KEY_ID,   R2_TO_SECRET_ACCESS_KEY     the production token (read and write)
 */
import { spawnSync } from "node:child_process";
import { copyOriginals } from "./lib/copy-originals.ts";
import { contentKeys } from "./lib/photo-keys.ts";
import type { R2Config } from "./lib/r2.ts";

const FROM = "philglov-originals-staging";
const TO = "philglov-originals";
const NAMES = [
  "R2_ACCOUNT_ID",
  "R2_FROM_ACCESS_KEY_ID",
  "R2_FROM_SECRET_ACCESS_KEY",
  "R2_TO_ACCESS_KEY_ID",
  "R2_TO_SECRET_ACCESS_KEY",
] as const;

const env = process.env;
const unset = NAMES.filter((name) => !env[name]);
if (unset.length) {
  console.error(`copy-originals: set ${unset.join(", ")} first, in this window only (docs/setup.md, step 12b).`);
  process.exit(2);
}
const value = (name: (typeof NAMES)[number]) => env[name] ?? "";
if (value("R2_FROM_ACCESS_KEY_ID") === value("R2_TO_ACCESS_KEY_ID"))
  console.warn(
    "copy-originals: the same token for both buckets has more access than the copy needs; make the two of step 12b.",
  );
const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout?.trim();
if (branch !== "main")
  console.warn(`copy-originals: this checkout is on "${branch || "?"}", not main: it copies what this content uses.`);

const config = (bucket: string, id: string, secret: string): R2Config => ({
  accountId: value("R2_ACCOUNT_ID"),
  accessKeyId: id,
  secretAccessKey: secret,
  bucket,
});
const from = config(FROM, value("R2_FROM_ACCESS_KEY_ID"), value("R2_FROM_SECRET_ACCESS_KEY"));
const to = config(TO, value("R2_TO_ACCESS_KEY_ID"), value("R2_TO_SECRET_ACCESS_KEY"));

const keys = contentKeys(new URL("../src/", import.meta.url));
console.log(`copy-originals: the content uses ${keys.length} originals; copying from ${FROM} to ${TO}.`);
const report = await copyOriginals(keys, from, to, (line) => console.log(`  ${line}`));

const list = (title: string, items: string[]) => {
  if (items.length) console.log(`${title} (${items.length}):\n  ${items.join("\n  ")}`);
};
console.log(`Copied now: ${report.copied.length}. Already in ${TO}: ${report.already.length}.`);
list(`MISSING: used by the content, in neither bucket`, report.missing);
list(`DIFFERENT: ${TO} has other bytes under this name; left as it is`, report.different);
list("FAILED", report.failed);
list(`Not copied: in ${FROM}, used by no entry or series (drafts, test uploads)`, report.unused);
if (report.unlisted) console.log(`(Could not list ${FROM}: ${report.unlisted}. The copy is not affected.)`);

const problems = report.missing.length + report.different.length + report.failed.length;
if (problems) {
  console.error(
    `copy-originals: ${problems} problem${problems === 1 ? "" : "s"} above. Fix them, then run this again: ` +
      "what is already copied is skipped.",
  );
  process.exit(1);
}
console.log(`copy-originals: all ${keys.length} originals the content uses are in ${TO}.`);
