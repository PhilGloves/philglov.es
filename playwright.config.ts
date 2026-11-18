import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the built site served by the real Worker
 * (`wrangler dev`, local D1/R2). Run `pnpm build:fixtures` first: the suites run on the test fixtures, never on the
 * owner's content (decision 0033; global-setup.ts refuses any other build). The owner's own build has its smoke test
 * and the launch gate in playwright.site.config.ts (`pnpm test:site`, `pnpm test:launch`).
 *
 * Projects (TICKETS.md, ticket Q; the QA matrix is in docs/qa/README.md):
 *  - chromium, chromium-no-js: every suite, JavaScript on and off. This is `pnpm test:e2e` and what CI runs.
 *  - firefox, webkit: the smoke subset in cross-browser.spec.ts (`pnpm test:cross`).
 *  - visual: full-page screenshots against baselines kept in tests/e2e/__screenshots__ (`pnpm test:visual`). The
 *    baselines are per operating system, so they run where they were made.
 *
 * `QA_PROD=1` serves the build the way production does (`pnpm qa:production` builds with SITE_ENV=production first):
 * no noindex, so the SEO suite can prove no page is indexable by accident.
 */
const port = 8787;
const production = process.env["QA_PROD"] === "1";
const notDefault = /(cross-browser|visual|launch|live)\.spec\.ts$/;
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  // The runner has 4 CPUs; most of the QA matrix's time is waiting (pauses a person takes, network quiet), so use all 4.
  ...(process.env["CI"] ? { workers: 4 } : {}),
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}-{platform}/{testFilePath}/{arg}{ext}",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "chromium", testIgnore: [notDefault], use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-no-js",
      testIgnore: [notDefault],
      use: { ...devices["Desktop Chrome"], javaScriptEnabled: false },
    },
    { name: "firefox", testMatch: /cross-browser\.spec\.ts$/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /cross-browser\.spec\.ts$/, use: { ...devices["Desktop Safari"] } },
    { name: "visual", testMatch: /visual\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: production ? "pnpm preview --var SITE_ENV:production" : "pnpm preview",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
