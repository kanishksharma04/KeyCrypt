import { defineConfig } from "@playwright/test";
import { getTestDatabaseUrl } from "./src/test/integration/database-url";

// The browser extension, loaded unpacked into Chromium, against a production
// build of the app (same throwaway database as `pnpm test:e2e`):
//   export DATABASE_URL_TEST=postgresql://keycrypt:keycrypt@localhost:54329/keycrypt_test
//   pnpm test:extension
//
// e2e/extension/global-setup.ts builds a test copy of the extension into
// extension/dist-e2e (app origin = this server, plus a host permission for the
// local test login page, and a fixed extension id).

const PORT = Number(process.env.E2E_EXT_PORT ?? 3212);
const baseURL = `http://localhost:${PORT}`;
process.env.KEYCRYPT_E2E_APP_URL = baseURL;

export default defineConfig({
  testDir: "./e2e/extension",
  globalSetup: "./e2e/extension/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: "pnpm prisma migrate deploy && pnpm build && pnpm start",
    url: `${baseURL}/auth/signin`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: getTestDatabaseUrl(),
      PORT: String(PORT),
      AUTH_SECRET: "e2e-only-secret-never-used-anywhere-else-0123456789",
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
      NEXT_PUBLIC_APP_URL: baseURL,
      SMTP_HOST: "",
      E2E: "1",
      E2E_DISABLE_RATE_LIMIT: "1",
    },
  },
});
