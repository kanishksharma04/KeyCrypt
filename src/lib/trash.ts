import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { trashPurgeCutoff } from "@/lib/trash-retention";

// Purges items that have been in Trash longer than TRASH_RETENTION_DAYS, for
// every user. Run daily by GET /api/cron/prune-audit. Each affected user gets
// one "vault.item.purge" activity entry with the count (never item content).

export async function purgeExpiredTrash(now: Date = new Date()): Promise<number> {
  const cutoff = trashPurgeCutoff(now);
  const where = { deletedAt: { lt: cutoff } };

  const perUser = await db.vaultItem.groupBy({ by: ["userId"], where, _count: true });
  if (perUser.length === 0) return 0;

  const { count } = await db.vaultItem.deleteMany({ where });
  for (const { userId, _count } of perUser) {
    await logAudit(userId, "vault.item.purge", { count: _count, expired: true });
  }
  return count;
}
