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
  // Newest first, one row per entry (decision 0029).
  const dates = await list.locator(".fine").allTextContents();
  expect(dates.map((d) => d.slice(0, 10))).toEqual([...dates.map((d) => d.slice(0, 10))].sort().reverse());
  await expect(list.locator('[data-entry="lisbona"]')).toHaveCount(1);

  await list.getByRole("link", { name: LISBON }).click();
  await page.waitForURL(/\/admin\/write\?edit=1&slug=lisbona&lang=en$/);
  await expect(page.getByRole("heading", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.locator("#w-title")).toHaveValue(LISBON);
  await expect(page.locator('input[name="tags"]')).toHaveCount(0); // no topics (decision 0023)
  await expect(page.locator("#w-body")).toHaveValue(/^\[Placeholder text in English/);
  await expect(page.locator("#w-slug")).toHaveValue("lisbona");
  await expect(page.locator("#w-slug")).toHaveAttribute("readonly", "");
  await expect(page.locator("select#w-lang")).toHaveCount(0);
  // The language is the choice between the entry's two versions (0029).
  await expect(page.getByLabel("Language")).toHaveValue("en");
  await expect(page.locator("#w-version option")).toHaveText(["English · published", "Italiano · published"]);
  // Typing in the fixed slug changes nothing.
  await page.locator("#w-slug").press("End");
  await page.keyboard.type("-new");
  await expect(page.locator("#w-slug")).toHaveValue("lisbona");
});

// Decision 0037: one Enter is a new line in the published entry. The page says so, and how to write a link, right
// under the text box, where it can be read without opening the cheat sheet.
test("two lines under the text box say how to start a new line and write a link, with the cheat sheet closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${admin.origin}/admin/write`);
  const sheet = page.locator("details", { hasText: "Markdown cheat sheet" });
  await expect(sheet).toHaveJSProperty("open", false);
  const line = page.locator("#w-body-hint");
  const link = page.locator("#w-body-link");
  await expect(line).toBeVisible();
  await expect(line).toHaveText("Enter: new line. Empty line: new paragraph.");
  await expect(link).toBeVisible();
  await expect(link).toHaveText("Link: [words](https://address)");
  // Two lines, each on one line of a phone screen, between the text box and the cheat sheet.
  const box = async (locator: typeof line) => {
    const b = await locator.boundingBox();
    if (!b) throw new Error("not on the page");
    return b;
  };
  const [text, first, second, toggle] = [
    await box(page.locator("#w-body")),
    await box(line),
    await box(link),
    await box(sheet.locator("summary")),
  ];
  expect(first.y).toBeGreaterThanOrEqual(text.y + text.height);
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
  expect(toggle.y).toBeGreaterThanOrEqual(second.y + second.height);
  expect(first.height).toBeLessThan(30);
  expect(second.height).toBeLessThan(30);
  // A screen reader hears them with the text box, first. (What follows is the field's error slot, as on every field.)
  await expect(page.locator("#w-body")).toHaveAccessibleDescription(
    /^Enter: new line\. Empty line: new paragraph\. Link: \[words\]\(https:\/\/address\)/,
  );
  // The cheat sheet, opened, says the same.
  await sheet.locator("summary").click();
  await expect(sheet.locator("li").first()).toHaveText("Enter: new line. Empty line: new paragraph.");
  await expect(sheet.locator("li", { hasText: "Link:" })).toHaveText("Link: [words](https://address)");
});

test("the search finds entries by title, in either language", async ({ page }) => {
  await page.goto(`${admin.origin}/admin/write`);
  await page.fill("#e-q", "lisbona");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/\?q=lisbona#published-entries$/);
  // The one entry with that in a title, with both its versions.
  await expect(page.locator("[data-entries] > li")).toHaveCount(1);
  await expect(page.locator("[data-entries] a")).toHaveText([LISBON, "[Segnaposto] Tre settimane a Lisbona"]);
});

// Decision 0029: the other-language version is written from the entry, with its slug and its photos.
const FOTO_KEY = "foto/1000029179-9gp7.jpg";

