import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit";
import { GET } from "@/app/api/cron/prune-audit/route";
import { createTestUser } from "@/test/integration/helpers";

const SECRET = "cron-secret-for-integration-tests-0123456789";
const DAY = 24 * 60 * 60 * 1000;

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/prune-audit", {
    headers: authorization === undefined ? {} : { authorization },
  });

async function seed() {
  const alice = await createTestUser({ email: "alice@test.local" });
  const bob = await createTestUser({ email: "bob@test.local" });
  const old = new Date(Date.now() - (AUDIT_RETENTION_DAYS + 1) * DAY);
  const recent = new Date(Date.now() - (AUDIT_RETENTION_DAYS - 1) * DAY);
  await db.auditLog.createMany({
    data: [
      { userId: alice.id, action: "auth.signin", createdAt: old },
      { userId: alice.id, action: "vault.export", createdAt: recent },
      { userId: bob.id, action: "auth.signin", createdAt: old },
      { userId: bob.id, action: "auth.signin", createdAt: new Date() },
      // Entries left behind by deleted accounts (userId set to null).
      { userId: null, action: "auth.signin", createdAt: old },
    ],
  });
  return { alice, bob };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/prune-audit", () => {
  it(`deletes every user's entries older than ${AUDIT_RETENTION_DAYS} days and keeps the rest`, async () => {
    const { alice, bob } = await seed();

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { deleted: number; before: string };
    expect(body.deleted).toBe(3);
    expect(new Date(body.before).getTime()).toBeLessThan(
      Date.now() - AUDIT_RETENTION_DAYS * DAY + 60_000
    );

    expect(
      (await db.auditLog.findMany({ where: { userId: alice.id } })).map((e) => e.action)
    ).toEqual(["vault.export"]);
    expect(await db.auditLog.count({ where: { userId: bob.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { userId: null } })).toBe(0);

    // Running it again finds nothing more to delete.
    const again = (await (await GET(request(`Bearer ${SECRET}`))).json()) as { deleted: number };
    expect(again.deleted).toBe(0);
  });

  it.each([
    ["no Authorization header", undefined],
    ["an empty header", ""],
    ["a wrong secret", "Bearer not-the-cron-secret-0123456789"],
    ["the secret without the Bearer scheme", SECRET],
  ])("rejects %s with 401 and deletes nothing", async (_label, authorization) => {
    await seed();
    const response = await GET(request(authorization));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(await db.auditLog.count()).toBe(5);
  });

  it("rejects every request when CRON_SECRET isn't set", async () => {
    await seed();
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request("Bearer "));
    expect(response.status).toBe(401);
    expect(await db.auditLog.count()).toBe(5);
  });
});
