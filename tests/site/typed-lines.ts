/**
 * Reads an entry's Markdown for the site's own check that a line typed is a line on the page (decision 0037,
 * tests/site/typed-lines.spec.ts). That check runs on whatever the owner has written and holds a phone publish, so
 * it must never fail on text that is fine. This reader is therefore not a Markdown parser: it returns only the
 * paragraphs that are certainly plain text typed one Enter per line, and leaves out everything it cannot be sure of.
 *
 * A paragraph is returned when it stands between empty lines, has two lines or more, every line starts with a letter
 * at the left edge (so no list, quotation, heading, table row, indented code, HTML, footnote or link definition, and
 * no underline that would make the line above a heading), and it holds none of the characters that can make a line
 * break mean something else or change the words on the page: a code span, HTML, an entity, a link or photo with its
 * address, a reference link, a footnote reference. An entry with a fenced code block, or with HTML that may hold
 * empty lines (a comment, <pre>), is left out whole: between their lines an empty line does not end anything.
 */
const WHOLE_ENTRY_UNSURE = /<!|<\?|<(?:pre|script|style|textarea)\b|^\s*(?:`{3}|~{3})/im;
const PARAGRAPH_UNSURE = /[`<>&]|\]\(|\]\[|\[\^/;

export function typedParagraphs(markdown: string): string[][] {
  const text = markdown.replace(/\r\n?/g, "\n");
  if (WHOLE_ENTRY_UNSURE.test(text)) return [];
  return text
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) => block.split("\n").filter((line) => line.trim() !== ""))
    .filter(
      (lines) =>
        lines.length > 1 && lines.every((line) => /^\p{L}/u.test(line)) && !PARAGRAPH_UNSURE.test(lines.join("\n")),
    );
}

/**
 * The letters and digits of a line, nothing else: what is the same in the Markdown and on the page, where quotation
 * marks are curled, dashes joined, and the marks of italics and bold are gone.
 */
export const letters = (line: string): string => line.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");

/** One paragraph as one comparable string: its lines' letters, one line each. */
export const asLines = (lines: readonly string[]): string => lines.map(letters).join("\n");
