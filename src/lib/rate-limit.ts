import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiting with a shared store.
//
// When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, counts live in
// Upstash Redis (sliding window), shared by every serverless instance. Otherwise
// counts live in this process's memory (fixed window): fine for local work and a
// single long-running server, but on serverless each instance has its own counts,
// so a warning is logged once in production.

const KEY_PREFIX = "keycrypt:ratelimit";

// ─── In-memory fallback ──────────────────────────────────────────────────────

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

function isRateLimitedInMemory(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || record.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  record.count += 1;
  return record.count > maxRequests;
}

// ─── Upstash ─────────────────────────────────────────────────────────────────

let redis: Redis | null | undefined; // undefined = not resolved yet
let warnedAboutFallback = false;
const upstashLimiters = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;

  if (!redis && process.env.NODE_ENV === "production" && !warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set; using an " +
        "in-memory store. Limits are per instance and reset on restart."
    );
  }
  return redis;
}

function getUpstashLimiter(client: Redis, maxRequests: number, windowMs: number): Ratelimit {
  const id = `${maxRequests}:${windowMs}`;
  let limiter = upstashLimiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      prefix: KEY_PREFIX,
    });
    upstashLimiters.set(id, limiter);
  }
  return limiter;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolves to true if `key` has exceeded `maxRequests` within `windowMs`.
 * Call (and await) this before processing any sensitive action.
 */
export async function isRateLimited(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return false;

  const client = getRedis();
  if (!client) return isRateLimitedInMemory(key, maxRequests, windowMs);

  try {
    const { success } = await getUpstashLimiter(client, maxRequests, windowMs).limit(key);
    return !success;
  } catch (err) {
    // Redis unreachable: degrade to per-instance limiting rather than none.
    console.error("[rate-limit] Upstash request failed; using in-memory fallback", err);
    return isRateLimitedInMemory(key, maxRequests, windowMs);
  }
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Convenience wrappers with sensible auth defaults */
export const rateLimiters = {
  /** 5 sign-in attempts per IP per 15 minutes */
  signIn: (ip: string) => isRateLimited(`signin:${ip}`, 5, 15 * MINUTE),
  /** 10 sign-in attempts per account email per hour (across all IPs) */
  signInEmail: (email: string) =>
    isRateLimited(`signin-email:${email.trim().toLowerCase()}`, 10, HOUR),
  /** 3 sign-up attempts per IP per hour */
  signUp: (ip: string) => isRateLimited(`signup:${ip}`, 3, HOUR),
  /** 3 password reset requests per email per hour */
  passwordReset: (email: string) => isRateLimited(`reset:${email}`, 3, HOUR),
};

/** Test-only: forget cached clients, limiters, counts and the warning flag. */
export function resetRateLimitStateForTests(): void {
  redis = undefined;
  warnedAboutFallback = false;
  upstashLimiters.clear();
  memoryStore.clear();
}
