import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link
        href="/"
        className="mb-8 transition-opacity hover:opacity-80 focus-visible:rounded-md"
        aria-label="KeyCrypt home"
      >
        <Image
          src="/logos/wordmark-black.png"
          alt="KeyCrypt"
          width={437}
          height={158}
          className="h-9 w-auto dark:hidden"
          priority
        />
        <Image
          src="/logos/wordmark-white.png"
          alt="KeyCrypt"
          width={428}
          height={158}
          className="hidden h-9 w-auto dark:block"
          priority
        />
      </Link>

      {/* Card shell */}
      <div className="bg-card before:via-primary/40 relative w-full max-w-sm rounded-2xl border p-6 shadow-sm before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:rounded-t-2xl before:bg-linear-to-r before:from-transparent before:to-transparent">
        {children}
      </div>

      {/* Footer */}
      <p className="text-muted-foreground mt-6 text-center text-xs">
        Zero-knowledge encryption. Your master password never leaves your device.
      </p>
    </div>
  );
}
