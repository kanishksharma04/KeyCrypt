/** An AES-256-GCM encrypted payload stored server-side. Both fields are base64. */
export interface EncryptedPayload {
  /** Base64-encoded AES-256-GCM ciphertext (with 128-bit auth tag appended). */
  ciphertext: string;
  /** Base64-encoded 96-bit (12-byte) initialization vector. Unique per operation. */
  iv: string;
}
