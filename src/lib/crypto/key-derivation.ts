import { stringToBytes } from "./utils";

/**
 * PBKDF2-SHA-256 iteration count.
 *
 * Tradeoff note: OWASP (2024) recommends ≥600,000 iterations for PBKDF2-SHA-256.
 * The Web Crypto API has no native Argon2id support. A WASM Argon2id implementation
 * could be integrated in a future hardening pass, but PBKDF2 at 600 k iterations
 * provides strong resistance within a password manager's acceptable unlock latency
 * (~300 ms on a modern laptop). Auth passwords are separately protected by Argon2id.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Salt length in bytes (128-bit). */
export const SALT_LENGTH = 16;

/** IV length in bytes (96-bit — the AES-GCM standard nonce size). */
export const IV_LENGTH = 12;

/**
 * Generate a cryptographically random salt.
 * Uses crypto.getRandomValues — never Math.random.
 */
export function generateSalt(): Uint8Array<ArrayBuffer> {
  const salt = new Uint8Array(SALT_LENGTH);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate a cryptographically random AES-GCM IV.
 * A fresh IV MUST be generated for every encryption operation.
 */
export function generateIv(): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);
  return iv;
}

/**
 * Derive a 256-bit AES-GCM vault key from the master password and salt.
 *
 * The returned CryptoKey is:
 *   - non-extractable: raw bytes cannot be read out of the JS engine
 *   - usable only for encrypt and decrypt operations
 *
 * @param masterPassword  The user's master password (never sent to the server)
 * @param salt            The per-user random salt (stored server-side; not secret)
 * @param iterations      PBKDF2 iteration count (override in tests for speed)
 */
export async function deriveVaultKey(
  masterPassword: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  // Step 1: import the master password as raw key material for PBKDF2
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    stringToBytes(masterPassword),
    "PBKDF2",
    false, // non-extractable
    ["deriveKey"]
  );

  // Step 2: derive the AES-256-GCM vault key — also non-extractable
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: raw key bytes can never be accessed from JS
    ["encrypt", "decrypt"]
  );
}
