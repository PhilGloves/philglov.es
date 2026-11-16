/**
 * Shared pieces of the QA suites (TICKETS.md, ticket Q): which pages exist, what a page may not do, and how to leave
 * a page without cutting a request in half.
 *
 * The page list comes from the build (dist/*.html), not from the sitemap, so a page the sitemap forgot is still
 * tested (the sitemap suite then fails for it). Run `pnpm build` first.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { Page, Request, Response } from "@playwright/test";

export const dist = new URL("../../../dist/", import.meta.url);

/** The widths the guide fixes: four designs, and the narrowest phone the layout must still hold. */
export const WIDTHS = [1440, 1024, 768, 390, 320] as const;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export interface BuiltPage {
  /** URL path as served: "/", "/it", "/lisbona", "/it/photos/lisbon". */
  path: string;
  file: string;
  lang: "en" | "it";
  /** 404.html answers with status 404; the rest with 200. */
  status: 200 | 404;
  /** Listed in the sitemap by design: not the 404 page and not /styleguide. */
  indexable: boolean;
}

function htmlFiles(dir: URL, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? e.name === "_assets"
        ? []
        : htmlFiles(new URL(`${e.name}/`, dir), `${prefix}${e.name}/`)
      : e.name.endsWith(".html")
        ? [`${prefix}${e.name}`]
        : [],
  );
}

/** Every page the build wrote, as the Worker serves it (build.format "file", no trailing slash). */
export function builtPages(): BuiltPage[] {
  return htmlFiles(dist)
    .sort()
    .map((file) => {
      const stem = file.replace(/\.html$/, "");
      // The 404 page is what the Worker answers for a path that does not exist (it is also reachable at /404 itself).
      const path = stem === "index" ? "/" : stem === "404" ? "/no-such-page" : `/${stem}`;
      return {
        path,
        file,
        lang: path === "/it" || path.startsWith("/it/") ? "it" : "en",
        status: file === "404.html" ? 404 : 200,
        indexable: file !== "404.html" && file !== "styleguide.html",
      } satisfies BuiltPage;
    });
}

export const readBuilt = (file: string): string => readFileSync(new URL(file, dist), "utf8");

/** The other-language twin's path for pages that are not entries (home, journal, photos, series, photo). */
export const swapLang = (path: string): string =>
  path === "/it" ? "/" : path === "/" ? "/it" : path.startsWith("/it/") ? path.slice(3) : `/it${path}`;

/**
 * Lines that are not the site's fault. Only the browser's own "Failed to load resource" line for the page that was
 * itself served with 404 (owner ruling O4, 2026-11-13, CLAUDE.md rule 11). Chromium words it like this; other engines
 * log nothing or something else, and `allowStatus` below keeps their 404 response from counting too.
 */
export const BROWSER_404_LINE = /^error: Failed to load resource: the server responded with a status of 404/;

export interface Watch {
  problems: string[];
  /** Forget what was seen so far (between two pages of one test). */
  reset(): void;
  /** Resolves when no request is in flight any more (two checks 100 ms apart), or after `timeout` ms (a request still in flight then is a problem). */
  idle(timeout?: number): Promise<void>;
}

/**
 * Suite 1: console (errors AND warnings), page errors, failed requests, responses ≥ 400 and any request to a host
 * other than the site's own. `allow404` names the path whose own 404 answer is expected (the 404 page).
 * `ignoreConsole` names a console line to leave out; used only where a finding is open and tracked as a BUG-n test.
 */
export function watch(page: Page, origin: string, allow404?: string, ignoreConsole?: RegExp): Watch {
  const problems: string[] = [];
  const inflight = new Set<Request>();
  const own = new URL(origin).origin;
  page.on("request", (req: Request) => inflight.add(req));
  page.on("requestfinished", (req: Request) => inflight.delete(req));
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const line = `${msg.type()}: ${msg.text()}`;
    if (allow404 !== undefined && BROWSER_404_LINE.test(line)) return;
    if (ignoreConsole?.test(line)) return;
    problems.push(`console ${line}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req: Request) => {
    inflight.delete(req);
    problems.push(`requestfailed: ${req.url()} (${req.failure()?.errorText ?? "no reason"})`);
  });
  page.on("request", (req: Request) => {
    const u = new URL(req.url());
    if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return;
    if (u.origin !== own) problems.push(`other host: ${req.url()}`);
  });
  page.on("response", (res: Response) => {
    if (res.status() < 400) return;
    if (allow404 !== undefined && res.status() === 404 && new URL(res.url()).pathname === allow404) return;
    problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  const idle = async (timeout = 5_000) => {
    const end = Date.now() + timeout;
    let quiet = 0;
    while (quiet < 2 && Date.now() < end) {
      quiet = inflight.size === 0 ? quiet + 1 : 0;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (inflight.size > 0) {
      problems.push(`never finished within ${timeout} ms: ${[...inflight].map((r) => r.url()).join(", ")}`);
      inflight.clear();
    }
  };
  return { problems, reset: () => void problems.splice(0), idle };
}

/**
 * Q18, Q20: a request the test itself cuts off is not the site's fault, and one that really fails still is.
 * Chromium aborts an image or font request (net::ERR_ABORTED) when the page is left, or when a new viewport width
 * makes `<picture>` pick another source while the first is still loading. Call this after every width change and
 * before leaving a page: it waits until no request is in flight (the `watch` keeps count), with a short pause in between
 * so a lazy image that the new width has just brought into view has started, then returns what really failed: a
 * font face in error, an image that finished broken. No retries.
 */
export async function settle(page: Page, seen: Watch): Promise<string[]> {
  // Not requestAnimationFrame in the page: with JavaScript off, timers and frames never fire for evaluate().
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(100);
  await seen.idle();
  return page.evaluate(() => {
    const out: string[] = [];
    for (const face of document.fonts)
      // The "Crimson Pro Fallback" faces are local() fonts (Palatino, Georgia) that tune the text while the real font
      // loads; a machine without them (a Linux runner) reports them as "error". Not a broken font (as in fonts.ts).
      if (face.status === "error" && !face.family.replace(/"/g, "").startsWith("Crimson Pro Fallback"))
        out.push(`font failed: ${face.family} ${face.style} ${face.weight}`);
    for (const img of document.images)
      if (img.currentSrc !== "" && img.complete && img.naturalWidth === 0) out.push(`image broken: ${img.currentSrc}`);
    return out;
  });
}

/** Horizontal overflow of the page in px (0 or less is fine). */
export const overflowX = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Tag names of the tab stops reached by pressing Tab `count` times, with what each one is. */
export interface Stop {
  tag: string;
  text: string;
  href: string | null;
  visible: boolean;
  /** The focus indicator the stylesheet draws: outline width > 0, or a box-shadow. */
  indicator: boolean;
}
