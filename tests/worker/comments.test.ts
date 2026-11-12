/** Approved comments on entry pages (B3): numbered, replies set off, escaped, shown in both languages, fail open. */
import { env, SELF } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import { insertComment, ORIGIN, resetDb, twinEntry } from "./helpers.ts";

beforeEach(resetDb);

const page = async (path: string) => (await SELF.fetch(`${ORIGIN}${path}`)).text();
const list = (html: string) => /<ol class="clist" data-slot="comments">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? "";

test("approved comments appear numbered, with the owner's reply set off; pending and rejected do not", async () => {
  const { slug, en } = await twinEntry();
  await insertComment({ slug, name: "Marta", body: "First.", created_at: 1_000 });
  await insertComment({ slug, name: "Luca", body: "Second.", created_at: 2_000, reply_body: "Thanks, Luca." });
  await insertComment({ slug, name: "Pending", status: "pending" });
  await insertComment({ slug, name: "Rejected", status: "rejected" });

  const html = await page(en);
  const items = list(html);
  expect(items).toContain('<span class="c-n" aria-hidden="true">001</span>');
  expect(items).toContain('<span class="c-n" aria-hidden="true">002</span>');
  expect(items.indexOf("Marta")).toBeLessThan(items.indexOf("Luca"));
  expect(items).toContain(
    '<div class="c-reply"><span class="fine">Filippo replied</span><p lang="en">Thanks, Luca.</p></div>',
  );
  expect(items).not.toContain("Pending");
  expect(items).not.toContain("Rejected");
  expect(html).toMatch(/<span data-slot="comment-count">\(2\)<\/span>/);
  expect(items).not.toContain("luca@example.com"); // the email is never shown
});

test("one thread per slug: the same comments on both language versions", async () => {
  const { slug, en, it } = await twinEntry();
  await insertComment({ slug, lang: "it", name: "Giulia", body: "Che bello." });
  expect(list(await page(en))).toContain("Giulia");
  const italian = list(await page(it));
  expect(italian).toContain("Giulia");
  expect(italian).toContain('<p class="c-body" lang="it">Che bello.</p>');
});

test("injection: a script tag and an onerror attribute render as visible text", async () => {
  const { slug, en } = await twinEntry();
  await insertComment({
    slug,
    name: '<img src=x onerror="alert(1)">',
    body: "<script>alert(1)</script>\n<img src=x onerror=alert(1)>",
    reply_body: "<b onmouseover=alert(1)>hi</b>",
  });
  const html = await page(en);
  const items = list(html);
  expect(items).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(items).toContain("&lt;img src=x onerror=alert(1)&gt;");
  // In text, quotes need no escaping; < > & are what matter.
  expect(items).toContain('&lt;img src=x onerror="alert(1)"&gt;');
  expect(items).toContain("&lt;b onmouseover=alert(1)&gt;hi&lt;/b&gt;");
  // No element was created: the only "<" left are the markup the Worker writes itself.
  expect(items).not.toMatch(/<script|<img|<b /i);
  // The page still has exactly the one inline script it was built with.
  expect(html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g)?.length).toBe(1);
});

test("paragraphs and line breaks in a comment survive as markup, not as text", async () => {
  const { slug, en } = await twinEntry();
  await insertComment({ slug, body: "One.\nStill one.\n\nTwo." });
  const items = list(await page(en));
  expect(items).toContain('<p class="c-body" lang="en">One.<br>Still one.</p><p class="c-body" lang="en">Two.</p>');
});

test("pages that are not entries get no comments", async () => {
  await insertComment({ slug: "about" });
  expect(await page("/about")).not.toContain('class="c"');
});

test("fail open: if the database fails, the page is served as built, with its token", async () => {
  const { slug, en } = await twinEntry();
  await insertComment({ slug, name: "Marta" });
  await env.DB.exec("ALTER TABLE comments RENAME TO comments_away");
  try {
    const res = await SELF.fetch(`${ORIGIN}${en}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<ol class="clist" data-slot="comments"></ol>');
    expect(html).toMatch(/name="token" value="v1\./);
  } finally {
    await env.DB.exec("ALTER TABLE comments_away RENAME TO comments");
  }
});
