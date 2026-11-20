/**
 * Which content a build reads (decision 0033), chosen by SITE_CONTENT:
 *
 *   (unset)    the site: the owner's content in src/content, photo originals in src/.originals (fetched from R2).
 *              This is the only build that is ever deployed.
 *   fixtures   what the test suites run against: tests/fixtures/content, with small generated originals in
 *              tests/fixtures/.originals (scripts/fixture-photos.ts; no R2).
 *   empty      the site with no journal entry and no photo series (the fixture pages only), to prove it works empty.
 *
 * `pnpm build:fixtures [empty]` sets it; nothing else does. The fixtures mirror the layout of `src`: an entry's photo
 * is `../../../.originals/<key>` from its file in both trees.
 */
import { fileURLToPath } from "node:url";

export const CONTENT_SETS = ["site", "fixtures", "empty"] as const;
export type ContentSet = (typeof CONTENT_SETS)[number];

const chosen = process.env["SITE_CONTENT"] ?? "site";
if (!(CONTENT_SETS as readonly string[]).includes(chosen))
  throw new Error(`SITE_CONTENT is "${chosen}"; it must be unset, "fixtures" or "empty" (decision 0033)`);
export const CONTENT_SET = chosen as ContentSet;

/** Repository-relative folders of each collection and of the originals. */
const FOLDERS: Record<ContentSet, Record<"journal" | "pages" | "photos" | "originals", string>> = {
  site: {
    journal: "src/content/journal",
    pages: "src/content/pages",
    photos: "src/content/photos",
    originals: "src/.originals",
  },
  fixtures: {
    journal: "tests/fixtures/content/journal",
    pages: "tests/fixtures/content/pages",
    photos: "tests/fixtures/content/photos",
    originals: "tests/fixtures/.originals",
  },
  empty: {
    journal: "tests/fixtures/empty/journal",
    pages: "tests/fixtures/content/pages",
    photos: "tests/fixtures/empty/photos",
    originals: "tests/fixtures/empty/.originals",
  },
};

export const folders = FOLDERS[CONTENT_SET];

const repo = new URL("../../", import.meta.url);

/** A collection's folder, as a URL ending in "/". */
export const collectionDir = (name: "journal" | "pages" | "photos"): URL => new URL(`${folders[name]}/`, repo);
/** The photo originals and their meta.json. */
export const originalsDir = new URL(`${folders.originals}/`, repo);
/** The same folder as a file-system path, for Vite's alias and the scripts that take paths. */
export const originalsPath = fileURLToPath(originalsDir);
