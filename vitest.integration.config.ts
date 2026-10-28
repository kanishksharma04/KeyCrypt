import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { getTestDatabaseUrl } from "./src/test/integration/database-url";

// Integration tests: server actions against a real Postgres (DATABASE_URL_TEST).
// Run with `pnpm test:integration`; `pnpm test` never touches a database.
const testDatabaseUrl = getTestDatabaseUrl();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    globalSetup: ["./src/test/integration/global-setup.ts"],
    setupFiles: ["./src/test/integration/setup.ts"],
    // Point the app's Prisma client (src/lib/db.ts) at the test database before
    // any module is loaded.
    env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
    // All files share one database and truncate it between tests.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
