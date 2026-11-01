import { stringToBytes } from "./utils";

// Recovery kit (crypto v2).
//
// A random 128-bit recovery key, shown to the user once as grouped base32
// (RFC 4648, e.g. "ABCD-EFGH-…"). A second key-encryption key is derived from
// it with HKDF-SHA-256 and wraps the SAME vault key as the master-password KEK,
// so the vault can be unlocked (and a new master password set) with it alone.
// The recovery key is high-entropy, so a fast KDF (HKDF) is appropriate.

export const RECOVERY_KEY_BYTES = 16;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const GROUP = 4;
/** 128 bits → 26 base32 characters. */
const RECOVERY_KEY_CHARS = Math.ceil((RECOVERY_KEY_BYTES * 8) / 5);

/** Thrown when typed recovery-key text is not a well-formed recovery key. */
export class RecoveryKeyFormatError extends Error {
  constructor() {
    super("That doesn't look like a recovery key.");
    this.name = "RecoveryKeyFormatError";
  }
}

function toBase32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor((text.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let i = 0;
  for (const ch of text) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new RecoveryKeyFormatError();
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bytes[i++] = (buffer >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  // The final character's spare bits must be zero for a canonical encoding.
  if ((buffer & ((1 << bits) - 1)) !== 0) throw new RecoveryKeyFormatError();
  return bytes;
}

/** Group as XXXX-XXXX-…-XX for display. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  const chars = toBase32(bytes);
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += GROUP) groups.push(chars.slice(i, i + GROUP));
  return groups.join("-");
}

/** A new random recovery key: raw bytes plus the text to show the user. */
export function generateRecoveryKey(): { bytes: Uint8Array<ArrayBuffer>; text: string } {
  const bytes = new Uint8Array(RECOVERY_KEY_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return { bytes, text: formatRecoveryKey(bytes) };
}

/**
 * Parse recovery-key text as typed or pasted: case, spaces and dashes are
 * ignored. Throws RecoveryKeyFormatError for anything else.
 */
export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s-]/g, "");
  if (clean.length !== RECOVERY_KEY_CHARS) throw new RecoveryKeyFormatError();
  return fromBase32(clean);
}

/**
 * HKDF-SHA-256 key-encryption key from the recovery key, bound to the user id
 * (a recovery key only ever opens its own user's vault). Non-extractable,
 * wrapKey/unwrapKey only.
 */
export async function deriveRecoveryKek(
  recoveryKey: Uint8Array<ArrayBuffer>,
  userId: string
): Promise<CryptoKey> {
  if (recoveryKey.byteLength !== RECOVERY_KEY_BYTES) throw new RecoveryKeyFormatError();
  const base = await globalThis.crypto.subtle.importKey("raw", recoveryKey, "HKDF", false, [
    "deriveKey",
  ]);
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: stringToBytes("keycrypt:recovery:v1").buffer,
      info: stringToBytes(`keycrypt:recovery-kek:v1|${userId}`).buffer,
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}
