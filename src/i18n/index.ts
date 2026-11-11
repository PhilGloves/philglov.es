import en from "./en.json" with { type: "json" };
import it from "./it.json" with { type: "json" };

export type Locale = "en" | "it";
export type UiKey = keyof typeof en;

const strings: Record<Locale, Record<UiKey, string>> = { en, it };

/** Interface string in the given language. No UI text is hard-coded in templates. */
export function t(locale: Locale, key: UiKey): string {
  return strings[locale][key];
}

/**
 * Path of the same page in the other language: the switch only adds or
 * removes the /it prefix. `path` has no trailing slash ("/" for home).
 */
export function twinPath(locale: Locale, path: string): string {
  if (locale === "en") return path === "/" ? "/it" : `/it${path}`;
  const rest = path.replace(/^\/it(?=\/|$)/, "");
  return rest === "" ? "/" : rest;
}
