/**
 * Moderation on /admin, both ways (decision 0020), against the real Worker (tests/e2e/admin-worker.ts):
 *  - JavaScript on: /admin/moderation.js sends each action in the background; only that item's card changes, the
 *    counts follow, focus goes to the card's status line, and nothing reloads or scrolls.
 *  - JavaScript off: each action is a plain post that comes back to /admin with its notice, as before.
 */
import { expect, test, type Page } from "@playwright/test";
import { serveAdmin, type Admin } from "./admin-worker.ts";

let consoleNoise: string[] = [];
let expectedNoise: (string | RegExp)[] = [];
let admin: Admin;
let ADMIN = "";

test.beforeEach(async ({ page }) => {
  consoleNoise = [];
  expectedNoise = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") consoleNoise.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleNoise.push(`pageerror: ${err.message}`));
  // Motion allowed, as for most visitors: the site has no view transitions any more (Q19, decision 0021).
  await page.emulateMedia({ reducedMotion: "no-preference" });
  admin = await serveAdmin();
  ADMIN = admin.origin;
});

test.afterEach(async () => {
  await admin.close();
  expect(consoleNoise, consoleNoise.join(" | ")).toHaveLength(expectedNoise.length);
  expectedNoise.forEach((line, i) => expect(consoleNoise[i]).toMatch(line));
});

const card = (page: Page, row: string) => page.locator(`[data-row="${row}"]`).first();
const status = (id: number) =>
  admin.db.prepare("SELECT status, reply_body AS reply FROM comments WHERE id = ?").get(id) as
    { status: string; reply: string | null } | undefined;
const reportStatus = (id: number) =>
  (admin.db.prepare("SELECT status FROM reports WHERE id = ?").get(id) as { status: string } | undefined)?.status;

async function expectCounts(page: Page, comments: number, reports: number) {
  await expect(page.locator(".admin-nav")).toContainText(`Comments (${comments})`);
  await expect(page.locator(".admin-nav")).toContainText(`Reports (${reports})`);
  await expect(page.locator("#comments")).toHaveText(`Comments to moderate (${comments})`);
  await expect(page.locator("#reports")).toHaveText(`Error reports (${reports})`);
}

