/** Every validation rule of the two public forms (B2). */
import { describe, expect, test } from "vitest";
import {
  clean,
  countLinks,
  isEmail,
  length,
  LIMITS,
  readComment,
  sitePath,
  validateComment,
  validateReport,
} from "../../worker/src/validate.ts";

const ok = { name: "Marta", email: "marta@example.com", comment: "A few kind words." };

describe("comment form", () => {
  test("a normal comment passes", () => expect(validateComment(ok)).toEqual({}));

  test("name is required", () => expect(validateComment({ ...ok, name: "" }).name).toBe("required"));
  test("name: 80 characters pass, 81 fail", () => {
    expect(validateComment({ ...ok, name: "n".repeat(80) }).name).toBeUndefined();
    expect(validateComment({ ...ok, name: "n".repeat(81) }).name).toBe("long");
  });
  test("lengths count characters, not UTF-16 units", () => {
    expect(length("🙂".repeat(80))).toBe(80);
    expect(validateComment({ ...ok, name: "🙂".repeat(80) }).name).toBeUndefined();
  });

  test("email is required on a comment", () => expect(validateComment({ ...ok, email: "" }).email).toBe("required"));
  test("email: 254 characters pass, 255 fail", () => {
    const at254 = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(at254.length).toBe(254);
    expect(validateComment({ ...ok, email: at254 }).email).toBeUndefined();
    expect(validateComment({ ...ok, email: `x${at254}` }).email).toBe("long");
  });
  test.each(["marta@example.com", "m.rossi+blog@sub.example.it", "anna@xn--bcher-kva.de", "élise@exemple.fr"])(
    "valid email %s",
    (email) => expect(isEmail(email)).toBe(true),
  );
  test.each([
    "not-an-email",
    "@example.com",
    "marta@",
    "marta@example",
    "marta@@example.com",
    "marta@exa mple.com",
    "marta@example..com",
    "<marta>@example.com",
    "marta@example.c",
    "marta@example.123",
    `${"a".repeat(65)}@example.com`,
  ])("invalid email %s", (email) => {
    expect(isEmail(email)).toBe(false);
    expect(validateComment({ ...ok, email }).email).toBe("format");
  });

  test("comment is required", () => expect(validateComment({ ...ok, comment: "" }).comment).toBe("required"));
  test("comment: 5,000 characters pass, 5,001 fail", () => {
    expect(validateComment({ ...ok, comment: "c".repeat(LIMITS.comment) }).comment).toBeUndefined();
    expect(validateComment({ ...ok, comment: "c".repeat(LIMITS.comment + 1) }).comment).toBe("long");
  });
  test("at most 2 links", () => {
    const two = "See https://a.example and www.b.example";
    expect(countLinks(two)).toBe(2);
    expect(validateComment({ ...ok, comment: two }).comment).toBeUndefined();
    expect(validateComment({ ...ok, comment: `${two} and http://c.example` }).comment).toBe("links");
  });
  test.each([
    ["HTTP://A.EXAMPLE", 1],
    ['<a href="x">', 1],
    ["[url=x]y[/url]", 1],
    ["plain words, no links", 0],
    ["email me at marta@example.com", 0],
  ])("link count of %s is %i", (text, n) => expect(countLinks(text)).toBe(n));
});

describe("report form", () => {
  test("a report needs a message, the email is optional", () => {
    expect(validateReport({ message: "Typo in the second paragraph.", email: "" })).toEqual({});
    expect(validateReport({ message: "", email: "" }).message).toBe("required");
  });
  test("an email given must be valid", () =>
    expect(validateReport({ message: "x", email: "nope" }).email).toBe("format"));
  test("message: 3,000 characters pass, 3,001 fail", () => {
    expect(validateReport({ message: "m".repeat(3_000), email: "" }).message).toBeUndefined();
    expect(validateReport({ message: "m".repeat(3_001), email: "" }).message).toBe("long");
  });
  test("at most 2 links in a report too", () =>
    expect(validateReport({ message: "http://a http://b http://c", email: "" }).message).toBe("links"));

  test.each([
    ["/lisbona", "/lisbona"],
    ["/it/lisbona?x=1#y", "/it/lisbona"],
    ["/", "/"],
  ])("page path %s is kept as %s", (input, out) => expect(sitePath(input)).toBe(out));
  test.each(["", "lisbona", "//evil.example/x", "https://evil.example/", "/\\evil.example", "javascript:alert(1)"])(
    "page path %s is refused",
    (input) => expect(sitePath(input)).toBeNull(),
  );
});

describe("normalising input", () => {
  test("trims, folds whitespace in single-line fields, keeps paragraphs in text", () => {
    expect(clean("  Marta \n Rossi  ", false)).toBe("Marta Rossi");
    expect(clean("one\r\n\r\ntwo\rthree", true)).toBe("one\n\ntwo\nthree");
  });
  test("drops control and bidi override characters", () => {
    const rlo = String.fromCodePoint(0x202e);
    expect(clean(`a\u0000b\u0007c${rlo}d`, true)).toBe("abcd");
    expect(clean("tab\tstays", true)).toBe("tab\tstays");
  });
  test("normalises to NFC, so the same word has one length", () => {
    expect(clean("caffé", false)).toBe("caffé");
  });
  test("readComment ignores fields it does not know", () => {
    const form = new URLSearchParams({ name: " Marta ", email: "m@example.com", comment: "Hi", status: "approved" });
    expect(readComment(form)).toEqual({ name: "Marta", email: "m@example.com", comment: "Hi" });
  });
});
