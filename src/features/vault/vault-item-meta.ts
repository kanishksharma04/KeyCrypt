import { Code2, FileText, KeyRound, Timer, Wifi } from "lucide-react";
import { toast } from "sonner";
import { copySecret, COPIED_TOAST } from "@/lib/clipboard";

// Shared by the vault list, its rows and the view dialog.

// ─── Type metadata ─────────────────────────────────────────────────────────────

export const TYPE_META = {
  LOGIN: {
    Icon: KeyRound,
    label: "Login",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  SECURE_NOTE: {
    Icon: FileText,
    label: "Secure Note",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
  },
  API_KEY: {
    Icon: Code2,
    label: "API Key",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  WIFI_PASSWORD: {
    Icon: Wifi,
    label: "WiFi Password",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
  },
  OTP_SECRET: {
    Icon: Timer,
    label: "Authenticator",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-500",
  },
} as const;

// ─── Relative time helper ─────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

// ─── Clipboard helper ─────────────────────────────────────────────────────────

/** Copy a secret; the clipboard clears after 30 s (src/lib/clipboard.ts). */
export async function copyToClipboard(text: string) {
  try {
    await copySecret(text);
    toast.success(COPIED_TOAST);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}
