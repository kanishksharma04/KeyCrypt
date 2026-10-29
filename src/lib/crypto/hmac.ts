import { stringToBytes } from "./utils";

// HMAC-SHA-256 for server-issued, tamper-evident values (e.g. the re-auth
// cookie in src/lib/reauth.ts). Uses Web Crypto, so it runs in Node and the browser.

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    stringToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, // non-extractable
    ["sign", "verify"]
  );
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(s.length / 4) * 4, "=");
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** HMAC-SHA-256 of `message` under `secret`, as unpadded base64url. */
export async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, stringToBytes(message));
  return toBase64Url(sig);
}

/**
 * Constant-time check that `signature` is the HMAC-SHA-256 of `message` under
 * `secret`. Returns false (never throws) for malformed signatures.
 */
export async function hmacVerify(
  secret: string,
  message: string,
  signature: string
): Promise<boolean> {
  const sigBytes = fromBase64Url(signature);
  if (!sigBytes || sigBytes.byteLength !== 32) return false;
  const key = await importHmacKey(secret);
  return globalThis.crypto.subtle.verify("HMAC", key, sigBytes, stringToBytes(message));
}
