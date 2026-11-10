import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "path";
import { E2E_ONLY_LIB_FILES, INTEGRATION_ONLY_LIB_FILES } from "./src/test/coverage-scope";

export default defineConfig({
  test: {
    // Node environment has globalThis.crypto (Web Crypto) in Node ≥18.
    // Component tests (*.test.tsx) opt into jsdom per file with
    // `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "extension/src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Database-backed tests run separately via `pnpm test:integration`.
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.{ts,mjs}"],
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/crypto/index.ts", // re-exports only
        // Validated on import (throws without the server's settings); exercised by the build.
        "src/lib/env.ts",
        ...INTEGRATION_ONLY_LIB_FILES,
        ...E2E_ONLY_LIB_FILES,
      ],
      // `pnpm test:coverage` fails below these. Measured 2026-11-10: src/lib/crypto at
      // 99.2% lines, 99.0% functions, 93.7% branches; all of src/lib at 96.7 / 95.5 / 93.0.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        // Target: 95% for all four. Branches sit at the measured figure rounded down; the
        // remaining branches are unreachable defensive checks (e.g. a non-Error thrown
        // inside the Argon2id worker, base32 padding that 16-byte keys never need).
        "src/lib/crypto/**": {
          lines: 95,
          functions: 95,
          branches: 93,
          statements: 95,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
