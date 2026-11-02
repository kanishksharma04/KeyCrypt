"use server";

import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRecentReauth } from "@/lib/reauth";
import { INVALID_INPUT, deleteAccountInput } from "@/schemas/server";

// ─── Delete account ───────────────────────────────────────────────────────────
// Permanently deletes the user and everything tied to them:
//   - User row → cascades to VaultMeta, VaultItem, Account, Session, Authenticator
//   - AuditLog rows (the relation is SetNull, so they are deleted explicitly)
//   - pending email-verification / password-reset tokens for the address
// Other devices lose their session at the next version check (the user no
// longer exists, src/lib/session-version.ts); this browser is signed out now.

const EMAIL_MISMATCH = "That doesn't match your account email.";

export async function deleteAccountAction(input: { email: string }): Promise<{ error?: string }> {
  const parsed = deleteAccountInput.safeParse(input);
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  const reauth = await requireRecentReauth(userId);
  if (!reauth.ok) return { error: reauth.error };

  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { error: "Not authenticated" };
  if (parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: EMAIL_MISMATCH };
  }

  await db.$transaction([
    db.auditLog.deleteMany({ where: { userId } }),
    db.verificationToken.deleteMany({
      where: { identifier: { in: [`verify:${user.email}`, `reset:${user.email}`] } },
    }),
    db.user.delete({ where: { id: userId } }),
  ]);

  // Clears this browser's session cookie and redirects (throws NEXT_REDIRECT).
  await signOut({ redirectTo: "/auth/signin?deleted=1" });
  return {};
}
