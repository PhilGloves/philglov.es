/**
 * `pnpm qa [runs]`        the whole local QA run (docs/qa/README.md): the site's own build and the empty site, each with
 *                         its smoke test, then the test build (fixtures, decision 0033): html-validate, unit, Worker, the
 *                         e2e matrix in Chromium (JavaScript on and off) `runs` times (default 3), Firefox and WebKit.
 * `pnpm qa:production`    builds the fixtures with SITE_ENV=production and runs the SEO and rights suites and the
 *                         Lighthouse SEO floor against it, then the site's own production build and the launch gate, then
 *                         rebuilds the normal test build, so dist/ is never left in production mode.
 *
 * It refuses to start while something already answers on 127.0.0.1:8787: Playwright would reuse that server, and a
 * stale one (an older build, another checkout) gives failures that are not the site's.
 */
import { spawnSync } from "node:child_process";

const mode = process.argv[2] === "production" ? "production" : "local";
const runs = mode === "local" ? Number(process.argv[2] ?? 3) || 3 : 1;

const alive = await fetch("http://127.0.0.1:8787/", { signal: AbortSignal.timeout(1500) }).then(
  () => true,
  () => false,
);
if (alive) {
  console.error("qa: something already answers on 127.0.0.1:8787. Stop it first (a stale server would be reused).");
  process.exit(2);
}

const failed: string[] = [];
function step(name: string, command: string, args: string[], env: Record<string, string> = {}): boolean {
  console.log(`\n=== ${name}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) failed.push(name);
  return result.status === 0;
}

if (mode === "production") {
  if (step("test build (SITE_ENV=production)", "pnpm", ["build:fixtures"], { SITE_ENV: "production" })) {
    step(
      "seo, rights on the production test build",
      "pnpm",
      ["exec", "playwright", "test", "--project=chromium", "tests/e2e/qa/seo.spec.ts", "tests/e2e/qa/rights.spec.ts"],
      { QA_PROD: "1" },
    );
    // Lighthouse SEO needs the production build (staging says noindex): the floor is 95 on the worst of 3 runs per page.
    step("lighthouse seo floor on the production test build", "pnpm", ["test:lighthouse:seo"]);
  }
  if (step("site build (SITE_ENV=production)", "pnpm", ["build"], { SITE_ENV: "production" }))
    step("launch gate on the site's production build", "pnpm", ["test:launch"], { QA_PROD: "1" });
  step("rebuild the normal test build", "pnpm", ["build:fixtures"]);
} else {
  if (step("site build", "pnpm", ["build"])) {
    step("html-validate (site)", "pnpm", ["validate:html"]);
    step("site smoke test", "pnpm", ["test:site"]);
  }
  if (step("empty site build", "pnpm", ["build:fixtures", "empty"]))
    step("empty site smoke test", "pnpm", ["test:site"]);
  step("test build", "pnpm", ["build:fixtures"]);
  step("html-validate", "pnpm", ["validate:html"]);
  step("unit tests", "pnpm", ["test:unit"]);
  step("Worker tests", "pnpm", ["test:worker"]);
  for (let i = 1; i <= runs; i++)
    step(`e2e matrix, run ${i} of ${runs} (chromium + chromium-no-js)`, "pnpm", ["test:e2e"]);
  step("firefox + webkit smoke", "pnpm", ["test:cross"]);
}

console.log(failed.length ? `\nqa: FAILED: ${failed.join("; ")}` : "\nqa: every step passed");
process.exit(failed.length ? 1 : 0);
