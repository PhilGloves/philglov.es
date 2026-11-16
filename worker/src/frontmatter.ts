/**
 * The front matter of an entry file, read and changed line by line for /admin/write (decision 0027, SO-01).
 *
 * The phone editor shows two values (title, description) and must leave every other line exactly as it was. So it
 * does not parse YAML into an object and write it back (that would lose comments, quotes and layout): it keeps the
 * file's lines, reads the few values it needs, and replaces a line only when its value changed.
 *
 * It reads a strict subset of YAML: top-level `key: value` lines whose value is one plain, 'single-quoted' or
 * "double-quoted" scalar on that line, with an optional `# comment` after it; blank and comment lines; and indented
 * or `- ` lines, which belong to the key above (an old `tags:` list). A value it cannot read exactly (a folded or
 * literal block, a quoted string over two lines, a flow list, an anchor or a tag, a plain value YAML would turn into
 * a number, a date, true or null) is `undefined`: the caller then refuses instead of guessing.
 * tests/unit/frontmatter.test.ts checks every value it does read against Astro's own parser.
 */

export interface FrontField {
  /** Index of the key's line in `lines`. */
  line: number;
  /** The string value, or undefined when it cannot be read exactly from that one line. */
  value: string | undefined;
  /** The value as written on the line, without the comment (`false`, `"2026-10-21"`, `>-`). */
  raw: string;
  /** The text after the value, kept when the value is replaced: "" or whitespace and a `# comment`. */
  rest: string;
}

export interface FrontMatter {
  /** Everything up to and including the opening `---` line. */
  open: string;
  /** The lines between the fences, each with its own line end. */
  lines: string[];
  /** The closing `---` line with its line end. */
  close: string;
  /** Everything after the closing fence. */
  body: string;
  /** "\r\n" when the opening fence ends so, else "\n". */
  eol: string;
  fields: Map<string, FrontField>;
}

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_-]*):(?=[ \t]|\r?\n|$)[ \t]*(.*?)(\r?\n)?$/;

/** A plain scalar the YAML core schema would not read as a string. */
const NOT_A_STRING =
  /^(?:~|null|true|false|[-+]?(?:\.inf|\.nan)|[-+]?[0-9][0-9_]*(?:\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|[-+]?\.[0-9_]+(?:[eE][-+]?[0-9]+)?|0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d{4}-\d\d?-\d\d?(?:[Tt ].*)?)$/i;

/** After a value: nothing, or whitespace then a comment. */
const REST = /^(?:[ \t]*|[ \t]+#.*)$/;

const ESCAPES: Record<string, string> = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "\t",
  "\t": "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\x85",
  _: "\xa0",
  L: " ",
  P: " ",
};

/** A double-quoted scalar that starts and ends on this line: [value, rest] or undefined. */
function doubleQuoted(text: string): [string, string] | undefined {
  let out = "";
  for (let i = 1; i < text.length; i++) {
    const c = text[i] ?? "";
    if (c === '"') return [out, text.slice(i + 1)];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = text[i + 1] ?? "";
    const width = e === "x" ? 2 : e === "u" ? 4 : e === "U" ? 8 : 0;
    if (width) {
      const hex = text.slice(i + 2, i + 2 + width);
      if (!new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) return undefined;
      const code = parseInt(hex, 16);
      if (code > 0x10ffff) return undefined;
      out += String.fromCodePoint(code);
      i += 1 + width;
    } else {
      const decoded = ESCAPES[e];
      if (decoded === undefined) return undefined; // an escaped line break or an unknown escape
      out += decoded;
      i += 1;
    }
  }
  return undefined; // not closed on this line
}

/** A single-quoted scalar that starts and ends on this line: [value, rest] or undefined. */
function singleQuoted(text: string): [string, string] | undefined {
  let out = "";
  for (let i = 1; i < text.length; i++) {
    const c = text[i] ?? "";
    if (c !== "'") out += c;
    else if (text[i + 1] === "'") {
      out += "'";
      i += 1;
    } else return [out, text.slice(i + 1)];
  }
  return undefined;
}

/** A flow list or map that closes on this line, outside quotes: the text after it, or undefined. */
function flowRest(text: string): string | undefined {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const read = c === '"' ? doubleQuoted(text.slice(i)) : singleQuoted(text.slice(i));
      if (!read) return undefined;
      i = text.length - read[1].length - 1;
    } else if (c === "[" || c === "{") depth += 1;
    else if (c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(i + 1);
    }
  }
  return undefined;
}

