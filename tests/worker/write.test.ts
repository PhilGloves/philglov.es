/**
 * /admin/write (B8): uploads to R2, drafts, the entry file, and Publish through the GitHub App (stand-in in
 * vitest.config.ts; /__set changes files, open pull requests, auto-merge and write refusals). Publishing goes live
 * by itself and published entries are edited from the phone (decision 0021).
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { sniff } from "../../worker/src/admin/upload.ts";
import { ATTENTION_AFTER, entryRows } from "../../worker/src/admin/write.ts";
import {
  entryMarkdown,
  parseEntry,
  photoName,
  readEntry,
  slugFromTitle,
  splitPhotos,
  validateEntry,
  type EntryInput,
} from "../../worker/src/entry-file.ts";
import type { Entry } from "../../worker/src/manifest.ts";
import { VARIANTS } from "./frontmatter-variants.ts";
import { adminFetch, adminPost, csrf, resetDb, siteManifest, twinEntry } from "./helpers.ts";

// The GitHub stand-in (vitest.config.ts) is shared by every test file, so all the tests that use it live in this
// one file, where they run one after another.
beforeEach(async () => {
  await resetDb();
  await fetch("https://api.github.com/__reset");
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const GIF = new TextEncoder().encode("GIF89a......");

const put = async (slug: string, name: string, body: Uint8Array, token?: string, length = body.length) =>
  adminFetch(`/admin/upload?slug=${slug}&name=${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "X-CSRF-Token": token ?? (await csrf()), "Content-Length": String(length) },
    body,
  });

describe("photo upload", () => {
  test("file signatures decide the type, never the name", () => {
    expect(sniff(JPEG)).toBe("jpg");
    expect(sniff(PNG)).toBe("png");
    expect(sniff(GIF)).toBeNull();
    expect(sniff(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  test("a JPEG goes to philglov-originals/<slug>/ with a safe name", async () => {
    const res = await put("alps", "IMG 2041 (1).HEIC.jpg", JPEG);
    expect(res.status).toBe(200);
    const { key } = await res.json<{ key: string }>();
    expect(key).toBe("alps/img-2041-1-heic.jpg");
    const object = await env.ORIGINALS.get(key);
    expect(object?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(JPEG);
  });

  test("a GIF named .jpg is refused", async () => {
    expect((await put("alps", "cat.jpg", GIF)).status).toBe(415);
  });

  test("over 25 MB is refused before reading", async () => {
    expect((await put("alps", "big.jpg", JPEG, undefined, 25 * 1024 * 1024 + 1)).status).toBe(413);
  });

  test("needs a valid slug and the CSRF token", async () => {
    expect((await put("Not A Slug", "a.jpg", JPEG)).status).toBe(400);
    expect((await put("alps", "a.jpg", JPEG, "v1.bad.token")).status).toBe(403);
  });

  test("photo names: lowercase, no path, extension from the signature", () => {
    expect(photoName("../../etc/passwd", "png")).toBe("etc-passwd.png");
    expect(photoName("", "jpg")).toBe("photo.jpg");
  });
});

describe("the entry file", () => {
  const photo = { key: "lisbona-due/tram.jpg", alt: "Il tram 28 [giallo]", caption: 'Alfama, "mattina"' };
  const base = {
    title: "Tre settimane a Lisbona",
    slug: "lisbona-due",
    lang: "it" as const,
    description: 'Una frase con "virgolette".',
    body: "Testo.\n\n## Titoletto",
    photos: [photo],
  };

  test("slugs are suggested from titles", () => {
    expect(slugFromTitle("Tre settimane a Lisbona, già!")).toBe("tre-settimane-a-lisbona-gia");
    expect(slugFromTitle("Città   più  bella del mondo intero")).toBe("citta-piu-bella-del-mondo");
    expect(slugFromTitle("???")).toBe("");
  });

  test("valid input passes; reserved slugs and photos without alt text do not", () => {
    expect(validateEntry(base, ["about"])).toEqual({});
    expect(validateEntry({ ...base, slug: "about" }, ["about"]).slug).toMatch(/reserved/);
    expect(validateEntry({ ...base, slug: "Bad Slug" }, []).slug).toBeDefined();
    expect(validateEntry({ ...base, description: "" }, []).description).toBeDefined();
    expect(validateEntry({ ...base, photos: [{ ...photo, alt: "" }] }, []).photos).toMatch(/alt text/);
    expect(validateEntry({ ...base, photos: [{ ...photo, key: "other/tram.jpg" }] }, []).photos).toBeDefined();
  });

  test("Markdown with frontmatter the schema accepts, photos as images with alt text and caption", () => {
    const text = entryMarkdown(base, "it", "2026-11-12");
    expect(text).toBe(
      [
        "---",
        'title: "Tre settimane a Lisbona"',
        "date: 2026-11-12",
        "lang: it",
        "originalLang: it",
        'description: "Una frase con \\"virgolette\\"."',
        "comments: true",
        "---",
        "",
        "Testo.\n\n## Titoletto\n\n" +
          '![Il tram 28 \\[giallo\\]](../../../.originals/lisbona-due/tram.jpg "Alfama, \\"mattina\\"")',
        "",
      ].join("\n"),
    );
    expect(parseEntry(text)).toMatchObject({
      title: base.title,
      description: base.description,
      lang: "it",
      originalLang: "it",
    });
    // Topics are gone (decision 0023): nothing writes a tags line.
    expect(text).not.toContain("tags");
  });

  test("the slug falls back to the title; a posted topic is ignored", () => {
    const form = new URLSearchParams("title=Alpi+d%27inverno&slug=&lang=it&tags=travel&body=x&description=y");
    const entry = readEntry(form);
    expect(entry).toMatchObject({ slug: "alpi-d-inverno" });
    expect(entry).not.toHaveProperty("tags");
  });
});

describe("drafts and publishing", () => {
  test("Save draft stores it in D1 and opens it again", async () => {
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "save",
      title: "Alpi d'inverno",
      lang: "it",
      body: "Bozza.",
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("Location") ?? "";
    // A first save: the text moved from the new-entry form's browser copy, which the draft page removes (SO-03).
    expect(location).toMatch(/^\/admin\/write\?draft=[A-Za-z0-9_-]{22}&saved=1&moved=new$/);
    const row = await env.DB.prepare("SELECT slug, title, body FROM drafts").first();
    expect(row).toEqual({ slug: "alpi-d-inverno", title: "Alpi d'inverno", body: "Bozza." });
    const page = await (await adminFetch(location)).text();
    expect(page).toContain("Draft saved on the server.");
    expect(page).toContain('value="Alpi d&#39;inverno"');
    expect(page).toContain('data-moved="new"');
    // Saving the same draft again moves nothing; a "moved" that is not one of the form's keys is ignored.
    const id = /draft=([^&]+)/.exec(location)?.[1] ?? "";
    const again = await adminPost("/admin/write", { csrf: await csrf(), intent: "save", draft_id: id, title: "T" });
    expect(again.headers.get("Location")).toBe(`/admin/write?draft=${id}&saved=1`);
    const odd = await (await adminFetch(`/admin/write?draft=${id}&moved=..%2Fother`)).text();
    expect(odd).toContain('data-moved=""');
  });

  test("BUG-4: Save draft skips the browser's checks (a half-written entry is a draft); Publish keeps them", async () => {
    const page = await (await adminFetch("/admin/write")).text();
    expect(page).toMatch(/<button type="submit" name="intent" value="save" class="btn btn--ghost" formnovalidate>/);
    expect(page).toMatch(/<button type="submit" name="intent" value="publish" class="btn">/);
    expect(page).toMatch(/id="w-desc"\s+name="description"\s+maxlength="200"\s+required/);
    const res = await adminPost("/admin/write", { csrf: await csrf(), intent: "save", title: "Half", body: "A few." });
    expect(res.status).toBe(303);
    expect(await env.DB.prepare("SELECT description FROM drafts").first("description")).toBe("");
  });

  test("the file input accepts exactly image/jpeg,image/png, and the form loads the admin script", async () => {
    const page = await (await adminFetch("/admin/write")).text();
    expect(page).toContain('accept="image/jpeg,image/png"');
    expect(page).not.toContain("image/*");
    expect(page).toContain('<script src="/admin/write.js" defer></script>');
  });

  test("Publish with errors answers 422 and keeps the text", async () => {
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "publish",
      title: "",
      lang: "en",
      body: "Kept.",
    });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("Not published.");
    expect(html).toContain(">\nKept.</textarea");
  });

  test("Publish a new entry: branch, file and pull request through the App", async () => {
    await fetch("https://api.github.com/__reset");
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "publish",
      title: "A new one",
      slug: "a-new-one",
      lang: "en",
      description: "One sentence.",
      body: "Hello.",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("https://github.com/test/repo/pull/99");
    const calls = await (
      await fetch("https://api.github.com/__recorded")
    ).json<{ method: string; path: string; body: Record<string, string> }[]>();
    const write = calls.find((c) => c.method === "PUT");
    expect(write?.path).toBe("/repos/PhilGloves/philglov.es/contents/src/content/journal/en/a-new-one.md");
    const text = atob(write?.body["content"] ?? "");
    expect(text).toMatch(/^---\ntitle: "A new one"\ndate: \d{4}-\d{2}-\d{2}\nlang: en\noriginalLang: en\n/);
    expect(write?.body["sha"]).toBeUndefined();
    const pr = calls.find((c) => c.path.endsWith("/pulls"));
    expect(pr?.body).toMatchObject({ base: "main", title: "New entry en/a-new-one: A new one" });
    expect(pr?.body["head"]).toMatch(/^publish\/en-a-new-one-\d{14}$/);
    const everything = await (await fetch("https://api.github.com/__recorded?all")).json<typeof calls>();
    const tokenCall = everything.find((c) => c.path.includes("/access_tokens"));
    expect(tokenCall?.body).toEqual({
      repositories: ["philglov.es"],
      permissions: { contents: "write", pull_requests: "write" },
    });
  });

  test("same slug, other language: the other-language version, originalLang from the existing file", async () => {
    const m = await siteManifest();
    const single = m.entries.find((e) => !m.entries.some((o) => o.slug === e.slug && o.lang !== e.lang));
    if (!single) throw new Error("the build has no one-language entry");
    const lang = single.lang === "en" ? "it" : "en";
    const lookup = await (
      await adminFetch(`/admin/write/reference?slug=${single.slug}&lang=${lang}`)
    ).json<{ kind: string; reference: string; originalLang: string }>();
    expect(lookup.kind).toBe("translation");
    expect(lookup.originalLang).toBe(single.originalLang);
    expect(lookup.reference).toContain(`lang: ${single.lang}`);

    await fetch("https://api.github.com/__reset");
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "publish",
      title: "Versione scritta a mano",
      slug: single.slug,
      lang,
      description: "Una frase.",
      body: "Testo.",
    });
    expect(res.status).toBe(200);
    const calls = await (
      await fetch("https://api.github.com/__recorded")
    ).json<{ method: string; body: Record<string, string> }[]>();
    const text = atob(calls.find((c) => c.method === "PUT")?.body["content"] ?? "");
    expect(text).toContain(`lang: ${lang}\noriginalLang: ${single.originalLang}\n`);
  });

  test("same slug, same language: refused unless the existing entry was opened for editing", async () => {
    const { slug } = await twinEntry();
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "publish",
      title: "Overwrite",
      slug,
      lang: "en",
      description: "x",
      body: "x",
    });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain(`<a href="/admin/write?edit=1&amp;slug=${slug}&amp;lang=en">Edit it</a>`);

    const edit = await (await adminFetch(`/admin/write?slug=${slug}&lang=en&edit=1`)).text();
    const sha = /name="base_sha" value="([^"]+)"/.exec(edit)?.[1];
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test("a photo that never reached R2 blocks Publish", async () => {
    const res = await adminPost("/admin/write", {
      csrf: await csrf(),
      intent: "publish",
      title: "With photo",
      slug: "with-photo",
      lang: "en",
      description: "x",
      body: "x",
      photo_key: "with-photo/missing.jpg",
      photo_alt: "A missing photo",
      photo_caption: "",
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Not uploaded yet: with-photo/missing.jpg");
  });
});

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

const gh = (path: string, body?: unknown) =>
  fetch(`https://api.github.com${path}`, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
const calls = async (): Promise<Call[]> => (await gh("/__recorded")).json<Call[]>();
const blobSha = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const SLUG = "phone-edit";
const PATH = `src/content/journal/en/${SLUG}.md`;
/** A published entry as /admin/write wrote it, with comments off and two photos after the text. */
const PUBLISHED = [
  "---",
  'title: "Città on foot"',
  "date: 2026-10-02",
  "lang: en",
  "originalLang: it",
  'description: "A walk."',
  "tags: [travel, photography]",
  "comments: false",
  "---",
  "",
  "First paragraph.",
  "",
  "Second, with ![an inline photo](../../../.originals/phone-edit/inline.jpg) inside.",
  "",
  '![A square \\[at dawn\\]](../../../.originals/phone-edit/square.jpg "Piazza, \\"early\\"")',
  "",
  "![The river](../../../.originals/phone-edit/river.png)",
  "",
].join("\n");

