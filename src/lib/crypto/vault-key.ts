/**
 * In-memory vault key store.
 *
 * The vault key (a non-extractable CryptoKey) lives here while the vault is unlocked.
 * On lock, the reference is set to null so the runtime can GC the key handle.
 *
 * Limitation: Web Crypto CryptoKey objects are managed by the browser's secure
 * allocator. We cannot guarantee immediate memory zeroing on clear — only that our
 * reference is released. For threat models requiring guaranteed zeroing, a WASM
 * Argon2id + native array approach would be needed.
 *
 * This module MUST only execute in the browser (it references a browser-scoped var).
 */

let _vaultKey: CryptoKey | null = null;

/** Store the derived vault key in memory. Call after successful unlock. */
export function setVaultKey(key: CryptoKey): void {
  _vaultKey = key;
}

/**
 * Retrieve the vault key, or null if the vault is locked.
 * The key is non-extractable — it can only be passed to encrypt/decrypt.
 */
export function getVaultKey(): CryptoKey | null {
  return _vaultKey;
}

/**
 * Lock the vault by clearing the in-memory key reference.
 * After this call, getVaultKey() returns null and any pending decrypt
 * operations will fail with "key not available".
 */
export function clearVaultKey(): void {
  _vaultKey = null;
}

/** Returns true if a vault key is currently held in memory. */
export function isVaultUnlocked(): boolean {
  return _vaultKey !== null;
}
