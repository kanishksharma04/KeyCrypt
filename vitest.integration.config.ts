import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { getTestDatabaseUrl } from "./src/test/integration/database-url";
import { E2E_ONLY_LIB_FILES, INTEGRATION_ONLY_LIB_FILES } from "./src/test/coverage-scope";

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
    env: {
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test",
      // Signs re-auth cookies in tests (src/lib/reauth.ts). Not a real secret.
      AUTH_SECRET: "integration-tests-only-secret-0123456789abcdef",
      // Encrypts TOTP secrets at rest (src/lib/two-factor.ts). 32 bytes, not a real key.
      TOTP_ENCRYPTION_KEY: "aW50ZWdyYXRpb24tb25seS10b3RwLWtleS0wMTIzNDU=",
    },
    // All files share one database and truncate it between tests.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    // next-auth's ESM imports "next/server" without an extension, which Node's
    // resolver rejects; letting Vite process it resolves the import.
    server: { deps: { inline: ["next-auth"] } },
    // `pnpm test:integration --coverage`: server actions plus the server-side helpers
    // only these tests exercise (see src/test/coverage-scope.ts).
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage/integration",
      include: ["src/server/**/*.ts", ...INTEGRATION_ONLY_LIB_FILES],
      exclude: ["src/**/*.test.ts", "src/server/__tests__/**", ...E2E_ONLY_LIB_FILES],
      // Fails below these. Measured 2026-11-10: src/server at 90.9% lines, 91.5% functions,
      // 84.0% statements, 71.5% branches (mostly early returns for invalid input and
      // missing sessions that the tests cover once per action, not per branch).
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 80,
        branches: 70,
        "src/server/**": { lines: 90, functions: 90, statements: 80, branches: 70 },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
