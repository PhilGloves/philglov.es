import type { Page } from "@playwright/test";

/**
 * Measures, in the browser, what decision 0025 is about: the space under the header line and the title and intro
 * styles. Text positions come from the font itself, not from a guess:
 *   baseline  = top of the text's content area + the font's ascent;
 *   cap top   = baseline - the height of a capital H.
 * Both are read with a canvas in the font the element really uses, after the fonts have loaded.
 */

export interface TextMark {
  /** The page's y of the baseline of the first line, in px. */
  baseline: number;
  /** The page's y of the top of the capital letters of the first line, in px. */
  capTop: number;
  fontSize: number;
}

export interface HeadMetrics {
  /** The bottom edge of the header line. */
  line: number;
  /** Baseline of the menu words (the nav links of the first row), in px. */
  menuBaseline: number;
  /** First line of text under the header (the topmost visible text in <main>). */
  first: TextMark & { tag: string; text: string };
  /** The h1's own first line. */
  h1: TextMark & { top: number; fontSize: number };
  /** Top edge of the left column's first thing (text: its cap top; a picture: its top edge), desktop only. */
  left: number | null;
}

/** Runs in the page. Kept as one function so Playwright can serialise it. */
export async function headMetrics(page: Page): Promise<HeadMetrics> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const canvas = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const markOf = (node: Text): TextMark => {
      const el = node.parentElement as Element;
      const cs = getComputedStyle(el);
      canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = canvas.measureText("H");
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0] as DOMRect;
      const baseline = rect.top + window.scrollY + m.fontBoundingBoxAscent;
      return { baseline, capTop: baseline - m.actualBoundingBoxAscent, fontSize: parseFloat(cs.fontSize) };
    };
    const visibleText = (root: Element): Text[] => {
      const out: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n as Text;
        const el = text.parentElement;
        if (!el || !text.data.trim()) continue;
        if (el.closest("script, style, template, .sr-only")) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = document.createRange();
        r.selectNodeContents(text);
        const rect = r.getClientRects()[0];
        // sr-only text (clipped to a pixel) is not visible
        if (!rect || rect.width <= 1 || rect.height <= 1) continue;
        out.push(text);
      }
      return out;
    };
    const head = document.querySelector("header.head") as Element;
    const line = head.getBoundingClientRect().bottom + window.scrollY;
    const navLink = [...head.querySelectorAll(".nav a")].find(
      (a) => (a as HTMLElement).offsetParent !== null,
    ) as Element;
    const menuNode = visibleText(navLink)[0] as Text;
    const menuBaseline = markOf(menuNode).baseline;

    const main = document.querySelector("main") as Element;
    const texts = visibleText(main).sort((a, b) => {
      const ra = (a.parentElement as Element).getBoundingClientRect();
      const rb = (b.parentElement as Element).getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
    const firstNode = texts[0] as Text;
    const first = {
      ...markOf(firstNode),
      tag: (firstNode.parentElement as Element).tagName,
      text: firstNode.data.trim(),
    };

    const h1 = main.querySelector("h1") as Element;
    const h1Node = visibleText(h1)[0] as Text;
    const h1Mark = markOf(h1Node);

    // Left column of the head on desktop: a .lab that sits level with the h1.
    let left: number | null = null;
    const lab = main.querySelector(".hero > .lab, .top > .lab") as Element | null;
    const h1Box = h1.getBoundingClientRect();
    if (lab && lab.getBoundingClientRect().right <= h1Box.left) {
      const labTexts = visibleText(lab);
      const picture = lab.querySelector(".portrait");
      left = picture
        ? picture.getBoundingClientRect().top + window.scrollY
        : labTexts[0]
          ? markOf(labTexts[0]).capTop
          : null;
    }
    return { line, menuBaseline, first, h1: { ...h1Mark, top: h1.getBoundingClientRect().top + window.scrollY }, left };
  });
}

/** The h1 and intro styles that must be equal on every page. */
export async function titleStyle(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const pick = (el: Element, props: string[]): Record<string, string> => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    };
    const h1 = document.querySelector("main h1") as Element;
    return pick(h1, ["font-size", "font-weight", "line-height", "letter-spacing"]);
  });
}
