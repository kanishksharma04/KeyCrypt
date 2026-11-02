import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AUDIT_RETENTION_DAYS, logAudit } from "@/lib/audit";
import { getRecentActivityAction } from "@/server/activity-actions";
import { createTestUser, setTestRequestHeaders, signInAs } from "@/test/integration/helpers";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const DAY = 24 * 60 * 60 * 1000;

let user: { id: string; email: string };

beforeEach(async () => {
  user = await createTestUser();
  signInAs(user);
});

describe("logAudit", () => {
  it("records the client IP (trusted headers) and the user agent", async () => {
    setTestRequestHeaders({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7", // spoofed first hop is ignored
      "user-agent": CHROME_MAC,
    });
    await logAudit(user.id, "auth.signin");

    expect(await db.auditLog.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({
      action: "auth.signin",
      ip: "203.0.113.7",
      userAgent: CHROME_MAC,
    });
  });

  it("stores null when the request carries no IP or user agent", async () => {
    await logAudit(user.id, "auth.signin");
    expect(await db.auditLog.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({
      ip: null,
      userAgent: null,
    });
  });

  it(`deletes this user's entries older than ${AUDIT_RETENTION_DAYS} days on write`, async () => {
    const other = await createTestUser();
    const old = new Date(Date.now() - (AUDIT_RETENTION_DAYS + 1) * DAY);
    const recent = new Date(Date.now() - 10 * DAY);
    await db.auditLog.createMany({
      data: [
        { userId: user.id, action: "auth.signin", createdAt: old },
        { userId: user.id, action: "vault.export", createdAt: recent },
        { userId: other.id, action: "auth.signin", createdAt: old },
      ],
    });

    await logAudit(user.id, "vault.item.delete");

    const mine = await db.auditLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(mine.map((e) => e.action)).toEqual(["vault.export", "vault.item.delete"]);
    // Other users' history is untouched by this user's write.
    expect(await db.auditLog.count({ where: { userId: other.id } })).toBe(1);
  });
});

describe("getRecentActivityAction", () => {
  it("returns the latest 50 entries for this user only, labelled, newest first", async () => {
    const other = await createTestUser();
    const base = Date.now() - 60 * 60 * 1000;
    await db.auditLog.createMany({
      data: [
        ...Array.from({ length: 55 }, (_, i) => ({
          userId: user.id,
          action: "vault.item.create",
          metadata: { type: "LOGIN" },
          ip: "203.0.113.7",
          userAgent: CHROME_MAC,
          createdAt: new Date(base + i * 1000),
        })),
        { userId: other.id, action: "auth.signin" },
      ],
    });

    const result = await getRecentActivityAction();
    if ("error" in result) throw new Error(result.error);
    expect(result).toHaveLength(50);
    expect(result[0]).toMatchObject({
      label: "Item created (login)",
      ip: "203.0.113.7",
      browser: "Chrome on macOS",
      createdAt: new Date(base + 54 * 1000).toISOString(),
    });
    // Newest first.
    expect(result[0]!.createdAt > result[49]!.createdAt).toBe(true);
  });
});
