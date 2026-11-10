import { createHash, timingSafeEqual } from "node:crypto";

// Authorises scheduled jobs (src/app/api/cron/*). Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set on the project.
// Fails closed: without a configured secret every request is refused.

const MIN_SECRET_LENGTH = 16;

/**
 * True when `authorization` is exactly `Bearer <secret>`. Compares SHA-256
 * digests with timingSafeEqual, so the time taken doesn't depend on how much of
 * the secret matched or on its length.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const actual = createHash("sha256")
    .update(authorization ?? "")
    .digest();
  return timingSafeEqual(expected, actual);
}
