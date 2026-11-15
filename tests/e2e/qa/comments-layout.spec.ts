/**
 * A comment is text from a stranger: it can hold a 120-character URL, or a name of 80 letters with no space (both are
 * allowed by the form's limits). The page must not scroll sideways because of it, at 320 px or at 390 px.
 *
 * The comment list is written by the Worker (HTMLRewriter), which cannot run in the browser tests' stand-in, so the
 * same markup the Worker writes (worker/src/page.ts, commentList) is put into the page here.
 */
import { expect, test } from "@playwright/test";
import { overflowX } from "./lib.ts";

const LONG_URL = `https://example.com/${"a-very-long-path-segment/".repeat(5)}end`;
const LONG_NAME = "N".repeat(80);

async function withComment(page: import("@playwright/test").Page, name: string, body: string) {
  await page.goto("/lisbona");
  await page.evaluate(
    ({ name, body }) => {
      const slot = document.querySelector('[data-slot="comments"]');
      if (!slot) throw new Error("no comment slot");
      const li = document.createElement("li");
      li.className = "c";
      const n = document.createElement("span");
      n.className = "c-n";
      n.setAttribute("aria-hidden", "true");
      n.textContent = "001";
      const wrap = document.createElement("div");
      const who = document.createElement("p");
      who.className = "c-who";
      const b = document.createElement("b");
      b.textContent = name;
      const date = document.createElement("span");
      date.className = "fine";
      date.textContent = " 13 November 2026";
      who.append(b, date);
      const text = document.createElement("p");
      text.className = "c-body";
      text.textContent = body;
      wrap.append(who, text);
      li.append(n, wrap);
      slot.append(li);
    },
    { name, body },
  );
}

for (const width of [320, 390]) {
  test(`a normal comment fits at ${width} px (the control for the next test)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await withComment(page, "Marta", "The bit about hills being a negotiation is exactly how it felt to me too.");
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
  });

  // BUG-5 (design/frontend): .c-who and .c-body do not break long unbroken strings, so a pasted URL or a long name
  // pushes the page sideways at 320 px (50 px) and at 390 px. Fix: overflow-wrap: anywhere on the comment text. Remove test.fail() when fixed.
  test(`BUG-5: a comment with a long URL and a long name does not widen the page at ${width} px`, async ({ page }) => {
    test.fail();
    await page.setViewportSize({ width, height: 900 });
    await withComment(page, LONG_NAME, `See ${LONG_URL}`);
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
  });
}
