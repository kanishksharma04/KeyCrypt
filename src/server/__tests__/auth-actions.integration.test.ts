import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signUpAction,
  verifyEmailAction,
} from "@/server/auth-actions";

// Emails are matched without regard to case: "Alice@x.com" and "alice@x.com"
// are the same account. New addresses are stored lower-cased; accounts stored
// with capitals before that still work.

const PASSWORD = "Correct-Horse-9!";
const NEW_PASSWORD = "Battery-Staple-7?";

function signUp(email: string) {
  return signUpAction({ name: "Test", email, password: PASSWORD, confirmPassword: PASSWORD });
}

async function tokenFor(type: "verify" | "reset", email: string) {
  const row = await db.verificationToken.findFirst({
    where: { identifier: { equals: `${type}:${email}`, mode: "insensitive" } },
  });
  if (!row) throw new Error(`no ${type} token for ${email}`);
  return row.token;
}

describe("auth actions: email capitalisation", () => {
  it("stores a new account's email lower-cased", async () => {
    expect(await signUp("  Carol@Test.LOCAL ")).toMatchObject({ success: true });
    const users = await db.user.findMany({ select: { email: true } });
    expect(users).toEqual([{ email: "carol@test.local" }]);
  });

  it("doesn't create a second account that differs only in case", async () => {
    await db.user.create({ data: { email: "Dave@Test.Local", passwordHash: "x" } });

    expect(await signUp("dave@test.local")).toEqual({ success: true, emailSent: false });
    expect(await signUp("DAVE@TEST.LOCAL")).toEqual({ success: true, emailSent: false });
    expect(await db.user.count()).toBe(1);
  });

  it("verifies an email from a link whatever its capitalisation", async () => {
    await signUp("frank@test.local");
    const token = await tokenFor("verify", "frank@test.local");

    expect(await verifyEmailAction("Frank@Test.Local", token)).toEqual({ success: true });
    const user = await db.user.findUnique({ where: { email: "frank@test.local" } });
    expect(user?.emailVerified).toBeInstanceOf(Date);
  });

  it("resets the password of an account stored with capitals", async () => {
    const user = await db.user.create({
      data: {
        email: "Erin@Test.Local",
        passwordHash: await hashPassword(PASSWORD),
        emailVerified: new Date(),
      },
    });

    expect(await forgotPasswordAction({ email: "erin@test.local" })).toEqual({ success: true });
    const token = await tokenFor("reset", "erin@test.local");

    const result = await resetPasswordAction({
      email: "erin@test.local",
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(result).toEqual({ success: true });

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(NEW_PASSWORD, after.passwordHash ?? "")).toBe(true);
    expect(after.tokenVersion).toBe(1);
    // The token is used up.
    expect(await db.verificationToken.count()).toBe(0);
  });

  it("rejects a valid reset token once the account is gone", async () => {
    await db.user.create({ data: { email: "gina@test.local", passwordHash: "x" } });
    await forgotPasswordAction({ email: "gina@test.local" });
    const token = await tokenFor("reset", "gina@test.local");
    await db.user.deleteMany();

    const result = await resetPasswordAction({
      email: "gina@test.local",
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(result).toEqual({ error: "Invalid or expired reset link. Request a new one." });
  });
});
