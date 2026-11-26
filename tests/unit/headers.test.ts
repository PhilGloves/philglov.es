import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetHeaderLines,
  baseHeaders,
  contentSecurityPolicy,
  CV_PDF,
  cvHeaderRules,
  isIndexable,
  largeHeaderLines,
} from "../../worker/src/headers.ts";

test("only production is indexable", () => {
  assert.equal(isIndexable("production"), true);
  for (const env of ["local", "preview", "staging", "", "Production"]) assert.equal(isIndexable(env), false, env);
});

test("non-production responses carry X-Robots-Tag: noindex", () => {
  assert.equal(baseHeaders("staging")["X-Robots-Tag"], "noindex");
  assert.equal(baseHeaders("preview")["X-Robots-Tag"], "noindex");
  assert.equal(baseHeaders("production")["X-Robots-Tag"], undefined);
});

/**
 * How Cloudflare applies the matching rules of _headers (workers-shared asset-worker, also run by wrangler dev):
 * in file order, each rule first removes its "! Name" headers, then sets its own, appending to a value an earlier
 * rule set.
 */
function served(rules: string[][]): Map<string, string> {
  const out = new Map<string, string>();
  const set = new Set<string>();
  for (const rule of rules) {
    for (const line of rule.filter((l) => l.startsWith("! "))) out.delete(line.slice(2).toLowerCase());
    for (const line of rule.filter((l) => !l.startsWith("! "))) {
      const [name = "", value = ""] = line.split(/:\s*(.*)/);
      const key = name.toLowerCase();
      out.set(key, set.has(key) && out.has(key) ? `${out.get(key)}, ${value}` : value);
      set.add(key);
    }
  }
  return out;
}
const siteRule = (env: string) => Object.entries(baseHeaders(env)).map(([n, v]) => `${n}: ${v}`);

test("staging assets are noindex too (rule 15), said by the /_assets/* rule itself; production assets are not", () => {
  for (const env of ["staging", "preview", "local"]) {
    assert.deepEqual(assetHeaderLines(env), ["! X-Robots-Tag", "X-Robots-Tag: noindex, noai, noimageai"], env);
    assert.equal(served([siteRule(env), assetHeaderLines(env)]).get("x-robots-tag"), "noindex, noai, noimageai");
    // Even alone, without the "/*" rule, it says noindex.
    assert.equal(served([assetHeaderLines(env)]).get("x-robots-tag"), "noindex, noai, noimageai");
  }
  assert.deepEqual(assetHeaderLines("production"), ["X-Robots-Tag: noai, noimageai"]);
  assert.equal(served([siteRule("production"), assetHeaderLines("production")]).get("x-robots-tag"), "noai, noimageai");
});

test("a photograph's large version is noindex in every environment, production included (0043)", () => {
  for (const env of ["production", "staging", "preview", "local"])
    assert.equal(
      served([siteRule(env), assetHeaderLines(env), largeHeaderLines()]).get("x-robots-tag"),
      "noindex, noai, noimageai",
      env,
    );
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
    assert.match(h["Permissions-Policy"] ?? "", new RegExp(String.raw`${feature}=\(\)`));
});

test("the CV: /cv and /cv/* are noindex, said once, and the PDF is a download (0046)", () => {
  const rules = new Map(cvHeaderRules());
  for (const env of ["production", "staging"])
    for (const path of ["/cv", "/cv/*"])
      assert.equal(served([siteRule(env), rules.get(path) ?? []]).get("x-robots-tag"), "noindex", `${env} ${path}`);
  assert.deepEqual(rules.get(CV_PDF), ['Content-Disposition: attachment; filename="Filippo-Guanti-CV.pdf"']);
});
