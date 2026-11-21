/**
 * Final review, T1B-08 and T1-01 (FINAL-REVIEW.md). The build writes the theme script's CSP hash into
 * worker/src/script-hashes.json. The staging and preview deploys bundle the COMMITTED file, so the build must write it
 * exactly as it is committed: then a build changes the file only when the hash changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as prettier from "prettier";
import { scriptHashesFile } from "../../scripts/lib/inline-scripts.ts";

const committedPath = new URL("../../worker/src/script-hashes.json", import.meta.url);

test("the build writes script-hashes.json on one line, as committed, so Prettier and git see no change", async () => {
  const hashes = ["sha256-awTMNTc+p+UHBH1gEtOTkQE1t4tVftYrqrCoty7DI0Q="];
  const written = scriptHashesFile(hashes);
  assert.equal(written, `${JSON.stringify(hashes)}\n`);
  const options = (await prettier.resolveConfig(committedPath.pathname.replace(/^\/(\w:)/, "$1"))) ?? {};
  assert.ok(await prettier.check(written, { ...options, filepath: "script-hashes.json" }), "Prettier keeps it as is");
  // The committed file is in the same form (whatever hash it holds).
  const committed = readFileSync(committedPath, "utf8");
  assert.equal(committed, scriptHashesFile(JSON.parse(committed) as string[]));
});
