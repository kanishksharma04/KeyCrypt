import { describe, expect, it } from "vitest";
import {
  databaseHost,
  migrationUrl,
  needsBaseline,
  planMigrations,
} from "../lib/migration-plan.mjs";

// Illustrative Neon-style connection strings (not real credentials).
const PROD_POOLED =
  "postgresql://app:prod-pass@ep-prod-123-pooler.eu-central-1.aws.neon.tech/keycrypt";
const PROD_HOST = "ep-prod-123.eu-central-1.aws.neon.tech";
const PREVIEW_POOLED =
  "postgresql://app:preview-pass@ep-preview-456-pooler.eu-central-1.aws.neon.tech/keycrypt";
const PREVIEW_DIRECT =
  "postgresql://app:preview-pass@ep-preview-456.eu-central-1.aws.neon.tech/keycrypt";

describe("migrationUrl", () => {
  it("prefers DIRECT_URL", () => {
    expect(migrationUrl({ DATABASE_URL: PREVIEW_POOLED, DIRECT_URL: "postgresql://x@y/z" })).toBe(
      "postgresql://x@y/z"
    );
  });

  it("drops -pooler from a Neon pooler URL", () => {
    expect(migrationUrl({ DATABASE_URL: PREVIEW_POOLED })).toBe(PREVIEW_DIRECT);
  });
});

describe("databaseHost", () => {
  it("treats pooled and direct URLs of one database as the same host", () => {
    expect(databaseHost(PROD_POOLED)).toBe(PROD_HOST);
    expect(databaseHost(PROD_POOLED.replace("-pooler", ""))).toBe(PROD_HOST);
  });

  it("accepts bare host names, ports and any case", () => {
    expect(databaseHost("EP-PROD-123-POOLER.eu-central-1.aws.neon.tech:5432")).toBe(PROD_HOST);
  });

  it("returns null for nothing or garbage", () => {
    expect(databaseHost(undefined)).toBeNull();
    expect(databaseHost("")).toBeNull();
    expect(databaseHost("postgresql://")).toBeNull();
  });
});

describe("planMigrations", () => {
  it("migrates production over the direct connection", () => {
    expect(planMigrations({ VERCEL_ENV: "production", DATABASE_URL: PROD_POOLED })).toEqual({
      migrate: true,
      target: "production",
      url: PROD_POOLED.replace("-pooler.", "."),
    });
  });

  it("fails a production build without DATABASE_URL", () => {
    expect(() => planMigrations({ VERCEL_ENV: "production" })).toThrow(/DATABASE_URL is not set/);
  });

  it("skips preview builds that have not opted in", () => {
    const plan = planMigrations({ VERCEL_ENV: "preview", DATABASE_URL: PREVIEW_POOLED });
    expect(plan.migrate).toBe(false);
  });

  it("skips local and development builds", () => {
    expect(planMigrations({ DATABASE_URL: PREVIEW_POOLED }).migrate).toBe(false);
    expect(
      planMigrations({ VERCEL_ENV: "development", DATABASE_URL: PREVIEW_POOLED }).migrate
    ).toBe(false);
  });

  it("migrates an opted-in preview against its own database", () => {
    expect(
      planMigrations({
        VERCEL_ENV: "preview",
        PREVIEW_MIGRATIONS: "1",
        DATABASE_URL: PREVIEW_POOLED,
        PRODUCTION_DATABASE_HOST: PROD_HOST,
      })
    ).toEqual({ migrate: true, target: "preview", url: PREVIEW_DIRECT });
  });

  it("refuses when the preview database is the production one", () => {
    const env = {
      VERCEL_ENV: "preview",
      PREVIEW_MIGRATIONS: "1",
      DATABASE_URL: PROD_POOLED,
      PRODUCTION_DATABASE_HOST: PROD_HOST,
    };
    expect(() => planMigrations(env)).toThrow(/points at the production database/);
    // Also when only the direct connection used for migrating is production's.
    expect(() =>
      planMigrations({
        ...env,
        DATABASE_URL: PREVIEW_POOLED,
        DIRECT_URL: PROD_POOLED.replace("-pooler", ""),
      })
    ).toThrow(/points at the production database/);
    // And when PRODUCTION_DATABASE_HOST was given as a full URL.
    expect(() => planMigrations({ ...env, PRODUCTION_DATABASE_HOST: PROD_POOLED })).toThrow(
      /points at the production database/
    );
  });

  it("refuses an opted-in preview when production's host is unknown", () => {
    expect(() =>
      planMigrations({
        VERCEL_ENV: "preview",
        PREVIEW_MIGRATIONS: "1",
        DATABASE_URL: PREVIEW_POOLED,
      })
    ).toThrow(/needs PRODUCTION_DATABASE_HOST/);
  });

  it("refuses an opted-in preview without DATABASE_URL", () => {
    expect(() =>
      planMigrations({
        VERCEL_ENV: "preview",
        PREVIEW_MIGRATIONS: "1",
        PRODUCTION_DATABASE_HOST: PROD_HOST,
      })
    ).toThrow(/DATABASE_URL is not set for Preview/);
  });

  it("never puts a connection string in an error", () => {
    try {
      planMigrations({
        VERCEL_ENV: "preview",
        PREVIEW_MIGRATIONS: "1",
        DATABASE_URL: PROD_POOLED,
        PRODUCTION_DATABASE_HOST: PROD_HOST,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain("prod-pass");
      expect(String(error)).not.toContain(PROD_HOST);
    }
  });
});

describe("needsBaseline", () => {
  it("detects a db-push database clashing with 0_init", () => {
    expect(
      needsBaseline(
        'Error: P3018\nMigration name: 0_init\nDatabase error: type "VaultItemType" already exists'
      )
    ).toBe(true);
  });

  it("detects a recorded failed 0_init", () => {
    expect(
      needsBaseline(
        "Error: P3009\nThe `0_init` migration started at 2026-11-17 06:40:00 UTC failed"
      )
    ).toBe(true);
  });

  it("does not baseline other failures", () => {
    expect(
      needsBaseline("Error: P3018\nMigration name: 20261101_add_folders\nalready exists")
    ).toBe(false);
    expect(needsBaseline("Error: P1001: Can't reach database server")).toBe(false);
  });
});
