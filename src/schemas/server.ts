import { z } from "zod";
import { VaultItemType } from "@prisma/client";

// Input schemas for server actions (src/server/*). Every exported action
// safeParses its input with one of these before doing anything else and
// returns { error: "Invalid input" } on failure, never echoing the input.
//
// The server only ever sees ciphertext, so these check shape and size, not content.

export const INVALID_INPUT = "Invalid input" as const;

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Standard base64 (RFC 4648 §4) with padding, as produced by btoa(). */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const base64 = (opts: { min?: number; max?: number; length?: number }) => {
  let s = z.string();
  if (opts.length !== undefined) s = s.length(opts.length);
  if (opts.min !== undefined) s = s.min(opts.min);
  if (opts.max !== undefined) s = s.max(opts.max);
  return s.regex(BASE64_RE);
};

/** Prisma @default(cuid()) ids: "c" + 24 lowercase alphanumerics. */
export const idSchema = z.string().regex(/^c[a-z0-9]{24}$/);

export const itemTypeSchema = z.nativeEnum(VaultItemType);

/** Plain-text item label (visible to the server). */
export const itemNameSchema = z.string().trim().min(1).max(100);

/** AES-256-GCM ciphertext (+ 16-byte tag), base64. */
export const ciphertextSchema = base64({ min: 4, max: 200_000 });

/** 96-bit AES-GCM IV: 12 bytes → exactly 16 base64 characters. */
export const ivSchema = base64({ length: 16 });

/** 128-bit PBKDF2 salt: 16 bytes → exactly 24 base64 characters. */
export const saltSchema = base64({ length: 24 });

/** Encrypted known-plaintext verification blob. */
export const verificationBlobSchema = base64({ min: 4, max: 512 });

/** Email-verification / password-reset token: randomBytes(32) as hex. */
export const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

// ─── Action inputs ───────────────────────────────────────────────────────────

export const createVaultItemInput = z.object({
  type: itemTypeSchema,
  name: itemNameSchema,
  ciphertext: ciphertextSchema,
  iv: ivSchema,
});

export const updateVaultItemInput = z.object({
  id: idSchema,
  name: itemNameSchema,
  ciphertext: ciphertextSchema,
  iv: ivSchema,
});

export const itemIdInput = z.object({ id: idSchema });

export const toggleFavoriteInput = z.object({ id: idSchema, favorite: z.boolean() });

export const setupVaultInput = z.object({
  salt: saltSchema,
  verificationBlob: verificationBlobSchema,
  verificationIv: ivSchema,
});

export const MAX_ITEMS_PER_MASTER_PASSWORD_CHANGE = 5_000;

export const changeMasterPasswordInput = z.object({
  // The verifier the client read and checked the current master password against.
  currentVerificationBlob: verificationBlobSchema,
  currentVerificationIv: ivSchema,
  newSalt: saltSchema,
  newVerificationBlob: verificationBlobSchema,
  newVerificationIv: ivSchema,
  items: z
    .array(z.object({ id: idSchema, ciphertext: ciphertextSchema, iv: ivSchema }))
    .max(MAX_ITEMS_PER_MASTER_PASSWORD_CHANGE),
});

export const confirmAccountPasswordInput = z.object({
  password: z.string().min(1).max(256),
});

export const verifyEmailInput = z.object({
  email: z.string().email().max(254),
  token: tokenSchema,
});
