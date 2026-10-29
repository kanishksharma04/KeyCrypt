import { cookies } from "next/headers";
import { hmacSign, hmacVerify } from "@/lib/crypto";
import { REAUTH_REQUIRED_ERROR } from "@/lib/action-errors";

// Recent re-authentication ("sudo mode").
//
// A stolen session cookie alone must not be enough for destructive actions.
// After the user re-enters their ACCOUNT password (confirmAccountPasswordAction),
// the server sets a short-lived, HMAC-signed "kc_reauth" cookie bound to their
// user id. Destructive actions call requireRecentReauth() before doing anything.
//
// Cookie value: `${userId}.${expiresAtMs}.${base64url HMAC-SHA-256}`

export const REAUTH_COOKIE = "kc_reauth";
export const REAUTH_TTL_MS = 5 * 60 * 1000;

export type ReauthResult = { ok: true } | { ok: false; error: string };

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  // Fail closed: never sign or accept re-auth cookies without a real secret.
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is missing or too short");
  return secret;
}

/** Domain-separated message, so this MAC can't be confused with any other use of AUTH_SECRET. */
function macMessage(userId: string, expiresAt: string): string {
  return `keycrypt:reauth:v1|${userId}|${expiresAt}`;
}

/** Build a signed cookie value. Exported for tests. */
export async function createReauthCookieValue(userId: string, expiresAt: number): Promise<string> {
  const exp = String(expiresAt);
  const sig = await hmacSign(signingSecret(), macMessage(userId, exp));
  return `${userId}.${exp}.${sig}`;
}

/** Set the re-auth cookie for this user, valid for REAUTH_TTL_MS. */
export async function issueReauthCookie(userId: string, now = Date.now()): Promise<void> {
  const value = await createReauthCookieValue(userId, now + REAUTH_TTL_MS);
  (await cookies()).set(REAUTH_COOKIE, value, {
    httpOnly: true,
    // Secure everywhere except `next dev`, where some browsers (Safari) refuse
    // Secure cookies on http://localhost.
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/",
    maxAge: REAUTH_TTL_MS / 1000,
  });
}

/**
 * Succeeds only if the request carries a re-auth cookie with a valid signature,
 * issued for `userId`, that has not expired.
 */
export async function requireRecentReauth(userId: string, now = Date.now()): Promise<ReauthResult> {
  const refused: ReauthResult = { ok: false, error: REAUTH_REQUIRED_ERROR };

  const value = (await cookies()).get(REAUTH_COOKIE)?.value;
  if (!value) return refused;

  const [cookieUserId, exp, sig, ...rest] = value.split(".");
  if (!cookieUserId || !exp || !sig || rest.length > 0 || !/^\d{1,16}$/.test(exp)) return refused;

  // 1. Signature (constant-time) over exactly what the cookie claims.
  if (!(await hmacVerify(signingSecret(), macMessage(cookieUserId, exp), sig))) return refused;
  // 2. Issued for this user.
  if (cookieUserId !== userId) return refused;
  // 3. Not expired.
  if (Number(exp) <= now) return refused;

  return { ok: true };
}
