import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
      TEST_ACCESS_JWT: string;
      TEST_ACCESS_JWT_WRONG_AUD: string;
      TEST_ACCESS_JWT_FORGED: string;
    }
  }
}
