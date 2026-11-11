import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated coverage reports (pnpm test:coverage)
    "coverage/**",
    // Built browser extension
    "extension/dist/**",
    "extension/dist-e2e/**",
    // Store packages (pnpm ext:package)
    "extension/packages/**",
  ]),
]);

export default eslintConfig;
