import Link from "next/link";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { cn } from "@/lib/utils";
import { Wordmark } from "./primitives";
import { MONO, OUTLINE_BUTTON, WRAP } from "./styles";

const NAV = [
  ["#how-it-works", "01 How it works"],
  ["#security", "02 What we see"],
  ["#contents", "03 Contents"],
] as const;

export function Masthead({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <div className="border-b">
        <div className={cn(WRAP, MONO, "text-faint flex h-9 items-center justify-between gap-4")}>
          <span>Vol. 1 · No. 1</span>
          <span className="hidden md:inline">A zero-knowledge password manager</span>
          <span>Open source · MIT</span>
        </div>
      </div>

      <header className="bg-background/95 border-foreground sticky top-0 z-40 border-b-[3px] border-double backdrop-blur-sm">
        <div className={cn(WRAP, "flex h-16 items-center justify-between gap-6")}>
          <Wordmark />

          <nav aria-label="Page sections" className="hidden items-center gap-8 md:flex">
            {NAV.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={cn(
                  MONO,
                  "text-muted-foreground hover:text-foreground transition-colors"
                )}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-5">
            {signedIn ? (
              <>
                <SignOutButton
                  size="sm"
                  callbackUrl="/"
                  variant="link"
                  className="text-foreground hidden h-auto p-0 text-sm font-semibold sm:inline-flex"
                />
                <Link href="/vault" className={OUTLINE_BUTTON}>
                  Open vault
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/signin"
                  className="text-sm font-semibold underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
                <Link href="/auth/signup" className={OUTLINE_BUTTON}>
                  <span className="sm:hidden">Start</span>
                  <span className="hidden sm:inline">Start your vault</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
