import { NextResponse } from "next/server";
import { auditRetentionCutoff, pruneAuditLog } from "@/lib/audit";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// Daily job (vercel.json, 03:17 UTC): deletes every user's activity-log entries
// older than AUDIT_RETENTION_DAYS. Needs `Authorization: Bearer <CRON_SECRET>`,
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
  return NextResponse.json({ deleted, before: auditRetentionCutoff(now).toISOString() });
}
