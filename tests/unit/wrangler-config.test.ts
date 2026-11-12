import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** wrangler.jsonc without comments and trailing commas (no JSONC parser among the dependencies). */
function config(): {
  secrets?: { required?: string[] };
  env: Record<string, { secrets?: unknown; vars: Record<string, string> }>;
} {
  const text = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

test("deployed environments do not list required secrets: wrangler would refuse every deploy until they are set", () => {
  const c = config();
  for (const [name, env] of Object.entries(c.env)) assert.equal(env.secrets, undefined, name);
  assert.ok(c.secrets?.required?.includes("FORM_HMAC_KEY"), "the local config still declares them for types");
});

test("notifications stay off and Access stays unconfigured until the owner sets them", () => {
  for (const [name, env] of Object.entries(config().env)) {
    assert.equal(env.vars["NOTIFY"], "off", name);
    assert.match(env.vars["ACCESS_TEAM_DOMAIN"] ?? "", /^[a-z0-9-]+\.cloudflareaccess\.com$/, name);
  }
});
