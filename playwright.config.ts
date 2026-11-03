import { defineConfig, devices } from "@playwright/test";
import { getTestDatabaseUrl } from "./src/test/integration/database-url";

// End-to-end tests against a PRODUCTION build (`pnpm build && pnpm start`), so the
// CSP nonce, HSTS and the rest of the production behaviour are live.
//
// Needs DATABASE_URL_TEST (same throwaway Postgres as `pnpm test:integration`;
// its database name must contain "test"):
//   docker compose -f docker-compose.test.yml up -d --wait
//   export DATABASE_URL_TEST=postgresql://keycrypt:keycrypt@localhost:54329/keycrypt_test
//   pnpm test:e2e

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://localhost:${PORT}`;
const databaseUrl = getTestDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  // e2e/docker and e2e/extension have their own configs (playwright.docker.config.ts,
  // playwright.extension.config.ts).
  testIgnore: ["docker/**", "extension/**"],
  // One shared database and server; run specs one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    // The vault copies secrets to the clipboard; the flow test reads it back.
    permissions: ["clipboard-read", "clipboard-write"],
  },

  webServer: {
    command: "pnpm prisma migrate deploy && pnpm build && pnpm start",
    url: `${baseURL}/auth/signin`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: databaseUrl,
      PORT: String(PORT),
      AUTH_SECRET: "e2e-only-secret-never-used-anywhere-else-0123456789",
      // Enables two-factor sign-in. 32 bytes, not a real key.
      TOTP_ENCRYPTION_KEY: "ZTJlLW9ubHktdG90cC1rZXktbm90LXJlYWwtMDEyMzQ=",
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
      NEXT_PUBLIC_APP_URL: baseURL,
      // No SMTP: new accounts are auto-verified (src/server/auth-actions.ts).
      SMTP_HOST: "",
      // Production turns rate limits on; the flow signs in more than a user would.
      // Honoured only together with E2E=1 (src/lib/rate-limit.ts).
      E2E: "1",
      E2E_DISABLE_RATE_LIMIT: "1",
    },
  },
});
