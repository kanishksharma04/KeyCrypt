import { describe, it, expect, beforeEach } from "vitest";
import { setVaultKey, getVaultKey, clearVaultKey, isVaultUnlocked } from "../vault-key";
import { deriveVaultKey, SALT_LENGTH } from "../key-derivation";

const TEST_ITERATIONS = 1;
const SALT = new Uint8Array(SALT_LENGTH).fill(55);

async function makeKey(): Promise<CryptoKey> {
  return deriveVaultKey("test-password!1A", SALT, TEST_ITERATIONS);
}

// Ensure a clean state before each test (module-level variable)
beforeEach(() => {
  clearVaultKey();
});

describe("vault-key store", () => {
  it("starts locked (null)", () => {
    expect(getVaultKey()).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("stores and retrieves a CryptoKey", async () => {
    const key = await makeKey();
    setVaultKey(key);
    expect(getVaultKey()).toBe(key); // same reference
    expect(isVaultUnlocked()).toBe(true);
  });

  it("clearVaultKey removes the key", async () => {
    setVaultKey(await makeKey());
    clearVaultKey();
    expect(getVaultKey()).toBeNull();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("overwriting with a new key replaces the old one", async () => {
    const key1 = await makeKey();
    const key2 = await deriveVaultKey("other-password!1A", SALT, TEST_ITERATIONS);
    setVaultKey(key1);
    setVaultKey(key2);
    expect(getVaultKey()).toBe(key2);
  });

  it("double clear is a no-op", () => {
    clearVaultKey();
    clearVaultKey();
    expect(getVaultKey()).toBeNull();
  });
});
