/**
 * In journal entries, one line break typed is one line break on the page (decision 0037). The owner writes on the
 * phone, where one press of Enter means a new line; Markdown would join the two lines into one. An empty line still
 * starts a new paragraph.
 *
 * Astro 7 renders Markdown with Sätteri, its default processor. This integration adds one mdast plugin to it, with
 * no new package: in a file of the journal folder of the content this build reads (scripts/lib/content-root.ts),
 * each line end inside a text node becomes a `break` node, which is a <br> on the page. Everything else is left as
 * Sätteri parses it:
 *
 *  - text nodes are only the words of paragraphs, list items, quotations, emphasis, links and footnotes; code
 *    (blocks and spans), raw HTML, a photo's alt text and caption and the front matter are other kinds of node;
 *  - a heading is skipped: a two-line title stays a title on one line (a Setext heading is the only kind with a
 *    line end inside);
 *  - a line already forced with two spaces or a backslash is already a `break`, so it stays one.
 *
 * Feeds, descriptions, link previews and structured data are built from the front matter, never from the rendered
 * text, so they gain no tag. The standalone pages (About, Now, Rights, Privacy) are not entries and keep Markdown's
 * ordinary rule.
 *
 * The build stops if the processor is not Sätteri (someone set `markdown.processor` to another one): the plugin
 * would not run, and the entries would lose their lines without a word.
 */
import { relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { collectionDir } from "../../scripts/lib/content-root.ts";

/** The few shapes of Sätteri's plugin API this file uses (satteri is Astro's dependency, not ours). */
interface MdastNode {
  type: string;
  value?: string;
}
interface MdastContext {
  parent(node: MdastNode): MdastNode | undefined;
  replaceNode(node: MdastNode, replacement: MdastNode[]): void;
}
interface MdastPlugin {
  name: string;
  text(node: MdastNode, ctx: MdastContext): void;
}
type MdastPluginFactory = (ctx: { fileURL: URL | undefined }) => MdastPlugin | null;

const LINE_END = /\r\n|\r|\n/;
const NAME = "entry-line-breaks";

/** Each line end inside a text node becomes a `break` node; text in a heading is left as it is. */
export const lineBreaks: MdastPlugin = {
  name: NAME,
  text(node, ctx) {
    const value = node.value ?? "";
    if (!LINE_END.test(value)) return;
    for (let up = ctx.parent(node); up; up = ctx.parent(up)) if (up.type === "heading") return;
    const out: MdastNode[] = [];
    const lines = value.split(LINE_END);
    lines.forEach((line, i) => {
      if (i > 0) out.push({ type: "break" });
      const text = i < lines.length - 1 ? line.replace(/[ \t]+$/, "") : line;
      if (text) out.push({ type: "text", value: text });
    });
    ctx.replaceNode(node, out);
  },
};

const journal = fileURLToPath(collectionDir("journal"));

/** True for a file inside the journal folder of the content this build reads. */
export function isEntryFile(fileURL: URL | undefined): boolean {
  if (!fileURL || fileURL.protocol !== "file:") return false;
  const rest = relative(journal, fileURLToPath(fileURL));
  return rest !== "" && !rest.startsWith("..") && !isAbsolute(rest);
}

/** The plugin for journal entries only; nothing for any other Markdown file. */
const forEntries: MdastPluginFactory = ({ fileURL }) => (isEntryFile(fileURL) ? lineBreaks : null);

export function entryLineBreaks(): AstroIntegration {
  return {
    name: NAME,
    hooks: {
      "astro:config:setup": ({ config }) => {
        const processor = config.markdown.processor as { name: string; options: { mdastPlugins?: unknown[] } };
        if (processor.name !== "satteri" || !Array.isArray(processor.options.mdastPlugins))
          throw new Error(
            `${NAME}: the Markdown processor is "${processor.name}", not Astro's default Sätteri, so a line break ` +
              "typed in a journal entry would no longer be a line break on the page (decision 0037).",
          );
        // Once, even when the hook runs again (a restart of the dev server).
        if (!processor.options.mdastPlugins.includes(forEntries)) processor.options.mdastPlugins.push(forEntries);
      },
    },
  };
}
