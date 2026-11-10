import Link from "next/link";
import { cn } from "@/lib/utils";
import { operatorContact } from "@/lib/operator";
import { Colophon } from "@/features/landing/colophon";
import { Wordmark } from "@/features/landing/primitives";
import { DISPLAY, MONO, WRAP } from "@/features/landing/styles";

// Shared layout for /privacy and /terms, in the landing page's journal style
// (always the light palette).

export function LegalPage({
  label,
  title,
  updated,
  intro,
  children,
}: {
  label: string;
  title: string;
  /** e.g. "10 November 2026" */
  updated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="theme-light bg-background text-foreground flex min-h-dvh flex-col">
      <header className="border-foreground border-b-[3px] border-double">
        <div className={cn(WRAP, "flex h-16 items-center justify-between gap-6")}>
          <Wordmark />
          <nav aria-label="Legal" className={cn(MONO, "text-muted-foreground flex gap-6")}>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className={cn(WRAP, "flex-1 py-14 sm:py-20")}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-10">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-10">
              <p className={cn(MONO, "text-brand-deep")}>{label}</p>
              <h1
                className={cn(
                  DISPLAY,
                  "mt-3 text-[clamp(34px,4.4vw,56px)] leading-[0.95] font-[460] tracking-[-0.03em]"
                )}
              >
                {title}
              </h1>
              <p className={cn(MONO, "text-faint mt-5")}>Last updated {updated}</p>
            </div>
          </div>

          <article className="border-foreground border-t pt-6 lg:col-span-8">
            <div className="text-muted-foreground max-w-2xl text-[15.5px] leading-relaxed">
              {intro}
            </div>
            <div className="mt-4 max-w-2xl">{children}</div>
          </article>
        </div>
      </main>

      <Colophon />
    </div>
  );
}

/** A numbered section of a legal page. */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b py-8">
      <h2
        className={cn(
          DISPLAY,
          "flex items-baseline gap-3 text-[24px] leading-tight font-[480] tracking-[-0.015em]"
        )}
      >
        <span className="font-plex text-brand-deep text-sm">{n}</span>
        {title}
      </h2>
      <div className="text-muted-foreground [&_strong]:text-foreground mt-4 space-y-3 text-[15px] leading-relaxed [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** The operator's contact from OPERATOR_CONTACT, or a neutral placeholder. */
export function OperatorContactText() {
  const contact = operatorContact();
  switch (contact.kind) {
    case "email":
    case "url":
      return (
        <a href={contact.href} className="text-foreground underline underline-offset-4">
          {contact.value}
        </a>
      );
    case "text":
      return <span className="text-foreground">{contact.value}</span>;
    case "unset":
      return (
        <span>
          the operator of this KeyCrypt instance (no contact details have been configured; the
          operator can set them with <code className="font-plex text-[13px]">OPERATOR_CONTACT</code>
          )
        </span>
      );
  }
}
