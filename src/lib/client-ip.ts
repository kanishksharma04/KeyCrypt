/**
 * Resolve the client IP from proxy headers, preferring headers a client cannot forge.
 *
 * Default order:
 *   1. x-vercel-forwarded-for: set by Vercel's edge; client-supplied values are overwritten
 *   2. x-real-ip: set by the reverse proxy (e.g. nginx) in front of the app
 *   3. x-forwarded-for, RIGHTMOST entry: the address the nearest proxy appended.
 *      The leftmost entries are whatever the client sent and can be spoofed.
 *   4. "unknown"
 *
 * Set TRUSTED_IP_HEADER (e.g. "cf-connecting-ip") to trust exactly one header
 * instead. When it is set, no other header is consulted.
 *
 * Accepts a plain Headers object so it works with both `await headers()` from
 * next/headers and the Request that Auth.js passes to authorize().
 */
export function getClientIp(headers: Headers): string {
  const override = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (override) return readHeader(headers, override) ?? "unknown";

  return (
    readHeader(headers, "x-vercel-forwarded-for") ??
    readHeader(headers, "x-real-ip") ??
    readHeader(headers, "x-forwarded-for") ??
    "unknown"
  );
}

function readHeader(headers: Headers, name: string): string | undefined {
  const raw = headers.get(name);
  if (!raw) return undefined;

  const entries = raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  // x-forwarded-for grows left to right as it passes through proxies; only the
  // rightmost hop was written by infrastructure we control.
  const value = name === "x-forwarded-for" ? entries.at(-1) : entries[0];
  return value || undefined;
}
