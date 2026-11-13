/** /admin (B4, B7): Access JWT on every request, CSRF on every change, moderation actions, deletion. */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { isAdminPath } from "../../worker/src/index.ts";
import { adminFetch, adminPost, csrf, insertComment, ORIGIN, resetDb, twinEntry } from "./helpers.ts";

beforeEach(resetDb);

describe("403 without a valid Access token", () => {
  test.each([
    "/admin",
    "/admin/",
    "/admin/write",
    "/admin/write.js",
    "/admin/moderation.js",
    "/admin/action",
    "/ADMIN",
    "/Admin/Write",
    "/%61dmin",
    "//admin",
  ])("GET %s with no token", async (path) => {
    const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
    expect(res.status).toBe(403);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  test("a token for another audience, a forged one, or garbage", async () => {
    for (const jwt of [env.TEST_ACCESS_JWT_WRONG_AUD, env.TEST_ACCESS_JWT_FORGED, "not.a.jwt", ""])
      expect((await adminFetch("/admin", {}, jwt)).status).toBe(403);
  });
  test("a POST without a token changes nothing", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    const res = await SELF.fetch(`${ORIGIN}/admin/action`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=approve&id=${id}`,
    });
    expect(res.status).toBe(403);
    const row = await env.DB.prepare("SELECT status FROM comments WHERE id = ?1").bind(id).first<{ status: string }>();
    expect(row?.status).toBe("pending");
  });
  test("path checks catch every spelling", () => {
    for (const p of ["/admin", "/admin/x", "/ADMIN", "/%61dmin/x", "//admin"]) expect(isAdminPath(p)).toBe(true);
    for (const p of ["/administer", "/adminx", "/it/admin", "/"]) expect(isAdminPath(p)).toBe(false);
  });
});

describe("with a valid Access token", () => {
  test("/admin lists pending comments and open reports, with its own CSP and noindex", async () => {
    const { slug } = await twinEntry();
    await insertComment({ slug, name: "Waiting <b>", status: "pending", body: "Please approve <script>x</script>" });
    await env.DB.prepare(
      "INSERT INTO reports (page_url, message, created_at, status) VALUES ('/it', 'Refuso', 1, 'open')",
    ).run();
    const res = await adminFetch("/admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/^default-src 'none'; script-src 'self';/);
    expect(res.headers.get("Content-Security-Policy")).not.toMatch(/unsafe-inline/);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("tdm-reservation")).toBe("1");
    const html = await res.text();
    expect(html).toContain('Comments to moderate (<span data-count="comments">1</span>)');
    expect(html).toContain("Waiting &lt;b&gt;");
    expect(html).toContain("Please approve &lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("Refuso");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toMatch(/<link rel="stylesheet" href="\/_assets\/[^"]+\.css"/);
  });

  test("a change needs the CSRF token of this user", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    expect((await adminPost("/admin/action", { action: "approve", id: String(id) })).status).toBe(403);
    expect((await adminPost("/admin/action", { action: "approve", id: String(id), csrf: "v1.abc.def" })).status).toBe(
      403,
    );
    const cross = await adminFetch("/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example" },
      body: new URLSearchParams({ action: "approve", id: String(id), csrf: await csrf() }).toString(),
    });
    expect(cross.status).toBe(403);
  });

  test("approve: the comment appears on both language pages", async () => {
    const { slug, en, it } = await twinEntry();
    const id = await insertComment({ slug, name: "Approved Later", status: "pending" });
    const res = await adminPost("/admin/action", { action: "approve", id: String(id), csrf: await csrf() });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/admin?done=approve");
    for (const path of [en, it])
      expect(await (await SELF.fetch(`${ORIGIN}${path}`)).text()).toContain("Approved Later");
    expect(await (await adminFetch("/admin?done=approve")).text()).toContain("The comment is live within a minute.");
  });

  test("reject, reply and mark done", async () => {
    const { slug } = await twinEntry();
    const a = await insertComment({ slug, status: "pending" });
    const b = await insertComment({ slug, status: "pending" });
    const r = await env.DB.prepare(
      "INSERT INTO reports (page_url, message, created_at, status) VALUES ('/', 'x', 1, 'open') RETURNING id",
    ).first<{ id: number }>();
    const token = await csrf();
    await adminPost("/admin/action", { action: "reject", id: String(a), csrf: token });
    await adminPost("/admin/action", {
      action: "reply",
      id: String(b),
      reply: "  Thank you.\r\nReally.  ",
      csrf: token,
    });
    await adminPost("/admin/action", { action: "done", id: String(r?.id), csrf: token });
    const rows = await env.DB.prepare("SELECT id, status, reply_body FROM comments ORDER BY id").all();
    expect(rows.results).toEqual([
      { id: a, status: "rejected", reply_body: null },
      { id: b, status: "approved", reply_body: "Thank you.\nReally." },
    ]);
    const report = await env.DB.prepare("SELECT status, done_at FROM reports").first<{
      status: string;
      done_at: number;
    }>();
    expect(report?.status).toBe("done");
    expect(report?.done_at).toBeGreaterThan(Date.now() - 60_000);
  });

  test("delete removes the comment with its name and email for good, only when confirmed", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, email: "erase-me@example.com" });
    const token = await csrf();
    await adminPost("/admin/action", { action: "delete", id: String(id), csrf: token });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(1);
    await adminPost("/admin/action", { action: "delete", id: String(id), confirm: "yes", csrf: token });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(0);
  });

  test("find by email answers the page without putting the address in a URL", async () => {
    const { slug } = await twinEntry();
    await insertComment({ slug, email: "Marta@Example.com", name: "Marta" });
    await insertComment({ slug, email: "other@example.com", name: "Other" });
    const res = await adminPost("/admin/action", { action: "find", email: "marta@example.com", csrf: await csrf() });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Comments from marta@example.com (1)");
    expect(res.headers.get("Location")).toBeNull();
  });

  test("the admin script is served behind Access as JavaScript", async () => {
    const res = await adminFetch("/admin/write.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/javascript/);
  });
});

describe("moderation in the background (/admin/moderation.js, decision 0020)", () => {
  /** What the script sends: the form fields plus the button pressed, asking for JSON. */
  const background = (fields: Record<string, string>, init: { origin?: string; jwt?: string } = {}) =>
    adminFetch(
      "/admin/action",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          ...(init.origin ? { Origin: init.origin } : {}),
        },
        body: new URLSearchParams(fields).toString(),
      },
      init.jwt,
    );
  const report = async (): Promise<number> =>
    Number(
      (
        await env.DB.prepare(
          "INSERT INTO reports (page_url, message, created_at, status) VALUES ('/', 'x', 1, 'open') RETURNING id",
        ).first<{ id: number }>()
      )?.id,
    );
  const commentStatus = async (id: number) =>
    env.DB.prepare("SELECT status, reply_body FROM comments WHERE id = ?1").bind(id).first();

  test("/admin loads its own script, and every card has a row id and a status slot", async () => {
    const { slug } = await twinEntry();
    const pending = await insertComment({ slug, status: "pending" });
    const approved = await insertComment({ slug, status: "approved" });
    const r = await report();
    const html = await (await adminFetch("/admin")).text();
    expect(html).toContain('<script src="/admin/moderation.js" defer></script>');
    expect(html).not.toContain("/admin/write.js");
    for (const row of [`comment-${pending}`, `comment-${approved}`, `report-${r}`])
      expect(html).toContain(`<li class="card" data-row="${row}">`);
    expect(html.match(/data-row-status/g)?.length).toBe(3);
    // Both buttons are in the page; the one that does not apply is hidden, so the script can show it later.
    const card = (id: number) => html.slice(html.indexOf(`data-row="comment-${id}"`)).split("</li>")[0] ?? "";
    expect(card(approved)).toMatch(/value="approve" class="btn" hidden>/);
    expect(card(approved)).toMatch(/value="reject" class="btn btn--danger">/);
    expect(card(pending)).toMatch(/value="approve" class="btn">/);
    expect(html).toContain('Reports (<span data-count="reports">1</span>)');
  });

  test("/admin/moderation.js is served behind Access as JavaScript", async () => {
    const res = await adminFetch("/admin/moderation.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/javascript/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("approve and reject answer 200 JSON for the row, with the new counts, and no redirect", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    await report();
    const token = await csrf();
    const res = await background({ action: "approve", id: String(id), csrf: token });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Security-Policy")).toMatch(/^default-src 'none'/);
    expect(await res.json()).toEqual({
      ok: true,
      row: `comment-${id}`,
      status: "approved",
      notice: "Approved. The comment is live within a minute.",
      counts: { comments: 0, reports: 1 },
    });
    expect(await commentStatus(id)).toEqual({ status: "approved", reply_body: null });
    const rejected = await (await background({ action: "reject", id: String(id), csrf: token })).json();
    expect(rejected).toMatchObject({ ok: true, status: "rejected", counts: { comments: 0 } });
    expect(await commentStatus(id)).toEqual({ status: "rejected", reply_body: null });
  });

  test("reply: the saved text comes back as data, cleaned; markup in it stays text", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    const body = await (
      await background({ action: "reply", id: String(id), reply: "  <b>Grazie</b>\r\nDavvero.  ", csrf: await csrf() })
    ).json();
    expect(body).toMatchObject({
      ok: true,
      row: `comment-${id}`,
      status: "approved",
      reply: "<b>Grazie</b>\nDavvero.",
      counts: { comments: 0 },
    });
    expect(await commentStatus(id)).toEqual({ status: "approved", reply_body: "<b>Grazie</b>\nDavvero." });
    // Cleared: the reply goes, and the script hides the block.
    const cleared = await (
      await background({ action: "reply", id: String(id), reply: " ", csrf: await csrf() })
    ).json();
    expect(cleared).toMatchObject({ ok: true, reply: "" });
    expect(await commentStatus(id)).toEqual({ status: "approved", reply_body: null });
  });

  test("mark done and both deletes; delete still needs its confirmation box", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    const r1 = await report();
    const r2 = await report();
    const token = await csrf();
    expect(await (await background({ action: "done", id: String(r1), csrf: token })).json()).toEqual({
      ok: true,
      row: `report-${r1}`,
      status: "done",
      notice: "Report marked done. It is deleted 12 months after it arrived.",
      counts: { comments: 1, reports: 1 },
    });
    // Without the box ticked: refused, nothing deleted, and the script falls back to the plain post.
    expect(await (await background({ action: "delete", id: String(id), csrf: token })).json()).toEqual({ ok: false });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(1);
    expect(
      await (await background({ action: "delete", id: String(id), confirm: "yes", csrf: token })).json(),
    ).toMatchObject({ ok: true, row: `comment-${id}`, status: "deleted", counts: { comments: 0, reports: 1 } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(0);
    expect(
      await (await background({ action: "delete-report", id: String(r2), confirm: "yes", csrf: token })).json(),
    ).toMatchObject({ ok: true, row: `report-${r2}`, status: "deleted", counts: { comments: 0, reports: 0 } });
  });

  test("an item deleted meanwhile (another tab) is reported as gone, not as done", async () => {
    const token = await csrf();
    expect(await (await background({ action: "approve", id: "999", csrf: token })).json()).toEqual({
      ok: true,
      row: "comment-999",
      status: "deleted",
      notice: "Already deleted.",
      counts: { comments: 0, reports: 0 },
    });
  });

  test("a bad id or an unknown action is refused with ok: false", async () => {
    const token = await csrf();
    for (const fields of [
      { action: "approve", id: "0" },
      { action: "approve", id: "x" },
      { action: "nuke", id: "1" },
    ])
      expect(await (await background({ ...fields, csrf: token })).json()).toEqual({ ok: false });
  });

  test("the same protections: Access, the CSRF token and the origin, before anything changes", async () => {
    const { slug } = await twinEntry();
    const id = await insertComment({ slug, status: "pending" });
    const token = await csrf();
    expect((await background({ action: "approve", id: String(id), csrf: token }, { jwt: "" })).status).toBe(403);
    expect(
      (await background({ action: "approve", id: String(id), csrf: token }, { jwt: env.TEST_ACCESS_JWT_FORGED }))
        .status,
    ).toBe(403);
    expect((await background({ action: "approve", id: String(id) })).status).toBe(403);
    expect((await background({ action: "approve", id: String(id), csrf: "v1.abc.def" })).status).toBe(403);
    expect(
      (await background({ action: "approve", id: String(id), csrf: token }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(await commentStatus(id)).toEqual({ status: "pending", reply_body: null });
  });
});
