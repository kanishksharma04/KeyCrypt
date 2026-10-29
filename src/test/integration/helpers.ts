import type { Session } from "next-auth";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

// ─── Session mock ────────────────────────────────────────────────────────────

let currentSession: Session | null = null;

/** Make the mocked auth() return a session for this user. */
export function signInAs(user: { id: string; email: string }): void {
  currentSession = {
    user: { id: user.id, email: user.email, name: null },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

/** Make the mocked auth() return null (signed out). */
export function signOutTestUser(): void {
  currentSession = null;
}

/** Used by the auth() mock in setup.ts. */
export function getMockSession(): Session | null {
  return currentSession;
}

// ─── Cookie jar (backs the mocked next/headers cookies()) ────────────────────

interface StoredCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const cookieJar = new Map<string, StoredCookie>();

export const testCookieJar = {
  get: (name: string) => {
    const c = cookieJar.get(name);
    return c ? { name: c.name, value: c.value } : undefined;
  },
  getAll: () => [...cookieJar.values()].map(({ name, value }) => ({ name, value })),
  has: (name: string) => cookieJar.has(name),
  set: (name: string, value: string, options?: Record<string, unknown>) => {
    cookieJar.set(name, { name, value, options });
  },
  delete: (name: string) => cookieJar.delete(name),
};

/** The cookie as last set, including its options (httpOnly, sameSite, ...). */
export function getTestCookie(name: string): StoredCookie | undefined {
  return cookieJar.get(name);
}

export function setTestCookie(name: string, value: string): void {
  cookieJar.set(name, { name, value });
}

export function clearTestCookies(): void {
  cookieJar.clear();
}

/** Give the current "browser" a valid re-auth cookie for this user (5 minutes). */
export async function grantRecentReauth(userId: string): Promise<void> {
  const { createReauthCookieValue, REAUTH_COOKIE, REAUTH_TTL_MS } = await import("@/lib/reauth");
  setTestCookie(REAUTH_COOKIE, await createReauthCookieValue(userId, Date.now() + REAUTH_TTL_MS));
}

// ─── Data helpers ────────────────────────────────────────────────────────────

export async function createTestUser(overrides: { email?: string; name?: string } = {}) {
  return db.user.create({
    data: {
      email: overrides.email ?? `user-${randomUUID()}@test.local`,
      name: overrides.name ?? "Test User",
      emailVerified: new Date(),
    },
    select: { id: true, email: true },
  });
}

/** Truncate every application table (keeps Prisma's migration history). */
export async function resetDatabase(): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
