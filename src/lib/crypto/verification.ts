import type { EncryptedPayload } from "./types";
import { encryptItem, decryptItem } from "./encryption";

/**
 * Known plaintext used as the verification blob.
 * Its content doesn't matter — only that encrypting and decrypting it
 * with the correct vault key succeeds.
 */
const VERIFICATION_PLAINTEXT = "keycrypt:vault-key-valid:v1";

/**
 * Create an encrypted verification blob from a newly derived vault key.
 * Store the returned payload (ciphertext + iv) in VaultMeta server-side.
 *
 * This lets the client confirm the master password is correct without
 * ever comparing the password or key server-side.
 */
export async function createVerificationBlob(vaultKey: CryptoKey): Promise<EncryptedPayload> {
  return encryptItem(vaultKey, VERIFICATION_PLAINTEXT);
}

/**
 * Verify a vault key against a previously stored verification blob.
 *
 * Returns true if the key decrypts the blob to the expected plaintext.
 * Returns false if decryption fails (wrong key) or the plaintext doesn't match.
 * Never throws — a decryption failure is treated as "wrong master password".
 */
export async function verifyVaultKey(
  vaultKey: CryptoKey,
  blob: EncryptedPayload
): Promise<boolean> {
  try {
    const decrypted = await decryptItem<string>(vaultKey, blob);
    return decrypted === VERIFICATION_PLAINTEXT;
  } catch {
    // AES-GCM auth tag failure (wrong key or tampered blob)
    return false;
  }
}
