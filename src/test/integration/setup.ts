import { afterAll, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { resetRateLimitStateForTests } from "@/lib/rate-limit";
import { resetDatabase, signOutTestUser } from "./helpers";

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

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

// ─── Per-test isolation ──────────────────────────────────────────────────────

beforeEach(async () => {
  signOutTestUser();
  resetRateLimitStateForTests();
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});
