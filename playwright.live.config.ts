import { defineConfig, devices } from "@playwright/test";

/**
 * Suite 15: the checks of tests/e2e/qa/live.spec.ts against a deployed site (`pnpm test:live`). No local server.
 * Staging is behind Cloudflare Access, so a service token goes in every request (docs/setup.md); after launch,
 * LIVE_URL=https://philglov.es needs none.
 */
const base = process.env["LIVE_URL"];
if (!base) throw new Error("Set LIVE_URL, e.g. https://philglov-staging.philglov-es.workers.dev");
const id = process.env["CF_ACCESS_CLIENT_ID"];
const secret = process.env["CF_ACCESS_CLIENT_SECRET"];

export default defineConfig({
  testDir: "tests/e2e/qa",
  testMatch: /live\.spec\.ts$/,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: base.replace(/\/$/, ""),
    extraHTTPHeaders: id && secret ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret } : {},
  },
});
