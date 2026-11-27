/**
 * QA suite 2, round 3: requirements that the report listed as "stated, but without an effective test":
 *  - main navigation targets are at least 44 × 44 CSS px on phones (the guide asks for 44, not axe's 24);
 *  - `prefers-contrast: more` really changes what is drawn: muted text and rules take the text colour, and every piece of
 *    text in <main>, fine print included, reaches 7:1 in both themes at 1440 and 390 px.
 * (Visible focus at 390, 1024 and 1440 px in both themes is in a11y.spec.ts, with the keyboard tests.)
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { builtPages, readBuilt, THEMES, transitionsDone } from "./lib.ts";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// ---- 44 × 44 on phones --------------------------------------------------------------------------------------------

for (const width of [390, 320]) {
  test(`main navigation and header controls are at least 44 × 44 px at ${width} px, on every page`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 800 });
    const problems: string[] = [];
    let measured = 0;
    for (const built of builtPages()) {
      await page.goto(built.path);
      const boxes = await page.evaluate(() =>
        [...document.querySelectorAll("header nav a, header .rbtn")]
          .map((el) => {
            const r = el.getBoundingClientRect();
            const shown = getComputedStyle(el).display !== "none" && r.width > 0;
            return {
              name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30),
              w: r.width,
              h: r.height,
              shown,
            };
          })
          .filter((b) => b.shown),
      );
      measured += boxes.length;
      expect(boxes.length, `${built.path}: the header has its links`).toBeGreaterThanOrEqual(5);
      for (const b of boxes)
        if (b.w < 43.99 || b.h < 43.99)
          problems.push(`${built.path}: "${b.name}" is ${b.w.toFixed(1)} × ${b.h.toFixed(1)}`);
    }
    expect(measured, "something was measured").toBeGreaterThan(builtPages().length * 4);
    expect(problems).toEqual([]);
  });
}

// ---- prefers-contrast: more ---------------------------------------------------------------------------------------

const CONTRAST_PAGES = ["/", "/it", "/lisbona", "/it/lisbona", "/about", "/photos/lisbon"];

const tokens = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue("--text").trim(),
      muted: style.getPropertyValue("--muted").trim(),
      rule: style.getPropertyValue("--rule").trim(),
    };
  });

for (const theme of THEMES) {
  test(`prefers-contrast: more (${theme}): muted text and rules take the text colour, and nothing else changes it back`, async ({
    page,
  }) => {
    const problems: string[] = [];
    for (const path of CONTRAST_PAGES) {
      // Without the preference the tokens differ (so the check below is not vacuous) ...
      await page.emulateMedia({ colorScheme: theme, contrast: "no-preference", reducedMotion: "reduce" });
      await page.goto(path);
      await transitionsDone(page);
      const normal = await tokens(page);
      expect(normal.muted, `${path} ${theme}: muted differs from text normally`).not.toBe(normal.text);
      expect(normal.rule, `${path} ${theme}: rule differs from text normally`).not.toBe(normal.text);
      // ... and with it they are the text colour, and what is drawn follows.
      await page.emulateMedia({ colorScheme: theme, contrast: "more", reducedMotion: "reduce" });
      await transitionsDone(page);
      const more = await tokens(page);
      if (more.muted !== more.text) problems.push(`${path}: --muted ${more.muted} is not --text ${more.text}`);
      if (more.rule !== more.text) problems.push(`${path}: --rule ${more.rule} is not --text ${more.text}`);
      const drawn = await page.evaluate(() => {
        const text = getComputedStyle(document.querySelector("main p, main .lede") as Element).color;
        const out: string[] = [];
        // Every element that is drawn in the muted colour now has the text colour; every rule too.
        for (const el of document.querySelectorAll("main .fine, main .lab, main .muted, footer .fine")) {
          const colour = getComputedStyle(el).color;
          if (colour !== text && !el.closest(".band"))
            out.push(`${el.className || el.tagName}: ${colour} (text is ${text})`);
        }
        return { out, text };
      });
      problems.push(...drawn.out.map((x) => `${path}: ${x}`));
    }
    expect(problems).toEqual([]);
  });

  test(`prefers-contrast: more (${theme}): all text in <main>, fine print included, reaches AAA 7:1 at 1440 and 390 px`, async ({
    page,
    javaScriptEnabled,
  }) => {
    test.skip(!javaScriptEnabled, "axe-core runs on timers, which do not fire with JavaScript off");
    test.setTimeout(90_000);
    const found: string[] = [];
    // Reduced motion: the ease on the Send button, the inputs and the body (150 and 250 ms) is 0 ms, so axe never reads a frame
    // of it. Measured: 9 of 144 loads of /lisbona at 1440 px read the button at 5.9 to 6.7:1 without it, 0 of 144 with it.
    // The settled colours are the same; `transitionsDone` below is the second guard, and the tokens test says they are.
    await page.emulateMedia({ colorScheme: theme, contrast: "more", reducedMotion: "reduce" });
    for (const path of CONTRAST_PAGES) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.evaluate(`${axeSource}\n;0`);
        const violations = await page.evaluate(async () => {
          const axe = (
            window as unknown as {
              axe: {
                run(c: unknown, o: unknown): Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }>;
              };
            }
          ).axe;
          const result = await axe.run(
            { include: [["main"], ["footer"], ["header"]] },
            { runOnly: { type: "rule", values: ["color-contrast-enhanced"] }, resultTypes: ["violations"] },
          );
          return result.violations.flatMap((v) => v.nodes.map((n) => JSON.stringify(n.target)));
        });
        found.push(...violations.map((v) => `${path} ${width}px: ${v}`));
      }
    }
    expect(found).toEqual([]);
  });

  test(`prefers-contrast: more (${theme}): a keyboard focus ring is still drawn`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, contrast: "more" });
    await page.goto("/lisbona");
    await page.keyboard.press("Tab"); // the skip link
    await page.keyboard.press("Tab"); // the site name
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        width: parseFloat(style.outlineWidth),
        style: style.outlineStyle,
        colour: style.outlineColor,
        shadow: style.boxShadow,
      };
    });
    expect(ring.tag, "focus is on an element").not.toBe("BODY");
    expect(
      ring.style !== "none" && ring.width >= 2 ? "outline" : ring.shadow !== "none" ? "shadow" : "none",
      JSON.stringify(ring),
    ).not.toBe("none");
  });
}

// Control for `transitionsDone`: it must wait for a real transition, or the wait above proves nothing. A theme change starts
// the Send button's 150 ms ease; a colour read at once is a frame of it, and the one read after the wait is the final one.
test("transitionsDone waits for a running colour transition, and the colour read after it is the settled one", async ({
  page,
  javaScriptEnabled,
}) => {
  test.skip(!javaScriptEnabled, "the theme switch is set by a script here");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lisbona");
  await transitionsDone(page);
  const send = page.locator("#comment-form button[type=submit]");
  // The button has no fill since 0047: its label colour (--text) eases instead.
  const colour = () => send.evaluate((el) => getComputedStyle(el).color);
  expect(await colour()).toBe("rgb(20, 20, 20)"); // --text, light
  // Start the ease and read in the same turn: no frame has passed, but the transition is registered.
  const started = await page.evaluate(() => {
    document.documentElement.dataset["theme"] = "dark";
    return document.getAnimations().filter((a) => a instanceof CSSTransition).length;
  });
  expect(started, "a transition started").toBeGreaterThan(0);
  await transitionsDone(page);
  expect(await colour(), "after the wait: --text, dark").toBe("rgb(236, 236, 231)");
});

// BUG-8, the `/404` half, closed as ACCEPTED by the owner (round 3, decision 0022): a request for `/404` itself answers
// 200 with the not-found page. It is not a soft 404 that search engines can find: the page says noindex in its markup and
// in the header, and nothing on the site links to it. This pins exactly those conditions, so the acceptance cannot be
// outgrown quietly (a link to /404, or the noindex lost, fails here).
test("/404 asked for directly is accepted as a 200 because it is noindex and nothing links to it", async ({
  request,
}) => {
  const res = await request.get("/404");
  expect(res.status(), "accepted: the not-found page answers 200 at /404 itself").toBe(200);
  expect(await res.text()).toMatch(/<meta name="robots" content="noindex/);
  expect(res.headers()["x-robots-tag"] ?? "", "the header says noindex too").toMatch(/noindex/);
  const linking = builtPages()
    .filter((p) => p.file !== "404.html") // its own canonical names itself
    .filter((p) => readBuilt(p.file).match(/(?:href|src|action)="(?:https:\/\/philglov\.es)?\/404(?:\.html)?["#?]/))
    .map((p) => p.path);
  expect(linking, "pages that link to /404").toEqual([]);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap, "the sitemap does not list /404").not.toMatch(/\/404</);
});
