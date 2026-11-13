/**
 * /admin/write in a browser, with JavaScript on and off (decision 0021), against the real Worker
 * (tests/e2e/admin-worker.ts: test Access, GitHub and R2 stand-ins): the list of published entries, editing one with
 * its slug and language fixed, saving it (one file, auto-merge), and the publisher's pull requests still open.
 */
import { expect, test } from "@playwright/test";
import { serveAdmin, type Admin } from "./admin-worker.ts";

let consoleNoise: string[] = [];
let admin: Admin;

test.beforeEach(async ({ page }) => {
  consoleNoise = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") consoleNoise.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleNoise.push(`pageerror: ${err.message}`));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  admin = await serveAdmin();
});

test.afterEach(async () => {
  await admin.close();
  expect(consoleNoise).toEqual([]);
});

const LISBON = "[Placeholder] Three weeks in Lisbon";

test("the list of published entries opens one in the same form, slug and language fixed", async ({ page }) => {
  await page.goto(`${admin.origin}/admin/write`);
  const list = page.locator("[data-entries]");
  await expect(list.getByRole("link", { name: LISBON })).toBeVisible();
  // Newest first.
  const dates = await list.locator(".fine").allTextContents();
  expect(dates.map((d) => d.slice(0, 10))).toEqual([...dates.map((d) => d.slice(0, 10))].sort().reverse());

  await list.getByRole("link", { name: LISBON }).click();
  await page.waitForURL(/\/admin\/write\?edit=1&slug=lisbona&lang=en$/);
  await expect(page.getByRole("heading", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.locator("#w-title")).toHaveValue(LISBON);
  await expect(page.locator('input[name="tags"][value="travel"]')).toBeChecked();
  await expect(page.locator('input[name="tags"][value="photography"]')).toBeChecked();
  await expect(page.locator("#w-body")).toHaveValue(/^\[Placeholder text in English/);
  await expect(page.locator("#w-slug")).toHaveValue("lisbona");
  await expect(page.locator("#w-slug")).toHaveAttribute("readonly", "");
  await expect(page.locator("select#w-lang")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Language: English");
  // Typing in the fixed slug changes nothing.
  await page.locator("#w-slug").press("End");
  await page.keyboard.type("-new");
  await expect(page.locator("#w-slug")).toHaveValue("lisbona");
});

test("the search finds entries by title, in either language", async ({ page }) => {
  await page.goto(`${admin.origin}/admin/write`);
  await page.fill("#e-q", "lisbona");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/\?q=lisbona#published-entries$/);
  const links = page.locator("[data-entries] h3 a");
  await expect(links).toHaveText(["[Segnaposto] Tre settimane a Lisbona"]);
});

test("Save changes: one file, the version opened, auto-merge, and the link to where it will be live", async ({
  page,
}) => {
  await page.goto(`${admin.origin}/admin/write?edit=1&slug=lisbona&lang=en`);
  await page.fill("#w-desc", "A new description, written on the phone.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#published")).toContainText("Your changes will be live in a few minutes at /lisbona.");
  await expect(page.getByRole("link", { name: "/lisbona" })).toHaveAttribute("href", "/lisbona");
  await expect(page.getByRole("link", { name: "the pull request" })).toHaveAttribute(
    "href",
    "https://github.com/test/repo/pull/99",
  );
  const writes = admin.github.calls.filter((c) => c.method === "PUT");
  expect(writes.map((c) => c.path)).toEqual([
    "/repos/PhilGloves/philglov.es/contents/src/content/journal/en/lisbona.md",
  ]);
  expect(writes[0]?.body?.["sha"]).toMatch(/^[0-9a-f]{40}$/);
  const text = Buffer.from(String(writes[0]?.body?.["content"]), "base64").toString("utf8");
  expect(text).toContain('description: "A new description, written on the phone."');
  expect(text).toContain("date: 2026-10-21\nlang: en\noriginalLang: it\n");
  expect(admin.github.calls.some((c) => c.path === "/graphql")).toBe(true);
});

test("the publisher's open pull requests: going live, then needing attention after 15 minutes", async ({ page }) => {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  admin.github.pulls = [
    {
      html_url: "https://github.com/x/y/pull/7",
      title: "Edit en/lisbona: Lisbon",
      created_at: ago(16),
      user: { login: "philglov-publisher[bot]" },
    },
    {
      html_url: "https://github.com/x/y/pull/8",
      title: "New entry en/lago: Lago",
      created_at: ago(1),
      user: { login: "philglov-publisher[bot]" },
    },
  ];
  await page.goto(`${admin.origin}/admin/write`);
  const late = page.locator('[data-publication="attention"]');
  await expect(late.getByRole("link", { name: "Edit en/lisbona: Lisbon" })).toHaveAttribute(
    "href",
    "https://github.com/x/y/pull/7",
  );
  await expect(late).toContainText("needs attention");
  await expect(late).toContainText("Still not merged after 15 minutes.");
  await expect(page.locator('[data-publication="pending"]')).toContainText("going live");
});
