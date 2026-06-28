import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Node environment has globalThis.crypto (Web Crypto) in Node ≥18
    environment: "node",
    include: ["src/**/*.test.ts"],
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
