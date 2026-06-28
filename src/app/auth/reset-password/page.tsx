import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";

export const metadata: Metadata = { title: "Reset Password" };

interface Props {
  searchParams: Promise<{ email?: string; token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { email, token } = await searchParams;
  if (!email || !token) redirect("/auth/forgot-password");

  return <ResetPasswordForm email={email} token={token} />;
}
