import Link from "next/link";
import { PadlockIcon } from "@/components/shared/design-icons";
import { cn } from "@/lib/utils";

// Sizes from the design: app header (sm), footer (md), landing nav and the
// sign-in / unlock screens (lg).
const SIZES = {
  sm: { icon: "size-[19px]", text: "text-[17px]", gap: "gap-[9px]" },
  md: { icon: "size-5", text: "text-lg", gap: "gap-2.5" },
  lg: { icon: "size-[22px]", text: "text-[21px]", gap: "gap-2.5" },
} as const;

interface KeyCryptLogoProps {
  size?: keyof typeof SIZES;
  /** Wrap in a link (default "/"); pass null for a plain mark. */
  href?: string | null;
  className?: string;
}

/** The KeyCrypt wordmark: a bronze padlock and the name set in the display serif. */
export function KeyCryptLogo({ size = "md", href = "/", className }: KeyCryptLogoProps) {
  const { icon, text, gap } = SIZES[size];
  const mark = (
    <>
      <PadlockIcon className={cn("text-brand shrink-0", icon)} />
      <span className={cn("font-serif leading-none font-semibold", text)}>KeyCrypt</span>
    </>
  );
  const classes = cn("text-foreground inline-flex items-center", gap, className);

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
