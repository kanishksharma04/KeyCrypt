/**
 * KeyCrypt logo mark — SVG implementation of the brand identity.
 *
 * The mark is a geometric K where:
 *  - Left vertical stroke contains a classic keyhole cutout
 *  - Two diagonal arms form sharp right-triangles off the stroke's right edge
 *
 * Supports three modes:
 *  - "mono"   — single fill colour (use CSS `fill` or `currentColor`)
 *  - "duo"    — two-tone: white bar, blue arms (works on dark or coloured bg)
 *  - "invert" — two-tone: dark bar, blue arms (works on light bg)
 */

import { cn } from "@/lib/utils";

// Brand blue extracted from the provided logo assets
const BRAND_BLUE = "#2563EB";

type LogoVariant = "mono" | "duo" | "invert";

interface KeyCryptMarkProps {
  /** Size in px — applied to width; height scales proportionally (0.70 ratio) */
  size?: number;
  variant?: LogoVariant;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

/**
 * The raw K-with-keyhole SVG mark.
 */
export function KeyCryptMark({
  size = 32,
  variant = "duo",
  className,
  "aria-hidden": ariaHidden = true,
}: KeyCryptMarkProps) {
  // viewBox: 0 0 70 100  (width=70, height=100)
  // Left vertical bar: x=[0,24], y=[0,100]
  // Upper arm (triangle): (24,0)–(70,0)–(24,50)
  // Lower arm (triangle): (24,50)–(70,100)–(24,100)
  // Keyhole circle: cx=12, cy=25, r=8.5
  // Keyhole tail:   polygon (8,25)–(16,25)–(14.5,44)–(9.5,44)

  const barFill = variant === "mono" ? "currentColor" : variant === "duo" ? "white" : "#111111";

  const armFill = variant === "mono" ? "currentColor" : BRAND_BLUE;

  // Height proportional to width (viewBox is 70×100 → ratio 1.4286)
  const height = Math.round((size / 70) * 100);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 70 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* Left vertical bar with keyhole cut out via evenodd fill rule */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={barFill}
        d={[
          // Outer rectangle (bar)
          "M 0 0 H 24 V 100 H 0 Z",
          // Keyhole circle (drawn opposite winding → becomes a hole)
          "M 20.5 25 A 8.5 8.5 0 1 0 3.5 25 A 8.5 8.5 0 1 0 20.5 25 Z",
          // Keyhole tail
          "M 8 25 L 16 25 L 14.5 44 L 9.5 44 Z",
        ].join(" ")}
      />

      {/* Upper K arm */}
      <polygon points="24,0 70,0 24,50" fill={armFill} />

      {/* Lower K arm */}
      <polygon points="24,50 70,100 24,100" fill={armFill} />
    </svg>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────────────────────

interface KeyCryptWordmarkProps {
  /** Height of the mark in px; text scales to match */
  height?: number;
  variant?: LogoVariant;
  className?: string;
}

/**
 * Full wordmark: K mark + "Key<span blue>Crypt</span>" text.
 *
 * Used on the landing page and any full-width branding context.
 */
export function KeyCryptWordmark({
  height = 36,
  variant = "duo",
  className,
}: KeyCryptWordmarkProps) {
  const markWidth = Math.round((height / 100) * 70);
  const textColor = variant === "invert" ? "#111111" : "white";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <KeyCryptMark size={markWidth} variant={variant} />
      <span
        style={{
          fontSize: height * 0.48,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        <span style={{ color: textColor }}>Key</span>
        <span style={{ color: BRAND_BLUE }}>Crypt</span>
      </span>
    </span>
  );
}

// ─── App-icon wrapper ─────────────────────────────────────────────────────────

interface KeyCryptIconProps {
  /** Overall box size in px (the rounded square container) */
  size?: number;
  className?: string;
}

/**
 * The K mark inside the rounded-square app-icon container.
 * Matches the style from the provided app-icon images.
 */
export function KeyCryptIcon({ size = 32, className }: KeyCryptIconProps) {
  const markSize = Math.round(size * 0.68);

  return (
    <div
      className={cn("bg-primary flex shrink-0 items-center justify-center rounded-xl", className)}
      style={{ width: size, height: size }}
    >
      <KeyCryptMark size={markSize} variant="duo" />
    </div>
  );
}
