/** Encode a Uint8Array to a base64 string. */
export function toBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Decode a base64 string to a Uint8Array<ArrayBuffer>. */
export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode an ArrayBuffer to base64. */
export function bufferToBase64(buffer: ArrayBuffer): string {
  return toBase64(new Uint8Array(buffer));
}

/** Encode a plain string to UTF-8 bytes (always ArrayBuffer-backed). */
export function stringToBytes(s: string): Uint8Array<ArrayBuffer> {
  // new Uint8Array(encodedArray) copies into a plain ArrayBuffer-backed array.
  return new Uint8Array(new TextEncoder().encode(s));
}

/** Decode UTF-8 bytes to a plain string. */
export function bytesToString(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
