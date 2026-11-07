import { Braces, File, Wifi } from "lucide-react";
import { AuthenticatorIcon, PadlockIcon } from "@/components/shared/design-icons";

// Icon, labels and colours per item type: vault list, view dialog, command
// palette and dashboard. No client-only imports, so server components can use it.
// Tiles are neutral (iconBg); the type shows in the icon colour and, on the
// dashboard, the bar colour.

export const TYPE_META = {
  LOGIN: {
    Icon: PadlockIcon,
    label: "Login",
    plural: "Logins",
    iconBg: "bg-muted",
    iconColor: "text-type-login",
    barColor: "bg-type-login",
  },
  SECURE_NOTE: {
    Icon: File,
    label: "Secure note",
    plural: "Secure notes",
    iconBg: "bg-muted",
    iconColor: "text-type-note",
    barColor: "bg-type-note",
  },
  API_KEY: {
    Icon: Braces,
    label: "API key",
    plural: "API keys",
    iconBg: "bg-muted",
    iconColor: "text-type-api",
    barColor: "bg-type-api",
  },
  WIFI_PASSWORD: {
    Icon: Wifi,
    label: "Wi-Fi password",
    plural: "Wi-Fi passwords",
    iconBg: "bg-muted",
    iconColor: "text-type-wifi",
    barColor: "bg-type-wifi",
  },
  OTP_SECRET: {
    Icon: AuthenticatorIcon,
    label: "Authenticator",
    // Singular on purpose: the dashboard's "Items by type" row reads "Authenticator".
    plural: "Authenticator",
    iconBg: "bg-muted",
    iconColor: "text-type-otp",
    barColor: "bg-type-otp",
  },
} as const;
