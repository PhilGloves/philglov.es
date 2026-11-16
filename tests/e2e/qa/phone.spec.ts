/**
 * QA suite 12: publishing from a phone (/admin/write), at 390 px with touch, against the real Worker behind a test
 * Access (tests/e2e/admin-worker.ts) with a GitHub stand-in that records every call.
 *  - without Access: 403 on the page, on the upload endpoint and on a POST;
 *  - every control can be tapped and reached from the keyboard, none is smaller than WCAG 2.2's 24 px target, the
 *    page does not scroll sideways;
 *  - a draft survives a reload (autosave in the browser) and a dropped connection; an upload that drops is retried;
 *  - a non-image renamed .jpg is refused; Publish opens a pull request and never touches main;
 *  - the other-language version of an existing entry is written to its own file with the right originalLang.
 */
import { expect, test, type Page } from "@playwright/test";
import { blockedOutbound, serveAdmin, type Admin } from "../admin-worker.ts";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, "the phone page's script is the point of these tests");

let admin: Admin;
let noise: string[] = [];

test.beforeEach(async ({ page }) => {
  noise = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") noise.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e.message}`));
  admin = await serveAdmin();
});
test.afterEach(async () => {
  await admin?.close();
});

const write = (page: Page) => page.goto(`${admin.origin}/admin/write`);

test("without Access the page, the upload and a post answer 403 (the real Worker, no token)", async ({
  request,
  baseURL,
}) => {
  for (const [method, path] of [
    ["GET", "/admin/write"],
    ["GET", "/admin/write/reference?slug=lisbona&lang=en"],
    ["PUT", "/admin/upload?slug=x&name=y"],
    ["POST", "/admin/write"],
    ["POST", "/admin/action"],
    ["GET", "/admin/write.js"],
    ["GET", "/admin/moderation.js"],
  ] as const) {
    const res = await request.fetch(`${baseURL}${path}`, {
      method,
      maxRedirects: 0,
      data: method === "GET" ? undefined : "x=1",
    });
    expect(res.status(), `${method} ${path}`).toBe(403);
  }
});

test("every control works by touch, reaches by keyboard, is at least 24 px, and nothing scrolls sideways", async ({
  page,
}, testInfo) => {
  await write(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const controls = page.locator(
    "main form#write-form input:not([type=hidden]), main form#write-form textarea, main form#write-form select, main form#write-form button",
  );
  const n = await controls.count();
  expect(n, "the form has controls").toBeGreaterThan(5);
  const small: string[] = [];
  const reached = new Set<string>();
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    const visible = await c.isVisible();
    if (!visible) continue;
    const box = await c.boundingBox();
    const name = (await c.getAttribute("name")) ?? (await c.getAttribute("id")) ?? (await c.innerText());
    const kind = await c.evaluate((el) => (el as HTMLInputElement).type ?? el.tagName);
    if (kind === "checkbox" || kind === "radio") {
      // A checkbox is tapped through its label, which is what a thumb hits.
      const label = c.locator("xpath=ancestor::label[1]");
      const lbox = (await label.count()) ? await label.boundingBox() : box;
      if (lbox && lbox.height < 24) small.push(`${name}: label ${lbox.height}px tall`);
      continue;
    }
    if (box && (box.height < 24 || box.width < 24)) small.push(`${name}: ${box.width}×${box.height}px`);
    if (box && box.height < 44)
      testInfo.annotations.push({
        type: "touch target under 44 px",
        description: `${name} ${Math.round(box.height)}px`,
      });
  }
  expect(small, "targets under WCAG 2.2's 24 px minimum").toEqual([]);

  // Tap into the text fields; each takes focus and the typed text stays.
  for (const [selector, text] of [
    ["#w-title", "Una prova"],
    ["#w-desc", "Una descrizione"],
    ["#w-body", "Testo del post."],
  ] as const) {
    await page.tap(selector);
    await expect(page.locator(selector)).toBeFocused();
    await page.keyboard.type(text);
    await expect(page.locator(selector)).toHaveValue(new RegExp(text.slice(0, 8)));
  }
  // Keyboard: Tab from the title reaches every visible control before leaving the form.
  await page.focus("#w-title");
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.tagName.toLowerCase()}:${el.getAttribute("name") ?? el.id}` : "";
    });
    reached.add(id);
  }
  for (const must of [
    "input:title",
    "input:slug",
    "select:lang",
    "input:description",
    "textarea:body",
    "button:intent",
  ])
    expect(
      [...reached].some((r) => r.startsWith(must.split(":")[0] ?? "") && r.includes(must.split(":")[1] ?? "")),
      `Tab reaches ${must} (${[...reached].join(", ")})`,
    ).toBe(true);
  expect(noise).toEqual([]);
});

test("a draft survives a reload, and a dropped connection while saving it", async ({ page, context }) => {
  await write(page);
  await page.tap("#w-title");
  await page.keyboard.type("Draft that must survive");
  await page.tap("#w-desc");
  await page.keyboard.type("One sentence.");
  await page.tap("#w-body");
  await page.keyboard.type("Half a thought, typed on a train.");
  await page.waitForTimeout(700); // autosave in this browser runs 400 ms after the last key
  await page.reload();
  await expect(page.locator("#w-title")).toHaveValue("Draft that must survive");
  await expect(page.locator("#w-body")).toHaveValue("Half a thought, typed on a train.");
  await expect(page.locator(".notice", { hasText: "Restored what you typed in this browser" })).toBeVisible();

  // The connection drops while saving: the browser cannot send the form, the text is still in storage.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save draft" }).click({ noWaitAfter: true });
  await page.waitForTimeout(800);
  await context.setOffline(false);
  await page.goto(`${admin.origin}/admin/write`);
  await expect(page.locator("#w-title")).toHaveValue("Draft that must survive");
  await expect(page.locator("#w-body")).toHaveValue("Half a thought, typed on a train.");

  // Back online, saving works, and the draft is on the server: it comes back from a clean browser too.
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${admin.origin}/admin/write`);
  await expect(page.getByText("Draft that must survive").first()).toBeVisible();
  expect(noise.filter((l) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(l))).toEqual([]);
});

