# 0041 - Front-end audit: keyboard order, journal semantics and portrait size

The site keeps Index × v1 while addressing the issues found in the November 25 audit.

- The two header layouts follow their visible keyboard order. They share one navigation component, and just one menu is available at each width, so both carry the same name ("Main" / "Principale"). html-validate reads the HTML without the CSS, so its `unique-landmark` rule is off; axe checks the landmarks on the rendered page. With CSS disabled the compact menu remains available.
- The journal keeps named column headers when it stacks. Visible language codes have full spoken equivalents, and the home legend covers the entries actually shown.
- The 256 px About portrait has its own responsive sizes, up to 768 px for 3× screens, at the same JPEG quality as every other photo. The full photo templates retain their larger sources.
