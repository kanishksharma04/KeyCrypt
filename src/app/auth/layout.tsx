import Link from "next/link";
import { KeyCryptWordmark } from "@/components/shared/keycrypt-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link
        href="/"
        className="mb-8 transition-opacity hover:opacity-80 focus-visible:rounded-md"
        aria-label="KeyCrypt home"
      >
        <KeyCryptWordmark height={36} variant="duo" />
      </Link>

      {/* Card shell */}
      <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm">{children}</div>

      {/* Footer */}
      <p className="text-muted-foreground mt-6 text-center text-xs">
        Zero-knowledge encryption. Your master password never leaves your device.
      </p>
    </div>
  );
}
