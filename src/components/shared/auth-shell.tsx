import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";

/**
 * Centered card on a softly lit page: sign-in/up screens and the vault gate
 * (setup, unlock). Sizes follow the design's unlock screen.
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_900px_500px_at_50%_-10%,color-mix(in_oklab,var(--brand)_8%,transparent),transparent)]"
      />
      <KeyCryptLogo size="lg" className="mb-10 [&>span]:text-xl" />
      <div className="bg-card w-full max-w-[400px] rounded-[20px] border px-6 py-8 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.18)] sm:px-9 sm:py-10 dark:shadow-[0_40px_80px_-40px_rgb(0_0_0/0.6)]">
        {children}
      </div>
      {footer && (
        <p className="text-muted-foreground mt-6 max-w-[400px] text-center text-xs">{footer}</p>
      )}
    </div>
  );
}
