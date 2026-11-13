/**
 * The CI step that lets publisher pull requests auto-merge only when they change entry files (decision 0021). The
 * step is written inline in .github/workflows/ci.yml, where the GitHub App cannot change it; this test takes its
 * script from there and runs it against real merge commits in a throwaway repository, the way the Test job does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const STEP = "Publisher pull requests change entry files only";
const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

/** The step's `if:` and its `run: |` block, dedented, read from the workflow by indentation. */
function step(): { condition: string; script: string; job: string } {
  const lines = workflow.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- name: ${STEP}`);
  assert.ok(start > 0, "the step is in ci.yml");
  const condition = (lines[start + 1] ?? "").trim();
  const run = lines.findIndex((l, i) => i > start && l.trim() === "run: |");
  const indent = (lines[run + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  const job = lines
    .slice(0, start)
    .reverse()
    .find((l) => /^ {2}[a-z-]+:$/.test(l))
    ?.trim();
  return { condition, script: body.join("\n"), job: job ?? "" };
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

/**
 * A repository whose main has an entry and a script, a pull request branch that makes `change`, and the merge commit
 * GitHub would check out, at HEAD. Returns the guard's exit code and output.
 */
function guard(change: (write: (path: string, text: string) => void, remove: (path: string) => void) => void) {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  try {
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };
    const remove = (path: string) => rmSync(join(dir, path));
    git(dir, "init", "--quiet", "--initial-branch=main");
    write("src/content/journal/en/alps.md", "alps\n");
    write("scripts/build.ts", "build\n");
    git(dir, "add", ".");
    git(dir, "commit", "--quiet", "-m", "main");
    git(dir, "switch", "--quiet", "-c", "publish/x");
    change(write, remove);
    git(dir, "add", "-A");
    git(dir, "commit", "--quiet", "--allow-empty", "-m", "change");
    git(dir, "switch", "--quiet", "main");
    write("README.md", "main moved on\n");
    git(dir, "add", ".");
    git(dir, "commit", "--quiet", "-m", "main moves on");
    git(dir, "merge", "--quiet", "--no-ff", "--no-edit", "publish/x");
    // The step fetches the merge commit from origin with two levels of history.
    git(dir, "remote", "add", "origin", dir);
    const sha = git(dir, "rev-parse", "HEAD");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", step().script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GITHUB_SHA: sha },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the step runs in the required Test job, only for the publisher's pull requests", () => {
  const { condition, job } = step();
  assert.equal(job, "test:");
  assert.match(workflow, /^ {2}test:\n {4}name: Test\n/m);
  assert.equal(
    condition,
    "if: github.event_name == 'pull_request' && github.event.pull_request.user.login == 'philglov-publisher[bot]'",
  );
  // The Worker's PUBLISHER is the same login.
  assert.match(
    readFileSync(new URL("../../worker/src/github.ts", import.meta.url), "utf8"),
    /PUBLISHER = "philglov-publisher\[bot\]"/,
  );
});

test("a new entry, or an edit of one, passes", () => {
  const added = guard((write) => write("src/content/journal/it/lago-di-como.md", "nuovo\n"));
  assert.equal(added.code, 0, added.out);
  assert.match(added.out, /ok: A src\/content\/journal\/it\/lago-di-como\.md/);
  const edited = guard((write) => write("src/content/journal/en/alps.md", "alps, edited\n"));
  assert.equal(edited.code, 0, edited.out);
});

test("anything else fails the check: other paths, deletions, renames, other folders, nothing at all", () => {
  const cases: [string, Parameters<typeof guard>[0]][] = [
    ["a script", (write) => write("scripts/build.ts", "changed\n")],
    ["the workflow", (write) => write(".github/workflows/ci.yml", "on: push\n")],
    ["an entry and a script", (write) => (write("src/content/journal/en/new.md", "x\n"), write("scripts/x.ts", "x\n"))],
    ["a deleted entry", (_w, remove) => remove("src/content/journal/en/alps.md")],
    [
      "a renamed entry",
      (write, remove) => (remove("src/content/journal/en/alps.md"), write("src/content/journal/en/alpi.md", "alps\n")),
    ],
    ["a page", (write) => write("src/content/pages/en/about.md", "x\n")],
    ["another language folder", (write) => write("src/content/journal/de/x.md", "x\n")],
    ["a nested path", (write) => write("src/content/journal/en/x/y.md", "x\n")],
    ["a bad slug", (write) => write("src/content/journal/en/Bad_Slug.md", "x\n")],
    ["not Markdown", (write) => write("src/content/journal/en/x.html", "x\n")],
    ["no change", () => {}],
  ];
  for (const [name, change] of cases) {
    const result = guard(change);
    assert.equal(result.code, 1, `${name} should fail:\n${result.out}`);
    assert.match(result.out, /::error::/, name);
  }
});
