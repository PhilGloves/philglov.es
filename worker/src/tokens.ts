/**
 * Signed timestamps (decision 0004).
 *
 * Form token: "v1.<ms in base 36>.<HMAC>", written into every form as the page
 * is served (B3b). A submission must come between 3 s and 24 h after it.
 * CSRF token for /admin: the same shape, bound to the Access user's `sub`.
 */
import { hmacSign, hmacVerify } from "./crypto.ts";

export const TOKEN_MIN_AGE = 3_000;
export const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000;
const CSRF_MAX_AGE = 12 * 60 * 60 * 1000;
/** Clock skew allowed between data centres. */
const SKEW = 60_000;

export type TokenCheck = "ok" | "fast" | "expired" | "invalid";

async function make(key: string, purpose: string, now: number): Promise<string> {
  const ts = now.toString(36);
  return `v1.${ts}.${await hmacSign(key, `${purpose}:${ts}`)}`;
}

async function age(key: string, purpose: string, token: string, now: number): Promise<number | null> {
  const [version, ts, sig, extra] = token.split(".");
  if (version !== "v1" || !ts || !sig || extra !== undefined || !/^[0-9a-z]{1,12}$/.test(ts)) return null;
  if (!(await hmacVerify(key, `${purpose}:${ts}`, sig))) return null;
  return now - parseInt(ts, 36);
}

export const formToken = (key: string, now = Date.now()): Promise<string> => make(key, "form", now);

export async function checkFormToken(key: string, token: string, now = Date.now()): Promise<TokenCheck> {
  const elapsed = await age(key, "form", token, now);
  if (elapsed === null || elapsed < -SKEW) return "invalid";
  if (elapsed < TOKEN_MIN_AGE) return "fast";
  if (elapsed > TOKEN_MAX_AGE) return "expired";
  return "ok";
}

export const csrfToken = (key: string, sub: string, now = Date.now()): Promise<string> => make(key, `csrf:${sub}`, now);

export async function checkCsrfToken(key: string, sub: string, token: string, now = Date.now()): Promise<boolean> {
  const elapsed = await age(key, `csrf:${sub}`, token, now);
  return elapsed !== null && elapsed >= -SKEW && elapsed <= CSRF_MAX_AGE;
}
