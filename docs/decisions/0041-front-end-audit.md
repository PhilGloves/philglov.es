# 0041 - Front-end audit: keyboard order, journal semantics and portrait size

The staging preview preserves Index × v1 while addressing the issues found in the November 25 audit.

- The two header layouts follow their visible keyboard order. They share one navigation component, and just one menu is available at each width. With CSS disabled the compact menu remains available.
- The journal keeps named column headers when it stacks. Visible language codes have full spoken equivalents, and the home legend covers the entries actually shown.
- The home introduction links directly to the latest entry while keeping the owner's wording. The reading time is metadata beside the featured entry.
- The 256 px About portrait has its own responsive sizes, up to 768 px for 3× screens. The full photo templates retain their larger sources.
