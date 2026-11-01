import { generateIv } from "./key-derivation";
import { toBase64, fromBase64, bufferToBase64 } from "./utils";

// Crypto v2: a random vault key, stored wrapped under a key-encryption key (KEK).
//
//   vaultKey   = random AES-256-GCM key (encrypts items)
//   kek        = Argon2id(masterPassword, salt)    (wraps the vault key only; kdf.ts)
//   wrappedKey = AES-GCM(kek, iv, raw vaultKey)
//
// Changing the master password re-wraps the same vault key; items are untouched.

const AES_GCM_256 = { name: "AES-GCM", length: 256 } as const;
const ITEM_USAGES: KeyUsage[] = ["encrypt", "decrypt"];

export interface WrappedVaultKey {
  /** Base64 AES-GCM ciphertext (+ 16-byte tag) of the raw 256-bit vault key. */
  wrappedKey: string;
  /** Base64 12-byte IV. */
  iv: string;
}

/** Thrown when a wrapped vault key cannot be unwrapped (wrong password or damaged data). */
export class VaultKeyUnwrapError extends Error {
  constructor() {
    super("Could not unwrap the vault key.");
    this.name = "VaultKeyUnwrapError";
  }
}

/**
 * Generate a new random vault key. It is EXTRACTABLE so it can be wrapped once;
 * keep only the non-extractable copy returned by unwrapVaultKey() in memory.
 */
export async function generateVaultKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(AES_GCM_256, true, ITEM_USAGES);
}

/** Wrap an (extractable) vault key under a KEK with a fresh random IV. */
export async function wrapVaultKey(vaultKey: CryptoKey, kek: CryptoKey): Promise<WrappedVaultKey> {
  const iv = generateIv();
  const wrapped = await globalThis.crypto.subtle.wrapKey("raw", vaultKey, kek, {
    name: "AES-GCM",
    iv: iv.buffer,
  });
  return { wrappedKey: bufferToBase64(wrapped), iv: toBase64(iv) };
}

/**
 * Unwrap the vault key. By default the result is NON-extractable (the copy to
 * keep in memory). Pass `extractable: true` only for a short-lived copy that
 * must be re-wrapped (master-password change, recovery key).
 *
 * Throws VaultKeyUnwrapError for a wrong KEK (wrong password) or tampered data.
 */
export async function unwrapVaultKey(
  wrapped: WrappedVaultKey,
  kek: CryptoKey,
  { extractable = false }: { extractable?: boolean } = {}
): Promise<CryptoKey> {
  try {
    return await globalThis.crypto.subtle.unwrapKey(
      "raw",
      fromBase64(wrapped.wrappedKey).buffer,
      kek,
      { name: "AES-GCM", iv: fromBase64(wrapped.iv).buffer },
      AES_GCM_256,
      extractable,
      ITEM_USAGES
    );
  } catch {
    throw new VaultKeyUnwrapError();
  }
}
