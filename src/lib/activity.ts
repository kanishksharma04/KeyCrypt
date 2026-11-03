// Display helpers for Settings → Recent activity (pure; no I/O).

const LABELS: Record<string, string> = {
  "auth.signin": "Signed in",
  "auth.signup": "Account created",
  "auth.signup.oauth": "Account created",
  "auth.reauth": "Confirmed account password",
  "auth.reauth.failed": "Wrong account password entered",
  "auth.sessions.revoked_all": "Signed out of all devices",
  "auth.totp.enabled": "Two-factor sign-in turned on",
  "auth.totp.disabled": "Two-factor sign-in turned off",
  "auth.totp.backup_code_used": "Signed in with a backup code",
  "vault.setup": "Vault created",
  "vault.upgraded": "Vault encryption upgraded",
  "vault.master_password.changed": "Master password changed",
  "vault.item.create": "Item created",
  "vault.item.delete": "Item deleted",
  "vault.items.imported": "Items imported",
  "vault.export": "Vault exported",
  "vault.recovery.created": "Recovery key created",
  "vault.recovery.used": "Recovery key used",
};

const ITEM_TYPES: Record<string, string> = {
  LOGIN: "login",
  SECURE_NOTE: "secure note",
  API_KEY: "API key",
  WIFI_PASSWORD: "WiFi password",
  OTP_SECRET: "authenticator",
};

const EXPORT_FORMATS: Record<string, string> = {
  "encrypted-json": "encrypted file",
  csv: "unencrypted CSV",
};

/** A human-readable label for an audit action (with safe metadata details). */
export function activityLabel(action: string, metadata?: unknown): string {
  const base = LABELS[action] ?? action;
  const m = (metadata ?? {}) as Record<string, unknown>;
  if (action === "vault.item.create" && typeof m.type === "string" && ITEM_TYPES[m.type]) {
    return `${base} (${ITEM_TYPES[m.type]})`;
  }
  if (action === "vault.items.imported" && typeof m.count === "number") {
    return `${base} (${m.count})`;
  }
  if (action === "vault.export" && typeof m.format === "string" && EXPORT_FORMATS[m.format]) {
    return `${base} (${EXPORT_FORMATS[m.format]})`;
  }
  return base;
}

/** "Chrome on macOS" from a user-agent string; null if there is none. */
export function describeBrowser(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;

  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua) && /Version\//.test(ua)
            ? "Safari"
            : null;

  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown browser";
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
