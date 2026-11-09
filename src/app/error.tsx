"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Shown when a page fails to render. It shows only the error's digest (which
// matches the server's log line), never error.message, and reports nothing
// anywhere: client-side errors can contain decrypted vault data.

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The page couldn&apos;t be shown. Your vault data was not sent anywhere.
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-3 font-mono text-xs">
            Error reference: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Try again
        </button>
        <Link href="/" className={buttonVariants({ size: "sm" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
