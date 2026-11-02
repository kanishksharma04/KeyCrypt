// Breached-password check against Have I Been Pwned's Pwned Passwords API,
// using its k-anonymity range search:
//
//   1. SHA-1 each password here, in the browser.
//   2. Send only the first 5 hex characters of the hash to
//      https://api.pwnedpasswords.com/range/XXXXX (with Add-Padding, so the
//      response size doesn't hint at the result).
//   3. Compare the returned suffixes locally.
//
// The password, and its full hash, never leave the browser. KeyCrypt's server
// is not involved. Opt-in only: the user starts it from vault health.

export const PWNED_PASSWORDS_ORIGIN = "https://api.pwnedpasswords.com";
const RANGE_URL = `${PWNED_PASSWORDS_ORIGIN}/range/`;
const MAX_PARALLEL_REQUESTS = 4;

export class BreachCheckError extends Error {
  constructor(message = "The breached-password check failed.") {
    super(message);
    this.name = "BreachCheckError";
  }
}

/** Uppercase hex SHA-1 of a UTF-8 string (Web Crypto). */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Parse a range response ("SUFFIX:COUNT" lines). Padding rows (count 0) are dropped. */
function parseRange(body: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of body.split(/\r?\n/)) {
    const [suffix, count] = line.trim().split(":");
    const n = Number(count);
    if (suffix && suffix.length === 35 && Number.isInteger(n) && n > 0) {
      counts.set(suffix.toUpperCase(), n);
    }
  }
  return counts;
}

/**
 * For each password, how many times it appears in known breaches (0 = not
 * found). One request per distinct 5-character hash prefix.
 * Throws BreachCheckError if the API can't be reached.
 */
export async function countPasswordBreaches(
  passwords: readonly string[],
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
): Promise<number[]> {
  const hashes = await Promise.all(passwords.map(sha1Hex));
  const queue = [...new Set(hashes.map((h) => h.slice(0, 5)))];
  const ranges = new Map<string, Map<string, number>>();

  async function worker() {
    for (let prefix = queue.shift(); prefix !== undefined; prefix = queue.shift()) {
      let response: Response;
      try {
        response = await fetchImpl(RANGE_URL + prefix, {
          headers: { "Add-Padding": "true" },
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch {
        throw new BreachCheckError("Couldn't reach Have I Been Pwned.");
      }
      if (!response.ok) {
        throw new BreachCheckError(`Have I Been Pwned answered ${response.status}.`);
      }
      ranges.set(prefix, parseRange(await response.text()));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_PARALLEL_REQUESTS, queue.length) }, () => worker())
  );
  return hashes.map((h) => ranges.get(h.slice(0, 5))?.get(h.slice(5)) ?? 0);
}
