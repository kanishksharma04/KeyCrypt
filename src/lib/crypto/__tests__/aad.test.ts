import { describe, expect, it } from "vitest";
import { decryptItem, encryptItem, generateItemId, generateVaultKey, itemAad } from "../index";

const ALICE = "cuseralice000000000000001";
const BOB = "cuserbob00000000000000001";
const ITEM = "0b6a6a0e-6f5d-4a0f-9b38-3f8f0d3a0c11";
const OTHER_ITEM = "3e2f1a9c-8d7b-4c6a-a5f4-2b1e0d9c8a77";
const SECRET = { username: "octocat", password: "s3cret" };

async function encrypted() {
  const key = await generateVaultKey();
  const aad = itemAad({ userId: ALICE, itemId: ITEM, type: "LOGIN" });
  const payload = await encryptItem(key, SECRET, aad);
  return { key, aad, payload };
}

describe("item AAD (crypto v2)", () => {
  it("uses the documented format", () => {
    expect(itemAad({ userId: ALICE, itemId: ITEM, type: "LOGIN" })).toBe(
      `kc:v2|${ALICE}|${ITEM}|LOGIN`
    );
  });

  it("decrypts in its own row", async () => {
    const { key, aad, payload } = await encrypted();
    expect(await decryptItem(key, payload, aad)).toEqual(SECRET);
  });

  it.each([
    ["another item id", { userId: ALICE, itemId: OTHER_ITEM, type: "LOGIN" }],
    ["another type", { userId: ALICE, itemId: ITEM, type: "SECURE_NOTE" }],
    ["another user", { userId: BOB, itemId: ITEM, type: "LOGIN" }],
  ])("fails after moving the ciphertext to %s", async (_label, ctx) => {
    const { key, payload } = await encrypted();
    await expect(decryptItem(key, payload, itemAad(ctx))).rejects.toThrow();
  });

  it("fails without AAD, and AAD can't be added to a ciphertext made without it", async () => {
    const { key, aad, payload } = await encrypted();
    await expect(decryptItem(key, payload)).rejects.toThrow();

    const plain = await encryptItem(key, SECRET);
    await expect(decryptItem(key, plain, aad)).rejects.toThrow();
  });

  it("refuses components that would make the encoding ambiguous", () => {
    expect(() => itemAad({ userId: "a|b", itemId: ITEM, type: "LOGIN" })).toThrow();
    expect(() => itemAad({ userId: ALICE, itemId: "", type: "LOGIN" })).toThrow();
  });

  it("generates random UUID v4 item ids", () => {
    const ids = new Set(Array.from({ length: 100 }, generateItemId));
    expect(ids.size).toBe(100);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
