/**
 * Server-side validation of the two public forms (B2). Pure: no runtime APIs,
 * so every rule is unit-tested. The text is stored exactly as typed, after
 * normalising, and escaped wherever it is shown.
 */

export const LIMITS = { name: 80, email: 254, comment: 5_000, message: 3_000, links: 2 } as const;

export type Field = "name" | "email" | "comment" | "message";
export type FieldError = "required" | "long" | "format" | "links";
export type Errors = Partial<Record<Field, FieldError>>;

export interface CommentInput {
  name: string;
  email: string;
  comment: string;
}

export interface ReportInput {
  message: string;
  email: string;
}

/**
 * NFC, Windows line ends to \n, and no control characters except tab and
 * newline (a NUL or a bidi override has no place in a comment). Trimmed.
 */
export function clean(value: string | null | undefined, multiline: boolean): string {
  let text = (value ?? "").normalize("NFC").replace(/\r\n?/g, "\n");
  // C0/C1 controls except tab and newline, then the bidi embedding/override/isolate controls.
  text = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "").replace(/\p{Bidi_Control}/gu, "");
  if (!multiline) text = text.replace(/\s+/g, " ");
  return text.trim();
}

/** Length in characters as a reader counts them (code points, not UTF-16 units). */
export const length = (text: string): number => [...text].length;

/** Things that turn into links: URLs, www. addresses, and HTML or BBCode link markup. */
export function countLinks(text: string): number {
  return (text.match(/https?:\/\/|\bwww\.|<a\s|\[url/gi) ?? []).length;
}

/**
 * A practical address check, not RFC 5322: one @, no spaces or brackets, a
 * local part up to 64 characters and a domain with a dot and a 2+ letter end.
 */
export function isEmail(text: string): boolean {
  const at = text.lastIndexOf("@");
  if (at < 1 || at > 64 || text.indexOf("@") !== at) return false;
  return /^[^\s@<>()[\]\\,;:"]+@(?:[^\s@<>()[\]\\,;:".]+\.)+[^\s@<>()[\]\\,;:".\d]{2,}$/u.test(text);
}

function checkEmail(email: string, required: boolean): FieldError | undefined {
  if (!email) return required ? "required" : undefined;
  if (length(email) > LIMITS.email) return "long";
  return isEmail(email) ? undefined : "format";
}

function checkText(text: string, max: number): FieldError | undefined {
  if (!text) return "required";
  if (length(text) > max) return "long";
  return countLinks(text) > LIMITS.links ? "links" : undefined;
}

export function readComment(form: URLSearchParams): CommentInput {
  return {
    name: clean(form.get("name"), false),
    email: clean(form.get("email"), false),
    comment: clean(form.get("comment"), true),
  };
}

export function readReport(form: URLSearchParams): ReportInput {
  return { message: clean(form.get("message"), true), email: clean(form.get("email"), false) };
}

export function validateComment(input: CommentInput): Errors {
  const errors: Errors = {};
  if (!input.name) errors.name = "required";
  else if (length(input.name) > LIMITS.name) errors.name = "long";
  const email = checkEmail(input.email, true);
  if (email) errors.email = email;
  const comment = checkText(input.comment, LIMITS.comment);
  if (comment) errors.comment = comment;
  return errors;
}

export function validateReport(input: ReportInput): Errors {
  const errors: Errors = {};
  const message = checkText(input.message, LIMITS.message);
  if (message) errors.message = message;
  const email = checkEmail(input.email, false);
  if (email) errors.email = email;
  return errors;
}

/**
 * The page a report is about: a path on this site, nothing else. Returns the
 * path without query or fragment, or null for anything that could point away.
 */
export function sitePath(value: string | null): string | null {
  const text = (value ?? "").trim();
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || text.length > 300) return null;
  try {
    const url = new URL(text, "https://philglov.es");
    if (url.origin !== "https://philglov.es") return null;
    return url.pathname;
  } catch {
    return null;
  }
}
