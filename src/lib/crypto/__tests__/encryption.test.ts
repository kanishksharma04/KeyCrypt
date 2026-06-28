import { describe, it, expect, beforeAll } from "vitest";
import { deriveVaultKey, SALT_LENGTH, IV_LENGTH } from "../key-derivation";
import { encryptItem, decryptItem } from "../encryption";
import { fromBase64 } from "../utils";
import type { EncryptedPayload } from "../types";

const TEST_ITERATIONS = 1;
const SALT = new Uint8Array(SALT_LENGTH).fill(7);

let vaultKey: CryptoKey;
let wrongKey: CryptoKey;

beforeAll(async () => {
  vaultKey = await deriveVaultKey("correct-master-pass!1A", SALT, TEST_ITERATIONS);
  wrongKey = await deriveVaultKey("wrong-master-pass!1A", SALT, TEST_ITERATIONS);
});

describe("encryptItem", () => {
  it("returns an object with ciphertext and iv strings", async () => {
    const payload = await encryptItem(vaultKey, { test: true });
    expect(typeof payload.ciphertext).toBe("string");
    expect(typeof payload.iv).toBe("string");
  });

  it("iv is exactly 12 bytes when decoded", async () => {
    const { iv } = await encryptItem(vaultKey, "test");
    expect(fromBase64(iv)).toHaveLength(IV_LENGTH);
  });

  it("generates a unique IV on each call", async () => {
    const p1 = await encryptItem(vaultKey, "same-data");
    const p2 = await encryptItem(vaultKey, "same-data");
    expect(p1.iv).not.toBe(p2.iv);
    // Ciphertext is also different because IV is different
    expect(p1.ciphertext).not.toBe(p2.ciphertext);
  });

  it("ciphertext is longer than the plaintext (accounts for auth tag)", async () => {
    const data = "hello";
    const { ciphertext } = await encryptItem(vaultKey, data);
    // 5 bytes plaintext + 16-byte GCM tag = 21 bytes minimum
    expect(fromBase64(ciphertext).length).toBeGreaterThan(data.length);
  });
});

describe("decryptItem", () => {
  it("round-trips a plain string", async () => {
    const original = "top secret value";
    const payload = await encryptItem(vaultKey, original);
    expect(await decryptItem<string>(vaultKey, payload)).toBe(original);
  });

  it("round-trips a complex object", async () => {
    const data = {
      username: "alice@example.com",
      password: "P@ssw0rd!1234",
      url: "https://example.com",
      notes: "Created 2026-01-01",
    };
    const payload = await encryptItem(vaultKey, data);
    expect(await decryptItem(vaultKey, payload)).toEqual(data);
  });

  it("round-trips null and undefined-free objects", async () => {
    const data = { nested: { deep: [1, 2, 3] }, flag: false };
    const payload = await encryptItem(vaultKey, data);
    expect(await decryptItem(vaultKey, payload)).toEqual(data);
  });

  it("throws when the wrong key is used", async () => {
    const payload = await encryptItem(vaultKey, "secret");
    await expect(decryptItem(wrongKey, payload)).rejects.toThrow();
  });

  it("throws when the ciphertext is tampered", async () => {
    const payload = await encryptItem(vaultKey, "secret");
    // Flip a bit in the ciphertext
    const bytes = fromBase64(payload.ciphertext);
    bytes[0] = bytes[0]! ^ 0x01;
    const tampered: EncryptedPayload = {
      ciphertext: btoa(String.fromCharCode(...bytes)),
      iv: payload.iv,
    };
    await expect(decryptItem(vaultKey, tampered)).rejects.toThrow();
  });

  it("throws when the IV is changed", async () => {
    const payload = await encryptItem(vaultKey, "secret");
    const wrongIv = new Uint8Array(IV_LENGTH).fill(0xff);
    const tampered: EncryptedPayload = {
      ciphertext: payload.ciphertext,
      iv: btoa(String.fromCharCode(...wrongIv)),
    };
    await expect(decryptItem(vaultKey, tampered)).rejects.toThrow();
  });
});