test("a missing language is a link that opens its form: slug fixed, text empty, the same photos with hints", async ({
  page,
  javaScriptEnabled,
}) => {
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/admin/upload")) uploads.push(r.url());
  });
  await page.goto(`${admin.origin}/admin/write`);
  const row = page.locator('[data-entry="foto"]');
  await expect(row).toContainText("English: Foto");
  await row.getByRole("link", { name: "Write the Italian version" }).click();
  await page.waitForURL(/\/admin\/write\?edit=1&slug=foto&lang=it$/);
  await expect(page.getByRole("heading", { name: "Write the Italian version" })).toBeVisible();
  await expect(page.locator("#w-slug")).toHaveValue("foto");
  await expect(page.locator("#w-slug")).toHaveAttribute("readonly", "");
  for (const field of ["#w-title", "#w-desc", "#w-body"]) await expect(page.locator(field)).toHaveValue("");
  await expect(page.locator("#reference summary")).toHaveText("The English version, for reference");
  await expect(page.locator("#reference pre")).toContainText("lang: en");
  await expect(page.locator("#w-version option")).toHaveText(["English · published", "Italiano · not written yet"]);

  // The English photo, by its stored key; its alt text empty and required, the English one under it as a hint.
  await expect(page.locator('#photo-list input[name="photo_key"]')).toHaveCount(1);
  await expect(page.locator('#photo-list input[name="photo_key"]')).toHaveValue(FOTO_KEY);
  const alt = page.getByLabel("Alt text: what is in it and why it matters");
  await expect(alt).toHaveValue("");
  await expect(alt).toHaveAccessibleDescription("English version: Pinzette");
  await expect(page.locator('#photo-list [lang="en"]').first()).toHaveText("Pinzette");

  // Publish waits for the alt text, then writes one file with the same key and originalLang from the English.
  await page.fill("#w-title", "Foto, in italiano");
  await page.fill("#w-desc", "Una frase, scritta a mano.");
  await page.fill("#w-body", "Testo scritto a mano.");
  await page.getByRole("button", { name: "Publish" }).click();
  expect(await alt.evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
  await expect(page.locator("#published")).toHaveCount(0);
  expect(admin.github.calls.filter((c) => c.method === "PUT")).toEqual([]);
  await alt.fill("Pinzette su un tavolo");
  if (javaScriptEnabled) {
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("philglov-write:edit-it-foto")))
      .toContain("Pinzette su un tavolo");
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Restored what you typed" })).toBeVisible();
    await expect(alt).toHaveValue("Pinzette su un tavolo");
    await expect(alt).toHaveAccessibleDescription("English version: Pinzette");
  }
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("#published")).toBeVisible();
  const puts = admin.github.calls.filter((c) => c.method === "PUT");
  expect(puts.map((c) => c.path)).toEqual(["/repos/PhilGloves/philglov.es/contents/src/content/journal/it/foto.md"]);
  const text = Buffer.from(String(puts[0]?.body?.["content"]), "base64").toString("utf8");
  expect(text).toMatch(/^lang: it$/m);
  expect(text).toMatch(/^originalLang: en$/m);
  expect(text).toContain(`![Pinzette su un tavolo](../../../.originals/${FOTO_KEY})`);
  expect(uploads, "no photo uploaded again").toEqual([]);
  await expect(page.getByRole("link", { name: "Edit the English version" })).toHaveAttribute(
    "href",
    "/admin/write?edit=1&slug=foto&lang=en",
  );
});

