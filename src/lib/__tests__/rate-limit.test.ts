import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upstashLimit = vi.fn();

// The Upstash path is exercised with a fake limiter; no network is used.
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => "sliding-window");
    limit = upstashLimit;
  }
  return { Ratelimit };
});
vi.mock("@upstash/redis", () => ({ Redis: class {} }));

import { isRateLimited, rateLimiters, resetRateLimitStateForTests } from "../rate-limit";

beforeEach(() => {
  resetRateLimitStateForTests();
  upstashLimit.mockReset();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("in-memory fallback (no Upstash env)", () => {
  it("allows up to the limit, then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await isRateLimited("k", 3, 60_000));
    expect(results).toEqual([false, false, false, true]);
    expect(upstashLimit).not.toHaveBeenCalled();
  });

  it("tracks keys independently", async () => {
    for (let i = 0; i < 3; i++) await isRateLimited("a", 3, 60_000);
    expect(await isRateLimited("a", 3, 60_000)).toBe(true);
    expect(await isRateLimited("b", 3, 60_000)).toBe(false);
  });

  it("resets after the window passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    for (let i = 0; i < 3; i++) await isRateLimited("k", 2, 60_000);
    expect(await isRateLimited("k", 2, 60_000)).toBe(true);

    vi.setSystemTime(new Date("2026-10-28T12:01:00Z"));
    expect(await isRateLimited("k", 2, 60_000)).toBe(false);
  });

  it("is bypassed in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    for (let i = 0; i < 10; i++) expect(await isRateLimited("k", 1, 60_000)).toBe(false);
  });

  it("warns once in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await isRateLimited("k", 5, 60_000);
    await isRateLimited("k", 5, 60_000);
    await rateLimiters.signUp("203.0.113.7");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn outside production", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await isRateLimited("k", 5, 60_000);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("named limiters", () => {
  it("per-IP sign-in allows 5 attempts per window", async () => {
    for (let i = 0; i < 5; i++) expect(await rateLimiters.signIn("203.0.113.7")).toBe(false);
    expect(await rateLimiters.signIn("203.0.113.7")).toBe(true);
  });

  it("per-email sign-in allows 10 attempts per hour, case-insensitively", async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        await rateLimiters.signInEmail(i % 2 ? "Alice@Example.com" : "alice@example.com")
      ).toBe(false);
    }
    expect(await rateLimiters.signInEmail(" ALICE@example.com ")).toBe(true);
    // A different account is unaffected, and so is the per-IP bucket.
    expect(await rateLimiters.signInEmail("bob@example.com")).toBe(false);
    expect(await rateLimiters.signIn("alice@example.com")).toBe(false);
  });
});

describe("Upstash store", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  });

  it("uses the shared limiter when both env vars are set", async () => {
    upstashLimit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    expect(await isRateLimited("k", 3, 60_000)).toBe(false);
    expect(await isRateLimited("k", 3, 60_000)).toBe(true);
    expect(upstashLimit).toHaveBeenCalledWith("k");
  });

  it("falls back to memory if Upstash throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    upstashLimit.mockRejectedValue(new Error("network down"));
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await isRateLimited("k", 2, 60_000));
    expect(results).toEqual([false, false, true]);
  });
});
