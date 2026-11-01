import { beforeEach, describe, expect, it } from "vitest";
import type { VaultItemType } from "@prisma/client";
import { db } from "@/lib/db";
import { createVaultItemAction, updateVaultItemAction } from "@/server/vault-item-actions";
import { setupVaultAction } from "@/server/vault-actions";
import { createTestUser, signInAs } from "@/test/integration/helpers";

const VALID = {
  id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", // generated in the browser in real use
  type: "LOGIN" as VaultItemType,
  name: "GitHub",
  ciphertext: "Y2lwaGVydGV4dA==",
  iv: "AAAAAAAAAAAAAAAA", // 12 bytes
};

// 200,004 base64 characters: valid base64, one block over the limit.
const OVERSIZED_CIPHERTEXT = "QUFB".repeat(50_001);

async function nothingWritten() {
  expect(await db.vaultItem.count()).toBe(0);
  expect(await db.auditLog.count()).toBe(0);
}

describe("server action input validation", () => {
  beforeEach(async () => {
    signInAs(await createTestUser());
  });

  it("accepts a valid item (control)", async () => {
    const result = await createVaultItemAction(VALID);
    expect(result).toHaveProperty("id");
    expect(await db.vaultItem.count()).toBe(1);
  });

  it("rejects an oversized ciphertext and writes nothing", async () => {
    const result = await createVaultItemAction({ ...VALID, ciphertext: OVERSIZED_CIPHERTEXT });
    expect(result).toEqual({ error: "Invalid input" });
    await nothingWritten();
  });

  it("rejects a wrong-length IV and writes nothing", async () => {
    for (const iv of ["AAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAAA!"]) {
      expect(await createVaultItemAction({ ...VALID, iv })).toEqual({ error: "Invalid input" });
    }
    await nothingWritten();
  });

  it("rejects an unknown item type and writes nothing", async () => {
    const result = await createVaultItemAction({
      ...VALID,
      type: "CREDIT_CARD" as VaultItemType,
    });
    expect(result).toEqual({ error: "Invalid input" });
    await nothingWritten();
  });

  it("does not echo the rejected input back", async () => {
    const result = await createVaultItemAction({ ...VALID, name: "<script>x</script>".repeat(20) });
    expect(JSON.stringify(result)).toBe('{"error":"Invalid input"}');
  });

  it("rejects an oversized update and leaves the item unchanged", async () => {
    const created = await createVaultItemAction(VALID);
    if (!("id" in created)) throw new Error("setup failed");

    const result = await updateVaultItemAction({
      id: created.id,
      name: VALID.name,
      ciphertext: OVERSIZED_CIPHERTEXT,
      iv: VALID.iv,
    });
    expect(result).toEqual({ error: "Invalid input" });
    expect(await db.vaultItem.findUnique({ where: { id: created.id } })).toMatchObject({
      ciphertext: VALID.ciphertext,
    });
  });

  it("rejects a malformed vault setup and writes nothing", async () => {
    const result = await setupVaultAction({
      kdf: "argon2id",
      kdfParams: { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 },
      salt: "short", // not 16 bytes
      wrappedVaultKey: "W".repeat(64),
      wrapIv: VALID.iv,
      verificationBlob: "Y2lwaGVydGV4dA==",
      verificationIv: VALID.iv,
    });
    expect(result).toEqual({ error: "Invalid input" });
    expect(await db.vaultMeta.count()).toBe(0);
  });
});
