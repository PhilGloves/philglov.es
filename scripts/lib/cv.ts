/**
 * The CV behind /cv (decision 0046). The PDF is never in the repository: src/data/site.json names its key in the
 * originals bucket, scripts/fetch-originals.ts downloads it like a photo original, and the build publishes it only
 * when it is there. Node only: astro.config.ts and the build scripts read it.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import site from "../../src/data/site.json" with { type: "json" };
import { CV_PDF } from "../../worker/src/headers.ts";
import { getObject, type R2Config } from "./r2.ts";

/** The key site.json names, or undefined while it names no CV. */
export const cvKey: string | undefined = (site as { cv?: { file?: string } | null }).cv?.file;

export interface CvInfo {
  path: string;
  size: number;
  /** ISO date and time the file was last stored in the bucket (fetch-originals keeps it on the file). */
  modified: string;
}

/** The fetched CV, or undefined when none is named or it is not there (a fork, a laptop without R2 keys). */
export function cvInfo(originals: string, key: string | undefined = cvKey): CvInfo | undefined {
  if (!key) return undefined;
  const path = join(originals, key);
  if (!existsSync(path)) return undefined;
  const { size, mtime } = statSync(path);
  return { path, size, modified: mtime.toISOString() };
}

/** Downloads the CV straight to its published place in dist/ (the deploy jobs, whose artifact leaves it out). */
export async function putCvInDist(cfg: R2Config, key: string, dist: URL): Promise<void> {
  const bytes = await getObject(cfg, key);
  const target = new URL(`.${CV_PDF}`, dist);
  mkdirSync(new URL("./", target), { recursive: true });
  writeFileSync(target, bytes);
}
