import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MailCheck, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { verifyEmailAction } from "@/server/auth-actions";

export const metadata: Metadata = { title: "Verify Email" };

interface Props {
  searchParams: Promise<{ email?: string; token?: string; pending?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const { email, token, pending } = params;

  if (pending) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <MailCheck className="text-primary size-10" aria-hidden="true" />
        <div>
          <p className="font-medium">Verify your email</p>
          <p className="text-muted-foreground mt-1 text-sm">
            We sent a verification link to{" "}
            <span className="text-foreground font-medium">{email}</span>. Check your inbox and click
            the link to activate your account.
          </p>
        </div>
        <Link
          href="/auth/signin"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  if (!email || !token) redirect("/auth/signin");

  const result = await verifyEmailAction(email, token);

  if ("error" in result) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <XCircle className="text-destructive size-10" aria-hidden="true" />
        <div>
          <p className="font-medium">Verification failed</p>
          <p className="text-muted-foreground mt-1 text-sm">{result.error}</p>
        </div>
        <Link
          href="/auth/forgot-password"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <MailCheck className="text-success size-10" aria-hidden="true" />
      <div>
        <p className="font-medium">Email verified!</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your account is active. Sign in to access your vault.
        </p>
      </div>
      <Link href="/auth/signin" className={buttonVariants({ size: "sm" })}>
        Sign in
      </Link>
    </div>
  );
}
