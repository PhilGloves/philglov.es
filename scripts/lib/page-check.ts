/**
 * What a built page may contain (security audit, decision 0030). Markdown passes raw HTML through untouched. The CSP
 * stops scripts, styles, frames, objects and other hosts, but not a <meta http-equiv="refresh"> redirect, a form that
 * looks like a sign-in, or a javascript: or data: link; and an entry from the phone goes live by itself (0021). So
 * postbuild reads every built page with html-validate's parser (already a dev tool here) and refuses:
 *
 * - an element the site does not use (an allow-list: the site's own markup, Markdown's, and plain text HTML);
 * - form controls, scripts and other active elements inside an entry's or a page's text (`.prose`);
 * - <meta>, <link> and <title> outside <head>, and a script in <body> other than the one form script file;
 * - event handlers, `style`, `srcdoc`, `formaction`, `form`, `ping` and `http-equiv` attributes;
 * - addresses other than relative ones, http(s), mailto and tel; anything a page loads must come from this site;
 * - a form other than the comment form and the report form, or either of them twice;
 * - inside an <svg>, anything but drawing elements: the parser does not look inside SVG, and a browser lets <meta>
 *   and other HTML elements break out of it, so the SVG's own text is read instead;
 * - a page the parser cannot read (a browser may read it differently).
 *
 * The rules hold for the whole page, so text that closes its container early gains nothing.
 */
import { definePlugin, HtmlValidate, Rule, StaticConfigLoader, staticResolver, type HtmlElement } from "html-validate";

/** Elements the site, Markdown and plain text HTML use. Anything else fails the build. */
const ALLOWED = new Set(
  (
    "html head body title meta link script " +
    "header footer main nav section article aside div p span a br hr wbr h1 h2 h3 h4 h5 h6 " +
    "em strong b i u s small mark del ins sub sup q cite abbr dfn kbd samp var code pre time data bdi " +
    "blockquote figure figcaption picture source img ul ol li dl dt dd details summary " +
    "table caption thead tbody tfoot tr th td colgroup col ruby rt rp " +
    "form label input textarea select option button progress svg"
  ).split(" "),
);
/** Allowed on the site's own pages, never inside the written text (.prose). */
const NOT_IN_TEXT = new Set(["form", "label", "input", "textarea", "select", "option", "button", "progress", "script"]);
/** Only in <head>. */
const HEAD_ONLY = new Set(["title", "meta", "link"]);
const BAD_ATTRIBUTES = new Set(["style", "srcdoc", "formaction", "form", "ping", "http-equiv"]);
/** Attributes holding an address a click follows. */
const LINKS = ["href", "action", "cite"];
/** Attributes holding an address the page loads: only this site's own files. */
const LOADS = ["src", "poster", "data", "background"];
/** The site's two forms (src/components/CommentSection.astro, SiteFooter.astro; decision 0016). */
const FORMS = new Set(["/api/comment#comment-status", "/api/report#report-status"]);
/** What may appear inside an <svg>: drawing only. */
const SVG_PARTS = new Set([
  "svg",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "g",
  "title",
  "desc",
]);

/**
 * An address a link may point to: relative (no scheme), or http, https, mailto, tel. Browsers drop tabs and line
 * breaks inside a scheme and leading control characters, and decode entities before they read it, so an `&` before
 * the first slash, question mark or hash is refused rather than decoded.
 */
