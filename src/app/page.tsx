import Link from "next/link";
import {
  Code2,
  FileText,
  Github,
  KeyRound,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Vault,
  Wifi,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Nav ─────────────────────────────────────────────────────────────────────

async function MarketingNav() {
  const session = await auth();

  return (
    <header className="scroll-nav bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="transition-opacity hover:opacity-80" aria-label="KeyCrypt home">
          <Image
            src="/logos/wordmark-black.png"
            alt="KeyCrypt"
            width={437}
            height={158}
            className="h-8 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logos/wordmark-white.png"
            alt="KeyCrypt"
            width={428}
            height={158}
            className="hidden h-8 w-auto dark:block"
            priority
          />
        </Link>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/kanishksharma04/KeyCrypt"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label="View source on GitHub"
          >
            <Github className="size-4" aria-hidden="true" />
          </a>
          <ThemeToggle />
          {session ? (
            <Link href="/vault" className={buttonVariants({ size: "sm" })}>
              Open vault
            </Link>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link href="/auth/signup" className={buttonVariants({ size: "sm" })}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  Icon,
  title,
  description,
  iconBg,
  iconColor,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-card group rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={cn(
          "mb-3 flex size-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110",
          iconBg
        )}
      >
        <Icon className={cn("size-5", iconColor)} aria-hidden="true" />
      </div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

// ─── How it works step ────────────────────────────────────────────────────────

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
        {number}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingNav />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b py-24 md:py-36">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="bg-primary/8 absolute top-0 left-1/2 h-125 w-225 -translate-x-1/2 rounded-[100%] blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl px-4 text-center">
            <div className="bg-card text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium tracking-wide">
              <ShieldCheck className="size-3.5 text-green-500" aria-hidden="true" />
              Zero-knowledge · AES-256-GCM · PBKDF2-SHA-256
            </div>

            <h1 className="mb-5 text-4xl font-black tracking-tight md:text-6xl md:tracking-[-0.04em]">
              Your passwords,{" "}
              <span className="from-primary bg-linear-to-r to-blue-400 bg-clip-text text-transparent">
                never on our servers
              </span>
            </h1>

            <p className="text-muted-foreground mx-auto mb-8 max-w-md text-base md:text-lg">
              Your browser encrypts it. Our servers never can.
            </p>

            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              {session ? (
                <Link href="/vault" className={buttonVariants({ size: "lg" })}>
                  <Vault className="size-4" aria-hidden="true" />
                  Open your vault
                </Link>
              ) : (
                <>
                  <Link href="/auth/signup" className={buttonVariants({ size: "lg" })}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Create free vault
                  </Link>
                  <Link
                    href="/auth/signin"
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Trust bar ────────────────────────────────────────────────────── */}
        <section className="border-b py-8">
          <div className="mx-auto max-w-5xl px-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Zero-knowledge architecture", Icon: Shield },
                { label: "AES-256-GCM encryption", Icon: Lock },
                { label: "600,000-iteration PBKDF2", Icon: RefreshCw },
                { label: "In-browser crypto only", Icon: ShieldCheck },
              ].map(({ label, Icon }) => (
                <div
                  key={label}
                  className="text-muted-foreground flex items-center gap-2 text-xs font-medium"
                >
                  <Icon className="size-3.5 shrink-0 text-green-500" aria-hidden="true" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="border-b py-20">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-12 text-center">
              <span className="text-muted-foreground mb-2 block font-mono text-xs tracking-[0.15em] uppercase">
                01
              </span>
              <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                Everything you need, nothing you don&apos;t
              </h2>
              <p className="text-muted-foreground">A focused password manager with no bloat.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                Icon={KeyRound}
                title="Login credentials"
                description="Store usernames, passwords, and URLs with one-click copy and site launch."
                iconBg="bg-primary/10"
                iconColor="text-primary"
              />
              <FeatureCard
                Icon={FileText}
                title="Secure notes"
                description="Encrypted free-form notes for PINs, recovery codes, or any sensitive text."
                iconBg="bg-green-500/10"
                iconColor="text-green-500"
              />
              <FeatureCard
                Icon={Code2}
                title="API keys"
                description="Keep API keys and tokens safe with description fields and monospace display."
                iconBg="bg-purple-500/10"
                iconColor="text-purple-500"
              />
              <FeatureCard
                Icon={Wifi}
                title="WiFi passwords"
                description="Store network credentials with SSID, password, and security type."
                iconBg="bg-orange-500/10"
                iconColor="text-orange-500"
              />
              <FeatureCard
                Icon={Sparkles}
                title="Password generator"
                description="Generate strong passwords with configurable length, charsets, and live entropy score."
                iconBg="bg-pink-500/10"
                iconColor="text-pink-500"
              />
              <FeatureCard
                Icon={Lock}
                title="Auto-lock"
                description="Vault locks after 15 minutes of inactivity and immediately on tab close."
                iconBg="bg-amber-500/10"
                iconColor="text-amber-500"
              />
            </div>
          </div>
        </section>

        {/* ── What we never do ─────────────────────────────────────────────── */}
        <section className="border-b py-20">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mb-12 text-center">
              <span className="text-muted-foreground mb-2 block font-mono text-xs tracking-[0.15em] uppercase">
                02
              </span>
              <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                What we never do
              </h2>
              <p className="text-muted-foreground">Constraints that make zero-knowledge real.</p>
            </div>

            <div className="grid gap-12 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-widest uppercase">
                  Never
                </p>
                <ul className="space-y-3.5">
                  {[
                    "Store your master password",
                    "Transmit unencrypted vault data",
                    "Log or read your vault contents",
                    "Sell or share your information",
                    "Derive your encryption key server-side",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span className="text-destructive mt-px shrink-0 font-mono text-xs leading-5">
                        ✗
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-widest uppercase">
                  Always
                </p>
                <ul className="space-y-3.5">
                  {[
                    "Encrypt before data leaves your device",
                    "Derive your vault key client-side only",
                    "Use a unique random IV per item",
                    "Clear clipboard after 30 seconds",
                    "Wipe the vault key from memory on lock",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <span className="mt-px shrink-0 font-mono text-xs leading-5 text-green-500">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="border-b py-20">
          <div className="mx-auto max-w-3xl px-4">
            <div className="mb-12 text-center">
              <span className="text-muted-foreground mb-2 block font-mono text-xs tracking-[0.15em] uppercase">
                03
              </span>
              <h2 className="mb-2 text-2xl font-bold tracking-tight md:text-3xl">
                How the zero-knowledge model works
              </h2>
              <p className="text-muted-foreground">
                Your master password never leaves your device. Ever.
              </p>
            </div>

            <div className="relative space-y-8">
              <div
                className="border-border absolute top-4 bottom-4 left-4 w-px border-l border-dashed"
                aria-hidden="true"
              />
              <Step
                number="1"
                title="Choose a master password"
                description="Your browser derives a 256-bit AES key using PBKDF2-SHA-256 at 600,000 iterations. The master password itself is never sent anywhere — only the derived key is used locally."
              />
              <Step
                number="2"
                title="Your secrets are encrypted before upload"
                description="Every vault item is encrypted with AES-256-GCM using a unique random IV. The server receives opaque ciphertext it cannot read — it has no key and no way to derive one."
              />
              <Step
                number="3"
                title="Unlock anywhere with your master password"
                description="Sign in on any device, enter your master password, and your browser re-derives the vault key locally. Nothing changes on the server — decryption is entirely client-side."
              />
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        {!session && (
          <section className="py-24">
            <div className="mx-auto max-w-xl px-4 text-center">
              <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
                Ready to take back control of your passwords?
              </h2>
              <p className="text-muted-foreground mb-8">
                Free to use. No credit card. No tracking.
              </p>
              <Link href="/auth/signup" className={buttonVariants({ size: "lg" })}>
                <Sparkles className="size-4" aria-hidden="true" />
                Create your free vault
              </Link>
            </div>
          </section>
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t py-12">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Image
                  src="/logos/app-icon.png"
                  alt=""
                  width={210}
                  height={208}
                  className="size-6 rounded-md"
                  aria-hidden="true"
                />
                <span className="font-semibold">KeyCrypt</span>
              </div>
              <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                Zero-knowledge password manager. Everything encrypted in your browser — nothing
                readable on our servers.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-widest uppercase">
                Product
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link
                    href="/vault"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Vault
                  </Link>
                </li>
                <li>
                  <Link
                    href="/auth/signin"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/auth/signup"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Create account
                  </Link>
                </li>
              </ul>
            </div>

            {/* Open source */}
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-widest uppercase">
                Open source
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a
                    href="https://github.com/kanishksharma04/KeyCrypt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Github className="size-3.5" aria-hidden="true" />
                    GitHub
                  </a>
                </li>
                <li>
                  <span className="text-muted-foreground">MIT License</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-border mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 sm:flex-row">
            <p className="text-muted-foreground text-xs">
              © {new Date().getFullYear()} KeyCrypt · Zero-knowledge password manager
            </p>
            <p className="text-muted-foreground text-xs">Built with end-to-end encryption</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
