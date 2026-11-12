/**
 * Visitor-facing messages come from the site's own string files (src/i18n),
 * so both languages live in one place. The admin pages are the owner's alone
 * and are written in English in the admin modules.
 */
import en from "../../src/i18n/en.json" with { type: "json" };
import it from "../../src/i18n/it.json" with { type: "json" };
import type { Lang } from "./manifest.ts";
import type { Field, FieldError } from "./validate.ts";

type Strings = typeof en;
export type Key = keyof Strings;
const strings: Record<Lang, Strings> = { en, it };

export const t = (lang: Lang, key: Key): string => strings[lang][key];

export type FormError = "fast" | "expired" | "honeypot" | "rate";

export const fieldMessage = (lang: Lang, field: Field, error: FieldError): string =>
  t(lang, `w_err_${field}_${error}` as Key);

export const formMessage = (lang: Lang, error: FormError): string => t(lang, `w_err_${error}` as Key);

/** The label a field has on the page, for the error summary. */
export const fieldLabel = (lang: Lang, form: "comment" | "report", field: Field): string => {
  if (form === "report") return t(lang, field === "message" ? "reportMessage" : "reportEmail");
  return t(lang, field === "name" ? "fieldName" : field === "email" ? "fieldEmail" : "fieldComment");
};
