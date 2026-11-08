import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_SETTINGS,
  REQUIRED_SETTINGS,
  checkEnv,
  formatEnvReport,
} from "../env-check.mjs";

const SECRET_VALUES = {
  DATABASE_URL: "postgresql://user:s3cr3t-db-pass@db.example.com/keycrypt",
  AUTH_SECRET: "auth-secret-value-that-is-long-enough-1234",
  NEXT_PUBLIC_APP_URL: "https://vault.example.com",
  AUTH_URL: "https://vault.example.com",
  UPSTASH_REDIS_REST_URL: "https://redis.example.com",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token-value",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "mailer",
  SMTP_PASS: "smtp-pass-value",
  EMAIL_FROM: "KeyCrypt <noreply@example.com>",
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("checkEnv", () => {
  it("passes a complete production environment", () => {
    const result = checkEnv(SECRET_VALUES);
    expect(result).toEqual({
      missingRequired: [],
      missingRecommended: [],
      invalid: [],
      ok: true,
    });
  });

  it("lists every setting as missing in an empty environment", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    expect(result.missingRequired).toEqual(REQUIRED_SETTINGS);
    expect(result.missingRecommended).toEqual(RECOMMENDED_SETTINGS);
    expect(result.invalid).toEqual([]);
  });

  it("treats empty strings as unset", () => {
    const result = checkEnv({ ...SECRET_VALUES, AUTH_URL: "", SMTP_HOST: "" });
    expect(result.missingRequired).toEqual(["AUTH_URL"]);
    expect(result.missingRecommended).toEqual(["SMTP_HOST"]);
  });

  it("is ok with only recommended settings missing", () => {
    const required = Object.fromEntries(
      REQUIRED_SETTINGS.map((n) => [n, SECRET_VALUES[n as keyof typeof SECRET_VALUES]])
    );
    const result = checkEnv(required);
    expect(result.ok).toBe(true);
    expect(result.missingRecommended).toEqual(RECOMMENDED_SETTINGS);
  });

  it("applies the same format rules as src/lib/env.ts", () => {
    const result = checkEnv({
      ...SECRET_VALUES,
      DATABASE_URL: "not a url",
      AUTH_SECRET: "too-short",
      AUTH_URL: "vault.example.com",
      SMTP_PORT: "smtp",
      TOTP_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
    });
    expect(result.ok).toBe(false);
    expect(result.invalid.map((p) => p.name)).toEqual([
      "DATABASE_URL",
      "AUTH_SECRET",
      "AUTH_URL",
      "SMTP_PORT",
      "TOTP_ENCRYPTION_KEY",
    ]);
  });

  it("requires the Upstash URL and token together", () => {
    const result = checkEnv({ ...SECRET_VALUES, UPSTASH_REDIS_REST_TOKEN: undefined });
    expect(result.ok).toBe(false);
    expect(result.missingRecommended).toEqual(["UPSTASH_REDIS_REST_TOKEN"]);
    expect(result.invalid).toEqual([expect.objectContaining({ name: "UPSTASH_REDIS_REST_TOKEN" })]);
  });
});

describe("formatEnvReport", () => {
  it("names settings but never prints a value", () => {
    const env = {
      ...SECRET_VALUES,
      AUTH_URL: undefined,
      AUTH_SECRET: "short-secret",
      SMTP_PASS: undefined,
    };
    const report = formatEnvReport(checkEnv(env));
    expect(report).toContain("Missing required settings: AUTH_URL");
    expect(report).toContain("Invalid setting AUTH_SECRET");
    expect(report).toContain("Missing recommended settings: SMTP_PASS");
    for (const value of Object.values(env)) {
      if (value) expect(report).not.toContain(value);
    }
  });

  it("says so when everything is present", () => {
    expect(formatEnvReport(checkEnv(SECRET_VALUES))).toBe(
      "All required and recommended settings are present."
    );
  });
});
