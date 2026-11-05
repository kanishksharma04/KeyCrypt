import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { icon: "size-4", text: "text-lg" },
  md: { icon: "size-[18px]", text: "text-xl" },
  lg: { icon: "size-5", text: "text-2xl" },
} as const;

interface KeyCryptLogoProps {
  size?: keyof typeof SIZES;
  /** Wrap in a link (default "/"); pass null for a plain mark. */
  href?: string | null;
  className?: string;
}

/** The KeyCrypt wordmark: a bronze padlock and the name set in the display serif. */
export function KeyCryptLogo({ size = "md", href = "/", className }: KeyCryptLogoProps) {
  const { icon, text } = SIZES[size];
  const mark = (
    <>
      <Lock className={cn("text-brand shrink-0", icon)} strokeWidth={2.25} aria-hidden="true" />
      <span className={cn("font-serif leading-none font-semibold tracking-tight", text)}>
        KeyCrypt
      </span>
    </>
  );
  const classes = cn("text-foreground inline-flex items-center gap-2", className);

  if (href === null) return <span className={classes}>{mark}</span>;
  return (
    <Link
      href={href}
      className={cn(classes, "rounded-md transition-opacity hover:opacity-80")}
      aria-label="KeyCrypt home"
    >
      {mark}
    </Link>
  );
}
