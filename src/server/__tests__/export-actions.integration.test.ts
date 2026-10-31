import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { REAUTH_REQUIRED_ERROR } from "@/lib/action-errors";
import type { ExportFormat } from "@/lib/vault-export";
import { getVaultItemsForExportAction, recordVaultExportAction } from "@/server/export-actions";
import { createTestUser, grantRecentReauth, signInAs } from "@/test/integration/helpers";

let user: { id: string; email: string };

const exportLogs = () =>
  db.auditLog.findMany({
    where: { action: "vault.export" },
    select: { userId: true, metadata: true },
  });

beforeEach(async () => {
  user = await createTestUser();
  signInAs(user);
});

describe("recordVaultExportAction", () => {
  it("refuses a plain CSV export without a recent password confirmation", async () => {
    expect(await recordVaultExportAction("csv")).toEqual({ error: REAUTH_REQUIRED_ERROR });
    expect(await exportLogs()).toEqual([]);
  });

  it("allows a CSV export after confirmation and logs the format only", async () => {
    await grantRecentReauth(user.id);
    expect(await recordVaultExportAction("csv")).toEqual({});
    expect(await exportLogs()).toEqual([{ userId: user.id, metadata: { format: "csv" } }]);
  });

  it("allows the encrypted export without re-auth and logs it", async () => {
    expect(await recordVaultExportAction("encrypted-json")).toEqual({});
    expect(await exportLogs()).toEqual([
      { userId: user.id, metadata: { format: "encrypted-json" } },
    ]);
  });

  it("rejects unknown formats", async () => {
    expect(await recordVaultExportAction("pdf" as ExportFormat)).toEqual({
      error: "Invalid input",
    });
    expect(await exportLogs()).toEqual([]);
  });
});

describe("getVaultItemsForExportAction", () => {
  it("returns only the signed-in user's items, as ciphertext", async () => {
    const other = await createTestUser();
    const common = { type: "LOGIN" as const, ciphertext: "Y2lwaGVy", iv: "AAAAAAAAAAAAAAAA" };
    await db.vaultItem.create({ data: { ...common, userId: user.id, name: "Mine" } });
    await db.vaultItem.create({ data: { ...common, userId: other.id, name: "Theirs" } });

    const rows = await getVaultItemsForExportAction();
    if ("error" in rows) throw new Error(rows.error);
    expect(rows.map((r) => r.name)).toEqual(["Mine"]);
    expect(rows[0]).toMatchObject({ ciphertext: "Y2lwaGVy", iv: "AAAAAAAAAAAAAAAA" });
  });
});
