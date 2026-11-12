import { test } from "node:test";
import assert from "node:assert/strict";
import { WRITE_SCRIPT } from "../../worker/src/admin/client.ts";

// The admin script is served from a string (worker/src/admin/client.ts), so no build step checks it.
test("the /admin/write script parses, and builds the DOM without innerHTML or eval", () => {
  assert.doesNotThrow(() => new Function(WRITE_SCRIPT));
  assert.doesNotMatch(WRITE_SCRIPT, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/);
  assert.ok(WRITE_SCRIPT.length < 12_000, `${WRITE_SCRIPT.length} bytes`);
});
