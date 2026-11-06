import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Eye,
  FileText,
  Folder,
  Key,
  Lock,
  ShieldCheck,
  Smartphone,
  SquareSquare,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { cn } from "@/lib/utils";

// The marketing page always uses the light palette (`.theme-light` in
// globals.css), whatever theme the app itself is in.

const REPO = "https://github.com/kanishksharma04/KeyCrypt";

// ─── Static data ─────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  "AES-256-GCM encryption",
  "Argon2id key derivation",
  "Zero-knowledge architecture",
  "Open source · MIT",
  "Self-hosted or cloud",
  "Browser extension",
];

/** Lucide's key is diagonal; turned 45° it lies flat, as in the design. */
function FlatKey({ className, ...props }: React.ComponentProps<typeof Key>) {
  return <Key className={cn("rotate-45", className)} aria-hidden="true" {...props} />;
}

const PIPELINE: Array<{ Icon: LucideIcon | typeof FlatKey; title: string; sub: string }> = [
  { Icon: Lock, title: "Master password", sub: "Typed once, kept in memory only" },
  { Icon: ShieldCheck, title: "Argon2id", sub: "64 MiB memory, 3 iterations" },
  { Icon: FlatKey, title: "256-bit vault key", sub: "Random, never derived from a password" },
  { Icon: SquareSquare, title: "AES-256-GCM", sub: "Fresh IV on every item" },
  { Icon: SquareSquare, title: "Ciphertext", sub: "The only thing the server stores" },
];

const FEATURES: Array<{ Icon: LucideIcon; title: string; description: string }> = [
  {
    Icon: Lock,
    title: "Logins",
    description:
      "Usernames and passwords with a built-in generator, a live strength meter and Have I Been Pwned breach checks — done with k-anonymity, never your full password.",
  },
  {
    Icon: FileText,
    title: "Secure notes",
    description:
      "Free-form encrypted text for anything that doesn't fit a password field — licence keys, PINs, passphrases, private notes.",
  },
  {
    Icon: Braces,
    title: "API keys",
    description:
      "Store service tokens and secrets in a monospace field built for long, awkward strings, with one-tap copy.",
  },
  {
    Icon: Wifi,
    title: "Wi-Fi passwords",
    description:
      "SSID, password and security type in one place — handy for guests, and for remembering your own network.",
  },
  {
    Icon: Smartphone,
    title: "Authenticator codes",
    description:
      "Hold TOTP secrets alongside the login they belong to, with live 6–8 digit codes and a countdown ring.",
  },
  {
    Icon: Folder,
    title: "Folders & command palette",
    description:
      "Organise items into encrypted folders, then find anything in a breath with ⌘K — items, folders and quick actions, fuzzy-matched.",
  },
];

// Keep in sync with CLAUDE.md "Security model" and README's security table.
// The cards follow the design; the note under them lists the rest.
const SERVER_SEES = [
  "Your account email, for signing in",
  'Each item\'s type — "this is a login", not what it is',
  "Favourites, folders as structure, and timestamps",
];

const SERVER_NEVER_SEES = [
  "Item names, usernames, passwords and notes",
  "Folder names, API keys, TOTP secrets",
  "Your master password — it never leaves the browser",
];

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
];

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-brand mb-3 text-xs font-semibold tracking-[0.18em] uppercase">{children}</p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center md:mb-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-serif text-3xl leading-tight font-semibold tracking-tight text-balance md:text-[2.5rem]">
        {title}
      </h2>
      {children && (
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base leading-relaxed text-pretty">
          {children}
        </p>
      )}
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </a>
  );
}

