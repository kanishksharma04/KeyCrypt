import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";

// Account activity log (Settings → Recent activity).
//
// Every security-relevant event goes through logAudit(). It records the client
// IP (trusted proxy headers, src/lib/client-ip.ts) and the browser's
// user-agent, never secret content.
//
// Retention: entries older than AUDIT_RETENTION_DAYS are deleted by
// pruneAuditLog(), for every user at once:
//   - daily by GET /api/cron/prune-audit (Vercel Cron, vercel.json), and
//   - as a fallback for installs without a scheduler (self-hosting), at most once
//     per 24 hours per server process, from logAudit().
// Logging an event no longer deletes anything by itself.

export const AUDIT_RETENTION_DAYS = 180;
const MAX_USER_AGENT_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How often logAudit() may prune, per server process. */
export const OPPORTUNISTIC_PRUNE_INTERVAL_MS = DAY_MS;

/** Entries created before this are past retention. */
export function auditRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS);
}

/** Deletes every user's entries older than AUDIT_RETENTION_DAYS. Returns how many. */
export async function pruneAuditLog(now: Date = new Date()): Promise<number> {
  const { count } = await db.auditLog.deleteMany({
    where: { createdAt: { lt: auditRetentionCutoff(now) } },
  });
  return count;
}

let lastOpportunisticPrune = 0;

/** At most once per OPPORTUNISTIC_PRUNE_INTERVAL_MS in this process; never throws. */
async function pruneOpportunistically(now: number): Promise<void> {
  if (now - lastOpportunisticPrune < OPPORTUNISTIC_PRUNE_INTERVAL_MS) return;
  lastOpportunisticPrune = now;
  try {
    await pruneAuditLog(new Date(now));
  } catch (err) {
    lastOpportunisticPrune = 0; // try again on the next event
    console.error("[audit] pruning old entries failed", err);
  }
}

/** Test-only: let the next logAudit() prune again. */
export function resetAuditPruneStateForTests(): void {
  lastOpportunisticPrune = 0;
}

/** Request headers, or null outside a request (scripts, some tests). */
async function requestHeaders(): Promise<Headers | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

export async function logAudit(
  userId: string,
  action: string,
  metadata?: Prisma.InputJsonValue
): Promise<void> {
  const h = await requestHeaders();
  const ip = h ? getClientIp(h) : "unknown";
  const userAgent = h?.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) || null;

  await db.auditLog.create({
    data: { userId, action, ip: ip === "unknown" ? null : ip, userAgent, metadata },
  });

  await pruneOpportunistically(Date.now());
}
