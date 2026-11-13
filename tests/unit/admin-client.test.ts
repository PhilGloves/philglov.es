import { test } from "node:test";
import assert from "node:assert/strict";
import { MODERATION_SCRIPT, WRITE_SCRIPT } from "../../worker/src/admin/client.ts";

// The admin scripts are served from strings (worker/src/admin/client.ts), so no build step checks them.
const scripts = { "/admin/write.js": WRITE_SCRIPT, "/admin/moderation.js": MODERATION_SCRIPT };

for (const [path, script] of Object.entries(scripts))
  test(`${path} parses, and builds the DOM without innerHTML or eval`, () => {
    assert.doesNotThrow(() => new Function(script));
    assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  });

test("the admin scripts stay small", () => {
  assert.ok(WRITE_SCRIPT.length < 12_000, `write.js: ${WRITE_SCRIPT.length} bytes`);
  assert.ok(MODERATION_SCRIPT.length < 3_000, `moderation.js: ${MODERATION_SCRIPT.length} bytes`);
});

test("moderation.js talks only to this origin's /admin/action, and never follows a redirect", () => {
  const calls = [...MODERATION_SCRIPT.matchAll(/fetch\(([^,]+),/g)].map((m) => m[1]);
  assert.deepEqual(calls, ['"/admin/action"']);
  assert.match(MODERATION_SCRIPT, /mode: "same-origin"/);
  assert.match(MODERATION_SCRIPT, /redirect: "manual"/);
  assert.doesNotMatch(MODERATION_SCRIPT, /https?:\/\//);
});
