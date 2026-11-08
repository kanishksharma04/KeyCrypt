// @ts-check
// Decides whether a Vercel build applies Prisma migrations, and against which
// connection. Pure functions, so they can be unit-tested
// (scripts/__tests__/migration-plan.test.ts); scripts/vercel-build.mjs runs them.
// Nothing here returns a message that contains a connection string.

/**
 * The connection Prisma Migrate should use: DIRECT_URL when set, otherwise the
 * Neon pooler URL with "-pooler" dropped (migrate needs an advisory lock, which
 * PgBouncer does not support).
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function migrationUrl(env) {
  if (env.DIRECT_URL) return env.DIRECT_URL;
  return env.DATABASE_URL?.replace("-pooler.", ".");
}

/**
 * The database host of a connection string, lower-cased, with a Neon "-pooler"
 * suffix removed so pooled and direct URLs of one database compare equal.
 * Accepts a bare host name too. Returns null when it cannot be parsed.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function databaseHost(value) {
  if (!value) return null;
  let host = value.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/:\d+$/, "");
  if (!host) return null;
  const [first, ...rest] = host.split(".");
  return [first?.replace(/-pooler$/, ""), ...rest].join(".");
}

/**
 * @typedef {{ migrate: false, reason: string }} SkipPlan
 * @typedef {{ migrate: true, target: "production" | "preview", url: string }} MigratePlan
 */

/**
 * Production builds always migrate. Preview builds migrate only when opted in
 * with PREVIEW_MIGRATIONS=1, and only after checking that the preview database
 * is not the production one: PRODUCTION_DATABASE_HOST (the production database's
 * host name, not a secret) must be set and differ from the preview's hosts.
 * Throws when a build must not go ahead.
 * @param {Record<string, string | undefined>} env
 * @returns {SkipPlan | MigratePlan}
 */
export function planMigrations(env) {
  const vercelEnv = env.VERCEL_ENV;

  if (vercelEnv === "production") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set; cannot apply migrations.");
    return { migrate: true, target: "production", url: /** @type {string} */ (migrationUrl(env)) };
  }

  if (vercelEnv === "preview") {
    if (env.PREVIEW_MIGRATIONS !== "1") {
      return { migrate: false, reason: "preview build without PREVIEW_MIGRATIONS=1" };
    }
    if (!env.DATABASE_URL) {
      throw new Error("PREVIEW_MIGRATIONS=1 but DATABASE_URL is not set for Preview.");
    }
    const productionHost = databaseHost(env.PRODUCTION_DATABASE_HOST);
    if (!productionHost) {
      throw new Error(
        "PREVIEW_MIGRATIONS=1 needs PRODUCTION_DATABASE_HOST (the production database's host " +
          "name) so the build can check that the preview database is a different one."
      );
    }
    const url = /** @type {string} */ (migrationUrl(env));
    const previewHosts = [databaseHost(env.DATABASE_URL), databaseHost(url)];
    if (previewHosts.some((host) => host === null)) {
      throw new Error("Cannot read the preview database host; refusing to migrate.");
    }
    if (previewHosts.includes(productionHost)) {
      throw new Error(
        "The preview DATABASE_URL points at the production database (PRODUCTION_DATABASE_HOST); " +
          "refusing to migrate. Give Preview its own database."
      );
    }
    return { migrate: true, target: "preview", url };
  }

  return { migrate: false, reason: `VERCEL_ENV=${vercelEnv ?? "unset"}` };
}

/**
 * True when `prisma migrate deploy` failed only because 0_init's objects already
 * exist (a database first created with `db push`), so 0_init can be baselined.
 * @param {string} output
 * @returns {boolean}
 */
export function needsBaseline(output) {
  // First attempt: applying 0_init hits objects that db push already created.
  const initClashes =
    output.includes("P3018") &&
    /Migration name: 0_init\b/.test(output) &&
    /already exists/.test(output);
  // Later attempts: that failed 0_init is now recorded and blocks deploy (P3009).
  const failedInitRecorded =
    output.includes("P3009") && /The `0_init` migration started at .* failed/.test(output);
  return initClashes || failedInitRecorded;
}
