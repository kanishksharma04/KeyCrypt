// Which src/lib files are measured by which test run (see vitest.config.ts and
// vitest.integration.config.ts).
//
// These server-side helpers need a database, a session or the server's
// environment, so only the integration tests (directly or through the server
// actions in src/server) exercise them. The unit-test run leaves them out of
// its coverage numbers; the integration run measures them next to src/server.
export const INTEGRATION_ONLY_LIB_FILES = [
  "src/lib/audit.ts",
  "src/lib/authorize-credentials.ts",
  "src/lib/db.ts",
  "src/lib/email.ts",
  "src/lib/password.ts",
  "src/lib/reauth.ts",
  "src/lib/session-version.ts",
  "src/lib/tokens.ts",
  "src/lib/two-factor.ts",
  "src/lib/user-email.ts",
];

// Auth.js wiring: the integration tests mock auth() (signInAs), so only the
// end-to-end tests (e2e/) exercise it. Left out of both coverage runs.
export const E2E_ONLY_LIB_FILES = ["src/lib/auth.ts"];
