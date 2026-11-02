"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { generateToken, consumeToken } from "@/lib/tokens";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { rateLimiters } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import {
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type SignUpInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/schemas/auth";
import { INVALID_INPUT, tokenSchema, verifyEmailInput } from "@/schemas/server";

type ActionResult = { error: string } | { success: true; message?: string; emailSent?: boolean };

// Sign-in has no server action: the form calls next-auth/react signIn() and all
// checks (including rate limiting) run in src/lib/authorize-credentials.ts.

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUpAction(data: SignUpInput): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid input" };
  }

  const ip = getClientIp(await headers());
  if (await rateLimiters.signUp(ip)) {
    return { error: "Too many accounts created from this IP. Try again later." };
  }

  // Always return success even if email exists — prevents enumeration
  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (!existing) {
    const passwordHash = await hashPassword(parsed.data.password);

    // In production, email verification requires SMTP. If no SMTP is configured,
    // auto-verify immediately so the account is immediately usable.
    const smtpConfigured = process.env.NODE_ENV !== "production" || !!process.env.SMTP_HOST;

    const user = await db.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        emailVerified: smtpConfigured ? null : new Date(),
      },
    });

    let emailSent = false;
    if (smtpConfigured) {
      try {
        const token = await generateToken("verify", user.email);
        await sendVerificationEmail(user.email, token);
        emailSent = true;
      } catch {
        // Email delivery failed — auto-verify so the account isn't locked out
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
      }
    }

    await logAudit(user.id, "auth.signup");

    return { success: true, emailSent };
  }

  return { success: true, emailSent: false };
}

// ─── Verify Email ─────────────────────────────────────────────────────────────

export async function verifyEmailAction(email: string, token: string): Promise<ActionResult> {
  const parsed = verifyEmailInput.safeParse({ email, token });
  if (!parsed.success) return { error: INVALID_INPUT };

  const valid = await consumeToken("verify", parsed.data.email, parsed.data.token);
  if (!valid) return { error: "Invalid or expired verification link." };

  await db.user.update({
    where: { email: parsed.data.email },
    data: { emailVerified: new Date() },
  });

  return { success: true };
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPasswordAction(data: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid email address" };

  if (await rateLimiters.passwordReset(parsed.data.email)) {
    return { error: "Too many requests. Try again in an hour." };
  }

  // Always return success — prevents email enumeration
  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });

  // Only send reset email for credential-based accounts (not OAuth-only)
  if (user?.passwordHash) {
    const token = await generateToken("reset", parsed.data.email);
    await sendPasswordResetEmail(parsed.data.email, token);
  }

  return { success: true };
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetPasswordAction(data: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid input" };
  }

  const resetLinkError = { error: "Invalid or expired reset link. Request a new one." };
  // The shared form schema only requires a token; check its exact format here.
  if (!tokenSchema.safeParse(parsed.data.token).success) return resetLinkError;

  const valid = await consumeToken("reset", parsed.data.email, parsed.data.token);
  if (!valid) return resetLinkError;

  const passwordHash = await hashPassword(parsed.data.password);
  // Bumping tokenVersion ends every existing (JWT) session for this account
  // within TOKEN_VERSION_CHECK_INTERVAL_MS (src/lib/session-version.ts).
  await db.user.update({
    where: { email: parsed.data.email },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  return { success: true };
}
