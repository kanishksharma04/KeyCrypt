import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/client-ip";

// Account activity log (Settings → Recent activity).
//
// Every security-relevant event goes through logAudit(). It records the client
// IP (trusted proxy headers, src/lib/client-ip.ts) and the browser's
// user-agent, never secret content, and keeps at most AUDIT_RETENTION_DAYS of
// history per user.

export const AUDIT_RETENTION_DAYS = 180;
const MAX_USER_AGENT_LENGTH = 512;

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
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await db.$transaction([
    db.auditLog.create({
      data: { userId, action, ip: ip === "unknown" ? null : ip, userAgent, metadata },
    }),
    // Retention: drop this user's entries older than the window.
    db.auditLog.deleteMany({ where: { userId, createdAt: { lt: cutoff } } }),
  ]);
}
