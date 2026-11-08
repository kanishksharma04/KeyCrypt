// Shared class strings and constants for the landing page sections.

export const REPO = "https://github.com/kanishksharma04/KeyCrypt";

export const WRAP = "mx-auto w-full max-w-[1240px] px-5 sm:px-8";
export const MONO = "font-plex text-[11px] tracking-[0.08em] uppercase";
/** Fraunces with its softer, quirkier letterforms for display sizes. */
export const DISPLAY = "font-serif [font-variation-settings:'SOFT'_60,'WONK'_1]";
export const INK_BUTTON =
  "bg-foreground text-background hover:bg-brand-deep inline-flex items-center gap-3 px-6 py-4 text-[15px] font-semibold transition-colors";
export const OUTLINE_BUTTON =
  "border-foreground hover:bg-foreground hover:text-background border px-4 py-2 text-sm font-semibold transition-colors";

// Subtle paper grain (an SVG noise tile; CSP allows data: images).
export const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.11 0 0 0 0 0.1 0 0 0 0 0.09 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Where the main calls to action point, depending on whether a session exists. */
export type Cta = { href: string; label: string };
