import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the built site served by the real Worker
 * (`wrangler dev`, local D1/R2). Run `pnpm build` first.
 * The QA agent expands this into the full matrix (TICKETS.md, Q1–Q15).
 */
const port = 8787;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-no-js", use: { ...devices["Desktop Chrome"], javaScriptEnabled: false } },
  ],
  webServer: {
    command: "pnpm preview",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
