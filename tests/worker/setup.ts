import { applyD1Migrations, env } from "cloudflare:test";

// Runs before each test file: the same migrations CI applies to D1.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