/**
 * One value as written after `key:` (line end removed): [value, rest], value undefined when it is not one exact
 * string; null when the value goes on past this line in a way that could make later lines look like keys (a quote
 * or a bracket still open), so the file cannot be read line by line at all.
 */
export function readScalar(text: string): [string | undefined, string] | null {
  if (text.startsWith('"') || text.startsWith("'")) {
    const read = text.startsWith('"') ? doubleQuoted(text) : singleQuoted(text);
    if (!read) return null;
    if (!REST.test(read[1])) return [undefined, ""];
    return read;
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    const rest = flowRest(text);
    if (rest === undefined) return null;
    return [undefined, REST.test(rest) ? rest : ""];
  }
  // Plain: the value ends where a comment starts (whitespace then #).
  const hash = /[ \t]#/.exec(text);
  const value = (hash ? text.slice(0, hash.index) : text).replace(/[ \t]+$/, "");
  const rest = text.slice(value.length);
  if (
    !value ||
    value.startsWith("#") ||
    /^[>|[\]{}&*!%@`,]/.test(value) ||
    /^[-?:](?:[ \t]|$)/.test(value) ||
    /:(?:[ \t]|$)/.test(value) ||
    NOT_A_STRING.test(value)
  )
    return [undefined, rest];
  return [value, rest];
}

/**
 * The front matter split into lines, or null when the file has none or its lines are not the simple top-level
 * mapping this module understands (a repeated key, a quoted or complex key, a directive, a second document).
 */
export function readFrontMatter(text: string): FrontMatter | null {
  const opening = /^(﻿?---[ \t]*(\r?\n))/.exec(text);
  if (!opening?.[1]) return null;
  const open = opening[1];
  const eol = opening[2] ?? "\n";
  const lines: string[] = [];
  const fields = new Map<string, FrontField>();
  let at = open.length;
  let last: FrontField | undefined;
  while (at < text.length) {
    const end = text.indexOf("\n", at);
    const line = end === -1 ? text.slice(at) : text.slice(at, end + 1);
    at += line.length;
    if (/^---[ \t]*(\r?\n)?$/.test(line)) {
      return { open, lines, close: line, body: text.slice(at), eol, fields };
    }
    const index = lines.push(line) - 1;
    const content = line.replace(/\r?\n$/, "");
    if (/^[ \t]*(#.*)?$/.test(content)) continue; // blank or comment
    if (/^[ \t]/.test(content) || /^-(?:[ \t]|$)/.test(content)) {
      // Belongs to the key above: a list item or a continued value.
      if (!last) return null;
      last.value = undefined;
      continue;
    }
    const m = KEY_LINE.exec(line);
    if (!m?.[1] || fields.has(m[1])) return null;
    const written = m[2] ?? "";
    const read = readScalar(written);
    if (!read) return null;
    last = {
      line: index,
      value: read[0],
      raw: written.slice(0, written.length - read[1].length).trim(),
      rest: read[1],
    };
    fields.set(m[1], last);
  }
  return null; // never closed
}

/** A value written so that YAML reads it back exactly: JSON's double-quoted strings are valid YAML. */
export const quoted = (value: string): string => JSON.stringify(value);

/**
 * The file with `key` set to `value`: its line replaced (keeping a trailing comment and the line end), or a new line
 * added before the closing fence. Every other line is untouched.
 */
export function setField(fm: FrontMatter, key: string, value: string): void {
  const field = fm.fields.get(key);
  if (field) {
    const old = fm.lines[field.line] ?? "";
    const end = /\r?\n$/.exec(old)?.[0] ?? fm.eol;
    const rest = field.rest.trim() ? field.rest : "";
    fm.lines[field.line] = `${key}: ${quoted(value)}${rest}${end}`;
    fm.fields.set(key, { line: field.line, value, raw: quoted(value), rest });
    return;
  }
  const lastLine = fm.lines.length - 1;
  if (lastLine >= 0 && !/\n$/.test(fm.lines[lastLine] ?? "")) fm.lines[lastLine] += fm.eol;
  const line = fm.lines.push(`${key}: ${quoted(value)}${fm.eol}`) - 1;
  fm.fields.set(key, { line, value, raw: quoted(value), rest: "" });
}

export const frontMatterText = (fm: FrontMatter): string => fm.open + fm.lines.join("") + fm.close;
