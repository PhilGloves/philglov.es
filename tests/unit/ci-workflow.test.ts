/**
 * Properties of .github/workflows/ci.yml that the security audit relies on (decision 0030). The repository is public:
 * anyone can open a pull request from a fork, and a fork's run can read the caches of main.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../../.github/workflows/", import.meta.url);
const workflows = readdirSync(dir).map((name) => ({ name, text: readFileSync(new URL(name, dir), "utf8") }));
const ci = readFileSync(new URL("ci.yml", dir), "utf8");

/** Every `with: path:` block of an actions/cache step, as text. */
function cachePaths(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!/uses: actions\/cache(\/restore|\/save)?@/.test(line)) return;
    const indent = line.search(/\S/);
    const block: string[] = [];
    for (const next of lines.slice(i + 1)) {
      if (next.trim() !== "" && next.search(/\S/) <= indent) break;
      block.push(next);
    }
    out.push(block.join("\n"));
  });
  return out;
}

test("photo originals never go into the Actions cache, which fork pull requests can read", () => {
  const blocks = workflows.flatMap((w) => cachePaths(w.text));
  assert.ok(blocks.length > 0, "the workflow has cache steps");
  for (const block of blocks) assert.doesNotMatch(block, /\.originals/, `a cache step holds the originals:\n${block}`);
  // Nor in an uploaded artifact.
  for (const w of workflows) assert.doesNotMatch(w.text, /path:[^\n]*\.originals|^\s+src\/\.originals\s*$/m, w.name);
});

test("every action is pinned to a full commit SHA", () => {
  for (const w of workflows)
    for (const m of w.text.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1] ?? "", /@[0-9a-f]{40}$/, `${w.name}: ${m[1]}`);
});

test("no trigger runs a fork's code with this repository's secrets or write token", () => {
  for (const w of workflows) {
    assert.doesNotMatch(w.text, /pull_request_target|workflow_run|issue_comment/, w.name);
    assert.match(w.text, /^permissions:\n {2}contents: read\n/m, `${w.name}: read-only token by default`);
    assert.doesNotMatch(w.text, /^\s*[a-z-]+:\s*write\s*$/m, `${w.name}: no job asks for a write permission`);
  }
  // Previews (Cloudflare token) only for branches of this repository, never Dependabot's.
  assert.match(ci, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(ci, /github\.actor != 'dependabot\[bot\]'/);
});

test("the grey stand-ins for missing originals are never asked for on GitHub", () => {
  for (const w of workflows) assert.doesNotMatch(w.text, /ALLOW_MISSING_ORIGINALS/, w.name);
});
