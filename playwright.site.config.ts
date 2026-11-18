import { defineConfig, devices } from "@playwright/test";

/**
 * The checks of the site's own build: the owner's content, which is what is deployed (decision 0033). Run after
 * `pnpm build` (never `pnpm build:fixtures`; the suites in playwright.config.ts run on that one).
 *  - smoke: tests/site/smoke.spec.ts, every page of whatever the owner has written (`pnpm test:site`, with the photo
 *    rights check). CI runs it in both scopes, so a phone publish waits for it.
 *  - launch: the launch gate, tests/e2e/qa/launch.spec.ts (`pnpm test:launch`): fails until the owner has answered O1.
 *
 * `QA_PROD=1` serves the build the way production does (with a SITE_ENV=production build).
 */
const port = 8787;
const production = process.env["QA_PROD"] === "1";

export default defineConfig({
  forbidOnly: !!process.env["CI"],
  retries: 0,
  ...(process.env["CI"] ? { workers: 4 } : {}),
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "smoke", testDir: "tests/site", use: { ...devices["Desktop Chrome"] } },
    {
      name: "launch",
      testDir: "tests/e2e/qa",
      testMatch: /launch\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: production ? "pnpm preview --var SITE_ENV:production" : "pnpm preview",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
