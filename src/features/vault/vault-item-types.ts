import { Code2, FileText, KeyRound, Timer, Wifi } from "lucide-react";

// Icon, labels and colours per item type: vault list, view dialog, command
// palette and dashboard. No client-only imports, so server components can use it.

export const TYPE_META = {
  LOGIN: {
    Icon: KeyRound,
    label: "Login",
    plural: "Logins",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  SECURE_NOTE: {
    Icon: FileText,
    label: "Secure Note",
    plural: "Secure Notes",
    iconBg: "bg-green-500/10",
    iconColor: "text-green-500",
  },
  API_KEY: {
    Icon: Code2,
    label: "API Key",
    plural: "API Keys",
    iconBg: "bg-purple-500/10",
    iconColor: "text-purple-500",
  },
  WIFI_PASSWORD: {
    Icon: Wifi,
    label: "WiFi Password",
    plural: "WiFi Passwords",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
  },
  OTP_SECRET: {
    Icon: Timer,
    label: "Authenticator",
    plural: "Authenticators",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-500",
  },
} as const;
