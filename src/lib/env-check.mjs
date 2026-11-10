// @ts-check
// Which production settings are missing or malformed, by name only.
//
// Plain JavaScript so that `node scripts/check-env.mjs` (pnpm check:env) and
// scripts/vercel-build.mjs can import it without a TypeScript step; the app
// imports it from src/instrumentation.ts to report at start-up. The value
// checks mirror src/lib/env.ts. Nothing here ever returns or prints a value.

/** Without these a production deployment does not work. */
export const REQUIRED_SETTINGS = ["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_APP_URL", "AUTH_URL"];

/** Optional, but a production deployment should have them. */
export const RECOMMENDED_SETTINGS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "EMAIL_FROM",
  "TOTP_ENCRYPTION_KEY",
  // Authorises the daily audit-log cron (src/app/api/cron/prune-audit).
  "CRON_SECRET",
];

/** @param {string} value */
function isUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format rules (same as src/lib/env.ts where it has one). Each returns a reason
 * when the value is wrong, never the value itself.
 * @type {Record<string, (value: string) => string | null>}
 */
const RULES = {
  DATABASE_URL: (v) => (isUrl(v) ? null : "must be a valid connection URL"),
  AUTH_SECRET: (v) => (v.length >= 32 ? null : "must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: (v) => (isUrl(v) ? null : "must be a valid URL"),
  AUTH_URL: (v) => (isUrl(v) ? null : "must be a valid URL"),
  UPSTASH_REDIS_REST_URL: (v) => (isUrl(v) ? null : "must be a valid URL"),
  SMTP_PORT: (v) =>
    /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 ? null : "must be a port number",
  CRON_SECRET: (v) => (v.length >= 16 ? null : "must be at least 16 characters"),
  TOTP_ENCRYPTION_KEY: (v) =>
    Buffer.from(v, "base64").byteLength === 32 ? null : "must be 32 random bytes, base64-encoded",
};

/**
 * @typedef {{ name: string, reason: string }} EnvProblem
 * @typedef {{
 *   missingRequired: string[],
 *   missingRecommended: string[],
 *   invalid: EnvProblem[],
 *   ok: boolean,
 * }} EnvCheckResult
 */

/**
 * Checks an environment (e.g. process.env) against the production settings.
 * An empty string counts as unset, as in src/lib/env.ts.
 * `ok` is false when a required setting is missing or any setting is malformed.
 * @param {Record<string, string | undefined>} env
 * @returns {EnvCheckResult}
 */
export function checkEnv(env) {
  /** @param {string} name */
  const isSet = (name) => typeof env[name] === "string" && env[name] !== "";

  const missingRequired = REQUIRED_SETTINGS.filter((name) => !isSet(name));
  const missingRecommended = RECOMMENDED_SETTINGS.filter((name) => !isSet(name));

  /** @type {EnvProblem[]} */
  const invalid = [];
  for (const [name, rule] of Object.entries(RULES)) {
    const value = env[name];
    if (typeof value !== "string" || value === "") continue;
    const reason = rule(value);
    if (reason) invalid.push({ name, reason });
  }

  // src/lib/env.ts rejects exactly one of the pair.
  const upstashUrl = isSet("UPSTASH_REDIS_REST_URL");
  if (upstashUrl !== isSet("UPSTASH_REDIS_REST_TOKEN")) {
    invalid.push({
      name: upstashUrl ? "UPSTASH_REDIS_REST_TOKEN" : "UPSTASH_REDIS_REST_URL",
      reason: "set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither",
    });
  }

  return {
    missingRequired,
    missingRecommended,
    invalid,
    ok: missingRequired.length === 0 && invalid.length === 0,
  };
}

/**
 * A human-readable report listing setting names only.
 * @param {EnvCheckResult} result
 * @returns {string}
 */
export function formatEnvReport(result) {
  const lines = [];
  if (result.missingRequired.length > 0) {
    lines.push(`Missing required settings: ${result.missingRequired.join(", ")}`);
  }
  for (const { name, reason } of result.invalid) {
    lines.push(`Invalid setting ${name}: ${reason}`);
  }
  if (result.missingRecommended.length > 0) {
    lines.push(`Missing recommended settings: ${result.missingRecommended.join(", ")}`);
  }
  if (lines.length === 0) lines.push("All required and recommended settings are present.");
  return lines.join("\n");
}
