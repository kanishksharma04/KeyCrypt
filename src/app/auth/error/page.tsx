import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Authentication Error" };

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The verification link has expired or is invalid.",
  Default: "An unexpected error occurred during authentication.",
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function AuthErrorPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = ERROR_MESSAGES[error ?? ""] ?? ERROR_MESSAGES["Default"]!;

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <ShieldX className="text-destructive size-10" aria-hidden="true" />
      <div>
        <p className="font-medium">Authentication error</p>
        <p className="text-muted-foreground mt-1 text-sm">{message}</p>
        {error && (
          <p className="text-muted-foreground mt-2 font-mono text-xs">Error code: {error}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Link href="/auth/signin" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Sign in
        </Link>
        <Link href="/" className={buttonVariants({ size: "sm" })}>
          Home
        </Link>
      </div>
    </div>
  );
}
