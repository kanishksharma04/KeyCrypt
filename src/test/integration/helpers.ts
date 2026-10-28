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
