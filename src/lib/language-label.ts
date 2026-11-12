/**
 * The "originally written in" label as text: the three rows of the guide's
 * table in both languages (ticket C1). The template (LanguageLabel.astro) only
 * lays it out. Strings come from src/i18n.
 */
import { t, type Locale } from "../i18n/index.ts";
import { labelState, markerFor, otherLocale, pathFor, type LabelState } from "./entries.ts";

export interface LabelText {
  state: LabelState;
  /** IT, EN, IT→EN, EN→IT. */
  marker: string;
  /** "Written in English" / "Originally written in Italian" / … */
  text: string;
  /** The link text ("Leggi in italiano →"), or the plain note when there is no twin. */
  action: string;
  /** Where the link goes; undefined when there is no twin. */
  href: string | undefined;
  /** Language of the link target. */
  hreflang: Locale;
}

/** `rest` is the page path without the language prefix, e.g. "/alps". */
export function labelText(locale: Locale, originalLang: Locale, hasTwin: boolean, rest: string): LabelText {
  const state = labelState({ lang: locale, originalLang }, hasTwin);
  const other = otherLocale(locale);
  const action =
    state === "original-twin"
      ? t(locale, "readOther")
      : state === "translation"
        ? t(locale, "labelReadOriginal")
        : t(locale, "labelNotYet");
  return {
    state,
    marker: markerFor({ lang: locale, originalLang }, locale),
    text: t(locale, state === "translation" ? "labelTranslation" : "labelOriginal"),
    action,
    href: state === "original-only" ? undefined : pathFor(other, rest),
    hreflang: other,
  };
}
