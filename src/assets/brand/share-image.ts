/** Pure helpers for the 1200×630 share-image template. */

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Break a title into at most `maxLines` lines of about `maxChars` characters. */
export function wrapTitle(title: string, maxChars = 22, maxLines = 3): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of title.trim().split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1] ?? ""}…`;
  return kept;
}

/** Writes the title into the share-image template (pure; no file access, so it is unit-tested). */
export function fillShareTemplate(title: string, template: string): string {
  const tspans = wrapTitle(title)
    .map((line, i) => `<tspan x="72" y="${200 + i * 88}">${escapeXml(line)}</tspan>`)
    .join("");
  return template.replace("<!--TITLE-->", `<text>${tspans}</text>`);
}
