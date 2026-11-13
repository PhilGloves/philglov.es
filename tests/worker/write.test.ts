/**
 * /admin/write (B8): uploads to R2, drafts, the entry file, and Publish through the GitHub App (stand-in in
 * vitest.config.ts; /__set changes files, open pull requests, auto-merge and write refusals). Publishing goes live
 * by itself and published entries are edited from the phone (decision 0021).
 */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { sniff } from "../../worker/src/admin/upload.ts";
import { ATTENTION_AFTER, entriesFor } from "../../worker/src/admin/write.ts";
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
    tags: ["travel"],
    body: "Testo.\n\n## Titoletto",
    photos: [photo],
  };

  test("slugs are suggested from titles", () => {
    expect(slugFromTitle("Tre settimane a Lisbona, già!")).toBe("tre-settimane-a-lisbona-gia");
    expect(slugFromTitle("Città   più  bella del mondo intero")).toBe("citta-piu-bella-del-mondo");
    expect(slugFromTitle("???")).toBe("");
  });

  test("valid input passes; reserved slugs, unknown topics and photos without alt text do not", () => {
    expect(validateEntry(base, ["about"])).toEqual({});
    expect(validateEntry({ ...base, slug: "about" }, ["about"]).slug).toMatch(/reserved/);
    expect(validateEntry({ ...base, slug: "Bad Slug" }, []).slug).toBeDefined();
    expect(validateEntry({ ...base, tags: [] }, []).tags).toBeDefined();
    expect(validateEntry({ ...base, tags: ["sport"] }, []).tags).toBeDefined();
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
        "tags: [travel]",
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
      tags: ["travel"],
    });
  });

  test("the slug falls back to the title, and duplicate topics collapse", () => {
    const form = new URLSearchParams(
      "title=Alpi+d%27inverno&slug=&lang=it&tags=travel&tags=travel&body=x&description=y",
    );
    expect(readEntry(form)).toMatchObject({ slug: "alpi-d-inverno", tags: ["travel"] });
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
    expect(location).toMatch(/^\/admin\/write\?draft=[A-Za-z0-9_-]{22}&saved=1$/);
    const row = await env.DB.prepare("SELECT slug, title, body FROM drafts").first();
    expect(row).toEqual({ slug: "alpi-d-inverno", title: "Alpi d'inverno", body: "Bozza." });
    const page = await (await adminFetch(location)).text();
    expect(page).toContain("Draft saved on the server.");
    expect(page).toContain('value="Alpi d&#39;inverno"');
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
      tags: "thoughts",
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
      tags: "photography",
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
      tags: "travel",
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
      tags: "travel",
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
  tags: "thoughts",
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

  test("newest first; the search matches the title, any case, accents ignored", () => {
    const entries = [
      e("Alps in winter", "2026-01-05"),
      e("Città vecchia", "2026-09-01", "it"),
      e("Lisbon", "2026-03-10"),
    ];
    expect(entriesFor(entries, "").map((x) => x.title)).toEqual(["Città vecchia", "Lisbon", "Alps in winter"]);
    expect(entriesFor(entries, "CITTA").map((x) => x.title)).toEqual(["Città vecchia"]);
    expect(entriesFor(entries, " in ").map((x) => x.title)).toEqual(["Alps in winter"]);
    expect(entriesFor(entries, "nothing")).toEqual([]);
  });

  test("/admin/write shows the built entries, each opening the edit form; ?q= filters", async () => {
    const m = await siteManifest();
    expect(m.entries.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))).toBe(true);
    const html = await (await adminFetch("/admin/write")).text();
    expect(html).toContain("Edit a published entry");
    const newest = entriesFor(m.entries, "")[0];
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
    form.append("tags", "travel");
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

  test("opens in the same form: title, topics, text, photos with alt text and captions; slug and language fixed", async () => {
    const html = await open();
    expect(html).toContain("<title>Edit · philglov.es admin</title>");
    expect(html).toContain('value="Città on foot"');
    expect(html).toContain('value="A walk."');
    expect(html).toMatch(/value="travel"\s+checked/);
    expect(html).toMatch(/value="photography"\s+checked/);
    expect(html).not.toMatch(/value="thoughts"\s+checked/);
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
    // Date, original language and the comments choice are the file's own; the photos come back after the text.
    expect(text).toBe(
      [
        "---",
        'title: "Città on foot, again"',
        "date: 2026-10-02",
        "lang: en",
        "originalLang: it",
        'description: "A longer walk."',
        "tags: [travel]",
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
    const html = await (await adminFetch(res.headers.get("Location") ?? "")).text();
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
    expect(html).toContain("uses a form of frontmatter this page cannot read");
    expect(html).toContain('name="base_sha" value=""');
  });
});

describe("reading an entry back", () => {
  const input: EntryInput = {
    title: "T",
    slug: "s",
    lang: "en",
    description: "D",
    tags: ["travel"],
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

  test("comments and both forms of the topic list are read; comments are written as found", () => {
    const block = "---\ntitle: T\ntags:\n  - travel\n  - photography\ncomments: false\n---\nBody";
    expect(parseEntry(block)).toMatchObject({ tags: ["travel", "photography"], comments: false, body: "Body" });
    expect(parseEntry("---\ntags: [a, b]\ncomments: true\n---\n")).toMatchObject({ tags: ["a", "b"], comments: true });
    expect(entryMarkdown(input, "en", "2026-11-13", false)).toContain("\ncomments: false\n");
    expect(entryMarkdown(input, "en", "2026-11-13")).toContain("\ncomments: true\n");
  });
});
