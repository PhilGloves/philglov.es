/**
 * Entry photographs that are not in src/.originals (BUG-6, decision 0028).
 *
 * A photograph in a journal entry is a Markdown image that points at src/.originals/<key>; Astro stops the build with
 * "ImageNotFound" when the file is missing. The originals come from the private R2 bucket (scripts/fetch-originals.ts),
 * which a laptop without the R2_* variables cannot read. So:
 *   - by default a missing original FAILS the build, naming the files (on GitHub this is what must happen: the originals
 *     are fetched there, so a missing one is a mistake to see, never to ship);
 *   - with ALLOW_MISSING_ORIGINALS=1 on a local machine the build goes on with a plain grey stand-in at each missing
 *     path and prints a warning naming the files. The stand-ins are listed with their hash in src/.originals/.standins.json,
 *     are never taken for originals (fetch-originals replaces them, photo-meta ignores them) and are removed when the
 *     build ends or when the next one starts.
 * The opt-in is refused when CI or GITHUB_ACTIONS is set.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

export const OPT_IN = "ALLOW_MISSING_ORIGINALS";
const MANIFEST = ".standins.json";

type Env = Record<string, string | undefined>;
type Manifest = Record<string, string>;

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const manifestPath = (root: string): string => join(root, MANIFEST);

function readManifest(root: string): Manifest {
  return existsSync(manifestPath(root)) ? (JSON.parse(readFileSync(manifestPath(root), "utf8")) as Manifest) : {};
}

/** True when the file at `key` is one of our stand-ins, still unchanged (a real original put over it is not). */
export function isStandIn(root: string, key: string): boolean {
  const file = join(root, key);
  const recorded = readManifest(root)[key];
  return recorded !== undefined && existsSync(file) && sha(readFileSync(file)) === recorded;
}

/** Deletes the stand-ins that are still unchanged, and the manifest. Returns the keys it removed. */
export function removeStandIns(root: string): string[] {
  const removed: string[] = [];
  for (const key of Object.keys(readManifest(root))) {
    if (isStandIn(root, key)) {
      rmSync(join(root, key));
      removed.push(key);
    }
  }
  rmSync(manifestPath(root), { force: true });
  return removed;
}

/** The grey picture drawn in place of a missing original: 3:2, no detail. */
export const standInImage = (): Promise<Buffer> =>
  sharp({ create: { width: 1600, height: 1067, channels: 3, background: "#d6d5cd" } })
    .jpeg({ quality: 60 })
    .toBuffer();

export interface OriginalsCheck {
  /** Keys that were missing. */
  missing: string[];
  /** The warning to print when stand-ins were used. */
  warning: string | undefined;
}

export async function checkOriginals(root: string, keys: readonly string[], env: Env): Promise<OriginalsCheck> {
  removeStandIns(root); // a leftover of an earlier, interrupted build is not an original
  const missing = [...new Set(keys)].filter((key) => !existsSync(join(root, key))).sort();
  if (missing.length === 0) return { missing, warning: undefined };

  const many = missing.length === 1 ? "" : "s";
  const list = missing.map((key) => `  src/.originals/${key}`).join("\n");
  const ci = Boolean(env["CI"] || env["GITHUB_ACTIONS"]);
  if (env[OPT_IN] !== "1" || ci) {
    throw new Error(
      `${missing.length} photograph${many} used by journal entries ${many ? "are" : "is"} not in src/.originals:\n${list}\n` +
        (ci && env[OPT_IN] === "1"
          ? `${OPT_IN}=1 is for a local build and is refused on CI: fetch the originals (the R2_* secrets) instead.`
          : `Fetch them with "pnpm photos:fetch" (needs the R2_* variables, docs/setup.md), or, for a local build only,\n` +
            `build with ${OPT_IN}=1 to draw a grey stand-in in their place.`),
    );
  }

  const image = await standInImage();
  const manifest: Manifest = {};
  for (const key of missing) {
    mkdirSync(dirname(join(root, key)), { recursive: true });
    writeFileSync(join(root, key), image);
    manifest[key] = sha(image);
  }
  writeFileSync(manifestPath(root), `${JSON.stringify(manifest, null, 1)}\n`);
  return {
    missing,
    warning:
      `WARNING: ${OPT_IN}=1: ${missing.length} photograph${many} missing from src/.originals, drawn as a grey stand-in. ` +
      `This build is for looking at on this machine, never for publishing:\n${list}`,
  };
}
