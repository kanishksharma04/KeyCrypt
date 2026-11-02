import { CredentialsSignin, type User } from "next-auth";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";
import { rateLimiters } from "@/lib/rate-limit";
import { verifyAgainstDummyHash, verifyPassword } from "@/lib/password";
import { signInSchema } from "@/schemas/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySecondFactor } from "@/lib/two-factor";

// Credentials sign-in, used by the Auth.js Credentials provider in src/lib/auth.ts.
// It lives in its own module so integration tests can call it directly.
//
// This is the ONLY place sign-in attempts are rate limited. The client posts
// straight to /api/auth/callback/credentials (which the proxy does not cover),
// so any check made before that request could be skipped.

export class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED" as const;
}

export class RateLimitedError extends CredentialsSignin {
  code = "RATE_LIMITED" as const;
}

/** Password was right; two-factor sign-in is on and no code was sent. */
export class TotpRequiredError extends CredentialsSignin {
  code = "TOTP_REQUIRED" as const;
}

/** Password was right but the TOTP / backup code was wrong (or already used). */
export class TotpInvalidError extends CredentialsSignin {
  code = "TOTP_INVALID" as const;
}

/** Optional second factor sent with the credentials. */
const secondFactorField = z.object({ totp: z.string().trim().max(32).optional() });

export async function authorizeCredentials(
  credentials: unknown,
  request: Request
): Promise<User | null> {
  const parsed = signInSchema.safeParse(credentials);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const totp = secondFactorField.safeParse(credentials).data?.totp || undefined;

  // Every attempt counts against both buckets, before any password work.
  const ip = getClientIp(request.headers);
  const [ipLimited, emailLimited] = await Promise.all([
    rateLimiters.signIn(ip),
    rateLimiters.signInEmail(email),
  ]);
  if (ipLimited || emailLimited) throw new RateLimitedError();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
      tokenVersion: true,
      totpEnabledAt: true,
      totpSecretEnc: true,
      totpBackupCodes: true,
    },
  });

  // Unknown email: run a full Argon2 verify anyway so timing matches a wrong
  // password, and return the same null so the response is identical.
  if (!user?.passwordHash) {
    await verifyAgainstDummyHash(password);
    return null;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  if (!user.emailVerified) {
    const smtpConfigured = process.env.NODE_ENV !== "production" || !!process.env.SMTP_HOST;
    if (smtpConfigured) {
      throw new EmailNotVerifiedError();
    }
    // No SMTP in production — auto-verify legacy unverified accounts on first sign-in
    await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  // Two-factor sign-in: only revealed AFTER the password is verified, so it
  // does not tell an attacker which accounts use 2FA.
  if (user.totpEnabledAt) {
    if (!totp) throw new TotpRequiredError();
    if (await rateLimiters.totp(user.id)) throw new RateLimitedError();
    const factor = await verifySecondFactor(user, totp);
    if (!factor) throw new TotpInvalidError();
    if (factor === "backup") await logAudit(user.id, "auth.totp.backup_code_used");
  }

  return { id: user.id, email: user.email, name: user.name, tokenVersion: user.tokenVersion };
}
