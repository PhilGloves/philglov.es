/**
 * The launch copy of the photo originals, from the staging bucket to production's (decision 0031, docs/setup.md
 * step 12b; the command is scripts/copy-originals.ts). Until launch every photo is uploaded on staging; from launch
 * the builds read production's bucket, so it must hold every original the content uses.
 *
 * - Only what the content uses is copied, under the same key, with the same bytes and type. What staging holds besides
 *   (a draft's photos, test uploads) is listed as `unused` and left there.
 * - It never writes over an object production has: one with the same bytes counts as `already`, one with other bytes
 *   as `different`, and both stay as they are. So it can run again: the second run copies nothing.
 * - Every copy is checked: the download against the original's size and MD5, the stored copy against the download.
 * - A failure on one key is reported and the others go on; the command fails when anything is missing, different or
 *   failed.
 */
import { createHash } from "node:crypto";
import { getObject, headObject, listKeys, putObject, type ObjectHead, type R2Config } from "./r2.ts";

export interface CopyReport {
  /** Copied now. */
  copied: string[];
  /** In production already, with the same bytes (or only there). */
  already: string[];
  /** Used by the content, in neither bucket. */
  missing: string[];
  /** In production with other bytes: left as it is. */
  different: string[];
  /** "key: what went wrong". */
  failed: string[];
  /** In staging, used by no content: not copied. */
  unused: string[];
  /** Why staging could not be listed, when it could not (the copy itself is unaffected). */
  unlisted?: string;
}

const md5 = (bytes: Uint8Array): string => createHash("md5").update(bytes).digest("hex");
/** An ETag that is the MD5 of the bytes (one-piece objects); multipart ETags end in "-<parts>". */
const isMd5 = (etag: string): boolean => /^[0-9a-f]{32}$/.test(etag);

/** Whether production's object holds the same bytes as staging's: by size and ETag, or, when those cannot tell, by MD5. */
async function same(from: R2Config, to: R2Config, key: string, source: ObjectHead, target: ObjectHead) {
  if (source.size !== target.size) return false;
  if (source.etag === target.etag) return true;
  const [a, b] = await Promise.all([getObject(from, key), getObject(to, key)]);
  return md5(a) === md5(b);
}

export async function copyOriginals(
  keys: string[],
  from: R2Config,
  to: R2Config,
  say: (line: string) => void = () => {},
): Promise<CopyReport> {
  const report: CopyReport = { copied: [], already: [], missing: [], different: [], failed: [], unused: [] };
  for (const key of keys) {
    try {
      const [source, target] = await Promise.all([headObject(from, key), headObject(to, key)]);
      if (target) {
        if (!source || (await same(from, to, key, source, target))) report.already.push(key);
        else report.different.push(key);
        continue;
      }
      if (!source) {
        report.missing.push(key);
        continue;
      }
      const bytes = await getObject(from, key);
      const hash = md5(bytes);
      if (bytes.length !== source.size || (isMd5(source.etag) && hash !== source.etag))
        throw new Error("the download does not match the original in staging; nothing was stored");
      await putObject(to, key, bytes, source.contentType);
      const stored = await headObject(to, key);
      if (!stored || stored.size !== bytes.length || (isMd5(stored.etag) && stored.etag !== hash))
        throw new Error("production does not hold the same bytes after the copy");
      report.copied.push(key);
      say(`copied ${key}`);
    } catch (error) {
      report.failed.push(`${key}: ${(error as Error).message}`);
    }
  }
  try {
    const used = new Set(keys);
    report.unused = (await listKeys(from, "")).filter((k) => !used.has(k)).sort();
  } catch (error) {
    report.unlisted = (error as Error).message;
  }
  return report;
}
