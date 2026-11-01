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

/**
 * Item ids: server-generated cuids ("c" + 24 lowercase alphanumerics) for older
 * rows, or UUID v4 generated in the browser (crypto v2 binds the id into the
 * item's AAD, so it must exist before encryption).
 */
export const idSchema = z
  .string()
  .regex(/^(c[a-z0-9]{24}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/);

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
  id: idSchema,
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

/** A 256-bit vault key wrapped with AES-GCM: 32 bytes + 16-byte tag = 64 base64 chars. */
export const wrappedVaultKeySchema = base64({ length: 64 });

/**
 * KDF for the v2 key-encryption key. New writes must use Argon2id; the bounds
 * match KDF_LIMITS in src/lib/crypto/kdf.ts, which the browser re-checks.
 */
const kdfFields = {
  kdf: z.literal("argon2id"),
  kdfParams: z
    .object({
      memoryKiB: z.number().int().min(8_192).max(1_048_576),
      iterations: z.number().int().min(1).max(10),
      parallelism: z.number().int().min(1).max(4),
      hashLength: z.literal(32),
    })
    .strict(),
};

/** New vaults are crypto v2: a random vault key wrapped under the master-password KEK. */
export const setupVaultInput = z.object({
  ...kdfFields,
  salt: saltSchema,
  wrappedVaultKey: wrappedVaultKeySchema,
  wrapIv: ivSchema,
  verificationBlob: verificationBlobSchema,
  verificationIv: ivSchema,
});

export const MAX_ITEMS_PER_REKEY = 5_000;

/** One-time v1 → v2 upgrade: every item re-encrypted under the new random vault key. */
export const upgradeVaultInput = z.object({
  // The v1 verifier the client read and unlocked against.
  currentVerificationBlob: verificationBlobSchema,
  currentVerificationIv: ivSchema,
  ...kdfFields,
  newSalt: saltSchema,
  wrappedVaultKey: wrappedVaultKeySchema,
  wrapIv: ivSchema,
  newVerificationBlob: verificationBlobSchema,
  newVerificationIv: ivSchema,
  items: z
    .array(z.object({ id: idSchema, ciphertext: ciphertextSchema, iv: ivSchema }))
    .max(MAX_ITEMS_PER_REKEY),
});

/** v2 master-password change: re-wrap the same vault key; items are untouched. */
export const changeMasterPasswordInput = z.object({
  // The wrapped key the client read and unwrapped with the current password.
  currentWrappedVaultKey: wrappedVaultKeySchema,
  currentWrapIv: ivSchema,
  ...kdfFields,
  newSalt: saltSchema,
  newWrappedVaultKey: wrappedVaultKeySchema,
  newWrapIv: ivSchema,
});

export const recordVaultExportInput = z.object({
  format: z.enum(["encrypted-json", "csv"]),
});

export const confirmAccountPasswordInput = z.object({
  password: z.string().min(1).max(256),
});

export const verifyEmailInput = z.object({
  email: z.string().email().max(254),
  token: tokenSchema,
});
