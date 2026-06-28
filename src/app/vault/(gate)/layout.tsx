import Link from "next/link";
import { KeyCryptWordmark } from "@/components/shared/keycrypt-logo";

// Visual shell for pre-vault screens (setup and unlock).
// Mirrors the auth layout so the experience is consistent.
export default function VaultGateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-8 transition-opacity hover:opacity-80 focus-visible:rounded-md"
        aria-label="KeyCrypt home"
      >
        <KeyCryptWordmark height={36} variant="duo" />
      </Link>

      <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm">{children}</div>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Zero-knowledge encryption. Your master password never leaves your device.
      </p>
    </div>
  );
}
