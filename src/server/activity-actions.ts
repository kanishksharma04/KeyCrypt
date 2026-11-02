"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityLabel, describeBrowser } from "@/lib/activity";

export interface ActivityEntry {
  id: string;
  label: string;
  ip: string | null;
  /** e.g. "Chrome on macOS"; null if the browser was not recorded. */
  browser: string | null;
  createdAt: string;
}

/** The signed-in user's latest 50 activity log entries, newest first. */
export async function getRecentActivityAction(): Promise<ActivityEntry[] | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const rows = await db.auditLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, ip: true, userAgent: true, metadata: true, createdAt: true },
  });

  return rows.map((r) => ({
    id: r.id,
    label: activityLabel(r.action, r.metadata),
    ip: r.ip,
    browser: describeBrowser(r.userAgent),
    createdAt: r.createdAt.toISOString(),
  }));
}