export function safeAddress(value: string): boolean {
  const text = value.replace(/[\t\n\r]/g, "").replace(/^[\u0000- ]+/, "");
  const head = text.split(/[/?#]/, 1)[0] ?? "";
  if (head.includes("&")) return false;
  const colon = head.indexOf(":");
  return colon === -1 || /^(?:https?|mailto|tel)$/i.test(head.slice(0, colon));
}

/**
 * An address the page loads: relative and on this site (not `//other.host/`). Browsers drop tabs and line breaks
 * and read `\` as `/`, so `/\other.host` and `/<tab>/other.host` are read as that too, and an entity such as `&#9;`
 * is a tab once decoded: a file of this site has no `&` in its path (audit finding 12).
 */
const ownFile = (value: string): boolean => {
  const url = value
    .replace(/[\t\n\r]/g, "")
    .replace(/\\/g, "/")
    .trim();
  return safeAddress(value) && !/^[a-z][a-z0-9+.-]*:|^\/\/|^[^?#]*&/i.test(url);
};

const short = (value: string): string => (value.length > 80 ? `${value.slice(0, 77)}...` : value);

function problemsOf(el: HtmlElement): string[] {
  const out: string[] = [];
  const name = el.tagName.toLowerCase();
  const attr = (key: string): string | null => {
    const value = el.getAttribute(key)?.value;
    return typeof value === "string" ? value : value === null && el.hasAttribute(key) ? "" : null;
  };
  if (!ALLOWED.has(name)) out.push(`<${name}> is not allowed`);
  const inText = el.closest(".prose") !== null;
  const inHead = el.closest("head") !== null;
  if (
    inText &&
    NOT_IN_TEXT.has(name) &&
    !(name === "input" && attr("type") === "checkbox" && attr("disabled") !== null)
  )
    out.push(`<${name}> is not allowed in the text`);
  if (HEAD_ONLY.has(name) && !inHead) out.push(`<${name}> is only allowed in <head>`);
  if (name === "script" && !inHead && !(attr("type") === "module" && /^\/_assets\/[^/]+\.js$/.test(attr("src") ?? "")))
    out.push(`<script> in the body other than the form script`);
  if (name === "form" && !FORMS.has(attr("action") ?? "")) out.push(`a form sent to ${short(attr("action") ?? "")}`);
  for (const a of el.attributes) {
    const key = a.key.toLowerCase();
    if (key.startsWith("on") || BAD_ATTRIBUTES.has(key)) out.push(`<${name}> has a "${key}" attribute`);
  }
  for (const key of LINKS) {
    const value = attr(key);
    if (value !== null && !safeAddress(value)) out.push(`<${name}> links to the address ${short(value)}`);
  }
  for (const key of LOADS) {
    const value = attr(key);
    if (value !== null && name !== "meta" && !ownFile(value))
      out.push(`<${name}> loads ${short(value)} from another host or address`);
  }
  for (const key of ["srcset", "imagesrcset"]) {
    for (const candidate of (attr(key) ?? "").split(",")) {
      const url = candidate.trim().split(/\s+/)[0] ?? "";
      if (url && !ownFile(url)) out.push(`<${name}> loads ${short(url)} from another host or address`);
    }
  }
  return out;
}

class PageRule extends Rule {
  override setup(): void {
    this.on("dom:ready", (event) => {
      const walk = (el: HtmlElement): void => {
        for (const child of el.childElements) {
          for (const problem of problemsOf(child)) this.report(child, problem);
          walk(child);
        }
      };
      walk(event.document.root);
      const seen = new Set<string>();
      for (const form of event.document.querySelectorAll("form")) {
        const action = String(form.getAttribute("action")?.value ?? "");
        if (seen.has(action)) this.report(form, `the form sent to ${short(action)} appears twice`);
        seen.add(action);
      }
    });
  }
}

const RULE = "philglov/page";
const validator = new HtmlValidate(
  new StaticConfigLoader(
    [staticResolver({ plugins: { philglov: definePlugin({ name: "philglov", rules: { [RULE]: PageRule } }) } })],
    { root: true, plugins: ["philglov"], rules: { [RULE]: "error" } },
  ),
);

/** Inside each <svg>, read as text: only drawing elements, and no handler, link or style attribute. */
function svgProblems(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<svg\b[\s\S]*?(?:<\/svg\s*>|$)/gi)) {
    const svg = m[0];
    for (const t of svg.matchAll(/<\/?\s*([a-zA-Z][^\s/>]*)/g)) {
      const name = (t[1] ?? "").toLowerCase();
      if (!SVG_PARTS.has(name)) out.push(`an SVG holds <${name}>, which is not a drawing element`);
    }
    for (const a of svg.matchAll(/\s((?:on[a-z]+)|href|xlink:href|style)\s*=/gi))
      out.push(`an SVG holds a "${(a[1] ?? "").toLowerCase()}" attribute`);
  }
  return out;
}

const FORM_PROBLEM = /^(?:a form sent to|the form sent to) /;

/**
 * The problems of one built page, each a short sentence; [] when the page is fine. `specimens` is for /styleguide
 * only, which is built from the repository's components (no content reaches it) and shows the forms as specimens:
 * there, and only there, a form may repeat or go to an in-page anchor.
 */
export async function pageProblems(html: string, { specimens = false } = {}): Promise<string[]> {
  const report = await validator.validateString(html, "page.html");
  const out: string[] = [];
  for (const result of report.results)
    for (const m of result.messages) {
      if (m.ruleId !== RULE) out.push(`the page cannot be read: ${m.message}`);
      else if (!(specimens && FORM_PROBLEM.test(m.message))) out.push(`${m.message} (line ${m.line})`);
    }
  return [...new Set([...out, ...svgProblems(html)])];
}
