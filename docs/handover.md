# Handover — Lead → next session

Written 2026-11-11 by the Lead session, at the end of `docs/setup.md` Part 1. Read this after `CLAUDE.md`; it says
what exists, what is decided, what is still open, and what tripped us up. Agents add their own section at the end
when they finish, newest last.

## Where things stand

| Area          | State                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Code          | Astro 7.4.8 scaffold, placeholder home at `/` and `/it`, bilingual 404, Worker with shared security headers                 |
| Content model | `src/content.config.ts`: journal, pages, photo series. No `translation` field (decision 0012)                               |
| CI            | `Test` (lint → typecheck → build → html-validate → unit → e2e → Lighthouse), then deploys                                   |
| Previews      | every pull request → `pr-<n>-philglov-preview.philglov-es.workers.dev` (own D1, staging R2)                                 |
| Staging       | every merge to `main` → `philglov-staging.philglov-es.workers.dev`                                                          |
| Access        | Zero Trust Free, team `gentle-hall-eae9`; both Workers, all traffic, policy "Cloudflare account members"                    |
| Data          | D1 `philglov-staging`, `philglov-preview`; R2 `philglov-originals-staging`, `philglov-backups-staging`; all EU, all private |
| `main`        | ruleset "Protect main": pull request required, `Test` required, no force push, no deletion, no bypass                       |
| Production    | nothing exists yet (Part 2 of `docs/setup.md`, at launch)                                                                   |

Merged: #1 scaffold, #2 D1 IDs, #3 setup state, #4 this note, #5 Lighthouse evidence, #6 Lighthouse median of three.
Decisions 0001–0013 are in `docs/decisions/`.

## How to work now

- **Everything goes through a pull request.** `main` can't be pushed to, by anyone. Branch, commit small, open a PR,
  wait for `Test`, open the preview link (it asks for the Access one-time code), then merge with a merge commit.
- **Stacked PRs:** don't delete the base branch of a PR that another PR targets. GitHub closes the dependent PR
  instead of retargeting it. Retarget it to `main` first, then delete.
- **Repository variables are fixed when a run starts.** A run created before `PREVIEW_DEPLOY` or `STAGING_DEPLOY`
  changes still sees the old value; push again or open a new PR.
- **Install with `pnpm install --frozen-lockfile`.** pnpm 12 refuses versions younger than a day
  (`minimumReleaseAge: 1440`); pin an older release rather than adding an exclusion.
- **Run what CI runs before pushing:** `pnpm lint && pnpm typecheck && pnpm build && pnpm validate:html && pnpm test:unit && pnpm test:e2e`.
- Never deploy by hand without `--env`; CI is the normal path now.
- **A green deploy job is not proof of a deploy.** Until PR #4 the workflow ran without `pipefail`, and a preview upload
  that failed for lack of a token reported success. The workflow now defaults to `shell: bash` (`-eo pipefail`). Check
  the log for "Uploaded philglov-…" and the version ID, or `wrangler deployments list`.

## Owner decisions taken during the Lead session

- The dependency cap (< 10) counts runtime `dependencies` only; dev tools are justified one by one (0007).
- No AI translation anywhere; both languages are written by hand; an entry may exist in one language (0012).
- Fonts: up to 4 files, 120 KB (Archivo upright, Source Serif 4 upright + italic, JetBrains Mono), per the new guide.
- Repository is public; previews share the staging R2 buckets but have their own D1 (0008).
- Access policy is "Cloudflare account" (members of the account). Never "Email domain": with gmail.com it would admit
  every Gmail user.

## Open items

**For the owner**

1. **At launch, give the deploy token zone access for philglov.es** (`docs/setup.md`, end of step 12). The Actions
   secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` were briefly missing on 2026-11-11 and were added back
   with a new token that deliberately has no zone access until launch.
2. Confirm passkeys (or hardware keys) on GitHub and Cloudflare, with no SMS fallback. Nobody else can check this.
3. Placeholders for the rights and privacy pages and About (TICKETS.md, O1): contact email, city, launch date,
   profiles for `sameAs`, bio, About photo.
4. Optional: rename the Zero Trust team `gentle-hall-eae9` (Zero Trust → Settings) before the login page matters.

**For the agents**

- `docs/setup.md` steps 9 and 10 (Worker secrets, GitHub App) are deliberately not done; the backend agent asks for
  them when it needs them. Each Worker's AUD tag and the team JWKS URL are on its Access tab in the dashboard.
- Lighthouse runs 3 times per page and judges every budget on the median (decision 0013, TICKETS.md Q16): one slow
  CI run can no longer fail a page. If Lighthouse still fails, the page missed the budget in at least 2 of 3 runs, so
  treat it as real. Read every run's metrics in the job summary before changing any budget.
- On the Lead's Windows laptop `lhci autorun` sometimes dies with `NO_NAVSTART` (TICKETS.md, Q17); CI on Linux never
  has. Locally, trust the CI run.
- `.claude/launch.json` (local preview server for the app's browser pane) exists only on the Lead's laptop, not in the
  repository.

## Next step

Start agent 2, **Design system**, in a fresh session (Sonnet, high effort), with its prompt from `docs/guide.md`
("2. Design system & art direction") and the checklist in `TICKETS.md` (D1–D12). It works on a branch and opens a pull
request like everyone else.
