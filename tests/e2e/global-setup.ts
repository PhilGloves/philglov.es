/** Every suite in tests/e2e runs on the test build (decision 0033): refuse any other dist/ before the server starts. */
import { assertFixtureBuild } from "../fixtures/content.ts";

export default function globalSetup(): void {
  assertFixtureBuild();
}
