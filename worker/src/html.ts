/**
 * Two ways to write markup safely.
 *
 * - `Parts` for HTMLRewriter (public pages): fixed tags go in as HTML, every
 *   piece of text goes in with `html: false`, so the runtime escapes it.
 * - `html` tagged template (admin pages, built as strings): every
 *   interpolated value is escaped unless it is already `Safe` markup.
 */

export type Part = { html: string } | { text: string };

export class Parts {
  readonly list: Part[] = [];
  tag(markup: string): this {
    this.list.push({ html: markup });
    return this;
  }
  text(value: string): this {
    this.list.push({ text: value });
    return this;
  }
  /** Replace the element's content with these parts. */
  fill(el: Element): void {
    el.setInnerContent("");
    this.appendTo(el);
  }
  appendTo(el: Element): void {
    for (const part of this.list) {
      if ("html" in part) el.append(part.html, { html: true });
      else el.append(part.text, { html: false });
    }
  }
}

/** Paragraphs from plain text: blank lines split paragraphs, single newlines become <br>. */
export function paragraphs(parts: Parts, text: string, open: string): Parts {
  for (const para of text.split(/\n{2,}/)) {
    if (!para.trim()) continue;
    parts.tag(open);
    para.split("\n").forEach((line, i) => {
      if (i > 0) parts.tag("<br>");
      parts.text(line);
    });
    parts.tag("</p>");
  }
  return parts;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

export class Safe {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

type Value = string | number | Safe | null | undefined | false | readonly Value[];

function render(value: Value): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Safe {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? "");
  });
  return new Safe(out);
}
