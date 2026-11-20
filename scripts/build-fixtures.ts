/**
 * `pnpm build:fixtures`: the build the test suites run against (decision 0033). The same `pnpm build`, reading
 * tests/fixtures/content and the generated originals in tests/fixtures/.originals instead of the owner's content
 * (SITE_CONTENT=fixtures, scripts/lib/content-root.ts). `pnpm build:fixtures empty` builds the site with no entry and
 * no photo series instead (SITE_CONTENT=empty), for the smoke test of an empty site. SITE_ENV passes through, so
 * `SITE_ENV=production pnpm build:fixtures` is the production-mode test build. What is deployed is always `pnpm build`.
 */
import { spawnSync } from "node:child_process";

const set = process.argv[2] === "empty" ? "empty" : "fixtures";
const env = { ...process.env, SITE_CONTENT: set };
// A fixed command line through the shell: pnpm is a .cmd file on Windows, which only a shell can start.
const run = (command: string) => {
  const result = spawnSync(command, { env, stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (set === "fixtures") run("node scripts/fixture-photos.ts");
run("pnpm build");
