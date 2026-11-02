"use server";

import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { rateLimiters } from "@/lib/rate-limit";
import { requireRecentReauth } from "@/lib/reauth";
import {
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  totpProvisioningUri,
  decryptTotpSecret,
  verifyTotpCode,
} from "@/lib/crypto";
import {
  hashBackupCodes,
  TOTP_NOT_CONFIGURED,
  totpEncryptionKey,
  verifySecondFactor,
} from "@/lib/two-factor";
import { INVALID_INPUT, secondFactorInput, totpCodeInput } from "@/schemas/server";

// Two-factor sign-in (TOTP) settings. This protects the ACCOUNT; the vault's
// zero-knowledge encryption is unaffected.

const TOO_MANY = "Too many attempts. Try again in 15 minutes.";
const WRONG_CODE = "That code didn't work. Check your authenticator app and try again.";

export async function getTwoFactorStatusAction(): Promise<
  { enabled: boolean; backupCodesLeft: number; available: boolean } | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabledAt: true, totpBackupCodes: true },
  });
  return {
    enabled: !!user?.totpEnabledAt,
    backupCodesLeft: user?.totpBackupCodes.length ?? 0,
    available: totpEncryptionKey() !== null,
  };
}

/**
 * Step 1 of enabling 2FA: create a secret (stored encrypted, not yet active)
 * and return it as a QR code and as text. Needs a recent account-password
 * confirmation: otherwise a stolen session could enable 2FA with the
 * attacker's authenticator and lock the real user out.
 */
export async function startTotpSetupAction(): Promise<
  { qrDataUrl: string; secret: string } | { error: string }
> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  const reauth = await requireRecentReauth(userId);
  if (!reauth.ok) return { error: reauth.error };

  const key = totpEncryptionKey();
  if (!key) return { error: TOTP_NOT_CONFIGURED };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabledAt: true },
  });
  if (!user) return { error: "Not authenticated" };
  if (user.totpEnabledAt) return { error: "Two-factor sign-in is already on." };

  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: userId },
    data: {
      totpSecretEnc: await encryptTotpSecret(secret, key, userId),
      totpEnabledAt: null,
      totpBackupCodes: [],
    },
  });

  const qrDataUrl = await QRCode.toDataURL(totpProvisioningUri(secret, user.email), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
  return { qrDataUrl, secret };
}

/**
 * Step 2: confirm one code from the app, turn 2FA on, and return 10 backup
 * codes. They are shown once; only their Argon2 hashes are stored.
 */
export async function confirmTotpSetupAction(
  code: string
): Promise<{ backupCodes: string[] } | { error: string }> {
  const parsed = totpCodeInput.safeParse({ code });
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  if (await rateLimiters.totp(userId)) return { error: TOO_MANY };

  const key = totpEncryptionKey();
  if (!key) return { error: TOTP_NOT_CONFIGURED };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecretEnc: true, totpEnabledAt: true },
  });
  if (!user?.totpSecretEnc || user.totpEnabledAt) {
    return { error: "Start two-factor setup again." };
  }

  const secret = await decryptTotpSecret(user.totpSecretEnc, key, userId);
  if (!verifyTotpCode(secret, parsed.data.code)) return { error: WRONG_CODE };

  const backupCodes = generateBackupCodes();
  await db.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpBackupCodes: await hashBackupCodes(backupCodes) },
  });
  await logAudit(userId, "auth.totp.enabled");
  return { backupCodes };
}

/** Turn 2FA off: needs a recent account-password confirmation AND a valid code. */
export async function disableTotpAction(code: string): Promise<{ error?: string }> {
  const parsed = secondFactorInput.safeParse({ code });
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  const reauth = await requireRecentReauth(userId);
  if (!reauth.ok) return { error: reauth.error };

  if (await rateLimiters.totp(userId)) return { error: TOO_MANY };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, totpSecretEnc: true, totpBackupCodes: true, totpEnabledAt: true },
  });
  if (!user?.totpEnabledAt) return { error: "Two-factor sign-in is already off." };

  if (!(await verifySecondFactor(user, parsed.data.code))) return { error: WRONG_CODE };

  await db.user.update({
    where: { id: userId },
    data: { totpSecretEnc: null, totpEnabledAt: null, totpBackupCodes: [] },
  });
  await logAudit(userId, "auth.totp.disabled");
  return {};
}
