import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Node environment has globalThis.crypto (Web Crypto) in Node ≥18.
    // Component tests (*.test.tsx) opt into jsdom per file with
    // `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "extension/src/**/*.test.ts"],
    // Database-backed tests run separately via `pnpm test:integration`.
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/crypto/**/*.ts"],
      exclude: ["src/lib/crypto/**/*.test.ts", "src/lib/crypto/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
