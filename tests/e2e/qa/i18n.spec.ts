/**
 * QA suite 5: i18n, for every built page. Expectations come from the content folders and the guide's table, not
 * from the code under test:
 *  - twins are the files with the same name in the en and it folders; pages that are not content (home, journal,
 *    photos, series, photo) have their twin at the same path under /it;
 *  - the language switch goes to the twin, or, with none, to the other home with the "not available" sentence;
 *  - lang, hreflang (a pair only when both versions exist; x-default is the English URL), canonical and og:locale;
 *  - the "originally written in" label (entries and the legal pages; About and Now carry none, decision 0023):
 *    original with a twin, my own translation, original not yet translated.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { builtPages, swapLang, type BuiltPage } from "./lib.ts";

type Lang = "en" | "it";
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const other = (l: Lang): Lang => (l === "en" ? "it" : "en");
const ORIGIN = "https://philglov.es";
const content = new URL("../../../src/content/", import.meta.url);
const ui = (l: Lang) =>
  JSON.parse(readFileSync(new URL(`../../../src/i18n/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;

interface Version {
  lang: Lang;
  originalLang: Lang;
  slug: string;
  /** Entries and the legal pages show the "originally written in" label; About and Now do not (decision 0023). */
  label: boolean;
}

/** slug → versions found in src/content/{journal,pages}/{en,it}/<slug>.md, by language. */
function contentVersions(): Map<string, Partial<Record<Lang, Version>>> {
  const map = new Map<string, Partial<Record<Lang, Version>>>();
  for (const kind of ["journal", "pages"]) {
    for (const folder of ["en", "it"] as const) {
      const dir = new URL(`${kind}/${folder}/`, content);
      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      } catch {
        continue;
      }
      for (const file of files) {
        const text = readFileSync(new URL(file, dir), "utf8");
        const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
        const get = (key: string) => new RegExp(`^${key}:\\s*"?([a-z]+)"?\\s*$`, "m").exec(front)?.[1];
        const slug = file.replace(/\.md$/, "");
        const lang = get("lang") as Lang | undefined;
        const originalLang = get("originalLang") as Lang | undefined;
        expect(lang, `${kind}/${folder}/${file} lang`).toBe(folder); // folder and lang agree (content check)
        expect(originalLang, `${kind}/${folder}/${file} originalLang`).toMatch(/^(en|it)$/);
        const entry = map.get(slug) ?? {};
        entry[folder] = {
          lang: folder,
          originalLang: originalLang as Lang,
          slug,
          label: kind === "journal" || slug === "rights" || slug === "privacy",
        };
        map.set(slug, entry);
      }
    }
  }
  return map;
}

const versions = contentVersions();
const pathOf = (lang: Lang, slug: string) => (lang === "en" ? `/${slug}` : `/it/${slug}`);

function describePage(built: BuiltPage): { twin: string | null; version?: Version } {
  const slug = built.path.replace(/^\/it(?=\/|$)/, "").replace(/^\//, "");
  const found = versions.get(slug);
  const version = found?.[built.lang];
  if (version) {
    const twin = found?.[other(built.lang)];
    return { twin: twin ? pathOf(other(built.lang), slug) : null, version };
  }
  return { twin: swapLang(built.path) };
}

const pages = builtPages().filter((p) => p.indexable);
const knownPaths = new Set(builtPages().map((p) => p.path));

test.describe.configure({ mode: "parallel" });

for (const built of pages) {
  test(`${built.path}: lang, switch, hreflang, canonical, label`, async ({ page }) => {
    const { twin, version } = describePage(built);
    const t = ui(built.lang);
    const o = other(built.lang);
    await page.goto(built.path);

    await expect(page.locator("html")).toHaveAttribute("lang", built.lang);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}${built.path === "/" ? "/" : built.path}`,
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      "content",
      built.lang === "en" ? "en_GB" : "it_IT",
    );

    if (twin) expect(knownPaths.has(twin), `${built.path}: its twin ${twin} is a built page`).toBe(true);

    // Language switch.
    const sw = page.locator("header a.lang-switch");
    await expect(sw).toHaveCount(1);
    if (twin) {
      await expect(sw).toHaveAttribute("href", twin);
      await expect(sw).toHaveAttribute("hreflang", o);
      await expect(sw).toHaveAttribute("lang", o);
      await expect(sw).toHaveText(o.toUpperCase());
      await expect(sw).toHaveAttribute("aria-label", o === "it" ? "Italiano" : "English");
    } else {
      await expect(sw).toHaveAttribute("href", o === "it" ? "/it" : "/");
      // Round control with "IT" / "EN" as text; the accessible name carries the note (decision 0023).
      await expect(sw).toHaveAttribute("aria-label", new RegExp(escapeRe(t["switchNoTwin"] ?? "switchNoTwin missing")));
    }

    // hreflang: a pair only when both versions exist; x-default is the English URL.
    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((els) => els.map((e) => [e.getAttribute("hreflang"), e.getAttribute("href")]));
    if (twin) {
      const en = built.lang === "en" ? built.path : twin;
      const it = built.lang === "it" ? built.path : twin;
      expect(alternates).toEqual([
        ["en", `${ORIGIN}${en}`],
        ["it", `${ORIGIN}${it}`],
        ["x-default", `${ORIGIN}${en}`],
      ]);
    } else {
      expect(alternates, "no hreflang without a twin").toEqual([]);
    }

    // The label, on every page that is content (entries and pages), from the guide's table.
    if (version && !version.label) {
      await expect(page.locator("p.label"), `${built.path} carries no label`).toHaveCount(0);
    }
    if (version?.label) {
      const label = page.locator("p.label");
      await expect(label, `${built.path} shows the "originally written in" label`).toHaveCount(1);
      const state = version.lang !== version.originalLang ? "translation" : twin ? "original" : "not-yet";
      const text =
        state === "translation" ? t["labelTranslation"] : state === "original" ? t["labelOriginal"] : t["labelNotYet"];
      await expect(label).toContainText(text ?? "label text missing");
      if (state !== "not-yet") {
        // With a twin the label links to it: the original from a translation, the other version from an original.
        await expect(label.locator("a")).toHaveAttribute("href", twin ?? "");
      } else {
        await expect(label.locator("a")).toHaveCount(0);
      }
    }
  });
}

test("every English page that has an Italian twin is a twin of it back (the switch is symmetric)", async ({ page }) => {
  for (const built of pages.filter((p) => p.lang === "en")) {
    const { twin } = describePage(built);
    if (!twin) continue;
    await page.goto(twin);
    await expect(page.locator("header a.lang-switch"), `${twin} points back to ${built.path}`).toHaveAttribute(
      "href",
      built.path,
    );
  }
});

test("the switch is a real link: it works with one click and lands on the twin", async ({ page }) => {
  await page.goto("/lisbona");
  await page.locator("header a.lang-switch").click();
  await expect(page).toHaveURL(/\/it\/lisbona$/);
  await page.locator("header a.lang-switch").click();
  await expect(page).toHaveURL(/\/lisbona$/);
  // A page in one language only falls back to the other home, and says so.
  await page.goto("/one-roll");
  await page.locator("header a.lang-switch").click();
  await expect(page).toHaveURL(/\/it$/);
});

test("nothing redirects by browser language: Accept-Language does not change the page", async ({
  browser,
  baseURL,
}) => {
  for (const [locale, path] of [
    ["it-IT", "/"],
    ["en-GB", "/it"],
  ] as const) {
    const context = await browser.newContext({ locale, baseURL: baseURL ?? "" });
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status(), `${path} with ${locale}`).toBe(200);
    await context.close();
  }
});
