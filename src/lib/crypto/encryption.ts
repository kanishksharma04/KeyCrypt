import type { EncryptedPayload } from "./types";
import { generateIv } from "./key-derivation";
import { toBase64, bufferToBase64, fromBase64, stringToBytes, bytesToString } from "./utils";

/**
 * Encrypt any JSON-serializable value with AES-256-GCM.
 *
 * A unique 96-bit IV is generated per call. The GCM authentication tag (128-bit)
 * is appended to the ciphertext by the Web Crypto API, providing tamper detection —
 * any modification to the ciphertext causes decryption to throw.
 */
export async function encryptItem(vaultKey: CryptoKey, data: unknown): Promise<EncryptedPayload> {
  const iv = generateIv();
  const plaintext = stringToBytes(JSON.stringify(data));

  // Pass iv.buffer and plaintext.buffer: the @types/node SubtleCrypto overloads
  // require ArrayBuffer rather than the DOM's broader BufferSource.
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer, tagLength: 128 },
    vaultKey,
    plaintext.buffer
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: toBase64(iv), // iv is already Uint8Array<ArrayBuffer>
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 *
 * Throws `DOMException (OperationError)` if the ciphertext has been tampered with
 * (authentication tag mismatch) or if the wrong key is used.
 * Treat any error as "bad key or corrupted data" — do not propagate the raw error.
 */
export async function decryptItem<T = unknown>(
  vaultKey: CryptoKey,
  payload: EncryptedPayload
): Promise<T> {
  const ciphertextBytes = fromBase64(payload.ciphertext);
  const ivBytes = fromBase64(payload.iv);

  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes.buffer, tagLength: 128 },
    vaultKey,
    ciphertextBytes.buffer
  );

  return JSON.parse(bytesToString(decryptedBuffer)) as T;
}
