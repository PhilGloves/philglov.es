/**
 * Security audit (docs/guide.md prompt 8, decision 0030): the Worker probed the way an attacker would, beyond what the
 * other files already cover. Path tricks on /admin, methods, request shapes and origins on the forms, every field
 * fuzzed, the rate limit shared by both forms, and tokens that cannot stand in for one another.
 */
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { required } from "../../worker/src/secrets.ts";
import { csrfToken, formToken } from "../../worker/src/tokens.ts";
import { clean } from "../../worker/src/validate.ts";
import { agedToken, commentFields, insertComment, ORIGIN, post, resetDb, twinEntry } from "./helpers.ts";

beforeEach(resetDb);

/** Markers that only an /admin page carries. */
const ADMIN = /name="csrf"|Comments to moderate|\/admin\/write\.js|\/admin\/moderation\.js|data-row=/;

describe("/admin cannot be reached around the Access check", () => {
  test.each([
    "/admin%2f",
    "/admin%2F",
    "/admin%2fwrite",
    "/ADMIN/WRITE.JS",
    "/./admin",
    "/x/../admin",
    "/admin/./write",
    "/admin//write",
    "///admin",
    "/admin\\write",
    "/%41DMIN",
  ])("%s is refused with 403 and no admin content", async (path) => {
    const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toMatch(ADMIN);
  });

  test.each(["/admin.", "/admin;x", "/admin%00", "/%2561dmin", "/admin..", "/adm%69n.html", "/admin.html"])(
    "%s is not /admin at all: a missing page, or the asset server's redirect to a path on this site, never admin content",
    async (path) => {
      const res = await SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual" });
      expect([307, 403, 404]).toContain(res.status);
      expect(await res.text()).not.toMatch(ADMIN);
      const location = res.headers.get("Location");
      if (res.status === 307) {
        expect(location).toMatch(/^\/(?![/\\])/);
        const followed = await SELF.fetch(`${ORIGIN}${location ?? ""}`, { redirect: "manual" });
        expect([403, 404]).toContain(followed.status);
        expect(await followed.text()).not.toMatch(ADMIN);
      }
    },
  );

  test("every method on every admin route needs the token", async () => {
    for (const [method, path] of [
      ["PUT", "/admin/upload?slug=alps&name=a"],
      ["POST", "/admin/action"],
      ["POST", "/admin/write"],
      ["DELETE", "/admin"],
      ["PATCH", "/admin/write"],
      ["OPTIONS", "/admin"],
      ["HEAD", "/admin"],
    ] as const) {
      const res = await SELF.fetch(`${ORIGIN}${path}`, { method, redirect: "manual" });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  test("a form token is not a CSRF token, and the other way round", async () => {
    const key = required(env.FORM_HMAC_KEY);
    const asCsrf = await formToken(key, Date.now() - 5_000);
    const res = await SELF.fetch(`${ORIGIN}/admin/action`, {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": env.TEST_ACCESS_JWT,
        Origin: ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf: asCsrf, action: "approve", id: "1" }).toString(),
    });
    expect(res.status).toBe(403);
    const { slug } = await twinEntry();
    const asForm = await csrfToken(key, "anyone", Date.now() - 5_000);
    const refused = await post("/api/comment", await commentFields(slug, "en", { token: asForm }));
    expect(refused.status).toBe(422);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(0);
  });
});

describe("the public forms refuse what a browser on this site would never send", () => {
  test("methods other than POST, and other paths under /api", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH", "OPTIONS"])
      expect((await SELF.fetch(`${ORIGIN}/api/comment`, { method })).status, method).toBe(405);
    for (const method of ["PUT", "DELETE", "POST"])
      expect((await SELF.fetch(`${ORIGIN}/`, { method })).status, `${method} /`).toBe(405);
    expect((await SELF.fetch(`${ORIGIN}/api/../api/comments`, { method: "POST" })).status).toBe(404);
  });

  test("other body types, an oversized body, other origins", async () => {
    const { slug } = await twinEntry();
    const fields = await commentFields(slug, "en");
    const send = (headers: Record<string, string>, body: string) =>
      SELF.fetch(`${ORIGIN}/api/comment`, { method: "POST", redirect: "manual", headers, body });
    expect((await send({ "Content-Type": "application/json", Origin: ORIGIN }, JSON.stringify(fields))).status).toBe(
      400,
    );
    expect(
      (await send({ "Content-Type": "text/plain", Origin: ORIGIN }, new URLSearchParams(fields).toString())).status,
    ).toBe(400);
    expect((await send({ "Content-Type": "multipart/form-data; boundary=x", Origin: ORIGIN }, "--x--")).status).toBe(
      400,
    );
    const huge = new URLSearchParams({ ...fields, comment: "a".repeat(70_000) }).toString();
    expect((await send({ "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN }, huge)).status).toBe(
      400,
    );
    for (const origin of ["https://evil.example", "null", "http://example.com", "https://example.com.evil.example"])
      expect((await post("/api/comment", fields, { Origin: origin })).status, origin).toBe(403);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM comments").first("n")).toBe(0);
  });

  test("the rate limit counts both forms together", async () => {
    const { slug, en } = await twinEntry();
    const ip = { "CF-Connecting-IP": "198.51.100.77" };
    for (let i = 0; i < 3; i++)
      expect((await post("/api/comment", await commentFields(slug, "en"), ip)).status).toBe(303);
    const report = async () =>
      post("/api/report", { message: "Typo.", email: "", url: en, website: "", token: await agedToken() }, ip);
    expect((await report()).status).toBe(303);
    expect((await report()).status).toBe(303);
    expect((await report()).status).toBe(429);
    expect((await post("/api/comment", await commentFields(slug, "en"), ip)).status).toBe(429);
  });
});

/** Text an attacker would try in any field: markup, script, SQL, template syntax, control and bidi characters, header breaks. */
const PAYLOADS = [
  "<script>alert(1)</script>",
  '"><svg onload=alert(1)>',
  "<img src=x onerror=alert(1)>",
  "</textarea><script>alert(1)</script>",
  "javascript:alert(1)",
  "' OR 1=1; DROP TABLE comments; --",
  "Robert'); DROP TABLE comments;--",
  "{{constructor.constructor('alert(1)')()}}",
  "${alert(1)}",
  "a\u0000b\u0007c\u001b[31m",
  "‮gnp.exe‬ ⁦x⁩",
  "zero​width‍join﻿",
  "Z̷̛͓a̴l̶g̷o̵ ̸t̵e̷x̶t̵ ✨🦉",
  "line\r\nBcc: victim@evil.example",
  "%0d%0aBcc: victim@evil.example",
  "&lt;b&gt;&amp;&#x3C;",
];

describe("every field, fuzzed", () => {
  test("no answer is a server error; what is stored is the cleaned text, nothing more", async () => {
    const { slug, en } = await twinEntry();
    let n = 0;
    for (const payload of PAYLOADS) {
      for (const field of ["name", "email", "comment"] as const) {
        n++;
        const ip = { "CF-Connecting-IP": `192.0.2.${n % 250}` };
        const res = await post("/api/comment", await commentFields(slug, "en", { [field]: payload }), ip);
        expect([303, 422], `${field}: ${JSON.stringify(payload)} → ${res.status}`).toContain(res.status);
        if (res.status === 303) {
          const column = field === "comment" ? "body" : field;
          const row = await env.DB.prepare(`SELECT ${column} AS v FROM comments ORDER BY id DESC`).first<{
            v: string;
          }>();
          expect(row?.v).toBe(clean(payload, field === "comment"));
          expect(row?.v).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/);
        } else {
          // The page shown again puts what was typed back in the field: inside a quoted value, where < and > are only
          // text and a " is escaped. With every quoted value removed, no element from the text is left.
          const html = (await res.text()).replace(/="[^"]*"/g, '=""');
          expect(html).not.toContain("<script>alert(1)</script>");
          expect(html).not.toContain("<svg onload");
          expect(html).not.toContain("<img src=x onerror");
        }
      }
      for (const field of ["message", "email", "url"] as const) {
        n++;
        const ip = { "CF-Connecting-IP": `192.0.2.${n % 250}` };
        const fields = {
          message: "Typo.",
          email: "",
          url: en,
          website: "",
          token: await agedToken(),
          [field]: payload,
        };
        const res = await post("/api/report", fields, ip);
        expect([303, 400, 422], `report ${field}: ${JSON.stringify(payload)} → ${res.status}`).toContain(res.status);
      }
    }
    // An email address can never carry a line break, so it can never become a mail header.
    const emails = await env.DB.prepare("SELECT email FROM comments UNION SELECT email FROM reports").all<{
      email: string;
    }>();
    for (const { email } of emails.results) expect(email ?? "").not.toMatch(/[\r\n]/);
  });

  test("approved, every payload is shown as text on the entry, never as markup", async () => {
    const { slug, en } = await twinEntry();
    for (const payload of PAYLOADS) await insertComment({ slug, status: "approved", name: payload, body: payload });
    const html = await (await SELF.fetch(`${ORIGIN}${en}`)).text();
    const comments = html.slice(html.indexOf('data-slot="comments"'));
    expect(comments).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(comments).not.toMatch(/<script>alert|<svg onload|<img src=x|<\/textarea><script>/);
  });

  test("100 KB of text in every field at once is refused before it is read", async () => {
    const { slug } = await twinEntry();
    const big = "x".repeat(100_000);
    const res = await post("/api/comment", await commentFields(slug, "en", { name: big, email: big, comment: big }));
    expect(res.status).toBe(400);
  });
});
