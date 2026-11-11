// How long a trashed item stays restorable. Pure, so the Trash page can show
// "deleted forever in N days" too. Purging: src/lib/trash.ts.

export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Items trashed before this are past retention and get purged. */
export function trashPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
}

/** Whole days left before an item trashed at `deletedAt` is purged (never below 0). */
export function daysUntilPurge(deletedAt: Date, now: Date = new Date()): number {
  const purgeAt = deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((purgeAt - now.getTime()) / DAY_MS));
}
