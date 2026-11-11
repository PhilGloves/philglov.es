import { test } from "node:test";
import assert from "node:assert/strict";
import { baseHeaders, contentSecurityPolicy, isIndexable } from "../../worker/src/headers.ts";

test("only production is indexable", () => {
  assert.equal(isIndexable("production"), true);
  for (const env of ["local", "preview", "staging", "", "Production"]) assert.equal(isIndexable(env), false, env);
});

test("non-production responses carry X-Robots-Tag: noindex", () => {
  assert.equal(baseHeaders("staging")["X-Robots-Tag"], "noindex");
  assert.equal(baseHeaders("preview")["X-Robots-Tag"], "noindex");
  assert.equal(baseHeaders("production")["X-Robots-Tag"], undefined);
});

test("CSP is strict: self only, no unsafe-inline, no framing", () => {
  const csp = contentSecurityPolicy();
  assert.match(csp, /^default-src 'self';/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|https?:/);
});

test("CSP adds the theme-script hash to script-src only", () => {
  const csp = contentSecurityPolicy(["sha256-abc="]);
  assert.match(csp, /script-src 'self' 'sha256-abc=';/);
  assert.match(csp, /style-src 'self';/);
});

test("every response carries the security and TDM headers", () => {
  const h = baseHeaders("production");
  assert.equal(h["Strict-Transport-Security"], "max-age=63072000; includeSubDomains; preload");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(h["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(h["tdm-reservation"], "1");
  for (const feature of ["camera", "microphone", "geolocation", "payment"])
    assert.match(h["Permissions-Policy"] ?? "", new RegExp(`${feature}=\(\)`));
});
