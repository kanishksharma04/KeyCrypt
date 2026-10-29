"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { rateLimiters } from "@/lib/rate-limit";
import { issueReauthCookie } from "@/lib/reauth";
import { INVALID_INPUT, confirmAccountPasswordInput } from "@/schemas/server";

/**
 * Confirm the ACCOUNT (sign-in) password, not the master password, and grant a
 * 5-minute re-auth window for destructive actions (see src/lib/reauth.ts).
 */
export async function confirmAccountPasswordAction(password: string): Promise<{ error?: string }> {
  const parsed = confirmAccountPasswordInput.safeParse({ password });
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  if (await rateLimiters.reauth(userId)) {
    return { error: "Too many attempts. Try again in 15 minutes." };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  const valid = user?.passwordHash
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyAgainstDummyHash(parsed.data.password);

  if (!valid) {
    await db.auditLog.create({ data: { userId, action: "auth.reauth.failed" } });
    return { error: "Incorrect account password." };
  }

  await issueReauthCookie(userId);
  await db.auditLog.create({ data: { userId, action: "auth.reauth" } });
  return {};
}