test.describe("JavaScript on: in the background", () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, "needs JavaScript");

  test("approve, reject, mark done and reply in a row: no reload, no scroll, only that card changes", async ({
    page,
  }) => {
    const a = admin.comment({ name: "Marta" });
    const b = admin.comment({ name: "Luca" });
    const r = admin.report();
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });
    await page.goto(`${ADMIN}/admin`);
    await expectCounts(page, 2, 1);
    expect(await page.locator("[onsubmit], [onclick], [onload]").count()).toBe(0);
    await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => navigations.push(frame.url()));

    // Approve Marta.
    const cardA = card(page, `comment-${a}`);
    await cardA.getByRole("button", { name: "Approve" }).click();
    await expect(cardA.locator("[data-row-status]")).toHaveText("Approved. The comment is live within a minute.");
    await expect(cardA.locator("[data-row-status]")).toBeFocused();
    await expect(cardA.locator(".badge")).toHaveText("approved");
    await expect(cardA.locator(".badge")).toHaveClass("badge badge--ok");
    await expect(cardA.getByRole("button", { name: "Approve" })).toBeHidden();
    await expect(cardA.getByRole("button", { name: "Reject" })).toBeVisible();
    await expectCounts(page, 1, 1);
    expect(status(a)?.status).toBe("approved");
    // Luca's card is untouched.
    await expect(card(page, `comment-${b}`).locator(".badge")).toHaveText("pending");
    await expect(card(page, `comment-${b}`).locator("[data-row-status]")).toBeHidden();

    // Reject Luca.
    const cardB = card(page, `comment-${b}`);
    await cardB.getByRole("button", { name: "Reject" }).click();
    await expect(cardB.locator(".badge")).toHaveText("rejected");
    await expect(cardB.locator(".badge")).toHaveClass("badge badge--bad");
    await expect(cardB.getByRole("button", { name: "Reject" })).toBeHidden();
    await expect(cardB.getByRole("button", { name: "Approve" })).toBeVisible();
    await expectCounts(page, 0, 1);

    // Mark the report done, from wherever the page is scrolled to: the view stays put.
    const cardR = card(page, `report-${r}`);
    await cardR.getByRole("button", { name: "Mark done" }).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await cardR.getByRole("button", { name: "Mark done" }).click();
    await expect(cardR.locator("[data-row-status]")).toHaveText(
      "Report marked done. It is deleted 12 months after it arrived.",
    );
    await expect(cardR.locator("[data-row-status]")).toBeFocused();
    await expect(cardR.locator(".badge")).toHaveText("done");
    await expect(cardR.getByRole("button", { name: "Mark done" })).toBeHidden();
    await expectCounts(page, 0, 0);
    expect(Math.abs((await page.evaluate(() => scrollY)) - before)).toBeLessThan(200);
    expect(reportStatus(r)).toBe("done");

    // Reply to Marta: the text goes in as text, line breaks kept, markup shown literally.
    await cardA.locator("summary", { hasText: "Reply" }).click();
    await cardA.locator("textarea").fill("Grazie <b>davvero</b>\nA presto");
    await cardA.getByRole("button", { name: "Save reply and approve" }).click();
    await expect(cardA.locator("[data-row-status]")).toHaveText(
      "Reply saved and the comment approved. Both are live within a minute.",
    );
    const reply = cardA.locator("[data-reply]");
    await expect(reply).toBeVisible();
    await expect(reply.locator("p")).toHaveText("Grazie <b>davvero</b>A presto");
    expect(await reply.locator("p br").count()).toBe(1);
    expect(await reply.locator("p b").count()).toBe(0);
    await expect(cardA.locator("details").first()).not.toHaveAttribute("open");
    expect(status(a)).toEqual({ status: "approved", reply: "Grazie <b>davvero</b>\nA presto" });

    // All of it without leaving the page, and only to this origin's /admin/action.
    expect(navigations).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
    expect(page.url()).toBe(`${ADMIN}/admin`);
    expect(posts).toEqual(Array(4).fill(`${ADMIN}/admin/action`));
  });

  test("delete keeps its confirmation box; then the card shrinks to one line and the data is gone", async ({
    page,
  }) => {
    const id = admin.comment({ name: "Erase Me", email: "erase-me@example.com" });
    const r = admin.report("Delete this report.");
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST") posts.push(req.url());
    });
    await page.goto(`${ADMIN}/admin`);
    const row = card(page, `comment-${id}`);
    await row.locator("summary", { hasText: "Delete for good" }).click();
    // Not ticked: the browser stops the form, nothing is sent.
    await row.getByRole("button", { name: "Delete" }).click();
    expect(posts).toEqual([]);
    expect(status(id)).toBeDefined();

    await row.getByRole("checkbox").check();
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(row.locator("[data-row-status]")).toHaveText("Deleted for good, with its name and email.");
    await expect(row.locator("[data-row-status]")).toBeFocused();
    expect(await row.locator("> *").count()).toBe(1);
    await expect(page.locator("body")).not.toContainText("erase-me@example.com");
    await expectCounts(page, 0, 1);
    expect(status(id)).toBeUndefined();

    const rep = card(page, `report-${r}`);
    await rep.locator("summary", { hasText: "Delete for good" }).click();
    await rep.getByRole("checkbox").check();
    await rep.getByRole("button", { name: "Delete" }).click();
    await expect(rep.locator("[data-row-status]")).toHaveText("Report deleted for good.");
    await expectCounts(page, 0, 0);
    expect(reportStatus(r)).toBeUndefined();
  });

  test("an item shown twice (found by email, and in the queue) changes in both places", async ({ page }) => {
    const id = admin.comment({ email: "marta@example.com" });
    await page.goto(`${ADMIN}/admin`);
    await page.fill("#find-email", "marta@example.com");
    await page.getByRole("button", { name: "Find" }).click();
    await expect(page.locator("#found")).toHaveText("Comments from marta@example.com (1)");
    const both = page.locator(`[data-row="comment-${id}"]`);
    await expect(both).toHaveCount(2);
    await both.first().getByRole("button", { name: "Approve" }).click();
    await expect(both.first().locator("[data-row-status]")).toBeFocused();
    for (const one of await both.all()) await expect(one.locator(".badge")).toHaveText("approved");
  });

  test("the network fails: the form is posted the plain way, and the action still happens once", async ({ page }) => {
    // Chrome reports the aborted request in the console; that line is the browser's, as for a 4xx (O4).
    expectedNoise = [/^error: Failed to load resource: net::ERR_FAILED$/];
    const id = admin.comment({});
    await page.goto(`${ADMIN}/admin`);
    let aborted = 0;
    await page.route(`${ADMIN}/admin/action`, async (route) => {
      const accept = (await route.request().allHeaders())["accept"] ?? "";
      if (accept.includes("application/json") && aborted++ === 0) return route.abort();
      return route.fallback();
    });
    await card(page, `comment-${id}`).getByRole("button", { name: "Approve" }).click();
    await page.waitForURL(`${ADMIN}/admin?done=approve`);
    await expect(page.locator('main > .notice[role="status"]')).toHaveText(
      "Approved. The comment is live within a minute.",
    );
    expect(aborted).toBe(1);
    expect(status(id)?.status).toBe("approved");
  });

  test("the Access login has expired: the page reloads, and Access's sign-in page opens (O5)", async ({ page }) => {
    // Owner decision O5: no form post (the admin CSP's form-action 'self' would block Access's redirect), a reload.
    const id = admin.comment({});
    await page.goto(`${ADMIN}/admin`);
    admin.expireLogin();
    const form = card(page, `comment-${id}`).locator("form.actions");
    await form.getByRole("button", { name: "Approve" }).click();
    await page.waitForURL(/^http:\/\/localhost:\d+\/cdn-cgi\/access\/login$/);
    await expect(page.locator("h1")).toHaveText("Sign in");
    expect(status(id)?.status).toBe("pending");
  });

  test("the CSRF token is no longer valid: the plain post shows the Worker's message, nothing changes", async ({
    page,
  }) => {
    // Two 403 answers (the background request, then the plain post), each reported by Chrome itself (O4).
    expectedNoise = [/^error: Failed to load resource: .*403/, /^error: Failed to load resource: .*403/];
    const id = admin.comment({});
    await page.goto(`${ADMIN}/admin`);
    await card(page, `comment-${id}`)
      .locator('input[name="csrf"]')
      .first()
      .evaluate((input: HTMLInputElement) => (input.value = "v1.0.forged"));
    await card(page, `comment-${id}`).getByRole("button", { name: "Approve" }).click();
    await page.waitForURL(`${ADMIN}/admin/action`);
    await expect(page.locator("body")).toContainText("The page was open too long.");
    expect(status(id)?.status).toBe("pending");
  });
});