const newEntry = {
  intent: "publish",
  title: "A new one",
  slug: "a-new-one",
  lang: "en",
  description: "One sentence.",
  body: "Hello.",
};

describe("Publish goes live by itself", () => {
  test("the pull request gets auto-merge (merge commit), and the page says when and where it will be live", async () => {
    const res = await adminPost("/admin/write", { csrf: await csrf(), ...newEntry });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The entry will be live in a few minutes at");
    expect(html).toContain('<a href="/a-new-one">/a-new-one</a>');
    expect(html).toContain('<a href="https://github.com/test/repo/pull/99">the pull request</a>');
    const merge = (await calls()).find((c) => c.path === "/graphql");
    expect(merge?.method).toBe("POST");
    expect(merge?.body["query"]).toMatch(
      /enablePullRequestAutoMerge\(input: \{ pullRequestId: \$id, mergeMethod: MERGE \}\)/,
    );
    expect(merge?.body["variables"]).toEqual({ id: "PR_node99" });
    const pr = (await calls()).find((c) => c.method === "POST" && c.path.endsWith("/pulls"));
    expect(pr?.body["body"]).toContain("It merges by itself once the Test check passes");
  });

  test("auto-merge refused: the pull request is open, and the page says to merge it by hand", async () => {
    await gh("/__set", { autoMergeRefused: true });
    const res = await adminPost("/admin/write", { csrf: await csrf(), ...newEntry });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("It will not go live by itself:");
    expect(html).toContain("(GitHub: auto-merge, 422)");
    expect(html).toContain('href="https://github.com/test/repo/pull/99"');
  });

  test("/admin/write lists the publisher's open pull requests; after 15 minutes as needing attention", async () => {
    const minutes = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
    await gh("/__set", {
      pulls: [
        {
          html_url: "https://github.com/x/y/pull/7",
          title: "Edit en/alps: Alps",
          created_at: minutes(20),
          user: { login: "philglov-publisher[bot]" },
        },
        {
          html_url: "https://github.com/x/y/pull/8",
          title: "New entry it/lago: Lago",
          created_at: minutes(2),
          user: { login: "philglov-publisher[bot]" },
        },
        {
          html_url: "https://github.com/x/y/pull/9",
          title: "Dependabot bump",
          created_at: minutes(90),
          user: { login: "dependabot[bot]" },
        },
      ],
    });
    const html = await (await adminFetch("/admin/write")).text();
    const card = (n: number) => html.slice(html.lastIndexOf("<li", html.indexOf(`pull/${n}`))).split("</li>")[0] ?? "";
    expect(card(7)).toContain('data-publication="attention"');
    expect(card(7)).toContain('<span class="badge badge--bad">needs attention</span>');
    expect(card(7)).toContain("Still not merged after 15 minutes.");
    expect(card(8)).toContain('data-publication="pending"');
    expect(card(8)).toContain("going live");
    expect(html).not.toContain("pull/9");
    expect(ATTENTION_AFTER).toBe(15 * 60_000);
    const list = (await calls()).find((c) => c.method === "GET" && c.path.includes("/pulls?"));
    expect(list?.path).toBe(
      "/repos/PhilGloves/philglov.es/pulls?state=open&base=main&sort=created&direction=asc&per_page=50",
    );
  });

  test("nothing open: no section; GitHub unreachable: one quiet line, and the form still works", async () => {
    expect(await (await adminFetch("/admin/write")).text()).not.toContain("On their way");
    await gh("/__set", { pulls: "not a list" });
    const html = await (await adminFetch("/admin/write")).text();
    expect(html).toContain("Could not ask GitHub which entries are still on their way.");
    expect(html).toContain('id="write-form"');
  });
});