test("switching language and back keeps what was typed", async ({ page, javaScriptEnabled }) => {
  await page.goto(`${admin.origin}/admin/write?edit=1&slug=foto&lang=it`);
  await page.fill("#w-title", "Titolo a metà");
  await page.fill("#w-body", "Un testo non ancora salvato.");
  await page.getByLabel("Alt text: what is in it and why it matters").fill("Pinzette");
  const to = async (lang: "en" | "it") => {
    // Without JavaScript the Switch button does it; with it, the change does, and the button is hidden.
    if (javaScriptEnabled) await expect(page.getByRole("button", { name: "Switch" })).toBeHidden();
    await page.getByLabel("Language").selectOption(lang);
    if (!javaScriptEnabled) await page.getByRole("button", { name: "Switch" }).click();
    await page.waitForURL(new RegExp(`/admin/write\\?edit=1&slug=foto&lang=${lang}(&kept=(en|it))?$`));
  };
  await to("en");
  await expect(page.locator("#w-title")).toHaveValue("Foto");
  await expect(page.getByLabel("Language")).toHaveValue("en");
  if (!javaScriptEnabled) await expect(page.getByText("What you typed in Italian is kept as a draft")).toBeVisible();

  await to("it");
  await expect(page.locator("#w-title")).toHaveValue("Titolo a metà");
  await expect(page.locator("#w-body")).toHaveValue("Un testo non ancora salvato.");
  const alt = page.getByLabel("Alt text: what is in it and why it matters");
  await expect(alt).toHaveValue("Pinzette");
  await expect(alt).toHaveAccessibleDescription("English version: Pinzette");
  await expect(page.locator("#w-slug")).toHaveValue("foto");
  await expect(page.getByRole("heading", { name: "Write the Italian version" })).toBeVisible();
  await expect(
    page.locator(".notice", {
      hasText: javaScriptEnabled ? "Restored what you typed in this browser" : "Opened your draft of this version",
    }),
  ).toBeVisible();
  // The English version was only looked at: nothing kept for it, no draft, nothing sent.
  const drafts = admin.db.prepare("SELECT lang FROM drafts").all() as { lang: string }[];
  expect(drafts.map((d) => d.lang)).toEqual(javaScriptEnabled ? [] : ["it"]);
  expect(admin.github.calls.filter((c) => c.method === "PUT")).toEqual([]);
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

// Final review T2-03: one entry, one pull request.
const newEntry = async (page: import("@playwright/test").Page) => {
  await page.goto(`${admin.origin}/admin/write`);
  await page.fill("#w-title", "A double tap");
  await page.fill("#w-slug", "a-double-tap");
  await page.fill("#w-desc", "One sentence.");
  await page.fill("#w-body", "Hello.");
};
const opened = () => admin.github.calls.filter((c) => c.method === "POST" && c.path.endsWith("/pulls"));

test("a double tap on Publish opens one pull request, and the page links to it", async ({
  page,
  javaScriptEnabled,
}) => {
  await newEntry(page);
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/admin/write")) posts += 1;
  });
  await page.getByRole("button", { name: "Publish" }).dblclick();
  // With JavaScript the second tap sends nothing; without it the Worker answers it with the first pull request.
  await expect(page.locator("#published")).toContainText("will be live in a few minutes at /a-double-tap.");
  await expect(page.getByRole("link", { name: "the pull request" })).toHaveAttribute(
    "href",
    "https://github.com/test/repo/pull/99",
  );
  expect(opened()).toHaveLength(1);
  expect(admin.github.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  // With JavaScript the second tap is not even sent.
  if (javaScriptEnabled) expect(posts).toBe(1);
});

test("Publish and Save draft are greyed out from the first tap, and the one pressed says it is sending", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "without JavaScript, the Worker's refusal is the protection (the test above)");
  // Playwright waits for a pending navigation before it reads a page, and the answer is held here on purpose: the
  // page notes its buttons in sessionStorage each time they change, and the next page of this origin reads it.
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const form = document.querySelector("#write-form");
      if (!form) return;
      const note = () =>
        sessionStorage.setItem(
          "buttons",
          JSON.stringify(
            ["publish", "save"].map((v) => {
              const b = form.querySelector<HTMLButtonElement>(`button[value="${v}"]`);
              return [b?.disabled, b?.textContent?.trim()];
            }),
          ),
        );
      new MutationObserver(note).observe(form, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
    });
  });
  await page.route(`${admin.origin}/admin/write`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await newEntry(page);
  await page.locator('button[value="publish"]').click();
  await expect(page.locator("#published")).toContainText("will be live in a few minutes at /a-double-tap.");
  expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem("buttons"))) ?? "null")).toEqual([
    [true, "Sending…"],
    [true, "Save draft"],
  ]);
  expect(opened()).toHaveLength(1);
});

test("reloading the Published page sends the form again: the answer is the same pull request", async ({ page }) => {
  await newEntry(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("h2.admin-title")).toHaveText("Published");
  // The browser asks whether to send the form again; the owner says yes.
  page.on("dialog", (d) => void d.accept());
  await page.reload();
  await expect(page.locator("h2.admin-title")).toHaveText("Already on its way");
  await expect(page.locator("#published")).toContainText("nothing was published twice");
  await expect(page.getByRole("link", { name: "the pull request" })).toHaveAttribute(
    "href",
    "https://github.com/test/repo/pull/99",
  );
  expect(opened()).toHaveLength(1);
});
