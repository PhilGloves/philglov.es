/** The signed form timestamp, the admin CSRF token and the rate limiter (B2, B4). */
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { allow, RATE_LIMIT, RATE_WINDOW, sweep } from "../../worker/src/ratelimit.ts";
import { checkCsrfToken, checkFormToken, csrfToken, formToken } from "../../worker/src/tokens.ts";
import { resetDb } from "./helpers.ts";

const KEY = "test-form-key";
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

describe("form token", () => {
  test("younger than 3 s is too fast; 3 s to 24 h is fine; older has expired", async () => {
    const token = await formToken(KEY, NOW);
    expect(await checkFormToken(KEY, token, NOW + 2_999)).toBe("fast");
    expect(await checkFormToken(KEY, token, NOW + 3_000)).toBe("ok");
    expect(await checkFormToken(KEY, token, NOW + 24 * 3600_000)).toBe("ok");
    expect(await checkFormToken(KEY, token, NOW + 24 * 3600_000 + 1)).toBe("expired");
  });
  test("a changed timestamp, signature or key is invalid", async () => {
    const token = await formToken(KEY, NOW);
    const [v, ts, sig] = token.split(".");
    const earlier = (NOW - 3_600_000).toString(36);
    expect(await checkFormToken(KEY, `${v}.${earlier}.${sig}`, NOW)).toBe("invalid");
    expect(await checkFormToken(KEY, `${v}.${ts}.${sig?.slice(0, -2)}AA`, NOW + 5_000)).toBe("invalid");
    expect(await checkFormToken("another-key", token, NOW + 5_000)).toBe("invalid");
  });
  test.each([
    "",
    "v1",
    "v1..",
    "v2.abc.def",
    "v1.zzzzzzzzzzzzz.sig",
    "v1.abc.sig.extra",
    "<script>",
    "v1.abc.token",
    "v1.abc.a",
  ])("garbage %j is invalid", async (token) => expect(await checkFormToken(KEY, token, NOW)).toBe("invalid"));
  test("a token from the future (beyond clock skew) is invalid", async () => {
    expect(await checkFormToken(KEY, await formToken(KEY, NOW + 120_000), NOW)).toBe("invalid");
  });
});

describe("CSRF token", () => {
  test("bound to the Access user and valid for 12 hours", async () => {
    const token = await csrfToken(KEY, "owner", NOW);
    expect(await checkCsrfToken(KEY, "owner", token, NOW + 1_000)).toBe(true);
    expect(await checkCsrfToken(KEY, "someone-else", token, NOW + 1_000)).toBe(false);
    expect(await checkCsrfToken(KEY, "owner", token, NOW + 12 * 3600_000 + 1)).toBe(false);
    expect(await checkFormToken(KEY, token, NOW + 5_000)).toBe("invalid");
  });
});

describe("rate limit: 5 per 10 minutes per address hash", () => {
  beforeEach(resetDb);

  test("the sixth submission in a window is refused", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) expect(await allow(env.DB, "a", NOW + i)).toBe(true);
    expect(await allow(env.DB, "a", NOW + 10)).toBe(false);
    expect(await allow(env.DB, "a", NOW + RATE_WINDOW - 1)).toBe(false);
  });
  test("other addresses are counted apart", async () => {
    for (let i = 0; i < RATE_LIMIT + 1; i++) await allow(env.DB, "a", NOW);
    expect(await allow(env.DB, "b", NOW)).toBe(true);
  });
  test("a new window starts 10 minutes after the first submission", async () => {
    for (let i = 0; i < RATE_LIMIT + 1; i++) await allow(env.DB, "a", NOW);
    expect(await allow(env.DB, "a", NOW + RATE_WINDOW)).toBe(true);
    for (let i = 1; i < RATE_LIMIT; i++) expect(await allow(env.DB, "a", NOW + RATE_WINDOW + i)).toBe(true);
    expect(await allow(env.DB, "a", NOW + RATE_WINDOW + 10)).toBe(false);
  });
  test("finished windows are swept, so address hashes do not linger", async () => {
    await allow(env.DB, "old", NOW);
    await allow(env.DB, "new", NOW + RATE_WINDOW);
    await sweep(env.DB, NOW + RATE_WINDOW + 1);
    const { results } = await env.DB.prepare("SELECT key FROM rate_limits").all<{ key: string }>();
    expect(results.map((r) => r.key)).toEqual(["new"]);
  });
});
