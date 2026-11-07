import type { SVGProps } from "react";

// Line icons drawn exactly as in "KeyCrypt UI Design.html" where Lucide has no
// close match. 24×24, stroke-based, coloured with `currentColor`.

type IconProps = SVGProps<SVGSVGElement>;

function DesignIcon({ children, strokeWidth = 1.6, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The KeyCrypt padlock: the logo mark, the unlock tile and "Login" items. */
export function PadlockIcon(props: IconProps) {
  return (
    <DesignIcon {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </DesignIcon>
  );
}

/** A key lying flat: the hero, "256-bit vault key" and master-password activity. */
export function FlatKeyIcon(props: IconProps) {
  return (
    <DesignIcon {...props}>
      <circle cx="7" cy="12" r="3.2" />
      <path d="M10 12h10M16 12v3M19 12v3" />
    </DesignIcon>
  );
}

/** AES-256-GCM in the "How it works" pipeline. */
export function CipherChipIcon(props: IconProps) {
  return (
    <DesignIcon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M9 9h6v6H9z" />
    </DesignIcon>
  );
}

/** "Ciphertext", the last pipeline step. */
export function CiphertextIcon(props: IconProps) {
  return (
    <DesignIcon {...props}>
      <path d="M7 7h10v10H7z" />
      <path d="M10 10h4v4h-4z" />
    </DesignIcon>
  );
}

/** Authenticator (TOTP) items. */
export function AuthenticatorIcon(props: IconProps) {
  return (
    <DesignIcon {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </DesignIcon>
  );
}
