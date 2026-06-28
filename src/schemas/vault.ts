import { z } from "zod";

const masterPasswordRules = z
  .string()
  .min(12, "At least 12 characters")
  .max(128, "Maximum 128 characters")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[0-9]/, "Must include a number")
  .regex(/[^a-zA-Z0-9]/, "Must include a special character");

export const masterPasswordSchema = z
  .object({
    masterPassword: masterPasswordRules,
    confirmPassword: z.string(),
  })
  .refine((d) => d.masterPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Unlock only validates presence — correctness is determined by crypto verification.
export const unlockSchema = z.object({
  masterPassword: z.string().min(1, "Required"),
});

export const changeMasterPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: masterPasswordRules,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangeMasterPasswordInput = z.infer<typeof changeMasterPasswordSchema>;

export type MasterPasswordInput = z.infer<typeof masterPasswordSchema>;
export type UnlockInput = z.infer<typeof unlockSchema>;

// ─── Vault item schemas ────────────────────────────────────────────────────────

export const loginItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Max 100 characters"),
  username: z.string().max(256, "Max 256 characters"),
  password: z.string().max(4096, "Max 4096 characters"),
  url: z.string().max(2048, "Max 2048 characters"),
  notes: z.string().max(10_000, "Max 10,000 characters"),
});
export type LoginItemInput = z.infer<typeof loginItemSchema>;

export const secureNoteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Max 100 characters"),
  content: z.string().max(100_000, "Max 100,000 characters"),
});
export type SecureNoteInput = z.infer<typeof secureNoteSchema>;

export const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Max 100 characters"),
  key: z.string().max(8192, "Max 8,192 characters"),
  description: z.string().max(2048, "Max 2,048 characters"),
  notes: z.string().max(10_000, "Max 10,000 characters"),
});
export type ApiKeyInput = z.infer<typeof apiKeySchema>;

export const WIFI_SECURITY_TYPES = ["WPA2", "WPA3", "WEP", "Open"] as const;
export type WifiSecurityType = (typeof WIFI_SECURITY_TYPES)[number];

export const wifiPasswordSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Max 100 characters"),
  ssid: z.string().max(64, "Max 64 characters"),
  password: z.string().max(64, "Max 64 characters"),
  securityType: z.enum(WIFI_SECURITY_TYPES),
  notes: z.string().max(10_000, "Max 10,000 characters"),
});
export type WifiPasswordInput = z.infer<typeof wifiPasswordSchema>;