test.describe("JavaScript off: plain posts", () => {
  test.skip(({ javaScriptEnabled }) => javaScriptEnabled, "the no-JavaScript project only");

  test("each action reloads /admin with its notice; delete still needs its box ticked", async ({ page }) => {
    const a = admin.comment({ name: "Marta" });
    const r = admin.report();
    await page.goto(`${ADMIN}/admin`);
    await expectCounts(page, 1, 1);

    await card(page, `comment-${a}`).getByRole("button", { name: "Approve" }).click();
    await page.waitForURL(`${ADMIN}/admin?done=approve`);
    await expect(page.locator('main > .notice[role="status"]')).toHaveText(
      "Approved. The comment is live within a minute.",
    );
    await expectCounts(page, 0, 1);
    expect(status(a)?.status).toBe("approved");

    await card(page, `report-${r}`).getByRole("button", { name: "Mark done" }).click();
    await page.waitForURL(`${ADMIN}/admin?done=done`);
    await expectCounts(page, 0, 0);
    expect(reportStatus(r)).toBe("done");

    // The approved comment is listed under "Latest published"; reply to it there.
    const row = card(page, `comment-${a}`);
    await expect(row.locator(".badge")).toHaveText("approved");
    await expect(row.getByRole("button", { name: "Approve" })).toBeHidden();
    await row.locator("summary", { hasText: "Reply" }).click();
    await row.locator("textarea").fill("Grazie <b>davvero</b>");
    await row.getByRole("button", { name: "Save reply and approve" }).click();
    await page.waitForURL(`${ADMIN}/admin?done=reply`);
    await expect(card(page, `comment-${a}`).locator("[data-reply] p")).toHaveText("Grazie <b>davvero</b>");

    const again = card(page, `comment-${a}`);
    await again.locator("summary", { hasText: "Delete for good" }).click();
    await again.getByRole("button", { name: "Delete" }).click();
    expect(page.url()).toBe(`${ADMIN}/admin?done=reply`);
    await again.getByRole("checkbox").check();
    await again.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(`${ADMIN}/admin?done=delete`);
    expect(status(a)).toBeUndefined();
    // No status slot shows anything without the script.
    for (const slot of await page.locator("[data-row-status]").all()) await expect(slot).toBeHidden();
  });

  test("the Access login has expired: the browser blocks the post (form-action 'self'), nothing changes", async ({
    page,
  }) => {
    // Without the script there is only the post, and the admin CSP stays as it is (owner decision O5): the browser
    // blocks Access's redirect. Reloading the page signs in again.
    expectedNoise = [/^error: Sending form data to '.*\/admin\/action' violates .*"form-action 'self'"/];
    const id = admin.comment({});
    await page.goto(`${ADMIN}/admin`);
    admin.expireLogin();
    await card(page, `comment-${id}`).getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => consoleNoise.length).toBe(1);
    expect(page.url()).toBe(`${ADMIN}/admin`);
    expect(status(id)?.status).toBe("pending");
  });
});
