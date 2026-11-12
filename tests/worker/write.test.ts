/** /admin/write (B8): uploads to R2, drafts, the entry file, and Publish through the GitHub App (stand-in in vitest.config.ts). */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { sniff } from "../../worker/src/admin/upload.ts";
import {
  entryMarkdown,
  parseEntry,
  photoName,
  readEntry,
  slugFromTitle,
  validateEntry,
} from "../../worker/src/entry-file.ts";
import { adminFetch, adminPost, csrf, resetDb, siteManifest, twinEntry } from "./helpers.ts";

beforeEach(resetDb);

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
    expect(await res.text()).toContain("Open it to edit");

    const edit = await (await adminFetch(`/admin/write?slug=${slug}&lang=en&edit=1`)).text();
    const sha = /name="base_sha" value="([^"]+)"/.exec(edit)?.[1];
    expect(sha).toBe(`sha-of-src/content/journal/en/${slug}.md`);
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
