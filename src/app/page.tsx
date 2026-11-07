import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Eye,
  FileText,
  Folder,
  ShieldCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { KeyCryptLogo } from "@/components/shared/keycrypt-logo";
import { SignOutButton } from "@/components/shared/sign-out-button";
import {
  AuthenticatorIcon,
  CipherChipIcon,
  CiphertextIcon,
  FlatKeyIcon,
  PadlockIcon,
} from "@/components/shared/design-icons";
import { cn } from "@/lib/utils";

// The marketing page always uses the light palette (`.theme-light` in
// globals.css), whatever theme the app itself is in. Sizes and spacing follow
// "KeyCrypt UI Design.html" (1180px container, Fraunces 560 headings).

const REPO = "https://github.com/kanishksharma04/KeyCrypt";

type Icon = LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;

// ─── Static data ─────────────────────────────────────────────────────────────

const TRUST_ITEMS = [
  "AES-256-GCM encryption",
  "Argon2id key derivation",
  "Zero-knowledge architecture",
  "Open source · MIT",
  "Self-hosted or cloud",
  "Browser extension",
];

const PIPELINE: Array<{ Icon: Icon; title: string; sub: string }> = [
  { Icon: PadlockIcon, title: "Master password", sub: "Typed once, kept in memory only" },
  { Icon: ShieldCheck, title: "Argon2id", sub: "64 MiB memory, 3 iterations" },
  { Icon: FlatKeyIcon, title: "256-bit vault key", sub: "Random, never derived from a password" },
  { Icon: CipherChipIcon, title: "AES-256-GCM", sub: "Fresh IV on every item" },
  { Icon: CiphertextIcon, title: "Ciphertext", sub: "The only thing the server stores" },
];