describe("the list of published entries", () => {
  const e = (title: string, date: string, lang: "en" | "it" = "en"): Entry => ({
    slug: title.toLowerCase().replace(/\W+/g, "-"),
    lang,
    originalLang: lang,
    path: "/x",
    title,
    date,
    comments: true,
  });

  const titles = (rows: ReturnType<typeof entryRows>) =>
    rows.map((r) => [r.versions.en?.title ?? "-", r.versions.it?.title ?? "-"].join(" | "));

  test("one row per entry, newest first; the search matches either title, any case, accents ignored", () => {
    const entries = [
      e("Alps in winter", "2026-01-05"),
      e("Città vecchia", "2026-09-01", "it"),
      e("Lisbon", "2026-03-10"),
      { ...e("Tre settimane", "2026-03-10", "it"), slug: "lisbon" },
    ];
    expect(titles(entryRows(entries, ""))).toEqual([
      "- | Città vecchia",
      "Lisbon | Tre settimane",
      "Alps in winter | -",
    ]);
    expect(titles(entryRows(entries, "CITTA"))).toEqual(["- | Città vecchia"]);
    expect(titles(entryRows(entries, "settimane"))).toEqual(["Lisbon | Tre settimane"]);
    expect(titles(entryRows(entries, " in "))).toEqual(["Alps in winter | -"]);
    expect(entryRows(entries, "nothing")).toEqual([]);
  });

  test("/admin/write shows the built entries, each opening the edit form; ?q= filters", async () => {
    const m = await siteManifest();
    expect(m.entries.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))).toBe(true);
    const html = await (await adminFetch("/admin/write")).text();
    expect(html).toContain("Edit a published entry");
    const newest = Object.values(entryRows(m.entries, "")[0]?.versions ?? {})[0];
    if (!newest) throw new Error("the build has no entries");
    expect(html).toContain(`href="/admin/write?edit=1&amp;slug=${newest.slug}&amp;lang=${newest.lang}"`);
    const one = await (await adminFetch(`/admin/write?q=${encodeURIComponent(newest.title)}`)).text();
    expect(one).toContain(`value="${newest.title.replace(/'/g, "&#39;")}"`);
    const none = await (await adminFetch("/admin/write?q=zzzz-no-such-title")).text();
    expect(none).toContain("No published entry has that in its title.");
  });
});

