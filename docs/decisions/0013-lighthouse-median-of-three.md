# 0013 — Lighthouse judges each page on the median of three runs

Status: Accepted · 2026-11-12 (owner decision on TICKETS.md, Q16)

**Context.** Lighthouse CI measured each page once. On 2026-11-11 it failed 2 of 18 CI attempts, both on the
performance score for `/`, the first URL measured: 0.81, then 0.87 with Total Blocking Time 522 ms against 0–8 ms in
passing runs. The page ships no JavaScript, the other timings were normal, `/it` scored 1.0 in the same run, and both
re-runs passed with no change. The outlier comes from the CI browser, not the site, and it blocked a required check.

**Decision.**

- `lighthouserc.json` runs Lighthouse 3 times per URL (`collect.numberOfRuns: 3`).
- Every assertion is judged on the median of those 3 values (`assert.aggregationMethod: "median"`), for each score
  and metric separately. A page fails only when at least 2 of its 3 runs miss the budget.
- Every budget is unchanged: performance, accessibility and best practices ≥ 0.95, LCP < 2000 ms, CLS < 0.05, total
  size ≤ 180 KB, no third-party requests.
- Every run's report is still saved to `.lighthouseci/` and uploaded with the `test-reports` artifact. The job
  summary lists every run, not just the median.

**Rejected.**

- Lighthouse's default aggregation, `optimistic` (the best of the runs): a page would pass if any one run passed,
  which is a retry by another name.
- `median-run`: it picks one whole run by first paint and time to interactive, then judges every budget on it. On a
  page with no JavaScript these barely vary, so it is not guaranteed to drop a blocking-time outlier. `median` takes
  the middle value of each score directly.
- Lowering the performance floor, or retrying the job automatically.
- A warm-up page load before the first URL: it may remove the cold start, but nothing proves it does, and three runs
  also absorb outliers that are not cold starts.

**Cost.** Two more Lighthouse runs per URL, which lengthens the `Test` job. Recheck this when the QA agent extends
the URL list (Q8): with many pages, assert the median on a representative subset rather than dropping to one run.
