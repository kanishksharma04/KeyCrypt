import { describe, expect, it } from "vitest";
import { daysUntilPurge, TRASH_RETENTION_DAYS, trashPurgeCutoff } from "../trash-retention";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T12:00:00Z");

describe("Trash retention", () => {
  it("keeps items for 30 days", () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(trashPurgeCutoff(NOW).toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("counts whole days left before an item is purged", () => {
    expect(daysUntilPurge(NOW, NOW)).toBe(30);
    expect(daysUntilPurge(new Date(NOW.getTime() - 3 * DAY), NOW)).toBe(27);
    expect(daysUntilPurge(new Date(NOW.getTime() - 29.5 * DAY), NOW)).toBe(1);
    expect(daysUntilPurge(new Date(NOW.getTime() - 31 * DAY), NOW)).toBe(0);
  });
});