describe("editing a published entry", () => {
  const open = async () => {
    await gh("/__set", { files: { [PATH]: PUBLISHED } });
    return (await adminFetch(`/admin/write?edit=1&slug=${SLUG}&lang=en`)).text();
  };
  const fields = (html: string) => ({
    csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? "",
    base_sha: /name="base_sha" value="([^"]*)"/.exec(html)?.[1] ?? "",
  });
  const save = (base: { csrf: string; base_sha: string }, over: Record<string, string> = {}, photos = true) => {
    const form = new URLSearchParams({
      ...base,
      intent: "publish",
      title: "Città on foot, again",
      slug: SLUG,
      lang: "en",
      description: "A longer walk.",
      body: "First paragraph, rewritten.",
      ...over,
    });
    for (const [key, alt, caption] of photos
      ? [
          ["phone-edit/square.jpg", "A square [at dawn]", 'Piazza, "early"'],
          ["phone-edit/river.png", "The river", ""],
        ]
      : []) {
      form.append("photo_key", key ?? "");
      form.append("photo_alt", alt ?? "");
      form.append("photo_caption", caption ?? "");
    }
    return adminFetch("/admin/write", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  };
  const uploaded = () =>
    Promise.all(["phone-edit/square.jpg", "phone-edit/river.png"].map((k) => env.ORIGINALS.put(k, "x")));

  test("opens in the same form: title, text, photos with alt text and captions; slug and language fixed", async () => {
    const html = await open();
    expect(html).toContain("<title>Edit · philglov.es admin</title>");
    expect(html).toContain('value="Città on foot"');
    expect(html).toContain('value="A walk."');
    // No topics (decision 0023): the file's old tags line is not shown (and kept in the file as it was, 0027).
    expect(html).not.toContain('name="tags"');
    expect(html).not.toContain("Topics");
    // The text keeps the inline photo; the two photos after it become photo items.
    expect(html).toContain(
      "First paragraph.\n\nSecond, with ![an inline photo](../../../.originals/phone-edit/inline.jpg) inside.</textarea",
    );
    expect(html).toContain('name="photo_key" value="phone-edit/square.jpg"');
    expect(html).toContain('value="A square [at dawn]"');
    expect(html).toContain('value="Piazza, &quot;early&quot;"');
    expect(html).toContain('name="photo_key" value="phone-edit/river.png"');
    expect(html).toContain('<input id="w-slug" name="slug" readonly value="phone-edit"');
    expect(html).toContain('<input type="hidden" id="w-lang" name="lang" value="en" />');
    expect(html).not.toContain('<select id="w-lang"');
    expect(html).toContain(">Save changes</button>");
    expect(html).toContain('data-draft="edit-en-phone-edit"');
    expect(fields(html).base_sha).toBe(await blobSha(PUBLISHED));
  });

  test("Save changes: one pull request that replaces only that file, from the version opened, with auto-merge", async () => {
    const base = fields(await open());
    await uploaded();
    await gh("/__reset");
    await gh("/__set", { files: { [PATH]: PUBLISHED } });
    const res = await save(base);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Your changes will be live in a few minutes at");
    expect(html).toContain('<a href="/phone-edit">/phone-edit</a>');
    const all = await calls();
    const writes = all.filter((c) => c.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(`/repos/PhilGloves/philglov.es/contents/${PATH}`);
    expect(writes[0]?.body["sha"]).toBe(base.base_sha);
    const text = new TextDecoder().decode(
      Uint8Array.from(atob(String(writes[0]?.body["content"])), (c) => c.charCodeAt(0)),
    );
    // Only the two changed lines are rewritten, in place; every other line is the file's own, the old tags line
    // included (SO-01, decision 0027); the photos come back after the text.
    expect(text).toBe(
      [
        "---",
        'title: "Città on foot, again"',
        "date: 2026-10-02",
        "lang: en",
        "originalLang: it",
        'description: "A longer walk."',
        "tags: [travel, photography]",
        "comments: false",
        "---",
        "",
        "First paragraph, rewritten.",
        "",
        '![A square \\[at dawn\\]](../../../.originals/phone-edit/square.jpg "Piazza, \\"early\\"")',
        "",
        "![The river](../../../.originals/phone-edit/river.png)",
        "",
      ].join("\n"),
    );
    const pr = all.find((c) => c.method === "POST" && c.path.endsWith("/pulls"));
    expect(pr?.body["title"]).toBe("Edit en/phone-edit: Città on foot, again");
    expect(pr?.body["head"]).toMatch(/^publish\/en-phone-edit-\d{14}$/);
    expect(all.some((c) => c.path === "/graphql")).toBe(true);
  });

  test("changed on GitHub since it was opened: refused with a clear message, nothing written", async () => {
    const base = fields(await open());
    await uploaded();
    await gh("/__set", { files: { [PATH]: PUBLISHED.replace("A walk.", "Changed from the laptop.") } });
    await gh("/__reset");
    await gh("/__set", { files: { [PATH]: PUBLISHED.replace("A walk.", "Changed from the laptop.") } });
    const res = await save(base);
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain("Not saved: /phone-edit changed on GitHub since you opened it.");
    expect(html).toContain("Nothing was overwritten.");
    // The text is kept in the form.
    expect(html).toContain("First paragraph, rewritten.</textarea");
    expect((await calls()).some((c) => c.method === "PUT" || c.path.endsWith("/pulls"))).toBe(false);
  });

  test("changed between the check and the write: GitHub's 409 gives the same message", async () => {
    const base = fields(await open());
    await uploaded();
    await gh("/__set", { writeConflict: true });
    const res = await save(base);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("changed on GitHub since you opened it");
    expect((await calls()).some((c) => c.method === "POST" && c.path.endsWith("/pulls"))).toBe(false);
  });

  test("the slug and the language cannot be changed while editing", async () => {
    const base = fields(await open());
    await uploaded();
    await gh("/__reset");
    await gh("/__set", { files: { [PATH]: PUBLISHED } });
    // Another slug: its photos no longer match (422) and no file has that version (409). Another language: 409.
    expect((await save(base, { slug: "another-slug" })).status).toBe(422);
    expect((await save(base, { slug: "another-slug" }, false)).status).toBe(409);
    expect((await save(base, { lang: "it" })).status).toBe(409);
    expect((await calls()).some((c) => c.method === "PUT")).toBe(false);
  });

  test("a new entry on an existing slug is still refused, with a link to edit it", async () => {
    await gh("/__set", { files: { [PATH]: PUBLISHED } });
    const res = await adminPost("/admin/write", { csrf: await csrf(), ...newEntry, slug: SLUG });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain(`href="/admin/write?edit=1&amp;slug=${SLUG}&amp;lang=en">Edit it</a>`);
  });

  test("Save draft while editing keeps the edit: it reopens with the slug fixed and the version it started from", async () => {
    const base = fields(await open());
    const res = await adminPost("/admin/write", {
      ...base,
      intent: "save",
      title: "Half done",
      slug: SLUG,
      lang: "en",
      body: "Half.",
    });
    expect(res.status).toBe(303);
    const row = await env.DB.prepare("SELECT base_sha FROM drafts").first<{ base_sha: string }>();
    expect(row?.base_sha).toBe(base.base_sha);
    expect(res.headers.get("Location")).toMatch(/&moved=edit-en-phone-edit$/);
    const html = await (await adminFetch(res.headers.get("Location") ?? "")).text();
    expect(html).toContain('data-moved="edit-en-phone-edit"');
    expect(html).toContain("Editing <a");
    expect(html).toContain('<input id="w-slug" name="slug" readonly value="phone-edit"');
    expect(html).toContain(`name="base_sha" value="${base.base_sha}"`);
    expect(html).toContain("edit of a published entry");
  });

  test("an edit link with a slug that is not a slug reads nothing", async () => {
    const html = await (await adminFetch("/admin/write?edit=1&slug=..%2F..%2F.github%2Fworkflows%2Fci&lang=en")).text();
    expect(html).not.toContain("Editing");
    expect((await calls()).some((c) => c.path.includes("contents"))).toBe(false);
  });

  test("a file with frontmatter the page cannot read is not opened for editing", async () => {
    await gh("/__set", { files: { [PATH]: "no frontmatter here" } });
    const html = await (await adminFetch(`/admin/write?edit=1&slug=${SLUG}&lang=en`)).text();
    expect(html).toContain("/phone-edit cannot be edited here:</strong> its front matter is missing");
    expect(html).toContain("Edit it on the laptop");
    expect(html).toContain('name="base_sha" value=""');
  });

  // SO-01: laptop files in every valid form, opened, edited (the text only) and published from the phone.
  const unescape = (s: string) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const frontOf = (text: string) => text.slice(0, text.search(/\r?\n---\r?\n/));
  for (const [name, v] of Object.entries(VARIANTS)) {
    for (const eol of ["\n", "\r\n"]) {
      test(`front matter survives open, edit and publish: ${name}${eol === "\n" ? "" : " (CRLF)"}`, async () => {
        const text = ["---", ...v.lines, "---", "", "The laptop's text.", ""].join(eol);
        await gh("/__set", { files: { [PATH]: text } });
        const html = await (await adminFetch(`/admin/write?edit=1&slug=${SLUG}&lang=en`)).text();
        const sent = { ...fields(html), intent: "publish", slug: SLUG, lang: "en" };
        if (!v.editable) {
          // Not opened, nothing guessed, and a publish aimed at that version is refused too.
          expect(html).toContain("/phone-edit cannot be edited here:");
          expect(html).toContain("Edit it on the laptop");
          expect(sent.base_sha).toBe("");
          const res = await adminPost("/admin/write", {
            ...sent,
            base_sha: await blobSha(text),
            title: "Guessed",
            description: "Guessed.",
            body: "The phone's text.",
          });
          expect(res.status).toBe(422);
          expect(await res.text()).toContain("cannot be edited here");
          expect((await calls()).some((c) => c.method === "PUT")).toBe(false);
          return;
        }
        const shown = (id: string) => unescape(new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html)?.[1] ?? "");
        expect(sent.base_sha).toBe(await blobSha(text));
        const res = await adminPost("/admin/write", {
          ...sent,
          title: shown("w-title"),
          description: shown("w-desc"),
          body: "The phone's text,\r\nas a browser sends it.",
        });
        expect(res.status).toBe(200);
        const writes = (await calls()).filter((c) => c.method === "PUT");
        expect(writes).toHaveLength(1);
        const out = new TextDecoder().decode(
          Uint8Array.from(atob(String(writes[0]?.body["content"])), (c) => c.charCodeAt(0)),
        );
        // Every front matter line byte for byte (date, comments, languages, YAML comments, quotes, line ends) ...
        expect(frontOf(out)).toBe(frontOf(text));
        // ... and only the text changed, in the file's own line ends.
        expect(out).toBe(text.replace("The laptop's text.", `The phone's text,${eol}as a browser sends it.`));
      });
    }
  }
});

