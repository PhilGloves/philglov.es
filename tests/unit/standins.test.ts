import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkOriginals, isStandIn, removeStandIns } from "../../scripts/lib/standins.ts";

// BUG-6: a missing entry photograph stops the build and says which (the rule on GitHub); only an explicit opt-in on a
// local machine builds with a stand-in and a warning that names the files.
const KEYS = ["provafoto/a.jpg", "provafoto/b.jpg", "other/c.jpg"];
const fresh = () => mkdtempSync(join(tmpdir(), "originals-"));
const put = (root: string, key: string, bytes = "real") => {
  mkdirSync(join(root, key, ".."), { recursive: true });
  writeFileSync(join(root, key), bytes);
};

test("a missing original fails the build and names every missing file and the way out", async () => {
  const root = fresh();
  put(root, "other/c.jpg");
  await assert.rejects(checkOriginals(root, KEYS, {}), (error: Error) => {
    assert.match(error.message, /2 photographs used by journal entries are not in src\/\.originals/);
    assert.match(error.message, /src\/\.originals\/provafoto\/a\.jpg/);
    assert.match(error.message, /src\/\.originals\/provafoto\/b\.jpg/);
    assert.doesNotMatch(error.message, /c\.jpg/);
    assert.match(error.message, /pnpm photos:fetch/);
    assert.match(error.message, /ALLOW_MISSING_ORIGINALS=1/);
    return true;
  });
  assert.equal(existsSync(join(root, "provafoto/a.jpg")), false, "nothing is written without the opt-in");
});

test("the opt-in is refused on CI and on GitHub Actions", async () => {
  for (const env of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }]) {
    const root = fresh();
    await assert.rejects(
      checkOriginals(root, KEYS, { ...env, ALLOW_MISSING_ORIGINALS: "1" }),
      /refused on CI: fetch the originals/,
    );
    assert.equal(existsSync(join(root, "provafoto/a.jpg")), false);
  }
});

test("only the exact value 1 opts in", async () => {
  for (const value of ["true", "yes", "0", ""])
    await assert.rejects(checkOriginals(fresh(), KEYS, { ALLOW_MISSING_ORIGINALS: value }), /not in src\/\.originals/);
});

test("with the opt-in, locally: a stand-in at each missing path, a warning naming them, real files untouched", async () => {
  const root = fresh();
  put(root, "other/c.jpg", "the real c");
  const { missing, warning } = await checkOriginals(root, KEYS, { ALLOW_MISSING_ORIGINALS: "1" });
  assert.deepEqual(missing, ["provafoto/a.jpg", "provafoto/b.jpg"]);
  assert.match(warning ?? "", /WARNING: ALLOW_MISSING_ORIGINALS=1: 2 photographs missing/);
  assert.match(warning ?? "", /provafoto\/a\.jpg/);
  assert.match(warning ?? "", /provafoto\/b\.jpg/);
  assert.doesNotMatch(warning ?? "", /c\.jpg/);
  assert.equal(readFileSync(join(root, "other/c.jpg"), "utf8"), "the real c");
  const jpeg = readFileSync(join(root, "provafoto/a.jpg"));
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8], "a real JPEG, so the build can optimise it");
  assert.equal(isStandIn(root, "provafoto/a.jpg"), true);
  assert.equal(isStandIn(root, "other/c.jpg"), false);
});

test("stand-ins are never taken for originals: removed on the next check, and not when a real file replaced one", async () => {
  const root = fresh();
  await checkOriginals(root, KEYS, { ALLOW_MISSING_ORIGINALS: "1" });
  put(root, "provafoto/a.jpg", "downloaded later: the real photograph");
  assert.equal(isStandIn(root, "provafoto/a.jpg"), false);
  assert.deepEqual(removeStandIns(root), ["provafoto/b.jpg", "other/c.jpg"].sort());
  assert.equal(readFileSync(join(root, "provafoto/a.jpg"), "utf8"), "downloaded later: the real photograph");
  assert.equal(existsSync(join(root, "provafoto/b.jpg")), false);
  assert.equal(existsSync(join(root, ".standins.json")), false);
  // A second build without the opt-in must fail again for the ones that are still missing.
  await assert.rejects(checkOriginals(root, KEYS, {}), /not in src\/\.originals/);
});

test("nothing missing: no stand-in, no warning, no error", async () => {
  const root = fresh();
  for (const key of KEYS) put(root, key);
  assert.deepEqual(await checkOriginals(root, KEYS, {}), { missing: [], warning: undefined });
});
