/**
 * Runs before `astro build`: every photograph a journal entry shows must be in src/.originals, or the build says which
 * are not (and stops), or, with ALLOW_MISSING_ORIGINALS=1 on a local machine, builds with a stand-in and a warning.
 * See scripts/lib/standins.ts (BUG-6, decision 0028).
 */
import { collectionDir, originalsPath } from "./lib/content-root.ts";
import { journalPhotoKeys } from "./lib/photo-keys.ts";
import { checkOriginals } from "./lib/standins.ts";

const keys = journalPhotoKeys(collectionDir("journal"));

try {
  const { missing, warning } = await checkOriginals(originalsPath, keys, process.env);
  if (warning) console.warn(warning);
  else console.log(`check-originals: ${new Set(keys).size} entry photographs, ${missing.length} missing`);
} catch (error) {
  console.error(`check-originals: ${(error as Error).message}`);
  process.exit(1);
}
