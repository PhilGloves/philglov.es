/**
 * QA suite 14 (the served side): rights and privacy.
 *  - robots.txt disallows every bot in src/data/ai-bots.json (trainingBots) and still lets Googlebot, Bingbot and
 *    the other bots named in notBlockedOnPurpose in;
 *  - /.well-known/tdmrep.json is valid; tdm-reservation is on every page (meta and header) and on images (header);
 *  - X-Robots-Tag: noai, noimageai is on images and not on pages;
 *  - /rights and /privacy exist in both languages.
 * The image files themselves (copyright, Data Mining, no GPS) are checked by tests/unit/qa-images.test.ts; the
 * notification e-mail and the retention job by tests/worker/ops.test.ts; unfilled placeholders by launch.spec.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { builtPages, readBuilt } from "./lib.ts";

const bots = JSON.parse(readFileSync(new URL("../../../src/data/ai-bots.json", import.meta.url), "utf8")) as {
  trainingBots: string[];
  notBlockedOnPurpose: string[];
  disallowForEveryone: string[];
};

interface Group {
  agents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
}

function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (line === "") continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const name = (key ?? "").toLowerCase();
    if (name === "user-agent") {
      if (current === null || lastWasRule) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasRule = false;
    } else if ((name === "allow" || name === "disallow") && current) {
      current.rules.push({ type: name, path: value });
      lastWasRule = true;
    }
  }
  return groups;
}

/** What a crawler named `agent` may fetch at "/" under the longest-match rule of RFC 9309. */
function mayFetchRoot(groups: Group[], agent: string): boolean {
  const specific = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen
    .flatMap((g) => g.rules)
    .filter((r) => r.path !== "" && "/".startsWith(r.path.replace(/\*.*$/, "")));
  const best = rules.sort((a, b) => b.path.length - a.path.length)[0];
  return best === undefined || best.type === "allow";
}

test("robots.txt refuses every AI-training bot in ai-bots.json and still admits search engines", async ({
  request,
}) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const groups = parseRobots(await res.text());
  const problems: string[] = [];
  expect(bots.trainingBots.length).toBeGreaterThan(15);
  for (const bot of bots.trainingBots) if (mayFetchRoot(groups, bot)) problems.push(`${bot} is not disallowed`);
  for (const bot of ["Googlebot", "Bingbot", ...bots.notBlockedOnPurpose])
    if (!mayFetchRoot(groups, bot)) problems.push(`${bot} is blocked`);
  // Everyone else may read the site, except the API.
  expect(mayFetchRoot(groups, "SomeNewBrowser")).toBe(true);
  const star = groups.find((g) => g.agents.includes("*"));
  for (const path of bots.disallowForEveryone)
    if (!star?.rules.some((r) => r.type === "disallow" && r.path === path))
      problems.push(`* does not disallow ${path}`);
  expect(problems).toEqual([]);
});

test("tdmrep.json is valid and carries the reservation header", async ({ request }) => {
  const res = await request.get("/.well-known/tdmrep.json");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("json");
  expect(res.headers()["tdm-reservation"]).toBe("1");
  const rules = (await res.json()) as unknown;
  expect(Array.isArray(rules)).toBe(true);
  for (const rule of rules as Record<string, unknown>[]) {
    expect(typeof rule["location"]).toBe("string");
    expect(String(rule["location"]).startsWith("/")).toBe(true);
    expect([0, 1]).toContain(rule["tdm-reservation"]);
  }
  expect(
    (rules as { location: string; "tdm-reservation": number }[]).some(
      (r) => r.location === "/" && r["tdm-reservation"] === 1,
    ),
  ).toBe(true);
});

test("tdm-reservation is on every page (meta tag and header) and on images (header)", async ({ request }) => {
  const problems: string[] = [];
  for (const p of builtPages()) {
    if (!/<meta name="tdm-reservation" content="1"/.test(readBuilt(p.file)))
      problems.push(`${p.path}: no tdm-reservation meta`);
  }
  for (const path of ["/", "/it", "/lisbona", "/no-such-page"]) {
    const h = (await request.get(path)).headers();
    if (h["tdm-reservation"] !== "1") problems.push(`${path}: no tdm-reservation header`);
  }
  for (const image of sampleImages()) {
    const h = (await request.get(image)).headers();
    if (h["tdm-reservation"] !== "1") problems.push(`${image}: no tdm-reservation header`);
  }
  expect(problems).toEqual([]);
});

/** One of each kind of output image: avif, webp, jpeg, the share image and the touch icon. */
function sampleImages(): string[] {
  const files = readdirSync(new URL("../../../dist/_assets/", import.meta.url));
  const first = (re: RegExp) => files.find((f) => re.test(f));
  return [
    first(/\.avif$/),
    first(/\.webp$/),
    first(/\.jpe?g$/),
    first(/^apple-touch-icon.*\.png$/),
    "share/default.png",
  ]
    .filter((f): f is string => Boolean(f))
    .map((f) => `/_assets/${f}`);
}

test("X-Robots-Tag: noai, noimageai is on images, and not on pages or the API", async ({ request }) => {
  const problems: string[] = [];
  const images = sampleImages();
  // A build without photo originals (a fork, CI before R2 has photos) has only the touch icon and the share image.
  expect(images.length, "the build has at least the share image and the touch icon to sample").toBeGreaterThanOrEqual(
    2,
  );
  for (const image of images) {
    const tag = (await request.get(image)).headers()["x-robots-tag"] ?? "";
    if (!/noai/.test(tag) || !/noimageai/.test(tag)) problems.push(`${image}: X-Robots-Tag is "${tag}"`);
    // Staging: every response is noindex, these files too (rule 15); production: not (QA_PROD, pnpm qa:production).
    const want = process.env["QA_PROD"] === "1" ? "noai, noimageai" : "noindex, noai, noimageai";
    if (tag !== want) problems.push(`${image}: X-Robots-Tag is "${tag}", not "${want}"`);
  }
  for (const path of [
    "/",
    "/it/lisbona",
    "/about",
    "/no-such-page",
    "/api/comment",
    "/feed.xml",
    "/sitemap.xml",
    "/robots.txt",
  ]) {
    const tag = (await request.get(path)).headers()["x-robots-tag"] ?? "";
    if (/noai|noimageai/.test(tag)) problems.push(`${path}: carries "${tag}" (images only)`);
  }
  expect(problems).toEqual([]);
});

test("/rights and /privacy exist in both languages with a heading and a footer link", async ({ page }) => {
  for (const [path, lang] of [
    ["/rights", "en"],
    ["/it/rights", "it"],
    ["/privacy", "en"],
    ["/it/privacy", "it"],
  ] as const) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("h1")).toHaveCount(1);
    expect((await page.locator("main").innerText()).length, `${path} has text`).toBeGreaterThan(400);
  }
  for (const [path, rights, privacy] of [
    ["/", "/rights", "/privacy"],
    ["/it", "/it/rights", "/it/privacy"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(`footer a[href="${rights}"]`)).toHaveCount(1);
    await expect(page.locator(`footer a[href="${privacy}"]`)).toHaveCount(1);
  }
  // The privacy notice says what the site does not do; the site must not do it (cookies and third parties:
  // matrix.spec.ts and security.spec.ts). The retention periods it states match the job: 30 days and 12 months.
  await page.goto("/privacy");
  const text = await page.locator("main").innerText();
  expect(text).toMatch(/30 days/);
  expect(text).toMatch(/12 months/);
});
