/**
 * WCAG 2.2 contrast checker for src/styles/tokens.css.
 * `node scripts/contrast.ts` prints every pair for both themes; the unit test
 * (tests/unit/tokens.test.ts) imports `checkTheme` and fails below the floors.
 * No dependencies.
 */
import { readFileSync } from "node:fs";

export type Theme = "light" | "dark";
export type Tokens = Record<string, string>;

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `top` painted at `alpha` over `base`, as sRGB (what color-mix(in srgb) gives). */
export function blend(top: string, base: string, alpha: number): string {
  const [a, b] = [rgb(top), rgb(base)];
  const out = a.map((v, i) => Math.round(v * alpha + (b[i] ?? 0) * (1 - alpha)));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Colour tokens of one theme, read from the three theme blocks of tokens.css. */
export function readTheme(css: string, theme: Theme): Tokens {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector = "", body = ""]) => [selector.replace(/\s+/g, " ").trim(), body] as const,
  );
  const light = ':root, [data-theme="light"]';
  const dark = ['[data-theme="dark"]', ':root:not([data-theme="light"])'];
  const tokens: Tokens = {};
  for (const [selector, body] of blocks) {
    const hit = theme === "light" ? selector === light : dark.includes(selector);
    if (!hit) continue;
    for (const [, name = "", value = ""] of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)) {
      tokens[name] = value;
    }
  }
  return tokens;
}

export interface Pair {
  label: string;
  fg: string;
  bg: string;
  floor: number;
}

export function pairs(t: Tokens): Pair[] {
  const get = (name: string): string => {
    const v = t[name];
    if (!v) throw new Error(`token --${name} not found`);
    return v;
  };
  const tint = blend(get("accent"), get("bg"), 0.07);
  return [
    { label: "text on bg", fg: get("text"), bg: get("bg"), floor: 7 },
    { label: "text on surface", fg: get("text"), bg: get("surface"), floor: 7 },
    { label: "muted on bg", fg: get("muted"), bg: get("bg"), floor: 4.5 },
    { label: "muted on surface", fg: get("muted"), bg: get("surface"), floor: 4.5 },
    { label: "accent on bg", fg: get("accent"), bg: get("bg"), floor: 7 },
    { label: "accent on surface", fg: get("accent"), bg: get("surface"), floor: 4.5 },
    { label: "accent on row hover tint", fg: get("accent"), bg: tint, floor: 4.5 },
    { label: "muted on row hover tint", fg: get("muted"), bg: tint, floor: 4.5 },
    { label: "accent-ink on accent", fg: get("accent-ink"), bg: get("accent"), floor: 4.5 },
    { label: "band-text on band", fg: get("band-text"), bg: get("band"), floor: 4.5 },
    { label: "band-muted on band", fg: get("band-muted"), bg: get("band"), floor: 4.5 },
    { label: "error on bg", fg: get("error"), bg: get("bg"), floor: 4.5 },
    { label: "error on surface", fg: get("error"), bg: get("surface"), floor: 4.5 },
    { label: "bg on text (skip link)", fg: get("bg"), bg: get("text"), floor: 7 },
    { label: "muted on bg (input border, UI 3:1)", fg: get("muted"), bg: get("bg"), floor: 3 },
    { label: "focus on bg (UI 3:1)", fg: get("focus"), bg: get("bg"), floor: 3 },
    { label: "band-text on band (focus ring on the band, UI 3:1)", fg: get("band-text"), bg: get("band"), floor: 3 },
  ];
}

export function checkTheme(css: string, theme: Theme): { pair: Pair; value: number; ok: boolean }[] {
  return pairs(readTheme(css, theme)).map((pair) => {
    const value = ratio(pair.fg, pair.bg);
    return { pair, value, ok: value >= pair.floor };
  });
}

if (import.meta.main) {
  const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  let failed = false;
  for (const theme of ["light", "dark"] as const) {
    console.log(`\n${theme}`);
    for (const { pair, value, ok } of checkTheme(css, theme)) {
      if (!ok) failed = true;
      console.log(`${ok ? "ok  " : "FAIL"} ${value.toFixed(2).padStart(6)}  (≥ ${pair.floor})  ${pair.label}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}
