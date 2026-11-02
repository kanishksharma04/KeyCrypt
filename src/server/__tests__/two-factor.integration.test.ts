import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { generateTotpCode } from "@/lib/crypto";
import {
  authorizeCredentials,
  RateLimitedError,
  TotpInvalidError,
  TotpRequiredError,
} from "@/lib/authorize-credentials";
import {
  confirmTotpSetupAction,
  disableTotpAction,
  getTwoFactorStatusAction,
  startTotpSetupAction,
} from "@/server/two-factor-actions";
import { clearTestCookies, grantRecentReauth, signInAs } from "@/test/integration/helpers";

const EMAIL = "totp@test.local";
const PASSWORD = "Correct-Horse-9!";

let userId: string;

function signInAttempt(totp?: string) {
  return authorizeCredentials(
    { email: EMAIL, password: PASSWORD, ...(totp !== undefined && { totp }) },
    new Request("http://localhost/api/auth/callback/credentials", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.9" },
    })
  );
}

/** A 6-digit code that differs from the current one. */
function wrongCode(secret: string): string {
  return String((Number(generateTotpCode(secret)) + 500_000) % 1_000_000).padStart(6, "0");
}

/** Turn 2FA on through the real actions; returns the secret and backup codes. */
async function enableTotp() {
  await grantRecentReauth(userId);
  const started = await startTotpSetupAction();
  if ("error" in started) throw new Error(started.error);
  const confirmed = await confirmTotpSetupAction(generateTotpCode(started.secret));
  if ("error" in confirmed) throw new Error(confirmed.error);
  return { secret: started.secret, backupCodes: confirmed.backupCodes, qr: started.qrDataUrl };
}

describe("two-factor sign-in (TOTP)", () => {
  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerified: new Date() },
      select: { id: true, email: true },
    });
    userId = user.id;
    signInAs(user);
  });

  it("enables 2FA: QR code, confirm one code, 10 backup codes stored only as hashes", async () => {
    const { secret, backupCodes, qr } = await enableTotp();

    expect(qr).toMatch(/^data:image\/png;base64,/);
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);

    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.totpEnabledAt).toBeInstanceOf(Date);
    expect(row.totpSecretEnc).toBeTruthy();
    expect(row.totpSecretEnc).not.toContain(secret);
    expect(row.totpBackupCodes).toHaveLength(10);
    for (const code of backupCodes) {
      expect(row.totpBackupCodes.join(" ")).not.toContain(code.replace("-", ""));
    }
    expect(row.totpBackupCodes.every((h) => h.startsWith("$argon2"))).toBe(true);

    expect(await getTwoFactorStatusAction()).toEqual({
      enabled: true,
      backupCodesLeft: 10,
      available: true,
    });
    const audit = await db.auditLog.findMany({ where: { userId, action: "auth.totp.enabled" } });
    expect(audit).toHaveLength(1);
  });

  it("needs a recent account-password confirmation to start setup", async () => {
    expect(await startTotpSetupAction()).toEqual({ error: expect.any(String) });
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.totpSecretEnc).toBeNull();
  });

  it("does not turn on with a wrong confirmation code", async () => {
    await grantRecentReauth(userId);
    const started = await startTotpSetupAction();
    if ("error" in started) throw new Error(started.error);

    expect(await confirmTotpSetupAction(wrongCode(started.secret))).toEqual({
      error: expect.stringContaining("didn't work"),
    });
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.totpEnabledAt).toBeNull();
    expect(await signInAttempt()).toMatchObject({ id: userId });
  });

  it("requires a code at sign-in once 2FA is on", async () => {
    await enableTotp();
    await expect(signInAttempt()).rejects.toBeInstanceOf(TotpRequiredError);
    await expect(signInAttempt()).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("does not reveal the 2FA step to a wrong password", async () => {
    await enableTotp();
    const result = await authorizeCredentials(
      { email: EMAIL, password: "wrong-password" },
      new Request("http://localhost/", { headers: { "x-real-ip": "203.0.113.10" } })
    );
    expect(result).toBeNull();
  });

  it("signs in with a valid code", async () => {
    const { secret } = await enableTotp();
    expect(await signInAttempt(generateTotpCode(secret))).toMatchObject({
      id: userId,
      email: EMAIL,
    });
  });

  it("rejects a wrong code", async () => {
    const { secret } = await enableTotp();
    await expect(signInAttempt(wrongCode(secret))).rejects.toBeInstanceOf(TotpInvalidError);
    await expect(signInAttempt("not-a-code")).rejects.toMatchObject({ code: "TOTP_INVALID" });
  });

  it("accepts a backup code exactly once", async () => {
    const { backupCodes } = await enableTotp();
    const [first, second] = backupCodes;
    if (!first || !second) throw new Error("missing backup codes");

    expect(await signInAttempt(first)).toMatchObject({ id: userId });
    await expect(signInAttempt(first)).rejects.toBeInstanceOf(TotpInvalidError);
    // Case and separators don't matter.
    expect(await signInAttempt(second.toLowerCase().replace("-", " "))).toMatchObject({
      id: userId,
    });

    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.totpBackupCodes).toHaveLength(8);
    const used = await db.auditLog.count({
      where: { userId, action: "auth.totp.backup_code_used" },
    });
    expect(used).toBe(2);
  });

  it("rate-limits code attempts per user", async () => {
    const { secret } = await enableTotp();
    // enableTotp's confirmation used one of the 5 attempts.
    for (let i = 0; i < 4; i++) {
      await expect(signInAttempt(wrongCode(secret))).rejects.toBeInstanceOf(TotpInvalidError);
    }
    await expect(signInAttempt(generateTotpCode(secret))).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("disabling needs a recent password confirmation and a valid code", async () => {
    const { secret } = await enableTotp();

    clearTestCookies(); // re-auth cookie gone
    expect(await disableTotpAction(generateTotpCode(secret))).toEqual({
      error: expect.any(String),
    });

    await grantRecentReauth(userId);
    expect(await disableTotpAction(wrongCode(secret))).toEqual({
      error: expect.stringContaining("didn't work"),
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).totpEnabledAt).not.toBe(
      null
    );

    expect(await disableTotpAction(generateTotpCode(secret))).toEqual({});
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row).toMatchObject({ totpEnabledAt: null, totpSecretEnc: null, totpBackupCodes: [] });
    expect(await signInAttempt()).toMatchObject({ id: userId });
    expect(await db.auditLog.count({ where: { userId, action: "auth.totp.disabled" } })).toBe(1);
  });

  it("can be disabled with a backup code", async () => {
    const { backupCodes } = await enableTotp();
    await grantRecentReauth(userId);
    expect(await disableTotpAction(backupCodes[3] ?? "")).toEqual({});
  });

  it("rejects malformed input without echoing it", async () => {
    expect(await confirmTotpSetupAction("<script>")).toEqual({ error: "Invalid input" });
    expect(await disableTotpAction("")).toEqual({ error: "Invalid input" });
  });

  it("requires a session", async () => {
    const { signOutTestUser } = await import("@/test/integration/helpers");
    signOutTestUser();
    expect(await startTotpSetupAction()).toEqual({ error: "Not authenticated" });
    expect(await confirmTotpSetupAction("123456")).toEqual({ error: "Not authenticated" });
    expect(await disableTotpAction("123456")).toEqual({ error: "Not authenticated" });
  });
});
