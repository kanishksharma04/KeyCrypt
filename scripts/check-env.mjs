// pnpm check:env: lists which production settings are missing or malformed,
// by name only. It never prints a value.
//
// Checks the real environment plus the .env files Next.js reads in production
// (.env.production.local, .env.local, .env.production, .env; earlier files and
// the real environment win). Pass --no-dotenv to check the real environment only.
//
// Exits 1 when a required setting is missing or any setting is malformed,
// unless --warn-only is given. Rules live in src/lib/env-check.mjs.

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { checkEnv, formatEnvReport } from "../src/lib/env-check.mjs";

const args = new Set(process.argv.slice(2));
const warnOnly = args.has("--warn-only");
const useDotenv = !args.has("--no-dotenv");

const DOTENV_FILES = [".env.production.local", ".env.local", ".env.production", ".env"];

/** @returns {Record<string, string | undefined>} */
function loadEnvironment() {
  /** @type {Record<string, string | undefined>} */
  const merged = {};
  const loaded = [];
  if (useDotenv) {
    // Lowest precedence first, so higher-precedence files overwrite.
    for (const file of [...DOTENV_FILES].reverse()) {
      if (!existsSync(file)) continue;
      Object.assign(merged, parseEnv(readFileSync(file, "utf8")));
      loaded.unshift(file);
    }
  }
  console.log(
    loaded.length > 0
      ? `Checking the environment and ${loaded.join(", ")}.`
      : "Checking the environment."
  );
  return { ...merged, ...process.env };
}

const result = checkEnv(loadEnvironment());
console.log(formatEnvReport(result));

if (!result.ok && !warnOnly) process.exit(1);
