/**
 * Machine translation of one Markdown file into its twin.
 * Owned by the content agent (TICKETS.md, C3): `pnpm translate <path>`
 * reads the file, sends the body to the translation API (key from a
 * git-ignored .env locally, GitHub secrets in CI), and writes the twin in
 * the other language folder with `translation: machine`.
 *
 * Until C3 lands this throws NotImplemented, and the CI job reports the
 * missing twin as a warning instead of failing.
 */
export class NotImplemented extends Error {}

export async function translateFile(path: string): Promise<string> {
  throw new NotImplemented(`cannot translate ${path}: scripts/translate.ts is not implemented yet (TICKETS.md, C3)`);
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: pnpm translate <path/to/file.md>");
    process.exit(2);
  }
  console.log(await translateFile(path));
}
