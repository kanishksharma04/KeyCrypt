// In-memory rate limiter — acceptable for v1 single-instance deployment.
// Caveat: resets on server restart and does not synchronize across instances.
// Upgrade to Redis-backed (e.g. Upstash) when horizontal scaling is needed.

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

/**
 * Returns true if the key has exceeded maxRequests within windowMs.
 * Call this before processing any sensitive action.
 */
export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = store.get(key);

  if (!record || record.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count += 1;
  return record.count > maxRequests;
}

/** Convenience wrappers with sensible auth defaults */
export const rateLimiters = {
  /** 5 sign-in attempts per IP per 15 minutes */
  signIn: (ip: string) => isRateLimited(`signin:${ip}`, 5, 15 * 60 * 1000),
  /** 3 sign-up attempts per IP per hour */
  signUp: (ip: string) => isRateLimited(`signup:${ip}`, 3, 60 * 60 * 1000),
  /** 3 password reset requests per email per hour */
  passwordReset: (email: string) => isRateLimited(`reset:${email}`, 3, 60 * 60 * 1000),
};
