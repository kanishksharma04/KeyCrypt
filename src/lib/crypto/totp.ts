import { Secret, TOTP } from "otpauth";
import { encryptItem, decryptItem } from "./encryption";
import { fromBase64 } from "./utils";

// Two-factor sign-in (TOTP, RFC 6238) for the ACCOUNT, not the vault.
//
// - Secrets are 160-bit, base32, SHA-1 / 6 digits / 30 s (what authenticator
//   apps expect). Codes are accepted one step either side of "now".
// - On the server the secret is stored encrypted with AES-256-GCM under
//   TOTP_ENCRYPTION_KEY, with AAD binding it to its user.
// - Backup codes are random one-time codes; the server stores Argon2 hashes.

export const TOTP_ISSUER = "KeyCrypt";
const PERIOD = 30;
const DIGITS = 6;

function totpFor(secretBase32: string, label = "account"): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** A new random 160-bit TOTP secret (base32). */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** otpauth:// URI for authenticator apps (encoded in the QR code). */
export function totpProvisioningUri(secretBase32: string, accountLabel: string): string {
  return totpFor(secretBase32, accountLabel).toString();
}

/** Current code for a secret (tests, and showing the user what to expect). */
export function generateTotpCode(secretBase32: string, timestamp = Date.now()): string {
  return totpFor(secretBase32).generate({ timestamp });
}

/** True if `code` (6 digits, spaces ignored) is valid now, ±1 step. */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  timestamp = Date.now()
): boolean {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  return totpFor(secretBase32).validate({ token, timestamp, window: 1 }) !== null;
}

// ─── Backup codes ────────────────────────────────────────────────────────────

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** `count` random one-time codes like "K7Q2M-XW4PZ" (50 bits each). */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = new Uint8Array(10);
    globalThis.crypto.getRandomValues(bytes);
    // 256 is a multiple of 32, so `& 31` is unbiased.
    const chars = Array.from(bytes, (b) => BASE32[b & 31]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Canonical form for hashing/comparing: upper case, no separators. */
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

// ─── Server-side encryption of the TOTP secret ───────────────────────────────

/** Thrown when TOTP_ENCRYPTION_KEY is not a base64 32-byte key. */
export class TotpKeyError extends Error {
  constructor() {
    super("TOTP_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
    this.name = "TotpKeyError";
  }
}

async function importTotpKey(keyBase64: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64(keyBase64);
  } catch {
    throw new TotpKeyError();
  }
  if (raw.byteLength !== 32) throw new TotpKeyError();
  return globalThis.crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

const totpAad = (userId: string) => `kc:totp:v1|${userId}`;

/** Encrypt a TOTP secret for storage: "<iv>.<ciphertext>" (base64). */
export async function encryptTotpSecret(
  secretBase32: string,
  keyBase64: string,
  userId: string
): Promise<string> {
  const key = await importTotpKey(keyBase64);
  const { ciphertext, iv } = await encryptItem(key, secretBase32, totpAad(userId));
  return `${iv}.${ciphertext}`;
}

/** Decrypt a stored TOTP secret. Throws if the key, user or data don't match. */
export async function decryptTotpSecret(
  stored: string,
  keyBase64: string,
  userId: string
): Promise<string> {
  const [iv, ciphertext, ...rest] = stored.split(".");
  if (!iv || !ciphertext || rest.length > 0) throw new Error("Malformed TOTP secret");
  const key = await importTotpKey(keyBase64);
  return decryptItem<string>(key, { iv, ciphertext }, totpAad(userId));
}
