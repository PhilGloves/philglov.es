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
    for (const m of w.text.matchAll(/uses:\s*([^\s#]+)/g))
      assert.match(m[1] ?? "", /@[0-9a-f]{40}$/, `${w.name}: ${m[1]}`);
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

/** Each secret the workflow reads, with the jobs that read it and the environment each job names ("" for none). */
function secretUse(text: string): Map<string, { job: string; environment: string }[]> {
  const use = new Map<string, { job: string; environment: string }[]>();
  let job = "";
  let environment = "";
  for (const line of text.split("\n")) {
    const j = /^ {2}([a-z-]+):$/.exec(line);
    if (j?.[1]) [job, environment] = [j[1], ""];
    const e = /^ {4}environment: (\S+)/.exec(line);
    if (e?.[1]) environment = e[1];
    for (const m of line.matchAll(/secrets\.([A-Z0-9_]+)/g))
      use.set(m[1] ?? "", [...(use.get(m[1] ?? "") ?? []), { job, environment }]);
  }
  return use;
}

// Owner checklist item 6 (SECURITY-REPORT.md): CLOUDFLARE_API_TOKEN can move into the staging, preview and production
// environments only because no job without an environment reads it. CLOUDFLARE_ACCOUNT_ID (an identifier) and the R2
// keys are read by the Test job, which has none, so they stay repository secrets; so does the live check's Access pair.
test("the deploy token is read only by jobs that name an environment; the Test job needs repository secrets only", () => {
  const use = secretUse(ci);
  const token = use.get("CLOUDFLARE_API_TOKEN") ?? [];
  assert.ok(token.length > 0);
  for (const { job, environment } of token) assert.notEqual(environment, "", `${job} reads the deploy token`);
  const plain = [...use].filter(([, jobs]) => jobs.some((j) => j.environment === "")).map(([name]) => name);
  assert.deepEqual(plain.sort(), [
    "CF_ACCESS_CLIENT_ID",
    "CF_ACCESS_CLIENT_SECRET",
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]);
  assert.ok(use.get("CLOUDFLARE_ACCOUNT_ID")?.some((j) => j.job === "test" && j.environment === ""));
});
