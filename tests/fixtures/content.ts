/**
 * The test fixtures (decision 0033). The suites are built from tests/fixtures/content (`pnpm build:fixtures`), never
 * from the owner's content in src/content, so an entry the owner writes, edits or deletes cannot make a test fail.
 * Tests that read the content files read them here.
 */
import { existsSync } from "node:fs";

/** The fixtures' content folder: journal/, pages/, photos/ (mirrors src/content). */
export const fixtureContent = new URL("content/", import.meta.url);
export const fixtureJournal = new URL("journal/", fixtureContent);
export const fixturePages = new URL("pages/", fixtureContent);

const dist = new URL("../../dist/", import.meta.url);

/**
 * Throws, with what to do, unless dist/ is the fixture build: a fixture entry and the fixture series are there. The
 * suites that read or serve dist/ call it first, so running them on the site's own build (`pnpm build`) says so at once
 * instead of failing in a hundred unrelated ways.
 */
export function assertFixtureBuild(): void {
  for (const file of ["lisbona.html", "it/lisbona.html", "photos/lisbon.html"])
    if (!existsSync(new URL(file, dist)))
      throw new Error(
        `dist/ is not the test build (no dist/${file}). The suites run against the fixtures: ` +
          "run `pnpm build:fixtures` first (decision 0033). `pnpm build` builds the owner's site, " +
          "which `pnpm test:site` checks.",
      );
}