// BUG-4 (fixed, 0027): "Save draft" has formnovalidate, so the browser saves a half-written entry; Publish keeps the
// browser's checks (and the server's).
test("BUG-4: Save draft saves a half-written entry (a title and a few words, no description yet)", async ({ page }) => {
  await write(page);
  await page.fill("#w-title", "Half written");
  await page.fill("#w-body", "Only a few words so far.");
  // Publish still needs the description: the browser stops it, nothing reaches GitHub.
  await page.getByRole("button", { name: "Publish" }).click();
  expect(await page.locator("#w-desc").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
  await expect(page.locator("#published")).toHaveCount(0);
  expect(admin.github.calls.filter((c) => c.method !== "GET")).toEqual([]);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/[?&]saved=1/);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${admin.origin}/admin/write`);
  await expect(page.getByText("Half written").first()).toBeVisible({ timeout: 2_000 });
});

/** What this browser keeps for /admin/write (the autosave copies). */
const stored = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("philglov-write:")));

// SO-03: the whole cycle. A first Save draft moves the text from the form's browser copy to the server draft, so
// after Publish, "Write another entry" opens an empty form: no stale copy of the entry just published comes back.
test("save draft, edit, publish, write another: the next entry starts empty", async ({ page }) => {
  await write(page);
  await page.fill("#w-title", "Cycle entry");
  await page.fill("#w-desc", "One sentence.");
  await page.fill("#w-body", "Before the draft was saved.");
  await expect.poll(() => stored(page)).toEqual(["philglov-write:new"]); // autosave ran
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/[?&]saved=1/);
  await expect(page.locator(".notice", { hasText: "Draft saved on the server." })).toBeVisible();
  expect(await stored(page), "the new-entry copy is gone once the server has the text").toEqual([]);
  expect(page.url(), "and the address no longer says so, so a reload removes nothing").not.toContain("moved=");

  await page.fill("#w-body", "After the draft was saved, edited.");
  await expect.poll(() => stored(page)).toHaveLength(1); // this draft's own copy
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("#published")).toBeVisible();
  const put = admin.github.calls.find((c) => c.method === "PUT");
  expect(Buffer.from(String(put?.body?.["content"]), "base64").toString("utf8")).toContain(
    "After the draft was saved, edited.",
  );
  expect(await stored(page)).toEqual([]);

  await page.getByRole("link", { name: "Write another entry" }).click();
  await expect(page.locator("#w-title")).toHaveValue("");
  await expect(page.locator("#w-slug")).toHaveValue("");
  await expect(page.locator("#w-desc")).toHaveValue("");
  await expect(page.locator("#w-body")).toHaveValue("");
  await expect(page.locator(".notice", { hasText: "Restored what you typed" })).toHaveCount(0);
  await expect(page.getByText("No drafts on the server.")).toBeVisible();
  expect(noise).toEqual([]);
});

test("the same for an edit of a published entry: after its draft is published, reopening it shows the file", async ({
  page,
}) => {
  const edit = `${admin.origin}/admin/write?edit=1&slug=lisbona&lang=en`;
  await page.goto(edit);
  const title = await page.locator("#w-title").inputValue();
  await page.fill("#w-body", "An edit, saved as a draft first.");
  await expect.poll(() => stored(page)).toEqual(["philglov-write:edit-en-lisbona"]);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForURL(/[?&]saved=1/);
  expect(await stored(page)).toEqual([]);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#published")).toBeVisible();
  await page.goto(edit);
  await expect(page.locator("#w-title")).toHaveValue(title);
  await expect(page.locator("#w-body")).not.toHaveValue("An edit, saved as a draft first.");
  await expect(page.locator(".notice", { hasText: "Restored what you typed" })).toHaveCount(0);
});

test("an upload that drops is retried by itself; a GIF renamed .jpg is refused with a clear message", async ({
  page,
}) => {
  await write(page);
  await page.fill("#w-slug", "prova-upload");
  let attempts = 0;
  await page.route("**/admin/upload?*", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.abort("connectionreset");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ key: "prova-upload/a-1234.jpg" }),
    });
  });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  await page.setInputFiles("#w-photos", { name: "Holiday.JPG", mimeType: "image/jpeg", buffer: jpeg });
  await expect(page.locator(".upload .fine")).toContainText("connection lost, retrying (1 of 5)");
  await expect(page.locator("#photo-list li, [data-photos] li").first()).toBeVisible({ timeout: 10_000 });
  expect(attempts).toBe(2);

  // Not an image at all: the name and the type say JPEG, the first bytes say GIF.
  await page.unroute("**/admin/upload?*");
  const gif = Buffer.from(
    "GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
    "binary",
  );
  await page.setInputFiles("#w-photos", { name: "fake.jpg", mimeType: "image/jpeg", buffer: gif });
  await expect(page.locator(".upload .fine").last()).toContainText("Only JPEG and PNG photos.");
});

test("Publish opens a pull request on its own branch and never writes to main", async ({ page }) => {
  await write(page);
  await page.fill("#w-title", "Una prova dal telefono");
  await page.fill("#w-desc", "Scritta con il pollice.");
  await page.fill("#w-body", "Testo di prova.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("#published")).toBeVisible();
  const calls = admin.github.calls;
  const writes = calls.filter((c) => c.method === "PUT" || (c.method === "POST" && /\/git\/refs$/.test(c.path)));
  expect(writes.length).toBeGreaterThan(0);
  for (const c of calls.filter((c) => c.method === "PUT")) {
    expect(c.body?.["branch"], `${c.method} ${c.path} targets a branch of its own`).not.toBe("main");
    expect(String(c.body?.["branch"])).toMatch(/^publish\//);
  }
  for (const c of calls) {
    if (c.method !== "GET") expect(c.path).not.toMatch(/heads\/main/);
  }
  const ref = calls.find((c) => c.method === "POST" && /\/git\/refs$/.test(c.path));
  expect(String(ref?.body?.["ref"])).toMatch(/^refs\/heads\/publish\//);
  const pr = calls.find((c) => c.method === "POST" && /\/pulls$/.test(c.path));
  expect(pr?.body?.["base"]).toBe("main");
  expect(String(pr?.body?.["head"])).toMatch(/^publish\//);
  // One file, and only an entry file.
  const files = calls.filter((c) => c.method === "PUT").map((c) => c.path.split("/contents/")[1]);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^src\/content\/journal\/(en|it)\/[a-z0-9-]+\.md$/);
});

test("writing the other-language version of an existing entry makes its twin with originalLang from the original", async ({
  page,
}) => {
  await write(page);
  await page.fill("#w-title", "Foto, in italiano");
  await page.fill("#w-slug", "foto");
  await page.selectOption("#w-lang", "it");
  await expect(page.locator("#w-slug-hint")).toContainText(/English|Italian|other/i);
  await page.fill("#w-desc", "La mia traduzione.");
  await page.fill("#w-body", "Testo tradotto a mano.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("#published")).toBeVisible();
  const put = admin.github.calls.find((c) => c.method === "PUT");
  expect(put?.path).toContain("/contents/src/content/journal/it/foto.md");
  const text = Buffer.from(String(put?.body?.["content"]), "base64").toString("utf8");
  expect(text).toMatch(/^lang: it$/m);
  expect(text, "the Italian version is a translation of the English original").toMatch(/^originalLang: en$/m);
  expect(admin.github.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
});

test("everything sent to GitHub goes to the stand-in: nothing can open a real pull request or write to the real repository", async () => {
  admin = await serveAdmin();
  // api.github.com is answered by the stand-in, which makes the same fixed fake pull request every time ...
  const fake = await fetch("https://api.github.com/repos/PhilGloves/philglov.es/pulls", { method: "POST", body: "{}" });
  expect((await fake.json()) as { html_url: string }).toMatchObject({
    html_url: "https://github.com/test/repo/pull/99",
  });
  expect(admin.github.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /repos/PhilGloves/philglov.es/pulls"]);
  // ... and every other host is refused, not forwarded (the server's close() fails any test that leaked one).
  await expect(fetch("https://github.com/PhilGloves/philglov.es", { method: "POST", body: "{}" })).rejects.toThrow(
    /refused/,
  );
  await expect(fetch("https://uploads.github.com/x")).rejects.toThrow(/refused/);
  expect(blockedOutbound.splice(0)).toEqual([
    "POST https://github.com/PhilGloves/philglov.es",
    "GET https://uploads.github.com/x",
  ]);
});