/** Concentric rings around the key, with the three primitives orbiting it. */
function HeroOrbit() {
  const pill =
    "bg-card text-muted-foreground absolute rounded-full border px-3 py-1 text-xs whitespace-nowrap shadow-sm";
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[17rem] sm:max-w-xs lg:max-w-[22rem]">
      <div className="absolute inset-0 rounded-full border" />
      <div className="absolute inset-[11%] rounded-full border" />
      <div className="bg-card absolute inset-[22%] flex items-center justify-center rounded-full shadow-[0_24px_60px_-20px_rgb(28_26_23/0.25)]">
        <FlatKey className="text-brand size-9" />
      </div>
      <span className={cn(pill, "top-[-0.6rem] left-1/2 -translate-x-1/2")}>AES-256-GCM</span>
      <span className={cn(pill, "bottom-[16%] left-[-4%]")}>Argon2id</span>
      <span className={cn(pill, "right-[-8%] bottom-[16%]")}>Zero-knowledge</span>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="scroll-nav bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <KeyCryptLogo />

        <nav aria-label="Page sections" className="mx-auto hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 md:ml-0">
          {signedIn ? (
            <>
              <SignOutButton size="sm" callbackUrl="/" className="hidden sm:inline-flex" />
              <Link href="/vault" className={buttonVariants({ className: "h-9 rounded-lg px-4" })}>
                Open vault
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className={buttonVariants({ variant: "ghost", className: "h-9 px-3" })}
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className={buttonVariants({ className: "h-9 rounded-lg px-4" })}
              >
                <span className="sm:hidden">Start</span>
                <span className="hidden sm:inline">Start your vault</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session;
  const primaryCta = signedIn
    ? { href: "/vault", label: "Open your vault" }
    : { href: "/auth/signup", label: "Start your vault" };

  return (
    <div className="theme-light bg-background text-foreground flex min-h-dvh flex-col">
      <MarketingNav signedIn={signedIn} />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-10 lg:pt-24 lg:pb-28">
          <div>
            <p className="bg-card text-muted-foreground mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
              <ShieldCheck className="text-brand size-3.5" aria-hidden="true" />
              Zero-knowledge password manager
            </p>
            <h1 className="font-serif text-[2.6rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-[3.6rem] xl:text-[4rem]">
              <span className="block">Your passwords.</span>
              <span className="block lg:whitespace-nowrap">Never on our servers.</span>
            </h1>
            <p className="text-muted-foreground mt-6 max-w-lg text-base leading-relaxed sm:text-lg">
              Every vault is encrypted and decrypted on your device. KeyCrypt&apos;s servers only
              ever hold ciphertext, wrapped keys and a handful of plain-text housekeeping fields —
              never your passwords.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryCta.href}
                className={buttonVariants({
                  className: "h-11 rounded-lg px-5 text-[15px] font-semibold",
                })}
              >
                {primaryCta.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className={buttonVariants({
                  variant: "outline",
                  className: "bg-card h-11 rounded-lg px-5 text-[15px] font-semibold",
                })}
              >
                See how it works
              </a>
            </div>
            <p className="text-muted-foreground mt-6 text-xs sm:text-sm">
              Open source · MIT licensed · self-host with Docker or use the hosted app
            </p>
          </div>

          <div className="px-6 sm:px-10 lg:px-0">
            <HeroOrbit />
          </div>
        </section>

        {/* ── Trust bar ────────────────────────────────────────────────────── */}
        <section aria-label="Security features" className="bg-muted border-y">
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-2 px-4 py-5 sm:gap-3 sm:px-6">
            {TRUST_ITEMS.map((item) => (
              <li
                key={item}
                className="bg-background text-muted-foreground rounded-full border px-3.5 py-1.5 text-xs font-medium"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-16 px-4 py-20 sm:px-6 md:py-28">
          <SectionHeading
            eyebrow="How it works"
            title={
              <>
                Encryption happens before
                <br className="hidden sm:block" /> anything leaves your browser.
              </>
            }
          >
            Your master password never reaches the network. It is only ever used, in memory, to
            derive the key that unlocks your vault.
          </SectionHeading>

          <ol className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {PIPELINE.map(({ Icon, title, sub }, i) => {
              const last = i === PIPELINE.length - 1;
              return (
                <li
                  key={title}
                  className="relative flex items-start gap-4 lg:flex-col lg:items-center lg:text-center"
                >
                  <span
                    className={cn(
                      "flex size-12 shrink-0 items-center justify-center rounded-xl border shadow-sm",
                      last ? "bg-primary text-primary-foreground border-primary" : "bg-card"
                    )}
                  >
                    <Icon className={cn("size-5", !last && "text-brand")} aria-hidden="true" />
                  </span>
                  <div className="lg:mt-1">
                    <p className="text-[15px] font-semibold">{title}</p>
                    <p className="text-muted-foreground mt-1 text-sm leading-snug">{sub}</p>
                  </div>
                  {!last && (
                    <ArrowRight
                      className="text-muted-foreground/50 absolute top-4 -right-4 hidden size-4 lg:block"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section
          id="features"
          className="bg-muted scroll-mt-16 border-y px-4 py-20 sm:px-6 md:py-28"
        >
          <SectionHeading
            eyebrow="Everything a vault needs"
            title="One place for every secret you hold."
          />
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {FEATURES.map(({ Icon, title, description }) => (
              <div key={title} className="bg-card rounded-2xl border p-6">
                <span className="bg-brand-soft mb-5 flex size-9 items-center justify-center rounded-lg">
                  <Icon className="text-brand size-4" aria-hidden="true" />
                </span>
                <h3 className="font-serif text-lg font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── What the server can see ──────────────────────────────────────── */}
        <section id="security" className="scroll-mt-16 px-4 py-20 sm:px-6 md:py-28">
          <SectionHeading eyebrow="What the server can see" title="A short, honest list — today.">
            No vendor can promise a vault is unbreakable. KeyCrypt&apos;s promise is narrower and
            checkable: here is exactly what leaves your browser in the clear.
          </SectionHeading>

          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2 lg:gap-5">
            <div className="bg-card rounded-2xl border p-6 sm:p-7">
              <h3 className="mb-4 flex items-center gap-2.5 font-serif text-lg font-semibold">
                <Eye className="text-muted-foreground size-4" aria-hidden="true" />
                What we store, in the clear
              </h3>
              <ul className="text-muted-foreground space-y-2.5 text-sm leading-relaxed">
                {SERVER_SEES.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card rounded-2xl border p-6 sm:p-7">
              <h3 className="mb-4 flex items-center gap-2.5 font-serif text-lg font-semibold">
                <Lock className="text-brand size-4" aria-hidden="true" />
                What we never see
              </h3>
              <ul className="space-y-2.5 text-sm leading-relaxed">
                {SERVER_NEVER_SEES.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-muted-foreground" aria-hidden="true">
                      ·
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-muted-foreground mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed">
            Also stored: your name, and an activity log of account events with the IP address and
            browser for each, kept for 180 days. The optional breached-password check talks to Have
            I Been Pwned from your browser and sends only the first 5 characters of each
            password&apos;s SHA-1 hash.
          </p>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="bg-[#1c1a17] px-4 py-20 text-center text-[#f9f7f2] sm:px-6 md:py-24">
          <h2 className="font-serif text-3xl font-semibold tracking-tight text-balance md:text-[2.5rem]">
            {signedIn ? "Your vault is waiting." : "Set up your vault in under a minute."}
          </h2>
          <p className="mt-3 text-[15px] text-[#f9f7f2]/70">
            No credit card. No lock-in — export your vault any time.
          </p>
          <Link
            href={primaryCta.href}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-[#b57d45] px-5 text-[15px] font-semibold text-[#1c1a17] transition-colors hover:bg-[#c48b52]"
          >
            {primaryCta.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="px-4 pt-14 pb-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-[1fr_auto_auto] sm:gap-16">
            <div className="col-span-2 sm:col-span-1">
              <KeyCryptLogo size="sm" />
              <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-relaxed">
                A zero-knowledge password manager.
                <br />
                Encrypted in your browser, on your terms.
              </p>
            </div>

            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-widest uppercase">
                Product
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="#features" className="text-muted-foreground hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#security" className="text-muted-foreground hover:text-foreground">
                    Security
                  </a>
                </li>
                <li>
                  <ExternalLink href={`${REPO}/tree/main/extension`}>
                    Browser extension
                  </ExternalLink>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-widest uppercase">
                Resources
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <ExternalLink href={`${REPO}#readme`}>Documentation</ExternalLink>
                </li>
                <li>
                  <ExternalLink href={`${REPO}/blob/main/docs/threat-model.md`}>
                    Threat model
                  </ExternalLink>
                </li>
                <li>
                  <ExternalLink href={REPO}>Source on GitHub</ExternalLink>
                </li>
              </ul>
            </div>
          </div>

          <div className="text-muted-foreground mt-12 flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:justify-between">
            <p>
              © {new Date().getFullYear()} KeyCrypt. Open source, MIT licensed.
              {/* Vulnerability disclosure (RFC 9116); kept small so the footer stays as designed. */}
              <span className="ml-2 inline-flex gap-2">
                <ExternalLink href={`${REPO}/blob/main/SECURITY.md`}>Security policy</ExternalLink>
                <span aria-hidden="true">·</span>
                <a href="/.well-known/security.txt" className="hover:text-foreground">
                  security.txt
                </a>
              </span>
            </p>
            <p>Built on Next.js, Argon2id and AES-256-GCM.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
