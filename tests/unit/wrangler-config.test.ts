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

// Decision 0031: photos are uploaded on staging until launch and on production after it, never both. Every
// environment says which in PHOTO_UPLOADS (the Worker refuses an upload unless it is "on"); production always takes
// them, and staging and preview turn "off" at launch (docs/setup.md, step 12b), together.
test("PHOTO_UPLOADS: production always takes photos; staging and preview take them until launch, together", () => {
  const c = config() as ReturnType<typeof config> & { vars: Record<string, string> };
  assert.equal(c.vars["PHOTO_UPLOADS"], "on", "local and tests");
  assert.equal(c.env["production"]?.vars["PHOTO_UPLOADS"], "on", "production");
  const staging = c.env["staging"]?.vars["PHOTO_UPLOADS"];
  assert.ok(staging === "on" || staging === "off", `staging: ${staging}`);
  assert.equal(c.env["preview"]?.vars["PHOTO_UPLOADS"], staging, "preview follows staging");
});

type Config = ReturnType<typeof config>;
type EnvBlock = Config["env"][string] & { send_email?: { name: string; destination_address?: string }[] };

/**
 * Notifications: staging and preview never send; production sends only after launch, when docs/setup.md step 14 adds
 * the send_email binding EMAIL (no destination_address: the Worker sends to NOTIFY_TO only) and sets NOTIFY "on". The
 * rule used to demand "off" everywhere, so the pull request of step 14 could never pass (final review, T4-01).
 */
function notifyProblems(c: Config): string[] {
  const out: string[] = [];
  for (const [name, block] of Object.entries(c.env) as [string, EnvBlock][]) {
    const notify = block.vars["NOTIFY"];
    const bindings = block.send_email ?? [];
    if (name !== "production" && notify !== "off") out.push(`${name}: NOTIFY must be "off"`);
    if (name === "production" && notify !== "off" && notify !== "on") out.push(`production: NOTIFY "${notify}"`);
    if (name !== "production" && bindings.length) out.push(`${name}: no send_email binding outside production`);
    if (notify === "on" && !bindings.some((b) => b.name === "EMAIL" && b.destination_address === undefined))
      out.push(`${name}: NOTIFY "on" needs the send_email binding EMAIL without a destination_address`);
  }
  return out;
}

test("notifications: off on staging and preview; production sends only with the EMAIL binding", () => {
  const c = config();
  assert.deepEqual(notifyProblems(c), []);
  const withEnv = (name: string, change: (e: EnvBlock) => EnvBlock): Config => ({
    ...c,
    env: { ...c.env, [name]: change(structuredClone(c.env[name] as EnvBlock)) },
  });
  const on = (e: EnvBlock): EnvBlock => ({ ...e, vars: { ...e.vars, NOTIFY: "on" } });
  // docs/setup.md step 14, as written: accepted.
  const step14 = withEnv("production", (e) => ({ ...on(e), send_email: [{ name: "EMAIL" }] }));
  assert.deepEqual(notifyProblems(step14), []);
  // Half of it, or the wrong environment: refused.
  assert.notDeepEqual(notifyProblems(withEnv("production", (e) => ({ ...on(e), send_email: [] }))), []);
  assert.notDeepEqual(notifyProblems(withEnv("staging", (e) => ({ ...on(e), send_email: [{ name: "EMAIL" }] }))), []);
  const fixed = withEnv("production", (e) => ({ ...on(e), send_email: [{ name: "EMAIL", destination_address: "x" }] }));
  assert.notDeepEqual(notifyProblems(fixed), []);
});

test("Access stays unconfigured until the owner sets it", () => {
  for (const [name, env] of Object.entries(config().env))
    assert.match(env.vars["ACCESS_TEAM_DOMAIN"] ?? "", /^[a-z0-9-]+\.cloudflareaccess\.com$/, name);
});

// Owner checklist item 15 (SECURITY-REPORT.md, decision 0030): Workers Logs' invocation logs on staging held the
// visitor's IP address (cf-connecting-ip, x-real-ip), user agent and country, which the privacy notice rules out.
// They are off; the Worker's own lines (worker/src/log.ts) stay. Each environment is resolved with wrangler's own
// reader, so an environment that sets its own `observability` (which replaces the top-level one whole) is caught.
test("every environment keeps Workers Logs for the Worker's own lines and has invocation logs off", async () => {
  const { unstable_readConfig } = await import("wrangler");
  const path = new URL("../../wrangler.jsonc", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  for (const env of [undefined, ...Object.keys(config().env)]) {
    const resolved = unstable_readConfig({ config: path, env }, { hideWarnings: true });
    const name = env ?? "top level";
    assert.equal(resolved.observability?.enabled, true, `${name}: the Worker's own log lines are kept`);
    assert.equal(resolved.observability?.logs?.invocation_logs, false, `${name}: invocation logs are off`);
  }
  assert.deepEqual(Object.keys(config().env).sort(), ["preview", "production", "staging"]);
});