// Decision 0029: the other-language version of a published entry is written from the entry itself, with its slug,
// its photos (the same stored keys) and the existing version for reference. Nothing is translated (0012).
describe("writing the other-language version of a published entry", () => {
  const TWIN = "two-langs";
  const EN = `src/content/journal/en/${TWIN}.md`;
  const EN_TEXT = [
    "---",
    'title: "The harbour"',
    "date: 2026-10-02",
    "lang: en",
    "originalLang: en",
    'description: "A morning by the water."',
    "comments: true",
    "---",
    "",
    "Text in English.",
    "",
    '![Boats at dawn](../../../.originals/two-langs/boats.jpg "The old port")',
    "",
    "![A crane over the quay](../../../.originals/two-langs/crane.png)",
    "",
  ].join("\n");
  const KEYS = ["two-langs/boats.jpg", "two-langs/crane.png"];
  const versionForm = async (query = "") => {
    await gh("/__set", { files: { [EN]: EN_TEXT } });
    return (await adminFetch(`/admin/write?edit=1&slug=${TWIN}&lang=it${query}`)).text();
  };
  const hidden = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? "";
  const post = (fields: Record<string, string>, photos: [string, string, string][] = []) => {
    const form = new URLSearchParams(fields);
    for (const [key, alt, caption] of photos) {
      form.append("photo_key", key);
      form.append("photo_alt", alt);
      form.append("photo_caption", caption);
    }
    return adminFetch("/admin/write", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  };
  const fromForm = (html: string, over: Record<string, string>) => ({
    csrf: hidden(html, "csrf"),
    draft_id: hidden(html, "draft_id"),
    base_sha: hidden(html, "base_sha"),
    twin: hidden(html, "twin"),
    opened: hidden(html, "opened"),
    slug: TWIN,
    lang: "it",
    ...over,
  });
  const written = async () => {
    const put = (await calls()).find((c) => c.method === "PUT");
    return {
      path: put?.path ?? "",
      text: new TextDecoder().decode(Uint8Array.from(atob(String(put?.body["content"])), (c) => c.charCodeAt(0))),
    };
  };

  test("the list has one row per entry, with both languages; a missing one is a link to write it", async () => {
    const m = await siteManifest();
    const html = await (await adminFetch("/admin/write")).text();
    const { slug } = await twinEntry();
    const row = (s: string) => {
      const start = html.indexOf(`data-entry="${s}"`);
      return start < 0 ? "" : html.slice(start, html.indexOf("</li>\n", html.indexOf("</ul>", start)));
    };
    // A slug in both languages: one row, both versions linked to their edit forms.
    expect(html.split(`data-entry="${slug}"`)).toHaveLength(2);
    expect(row(slug)).toContain(`href="/admin/write?edit=1&amp;slug=${slug}&amp;lang=en"`);
    expect(row(slug)).toContain(`href="/admin/write?edit=1&amp;slug=${slug}&amp;lang=it"`);
    // A slug in one language: its row says the other is missing, as a link that writes it.
    for (const single of m.entries.filter((e) => !m.entries.some((o) => o.slug === e.slug && o.lang !== e.lang))) {
      const missing = single.lang === "en" ? "it" : "en";
      expect(row(single.slug)).toContain(
        `<a href="/admin/write?edit=1&amp;slug=${single.slug}&amp;lang=${missing}">Write the ${
          missing === "en" ? "English" : "Italian"
        } version</a>`,
      );
    }
  });

  test("its link opens the form: slug fixed, text empty, the existing version for reference, the same photos", async () => {
    const html = await versionForm();
    expect(html).toContain('<h2 class="admin-title">Write the Italian version</h2>');
    expect(html).toContain(`<input id="w-slug" name="slug" readonly value="${TWIN}"`);
    expect(html).toMatch(/id="w-title"\s+name="title"\s+maxlength="120"\s+required\s+value=""/);
    expect(html).toMatch(/id="w-desc"\s+name="description"\s+maxlength="200"\s+required\s+value=""/);
    expect(html).toMatch(/class="write-body"[^>]*>\n<\/textarea/);
    expect(html).toContain("<summary>The English version, for reference</summary>");
    expect(html).toContain("Text in English.");
    // The same photographs, by the same stored keys; alt text and caption empty, the English ones shown as hints.
    expect([...html.matchAll(/name="photo_key" value="([^"]+)"/g)].map((m) => m[1])).toEqual(KEYS);
    expect(html.match(/name="photo_alt" required maxlength="300" value=""/g)).toHaveLength(2);
    expect(html.match(/name="photo_caption" maxlength="300" value=""/g)).toHaveLength(2);
    expect(html).toContain('English version: <span lang="en">Boats at dawn</span>');
    expect(html).toContain('English version: <span lang="en">The old port</span>');
    expect(html).toContain('English version: <span lang="en">A crane over the quay</span>');
    expect(html).toContain("The English version has no caption.");
    expect(html).toMatch(/id="ph-0-alt" name="photo_alt"[^>]*aria-describedby="ph-0-alt-hint"/);
    // A language choice that names each version's state; it opens the same entry in that language.
    expect(html).toContain('<option value="en">English · published</option>');
    expect(html).toContain('<option value="it" selected>Italiano · not written yet</option>');
    expect(html).toMatch(/<button type="submit" name="intent" value="switch" class="btn btn--ghost" formnovalidate/);
    expect(html).toContain('<input type="hidden" id="w-lang" name="lang" value="it" />');
    expect(hidden(html, "twin")).toBe("1");
    expect(hidden(html, "base_sha")).toBe("");
    expect(html).toContain(`data-draft="edit-it-${TWIN}"`);
    expect(html).toContain(">Publish</button>");
  });

  test("Publish: one new file with the same photo keys and originalLang from the existing version", async () => {
    const html = await versionForm();
    await Promise.all(KEYS.map((k) => env.ORIGINALS.put(k, "x")));
    await gh("/__reset");
    await gh("/__set", { files: { [EN]: EN_TEXT } });
    const res = await post(
      fromForm(html, { intent: "publish", title: "Il porto", description: "Una mattina.", body: "Testo." }),
      [
        [KEYS[0] ?? "", "Barche all'alba", "Il porto vecchio"],
        [KEYS[1] ?? "", "Una gru sul molo", ""],
      ],
    );
    expect(res.status).toBe(200);
    const page = await res.text();
    // The confirmation offers the other language: here it exists, so it is an edit.
    expect(page).toContain(`<a href="/admin/write?edit=1&amp;slug=${TWIN}&amp;lang=en">Edit the English version</a>`);
    const all = await calls();
    expect(all.filter((c) => c.method === "PUT")).toHaveLength(1);
    const file = await written();
    expect(file.path).toBe(`/repos/PhilGloves/philglov.es/contents/src/content/journal/it/${TWIN}.md`);
    expect(file.text).toMatch(/^---\ntitle: "Il porto"\ndate: \d{4}-\d{2}-\d{2}\nlang: it\noriginalLang: en\n/);
    expect(file.text).toContain(
      "Testo.\n\n" +
        '![Barche all\'alba](../../../.originals/two-langs/boats.jpg "Il porto vecchio")\n\n' +
        "![Una gru sul molo](../../../.originals/two-langs/crane.png)\n",
    );
    expect(all.find((c) => c.path.endsWith("/pulls") && c.method === "POST")?.body["title"]).toBe(
      "Italian version of it/two-langs: Il porto",
    );
    // Nothing stored twice: the photos are the two originals already there.
    expect((await env.ORIGINALS.list({ prefix: `${TWIN}/` })).objects.map((o) => o.key)).toEqual(KEYS);
  });

  test("Publish is refused while a carried-over photo has no alt text, and the form stays as it was", async () => {
    const html = await versionForm();
    await Promise.all(KEYS.map((k) => env.ORIGINALS.put(k, "x")));
    const res = await post(
      fromForm(html, { intent: "publish", title: "Il porto", description: "Una mattina.", body: "Testo." }),
      [
        [KEYS[0] ?? "", "Barche all'alba", ""],
        [KEYS[1] ?? "", "", ""],
      ],
    );
    expect(res.status).toBe(422);
    const page = await res.text();
    expect(page).toContain("Every photo needs alt text");
    expect(page).toContain('<h2 class="admin-title">Write the Italian version</h2>');
    expect(page).toContain('English version: <span lang="en">A crane over the quay</span>');
    expect((await calls()).some((c) => c.method === "PUT")).toBe(false);
  });

  test("a photo can be removed and another added; one of another slug is still refused", async () => {
    const html = await versionForm();
    await Promise.all([...KEYS, "two-langs/new-one-ab12.jpg"].map((k) => env.ORIGINALS.put(k, "x")));
    const fields = fromForm(html, { intent: "publish", title: "Il porto", description: "Una mattina.", body: "" });
    expect(
      (
        await post(fields, [
          [KEYS[1] ?? "", "Una gru", ""],
          ["two-langs/new-one-ab12.jpg", "Una foto nuova", ""],
        ])
      ).status,
    ).toBe(200);
    const file = await written();
    expect(file.text).not.toContain("boats.jpg");
    expect(file.text).toContain("two-langs/crane.png");
    expect(file.text).toContain("two-langs/new-one-ab12.jpg");
    expect((await post(fields, [["lisbona/boats.jpg", "Altro", ""]])).status).toBe(422);
  });

  test("Switch without JavaScript keeps what was typed as a draft, which is there again on switching back", async () => {
    const html = await versionForm();
    // Nothing typed: no draft, straight to the other version.
    const plain = await post(fromForm(html, { intent: "switch", to: "en", title: "", description: "", body: "" }), [
      [KEYS[0] ?? "", "", ""],
      [KEYS[1] ?? "", "", ""],
    ]);
    expect(plain.status).toBe(303);
    expect(plain.headers.get("Location")).toBe(`/admin/write?edit=1&slug=${TWIN}&lang=en`);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM drafts").first("n")).toBe(0);

    const typed = await post(
      fromForm(html, { intent: "switch", to: "en", title: "Il porto", description: "", body: "Metà." }),
      [
        [KEYS[0] ?? "", "Barche", ""],
        [KEYS[1] ?? "", "", ""],
      ],
    );
    expect(typed.headers.get("Location")).toBe(`/admin/write?edit=1&slug=${TWIN}&lang=en&kept=it`);
    const row = await env.DB.prepare("SELECT slug, lang, title, body, twin, base_sha FROM drafts").first();
    expect(row).toEqual({ slug: TWIN, lang: "it", title: "Il porto", body: "Metà.", twin: 1, base_sha: "" });
    const english = await (await adminFetch(typed.headers.get("Location") ?? "")).text();
    expect(english).toContain("What you typed in Italian is kept as a draft, and is there again when you switch back.");
    expect(english).toContain('value="The harbour"');
    expect(english).toContain('<option value="it">Italiano · draft saved</option>');

    // Switching back opens that draft, in the same form, with the photos and the hints.
    const back = await versionForm();
    expect(back).toContain('value="Il porto"');
    expect(back).toContain(">\nMetà.</textarea");
    expect(back).toContain('value="Barche"');
    expect(back).toContain("Opened your draft of this version, saved");
    expect(back).toContain('<h2 class="admin-title">Write the Italian version</h2>');
    expect(back).toContain('English version: <span lang="en">Boats at dawn</span>');
    expect(hidden(back, "twin")).toBe("1");
    expect(hidden(back, "draft_id")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(back).toContain("other-language version ·");
  });

  test("Switch from an edit keeps its draft too, with the version it started from", async () => {
    await gh("/__set", { files: { [EN]: EN_TEXT } });
    const edit = await (await adminFetch(`/admin/write?edit=1&slug=${TWIN}&lang=en`)).text();
    expect(edit).toContain('<option value="en" selected>English · published</option>');
    expect(edit).toContain('<option value="it">Italiano · not written yet</option>');
    expect(edit).not.toContain("Language: <strong>");
    const res = await post(
      fromForm(edit, {
        intent: "switch",
        to: "it",
        lang: "en",
        title: "The harbour, again",
        description: "A morning by the water.",
        body: "Text in English.",
      }),
      [
        [KEYS[0] ?? "", "Boats at dawn", "The old port"],
        [KEYS[1] ?? "", "A crane over the quay", ""],
      ],
    );
    expect(res.headers.get("Location")).toBe(`/admin/write?edit=1&slug=${TWIN}&lang=it&kept=en`);
    expect(await env.DB.prepare("SELECT base_sha FROM drafts").first("base_sha")).toBe(hidden(edit, "base_sha"));
    const again = await (await adminFetch(`/admin/write?edit=1&slug=${TWIN}&lang=en`)).text();
    expect(again).toContain('value="The harbour, again"');
    expect(again).toContain("Editing <a");
  });

  test("after a new entry is published, the confirmation offers to write the other language", async () => {
    const res = await adminPost("/admin/write", { csrf: await csrf(), ...newEntry });
    expect(await res.text()).toContain(
      '<a href="/admin/write?edit=1&amp;slug=a-new-one&amp;lang=it">Write the Italian version</a>',
    );
  });

  test("the existing version still on its way: the form opens from its pull request, Publish waits for it", async () => {
    const branch = "publish/en-on-its-way-20261116090000";
    const path = "src/content/journal/en/on-its-way.md";
    await gh("/__set", {
      files: { [`${path}@${branch}`]: EN_TEXT.replace(/two-langs/g, "on-its-way") },
      pulls: [
        {
          html_url: "https://github.com/x/y/pull/5",
          title: "New entry en/on-its-way: The harbour",
          created_at: new Date().toISOString(),
          user: { login: "philglov-publisher[bot]" },
          head: { ref: branch },
        },
      ],
    });
    const html = await (await adminFetch("/admin/write?edit=1&slug=on-its-way&lang=it")).text();
    expect(html).toContain('<h2 class="admin-title">Write the Italian version</h2>');
    expect(html).toContain("Text in English.");
    expect(html).toContain('name="photo_key" value="on-its-way/boats.jpg"');
    expect(html).toContain('<option value="en" disabled>English · on its way</option>');
    await env.ORIGINALS.put("on-its-way/boats.jpg", "x");
    const res = await post(
      {
        ...fromForm(html, { intent: "publish", title: "Il porto", description: "Una mattina.", body: "Testo." }),
        slug: "on-its-way",
      },
      [["on-its-way/boats.jpg", "Barche", ""]],
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("The English version is not on the site yet");
    expect((await calls()).some((c) => c.method === "PUT")).toBe(false);
  });

  test("no version in either language: nothing to open", async () => {
    const html = await (await adminFetch("/admin/write?edit=1&slug=no-such-entry&lang=it")).text();
    expect(html).toContain("No Italian entry with the slug no-such-entry.");
    expect(hidden(html, "twin")).toBe("");
  });
});

describe("reading an entry back", () => {
  const input: EntryInput = {
    title: "T",
    slug: "s",
    lang: "en",
    description: "D",
    body: "Text.\n\nMore text.",
    photos: [
      { key: "s/a.jpg", alt: "Brackets [ ] and \\ slash", caption: 'Quote " and \\' },
      { key: "s/b.png", alt: "Plain", caption: "" },
    ],
  };

  test("photos written by entryMarkdown come back out unchanged", () => {
    const parsed = parseEntry(entryMarkdown(input, "en", "2026-11-13"));
    expect(splitPhotos(parsed?.body ?? "", "s")).toEqual({ body: input.body, photos: input.photos });
  });

  test("only trailing photos of this slug are taken out; others stay in the text", () => {
    expect(splitPhotos("Text.\n\n![x](../../../.originals/other/a.jpg)", "s").photos).toEqual([]);
    expect(splitPhotos("![x](../../../.originals/s/a.jpg)\n\nText after.", "s").photos).toEqual([]);
    expect(splitPhotos("![x](https://example.com/a.jpg)", "s").photos).toEqual([]);
  });

  test("comments are read; an old tags line, in either form, is ignored; comments are written as found", () => {
    const block = "---\ntitle: T\ntags:\n  - travel\n  - photography\ncomments: false\n---\nBody";
    expect(parseEntry(block)).toMatchObject({ comments: false, body: "Body" });
    expect(parseEntry(block)).not.toHaveProperty("tags");
    expect(parseEntry("---\ntags: [a, b]\ncomments: true\n---\n")).toMatchObject({ comments: true });
    expect(entryMarkdown(input, "en", "2026-11-13", false)).toContain("\ncomments: false\n");
    expect(entryMarkdown(input, "en", "2026-11-13")).toContain("\ncomments: true\n");
  });
});