const FEATURES: Array<{ Icon: Icon; title: string; description: string }> = [
  {
    Icon: PadlockIcon,
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
    Icon: AuthenticatorIcon,
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

// ─── Shared classes ──────────────────────────────────────────────────────────

const CONTAINER = "mx-auto w-full max-w-[1180px] px-5 sm:px-8";
const PILL =
  "border-border-strong text-muted-foreground inline-flex items-center gap-2 rounded-full border px-4 py-[9px] text-[13px] font-medium";
const BTN =
  "inline-flex items-center justify-center gap-2 rounded-[10px] border px-[26px] py-3.5 text-[15px] font-semibold transition-colors";
const BTN_PRIMARY = cn(
  BTN,
  "bg-foreground text-background border-foreground hover:bg-foreground/85"
);
const BTN_SECONDARY = cn(BTN, "border-border-strong text-foreground hover:bg-card bg-transparent");
const CARD = "bg-card rounded-[18px] border";

// ─── Pieces ──────────────────────────────────────────────────────────────────

function SectionHeading({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-[620px] text-center", className)}>
      <p className="text-brand-deep text-xs font-bold tracking-[0.14em] uppercase">{eyebrow}</p>
      <h2 className="mt-3.5 font-serif text-[clamp(28px,3vw,38px)] leading-[1.15] font-[560] tracking-[-0.01em] text-balance">
        {title}
      </h2>
      {children && (
        <p className="text-muted-foreground mt-4 text-[16.5px] leading-[1.6] text-pretty">
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
      className="hover:text-foreground transition-colors"
    >
      {children}
    </a>
  );
}

/** Concentric rings around the key, with the three primitives orbiting it. */
function HeroOrbit() {
  const pill = cn(PILL, "bg-card absolute px-3 py-[7px] text-[11.5px] whitespace-nowrap");
  return (
    <div className="relative aspect-square w-[min(360px,80vw)] shrink-0">
      <div className="absolute inset-0 rounded-full border" />
      <div className="absolute inset-[8.57%] rounded-full border" />
      <div
        className={cn(
          CARD,
          "absolute inset-[17.6%] flex items-center justify-center rounded-full shadow-[0_30px_60px_-30px_rgb(28_26_23/0.28)]"
        )}
      >
        <FlatKeyIcon className="text-brand size-1/4" strokeWidth={1.4} />
      </div>
      <span className={cn(pill, "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2")}>
        AES-256-GCM
      </span>
      <span className={cn(pill, "bottom-[8%] left-[-6%]")}>Argon2id</span>
      <span className={cn(pill, "right-[-6%] bottom-[8%]")}>Zero-knowledge</span>
    </div>
  );
}

function PipelineArrow() {
  return (
    <span
      aria-hidden="true"
      className="text-border-strong hidden w-12 shrink-0 items-center justify-center self-center lg:flex"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        width="28"
        height="18"
      >
        <path d="M3 12h16M14 6l6 6-6 6" />
      </svg>
    </span>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-[rgb(250_248_243/0.92)] backdrop-blur-[6px]">
      <div className={cn(CONTAINER, "flex h-16 items-center justify-between gap-6 sm:h-[76px]")}>
        <KeyCryptLogo size="lg" />

        <nav aria-label="Page sections" className="hidden items-center gap-9 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-muted-foreground hover:text-foreground text-[14.5px] font-medium transition-colors"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-3.5">
          {signedIn ? (
            <>
              <SignOutButton size="sm" callbackUrl="/" className="hidden sm:inline-flex" />
              <Link
                href="/vault"
                className={cn(BTN_PRIMARY, "px-4 py-[9px] text-sm sm:px-5 sm:py-[11px]")}
              >
                Open vault
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="text-foreground hover:text-brand text-[14.5px] font-semibold transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className={cn(BTN_PRIMARY, "px-4 py-[9px] text-sm sm:px-5 sm:py-[11px]")}
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
    <div className="theme-light bg-background text-foreground flex min-h-dvh flex-col selection:bg-[#f1e6d7]">
      <MarketingNav signedIn={signedIn} />

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-14 pb-20 sm:pt-[88px] sm:pb-24">
          <div
            className={cn(CONTAINER, "grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_360px]")}
          >
            <div className="min-w-0">
              <p className={cn(PILL, "bg-card mb-7")}>
                <ShieldCheck className="text-brand size-3.5" strokeWidth={1.6} aria-hidden="true" />
                Zero-knowledge password manager
              </p>
              <h1 className="font-serif text-[clamp(40px,5vw,66px)] leading-[1.04] font-[560] tracking-[-0.01em]">
                Your passwords.
                <br />
                Never on our servers.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-[520px] text-[17px] leading-[1.65] sm:text-lg">
                Every vault is encrypted and decrypted on your device. KeyCrypt&apos;s servers only
                ever hold ciphertext, wrapped keys and a handful of plain-text housekeeping fields —
                never your passwords.
              </p>
              <div className="mt-9 flex flex-col gap-3.5 sm:flex-row sm:flex-wrap">
                <Link href={primaryCta.href} className={BTN_PRIMARY}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden="true" />
                </Link>
                <a href="#how-it-works" className={BTN_SECONDARY}>
                  See how it works
                </a>
              </div>
              <p className="text-faint mt-[22px] text-[13.5px]">
                Open source · MIT licensed · self-host with Docker or use the hosted app
              </p>
            </div>

            <div className="flex justify-center py-4 lg:py-0">
              <HeroOrbit />
            </div>
          </div>
        </section>

        {/* ── Trust strip ──────────────────────────────────────────────────── */}
        <section aria-label="Security features" className="bg-muted border-y">
          <ul
            className={cn(CONTAINER, "flex flex-wrap justify-center gap-2.5 py-7 sm:gap-3 sm:px-6")}
          >
            {TRUST_ITEMS.map((item) => (
              <li key={item} className={PILL}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-28">
          <div className={CONTAINER}>
            <SectionHeading
              className="mb-12 sm:mb-16"
              eyebrow="How it works"
              title="Encryption happens before anything leaves your browser."
            >
              Your master password never reaches the network. It is only ever used, in memory, to
              derive the key that unlocks your vault.
            </SectionHeading>

            <ol className="flex flex-wrap items-stretch justify-center gap-y-10 lg:flex-nowrap">
              {PIPELINE.map(({ Icon, title, sub }, i) => {
                const last = i === PIPELINE.length - 1;
                return (
                  <li key={title} className="flex">
                    <div className="flex w-[150px] flex-col items-center gap-3.5 text-center sm:w-[188px]">
                      <span
                        className={cn(
                          CARD,
                          "flex size-16 items-center justify-center rounded-[16px]",
                          last && "bg-foreground border-foreground"
                        )}
                      >
                        <Icon
                          className={cn("size-[26px]", last ? "text-background" : "text-brand")}
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-[14.5px] font-semibold">{title}</span>
                      <span className="text-faint text-[13px]">{sub}</span>
                    </div>
                    {!last && <PipelineArrow />}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section id="features" className="bg-muted scroll-mt-20 border-y py-20 sm:py-24">
          <div className={CONTAINER}>
            <SectionHeading
              className="mb-12 sm:mb-14"
              eyebrow="Everything a vault needs"
              title="One place for every secret you hold."
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5 sm:gap-6">
              {FEATURES.map(({ Icon, title, description }) => (
                <div key={title} className={cn(CARD, "p-6 sm:p-[30px]")}>
                  <span className="bg-brand-soft mb-[18px] flex size-11 items-center justify-center rounded-xl">
                    <Icon className="text-brand-deep size-5" strokeWidth={1.6} aria-hidden="true" />
                  </span>
                  <h3 className="font-serif text-lg font-semibold tracking-[-0.01em]">{title}</h3>
                  <p className="text-muted-foreground mt-2.5 text-[14.5px] leading-[1.6]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What the server can see ──────────────────────────────────────── */}
        <section id="security" className="scroll-mt-20 py-20 sm:py-28">
          <div className={CONTAINER}>
            <SectionHeading
              className="mb-12 sm:mb-14"
              eyebrow="What the server can see"
              title="A short, honest list — today."
            >
              No vendor can promise a vault is unbreakable. KeyCrypt&apos;s promise is narrower and
              checkable: here is exactly what leaves your browser in the clear.
            </SectionHeading>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(440px,100%),1fr))] gap-5 sm:gap-6">
              <div className={cn(CARD, "p-6 sm:p-9")}>
                <h3 className="mb-5 flex items-center gap-2.5 font-serif text-[17px] font-semibold">
                  <Eye
                    className="text-muted-foreground size-5"
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  What we store, in the clear
                </h3>
                <ul className="text-muted-foreground flex flex-col gap-3.5 text-[14.5px]">
                  {SERVER_SEES.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-brand-deep" aria-hidden="true">
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn(CARD, "p-6 sm:p-9")}>
                <h3 className="mb-5 flex items-center gap-2.5 font-serif text-[17px] font-semibold">
                  <PadlockIcon className="text-brand size-5" />
                  What we never see
                </h3>
                <ul className="flex flex-col gap-3.5 text-[14.5px]">
                  {SERVER_NEVER_SEES.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-brand" aria-hidden="true">
                        ·
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-faint mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed">
              Also stored: your name, and an activity log of account events with the IP address and
              browser for each, kept for 180 days. The optional breached-password check talks to
              Have I Been Pwned from your browser and sends only the first 5 characters of each
              password&apos;s SHA-1 hash.
            </p>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="bg-foreground py-20 text-center sm:py-24">
          <div className={CONTAINER}>
            <h2 className="text-background font-serif text-[clamp(28px,3.4vw,42px)] leading-[1.15] font-[560] tracking-[-0.01em] text-balance">
              {signedIn ? "Your vault is waiting." : "Set up your vault in under a minute."}
            </h2>
            <p className="mt-3.5 text-[16.5px] text-[rgb(250_248_243/0.68)]">
              No credit card. No lock-in — export your vault any time.
            </p>
            <Link
              href={primaryCta.href}
              className="bg-brand text-foreground mt-8 inline-flex items-center gap-2 rounded-[10px] px-[30px] py-[15px] text-[15px] font-semibold transition-colors hover:bg-[#ad7a48]"
            >
              {primaryCta.label}
              <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="pt-16 pb-10">
        <div className={CONTAINER}>
          <div className="flex flex-wrap justify-between gap-12 border-b pb-10">
            <div className="max-w-[280px]">
              <KeyCryptLogo size="md" />
              <p className="text-faint mt-3.5 text-[13.5px] leading-[1.6]">
                A zero-knowledge password manager. Encrypted in your browser, on your terms.
              </p>
            </div>

            <div className="flex flex-wrap gap-16">
              <div>
                <p className="text-faint mb-4 text-[12.5px] font-bold tracking-[0.06em] uppercase">
                  Product
                </p>
                <ul className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <li>
                    <a href="#features" className="hover:text-foreground transition-colors">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#security" className="hover:text-foreground transition-colors">
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
                <p className="text-faint mb-4 text-[12.5px] font-bold tracking-[0.06em] uppercase">
                  Resources
                </p>
                <ul className="text-muted-foreground flex flex-col gap-3 text-sm">
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
          </div>

          <div className="text-faint flex flex-wrap justify-between gap-3 pt-6 text-[13px]">
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
