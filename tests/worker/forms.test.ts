/**
 * The two public forms end to end through the Worker (B2, B3b), as a browser
 * with JavaScript off sends them: a plain urlencoded POST, a 303 back, the
 * thank-you on the page, or the same page again with the errors.
 */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { agedToken, commentFields, ORIGIN, post, resetDb, twinEntry } from "./helpers.ts";

beforeEach(resetDb);

async function pendingCount(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'").first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

describe("every page", () => {
  test("carries a fresh signed token in each form, is not cached, has no ETag", async () => {
    const { en } = await twinEntry();
    const res = await SELF.fetch(`${ORIGIN}${en}`, { headers: { "If-None-Match": '"anything"' } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("ETag")).toBeNull();
    const html = await res.text();
    const tokens = [...html.matchAll(/name="token" value="(v1\.[^"]+)"/g)];
    expect(tokens.length).toBe(2); // comment form and footer report form
    expect(html).not.toMatch(/name="token" value=""/);
  });
  test("pages without a comment form still get a token in the report form", async () => {
    const html = await (await SELF.fetch(`${ORIGIN}/it`)).text();
    expect(html).toMatch(/name="token" value="v1\./);
  });
});

describe("POST /api/comment", () => {
  test("a valid comment is stored as pending and redirected back with a thank-you", async () => {
    const { slug, en } = await twinEntry();
    const res = await post("/api/comment", await commentFields(slug, "en"));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`${en}?sent=comment#comment-status`);
    expect(res.headers.get("Content-Security-Policy")).toMatch(/default-src 'self'/);
    const row = await env.DB.prepare("SELECT * FROM comments").first<Record<string, unknown>>();
    expect(row).toMatchObject({ slug, lang: "en", name: "Marta", status: "pending", reply_body: null });
    expect(String(row?.["ip_hash"])).toMatch(/^[0-9a-f]{64}$/);

    const page = await (await SELF.fetch(`${ORIGIN}${en}?sent=comment`)).text();
    expect(page).toContain('<p class="notice" role="status">Thanks! I read every comment before it appears here.</p>');
  });

  test("the thank-you is in Italian on the Italian page", async () => {
    const { slug, it } = await twinEntry();
    const res = await post("/api/comment", await commentFields(slug, "it"));
    expect(res.headers.get("Location")).toBe(`${it}?sent=comment#comment-status`);
    const page = await (await SELF.fetch(`${ORIGIN}${it}?sent=comment`)).text();
    expect(page).toContain("Grazie! Leggo ogni commento prima che compaia qui.");
  });

  test("a validation error answers 422 with the page, the error next to the field and the text kept, escaped", async () => {
    const { slug } = await twinEntry();
    const typed = 'Hello "there" </textarea><script>alert(1)</script>';
    const res = await post(
      "/api/comment",
      await commentFields(slug, "en", { email: 'not-an-email"><b>', comment: typed }),
    );
    expect(res.status).toBe(422);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('<div class="alert" role="alert"><strong>Your comment was not sent.</strong>');
    expect(html).toContain('<a href="#c-email">Email: Enter an address like name@example.com</a>');
    expect(html).toMatch(/data-slot="error-email">Enter an address like name@example.com<\/span>/);
    // In a quoted attribute only the quote must be escaped; it is, so the value cannot end early.
    expect(html).toContain('value="not-an-email&quot;><b>" aria-invalid="true"');
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;</textarea>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toMatch(/name="name"[^>]*value="Marta"/);
    expect(await pendingCount()).toBe(0);
  });

  test("missing fields are each reported", async () => {
    const { slug } = await twinEntry();
    const res = await post("/api/comment", await commentFields(slug, "en", { name: "", email: "", comment: "" }));
    expect(res.status).toBe(422);
    const html = await res.text();
    for (const slot of ["error-name", "error-email", "error-comment"])
      expect(html).toMatch(new RegExp(`data-slot="${slot}">[^<]+</span>`));
  });

  test("too many links is refused with a clear message", async () => {
    const { slug } = await twinEntry();
    const spam = "Cheap http://a.example http://b.example http://c.example";
    const html = await (await post("/api/comment", await commentFields(slug, "en", { comment: spam }))).text();
    expect(html).toContain("Use at most 2 links");
  });

  describe("spam-like submissions are rejected with a clear message", () => {
    test("honeypot filled", async () => {
      const { slug } = await twinEntry();
      const res = await post("/api/comment", await commentFields(slug, "en", { website: "http://spam.example" }));
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("a hidden anti-spam field was filled in");
      expect(await pendingCount()).toBe(0);
    });
    test("sent faster than 3 seconds", async () => {
      const { slug } = await twinEntry();
      const res = await post("/api/comment", await commentFields(slug, "en", { token: await agedToken(500) }));
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("faster than anyone can type");
    });
    test("token older than 24 hours, missing or forged", async () => {
      const { slug } = await twinEntry();
      for (const token of [await agedToken(25 * 3600_000), "", "v1.abc.forged"]) {
        const res = await post("/api/comment", await commentFields(slug, "en", { token }));
        expect(res.status).toBe(422);
        const html = await res.text();
        expect(html).toContain("The form was open for too long");
        // The page that comes back carries a fresh token, so sending again works.
        expect(html).toMatch(/name="token" value="v1\./);
      }
      expect(await pendingCount()).toBe(0);
    });
    test("the sixth submission in 10 minutes from one address gets 429", async () => {
      const { slug } = await twinEntry();
      const ip = { "CF-Connecting-IP": "203.0.113.7" };
      for (let i = 0; i < 5; i++)
        expect((await post("/api/comment", await commentFields(slug, "en"), ip)).status).toBe(303);
      const res = await post("/api/comment", await commentFields(slug, "en"), ip);
      expect(res.status).toBe(429);
      expect(await res.text()).toContain("Too many messages from your connection");
      expect(await pendingCount()).toBe(5);
      // Another address is not affected.
      expect(
        (await post("/api/comment", await commentFields(slug, "en"), { "CF-Connecting-IP": "203.0.113.8" })).status,
      ).toBe(303);
    });
  });

  test("raw IP addresses are never stored", async () => {
    const { slug } = await twinEntry();
    await post("/api/comment", await commentFields(slug, "en"), { "CF-Connecting-IP": "198.51.100.23" });
    const dump = JSON.stringify([
      (await env.DB.prepare("SELECT * FROM comments").all()).results,
      (await env.DB.prepare("SELECT * FROM rate_limits").all()).results,
    ]);
    expect(dump).not.toContain("198.51.100.23");
  });

  test.each([
    ["an unknown slug", { slug: "no-such-entry" }],
    ["a bad language", { lang: "fr" }],
  ])("%s is a bad request", async (_, over) => {
    const { slug } = await twinEntry();
    expect((await post("/api/comment", await commentFields(slug, "en", over))).status).toBe(400);
  });

  test("only urlencoded POSTs from this origin", async () => {
    const { slug } = await twinEntry();
    const fields = await commentFields(slug, "en");
    expect((await post("/api/comment", fields, { Origin: "https://evil.example" })).status).toBe(403);
    const json = await SELF.fetch(`${ORIGIN}/api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    expect(json.status).toBe(400);
    const get = await SELF.fetch(`${ORIGIN}/api/comment`);
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST");
    expect((await SELF.fetch(`${ORIGIN}/api/other`, { method: "POST" })).status).toBe(404);
  });
});

describe("POST /api/report", () => {
  const report = async (over: Record<string, string> = {}) => ({
    message: "The date in the second paragraph is wrong.",
    email: "",
    url: "/it",
    lang: "it",
    website: "",
    token: await agedToken(),
    ...over,
  });

  test("a valid report is stored and redirected back to its page", async () => {
    const res = await post("/api/report", await report());
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/it?sent=report#report-status");
    const row = await env.DB.prepare("SELECT * FROM reports").first<Record<string, unknown>>();
    expect(row).toMatchObject({ page_url: "/it", status: "open", email: null, done_at: null });
    const page = await (await SELF.fetch(`${ORIGIN}/it?sent=report`)).text();
    expect(page).toContain("Grazie! La segnalazione mi è arrivata.");
  });

  test("a report on an error opens the footer form again with the text kept", async () => {
    const { en } = await twinEntry();
    const res = await post("/api/report", await report({ url: en, lang: "en", message: "", email: "bad" }));
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toMatch(/<details data-slot="report-details" open/);
    expect(html).toContain('<a href="#f-msg">');
    expect(html).toMatch(/data-slot="report-error-email">Enter an address like name@example.com</);
    expect(html).toMatch(/form class="rform"[\s\S]*name="email"[^>]*value="bad"/);
  });

  test("a page that does not exist falls back to the home page of its language", async () => {
    const res = await post("/api/report", await report({ url: "/it/no-such-page" }));
    expect(res.headers.get("Location")).toBe("/it?sent=report#report-status");
  });

  test("a URL off the site is refused", async () => {
    expect((await post("/api/report", await report({ url: "https://evil.example/" }))).status).toBe(400);
    expect((await post("/api/report", await report({ url: "//evil.example/" }))).status).toBe(400);
  });
});

test("trailing slashes still redirect to the slash-less URL through the Worker", async () => {
  const res = await SELF.fetch(`${ORIGIN}/it/`, { redirect: "manual" });
  expect([301, 307, 308]).toContain(res.status);
  expect(res.headers.get("Location")).toMatch(/\/it$/);
  expect(res.headers.get("Content-Security-Policy")).toMatch(/default-src 'self'/);
});
