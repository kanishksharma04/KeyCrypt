"use client";

import "./globals.css";

// Shown when the root layout itself fails. It replaces the whole document, so
// it renders its own <html> and <body>. Like app/error.tsx it shows only the
// digest, never error.message, and reports nothing anywhere.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center antialiased">
        <div>
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            KeyCrypt couldn&apos;t load. Your vault data was not sent anywhere.
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
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Try again
          </button>
          {/* A plain link: the app's router may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="bg-foreground text-background rounded-md px-3 py-1.5 text-sm">
            Home
          </a>
        </div>
      </body>
    </html>
  );
}
