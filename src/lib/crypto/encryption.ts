import type { EncryptedPayload } from "./types";
import { generateIv } from "./key-derivation";
import { toBase64, bufferToBase64, fromBase64, stringToBytes, bytesToString } from "./utils";

/**
 * AES-GCM parameters. `additionalData` (AAD) is authenticated but not
 * encrypted: decryption fails unless exactly the same AAD is supplied. v2
 * items use it to bind each ciphertext to its own row (see itemAad()).
 */
function gcmParams(iv: ArrayBuffer, additionalData?: string): AesGcmParams {
  return additionalData === undefined
    ? { name: "AES-GCM", iv, tagLength: 128 }
    : { name: "AES-GCM", iv, tagLength: 128, additionalData: stringToBytes(additionalData).buffer };
}

/**
 * Encrypt any JSON-serializable value with AES-256-GCM.
 *
 * A unique 96-bit IV is generated per call. The GCM authentication tag (128-bit)
 * is appended to the ciphertext by the Web Crypto API, providing tamper detection —
 * any modification to the ciphertext causes decryption to throw.
 */
export async function encryptItem(
  vaultKey: CryptoKey,
  data: unknown,
  additionalData?: string
): Promise<EncryptedPayload> {
  const iv = generateIv();
  const plaintext = stringToBytes(JSON.stringify(data));

  // Pass iv.buffer and plaintext.buffer: the @types/node SubtleCrypto overloads
  // require ArrayBuffer rather than the DOM's broader BufferSource.
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    gcmParams(iv.buffer, additionalData),
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
  payload: EncryptedPayload,
  additionalData?: string
): Promise<T> {
  const ciphertextBytes = fromBase64(payload.ciphertext);
  const ivBytes = fromBase64(payload.iv);

  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    gcmParams(ivBytes.buffer, additionalData),
    vaultKey,
    ciphertextBytes.buffer
  );

  return JSON.parse(bytesToString(decryptedBuffer)) as T;
}
