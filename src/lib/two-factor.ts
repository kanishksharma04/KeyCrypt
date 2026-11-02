import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { decryptTotpSecret, normalizeBackupCode, verifyTotpCode } from "@/lib/crypto";

// Server side of two-factor sign-in (TOTP). Protects the account, not the vault.

/** The base64 32-byte TOTP_ENCRYPTION_KEY, or null when 2FA is not configured. */
export function totpEncryptionKey(): string | null {
  const key = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!key) return null;
  try {
    return Buffer.from(key, "base64").byteLength === 32 ? key : null;
  } catch {
    return null;
  }
}

export const TOTP_NOT_CONFIGURED = "Two-factor sign-in is not available on this server.";

/** Argon2id hashes of backup codes (normalized), for storage. */
export function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashPassword(normalizeBackupCode(c))));
}

interface TwoFactorUser {
  id: string;
  totpSecretEnc: string | null;
  totpBackupCodes: string[];
}

/**
 * Check a second factor: a 6-digit TOTP code, or a one-time backup code (which
 * is consumed atomically, so it works once even under concurrent attempts).
 * Returns which kind matched, or null. Callers must rate-limit attempts.
 */
export async function verifySecondFactor(
  user: TwoFactorUser,
  input: string
): Promise<"totp" | "backup" | null> {
  const code = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(code)) {
    const key = totpEncryptionKey();
    if (!key || !user.totpSecretEnc) return null; // fail closed
    try {
      const secret = await decryptTotpSecret(user.totpSecretEnc, key, user.id);
      return verifyTotpCode(secret, code) ? "totp" : null;
    } catch {
      return null;
    }
  }

  const normalized = normalizeBackupCode(code);
  if (normalized.length !== 10) return null;
  for (const hash of user.totpBackupCodes) {
    if (await verifyPassword(normalized, hash)) {
      // Consume: only succeeds if the hash is still there (no double use).
      const { count } = await db.user.updateMany({
        where: { id: user.id, totpBackupCodes: { has: hash } },
        data: { totpBackupCodes: user.totpBackupCodes.filter((h) => h !== hash) },
      });
      return count === 1 ? "backup" : null;
    }
  }
  return null;
}
