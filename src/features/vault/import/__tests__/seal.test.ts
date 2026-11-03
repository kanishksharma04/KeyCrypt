import { describe, expect, it } from "vitest";
import { deriveVaultKey, generateSalt, itemAad, decryptItem } from "@/lib/crypto";
import { openItem } from "../../item-payload";
import { IMPORT_BATCH_SIZE, sealImportBatches, type ImportedItem } from "..";

const USER_ID = "cuser000000000000000000001";

describe("sealImportBatches", () => {
  it("encrypts every item with v2 AAD, in batches of 50, and every item decrypts", async () => {
    const key = await deriveVaultKey("test-master", generateSalt(), 1_000);
    const items: ImportedItem[] = Array.from({ length: 120 }, (_, i) => ({
      type: "LOGIN",
      name: `Site ${i}`,
      favorite: i === 0,
      secret: { username: `u${i}`, password: `p${i}`, url: `https://s${i}.test`, notes: "" },
    }));
    items.push({ type: "SECURE_NOTE", name: "Note", favorite: false, secret: { content: "hi" } });

    const batches = await sealImportBatches(items, key, USER_ID);
    expect(IMPORT_BATCH_SIZE).toBe(50);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 21]);

    const sealed = batches.flat();
    expect(new Set(sealed.map((s) => s.id)).size).toBe(121);
    expect(sealed[0]?.favorite).toBe(true);
    for (const [i, s] of sealed.entries()) {
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      // Nothing readable is sent: no name, no password.
      expect(JSON.stringify(s)).not.toContain("Site ");
      const opened = await openItem(key, { ...s, name: null }, USER_ID);
      expect(opened).toEqual({ name: items[i]?.name, secret: items[i]?.secret });
    }

    // Bound to its row: another id (or user) does not decrypt.
    const first = sealed[0]!;
    await expect(
      decryptItem(key, first, itemAad({ userId: USER_ID, itemId: sealed[1]!.id, type: "LOGIN" }))
    ).rejects.toThrow();
    await expect(
      openItem(key, { ...first, name: null }, "cuser000000000000000000002")
    ).rejects.toThrow();
  });
});
