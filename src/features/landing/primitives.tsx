import Link from "next/link";
import { PadlockIcon } from "@/components/shared/design-icons";
import { cn } from "@/lib/utils";
import { DISPLAY, MONO } from "./styles";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="KeyCrypt home"
      className={cn(
        "inline-flex items-center gap-2 transition-opacity hover:opacity-75",
        className
      )}
    >
      <PadlockIcon className="text-brand size-5" strokeWidth={1.8} />
      <span className={cn(DISPLAY, "text-[22px] leading-none font-semibold tracking-[-0.02em]")}>
        KeyCrypt
      </span>
    </Link>
  );
}

/** "§ 01 — How it works": the label column of a numbered section. */
export function SectionLabel({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="lg:sticky lg:top-28">
      <p className={cn(MONO, "text-brand-deep")}>§ {n}</p>
      <h2
        className={cn(
          DISPLAY,
          "mt-3 text-[clamp(34px,4.4vw,56px)] leading-[0.95] font-[460] tracking-[-0.03em]"
        )}
      >
        {title}
      </h2>
      {children && (
        <p className="text-muted-foreground mt-5 max-w-xs text-[15px] leading-relaxed">
          {children}
        </p>
      )}
    </div>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <path d="M3 12h17M14 6l6 6-6 6" />
    </svg>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-brand-deep underline-offset-4 transition-colors hover:underline"
    >
      {children}
    </a>
  );
}
