import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      ".astro/",
      ".wrangler/",
      "node_modules/",
      "worker/worker-configuration.d.ts",
      ".lighthouseci/",
      "test-results/",
      "playwright-report/",
    ],
  },
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  {
    rules: {
      // Never ship console noise; scripts may log.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
