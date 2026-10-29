import { afterAll, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { resetRateLimitStateForTests } from "@/lib/rate-limit";
import { clearTestCookies, resetDatabase, signOutTestUser } from "./helpers";

// ─── Framework mocks (apply to every integration test file) ──────────────────

// auth() returns whatever session the test chose with signInAs().
vi.mock("@/lib/auth", async () => {
  const { getMockSession } = await import("./helpers");
  return {
    auth: vi.fn(async () => getMockSession()),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: {},
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// cookies() is backed by an in-memory jar the tests can inspect and edit.
vi.mock("next/headers", async () => {
  const { testCookieJar } = await import("./helpers");
  return {
    headers: vi.fn(async () => new Headers()),
    cookies: vi.fn(async () => testCookieJar),
  };
});

// ─── Per-test isolation ──────────────────────────────────────────────────────

beforeEach(async () => {
  signOutTestUser();
  clearTestCookies();
  resetRateLimitStateForTests();
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});
