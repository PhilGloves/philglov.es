# 0011 — Translation runs inside the pull-request run

Status: Superseded by [0012](0012-hand-written-translations.md) on 2026-11-11 (owner decision: no AI translation; the
Translate job, scripts and the TRANSLATE_API_KEY reference described here were removed) · Source: Lead prompt 5 and 12 of the earlier guide

**Decision.** The first job of the CI workflow, `Translate`, runs on pull requests from this repository (not forks,
not Dependabot). `scripts/translate-pr.ts` lists the original-language Markdown files changed on the branch whose twin
is missing or older, skips twins marked `reviewed` (with a warning annotation), calls `scripts/translate.ts` for the
rest, and commits the new twins to the branch with `GITHUB_TOKEN`. Every later job checks out that commit, so build,
tests and preview see the translation in the same run. Until ticket C3 implements the translator, a missing twin is
reported as a warning and the run continues.

**Reason.** A push made with `GITHUB_TOKEN` does not start a new workflow run, so the translation has to happen before
the other jobs of the same run.

**Open question for the owner (before branch protection is turned on).** GitHub attaches check results to the commit a
run started on. When `Translate` pushes a commit, the pull request's new head commit has no checks of its own, so a
branch-protection rule that requires CI will block the merge. Options: (a) push the translation with the GitHub App's
token instead, which starts a fresh run on the new commit (the App already exists for phone publishing, with Contents
and Pull requests permissions); (b) keep `GITHUB_TOKEN` and have the workflow report its results onto the new commit;
(c) re-run CI by hand after each translation. Recommended: (a). Tracked as O2 in TICKETS.md.

**Rejected.** A separate translation workflow (its commit would not trigger CI either). Translating on the public site
or at request time (third-party calls; brief rule 2).
