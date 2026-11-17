/**
 * The launch gate (project `launch`, `pnpm test:launch`). Not part of the staging run: these fail until the owner has
 * answered O1 (TICKETS.md): no bracketed placeholder anywhere (scripts/lib/placeholders.ts), a filled sameAs list, real descriptions. Run it
 * against a production build (`pnpm qa:production`) so it also proves no page is noindex.
 */
import { expect, test } from "@playwright/test";
import { findPlaceholders } from "../../../scripts/lib/placeholders.ts";
import { builtPages, readBuilt } from "./lib.ts";

// Which bracketed gaps count, and why: scripts/lib/placeholders.ts (decision 0022, "Round 4"). It lists the words
// `placeholder` and `segnaposto` inside any bracket, and the field names `[city]`, `[launch date]`, `[your contact
// email]`, `[la tua email di contatto]` … so the privacy and rights pages, About and Home cannot slip through.
test("no page has unfilled placeholder text, in the body, the title or the description", () => {
  const found: string[] = [];
  for (const p of builtPages()) {
    if (p.file === "styleguide.html") continue;
    for (const text of findPlaceholders(readBuilt(p.file))) found.push(`${p.path}: ${text}`);
  }
  expect(found, "every line is a page and the bracketed text the owner still has to replace (O1)").toEqual([]);
});

test("Person JSON-LD has a sameAs list of https profiles (home and About, both languages)", () => {
  const problems: string[] = [];
  for (const file of ["index.html", "it.html", "about.html", "it/about.html"]) {
    const html = readBuilt(file);
    const person = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1] ?? "") as Record<string, unknown>)
      .find((b) => b["@type"] === "Person");
    const same = person?.["sameAs"];
    if (!Array.isArray(same) || same.length === 0) problems.push(`${file}: sameAs is ${JSON.stringify(same)}`);
    else for (const u of same) if (!/^https:\/\//.test(String(u))) problems.push(`${file}: ${String(u)}`);
  }
  expect(problems).toEqual([]);
});

// TO-03: the guide's SEO checklist wants an image in the Person data. It is the real portrait (site.json "portrait"),
// never the placeholder frame, so this fails until the owner has one, like the placeholders and sameAs above.
test("Person JSON-LD has the portrait as its image (home and About, both languages)", () => {
  const problems: string[] = [];
  for (const file of ["index.html", "it.html", "about.html", "it/about.html"]) {
    const html = readBuilt(file);
    const person = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1] ?? "") as Record<string, unknown>)
      .find((b) => b["@type"] === "Person");
    const image = person?.["image"];
    if (typeof image !== "string" || !/^https:\/\/philglov\.es\//.test(image))
      problems.push(`${file}: image is ${JSON.stringify(image)}`);
  }
  expect(problems).toEqual([]);
});

// The guide asks for /.well-known/security.txt (security audit, decision 0030). Its Contact is site.json contactEmail,
// a placeholder until O1 is answered, so this fails until then; Expires must be ahead, as RFC 9116 requires.
test("security.txt names a real contact and has not expired", () => {
  const text = readBuilt(".well-known/security.txt");
  const contact = /^Contact: (.+)$/m.exec(text)?.[1] ?? "";
  const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? "");
  expect(contact, "site.json contactEmail is still the placeholder (O1)").toMatch(
    /^(mailto:[^\s@[\]]+@[^\s@[\]]+|https:\/\/\S+)$/,
  );
  expect(findPlaceholders(text)).toEqual([]);
  expect(expires).toBeGreaterThan(Date.now() + 30 * 86_400_000);
});

test("production: no page or image says noindex", async ({ request }) => {
  const problems: string[] = [];
  for (const p of builtPages().filter((x) => x.indexable)) {
    const h = (await request.get(p.path)).headers()["x-robots-tag"] ?? "";
    if (/noindex/.test(h)) problems.push(`${p.path}: X-Robots-Tag ${h}`);
  }
  expect(problems, "serve a SITE_ENV=production build: pnpm qa:production").toEqual([]);
});
