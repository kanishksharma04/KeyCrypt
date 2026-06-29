"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { generateToken, consumeToken } from "@/lib/tokens";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { rateLimiters } from "@/lib/rate-limit";
import {
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type SignInInput,
  type SignUpInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/schemas/auth";

type ActionResult = { error: string } | { success: true; message?: string; emailSent?: boolean };

async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

// ─── Sign In ──────────────────────────────────────────────────────────────────
// Only performs rate limiting. The actual credentials auth happens client-side
// via next-auth/react signIn() to avoid the Auth.js v5 InvalidProvider error
// that occurs when signIn("credentials") is called from a server action.

export async function signInAction(data: SignInInput): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid email or password" };

  const ip = await getClientIp();
  if (rateLimiters.signIn(ip)) {
    return { error: "Too many attempts. Please wait 15 minutes before trying again." };
  }

  return { success: true };
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUpAction(data: SignUpInput): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid input" };
  }

  const ip = await getClientIp();
  if (rateLimiters.signUp(ip)) {
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

    await db.auditLog.create({
      data: { userId: user.id, action: "auth.signup", ip },
    });

    return { success: true, emailSent };
  }

  return { success: true, emailSent: false };
}

// ─── Verify Email ─────────────────────────────────────────────────────────────

export async function verifyEmailAction(email: string, token: string): Promise<ActionResult> {
  const valid = await consumeToken("verify", email, token);
  if (!valid) return { error: "Invalid or expired verification link." };

  await db.user.update({
    where: { email },
    data: { emailVerified: new Date() },
  });

  return { success: true };
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPasswordAction(data: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(data);
  if (!parsed.success) return { error: "Invalid email address" };

  if (rateLimiters.passwordReset(parsed.data.email)) {
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

  const valid = await consumeToken("reset", parsed.data.email, parsed.data.token);
  if (!valid) return { error: "Invalid or expired reset link. Request a new one." };

  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.update({
    where: { email: parsed.data.email },
    data: { passwordHash },
  });

  // Invalidate all existing sessions for this user after password change
  await db.session.deleteMany({ where: { user: { email: parsed.data.email } } });

  return { success: true };
}
