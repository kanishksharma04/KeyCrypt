import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";

/**
 * Centered card on a softly lit page: sign-in/up screens and the vault gate
 * (setup, unlock).
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--brand)_16%,transparent),transparent)]"
      />
      <KeyCryptLogo size="lg" className="mb-8" />
      <div className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-xl shadow-black/5 sm:p-9 dark:shadow-black/40">
        {children}
      </div>
      {footer && (
        <p className="text-muted-foreground mt-6 max-w-md text-center text-xs">{footer}</p>
      )}
    </div>
  );
}
