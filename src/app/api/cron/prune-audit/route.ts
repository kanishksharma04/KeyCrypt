import { NextResponse } from "next/server";
import { auditRetentionCutoff, pruneAuditLog } from "@/lib/audit";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { purgeExpiredTrash } from "@/lib/trash";

// Daily job (vercel.json, 03:17 UTC): deletes every user's activity-log entries
// older than AUDIT_RETENTION_DAYS, and items in Trash for longer than
// TRASH_RETENTION_DAYS (src/lib/trash.ts). Needs `Authorization: Bearer <CRON_SECRET>`,
// which Vercel Cron sends once CRON_SECRET is set. Self-hosted installs can call
// it from their own scheduler; without one, logAudit() prunes at most daily.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const deleted = await pruneAuditLog(now);
  const purgedItems = await purgeExpiredTrash(now);
  return NextResponse.json({
    deleted,
    before: auditRetentionCutoff(now).toISOString(),
    purgedItems,
  });
}
