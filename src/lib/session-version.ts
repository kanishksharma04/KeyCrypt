import type { JWT } from "next-auth/jwt";
import { db } from "@/lib/db";

// Revocable JWT sessions.
//
// JWTs can't be deleted server-side, so each token carries the user's
// tokenVersion from sign-in. Bumping User.tokenVersion (sign out all devices,
// password reset) makes every older token fail the next check.
//
// This runs inside the Auth.js jwt callback, i.e. wherever auth() runs: server
// components, route handlers and server actions (Node.js runtime). The proxy
// (src/proxy.ts) never calls auth(), so it never runs this.

/** Re-read tokenVersion from the database at most this often per token. */
export const TOKEN_VERSION_CHECK_INTERVAL_MS = 60_000;

/**
 * Returns the (possibly refreshed) token, or null to end the session when the
 * user no longer exists or their tokenVersion has moved on.
 *
 * Note: verCheckedAt only persists when Auth.js can re-issue the cookie (route
 * handlers, server actions, /api/auth/session). Where it can't (server
 * components), the check simply runs again on the next request.
 */
export async function checkTokenVersion(token: JWT, now = Date.now()): Promise<JWT | null> {
  if (!token.sub) return null;

  const lastChecked = typeof token.verCheckedAt === "number" ? token.verCheckedAt : 0;
  if (now - lastChecked < TOKEN_VERSION_CHECK_INTERVAL_MS) return token;

  const user = await db.user.findUnique({
    where: { id: token.sub },
    select: { tokenVersion: true },
  });
  // Tokens issued before versioning existed carry no version; treat them as 0
  // so they survive until the first revocation, which then ends them.
  if (!user || user.tokenVersion !== (token.tokenVersion ?? 0)) return null;

  return { ...token, verCheckedAt: now };
}

/** Revoke every existing session for this user. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
